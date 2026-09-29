# SPIKE ARCHITECTURE — M1 Multistreaming Engine
## LiveFlow / Fase 0 Discovery

> Autore: System Architect  
> Data: 2026-05-23  
> Riferimento: OPERATIONAL_PLAN.md § M1, Principio #1 "Device dumb, cloud smart"

---

## 1. Principio vincolante

Il device (OBS, iOS app, Electron app) cattura video e invia **un solo flusso** al media server cloud.
Il media server esegue transcoding e fan-out verso N destinazioni.
**Mai N encoding paralleli sul device.**

---

## 2. Confronto media server

### 2.1 Criteri di valutazione

| Criterio | Peso spike | Peso prod |
|----------|-----------|-----------|
| Ingest RTMP/SRT/WHIP | Must | Must |
| Fan-out RTMP nativo | Must | Must |
| Transcoding / ABR | Nice | Must |
| API health/metrics | Must | Must |
| Docker-first / locale | Must | Nice |
| Scalabilità orizzontale | — | Must |
| Licenza open source | Must | Important |
| Maturità / community | Nice | Must |

---

### 2.2 Tabella comparativa

| | **MediaMTX** | **nginx-rtmp-module** | **OvenMediaEngine** | **Ant Media Server** | **FFmpeg relay custom** |
|---|---|---|---|---|---|
| **Ingest RTMP** | Si | Si | Si | Si | Si (via ffmpeg -listen) |
| **Ingest SRT** | Si (nativo) | No (patch/workaround) | Si (nativo) | Si | Si (con srt-live-server) |
| **Ingest WHIP/WebRTC** | Si (nativo) | No | Si (nativo, punto di forza) | Si | Difficile |
| **Fan-out RTMP nativo** | Si (config YAML) | Si (push directive) | Si | Si | Si (output multipli) |
| **Transcoding / ABR** | Limitato (via hook FFmpeg esterno) | Limitato (exec FFmpeg) | Si (nativo, ladder ABR) | Si (nativo, HLS/DASH/ABR) | Si (pipeline complessa) |
| **API health/metrics** | Si — HTTP API + Prometheus metrics `/metrics` | No API ufficiale (log parsing) | Si — REST API + WebHook | Si — REST API completa | Nessuna (devi costruire) |
| **Prometheus scraping** | Si, out of the box | No | Parziale | Parziale (Enterprise) | No |
| **Config format** | YAML singolo file | nginx.conf | XML/JSON | GUI + REST | Script bash/python |
| **Docker ufficiale** | Si (immagine bluenviron/mediamtx) | Si (tiangolo/nginx-rtmp) | Si (airensoft/ovenmediaengine) | Si (antmedia/antmedia-server) | Basata su immagine FFmpeg |
| **Reconnect/retry** | Si (integrato) | No (gestito upstream) | Si | Si | Manuale (loop script) |
| **Scalabilità** | Singola istanza + clustering sperimentale | Nginx clustering standard | Scalabilità verticale buona | Buona, cluster ent. | Nessuna built-in |
| **Licenza** | BSD-2 (open source) | BSD (open source) | BSD-3 (open source) | Apache 2 (community) / Enterprise a pagamento | Licenza FFmpeg (LGPL/GPL) |
| **Maturità** | Alta (ex rtsp-simple-server, v1.x) | Molto alta (anni, stabile) | Media-alta (attivo, 2019+) | Alta (prod-ready) | Bassa (custom, fragile) |
| **Attività progetto** | Attiva (GitHub github.com/bluenviron/mediamtx) | Mantenimento passivo | Attiva | Attiva | N/A |
| **Costo infra** | Nessuno (open) | Nessuno (open) | Nessuno (community) | Community gratuita, Enterprise a pagamento | Nessuno |
| **Complessità spike** | Bassa — config YAML unico | Media — nginx.conf + modulo | Media — XML + setup | Alta — JVM, più risorse | Alta — script fragile |
| **RAM container** | ~20 MB idle | ~30 MB | ~200–500 MB | ~512 MB–1 GB (JVM) | ~30 MB + FFmpeg processi |

---

### 2.3 Analisi dettagliata

#### MediaMTX (ex rtsp-simple-server)
**Pro:**
- Un singolo file YAML configura ingest + fan-out + hook FFmpeg per transcoding.
- Supporta RTMP, RTSP, SRT, WHIP, HLS, WebRTC out of the box senza plugin.
- Endpoint Prometheus `/metrics` e API HTTP REST integrati per health (bitrate, readers, publisher state).
- Container ultra-leggero (~20 MB), startup in < 1 s.
- Fan-out "runOnReady" e "runOnRead" con hook a FFmpeg per transcoding ABR on-demand.
- Reconnect automatico verso target downstream configurabile.
- Licenza BSD-2, no royalty, no lock-in.

