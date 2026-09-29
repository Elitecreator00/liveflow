# LiveFlow — Studio AI-native: ricerca di mercato e architettura (2026-05-24)

> Sintesi di 3 ricerche parallele (team agenti ruflo): (1) GenAI per asset/scenografie, (2) AR real-time on-device, (3) analisi competitiva. Fonti citate nei report sorgente. Affidabilità graduata Alta/Media/Bassa.

---

## 0. Executive summary

1. **Il mercato è vergine per il nostro segmento.** Nessuno (TikTok LIVE Studio, Streamlabs, StreamYard, Restream, OBS, NVIDIA Broadcast) presidia "studio live + AI + agenzie webcam + compliance adult". Il più vicino — Streamster — ha dashboard multi-creator ma **zero AI**. Spazio reale e difendibile.
2. **Il vincolo che domina TUTTO è la policy sui contenuti adult.** Quasi tutti i provider AI mainstream (Google/Gemini "Nano Banana", Hailuo/MiniMax, Runway, Kling, fal.ai, Firefly, Leonardo) **vietano in modo assoluto** i contenuti sessuali — zero eccezioni enterprise. Per il nostro target adult le uniche vie sono **modelli open-weight self-hosted** (FLUX, Wan — Apache 2.0) o provider adult-friendly (**Venice AI** immagini, **Atlas Cloud "Spicy"** video).
3. **Due "slot" AI nel nostro pipeline**, da non confondere:
   - **Slot A — real-time (<300ms, 30fps)**: segmentazione/AR. Gira in un browser (Chromium) via WASM/WebGL: o sul device, o **nel Chrome headless dell'Egress** (cloud).
   - **Slot B — pre-generazione async (secondi)**: scenografie/sfondi/overlay generati prima e usati come asset. **Nessun** generatore d'immagini/video è real-time.
