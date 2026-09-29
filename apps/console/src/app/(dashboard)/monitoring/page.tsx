"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  LiveTile,
  Card,
  CardHeader,
  Badge,
  Spinner,
  StatTile,
  type StreamQuality,
  type StatusVariant,
} from "@liveflow/design-system";
import {
  getStreamHealth,
  MOCK_STREAM_TILES,
  type MockStreamTile,
  connectSocket,
  disconnectSocket,
  WS_EVENTS,
  getToken,
} from "@liveflow/api-client";

type FilterStatus = "all" | "live" | "offline" | "warn";

const PLATFORM_ICONS: Record<string, string> = {
  CHATURBATE: "CB",
  STRIPCHAT: "SC",
  MYFREECAMS: "MFC",
  TWITCH: "TW",
  YOUTUBE: "YT",
  CUSTOM: "—",
};

export default function MonitoringPage(): React.ReactElement {
  const [tiles, setTiles] = useState<MockStreamTile[]>(MOCK_STREAM_TILES);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [wsConnected, setWsConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const token = getToken();
      if (token) {
        await getStreamHealth(token);
      }
    } catch {
      // API unreachable — keep mock tiles
    } finally {
      setRefreshing(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let mounted = true;

    connectSocket(token)
      .then((socket) => {
        if (!mounted) return;
        setWsConnected(socket.connected);

        socket.on("connect", () => setWsConnected(true));
        socket.on("disconnect", () => setWsConnected(false));

        socket.on(WS_EVENTS.TARGET_STATUS, (payload: { platform: string; status: string }) => {
          setTiles((prev) =>
            prev.map((t) =>
              t.platform === payload.platform
                ? { ...t, status: mapWsStatus(payload.status) }
                : t,
            ),
          );
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    void refreshHealth();
    const interval = setInterval(() => void refreshHealth(), 15_000);
    return () => clearInterval(interval);
  }, [refreshHealth]);

  const filtered =
    filter === "all" ? tiles : tiles.filter((t) => t.status === filter);

  const liveCount = tiles.filter((t) => t.status === "live").length;
  const warnCount = tiles.filter((t) => t.status === "warn").length;
  const totalViewers = tiles.reduce((s, t) => s + t.viewerCount, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 className="lf-section-title">Live Wall</h2>
          <p className="lf-section-desc">
            Real-time monitoring of all active streams. M4.3
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {wsConnected ? (
            <Badge variant="success" size="sm" dot>
              WebSocket Live
            </Badge>
          ) : (
            <Badge variant="default" size="sm">
              Polling
            </Badge>
          )}
          {refreshing ? (
            <Spinner size="xs" variant="muted" />
          ) : (
            <span>
              Updated{" "}
              {lastRefresh.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          )}
          <button
            onClick={() => void refreshHealth()}
            disabled={refreshing}
            className="px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40"
            aria-label="Refresh"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatTile
          label="Live"
          value={liveCount}
          accent="danger"
          icon={<LiveSignalIcon />}
          subValue="active streams"
        />
        <StatTile
          label="Warnings"
          value={warnCount}
          accent={warnCount > 0 ? "warn" : "primary"}
          subValue="quality issues"
        />
        <StatTile
          label="Viewers"
          value={totalViewers.toLocaleString()}
          accent="accent"
          subValue="total right now"
          trend="up"
        />
      </div>

      <div
        role="tablist"
        aria-label="Filter streams"
        className="flex items-center gap-1 bg-bg-elevated rounded-xl p-1 w-fit border border-border"
      >
        {(["all", "live", "warn", "offline"] as FilterStatus[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={[
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              filter === f
                ? "bg-bg-overlay text-text-primary shadow-sm"
                : "text-text-secondary hover:text-text-primary",
            ].join(" ")}
          >
            {f === "all"
              ? `All (${tiles.length})`
              : f === "live"
              ? `Live (${liveCount})`
              : f === "warn"
              ? `Warn (${warnCount})`
              : `Offline (${tiles.filter((t) => t.status === "offline").length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card variant="ghost" padding="lg" className="text-center">
          <p className="text-text-muted text-sm">No streams match this filter.</p>
        </Card>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          aria-label="Stream monitoring wall"
        >
          {filtered.map((tile) => (
            <LiveTile
              key={tile.id}
              creatorName={tile.creatorName}
              platformName={tile.platform}
              platformIcon={
                <span className="text-xs font-bold text-text-secondary">
                  {PLATFORM_ICONS[tile.platform]}
                </span>
              }
              status={tile.status as StatusVariant}
              quality={tile.quality as StreamQuality}
              bitrate={tile.bitrate}
              viewerCount={tile.status === "live" ? tile.viewerCount : undefined}
              duration={tile.status === "live" ? tile.duration : undefined}
              actionLabel="Details"
              onAction={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function mapWsStatus(status: string): "live" | "offline" | "warn" {
  if (status === "LIVE" || status === "live") return "live";
  if (status === "DEGRADED" || status === "warn") return "warn";
  return "offline";
}

function LiveSignalIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}
