# Multi-Browser Cloud Farm — Architettura
> LiveFlow / Sistema Architect — Discovery  
> Data: 2026-05-26  
> Motivazione: LiveJasmin (e future piattaforme simili) accettano SOLO virtual camera via JasminCam / getUserMedia; nessun ingest RTMP esterno disponibile. Per supportarle serve iniettare la nostra sorgente LiveKit come webcam reale all'interno di un browser cloud controllato dall'operatore.  
> Riferimenti: `TECH_CAPABILITY_MATRIX.md` §4, `ADR-0004` (LiveKit Egress), `ADR-0001` (multi-tenancy), `ADR-0006` (LiveKit dev/prod)

---

## 1. Problema e vincoli non negoziabili

**Problema:** 1+ piattaforme cam richiedono che il broadcaster installi il loro client proprietario (JasminCam) o usi il browser direttamente con accesso a `getUserMedia`. Non esiste endpoint RTMP. L'unico modo per iniettare il nostro video composito è presentarsi come una camera USB/reale al browser che gira sulla macchina (o nel cloud).

**Vincoli ereditati dall'architettura esistente:**
- Sorgente video è già una LiveKit Room (telefono → WHIP → LiveKit Server, ADR-0004).
- Multi-tenant: isolamento per `agency_id` obbligatorio su ogni risorsa (ADR-0001).
- Deployment prod su host Linux; dev su Windows (ADR-0006 avverte di WSL2/Docker per WebRTC media).
- La console dell'operatore è Next.js; integrazioni UI aggiuntive devono rispettare il design system esistente.
- L'engine anti-detect è in ricerca parallela (`ANTIDETECT_BROWSER_RESEARCH.md`); questa architettura lo tratta come plug-in sostituibile.

---

## 2. Flusso end-to-end

```
CONTROL PLANE (apps/api NestJS)
 ├── BrowserSessionService
 │     POST /sessions          → crea sessione DB + sceglie container slot
 │     POST /sessions/:id/start → avvia container, inietta configurazione
 │     POST /sessions/:id/stop  → ferma container, archivia profilo cookie
 │     GET  /sessions/:id/token → token JWT operatore per accesso VNC/CDP
 └── ProxyAssignmentService    → assegna proxy pool per-tenant

         │ gRPC / HTTP interno
         ▼

FARM RUNTIME (Kubernetes / Docker Compose prod)
  ┌─────────────────────────────────────────────────────┐
  │  Session Container (1 per sessione attiva)           │
  │                                                       │
  │  ┌─────────────────────┐  /dev/video0 (v4l2loopback) │
  │  │  GStreamer / FFmpeg  │◄──────────────────────────┐ │
  │  │  (LiveKit consumer) │                            │ │
  │  └─────────────────────┘                            │ │
  │          ▲                                          │ │
  │          │ WebRTC (LiveKit JS SDK, Node.js worker)  │ │
  │          │                                          │ │
  │  ┌───────────────────┐        ┌──────────────────┐  │ │
  │  │ livekit-ingestor  │        │ Virtual Camera    │  │ │
  │  │ (Node.js process) │──────► │ /dev/video0       │  │ │
  │  └───────────────────┘  pipe  │ (v4l2loopback)    │  │ │
  │                               └──────────────────┘  │ │
  │                                         │            │ │
  │                                         ▼            │ │
  │  ┌──────────────────────────────────────────────┐    │ │
  │  │  Chromium (--use-fake-device-for-media-stream │    │ │
  │  │   DISABLED; uses /dev/video0 via V4L2)        │    │ │
  │  │                                               │    │ │
  │  │  Profilo: /profiles/<session_id>/             │    │ │
  │  │  Proxy:   --proxy-server=socks5://...         │    │ │
  │  │  Fingerprint: injected via CDP preload        │    │ │
  │  │                                               │    │ │
  │  │  Sito cam (es. LiveJasmin): getUserMedia()    │    │ │
  │  │    → vede /dev/video0 come "HD Camera"        │    │ │
  │  └──────────────────────────────────────────────┘    │ │
  │                                                       │ │
  │  ┌──────────────────┐                                 │ │
  │  │  Neko / KasmVNC  │  WebRTC screen share ───────────┘ │
  │  │  (remote display)│◄── operatore Console Next.js       │
  │  └──────────────────┘                                    │
  └─────────────────────────────────────────────────────────┘

SORGENTE VIDEO
  Telefono creator
      │ WHIP
      ▼
  LiveKit Server
      │ (Room: <session_room_id>)
      ▼
  livekit-ingestor (dentro container sessione)
      │ consuma track video LiveKit
      │ pipe YUV/RAW → v4l2loopback /dev/video0
      ▼
  Chromium getUserMedia() → vede camera "reale"
      │
      ▼
  Sito cam (LiveJasmin, Streamate, ecc.)
```

