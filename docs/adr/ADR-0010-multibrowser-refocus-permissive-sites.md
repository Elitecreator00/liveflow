# ADR-0010 — Multi-browser farm rifocalizzata su siti multistreaming permissivi (supersede ADR-0009)

## Status

**Accepted** — 2026-06-11. Supersede **ADR-0009** (che passa a *Superseded*). **Raffinato da ADR-0011** (2026-06-12): display remoto **CDP in-house al posto di Neko** e modello dati a **stanze** (`BrowserRoom`); restano validi qui scope, target e guardrail C1–C6. Decisione dell'utente: il progetto **abbandona il go-live diretto sulle piattaforme livecam** (LiveJasmin & affini), perché i loro vincoli ToS rendevano la cosa troppo limitante e portavano un rischio esistenziale (spike S3 di ADR-0009: incerto che accettassero una webcam virtuale via browser).

Resta **solo la funzione multi-browser**: aprire sessioni browser isolate che ricevono la sorgente webcam dello Studio e la presentano, come **webcam virtuale**, a **siti che consentono il multistreaming senza limitazioni**. Cadendo il target adult-cam, **cade il rischio esistenziale S3** e gran parte del carico §2257/KYC che gravava su ADR-0009.

## Context

Il meccanismo tecnico centrale di ADR-0009 rimane valido e desiderato: `sorgente LiveKit (Studio) → ingestor → FFmpeg → /dev/video (webcam virtuale) → getUserMedia del sito`. Quello che cambia è il **target** (siti permissivi, non piattaforme cam ostili) e quindi il **profilo di rischio**.

**Scelta utente confermata: Scenario B.** Anche se i siti target permettono il multistreaming, l'agenzia gestisce **più account/creator in parallelo**: vanno tenuti **non collegabili tra loro** dagli antifrode delle piattaforme (stesso IP / stessa identità browser su 10 account → marcatura come multi-account → sospensione). Per questo si **mantiene l'anti-detect completo**: fingerprint unico + proxy unico + isolamento per sessione. (Lo Scenario A "sola iniezione webcam senza anti-detect" è stato scartato dall'utente.)

Vincolo operativo confermato: l'utente fornisce un **VPS Linux** (v4l2loopback è kernel-only, non gira su Windows/WSL2). L'operatore deve poter usare l'interfaccia **da qualsiasi PC via Chrome**, senza installare nulla → display remoto WebRTC (Neko) + Console Next.js raggiungibili da browser.

## Decision

Si conferma lo **stack tecnico di ADR-0009** (le motivazioni di engine/iniezione restano valide):

1. **Engine anti-detect: Camoufox** (Firefox anti-detect MIT, self-host, intercetta i vettori a livello C++). Punto di estensione pluggable. Fork Chromium in casa resta escluso.
2. **Iniezione video: v4l2loopback** (device `/dev/videoN` kernel-level con label plausibile; nessuna signature JS rilevabile). Pipeline `LiveKit Room → ingestor (@livekit/rtc-node) → FFmpeg → /dev/videoN`.
3. **Runtime farm: Docker, una sessione per container** (profilo cookie + proxy + fingerprint + /dev/video propri) + **Neko** per il display remoto verso la Console. Multi-tenant per agenzia (ADR-0001).
4. **Proxy stabile per-account** (coerenza geo↔timezone↔fingerprint; la *variazione* insospettisce gli antifrode).

### Architettura a due piani (chiarita rispetto ad ADR-0009)

- **Control-plane (gira su Windows in dev, parte dell'API NestJS esistente)**: modello dati, orchestrazione, binding sorgente↔creator, guardrail, UI Console. **Nessun media** → costruibile e testabile sul PC dell'utente.
- **Data-plane / farm (gira sul VPS Linux)**: container browser + v4l2loopback + ingestor LiveKit + Neko. Il control-plane gli parla via HTTP e gli passa una *launch spec* `{ wsUrl, viewerToken (room sorgente), proxy, fingerprint }`.

### Guardrail di compliance (ricalibrati — il target non è più adult-cam)

Decadono dal percorso critico i gate §2257-pesanti di ADR-0009 (G1 KYC come blocco esistenziale). **Restano** perché trasversali e a basso costo:
- **C1 — Binding sorgente↔creator_id** con token monouso (no iniezione di sorgenti arbitrarie). *Era G2, confermato.*
- **C2 — Un profilo browser = un solo creator_id** (separazione pulita degli account, requisito anti-link). *Era G4.*
- **C3 — Consenso esplicito della creator** registrato per sito.
- **C4 — Audit log append-only**; personale LiveFlow: solo metadata, mai il contenuto video.
- **C5 — Vault credenziali/proxy cifrato** (riusa CryptoService AES-256-GCM esistente).
- **C6 — Rispetto del ToS del sito target**: la farm è per siti che **consentono** il multistreaming; resta vietato l'uso per aggirare divieti espliciti di un sito. **Rischio residuo da sorvegliare**: se la sorgente è contenuto adult e un sito target è mainstream con policy SFW, c'è un mismatch di policy di contenuto — da verificare per-sito prima dell'onboarding.

### Bandiere rosse (invariate da ADR-0009)
Sorgenti di non-verificati-maggiorenni; deepfake/sintetici che impersonano una creator; account senza consenso; multi-creator su un profilo; proxy in giurisdizioni sanzionate (OFAC).

## Spike (ora validazione tecnica, NON più gate esistenziale)

Caduto S3, gli spike servono solo a provare la meccanica prima di costruire la farm completa. Su VPS Linux (kit in `spikes/multibrowser/`):
- **S1** v4l2loopback + FFmpeg `testsrc` + container Chromium/Camoufox + pagina `getUserMedia` → il device finto è visto come camera reale.
- **S2** sostituire `testsrc` con una traccia reale di una LiveKit Room dello Studio (@livekit/rtc-node); latenza target <2s.
- **S4** Neko → display remoto in Chrome da qualsiasi PC (controllo operatore).
- **S5** 3 sessioni concorrenti, /dev/video isolati, fingerprint+proxy distinti.

## Consequences

### Positive
- Profilo di rischio molto più basso: niente target ostili, niente go/no-go esistenziale, carico legale ridotto.
- Stack tecnico riusato integralmente; lo Studio resta la sorgente (`GET /studio/active` espone già `wsUrl + viewerToken`).
- Control-plane costruibile subito su Windows; farm isolata sul VPS.

### Negative / Rischi
- L'anti-detect completo (Scenario B) resta la parte costosa: ~2–2.5 vCPU / 1.3GB per sessione, Camoufox + proxy per-account.
- Limiti di fingerprint onesti (JA3/TLS da Linux ≠ Chrome-Windows; canvas/GPU headless) — vedi ADR-0009 §Negative.
- C6: mismatch policy di contenuto sito-per-sito da verificare in onboarding.

### ADR successivi (post-spike)
ADR-0011 conferma engine anti-detect (Camoufox); ADR-0012 remote display (Neko vs CDP screencast); ADR-0013 strategia proxy/vault.

## Riferimenti
ADR-0009 (superseded — dossier Discovery `discovery/ANTIDETECT_BROWSER_RESEARCH.md`, `MULTIBROWSER_FARM_ARCHITECTURE.md`, `MULTIBROWSER_COMPLIANCE.md`), ADR-0001 (multi-tenant), ADR-0002 (fan-out RTMP), ADR-0004/0006 (LiveKit/Egress). Kit spike: `spikes/multibrowser/`.
