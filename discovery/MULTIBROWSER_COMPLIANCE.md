# LiveFlow — Multi-Browser Cloud: Compliance Note, Threat Model & Guardrail
> Discovery — Safety/Compliance Specialist  
> Data: 2026-05-26  
> Scope: browser cloud con sessioni isolate (fingerprint + proxy per sessione) che iniettano sorgente video come virtual webcam nei siti cam.  
> Presupposto validato: l'agenzia/creator controlla gli account usati. Il rischio ToS è accettato dall'operatore come rischio di business.

---

## 1. Rischio ToS Piattaforme

### 1.1 Cosa rischiano gli account

Le ToS di tutte le piattaforme cam (Chaturbate, Stripchat, BongaCams, MyFreeCams, Cam4, ecc.) vietano o limitano in vari modi:

| Pratica | Rischio tipico ToS |
|---------|-------------------|
| Multi-account simultanei per la stessa creator | Ban permanente dell'account (e revenue sospesa) |
| IP/fingerprint condivisi tra account diversi | Flag antifrode → revisione manuale → ban |
| Proxy/VPN senza motivazione geografica coerente | Blocco per sospetta frode pubblicitaria o click fraud |
| Automazione del browser non autorizzata | Violazione ToS "automated access" / CFAA-adjacent |
| Sessioni browser non-standard (UA spoofing, fingerprint alterato) | Shadowban o flag qualità traffico |

**Distinzione chiave:**
- "ToS-risk dell'agenzia" = ban dell'account creator sulla piattaforma. Questo è un rischio di business che l'operatore accetta consapevolmente. LiveFlow non può eliminarlo, solo documentarlo e ridurlo.
- "Abuso che LiveFlow deve impedire" = uso della stessa infrastruttura per account non controllati dall'agenzia, frodi su reti pubblicitarie, spam, impersonazione. Questo non è rischio accettato — è illecito che la piattaforma NON deve facilitare.

### 1.2 Come ridurre il rischio operativo (best practice implementative)

1. **Un proxy dedicato per account, non per sessione temporanea.** L'IP del proxy deve essere coerente con la storia dell'account. Rotare IP a ogni sessione è il segnale antifrode più forte.
2. **Geolocalizzazione coerente.** Il proxy deve corrispondere alla nazione registrata sul profilo creator. Un account Italiana su IP statunitense è un flag immediato su tutte le piattaforme.
3. **Fingerprint stabile per account.** Il profilo browser (UA, risoluzione, timezone, lingua, WebGL hash, canvas fingerprint) deve essere persistente per account, non casuale a ogni sessione. La variazione è il segnale, non la presenza di un fingerprint specifico.
4. **Niente comportamenti palesemente automatici.** Click istantanei, navigazione a velocità macchina, assenza totale di mouse jitter: sono pattern rilevati dai sistemi antifrode. Introdurre delay umani nelle azioni di automazione UI.
5. **Un account attivo per volta per creator.** Non aprire la stessa sessione creator su due browser cloud simultanei. Duplicazione di sessione è rilevata lato server (stesso token di auth attivo da due IP).
6. **Credential management separato.** Le credenziali di ogni account non devono mai transitare in chiaro o essere condivise tra tenant diversi.

---

## 2. Age-Verification, 2257 e KYC

Questa è l'area con il rischio legale più alto. Non si tratta di ToS platform risk: si tratta di obblighi di legge (18 U.S.C. § 2257, EU AVMSD, normative locali).

### 2.1 Principio fondamentale

**Nessuna sorgente video può essere iniettata in una sessione browser-cloud se la creator che la genera non è verificata come maggiorenne con documentazione valida.**

L'iniezione della webcam porta il contenuto adulto sulla piattaforma. LiveFlow è in quel momento il "secondary producer" ai sensi del § 2257 (o equivalente EU): è responsabile del record-keeping.

### 2.2 Requisiti implementativi

