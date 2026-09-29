# ADR-0006 — Transport e deployment LiveKit: nativo in dev (Windows), container in prod

## Status

Accepted — 2026-05-24 (formalizza la soluzione trovata facendo funzionare la preview live end-to-end)

## Context

ADR-0004 ha adottato LiveKit come motore di ingest/compositing. In sviluppo, su questa macchina (**Windows 11 + Docker Desktop con backend WSL2**), il server LiveKit girava come container Docker (`docker-compose.dev.yml`). La preview live falliva sistematicamente con un pattern preciso, confermato dai log del server LiveKit e dalla console del browser:

1. La connessione si stabiliva (ICE OK), l'**audio** veniva pubblicato.
2. Il **video** non si stabilizzava: la PeerConnection cadeva e il client (`livekit-client`) faceva un **full-reconnect ogni ~15 s** (`peerConnectionTimeout`), in loop. Lato operatore: video per pochi secondi poi nero.

Cause diagnosticate (cumulative):

- **NAT del bridge Docker + WSL2**: i candidati ICE risolvevano sul gateway del bridge (`172.19.0.1`) e i pacchetti UDP > MTU venivano scartati da WSL2 → l'audio (pacchetti piccoli) passava, il video (pacchetti RTP grandi) no. Nessun workaround Docker ha stabilizzato il media: `force_tcp`, aumento del buffer UDP del kernel (`net.core.rmem_max`), rimozione del port mapping UDP.
- **PeerConnection subscriber non negoziata**: il token creator aveva `canSubscribe:false` → la PC "subscriber" (primaria in LiveKit) non si stabiliva → timeout → reconnect. (Corretto a `canSubscribe:true`.)
- **Publish seriale audio→video**: lasciava la publish video annullabile da un reconnect ("Cancelled publication"). (Corretto con publish in parallelo.)
- **Disallineamento di versione**: `livekit-client@2.19.0` (protocollo 17) vs server v1.7.2/v1.9.0 (protocollo 14/16) → 404 su `/rtc/v1`, fallback ad ogni connessione. (Corretto portando il server a v1.12.0.)

Anche dopo i fix applicativi e di versione, **il loop persisteva finché LiveKit girava in Docker**: la causa residua era strutturalmente la rete di Docker Desktop su Windows. Eseguendo il binario LiveKit **nativo su Windows**, il loop è sparito e la preview è risultata **stabile** (validata dal vivo).

## Decision

**In sviluppo su Windows, eseguire `livekit-server` come binario NATIVO (non in Docker). In produzione (host Linux), LiveKit resta containerizzato.**

### Dev (Windows) — nativo

- Binario: `tools/livekit/livekit-server.exe` (v1.12.0 — protocollo allineato a `livekit-client@2.19.0`).
- Config: `tools/livekit/livekit.native.yaml` — `node_ip: 192.168.1.3` + `enable_loopback_candidate: true` (offre sia il candidato LAN sia loopback: same-host usa loopback, telefono su LAN usa l'IP LAN), `tcp_port: 7881`, `udp_port: 7882`, keys `devkey:secret`.
- Avvio/arresto via `start.bat` (step [3b/7], idempotente con `taskkill`) e `stop.bat`. Docker avvia solo `postgres redis mediamtx`.
- Il servizio `livekit` in `docker-compose.dev.yml` è dietro `profiles: ["docker-livekit"]` → non parte di default; resta disponibile per host Linux con `docker compose --profile docker-livekit up livekit`.

### Prod (host Linux) — container

Su host Linux nativo la rete del container non soffre della NAT di Docker Desktop/WSL2: il deployment containerizzato di LiveKit (e in futuro LiveKit Egress, ADR-0004) è valido. Il transport torna UDP-first con TCP fallback.

### Decisioni applicative correlate (adottate)

- Token ingest creator: `canPublish:true` **e** `canSubscribe:true` (PC subscriber primaria deve stabilirsi).
- Client creator: publish audio+video in **parallelo** (`Promise.all`), simulcast off + bitrate cap in dev, guard anti doppio-avvio, handler `Disconnected` basato su ref.
- `StreamSession.streamKey` univoco per sessione (`lk_<uuid>`), non più il `creatorId` (era `@unique` → collisione/500).

## Consequences

### Positive

- Preview live **stabile** in dev su Windows (loopback, nessuna NAT Docker).
- Parità di versione client/server (protocollo 17) → nessun fallback `/rtc/v1`.
- La via Docker resta pronta per prod/Linux (profilo dedicato), senza divergere il codice applicativo.

### Negative / Trade-off

- **Divergenza dev/prod**: in dev LiveKit non è containerizzato → un componente d'infra gira diversamente tra le due. Mitigazione: stessa versione e config equivalente; il container resta definito (profilo).
- Il binario `livekit-server.exe` (~50 MB) è versionato in `tools/livekit/` (o da scaricare): valutare `.gitignore` + script di download se il repo diventa pesante.
- `node_ip` hard-coded a `192.168.1.3`: se l'IP LAN cambia va aggiornato (in `livekit.native.yaml` e `apps/api/.env` `LIVEKIT_WS_PUBLIC_URL`).
- La chiave dev `devkey:secret` è < 32 char (warning del server, non bloccante). In prod usare chiavi robuste.

### Moduli impattati

| Modulo | Impatto |
|--------|---------|
| M1.2 Ingest node | LiveKit nativo in dev; container in prod |
| M8.6 Media servers | Deployment LiveKit differenziato dev/prod |
| M8.8 CI/CD + IaC | La IaC di prod containerizza LiveKit; il dev locale usa il binario nativo |

## Riferimenti

- ADR-0004 — motore di compositing LiveKit (questo ADR ne definisce il deployment in dev)
- Memoria progetto: `liveflow-livekit-dev-setup`, `liveflow-studio-direction`
- LiveKit releases (binari Windows): https://github.com/livekit/livekit/releases
- Issue infra note: Docker Desktop/WSL2 drop UDP>MTU, host networking non funzionante su Windows
