import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrowserRoom, BrowserRoomStatus, Prisma, StreamStatus } from '@prisma/client';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  BrowserRoomView,
  CreateRoomDto,
  StartRoomDto,
  UpdateRoomDto,
} from './dto/browser-room.dto';
import { FingerprintService, GEO_POOL, RoomFingerprint } from './fingerprint.service';
import {
  OrchestratorService,
  OrchestratorStartError,
  type IdentityReport,
  type RoomRuntimeStatus,
} from './orchestrator.service';
import { SceneStateService } from '../studio/scene-state.service';

/** Ultima spiaggia: nessun codice noto dal data-plane. */
const START_FAILED_FALLBACK =
  'Avvio della stanza non riuscito. Riprova tra poco; se persiste serve un ' +
  "intervento dell'amministratore.";

/**
 * BrowserFarmService — control-plane delle stanze multi-browser (ADR-0011).
 *
 * Una stanza è un'identità browser persistente e totalmente isolata:
 * fingerprint unico generato alla creazione, proxy unico (modificabile dai
 * settings), profilo browser persistente sul VPS. La stanza si avvia da una
 * sorgente Studio LIVE (iniettata come webcam virtuale) o senza sorgente
 * (placeholder, per login/setup account). Qui NON gira media: solo
 * orchestrazione, binding e guardrail; il data-plane è in-house (no Neko).
 */
@Injectable()
export class BrowserFarmService {
  private readonly logger = new Logger(BrowserFarmService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    private readonly fingerprints: FingerprintService,
    private readonly orchestrator: OrchestratorService,
    private readonly sceneState: SceneStateService,
  ) {}

  // ── CRUD stanze ────────────────────────────────────────────────────────────

  async createRoom(
    actor: AuthenticatedUser,
    dto: CreateRoomDto,
  ): Promise<BrowserRoomView> {
    const name = dto.name?.trim() || (await this.nextDefaultName(actor.agencyId));
    const proxy = dto.proxy?.trim() || '';
    const homeUrl = normalizeHomeUrl(dto.homeUrl);

    const room = await this.prisma.browserRoom.create({
      data: {
        name,
        fingerprint: this.fingerprints.generate(dto.country) as unknown as Prisma.InputJsonValue,
        encryptedProxy: proxy ? this.crypto.encrypt(proxy) : null,
        homeUrl,
        agencyId: actor.agencyId,
      },
    });

    this.logger.log(`Browser room ${room.id} ("${name}") created`);
    return this.toView(room);
  }

