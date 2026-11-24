// Test della traduzione scena → filtergraph FFmpeg.
//   node --test tools/browser-farm/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildColorFilters,
  buildTextOverlays,
  buildFilterChain,
  sceneShapeKey,
  fitFilters,
  outputSizeFor,
  LANDSCAPE,
  PORTRAIT,
} from './scene-filters.mjs';

const textFileFor = (i) => `/tmp/t${i}.txt`;
const SIZE = { width: 1280, height: 720, textFileFor };

test('senza filtri non aggiunge nulla alla catena', () => {
  assert.deepEqual(buildColorFilters({}), []);
  // I valori neutri della UI non devono generare filtri inutili.
  assert.deepEqual(
    buildColorFilters({ brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }),
    [],
  );
});

test('converte le percentuali CSS nei moltiplicatori FFmpeg', () => {
  const out = buildColorFilters({ brightness: 150, contrast: 120, saturate: 80 });
  assert.equal(out.length, 1);
  assert.match(out[0], /^eq=/);
  assert.match(out[0], /brightness=0\.5/); // CSS 150% → +0.5 additivo
  assert.match(out[0], /contrast=1\.2/);
  assert.match(out[0], /saturation=0\.8/);
});

test('grayscale riduce la saturazione invece di annullare saturate', () => {
  const full = buildColorFilters({ grayscale: 100 });
  assert.match(full[0], /saturation=0/);
  const half = buildColorFilters({ saturate: 200, grayscale: 50 });
  assert.match(half[0], /saturation=1/); // 2.0 × (1 − 0.5)
});

test('hue, blur, invert e sepia entrano solo quando servono', () => {
  assert.deepEqual(buildColorFilters({ hueRotate: 90 }), ['hue=h=90']);
  assert.deepEqual(buildColorFilters({ blur: 3 }), ['gblur=sigma=3']);
  assert.deepEqual(buildColorFilters({ invert: 80 }), ['negate']);
  assert.deepEqual(buildColorFilters({ invert: 20 }), []); // sotto metà: ignorato
  assert.equal(buildColorFilters({ sepia: 100 }).length, 1);
});

test('ignora valori fuori scala invece di produrre un filtergraph rotto', () => {
  const out = buildColorFilters({ brightness: 99999, contrast: -50, saturate: 'x' });
  assert.match(out[0], /brightness=1\b/); // limitato a +1
  assert.match(out[0], /contrast=0/);
  assert.doesNotMatch(out[0], /NaN/);
});