**Audio path (opzionale):**
```
LiveKit audio track → livekit-ingestor → pipe PCM → ALSA virtual device (snd_aloop)
    → Chromium MediaDevices.getUserMedia({ audio: true }) → sito cam
```

---

## 3. Opzione runtime farm

### 3.1 Tabella comparativa

| Opzione | Isolamento | V4L2 loopback | Remote display built-in | Complessità setup | Costo risorse/sessione | Anti-detect friendliness | Licenza |
|---------|-----------|---------------|------------------------|-------------------|----------------------|--------------------------|---------|
| **A. Docker + Chromium puro (RACCOMANDATO)** | Container-level | Si (v4l2loopback nel container con device passthrough) | No built-in → aggiungere Neko o x11vnc | Media | Bassa (~1 vCPU, ~1 GB RAM) | Alta (immagine custom, controllo totale) | Libero |
| **B. Neko (n.eko)** | Container | Si (custom build necessario) | Si (WebRTC nativo, eccellente UX) | Bassa-media | Media (~1.5 vCPU, ~1.5 GB RAM) | Media (immagine nota, fingerprint Neko) | Apache 2 |
| **C. Kasm Workspaces** | Container + namespace | Possibile ma non documentato ufficialmente | Si (WebRTC, dashboard integrata) | Alta (Kasm control plane) | Alta (~2 vCPU, ~2 GB RAM + overhead Kasm) | Media (infra Kasm riconoscibile) | Community free / Enterprise |
| **D. browserless** | Process-level (stesso host) | No (non gestisce media devices) | No (solo CDP) | Bassa | Bassa (~0.5 vCPU) | Bassa (fingerprint browserless noto) | Elastic 2.0 (non-commercial free) |
| **E. Selenium Grid** | Container opzionale | Richiede configurazione manuale | No | Media | Media | Bassa (User-Agent Selenium noto) | Apache 2 |
| **F. Steel.dev** | Cloud gestito | No | No | Bassissima (SaaS) | Alta (SaaS pricing) | Media | Proprietario SaaS |
| **G. Hero/Ulixee** | Process | No | No | Media | Bassa | Alta (anti-detect nativo) | MIT |

### 3.2 Raccomandazione: Opzione A (Docker + Chromium puro) + Neko per remote display

**Motivazione:**
- V4L2 loopback richiede un device kernel `/dev/videoN` nel container. Solo i container Docker con accesso a device host (o con `--privileged` in dev, capability fine-grained in prod: `CAP_SYS_ADMIN` + `/dev/video0` device cgroup) lo supportano in modo affidabile. Le opzioni B-G non sono progettate intorno a questo requisito.
- Neko risolve il problema del remote display con WebRTC di qualità, ma usa Chromium pre-configurato. La strategia raccomandata è prendere l'immagine base Neko (che gestisce Xvfb + PulseAudio + WebRTC screen share) e montarci sopra v4l2loopback + il nostro Chromium. In alternativa, Opzione A con x11vnc è più leggera ma con UX peggiore.
- browserless e Selenium Grid non gestiscono media devices e non sono adatti.
- Steel.dev è SaaS: nessun controllo su networking, fingerprint, V4L2 — escluso.
- Hero/Ulixee eccellente per anti-detect ma senza display remoto né V4L2 gestiti.

**Struttura container raccomandata:**
```
Immagine base: ubuntu:22.04
Layer: v4l2loopback-dkms (o modulo pre-compilato per kernel host)
Layer: PulseAudio + snd_aloop (virtual audio)
Layer: Xvfb (virtual display) + x11vnc / Neko WebRTC server
Layer: Chromium (non-sandboxed, --no-sandbox in container)
Layer: Node.js + livekit-ingestor process
Layer: Anti-detect patch (plug-in, vedi §6)
Entrypoint: supervisor / s6-overlay orchestra i processi
```

**Nota critica sul kernel module:** `v4l2loopback` deve corrispondere al kernel dell'host Docker (non del container). Due strategie:
1. Prod (Linux host): il modulo viene caricato sull'host (`modprobe v4l2loopback`) e il device `/dev/videoN` viene passato al container via `--device /dev/video0:/dev/video0`. Questa è l'opzione sicura e production-grade.
2. Dev (Windows/WSL2): non funziona direttamente. Serve una VM Linux (VirtualBox/Hyper-V) o un host Linux remoto per lo spike di validazione. Docker Desktop su Windows non espone device V4L2 al container.