  async listRooms(actor: AuthenticatedUser): Promise<BrowserRoomView[]> {
    const rooms = await this.prisma.browserRoom.findMany({
      where: { agencyId: actor.agencyId },
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map((r) => this.toView(r));
  }

  async updateRoom(
    actor: AuthenticatedUser,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<BrowserRoomView> {
    const existing = await this.findRoomOrThrow(actor, roomId);

    const data: Prisma.BrowserRoomUpdateInput = {};
    if (dto.name !== undefined && dto.name.trim()) data.name = dto.name.trim();
    if (dto.proxy !== undefined) {
      // '' = rimuovi il proxy; il nuovo valore vale dal prossimo avvio.
      const proxy = dto.proxy.trim();
      data.encryptedProxy = proxy ? this.crypto.encrypt(proxy) : null;
    }
    if (dto.homeUrl !== undefined) {
      // '' = torna alla home predefinita della farm; vale dal prossimo avvio.
      data.homeUrl = normalizeHomeUrl(dto.homeUrl);
    }
    if (dto.country) {
      // Ri-geolocalizza il fingerprint mantenendo il resto (UA/viewport/cores).
      data.fingerprint = this.fingerprints.applyCountry(
        existing.fingerprint as unknown as RoomFingerprint,
        dto.country,
      ) as unknown as Prisma.InputJsonValue;
    }

    const room = await this.prisma.browserRoom.update({
      where: { id: roomId },
      data,
    });
    return this.toView(room);
  }

  async deleteRoom(actor: AuthenticatedUser, roomId: string): Promise<{ id: string }> {
    const room = await this.findRoomOrThrow(actor, roomId);

    // Spegne e distrugge anche il profilo persistente sul data-plane: la
    // cancellazione di una stanza elimina per sempre la sua identità.
    if (this.orchestrator.enabled) {
      if (room.status === BrowserRoomStatus.RUNNING) {
        await this.orchestrator.stopRoom(roomId);
      }
      await this.orchestrator.destroyRoom(roomId);
    }

    await this.prisma.browserRoom.delete({ where: { id: roomId } });
    this.logger.log(`Browser room ${roomId} deleted`);
    return { id: roomId };
  }

  // ── Avvio / stop ───────────────────────────────────────────────────────────

  /**
   * Avvia la stanza. Con sorgente: la StreamSession deve essere LIVE e della
   * stessa agenzia (C1) — il viewer token LiveKit è subscribe-only ed è emesso
   * qui, mai dall'operatore. Senza sorgente: webcam con placeholder.
   */
  async startRoom(
    actor: AuthenticatedUser,
    roomId: string,
    dto: StartRoomDto,
  ): Promise<BrowserRoomView> {
    const room = await this.findRoomOrThrow(actor, roomId);
    if (room.status === BrowserRoomStatus.RUNNING) {
      throw new ConflictException('Room is already running');
    }

    let wsUrl: string | undefined;
    let viewerToken: string | undefined;
    // La stanza deve nascere già con lo specchio scelto dalla creator,
    // altrimenti il primo frame arriverebbe girato al contrario.
    let sourceMirrored = false;
    let sourceScene: unknown = undefined;
    const sourceSessionId = dto.sourceSessionId?.trim() || null;
    if (sourceSessionId) {
      const source = await this.prisma.streamSession.findFirst({
        where: {
          id: sourceSessionId,
          agencyId: actor.agencyId,
          status: StreamStatus.LIVE,
        },
        select: { id: true, mirrored: true },
      });
      if (!source) throw new NotFoundException('Source session not found or not LIVE');
      sourceMirrored = source.mirrored;
      // La stanza nasce già con le scritte e i filtri correnti dello Studio.
      sourceScene = await this.sceneState.get(sourceSessionId);
      wsUrl = this.livekitWsPublicUrl();
      viewerToken = await this.issueViewerToken(source.id, `room-${roomId}`);
    }

    await this.prisma.browserRoom.update({
      where: { id: roomId },
      data: {
        status: BrowserRoomStatus.PROVISIONING,
        sourceSessionId,
        lastError: null,
      },
    });

    // Senza orchestratore configurato resta solo control-plane (PROVISIONING).
    if (!this.orchestrator.enabled) {
      return this.toView(await this.getRoom(roomId));
    }

    try {
      const proxy = room.encryptedProxy ? this.crypto.decrypt(room.encryptedProxy) : '';
      const result = await this.orchestrator.startRoom({
        roomId,
        name: room.name,
        fingerprint: room.fingerprint as unknown as RoomFingerprint,
        proxy,
        homeUrl: room.homeUrl ?? undefined,
        wsUrl,
        viewerToken,
        mirror: sourceMirrored,
        scene: sourceScene,
      });
      const updated = await this.prisma.browserRoom.update({
        where: { id: roomId },
        data: {
          status: BrowserRoomStatus.RUNNING,
          containerId: result.containerId,
          startedAt: new Date(),
          stoppedAt: null,
        },
      });
      this.logger.log(
        `Browser room ${roomId} running (source ${sourceSessionId ?? 'none'})`,
      );
      return this.toView(updated);
    } catch (e) {
      // In `lastError` va SOLO la frase che l'operatore deve leggere: il dump
      // tecnico (stderr di ffmpeg, log Docker) resta nei log del server.
      const known = e instanceof OrchestratorStartError;
      const message = known ? e.message : START_FAILED_FALLBACK;
      await this.prisma.browserRoom.update({
        where: { id: roomId },
        data: { status: BrowserRoomStatus.ERROR, lastError: message },
      });
      this.logger.error(
        `Room ${roomId} start failed [${known ? e.code : 'UNEXPECTED'}]: ` +
          `${known ? e.detail || e.message : String(e)}`,
      );
      throw new ServiceUnavailableException(message);
    }
  }

  /**
   * Propaga lo specchio a tutte le stanze alimentate da quella sorgente.
   * Chiamato quando la creator tocca il pulsante: il ribaltamento avviene nel
   * data-plane, dove costa un filtro FFmpeg invece di una ricodifica sul suo
   * telefono.
   */
  async applySourceMirror(sessionId: string, mirrored: boolean): Promise<void> {
    if (!this.orchestrator.enabled) return;
    const rooms = await this.prisma.browserRoom.findMany({
      where: { sourceSessionId: sessionId, status: BrowserRoomStatus.RUNNING },
      select: { id: true },
    });
    await Promise.all(
      rooms.map((r) => this.orchestrator.setRoomMirror(r.id, mirrored)),
    );
  }

  /**
   * Propaga la scena (scritte, filtri) alle stanze alimentate da quella
   * sorgente. È ciò che rende visibile nello stream quello che l'operatore
   * compone nello Studio.
   */
  async applySourceScene(sessionId: string, scene: unknown): Promise<void> {
    if (!this.orchestrator.enabled) return;
    const rooms = await this.prisma.browserRoom.findMany({
      where: { sourceSessionId: sessionId, status: BrowserRoomStatus.RUNNING },
      select: { id: true },
    });
    await Promise.all(rooms.map((r) => this.orchestrator.setRoomScene(r.id, scene)));
  }

  /**
   * Fotogramma di ciò che la stanza sta davvero inviando al sito. È l'unico
   * modo onesto di verificare scritte e specchio: i siti mostrano la propria
   * anteprima ribaltata, quindi da lì non si capisce cosa vede il pubblico.
   */
  async getSourceFrame(actor: AuthenticatedUser, roomId: string): Promise<Buffer> {
    const room = await this.findRoomOrThrow(actor, roomId);
    if (room.status !== BrowserRoomStatus.RUNNING) {
      throw new ServiceUnavailableException('La stanza non è attiva.');
    }
    const frame = await this.orchestrator.getSourceFrame(roomId);
    if (!frame) {
      throw new ServiceUnavailableException(
        'Sorgente non leggibile in questo momento. Riprova fra qualche secondo.',
      );
    }
    return frame;
  }

  /**
   * Stato vivo delle stanze dell'agenzia: serve alla Console per avvisare
   * l'operatore quando una stanza si ferma su una verifica anti-bot, che deve
   * completare lui dal viewer.
   */
  async runtimeStatus(
    actor: AuthenticatedUser,
  ): Promise<Record<string, RoomRuntimeStatus>> {
    if (!this.orchestrator.enabled) return {};
    const [status, rooms] = await Promise.all([
      this.orchestrator.runtimeStatus(),
      this.prisma.browserRoom.findMany({
        where: { agencyId: actor.agencyId },
        select: { id: true, status: true },
      }),
    ]);
    // Data-plane non raggiungibile: si lascia tutto com'è invece di dedurre
    // che le stanze siano spente.
    if (!status) return {};

    // Riallineamento: una stanza che il data-plane non conosce più NON è
    // attiva, per quanto il database dica il contrario. Succede a ogni riavvio
    // dell'orchestratore, e finora la Console mostrava stanze "attive" che non
    // esistevano — con tanto di proxy e paese, quindi tutto sembrava a posto.
    const ghosts = rooms
      .filter((r) => r.status === BrowserRoomStatus.RUNNING && !status[r.id])
      .map((r) => r.id);
    if (ghosts.length) {
      await this.prisma.browserRoom.updateMany({
        where: { id: { in: ghosts } },
        data: {
          status: BrowserRoomStatus.IDLE,
          containerId: null,
          sourceSessionId: null,
          stoppedAt: new Date(),
          lastError:
            'La stanza non è più attiva sul server (probabile riavvio del ' +
            'servizio): riavviala per riprendere.',
        },
      });
      this.logger.warn(`Riallineate ${ghosts.length} stanze non più attive`);
    }

    // Solo le stanze dell'agenzia di chi chiede.
    const own = new Set(rooms.map((r) => r.id));
    return Object.fromEntries(
      Object.entries(status).filter(([roomId]) => own.has(roomId)),
    );
  }

  /**
   * Diagnosi di coerenza dell'identità della stanza. Le incoerenze fra uscita
   * di rete e browser sono la causa più comune delle verifiche anti-bot.
   */
  async identityCheck(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<IdentityReport> {
    const room = await this.findRoomOrThrow(actor, roomId);
    if (room.status !== BrowserRoomStatus.RUNNING) {
      throw new ServiceUnavailableException('La stanza non è attiva.');
    }
    try {
      return await this.orchestrator.identityCheck(roomId);
    } catch (e) {
      throw new ServiceUnavailableException(
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  async stopRoom(actor: AuthenticatedUser, roomId: string): Promise<BrowserRoomView> {
    const room = await this.findRoomOrThrow(actor, roomId);

    // Best-effort sul data-plane: lo stop control-plane non deve mai fallire.
    if (this.orchestrator.enabled && room.status !== BrowserRoomStatus.IDLE) {
      await this.orchestrator.stopRoom(roomId);
    }

    const updated = await this.prisma.browserRoom.update({
      where: { id: roomId },
      data: {
        status: BrowserRoomStatus.IDLE,
        sourceSessionId: null,
        containerId: null,
        stoppedAt: new Date(),
      },
    });
    this.logger.log(`Browser room ${roomId} stopped`);
    return this.toView(updated);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Primo "Stanza N" libero (N = max esistente + 1). */
  private async nextDefaultName(agencyId: string): Promise<string> {
    const rooms = await this.prisma.browserRoom.findMany({
      where: { agencyId },
      select: { name: true },
    });
    const max = rooms.reduce((acc, r) => {
      const m = /^Stanza (\d+)$/.exec(r.name.trim());
      return m ? Math.max(acc, Number(m[1])) : acc;
    }, 0);
    return `Stanza ${max + 1}`;
  }

  private async getRoom(roomId: string): Promise<BrowserRoom> {
    const room = await this.prisma.browserRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Browser room not found');
    return room;
  }

  private async findRoomOrThrow(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<BrowserRoom> {
    const room = await this.prisma.browserRoom.findFirst({
      where: { id: roomId, agencyId: actor.agencyId },
    });
    if (!room) throw new NotFoundException('Browser room not found');
    return room;
  }

  /** Vista operatore: mai proxy in chiaro né credenziali (solo host:port). */
  private toView(room: BrowserRoom): BrowserRoomView {
    const fp = room.fingerprint as unknown as RoomFingerprint;
    let proxyHint: string | null = null;
    if (room.encryptedProxy) {
      try {
        proxyHint = stripProxyCredentials(this.crypto.decrypt(room.encryptedProxy));
      } catch {
        proxyHint = '(proxy non leggibile)';
      }
    }
    // Codice paese derivato dalla geo del fingerprint (per UI + coerenza proxy).
    const country =
      GEO_POOL.find((g) => g.locale === fp?.locale && g.timezone === fp?.timezone)?.code ??
      GEO_POOL.find((g) => g.locale === fp?.locale)?.code ??
      null;

    return {
      id: room.id,
      name: room.name,
      status: room.status,
      sourceSessionId: room.sourceSessionId,
      proxyHint,
      fingerprint: {
        userAgent: fp?.userAgent ?? '',
        locale: fp?.locale ?? '',
        timezone: fp?.timezone ?? '',
        viewport: fp?.viewport ?? { width: 0, height: 0 },
      },
      country,
      homeUrl: room.homeUrl,
      viewUrl:
        room.status === BrowserRoomStatus.RUNNING
          ? this.orchestrator.viewerUrl(room.id)
          : null,
      lastError: room.lastError,
      startedAt: room.startedAt,
      createdAt: room.createdAt,
    };
  }

  private async issueViewerToken(roomName: string, identity: string): Promise<string> {
    const at = new AccessToken(this.livekitApiKey(), this.livekitApiSecret(), {
      identity,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: false, canSubscribe: true });
    return at.toJwt();
  }

  private livekitWsPublicUrl(): string {
    return this.config.get<string>('LIVEKIT_WS_PUBLIC_URL') ?? 'ws://localhost:7880';
  }

  private livekitApiKey(): string {
    return this.config.getOrThrow<string>('LIVEKIT_API_KEY');
  }

  private livekitApiSecret(): string {
    return this.config.getOrThrow<string>('LIVEKIT_API_SECRET');
  }
}

/**
 * Home page della stanza → URL completo, o null per la home predefinita.
 * "sito.com" diventa "https://sito.com/". Solo http/https: uno schema come
 * javascript: o file: aprirebbe nella stanza qualcosa che non è un sito.
 */
export function normalizeHomeUrl(input: string | undefined | null): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BadRequestException(`Home page non valida: "${raw}". Esempio: https://sito.com`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(
      'La home page deve essere un indirizzo web (http:// o https://).',
    );
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw new BadRequestException(`Home page non valida: "${raw}". Esempio: https://sito.com`);
  }
  return url.toString();
}

/**
 * Riduce un proxy a "host:port" per la UI — le credenziali non escono MAI.
 * Gestisce gli stessi formati del data-plane (parseProxyParts):
 * scheme://user:pass@host:port, user:pass@host:port, host:port:user:pass, host:port.
 */
function stripProxyCredentials(proxy: string): string {
  const raw = proxy.trim();
  if (raw.includes('://') || raw.includes('@')) {
    try {
      const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
      return `${url.hostname}${url.port ? `:${url.port}` : ''}`;
    } catch {
      const at = raw.lastIndexOf('@');
      return at >= 0 ? raw.slice(at + 1) : '(proxy non leggibile)';
    }
  }
  const parts = raw.split(':');
  // host:port:user:pass o host:port → mostra solo i primi due segmenti.
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : raw;
}
