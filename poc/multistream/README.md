# LiveFlow PoC — Multistream M1

Proof-of-concept per lo spike tecnico della Fase 0.

Dimostra il principio architetturale core: **un singolo flusso RTMP in ingest, fan-out simultaneo verso N destinazioni**, con monitoring di salute.

---

## Architettura

```
device (OBS / ffmpeg) --> MediaMTX :1935 --> [FFmpeg hook]
                                                  |
                                    +-------------+-------------+
                                    |                           |
                               dummy-rtmp-1               dummy-rtmp-2
                               (simula Twitch)            (simula YouTube)
                               HLS: :8081                 HLS: :8082

Health: http://localhost:9997  (REST API)
Metriche: http://localhost:9998/metrics  (Prometheus)
```

---

## ✅ Risultati validazione (2026-05-23)

PoC eseguito con successo su Docker Desktop (Windows). Esiti:

- **Fan-out 1→2 confermato**: un singolo ingest RTMP (`live/test`, H264 1280×720 + AAC) è stato distribuito simultaneamente verso entrambi i target (`stream1` e `stream2` entrambi `active`, ~760 kbps video ciascuno). **Principio core "un device → live ovunque" validato.**
- **Health monitoring (M1.5) confermato**: REST API MediaMTX (`/v3/paths/list`) e health-monitor mostrano publisher attivo, reader del fan-out e byte trasferiti.
- **Auto-reconnect (M1.6) confermato CON CAVEAT**: allo stop di un target, l'unico processo ffmpeg multi-output va in *Broken pipe* ed esce, interrompendo **anche l'altro** target; `runOnReadyRestart` rilancia ffmpeg e al ripristino del target entrambi gli stream recuperano. → **Rischio RT1 confermato.**

