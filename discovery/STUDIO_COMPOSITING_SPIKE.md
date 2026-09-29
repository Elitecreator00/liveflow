# STUDIO COMPOSITING SPIKE — LiveFlow Live Studio
## Fase 0 Discovery — Scelta motore di compositing cloud

> Autore: System Architect
> Data: 2026-05-23
> Riferimento: OPERATIONAL_PLAN.md §1bis, ADR-0002 (fan-out FFmpeg per target), ADR-0003 (JWT stream key)
> Decisione architetturale di input: compositing CLOUD lato operatore — l'agenzia compone la scena nella web app; il cloud renderizza camera + overlay e manda in RTMP multi-destinazione.

---

## 1. Contesto e vincoli di progetto

Il principio "Device dumb, cloud smart" (OPERATIONAL_PLAN.md §1) vincola l'architettura:

- Il telefono cattura e invia UN solo flusso via WHIP/WebRTC a MediaMTX (ingest node già validato in ADR-0002/ADR-0003).
- Il compositing avviene interamente nel cloud (overlay immagine/testo/scene composti lato server).
- L'output composito viene inviato in RTMP verso il fan-out già costruito (un FFmpeg per target, ADR-0002).
- L'operatore edita la scena dalla web app (Next.js); le modifiche si propagano live al motore di rendering cloud senza ricaricare la pagina.

Vincoli operativi derivati:
1. Latenza tollerabile: la live adult non è interattiva con i viewer nel senso del gaming; la latenza end-to-end telefono → viewer tollerabile è 2–8 s. Latenza aggiuntiva introdotta dal compositor <= 500 ms rispetto all'ingest.
2. Overlay dinamici: testo (nome creator, counter token, messaggi moderazione), immagini (logo, frame grafico), scene switching (solo-cam, split, full-frame).
3. Multi-tenant: più creator in contemporanea; ogni istanza compositor è isolata per sessione.
4. Self-hosted obbligatorio: nessun vendor lock-in su rendering cloud proprietario; infra propria (VPS/K8s).
5. Output: RTMP (o RTMPS) verso il fan-out di ADR-0002; idealmente un singolo endpoint RTMP interno che MediaMTX o FFmpeg poi distribuisce.
6. Integrazione web editor: le modifiche dell'operatore (drag overlay, cambio testo, switch scena) devono arrivare al motore di rendering in real time via WebSocket o API.

---

## 2. Opzioni valutate

### Opzione A — LiveKit Server + LiveKit Egress

**Descrizione:** LiveKit è un server SFU/MCU WebRTC open-source (Apache 2.0). LiveKit Egress è un servizio satellite che legge da una Room LiveKit e la esporta in vari formati: RoomCompositeEgress renderizza un template HTML/Canvas tramite un browser Chromium headless interno (Puppeteer/Chrome), e ne produce un output RTMP, HLS, o file.

**Come funziona con il compositing:**
```
Telefono → WHIP → MediaMTX → rielaborazione → LiveKit Room (via RTMP-in o WebRTC)
  [oppure diretto] Telefono → WHIP → LiveKit Room
LiveKit Egress legge la Room + apre una pagina HTML "template scena"
  (la pagina usa LiveKit JS SDK per mostrare il feed camera + overlay DOM/Canvas)
  → Chromium headless cattura la composizione → encoder → RTMP → fan-out ADR-0002
```

**Come si aggiornano gli overlay:** la pagina template comunica via WebSocket con il backend; quando l'operatore cambia testo/immagine, il backend pubblica l'aggiornamento e la pagina DOM si aggiorna. L'egress cattura il frame già aggiornato.

### Opzione B — Renderer headless custom (Chromium + FFmpeg)

**Descrizione:** Una pagina web "scena" (Next.js/HTML statico) è aperta da un processo Chromium headless (Chrome --headless=new) gestito da Puppeteer o da Playwright. La pagina usa l'API WebRTC/video srcObject per ricevere il flusso dalla camera (via MediaMTX → WHIP o via un bridge HLS/WebRTC locale). Il frame del browser viene catturato da FFmpeg tramite `x11grab` (Linux) o `gdigrab` (Windows) oppure via un meccanismo di virtual display (Xvfb su Linux). FFmpeg produce l'output RTMP verso il fan-out.

**Come si aggiornano gli overlay:** WebSocket dal backend al browser headless; la pagina DOM aggiorna testo/immagine in real time. FFmpeg cattura continuamente il display virtuale.