4. **La visione dell'utente (operatore controlla, creator non tocca nulla) è realizzabile e anzi consigliata**: facendo girare anche l'AI real-time **lato cloud (nell'Egress)** invece che sul device. Vedi §3.

---

## 1. Chiarimenti sui prodotti citati dall'utente

- **"Hailuo Light Studio"** NON è un generatore di scenografie: è un controllo di **illuminazione cinematografica** (angolo/intensità/temperatura, 20 preset) applicato a video **generati** con Hailuo (async, 30–90s). Inoltre Hailuo **vieta l'adult**. Utilità per noi: bassa nel contesto adult.
- **"Nano Banana"** = **Google Gemini 2.5 Flash Image**: ottimo generatore/editor di immagini, economico ($0.0195/img in batch), API matura. **MA vieta l'adult (zero-tolerance).** Usabile solo per asset **SFW** (sfondi neutri, cornici, branding), e con cautela ToS (anche solo usarlo "in connessione" con piattaforma adult è a rischio).

---

## 2. Il vincolo adult (decisivo) — chi si può usare

| Provider | Tipo | Adult? | Note | Affid. |
|---|---|---|---|---|
| Gemini 2.5 Flash (Nano Banana) | Immagine | **NO** | $0.0195–0.039/img, ottimo per SFW | Alta |
| FLUX.1 schnell (open-weight, self-host) | Immagine | **SÌ** se self-hosted | Apache 2.0, ~$0.002–0.006/img su RunPod | Alta |
| Wan 2.x (open-weight, self-host) | Video loop | **SÌ** se self-hosted | Apache 2.0, ~$0.03–0.10/clip | Alta |
| Venice AI | Immagine | **SÌ** (adult legale) | API, $0.01–0.09/img | Alta |
| Atlas Cloud "Spicy" (Wan) | Video | **SÌ** (18+) | managed, $0.01/sec, no setup GPU | Alta |
| Runway / Kling / Pika / Luma / Hailuo | Video | **NO** (o non confermato) | mainstream, moderation non disattivabile | Alta/Media |
| Adobe Firefly | Immagine | **NO** | ma IP-indemnification (per SFW/brand) | Alta |
| MediaPipe (Google, on-device) | Segmentazione/landmark real-time | **N/A** (gira on-device, nessun dato inviato) | Apache 2.0, gratis | Alta |

**Conclusione:** separare due binari — **asset SFW** (Gemini/Nano Banana, economico) e **asset adult** (self-host FLUX/Wan, o Venice/Atlas). Il real-time (MediaPipe) è neutro perché gira on-device/in-Chrome senza inviare nulla a terzi → nessun problema di policy. La compliance legale (2257/age-verify/GDPR) resta a carico di LiveFlow comunque.

---

## 3. Architettura raccomandata: AI lato cloud, controllata dall'operatore (la visione dell'utente)

L'utente vuole: **l'operatore attiva gli effetti dall'app agenzia; la creator fa solo la live senza toccare nulla.** Raccomandazione tecnica coerente con questo E con il principio "device dumb, cloud smart" (ADR vincolante):

> **Tutta la composizione — overlay, filtri colore, sfondi AI, e anche l'AI real-time (segmentazione/AR) — gira nel RENDER CLOUD (LiveKit Egress = Chrome headless), guidata dallo stato-scena impostato dall'operatore. La creator pubblica il flusso grezzo e non esegue nulla.**

Come funziona:
- La **pagina scena React** (già condivisa editor-operatore ⇄ Egress, ADR-0004) ospita: il video della creator (subscribe), gli overlay, i filtri CSS, **e MediaPipe (WASM/WebGL) per segmentazione/face-mesh**. Tutto pilotato dallo `SceneState` (che l'operatore edita).
- L'operatore nel suo browser vede la **stessa** pagina (preview WYSIWYG) con MediaPipe attivo; l'Egress nel cloud renderizza l'identica pagina per l'output reale.
- **La creator non esegue MediaPipe né sceglie nulla.** Resta "dumb".

Vantaggi: rispetta la visione dell'utente; WYSIWYG; **evita i bug iOS Safari** del MediaPipe on-device (vedi §4); nessun dato adult inviato a terzi.
Costo/trade-off: **GPU per ogni creator nell'Egress** quando un effetto AI è attivo (la composizione Egress era comunque già prevista in ADR-0004). Mitigazione: il caso base (no effetti) resta leggero; l'AI gira solo quando l'operatore l'attiva.

Opzione futura premium: **MirageLSD (Decart)** — primo modello di **diffusione live real-time** (<40ms, 30fps) che trasforma lo stream via prompt. È **cloud + real-time + operator-controlled** → perfetto per "scenografia generativa live". Da validare costo GPU e policy adult (non confermata). Candidato per una feature "wow" di Fase avanzata.

---

## 4. Slot A — AR/segmentazione real-time (dettaglio)

- **MediaPipe Tasks** (`@mediapipe/tasks-vision`, Apache 2.0, gratis): Selfie Segmentation (sfondo blur/replace), Face Landmarker (478 punti → beautify/maschere/pixelate-volto). Pattern: video → canvas (MediaPipe) → composizione. GPU WebGL <3ms; **Chromium-only**.
- **iOS Safari = problematico** (bug aperti: segmentazione in worker non ritorna; GPU delegate errato). → Ulteriore motivo per fare il real-time **nel Chrome dell'Egress** (cloud) e non sul device creator.
- **SDK commerciali** (effetti pronti stile IG): **Snap Camera Kit e BytePlus VIETANO l'adult** (esclusi). **DeepAR** (acquisito da Zalando, roadmap incerta) e **Banuba** hanno policy **ambigue** → richiedono **clearance scritta** prima dell'uso. Da considerare solo se in futuro serve una libreria di effetti pronti e la policy adult viene confermata per iscritto.
- **Raccomandazione**: partire **gratis con MediaPipe**, eseguito lato cloud/operatore (vedi §3). Effetti V1: sfondo blur/replace, beautify, pixelate-volto (privacy), maschere 2D su landmark.

---

## 5. Slot B — scenografie/asset GenAI (dettaglio)

- **SFW** (sfondi neutri, set fotografici, cornici, branding): **Gemini 2.5 Flash Image (Nano Banana)** via Batch API ($0.0195/img). Libreria iniziale 500 sfondi ≈ $10. Latenza <10s.
- **Adult**: **self-host FLUX.1 schnell** (immagini) e **Wan 2.x** (video loop) su RunPod (~$0.002–0.01/asset), oppure managed **Venice AI** (immagini) / **Atlas Cloud Spicy** (video).
- **Sfondi video animati** (loop ambient): Wan/Atlas (adult) o Runway/Kling (solo SFW).
- Flusso prodotto: l'operatore scrive un **prompt** → job async genera l'asset → salvato su storage → diventa un **layer scena** (sfondo) → combinato con la segmentazione (§3/§4) per metterci "dentro" la creator. **Questa è la killer feature** che nessun competitor ha.

---

## 6. Posizionamento competitivo — i 3 vuoti da vincere

1. **Scenografia GenAI nel flusso live** (prompt → sfondo/scena, con la creator integrata via segmentazione). Nessuno ce l'ha come prodotto verticale.
2. **Orchestrazione operatore multi-creator** (un operatore regìa 5–10 live, attiva effetti/scene da remoto, interviene sulla chat). Streamster è primitivo; noi 10×.
3. **Compliance adult by-design** (KYC/2257/GDPR/audit nativi). I mainstream non ci entreranno mai per scelta di brand → moat.

### 5 feature "wow" (dai report)
1. **"Scene AI"** — sfondo/scenografia da prompt che cambia in pochi secondi, con la creator scontornata sopra.
2. **"Chatter AI Copilot"** — suggerimenti real-time per massimizzare le conversioni (M6).
3. **"Beauty/AR Pack"** — beautify + sfondo + maschere senza green-screen né GPU NVIDIA, controllati dall'operatore.
4. **"Studio Director"** — regìa multi-creator (M4.3 potenziato).
5. **"Compliance Kit"** — KYC/2257/GDPR first-class (M7).

---

## 7. Costi indicativi (ordine di grandezza)
- Asset SFW (Gemini batch): ~$0.02/immagine. Libreria + refresh mensile: pochi $/mese.
- Asset adult self-host (FLUX/Wan su RunPod): ~$0.002–0.01/asset + ~$0.22/h GPU on-demand.
- Real-time MediaPipe: **$0** licenza; costo = GPU dell'Egress (già previsto) quando l'effetto è attivo.
- MirageLSD (futuro): da quotare (GPU cloud real-time, probabilmente la voce più cara).

---

## 8. Rischi
- **ToS adult (ALTO/esistenziale)**: non usare provider mainstream in contesto adult, nemmeno per sfondi. Separare infrastruttura SFW vs adult; self-host per l'adult.
- **iOS Safari on-device (ALTO)**: motivo per fare il real-time lato cloud.
- **Compliance legale (ALTO)**: 2257/age-verify/GDPR a carico nostro, indipendente dall'AI (Fase 0 / M7).
- **Vendor**: DeepAR (Zalando), policy RunPod "permessa per omissione" → confermare per iscritto prima di dipenderci.
- **Copyright output AI**: non proteggibile come IP (impatto basso: asset interni).

---

## 9. Decisioni aperte → ADR proposto (ADR-0007)
1. **Dove gira l'AI real-time**: cloud-Egress operator-controlled (raccomandato) vs on-device. → con i dati sopra, raccomando **cloud**.
2. **Provider GenAI**: doppio binario **Gemini (SFW)** + **self-host FLUX/Wan (adult)**. Decidere se partire solo SFW per il PoC.
3. **SDK AR commerciali**: NON adottare ora (policy adult non confermata); partire MediaPipe.
4. **MirageLSD**: spike separato per la "Scene AI" real-time premium (Fase avanzata).

## 10. Roadmap proposta (incrementale)
- **B.2 (in corso/prossimo)**: LiveKit Egress dello scene attuale (overlay + filtri CSS) → output piattaforme. *Prerequisito di tutto.*
- **B.3**: segmentazione + sfondo (MediaPipe nel render) — sfondo = immagine/loop caricato o **pre-generato da prompt (Gemini per SFW)**.
- **B.4**: beautify + maschere 2D (MediaPipe landmark), tutto operator-controlled.
- **B.5**: pipeline asset adult self-host (FLUX/Wan) per sfondi/scene adult.
- **B.6 (premium)**: spike MirageLSD per scenografia generativa live.
- Parallelo: **M6 Chatter AI Copilot** e **M7 Compliance Kit** (entrambi grandi differenziatori, indipendenti dal video).
