"use client";

import React from "react";
import {
  StatTile,
  Card,
  CardHeader,
  Badge,
  StatusDot,
} from "@liveflow/design-system";
import { MOCK_STREAM_TILES } from "@liveflow/api-client";

const liveCount = MOCK_STREAM_TILES.filter((t) => t.status === "live").length;

export default function OverviewPage(): React.ReactElement {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Page header */}
      <div>
        <h2 className="lf-section-title">Overview</h2>
        <p className="lf-section-desc">Agency dashboard — real-time operations summary.</p>
      </div>

      {/* KPI grid */}
      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile
            label="Live Sessions"
            value={liveCount}
            subValue="across all platforms"
            trend="up"
            trendLabel="+2 from yesterday"
            accent="danger"
            icon={<LiveIcon />}
          />
          <StatTile
            label="Total Viewers"
            value="5,234"
            subValue="right now"
            trend="up"
            trendLabel="+18%"
            accent="accent"
            icon={<ViewerIcon />}
          />
          <StatTile
            label="Revenue Today"
            value="$1,847"
            subValue="across all creators"
            trend="up"
            trendLabel="+$342 vs avg"
            accent="success"
            icon={<RevenueIcon />}
          />
          <StatTile
            label="Uptime"
            value="99.8%"
            subValue="last 30 days"
            trend="neutral"
            trendLabel="stable"
            accent="primary"
            icon={<UptimeIcon />}
          />
        </div>
      </section>

      {/* Quick status table */}
      <section aria-label="Creator status">
        <Card variant="default" padding="none">
          <CardHeader
            title="Creator Status"
            description="Active sessions this shift"
            className="px-4 pt-4 pb-0"
            actions={
              <Badge variant="accent" dot>
                {liveCount} Live
              </Badge>
            }
          />
          <div className="divide-y divide-border">
            {MOCK_STREAM_TILES.slice(0, 5).map((tile) => (
              <div
                key={tile.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-bg-overlay transition-colors duration-fast"
              >
                <div className="flex items-center gap-3">
                  <StatusDot
                    status={
                      tile.status === "live"
                        ? "live"
                        : tile.status === "warn"
                        ? "warn"
                        : "offline"
                    }
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {tile.creatorName}
                    </p>
                    <p className="text-xs text-text-muted">{tile.platform}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {tile.status === "live" && (
                    <>
                      <span className="text-xs font-mono text-text-secondary hidden sm:block">
                        {tile.viewerCount.toLocaleString()} viewers
                      </span>
                      <span className="text-xs font-mono text-text-muted hidden md:block">
                        {tile.duration}
                      </span>
                    </>
                  )}
                  <QualityBadge quality={tile.quality} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

function QualityBadge({
  quality,
}: {
  quality: string;
}): React.ReactElement {
  const map: Record<string, { label: string; variant: "success" | "accent" | "warn" | "danger" | "default" }> = {
    excellent: { label: "Excellent", variant: "success" },
    good:      { label: "Good",      variant: "accent" },
    degraded:  { label: "Degraded",  variant: "warn" },
    critical:  { label: "Critical",  variant: "danger" },
    offline:   { label: "Offline",   variant: "default" },
  };
  const cfg = map[quality] ?? map["offline"]!;
  return <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>;
}

function LiveIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}

function ViewerIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16c0-3 2.686-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function RevenueIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2v14M5 5.5C5 4.12 6.79 3 9 3s4 1.12 4 2.5S11.21 8 9 8s-4 1.12-4 2.5S6.79 13 9 13s4-1.12 4-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UptimeIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2a7 7 0 100 14A7 7 0 009 2z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
