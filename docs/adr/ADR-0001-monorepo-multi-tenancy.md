# ADR-0001 — Monorepo e modello multi-tenancy

## Status

Accepted — 2026-05-23

## Context

LiveFlow e un sistema SaaS multi-tenant che ospita agenzie, creator e operatori sulla stessa infrastruttura. Il piano operativo (OPERATIONAL_PLAN.md, Principio 5 e M4.1–M4.2) impone un isolamento forte tra tenant e un sistema RBAC articolato. Il progetto comprende almeno tre applicazioni distinte (apps/api, apps/web, Electron/iOS in futuro) e un insieme di librerie condivise (tipi, client, utilita). Prima di avviare lo sviluppo di Fase 1 e necessario fissare:

1. come organizzare il codice sorgente in un unico repository;
2. quale modello dati garantisce l'isolamento tra tenant;
3. quali ruoli applicativi coprono i profili operativi reali dell'agenzia.

Sono state valutate due opzioni: poly-repo (un repository per servizio) e monorepo (unico repository con workspace gestiti da strumenti dedicati).

## Decision

**Monorepo con Turborepo + pnpm workspaces.**

Struttura canonica:

```
apps/
  api/          # Backend NestJS (microservizi M1, M3, M4, M7...)
  web/          # Frontend Next.js (dashboard manager + creator)
packages/
  shared-types/ # Tipi TypeScript condivisi (entita, DTO, eventi)
  ui/           # Componenti React riusabili
  config/       # Configurazioni ESLint, TypeScript base
```

Turborepo gestisce il build graph (cache locale e remota, pipeline lint/test/build in parallelo). pnpm workspaces risolve le dipendenze tra package interni con link simbolici, eliminando duplicazioni.

**Modello tenant Agency → Creator → Operator.**

Ogni risorsa applicativa (Creator, Session, ChatMessage, PlatformAccount, ...) porta un campo `tenant_id` indicizzato. Le query del livello di accesso ai dati filtrano sempre su `tenant_id` ricavato dal JWT dell'utente autenticato; nessuna query cross-tenant e ammessa senza privilegio esplicito di super-admin interno.

**RBAC con cinque ruoli.**

| Ruolo | Scope tipico | Capacita principali |
|-------|-------------|---------------------|
| `owner` | Agency | Configurazione tenant, billing, tutti i permessi |
| `manager` | Agency | Roster creator, scheduling chatter, KPI, alert |
| `chatter` | Agency / Creator | Inbox unificata, risposte, note, canned responses |
| `moderator` | Creator | Moderazione chat, ban/mute, filtri |
| `creator` | Personale | Go-live, config target, visualizzazione propri analytics |

Le permission sono additive e possono essere ristrette per singolo creator o singola sessione tramite policy NestJS (Guards + Decorators).

## Consequences

**Positive:**
- Refactoring di tipi e interfacce condivisi propagato in modo atomico con un singolo PR.
- Turborepo riduce i tempi di CI saltando i task invariati (cache hit).
- Il modello `tenant_id`-first previene data-leak per costruzione; semplifica audit (M7.8) e GDPR (M7.6).
- L'elenco di ruoli copre tutti i profili operativi descritti in M4.2 senza richiedere logiche custom per agenzia.

**Negative / Trade-off:**
- Un monorepo cresce in dimensioni; richiede disciplina nei confini tra package.
- pnpm + Turborepo aggiungono un layer di tooling da mantenere.
- L'isolamento per `tenant_id` (row-level) e meno forte dello schema-per-tenant PostgreSQL; accettabile per Fase 1, da rivalutare in ADR separato se emergono requisiti di compliance piu stringenti (es. data residency per mercati diversi).

**Moduli impattati:** M4.1, M4.2, M7.1, M7.6, M8.1.
