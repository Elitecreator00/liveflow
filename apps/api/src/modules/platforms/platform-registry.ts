import { Platform } from '@prisma/client';

export interface PlatformRtmpConfig {
  /** RTMP base URL (without trailing slash or stream key). */
  ingestBaseUrl: string;
  /**
   * When true, the final push URL must use rtmps:// (TLS).
   * ffmpeg flag: -f flv rtmps://<host>/...
   */
  requiresRtmps: boolean;
}

/**
 * PLATFORM_REGISTRY — authoritative RTMP ingest endpoints.
 *
 * Sources:
 *  - Stripchat: validated in PoC spike 2026-05-23 → rtmp://live.doppiocdn.com/ext
 *  - MyFreeCams: validated in PoC spike 2026-05-23 → rtmp://publish.myfreecams.com/NxServer
 *  - Chaturbate: per-account base URL stored in ConnectedAccount;
 *    this default is the standard ingest (token appended as stream key).
 *  - Twitch / YouTube: well-known public endpoints.
 *  - CUSTOM: configurable per-account via ConnectedAccount.
 *
 * The final push URL is:   `${ingestBaseUrl}/${streamKey}`
 * where streamKey is the decrypted platform key from ConnectedAccount.
 */
export const PLATFORM_REGISTRY: Record<Platform, PlatformRtmpConfig> = {
  [Platform.STRIPCHAT]: {
    ingestBaseUrl: 'rtmp://live.doppiocdn.com/ext',
    requiresRtmps: false,
  },
  [Platform.MYFREECAMS]: {
    ingestBaseUrl: 'rtmp://publish.myfreecams.com/NxServer',
    requiresRtmps: false,
  },
  [Platform.CHATURBATE]: {
    // Chaturbate uses a per-account ingest URL embedded in the stream key
    // (format: <server>/live-origin/<token>). The default base is used when
    // the ConnectedAccount does not override it via a custom ingestBaseUrl field.
    ingestBaseUrl: 'rtmp://live.chaturbate.com/live',
    requiresRtmps: false,
  },
  [Platform.TWITCH]: {
    ingestBaseUrl: 'rtmp://live.twitch.tv/app',
    requiresRtmps: false,
  },
  [Platform.YOUTUBE]: {
    ingestBaseUrl: 'rtmp://a.rtmp.youtube.com/live2',
    requiresRtmps: false,
  },
  [Platform.CUSTOM]: {
    // For CUSTOM, the ingestBaseUrl is provided by the ConnectedAccount credentials
    // and overrides this placeholder at runtime (see PlatformsService.resolveRtmpConfig).
    ingestBaseUrl: 'rtmp://custom.placeholder/live',
    requiresRtmps: false,
  },
};

/**
 * Build the full push destination URL for ffmpeg.
 * rtmps:// is used when requiresRtmps is true (e.g. future platforms).
 */
export function buildPushUrl(config: PlatformRtmpConfig, streamKey: string): string {
  const protocol = config.requiresRtmps
    ? config.ingestBaseUrl.replace(/^rtmp:\/\//, 'rtmps://')
    : config.ingestBaseUrl;
  return `${protocol}/${streamKey}`;
}
