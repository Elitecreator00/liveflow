import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, StreamOutput, StreamProtocol } from 'livekit-server-sdk';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Orchestratore LiveKit Egress (Step B.2).
 *
 * Avvia/ferma un RoomCompositeEgress che carica la PAGINA-SCENA di render
 * (`{SCENE_RENDER_BASE_URL}/scene/<sessionId>`) — Chrome headless compone
 * video + overlay + filtri (+ in futuro AI cloud-side, ADR-0007) — e ne
 * produce un flusso RTMP verso MediaMTX (composite ingest), da cui il fan-out
 * (ADR-0002) distribuisce alle piattaforme pre-assegnate.
 *
 * Lo stato attivo è in-memory (sessionId → egressId). TODO: persistere per
 * resilienza multi-istanza (come lo scene state, ADR-0004).
 *
 * NB runtime: l'Egress è un servizio/container Linux separato (ADR-0006/0007).
 * Questo orchestratore dispatcha solo le richieste via EgressClient.
 */
@Injectable()
export class EgressOrchestrator {
  private readonly logger = new Logger(EgressOrchestrator.name);
  private readonly active = new Map<string, string>();
  private client?: EgressClient;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async startSceneRender(
    sessionId: string,
    agencyId: string,
  ): Promise<{ egressId: string; rtmpUrl: string }> {
    await this.assertSession(sessionId, agencyId);

    const existing = this.active.get(sessionId);
    const rtmpUrl = `${this.compositeRtmpBase()}/${sessionId}`;
    if (existing) return { egressId: existing, rtmpUrl };

    const sceneUrl = `${this.sceneBaseUrl()}/scene/${sessionId}`;
    const output = new StreamOutput({
      protocol: StreamProtocol.RTMP,
      urls: [rtmpUrl],
    });

    const info = await this.egress().startRoomCompositeEgress(sessionId, output, {
      // pagina custom: l'Egress vi appende ?url=<ws>&token=<token>&layout=
      customBaseUrl: sceneUrl,
      layout: 'single-speaker',
    });

    this.active.set(sessionId, info.egressId);
    this.logger.log(
      `Egress avviato per ${sessionId}: ${info.egressId} (scene=${sceneUrl} → ${rtmpUrl})`,
    );
    return { egressId: info.egressId, rtmpUrl };
  }

  async stopSceneRender(
    sessionId: string,
    agencyId: string,
  ): Promise<{ stopped: boolean }> {
    await this.assertSession(sessionId, agencyId);
    return this.stopById(sessionId);
  }

  /** Stop best-effort senza check tenant (uso interno, es. a fine sessione). */
  async stopInternal(sessionId: string): Promise<void> {
    await this.stopById(sessionId);
  }

  isRendering(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  private async stopById(sessionId: string): Promise<{ stopped: boolean }> {
    const egressId = this.active.get(sessionId);
    if (!egressId) return { stopped: false };
    await this.egress()
      .stopEgress(egressId)
      .catch((err: unknown) =>
        this.logger.warn(`stopEgress ${egressId} fallito: ${String(err)}`),
      );
    this.active.delete(sessionId);
    this.logger.log(`Egress fermato per ${sessionId} (${egressId})`);
    return { stopped: true };
  }

  private async assertSession(sessionId: string, agencyId: string): Promise<void> {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, agencyId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Ingest session not found');
  }

  // ── Config / client ─────────────────────────────────────────────────────────

  private egress(): EgressClient {
    if (!this.client) {
      this.client = new EgressClient(
        this.config.get<string>('LIVEKIT_URL') ?? 'ws://localhost:7880',
        this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
        this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
      );
    }
    return this.client;
  }

  private sceneBaseUrl(): string {
    return (
      this.config.get<string>('SCENE_RENDER_BASE_URL') ?? 'http://localhost:3000'
    );
  }

  private compositeRtmpBase(): string {
    return (
      this.config.get<string>('COMPOSITE_RTMP_BASE') ??
      'rtmp://localhost:1935/composite'
    );
  }
}