**Contro:**
- Transcoding ABR non nativo: serve FFmpeg esterno (hook). Accettabile: FFmpeg è già nel nostro stack.
- Clustering orizzontale ancora sperimentale (per production scaling serve lavoro aggiuntivo).
- Meno funzionalità "enterprise" rispetto ad Ant Media Server.

#### nginx-rtmp-module
**Pro:**
- Maturissimo, battle-tested, push verso multipli target nativo nella config.
- Molto documentato.

**Contro:**
- Nessuna API di health/metrics ufficiale: le metriche richiedono il modulo `nginx-rtmp-module` stat endpoint XML + parsing custom.
- SRT non supportato nativamente: richiede workaround con proxy.
- WHIP/WebRTC assente.
- Reconnect non gestito.
- Manutenzione passiva del modulo.

#### OvenMediaEngine
**Pro:**
- WHIP nativo di primo livello (ottimo per Fase 1 con web dashboard WebRTC).
- ABR transcoding nativo.
- REST API ricca.

**Contro:**
- Config in XML verboso, curva più ripida.
- Container pesante (500 MB+).
- Meno usato per puro RTMP fan-out, ottimizzato per delivery WebRTC.

#### Ant Media Server
**Pro:**
- Feature set completo: ABR, recording, clustering.
- REST API di gestione completa.

**Contro:**
- JVM: container pesante (~1 GB RAM), startup lento.
- Features avanzate (clustering, sicurezza avanzata) richiedono licenza Enterprise.
- Overkill per lo spike.

#### FFmpeg relay custom
**Pro:**
- Controllo totale.
- Nessuna dipendenza aggiuntiva oltre FFmpeg.

**Contro:**
- Nessuna health API built-in.
- Nessun reconnect automatico.
- Fragile: un segfault di FFmpeg abbatte tutto.
- Richiede costruire tutto (monitoring, retry, orchestrazione).
- Non è un "media server": è un'architettura custom da mantenere.

---

### 2.4 Raccomandazione

#### Per lo Spike (Fase 0)
**MediaMTX**

Motivazione: config YAML in un file solo, Docker leggero, Prometheus `/metrics` out of the box, fan-out RTMP configurabile con 2 righe, hook FFmpeg per transcoding, SRT e WHIP già disponibili per fasi successive. Tempo da zero a PoC funzionante: < 30 minuti.

#### Per la Produzione (Fase 1+)
**MediaMTX come ingest + fan-out router, con FFmpeg sidecar per transcoding ABR.**

Motivazione: il transcoding ABR nativo di MediaMTX è debole, ma la coppia MediaMTX (ingest/routing/health) + FFmpeg (transcoding) è esattamente il pattern che useremo in produzione su ogni nodo relay (M1.3 + M1.4 + M1.7). Questo spike valida già l'architettura target. Per scaling orizzontale (M8.6 relay geo-distribuiti), aggiungere un layer di orchestrazione (Kubernetes + HPA) davanti a istanze MediaMTX indipendenti.

Se in Fase 1 emerge un requisito WHIP/WebRTC prioritario (web dashboard go-live senza OBS), rivalutare OvenMediaEngine per il nodo WebRTC con MediaMTX come fan-out backend — documentare in ADR se si prende questa direzione.

---

## 3. Architettura dello Spike

### 3.1 Diagramma testuale

```
                        SPIKE ARCHITECTURE — LiveFlow M1 Multistream PoC
                        ================================================

  DEVICE (OBS / ffmpeg test source)
  +---------------------------------+
  |  Video source (file/camera)     |
  |  Single encode: H.264 + AAC     |
  |  Push → RTMP  (1 connessione)   |
  +---------------+-----------------+
                  |
                  |  RTMP  rtmp://localhost:1935/live/test
                  v
  +--------------+--------------+
  |         MEDIAMTX             |
  |   (Docker container)        |
  |                              |
  |  [INGEST]                    |
  |  Listener RTMP :1935         |
  |  Path: /live/{stream_key}    |
  |  Auth: via streamKey env     |
  |                              |
  |  [HEALTH API]                |
  |  HTTP API  :9997             |
  |  Prometheus :9998 /metrics   |
  |   - publisher.bytesReceived  |
  |   - publisher.fps            |
  |   - readers count            |
  |                              |
  |  [FAN-OUT runOnReady hook]   |
  |  Spawna FFmpeg process       |
  |  (transcode opzionale)       |
  |                              |
  +----+--------------------+----+
       |                    |
       |  RTMP push         |  RTMP push
       |  TARGET_1          |  TARGET_2
       v                    v
  +----------+        +----------+
  | RTMP     |        | RTMP     |
  | DUMMY    |        | DUMMY    |
  | SERVER 1 |        | SERVER 2 |
  | (nginx-  |        | (nginx-  |
  |  rtmp    |        |  rtmp    |
  |  :19351) |        |  :19352) |
  +----------+        +----------+
       |                    |
       v                    v
  [HLS /hls/stream1/]  [HLS /hls/stream2/]
  Verificabile via      Verificabile via
  browser su :8081      browser su :8082

  --- MONITORING ---

  [HEALTH CHECKER]
  Script Python/bash che ogni 5s:
  - GET http://localhost:9997/v3/paths/list
  - Legge bytesReceived, fps, readers
  - Stampa stato su stdout
  - Rilevabile reconnect se publisher sparisce

  [PROMETHEUS + GRAFANA (opzionale)]
  Scrape :9998/metrics
  Dashboard stream health
```