---

## 4. Iniezione video: confronto opzioni

### 4.1 Tabella comparativa

| Opzione | Come funziona | Rilevabilità | Latenza aggiunta | Complessità | Audio separato | Funziona senza root/priv |
|---------|--------------|-------------|-----------------|------------|----------------|--------------------------|
| **A. v4l2loopback + GStreamer/FFmpeg (RACCOMANDATO)** | Kernel module crea /dev/videoN; FFmpeg/GStreamer scrive frame YUV4MPEG; Chromium vede device reale tramite V4L2 | Molto bassa (device come camera USB fisica) | ~50-150 ms (dipende dal pipeline) | Media | Si (snd_aloop per audio) | No (richiede CAP_SYS_ADMIN o device mount) |
| **B. Override getUserMedia via CDP/preload** | Script iniettato nella pagina intercetta `navigator.mediaDevices.getUserMedia`; restituisce MediaStream da PeerConnection WebRTC verso LiveKit room | Alta (pattern JS rilevabile, overrides fingerprint) | ~200-500 ms (WebRTC nested) | Bassa | Si (AudioContext) | Si |
| **C. --use-fake-device-for-media-stream** | Flag Chromium usa file Y4M o loop; non accetta stream live reale | Alta (flag rilevabile da CDP) | N/A (non live) | Nulla | Limitato | Si |

### 4.2 Raccomandazione: Opzione A (v4l2loopback)

**Perché A è superiore:**

1. **Non rilevabilità:** il sito cam interroga `navigator.mediaDevices.enumerateDevices()` e vede un device V4L2 con un nome configurabile (es. "Logitech HD Pro Webcam C920"). Nessuna differenza rispetto a una camera USB fisica. L'Opzione B è intercettabile sia lato JS (prototype chain tampering detection) sia lato WebRTC (due livelli di PeerConnection sono anomali nei log ICE).

2. **Stabilità A/V:** il pipeline FFmpeg/GStreamer riceve la traccia video dalla LiveKit Room (via `livekit-server-sdk` Node.js o `livekit-cli consume`) e la scrive su `/dev/video0` come frame RAW. Il frame rate e la risoluzione sono controllati lato ingestor, non dal sito cam. L'Opzione B delega la qualità all'implementazione WebRTC del sito cam, che può fare downgrade.

3. **Sincronizzazione A/V:** con v4l2loopback + snd_aloop i device audio e video sono indipendenti ma sincronizzati dal pipeline GStreamer (gst-launch con `audiotestsrc` o `pulsesrc` → `alsasink hw:Loopback,0,0`). L'Opzione B deve gestire la sincronizzazione A/V via AudioContext che è più fragile.

**Pipeline livekit-ingestor (schema):**
```
LiveKit Room (room_id) 
    └── subscribe to video track (TrackKind.VIDEO)
        └── RTCPeerConnection ontrack
            └── MediaStreamTrack frames (VideoFrame API / canvas)
                └── encoder: YUV420 pipe → FFmpeg stdin
                    └── FFmpeg → v4l2loopback /dev/video0
                        (rawvideo, pix_fmt=yuv420p, framerate=30, size=1280x720)
```

Implementazione concreta (Node.js `livekit-server-sdk` + `@livekit/rtc-node` per accesso raw frame), oppure approccio alternativo via `livekit-cli` con pipe su stdout + FFmpeg consumer. Il secondo è più semplice per lo spike.

**Risoluzione e FPS:** parametri configurabili per-sessione. LiveJasmin richiede fino a 1920x1080 30fps. Impostare `v4l2loopback` con `max_width=1920, max_height=1080, max_frame_rate=30`.

**Audio:** opzionale nella fase di spike (LiveJasmin può accettare sorgente audio del microfono fisico o silenzio). Per produzione: `snd_aloop` modulo kernel, ALSA loopback device, GStreamer legge traccia audio LiveKit e scrive su hw:Loopback,0,0.

---

## 5. Controllo operatore (remote display)

### 5.1 Requisiti UX
L'operatore dalla Console Next.js deve:
- Vedere lo schermo del browser di ogni sessione in tempo reale (ritardo < 500 ms accettabile).
- Inviare click, input tastiera, scroll.
- Aprire URL nel browser della sessione via API (es. navigare a livejasmin.com).
- Vedere una griglia di anteprime di tutte le sessioni attive.

### 5.2 Opzioni di remote display