| Requisito | Dettaglio |
|-----------|-----------|
| KYC obbligatorio prima dell'onboarding | Upload documento identità + data di nascita verificata. Servizi terzi: Jumio, Onfido, Stripe Identity, o equivalente. No auto-verifica interna. |
| Binding sorgente ↔ identità | Il sistema deve mappare ogni sorgente video a un `creator_id` verificato. Questo binding deve essere immutabile e auditabile. |
| Block tecnico pre-verifica | Il modulo di iniezione webcam deve essere tecnicamente impossibile da avviare se `creator.kyc_status != VERIFIED`. Controllo a livello di backend, non solo UI. |
| Record 2257 per i contenuti trasmessi | Per ogni sessione: chi (creator verificata), quando (timestamp), su quale piattaforma, durata. Record conservato per il periodo minimo legale (7 anni per § 2257; verificare con legal per EU). |
| Rinnovo KYC | Documento scaduto = re-verifica obbligatoria prima del prossimo streaming. |
| No verifica per proxy di terzi | L'agenzia NON può delegare la verifica a un'altra parte senza contratto scritto che trasferisca la responsabilità. |

### 2.3 Architettura raccomandata

```
Creator onboarding
  → KYC provider (Jumio/Onfido) → webhook → creator.kyc_status = VERIFIED
  → Document hash archiviato in record 2257 (non il documento stesso, per minimizzazione GDPR)

Go Live request
  → backend check: creator.kyc_status == VERIFIED AND creator.document_expires > now()
  → se fallisce: blocco tecnico, nessuna sessione aperta
  → se passa: session token emesso → browser cloud riceve autorizzazione inject webcam
```

---

## 3. GDPR e Gestione Dati

### 3.1 Dati di profilo e fingerprint

Il profilo browser (UA, risoluzione, canvas fingerprint, timezone, ecc.) è un dato tecnico associato a un account di terza parte — ma diventa dato personale se è linkabile a una persona fisica identificata (la creator). Sotto GDPR: dato personale da trattare.

| Categoria dato | Base giuridica | Retention | Note |
|----------------|---------------|-----------|------|
| Fingerprint browser per account | Legittimo interesse / esecuzione contratto | Vita del contratto + 1 anno | Non cedibile a terzi, non usato per profilazione pubblicitaria |
| IP del proxy | Esecuzione contratto | 90 giorni logs operativi | Log di accesso standard |
| Credenziali piattaforma (criptate) | Esecuzione contratto | Vita del contratto | AES-256, vault dedicato, zero-knowledge per gli operatori LiveFlow |
| Dati sessione (quando, quanto, quale piattaforma) | Obbligo legale (audit 2257) + esecuzione contratto | 7 anni (2257) | Audit log immutabile |
| Dati video (sorgente creator) | Esecuzione contratto | No retention del contenuto video; solo metadata sessione | Il video non viene registrato da LiveFlow salvo consenso esplicito |

### 3.2 Isolamento multi-tenant

- I profili browser di un'agenzia (Tenant A) non devono mai essere accessibili o condivisibili con un'altra agenzia (Tenant B). Isolamento a livello di database row-level security (PostgreSQL RLS già nello stack) + isolamento a livello di proxy pool.
- Proxy pool dedicati per tenant, non condivisi. Un proxy usato da Tenant A non deve mai essere riusato da Tenant B: il fingerprint dell'IP può essere associato ad account cross-tenant e generare correlazioni.

### 3.3 Giurisdizione proxy

- Proxy residenziali o datacenter in giurisdizioni GDPR-compatibili (EU/EEA preferito, o paesi con adequacy decision) per le creator EU.
- Se il proxy è US-based per un account su piattaforma US: verificare che il provider proxy sia GDPR-compliant per dati di clienti EU (Standard Contractual Clauses con il provider).
- Vietato l'uso di proxy in giurisdizioni con obblighi di data localization incompatibili (Russia, Cina, ecc.) salvo specifica valutazione legale.

