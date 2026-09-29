# ADR-0005 — Confine di accesso ruolo → app (Console Agenzia vs App Creator)

## Status

Accepted — 2026-05-24 (formalizza la separazione implementata durante la sessione di validazione preview live)

## Context

La topologia di prodotto (OPERATIONAL_PLAN.md §1ter) prevede **due app distinte** che condividono backend e design system:

- **Console Agenzia** (`apps/console`, porta 3000) — gestionale per lo staff: admin (crea creator, assegna piattaforme), Studio/editor live, monitoring, chat, analytics.
- **App Creator** (`apps/creator`, porta 3100) — PWA minimale per la creator: **solo "Go Live"**.

Entrambe le app usano lo stesso endpoint `POST /auth/login`. Prima di questa decisione, qualsiasi utente con credenziali valide poteva autenticarsi su **entrambe** le app: una CREATOR poteva entrare nella Console Agenzia (riscontrato in test — l'utente risultava loggato come creator "Lisa" nella Console). Questo viola la topologia a due app e confonde l'esperienza (la creator vedeva la shell del gestionale, con voci di menu non pertinenti).

I ruoli (enum Prisma `Role`) sono: `OWNER`, `MANAGER`, `CHATTER`, `CREATOR`.

## Decision

**Definire un confine di accesso esplicito per-app, basato sul ruolo, applicato lato client come gate di sessione.**

- **Console Agenzia** ammette solo ruoli **staff**: `OWNER`, `MANAGER`, `CHATTER`. `CREATOR` è respinto.
- **App Creator** è destinata al ruolo `CREATOR` (le creator).

`CHATTER` è classificato come staff (opera la chat unificata nella Console). `MANAGER`/`OWNER` hanno in più l'accesso alle aree admin.

### Implementazione (difesa a livelli)

1. **Gate al login** (`apps/console/.../login/page.tsx`): dopo il login, se il ruolo nel token non è in `AGENCY_ROLES = [OWNER, MANAGER, CHATTER]`, non si salva la sessione e si mostra un errore esplicito ("questo account non ha accesso alla Console agenzia").
2. **Guard del dashboard** (`apps/console/.../(dashboard)/layout.tsx`): all'avvio, un token senza ruolo valido o con ruolo non-staff viene invalidato (`clearAuth`) e si reindirizza al login. Copre anche le sessioni "stale" emesse prima dell'introduzione del gate.
3. **Gating del menu Admin**: la voce Admin appare solo per `OWNER`/`MANAGER`.

La fonte di verità del ruolo è il claim `role` nel JWT (con fallback allo user salvato).

### Backend (già presente, non modificato)

Gli endpoint admin dell'API sono già protetti server-side: `agencies/:agencyId/creators` usa `@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)` + `@Roles(OWNER, MANAGER)`. Il gate per-app è quindi una protezione di **topologia/UX**; l'autorizzazione sui dati resta enforced lato server (RBAC, ADR-0001).

## Consequences

### Positive

- Coerenza con la topologia a due app: ogni ruolo entra solo dove deve.
- UX pulita: la creator non vede mai la shell del gestionale.
- Self-healing: le sessioni stale o di ruolo errato vengono espulse automaticamente.

### Negative / Trade-off

- Il gate è **client-side** (le due app sono SPA Next.js che condividono l'API). Non è una barriera di sicurezza: è enforcement di topologia/UX. La sicurezza reale resta l'RBAC server-side (ADR-0001) sugli endpoint.
- L'enum dei ruoli ammessi è duplicato in due punti del client (login + guard). Mantenere allineati; valutare un'estrazione condivisa in `@liveflow/api-client` se cresce.

### Moduli impattati

| Modulo | Impatto |
|--------|---------|
| M4.2 RBAC | Aggiunge il confine ruolo→app lato client (oltre all'RBAC server-side) |
| M7.1 Auth | Il login della Console filtra i ruoli non-staff |
| M2.1 Web dashboard / App Creator | Definisce quale ruolo accede a quale app |

## Riferimenti

- ADR-0001 — multi-tenancy e RBAC (autorizzazione server-side)
- OPERATIONAL_PLAN.md §1ter — topologia a due app
- Memoria progetto: `liveflow-app-topology`
