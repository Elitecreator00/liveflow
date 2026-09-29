"use client";

/**
 * Composito di scena CONDIVISO tra preview operatore (editor) e pagina-scena
 * renderizzata da LiveKit Egress → garantisce WYSIWYG (stessa resa).
 *
 * Strati (dal basso): <video> sorgente (LiveKit) → <canvas> segmentazione AI
 * (solo quando uno sfondo è attivo) → overlay testo/immagine. Filtri CSS
 * applicati a video e canvas in modo identico.
 *
 * Il `<video>` resta SEMPRE montato e in riproduzione (anche sotto il canvas):
 * MediaPipe legge i suoi frame. La connessione/attach LiveKit è gestita dalla
 * pagina chiamante tramite il `videoRef` passato qui.
 *
 * Il contenitore parent DEVE essere `position: relative`.
 *
 * Pipeline rAF singola (override PM, ADR-0007 §2):
 *   useSelfieSegmentation possiede il loop rAF e il canvas. useFaceEffects espone
 *   un FaceCompositor che viene invocato inline nel callback di segmentazione
 *   (passo sequenziale nello stesso frame). Nessun double-rAF → nessun flicker.
 */

import React, { useCallback, type RefObject, useRef, useState } from "react";
import type {
  SceneOverlay,
  SceneFilters,
  SceneBackground,
  SceneEffects,
} from "@liveflow/api-client";
import { SceneOverlays } from "./SceneOverlays";
import { filterToCss } from "./sceneFilters";
import { useSelfieSegmentation } from "./useSelfieSegmentation";
import { useFaceEffects } from "./useFaceEffects";
import type { FaceCompositor } from "./faceCompositing";

interface SceneCompositeProps {
  videoRef: RefObject<HTMLVideoElement>;
  overlays: SceneOverlay[];
  filters?: SceneFilters;
  background?: SceneBackground;
  /** Effetti AR sul volto (ADR-0007 §2, step B.4). Opzionale. */
  effects?: SceneEffects;
  /** Adattamento del video al contenitore: 'cover' (render full-bleed) o 'contain' (editor). */
  fit?: "cover" | "contain";
  // ── Editing overlay (solo operatore) ─────────────────────────────
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}

export function SceneComposite({
  videoRef,
  overlays,
  filters,
  background,
  effects,
  fit = "contain",
  editable = false,
  selectedId = null,
  onSelect,
  onMove,
}: SceneCompositeProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgActive = !!background && background.mode !== "none";
  const faceActive = !!(effects?.beautify?.enabled || effects?.facePrivacy?.enabled);

  // FaceCompositor: aggiornato da useFaceEffects e passato a useSelfieSegmentation
  // per la pipeline rAF singola (un solo owner del canvas).
  const [faceCompositor, setFaceCompositor] = useState<FaceCompositor | null>(null);
  const handleFaceCompositorReady = useCallback(
    (compositor: FaceCompositor | null) => setFaceCompositor(compositor),
    [],
  );

  // Il canvas è attivo se lo sfondo AI o gli effetti viso sono abilitati.
  const canvasActive = bgActive || faceActive;

  useSelfieSegmentation({
    videoRef,
    canvasRef,
    background,
    active: canvasActive,
    faceCompositor,
  });

  useFaceEffects({
    videoRef,
    canvasRef,
    effects,
    active: faceActive,
    onReady: handleFaceCompositorReady,
  });

  const css = filterToCss(filters);
  const fitClass = fit === "cover" ? "object-cover" : "object-contain";

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full ${fitClass}`}
        style={{ filter: css }}
        aria-label="Sorgente creator"
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${fitClass}`}
        style={{ filter: css, display: canvasActive ? "block" : "none" }}
        aria-hidden="true"
      />
      <SceneOverlays
        overlays={overlays}
        editable={editable}
        selectedId={selectedId}
        onSelect={onSelect}
        onMove={onMove}
      />
    </>
  );
}