### 3.4 Diritti dell'interessato (creator)

La creator ha diritto di accesso, rettifica, cancellazione (salvo obblighi di retention legale come 2257). Il sistema deve supportare tecnicamente l'esportazione e cancellazione dei dati per creator, con flag che impedisca la cancellazione di record 2257 in retention obbligatoria.

---

## 4. Audit e Accountability

### 4.1 Cosa loggare (obbligatorio)

Ogni voce di audit log deve contenere:

| Campo | Tipo | Obbligatorio |
|-------|------|-------------|
| `session_id` | UUID | SI |
| `tenant_id` | UUID | SI |
| `creator_id` | UUID (verified) | SI |
| `operator_id` | UUID (chi ha aperto la sessione) | SI |
| `platform` | enum (chaturbate, stripchat, ...) | SI |
| `proxy_id` | identificatore del proxy usato | SI |
| `browser_profile_id` | identificatore del profilo browser | SI |
| `started_at` | timestamp UTC | SI |
| `ended_at` | timestamp UTC | SI |
| `kyc_verified_at` | timestamp della verifica KYC usata | SI |
| `source_type` | enum (webcam_live, pre-recorded, ...) | SI |
| `event_type` | enum (session_open, session_close, error, forced_stop) | SI |
| `ip_egress` | IP del proxy al momento della sessione | SI |

### 4.2 Immutabilità

- Audit log scritto in append-only. Nessun operatore (incluso admin) può modificare o cancellare righe.
- Implementazione raccomandata: tabella PostgreSQL con trigger che blocca UPDATE/DELETE + replica in storage immutabile (S3 con Object Lock, o equivalente) per retention a lungo termine.
- Hash concatenato per catena di integrità (ogni record include hash del precedente): rilevazione di manomissioni anche a livello DB.

### 4.3 Accesso

- Audit log accessibile solo a: owner tenant (read-only), team compliance LiveFlow, autorità legali su ordine valido.
- Operatori normali (chatter, manager) non vedono il log grezzo; vedono solo la propria storia sessioni.

---

## 5. Guardrail Anti-Abuso della Piattaforma

Questi guardrail NON sono opzionali. Impediscono che l'infrastruttura LiveFlow sia usata per scopi illeciti da parte di un operatore malintenzionato, anche all'interno di un tenant "legittimo".

### 5.1 Guardrail Obbligatori (priorità 1 — da implementare prima del lancio)

