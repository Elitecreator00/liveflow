# ADR-0003 — Autenticazione stream key via JWT a scadenza breve

## Status

Accepted — 2026-05-23

## Context

Il piano operativo (M1.2 Ingest node) richiede l'autenticazione della stream key per ogni sessione di ingest. Il PoC (Fase 0) ha usato una chiave statica (`liveflow_secret`) definita in `.env` per semplicita. In produzione una chiave statica presenta rischi gravi:

- **Riuso non controllato**: una chiave trapelata rimane valida a tempo indefinito.
- **Impossibilita di revoca granulare**: non e possibile invalidare la chiave di una singola sessione senza cambiare la chiave globale e riconfigurare tutti i client.
- **Assenza di audit trail**: non e possibile correlare un ingest con la creator, il tenant e la sessione specifica.
- **Condivisione non autorizzata**: in ambienti multi-operator una chiave statica condivisa non permette di distinguere chi ha avviato il live.

Il piano operativo (Principio 2 — Compliance & security by-design, M7.8 Audit log, M7.1 Auth) impone che l'autenticazione sia contestuale alla sessione e revocabile.

MediaMTX supporta l'autenticazione esterna tramite la configurazione `externalAuthenticationURL`: per ogni connessione in arrivo, MediaMTX effettua una chiamata HTTP verso l'URL configurato passando path, action e credenziali; se la risposta e 200 la connessione e accettata, altrimenti rifiutata.

## Decision

**Ogni sessione di ingest usa una stream key che e un JWT firmato con scadenza breve, validato da apps/api tramite il meccanismo `externalAuthenticationURL` di MediaMTX.**

Flusso operativo:

1. La creator (o il sistema di orchestrazione) richiede a apps/api la creazione di una sessione di live (`POST /sessions`). apps/api verifica i permessi RBAC, crea il record di sessione nel DB e restituisce un JWT firmato con:
   - `sub`: ID creator
   - `tenant_id`: ID agenzia
   - `session_id`: ID sessione specifica
   - `exp`: scadenza breve (es. 4–8 ore, coprendo la durata tipica di una sessione live)
   - `scope`: `ingest`
2. La creator configura il proprio client (OBS, Electron app, iOS) con l'URL di ingest e questo JWT come stream key.
3. Quando il client si connette a MediaMTX, MediaMTX chiama `externalAuthenticationURL` (apps/api, endpoint dedicato `/auth/stream-key`).
4. apps/api verifica firma, scadenza, `scope`, e che la sessione sia nello stato atteso (non revocata, non gia in uso da un altro publisher). Risponde 200 o 403.
5. In caso di revoca (manager che ferma il live, rilevamento abuso, logout forzato), apps/api marca la sessione come revocata nel DB. Al prossimo check MediaMTX riceve 403.

La chiave privata di firma JWT e gestita tramite secrets manager (non in .env di produzione).

## Consequences

**Positive:**
- **Revoca granulare e immediata**: invalidare una sessione nel DB basta per bloccare il prossimo ingest senza impattare altre sessioni attive.
- **Audit trail completo**: ogni tentativo di ingest e loggato con creator, tenant, sessione, timestamp (M7.8).
- **Nessuna chiave statica condivisa**: il rischio di credential leak persistente e eliminato; una chiave compromessa espira comunque.
- **Correlazione sessione**: apps/api puo associare metriche di streaming, eventi chat e dati di billing alla stessa `session_id`.
- **Allineamento al principio security by-design** (OPERATIONAL_PLAN.md Principio 2).

**Negative / Trade-off:**
- apps/api e nel critical path di ogni connessione di ingest: un'interruzione di apps/api blocca i nuovi ingest. Mitigazione: endpoint `/auth/stream-key` isolato, senza dipendenze da DB lente (lookup per `session_id` su Redis cache).
- La creator deve ottenere un nuovo JWT per ogni sessione (o al rinnovo); il client deve gestire il refresh prima della scadenza se la sessione e piu lunga del TTL del JWT. Gestito dall'app Electron/iOS e dalla web dashboard (M2.1–M2.3).
- Aggiunge complessita rispetto a una chiave statica: richiede endpoint dedicato, gestione secret, test di integrazione MediaMTX.

**Moduli impattati:** M1.2, M7.1, M7.8, M2.1, M2.2, M2.3.

**Riferimento PoC:** `poc/multistream/README.md`, sezione "Prossimi passi (Fase 1)", punto 5 — "Aggiungere autenticazione stream key con JWT e scadenza (M1.2)".
