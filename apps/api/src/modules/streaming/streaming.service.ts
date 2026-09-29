import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StreamStatus, StreamSession, FanoutStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FanoutManager } from './fanout.manager';
import { GoLiveDto } from './dto/go-live.dto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PlatformsService } from '../platforms/platforms.service';

export interface GoLiveResponse {
  sessionId: string;
  /** JWT-signed stream key (ADR-0003). Use as RTMP path: live/{streamKey} */
  streamKey: string;
  ingestUrl: string;
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly fanout: FanoutManager,
    private readonly platforms: PlatformsService,
  ) {}

  async goLive(dto: GoLiveDto, actor: AuthenticatedUser): Promise<GoLiveResponse> {
    const creator = await this.prisma.creator.findFirst({
      where: { id: dto.creatorId, agencyId: actor.agencyId },
    });
    if (!creator) throw new NotFoundException('Creator not found in your agency');

    const accounts = await this.prisma.connectedAccount.findMany({
      where: {
        id: { in: dto.connectedAccountIds },
        agencyId: actor.agencyId,
        creatorId: dto.creatorId,
        isActive: true,
      },
    });

    if (accounts.length === 0) {
      throw new BadRequestException('No active connected accounts found');
    }

    // Issue short-lived JWT stream key (ADR-0003)
    const streamKeySecret = this.config.getOrThrow<string>('JWT_STREAM_KEY_SECRET');
    const streamKeyTtl = this.config.get<string>('JWT_STREAM_KEY_TTL') ?? '12h';
    const streamKey = this.jwt.sign(
      { sub: dto.creatorId, agencyId: actor.agencyId, purpose: 'stream-key' },
      { secret: streamKeySecret, expiresIn: streamKeyTtl },
    );

    // Resolve platform RTMP config for each account using the registry + decrypt
    const fanoutTargetData = accounts.map((acct) => {
      const resolved = this.platforms.resolveRtmpTarget(acct);
      return {
        platform: acct.platform,
        rtmpUrl: resolved.rtmpConfig.ingestBaseUrl,
        streamKey: resolved.streamKey,
        connectedAccountId: acct.id,
        status: FanoutStatus.PENDING,
      };
    });

    const session = await this.prisma.streamSession.create({
      data: {
        streamKey,
        status: StreamStatus.LIVE,
        startedAt: new Date(),
        agencyId: actor.agencyId,
        creatorId: dto.creatorId,
        fanoutTargets: { create: fanoutTargetData },
      },
    });

    await this.fanout.startSession(session.id);

    const mediamtxUrl = this.config.get<string>('MEDIAMTX_RTMP_URL') ?? 'rtmp://localhost:1935';
    return {
      sessionId: session.id,
      streamKey,
      ingestUrl: `${mediamtxUrl}/live/${streamKey}`,
    };
  }

  async stopLive(sessionId: string, actor: AuthenticatedUser): Promise<StreamSession> {
    const session = await this.prisma.streamSession.findFirst({
      where: { id: sessionId, agencyId: actor.agencyId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== StreamStatus.LIVE) {
      throw new BadRequestException('Session is not live');
    }

    this.fanout.stopSession(sessionId);

    return this.prisma.streamSession.update({
      where: { id: sessionId },
      data: { status: StreamStatus.ENDED, endedAt: new Date() },
    });
  }

  /**
   * Validate a JWT stream key extracted from the MediaMTX path.
   *
   * Called by the /streaming/auth endpoint (ADR-0003).
   * Path format: "live/<jwt>" — we extract the token after "live/".
   *
   * Returns true if the JWT is valid and not expired; false otherwise.
   */
  async validateStreamKey(path: string): Promise<boolean> {
    try {
      const parts = path.split('/');
      // Path is "live/<jwt>" — find the token after "live"
      const liveIdx = parts.indexOf('live');
      const token = liveIdx >= 0 ? parts[liveIdx + 1] : undefined;

      if (!token) {
        this.logger.warn(`validateStreamKey: no token in path "${path}"`);
        return false;
      }

      const secret = this.config.getOrThrow<string>('JWT_STREAM_KEY_SECRET');
      const payload = this.jwt.verify(token, { secret }) as Record<string, unknown>;

      if (payload['purpose'] !== 'stream-key') {
        this.logger.warn(`validateStreamKey: wrong purpose for token in path "${path}"`);
        return false;
      }

      return true;
    } catch (err) {
      this.logger.debug(`validateStreamKey failed: ${(err as Error).message}`);
      return false;
    }
  }
}
