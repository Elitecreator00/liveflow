# LIVEFLOW — PIANO OPERATIVO

> Documento di riferimento canonico. Fonte di verità per scope, moduli e roadmap.
> Nessuno sviluppo deve allontanarsi da queste specifiche senza un ADR che lo giustifichi.
> Concept originale: `Concept.txt`. Ultimo aggiornamento: 2026-05-23.

---

## 0. Visione in una riga

LiveFlow è una piattaforma cloud di streaming e multistreaming che permette a creator, aziende e professionisti di trasmettere una singola sorgente video verso più piattaforme contemporaneamente, gestire ambienti di streaming isolati e centralizzare operazioni, monitoraggio e analytics.

---

## 1. Principi architetturali (non negoziabili)

1. **Device "dumb", cloud "smart".** Il device cattura e invia UN solo flusso (SRT/RTMP/WHIP) a un media server cloud. Il fan-out, transcoding e routing avvengono nel cloud. Mai N encoding sul device.
2. **Sicurezza e affidabilità by-design**, Cifratura, audit log, isolamento tenant, gestione credenziali e protezione dei dati sono requisiti core.
3. **AI come assistente operativo** per suggerimenti, analisi, organizzazione e produttività.
4. **Realtime-first.** Bassa latenza, event-driven, WebSocket + message broker.
5. **Multi-tenant con isolamento forte.** Agency → Creators → Operators, con RBAC e isolamento dati per tenant.
6. Ogni integrazione è sviluppata tramite adattatori modulari che consentono di collegare diverse piattaforme e destinazioni streaming.
7. **Responsive & mobile-first (obbligatorio).** Ogni schermata 100% responsive e ottimizzata su mobile (dashboard operatore su desktop/tablet/telefono + app creator su telefono).
8. **Design premium "Silicon Valley".** Estetica di fascia alta (rif. Linear/Vercel/Stripe): base dark premium, glassmorphism e gradienti sobri, tipografia curata, motion elegante. Tutto tramite design system.

---

## 1bis. SVOLTA: LIVE STUDIO / COMPOSITING (priorità rivista, 2026-05-24)

Prima del go-live "scegli-piattaforme", la base è uno **studio di produzione live nel cloud** (stile OBS / TikTok LIVE Studio):
creator preme Go Live dal telefono → LiveFlow riceve la **sorgente video** nel cloud → la si **vede/gestisce/compone** nella nostra app (overlay immagini, testo, scene) → **poi decidiamo noi le piattaforme**.
Lo stadio fan-out già costruito (un ffmpeg per target) diventa lo **stadio di OUTPUT** dello studio. Abilita successivamente la distribuzione simultanea verso più destinazioni streaming e browser session dedicate.
**Decisione architetturale aperta (serve ADR):** compositing cloud-lato-operatore vs client-sul-device vs hybrid.
Percorso: A) ingest dal telefono (WHIP/WebRTC, riusa MediaMTX) + preview live in dashboard → B) layer scene/overlay → C) output verso piattaforme (riusa fan-out) → D) app iOS nativa.

---

## 1ter. RE-PLAN (2026-05-24): topologia a DUE app + piattaforme in admin + design

Correzione strutturale dell'utente:

**Due app distinte** (design system condiviso):
- **Console Agenzia** (gestionale, owner/manager/chatter/moderator): workflow admin (crea creator, **pre-assegna le piattaforme per ogni account creator**), **editor live stile TikTok LIVE Studio / OBS** (riceve la sorgente creator, compone camera+overlay), monitoraggio, chat, analytics.
- **App Creator** (PWA ora → iOS nativa poi): MINIMALE — **solo "Go Live"** + trasmette la sorgente. Niente scelta piattaforme, niente editor.

**Le piattaforme si assegnano nell'ADMIN per-creator, NON al go-live e NON lato creator.** Flusso: admin crea creator + assegna piattaforme → creator fa Go Live → sorgente nell'editor Console → operatore compone → output verso le piattaforme pre-assegnate (riusa il fan-out M1).

**Design (cross-cutting, da IMPLEMENTARE — finora solo in specifica):** premium "Silicon Valley" (Linear/Vercel/Stripe) + responsive/mobile 100%. Rework del design system + re-skin di tutte le pagine.

**Impatto sul lavoro fatto:** la pagina /broadcast → app Creator (ridotta a solo Go Live); preview/editor → Console; connect-account/scelta piattaforme → workflow admin per-creator (non al go-live); ingest LiveKit (fatto) resta valido.

---

## 2. RISCHI ESISTENZIALI DA VALIDARE PRIMA (Fase 0)

| # | Rischio | Mitigazione / Deliverable |
|---|----------|--------------------------|
| R1 | Integrazioni piattaforme eterogenee | Architettura adapter-based e framework di integrazione modulare |
| R2 | Piattaforme senza protocolli di ingest standard | Layer di compatibilità e connettori dedicati |
| R3 | Elevato consumo di banda, elaborazione media e transcoding | Autoscaling, ottimizzazione encoding e gestione efficiente delle risorse |
| R4 | Guasti infrastrutturali e interruzioni di servizio | Failover automatico, monitoraggio continuo e disaster recovery |
| R5 | Sicurezza delle credenziali e degli accessi | Credential vault cifrato, gestione segreti e audit log |
| R6 | Crescita del numero di stream e sessioni simultanee | Architettura cloud scalabile orizzontalmente e distribuzione del carico |