**Opzione R1: Neko (n.eko) WebRTC**
- Neko gira nel container e fa screen capture via X11/Xvfb + FFmpeg + WebRTC (WHIP/WHEP custom).
- Latenza: ~200-400 ms (WebRTC, accettabile).
- UI: Neko espone una pagina web embeddabile in iframe o come component React via API.
- Pro: costruito esattamente per questo caso d'uso, stabile, community attiva.
- Contro: aggiunge ~300 MB all'immagine container; il Chromium di Neko va sostituito con la nostra build custom (v4l2, anti-detect patch).

**Opzione R2: CDP `Page.startScreencast` + input forwarding via WebSocket**
- Il backend NestJS apre una connessione CDP al Chromium del container.
- `Page.startScreencast` invia frame JPEG via WebSocket al backend → il backend li fa stream al client Next.js via WebSocket/SSE.
- Input: il client invia eventi mouse/keyboard → backend → `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` CDP.
- Pro: nessun processo aggiuntivo nel container, controllo totale, latenza comparabile a Neko per frame rate moderato.
- Contro: `startScreencast` è CPU-intensivo a frame rate alto (>15 fps); il relay WebSocket aggiunge un hop; la scalabilità richiede WebSocket proxy per N sessioni nel backend.

**Opzione R3: noVNC + x11vnc**
- x11vnc espone il display Xvfb come server VNC; noVNC nel browser si connette via WebSocket.
- Pro: semplice, robusto, zero dipendenze custom.
- Contro: latenza alta (~500-1000 ms), qualità immagine inferiore, nessuna compressione video moderna; VNC non usa WebRTC.

**Raccomandazione:** Opzione R1 (Neko) per produzione; Opzione R2 (CDP screencast) per lo spike (più veloce da implementare, zero dipendenze extra nel container). Migrare a Neko nella fase di hardening.

### 5.3 Integrazione Console Next.js

```
Console Agenzia (Next.js)
  ├── /sessions                    → lista sessioni attive (grid thumbnails)
  │     ogni thumbnail: ultimo frame JPEG via polling o SSE
  ├── /sessions/[id]/viewer        → viewer full-screen (iframe Neko o WebRTC stream)
  │     + sidebar: URL bar, status LiveKit, proxy info
  └── /sessions/[id]/controls      → azioni: start/stop, cambio proxy, screenshot
```

Il `BrowserSessionService` in `apps/api` gestisce la mappatura `session_id → container_host:port` e i token di accesso (JWT con scadenza breve) per autorizzare la connessione al display remoto.

---

## 6. Proxy e fingerprint come plug-in

### 6.1 ProxyAssignmentService

Il servizio mantiene un pool di proxy (SOCKS5/HTTP) e assegna un proxy per sessione. Isolamento: proxy diversi per sessioni di tenant diversi (ADR-0001). Rotazione proxy: configurabile per sessione (nessuna rotazione durante una live attiva; rotazione al riavvio del profilo).

**Schema di configurazione proxy passata al container:**
```
--proxy-server=socks5://proxy-host:port
--proxy-auth=user:pass (o autenticazione IP-based nel container)
```

Proxy supportati: SOCKS5 (residenziali/datacenter), HTTP CONNECT. Integrazione con provider (Bright Data, Oxylabs, ecc.) tramite `ProxyProviderAdapter` interface.

### 6.2 Fingerprint plug-in

L'engine anti-detect (da `ANTIDETECT_BROWSER_RESEARCH.md`, ancora da completare) viene integrato tramite un'interfaccia:

```typescript
interface FingerprintProfile {
  userAgent: string;
  platform: string;
  languages: string[];
  screen: { width: number; height: number; colorDepth: number };
  timezone: string;
  webgl: WebGLFingerprint;
  canvas: CanvasFingerprint;
  fonts: string[];
  hardware: { concurrency: number; deviceMemory: number };
  // ... altri parametri
}

interface FingerprintEngine {
  generate(options?: Partial<FingerprintProfile>): FingerprintProfile;
  applyViaCDP(session: CDPSession, profile: FingerprintProfile): Promise<void>;
  applyViaPreload(profile: FingerprintProfile): string; // script JS iniettato
}
```

Il `BrowserSessionService` chiama `FingerprintEngine.generate()` alla creazione della sessione e salva il profilo nel record `BrowserSession`. Il profilo è stabile per tutta la durata della sessione (coerenza tra reload) e viene associato al profilo cookie persistente.

