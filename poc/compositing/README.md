# LiveFlow PoC — Compositing Cloud (LiveKit + Egress)

Proof of concept eseguibile per validare il motore di compositing cloud scelto in ADR-0004.

Dimostra:
- Ingest video → LiveKit Room (WHIP/WebRTC)
- LiveKit Egress: apre pagina HTML scena con Chrome headless
- Overlay testo/immagine aggiornati live dall'operatore senza interruzione stream
- Output RTMP composito → MediaMTX → fan-out (simula ADR-0002)

---

## 3 comandi per provarlo

```bash
# 1. Entra nella directory del PoC
cd poc/compositing

# 2. Avvia tutto lo stack
docker compose up --build

# 3. Verifica il composito nel browser
#    Apri: http://localhost:8888/live/composited
```

Il composito è visibile via HLS su `http://localhost:8888/live/composited` entro 30–60 secondi dall'avvio (il tempo di Egress per avviare Chrome headless e stabilire il rendering).

---

## Aggiornare gli overlay live

Mentre il PoC gira, l'orchestrator aggiorna automaticamente gli overlay ogni 10 secondi (simula le azioni dell'operatore). Puoi anche farlo manualmente:

```bash
# Cambia il testo dell'overlay dal basso e il nome della creator
curl -X POST http://localhost:3001/overlays \
  -H "Content-Type: application/json" \
  -d '{
    "bottomText": "Il mio testo live aggiornato!",
    "creatorName": "La mia creator",
    "topText": "ON AIR",
    "showOverlay": true,
    "backgroundColor": "rgba(0,0,0,0.7)"
  }'

# Leggi lo stato corrente degli overlay
curl http://localhost:3001/overlays

# Nascondi l'overlay senza interrompere lo stream
curl -X POST http://localhost:3001/overlays \
  -H "Content-Type: application/json" \
  -d '{"showOverlay": false}'

# Mostra di nuovo l'overlay
curl -X POST http://localhost:3001/overlays \
  -H "Content-Type: application/json" \
  -d '{"showOverlay": true}'
```

L'aggiornamento si propaga alla pagina scena in Chrome headless in meno di 200 ms via WebSocket, senza alcuna interruzione del flusso RTMP.

---

## Porte esposte

| Porta | Servizio | URL |
|-------|----------|-----|
| 7880 | LiveKit Server API | http://localhost:7880 |
| 3000 | Scene Server (pagina HTML scena) | http://localhost:3000 |
| 3001 | Overlay API (aggiorna overlay) | http://localhost:3001/overlays |
| 1935 | MediaMTX RTMP ingest (riceve output Egress) | rtmp://localhost:1935/live/composited |
| 8888 | MediaMTX HLS (verifica composito) | http://localhost:8888/live/composited |
| 19351 | RTMP dummy target (fan-out) | rtmp://localhost:19351/live/fanout |
| 8081 | HLS dummy target (verifica fan-out) | http://localhost:8081/live/fanout |
| 9997 | MediaMTX HTTP API | http://localhost:9997/v3/paths/list |

---

## Cosa sta succedendo internamente

```
test-source (ffmpeg)
  └── genera test pattern colorato + testo timestamp
  └── pusha RTMP → LiveKit Server :1935/live/test-creator

LiveKit Server
  └── riceve il feed come "participant" nella Room poc-room
  └── espone il feed via WebRTC agli subscriber (Egress)

LiveKit Egress
  └── avvia Chrome headless 1280x720
  └── apre: http://scene-server:3000/?room=poc-room
  └── la pagina:
      ├── mostra il feed camera dal canvas test (in produzione: LiveKit JS SDK)
      ├── mostra overlay (testo/immagine) con CSS/HTML
      └── riceve aggiornamenti overlay via WebSocket da scene-server:3000/ws
  └── cattura il frame composito a 30fps
  └── encode H.264 + AAC via FFmpeg interno
  └── pusha RTMP → mediamtx:1935/live/composited

orchestrator (simula apps/api)
  └── avvia EgressRequest via LiveKit API
  └── avvia FFmpeg fan-out: legge composited → pusha verso rtmp-dummy
  └── ogni 10s: POST /overlays → aggiorna testo in Chrome headless
```

