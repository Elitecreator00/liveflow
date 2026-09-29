import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  IngestSessionResponse,
  ActiveSessionItem,
} from './dto/ingest-session.dto';
import {
  OverlayDto,
  SceneBackgroundDto,
  SceneEffectsDto,
  SceneFiltersDto,
  SceneState,
} from './dto/scene.dto';
import { SceneStateService } from './scene-state.service';
import { EgressOrchestrator } from './egress.orchestrator';
import { BrowserFarmService } from '../browser-farm/browser-farm.service';

// TODO STEP B: quando si aggiunge LiveKit Egress, questo service dovrà:
//   1. Avviare un EgressRequest (RoomCompositeEgress) puntando alla pagina scena React
//      via livekitEgress.startRoomCompositeEgress(roomName, { url: scenePageUrl, ... })
//   2. Fermare l'Egress su stopIngestSession
//   3. Orchestrare i processi FFmpeg fan-out (ADR-0002) sull'output composito RTMP
//   Vedere ADR-0004 e discovery/STUDIO_COMPOSITING_SPIKE.md per l'architettura completa.

@Injectable()
export class StudioService {
  private readonly logger = new Logger(StudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly sceneState: SceneStateService,
    private readonly egress: EgressOrchestrator,
    private readonly browserFarm: BrowserFarmService,
  ) {}

  /**
   * Accende/spegne lo specchio della sorgente.
   *
   * Il ribaltamento NON avviene sul device della creator: lì servirebbe
   * ridisegnare ogni frame su un canvas, cosa che fa perdere la codifica
   * accelerata e su una webcam da PC manda la diretta al rallentatore. Qui si
   * registra la scelta e la si propaga a valle, dove costa un filtro FFmpeg.
   */
  async setMirror(
    user: AuthenticatedUser,
    sessionId: string,
    mirrored: boolean,
  ): Promise<{ mirrored: boolean }> {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, agencyId: user.agencyId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session not found');

    await this.prisma.streamSession.update({
      where: { id: sessionId },
      data: { mirrored },
    });
    await this.browserFarm.applySourceMirror(sessionId, mirrored);
    this.logger.log(`Session ${sessionId}: specchio ${mirrored ? 'ON' : 'OFF'}`);
    return { mirrored };
  }

  async createIngestSession(
    actor: AuthenticatedUser,
    creatorId?: string,
  ): Promise<IngestSessionResponse> {
    const resolvedCreatorId = await this.resolveCreatorId(actor, creatorId);

    // Chiudi eventuali sessioni LIVE orfane della stessa creator (es. app chiusa
    // senza Stop). Garantisce una sola sessione attiva per creator ed evita di
    // accumulare righe LIVE che resterebbero "appese".
    await this.prisma.streamSession.updateMany({
      where: { creatorId: resolvedCreatorId, status: StreamStatus.LIVE },
      data: { status: StreamStatus.ENDED, endedAt: new Date() },
    });

    const session = await this.prisma.streamSession.create({
      data: {
        // streamKey è @unique: DEVE essere unico per sessione. In passato qui veniva
        // usato il creatorId, ma collideva al secondo Go Live della stessa creator
        // (P2002 → 500). Con il flusso LiveKit l'auth di ingest passa dal creatorToken,
        // quindi questo valore serve solo a soddisfare il vincolo storico della colonna.
        streamKey: `lk_${randomUUID()}`,
        status: StreamStatus.LIVE,
        startedAt: new Date(),
        agencyId: actor.agencyId,
        creatorId: resolvedCreatorId,
      },
    });

    const roomName = session.id;
    const wsUrl = this.livekitWsPublicUrl();
    const creatorToken = await this.issueCreatorToken(roomName, resolvedCreatorId);

    this.logger.log(`Ingest session ${session.id} created, room ${roomName}`);
    return { sessionId: session.id, roomName, wsUrl, creatorToken };
  }

