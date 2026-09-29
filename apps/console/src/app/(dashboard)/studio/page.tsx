"use client";

/**
 * Live Studio — muro di anteprime delle sorgenti attive.
 *
 * Ogni riquadro mostra la sorgente **composta**: gli stessi overlay, filtri ed
 * effetti che l'operatore imposta in "Componi" e che finiscono nello stream.
 * Prima mostrava il video grezzo, quindi una scritta aggiunta in Componi non si
 * vedeva da nessuna parte finché non si apriva quella pagina.
 *
 * L'audio parte SEMPRE staccato e si accende su una sorgente per volta, come in
 * una regia: con più riquadri aperti, sentirli tutti insieme sarebbe inservibile.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
} from "livekit-client";
import {
  Card,
  CardHeader,
  Badge,
  Spinner,
  StatTile,
} from "@liveflow/design-system";
import {
  getActiveSessions,
  getSceneState,
  getToken,
  connectSocket,
  subscribeSession,
  onSceneUpdate,
  type ActiveIngestSession,
  type SceneOverlay,
  type SceneFilters,
  type SceneBackground,
  type SceneEffects,
} from "@liveflow/api-client";
import { OpenInRoomMenu } from "../../../components/OpenInRoomMenu";
import { SceneComposite } from "@/components/SceneComposite";
import { FILTER_DEFAULTS } from "@/components/sceneFilters";

interface SessionWithRoom extends ActiveIngestSession {
  room: Room | null;
  connState: "idle" | "connecting" | "connected" | "failed";
}

export default function StudioPage(): React.ReactElement {
  const [sessions, setSessions] = useState<SessionWithRoom[]>([]);
  // Una sola sorgente per volta può suonare (null = tutte mute).
  const [audioSessionId, setAudioSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const data = await getActiveSessions(token);
      setSessions((prev) => {
        const existing = new Map(prev.map((s) => [s.sessionId, s]));
        const updated: SessionWithRoom[] = data.map((s) => {
          const old = existing.get(s.sessionId);
          // Sessione già nota: PRESERVA l'oggetto esistente (wsUrl + viewerToken
          // + room + connState). Il server rigenera un viewerToken nuovo ad ogni
          // poll; se lo sovrascrivessimo, la dep [viewerToken] del preview card
          // cambierebbe e la Room verrebbe ricreata ogni 10s (preview a singhiozzo).
          if (old) return old;
          return { ...s, room: null, connState: "idle" as const };
        });
        for (const [id, old] of existing) {
          if (!data.find((s) => s.sessionId === id)) {
            old.room?.disconnect();
          }
        }
        return updated;
      });
    } catch {
      // API unreachable — keep current state
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    void fetchSessions();
    const id = setInterval(() => void fetchSessions(), 10_000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  const handleRoomUpdate = useCallback(
    (sessionId: string, room: Room, connState: SessionWithRoom["connState"]) => {
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, room, connState } : s)),
      );
    },
    [],
  );

  const handleConnState = useCallback(
    (sessionId: string, connState: SessionWithRoom["connState"]) => {
      setSessions((prev) =>
        prev.map((s) => (s.sessionId === sessionId ? { ...s, connState } : s)),
      );
    },
    [],
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 className="lf-section-title">Live Studio</h2>
          <p className="lf-section-desc">
            Operator preview wall — active LiveKit sessions.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          {loading ? (
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
            onClick={() => void fetchSessions()}
            disabled={loading}
            className="px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile
          label="Active Ingests"
          value={sessions.length}
          accent="danger"
          icon={<LiveDot />}
          subValue="LiveKit rooms"
        />
        <StatTile
          label="Previewing"
          value={sessions.filter((s) => s.connState === "connected").length}
          accent="primary"
          subValue="LiveKit connected"
        />
      </div>

      {sessions.length === 0 ? (
        <Card variant="ghost" padding="lg" className="text-center">
          <p className="text-text-muted text-sm">
            No active ingest sessions. Waiting for creators to go live.
          </p>
        </Card>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
          aria-label="Studio preview wall"
        >
          {sessions.map((s) => (
            <LiveKitPreviewCard
              key={s.sessionId}
              session={s}
              audioOn={audioSessionId === s.sessionId}
              onToggleAudio={() =>
                setAudioSessionId((cur) => (cur === s.sessionId ? null : s.sessionId))
              }
              onRoomConnected={(room) => handleRoomUpdate(s.sessionId, room, "connected")}
              onConnState={(connState) => handleConnState(s.sessionId, connState)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LiveKitPreviewCardProps {
  session: SessionWithRoom;
  /** L'audio di questa sorgente è acceso? (una sola per volta) */
  audioOn: boolean;
  onToggleAudio: () => void;
  onRoomConnected: (room: Room) => void;
  onConnState: (state: SessionWithRoom["connState"]) => void;
}

