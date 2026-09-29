/**
 * faceCompositing.ts — Funzioni pure per il compositing degli effetti viso.
 *
 * ADR-0007 §2, step B.4. Calcolati lato nostro (MediaPipe Face Landmarker),
 * controllati dall'operatore. La creator pubblica il flusso grezzo ("device dumb").
 *
 * Le funzioni sono pure (testabili in isolamento con jsdom/canvas mock).
 * L'integrazione con MediaPipe (caricamento modello, rAF loop) è in useFaceEffects.ts.
 *
 * Parametri intensità → valori tecnici:
 *   beautify:    blurRadius = intensity * 0.06 (0–6px), glowOpacity = intensity * 0.002
 *   blur:        blurRadius = 2 + intensity * 0.3 (2–32px)
 *   pixelate:    pixelSize = 4 + Math.round(intensity * 0.2) (4–24px)
 */

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { SceneEffects } from "@liveflow/api-client";

// ── Tipo per il compositor (usato da useSelfieSegmentation come dipendenza) ──

/**
 * Interfaccia del compositor effetti viso. Implementata da useFaceEffects, iniettata
 * in useSelfieSegmentation come dipendenza opzionale (pipeline rAF singola).
 */
export interface FaceCompositor {
  /** Applica gli effetti viso correnti al canvas già composito (sfondo + creator). */
  applyToFrame(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    w: number,
    h: number,
  ): void;
}

// ── Helper path oval ──────────────────────────────────────────────────────────

/**
 * Indici dei landmark FACEMESH_FACE_OVAL (contorno esterno del volto).
 * Subset dei 478 landmark di Face Landmarker, ordinati per costruire un path chiuso.
 * Fonte: mediapipe/python/solutions/face_mesh_connections.py → FACEMESH_FACE_OVAL.
 */
export const FACE_OVAL_INDICES: readonly number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

/**
 * Costruisce un Path2D dal contorno del volto dato l'array di landmark.
 * Coordinate landmark: normalizzate 0–1 rispetto a (videoWidth, videoHeight).
 *
 * @param landmarks Array di NormalizedLandmark dal Face Landmarker (lunghezza 478).
 * @param w Larghezza canvas in px.
 * @param h Altezza canvas in px.
 * @returns Path2D chiuso del contorno volto, o null se i landmark sono vuoti.
 */
export function buildFaceOvalPath(
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
): Path2D | null {
  if (!landmarks || landmarks.length === 0) return null;

  const path = new Path2D();
  let first = true;
  for (const idx of FACE_OVAL_INDICES) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const x = lm.x * w;
    const y = lm.y * h;
    if (first) {
      path.moveTo(x, y);
      first = false;
    } else {
      path.lineTo(x, y);
    }
  }
  path.closePath();
  return path;
}

// ── Beautify ──────────────────────────────────────────────────────────────────

/**
 * Applica il ritocco pelle/glow al canvas, clippato al path del volto.
 *
 * Tecnica: blur gaussiano sul video ridisegnato nella regione viso (smoothing pelle)
 * + overlay additive a bassa opacità (glow).
 *
 * @param ctx Canvas 2D context (già composito sfondo + creator).
 * @param video Elemento video sorgente.
 * @param facePath Path2D del contorno viso.
 * @param intensity Intensità 0–100.
 * @param w Larghezza canvas.
 * @param h Altezza canvas.
 */