Motori candidati (da confermare con la ricerca parallela):
- Camoufox (fork Firefox, anti-detect nativo) — ottimo ma non Chromium
- Playwright `stealth` plugin
- `puppeteer-extra-plugin-stealth`
- Rebrowser patches (Chromium patch-based)
- GoLogin / Multilogin SDK (commerciale, API-based)

---

## 7. Modello dati e API (NestJS)

### 7.1 Entità principali

```typescript
// packages/shared-types/src/browser-farm.ts

interface BrowserSession {
  id: string;                          // UUID
  tenantId: string;                    // agency_id (ADR-0001 isolamento)
  creatorId: string;                   // FK Creator
  liveKitRoomId: string;               // room da cui consumare il video
  platformId: string;                  // piattaforma target (es. "livejasmin")
  status: 'pending' | 'starting' | 'active' | 'error' | 'stopped';
  containerId?: string;                // Docker/K8s pod ID
  containerHost?: string;              // host:port del container
  cdpPort?: number;                    // porta CDP Chromium
  displayPort?: number;                // porta Neko/VNC
  proxyId?: string;                    // FK ProxyEntry
  fingerprintProfileId?: string;       // FK FingerprintProfile
  profilePath: string;                 // path persistente profilo cookie
  videoDevice?: string;                // es. "/dev/video0"
  audioDevice?: string;                // es. "hw:Loopback,0,0"
  createdAt: Date;
  startedAt?: Date;
  stoppedAt?: Date;
  lastHealthAt?: Date;
  metadata: Record<string, unknown>;   // dati extra piattaforma
}

interface ProxyEntry {
  id: string;
  tenantId: string;
  protocol: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;                   // cifrato at-rest (AES-256-GCM, ADR-0003 pattern)
  provider: string;                    // "brightdata" | "oxylabs" | "static" | ...
  country?: string;
  isActive: boolean;
  assignedSessionId?: string;          // null se disponibile
}

interface FingerprintProfile {
  id: string;
  tenantId: string;
  engine: string;                      // "camoufox" | "stealth" | "gologin" | ...
  profile: Record<string, unknown>;    // payload opaco dell'engine
  sessionId?: string;                  // FK BrowserSession (1:1 durante sessione)
  createdAt: Date;
}
```

### 7.2 API endpoints (NestJS BrowserFarmModule)

```
POST   /browser-sessions
         body: { creatorId, liveKitRoomId, platformId, proxyId? }
         → crea BrowserSession, assegna proxy e fingerprint, restituisce id

POST   /browser-sessions/:id/start
         → alloca container, avvia livekit-ingestor, avvia Chromium
         → stato: pending → starting → active

POST   /browser-sessions/:id/stop
         → ferma container, persiste profilo cookie, libera proxy
         → stato: active → stopped

GET    /browser-sessions/:id/status
         → stato corrente + health metrics (fps ingestor, latenza CDP)

GET    /browser-sessions/:id/display-token
         → JWT breve (60s) per accesso operatore al display remoto

POST   /browser-sessions/:id/navigate
         body: { url }
         → CDP Page.navigate

POST   /browser-sessions/:id/screenshot
         → CDP Page.captureScreenshot → base64 JPEG

GET    /browser-sessions
         query: { tenantId, status, creatorId }
         → lista paginata sessioni (M4.3 monitoring wall)

GET    /proxies
         → pool disponibili per tenant

POST   /proxies
         → aggiunge proxy al pool
```

### 7.3 Moduli NestJS

```
apps/api/src/browser-farm/
  browser-farm.module.ts
  browser-session/
    browser-session.service.ts       // orchestrazione lifecycle container
    browser-session.controller.ts
    browser-session.entity.ts
  container-orchestrator/
    container-orchestrator.service.ts  // Docker API / K8s client
    container-orchestrator.interface.ts // plug-in: DockerAdapter | K8sAdapter
  livekit-ingestor/
    livekit-ingestor.service.ts      // avvia/monitora processo ingestor nel container
  proxy/
    proxy.service.ts
    proxy.entity.ts
  fingerprint/
    fingerprint.service.ts
    fingerprint-engine.interface.ts  // plug-in engine
  display/
    display.service.ts               // gestisce accesso CDP/Neko per operatore
```

---

## 8. Costi e scalabilità

### 8.1 Stima risorse per sessione (host Linux)

