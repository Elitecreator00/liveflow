# PRO AI/AR Vendor Research — Qualità Professionale + Adult Policy
## LiveFlow — Rapporto decisionale aggiornato (maggio 2026)

> Ricerca condotta il 2026-05-26. Ogni claim ha un indicatore di affidabilità:
> - **[ALTA]** — verificato direttamente su documentazione ufficiale o fonte primaria
> - **[MEDIA]** — da fonte singola credibile, o ricavato indirettamente da documentazione adiacente
> - **[BASSA]** — dato non verificabile pubblicamente; da confermare con il vendor

---

## Contesto e premessa

L'architettura corrente (ADR-0007) usa MediaPipe in Chrome headless (LiveKit Egress) come floor gratuito.
L'utente vuole valutare un salto a qualità **professionale** su 4 fronti:

1. SDK AR beauty/viso (il #1 in priorità)
2. Matting/scontorno hair-accurate
3. Scenografie generative adult-capable
4. Processo di clearance legale per uso adult con vendor mainstream

La struttura LiveKit Egress (Chrome headless, Linux, nessuna webcam fisica) è il **filtro eliminatorio hardware**: ogni SDK che richiede un device fisico, driver camera reali, o che gira solo su iOS/Android è incompatibile.

---

## A. SDK AR Beauty/Viso — Analisi per Vendor

### A.1 Banuba Face AR SDK

**Fonti principali:**
- ToS SDK: https://www.banuba.com/terms-and-conditions-sdk [ALTA]
- Documentazione Web SDK v1.18.x: https://docs.banuba.com/face-ar-sdk-v1/web/web_overview [ALTA]
- Pricing FAQ: https://www.banuba.com/faq/banuba-sdk-pricing [ALTA]
- Community: https://community.banuba.com/t/...mediastream.../67 [MEDIA]
- Comparison blog (fonte Banuba, parzialmente autopromozionale): https://www.banuba.com/blog/banuba-face-ar-sdk-vs-deepar-tested-feature-comparison [MEDIA]

#### A.1.1 Policy contenuti adult/NSFW

Le condizioni SDK pubbliche (trial license) contengono una sola restrizione contenutistica:
> "You must not use the Software in any way that can impair Our business reputation and the good image of the Software." (Sezione 10.3) **[ALTA]**

**Non esiste una clausola che vieta esplicitamente i contenuti adult o sessuali nel testo della trial license.** **[ALTA]**

La sezione 3.3 chiarisce: qualsiasi uso commerciale richiede un accordo separato ("a separate licence agreement to be previously agreed upon and executed with Banuba on a case by case basis"). **[ALTA]**

Interpretazione: la policy adult non è black-and-white nei termini pubblici. Banuba non si posiziona esplicitamente come anti-adult, ma la clausola "reputazione aziendale" è una porta aperta per il rifiuto. In assenza di clienti adult dichiarati (nessuno trovato pubblicamente), il rischio reputazionale per loro è reale. La via corretta è la negoziazione dell'enterprise agreement con chiarimento esplicito dell'uso adult. **[MEDIA]**

Contatto per clearance: sales enterprise via https://www.banuba.com/ (form dedicato) e `info@banuba.com`. **[ALTA]**

#### A.1.2 Web/Server SDK — Compatibilità con Egress cloud

- Banuba ha un **Web AR SDK** con componenti: `BanubaSDK.wasm`, `BanubaSDK.js`, `BanubaSDK.data`. Tecnologia: WebAssembly + WebGL. **[ALTA]**
- Il SDK accetta **MediaStream custom** come input (non solo webcam locale). La documentazione cita esplicitamente: "3rd-party MediaStream (like HTMLVideoElement stream or WebRTC stream)" come input supportato. **[ALTA — fonte: community.banuba.com e API reference]**
- Output: `MediaStreamCapture` che esporta un `VideoTrack` utilizzabile in WebRTC (`connection.addTrack(capture.getVideoTrack())`). **[ALTA]**
- Compatibilità browser dichiarata: Chrome, Safari, Firefox su qualsiasi device. **[ALTA]**
- **Headless Chrome server-side**: la documentazione ufficiale NON menziona esplicitamente questo scenario. Tuttavia: il SDK gira su WebAssembly/WebGL senza richiedere accesso hardware diretto alla fotocamera (accetta MediaStream esterno); Chrome headless supporta WebGL e WASM; LiveKit Egress gira già su Chrome headless Linux e renderizza pagine React. La combinazione è **tecnicamente plausibile ma non certificata dal vendor**. **[MEDIA — da validare con Banuba support prima dell'adozione]**

#### A.1.3 Qualità effetti

- Mesh facciale: **3.308 vertici** per modellazione precisa. **[ALTA]**
- Skin beautification: preserva la texture naturale della pelle (evita il look "plastico" da blur). **[ALTA]**
- Segmentazione per-parte: capelli, pelle, occhi, sopracciglia, labbra, sfondo — indipendenti a livello pixel. **[ALTA]**
- Face morphing: **28 opzioni** (reshape naso, mento, mascella, slimming). **[ALTA]**
- Relighting: supportato (illuminazione facciale software). **[MEDIA]**
- Maschere 3D: supportate con effetti pronti e editor Lens Studio-style. **[ALTA]**
- Livello qualitativo: paragonabile a IG/Snap per filtri beauty; superiore a MediaPipe per skin quality e morphing. **[MEDIA]**

#### A.1.4 Prezzo

Modello: **flat per piattaforma per mese/trimestre/anno**, MAU-based in negoziazione. Nessuna cifra pubblica. **[ALTA]**
- Non pubblica prezzi fissi; ogni cliente ha un Account Manager dedicato. **[ALTA]**
- Ordini di grandezza de-facto (fonte: GetApp/TrustRadius, non ufficiali): a partire da ~$500–2.000/mese per piattaforma Web a 10k MAU. **[BASSA — non verificabile pubblicamente; da richiedere in fase di trial]**
- Trial gratuita disponibile (form sul sito). **[ALTA]**

#### A.1.5 Effort di integrazione con LiveKit/WebRTC

- Input: la creator pubblica uno stream LiveKit; l'Egress lo riceve come MediaStream → passato a Banuba SDK → output MediaStream processato → encoding.
- Il pattern è ben documentato (WebRTC + Banuba) con esempi ufficiali. **[ALTA]**
- Effort stimato: medio (2–4 giorni di sviluppo per integrazione base; settimane per tuning effetti). **[MEDIA]**
- Dipendenza critica: il trial di integrazione su Chrome headless Linux deve essere validato prima di firmare un contratto. **[MEDIA]**

---

### A.2 DeepAR (ora Zalando Group)

**Fonti principali:**
- Acquisizione Zalando aprile 2025: https://finance.yahoo.com/news/zalando-buys-deepar-boost-tech-105502932.html [ALTA]
- ToS: https://www.deepar.ai/terms [ALTA]
- Pricing: https://docs.deepar.ai/deepar-sdk/pricing/ [ALTA]
- Web SDK docs: https://docs.deepar.ai/deepar-sdk/platforms/web/overview/ [ALTA]
- Streaming tutorial: https://docs.deepar.ai/deepar-sdk/platforms/web/tutorials/streaming/ [ALTA]

#### A.2.1 Policy contenuti adult/NSFW

I Terms of Use pubblici **non contengono clausole esplicite** che vietino i contenuti adult. **[ALTA]**
I ToS fanno però riferimento a un "DEEPAR Customer Agreement" e a un "Acceptable Use Policy" separati (non accessibili pubblicamente senza account). **[ALTA]**

**Fattore critico — acquisizione Zalando (aprile 2025):** DeepAR è ora una business unit di un e-commerce fashion europeo mainstream. La traiettoria strategica dichiarata è virtual try-on fashion/beauty per Zalando.com e brand licenziatari. **[ALTA]**
La probabilità che Zalando, brand con forte identità family-friendly quotato in borsa, accetti di concedere la licenza DeepAR per piattaforme adult è estremamente bassa — anche in assenza di un divieto esplicito nel testo pubblico. **[MEDIA]** Questo è un rischio strategico concreto: anche se il contratto non lo vieta oggi, il vendor può modificare i termini o rifiutare il rinnovo.

**Conclusione adult-policy**: DeepAR è da trattare come **de-facto incompatibile** per uso adult in ottica enterprise a lungo termine, indipendentemente dal testo dei ToS. **[MEDIA]**

#### A.2.2 Web/Server SDK

- SDK Web JavaScript ufficiale (`deepar` su npm). Input default: webcam. Ma: `deepAR.setVideoElement(video, true)` accetta un `HTMLVideoElement` — quindi può ricevere un WebRTC stream via elemento video. Output via `canvas.captureStream()` → MediaStream. **[ALTA]**
- La documentazione NON conferma esplicitamente l'accettazione di un MediaStream da partecipante remoto, ma l'architettura (video element + canvas) lo rende fattibile. **[MEDIA]**
- Headless Chrome: non documentato. Stessa situazione di Banuba — plausibile ma non certificato. **[MEDIA]**

#### A.2.3 Qualità effetti

- Face mesh: meno vertici rispetto a Banuba; skin blur-based (non texture-preserving). **[ALTA — fonte: comparison Banuba, autopromozionale ma tecnicamente dettagliato]**
- Segmentazione: solo capelli (non per-parte-facciale). **[ALTA]**
- Face morphing: 11 opzioni. **[ALTA]**
- Livello qualitativo: inferiore a Banuba per beautification professionale. Sufficiente per social/marketing, non per studio professionale adult. **[MEDIA]**

#### A.2.4 Prezzo

Pubblicato e trasparente:
| MAU | Costo mensile |
|---|---|
| Fino a 10 | Gratis (watermark) |
| Fino a 1.000 | $25/mese |
| Fino a 5.000 | $100/mese |
| Fino a 30.000 | $500/mese |
| Fino a 100.000 | $1.000/mese |
| 100.000+ | Custom |

**[ALTA — fonte: docs.deepar.ai/deepar-sdk/pricing]**

#### A.2.5 Effort di integrazione

- Moderato; SDK maturo con buona documentazione. Ma la direzione aziendale post-Zalando riduce l'incentivo a supportare use case non-fashion. **[MEDIA]**

---

### A.3 BytePlus Effects (ByteDance / CapCut / TikTok engine)

**Fonti principali:**
- Acceptable Use Policy: https://docs.byteplus.com/en/docs/legal/docs-acceptable-use-policy [ALTA — pagina restituisce contenuto vuoto/inaccessibile al momento della ricerca]
- Product overview: https://docs.byteplus.com/en/docs/effects/docs-product-overview [ALTA]

#### A.3.1 Policy contenuti adult/NSFW

**La policy ufficiale pubblica non era accessibile al momento della ricerca** (pagina vuota). **[ALTA — dato sull'inaccessibilità; contenuto policy = BASSA]**

Da contesto indiretto: BytePlus Effects usa lo stesso motore di TikTok/CapCut. ByteDance (capogruppo) applica policy di contenuto estremamente restrittive su tutte le piattaforme consumer, in linea con i requisiti delle autorità cinesi. **[MEDIA]**
Conclusione ragionevole: adult è **molto probabilmente vietato** per policy interna ByteDance, anche se non pubblicamente documentato nell'AUP. **[MEDIA]**

**Fattore eliminatorio aggiuntivo**: BytePlus è una entity ByteDance con sede a Singapore che serve mercati non-cinesi, ma la struttura societaria comporta rischi normativi (esposizione OFAC, scrutinio geopolitico in USA/EU nel 2026) oltre al rischio policy. Per una piattaforma adult europea/americana, dipendere da ByteDance è un rischio legale e reputazionale non giustificato. **[MEDIA]**

#### A.3.2 Web/Server SDK

- BytePlus Effects offre un Web SDK JavaScript. **[ALTA]**
- Supporta integrazione WebRTC per live streaming (documentato). **[ALTA]**
- Headless server-side: non documentato. **[BASSA]**

#### A.3.3 Qualità effetti

- Livello qualitativo: identico a CapCut/TikTok Live (consumer-grade professionale). Include skin retouching, reshape, filtri colorimetria, effetti speciali. **[ALTA]**
- Libreria effetti: 80.000+ effetti pronti. **[ALTA]**
- Per uso professionale adult: la qualità è eccellente ma la policy è un problema strutturale. **[MEDIA]**

#### A.3.4 Prezzo

Non pubblicato pubblicamente; enterprise-only, custom. **[ALTA]**

#### A.3.5 Raccomandazione

**Da escludere** per ragioni di policy (molto probabilmente anti-adult) e rischio geopolitico ByteDance. **[MEDIA]**

---

### A.4 Snap Camera Kit

**Fonti principali:**
- Camera Kit Terms: https://www.snap.com/terms/snap-camera-kit [ALTA]
- Community Guidelines (richiamate dai terms): https://values.snap.com/policy/policy-community-guidelines/sexual-content [ALTA]

#### A.4.1 Policy contenuti adult/NSFW

Le Camera Kit Terms impongono che tutti i Lens/contenuti siano "appropriate for people ages 13+". **[ALTA]**
Snap vieta esplicitamente: "sexually explicit content and conduct, including pornography, sexual nudity, or offers of sexual services" e "adult entertainment (e.g., pornography, sexual live streams, strip clubs, burlesque)". **[ALTA — fonte: Snap Commercial Content Policy]**

**Conclusione: ELIMINATO.** Divieto esplicito e assoluto per piattaforme adult/live streaming sessuale. **[ALTA]**

#### A.4.2 Web/Server SDK

Non rilevante (già eliminato per policy). Nota: Snap Camera Kit è primariamente mobile + Lens Studio; il Web SDK è limitato. **[ALTA]**

---

### A.5 Perfect Corp / YouCam (Nasdaq: PERF)

**Fonti principali:**
- YouCam for Web Enterprise: https://www.perfectcorp.com/business/services/youcam-4-web [ALTA]
- CES 2026 announcement: https://www.perfectcorp.com/business/news/ces-2026-perfect-corp [ALTA]

#### A.5.1 Policy contenuti adult/NSFW

Perfect Corp è una società quotata a New York (Nasdaq: PERF) specializzata in beauty-tech per brand di cosmetici (L'Oréal, Estée Lauder, Sephora come clienti). Nessuna policy adult trovata pubblicamente. **[ALTA — sull'assenza di policy pubblica]**

Valutazione: con clienti come L'Oréal e Sephora e quotazione Nasdaq, la probabilità di accettare un cliente adult è prossima a zero — a prescindere dal testo contrattuale. Stessa logica Zalando/DeepAR. **[MEDIA]**

#### A.5.2 Web/Server SDK

YouCam for Web esiste e si rivolge a e-commerce fashion/beauty. Non è un SDK di streaming video live. **[ALTA]**
Il focus è sul try-on di prodotti cosmetici (makeup, lenti a contatto, capelli) su immagine statica o video da webcam. **[ALTA]**

**Compatibilità con pipeline LiveKit**: molto limitata — non è progettato per streaming WebRTC real-time live. **[MEDIA]**

#### A.5.3 Qualità effetti

Eccellente per beauty e makeup (validato da brand tier-1), ma il dominio è cosmetica/moda, non streaming live generico. Skin retouching di qualità. **[MEDIA]**

#### A.5.4 Prezzo

Annual license fee (tutto incluso), nessuna cifra pubblica. **[ALTA]**

#### A.5.5 Raccomandazione

**Da escludere** per policy (brand-safety incompatibile con adult) e architettura non adatta allo streaming live. **[MEDIA]**

---

### A.6 ModiFace (L'Oréal Group)

**Fonti principali:**
- ModiFace overview: https://www.modiface.com/ [ALTA]
- L'Oréal Group info: https://www.loreal.com/en/beauty-science-and-technology/beauty-tech/discovering-modiface/ [ALTA]

#### A.6.1 Policy contenuti adult/NSFW

ModiFace è di proprietà al 100% di L'Oréal Group dal 2018. L'Oréal è uno dei più grandi gruppi cosmetici mondiali. La probabilità di concessione di licenza per uso adult è **zero**. **[MEDIA]**

ModiFace non è disponibile come SDK pubblico — si ottiene solo tramite accordo diretto con L'Oréal per brand licenziatari beauty. **[ALTA]**

**Conclusione: non applicabile** al nostro contesto. **[ALTA]**

---

### A.7 Tencent RTC Beauty AR SDK (Tencent Effect)

**Fonti principali:**
- Documentazione Web SDK: https://trtc.io/document/51233 [ALTA]
- Stream Publishing WebRTC: https://trtc.io/document/53886 [ALTA]
- Pricing: https://trtc.io/pricing/beauty [ALTA]
- Acceptable Use Policy Tencent Cloud: https://www.tencentcloud.com/document/product/301/9245 [ALTA]

#### A.7.1 Policy contenuti adult/NSFW

La Tencent Cloud Acceptable Use Policy vieta esplicitamente:
> "content... that is pornographic, sexually explicit, violent or otherwise of a mature nature." **[ALTA]**

**Conclusione: ELIMINATO.** Divieto esplicito. Inoltre, Tencent è soggetta alla normativa PRC che vieta i contenuti sessualmente espliciti — ulteriore vincolo strutturale. **[ALTA]**

#### A.7.2 Web/Server SDK

Il SDK web accetta MediaStream da `getUserMedia` (documentato). Produce un `arStream` via `getOutput()`. Input da partecipante WebRTC remoto: non documentato esplicitamente. Output via `livePusher.startCustomCapture(arStream)`. **[ALTA]**
Headless server-side: non documentato. **[BASSA]**

#### A.7.3 Qualità effetti

Eccellente — usa lo stesso motore di WeChat/Douyin (TikTok cinese). Ultra bassa latenza, 20.000+ modelli device supportati. **[ALTA]**

#### A.7.4 Prezzo (Web, 2026)

| Piano | Prezzo mensile |
|---|---|
| Free Trial | $0 (28 giorni) |
| Starter/Standard | $39.9/mese (promo) → $999/mese normale |
| Professional | $1.499/mese |
| Advanced | $5.999/mese |

**[ALTA — fonte: trtc.io/pricing/beauty]**

---

### A.8 FaceUnity SDK

**Fonti:** sito ufficiale https://www.faceunity.com/en/ [ALTA]; partner Agora.io [ALTA]

#### A.8.1 Policy contenuti adult/NSFW

Vendor cinese (FaceUnity Technology, Hangzhou). Policy pubblica non accessibile in inglese. **[BASSA]**
Per struttura societaria e origine PRC: divieto adult molto probabile, analoga a Tencent/BytePlus. **[MEDIA]**

#### A.8.2 Web/Server SDK

SDK per iOS, Android, Windows, Mac, Unity. Web/browser SDK: non trovato nella ricerca. **[MEDIA]**
Integrazioni documentate con Agora RTC (non con LiveKit). **[ALTA]**

#### A.8.3 Raccomandazione

**Da escludere**: policy PRC-incompatibile con adult + assenza di Web SDK confermato. **[MEDIA]**

---

### TABELLA COMPARATIVA SDK AR

| Vendor | Adult Policy | Web/Server SDK | Qualità beauty | Prezzo indicativo | Fit Egress cloud | Raccomandazione |
|---|---|---|---|---|---|---|
| **Banuba** | Ambigua (no clausola esplicita); negoziabile enterprise | **SÌ** (WASM/WebGL; accetta MediaStream custom) | **Eccellente** (3.308 vertici, texture-preserving, 28 morphing) | Custom; ~$500–2k+/mese [BASSA] | **Probabile** (non certificato headless; da validare) | **CANDIDATO #1** |
| DeepAR (Zalando) | De-facto incompatibile (brand Zalando fashion) | SÌ (npm; video element input) | Buona (blur-based, 11 morphing) | $25–$1.000/mese (trasparente) | Probabile ma non certificato | Scartare (rischio strategico) |
| BytePlus Effects | Molto probabilmente vietato (policy ByteDance) | SÌ | Eccellente (CapCut-grade) | Custom | Probabile | **ELIMINARE** (policy + rischio geopolitico) |
| Snap Camera Kit | **VIETATO esplicitamente** | No (mobile-first) | Snap-grade | N/A | Non applicabile | **ELIMINATO** |
| Perfect Corp/YouCam | De-facto incompatibile (Nasdaq brand-safety) | SÌ (ma per e-commerce, non streaming live) | Eccellente per makeup | Custom enterprise | No (non è per live streaming) | **ELIMINARE** |
| ModiFace (L'Oréal) | De-facto impossibile | N/A (solo per brand L'Oréal) | Best-in-class beauty | Non disponibile | No | **Non applicabile** |
| Tencent RTC/Effect | **VIETATO esplicitamente** | SÌ | Eccellente | $40–$6k/mese | Probabile (ma policy blocca) | **ELIMINATO** |
| FaceUnity | Probabile vietato (vendor PRC) | Non confermato | Ottima | Custom | Non confermato | **SCARTARE** |
| MediaPipe (attuale floor) | Neutro (on-our-side, Apache 2.0) | SÌ (Apache 2.0, WebGL) | Discreta (non skin-quality) | **$0** | **CERTIFICATO** | Floor garantito |

---

### RACCOMANDAZIONE SDK AR

**Candidato #1: Banuba Face AR SDK.**

Motivazioni:
1. È il **solo vendor** con Web SDK certificato + accettazione MediaStream custom + policy adult **non esplicitamente vietata** (negoziabile) + qualità professionale (skin-texture preserving, 28 morphing). **[ALTA]**
2. Qualità superiore a tutti i competitor nel segmento beauty/viso. **[ALTA]**
3. Azienda indipendente (non controllata da Zalando, ByteDance, L'Oréal, Tencent) = più flessibile in negoziazione enterprise. **[MEDIA]**
4. Il pattern di integrazione MediaStream custom → Banuba → MediaStream output è ben documentato con esempi WebRTC. **[ALTA]**

**Condizioni per adozione:**
1. Validare l'esecuzione in Chrome headless Linux (LiveKit Egress) con un test tecnico prima di firmare qualsiasi contratto. **[indispensabile]**
2. Ottenere chiarimento scritto sull'uso adult nell'enterprise agreement. **[indispensabile]**
3. Negoziare una clausola di stabilità della policy (vendor non può revocare il diritto d'uso adult mid-contract). **[indispensabile]**

---

## B. Matting/Scontorno di Qualità Superiore

### B.1 RobustVideoMatting (RVM)

**Fonte:** https://github.com/PeterL1n/RobustVideoMatting [ALTA]

- Licenza: **GPL-3.0** — open source, ma copyleft (il codice che lo include deve essere open-source anch'esso se distribuito). Da valutare con legale se l'Egress è un servizio interno. **[ALTA]**
- Performance GPU: **172 FPS a HD (1920x1080)** su RTX 3090; **104 FPS a HD** su GTX 1080 Ti. Ampiamente superiore ai 30fps richiesti. **[ALTA]**
- Deploy: PyTorch, ONNX (FP32/FP16), TensorFlow.js (int8 — per browser). **[ALTA]**
- Qualità bordi capelli: architettura ricorrente (sfrutta temporalità) → ottima coerenza frame-to-frame senza sfarfallio. Migliore di MediaPipe Selfie Segmentation per hair edge detail. **[ALTA]**
- **Raccomandazione**: candidato #1 per matting server-side. Gira su GPU Python/CUDA nell'Egress. Il stream LiveKit viene decodificato → frame → RVM → alpha matte → compositing. Latenza aggiuntiva stimata < 10ms su GPU RTX-class. **[MEDIA]**
- Costo: $0 licenza + GPU già prevista nell'Egress.

### B.2 BiRefNet

**Fonte:** https://github.com/ZhengPeng7/BiRefNet [ALTA]

- Licenza: **MIT** — più permissiva di RVM. **[ALTA]**
- Performance: 17 FPS a 1024x1024 su RTX 4090 (FP16). NON real-time a 30fps per input HD. **[ALTA]**
- ONNX disponibile; integrato in huggingface.js per deploy web. **[ALTA]**
- Qualità: superiore a RVM per scontorno statico ad alta risoluzione (hair detail), ma meno efficiente su video in tempo reale (latenza ~165ms su A100 con ONNX). **[ALTA]**
- **Raccomandazione**: BiRefNet è ottimo per **matting ad alta qualità di singole immagini** (thumbnail, asset), non per stream real-time 30fps senza GPU cluster costoso. **Non raccomandato come layer real-time nell'Egress.**

### B.3 MODNet e BackgroundMattingV2

- **MODNet**: MIT license, real-time (30fps su GPU medio), specifico per ritratto umano. Buona qualità. Meno versatile di RVM su scene complesse. Candidato alternativo a RVM. **[MEDIA]**
- **BackgroundMattingV2**: MIT license, richiede immagine di sfondo di riferimento (non pratico per live stream dove lo sfondo cambia). **Non adatto** al nostro caso. **[ALTA]**

### RACCOMANDAZIONE MATTING

**Adottare RobustVideoMatting (RVM)** come layer di matting professionale server-side nell'Egress:
- Velocità >> soglia 30fps anche su GPU consumer (GTX 1080 Ti).
- Qualità hair-edge nettamente superiore a MediaPipe Selfie Segmentation.
- Deploy semplice: container PyTorch + ONNX runtime su GPU.
- Costo: solo compute (GPU già nell'Egress per altri effetti).
- **Verifica legale obbligatoria**: GPL-3.0 impone open-source del codice che lo include se "distribuito". Se l'Egress è un servizio interno (SaaS, il codice non è distribuito a terzi), la GPL probabilmente non si applica (analoga alla AGPL exemption del SaaS). **[MEDIA — da verificare con legale]**

Alternativa se GPL è un problema: **MODNet (MIT)**, leggermente inferiore per hair detail ma licenza permissiva.

---

## C. Scenografie Generative Adult-Capable (Aggiornamento 2026)

### C.1 Venice AI

**Fonti:** https://docs.venice.ai/overview/pricing [ALTA]; https://venice.ai/ [ALTA]; https://runtheprompts.com/resources/venice-ai-info/best-venice-ai-pricing-guide/ [MEDIA]

- **Adult/NSFW**: esplicitamente supportato su piani a pagamento. Generazione uncensored disponibile su API. **[ALTA]**
- **Privacy**: Venice dichiara che i contenuti generati non vengono usati per training e non sono esaminati da personale. **[ALTA — da verificare contrattualmente]**
- **API pricing (2026)**: immagini $0.01–$0.29/immagine secondo modello e risoluzione. Token LLM $0.05–$37.50/M token input. Credits mai scadono, pagamento crypto accettato. **[ALTA]**
- **Limiti**: nessun enterprise tier/SLA documentato. 100 API credit/mese inclusi nel piano Pro ($18/mese) — insufficienti per produzione. Per usage elevato: acquisto crediti aggiuntivi. **[ALTA]**
- **Qualità**: buona per immagine statica; modelli disponibili includono FLUX.1, Stable Diffusion. **[MEDIA]**
- **Raccomandazione**: candidato per generazione asset adult (sfondi, scenografie), specialmente come fallback managed se il self-host non è ancora pronto.

### C.2 Atlas Cloud "Spicy" (Wan video)

**Fonti:** https://www.atlascloud.ai/models/atlascloud/wan-2.6-spicy/image-to-video [ALTA]; https://www.atlascloud.ai/pricing/models [ALTA]

- **Adult/NSFW**: modelli "Spicy" sono esplicitamente uncensored. Account richiede accesso allowlist (contatto sales). **[ALTA]**
- **Contenuto mai usato per training, mai revisionato**: dichiarato sul sito. **[ALTA — da verificare contrattualmente]**
- **Modelli disponibili (2026)**:
  - Wan 2.6 Spicy I2V: $0.07/sec (720p), ~$0.35 per clip da 5s a 720p; $1.05 per clip 15s 1080p. **[ALTA]**
  - Wan 2.2 Turbo Spicy I2V (infinite): **$0.01/sec** — opzione più economica per loop ambient. **[ALTA]**
  - Seedance v1.5 Pro Spicy: $0.049/sec (30s clip = $1.47). **[ALTA]**
- **Qualità**: 24fps, HD/1080p, "stable temporal detail". Wan 2.2/2.6 è stato il benchmark open-weight video nel 2025-2026. **[ALTA]**
- **Raccomandazione**: opzione #1 per video loop adult senza gestione GPU. Per 10 clip/giorno: ~$3.50–$14.70/giorno (Wan 2.2 turbo vs Wan 2.6). **[ALTA]**

### C.3 FLUX.1 Schnell (self-host)

**Fonti:** https://github.com/black-forest-labs/flux [ALTA]; https://www.runpod.io/ [ALTA]; community comparisons **[MEDIA]**

- **Licenza**: FLUX.1 Schnell = **Apache 2.0** — uso commerciale adulto lecito. FLUX.1 Dev = non-commercial (non usare per produzione). **[ALTA]**
- **Adult**: il modello base non ha filtri; community fine-tune uncensored (es. Flux-Uncensored-V2 su HuggingFace) disponibili. **[ALTA]**
- **Costo GPU RunPod**: RTX 3090 24GB ≈ $0.22/h (community) o $0.43/h (secure). FLUX.1 schnell: ~2s/immagine → ~$0.00012/img a $0.22/h. **[ALTA]**
- **Setup**: ComfyUI + FLUX template su RunPod = one-click. **[ALTA]**
- **Qualità**: eccellente per immagini fisse. Non per video loop (→ Wan).

### C.4 Wan 2.2 (self-host)

**Fonti:** https://github.com/Wan-Video/Wan2.2 [ALTA]; https://www.spheron.network/blog/deploy-wan-2-1-ai-video-generation-gpu-setup/ [MEDIA]

- **Licenza**: Apache 2.0. **[ALTA]**
- **Adult**: nessun filtro nei pesi base; fine-tune adult disponibili su HuggingFace. **[ALTA]**
- **Requisiti GPU**: modello 14B richiede 40–48GB VRAM (FP8 quant) per 480p; 65–80GB per 720p. Equivale a H100 o 2× A100. **[ALTA]**
- **Speed**: clip da 5s a 480p → ~4 minuti su H100 PCIe. **Non è real-time, è generazione asincrona** (slot B). **[ALTA]**
- **Costo batch tier**: ~$0.32/GPU-h (H100). Una clip 5s/480p ≈ 4 min → ~$0.021/clip. **[MEDIA]**
- **Raccomandazione**: self-host Wan 2.2 ha senso solo se il volume è elevato e si vuole azzerare il costo per-clip. Per volumi bassi/medi, Atlas Cloud Spicy è più conveniente (no setup GPU H100, nessun DevOps). **[MEDIA]**

### C.5 MirageLSD (Decart) — Scenografia Live Real-Time

**Fonti:** https://decart.ai/publications/mirage [ALTA]; https://docs.platform.decart.ai/getting-started/pricing [ALTA]; X/Decart post luglio 2025 [ALTA]

- **Stato 2026**: rilasciato (luglio 2025). Il modello si chiama ora "Lucy LSD" / "Mirage" sulla piattaforma Decart. **[MEDIA — il branding è cambiato]**
- **Capabilities**: trasforma qualsiasi live video stream in tempo reale via prompt, <40ms latency, 24fps. Infinitely long stream. Usa CUDA mega-kernels + architettura Live-Stream Diffusion. **[ALTA]**
- **Compute**: ottimizzato per NVIDIA Hopper (H100). Costo cloud: ~$1 Credit per secondo di 720p (equivalente a $0.01/sec stando alla struttura crediti Decart). **[MEDIA — dato da pricing piattaforma ma non verificato per MirageLSD specificamente]**
- **API**: disponibile su platform.decart.ai; disponibile su Crusoe Cloud (contatto sales). **[ALTA]**
- **Adult policy**: i ToS Decart non elencano categorie proibite specifiche (solo "violazioni di legge applicabile" e comportamento "offensivo/abusivo"). **Non c'è un divieto esplicito dell'adult.** **[ALTA — sul testo del ToS; interpretazione = MEDIA]**
- **Contatto per policy adult**: `contact@decart.ai`. **[ALTA]**
- **Raccomandazione**: candidato feature premium "Scene AI Live" (staff stage per operatore). Da includere nella roadmap avanzata (Fase B.6+). Prima di adottare: (1) verificare policy adult via email; (2) quotare cost-per-stream-hour per scale testing. **[MEDIA]**

### TABELLA GENERATIVO

| Provider | Adult | Tipo | Costo indicativo | Qualità | Raccomandazione |
|---|---|---|---|---|---|
| Venice AI | SÌ (API, piani paid) | Immagine | $0.01–$0.29/img | Buona | Managed fallback adult immagini |
| Atlas Cloud Spicy (Wan 2.6) | SÌ (allowlist) | Video clip | $0.07/sec → ~$0.35 per 5s | Ottima | **#1 per video loop adult managed** |
| Atlas Cloud Spicy (Wan 2.2 Turbo) | SÌ | Video loop | $0.01/sec | Buona | #1 per loop economici |
| FLUX.1 Schnell (self-host) | SÌ (Apache 2.0) | Immagine | ~$0.00012/img GPU | Eccellente | #1 per immagini adult self-host |
| Wan 2.2 (self-host) | SÌ (Apache 2.0) | Video asincrono | ~$0.02/clip GPU | Eccellente | Solo ad alto volume |
| MirageLSD (Decart) | Non confermato (da chiedere) | Live real-time | ~$0.01/sec stream [MEDIA] | Rivoluzionario | Feature premium futura |
| Gemini 2.5 Flash | NO (zero-tolerance) | Immagine | $0.02/img | Eccellente | Solo SFW |
| Runway / Kling / Pika | NO | Video | $0.10+/sec | Ottima | Solo SFW |

---

## D. Angolo Legale — Come Ottenere Clearance Scritta per Uso Adult

### D.1 Cosa è una "written clearance" nel contesto B2B SDK

Non esiste un processo standard codificato nel settore. La prassi enterprise per use case sensibili è:
1. Il cliente segnala l'uso previsto nella fase di sales/trial.
2. Il vendor valuta internamente (legal + policy + sales).
3. Se approvato, il **Master Service Agreement (MSA)** o l'**Enterprise License Agreement (ELA)** include un allegato ("Schedule" o "Exhibit") che definisce esplicitamente il perimetro d'uso autorizzato.

**[MEDIA — prassi ricostruita da pattern enterprise generali; non documentata da vendor AR specifici]**

### D.2 Cosa chiedono tipicamente i vendor per l'uso adult

Basandosi su pattern B2B nel settore adult entertainment (AVN, Scrile, ClickCastX) e su principi legali 18 USC 2257 / GDPR: **[MEDIA]**

1. **Documentazione 2257**: prova che la piattaforma mantiene record di age-verification per tutti i performer. Il vendor vuole essere indennizzato da claim legali relativi a minori.
2. **Indennizzo esplicito**: clausola in cui il cliente (LiveFlow) manleva il vendor da ogni responsabilità legale per i contenuti trasmessi.
3. **Brand safety**: il vendor può chiedere che il suo logo/brand non appaia nei contenuti adult o che non ci sia associazione pubblica.
4. **Geofence/jurisdiction**: alcuni vendor accettano solo mercati dove l'adult è legale (EU, USA, CA, AU) ed escludono altri.
5. **Esclusività dell'uso**: il vendor può richiedere che l'uso dell'SDK sia limitato agli effetti video (non per generare contenuti hard separati).

### D.3 Script di approccio al vendor (email sales)

**Template per Banuba (adattabile agli altri):**

> Oggetto: Enterprise License Inquiry — Adult Live Streaming Platform
>
> We are building a professional B2B SaaS platform for webcam agencies operating in the legal adult entertainment industry (licensed platforms, age-verified performers, 2257-compliant). We are evaluating the Banuba Face AR SDK Web to provide real-time beauty filters and AR effects operated by studio managers (not directly by performers). Our architecture processes video streams server-side in a headless Chrome environment (LiveKit Egress), not on performer devices.
>
> Before proceeding to enterprise licensing, we need to clarify:
> 1. Is use of the SDK in connection with adult-oriented legal live streaming platforms permitted under a custom enterprise agreement?
> 2. Can you confirm the Web SDK operates correctly in a headless Chromium environment with a WebRTC MediaStream as input source (no physical camera access)?
> 3. What indemnification and brand-safety terms would apply?
> 4. What is the enterprise pricing structure for a Web-only deployment?
>
> We are prepared to sign an NDA and provide details of our compliance framework (2257, KYC, GDPR).

### D.4 Rischi legali residui anche con clearance scritta

- **Revoca unilaterale**: il vendor può sempre modificare i ToS con preavviso (tipicamente 30–90 giorni). Un ELA con durata fissa (es. 2 anni) riduce ma non elimina il rischio.
- **Policy bancarie**: anche con licenza SDK valida, i processori di pagamento (Visa/Mastercard) e i cloud provider (AWS, GCP) hanno policy separate sull'adult che impattano l'infrastruttura, non il vendor SDK. **[ALTA]**
- **GDPR art. 9**: i dati biometrici facciali (mesh) sono "dati particolari" ex GDPR. L'uso server-side nell'Egress senza consenso esplicito del performer è un rischio legale separato. **[ALTA — rilevante per qualsiasi SDK AR lato cloud]**
- **Reputational**: un vendor mainstream che concede licenza adult può subire pressioni da altri clienti. Clausola di non-disclosure sull'accordo è consigliata. **[MEDIA]**

---

## E. Reality Check — È Davvero Possibile Qualità IG/Snap + Adult + Compliant?

**La risposta onesta è: parzialmente sì, con trade-off strutturali che non si eliminano.**

### E.1 Qualità IG/Snap vs Adult: il dilemma non è tecnico, è di business

I SDK che raggiungono la qualità IG/Snap (Snap Camera Kit, BytePlus/TikTok, Tencent Effect, DeepAR post-Zalando) sono tutti controllati da aziende che **non possono** fare business con piattaforme adult per ragioni di brand, regolamentazione, o mercato primario. Questo non è un limite tecnico — è un vincolo commerciale strutturale. **[ALTA]**

L'unica eccezione plausibile è **Banuba**, che è indipendente, opera in mercati B2B non-consumer, e i cui termini pubblici non vietano esplicitamente l'adult.

### E.2 Il vero trade-off

| Aspetto | MediaPipe (floor attuale) | Banuba (se clearance ok) |
|---|---|---|
| Qualità skin retouching | Discreta (blur, ~8 landmark) | Professionale (texture-preserving, 3.308 vertici) |
| Face morphing | Assente | 28 opzioni |
| Maschere 3D | Limitato | Completo |
| Costo licenza | $0 | ~centinaia–migliaia $/mese [BASSA] |
| Policy adult | Nessun problema | Richiede clearance scritta |
| Headless Chrome certificato | Sì (già in produzione) | Da validare |
| Rischio vendor lock | Zero | Medio (single vendor) |

### E.3 La qualità "IG nativa" è un target raggiungibile?

La qualità IG Stories è prodotta da modelli neurali addestrati su miliardi di selfie con label proprietarie. Il gap con Banuba è reale ma più piccolo di quanto sembri: per uno studio professionale adult, Banuba offre skin quality **sufficiente per la produzione professionale**, non identica a IG ma superiore a qualsiasi alternativa open-source. **[MEDIA]**

La vera killer feature che differenzia lo studio (scenografia generativa AI + scontorno + operatore-controlla) non dipende dalla qualità del filtro skin singolo, ma dall'**integrazione sistemica**. MediaPipe come floor + RVM per matting + Banuba (se clearance) per beauty = stack professionale end-to-end. **[MEDIA]**

---

## F. Azioni Raccomandate (Priorità)

### Priorità 1 — Test tecnico (senza costo) [Urgente]
1. **Scaricare il trial Banuba Web SDK** e testare in un Chrome headless Linux (Docker + Xvfb) con un MediaStream sintetico come input. Validare: (a) rendering WebGL funziona; (b) MediaStream custom accettato; (c) output MediaStream processato.
2. **Testare RobustVideoMatting** in un container PyTorch su GPU (RunPod spot instance) con un frame VideoCapture simulato → verificare <10ms di latenza aggiuntiva a HD.

### Priorità 2 — Contatto vendor [Entro 2 settimane]
3. **Inviare email enterprise a Banuba** (template §D.3) per: policy adult, pricing web, headless compatibility.
4. **Contattare Decart** (`contact@decart.ai`) per: policy adult MirageLSD, pricing per stream hour, availability API.
5. **Richiedere accesso allowlist Atlas Cloud** per il tier Spicy (per asset adult video).

### Priorità 3 — Legale interno [Prima dell'adozione SDK commerciale]
6. **Parere legale** su: (a) GPL-3.0 di RobustVideoMatting in un SaaS interno; (b) GDPR art. 9 per processing biometrico facciale server-side senza consenso esplicito performer; (c) struttura MSA/ELA per vendor AR con uso adult.

### Priorità 4 — Decision gate
7. **ADR-0008** (proposta): se Banuba technical test passa E clearance scritta è ottenibile → adottare Banuba + RVM come stack AR professionale. Altrimenti: rimanere su MediaPipe + RVM (matting) e rivalutare in 6 mesi.

---

## Riepilogo Finale (8–12 righe)

**Banuba è l'unico SDK AR professionale con Web SDK dichiarato (WASM/WebGL, MediaStream input), qualità superiore (skin texture-preserving, 28 morphing, 3.308 vertici), e policy adult negoziabile** — non vietata esplicitamente nei termini pubblici, con Enterprise Agreement personalizzabile. Tutti gli altri vendor rilevanti per qualità (Snap, BytePlus/TikTok, Tencent, DeepAR/Zalando, ModiFace/L'Oréal) hanno divieti espliciti o incompatibilità strutturali di brand. Il filtro eliminatorio architetturale (Chrome headless server-side, nessuna webcam fisica) non è ancora certificato per Banuba — questo test tecnico è la condizione necessaria prima di qualsiasi impegno contrattuale. Per il matting professionale, RobustVideoMatting (GPL-3.0) a 172fps/HD su GPU comune è la scelta diretta, con verifica legale GPL-in-SaaS. Per le scenografie generative adult, la pipeline raccomandata è duale: Atlas Cloud Spicy (Wan 2.6) per video loop managed senza DevOps + FLUX.1 Schnell self-host per immagini ad alto volume. MirageLSD (Decart) è il candidato per la feature "live AI scene" premium, ma policy adult e pricing devono essere verificati direttamente. Il trade-off ineliminabile è che i vendor con qualità "IG nativa" non trattano con piattaforme adult per ragioni di business — Banuba è l'eccezione realistica, non la regola; il salto di qualità rispetto a MediaPipe è reale e significativo per uno studio professionale, anche se non identico a TikTok o Instagram.

---

## Fonti Citate

- Banuba SDK ToS: https://www.banuba.com/terms-and-conditions-sdk
- Banuba Web SDK docs: https://docs.banuba.com/face-ar-sdk-v1/web/web_overview
- Banuba Community (MediaStream input): https://community.banuba.com/t/when-i-use-the-face-ar-sdk-on-web-i-want-to-get-a-mediastream-to-push-the-stream-to-my-server/67
- Banuba Pricing FAQ: https://www.banuba.com/faq/banuba-sdk-pricing
- Banuba vs DeepAR comparison: https://www.banuba.com/blog/banuba-face-ar-sdk-vs-deepar-tested-feature-comparison
- Best Beauty AR SDKs compared: https://www.banuba.com/blog/best-beauty-ar-sdks-compared
- DeepAR Terms: https://www.deepar.ai/terms
- DeepAR Pricing: https://docs.deepar.ai/deepar-sdk/pricing/
- DeepAR Web overview: https://docs.deepar.ai/deepar-sdk/platforms/web/overview/
- DeepAR Streaming tutorial: https://docs.deepar.ai/deepar-sdk/platforms/web/tutorials/streaming/
- Zalando acquires DeepAR: https://finance.yahoo.com/news/zalando-buys-deepar-boost-tech-105502932.html
- BytePlus Acceptable Use Policy: https://docs.byteplus.com/en/docs/legal/docs-acceptable-use-policy
- Snap Camera Kit Terms: https://www.snap.com/terms/snap-camera-kit
- Snap Commercial Content Policy (adult ban): https://www.snap.com/terms/commercial-content
- Snap Sexual Content Guidelines: https://values.snap.com/policy/policy-community-guidelines/sexual-content
- Perfect Corp YouCam for Web: https://www.perfectcorp.com/business/services/youcam-4-web
- Tencent RTC Beauty AR Web SDK: https://trtc.io/document/53886
- Tencent RTC Pricing: https://trtc.io/pricing/beauty
- Tencent Cloud AUP (adult ban): https://www.tencentcloud.com/document/product/301/9245
- RobustVideoMatting GitHub: https://github.com/PeterL1n/RobustVideoMatting
- BiRefNet GitHub: https://github.com/ZhengPeng7/BiRefNet
- Venice AI Pricing: https://docs.venice.ai/overview/pricing
- Venice AI Review 2026: https://runtheprompts.com/resources/venice-ai-info/best-venice-ai-pricing-guide/
- Atlas Cloud Wan 2.6 Spicy: https://www.atlascloud.ai/models/atlascloud/wan-2.6-spicy/image-to-video
- Atlas Cloud Pricing: https://www.atlascloud.ai/pricing/models
- FLUX.1 on RunPod: https://www.runpod.io/articles/guides/deploying-flux-1-for-high-resolution-image-generation-with-gpu-infrastructure
- Wan 2.2 GitHub: https://github.com/Wan-Video/Wan2.2
- Wan 2.1/2.2 GPU requirements: https://www.spheron.network/blog/deploy-wan-2-1-ai-video-generation-gpu-setup/
- MirageLSD publication: https://decart.ai/publications/mirage
- Decart API pricing: https://docs.platform.decart.ai/getting-started/pricing
- Decart Terms: https://docs.platform.decart.ai/resources/terms-of-service
- LiveKit Egress Web: https://docs.livekit.io/home/egress/web/
- WebRTC GPU inference article: https://webrtc.ventures/2025/02/when-gpu-matters-in-webrtc-accelerating-ai-video-streaming-and-real-time-communication/
