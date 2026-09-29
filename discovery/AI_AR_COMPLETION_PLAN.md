# AI/AR Completion Plan — Layer Client-Side dello Studio Live

**Stato**: Piano tecnico per il coder — ADR-0007 §1/§2  
**Data**: 2026-05-26  
**Autore**: System Architect (ruflo-swarm:architect)

---

## 0. Premessa e perimetro

Questo piano copre quattro blocchi di lavoro indipendenti ma coordinati:

1. **Fix CORS/immagine sfondo** — bug bloccante, priorità massima.
2. **Qualità segmentazione** — feathering maschera, smoothing temporale, scelta modello.
3. **Beautify** (pelle + glow, Face Landmarker) — nuova funzione B.4.
4. **Privacy volto** (pixelate/blur volto, Face Landmarker) — nuova funzione B.4.

Tutti usano MediaPipe (Apache 2.0), girano lato nostro (preview operatore + Egress), controllati dallo `SceneState`. Nessun API a pagamento.

Fuori scope (gated da decisione costi, ADR-0007 §5): GenAI scenografie Gemini, pipeline adult self-host GPU, MirageLSD, validazione runtime Egress su host Linux.

---

## 1. Fix: Sfondo immagine cross-origin

### Diagnosi

`useStaticAssets` in `apps/api/src/main.ts` serve `/uploads` tramite Express static middleware. L'`enableCors()` esistente configura CORS **solo per le route NestJS**; Express static bypassa i guard NestJS e non aggiunge header `Access-Control-Allow-Origin`. Di conseguenza `img.crossOrigin = "anonymous"` fallisce (risposta senza ACAO header) e l'`onerror` mette `bgImageRef.current = null`, facendo cadere in fallback blur.

### Analisi delle opzioni

**Opzione A — Aggiungere header CORS allo static serving (raccomandata)**  
Passare `{ setHeaders }` all'opzione di `useStaticAssets` per emettere `Access-Control-Allow-Origin: *` (o l'origin dell'Egress) su tutte le risorse `/uploads`. Il canvas rimane **non tainted**: `crossOrigin="anonymous"` + header corretti = canvas leggibile. Necessario per Egress (origine diversa dalla console), che caricherà la stessa immagine da Chrome headless.

**Opzione B — Rimuovere `crossOrigin="anonymous"`**  
Il canvas diventa tainted. `getImageData` e `toDataURL` lancierebbero `SecurityError`. Né la preview né l'Egress usano attualmente questi metodi, quindi non rompe ora. Tuttavia: (a) qualsiasi futura diagnostica/export frame fallirebbe silenziosamente; (b) se si aggiunge un filtro canvas-side (es. beautify sul canvas) che legge pixel, il taint blocca. Scartata: crea debito tecnico sottile.

### Raccomandazione: Opzione A

Modifica unica in `main.ts`, nessun cambiamento al hook. Retrocompatibile. Corretto anche per l'Egress dal primo giorno.

### Modifica da applicare

File: `apps/api/src/main.ts`

Sostituire la chiamata `useStaticAssets` con:

```ts
app.useStaticAssets(join(process.cwd(), 'uploads'), {
  prefix: '/uploads',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
});
```