| Componente | CPU (vCPU) | RAM | Banda (inbound) | Banda (outbound) |
|-----------|-----------|-----|----------------|-----------------|
| livekit-ingestor (Node.js + SDK) | 0.3 | 200 MB | ~3 Mbps (LiveKit track 1080p) | trascurabile |
| FFmpeg /dev/video0 writer | 0.5 | 100 MB | — | — |
| Chromium (sito cam attivo, nessun render pesante) | 0.8-1.2 | 600-800 MB | trascurabile | ~3-6 Mbps (upload al sito cam) |
| Neko server (display WebRTC) | 0.3 | 150 MB | — | ~2-4 Mbps (screen share operatore) |
| Xvfb + PulseAudio | 0.1 | 50 MB | — | — |
| **Totale per sessione** | **~2-2.5 vCPU** | **~1.2-1.4 GB** | **~3 Mbps** | **~5-10 Mbps** |

### 8.2 Scenario 10 sessioni concorrenti (un'agenzia media)

| Risorsa | 10 sessioni |
|---------|------------|
| vCPU | 20-25 |
| RAM | 12-14 GB |
| Banda uscita | 50-100 Mbps |
| Storage profili cookie | ~500 MB (50 MB/profilo) |

**Host consigliato per 10 sessioni:** 4× VPS dedicati con 8 vCPU / 16 GB RAM ciascuno (costo ~$80-120/mese per VPS, dipende dal provider). Alternativa: 1 bare-metal 32 vCPU / 64 GB RAM.

### 8.3 Scalabilità a decine di sessioni

- **K8s con autoscaling:** ogni sessione = 1 Pod con richieste/limiti definiti. HPA scala il numero di nodi worker in base a CPU/RAM. Approccio identico a LiveKit Egress (ADR-0004 §Consequences).
- **Device V4L2 per nodo:** ogni nodo Linux host deve avere `v4l2loopback` caricato con `video_nr=0,1,2,...,N` (N = massimo sessioni simultanee per nodo). Il container montato riceve il device specifico. Questa è la limitazione principale di scalabilità orizzontale (non illimitata su un singolo host). Soluzione: affinità nodo + bin-packing per massimizzare utilizzo.
- **GPU (opzionale):** encoding hardware (NVENC) per la pipeline FFmpeg riduce il carico CPU del 40-60%. Necessario a >20 sessioni per nodo se si vuole contenere i costi. Richiede nodi con GPU NVIDIA.
- **Profili cookie:** storage condiviso (NFS / S3 FUSE mount) per persistenza cross-restart senza accoppiamento a un nodo specifico.

---

## 9. Piano di spike — ordinato per rischio

### Spike S1 (CRITICO — 1-2 giorni): "v4l2loopback su Linux + Chromium vede /dev/video0"

**Obiettivo:** dimostrare che è possibile iniettare un video in un Chromium containerizzato via v4l2loopback e che un sito di test che usa `getUserMedia()` lo vede come camera reale.

**Non richiede LiveKit — usa una sorgente video di test.**

**Setup minimo:**
```bash
# Su un host Linux (o VM Linux, NON Docker Desktop su Windows)
sudo modprobe v4l2loopback video_nr=0 card_label="LiveFlow Cam" exclusive_caps=1

# Scrivi un test video su /dev/video0
ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \
       -f v4l2 /dev/video0

# Avvia Chromium nel container con device montato
docker run --rm \
  --device /dev/video0:/dev/video0 \
  --cap-add SYS_ADMIN \
  -p 9222:9222 \
  chromium-test-image \
  chromium-browser --no-sandbox --disable-gpu \
    --remote-debugging-port=9222 \
    --use-gl=osmesa

# Apri una pagina HTML di test che chiama getUserMedia() e disegna su <canvas>
# Verifica: la pagina mostra il testsrc pattern
```

**Pagina HTML di test (test-getUserMedia.html):**
```html
<video id="v" autoplay></video>
<script>
navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(s => { document.getElementById('v').srcObject = s; })
  .catch(e => console.error(e));
</script>
```

**Validazione:** la `<video>` mostra il testsrc FFmpeg. `enumerateDevices()` restituisce `"LiveFlow Cam"` come nome. Nessun errore `getUserMedia`.

**Su Windows (dev locale):** non fattibile direttamente. Opzioni:
1. VM VirtualBox/VMware con Ubuntu 22.04 — sufficiente per lo spike.
2. WSL2 con kernel custom (buildare kernel WSL2 con `CONFIG_VIDEO_V4L2=m` + v4l2loopback) — fattibile ma complesso, non raccomandato per lo spike.
3. VPS Linux remoto (DigitalOcean/Hetzner, $5-10) — più rapido, raccomandato.

**Criteri di successo:** video visibile in Chromium containerizzato via `/dev/video0`, identificato come camera V4L2.

---

### Spike S2 (CRITICO — 2-3 giorni): "LiveKit track → /dev/video0"