## 3. MODULI E FUNZIONI (ogni singola funzione)

### M1 — MULTISTREAMING ENGINE (il cuore)
- **M1.1 Connessione account piattaforma**: OAuth dove disponibile / credential vault cifrato; gestione token refresh; stato connessione per piattaforma.
- **M1.2 Ingest node**: ricezione flusso dal device via RTMP / SRT / WHIP (WebRTC); autenticazione stream key per sessione.
- **M1.3 Transcoding pipeline (FFmpeg)**: multi-bitrate / ABR; adattamento risoluzione e orientamento per piattaforma (es. verticale mobile vs orizzontale); normalizzazione audio.
- **M1.4 Fan-out / distribuzione**: push simultaneo verso N piattaforme di destinazione; gestione per-target di stream key, endpoint, formato.
- **M1.5 Stream health monitoring**: bitrate, fps, dropped frames, latenza, stato connessione per ogni target; storico qualità.
- **M1.6 Auto-reconnect & failover**: retry con backoff, ri-push automatico, gestione disconnessioni target singolo senza abbattere gli altri.
- **M1.7 Routing & relay**: relay media server geo-distribuiti; selezione percorso ottimale; relay premium (revenue).
- **M1.8 "Go Live" orchestration**: one-click; avvio/stop coordinato di tutti i target; pre-flight check (account connessi, qualità ingest).
- **M1.9 Per-target config**: titolo, tag, risoluzione, bitrate cap, on/off per singola piattaforma.
- **M1.10 Recording / VOD** (fase successiva): registrazione sessione, storage, replay.
- **M1.11 Scene / overlay / branding** (fase successiva): overlay, watermark, scene switching.
- **M1.12 Browser Session Manager**: creazione e gestione di browser isolati; profili persistenti; avvio/arresto sessioni; gestione gruppi di sessioni; monitoraggio stato; assegnazione risorse; associazione sessione ↔ account ↔ destinazioni streaming.
- **M1.13 Fingerprint Engine**: configurazione e gestione fingerprint indipendenti per sessione; user agent, timezone, language, screen resolution, hardware profile, canvas profile, WebGL profile, font profile e parametri ambientali personalizzabili.
- **M1.14 Proxy Orchestrator**: assegnazione proxy dedicati per sessione; supporto HTTP/HTTPS/SOCKS5; health check automatici; monitoraggio connettività; gestione pool proxy; geo-targeting e policy di routing.
- **M1.15 Session Persistence Layer**: gestione persistente di cookie, local storage, session storage, cache e preferenze browser; backup e ripristino profili.
- **M1.16 Browser Health Monitoring**: monitoraggio realtime di CPU, RAM, consumo banda, stato connessione, crash detection, restart automatico e alert operativi.
- **M1.17 Remote Session Access**: accesso remoto alle sessioni browser tramite dashboard; visualizzazione stato; controllo operativo e gestione centralizzata.

### M2 — DEVICE APPS
- **M2.1 Web dashboard (Next.js)**: go-live da browser (WebRTC/WHIP), gestione, monitoring.
- **M2.2 Desktop app (Electron)**: capture camera/schermo, encoding, invio stream; comportamento OBS-like semplificato.
- **M2.3 iOS app nativa**: capture camera, encoding hardware, invio SRT/RTMP; UI go-live; gestione qualità.
- **M2.4 Stato live realtime sul device**: anteprima, indicatori di qualità, notifiche.

### M3 — UNIFIED CHAT ENGINE
- **M3.1 Connettori chat per piattaforma**: ingest realtime dei messaggi (dove API/feed disponibili).
- **M3.2 Inbox centralizzata**: aggregazione di tutte le chat in un'unica vista, sincronizzazione realtime.
- **M3.3 Identificazione messaggio**: per piattaforma e per utente; deduplica; threading per conversazione.
- **M3.4 Assegnazione operatore**: routing messaggi a chatter/manager; lock per evitare doppie risposte; typing indicator multi-operatore.
- **M3.5 Invio outbound**: risposta verso la piattaforma di origine dall'inbox unificata.
- **M3.6 VIP filter & user tagging**: tag utenti, filtri per segmento.
- **M3.7 Note interne & cronologia**: note per utente, storico interazioni (conversational memory).
- **M3.8 Moderation tools**: ban/mute/flag, blocklist parole, segnalazioni.
- **M3.9 Spender tracking**: associazione utente → spesa, identificazione spender.
- **M3.10 Quick replies / canned responses**: template, snippet riutilizzabili.

