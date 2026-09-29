# LIVEFLOW — TEAM DI AGENTI (ruflo)

> Modello operativo: il **Project Manager (coordinator)** orchestra le squadre.
> Ogni ruolo mappa a un `subagent_type` reale, dispatchabile via il tool Agent.
> I 300 agenti = capacità di parallelizzare più istanze di questi ruoli su task indipendenti.

## Comando — Project Manager / Orchestrator
- **PM / Coordinator** → `ruflo-swarm:coordinator` — gestisce lifecycle agenti, assegnazione task, anti-drift.
- **Horizon Tracker** → `ruflo-goals:horizon-tracker` — traccia obiettivi long-horizon e milestone tra sessioni.
- **Goal Planner** → `ruflo-goals:goal-planner` — piani d'azione e replanning.

## Squadra Discovery & Strategia (Fase 0 — priorità massima)
- **Deep Researcher** → `ruflo-goals:deep-researcher` — Platform Capability Matrix, ricerca ToS/legale/competitor.
- **Dossier Investigator** → `ruflo-goals:dossier-investigator` — investigazione approfondita per piattaforma.
- **System Architect** → `ruflo-swarm:architect` — architettura, contratti API, confini moduli.
- **Domain Modeler (DDD)** → `ruflo-ddd:domain-modeler` — bounded context, aggregate, eventi di dominio.
- **ADR Architect** → `ruflo-adr:adr-architect` — decisioni architetturali tracciate.

## Squadra Engineering
- **Streaming/Media Engineer** → `ruflo-core:coder` — ingest RTMP/SRT/WHIP, FFmpeg, fan-out, relay (M1).
- **Backend Engineer** → `ruflo-core:coder` — microservizi NestJS, PostgreSQL, Redis, WebSocket (M8).
- **Realtime/Chat Engineer** → `ruflo-core:coder` — unified chat engine, connettori, broker (M3).
- **Frontend Engineer** → `ruflo-core:coder` — dashboard Next.js (M2.1, M4, M5 UI).
- **Mobile Engineer** → `ruflo-core:coder` — iOS nativo + Electron (M2.2/M2.3).
- **AI/ML Engineer** → `ruflo-intelligence:intelligence-specialist` — AI monetization layer (M6).
- **Data Engineer** → `ruflo-core:coder` — ETL, data warehouse, analytics pipeline (M5.10).
- **Migration Engineer** → `ruflo-migrations:migration-engineer` — schema DB e migrazioni.

## Squadra Qualità, Sicurezza & Compliance
- **Security Auditor** → `ruflo-security-audit:security-auditor` — threat model, hardening, pen-test (M8.11).
- **Safety/PII Specialist** → `ruflo-aidefence:safety-specialist` — PII scanning, GDPR, dati sensibili (M7.6).
- **Code Reviewer** → `ruflo-core:reviewer` — review qualità/sicurezza/best practice.
- **QA / Tester (GATE obbligatorio)** → `ruflo-testgen:tester` — test TDD, coverage, integrazione/E2E. Una feature NON avanza finché i test non sono verdi.
- **Observability Engineer** → `ruflo-observability:observability-engineer` — logging, tracing, metriche (M8.7).

## Squadra Design & UX
- **Brand & Design System Specialist** → `claude` (catch-all) — definisce la brand identity (logo direction, palette, tipografia, tono) e il **design system** (token, componenti, spacing, motion) coerente su tutto LiveFlow. Output: design system documentato e riutilizzabile.
- **Product Designer / UX** → `claude` (catch-all) — cura usabilità e flussi end-to-end di ogni sezione; valida step-by-step che la UX sia la migliore possibile; lavora a stretto contatto col Frontend Engineer.
- Il **Frontend Engineer** implementa fedelmente il design system: non improvvisa UI fuori dai token/componenti definiti.

## Squadra Documentazione
- **Docs Writer** → `ruflo-docs:docs-writer` — documentazione prodotto e tecnica.

## Regole di ingaggio
1. Nessun lavoro di prodotto inizia prima che la Fase 0 (Discovery) chiuda la Platform Capability Matrix.
2. Ogni decisione architetturale rilevante → ADR.
3. Ogni modulo segue lo scope di `OPERATIONAL_PLAN.md`; deviazioni richiedono ADR.
4. Security & compliance review obbligatoria prima di toccare dati utente reali.
5. **Definition of Done**: una feature è "fatta" SOLO se → (a) test automatici verdi (unit + integrazione/E2E rilevanti), (b) code review superata, (c) check UX + coerenza col design system. Senza tutti e tre, non si avanza.
6. **Design-first**: ogni sezione UI nasce dal design system (moderno, accattivante, coerente con la brand identity). Niente UI improvvisata fuori dai token/componenti approvati.