export function applyBeautify(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  facePath: Path2D,
  intensity: number,
  w: number,
  h: number,
): void {
  if (intensity <= 0) return;

  const blurRadius = intensity * 0.06; // 0–6px
  const glowOpacity = intensity * 0.002; // 0–0.2

  ctx.save();
  ctx.clip(facePath);

  // Pass 1 — smoothing pelle: blur sul video nella regione viso.
  ctx.filter = `blur(${blurRadius}px)`;
  ctx.globalAlpha = 0.6; // blend parziale per non appiattire i dettagli
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(video, 0, 0, w, h);
  ctx.filter = "none";
  ctx.globalAlpha = 1;

  // Pass 2 — glow: overlay bianco additivo a bassa opacità.
  if (glowOpacity > 0) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = glowOpacity;
    ctx.fillStyle = "#fff8f0"; // warm white
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

// ── Face blur ─────────────────────────────────────────────────────────────────

/**
 * Applica blur privacy al volto, clippato al path oval.
 *
 * @param ctx Canvas 2D context.
 * @param video Elemento video sorgente.
 * @param facePath Path2D del contorno viso.
 * @param intensity Intensità 0–100 → raggio 2–32px.
 * @param w Larghezza canvas.
 * @param h Altezza canvas.
 */
export function applyFaceBlur(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  facePath: Path2D,
  intensity: number,
  w: number,
  h: number,
): void {
  const blurRadius = 2 + intensity * 0.3; // 2–32px

  ctx.save();
  ctx.clip(facePath);
  ctx.filter = `blur(${blurRadius}px)`;
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(video, 0, 0, w, h);
  ctx.filter = "none";
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

// ── Face pixelate ─────────────────────────────────────────────────────────────

/**
 * Applica pixelatura al bounding box del volto.
 * Usa un canvas temporaneo offscreen: riduce la regione al pixelSize, poi scala
 * in su con imageSmoothingEnabled=false per l'effetto a "blocchi".
 *
 * @param ctx Canvas 2D context.
 * @param landmarks Array landmark per calcolare il bounding box.
 * @param intensity Intensità 0–100 → pixelSize 4–24px.
 * @param w Larghezza canvas.
 * @param h Altezza canvas.
 * @param facePath Path2D del contorno per clipping preciso.
 */
export function applyPixelate(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  intensity: number,
  w: number,
  h: number,
  facePath: Path2D,
): void {
  if (landmarks.length === 0) return;

  const pixelSize = 4 + Math.round(intensity * 0.2); // 4–24px

  // Calcola bounding box dal contorno oval.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const idx of FACE_OVAL_INDICES) {
    const lm = landmarks[idx];
    if (!lm) continue;
    const x = lm.x * w;
    const y = lm.y * h;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const rx = Math.max(0, Math.floor(minX));
  const ry = Math.max(0, Math.floor(minY));
  const rw = Math.min(w - rx, Math.ceil(maxX - minX));
  const rh = Math.min(h - ry, Math.ceil(maxY - minY));

  if (rw <= 0 || rh <= 0) return;

  // Canvas temporaneo ridotto per creare l'effetto pixel.
  const tmpW = Math.max(1, Math.ceil(rw / pixelSize));
  const tmpH = Math.max(1, Math.ceil(rh / pixelSize));
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = tmpW;
  tmpCanvas.height = tmpH;
  const tmpCtx = tmpCanvas.getContext("2d");
  if (!tmpCtx) return;

  // Riduce la regione nel canvas temporaneo.
  tmpCtx.drawImage(ctx.canvas, rx, ry, rw, rh, 0, 0, tmpW, tmpH);

  // Applica clip + pixel-art upscale al canvas principale.
  ctx.save();
  ctx.clip(facePath);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(tmpCanvas, 0, 0, tmpW, tmpH, rx, ry, rw, rh);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Applica tutti gli effetti viso attivi in sequenza sul canvas.
 * Unico punto di ingresso chiamato dal loop rAF (dopo la segmentazione sfondo).
 *
 * @param ctx Canvas 2D context.
 * @param video Elemento video sorgente.
 * @param landmarks Landmark Face Landmarker (478 punti, o array vuoto).
 * @param effects Stato effetti dal SceneState.
 * @param w Larghezza canvas.
 * @param h Altezza canvas.
 */
export function applyFaceEffects(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[],
  effects: SceneEffects,
  w: number,
  h: number,
): void {
  const hasBeautify = effects.beautify?.enabled && (effects.beautify.intensity ?? 0) > 0;
  const hasPrivacy = effects.facePrivacy?.enabled;

  if (!hasBeautify && !hasPrivacy) return;
  if (landmarks.length === 0) return;

  const facePath = buildFaceOvalPath(landmarks, w, h);
  if (!facePath) return;

  if (hasBeautify) {
    applyBeautify(ctx, video, facePath, effects.beautify!.intensity, w, h);
  }

  if (hasPrivacy && effects.facePrivacy) {
    const { mode, intensity } = effects.facePrivacy;
    if (mode === "blur") {
      applyFaceBlur(ctx, video, facePath, intensity, w, h);
    } else {
      applyPixelate(ctx, landmarks, intensity, w, h, facePath);
    }
  }
}
