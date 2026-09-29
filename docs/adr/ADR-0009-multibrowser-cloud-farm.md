# ADR-0009 — Multi-browser cloud farm con iniezione webcam (architettura e approccio)

## Status

**Superseded da [ADR-0010](ADR-0010-multibrowser-refocus-permissive-sites.md)** — 2026-06-11. Il progetto ha abbandonato il go-live sulle piattaforme livecam (rischio ToS/§2257 esistenziale): cade il target adult-cam e con esso lo spike S3 esistenziale. La **funzione multi-browser sopravvive** ma rifocalizzata su siti multistreaming permissivi, con anti-detect completo (Scenario B). Lo stack tecnico (Camoufox + v4l2loopback + Neko + ingestor LiveKit) e gran parte dei guardrail sono **ripresi e ricalibrati** in ADR-0010. Questo documento resta come archivio del ragionamento Discovery originale.

_(originariamente: **Proposed — spike-gated** — 2026-05-26. Direzione approvata dall'utente: deployment cloud farm; ricostruire l'anti-detect in casa senza dipendenze a pagamento; uso legittimo + rischio ToS accettato. L'architettura sotto era la raccomandazione del team Discovery; non si passava ad Accepted finché gli spike S1–S3 non validavano i rischi critici.)_

Discovery completata da 3 ricerche parallele:
- `discovery/ANTIDETECT_BROWSER_RESEARCH.md` — interni anti-detect + "build our own".
- `discovery/MULTIBROWSER_FARM_ARCHITECTURE.md` — runtime farm + iniezione video + spike.
- `discovery/MULTIBROWSER_COMPLIANCE.md` — threat model + guardrail.

## Context

Molte piattaforme cam (es. **LiveJasmin**, vedi `discovery/TECH_CAPABILITY_MATRIX.md`) **non accettano RTMP**: vogliono una **webcam nel browser**. Il fan-out RTMP (ADR-0002) non le copre. Serve uno strumento che apra sessioni browser isolate (proxy + fingerprint per account) e vi inietti la sorgente video dell'agenzia come webcam, così il sito la vede come camera reale. Le sessioni sono operate dall'operatore per account che l'agenzia/creator controllano legittimamente.

## Decision (raccomandazione, soggetta agli spike)

### 1. Engine anti-detect: **Camoufox** (NON fork Chromium proprietario)
Camoufox (Firefox anti-detect **MIT, self-hostato, Docker-ready**) intercetta i vettori di fingerprint a **livello C++** (nativi, non smascherabili come gli override JS). Soddisfa il requisito "no dipendenze esterne a pagamento" — lo controlliamo noi. Un **fork Chromium in casa è escluso** (6-12 mesi + 3-5 ingegneri C++). Fingerprint coerenti via BrowserForge (preset reali). Punto di estensione pluggable se in futuro si cambia engine.

### 2. Iniezione video: **v4l2loopback** (NON override JS di getUserMedia)
Device `/dev/videoN` a livello kernel con label plausibile ("HD Webcam C920") → il browser lo vede come camera fisica reale, **nessuna signature JS rilevabile**. Pipeline: `LiveKit Room → ingestor (@livekit/rtc-node) → FFmpeg/GStreamer → /dev/videoN → getUserMedia`. L'override JS è scartato (rilevabile/fragile).

### 3. Runtime farm: **Docker + Chromium/Camoufox + Neko**, una sessione per container
Container isolato per sessione (profilo cookie + proxy + fingerprint + /dev/video propri). **Neko (n.eko)** per il display remoto WebRTC verso la Console (l'operatore vede e naviga la sessione). Esclusi browserless/Selenium/Steel (no media devices) e Kasm (overhead). Multi-tenant per agenzia (ADR-0001).

### 4. Proxy: **stabile per-account** (non per-sessione)
Coerenza geo↔timezone↔fingerprint; un proxy persistente per account è la regola anti-ban (la *variazione* insospettisce gli antifrode, non il fingerprint in sé). Protezione leak DNS/WebRTC obbligatoria.

### 5. Guardrail di compliance — NEL CODICE, non solo nei termini (ordine di priorità)
- **G1** KYC/age-verification **gate server-side**: blocco tecnico se la creator non è verificata (rischio §2257 penale). **Da costruire per primo.**
- **G2** Binding **sorgente↔creator_id** con token monouso autenticato (no inject di sorgenti arbitrarie).
- **G3** Consenso esplicito della creator, registrato per piattaforma.
- **G4** Un profilo browser = un solo creator_id (record 2257 mantenibili).
- **G5** Rate-limit sessioni simultanee. **G6** Revoca KYC → terminazione sessioni ≤60s.
- **G7** Flag obbligatorio per sorgenti pre-registrate (anti fake-live). **G8** Vault credenziali zero-knowledge per operatori.
- Audit log **append-only con hash chain**. Personale LiveFlow: solo metadata, mai accesso al contenuto video.

### Bandiere rosse (escluse a livello di design)
Sorgenti di non-verificati-maggiorenni; deepfake/sintetici che impersonano una creator; account senza consenso; multi-creator su un profilo; proxy in giurisdizioni sanzionate (OFAC). Coerente con "AI/automazione assiste, non impersona la creator" (CLAUDE.md).

## Gate / Spike (prima di Accepted e di costruire la farm)
- **S1 (critico)** v4l2loopback + FFmpeg testsrc + Chromium container + pagina getUserMedia → il device finto è visto come reale. *Senza LiveKit.*
- **S2 (critico)** sostituire testsrc con traccia reale di una LiveKit Room (@livekit/rtc-node); misurare latenza (<2s).
- **S3 (rischio esistenziale)** aprire una piattaforma target (es. LiveJasmin) e verificare che accetti la webcam virtuale **via browser**. ⚠️ LiveJasmin potrebbe richiedere l'app nativa **JasminCam** → se non c'è broadcast browser-diretto, la farm da sola non basta per quella piattaforma (alternativa: JasminCam via Wine nel container, o ri-prioritizzare).
- **S4 (medio)** CDP `Page.startScreencast` → Console (controllo operatore). **S5 (basso)** 3 sessioni concorrenti, isolamento /dev/video separati.

## Consequences

### Positive
- Copre le piattaforme webcam-only che l'RTMP non raggiunge → completa il multistreaming.
- Anti-detect "nostro" (Camoufox self-host) senza canoni; webcam virtuale poco rilevabile.
- Riusa LiveKit (sorgente già disponibile); coerente con cloud/multi-tenant.

### Negative / Rischi
- **Dev richiede Linux**: v4l2loopback non gira su Docker Desktop/WSL2 (Windows). Spike su VM Linux/VPS (~$5-10).
- **S3 esistenziale**: alcune piattaforme potrebbero forzare app native → farm insufficiente lì.
- Limiti di fingerprint onesti: **JA3/TLS** da container Linux ≠ Chrome-Windows (serve proxy-TLS impersonation); **canvas/GPU** headless = software (llvmpipe) hash anomalo (serve preset hardware reale o GPU passthrough). Behavioral ML irrilevante (operatori umani reali).
- Costo: ~2-2.5 vCPU / 1.3GB per sessione; ~10 sessioni ≈ $80-120/mese VPS.
- **Legal review professionale** (US §2257/CFAA, EU GDPR/AVMSD) raccomandata prima del lancio.

### ADR successivi (post-spike)
ADR-0010 v4l2 strategy prod; ADR-0011 anti-detect engine (conferma Camoufox); ADR-0012 remote display (Neko vs CDP screencast).

## Riferimenti
I tre dossier Discovery sopra; ADR-0001 (multi-tenant), ADR-0002 (fan-out RTMP), ADR-0004/0006 (LiveKit/Egress).