**Obiettivo:** sostituire il `testsrc` di FFmpeg con la traccia video reale consumata da una LiveKit Room.

**Dipendenza da S1 completato.**

**Approccio:**
1. Avviare un LiveKit server (dev, nativo come da ADR-0006 su Windows, oppure container su Linux).
2. Pubblicare una traccia video di test nella room (es. dal browser con `livekit-client`, oppure con `livekit-cli publish`).
3. Nel container Linux: il processo `livekit-ingestor` (Node.js) usa `@livekit/rtc-node` (binding nativo del SDK LiveKit per Node.js, non WebRTC browser) per sottoscrivere la room e ricevere raw frame.
4. Pipe raw YUV420 → FFmpeg stdin → `/dev/video0`.

**Nota tecnica:** `@livekit/rtc-node` usa `libwebrtc` nativo e produce `VideoFrame` oggetti. La pipeline è:
```
onTrackReceived → track.on('frame', (frame) => pipe.write(frame.buffer)) → FFmpeg
```
Alternativa più semplice per lo spike: `livekit-cli consume --room R --identity bot --output-file video.yuv` (se supporta output stream) → FFmpeg legge da stdin.

**Criteri di successo:** traccia video live da LiveKit Room appare in Chromium come `/dev/video0`, latenza end-to-end < 2 s.

---

### Spike S3 (ALTO RISCHIO — 2-3 giorni): "Sito cam reale (LiveJasmin test) vede la camera"

**Obiettivo:** validare che LiveJasmin (o un altro sito che usa `getUserMedia`) accetti la nostra camera virtuale nel proprio flusso di broadcast.

**Dipendenza da S2 completato. Richiede account creator LiveJasmin.**

**Approccio:**
1. Sessione container con v4l2loopback attivo + livekit-ingestor funzionante.
2. Aprire livejasmin.com in Chromium nel container.
3. Completare il flusso di login + avvio broadcast (manualmente via remote display CDP screencast).
4. Verificare che JasminCam / il browser di LiveJasmin veda la nostra camera virtuale.

**Rischi specifici di S3:**
- LiveJasmin usa JasminCam (app nativa) per il broadcast: potrebbe non funzionare solo con il browser. Da verificare se esiste una modalità "browser diretto" senza JasminCam.
- LiveJasmin potrebbe rilevare Chromium headless/containerizzato (fingerprint, feature detection).
- Il sito cam potrebbe rifiutare device camera senza certificato TLS su dominio reale (getUserMedia richiede HTTPS — ok se il sito è livejasmin.com stesso, non localhost).

**Criteri di successo:** LiveJasmin vede il feed video della room LiveKit tramite la camera virtuale nel Chromium containerizzato. Il broadcast risulta attivo dalla dashboard LiveJasmin.

---

### Spike S4 (MEDIO — 1 giorno): "Remote display operatore funziona"

**Obiettivo:** validare che l'operatore veda e controlli la sessione dalla Console Next.js.

**Approccio per spike:** implementare CDP `Page.startScreencast` → WebSocket relay NestJS → component React.

**Criteri di successo:** operatore vede lo schermo Chromium aggiornato a ~10 fps con latenza < 1 s; click e tastiera funzionano.

---

### Spike S5 (BASSO — 0.5 giorni): "Isolamento multi-sessione sullo stesso host"

**Obiettivo:** avviare 3 sessioni container contemporaneamente sullo stesso host, ciascuna con `/dev/video0`, `/dev/video1`, `/dev/video2` propri, e verificare che non ci sia cross-contamination.

**Approccio:** `v4l2loopback video_nr=0,1,2` sull'host; ogni container riceve un device diverso; tre istanze FFmpeg scrivono sorgenti diverse.

**Criteri di successo:** ogni Chromium vede solo la propria sorgente.

---

