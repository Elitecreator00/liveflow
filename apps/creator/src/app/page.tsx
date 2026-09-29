"use client";

/**
 * Go Live — Creator App
 * Mobile-first PWA page. One tap to start/stop the live stream.
 *
 * Flow:
 *   1. Creator opens camera+microfono (CameraPipeline)
 *   2. Calls createIngestSession → gets LiveKit wsUrl + creatorToken
 *   3. Connects LiveKit Room and publishes video+audio tracks
 *   4. Shows live status. Tap Stop → stopIngestSession + cleanup
 *
 * Il video pubblicato è il canvas della pipeline, non la camera: così lo
 * specchio vale anche per il pubblico e il cambio fotocamera avviene senza
 * interrompere lo stream (vedi lib/camera-pipeline.ts).
 *
 * No platform selection here — platforms are pre-assigned by the agency admin
 * (see OPERATIONAL_PLAN.md §1ter, Wave 2).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  type LocalTrack,
} from "livekit-client";
import { CameraPipeline, type Facing } from "@/lib/camera-pipeline";
import { AudioMeter } from "@/lib/audio-meter";
import { Button, Card, Badge, Spinner, StatusDot } from "@liveflow/design-system";
import {
  createIngestSession,
  stopIngestSession,
  setSourceMirror,
  getToken,
  isAuthenticated,
  getStoredUser,
  clearAuth,
  type IngestSessionResponse,
} from "@liveflow/api-client";
import { useRouter } from "next/navigation";

type GoLiveState = "idle" | "requesting-camera" | "connecting" | "live" | "stopping" | "error";

interface LiveSession {
  sessionId: string;
  roomName: string;
}

export default function GoLivePage(): React.ReactElement {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const pipelineRef = useRef<CameraPipeline | null>(null);
  const meterRef = useRef<AudioMeter | null>(null);
  const tracksRef = useRef<LocalTrack[]>([]);

  const [state, setState] = useState<GoLiveState>("idle");
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveDuration, setLiveDuration] = useState(0);
  // Camera e specchio: il valore vive anche nella pipeline (che disegna), qui
  // serve solo a tenere allineati i pulsanti.
  const [facing, setFacing] = useState<Facing>("user");
  const [mirrored, setMirrored] = useState(false);
  // false = questo device non produce frame nel canvas: si va in onda con la
  // camera diretta e lo specchio non è disponibile.
  const [canMirror, setCanMirror] = useState(true);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [audioWarning, setAudioWarning] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Specchio di `state` leggibile dentro le closure dei listener (evita di
  // catturare un valore stale registrato al momento del connect).
  const stateRef = useRef<GoLiveState>(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  // Guard sincrono anti doppio-avvio: due click rapidi creerebbero due Room
  // con la stessa identity → LiveKit espelle la prima (CLIENT_REQUEST_LEAVE).
  const goingLiveRef = useRef(false);
  // Identità mostrata nell'header: serve a sapere con quale account si è loggati.
  // Letta solo client-side (localStorage) per evitare mismatch di idratazione.
  const [account, setAccount] = useState<{ email: string; role: string } | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    const u = getStoredUser();
    if (u) setAccount({ email: u.email, role: u.role });
  }, [router]);

  // Live duration timer
  useEffect(() => {
    if (state === "live") {
      timerRef.current = setInterval(() => setLiveDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLiveDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  const cleanup = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    tracksRef.current.forEach((t) => t.stop());
    tracksRef.current = [];
    meterRef.current?.stop();
    meterRef.current = null;
    pipelineRef.current?.stop();
    pipelineRef.current = null;
    if (previewRef.current) previewRef.current.replaceChildren();
    setHasAudio(false);
    setAudioLevel(0);
    setAudioWarning(null);
    setSwitchingCamera(false);
    setCanMirror(true);
  }, []);

  const handleLogout = useCallback(() => {
    cleanup();
    clearAuth();
    router.replace("/login");
  }, [cleanup, router]);

  const handleGoLive = useCallback(async () => {
    if (goingLiveRef.current) return; // un avvio alla volta
    goingLiveRef.current = true;
    setError(null);
    setState("requesting-camera");

    // Camera + microfono in un colpo solo. Se il microfono manca la pipeline
    // ripiega sul solo video e lo dice: si va live muti solo sapendolo.
    const pipeline = new CameraPipeline();
    let source: Awaited<ReturnType<CameraPipeline["start"]>>;
    try {
      source = await pipeline.start(facing);
    } catch {
      pipeline.stop();
      setError("Camera access denied. Please allow camera permissions and try again.");
      setState("error");
      goingLiveRef.current = false;
      return;
    }
    pipelineRef.current = pipeline;
    setAudioWarning(source.audioWarning);
    setHasAudio(source.audioTrack !== null);
    void pipeline.hasMultipleCameras().then(setCanSwitchCamera);
    // Lo specchio riparte spento a ogni diretta: è un track diverso da
    // pubblicare, non uno stato da riapplicare al volo qui.
    setMirrored(false);

    // L'anteprima è il <video> della camera, montato dalla pipeline: deve
    // restare visibile, perché è anche la sorgente del canvas dello specchio.
    if (previewRef.current) {
      pipeline.attachPreview(previewRef.current, "w-full h-full object-cover");
    }

    // userProvidedTrack=true: senza, LiveKit può "riavviare" il track quando
    // cambia rete o si risveglia la pagina, sostituendo la sorgente sotto i
    // piedi allo specchio.
    const localTracks: LocalTrack[] = [
      new LocalVideoTrack(source.videoTrack, undefined, true),
    ];
    if (source.audioTrack) {
      localTracks.push(new LocalAudioTrack(source.audioTrack, undefined, true));
      const meter = new AudioMeter();
      meter.start(new MediaStream([source.audioTrack]));
      meterRef.current = meter;
    }
    tracksRef.current = localTracks;

    setState("connecting");

    let ingest: IngestSessionResponse;
    try {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");
      ingest = await createIngestSession(token);
    } catch (err) {
      cleanup();
      setError("Failed to create live session. Check your connection.");
      setState("error");
      goingLiveRef.current = false;
      return;
    }

    // publishDefaults: niente simulcast (3 layer = banda e SSRC tripli) e bitrate
    // video limitato. Riduce drasticamente il carico sul trasporto WebRTC, che in
    // dev (UDP via Docker Desktop su Windows) non regge il video full-bitrate
    // mentre l'audio passa. In produzione/su rete reale si possono rialzare.
    const room = new Room({
      publishDefaults: {
        simulcast: false,
        videoEncoding: { maxBitrate: 600_000, maxFramerate: 24 },
        // Sotto vincolo di banda l'encoder deve sacrificare i PIXEL, non i
        // fotogrammi: per una live il movimento fluido conta più del dettaglio.
        degradationPreference: "maintain-framerate",
      },
    });
    roomRef.current = room;

    room.on(RoomEvent.Disconnected, () => {
      // stateRef = valore corrente (la closure catturerebbe "connecting").
      // Copre anche il disconnect che avviene DURANTE il publish.
      if (stateRef.current === "live" || stateRef.current === "connecting") {
        setError("Connection lost. Stream ended.");
        setState("error");
        cleanup();
        setSession(null);
      }
    });

    try {
      await room.connect(ingest.wsUrl, ingest.creatorToken);
      // Publish in PARALLELO: pubblicare audio e poi (in serie) il video lascia
      // una finestra in cui il video è "pending"; se in quel momento scatta un
      // reconnect interno, la publish video viene annullata ("Cancelled
      // publication by calling unpublish"). In parallelo la finestra sparisce.
      await Promise.all(
        tracksRef.current.map((t) => room.localParticipant.publishTrack(t)),
      );
      setSession({ sessionId: ingest.sessionId, roomName: ingest.roomName });
      setState("live");
    } catch (err) {
      cleanup();
      const detail = err instanceof Error ? err.message : String(err);
      console.error("LiveKit connect/publish failed:", err);
      setError(`Connessione LiveKit fallita: ${detail}`);
      setState("error");
      setSession(null);
    } finally {
      goingLiveRef.current = false;
    }
  }, [cleanup, facing]);

  const handleStop = useCallback(async () => {
    setState("stopping");
    const currentSession = session;
    cleanup();
    setSession(null);

    if (currentSession) {
      try {
        const token = getToken();
        if (token) {
          await stopIngestSession(currentSession.sessionId, token);
        }
      } catch {
        // Best-effort — local state already cleared
      }
    }
    setState("idle");
  }, [session, cleanup]);

  /**
   * Ruota fronte/retro. Anche in diretta non si interrompe niente: cambia la
   * sorgente del canvas, mentre il track pubblicato resta lo stesso.
   */
  const handleSwitchCamera = useCallback(async () => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;
    setSwitchingCamera(true);
    try {
      const { facing: next, videoTrack } = await pipeline.switchCamera();
      setFacing(next);
      await publishVideoTrack(videoTrack);
    } catch {
      setError("Non è stato possibile cambiare fotocamera su questo dispositivo.");
    } finally {
      setSwitchingCamera(false);
    }
  }, []);

