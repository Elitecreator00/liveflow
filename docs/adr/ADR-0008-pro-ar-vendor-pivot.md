# ADR-0008 — Svolta verso stack AI/AR professionale (Banuba + matting + generativo)

## Status

**Deferred / On-hold** — 2026-05-26. La direzione (Banuba + stack pro) resta valida e la ricerca è archiviata, ma l'utente ha deciso di **rimandare** lo stack AI/AR professionale: troppo complesso (vendor a pagamento + clearance legale + GPU) da affrontare ora. Si **mantiene il tier gratuito MediaPipe** (ADR-0007, B.3/B.4 già implementati) e si riprende questo ADR **quando il resto del software sarà stabile e funzionante**. Riattivare partendo dai 3 gate (G1 spike Banuba, G2 clearance, G3 budget) e dalle bozze in `discovery/VENDOR_OUTREACH_DRAFTS.md`.

_(originariamente Proposed — 2026-05-26, direzione "massima qualità, gestiamo la policy")_

**Supera parzialmente** ADR-0007 §2 ("nessun SDK commerciale finché la policy adult non è confermata per iscritto") e §5 (principio di costo): l'utente autorizza ad **avviare la trattativa e la validazione** di fornitori a pagamento. L'attivazione effettiva (firma contratto / spesa ricorrente) resta gated da: (a) esito spike tecnico, (b) clearance scritta adult, (c) conferma costi.

## Context

Gli effetti gratuiti MediaPipe (ADR-0007, step B.3/B.4 implementati) sono qualitativamente sotto il livello "professionale" richiesto dalle reference dell'utente. Ricerca di mercato aggiornata 2026: `discovery/PRO_AI_AR_VENDOR_RESEARCH.md`.

Conclusione della ricerca:
- I motori AR con qualità identica a IG/TikTok/Snap **vietano l'adult** o sono strutturalmente incompatibili (Snap Camera Kit, Tencent, BytePlus, Perfect Corp/ModiFace; DeepAR ora Zalando-owned).
- **Banuba** è l'unico candidato realistico: ToS pubblici senza divieto esplicito adult (enterprise case-by-case), **Web SDK WASM/WebGL** che accetta un MediaStream custom (compatibile con la nostra pipeline WebRTC/LiveKit), qualità skin-texture-preserving.
- Il trade-off "qualità consumer + adult + compliant" è **ineliminabile**: Banuba è il punto più vicino possibile, non la parità con IG.

## Decision

Adottare (come **direzione**, soggetta ai gate sotto) uno stack AI/AR a 4 fronti:

1. **Beauty/AR viso → Banuba Web SDK.** Sostituisce/affianca il beautify MediaPipe (B.4). Gira lato cloud nell'Egress (da validare) e nella preview operatore → WYSIWYG; operatore-controlla, creator passiva (invariato rispetto ad ADR-0007 §1).
2. **Scontorno/matting → MODNet (MIT)** preferito a RobustVideoMatting (GPL-3.0, da chiarire in SaaS). Self-host GPU. Sostituisce MediaPipe Selfie Segmentation quando si vuole qualità bordi superiore.
3. **Scenografie generative (async) → FLUX.1 schnell self-host (Apache 2.0) / Venice AI** per immagini; **Atlas Cloud "Spicy"** per video loop adult. Doppio binario SFW/adult come da ADR-0007 §3.
4. **Scene AI live (premium, futuro) → MirageLSD (Decart).** Spike separato.

MediaPipe (gratis) **resta** come fallback/tier base a costo zero per chi non attiva il pacchetto pro.

### Gate obbligatori prima di Accepted / spesa
- **G1 — Spike tecnico Banuba**: il Web SDK gira in Chrome headless su Linux (Egress) con input MediaStream da LiveKit, senza webcam fisica? (Vendor non lo certifica → rischio #1.) Validabile parzialmente anche in Chrome desktop su Windows con la sorgente LiveKit.
- **G2 — Clearance scritta adult** da Banuba (e da Decart per MirageLSD). Bozze di contatto in `discovery/VENDOR_OUTREACH_DRAFTS.md`.
- **G3 — Conferma costi** (licenza Banuba, GPU matting/generativo) con decisione di budget esplicita.

## Consequences

### Positive
- Salto di qualità materiale vs MediaPipe; posizionamento "studio pro adult-compliant" rafforzato.
- Architettura cloud/operatore-controlla invariata; MediaPipe resta come tier free.

### Negative / Rischi
- **G1 non garantito**: se Banuba non gira headless server-side, l'AR-viso pro non è compatibile con "device dumb" → si dovrebbe ripensare (effetto on-device telecomandato, scartato in ADR-0007, oppure rinuncia all'AR-viso pro).
- Dipendenza da clearance legale non garantita (G2); rischio ToS.
- Costi ricorrenti (licenza + GPU) — da dimensionare.
- GPL-3.0 di RVM → preferito MODNet (MIT).

### Moduli impattati
M1.11 (scene/effetti), M6 (AI layer), M8.6 (media server + GPU self-host), M7 (compliance, invariato come prerequisito).

## Riferimenti
- `discovery/PRO_AI_AR_VENDOR_RESEARCH.md` — ricerca vendor 2026 (fonti).
- `discovery/VENDOR_OUTREACH_DRAFTS.md` — bozze contatto Banuba/Decart.
- ADR-0007 (architettura AI/AR), ADR-0004 (Egress), ADR-0006 (LiveKit dev/prod).
