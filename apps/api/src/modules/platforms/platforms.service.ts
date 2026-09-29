import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform, ConnectedAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { ConnectAccountDto } from './dto/connect-account.dto';
import { PLATFORM_REGISTRY, PlatformRtmpConfig, buildPushUrl } from './platform-registry';

export interface ResolvedRtmpTarget {
  /** Full push URL: ingestBaseUrl/streamKey (with rtmps:// if required) */
  pushUrl: string;
  /** Decrypted platform stream key */
  streamKey: string;
  rtmpConfig: PlatformRtmpConfig;
}

@Injectable()
export class PlatformsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Resolve the RTMP push target for a ConnectedAccount.
   * Decrypts the stored stream key and builds the full push URL.
   */
  resolveRtmpTarget(account: ConnectedAccount): ResolvedRtmpTarget {
    let rtmpConfig = PLATFORM_REGISTRY[account.platform];
    if (!rtmpConfig) {
      throw new NotFoundException(`No RTMP config for platform ${account.platform}`);
    }
    // CUSTOM = bring-your-own RTMP: il base URL è configurabile via env
    // (CUSTOM_RTMP_BASE_URL). Usato anche per puntare a un sink locale in dev.
    if (account.platform === Platform.CUSTOM) {
      const customBase = this.config.get<string>('CUSTOM_RTMP_BASE_URL');
      if (customBase) {
        rtmpConfig = { ...rtmpConfig, ingestBaseUrl: customBase };
      }
    }
    const streamKey = this.crypto.decrypt(account.encryptedCreds);
    const pushUrl = buildPushUrl(rtmpConfig, streamKey);
    return { pushUrl, streamKey, rtmpConfig };
  }

  /**
   * Encrypt the raw streamKey and persist a new ConnectedAccount.
   */
  async connectAccount(
    agencyId: string,
    creatorId: string,
    dto: ConnectAccountDto,
  ): Promise<ConnectedAccount> {
    const encryptedCreds = this.crypto.encrypt(dto.streamKey);
    return this.prisma.connectedAccount.create({
      data: {
        platform: dto.platform,
        encryptedCreds,
        platformUsername: dto.platformUsername,
        agencyId,
        creatorId,
      },
    });
  }

  /**
   * List connected accounts. Never exposes decrypted stream keys.
   */
  async listConnectedAccounts(
    creatorId: string,
    agencyId: string,
  ): Promise<Omit<ConnectedAccount, 'encryptedCreds'>[]> {
    const accounts = await this.prisma.connectedAccount.findMany({
      where: { creatorId, agencyId },
      orderBy: { createdAt: 'desc' },
    });
    // Strip encrypted credentials from response
    return accounts.map(({ encryptedCreds: _omitted, ...rest }) => rest);
  }

  async deleteConnectedAccount(id: string, agencyId: string): Promise<void> {
    const acct = await this.prisma.connectedAccount.findFirst({
      where: { id, agencyId },
    });
    if (!acct) throw new NotFoundException('Connected account not found');
    await this.prisma.connectedAccount.delete({ where: { id } });
  }

  // ── Legacy shim kept for backward compatibility (streaming.service) ──
  /** @deprecated Use resolveRtmpTarget(account) instead */
  getRtmpConfig(platform: Platform): { url: string; key: string } {
    const config = PLATFORM_REGISTRY[platform];
    if (!config) throw new NotFoundException(`No RTMP config for platform ${platform}`);
    return { url: config.ingestBaseUrl, key: '' };
  }
}