/**
   * Sostituisce il video in onda senza interrompere la diretta: serve quando si
   * ruota la fotocamera, perché il track della nuova camera è un altro.
   */
  const publishVideoTrack = useCallback(async (track: MediaStreamTrack) => {
    const published = tracksRef.current.find((t) => t.kind === "video");
    if (published instanceof LocalVideoTrack && published.mediaStreamTrack !== track) {
      await published.replaceTrack(track, true);
    }
  }, []);

  /**
   * Specchio: si ribalta subito l'anteprima (CSS, gratis) e si comunica la
   * scelta al server, che applica il ribaltamento a valle con un filtro FFmpeg.
   * Sul device non si ricodifica nulla: è la differenza fra una diretta fluida
   * e una al rallentatore su PC.
   */
  const handleToggleMirror = useCallback(async () => {
    const pipeline = pipelineRef.current;
    const token = getToken();
    if (!pipeline || !session || !token) return;
    const next = !pipeline.mirrored;
    pipeline.setMirrored(next);
    setMirrored(next);
    try {
      await setSourceMirror(session.sessionId, next, token);
    } catch {
      // L'anteprima resta com'è, ma il pubblico vedrebbe il contrario: meglio
      // tornare indietro e dirlo.
      pipeline.setMirrored(!next);
      setMirrored(!next);
      setError("Specchio non applicato: il server non ha risposto.");
    }
  }, [session]);

  // 10 letture/s: bastano a far muovere la barra senza ri-renderizzare di continuo.
  useEffect(() => {
    if (!hasAudio) return;
    const id = setInterval(() => setAudioLevel(meterRef.current?.read() ?? 0), 100);
    return () => clearInterval(id);
  }, [hasAudio]);

  const isLive = state === "live";
  const isBusy = state === "requesting-camera" || state === "connecting" || state === "stopping";
  // I controlli camera esistono solo mentre la camera è accesa.
  const cameraActive = state === "connecting" || state === "live";

  return (
    <div className="min-h-screen bg-bg-base flex flex-col items-center justify-start pt-safe px-4 pb-8">
      {/* Ambient glow */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        {isLive && (
          <div className="absolute top-0 left-0 right-0 h-40 bg-danger/5 blur-3xl" />
        )}
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
      </div>

      {/* Header */}
      <header className="w-full max-w-sm flex items-center justify-between py-4 relative">
        <div className="flex items-center gap-2">
          <LiveFlowLogo />
          <span className="text-base font-bold text-text-primary tracking-tight">LiveFlow</span>
        </div>
        {isLive ? (
          <Badge variant="danger" dot>
            LIVE {formatDuration(liveDuration)}
          </Badge>
        ) : (
          account && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-elevated border border-border max-w-[160px]">
                <span className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xs font-bold text-primary-hover uppercase">
                    {account.email[0]}
                  </span>
                </span>
                <span className="text-xs font-medium text-text-secondary truncate">
                  {account.email}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Esci"
                aria-label="Esci"
                className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-muted transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <LogoutIcon />
              </button>
            </div>
          )
        )}
      </header>

      {/* Video preview */}
      <div className="w-full max-w-sm mt-4 relative">
        <div
          className={[
            "relative bg-black rounded-2xl overflow-hidden aspect-[9/16] border-2 transition-all duration-slow",
            isLive ? "border-live shadow-glow-danger" : "border-border",
          ].join(" ")}
        >
          {/* Ci viene montato dentro il canvas della pipeline (è il frame che
              va in onda, specchio compreso). */}
          <div
            ref={previewRef}
            className="w-full h-full"
            role="img"
            aria-label={`Anteprima camera${mirrored ? " (specchiata)" : ""}`}
          />

          {/* Overlay states */}
          {state === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg-elevated/80">
              <CameraIcon />
              <p className="text-sm text-text-secondary text-center px-8">
                Tap "Go Live" to start your stream
              </p>
            </div>
          )}

          {(state === "requesting-camera" || state === "connecting") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
              <Spinner size="lg" variant="primary" />
              <p className="text-sm text-text-secondary">
                {state === "requesting-camera" ? "Opening camera…" : "Connecting to LiveKit…"}
              </p>
            </div>
          )}

          {state === "stopping" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
              <Spinner size="lg" variant="muted" />
              <p className="text-sm text-text-secondary">Stopping stream…</p>
            </div>
          )}

          {/* Live indicator */}
          {isLive && (
            <div className="absolute top-3 left-3">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-danger/90 backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse-live" />
                <span className="text-xs font-bold text-white">LIVE</span>
              </div>
            </div>
          )}

          {/* Controlli camera: ruota e specchio, usabili anche in diretta */}
          {cameraActive && (
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              {canSwitchCamera && (
                <button
                  type="button"
                  onClick={() => void handleSwitchCamera()}
                  disabled={switchingCamera}
                  aria-label={
                    facing === "user"
                      ? "Passa alla fotocamera posteriore"
                      : "Passa alla fotocamera frontale"
                  }
                  title="Ruota fotocamera"
                  className="w-11 h-11 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center border border-white/20 active:scale-95 transition-transform duration-fast disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  {switchingCamera ? <Spinner size="sm" variant="muted" /> : <SwitchCameraIcon />}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleToggleMirror()}
                disabled={!canMirror || !session}
                aria-label="Modalità specchio"
                aria-pressed={mirrored}
                title={
                  canMirror
                    ? mirrored
                      ? "Specchio attivo"
                      : "Specchio disattivo"
                    : "Specchio non disponibile su questo dispositivo"
                }
                className={[
                  "w-11 h-11 rounded-full backdrop-blur-sm flex items-center justify-center border active:scale-95 transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  mirrored
                    ? "bg-primary/80 text-white border-primary"
                    : "bg-black/50 text-white border-white/20",
                  canMirror ? "" : "opacity-40",
                ].join(" ")}
              >
                <MirrorIcon />
              </button>
            </div>
          )}

          {/* Microfono: la barra si muove mentre si parla — è la prova a colpo
              d'occhio che la diretta non sta andando muta. */}
          {cameraActive && (
            <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
              {hasAudio ? <MicIcon /> : <MicOffIcon />}
              <div
                className="w-16 h-1.5 rounded-full bg-white/25 overflow-hidden"
                role="meter"
                aria-label="Livello microfono"
                aria-valuenow={Math.round(audioLevel * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-success rounded-full transition-[width] duration-100"
                  style={{ width: `${Math.round(audioLevel * 100)}%` }
                  }
                />
              </div>
            </div>
          )}

          {/* Duration */}
          {isLive && (
            <div className="absolute bottom-3 right-3">
              <span className="font-mono text-xs text-white/80 bg-black/50 px-2 py-1 rounded-lg backdrop-blur-sm">
                {formatDuration(liveDuration)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Session info */}
      {session && isLive && (
        <Card variant="elevated" padding="md" className="w-full max-w-sm mt-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusDot status="live" size="sm" />
              <span className="text-sm font-semibold text-text-primary">Stream attivo</span>
            </div>
            <span className="text-xs font-mono text-text-muted">
              {session.sessionId.slice(0, 12)}…
            </span>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Room: {session.roomName.slice(0, 16)}…
          </p>
        </Card>
      )}

      {/* Live senza microfono: non blocca, ma deve saltare all'occhio */}
      {audioWarning && cameraActive && (
        <div
          role="status"
          className="w-full max-w-sm mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-warn-muted border border-warn/30 text-sm text-warn animate-fade-in"
        >
          <MicOffIcon /> {audioWarning}
        </div>
      )}

      {/* Error */}
      {(state === "error" || error) && error && (
        <div
          role="alert"
          className="w-full max-w-sm mt-4 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-danger-muted border border-danger/30 text-sm text-danger animate-fade-in"
        >
          <span aria-hidden="true">!</span> {error}
        </div>
      )}

      {/* CTA */}
      <div className="w-full max-w-sm mt-6 space-y-3">
        {!isLive ? (
          <Button
            variant="accent"
            size="lg"
            fullWidth
            loading={isBusy}
            disabled={isBusy}
            onClick={handleGoLive}
            leftIcon={<LiveDotIcon />}
          >
            {isBusy ? "Connessione…" : "Vai Live"}
          </Button>
        ) : (
          <Button
            variant="danger"
            size="lg"
            fullWidth
            onClick={handleStop}
            disabled={isBusy}
          >
            Ferma Stream
          </Button>
        )}

        {(state === "error") && (
          <Button
            variant="outline"
            size="md"
            fullWidth
            onClick={() => { setError(null); setState("idle"); }}
          >
            Riprova
          </Button>
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-text-muted text-center mt-8 max-w-xs">
        Le piattaforme di destinazione sono pre-configurate dall&apos;agenzia.
      </p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LiveFlowLogo(): React.ReactElement {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="var(--lf-primary)" />
      <path d="M8 20 L13 12 L16 17 L19 14 L24 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="24" cy="10" r="3" fill="var(--lf-live)" />
    </svg>
  );
}

function CameraIcon(): React.ReactElement {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-text-muted">
      <rect x="4" y="12" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M36 20l8-4v16l-8-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="24" r="6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function LiveDotIcon(): React.ReactElement {
  return (
    <span className="inline-block w-2.5 h-2.5 rounded-full bg-live animate-pulse-live" aria-hidden="true" />
  );
}

function SwitchCameraIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9V7a2 2 0 0 1 2-2h2.5l1-1.5h5l1 1.5H18a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 12l-2.5 2.5L3 12M16 12l2.5-2.5L21 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MirrorIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 3" />
      <path d="M9 6L4 12l5 6V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M15 6l5 6-5 6V6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" opacity="0.55" />
    </svg>
  );
}

function MicIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MicOffIcon(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
