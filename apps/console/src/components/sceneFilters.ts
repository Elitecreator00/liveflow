import type { SceneFilters } from "@liveflow/api-client";

/** Valori neutri (nessun effetto). */
export const FILTER_DEFAULTS: Required<Omit<SceneFilters, "preset">> = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
  invert: 0,
  hueRotate: 0,
  blur: 0,
};

/**
 * Converte i filtri in una stringa CSS `filter`. Stessa funzione usata nella
 * preview operatore e (in futuro) nella pagina scena renderizzata da LiveKit
 * Egress → WYSIWYG garantito.
 */
export function filterToCss(f?: SceneFilters): string {
  const v = { ...FILTER_DEFAULTS, ...(f ?? {}) };
  return [
    `brightness(${v.brightness}%)`,
    `contrast(${v.contrast}%)`,
    `saturate(${v.saturate}%)`,
    `grayscale(${v.grayscale}%)`,
    `sepia(${v.sepia}%)`,
    `invert(${v.invert}%)`,
    `hue-rotate(${v.hueRotate}deg)`,
    `blur(${v.blur}px)`,
  ].join(" ");
}

export interface FilterParam {
  key: keyof Omit<SceneFilters, "preset">;
  label: string;
  min: number;
  max: number;
  unit: string;
}

/** Parametri regolabili a slider. */
export const FILTER_PARAMS: FilterParam[] = [
  { key: "brightness", label: "Luminosità", min: 0, max: 200, unit: "%" },
  { key: "contrast", label: "Contrasto", min: 0, max: 200, unit: "%" },
  { key: "saturate", label: "Saturazione", min: 0, max: 200, unit: "%" },
  { key: "grayscale", label: "Bianco/Nero", min: 0, max: 100, unit: "%" },
  { key: "sepia", label: "Seppia", min: 0, max: 100, unit: "%" },
  { key: "hueRotate", label: "Tonalità", min: 0, max: 360, unit: "°" },
  { key: "invert", label: "Negativo", min: 0, max: 100, unit: "%" },
  { key: "blur", label: "Sfocatura", min: 0, max: 20, unit: "px" },
];

export interface FilterPreset {
  id: string;
  label: string;
  values: SceneFilters;
}

/** Preset "one-click" (combinazioni di filtri CSS, stile Instagram/TikTok). */
export const FILTER_PRESETS: FilterPreset[] = [
  { id: "none", label: "Nessuno", values: {} },
  { id: "bw", label: "B/N", values: { grayscale: 100, contrast: 110 } },
  { id: "noir", label: "Noir", values: { grayscale: 100, contrast: 150, brightness: 90 } },
  { id: "sepia", label: "Seppia", values: { sepia: 100 } },
  { id: "vintage", label: "Vintage", values: { sepia: 55, contrast: 95, brightness: 105, saturate: 120 } },
  { id: "warm", label: "Caldo", values: { hueRotate: 350, saturate: 130, brightness: 105 } },
  { id: "cold", label: "Freddo", values: { hueRotate: 200, saturate: 115 } },
  { id: "vivid", label: "Vivido", values: { saturate: 180, contrast: 115 } },
  { id: "dreamy", label: "Sognante", values: { blur: 2, brightness: 110, saturate: 120 } },
  { id: "dramatic", label: "Drammatico", values: { contrast: 160, brightness: 90, saturate: 120 } },
  { id: "fade", label: "Sbiadito", values: { contrast: 85, saturate: 80, brightness: 110 } },
  { id: "clarendon", label: "Clarendon", values: { contrast: 120, saturate: 135, brightness: 105 } },
  { id: "moon", label: "Moon", values: { grayscale: 100, brightness: 110, contrast: 110 } },
  { id: "psyche", label: "Psichedelico", values: { hueRotate: 180, saturate: 200, contrast: 120 } },
  { id: "negative", label: "Negativo", values: { invert: 100 } },
];

/** Risolve un preset in valori completi (default + override) + nome preset. */
export function applyPreset(preset: FilterPreset): SceneFilters {
  return { ...FILTER_DEFAULTS, ...preset.values, preset: preset.id };
}
