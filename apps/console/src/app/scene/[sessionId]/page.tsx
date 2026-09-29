"use client";

/**
 * Pagina-scena di RENDER (Step B.2) — è ciò che LiveKit Egress (Chrome headless)
 * carica per produrre l'output composito da inviare in RTMP al fan-out.
 *
 * Full-bleed, nessuna UI: solo la sorgente creator (LiveKit subscribe) + overlay
 * + filtri, identici alla preview operatore (stessi componenti → WYSIWYG).
 *
 * AUDIO: l'Egress cattura video E audio DI QUESTA PAGINA (Chrome headless), non
 * il mix della room. Se qui si attacca solo il video, lo stream RTMP finale esce
 * muto: per questo le track audio vengono montate e riprodotte (vedi sotto).
 * Lo stato-scena arriva live via WebSocket (`scene:update`) man mano che
 * l'operatore lo modifica; lo stato iniziale via REST se è fornito un apiToken.
 *
 * Parametri query (iniettati dall'EgressOrchestrator, prossimo step B.2):
 *   ?ws=<livekit wsUrl>&lkToken=<viewer token>[&apiToken=<jwt per scena iniziale>]
 *
 * NB: route PUBBLICA (fuori da (dashboard)) — nessun guard, nessuna sidebar.
 */

import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import {
  connectSocket,
  subscribeSession,
  onSceneUpdate,
  getSceneState,
  type SceneOverlay,
  type SceneFilters,
  type SceneBackground,
  type SceneEffects,
} from "@liveflow/api-client";
import { SceneComposite } from "@/components/SceneComposite";
import { FILTER_DEFAULTS } from "@/components/sceneFilters";

export default function SceneRenderPage(): React.ReactElement {
  const params = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const sessionId = String(params?.sessionId ?? "");
  // LiveKit Egress appende ?url=<ws>&token=<token>&layout=...; accettiamo
  // quei nomi (priorità) con fallback ai nostri per test manuali.
  const wsUrl = search.get("url") ?? search.get("ws") ?? "";
  const lkToken = search.get("token") ?? search.get("lkToken") ?? "";
  const apiToken = search.get("apiToken") ?? "";

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  // Gli <audio> del creator: fuori schermo ma riprodotti, perché è dal suono
  // della pagina che Egress ricava la traccia audio dello stream.
  const audioSinkRef = useRef<HTMLDivElement>(null);
  const audioElsRef = useRef<HTMLMediaElement[]>([]);

  const [overlays, setOverlays] = useState<SceneOverlay[]>([]);
  const [filters, setFilters] = useState<SceneFilters>({ ...FILTER_DEFAULTS });
  const [background, setBackground] = useState<SceneBackground | undefined>(undefined);
  const [effects, setEffects] = useState<SceneEffects | undefined>(undefined);

  // LiveKit subscribe → video full-bleed.
  useEffect(() => {
    if (!wsUrl || !lkToken) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      if (cancelled) return;
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
        return;
      }
      if (track.kind === Track.Kind.Audio && audioSinkRef.current) {
        // attach() senza argomento crea un <audio> già collegato al track.
        const el = track.attach();
        el.autoplay = true;
        el.muted = false;
        audioSinkRef.current.appendChild(el);
        audioElsRef.current.push(el);
        // Chrome dell'Egress parte con autoplay consentito; in un browser
        // normale il play può essere rifiutato e resta senza audio (la pagina
        // di render non è pensata per l'uso manuale).
        void el.play?.().catch(() => undefined);
      }
    };
    room.on(RoomEvent.TrackSubscribed, attach);

    (async () => {
      try {
        await room.connect(wsUrl, lkToken);
        if (cancelled) {
          room.disconnect();
          return;
        }
        room.remoteParticipants.forEach((p) =>
          p.trackPublications.forEach((pub) => {
            if (pub.track) attach(pub.track);
          }),
        );
      } catch {
        /* l'Egress riproverà / l'operatore se ne accorge */
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      audioElsRef.current.forEach((el) => el.remove());
      audioElsRef.current = [];
    };
  }, [wsUrl, lkToken]);

  // Stato scena: iniziale via REST (se apiToken) + aggiornamenti live via WS.
  useEffect(() => {
    if (!sessionId) return;
    let cleanupWs: (() => void) | undefined;

    (async () => {
      if (apiToken) {
        try {
          const scene = await getSceneState(sessionId, apiToken);
          setOverlays(scene.overlays ?? []);
          if (scene.filters) setFilters({ ...FILTER_DEFAULTS, ...scene.filters });
          setBackground(scene.background);
          setEffects(scene.effects);
        } catch {
          /* parte vuoto, poi arrivano gli update WS */
        }
      }
      try {
        await connectSocket(apiToken);
        subscribeSession(sessionId);
        cleanupWs = onSceneUpdate((p) => {
          if (p.sessionId !== sessionId) return;
          setOverlays((p.overlays as SceneOverlay[]) ?? []);
          setFilters({ ...FILTER_DEFAULTS, ...((p.filters as SceneFilters) ?? {}) });
          setBackground((p.background as SceneBackground | undefined) ?? undefined);
          setEffects((p.effects as SceneEffects | undefined) ?? undefined);
        });
      } catch {
        /* senza WS, resta lo stato iniziale */
      }
    })();

    return () => cleanupWs?.();
  }, [sessionId, apiToken]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <SceneComposite
        videoRef={videoRef}
        overlays={overlays}
        filters={filters}
        background={background}
        effects={effects}
        fit="cover"
      />
      {/* Sink audio: invisibile ma nel DOM e in riproduzione — è da qui che
          Egress ricava la traccia audio dello stream RTMP. Fuori schermo anziché
          display:none, per non dipendere da come il browser tratta i media
          nascosti. */}
      <div
        ref={audioSinkRef}
        aria-hidden="true"
        className="absolute w-0 h-0 overflow-hidden opacity-0 pointer-events-none"
      />
    </div>
  );
}
