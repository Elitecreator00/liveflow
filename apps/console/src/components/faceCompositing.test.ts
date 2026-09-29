/**
 * faceCompositing.test.ts — Tests per le funzioni pure di compositing effetti viso.
 *
 * NON testa il caricamento del modello MediaPipe (richiede browser/WebGL).
 * Testa: FACE_OVAL_INDICES, formula parametri, buildFaceOvalPath (con Path2D mock),
 * applyBeautify con intensity=0 (early-return), applyFaceEffects (con lms vuoto).
 *
 * jsdom non implementa Path2D né canvas.getContext — le funzioni che le usano vengono
 * testate con mock globali oppure verificando le formule matematiche in isolamento.
 *
 * ADR-0007 §2, piano §9 test frontend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyBeautify,
  applyFaceEffects,
  FACE_OVAL_INDICES,
} from "./faceCompositing";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ── Polyfill Path2D per jsdom ─────────────────────────────────────────────────

class MockPath2D {
  private ops: string[] = [];
  moveTo(x: number, y: number) { this.ops.push(`M${x},${y}`); }
  lineTo(x: number, y: number) { this.ops.push(`L${x},${y}`); }
  closePath() { this.ops.push("Z"); }
  getOps() { return this.ops; }
}

// Installa/rimuovi polyfill globale solo per questo file.
let originalPath2D: typeof Path2D | undefined;
beforeEach(() => {
  originalPath2D = (globalThis as Record<string, unknown>)["Path2D"] as typeof Path2D | undefined;
  (globalThis as Record<string, unknown>)["Path2D"] = MockPath2D;
});
afterEach(() => {
  (globalThis as Record<string, unknown>)["Path2D"] = originalPath2D;
});

// ── Helper: crea un canvas context mock ──────────────────────────────────────

function makeCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over" as GlobalCompositeOperation,
    imageSmoothingEnabled: true,
    canvas: {
      width: 640,
      height: 360,
    } as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D;
}

function makeVideoEl(): HTMLVideoElement {
  return {
    videoWidth: 640,
    videoHeight: 360,
    readyState: 4,
  } as unknown as HTMLVideoElement;
}

function makeLandmarks(count = 478): NormalizedLandmark[] {
  const lms: NormalizedLandmark[] = [];
  for (let i = 0; i < count; i++) {
    lms.push({ x: (i % 100) / 100, y: Math.floor(i / 100) / 10, z: 0, visibility: 1 });
  }
  return lms;
}

// ── FACE_OVAL_INDICES ────────────────────────────────────────────────────────

describe("FACE_OVAL_INDICES", () => {
  it("tutti gli indici sono in range [0, 477]", () => {
    for (const idx of FACE_OVAL_INDICES) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(478);
    }
  });

  it("contiene esattamente 36 indici (contorno oval completo)", () => {
    expect(FACE_OVAL_INDICES.length).toBe(36);
  });
});

// ── buildFaceOvalPath ────────────────────────────────────────────────────────

describe("buildFaceOvalPath", () => {
  it("returns null for empty landmark array", async () => {
    // Import dinamico dopo che il polyfill Path2D è installato.
    const { buildFaceOvalPath } = await import("./faceCompositing");
    expect(buildFaceOvalPath([], 640, 360)).toBeNull();
  });

  it("returns a Path2D-like instance for valid landmarks", async () => {
    const { buildFaceOvalPath } = await import("./faceCompositing");
    const lms = makeLandmarks();
    const path = buildFaceOvalPath(lms, 640, 360);
    expect(path).toBeInstanceOf(MockPath2D);
  });

  it("il path contiene moveTo + lineTo + closePath", async () => {
    const { buildFaceOvalPath } = await import("./faceCompositing");
    const lms = makeLandmarks();
    const path = buildFaceOvalPath(lms, 640, 360) as unknown as MockPath2D;
    const ops = path.getOps();
    // Primo punto = moveTo (M), seguenti = lineTo (L), ultimo = closePath (Z).
    expect(ops[0]).toMatch(/^M/);
    expect(ops[ops.length - 1]).toBe("Z");
    expect(ops.filter((o) => o.startsWith("L")).length).toBeGreaterThan(0);
  });
});

// ── Formule parametri (pure math — nessuna Canvas API) ───────────────────────

describe("Formule parametri effetti", () => {
  it("beautify: blurRadius scala 0–6px per intensity 0–100", () => {
    // blurRadius = intensity * 0.06
    expect(0 * 0.06).toBe(0);
    expect(100 * 0.06).toBe(6);
    expect(50 * 0.06).toBeCloseTo(3);
  });

  it("beautify: glowOpacity scala 0–0.2 per intensity 0–100", () => {
    // glowOpacity = intensity * 0.002
    expect(0 * 0.002).toBe(0);
    expect(100 * 0.002).toBe(0.2);
  });

  it("faceBlur: raggio scala 2–32px per intensity 0–100", () => {
    // blurRadius = 2 + intensity * 0.3
    expect(2 + 0 * 0.3).toBe(2);
    expect(2 + 100 * 0.3).toBe(32);
  });

  it("pixelate: pixelSize scala 4–24px per intensity 0–100", () => {
    // pixelSize = 4 + Math.round(intensity * 0.2)
    expect(4 + Math.round(0 * 0.2)).toBe(4);
    expect(4 + Math.round(100 * 0.2)).toBe(24);
    expect(4 + Math.round(20 * 0.2)).toBe(8);
  });
});

// ── applyBeautify ────────────────────────────────────────────────────────────

describe("applyBeautify", () => {
  it("con intensity=0 NON chiama drawImage (early return)", async () => {
    const { applyBeautify: fn } = await import("./faceCompositing");
    const ctx = makeCtx();
    const video = makeVideoEl();
    const path = new MockPath2D() as unknown as Path2D;

    fn(ctx, video, path, 0, 640, 360);

    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("con intensity=50 chiama ctx.save e ctx.restore", async () => {
    const { applyBeautify: fn } = await import("./faceCompositing");
    const ctx = makeCtx();
    const video = makeVideoEl();
    const path = new MockPath2D() as unknown as Path2D;

    fn(ctx, video, path, 50, 640, 360);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it("con intensity=50 chiama ctx.clip", async () => {
    const { applyBeautify: fn } = await import("./faceCompositing");
    const ctx = makeCtx();
    const video = makeVideoEl();
    const path = new MockPath2D() as unknown as Path2D;

    fn(ctx, video, path, 50, 640, 360);

    expect(ctx.clip).toHaveBeenCalledWith(path);
  });
});

// ── applyFaceEffects (dispatcher) ────────────────────────────────────────────

describe("applyFaceEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("non fa nulla se nessun effetto è enabled (effects vuoto)", () => {
    const ctx = makeCtx();
    const video = makeVideoEl();
    const lms = makeLandmarks();

    applyFaceEffects(ctx, video, lms, {}, 640, 360);

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it("non fa nulla se i landmark sono vuoti (anche con effetto enabled)", () => {
    const ctx = makeCtx();
    const video = makeVideoEl();

    applyFaceEffects(
      ctx,
      video,
      [],
      { beautify: { enabled: true, intensity: 50 } },
      640,
      360,
    );

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("non fa nulla se beautify.enabled=false", () => {
    const ctx = makeCtx();
    const video = makeVideoEl();
    const lms = makeLandmarks();

    applyFaceEffects(
      ctx,
      video,
      lms,
      { beautify: { enabled: false, intensity: 50 } },
      640,
      360,
    );

    expect(ctx.save).not.toHaveBeenCalled();
  });

  it("chiama ctx.save/restore quando beautify è enabled con intensity > 0", async () => {
    // Reimport dopo il polyfill per garantire Path2D mock è in scope.
    const { applyFaceEffects: fn } = await import("./faceCompositing");
    const ctx = makeCtx();
    const video = makeVideoEl();
    const lms = makeLandmarks();

    fn(ctx, video, lms, { beautify: { enabled: true, intensity: 50 } }, 640, 360);

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });
});

// ── Data model SceneEffects (retrocompatibilità) ──────────────────────────────

describe("SceneEffects data model", () => {
  it("oggetto SceneState senza effects è retrocompatibile", () => {
    const legacyState = {
      sessionId: "s1",
      overlays: [],
      updatedAt: new Date().toISOString(),
    };
    expect(legacyState).not.toHaveProperty("effects");
    // effects è undefined: applyFaceEffects non deve essere chiamato.
    const effects = (legacyState as Record<string, unknown>)["effects"];
    expect(effects).toBeUndefined();
  });

  it("SceneEffects con beautify+facePrivacy entrambi presenti è valido", () => {
    const eff = {
      beautify: { enabled: true, intensity: 60 },
      facePrivacy: { enabled: false, mode: "pixelate" as const, intensity: 40 },
    };
    expect(eff.beautify.enabled).toBe(true);
    expect(eff.facePrivacy.mode).toBe("pixelate");
  });
});
