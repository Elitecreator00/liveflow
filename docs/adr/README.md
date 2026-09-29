# Architecture Decision Records — LiveFlow

Questo indice raccoglie tutte le decisioni architetturali del progetto LiveFlow.
Ogni ADR segue il formato standard: Status, Context, Decision, Consequences.

Per aggiungere un nuovo ADR: numerare progressivamente (ADR-000N), creare il file
`docs/adr/ADR-000N-titolo-breve.md` e aggiornare questo indice.

Ciclo di vita: `proposed` → `accepted` → `deprecated` → `superseded`.

---

## Indice

| # | Titolo | Status | Data |
|---|--------|--------|------|
| [ADR-0001](ADR-0001-monorepo-multi-tenancy.md) | Monorepo e modello multi-tenancy | Accepted | 2026-05-23 |
| [ADR-0002](ADR-0002-multistream-ffmpeg-per-target.md) | Multistream fan-out: un processo FFmpeg indipendente per target | Accepted | 2026-05-23 |
| [ADR-0003](ADR-0003-stream-key-jwt.md) | Autenticazione stream key via JWT a scadenza breve | Accepted | 2026-05-23 |
| [ADR-0004](ADR-0004-live-compositing-engine.md) | Motore di compositing live: LiveKit Server + LiveKit Egress | Accepted | 2026-05-24 |
| [ADR-0005](ADR-0005-role-to-app-access-boundary.md) | Confine di accesso ruolo → app (Console vs App Creator) | Accepted | 2026-05-24 |
| [ADR-0006](ADR-0006-livekit-transport-dev-vs-prod.md) | Transport/deploy LiveKit: nativo in dev (Windows), container in prod | Accepted | 2026-05-24 |
| [ADR-0007](ADR-0007-ai-ar-capabilities-architecture.md) | Architettura capacità AI/AR (effetti cloud-side, MediaPipe, GenAI doppio binario) | Accepted | 2026-05-24 |

---

## Relazioni tra ADR

- ADR-0002 dipende da ADR-0001 (l'orchestrazione dei processi FFmpeg vive in `apps/api`, definita in ADR-0001).
- ADR-0003 dipende da ADR-0001 (l'endpoint `/auth/stream-key` e in `apps/api`; il modello sessione usa `tenant_id` e RBAC definiti in ADR-0001).
- ADR-0002 e ADR-0003 si integrano: ogni processo FFmpeg per target (ADR-0002) viene avviato solo dopo la validazione JWT della sessione (ADR-0003).
- ADR-0004 dipende da ADR-0002 (il composito prodotto da LiveKit Egress entra nel fan-out FFmpeg per target come qualsiasi altra sorgente RTMP) e da ADR-0003 (il JWT protegge la LiveKit Room; `session_id` e `tenant_id` sono nei claims).
- ADR-0006 specializza ADR-0004 sul deployment di LiveKit (nativo in dev su Windows, container in prod su Linux).
- ADR-0005 dipende da ADR-0001 (i ruoli RBAC e il modello multi-tenant); aggiunge il confine ruolo→app lato client.
- ADR-0007 estende ADR-0004 (le capacità AI/AR girano nella pagina-scena renderizzata dall'Egress) e dipende da ADR-0006 (runtime del render); definisce dove gira l'AI e quali provider.

---

## Moduli del piano operativo coperti

| Modulo | ADR di riferimento |
|--------|--------------------|
| M1.2 Ingest node / auth stream key | ADR-0003 |
| M1.4 Fan-out / distribuzione | ADR-0002 |
| M1.5 Stream health monitoring | ADR-0002 |
| M1.6 Auto-reconnect & failover | ADR-0002 |
| M1.8 Go Live orchestration | ADR-0002 |
| M4.1 Multi-tenant model | ADR-0001 |
| M4.2 RBAC | ADR-0001, ADR-0005 |
| M7.1 Auth | ADR-0001, ADR-0003 |
| M7.8 Audit log | ADR-0003 |
| M8.1 Microservizi NestJS | ADR-0001 |
| M1.11 Scene / overlay / branding | ADR-0004 |
| M8.6 Media servers (LiveKit Server + Egress) | ADR-0004, ADR-0006 |
| M7.1 Auth / accesso per-app | ADR-0001, ADR-0003, ADR-0005 |
