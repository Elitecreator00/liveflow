import React from "react";
import { StatusDot, type StatusVariant } from "./StatusDot.js";
import { Badge } from "./Badge.js";

export type StreamQuality = "excellent" | "good" | "degraded" | "critical" | "offline";

export interface LiveTileProps extends React.HTMLAttributes<HTMLDivElement> {
  creatorName: string;
  platformName: string;
  platformIcon?: React.ReactNode;
  thumbnailUrl?: string;
  status: StatusVariant;
  quality?: StreamQuality;
  bitrate?: string;
  viewerCount?: number;
  duration?: string;
  title?: string;
  onAction?: () => void;
  actionLabel?: string;
}

const qualityConfig: Record<
  StreamQuality,
  { label: string; badgeVariant: "success" | "warn" | "danger" | "default" | "accent" }
> = {
  excellent: { label: "Excellent", badgeVariant: "success" },
  good:      { label: "Good",      badgeVariant: "accent"  },
  degraded:  { label: "Degraded",  badgeVariant: "warn"    },
  critical:  { label: "Critical",  badgeVariant: "danger"  },
  offline:   { label: "Offline",   badgeVariant: "default" },
};

/**
 * LiveTile
 * Premium stream preview card. Shows creator, platform, quality, metrics.
 * Prop API stable — all original props preserved.
 */
export function LiveTile({
  creatorName,
  platformName,
  platformIcon,
  thumbnailUrl,
  status,
  quality = "offline",
  bitrate,
  viewerCount,
  duration,
  title,
  onAction,
  actionLabel = "View",
  className,
  ...props
}: LiveTileProps): React.ReactElement {
  const qConfig = qualityConfig[quality];
  const isLive = status === "live";

  return (
    <div
      className={[
        "group relative rounded-xl overflow-hidden",
        "bg-bg-surface border transition-all duration-normal",
        "shadow-md hover:shadow-lg hover:-translate-y-0.5",
        isLive
          ? "border-red-500/20 hover:border-red-500/40 hover:shadow-glow-danger"
          : "border-border hover:border-border-strong",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {/* Thumbnail / Preview area */}
      <div className="relative aspect-video bg-bg-elevated overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`${creatorName} live preview`}
            className="w-full h-full object-cover transition-transform duration-slow group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-elevated">
            <div className="flex flex-col items-center gap-2 opacity-20">
              <span className="text-3xl" aria-hidden="true">
                {isLive ? "◉" : "○"}
              </span>
              <span className="text-xs font-mono text-text-muted tracking-widest">
                {isLive ? "LIVE" : "OFFLINE"}
              </span>
            </div>
          </div>
        )}

        {/* Top-left: status + LIVE badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <StatusDot status={status} size="sm" />
          {isLive && (
            <span className="bg-red-600/90 text-white text-2xs font-bold px-2 py-0.5 rounded-sm uppercase tracking-widest backdrop-blur-sm">
              Live
            </span>
          )}
        </div>

        {/* Top-right: quality badge */}
        {quality !== "offline" && (
          <div className="absolute top-2 right-2">
            <Badge variant={qConfig.badgeVariant} size="sm">
              {qConfig.label}
            </Badge>
          </div>
        )}

        {/* Bottom overlay: duration + viewers */}
        {isLive && (duration !== undefined || viewerCount !== undefined) && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-dark px-3 py-2 flex items-end justify-between">
            {viewerCount !== undefined && (
              <span className="text-2xs font-semibold text-white/90">
                {viewerCount.toLocaleString()} viewers
              </span>
            )}
            {duration && (
              <span className="text-2xs font-mono text-white/60">
                {duration}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate tracking-tight">
              {creatorName}
            </p>
            {title && (
              <p className="text-xs text-text-secondary truncate mt-0.5">{title}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {platformIcon && (
              <span className="text-sm text-text-muted" aria-label={platformName}>
                {platformIcon}
              </span>
            )}
            <span className="text-xs text-text-muted font-medium">{platformName}</span>
          </div>
        </div>

        {/* Metrics row */}
        <div className="flex items-center justify-between gap-2">
          {bitrate && (
            <span className="text-2xs font-mono text-text-muted">
              {bitrate}
            </span>
          )}
          {onAction && (
            <button
              onClick={onAction}
              className={[
                "ml-auto text-xs font-semibold",
                "text-primary hover:text-primary-hover",
                "transition-colors duration-fast",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-focus rounded",
              ].join(" ")}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
