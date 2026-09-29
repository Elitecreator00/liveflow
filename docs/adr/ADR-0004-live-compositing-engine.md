# ADR-0004 — Motore di compositing live: LiveKit Server + LiveKit Egress

## Status

Accepted — 2026-05-24 (decisione utente: adottare LiveKit ora come base dello studio)

## Context

Il piano operativo (OPERATIONAL_PLAN.md §1bis) introduce il Live Studio: la creator invia un solo flusso dal telefono via WHIP/WebRTC al cloud; l'operatore compone la scena (overlay immagine/testo, scene switching) dalla web app; il cloud renderizza il composito e lo manda in RTMP verso il fan-out esistente (ADR-0002: un processo FFmpeg per target).

La decisione aperta era la scelta del motore di compositing cloud. Il documento di spike `discovery/STUDIO_COMPOSITING_SPIKE.md` confronta tre opzioni:

- **A. LiveKit Server + LiveKit Egress** — SFU WebRTC open-source + servizio di egress che renderizza un template HTML/Canvas tramite Chromium headless interno.
- **B. Renderer headless custom** — Chromium headless + Xvfb + FFmpeg interamente gestiti da apps/api.
- **C. GStreamer pipeline** — pipeline media nativa C/Python senza browser.

I vincoli non negoziabili sono:
1. Compositing interamente cloud-side (principio "Device dumb, cloud smart").
2. Overlay dinamici (testo/immagine) aggiornabili live dall'operatore senza interruzione del flusso.
3. Template scena come pagina web (Next.js/React) per garantire WYSIWYG tra editor operatore e renderer cloud.
4. Self-host obbligatorio, licenza open-source.
5. Integrazione con ingest WHIP/MediaMTX e con fan-out RTMP ADR-0002.
6. Output multi-RTMP verso le piattaforme (tramite fan-out ADR-0002).

## Decision

**Adottare LiveKit Server + LiveKit Egress come motore di compositing cloud.**

### Architettura adottata