### M4 — AGENCY OPERATING SYSTEM (manager dashboard)
- **M4.1 Multi-tenant model**: Agency → Creators → Operators; isolamento dati.
- **M4.2 RBAC**: ruoli owner / manager / chatter / moderator / creator; permessi granulari.
- **M4.3 Live monitoring wall**: tutte le live attive, anteprime, stato qualità in tempo reale.
- **M4.4 KPI realtime**: dashboard operativa.
- **M4.5 Alert tecnici**: notifiche su problemi streaming/qualità.
- **M4.6 Creator roster management**: anagrafica creator, account collegati, stato.
- **M4.7 Chatter scheduling / shift**: turni operatori, assegnazioni creator↔chatter.
- **M4.8 Supervisione operatori**: vista attività chatter, performance.

### M5 — ANALYTICS & REVENUE
- **M5.1 Revenue per creator**; **M5.2 Tips per minuto**; **M5.3 Retention utenti**; **M5.4 Conversion rate**; **M5.5 Performance chatter**; **M5.6 Utenti attivi**; **M5.7 Durata sessioni**.
- **M5.8 Revenue attribution**: quale chatter/azione ha generato la conversione.
- **M5.9 Dashboard, report, export** (CSV/PDF/scheduled).
- **M5.10 Data warehouse / ETL**: pipeline dati per analytics e per il training AI.

### M6 — AI MONETIZATION LAYER
- **M6.1 Reply suggestions** (assistive); **M6.2 Realtime translation multi-lingua**.
- **M6.3 User behavior analysis**; **M6.4 Spend prediction**; **M6.5 Upsell suggestions**.
- **M6.6 User classification** (VIP / inattivo / high-intent); **M6.7 Conversational memory / RAG per utente**.
- **M6.8 Monetization trend detection**.
- **M6.9 (Long term) Recommendation engine proprietario, predictive monetization, behavioral intelligence.**


### M7 — INFRASTRUCTURE / PLATFORM / DEVOPS
- **M7.1 Microservizi NestJS**; **M8.2 PostgreSQL**; **M8.3 Redis**; **M8.4 WebSocket gateway**.
- **M7.5 Message broker** (Kafka/NATS) per eventi realtime.
- **M7.6 Media servers / RTMP relay** geo-distribuiti.
- **M7.7 Observability**: logging strutturato, tracing, metriche.
- **M7.8 CI/CD + IaC**; **M8.9 Autoscaling**; **M8.10 Disaster recovery / backup**.
- **M7.11 Security hardening + threat model + pen-test**.

### M8 — NOTIFICATIONS
- **M8.1 Push realtime** (web/mobile); **M9.2 Alert tecnici streaming**; **M9.3 Revenue milestone alerts**.

---

## 4. ROADMAP A FASI

- **Fase 0 — Discovery & Architettura** *(blocca tutto il resto)*:
  validazione architettura browser isolati, fingerprint engine, proxy orchestration, session persistence, streaming architecture e media pipeline. Definizione dei requisiti di scalabilità, sicurezza, monitoring e disaster recovery. Output: architettura definitiva e proof-of-concept funzionante.

- **Fase 1 — MVP Browser & Streaming Core**:
  M7 (auth + multi-tenant base), M1 (browser session engine + streaming engine), M2.1 (web dashboard), M4.3 (monitoring base). Obiettivo: creare, avviare e gestire browser isolati con fingerprint e proxy dedicati, ricevere una sorgente video e distribuirla verso più destinazioni.

- **Fase 2 — Operations Console & Session Management**:
  M3 (session management), M4 completo (RBAC, gestione workspace, monitoraggio centralizzato), M9 (notifiche realtime). Obiettivo: gestione centralizzata di utenti, sessioni, browser, proxy e infrastruttura da un'unica console.

- **Fase 3 — Analytics & Infrastructure Insights**:
  M5 completo, M5.10 data warehouse. Obiettivo: analytics avanzate su sessioni, streaming, utilizzo risorse, uptime, performance infrastrutturale, consumo banda e capacità operativa.

- **Fase 4 — AI Assistance Layer**:
  M6 completo. Obiettivo: suggerimenti operativi, anomaly detection, predictive monitoring, resource optimization, workflow intelligence e supporto decisionale.

- **Fase 5 — Scaling & Enterprise**:
  M2.2/M2.3 (desktop + iOS native), M1.7 relay infrastructure avanzata, M7.9 white-label, clustering multi-regione, alta disponibilità, espansione enterprise e infrastruttura distribuita su larga scala.

---

## 5. STACK TECNICO (da concept)

- **Frontend**: Next.js (dashboard), Electron (desktop), iOS nativo.
- **Backend**: NestJS (microservizi), PostgreSQL, Redis, WebSocket.
- **Streaming**: RTMP/SRT/WHIP ingest, FFmpeg pipelines, relay media servers, health monitoring.
- **AI**: OpenAI APIs + behavioral analytics + recommendation engine + conversational memory.
- **Obiettivi infra**: bassa latenza, alta affidabilità, scaling realtime, multi-creator concurrency.

---

## 6. BUSINESS MODEL (da concept)

SaaS subscription + AI credits + infrastruttura premium (relay) + white-label + enterprise integrations.
Piani: creator individuali / piccole agenzie / enterprise.
GTM: test interno in agenzia operativa → licensing ad altre agenzie → white-label → espansione internazionale.