---

## Come estendere questo PoC per la produzione (Fase 1)

### 1. Feed camera reale (WHIP dal telefono)

Sostituire il `test-source` ffmpeg con il telefono della creator che pubblica WHIP:

```
# URL WHIP da dare al telefono (o all'app mobile):
https://liveflow.io/whip/live/poc-room?token=<JWT>
```

Nella pagina scena (`scene/server.js`, funzione `buildScenePage`), aggiungere il LiveKit JS SDK per ricevere il feed WebRTC reale dalla Room:

```html
<script src="https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js"></script>
<script>
  // Dopo connectWS():
  const room = new LivekitClient.Room();
  room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === "video") {
      track.attach(document.getElementById("video-feed"));
    }
  });
  await room.connect("wss://liveflow.io", LV_TOKEN);
</script>
```

### 2. Autenticazione sessione (ADR-0003)

L'orchestrator deve generare JWT LiveKit con `session_id` e `tenant_id` (vedi ADR-0003). L'endpoint `/auth/stream-key` di apps/api valida il JWT prima di creare la Room.

### 3. Multi-tenant isolation

Ogni sessione live = una Room LiveKit separata con nome `{tenant_id}_{session_id}`. Il token Egress è scoped alla Room della sessione.

### 4. Fan-out RTMP reale (ADR-0002)

Sostituire `rtmp-dummy` con gli endpoint delle piattaforme reali (Twitch, YouTube, etc.) nel codice dell'orchestrator:

```javascript
const targets = [
  "rtmps://live.twitch.tv/app/<stream_key>",
  "rtmps://a.rtmp.youtube.com/live2/<stream_key>",
];
// Avvia un processo FFmpeg per ogni target (ADR-0002)
targets.forEach((url) => spawnFfmpegFanout(MEDIAMTX_URL, url));
```

### 5. Template scena React (Next.js)

Sostituire la pagina HTML vanilla con un componente Next.js che:
- Usa `@livekit/components-react` per il feed video
- Condivide lo stesso componente React tra l'editor operatore e il renderer Egress
- Riceve stato overlay via WebSocket da SceneStateService in apps/api

---

## Requisiti per girare

- Docker Desktop + Docker Compose v2
- 4+ GB RAM disponibili (Chrome headless in Egress consuma ~800 MB)
- Porte 1935, 3000, 3001, 7880, 7881, 8081, 8888, 9997, 19351 libere

**NOTA su Linux vs Windows/macOS:**
- Su Linux il PoC gira nativamente.
- Su Windows/macOS con Docker Desktop: le porte UDP 50100-50200 per WebRTC devono essere aperte nel firewall. Se LiveKit ha difficoltà con ICE, modificare `docker-compose.yml` aggiungendo `--rtc.tcp-port 7882` e aprire la porta TCP.

---

## Troubleshooting

**Egress non si avvia o non produce RTMP:**
```bash
docker compose logs livekit-egress
# Verificare che SYS_ADMIN capability sia abilitata (richiesto da Chrome sandbox)
# Verificare che shm_size: "1gb" sia rispettato da Docker
```

**Chrome headless crash (OOM):**
```bash
# Aumentare shm_size in docker-compose.yml a "2gb"
# Oppure aggiungere --disable-dev-shm-usage alle opzioni Chrome in Egress config
```

**Overlay non si aggiornano:**
```bash
# Verifica WS connection nel browser:
curl http://localhost:3000/health
# Verifica overlay API:
curl http://localhost:3001/overlays
```

**HLS non disponibile dopo 60s:**
```bash
# Verifica che MediaMTX veda il publisher:
curl http://localhost:9997/v3/paths/list
# Verifica che Egress stia pushando RTMP:
docker compose logs livekit-egress | grep -i rtmp
```
