import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FanoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IFfmpegRunner,
  FfmpegProcess,
  FFMPEG_RUNNER_TOKEN,
} from './interfaces/ffmpeg-runner.interface';

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface ManagedTarget {
  targetId: string;
  sessionId: string;
  process: FfmpegProcess | null;
  reconnectAttempts: number;
  sourceUrl: string;
  destinationUrl: string;
  stopped: boolean;
}

/**
 * FanoutManager — orchestrates one independent ffmpeg process per fanout
 * target, as required by ADR-0002 (lesson from PoC RT1).
 *
 * Each process reads the ingest stream from MediaMTX and pushes to one
 * platform RTMP endpoint. If a target fails, only that process restarts;
 * all other targets continue unaffected.
 */
@Injectable()
export class FanoutManager {
  private readonly logger = new Logger(FanoutManager.name);
  private readonly targets = new Map<string, ManagedTarget>();

  constructor(
    @Inject(FFMPEG_RUNNER_TOKEN) private readonly runner: IFfmpegRunner,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async startSession(sessionId: string): Promise<void> {
    const session = await this.prisma.streamSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: { fanoutTargets: true },
    });

    const baseRtmp = this.config.get<string>('MEDIAMTX_RTMP_URL') ?? 'rtmp://localhost:1935';
    const sourceUrl = `${baseRtmp}/live/${session.streamKey}`;

    for (const target of session.fanoutTargets) {
      // Full push URL: rtmpUrl/streamKey (rtmpUrl = ingestBaseUrl from registry)
      const destUrl = `${target.rtmpUrl}/${target.streamKey}`;
      this.startTarget(target.id, sessionId, sourceUrl, destUrl);
    }
  }

  stopSession(sessionId: string): void {
    for (const [, managed] of this.targets) {
      if (managed.sessionId !== sessionId) continue;
      managed.stopped = true;
      managed.process?.kill();
      this.targets.delete(managed.targetId);
      void this.updateTargetStatus(managed.targetId, FanoutStatus.STOPPED);
    }
  }

  stopTarget(targetId: string): void {
    const managed = this.targets.get(targetId);
    if (!managed) return;
    managed.stopped = true;
    managed.process?.kill();
    this.targets.delete(targetId);
    void this.updateTargetStatus(targetId, FanoutStatus.STOPPED);
  }

  private startTarget(
    targetId: string,
    sessionId: string,
    sourceUrl: string,
    destinationUrl: string,
  ): void {
    const managed: ManagedTarget = {
      targetId,
      sessionId,
      process: null,
      reconnectAttempts: 0,
      sourceUrl,
      destinationUrl,
      stopped: false,
    };
    this.targets.set(targetId, managed);
    this.launchProcess(managed);
  }

  private launchProcess(managed: ManagedTarget): void {
    if (managed.stopped) return;

    void this.updateTargetStatus(managed.targetId, FanoutStatus.CONNECTING);

    const proc = this.runner.launch({
      targetId: managed.targetId,
      sourceUrl: managed.sourceUrl,
      destinationUrl: managed.destinationUrl,
      onExit: (code, _signal) => {
        if (managed.stopped) return;
        this.handleProcessExit(managed, code);
      },
      onError: (err) => {
        if (managed.stopped) return;
        this.logger.error(`Target ${managed.targetId} error: ${err.message}`);
        void this.updateTargetStatus(managed.targetId, FanoutStatus.ERROR, err.message);
      },
    });

    managed.process = proc;
    void this.updateTargetStatus(managed.targetId, FanoutStatus.LIVE);
  }

  private handleProcessExit(managed: ManagedTarget, code: number | null): void {
    if (code === 0 || managed.stopped) {
      void this.updateTargetStatus(managed.targetId, FanoutStatus.STOPPED);
      return;
    }

    managed.reconnectAttempts += 1;
    if (managed.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      this.logger.error(`Target ${managed.targetId} exceeded max reconnects`);
      void this.updateTargetStatus(managed.targetId, FanoutStatus.ERROR, 'Max reconnects exceeded');
      this.targets.delete(managed.targetId);
      return;
    }

    void this.updateTargetStatus(managed.targetId, FanoutStatus.RECONNECTING);
    this.logger.log(
      `Reconnecting target ${managed.targetId} in ${RECONNECT_DELAY_MS}ms (attempt ${managed.reconnectAttempts})`,
    );

    setTimeout(() => this.launchProcess(managed), RECONNECT_DELAY_MS);
  }

  private async updateTargetStatus(
    targetId: string,
    status: FanoutStatus,
    lastError?: string,
  ): Promise<void> {
    await this.prisma.fanoutTarget.update({
      where: { id: targetId },
      data: {
        status,
        lastError: lastError ?? null,
        ...(status === FanoutStatus.LIVE ? { startedAt: new Date() } : {}),
        ...(status === FanoutStatus.STOPPED ? { stoppedAt: new Date() } : {}),
      },
    });
  }
}