| # | Guardrail | Implementazione |
|---|-----------|----------------|
| G1 | **KYC gate tecnico** | Backend blocca l'avvio di qualsiasi sessione browser-cloud se `creator.kyc_status != VERIFIED`. Controllo server-side, non UI-only. |
| G2 | **Binding sorgente ↔ creator verificata** | La sorgente video (stream dal telefono creator) deve essere autenticata con token monouso legato al `creator_id`. Non si può iniettare una sorgente generica o non autenticata. |
| G3 | **Consenso esplicito creator** | Prima di ogni prima sessione su una nuova piattaforma, la creator deve aver dato consenso esplicito registrato (timestamp + IP) che la sua immagine viene trasmessa su quella piattaforma tramite LiveFlow. |
| G4 | **No session sharing cross-creator** | Un browser profile è legato a un solo `creator_id`. Tecnicamente impossibile riusare un profilo browser per una creator diversa senza reset completo e nuovo KYC binding. |
| G5 | **Rate limiting sessioni** | Limite configurabile di sessioni simultanee per creator (default: 1 per piattaforma, max configurabile dall'agenzia entro limiti di sistema). Prevenzione di apertura massiva di sessioni fraudolente. |
| G6 | **Revoca immediata** | Se il KYC di una creator viene revocato (documento scaduto, verifica fallita, richiesta creator), tutte le sessioni attive per quella creator vengono terminate entro 60 secondi. |
| G7 | **No contenuto pre-registrato senza flag esplicito** | Se la sorgente è un file video anziché una webcam live, deve essere flaggato come "pre-recorded content" e visibile all'operatore. Le piattaforme cam hanno requisiti live-content; facilitare la frode "fake live" è un rischio legale separato. |
| G8 | **Isolation dei vault credenziali** | Le credenziali di piattaforma (username/password degli account cam) sono in vault criptato, accessibili solo al processo di automazione browser per quello specifico tenant. Nessun operatore umano vede la password in chiaro dopo il primo inserimento. |

### 5.2 Guardrail Obbligatori (priorità 2 — da implementare prima dello scale)

| # | Guardrail | Implementazione |
|---|-----------|----------------|
| G9 | **Anomaly detection sessioni** | Alert automatico se una sessione supera soglie anomale (durata > X ore, geo inconsistente, multi-login simultaneo stesso account su IP diversi). |
| G10 | **Offboarding creator** | Quando una creator lascia l'agenzia: revoca immediata di tutti i profili browser, credenziali, proxy binding. Zero possibilità che l'agenzia continui a operare l'account creator dopo il termine del rapporto. |
| G11 | **Audit export per creator** | La creator può richiedere in qualsiasi momento l'export completo di tutte le sessioni condotte a suo nome (GDPR art. 15). |
| G12 | **Dual-approval per operazioni sensibili** | Aggiunta di nuove piattaforme a un profilo creator, reset KYC, accesso al vault credenziali: richiedono approvazione di un secondo ruolo (es. owner + manager). |

---

## 6. Confine Etico/Legale Chiaro

### 6.1 Cosa il prodotto CONSENTE

- Operare account cam che l'agenzia/creator controlla legalmente, da infrastruttura cloud con isolamento e privacy tecnica.
- Automazione della sessione browser per avviare lo streaming (apertura pagina, autenticazione, selezione webcam sorgente, go live): azioni che la creator potrebbe fare manualmente.
- Fingerprint e proxy per coerenza del profilo di navigazione e riduzione tracking cross-sessione da parte delle piattaforme.
- Centralizzazione operativa (l'operatore umano gestisce il flusso, non la AI).

### 6.2 Cosa il prodotto DEVE VIETARE e NON FACILITARE

| Scenario vietato | Perché | Misura tecnica |
|-----------------|--------|----------------|
| Inject di sorgente video di una persona non verificata come maggiorenne | Violazione § 2257, illecito penale | G1 + G2 |
| Uso di deepfake o sorgenti video sintetiche che impersonano una persona reale | Impersonazione, frode, potenzialmente revenge porn/NCII | G2 + validazione tipo sorgente |
| Operare un account creator senza il suo consenso (es. ex-creator, creator sottratta) | Violazione GDPR, potenzialmente frode, stalking | G3 + G10 |
| Condividere profili browser o credenziali tra tenant diversi | Violazione isolamento, potenziale frode cross-account | G4 + isolamento vault |
| "Fake live" — trasmettere video pre-registrato come se fosse live, senza disclosure | Frode nei confronti degli utenti finali e della piattaforma | G7 |
| Automazione di chat AI che impersona la creator senza disclosure | CLAUDE.md principio non negoziabile; potenzialmente frode | Controllo applicativo layer chat (separato da questa feature) |
| Uso dell'infrastruttura proxy/browser per attività non-streaming (scraping, bot, frodi pubblicitarie) | Abuso di servizio, rischio legale per LiveFlow | Scoping tecnico: il browser cloud apre solo URL di piattaforme cam whitelisted |

### 6.3 Allineamento con il principio CLAUDE.md

> "AI = assistente umano, mai automazione che impersona la creator senza disclosure."

Il browser cloud NON è AI che parla al posto della creator. È uno strumento operativo che esegue azioni meccaniche (login, selezione webcam, go live) che un umano farebbe con le proprie mani. La creator è live, reale, verificata. Il chatter/operatore umano gestisce la chat. Questo confine deve essere mantenuto nella comunicazione del prodotto e nei termini di servizio di LiveFlow verso le agenzie.

---

## 7. Threat Model Sintetico

### Attori e Abusi

| Attore | Abuso potenziale | Probabilità | Impatto | Mitigazione |
|--------|-----------------|-------------|---------|-------------|
| Operatore malintenzionato (interno all'agenzia) | Aggiunge una creator non verificata; inietta sorgente non autorizzata | MEDIA | CRITICO (legale) | G1, G2, G3 |
| Agenzia cliente di LiveFlow | Usa piattaforma per operare account di creator uscite dall'agenzia | MEDIA | ALTO (legale + reputazionale) | G3, G10, G12 |
| Attore esterno (hacking) | Accede al vault credenziali; opera sessioni a nome altrui | BASSA | CRITICO | Crittografia vault, MFA, audit G1-G8 |
| Operatore negligente | Apre sessione su piattaforma sbagliata; mista sorgenti | ALTA | MEDIO | G4, G5, audit log |
| Agenzia che usa livello free/test | Tenta di bypassare KYC gate via API diretta | MEDIA | CRITICO | G1 server-side (non UI-only) |
| LiveFlow stesso (accesso abusivo ai dati tenant) | Accesso non autorizzato a credenziali o video creator | BASSA | CRITICO (GDPR) | Zero-knowledge vault, audit log accessi interni |
| Piattaforma cam che detecta automazione | Ban account, segnalazione IP | ALTA | ALTO (loss of revenue agenzia) | Best practice §1.2 (proxy stabile, fingerprint coerente) |

### Superficie di attacco principale

1. **Vault credenziali**: se compromesso, l'attaccante controlla tutti gli account cam di tutte le agenzie.
2. **KYC gate**: se bypassato (anche accidentalmente via bug), contenuto di minori può essere trasmesso — rischio penale immediato.
3. **Proxy pool**: se un proxy è condiviso tra tenant, le piattaforme possono correlare account di agenzie diverse e generare ban a cascata.
4. **Audit log**: se manomissibile, perde valore probatorio in caso di disputa legale o indagine.

---

## 8. Checklist Compliance — Multi-Browser Cloud

### Age-Verification / 2257
- [ ] KYC provider terzo integrato (Jumio/Onfido/Stripe Identity o equivalente)
- [ ] `creator.kyc_status` controllato server-side prima di ogni sessione
- [ ] Binding tecnico sorgente video ↔ `creator_id` verificato
- [ ] Record 2257 scritto per ogni sessione (creator, timestamp, piattaforma, durata)
- [ ] Retention record 2257 configurata a 7 anni (minimo legale US) con blocco cancellazione
- [ ] Procedura di rinnovo KYC per documenti in scadenza
- [ ] Blocco automatico se documento scade durante rapporto attivo

### GDPR
- [ ] Privacy notice aggiornata per trattamento dati fingerprint/proxy/sessione
- [ ] Base giuridica documentata per ogni categoria di dato
- [ ] Retention policy configurata e tecnicamente applicata
- [ ] Isolamento dati per tenant (RLS PostgreSQL + pool proxy separati)
- [ ] Proxy in giurisdizioni GDPR-compatibili (o SCCs documentate)
- [ ] Export dati creator su richiesta (art. 15) implementato
- [ ] Cancellazione dati creator su richiesta (art. 17) implementato, con eccezione dati in retention legale
- [ ] DPA (Data Processing Agreement) firmato con ogni provider KYC e proxy
- [ ] Registro dei trattamenti (art. 30) aggiornato con questa feature

### Audit & Accountability
- [ ] Schema audit log definito (tutti i campi §4.1)
- [ ] Append-only tecnico (trigger PostgreSQL anti-UPDATE/DELETE)
- [ ] Hash chain integrità audit log implementata
- [ ] Replica audit log in storage immutabile (S3 Object Lock o equiv.)
- [ ] Accesso audit log ristretto (owner + compliance + autorità su ordine)
- [ ] Alert automatico per anomalie sessione

### Guardrail Anti-Abuso
- [ ] G1–G8 tutti implementati prima del lancio
- [ ] G9–G12 pianificati nel backlog con milestone definita
- [ ] URL whitelist per browser cloud (solo piattaforme cam approvate)
- [ ] Processo offboarding creator documentato e testato
- [ ] Consenso creator per ogni nuova piattaforma: registrato e esportabile
- [ ] Test di penetrazione sul vault credenziali prima del lancio

### Termini di Servizio LiveFlow verso le Agenzie
- [ ] ToS LiveFlow esplicita: account devono essere controllati dall'agenzia/creator
- [ ] ToS esplicita: vietato uso per account di terzi senza consenso
- [ ] ToS esplicita: responsabilità rischio ToS piattaforme è dell'operatore
- [ ] ToS esplicita: LiveFlow non garantisce che le piattaforme accettino l'automazione

---

## 9. Bandiere Rosse — Scenari da NON Supportare

Questi scenari devono essere rifiutati a livello di design del prodotto, non solo di ToS:

1. **"Affittare" il browser cloud a terzi** — un'agenzia che usa LiveFlow per operare account di creator che non sono nel loro roster verificato.
2. **Multi-creator su un unico profilo browser** — un profilo che "cambia" creator: impossibile mantenere il record 2257 e il binding identità.
3. **Automazione della chat senza operatore umano in loop** — AI che risponde autonomamente ai fan impersonando la creator senza disclosure.
4. **Sorgenti video sintetiche non-live** senza disclosure esplicita all'utente finale (fake live).
5. **Proxy in giurisdizioni sanzionate** (Russia, Iran, Corea del Nord, ecc.) — rischio AML/sanzioni OFAC.
6. **Account in giurisdizioni dove il lavoro cam è illegale** — LiveFlow non deve facilitare attività illegali nella giurisdizione dell'operatore, indipendentemente dalla piattaforma.
7. **Accesso operatori LiveFlow ai contenuti video delle creator** — il personale LiveFlow non deve poter visualizzare il contenuto trasmesso; solo metadata di sessione.

---

## 10. Riassunto Esecutivo

Il multi-browser cloud è tecnicamente fattibile e legalmente operabile come strumento B2B per agenzie cam, a condizione che vengano implementati i guardrail corretti. Il rischio ToS delle piattaforme è reale ma gestibile con proxy stabili per account, fingerprint coerenti e assenza di comportamenti palesemente automatici: questo rischio è accettato dall'operatore come rischio di business. Il rischio legale non-delegabile ricade invece su LiveFlow: il gate KYC/age-verification tecnico (G1) è il guardrail più critico — il suo bypass, anche accidentale, espone a responsabilità penali (§ 2257). Il binding sorgente-identità (G2) e il consenso creator (G3) sono i guardrail operativi conseguenti. Sul fronte GDPR, il nodo principale è l'isolamento dei proxy per tenant e la DPA con i provider. L'audit log immutabile con hash chain è sia un requisito compliance (2257, GDPR) sia uno strumento di difesa in caso di disputa. Il confine etico è netto: lo strumento automatizza azioni meccaniche che un umano farebbe; non impersona la creator, non genera contenuto, non parla ai fan. Tutto ciò che supera quel confine (fake live, chat AI senza disclosure, account non consentiti) è escluso tecnicamente, non solo contrattualmente.

---

*Documento di discovery — non sostituisce legal review professionale per le giurisdizioni operative. Richiedere review legale per US (§ 2257, CFAA), EU (GDPR, AVMSD), e giurisdizione di incorporazione di LiveFlow prima del lancio della feature.*