`Cross-Origin-Resource-Policy: cross-origin` è necessario su Chromium recenti (incluso il Chrome headless dell'Egress) per permettere il caricamento cross-origin di risorse statiche. `Access-Control-Allow-Origin: *` è sufficiente per dev; in prod si può restringere a `NEXT_PUBLIC_CONSOLE_ORIGIN`.

---

## 2. Qualità segmentazione

### 2.1 Scelta modello

Il modello attuale `selfie_segmenter` (float16, 256×256) è ottimizzato per selfie frontali verticali. Per il contesto live (framing più largo, capelli, bordi complessi):

- Usare **`selfie_segmenter_landscape`** (float16, 144×256): aspect ratio 16:9 nativo, migliore per video orizzontale, bordi capelli più definiti. URL da parametrizzare via `NEXT_PUBLIC_SELFIE_MODEL_URL` (già supportato).
- Il modello `multiclass` (5 classi) non è raccomandato: overhead maggiore, non migliora la qualità bordi per il caso d'uso sfondo, e richiederebbe riscrittura del compositing (confidence mask per classe "person" invece di mask index 0).

### 2.2 Feathering della maschera alpha (edge softening)

Il problema attuale: la maschera viene scritta in un `ImageData` con alpha binaria `(data[i] * 255)`, poi scalata sul canvas output. I bordi pixelati diventano visibili al resize.

**Algoritmo migliorato nel loop `draw()`:**

1. Scrivere la maschera float32 raw nel canvas maschera (stessa logica attuale).
2. Applicare un **CSS filter `blur`** al `maskCanvas` **prima** di usarlo come `destination-in`. Un blur di 2–4px sul canvas maschera a dimensione modello (144×256 o 256×256) produce un bordo morbido senza artefatti, perché il blur avviene nello spazio ridotto e poi il canvas è scalato al canvas output.
3. Il blur sul `maskCanvas` non intacca le performance: è GPU-accelerated e avviene su una canvas piccola.

Implementazione: dopo `mctx.putImageData(imgData, 0, 0)`, impostare `maskCanvas.style.filter = 'blur(3px)'` prima del `drawImage`. Nota: CSS filter su OffscreenCanvas non è supportato in tutti i browser; usare invece un secondo canvas intermedio oppure applicare il blur come filter sull'operazione di drawImage nel ctx principale: `ctx.filter = 'blur(3px)'` prima del `drawImage(maskCanvas, ...)` con `destination-in`.

Valore di partenza consigliato: `blur(2px)` per video 720p, `blur(3px)` per 1080p. Esporre come costante interna `MASK_FEATHER_PX` senza aggiungerla allo `SceneState` (è un parametro di qualità fisso, non operatore-controllabile).

### 2.3 Smoothing temporale (anti-flicker)

Il flickering ai bordi è causato dalla varianza frame-a-frame della confidence mask. Soluzione: **blend temporale** tra la maschera del frame corrente e quella del frame precedente.

```
alpha_blended[i] = TEMPORAL_ALPHA * alpha_current[i] + (1 - TEMPORAL_ALPHA) * alpha_prev[i]
```

Dove `TEMPORAL_ALPHA = 0.7` (70% frame corrente, 30% frame precedente) è un buon punto di partenza. Valore più basso = più smoothing ma più lag visibile su movimenti rapidi.

Implementazione: aggiungere un `prevMaskRef = useRef<Float32Array | null>(null)` nel hook. Nel loop `draw()`, dopo aver ottenuto `data` da `mask.getAsFloat32Array()`, applicare il blend se `prevMaskRef.current` ha la stessa lunghezza. Memorizzare la maschera blended in `prevMaskRef.current` per il frame successivo. Resettare `prevMaskRef.current = null` quando `active` passa a `false`.

La costante `TEMPORAL_ALPHA` è interna al hook, non esposta allo `SceneState`.

### 2.4 Ottimizzazioni minori

- Riutilizzare il `Float32Array` blended con `new Float32Array(data.length)` allocato una volta fuori dal loop e aggiornato in-place, evitando GC pressure a 30fps.
- Già implementato correttamente: `canvas.width/height` viene aggiornato solo quando cambia (evita reset del canvas ogni frame).

---

## 3. Data Model: nuovo campo `effects`

### 3.1 Principio di design

Non modificare `SceneBackground` (già dedicato alla segmentazione sfondo). Aggiungere un campo opzionale `effects` allo `SceneState` per gli effetti sul volto. Questo mantiene la separazione semantica (sfondo = cosa c'è dietro; effects = cosa si applica al volto) e permette di attivare/disattivare gli effetti indipendentemente.

### 3.2 Tipo `SceneEffects` (nuovo)

Da aggiungere in `packages/api-client/src/api-client.ts` e `apps/api/src/modules/studio/dto/scene.dto.ts`:

```ts
// packages/api-client/src/api-client.ts

/**
 * Effetti AR sul volto (ADR-0007 §2, step B.4).
 * Calcolati lato nostro (MediaPipe Face Landmarker), controllati dall'operatore.
 * Tutti i campi sono opzionali; assenza = effetto disattivato (retrocompatibile).
 */
export interface SceneEffects {
  /** Ritocco pelle/glow. intensity: 0–100 (0 = disattivato). */
  beautify?: {
    enabled: boolean;
    /** 0–100 */
    intensity: number;
  };
  /** Oscuramento/privacy volto. mode: 'pixelate' | 'blur'. */
  facePrivacy?: {
    enabled: boolean;
    mode: 'pixelate' | 'blur';
    /** 0–100: intensità effetto (pixel size per pixelate, raggio per blur) */
    intensity: number;
  };
}
```

### 3.3 Modifiche DTO backend (`scene.dto.ts`)

```ts
// Aggiungere dopo SceneBackgroundDto

export class BeautifyEffectDto {
  @IsBoolean() enabled!: boolean;
  @IsNumber() @Min(0) @Max(100) intensity!: number;
}

export class FacePrivacyEffectDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(['pixelate', 'blur']) mode!: 'pixelate' | 'blur';
  @IsNumber() @Min(0) @Max(100) intensity!: number;
}

export class SceneEffectsDto {
  @IsOptional() @ValidateNested() @Type(() => BeautifyEffectDto)
  beautify?: BeautifyEffectDto;

  @IsOptional() @ValidateNested() @Type(() => FacePrivacyEffectDto)
  facePrivacy?: FacePrivacyEffectDto;
}

// Aggiungere in UpdateSceneDto:
@IsOptional()
@ValidateNested()
@Type(() => SceneEffectsDto)
effects?: SceneEffectsDto;

// Aggiungere in SceneState:
effects?: SceneEffectsDto;
```

### 3.4 Propagazione REST + WebSocket

**REST**: `updateSceneState` in `api-client.ts` aggiunge `effects` al body JSON. Il campo è opzionale e ignorato dai client che non lo gestiscono ancora (retrocompatibile).

Firma aggiornata:
```ts
export async function updateSceneState(
  sessionId: string,
  overlays: SceneOverlay[],
  filters: SceneFilters | undefined,
  background: SceneBackground | undefined,
  effects: SceneEffects | undefined,   // NUOVO
  token: string,
): Promise<SceneState>
```

**WebSocket**: `SceneUpdatePayload` (ws-client.ts) e `ScenePayload` (events.ts) aggiungono `effects?: unknown`. Il `SceneStateService.replace()` riceve e persiste il campo. Il broadcast `emitSceneUpdate` lo include nel payload.

**SceneComposite**: aggiunge prop `effects?: SceneEffects` passata dall'editor e dalla pagina render.

### 3.5 Retrocompatibilità

- Tutti i nuovi campi sono `@IsOptional()` / `?` in TypeScript. Assenza = nessun effetto. Nessuna migrazione DB necessaria (stato in-memory).
- I client che non mandano `effects` nel PUT continuano a funzionare: `effects: undefined` viene salvato, nessun effetto attivato.

---

## 4. B.4 Beautify (ritocco pelle/glow)

### 4.1 Approccio tecnico

**Face Landmarker** (MediaPipe, Apache 2.0) rileva 478 landmark facciali che delimitano la mesh del volto. Usare la face mesh come maschera per applicare effetti di smoothing solo sulla regione viso, senza toccare lo sfondo o i capelli.

Modello: `face_landmarker.task` (da `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task`). Parametrizzabile via `NEXT_PUBLIC_FACE_MODEL_URL`.

### 4.2 Pipeline compositing beautify

Il beautify viene applicato **sul canvas principale dopo la segmentazione sfondo**, come pass aggiuntivo:

1. La segmentazione sfondo disegna `video → scontornato → sfondo` sul canvas principale (pipeline esistente).
2. Il beautify legge i landmark del volto e costruisce un **path poligonale** dal contorno del volto (punti FACEMESH_FACE_OVAL da `@mediapipe/tasks-vision`).
3. Sul canvas principale: `ctx.save()` → `ctx.clip()` (clip al path viso) → applica `ctx.filter = blur(Xpx)` + ridisegna il frame video in quella regione (smoothing pelle) → `ctx.restore()`.
4. Per il "glow": dopo il blur skin, disegnare un layer sovrapposto con `globalCompositeOperation = 'screen'` e bassa opacità (~0.1–0.2) clippato al viso, colore bianco o warm. L'intensità controlla sia il raggio del blur che l'opacità del glow.

**Parametro intensità → valori tecnici**:
- `intensity 0–100` → `blurRadius = intensity * 0.06` (0–6px), `glowOpacity = intensity * 0.002` (0–0.2).

### 4.3 Gestione della latenza del secondo modello

Face Landmarker e ImageSegmenter sono entrambi asincroni e girano in GPU delegate. Due modelli contemporanei aumentano il costo GPU. Strategia:

- Caricare Face Landmarker **solo se `effects.beautify.enabled || effects.facePrivacy.enabled`** (lazy load).
- I due modelli girano nello **stesso rAF loop**: per ogni frame, eseguire prima `segmenter.segmentForVideo` (callback-based), poi `landmarker.detectForVideo` (callback-based). Entrambi restituiscono risultati nello stesso frame se il thread GPU regge (30fps target → ~33ms budget).
- Se il frame budget supera 33ms (rilevabile con `performance.now()`), skipare la landmarker ogni altro frame mantenendo l'ultimo risultato (smoothing temporale per landmark non necessario: il volto si muove lentamente rispetto ai capelli).

### 4.4 Nuovo hook `useFaceEffects`

Creare `apps/console/src/components/useFaceEffects.ts`:

- Riceve `{ videoRef, canvasRef, effects, active }`.
- Inizializza Face Landmarker con `delegate: 'GPU'`, `runningMode: 'VIDEO'`, `numFaces: 1`.
- Nel loop rAF: `landmarker.detectForVideo(video, ts, callback)` → nel callback costruisce il path viso e applica beautify e/o privacy volto sul canvas (già composito con lo sfondo).
- Cleanup: `landmarker.close()` al dismount.
- Dipendenza: `active` = `(effects?.beautify?.enabled || effects?.facePrivacy?.enabled) === true`.

Il hook viene chiamato **dopo** `useSelfieSegmentation` in `SceneComposite`, così lavora sul canvas già composito (creator scontornata sopra lo sfondo). L'ordine è: segmentazione sfondo → face effects → overlay testo/immagine.

---

## 5. B.4 Privacy volto (pixelate / blur)

### 5.1 Approccio tecnico

Stesso Face Landmarker di beautify (istanza condivisa, un solo caricamento). Quando `facePrivacy.enabled`:

1. Ottenere il bounding box del volto dai landmark (min/max X,Y dei 478 punti).
2. Estrarre la regione viso dal canvas con `ctx.getImageData(x, y, w, h)`.
3. Per **mode 'blur'**: applicare `ctx.filter = blur(Xpx)` e ridisegnare la regione. `blurRadius = 2 + intensity * 0.3` (2–32px).
4. Per **mode 'pixelate'**: ridimensionare la regione a scala ridotta (es. larghezza/`pixelSize`) su un canvas temporaneo, poi ridisegnare con `imageSmoothingEnabled = false` in scala intera. `pixelSize = 4 + Math.round(intensity * 0.2)` (4–24px).
5. Clippare l'effetto al path poligonale FACEMESH_FACE_OVAL per non sforare sui capelli.

### 5.2 Condivisione istanza Face Landmarker

Beautify e facePrivacy usano lo **stesso `FaceLandmarker`** (stessa istanza nel hook `useFaceEffects`). Il hook esegue `detectForVideo` una sola volta per frame e usa il risultato per entrambi gli effetti se entrambi sono attivi.

---

## 6. Integrazione in `SceneComposite`

### 6.1 Nuova prop

```ts
interface SceneCompositeProps {
  // ... esistenti ...
  effects?: SceneEffects;  // NUOVO
}
```

### 6.2 Ordine dei hook

```ts
// 1. Segmentazione sfondo (già esistente)
useSelfieSegmentation({ videoRef, canvasRef, background, active: bgActive });

// 2. Effetti viso (NUOVO — dopo segmentazione)
const faceActive = !!(effects?.beautify?.enabled || effects?.facePrivacy?.enabled);
useFaceEffects({ videoRef, canvasRef, effects, active: faceActive });
```

Il canvas è condiviso: `useSelfieSegmentation` lo popola, poi `useFaceEffects` lo modifica in-place. Questo funziona perché entrambi girano nello stesso thread principale e i rAF loop sono sequenziali frame per frame (il secondo hook si aggancia al suo `requestAnimationFrame` separato ma in pratica sono allineati).

**Rischio**: due rAF loop indipendenti possono eseguire in ordine non deterministico nello stesso frame. Soluzione raccomandata: unificare in un singolo rAF loop gestito da un nuovo hook `useSceneCompositing` che orchestra segmentazione + face effects in sequenza sincrona. Vedi sezione Rischi §9.

---

## 7. UI Operatore

### 7.1 Posizione nella pagina editor

Aggiungere una nuova sezione **"Effetti volto"** in `apps/console/src/app/(dashboard)/studio/[sessionId]/page.tsx`, dopo la sezione "Sfondo AI" e prima di "Filtri & effetti".

### 7.2 Componenti design-system da usare

| Componente | Uso |
|---|---|
| `Card` (variant="elevated", padding="md") | Contenitore sezione effetti volto |
| `Toggle` | On/off per beautify e facePrivacy |
| `RangeField` (locale, pattern già usato) | Slider intensità (0–100) |
| Button pill (pattern già usato in filtri) | Selezione mode 'pixelate' / 'blur' |
| Badge (variant="ai") | Etichetta "AI" accanto al titolo sezione |

Non creare nuovi componenti design-system per questo blocco: i pattern esistenti (Toggle, Card, RangeField, button pill) coprono tutti i casi. Il design system va esteso solo se emerge un pattern genuinamente nuovo e riutilizzabile.

### 7.3 Struttura UI della sezione

```
[Card]
  Header: "Effetti volto" [Badge AI]  |  "Calcolati lato cloud (MediaPipe)"
  
  Row: Toggle "Beautify (ritocco pelle)"  [ON/OFF]
    └─ se ON: RangeField "Intensità  X%" [0–100]
  
  Row: Toggle "Privacy volto"  [ON/OFF]
    └─ se ON:
         Pills: [Sfocato] [Pixelato]
         RangeField "Intensità  X%" [0–100]

  Note: "⓪ La creator non esegue nulla; gli effetti sono applicati lato nostro."
```

### 7.4 Responsive

La sezione usa `space-y-3` interno, no grid multi-colonna: funziona su mobile. I Toggle hanno target touch ≥44px (già garantito dal componente `Toggle` del design system).

---

## 8. Lista file da toccare / creare

### Modifiche a file esistenti

| File | Scopo della modifica |
|---|---|
| `apps/api/src/main.ts` | Aggiungere `setHeaders` CORS + CORP allo static `/uploads` |
| `apps/api/src/modules/studio/dto/scene.dto.ts` | Aggiungere `SceneEffectsDto`, `BeautifyEffectDto`, `FacePrivacyEffectDto`; estendere `UpdateSceneDto` e `SceneState` con `effects?` |
| `apps/api/src/modules/studio/scene-state.service.ts` | Aggiungere `effects` a `replace()` e al tipo `SceneState` persistito |
| `apps/api/src/modules/realtime/events.ts` | Aggiungere `effects?: unknown` a `ScenePayload` |
| `packages/api-client/src/api-client.ts` | Aggiungere `SceneEffects`, `BeautifyEffect`, `FacePrivacyEffect`; estendere `SceneState`, `updateSceneState` |
| `packages/api-client/src/ws-client.ts` | Aggiungere `effects?: unknown` a `SceneUpdatePayload` |
| `apps/console/src/components/useSelfieSegmentation.ts` | (1) Modello → landscape; (2) feathering maschera; (3) smoothing temporale; (4) estrazione in `MASK_FEATHER_PX`, `TEMPORAL_ALPHA` |
| `apps/console/src/components/SceneComposite.tsx` | Aggiungere prop `effects?`, chiamata a `useFaceEffects` |
| `apps/console/src/app/(dashboard)/studio/[sessionId]/page.tsx` | Aggiungere stato `effects`, sezione UI "Effetti volto", passaggio prop a `SceneComposite` |
| `apps/console/src/app/scene/[sessionId]/page.tsx` | Gestire `effects` da WS/REST payload, passarlo a `SceneComposite` |

### File nuovi da creare

| File | Scopo |
|---|---|
| `apps/console/src/components/useFaceEffects.ts` | Hook MediaPipe Face Landmarker: inizializzazione lazy, rAF loop, beautify + face privacy sul canvas condiviso |
| `apps/console/src/components/faceCompositing.ts` | Funzioni pure per il compositing (buildFaceOvalPath, applyBeautify, applyPixelate, applyFaceBlur) — separato dal hook per testabilità |

---

## 9. Test da aggiungere

### Backend (`apps/api`)

| File | Test da aggiungere |
|---|---|
| `apps/api/src/modules/studio/scene-state.service.spec.ts` | `replace() stores and broadcasts effects (beautify)`, `replace() stores and broadcasts effects (facePrivacy)`, `effects absent → undefined in stored state (retrocompatibilità)` |
| `apps/api/src/modules/studio/dto/scene.dto.ts` (via integration) | Validazione: `intensity > 100` rifiutato, `mode` non in union rifiutato, `effects` assente → body valido |

### Frontend (`apps/console`)

| File | Test da aggiungere |
|---|---|
| `apps/console/src/__tests__/api-client.test.ts` | `updateSceneState con effects invia il campo nel body`, `SceneState con effects assente è retrocompatibile` |
| `apps/console/src/components/faceCompositing.test.ts` (NUOVO) | `buildFaceOvalPath ritorna path corretto da array landmark`, `applyPixelate con pixelSize=8 ridimensiona correttamente`, `applyBeautify con intensity=0 non modifica il canvas` |

### Test di integrazione / E2E (manuale per ora, da automatizzare post-Egress)

- Aprire editor scena con stream attivo, attivare sfondo immagine uploadata: verificare che l'immagine si carichi (no fallback blur, no console error CORS).
- Attivare beautify al 50%: verificare visivamente che il volto appaia smoothato nella preview operatore.
- Attivare facePrivacy mode 'pixelate': verificare che il volto sia pixelato nella preview.
- Aprire `/scene/[sessionId]` in tab separato: verificare WYSIWYG (stessa resa della preview).

---

## 10. Rischi e limitazioni

### R1 — Due modelli MediaPipe simultanei (CPU/GPU)

Avere `ImageSegmenter` + `FaceLandmarker` attivi contemporaneamente raddoppia il carico GPU nell'Egress (Chrome headless). Budget stimato: ImageSegmenter landscape ~8ms/frame su GPU mid-range, FaceLandmarker ~5ms/frame. Totale ~13ms su 33ms budget 30fps. Accettabile su hardware moderno, ma monitorare nel render Egress reale.

Mitigazione: attivare Face Landmarker solo se almeno un effetto volto è `enabled: true` (già nel design del hook). In caso di budget sforato, lo skip-frame approach (landmarker ogni altro frame) mantiene la qualità percepita.

### R2 — Ordine rAF non deterministico tra due hook

Due `useEffect` con `requestAnimationFrame` loop indipendenti possono interleave-arsi in modo non prevedibile nello stesso frame. Se `useFaceEffects` esegue prima che `useSelfieSegmentation` abbia scritto il frame corrente, leggerebbe il frame precedente (visual lag di 1 frame).

Mitigazione raccomandata (post-MVP se il problema si manifesta): refactoring verso un singolo hook `useSceneCompositing` che orchestra l'intera pipeline in un rAF unico: segmentazione → wait callback → face effects → commit al canvas. Richiede ristrutturazione dei due hook in funzioni chiamabili, non hooks autonomi.

### R3 — Face Landmarker e Chromium headless (Egress)

Face Landmarker con GPU delegate gira in Chromium >= 113 con WebGL2. L'Egress usa Chrome headless (ADR-0004/ADR-0006). Verificare che `--use-gl=angle` o `--enable-gpu` siano nei flags Egress; altrimenti il GPU delegate cade silenziosamente su CPU (più lento ma funzionante).

### R4 — Feathering con `ctx.filter` e destination-in

`ctx.filter = 'blur(3px)'` prima di `drawImage(maskCanvas, ...)` con `destination-in` funziona in Chrome/Chromium ma non è parte dello spec Canvas2D ufficiale per tutti i browser. L'Egress (Chromium) è garantito. Per la preview operatore (Chrome desktop) è compatibile. Su Firefox (non target Egress ma potenziale preview) `ctx.filter` su `destination-in` ha comportamento legacy. Non è un blocco per il caso d'uso attuale.

### R5 — Model URL esterno in produzione

In dev i modelli vengono scaricati da `storage.googleapis.com` e `cdn.jsdelivr.net`. In produzione con Egress isolato (VPC privato, nessun accesso esterno), i modelli devono essere hostati internamente. Le env var `NEXT_PUBLIC_MEDIAPIPE_WASM_BASE` e `NEXT_PUBLIC_SELFIE_MODEL_URL` (già presenti) + nuova `NEXT_PUBLIC_FACE_MODEL_URL` coprono questo caso. Da documentare nei task di deploy.

---

## 11. Elementi rimandati (richiedono decisione costi esplicita)

- **GenAI scenografie SFW**: Gemini 2.5 Flash Image Batch API (~$0.02/img) — ADR-0007 §3/§5.
- **Pipeline adult self-host**: FLUX.1/Wan 2.x su RunPod/VPS GPU — ADR-0007 §3/§5.
- **MirageLSD scenografia live real-time**: servizio a pagamento — ADR-0007 §4/§5.
- **Validazione Egress runtime**: richiede host Linux (Docker Desktop/WSL2 rompe WebRTC) — ADR-0006.
- **Ottimizzazione unify rAF loop** (refactoring `useSceneCompositing`): rimandato a post-MVP se R2 si manifesta.

---

## 12. Ordine di implementazione consigliato

1. **Fix CORS** (`main.ts`) — sblocca il test del sfondo immagine. Singola riga, test immediato.
2. **Data model** (DTO + api-client + ws-client + scene-state.service) — tutto backend/shared; i test di service sono già strutturati, aggiungere i nuovi casi.
3. **Miglioramenti segmentazione** (`useSelfieSegmentation.ts`) — modello landscape + feathering + temporal blend. Visibile subito nella preview.
4. **`faceCompositing.ts`** — funzioni pure, testabili in isolamento.
5. **`useFaceEffects.ts`** — hook che usa le funzioni pure.
6. **`SceneComposite`** — integra `useFaceEffects`.
7. **UI editor** — sezione "Effetti volto" nella pagina editor.
8. **Pagina render** (`scene/[sessionId]/page.tsx`) — consumare `effects` dal payload WS/REST.
9. **Test** — aggiungere secondo la lista §9 prima del merge.
