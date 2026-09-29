"use client";

/**
 * StreamHealth — indicatore di stato del flusso che l'operatore riceve da una
 * room LiveKit. Sostituisce la diagnosi da terminale (tools/livekit/check-live.mjs):
 * legge dalla STESSA Room già connessa per la preview, senza aprire connessioni.
 *
 * Cosa mostra, senza comandi:
 *  - stato connessione (connesso / connessione / RICONNESSIONE / persa)
 *  - n. riconnessioni: >0 = sintomo instabilità media (vecchio drop ~15s)
 *  - risoluzione video reale + uptime da quando il video scorre
 *  - "in attesa video" se connesso ma la creator non pubblica ancora
 *  - "video in pausa" se la creator ha mutato la traccia video
 */

import React, { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, ConnectionState } from "livekit-client";
import { Badge, type BadgeVariant } from "@liveflow/design-system";

type Phase =
  | "connecting"
  | "reconnecting"
  | "waiting-video" // connesso, nessuna traccia video
  | "video-paused" // traccia video presente ma mutata dalla creator
  | "live"
  | "lost"; // disconnesso dopo essere stato connesso

interface HealthState {
  phase: Phase;
  reconnects: number;
  width: number;
  height: number;
  liveSinceMs: number | null;
}

const INITIAL: HealthState = {
  phase: "connecting",
  reconnects: 0,
  width: 0,
  height: 0,
  liveSinceMs: null,
};

export function StreamHealth({
  room,
  videoRef,
}: {
  room: Room | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}): React.ReactElement {
  const [h, setH] = useState<HealthState>(INITIAL);
  const [nowTick, setNowTick] = useState(0); // forza il refresh dell'uptime

  // Tracking interno (i ref evitano closure stale nei listener LiveKit).
  const hasVideoRef = useRef(false);
  const videoMutedRef = useRef(false);
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    if (!room) {
      setH(INITIAL);
      hasVideoRef.current = false;
      videoMutedRef.current = false;
      wasConnectedRef.current = false;
      return;
    }

    const recompute = (patch?: Partial<HealthState>) => {
      setH((prev) => {
        const next = { ...prev, ...patch };
        const cs = room.state;
        if (cs === ConnectionState.Reconnecting || cs === ConnectionState.SignalReconnecting) {
          next.phase = "reconnecting";
        } else if (cs === ConnectionState.Connecting) {
          next.phase = "connecting";
        } else if (cs === ConnectionState.Disconnected) {
          next.phase = wasConnectedRef.current ? "lost" : "connecting";
        } else {
          // Connected
          if (!hasVideoRef.current) next.phase = "waiting-video";
          else if (videoMutedRef.current) next.phase = "video-paused";
          else next.phase = "live";
        }
        // uptime: parte quando il video diventa effettivamente "live"
        if (next.phase === "live" && next.liveSinceMs == null) next.liveSinceMs = Date.now();
        if (next.phase !== "live") next.liveSinceMs = null;
        return next;
      });
    };

    const onConnState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) wasConnectedRef.current = true;
      if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
        setH((p) => ({ ...p, reconnects: p.reconnects + 1 }));
      }
      recompute();
    };

    const readVideoSize = () => {
      const el = videoRef.current;
      if (el && el.videoWidth) recompute({ width: el.videoWidth, height: el.videoHeight });
      else recompute();
    };

    const onTrackSubscribed = (track: { kind: Track.Kind }) => {
      if (track.kind === Track.Kind.Video) {
        hasVideoRef.current = true;
        videoMutedRef.current = false;
        // la risoluzione reale arriva con i metadati del <video>: aggancia 'resize'.
        const el = videoRef.current;
        if (el) {
          el.addEventListener("resize", readVideoSize);
          el.addEventListener("loadedmetadata", readVideoSize);
        }
        readVideoSize();
      }
    };
    const onTrackUnsubscribed = (track: { kind: Track.Kind }) => {
      if (track.kind === Track.Kind.Video) {
        hasVideoRef.current = false;
        recompute({ width: 0, height: 0 });
      }
    };
    const onTrackMuted = (pub: { kind: Track.Kind }) => {
      if (pub.kind === Track.Kind.Video) { videoMutedRef.current = true; recompute(); }
    };
    const onTrackUnmuted = (pub: { kind: Track.Kind }) => {
      if (pub.kind === Track.Kind.Video) { videoMutedRef.current = false; recompute(); }
    };

    room.on(RoomEvent.ConnectionStateChanged, onConnState);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.TrackMuted, onTrackMuted);
    room.on(RoomEvent.TrackUnmuted, onTrackUnmuted);

    // Stato iniziale: la room potrebbe avere già una traccia video pubblicata.
    if (room.state === ConnectionState.Connected) wasConnectedRef.current = true;
    room.remoteParticipants.forEach((p) =>
      p.trackPublications.forEach((pub) => {
        if (pub.kind === Track.Kind.Video && pub.track) {
          hasVideoRef.current = true;
          videoMutedRef.current = pub.isMuted;
        }
      }),
    );
    readVideoSize();

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onConnState);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.TrackMuted, onTrackMuted);
      room.off(RoomEvent.TrackUnmuted, onTrackUnmuted);
      const el = videoRef.current;
      if (el) {
        el.removeEventListener("resize", readVideoSize);
        el.removeEventListener("loadedmetadata", readVideoSize);
      }
    };
  }, [room, videoRef]);

  // Ticker 1s per aggiornare l'uptime mentre è live.
  useEffect(() => {
    if (h.phase !== "live") return;
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [h.phase]);

  const uptime = h.liveSinceMs ? fmtDuration(Date.now() - h.liveSinceMs) : null;
  void nowTick; // dipendenza implicita: forza il render ogni secondo

  const ui = PHASE_UI[h.phase];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={ui.variant} size="sm" dot className={ui.pulse ? "animate-pulse" : undefined}>
        {ui.label}
      </Badge>
      {h.phase === "live" && (
        <span className="text-2xs text-text-muted tabular-nums">
          {h.width > 0 ? `${h.width}×${h.height}` : "—"} · {uptime}
        </span>
      )}
      {h.reconnects > 0 && (
        <span
          className="text-2xs font-medium text-warn"
          title="Riconnessioni rilevate: possibile instabilità del media (es. WebRTC su rete non-loopback)."
        >
          ⚠ {h.reconnects} riconness.
        </span>
      )}
    </div>
  );
}

const PHASE_UI: Record<Phase, { label: string; variant: BadgeVariant; pulse?: boolean }> = {
  connecting: { label: "Connessione…", variant: "default", pulse: true },
  reconnecting: { label: "Riconnessione…", variant: "warn", pulse: true },
  "waiting-video": { label: "In attesa del video", variant: "warn", pulse: true },
  "video-paused": { label: "Video in pausa", variant: "warn" },
  live: { label: "Live", variant: "success" },
  lost: { label: "Connessione persa", variant: "danger" },
};

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  return `${m}m ${String(sec).padStart(2, "0")}s`;
}
