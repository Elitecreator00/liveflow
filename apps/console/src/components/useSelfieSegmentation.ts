"use client";

/**
 * Segmentazione persona (MediaPipe Selfie Segmentation) — step B.3, ADR-0007 §1.
 *
 * Gira LATO NOSTRO (preview operatore + pagina-scena renderizzata dall'Egress),
 * MAI sul device della creator ("device dumb, cloud smart"). Legge i frame dal
 * `<video>` sorgente (LiveKit subscribe) e disegna su `<canvas>` la creator
 * scontornata sopra uno sfondo sfocato o un'immagine, in base allo `SceneState`
 * impostato dall'operatore.
 *
 * WYSIWYG: lo stesso hook/canvas è usato in editor e render → identica resa.
 *
 * Costo: zero licenza (MediaPipe Apache 2.0). Il modello/wasm sono asset statici
 * (default da CDN jsDelivr — solo asset, NESSUN dato video esce). Per il self-host
 * offline impostare NEXT_PUBLIC_MEDIAPIPE_WASM_BASE + NEXT_PUBLIC_SELFIE_MODEL_URL.
 *
 * Miglioramenti qualità (piano §2):
 * - Modello landscape (16:9 nativo) — migliore per video orizzontale.
 * - Feathering maschera (MASK_FEATHER_PX) — bordi morbidi via ctx.filter blur.
 * - Smoothing temporale (TEMPORAL_ALPHA) — anti-flicker via blend frame-precedente.
 * - Buffer Float32Array riusato — evita GC pressure a 30fps.
 */

import { type RefObject, useEffect, useRef } from "react";
import type { SceneBackground } from "@liveflow/api-client";
import type { FaceCompositor } from "./faceCompositing";

/** Raggio di blur applicato alla maschera alpha per ammorbidire i bordi (px). */
const MASK_FEATHER_PX = 2;

/**
 * Peso del frame corrente nel blend temporale (0–1).
 * 0.7 = 70% frame corrente + 30% precedente → buon compromesso anti-flicker/lag.
 */
const TEMPORAL_ALPHA = 0.7;

const WASM_BASE =
  process.env["NEXT_PUBLIC_MEDIAPIPE_WASM_BASE"] ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

/**
 * Modello landscape (144×256, 16:9 nativo): migliore per video orizzontale e
 * bordi capelli rispetto al selfie_segmenter verticale (256×256).
 */
const MODEL_URL =
  process.env["NEXT_PUBLIC_SELFIE_MODEL_URL"] ??
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

interface Options {
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
  background?: SceneBackground;
  /** true quando uno sfondo AI è attivo (mode 'blur' | 'image'). */
  active: boolean;
  /**
   * Compositor effetti viso opzionale (ADR-0007 §2 B.4).
   * Se presente, viene invocato DOPO la segmentazione sfondo nello stesso frame
   * (pipeline a rAF singolo — no double-rAF, no flicker).
   */
  faceCompositor?: FaceCompositor | null;
}