  async stopIngestSession(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<{ sessionId: string; status: StreamStatus }> {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, agencyId: actor.agencyId },
    });
    if (!session) throw new NotFoundException('Ingest session not found');

    // Best-effort: delete the LiveKit room so resources are freed immediately.
    // Failure here is non-fatal — the session is marked ENDED regardless.
    await this.deleteRoom(sessionId).catch((err: unknown) =>
      this.logger.warn(`deleteRoom ${sessionId} failed: ${String(err)}`),
    );

    const updated = await this.prisma.streamSession.update({
      where: { id: sessionId },
      data: { status: StreamStatus.ENDED, endedAt: new Date() },
    });

    // Ferma il render Egress (se attivo) e scarta la scena: sessione terminata.
    await this.egress.stopInternal(sessionId).catch(() => undefined);
    this.sceneState.clear(sessionId);

    this.logger.log(`Ingest session ${sessionId} stopped`);
    return { sessionId: updated.id, status: updated.status };
  }

  // ── Scene / overlay (M1.11) ───────────────────────────────────────────────

  /** Stato scena della sessione (verifica che appartenga all'agenzia dell'operatore). */
  async getScene(sessionId: string, actor: AuthenticatedUser): Promise<SceneState> {
    await this.assertSessionInAgency(sessionId, actor);
    return this.sceneState.get(sessionId);
  }

  /** Sostituisce overlay + filtri + sfondo + effetti e li trasmette ai subscriber via WS. */
  async updateScene(
    sessionId: string,
    overlays: OverlayDto[],
    filters: SceneFiltersDto | undefined,
    background: SceneBackgroundDto | undefined,
    effects: SceneEffectsDto | undefined,
    actor: AuthenticatedUser,
  ): Promise<SceneState> {
    await this.assertSessionInAgency(sessionId, actor);
    const scene = await this.sceneState.replace(
      sessionId,
      overlays,
      filters,
      background,
      effects,
    );
    // Le stanze multi-browser compongono la scena nel filtergraph dell'ingestor:
    // senza questa propagazione le modifiche resterebbero visibili solo nella
    // preview dell'operatore, mai nello stream che esce davvero.
    await this.browserFarm.applySourceScene(sessionId, scene);
    return scene;
  }

  private async assertSessionInAgency(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, agencyId: actor.agencyId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Ingest session not found');
  }

  async getActiveSessions(actor: AuthenticatedUser): Promise<ActiveSessionItem[]> {
    const sessions = await this.prisma.streamSession.findMany({
      where: { agencyId: actor.agencyId, status: StreamStatus.LIVE },
      orderBy: { startedAt: 'desc' },
      include: { creator: { select: { displayName: true } } },
    });

    const wsUrl = this.livekitWsPublicUrl();
    return Promise.all(
      sessions.map(async (s) => ({
        sessionId: s.id,
        creatorId: s.creatorId,
        creatorName: s.creator?.displayName ?? 'Creator',
        startedAt: s.startedAt ?? s.createdAt,
        roomName: s.id,
        wsUrl,
        viewerToken: await this.issueViewerToken(s.id, `operator-${actor.id}`),
      })),
    );
  }

  // ── Token helpers ───────────────────────────────────────────────────────────

  // NB: in livekit-server-sdk v2 `toJwt()` è ASINCRONO (ritorna Promise<string>).
  private async issueCreatorToken(roomName: string, identity: string): Promise<string> {
    const at = new AccessToken(this.livekitApiKey(), this.livekitApiSecret(), {
      identity,
    });
    // canSubscribe DEVE essere true: in LiveKit la PeerConnection "subscriber" è
    // quella primaria. Con canSubscribe:false non si negozia, il client la considera
    // fallita dopo peerConnectionTimeout (~15s) e va in full-reconnect a ciclo
    // (publish audio+video → ~15s → leave → rejoin). Il creator non riceve comunque
    // tracce (è solo lui nella room), ma la PC primaria così si stabilisce.
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    return at.toJwt();
  }

  private async issueViewerToken(roomName: string, identity: string): Promise<string> {
    const at = new AccessToken(this.livekitApiKey(), this.livekitApiSecret(), {
      identity,
    });
    at.addGrant({ roomJoin: true, room: roomName, canPublish: false, canSubscribe: true });
    return at.toJwt();
  }

  // ── Room management ─────────────────────────────────────────────────────────

  private async deleteRoom(roomName: string): Promise<void> {
    const svc = new RoomServiceClient(
      this.livekitUrl(),
      this.livekitApiKey(),
      this.livekitApiSecret(),
    );
    await svc.deleteRoom(roomName);
  }

  // ── Creator resolution ──────────────────────────────────────────────────────

  private async resolveCreatorId(
    actor: AuthenticatedUser,
    creatorId?: string,
  ): Promise<string> {
    if (creatorId) return creatorId;

    const linked = await this.prisma.creator.findUnique({ where: { userId: actor.id } });
    const creator =
      linked ??
      (await this.prisma.creator.findFirst({ where: { agencyId: actor.agencyId } }));

    if (!creator) throw new NotFoundException('No creator found for this agency');
    return creator.id;
  }

  // ── Config helpers ──────────────────────────────────────────────────────────

  private livekitUrl(): string {
    return this.config.get<string>('LIVEKIT_URL') ?? 'ws://localhost:7880';
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