## 10. Rischi e incognite

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| R1 | v4l2loopback non funziona nell'ambiente di hosting scelto (kernel incompatibile, VPS con kernel condiviso) | Media | Critico | Scegliere VPS con kernel dedicato (Hetzner, AWS EC2 Bare Metal, Scaleway) prima dello spike; evitare hosting condiviso |
| R2 | LiveJasmin usa JasminCam (app nativa) e non accetta il browser standalone | Alta | Critico | Spike S3 lo valida. Se JasminCam è obbligatorio, la soluzione browser-farm non è sufficiente per LiveJasmin; va valutato se JasminCam può girare nel container via Wine |
| R3 | Rilevamento bot/anti-detect del sito cam | Media | Alto | Dipende dall'engine anti-detect (ricerca parallela). Se il sito usa fingerprinting avanzato (canvas, WebGL, WebRTC leak), lo spike S3 lo rivela. Mitigazione: fingerprint coerente, proxy residenziale, profilo cookie reale |
| R4 | `@livekit/rtc-node` non supporta estrazione raw frame su tutte le piattaforme | Bassa | Alto | Testare nella fase S2; fallback: livekit-cli con output pipe |
| R5 | Latenza A/V accumulata (LiveKit → ingestor → V4L2 → Chromium → sito cam) > soglia accettabile | Media | Medio | Misurare in S2. Target < 2 s. Se superiore: ottimizzare pipeline FFmpeg (zero-copy, direct write) |
| R6 | Costi infra > piano di business | Bassa | Medio | ~$80-120/mese per VPS da 10 sessioni; modello di pricing può coprire |
| R7 | v4l2loopback `exclusive_caps=1` impedisce multipli lettori simultanei (operatore + Chromium) | Bassa | Medio | Usare `exclusive_caps=0` (default) o duplicare il device con un secondo v4l2loopback |
| R8 | Profili cookie persi su restart container (perdita session state sito cam) | Bassa | Alto | Montare `/profiles/<session_id>` su volume persistente (NFS/S3) dall'inizio |
| R9 | ToS delle piattaforme vietano accesso da browser virtualizzato/cloud | Media | Esistenziale | Questa è una decisione di business/legal, non solo tecnica. Da valutare con legal review (Fase 0, rischio R1 del piano operativo) |

### Dipendenze dall'engine anti-detect

Il sistema è progettato per essere plug-in rispetto all'engine anti-detect. Le decisioni rimandante all'altra ricerca (`ANTIDETECT_BROWSER_RESEARCH.md`):
- Quale engine scegliere (Camoufox, Rebrowser, GoLogin SDK, altro).
- Se l'engine richiede una build custom di Chromium o solo script injection.
- Se l'engine supporta la modalità headless/containerizzata (alcuni engine funzionano solo in modalità headed).
- Strategia di coerenza fingerprint (stesso profilo fingerprint = stesso device simulato tra le sessioni).

L'interfaccia `FingerprintEngine` definita in §7.1 isola questa dipendenza. Il codice di orchestrazione non cambia al variare dell'engine.

---

## 11. Dipendenze da ADR nuovi

Le seguenti decisioni richiedono un ADR dedicato prima dello sviluppo:

1. **ADR-0009 — Browser Farm Runtime**: formalizzare la scelta dell'opzione A (Docker + Chromium puro + Neko) dopo la validazione degli spike S1-S3.
2. **ADR-0010 — V4L2 Loopback Strategy**: modalità di caricamento kernel module in prod (host vs container-init), policy di allocazione device per sessione, dev workaround.
3. **ADR-0011 — Anti-detect Engine** (dipende da `ANTIDETECT_BROWSER_RESEARCH.md`): engine scelto, strategia fingerprint, integrazione con `FingerprintEngine` interface.
4. **ADR-0012 — Remote Display Protocol**: CDP Screencast (spike) vs Neko WebRTC (produzione), protocollo di autenticazione operatore.

---

## 12. Riassunto (8-12 righe)

La multi-browser cloud farm inietta il video composito LiveKit in sessioni Chromium isolate simulando una camera reale via `v4l2loopback` (kernel module Linux), senza modificare il comportamento di `getUserMedia` nel browser. Ogni sessione e un container Docker dedicato con il proprio `/dev/videoN`, proxy SOCKS5 assegnato, profilo cookie persistente e fingerprint pluggable. Il controllo operatore avviene tramite CDP screencast (spike) o Neko WebRTC (produzione), integrati nella Console Agenzia Next.js. Il backend NestJS espone un `BrowserFarmModule` con entità `BrowserSession`, `ProxyEntry` e `FingerprintProfile`, tutte con isolamento `tenantId` (ADR-0001). Il costo per sessione stimato e ~2-2.5 vCPU e ~1.3 GB RAM su host Linux. Lo spike prioritario (S1) dimostra il meccanismo V4L2 senza LiveKit su una VM Linux o VPS in 1-2 giorni; S2 collega la traccia LiveKit; S3 valida il sito cam reale e rivela eventuali problemi di rilevamento. Il rischio critico non tecnico e che LiveJasmin richieda JasminCam (app nativa) e non accetti il browser standalone: lo spike S3 lo verifica e, se confermato, richiederebbe un approccio alternativo (Wine in container). L'engine anti-detect rimane un parametro plug-in, da integrare senza cambiare il codice di orchestrazione.
