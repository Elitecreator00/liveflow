"use client";

/**
 * Editor scena (Step B.1) — l'operatore compone la sorgente della creator con
 * overlay testo/immagine, in tempo reale. Posizioni in % (WYSIWYG). Salvataggio
 * debounced via PUT /studio/sessions/:id/scene → broadcast WS ai subscriber
 * (in futuro: pagina scena renderizzata da LiveKit Egress, ADR-0004).
 *
 * NB: connette UN solo subscriber operatore alla room. Navigando qui dalla griglia
 * Studio, la griglia si smonta e libera le sue connessioni (stessa identity).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { Button, Card, Spinner, Toggle } from "@liveflow/design-system";
import {
  getActiveSessions,
  getSceneState,
  updateSceneState,
  uploadSceneImage,
  getToken,
  type SceneOverlay,
  type SceneFilters,
  type SceneBackground,
  type SceneEffects,
  type ActiveIngestSession,
} from "@liveflow/api-client";
import { SceneComposite } from "@/components/SceneComposite";
import { StreamHealth } from "@/components/StreamHealth";
import {
  FILTER_PARAMS,
  FILTER_PRESETS,
  FILTER_DEFAULTS,
  applyPreset,
} from "@/components/sceneFilters";

type LoadState = "loading" | "ready" | "not-found" | "error";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ov_${Math.random().toString(36).slice(2)}`;
}

export default function SceneEditorPage(): React.ReactElement {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionId = String(params?.sessionId ?? "");

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  // Room esposta come stato (oltre al ref) così StreamHealth può agganciare i
  // suoi listener in modo reattivo quando la connessione viene (ri)creata.
  const [room, setRoom] = useState<Room | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [session, setSession] = useState<ActiveIngestSession | null>(null);
  const [connected, setConnected] = useState(false);
  // L'audio della sorgente parte staccato: l'operatore lo accende quando
  // vuole sentire questa creator (in cuffia, per non creare rientri).
  const [audioOn, setAudioOn] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const audioSinkRef = useRef<HTMLDivElement>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);
  const [overlays, setOverlays] = useState<SceneOverlay[]>([]);
  const [filters, setFilters] = useState<SceneFilters>({ ...FILTER_DEFAULTS });
  const [background, setBackground] = useState<SceneBackground>({ mode: "none" });
  const [effects, setEffects] = useState<SceneEffects>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bgUploading, setBgUploading] = useState(false);

  // Refs sempre allineati allo stato: il salvataggio (debounced) legge da qui
  // per evitare closure stale quando si modificano overlay e filtri.
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const effectsRef = useRef(effects);
  effectsRef.current = effects;

  // Fase 1 — risolvi la sessione (wsUrl + viewerToken) e carica la scena iniziale.
  // NON connettiamo qui: prima la sessione deve risolversi così loadState="ready"
  // monta l'elemento <video>; la connessione/attach avviene nella Fase 2.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const sessions = await getActiveSessions(token);
        const s = sessions.find((x) => x.sessionId === sessionId);
        if (!s) {
          if (!cancelled) setLoadState("not-found");
          return;
        }
        try {
          const scene = await getSceneState(sessionId, token);
          if (!cancelled) {
            setOverlays(scene.overlays ?? []);
            if (scene.filters) setFilters({ ...FILTER_DEFAULTS, ...scene.filters });
            if (scene.background) setBackground(scene.background);
            if (scene.effects) setEffects(scene.effects);
          }
        } catch {
          /* scena vuota */
        }
        if (!cancelled) {
          setSession(s);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, router]);

  // Fase 2 — connetti il subscriber LiveKit e attacca il video. Parte SOLO dopo
  // che la sessione è risolta (loadState="ready"), quindi l'elemento <video> è
  // già montato e `videoRef.current` è valido quando arriva TrackSubscribed.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;
    setRoom(room);

    const attachVideo = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current && !cancelled) {
        track.attach(videoRef.current);
      }
    };
    const attachTrack = (track: RemoteTrack) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video) {
        attachVideo(track);
        return;
      }
      if (track.kind === Track.Kind.Audio && audioSinkRef.current) {
        const el = track.attach();
        el.autoplay = true;
        el.muted = true; // acceso solo su richiesta
        audioSinkRef.current.appendChild(el);
        audioElsRef.current.push(el);
        setHasAudio(true);
      }
    };
    room.on(RoomEvent.TrackSubscribed, attachTrack);
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) setConnected(false);
    });

    (async () => {
      try {
        await room.connect(session.wsUrl, session.viewerToken);
        if (cancelled) {
          room.disconnect();
          return;
        }
        // Tracce già pubblicate prima del nostro subscribe.
        room.remoteParticipants.forEach((p) =>
          p.trackPublications.forEach((pub) => {
            if (pub.track) attachTrack(pub.track);
          }),
        );
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      setRoom(null);
      if (videoRef.current) videoRef.current.srcObject = null;
      audioElsRef.current.forEach((el) => el.remove());
      audioElsRef.current = [];
    };
  }, [session]);

  // Salvataggio debounced di overlay + filtri (legge dai ref → sempre aggiornati).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    const token = getToken();
    if (!token) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await updateSceneState(
          sessionId,
          overlaysRef.current,
          filtersRef.current,
          backgroundRef.current,
          effectsRef.current,
          token,
        );
      } catch {
        /* il prossimo salvataggio riproverà */
      } finally {
        setSaving(false);
      }
    }, 400);
  }, [sessionId]);

  const mutate = useCallback(
    (next: SceneOverlay[]) => {
      overlaysRef.current = next;
      setOverlays(next);
      persist();
    },
    [persist],
  );

  const mutateFilters = useCallback(
    (next: SceneFilters) => {
      filtersRef.current = next;
      setFilters(next);
      persist();
    },
    [persist],
  );

  const mutateBackground = useCallback(
    (next: SceneBackground) => {
      backgroundRef.current = next;
      setBackground(next);
      persist();
    },
    [persist],
  );

  const mutateEffects = useCallback(
    (next: SceneEffects) => {
      effectsRef.current = next;
      setEffects(next);
      persist();
    },
    [persist],
  );

  const bgFileInputRef = useRef<HTMLInputElement>(null);
  const handleBgFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setBgUploading(true);
    try {
      const url = await uploadSceneImage(file, token);
      mutateBackground({ ...background, mode: "image", imageUrl: url });
    } catch {
      window.alert("Upload sfondo fallito (formato non supportato o file troppo grande, max 8MB).");
    } finally {
      setBgUploading(false);
    }
  };

  const addText = () =>
    mutate([
      ...overlays,
      {
        id: uid(),
        type: "text",
        x: 8,
        y: 8,
        width: 50,
        z: overlays.length,
        visible: true,
        text: "Nuovo testo",
        fontSize: 6,
        color: "#ffffff",
        fontWeight: "700",
      },
    ]);

  const addImageOverlay = (url: string) => {
    const o: SceneOverlay = {
      id: uid(),
      type: "image",
      x: 60,
      y: 60,
      width: 30,
      z: overlays.length,
      visible: true,
      url,
    };
    mutate([...overlays, o]);
    setSelectedId(o.id);
  };

  const addImageByUrl = () => {
    const url = window.prompt("URL immagine (PNG/JPG/WEBP/SVG):");
    if (url) addImageOverlay(url);
  };

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // consente di ricaricare lo stesso file
    if (!file) return;
    const token = getToken();
    if (!token) return;
    setUploading(true);
    try {
      const url = await uploadSceneImage(file, token);
      addImageOverlay(url);
    } catch {
      window.alert("Upload immagine fallito (formato non supportato o file troppo grande, max 8MB).");
    } finally {
      setUploading(false);
    }
  };

  const patch = (id: string, p: Partial<SceneOverlay>) =>
    mutate(overlays.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const remove = (id: string) => mutate(overlays.filter((o) => o.id !== id));

  const setFilterParam = (key: keyof SceneFilters, value: number) =>
    mutateFilters({ ...filters, [key]: value, preset: undefined });
  const selectPreset = (preset: (typeof FILTER_PRESETS)[number]) =>
    mutateFilters(applyPreset(preset));

  if (loadState === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" variant="primary" />
      </div>
    );
  }
  if (loadState === "not-found" || loadState === "error") {
    return (
      <Card variant="ghost" padding="lg" className="max-w-lg mx-auto text-center">
        <p className="text-text-secondary text-sm">
          {loadState === "not-found"
            ? "Sessione non attiva. La creator non è (più) live."
            : "Errore nel caricamento dell'editor scena."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/studio")}>
          ← Torna allo Studio
        </Button>
      </Card>
    );
  }

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/studio")}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            ← Studio
          </button>
          <h2 className="lf-section-title">Editor scena</h2>
          <StreamHealth room={room} videoRef={videoRef} />
        </div>
        <span className="text-xs text-text-muted">
          {saving ? "Salvataggio…" : "Salvato"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Canvas WYSIWYG */}
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video border border-border">
          <SceneComposite
            videoRef={videoRef}
            overlays={overlays}
            filters={filters}
            background={background}
            effects={effects}
            fit="contain"
            editable
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={(id, x, y) => patch(id, { x, y })}
          />
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Spinner size="md" variant="muted" />
            </div>
          )}
          {/* Sink degli <audio>: nel DOM ma fuori vista. */}
          <div
            ref={audioSinkRef}
            aria-hidden="true"
            className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
          />
          <button
            type="button"
            onClick={() => {
              const next = !audioOn;
              setAudioOn(next);
              audioElsRef.current.forEach((el) => {
                el.muted = !next;
                if (next) void (el as HTMLAudioElement).play?.().catch(() => undefined);
              });
            }}
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
              "absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center border backdrop-blur-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
              audioOn
                ? "bg-primary/80 text-white border-primary"
                : "bg-black/50 text-white border-white/20",
              hasAudio ? "" : "opacity-40 cursor-not-allowed",
            ].join(" ")}
          >
            {audioOn ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          </button>
        </div>

        {/* Pannello editor */}
        <Card variant="elevated" padding="md" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={addText}>
              + Testo
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={uploading}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              ⬆ Carica immagine
            </Button>
            <Button variant="ghost" size="sm" onClick={addImageByUrl}>
              + da URL
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFilePicked}
            />
          </div>
          <p className="text-2xs text-text-muted">
            Trascina un overlay sul video per posizionarlo, o usa i cursori qui sotto.
          </p>

          {overlays.length === 0 ? (
            <p className="text-xs text-text-muted py-4 text-center">
              Nessun overlay. Aggiungi testo o immagine.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {overlays.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => setSelectedId(o.id)}
                    className={[
                      "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm border transition-colors",
                      o.id === selectedId
                        ? "bg-primary-muted/80 border-violet-600/30 text-text-primary"
                        : "border-transparent text-text-secondary hover:bg-bg-overlay",
                    ].join(" ")}
                  >
                    <span className="truncate">
                      {o.type === "text" ? `“${o.text ?? ""}”` : "🖼 immagine"}
                    </span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          patch(o.id, { visible: !o.visible });
                        }}
                        className="text-xs text-text-muted hover:text-text-primary"
                        title={o.visible ? "Nascondi" : "Mostra"}
                      >
                        {o.visible ? "👁" : "🚫"}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(o.id);
                        }}
                        className="text-xs text-text-muted hover:text-danger"
                        title="Elimina"
                      >
                        ✕
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && (
            <div className="border-t border-border pt-3 space-y-3">
              {selected.type === "text" && (
                <>
                  <Field label="Testo">
                    <input
                      className="lf-input"
                      value={selected.text ?? ""}
                      onChange={(e) => patch(selected.id, { text: e.target.value })}
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Field label="Colore">
                      <input
                        type="color"
                        className="h-8 w-full rounded bg-bg-elevated border border-border"
                        value={selected.color ?? "#ffffff"}
                        onChange={(e) => patch(selected.id, { color: e.target.value })}
                      />
                    </Field>
                    <RangeField
                      label={`Dim. ${Math.round(selected.fontSize ?? 6)}`}
                      min={1}
                      max={20}
                      value={selected.fontSize ?? 6}
                      onChange={(v) => patch(selected.id, { fontSize: v })}
                    />
                  </div>
                </>
              )}
              {selected.type === "image" && (
                <Field label="URL immagine">
                  <input
                    className="lf-input"
                    value={selected.url ?? ""}
                    onChange={(e) => patch(selected.id, { url: e.target.value })}
                  />
                </Field>
              )}
              <div className="grid grid-cols-3 gap-2">
                <RangeField label={`X ${Math.round(selected.x)}%`} min={0} max={100} value={selected.x} onChange={(v) => patch(selected.id, { x: v })} />
                <RangeField label={`Y ${Math.round(selected.y)}%`} min={0} max={100} value={selected.y} onChange={(v) => patch(selected.id, { y: v })} />
                <RangeField label={`L ${Math.round(selected.width)}%`} min={5} max={100} value={selected.width} onChange={(v) => patch(selected.id, { width: v })} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Sfondo AI (segmentazione persona — ADR-0007 §1) */}
      <Card variant="elevated" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Sfondo AI</h3>
            <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-primary-muted/80 text-primary-hover">
              AI
            </span>
          </div>
          <span className="text-2xs text-text-muted">
            Scontorna la creator dallo sfondo (lato cloud)
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {([
            { mode: "none", label: "Nessuno" },
            { mode: "blur", label: "Sfocato" },
            { mode: "image", label: "Immagine" },
          ] as const).map((opt) => (
            <button
              key={opt.mode}
              onClick={() => mutateBackground({ ...background, mode: opt.mode })}
              className={[
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                background.mode === opt.mode
                  ? "bg-primary-muted/80 border-violet-600/30 text-primary-hover"
                  : "border-border text-text-secondary hover:bg-bg-overlay",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {background.mode === "blur" && (
          <RangeField
            label={`Intensità sfocatura ${Math.round(background.blur ?? 12)}px`}
            min={1}
            max={40}
            value={background.blur ?? 12}
            onChange={(v) => mutateBackground({ ...background, blur: v })}
          />
        )}

        {background.mode === "image" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                loading={bgUploading}
                disabled={bgUploading}
                onClick={() => bgFileInputRef.current?.click()}
              >
                ⬆ Carica sfondo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const url = window.prompt("URL immagine di sfondo (PNG/JPG/WEBP):");
                  if (url) mutateBackground({ ...background, mode: "image", imageUrl: url });
                }}
              >
                + da URL
              </Button>
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBgFilePicked}
              />
            </div>
            {background.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={background.imageUrl}
                alt="Sfondo selezionato"
                className="h-20 rounded-lg border border-border object-cover"
              />
            ) : (
              <p className="text-2xs text-text-muted">
                Nessuna immagine: carica o incolla un URL per attivare lo sfondo.
              </p>
            )}
          </div>
        )}

        {background.mode !== "none" && (
          <p className="text-2xs text-text-muted">
            ⓘ L&apos;effetto è calcolato lato nostro (MediaPipe); la creator continua
            a inviare il flusso grezzo. Al primo uso il modello viene scaricato una volta.
          </p>
        )}
      </Card>

      {/* Effetti volto (ADR-0007 §2, step B.4) */}
      <Card variant="elevated" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Effetti volto</h3>
            <span className="px-1.5 py-0.5 rounded text-2xs font-semibold bg-primary-muted/80 text-primary-hover">
              AI
            </span>
          </div>
          <span className="text-2xs text-text-muted">
            Calcolati lato cloud (MediaPipe)
          </span>
        </div>

        {/* Beautify */}
        <div className="space-y-2">
          <Toggle
            checked={effects.beautify?.enabled ?? false}
            onChange={(checked) =>
              mutateEffects({
                ...effects,
                beautify: {
                  enabled: checked,
                  intensity: effects.beautify?.intensity ?? 50,
                },
              })
            }
            label="Beautify (ritocco pelle)"
            size="sm"
          />
          {effects.beautify?.enabled && (
            <RangeField
              label={`Intensità  ${Math.round(effects.beautify.intensity)}%`}
              min={0}
              max={100}
              value={effects.beautify.intensity}
              onChange={(v) =>
                mutateEffects({
                  ...effects,
                  beautify: { ...effects.beautify!, intensity: v },
                })
              }
            />
          )}
        </div>

        {/* Privacy volto */}
        <div className="space-y-2">
          <Toggle
            checked={effects.facePrivacy?.enabled ?? false}
            onChange={(checked) =>
              mutateEffects({
                ...effects,
                facePrivacy: {
                  enabled: checked,
                  mode: effects.facePrivacy?.mode ?? "blur",
                  intensity: effects.facePrivacy?.intensity ?? 50,
                },
              })
            }
            label="Privacy volto"
            size="sm"
          />
          {effects.facePrivacy?.enabled && (
            <>
              <div className="flex flex-wrap gap-1.5 pl-1">
                {(["blur", "pixelate"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() =>
                      mutateEffects({
                        ...effects,
                        facePrivacy: { ...effects.facePrivacy!, mode: m },
                      })
                    }
                    className={[
                      "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                      (effects.facePrivacy?.mode ?? "blur") === m
                        ? "bg-primary-muted/80 border-violet-600/30 text-primary-hover"
                        : "border-border text-text-secondary hover:bg-bg-overlay",
                    ].join(" ")}
                  >
                    {m === "blur" ? "Sfocato" : "Pixelato"}
                  </button>
                ))}
              </div>
              <RangeField
                label={`Intensità  ${Math.round(effects.facePrivacy.intensity)}%`}
                min={0}
                max={100}
                value={effects.facePrivacy.intensity}
                onChange={(v) =>
                  mutateEffects({
                    ...effects,
                    facePrivacy: { ...effects.facePrivacy!, intensity: v },
                  })
                }
              />
            </>
          )}
        </div>

        <p className="text-2xs text-text-muted">
          La creator non esegue nulla; gli effetti sono applicati lato nostro.
        </p>
      </Card>

      {/* Filtri & effetti sulla sorgente video */}
      <Card variant="elevated" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Filtri & effetti</h3>
          <button
            onClick={() => mutateFilters({ ...FILTER_DEFAULTS })}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Reset
          </button>
        </div>

        {/* Preset */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPreset(p)}
              className={[
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                filters.preset === p.id || (p.id === "none" && !filters.preset)
                  ? "bg-primary-muted/80 border-violet-600/30 text-primary-hover"
                  : "border-border text-text-secondary hover:bg-bg-overlay",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Slider fini */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 pt-1">
          {FILTER_PARAMS.map((p) => (
            <RangeField
              key={p.key}
              label={`${p.label} ${Math.round(Number(filters[p.key] ?? FILTER_DEFAULTS[p.key]))}${p.unit}`}
              min={p.min}
              max={p.max}
              value={Number(filters[p.key] ?? FILTER_DEFAULTS[p.key])}
              onChange={(v) => setFilterParam(p.key, v)}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label className="block flex-1">
      <span className="block text-2xs font-medium text-text-muted uppercase tracking-wider mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <label className="block flex-1">
      <span className="block text-2xs font-medium text-text-muted uppercase tracking-wider mb-1">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </label>
  );
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