Il telefono pubblica WHIP direttamente a LiveKit Server (che supporta WHIP nativo). LiveKit Egress apre un template HTML scena (pagina React condivisa con l'editor operatore), riceve il feed video dalla LiveKit Room via JS SDK, e ne produce un flusso RTMP verso MediaMTX interno. MediaMTX espone il composito al fan-out ADR-0002.

```
Telefono → WHIP → LiveKit Server (Room)
                      |
              LiveKit Egress
              (Chrome headless + pagina scena React)
              overlay aggiornati da apps/api via WS
                      |
                    RTMP
                      |
              MediaMTX (interno)
                      |
             fan-out ADR-0002
             (N processi FFmpeg → N piattaforme)
```

Lo stato degli overlay (testo, immagini, scene) è mantenuto in Redis da `SceneStateService` in apps/api. L'operatore edita lo stato via REST/WebSocket dalla dashboard; le modifiche vengono trasmesse via WebSocket alla pagina scena aperta nell'Egress in meno di 200 ms.

### Perché non Opzione B (Headless custom)

L'Opzione B produce esattamente lo stesso rendering (Chromium headless + pagina React), ma sposta l'intera responsabilità di orchestrazione del ciclo di vita del processo (avvio, health, restart, scaling) su apps/api. Questa complessità è già stata incontrata con il fan-out FFmpeg (ADR-0002) e ha richiesto un ciclo di iterazione. LiveKit Egress risolve questo problema con un sistema di orchestrazione nativo testato in produzione. La differenza di implementazione si riduce a: "costruire l'infra di orchestrazione" (settimane) vs "chiamare l'API Egress" (giorni).

### Perché non Opzione C (GStreamer)

GStreamer non ha un meccanismo nativo per sincronizzare lo stato di un editor web con una pipeline media. Costruire il layer di traduzione (stato React/CSS → parametri pipeline) richiederebbe un sottoprogetto di durata superiore all'intero MVP. La latenza e il costo CPU inferiori non giustificano questo overhead per i volumi del MVP (< 20 creator concorrenti).

## Consequences

### Positive

### Audio: viene dalla PAGINA, non dalla room

⚠️ L'Egress cattura video **e audio della pagina** renderizzata da Chromium headless: non mixa da sé le track audio della room. Una pagina-scena che attacca solo il video produce uno stream RTMP **muto**, e il difetto non si vede in nessuna preview — si scopre dalla piattaforma di destinazione.

La pagina-scena monta quindi anche le track audio (elementi `<audio>` fuori schermo ma in riproduzione, mai `display:none`) e le riproduce. Corretto il 2026-09-03: fino a quel momento la scena attaccava solo `Track.Kind.Video`.

Catena audio completa: app creator (microfono pubblicato, con fallback esplicito se negato) → LiveKit Room → pagina-scena (riproduce) → Egress (cattura la pagina) → RTMP → fan-out (`-c copy`, quindi audio incluso) → stanze multi-browser (ingestor: track audio → loopback ALSA).

- **WYSIWYG garantito**: lo stesso componente React è usato nell'editor operatore e nella pagina scena dell'Egress. Nessun layer di traduzione.
- **Overlay dinamici senza interruzione**: aggiornamento DOM via WebSocket senza restart del processo Egress. Il flusso RTMP è continuo.
- **Ciclo di vita del renderer gestito da Egress**: health check, restart automatico, metriche — incluse senza codice custom.
- **Scalabilità orizzontale documentata**: un pod Egress per sessione, scalabile con K8s HPA. Pattern usato in produzione da LiveKit.io.
- **Integrazione con ADR-0002 e ADR-0003 invariata**: il composito prodotto da Egress è un flusso RTMP che entra nel fan-out esattamente come qualsiasi altra sorgente. L'autenticazione JWT (ADR-0003) protegge l'accesso alla LiveKit Room.
- **Licenza Apache 2.0**: nessun costo di licenza, self-host senza restrizioni.

### Negative / Trade-off

- **Costo CPU per sessione**: ~2.5–3 vCPU + ~1.1 GB RAM per creator (Egress + LiveKit Server + FFmpeg interno). Più alto rispetto a GStreamer (~0.5 vCPU). Accettabile per MVP; da ottimizzare con NVENC a volumi più alti.
- **Dipendenza da LiveKit**: aggiunta di un nuovo servizio nell'infrastruttura (LiveKit Server + Egress). Mitigazione: entrambi open-source Apache 2.0, container Docker standard, API stabile.
- **Bridge WHIP**: il telefono pubblica WHIP a LiveKit invece che a MediaMTX. Per l'MVP questo è trasparente. Per scenari futuri (SRT da OBS, RTMP da encoder hardware), serve un bridge RTMP/SRT→LiveKit Room (piccolo servizio Node.js/FFmpeg o uso di `livekit-cli` inject). Da documentare in ADR separato se si attiva.
- **Latenza end-to-end aggiuntiva**: Egress aggiunge ~300–600 ms rispetto a un relay diretto. Totale stimato telefono → viewer: 3–6 s. Accettabile per live adult (non gaming). Da misurare nel PoC.

### Moduli impattati

| Modulo | Impatto |
|--------|---------|
| M1.2 Ingest node | WHIP ora va a LiveKit Server (non solo MediaMTX) |
| M1.3 Transcoding pipeline | Encode H.264 gestito da Egress (FFmpeg interno); il fan-out downstream usa pass-through |
| M1.4 Fan-out | Invariato (ADR-0002): apps/api avvia FFmpeg per target sull'output composito |
| M1.8 Go Live orchestration | apps/api aggiunge: crea Room LiveKit, avvia EgressRequest, ferma Egress allo stop |
| M1.11 Scene / overlay / branding | Questo ADR ne definisce l'architettura |
| M2.1 Web dashboard | Aggiunge SceneEditor React component (usato anche come template Egress) |
| M4.3 Live monitoring wall | Aggiunge preview dal LiveKit Room (subscriber WebRTC o HLS) |
| M8.6 Media servers | Aggiunge LiveKit Server + Egress ai servizi media gestiti |

### Decisioni subordinate da prendere

1. **Schema del template scena** (React component, stato overlay, API update): da definire in un documento di design M1.11.
2. **SceneStateService in apps/api**: interfacce TypeScript, schema Redis, WebSocket protocol.
3. **EgressOrchestrator in apps/api**: API verso LiveKit gRPC, gestione errori, health polling.
4. **Bridge SRT/RTMP → LiveKit** per Fase successiva (OBS desktop, iOS SRT): ADR separato.

## Riferimenti

- `discovery/STUDIO_COMPOSITING_SPIKE.md` — analisi comparativa dettagliata
- `poc/compositing/` — PoC eseguibile con docker-compose
- ADR-0002 — fan-out FFmpeg per target (invariato, usato downstream)
- ADR-0003 — autenticazione JWT sessione (applicata anche alla LiveKit Room)
- LiveKit Egress documentation: https://docs.livekit.io/egress/
- LiveKit WHIP support: https://docs.livekit.io/realtime/client/connect/