### Correzioni applicate durante la validazione
1. **Immagine** → `bluenviron/mediamtx:latest-ffmpeg` (la `:latest` non include ffmpeg, l'hook di fan-out fallirebbe).
2. **Path regex** → `~^live/(.+)$` (in MediaMTX un path regex deve iniziare con `~`; `live/~...` è invalido e manda in crash il server).
3. **Target cablati** nel `runOnReady` (MediaMTX non esegue il comando in shell → le `$TARGET_*` non si espandono).
4. **Auth** → aggiunto `authInternalUsers` anonimo (default MediaMTX consente API/metrics solo da 127.0.0.1, bloccando host e health-monitor).

### Implicazione architetturale per la Fase 1
**Usare un processo ffmpeg indipendente per OGNI target** (non un solo ffmpeg multi-output): così la caduta di una piattaforma non interrompe le altre. Mitiga RT1.

### Issue cosmetici noti (solo PoC, non bloccanti)
- `health_monitor.py` stampa il path come `/live/live/test` (doppio `live`) e talvolta "Bytes 0 B/s". Il monitor di produzione sarà riscritto in Fase 1 (M1.5/M4.5) con architettura per-target.

---

## Prerequisiti

- Docker Desktop installato e in esecuzione
- `docker compose` disponibile (incluso in Docker Desktop)
- (Opzionale, per push test) `ffmpeg` nel PATH

Verifica:

```bash
docker compose version
ffmpeg -version
```

---

## Avvio rapido (3 comandi)

```bash
# 1. Copia e personalizza variabili d'ambiente
cp .env.example .env

# 2. Avvia tutti i container
docker compose up -d

# 3. Invia un flusso di test (simula il device)
./push-test-stream.sh          # Linux/macOS
# oppure su Windows PowerShell:
.\push-test-stream.ps1
```

---

## Istruzioni dettagliate

### Passo 1 — Configurazione

Copia `.env.example` in `.env`:

```bash
cp .env.example .env
```

Il file `.env` contiene:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `STREAM_KEY` | `liveflow_secret` | Chiave stream dell'ingest RTMP |
| `TARGET_1_URL` | `rtmp://dummy-rtmp-1:1935/live` | URL target fan-out A |
| `TARGET_1_KEY` | `stream1` | Stream key target A |
| `TARGET_2_URL` | `rtmp://dummy-rtmp-2:1935/live` | URL target fan-out B |
| `TARGET_2_KEY` | `stream2` | Stream key target B |

Per puntare verso piattaforme reali (Fase 1), modifica `TARGET_1_URL/KEY` con le credenziali della piattaforma.

### Passo 2 — Avvio container

```bash
docker compose up -d
```

Questo avvia:
- `mediamtx` — media server, porta RTMP 1935, API 9997, Prometheus 9998
- `dummy-rtmp-1` — target simulato A, RTMP 19351, HLS 8081
- `dummy-rtmp-2` — target simulato B, RTMP 19352, HLS 8082
- `health-monitor` — script Python che fa polling dell'API ogni 5s

Verifica che i container siano up:

```bash
docker compose ps
```

Attendi 5-10 secondi alla prima partenza (download immagini).

Leggi i log del media server:

```bash
docker compose logs -f mediamtx
```

### Passo 3 — Invia un flusso di test

#### Opzione A: Script incluso (ffmpeg segnale di test)

```bash
# Linux/macOS
./push-test-stream.sh

# Windows PowerShell
.\push-test-stream.ps1
```

Invia un segnale a colori con timecode visivo (1280x720, 30fps, H.264, 2 Mbps).

#### Opzione B: OBS Studio

In OBS: Impostazioni > Trasmissione

- Servizio: `Personalizzato`
- Server: `rtmp://localhost:1935/live`
- Chiave stream: `liveflow_secret` (o il valore di `STREAM_KEY` nel `.env`)

Clicca "Vai in onda".

#### Opzione C: ffmpeg con file video

```bash
ffmpeg -re -i tuo_video.mp4 \
  -c:v libx264 -preset veryfast -b:v 2000k \
  -c:a aac -b:a 128k \
  -f flv rtmp://localhost:1935/live/liveflow_secret
```

### Passo 4 — Verifica il fan-out

Entro 3-5 secondi dall'invio del flusso, il fan-out si attiva automaticamente.

#### Verifica HLS in browser

Apri uno di questi URL in VLC o in browser con un player HLS (es. hls.js demo):

- Target 1: `http://localhost:8081/hls/stream1/index.m3u8`
- Target 2: `http://localhost:8082/hls/stream2/index.m3u8`

In VLC: Media > Apri flusso di rete > incolla l'URL.

#### Verifica stat nginx-rtmp

- `http://localhost:8081/stat` — connessioni attive su target 1
- `http://localhost:8082/stat` — connessioni attive su target 2

#### Verifica API MediaMTX

Lista path attivi (include bitrate, reader count):

```bash
curl http://localhost:9997/v3/paths/list
```

Lista connessioni RTMP:

```bash
curl http://localhost:9997/v3/rtmpconns/list
```

### Passo 5 — Leggi le metriche di salute

#### Log health monitor (terminale)

```bash
docker compose logs -f health-monitor
```

Output atteso (con stream attivo):

```
────────────────────────────────────────────────────
[14:32:10] LiveFlow Health Monitor — MediaMTX
────────────────────────────────────────────────────

  Path: /live/liveflow_secret
  [PUBLISHER ATTIVO] tipo=rtmpConn
  Bytes ricevuti: 1.24 MB/s (totale sessione)
  Reader attivi: 2  (fan-out attivo verso 2 target)
    Reader 1: tipo=rtmpConn, bytes_inviati=1.22 MB/s
    Reader 2: tipo=rtmpConn, bytes_inviati=1.20 MB/s

  Connessioni RTMP attive: 3
    [a1b2c3d4] live/liveflow_secret <-- publisher rx=1.24 MB/s
    [e5f6g7h8] live/liveflow_secret --> reader tx=1.22 MB/s
    [i9j0k1l2] live/liveflow_secret --> reader tx=1.20 MB/s
```

#### Prometheus metrics

```bash
curl http://localhost:9998/metrics | grep mediamtx
```

Metriche chiave:
- `mediamtx_path_readers` — numero reader per path (=2 se fan-out attivo)
- `mediamtx_rtmp_conn_bytes_received_total` — byte totali ricevuti dal publisher
- `mediamtx_rtmp_conn_bytes_sent_total` — byte totali inviati a ciascun target

#### Grafana (opzionale)

Aggiungi a `docker-compose.yml` un servizio Grafana + Prometheus per visualizzazione dashboard. Non incluso nel PoC base per semplicita'.

### Passo 6 — Test auto-reconnect

1. Con il flusso attivo, simula una disconnessione di un target:

```bash
docker compose stop dummy-rtmp-1
```

2. Osserva nei log di `mediamtx` che FFmpeg esce e riprova.

3. Riavvia il target:

```bash
docker compose start dummy-rtmp-1
```

4. MediaMTX (configurazione `runOnReadyRestart: yes`) rilancia automaticamente FFmpeg che riconnette verso entrambi i target.

---

## Stop

```bash
docker compose down
```

Per rimuovere anche le immagini scaricate:

```bash
docker compose down --rmi all
```

---

## Struttura file

```
poc/multistream/
├── docker-compose.yml       # Orchestrazione container
├── mediamtx.yml             # Config MediaMTX (ingest + fan-out hook)
├── nginx-rtmp-1.conf        # Config nginx-rtmp target A
├── nginx-rtmp-2.conf        # Config nginx-rtmp target B
├── .env.example             # Variabili d'ambiente (template)
├── health_monitor.py        # Script polling REST API MediaMTX
├── push-test-stream.sh      # Script push flusso test (Linux/macOS)
├── push-test-stream.ps1     # Script push flusso test (Windows)
└── README.md                # Questo file
```

---

## Prossimi passi (Fase 1)

1. Sostituire `TARGET_1_URL/KEY` e `TARGET_2_URL/KEY` nel `.env` con credenziali reali di Twitch / YouTube.
2. Abilitare `webrtc: yes` in `mediamtx.yml` per supporto WHIP dal browser (M2.1).
3. Aggiungere transcoding ABR nel hook FFmpeg (scala ladder: 1080p/720p/480p).
4. Integrare health monitor con Redis pub/sub e WebSocket per il dashboard M4.3.
5. Aggiungere autenticazione stream key con JWT e scadenza (M1.2).

---

## Troubleshooting

**Container non parte:**
```bash
docker compose logs mediamtx
```
Verificare che la porta 1935 non sia occupata da altri processi.

**FFmpeg non trovato (hook fallisce):**
L'immagine `bluenviron/mediamtx:latest` include ffmpeg. Se si usa una versione specifica senza ffmpeg, specificare `bluenviron/mediamtx:latest-ffmpeg`.

**Fan-out non si attiva (0 reader):**
Verificare che il publisher sia connesso (`curl http://localhost:9997/v3/paths/list`) e che i container `dummy-rtmp-1` e `dummy-rtmp-2` siano up (`docker compose ps`).

**HLS non si carica nel browser:**
Il segmento HLS impiega 2-4s a generarsi dopo l'inizio dello stream. Attendere e ricaricare.
