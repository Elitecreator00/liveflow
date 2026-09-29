// Traduce la SCENA dello Studio (overlay + filtri, gli stessi che l'operatore
// vede nella preview) in un filtergraph FFmpeg, applicato dall'ingestor mentre
// riversa la sorgente nella webcam virtuale della stanza.
//
// PERCHÉ QUI: la strada "ufficiale" per il compositing è LiveKit Egress, cioè un
// Chrome headless che renderizza la pagina-scena e ri-codifica in RTMP. Ottimo
// per lo stream verso le piattaforme, pessimo per la stanza browser: aggiunge
// secondi di latenza a un percorso che deve restare reattivo. FFmpeg sta già nel
// percorso e questi filtri gli costano quasi nulla.
//
// I valori arrivano dalle stesse strutture usate dalla preview (CSS `filter`),
// quindi la conversione è CSS → FFmpeg: 100% = neutro per brightness, contrast e
// saturate; 0 per il resto.

/** Font di sistema: normale e grassetto. */
const FONT_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

/** Colore accettabile per FFmpeg: #rgb/#rrggbb(aa) o un nome semplice. */
function safeColor(value, fallback) {
  const v = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
  if (/^[a-zA-Z]{3,20}$/.test(v)) return v.toLowerCase();
  // rgba(...) e simili non sono sintassi FFmpeg: si ricade sul default.
  return fallback;
}

function clamp(v, min, max, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Numero pulito per il filtergraph (niente notazione esponenziale). */
function num(n) {
  return Number(n.toFixed(4)).toString();
}

/**
 * Filtri colore: CSS `filter` → catena FFmpeg.
 * Le percentuali CSS (100 = neutro) diventano moltiplicatori; grayscale entra
 * come riduzione di saturazione, così si combina con `saturate` invece di
 * annullarlo.
 */
export function buildColorFilters(filters = {}) {
  const out = [];

  const brightness = clamp(filters.brightness ?? 100, 0, 300, 100);
  const contrast = clamp(filters.contrast ?? 100, 0, 300, 100);
  const saturate = clamp(filters.saturate ?? 100, 0, 300, 100);
  const grayscale = clamp(filters.grayscale ?? 0, 0, 100);

  // FFmpeg: brightness additivo (-1..1, 0 neutro), contrast/saturation
  // moltiplicativi (1 neutro).
  const eqParts = [];
  if (brightness !== 100) {
    eqParts.push(`brightness=${num(clamp((brightness - 100) / 100, -1, 1))}`);
  }
  if (contrast !== 100) eqParts.push(`contrast=${num(contrast / 100)}`);

  const saturation = (saturate / 100) * (1 - grayscale / 100);
  if (saturate !== 100 || grayscale > 0) {
    eqParts.push(`saturation=${num(clamp(saturation, 0, 3))}`);
  }
  if (eqParts.length) out.push(`eq=${eqParts.join(':')}`);

  const hueRotate = clamp(filters.hueRotate ?? 0, 0, 360);
  if (hueRotate > 0) out.push(`hue=h=${num(hueRotate)}`);

  const blur = clamp(filters.blur ?? 0, 0, 20);
  if (blur > 0) out.push(`gblur=sigma=${num(blur)}`);

  // invert e sepia in CSS sono graduali; in FFmpeg gli equivalenti diretti sono
  // tutto-o-niente, quindi si applicano oltre la metà.
  if (clamp(filters.invert ?? 0, 0, 100) >= 50) out.push('negate');
  if (clamp(filters.sepia ?? 0, 0, 100) >= 50) {
    out.push(
      'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
    );
  }

  return out;
}

/**
 * Overlay di testo → `drawtext`.
 *
 * Il testo NON viene messo nel filtergraph ma in un file (`textfile=`): così
 * apici, due punti e percentuali non possono rompere il comando né iniettarci
 * dentro altri filtri. Chi chiama deve scrivere i file restituiti.
 *
 * Posizioni e dimensioni della scena sono in percentuale, quindi valgono
 * identiche a qualsiasi risoluzione.
 */
export function buildTextOverlays(overlays = [], { width, height, textFileFor }) {
  const filters = [];
  const files = [];

  const visible = overlays
    .filter((o) => o && o.visible !== false && o.type === 'text' && String(o.text ?? '').trim())
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));

  visible.forEach((o, index) => {
    const path = textFileFor(index);
    files.push({ path, content: String(o.text) });

    // fontSize è in % della larghezza: scala con il video, come nella preview.
    const fontSize = Math.max(8, Math.round((clamp(o.fontSize ?? 4, 0.5, 30, 4) / 100) * width));
    const x = Math.round((clamp(o.x ?? 0, 0, 100) / 100) * width);
    const y = Math.round((clamp(o.y ?? 0, 0, 100) / 100) * height);
    const bold = /^(bold|[6-9]00)$/i.test(String(o.fontWeight ?? ''));

    const parts = [
      `textfile=${path}`,
      // reload=1: FFmpeg rilegge il file a ogni frame, così cambiare una scritta
      // non richiede di riavviarlo (niente stacco per chi sta guardando).
      'reload=1',
      `fontfile=${bold ? FONT_BOLD : FONT_REGULAR}`,
      `fontsize=${fontSize}`,
      `fontcolor=${safeColor(o.color, 'white')}`,
      `x=${x}`,
      `y=${y}`,
    ];

    const box = safeColor(o.background, null);
    if (box) {
      parts.push('box=1', `boxcolor=${box}`, `boxborderw=${Math.round(fontSize / 4)}`);
    }
    filters.push(`drawtext=${parts.join(':')}`);
  });

  return { filters, files };
}

/**
 * Filtergraph completo per l'ingestor.
 *
 * Ordine: specchio → scala all'uscita fissa → colore → testi. Lo specchio va per
 * primo perché è più economico su un frame piccolo; i testi per ultimi, così non
 * vengono ribaltati né sfocati insieme all'immagine.
 */
export function buildFilterChain({ scene = {}, mirror = false, width, height, textFileFor }) {
  const chain = [];
  if (mirror) chain.push('hflip');
  chain.push(`scale=${width}:${height}`);
  chain.push(...buildColorFilters(scene.filters));

  const { filters, files } = buildTextOverlays(scene.overlays, {
    width,
    height,
    textFileFor,
  });
  chain.push(...filters);

  return { chain: chain.join(','), files };
}

/**
 * Firma della scena ESCLUSO il contenuto dei testi.
 *
 * Se cambia solo il testo di un overlay basta riscrivere il file che `drawtext`
 * rilegge (reload=1): FFmpeg non va riavviato e chi guarda non vede nessuno
 * stacco. Se cambia la forma (filtri, posizioni, stili, quanti overlay) il
 * filtergraph è diverso e il riavvio è inevitabile.
 */
export function sceneShapeKey(scene = {}) {
  const overlays = (scene.overlays ?? [])
    .filter((o) => o && o.visible !== false && o.type === 'text' && String(o.text ?? '').trim())
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
    .map((o) => [o.x, o.y, o.fontSize, o.color, o.background, o.fontWeight].join('|'));
  return JSON.stringify([scene.filters ?? {}, overlays]);
}