### 3.2 Flusso dati

```
1. Device fa push di un singolo flusso RTMP → MediaMTX :1935
2. MediaMTX accetta il publisher, registra il path /live/{key}
3. onReady hook: MediaMTX lancia FFmpeg come processo figlio:
      ffmpeg -i rtmp://127.0.0.1:1935/live/{key}
             -c copy  (pass-through, nessun re-encode nello spike)
             -f flv TARGET_1_URL/{TARGET_1_KEY}
             -f flv TARGET_2_URL/{TARGET_2_KEY}
4. FFmpeg mantiene due connessioni RTMP uscenti simultanee
5. Se un target cade: FFmpeg esce → MediaMTX rileva uscita hook → rilancia
   (auto-reconnect tramite runOnReadyRestart=true)
6. Health monitor: polling REST /v3/paths/list ogni 5s
```

### 3.3 Estensione per produzione

```
DEVICE → SRT/RTMP/WHIP → [MediaMTX ingest node]
                               |
                    [FFmpeg transcoding sidecar]
                    Ladder ABR: 1080p / 720p / 480p
                               |
              +----------------+----------------+
              |                |                |
         [Target 1]       [Target 2]       [Target N]
         Twitch RTMP      YouTube RTMP     TikTok RTMP
         (stream key       (stream key      (stream key
          per creator)      per creator)     per creator)
              |                |                |
         [Health probe]   [Health probe]   [Health probe]
              |
         [Redis pub/sub → WebSocket → Dashboard M4.3]
```

---

## 4. Rischi tecnici aperti

| # | Rischio | Probabilità | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| RT1 | **FFmpeg hook crash abbatte il fan-out** | Media | Alto | runOnReadyRestart=yes in MediaMTX; supervisore esterno (Docker restart policy); health probe rileva publisher drop |
| RT2 | **Target RTMP con RTMPS obbligatorio** (YouTube, TikTok) | Alta | Alto | FFmpeg supporta rtmps:// nativo; validare con endpoint reali in Fase 1 |
| RT3 | **Latenza hook startup** (FFmpeg impiega 1–3s a connettere) | Media | Medio | Accettabile per live; pre-warm connection pool per produzione |
| RT4 | **Bitrate adaptation** — device invia bitrate variabile, target ha cap | Media | Medio | FFmpeg -b:v cap + -maxrate + -bufsize nel hook; validare con profili piattaforma |
| RT5 | **Scalabilità orizzontale MediaMTX** — nessun clustering stabile | Alta (futuro) | Alto | Nodo MediaMTX per creator (isolamento); load balancer SRT/RTMP davanti; o migrazione a SRS/OME se necessario |
| RT6 | **ToS piattaforme** — alcune potrebbero bloccare IP datacenter | Alta | Alto | Blocco separato da risolvere in Fase 0 Platform Capability Matrix; relay IP residenziale/CDN come fallback |
| RT7 | **Autenticazione stream key** — stream key in URL RTMP sono in chiaro nei log | Media | Alto | TLS per SRT ingest in produzione; stream key usa token con scadenza (JWT); log sanitization |
| RT8 | **N creator concorrenti** — risorse FFmpeg per creator scalano linearmente | Media | Medio | Benchmark con 10/50/100 creator concorrenti; sizing nodi; auto-scaling Kubernetes |

---

## 5. Decisioni architetturali registrate

- **ADR-001 (implicito)**: MediaMTX scelto come media server per Spike M1. Riesame dopo spike per produzione.
- **ADR-002 (implicito)**: Transcoding via hook FFmpeg esterno, non pipeline nativa. Consente sostituzione dell'encoder senza toccare il routing layer.
- **ADR-003 (implicito)**: Health monitoring via REST API MediaMTX + Prometheus, non log parsing. Garantisce integrazione con stack osservabilità (M8.7).
