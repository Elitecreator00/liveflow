"use client";

/**
 * useFaceEffects — Hook MediaPipe Face Landmarker per beautify + privacy volto.
 *
 * ADR-0007 §2, step B.4. Gira LATO NOSTRO (preview operatore + Egress).
 * La creator pubblica il flusso grezzo ("device dumb, cloud smart").
 *
 * Architettura pipeline singola rAF (override PM):
 *   Il hook NON ha un proprio requestAnimationFrame loop. Invece espone un
 *   FaceCompositor (tramite onReady callback) che useSelfieSegmentation invoca
 *   inline nel proprio rAF, garantendo ordine deterministico:
 *   (1) segmentazione sfondo → (2) effetti viso → commit. Zero double-rAF, zero flicker.
 *
 * Caricamento lazy: Face Landmarker viene inizializzato SOLO se `active` è true.
 * Quando tutti gli effetti sono disattivati, il modello non viene caricato.
 */

import { type RefObject, useEffect, useRef } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { SceneEffects } from "@liveflow/api-client";
import {
  type FaceCompositor,
  applyFaceEffects,
} from "./faceCompositing";

const WASM_BASE =
  process.env["NEXT_PUBLIC_MEDIAPIPE_WASM_BASE"] ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const FACE_MODEL_URL =
  process.env["NEXT_PUBLIC_FACE_MODEL_URL"] ??
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  effects?: SceneEffects;
  /** true quando almeno un effetto viso è enabled. */
  active: boolean;
  /** Callback invocata con il compositor pronto (o null se dismounted). */
  onReady: (compositor: FaceCompositor | null) => void;
}

export function useFaceEffects({
  videoRef,
  canvasRef,
  effects,
  active,
  onReady,
}: Options): void {
  // Ref sempre aggiornato → la funzione applyToFrame legge l'effetto corrente
  // senza richiedere il riavvio del hook a ogni cambio slider.
  const effectsRef = useRef<SceneEffects | undefined>(effects);
  effectsRef.current = effects;

  // Ultimi landmark disponibili (aggiornati dalla callback Face Landmarker).
  const landmarksRef = useRef<NormalizedLandmark[]>([]);

  // Ref per la callback onReady (stabile, evita cicli nell'effect).
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!active) {
      onReadyRef.current(null);
      return;
    }

    let cancelled = false;
    let landmarker: import("@mediapipe/tasks-vision").FaceLandmarker | null = null;
    let rafId = 0;

    // Il compositor è un oggetto con un metodo applyToFrame che useSelfieSegmentation
    // chiama inline nel proprio rAF (pipeline singola).
    const compositor: FaceCompositor = {
      applyToFrame(
        ctx: CanvasRenderingContext2D,
        video: HTMLVideoElement,
        w: number,
        h: number,
      ): void {
        const eff = effectsRef.current;
        const lms = landmarksRef.current;
        if (!eff || lms.length === 0) return;
        applyFaceEffects(ctx, video, lms, eff, w, h);
      },
    };

    (async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import(
          "@mediapipe/tasks-vision"
        );
        if (cancelled) return;

        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        if (cancelled) return;

        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        if (cancelled) {
          landmarker.close();
          landmarker = null;
          return;
        }

        // Notifica il chiamante che il compositor è pronto.
        // Ricontrolla `cancelled`: tra createFromOptions e qui l'effect potrebbe
        // essere stato smontato (es. toggle rapido) → non depositare un compositor
        // stale nello stato di SceneComposite.
        if (cancelled) {
          landmarker.close();
          landmarker = null;
          return;
        }
        onReadyRef.current(compositor);

        // Loop rAF separato SOLO per aggiornare i landmark (lettura Face Landmarker).
        // Non scrive mai sul canvas: il commit avviene nel rAF di useSelfieSegmentation.
        const loop = (): void => {
          if (cancelled) return;
          const video = videoRef.current;
          if (landmarker && video && video.readyState >= 2 && video.videoWidth > 0) {
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              landmarksRef.current = result.faceLandmarks[0] ?? [];
            } catch {
              // frame saltato — mantieni ultimi landmark
            }
          }
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      } catch {
        // Init Face Landmarker fallita (wasm/modello irraggiungibile) → no effetti.
        onReadyRef.current(null);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      landmarker?.close();
      landmarker = null;
      landmarksRef.current = [];
      onReadyRef.current(null);
    };
  }, [active, videoRef, canvasRef]);
}
