# ADR-0002 — Multistream fan-out: un processo FFmpeg indipendente per target

## Status

Accepted — 2026-05-23

## Context

Il piano operativo (M1.4 Fan-out, M1.6 Auto-reconnect) richiede che la caduta di una singola piattaforma di destinazione non interrompa il live sulle altre. Il PoC tecnico (Fase 0, `poc/multistream/`) ha validato il principio "un device → N target" usando MediaMTX come nodo di ingest e routing, con FFmpeg richiamato dall'hook `runOnReady` di MediaMTX all'arrivo del publisher.

**Rischio RT1 osservato durante il PoC (2026-05-23):**

> Nell'architettura con un singolo processo FFmpeg multi-output (`-f flv url_A -f flv url_B`), lo stop forzato di `dummy-rtmp-1` ha causato un errore *Broken pipe* su quell'output che ha terminato l'intero processo FFmpeg, interrompendo simultaneamente anche il fan-out verso `dummy-rtmp-2` (che era ancora attivo e raggiungibile).

La configurazione `runOnReadyRestart: yes` di MediaMTX ha rilanciato il processo, ma la finestra di interruzione ha coinvolto tutti i target, non solo quello in errore. Questo comportamento e inaccettabile in produzione: la piattaforma A non deve influenzare la piattaforma B.

Sono state valutate due opzioni:

1. **Un processo FFmpeg multi-output** (un solo processo con N output `-f flv`): piu semplice, meno processi OS, ma failure non isolata (RT1 confermato).
2. **N processi FFmpeg indipendenti, uno per target**: ogni target ha il proprio ciclo di vita, health state e logica di reconnect.

## Decision

**apps/api avvia un processo FFmpeg separato e indipendente per ogni piattaforma di destinazione.**

MediaMTX rimane il nodo di ingest RTMP/SRT/WHIP e il routing interno; non gestisce piu direttamente il fan-out via `runOnReady`. All'evento "publisher connesso" (webhook `runOnReady` o event stream di MediaMTX), apps/api riceve la notifica e per ogni target configurato nella sessione:

1. Avvia un processo FFmpeg dedicato che legge da MediaMTX (via RTMP interno o SRT) e scrive verso l'endpoint della piattaforma.
2. Registra il PID e lo stato del processo in Redis (per health monitoring e per idempotenza al riavvio del servizio).
3. Mantiene per ogni processo un loop di monitoraggio indipendente: se il processo termina con errore, esegue retry con exponential backoff senza toccare gli altri processi attivi.

Il processo FFmpeg di un target puo terminare (Broken pipe, timeout, ban piattaforma) e il servizio lo rileva e riconnette; gli altri target continuano a trasmettere senza interruzione.

**Relazione con MediaMTX:** MediaMTX resta responsabile esclusivamente della ricezione del flusso dal device (autenticazione stream key, RTMP/SRT/WHIP endpoint, API health). Il fan-out e interamente orchestrato da apps/api.

## Consequences

**Positive:**
- Failure isolation per target: la caduta di una piattaforma non impatta le altre (RT1 mitigato).
- Health e reconnect granulari: ogni target ha il proprio stato (`active`, `reconnecting`, `failed`) esposto via API e dashboard (M1.5, M4.5).
- Controllo fine per target: configurazioni diverse di bitrate, risoluzione, keyframe interval per piattaforma (M1.9) sono naturali.
- Logging e audit per target separati.

**Negative / Trade-off:**
- N processi FFmpeg invece di 1: maggior consumo di risorse OS (FD, memoria, CPU overhead). Accettabile dato che ogni processo e IO-bound (copia stream senza re-encoding se il formato corrisponde); da monitorare al crescere del numero di creator concorrenti (M8.9 autoscaling).
- La logica di orchestrazione e ciclo di vita dei processi vive in apps/api: complessita maggiore rispetto alla delega totale a MediaMTX. Da coprire con test di integrazione (Fase 1).
- Il numero di processi attivi deve essere bounded (limite per tenant / per sessione) per prevenire abusi e sovraccarico.

**Moduli impattati:** M1.4, M1.5, M1.6, M1.8, M4.5, M8.6.

**Riferimento PoC:** `poc/multistream/README.md`, sezione "Risultati validazione", punto "Auto-reconnect (M1.6) confermato CON CAVEAT".
