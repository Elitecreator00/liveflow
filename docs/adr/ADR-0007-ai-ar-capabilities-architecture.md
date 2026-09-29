# ADR-0007 — Architettura delle capacità AI/AR (effetti, scenografie, filtri)

## Status

Accepted — 2026-05-24 (decisione utente dopo lo studio di mercato `discovery/AI_STUDIO_RESEARCH.md`)

## Context

Vogliamo arricchire lo studio live con: filtri AR (beautify, maschere, faccia pixellata), sostituzione sfondo, scenografie generative AI. Requisito di prodotto dell'utente: **gli effetti li attiva l'operatore dall'app Agenzia; la creator fa solo la live senza toccare nulla.**

Lo studio di mercato (3 ricerche parallele) ha evidenziato:
- **Policy contenuti adult**: quasi tutti i provider AI mainstream (Google/Gemini "Nano Banana", Hailuo/MiniMax, Runway, Kling, fal.ai, Firefly, Leonardo) VIETANO l'adult senza eccezioni. SDK AR commerciali: Snap Camera Kit/BytePlus vietano l'adult; DeepAR (acquisito Zalando)/Banuba hanno policy ambigue.
- **Real-time vs async**: nessun generatore d'immagini/video è real-time. L'AR/segmentazione invece è real-time e gira in-browser (WASM/WebGL) con MediaPipe.
- **iOS Safari**: MediaPipe on-device ha bug aperti (segmentazione in worker non ritorna, GPU delegate errato).
- **Vincolo costi (utente)**: ok pagare l'hardware (GPU/VPS), NON canoni/abbonamenti esterni senza una decisione esplicita.

## Decision

### 1. L'AI real-time gira LATO CLOUD, controllata dall'operatore
Segmentazione e AR (MediaPipe) girano nella **pagina-scena React** renderizzata dal **render cloud (LiveKit Egress, Chrome headless)** e, identica, nella **preview dell'operatore**. Sono pilotate dallo `SceneState` impostato dall'operatore. **La creator pubblica il flusso grezzo e non esegue alcun effetto** ("device dumb, cloud smart", ADR-0001/§principi).

Motivazioni: rispetta il requisito (operatore controlla, creator passiva); WYSIWYG editor⇄Egress; evita i bug iOS Safari dell'on-device; MediaPipe gira on-our-side senza inviare dati a terzi (nessun problema di policy adult).

Trade-off accettato: costo **GPU nell'Egress** per creator quando un effetto è attivo (l'Egress era comunque previsto da ADR-0004). Caso base (nessun effetto) leggero.

Scartata l'opzione **on-device telecomandato** (calcolo sul telefono creator): più economica per noi ma soggetta ai bug iOS e mette logica sul device.

### 2. Libreria AR: MediaPipe (free) ora; nessun SDK commerciale finché la policy adult non è confermata per iscritto
`@mediapipe/tasks-vision` (Apache 2.0): Selfie Segmentation (sfondo blur/replace), Face Landmarker (beautify, maschere 2D, pixelate-volto). **Nessun costo di licenza.** DeepAR/Banuba valutabili in futuro SOLO con clearance scritta sull'uso adult.

### 3. GenAI scenografie/asset: doppio binario, generazione ASINCRONA (pre-gen)
- **SFW** (sfondi neutri, set, cornici, branding): **Google Gemini 2.5 Flash Image ("Nano Banana")** via Batch API (~$0.02/immagine). *Costo esterno a consumo → da attivare con consenso esplicito (vedi §5).*
- **Adult**: **self-host di modelli open-weight** (FLUX.1 schnell immagini, Wan 2.x video — Apache 2.0) su nostra GPU (RunPod/VPS). **Nessun canone**, solo compute. Alternativa managed adult: Venice AI / Atlas Cloud "Spicy".
Gli asset generati diventano **layer di scena** (sfondo), combinati con la segmentazione (§1) per integrare la creator.

### 4. Scenografia generativa LIVE (premium, futuro)
**MirageLSD (Decart)** — diffusione real-time via prompt (<40ms): candidato per una feature premium "Scene AI live". Servizio cloud **a pagamento** → spike separato con valutazione costi/policy prima di adottarlo.

### 5. Principio di costo (vincolo utente)
Il percorso real-time (MediaPipe + Egress self-host) e gli asset adult self-host costano **solo hardware (GPU/VPS), zero abbonamenti**. Qualsiasi dipendenza da **API esterna a pagamento** (Gemini, MirageLSD, SDK commerciali) richiede una **decisione esplicita** prima dell'attivazione.

## Consequences

### Positive
- Rispetta la visione operatore-controlla/creator-passiva ed è coerente con "device dumb, cloud smart".
- Real-time AR a costo zero di licenza; nessun dato adult inviato a terzi.
- Posizionamento unico: scenografia GenAI + AR nel flusso live + compliance adult — vuoto di mercato (vedi ricerca).
- WYSIWYG garantito (stessa pagina-scena per preview e render).

### Negative / Trade-off
- GPU nell'Egress per creator con effetti attivi → costo compute (hardware), da dimensionare per la concorrenza.
- Self-hosting GenAI adult = lavoro DevOps (ComfyUI/RunPod) + responsabilità compliance.
- Egress runtime è un container Linux pesante: su Docker Desktop/Windows in dev va validato (possibile uso di un host Linux/VPS per il render). Collegato ad ADR-0006.

### Moduli impattati
| Modulo | Impatto |
|--------|---------|
| M1.11 Scene/overlay/branding | Aggiunge segmentazione/AR e sfondi AI come layer di scena |
| M1.3 Transcoding / M1.4 Fan-out | Invariati: l'output composito entra nel fan-out (ADR-0002) |
| M2.1 / App Creator | Resta "dumb": pubblica grezzo, nessun effetto on-device |
| M6 AI layer | Si estende a generazione asset + (futuro) Chatter AI Copilot |
| M8.6 Media servers | Aggiunge il render Egress + (per adult) GPU di generazione self-host |
| M7 Compliance | Resta prerequisito (2257/age-verify/GDPR), indipendente dall'AI |

## Riferimenti
- `discovery/AI_STUDIO_RESEARCH.md` — studio di mercato completo (3 ricerche, fonti)
- ADR-0004 (motore compositing LiveKit + Egress), ADR-0006 (deploy LiveKit dev/prod), ADR-0001 (principi/multi-tenant)
- Memorie: [[liveflow-studio-direction]]