function LiveKitPreviewCard({
  session,
  audioOn,
  onToggleAudio,
  onRoomConnected,
  onConnState,
}: LiveKitPreviewCardProps): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  // Gli <audio> creati da LiveKit: restano montati e si accendono/spengono
  // con `muted`, senza toccare la sottoscrizione.
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const audioSinkRef = useRef<HTMLDivElement>(null);
  const [connState, setConnState] = useState<SessionWithRoom["connState"]>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [hasAudio, setHasAudio] = useState(false);
  // Scena della sorgente: la stessa che vede "Componi" e che va in onda.
  const [overlays, setOverlays] = useState<SceneOverlay[]>([]);
  const [filters, setFilters] = useState<SceneFilters>({ ...FILTER_DEFAULTS });
  const [background, setBackground] = useState<SceneBackground | undefined>(undefined);
  const [effects, setEffects] = useState<SceneEffects | undefined>(undefined);

  useEffect(() => {
    if (!videoRef.current) return;
    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;
      setConnState("connecting");
      onConnState("connecting");
      setPreviewError(null);

      const room = new Room();
      roomRef.current = room;

      // LiveKit fires TrackSubscribed(track, publication, participant)
      const attachTrack = (
        track: RemoteTrack,
        _publication?: RemoteTrackPublication,
        _participant?: RemoteParticipant,
      ) => {
        if (cancelled) return;
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          return;
        }
        if (track.kind === Track.Kind.Audio && audioSinkRef.current) {
          const el = track.attach();
          el.autoplay = true;
          // Nasce muto: si accende solo quando l'operatore lo chiede.
          el.muted = true;
          audioSinkRef.current.appendChild(el);
          audioElsRef.current.push(el);
          setHasAudio(true);
        }
      };

      room.on(RoomEvent.TrackSubscribed, attachTrack);
      room.on(RoomEvent.Disconnected, () => {
        if (!cancelled) {
          setConnState("failed");
          onConnState("failed");
        }
      });
      room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track) attachTrack(pub.track);
        });
      });

      try {
        await room.connect(session.wsUrl, session.viewerToken);
        if (cancelled) { room.disconnect(); return; }
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((pub) => {
            if (pub.isSubscribed && pub.track) attachTrack(pub.track);
          });
        });
        setConnState("connected");
        onConnState("connected");
        onRoomConnected(room);
      } catch (err) {
        if (!cancelled) {
          setPreviewError((err as Error).message);
          setConnState("failed");
          onConnState("failed");
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      audioElsRef.current.forEach((el) => el.remove());
      audioElsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.wsUrl, session.viewerToken]);

  // Scena della sorgente: stato iniziale via REST, poi gli aggiornamenti che
  // l'operatore fa in "Componi" arrivano via WebSocket. Senza questo, il muro
  // mostrerebbe il video grezzo mentre lo stream in onda ha già le scritte.
  useEffect(() => {
    let cancelled = false;
    let cleanupWs: (() => void) | undefined;

    const applyScene = (scene: {
      overlays?: SceneOverlay[];
      filters?: SceneFilters;
      background?: SceneBackground;
      effects?: SceneEffects;
    }) => {
      if (cancelled) return;
      setOverlays(scene.overlays ?? []);
      setFilters({ ...FILTER_DEFAULTS, ...(scene.filters ?? {}) });
      setBackground(scene.background);
      setEffects(scene.effects);
    };

    void (async () => {
      const token = getToken();
      if (!token) return;
      try {
        applyScene(await getSceneState(session.sessionId, token));
      } catch {
        /* scena vuota: si mostra la sorgente così com'è */
      }
      try {
        await connectSocket(token);
        subscribeSession(session.sessionId);
        cleanupWs = onSceneUpdate((p) => {
          if (p.sessionId !== session.sessionId) return;
          applyScene(p as never);
        });
      } catch {
        /* senza WS resta lo stato iniziale */
      }
    })();

    return () => {
      cancelled = true;
      cleanupWs?.();
    };
  }, [session.sessionId]);

  // L'accensione avviene su click dell'operatore, quindi il browser lascia
  // partire l'audio senza bloccarlo per la policy di autoplay.
  useEffect(() => {
    audioElsRef.current.forEach((el) => {
      el.muted = !audioOn;
      if (audioOn) void (el as HTMLAudioElement).play?.().catch(() => undefined);
    });
  }, [audioOn, hasAudio]);

  return (
    <Card variant="elevated" padding="none" className="overflow-hidden">
      <CardHeader
        className="px-3 pt-3 pb-2"
        title={
          <span className="text-sm font-semibold text-text-primary">
            {session.creatorName}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge
              variant={
                connState === "connected" ? "success" : connState === "failed" ? "danger" : "default"
              }
              size="sm"
            >
              {connStateLabel(connState)}
            </Badge>
            <a
              href={`/studio/${session.sessionId}`}
              className="text-xs font-medium px-2 py-1 rounded-md bg-primary-muted/80 text-primary-hover border border-violet-600/20 hover:bg-primary-muted transition-colors"
            >
              Componi
            </a>
            <OpenInRoomMenu sourceSessionId={session.sessionId} />
          </div>
        }
      />
      <div className="relative bg-black aspect-video">
        {/* Stessa resa di "Componi" e dello stream: overlay, filtri ed effetti. */}
        <SceneComposite
          videoRef={videoRef}
          overlays={overlays}
          filters={filters}
          background={background}
          effects={effects}
          fit="contain"
        />
        {/* Sink degli <audio>: fuori vista ma nel DOM, mai display:none. */}
        <div
          ref={audioSinkRef}
          aria-hidden="true"
          className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
        />
        {connState === "connected" && (
          <button
            type="button"
            onClick={onToggleAudio}
            disabled={!hasAudio}
            aria-pressed={audioOn}
            aria-label={audioOn ? "Disattiva audio sorgente" : "Ascolta questa sorgente"}
            title={
              !hasAudio
                ? "Questa sorgente non pubblica audio"
                : audioOn
                  ? "Audio attivo — clicca per staccare"
                  : "Ascolta questa sorgente"
            }
            className={[
              "absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              audioOn
                ? "bg-primary/80 text-white border-primary"
                : "bg-black/50 text-white border-white/20",
              hasAudio ? "" : "opacity-40 cursor-not-allowed",
            ].join(" ")}
          >
            {audioOn ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </button>
        )}
        {connState === "connecting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Spinner size="md" variant="muted" />
          </div>
        )}
        {previewError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
            <p className="text-xs text-red-400 max-w-full break-words">{previewError}</p>
          </div>
        )}
      </div>
      <div className="px-3 py-2 text-xs text-text-muted space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Session</span>
          <span className="font-mono text-text-secondary">{session.sessionId.slice(0, 16)}…</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Room</span>
          <span className="font-mono text-text-secondary">{session.roomName.slice(0, 16)}…</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Started</span>
          <span>
            {new Date(session.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>
    </Card>
  );
}

function connStateLabel(state: SessionWithRoom["connState"]): string {
  switch (state) {
    case "idle":       return "Idle";
    case "connecting": return "Connecting";
    case "connected":  return "Live";
    case "failed":     return "Failed";
    default:           return String(state);
  }
}

function SpeakerOnIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8 8 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOffIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M17 9.5l4 5M21 9.5l-4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LiveDot(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="3" fill="currentColor" />
    </svg>
  );
}