/** Disegna lo sfondo immagine in "cover" (riempie il canvas mantenendo le proporzioni). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  w: number,
  h: number,
  iw: number,
  ih: number,
): void {
  const ir = iw / ih;
  const cr = w / h;
  let dw = w;
  let dh = h;
  let dx = 0;
  let dy = 0;
  if (ir > cr) {
    dh = h;
    dw = h * ir;
    dx = (w - dw) / 2;
  } else {
    dw = w;
    dh = w / ir;
    dy = (h - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function useSelfieSegmentation({
  videoRef,
  canvasRef,
  background,
  active,
  faceCompositor = null,
}: Options): void {
  // Ref sempre allineato → il loop legge i parametri correnti senza ri-avviarsi
  // a ogni cambio di slider (evita di re-inizializzare il segmenter MediaPipe).
  const bgRef = useRef<SceneBackground | undefined>(background);
  bgRef.current = background;

  // Ref allineato al faceCompositor corrente.
  const faceCompositorRef = useRef<FaceCompositor | null>(faceCompositor ?? null);
  faceCompositorRef.current = faceCompositor ?? null;

  // Pre-carica l'immagine di sfondo quando cambia l'URL.
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const url = background?.mode === "image" ? background.imageUrl : undefined;
    if (!url) {
      bgImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      bgImageRef.current = img;
    };
    img.onerror = () => {
      bgImageRef.current = null;
    };
    img.src = url;
  }, [background?.mode, background?.imageUrl]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let raf = 0;
    let segmenter: import("@mediapipe/tasks-vision").ImageSegmenter | null = null;
    const maskCanvas = document.createElement("canvas");

    // Buffer riusato per lo smoothing temporale (evita allocazione GC per frame).
    let prevMask: Float32Array | null = null;
    // Buffer blended allocato una volta e aggiornato in-place.
    let blendedBuffer: Float32Array | null = null;

    const draw = (
      result: import("@mediapipe/tasks-vision").ImageSegmenterResult,
    ): void => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!video || !canvas || !ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const mask = result.confidenceMasks?.[0];

      // Senza maschera valida: passthrough del video grezzo.
      if (!mask) {
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(video, 0, 0, w, h);
        // Effetti viso anche su fallback passthrough (pipeline singola).
        faceCompositorRef.current?.applyToFrame(ctx, video, w, h);
        return;
      }

      // ── Smoothing temporale ───────────────────────────────────────────────
      const rawData = mask.getAsFloat32Array();
      const len = rawData.length;

      // Alloca buffer la prima volta o se le dimensioni cambiano.
      if (!blendedBuffer || blendedBuffer.length !== len) {
        blendedBuffer = new Float32Array(len);
      }

      if (prevMask && prevMask.length === len) {
        // Blend: alpha_blended = TEMPORAL_ALPHA * current + (1-TEMPORAL_ALPHA) * prev
        for (let i = 0; i < len; i++) {
          blendedBuffer[i] =
            TEMPORAL_ALPHA * (rawData[i] ?? 0) +
            (1 - TEMPORAL_ALPHA) * (prevMask[i] ?? 0);
        }
      } else {
        blendedBuffer.set(rawData);
      }

      // Aggiorna prevMask (copia per il frame successivo).
      if (!prevMask || prevMask.length !== len) {
        prevMask = new Float32Array(len);
      }
      prevMask.set(blendedBuffer);

      // ── Scrittura maschera su maskCanvas ─────────────────────────────────
      const mw = mask.width;
      const mh = mask.height;
      maskCanvas.width = mw;
      maskCanvas.height = mh;
      const mctx = maskCanvas.getContext("2d");
      if (mctx) {
        const imgData = mctx.createImageData(mw, mh);
        for (let i = 0; i < blendedBuffer.length; i++) {
          const a = (blendedBuffer[i] ?? 0) * 255;
          const o = i * 4;
          imgData.data[o] = 255;
          imgData.data[o + 1] = 255;
          imgData.data[o + 2] = 255;
          imgData.data[o + 3] = a;
        }
        mctx.putImageData(imgData, 0, 0);
      }

      const bg = bgRef.current;
      ctx.save();
      ctx.clearRect(0, 0, w, h);

      // 1) Persona nitida: disegna il video, poi tieni solo dove la maschera è opaca.
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(video, 0, 0, w, h);

      // Feathering: applica blur al maskCanvas durante la composizione destination-in,
      // producendo bordi morbidi senza artefatti. Compatible Chrome/Chromium (Egress).
      ctx.filter = `blur(${MASK_FEATHER_PX}px)`;
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(maskCanvas, 0, 0, w, h);
      ctx.filter = "none";

      // 2) Sfondo DIETRO la persona.
      ctx.globalCompositeOperation = "destination-over";
      const bgImage = bgImageRef.current;
      if (bg?.mode === "image" && bgImage) {
        drawCover(ctx, bgImage, w, h, bgImage.naturalWidth, bgImage.naturalHeight);
      } else {
        // Sfocatura: disegna il video sfocato leggermente oltre i bordi così la
        // sfocatura non lascia un alone trasparente sul perimetro.
        const blurPx = Math.max(1, bg?.blur ?? 12);
        const ov = blurPx * 2;
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(video, -ov, -ov, w + ov * 2, h + ov * 2);
        ctx.filter = "none";
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";

      // 3) Effetti viso (pipeline singola rAF — passo sequenziale dopo lo sfondo).
      faceCompositorRef.current?.applyToFrame(ctx, video, w, h);
    };

    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import(
          "@mediapipe/tasks-vision"
        );
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        if (cancelled) return;
        segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          outputCategoryMask: false,
          outputConfidenceMasks: true,
        });
        if (cancelled) {
          segmenter.close();
          segmenter = null;
          return;
        }

        const loop = (): void => {
          if (cancelled) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (
            segmenter &&
            video &&
            canvas &&
            video.readyState >= 2 &&
            video.videoWidth > 0
          ) {
            if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
            if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
            try {
              segmenter.segmentForVideo(video, performance.now(), (result) => {
                if (!cancelled) draw(result);
                result.close();
              });
            } catch {
              /* frame saltato (es. video non pronto) → riprova al prossimo rAF */
            }
          }
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      } catch {
        /* init MediaPipe fallita (wasm/modello irraggiungibili) → resta il video grezzo */
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      segmenter?.close();
      segmenter = null;
      prevMask = null;
      blendedBuffer = null;
    };
  }, [active, videoRef, canvasRef]);
}