test('il testo va in un file, mai dentro il filtergraph', () => {
  const { filters, files } = buildTextOverlays(
    [{ id: 'a', type: 'text', text: "L'offerta: 50% ora", x: 10, y: 20, width: 30, visible: true }],
    SIZE,
  );
  assert.equal(files.length, 1);
  assert.equal(files[0].content, "L'offerta: 50% ora");
  // Apici, due punti e percentuali romperebbero il comando: non devono comparire.
  assert.match(filters[0], /textfile=\/tmp\/t0\.txt/);
  assert.doesNotMatch(filters[0], /L'offerta/);
});

test('posizione e corpo del testo seguono le percentuali della scena', () => {
  const { filters } = buildTextOverlays(
    [{ id: 'a', type: 'text', text: 'ciao', x: 50, y: 25, fontSize: 10, visible: true }],
    SIZE,
  );
  assert.match(filters[0], /x=640/); // 50% di 1280
  assert.match(filters[0], /y=180/); // 25% di 720
  assert.match(filters[0], /fontsize=128/); // 10% della larghezza
});

test('salta gli overlay nascosti, vuoti o non testuali', () => {
  const { filters } = buildTextOverlays(
    [
      { id: 'a', type: 'text', text: 'nascosto', visible: false },
      { id: 'b', type: 'text', text: '   ', visible: true },
      { id: 'c', type: 'image', url: 'http://x/y.png', visible: true },
    ],
    SIZE,
  );
  assert.deepEqual(filters, []);
});

test('rifiuta colori che FFmpeg non capisce', () => {
  const { filters } = buildTextOverlays(
    [
      {
        id: 'a',
        type: 'text',
        text: 'x',
        color: 'rgba(255,0,0,0.5)',
        background: '#00000080',
        visible: true,
      },
    ],
    SIZE,
  );
  assert.match(filters[0], /fontcolor=white/); // rgba() → default
  assert.match(filters[0], /boxcolor=#00000080/); // esadecimale: valido
});

test('ordina gli overlay per z', () => {
  const { files } = buildTextOverlays(
    [
      { id: 'a', type: 'text', text: 'sopra', z: 5, visible: true },
      { id: 'b', type: 'text', text: 'sotto', z: 1, visible: true },
    ],
    SIZE,
  );
  assert.deepEqual(files.map((f) => f.content), ['sotto', 'sopra']);
});

test('catena completa: specchio, scala, colore e testi in ordine', () => {
  const { chain } = buildFilterChain({
    scene: { filters: { brightness: 120 }, overlays: [{ id: 'a', type: 'text', text: 'x', visible: true }] },
    mirror: true,
    ...SIZE,
  });
  const parts = chain.split(',');
  assert.equal(parts[0], 'hflip'); // prima: costa meno sul frame piccolo
  assert.match(parts[1], /^scale=1280:720:force_original_aspect_ratio=decrease/);
  assert.match(chain, /eq=brightness/);
  // Il testo non deve essere ribaltato insieme all'immagine.
  assert.ok(chain.indexOf('drawtext') > chain.indexOf('hflip'));
});

test('senza scena resta il solo adattamento al formato', () => {
  const { chain, files } = buildFilterChain({ mirror: false, ...SIZE });
  assert.equal(chain, fitFilters(1280, 720).join(','));
  assert.deepEqual(files, []);
});

test('la sorgente non viene mai deformata: scala proporzionale + bande', () => {
  const [scale, pad] = fitFilters(1280, 720);
  // Senza force_original_aspect_ratio un 360x640 veniva stirato a 1280x720.
  assert.match(scale, /force_original_aspect_ratio=decrease/);
  assert.match(scale, /force_divisible_by=2/); // yuv420p vuole dimensioni pari
  assert.equal(pad, 'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black');
});

test('telefono in verticale → webcam verticale; PC → orizzontale', () => {
  assert.deepEqual(outputSizeFor(360, 640), PORTRAIT);
  assert.deepEqual(outputSizeFor(720, 1280), PORTRAIT);
  assert.deepEqual(outputSizeFor(1280, 720), LANDSCAPE);
  assert.deepEqual(outputSizeFor(640, 480), LANDSCAPE); // webcam 4:3
  assert.deepEqual(outputSizeFor(720, 720), LANDSCAPE); // quadrato: default PC
});

test('in verticale anche la catena usa il formato verticale', () => {
  const { chain } = buildFilterChain({ ...PORTRAIT, textFileFor });
  assert.match(chain, /^scale=720:1280:/);
  assert.match(chain, /pad=720:1280:/);
});

test('cambiare solo il testo non cambia la forma della scena', () => {
  // Serve a decidere se FFmpeg va riavviato: se cambia solo il contenuto, no.
  const a = { overlays: [{ id: 'a', type: 'text', text: 'ciao', x: 10, y: 20, visible: true }] };
  const b = { overlays: [{ id: 'a', type: 'text', text: 'buonasera', x: 10, y: 20, visible: true }] };
  assert.equal(sceneShapeKey(a), sceneShapeKey(b));
});

test('spostare, ristilare o aggiungere overlay cambia la forma', () => {
  const base = { overlays: [{ id: 'a', type: 'text', text: 'x', x: 10, y: 20, visible: true }] };
  const moved = { overlays: [{ id: 'a', type: 'text', text: 'x', x: 40, y: 20, visible: true }] };
  const restyled = { overlays: [{ id: 'a', type: 'text', text: 'x', x: 10, y: 20, color: 'red', visible: true }] };
  const added = {
    overlays: [
      { id: 'a', type: 'text', text: 'x', x: 10, y: 20, visible: true },
      { id: 'b', type: 'text', text: 'y', x: 50, y: 50, visible: true },
    ],
  };
  assert.notEqual(sceneShapeKey(base), sceneShapeKey(moved));
  assert.notEqual(sceneShapeKey(base), sceneShapeKey(restyled));
  assert.notEqual(sceneShapeKey(base), sceneShapeKey(added));
});

test('anche un filtro diverso cambia la forma', () => {
  assert.notEqual(
    sceneShapeKey({ filters: { brightness: 100 } }),
    sceneShapeKey({ filters: { brightness: 130 } }),
  );
});

test('drawtext rilegge il file a ogni frame', () => {
  const { filters } = buildTextOverlays(
    [{ id: 'a', type: 'text', text: 'x', visible: true }],
    SIZE,
  );
  assert.match(filters[0], /reload=1/);
});