### Opzione C — GStreamer pipeline (cenno)

**Descrizione:** GStreamer è un framework C di media pipeline. Un compositor cloud GStreamer (`compositor` element) mescola il feed RTSP/RTP della camera con elementi overlay generati da Cairo/Pango (testo) o pixbufs (immagine). L'output è un flusso RTMP via `rtmpsink`.

---

## 3. Tabella comparativa

| Criterio | Peso | **A — LiveKit Egress** | **B — Headless custom** | **C — GStreamer** |
|----------|------|------------------------|-------------------------|-------------------|
| **Overlay dinamici live** (testo/img aggiornati dall'operatore) | MUST | Eccellente — la pagina HTML template è aggiornata via WS; il renderer cattura già il DOM aggiornato. Nessun restart. | Eccellente — identico meccanismo DOM+WS; il browser è sempre aperto. | Limitato — aggiornare overlay richiede modificare la pipeline o usare appsrc; complesso da fare in real time senza stutter. |
| **Latenza introdotta dal compositor** | Alta | ~300–600 ms aggiuntivi (Chromium capture loop interno, ~30fps) | ~200–500 ms (capture Xvfb a 30fps + FFmpeg encode) | ~50–150 ms (pipeline nativa senza browser) |
| **Qualità overlay visiva** (layout CSS, font, immagini) | Alta | Massima — CSS/HTML/Canvas; WYSIWYG rispetto all'editor web | Massima — identico DOM | Bassa — Cairo/Pango; layout manuale in codice C/Python |
| **WYSIWYG operatore ↔ rendering** (l'editor web = la scena renderizzata) | MUST | Perfetto — stesso HTML/CSS nel browser editor e nel browser Egress | Perfetto — stessa pagina | Nessuno — layout separato |
| **Multi-RTMP output** | MUST | Supportato (EgressRequest con multiple output URL o ponte verso fan-out ADR-0002) | Richiede FFmpeg con output multipli o collegamento al fan-out ADR-0002 | Output singolo RTMP; multi-target richiede tee element o collegamento al fan-out |
| **Integrazione con fan-out ADR-0002** | MUST | Naturale: LiveKit Egress emette un RTMP verso il nodo MediaMTX interno → fan-out gestito da apps/api come già fa oggi | Naturale: FFmpeg output → RTMP verso MediaMTX interno → fan-out ADR-0002 | Naturale: rtmpsink → MediaMTX → fan-out ADR-0002 |
| **Integrazione ingest WHIP/MediaMTX** | MUST | Richiede bridge: MediaMTX riceve WHIP dal telefono → re-pubblica in RTMP → letto da un client RTMP che pusha in LiveKit Room (o LiveKit Server riceve WHIP diretto se esposto) | Naturale: MediaMTX riceve WHIP → espone HLS/WebRTC interno → pagina headless legge il feed | Naturale: MediaMTX riceve WHIP → RTSP/RTMP → GStreamer rtspsrc/rtmpsrc |
| **Costo infra CPU per sessione** | Alta | Alto: Chromium headless interno a Egress = ~800 MB RAM + 1–2 core CPU per istanza. LiveKit Egress è progettato per girare in un container dedicato. | Alto: identico Chromium overhead; Xvfb aggiunge ~50 MB. Unica differenza: controllo diretto senza layer LiveKit. | Basso: pipeline nativa ~100–200 MB RAM, 0.3–0.8 core CPU per sessione. |
| **Costo infra GPU** | Media | Non richiesto per PoC/MVP; supporto hardware accel (NVENC) tramite FFmpeg nel container Egress | Non richiesto per MVP; si può aggiungere NVENC a FFmpeg | Non richiesto; hardware accel nativa con gst-plugins-bad NVENC |
| **Scalabilità per creator concorrenti** | Alta | Un pod Egress per sessione; orchestrabile con K8s. Ogni pod ~1–2 vCPU + 1 GB RAM. Scalabilità orizzontale documentata e testata in produzione da LiveKit.io | Un processo Chromium + Xvfb + FFmpeg per sessione; stessa footprint; non ha infra di coordinamento → da costruire | Un processo GStreamer per sessione; scalabilità la migliore per core; ma manca layer di orchestrazione web |
| **Complessità implementativa MVP** | Alta | Media — LiveKit server + Egress con docker-compose ufficiale; template scena è HTML standard; documentazione completa. **Ma:** bridge MediaMTX → LiveKit Room richiede un piccolo servizio. | Media-Alta — Chromium headless + Xvfb + FFmpeg è infrastructure DIY; gestione process lifecycle, crash recovery, display virtuale richiede attenzione. | Alta — pipeline GStreamer in C/Python; nessun WYSIWYG editor integration; molto custom. |
| **Complessità implementativa produzione** | Alta | Media — LiveKit/Egress ha un sistema di orchestrazione nativo (API /egress, scaling, health). La parte custom è solo il template HTML scena. | Alta — tutta l'orchestrazione (spawn process, monitor, restart, scaling) è da costruire from scratch in apps/api | Alta — idem + integrazione UI molto laboriosa |
| **Licenza** | Alta | Apache 2.0 (LiveKit Server + Egress) — self-host senza restrizioni, no royalty | MIT/BSD (Chromium — Google open source, FFmpeg — LGPL/GPL) — totalmente libero | LGPL (GStreamer core) — self-host senza restrizioni |
| **Self-host** | MUST | Perfetto — Docker/K8s ufficiale, documentazione dettagliata | Perfetto — solo container Docker standard | Perfetto — disponibile in ogni distro Linux |
| **Maturità del progetto** | Media | Alta — LiveKit usato in produzione da migliaia di servizi WebRTC; Egress v1.x stabile | Media — pattern usato da StreamYard, Restream internamente ma non come progetto OSS; implementazione custom fragile | Molto Alta — GStreamer è un progetto 20+ anni, foundation industriale |
| **Template scena come pagina web** | Alta | Nativo — è il design pattern primario di RoomCompositeEgress | Nativo — identico | Non applicabile — nessun browser |
| **Editing live overlay senza interruzione stream** | MUST | Nativo — DOM update nel browser running non interrompe la cattura Egress | Nativo — identico | Richiede reinserimento element nella pipeline — può causare stutter |

---

## 4. Analisi dettagliata delle opzioni rilevanti

### 4.1 Opzione A — LiveKit + Egress (RACCOMANDATO)

**Architettura:**

```
[apps/api] crea EgressRequest via gRPC/HTTP verso Egress service
[Egress service] lancia un processo interno Chrome headless
  → apre URL: https://app.liveflow.io/scene/{session_id}?token=...
  → la pagina scene usa @livekit/client JS SDK per:
      - ricevere il feed video della creator dalla LiveKit Room
      - mostrare overlay (testo, immagine) aggiornati via WebSocket
  → Chrome cattura il frame composito
  → FFmpeg interno encode → RTMP → MediaMTX interno → fan-out ADR-0002
```

**Punti di forza chiave:**

1. Il template scena è una normale pagina Next.js/React. L'editor operatore e il renderer condividono esattamente gli stessi componenti React. WYSIWYG perfetto.
2. LiveKit Egress gestisce tutto il ciclo di vita del processo headless: avvio, health check, riavvio automatico, metriche. Non dobbiamo costruire questo layer.
3. Il design pattern "un pod Egress = una sessione" mappa perfettamente su K8s HPA: si scala orizzontalmente aggiungendo pod senza modifiche architetturali.
4. Il sistema di overlay (testo live, immagini, scene) si riduce a: l'operatore edita stato React → apps/api pubblica update via Redis pub/sub → pagina scena riceve via WebSocket → aggiorna DOM → Egress cattura frame aggiornato. Latenza update overlay: ~100–200 ms.

**Sfida principale — bridge MediaMTX → LiveKit Room:**

MediaMTX riceve WHIP dal telefono. LiveKit Room richiede che la creator sia un "participant" nella room (WebRTC). Esistono due approcci:

- *Approccio A1 (semplicissimo per PoC):* Usare LiveKit direttamente come server WHIP. LiveKit supporta WHIP nativamente dalla versione 1.5+. Il telefono pubblica WHIP direttamente a LiveKit invece che a MediaMTX. MediaMTX rimane solo per il fan-out RTMP interno (legge dall'Egress output).
- *Approccio A2 (mantiene MediaMTX as ingest):* MediaMTX riceve WHIP → espone RTMP interno → un piccolo bridge (processo FFmpeg o un client GStreamer RTMP→WebRTC) pubblica il feed nella LiveKit Room come "injected participant". Più complesso ma mantiene il singolo punto di ingest.

Per il MVP si raccomanda A1 (LiveKit come server WHIP diretto). MediaMTX resta nel path solo come router per il fan-out RTMP downstream.

**Costo CPU stimato per sessione (creator singola):**
- LiveKit Egress container: ~1.5–2 vCPU, ~900 MB RAM durante rendering
- LiveKit Server: ~0.2 vCPU, ~200 MB RAM per room con 1 publisher
- FFmpeg nell'Egress (encode H.264 software): ~0.8 vCPU aggiuntivi
- **Totale per creator:** ~2.5–3 vCPU, ~1.1 GB RAM
- Con hardware encode (NVENC): si riduce a ~1 vCPU + GPU offload
- Per 10 creator concorrenti: ~25–30 vCPU oppure ~2–4 GPU instance

### 4.2 Opzione B — Headless Custom

**Architettura:**

```
[apps/api] spawna per sessione:
  - processo Xvfb :99 (display virtuale 1920x1080)
  - processo Chromium --headless=new --display=:99
      → apre pagina scena locale
      → riceve feed via WebRTC da MediaMTX (o HLS interno)
  - processo FFmpeg:
      -f x11grab -display :99 -s 1920x1080 -r 30
      -i ...
      -c:v libx264 -preset veryfast -b:v 3000k
      -f flv rtmp://mediamtx-internal/live/{session_id}_composited
```

**Punti di forza:**
- Nessuna dipendenza da LiveKit; stack puramente Chromium + FFmpeg che già conosciamo.
- Controllo totale su ogni aspetto.

**Punti deboli rispetto ad A:**
- Tutta la gestione del ciclo di vita (spawn, health, restart, scaling) è da costruire in apps/api. Questa è esattamente la stessa complessità che si è già dovuta costruire per il fan-out FFmpeg (ADR-0002), moltiplicata per un processo più fragile (Xvfb + Chromium + FFmpeg in catena).
- Xvfb non esiste su Windows; obbliga a Linux per il deployment. Su Docker Linux va bene.
- La cattura `x11grab` dipende dal virtual framebuffer: qualsiasi crash di Xvfb abbatte tutto.
- Il feed video dalla camera: la pagina HTML deve ricevere il flusso via WebRTC da MediaMTX. MediaMTX espone WHIP/WebRTC, quindi la pagina può connettersi via JS SDK. Ma una pagina Chromium headless che stabilisce una connessione WebRTC da dentro Docker richiede configurazione ICE/STUN non banale.
- Nessun sistema di orchestrazione Egress nativo: ogni restart del browser richiede un nuovo processo Xvfb e una nuova cattura FFmpeg — possibile breve glitch sul feed composito.

### 4.3 Opzione C — GStreamer (cenno)

GStreamer è la scelta migliore in termini di latenza e uso CPU. È la tecnologia usata da soluzioni come vMix server-side e da alcune soluzioni broadcast professionali Linux.

**Perché non è adatto per il MVP di LiveFlow:**

1. La parità WYSIWYG tra editor web e rendering è impossibile senza costruire un layer di traduzione (stato React/CSS → parametri pipeline GStreamer). Questo sarebbe un sottoprogetto di 3–4 settimane da solo.
2. Overlay dinamici in tempo reale richiedono elementi `appsrc` o `gdkpixbuf` con aggiornamento via segnali GStreamer. Ogni cambio overlay può introdurre micro-glitch se non gestito correttamente.
3. La curva di apprendimento per il team (già su Node.js/TypeScript) è significativa.
4. Non offre vantaggi che giustifichino la complessità per un MVP; i vantaggi (latenza, CPU) emergono solo ad alto volume (50+ creator concorrenti con encode di qualità).

GStreamer è da rivalutare come ottimizzazione in produzione per istanze ad alto volume, non per il MVP.

---

## 5. Raccomandazione

### Per il MVP (Fase 0/1)

**Opzione A — LiveKit Server + LiveKit Egress**

Motivazione principale: il modello "template HTML scena = pagina React condivisa tra editor operatore e renderer cloud" elimina una classe intera di problemi (sincronizzazione stato editor ↔ rendering). Il team scrive una sola base di codice per entrambi i contesti. LiveKit Egress gestisce il ciclo di vita del processo headless (che è la parte più fragile della Opzione B), liberando apps/api dalla responsabilità di orchestrare processi OS.

La complessità aggiuntiva di LiveKit (server WebRTC) è compensata dall'eliminazione della complessità di orchestrazione che l'Opzione B richiederebbe.

Approccio ingest raccomandato: il telefono pubblica WHIP direttamente a LiveKit Server (che supporta WHIP nativo dalla v1.5). MediaMTX rimane nel path di output (riceve RTMP dall'Egress e lo distribuisce al fan-out).

### Per la produzione (Fase 2+)

Mantenere LiveKit + Egress come architettura base. Ottimizzare il container Egress con encode hardware (NVENC su macchine GPU) quando il numero di creator concorrenti supera i 10–15. A 50+ creator concorrenti, valutare l'aggiunta di un layer GStreamer per i tipi di scena più semplici (solo camera senza overlay complessi) come ottimizzazione CPU, mantenendo Egress per scene con overlay ricchi.

---

## 6. Diagramma testuale del flusso completo

```
STUDIO LIVE — FLUSSO ARCHITETTURALE
=====================================

TELEFONO CREATOR
+-------------------------------+
|  Camera app / browser mobile  |
|  WHIP publish (WebRTC)        |
+---------------+---------------+
                |
                |  WHIP  (WebRTC / ICE)
                |  wss://liveflow.io/whip/live/{room_id}
                v
+-------------------------------+
|     LIVEKIT SERVER            |
|     (SFU / WHIP endpoint)     |
|                               |
|  Room: {session_id}           |
|  Participant: creator (pub)   |
|  Participant: egress (sub)    |
|                               |
|  API gRPC :7880               |
|  WebSocket :7881              |
+------+--------------------+---+
       |                    |
       |  Subscribe         |  LiveKit SDK
       |  (WebRTC track)    |  (JS, nella pagina scena)
       |                    |
       v                    v
+-------------------------------+    +--------------------------------+
|   LIVEKIT EGRESS              |    |  OPERATORE (web app Next.js)   |
|   (container Docker)          |    |  Dashboard editor scena:       |
|                               |    |  - drag overlay immagine       |
|   Chrome headless             |    |  - modifica testo live         |
|   apre: /scene/{session_id}   |    |  - switch scena                |
|                               |    |  - preview live (WebRTC sub)   |
|   Pagina riceve feed WebRTC   +<---+  (stesso React component)      |
|   dal LiveKit Room +          |    |                                |
|   overlay aggiornati via WS   |    +------------+-------------------+
|                               |                 |
|   Chrome cattura frame        |                 |  WebSocket / REST
|   @ 30fps                     |                 |  overlay update
|                               |                 v
|   FFmpeg interno encode       |    +--------------------------------+
|   H.264 + AAC                 |    |   apps/api (NestJS)            |
|   → RTMP out                  |    |   - SceneStateService          |
+------+------------------------+    |   - Redis pub/sub broadcast    |
       |                             |   - EgressOrchestrator         |
       | RTMP (output composito)     |     (start/stop/health Egress) |
       | rtmp://mediamtx:1935/       |   - SessionManager             |
       |   live/{session_id}_out     |     (JWT, ADR-0003)            |
       v                             +--------------------------------+
+-------------------------------+
|     MEDIAMTX (interno)        |
|     (RTMP router)             |
|                               |
|     Riceve stream composito   |
|     Espone path per fan-out   |
+------+----+------------------+
       |    |   ...
       |    |   N target
       v    v
+----------+  +----------+  +----------+
| FFmpeg   |  | FFmpeg   |  | FFmpeg   |  <-- ADR-0002: un processo
| target 1 |  | target 2 |  | target N |      per target, orchestrati
| (Twitch) |  | (YouTube)|  | (TikTok) |      da apps/api
+----------+  +----------+  +----------+
     |             |             |
     v             v             v
  RTMP/S        RTMP/S        RTMP/S
  Twitch        YouTube       TikTok
  ingest        ingest        ingest
```

**Flusso dati passo per passo:**

```
1. Creator apre l'app mobile → preme "Go Live"
   apps/api crea sessione JWT (ADR-0003), crea LiveKit Room, avvia EgressRequest

2. Telefono pubblica WHIP → LiveKit Server
   LiveKit Room ha: publisher (telefono) + subscriber (Egress)

3. Egress apre Chrome headless → carica /scene/{session_id}
   La pagina React:
   a. Si connette alla LiveKit Room come viewer (JS SDK)
   b. Riceve il feed video del telefono via WebRTC
   c. Mostra feed in un <video> element
   d. Mostra overlay (testo, immagine) dallo stato condiviso
   e. Apre WS verso apps/api → SceneStateService

4. Operatore edita overlay nella dashboard:
   → PUT /api/sessions/{id}/scene { overlays: [...] }
   → apps/api aggiorna stato in Redis
   → SceneStateService broadcast via WS alla pagina scena
   → DOM aggiorna overlay in <100 ms
   → Egress cattura frame aggiornato al prossimo tick (30fps)

5. Egress encode H.264 → RTMP → MediaMTX :1935/live/{session_id}_out

6. apps/api (già da ADR-0002) ascolta MediaMTX evento "publisher connesso"
   → per ogni target della sessione avvia processo FFmpeg indipendente
   → ogni FFmpeg legge rtmp://mediamtx:1935/live/{session_id}_out
   → ogni FFmpeg scrive verso la piattaforma di destinazione

7. Stop live: operatore preme Stop
   → apps/api ferma EgressRequest (LiveKit API)
   → termina i processi FFmpeg target (ADR-0002)
   → chiude Room LiveKit
   → marca sessione come terminata nel DB
```

---

## 7. Rischi aperti

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| RC1 | **Latenza complessiva telefono → viewer** può superare 8–10 s | Media | Alto | Misurare nella PoC: WHIP LiveKit aggiunge ~100 ms; Egress Chrome capture ~300 ms; encode ~100 ms; totale stimato 2–4 s end-to-end. Se inaccettabile: ottimizzare con `--enable-features=VaapiVideoDecoder` in Chrome headless o passare a encode NVENC. |
| RC2 | **Bridge MediaMTX → LiveKit** (se si mantiene MediaMTX come unico ingest) | Alta (se A2) | Medio | Per MVP usare approccio A1 (WHIP diretto a LiveKit); MediaMTX eliminato dal path di ingest. Rivalutare A2 solo se emerge requisito specifico (es. SRT ingest da OBS). |
| RC3 | **Chrome headless crash** in Egress interrompe il live | Bassa (LiveKit Egress ha auto-restart) | Alto | LiveKit Egress ha health monitoring interno con restart automatico; configurare `restartDelay` in EgressRequest. Validare nel PoC con stress test. |
| RC4 | **Costo infra 2.5–3 vCPU/creator** troppo elevato al crescere | Media (futuro) | Medio | Accettabile per MVP (5–10 creator); per 50+ creator valutare GPU instance (NVENC dimezza CPU) o GStreamer per scenari semplici. Monitorare con cost tracker. |
| RC5 | **Sincronizzazione stato scena** (overlay) con latenza WS > 200 ms | Bassa | Medio | Redis pub/sub garantisce delivery < 10 ms sul backend; latenza WS → pagina headless ~ 50–100 ms; totale overlay update < 200 ms. Validare nel PoC. |
| RC6 | **WHIP LiveKit vs SRT/RTMP dall'app mobile nativa** (iOS, Fase successiva) | Media (futuro) | Medio | App iOS futura può pubblicare RTMP/SRT. Mantieni MediaMTX come alternativa di ingest per SRT; aggiungere bridge RTMP→LiveKit Room quando serve (ADR separato). |
| RC7 | **Multi-tenant isolation**: un bug nel SceneStateService invia overlay di sessione A alla sessione B | Bassa | Molto Alto | Ogni LiveKit Room ha token differenziato per `room_id`; ogni WS connection è scoped a `session_id` con validazione JWT; ogni EgressRequest apre una URL scena con token di sola lettura per quella sessione. Test di isolation obbligatori prima del go-live. |
| RC8 | **Template scena condiviso** operatore e Egress: desync di stato se la pagina Egress perde WS | Bassa | Medio | Implementare riconnessione automatica WS + last-state-snapshot all'apertura della pagina. Lo stato è in Redis con TTL = durata sessione. |

---

## 8. Note di licenza

- **LiveKit Server**: Apache 2.0 — self-host illimitato, no royalty.
- **LiveKit Egress**: Apache 2.0 — idem.
- **Chromium** (dentro Egress): Google BSD License — nessuna restrizione per uso server-side.
- **FFmpeg** (dentro Egress): configurazione LGPL o GPL a seconda dei codec compilati; l'immagine ufficiale di Egress usa FFmpeg con codec standard (libx264 LGPL-compatible se linkato dinamicamente). Verificare la specifica immagine usata.
- Nessun componente richiede licenza commerciale per self-host.
