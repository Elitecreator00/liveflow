# LiveFlow — Platform Technical Capability Matrix
> Fase 0 Discovery — RTMP Ingest & Chat API Capability Research  
> Data ricerca: 2026-05-23  
> Metodo: Web search + fetch su documentazione pubblica, OBS services.json, guide di terze parti  
> Nota: le credenziali effettive (stream key, server URL dinamico) sono account-specific e devono essere verificate con un account reale.

---

## Tabella Riepilogativa

| Piattaforma | RTMP Ingest esterno | Endpoint RTMP (pubblicamente noto) | Max Bitrate Video | Max Risoluzione | Orientation | Chat API ufficiale | Confidenza | Presente in OBS services.json |
|-------------|--------------------|------------------------------------|-------------------|-----------------|-------------|-------------------|------------|-------------------------------|
| **Chaturbate** | SI | `rtmp://global.live.mmcdn.com/live-origin` (+ regionali) | 50.000 kbps | 3840x2160 (4K) | Landscape | SI (Events API ufficiale) | ALTO | SI |
| **Stripchat** | SI | `rtmp://live.doppiocdn.com/ext` | 6.000 kbps | 1920x1080 | N/D | NO (non trovata) | ALTO | SI |
| **BongaCams** | SI | Non pubblicato (ottenuto via BongaModels dashboard) | 6.000 kbps | 1920x1080 | N/D | NO (non trovata) | ALTO | SI |
| **LiveJasmin** | NO (Virtual Camera only) | N/A — JasminCam usa OBS Virtual Camera, nessun ingest RTMP esterno | N/A | 1920x1080 (JasminCam) | N/D | NO (non trovata) | MEDIO-ALTO | NO |
| **CamSoda** | SI | Generato per sessione dal dashboard (regionali: NA, SA, Asia, EU, Oceania) | 6.000 kbps | 1920x1080 | N/D | NO (non trovata) | ALTO | SI |
| **Streamate** | SI (con limitazioni) | Generato per sessione da SMConnect (FMS URL + Stream Key a breve scadenza) | Non pubblicato | Non pubblicato | N/D | NO (non trovata) | MEDIO | NO |
| **MyFreeCams** | SI | `rtmp://publish.myfreecams.com/NxServer` (+ 7 regionali) | 10.000 kbps | Non pubblicato | N/D | NO (non trovata) | ALTO | SI |
| **Cam4** | SI | `rtmp://origin.cam4.com/cam4-origin-live` | 3.000 kbps | Non pubblicato | N/D | NO (non trovata) | ALTO | SI |
| **Flirt4Free** | SI | Non pubblicato (External Broadcast Form nel broadcaster dashboard) | Non pubblicato | Non pubblicato | N/D | NO (non trovata) | MEDIO | NO |

---

## Sezioni Per Piattaforma

---

### 1. Chaturbate

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster naviga su "Broadcast Yourself" > "Use External Encoder to Broadcast" > "View RTMP/OBS broadcast information and stream key" e ottiene il token di broadcast (stream key). Chaturbate e' presente come servizio nativo in OBS Studio.

Server regionali (da OBS services.json e paperblog.com, confermati da fonti multiple):
- Global Main (consigliato): `rtmp://global.live.mmcdn.com/live-origin`
- Global Backup: `rtmp://global-backup.live.mmcdn.com/live-origin`
- Asia Mumbai: `rtmp://bom.live.mmcdn.com/live-origin`
- Asia Singapore: `rtmp://sin.live.mmcdn.com/live-origin`
- Asia Taiwan: `rtmp://tsa.live.mmcdn.com/live-origin`
- Sud America Bogota: `rtmp://live-bog.stream.highwebmedia.com/live-origin`
- Sud America San Paolo: endpoint su highwebmedia.com (vedi services.json)
- US West Seattle: `rtmp://live-sea.stream.highwebmedia.com/live-origin`
- US West Phoenix: `rtmp://live-phx.stream.highwebmedia.com/live-origin`
- US Central Salt Lake City: `rtmp://live-slc.stream.highwebmedia.com/live-origin`
- US Central Chicago: `rtmp://live-chi.stream.highwebmedia.com/live-origin`
- US East Atlanta: `rtmp://live-atl.stream.highwebmedia.com/live-origin`
- US East Ashburn: `rtmp://live-ash.stream.highwebmedia.com/live-origin`

Infrastruttura CDN: mmcdn.com (Chaturbate CDN) e highwebmedia.com (holding company).

**Vincoli noti:**
| Risoluzione | Bitrate video consigliato | Bitrate audio | FPS |
|-------------|--------------------------|---------------|-----|
| 853x480 | 800-1.200 kbps | 96 kbps | 24-30 |
| 1280x720 | 3.000-5.000 kbps | 96 kbps | 24-30 |
| 1920x1080 | 5.000-8.000 kbps | 128 kbps | 24-30 |
| 3840x2160 | 12.000-20.000 kbps | 192 kbps | 24-30 |
- Max bitrate video (services.json): 50.000 kbps
- Max bitrate audio (services.json): 192 kbps
- Keyframe interval: 2s
- Codec: H.264
- Orientamento: solo landscape (confermato da Streamster guide)
- SRT: non supportato (solo RTMP)

**Chat API ufficiale:** SI — Events API ufficiale con token OAuth a `chaturbate.com/statsapi/authtoken/` (scope "Events API"). Long-poll JSON feed. Supporta: chat messages, tips, private messages, room status, user join/leave. Rate limit: 2.000 req/min. Documentazione: `devportal.cb.dev` (accesso richiede registrazione).

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- Paperblog OBS setup: https://en.paperblog.com/setting-up-obs-for-chaturbate-live-streaming-6990255/
- Streamster manual: https://streamster.io/blog/manual-how-to-stream-to-chaturbate-with-external-encoder/
- Events API developer portal: https://devportal.cb.dev/wiki/introduction
- chaturbate-poller PyPI: https://pypi.org/project/chaturbate-poller/

---

### 2. Stripchat

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster naviga su Broadcast Center > "Switch to External Broadcast Software (OBS)" > "Show OBS Broadcasting Specification" e copia lo Stream Key.

Server (da OBS services.json, confermato da fonti multiple):
- `rtmp://live.doppiocdn.com/ext`

Infrastruttura CDN: doppiocdn.com (CDN proprietario Stripchat).

**Vincoli noti (da OBS services.json):**
- Max bitrate video: 6.000 kbps
- Max bitrate audio: 128 kbps
- Keyframe interval: 2s
- Profile: main
- B-frames: 0
- Tune: zerolatency
- Risoluzione massima: 1920x1080 (inferita da pratica comune; non esplicitata nella docs pubblica)
- Orientamento: N/D (non trovato in documentazione pubblica)
- SRT: non supportato (solo RTMP)

**Chat API ufficiale:** NON TROVATA — nessuna API pubblica o developer portal rilevata. Monitoraggio chat richiede reverse engineering del WebSocket.

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- Streamster Stripchat manual: https://streamster.io/blog/manual-how-to-stream-to-stripchat-with-external-encoder/
- Streamster Knowledge Base: https://docs.streamster.io/docs/targets-adult/desktop-app-7287/stripchat-7366/

---

### 3. BongaCams

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster naviga su BongaModels account > "Broadcast Yourself" > tab "External Encoder" > copia Stream Key. L'URL del server RTMP non e' pubblicato nella documentazione pubblica; viene fornito insieme alla stream key dentro il dashboard.

Server RTMP: non pubblicato esplicitamente. Fonti secondarie menzionano endpoint su `bongamodels.com` con varianti per EU e Nord America (da OBS services.json: server "Automatic/default" + "Europe" + "North America").

**Vincoli noti (da OBS services.json):**
- Max bitrate video: 6.000 kbps
- Max bitrate audio: 192 kbps
- Keyframe interval: 2s
- B-frames: 0
- Tune: zerolatency
- Risoluzione: N/D dalla documentazione pubblica
- Orientamento: N/D
- SRT: non supportato

**Chat API ufficiale:** NON TROVATA — nessuna API pubblica o developer portal rilevata.

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- Streamster BongaCams manual: https://streamster.io/blog/manual-how-to-stream-to-bongacams-with-external-encoder/
- OBS Forums thread: https://obsproject.com/forum/threads/working-with-web-modeling-services.77687/

---

### 4. LiveJasmin

**Supporta external encoder / RTMP ingest:** NO

**Descrizione tecnica:**
LiveJasmin utilizza il proprio software proprietario **JasminCam** (Windows/macOS) come unico metodo di broadcast ufficiale. L'integrazione con OBS e' consentita esclusivamente tramite **OBS Virtual Camera**: OBS funziona come mixer video locale, il suo output virtuale viene catturato da JasminCam che gestisce l'upload verso i server LiveJasmin. Non esiste un endpoint RTMP esterno, ne' una stream key che si puo' configurare in un encoder indipendente.

Questo e' confermato dall'assenza di LiveJasmin in OBS services.json e dall'assenza di qualsiasi documentazione su endpoint RTMP nei risultati di ricerca.

La feature "Multi-Camera Streaming" (dicembre 2024) segue lo stesso pattern: OBS Virtual Camera -> JasminCam.

**Vincoli noti:**
- Upload minimo: 1,5 Mbps
- Risoluzione camera: fino a 1920x1080, 30 FPS
- Hardware encoding supportato: Intel QuickSync, Nvidia NVENC, AMD VCE/VCN (tramite JasminCam)
- Orientamento: N/D (JasminCam gestisce internamente)

**Chat API ufficiale:** NON TROVATA

**Livello di confidenza:** MEDIO-ALTO (l'assenza di ogni evidenza di RTMP ingest, combinata con la presenza di documentazione che descrive solo JasminCam+VirtualCamera come metodo, e' fortemente indicativa. Da verificare con account reale per escludere feature non documentate.)

**Fonti principali:**
- LiveJasmin Wiki tecnico: https://livejasminwiki.com/technical-requirements/
- LiveJasmin Wiki OBS: https://livejasminwiki.com/multi-camera-stream-with-obs/
- Annuncio multi-camera: https://bcams-magazine.com/2024/12/livejasmin-introduces-multi-camera-streaming-for-models/

---

### 5. CamSoda

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster naviga su dashboard > "Go Live" > "Use OBS Broadcaster" e ottiene il Server URL + Stream Key. CamSoda e' presente in OBS services.json con server multipli regionali (Nord America, Sud America, Asia, Europa, Oceania); i relativi URL esatti sono nel file services.json del progetto OBS.

**Vincoli noti (da OBS services.json):**
- Max bitrate video: 6.000 kbps
- Max bitrate audio: 160 kbps
- Risoluzione max: 1920x1080
- Max FPS: 30
- Tune: zerolatency
- Keyframe interval: N/D
- Orientamento: N/D
- SRT: non supportato

**Chat API ufficiale:** NON TROVATA — nessuna API pubblica o developer portal rilevata.

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- Streamster CamSoda manual: https://streamster.io/blog/manual-how-to-stream-to-camsoda-with-external-encoder/
- OBS Forums: https://obsproject.com/forum/threads/streaming-site.114888/
- GitHub issue (WebRTC support): https://github.com/CoSMoSoftware/OBS-studio-webrtc/issues/39

---

### 6. Streamate

**Supporta external encoder / RTMP ingest:** SI (con limitazione critica)

**Endpoint RTMP:**
Il broadcaster naviga su SMConnect broadcasting page > Settings > campo Encoder: "External Encoder" > Refresh > Start Show > copia "Streaming Key".

**Limitazione critica:** Sia l'FMS URL (server RTMP) che la Stream Key hanno una **breve scadenza** e cambiano ad ogni sessione di broadcast. Questo rende l'integrazione automatizzata piu' complessa: il sistema di fan-out deve recuperare credenziali fresche prima di ogni avvio live.

Server RTMP: non pubblicato nella documentazione pubblica. Streamate non appare in OBS services.json (nessuna entry trovata).

Nota storica: compatibilita' documentata con FMLE, OBS (Classic e Studio), software nativo Streamate. Segnalati problemi di timeout con OBS Studio (stream key scade prima che la connessione si stabilisca in alcuni casi).

**Vincoli noti:**
- Max bitrate: non pubblicato
- Risoluzione: non pubblicata
- Codec: N/D
- Orientamento: N/D
- SRT: non supportato

**Chat API ufficiale:** NON TROVATA

**Livello di confidenza:** MEDIO (il supporto RTMP e' confermato da guide di terze parti attendibili come Streamster, ma la scadenza rapida delle credenziali e l'assenza dal services.json di OBS indicano che l'integrazione richiede handling speciale. Verifica con account reale necessaria per i dettagli operativi.)

**Fonti principali:**
- Streamster Streamate manual: https://streamster.io/blog/manual-how-to-stream-to-streamate-smconnect-with-external-encoder/

---

### 7. MyFreeCams

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
MyFreeCams e' presente come servizio nativo in OBS Studio. Il broadcaster ottiene la stream key dal proprio account MFC.

Server regionali (da OBS services.json):
- Global (auto): `rtmp://publish.myfreecams.com/NxServer`
- Australia: `rtmp://publish-syd.myfreecams.com/NxServer`
- East Asia: `rtmp://publish-tyo.myfreecams.com/NxServer`
- Europa Est, Europa Ovest, Nord America Est, Nord America Ovest, Sud America: endpoint analoghi su sottodomini `publish-xxx.myfreecams.com/NxServer`

**Vincoli noti (da OBS services.json):**
- Max bitrate video: 10.000 kbps
- Max bitrate audio: 192 kbps
- Profile: high
- Max FPS: 60
- Tune: zerolatency
- Keyframe interval: 1s
- Risoluzione: N/D (non esplicitata)
- Orientamento: N/D
- SRT: non supportato

**Chat API ufficiale:** NON TROVATA — nessuna API pubblica rilevata. Esiste un protocollo WebSocket non ufficiale documentato da repo community (github.com/horacio9a/myfreecams-anonymous).

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- Streamster MFC manual: https://streamster.io/blog/manual-how-to-stream-to-myfreecams-with-external-encoder/

---

### 8. Cam4

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster naviga su Broadcast Settings > External Encoder > "Get Stream Key". Cam4 e' presente come servizio nativo in OBS Studio.

Server (da OBS services.json, confermato da GitHub):
- `rtmp://origin.cam4.com/cam4-origin-live`

**Vincoli noti (da OBS services.json):**
- Max bitrate video: 3.000 kbps
- Max bitrate audio: 128 kbps
- Keyframe interval: 1s
- Profile: baseline
- Codec: H.264
- Risoluzione: N/D (non esplicitata nel file)
- Orientamento: N/D
- SRT: non supportato

Nota: il limite di 3.000 kbps e' il piu' basso del gruppo — vincolo rilevante per la qualita' dell'output.

**Chat API ufficiale:** NON TROVATA

**Livello di confidenza:** ALTO  
**Fonti principali:**
- OBS services.json: https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/services.json
- GitHub repository: https://github.com/JennetJeff/Tutorial (conferma URL `rtmp://origin.cam4.com/cam4-origin-live`)
- SplitCam guide: https://splitcam.com/help/start/how-to-add-cam4-stream
- Streamster Cam4 manual: https://streamster.io/blog/manual-how-to-stream-to-cam4-with-external-encoder/

---

### 9. Flirt4Free

**Supporta external encoder / RTMP ingest:** SI

**Endpoint RTMP:**
Il broadcaster accede all'"External Broadcast Form" nel broadcaster dashboard e ottiene RTMP URL + Stream Name. Flirt4Free NON appare in OBS services.json (nessuna entry trovata).

Server RTMP: non pubblicato nella documentazione pubblica. Fornito dinamicamente via External Broadcast Form al momento del live.

**Vincoli noti:**
- Max bitrate: non pubblicato (il broadcaster deve inserire resolution e bitrate nel form)
- Risoluzione: non pubblicata
- Codec: N/D
- Orientamento: N/D
- SRT: non supportato

**Chat API ufficiale:** NON TROVATA

**Livello di confidenza:** MEDIO (RTMP ingest confermato da guide Streamster e splitcam, che sono fonti attendibili specializzate nell'integrazione con piattaforme cam. Endpoint specifici e vincoli tecnici sconosciuti senza account reale.)

**Fonti principali:**
- Streamster Flirt4Free manual: https://streamster.io/blog/manual-how-to-stream-to-flirt4free-with-external-encoder/

---

## Implicazioni per lo Spike (Prime Piattaforme Target)

### Raccomandazione: usare Chaturbate, Stripchat e MyFreeCams come target prioritari per il fan-out MVP.

**Motivazione tecnica:**

**1. Chaturbate — Target #1 (priorita' massima)**
- RTMP ingest confermato con la piu' alta confidenza
- Endpoint RTMP multipli geografici noti e stabili (mmcdn.com)
- Presente nativamente in OBS Studio services.json con max 50.000 kbps (il piu' permissivo del gruppo)
- Supporto 4K
- **Unica piattaforma del gruppo con un'Events API ufficiale** per chat/tips (devportal.cb.dev), abilitando il modulo M3 di chat unificata gia' dallo spike
- La combinazione RTMP ingest + Events API ufficiale rende Chaturbate il target ideale per validare l'intero stack LiveFlow (video fan-out + chat unificata) in un'unica piattaforma

**2. Stripchat — Target #2**
- RTMP ingest confermato con alta confidenza
- Endpoint RTMP stabile e pubblico: `rtmp://live.doppiocdn.com/ext`
- Presente in OBS services.json
- Seconda piattaforma per volume di traffico cam globale dopo Chaturbate
- Vincoli tecnici ben definiti (6.000 kbps, H.264, tune=zerolatency)

**3. MyFreeCams — Target #3**
- RTMP ingest confermato con alta confidenza
- Endpoint RTMP multipli geografici noti e stabili (publish.myfreecams.com)
- Max bitrate 10.000 kbps, profile high, fino a 60fps — il secondo set di vincoli piu' permissivo del gruppo
- Presente in OBS services.json

**Piattaforme da posticipare o escludere dallo spike:**

- **LiveJasmin**: ESCLUSA dallo spike RTMP — non accetta ingest da encoder esterni. Richiederebbe un approccio completamente diverso (WebRTC/JasminCam API, se mai disponibile). Da rivalutare solo se la piattaforma rilascia un RTMP ingest nativo o una API di streaming ufficiale.
- **Streamate**: posticipata — le credenziali a breve scadenza complicano l'automazione e richiedono handling speciale. Fattibile ma aumenta la complessita' dello spike senza benefici proporzionali.
- **BongaCams**: candidata per la Fase 1 post-spike — RTMP confermato, in OBS services.json, ma endpoint specifico non pubblicato, richiede account reale per validare il server URL prima dell'integrazione.
- **CamSoda**: candidata per la Fase 1 — RTMP confermato, in OBS services.json, endpoint regionali disponibili.
- **Cam4**: candidata per la Fase 1 — RTMP confermato, endpoint pubblico, ma bitrate cap a 3.000 kbps e' il piu' basso del gruppo.
- **Flirt4Free**: da verificare con account reale prima di includere — endpoint non pubblicato.

---

## Note Metodologiche e Avvertenze

1. **Endpoint dinamici**: per Streamate e Flirt4Free, e parzialmente per CamSoda, le credenziali RTMP sono generate per sessione. Il sistema LiveFlow deve implementare un meccanismo di recupero credenziali pre-broadcast per queste piattaforme.

2. **Chat API**: solo Chaturbate ha un'API ufficiale pubblica per gli eventi chat/tips. Per tutte le altre piattaforme, il modulo M3 richiedera' reverse engineering dei WebSocket, con rischio di breaking changes. Questo va documentato come rischio R2 nel risk register.

3. **Orientamento**: solo Chaturbate ha una policy esplicita (landscape only). Per le altre piattaforme l'orientamento non e' documentato pubblicamente — da verificare con account reale, specialmente per l'integrazione con app mobile iOS (M2.3).

4. **SRT**: nessuna delle 9 piattaforme analizzate mostra evidenza pubblica di supporto SRT come protocollo di ingest. L'ingest da device verso il media server LiveFlow puo' usare SRT/RTMP/WHIP (come da M1.2), ma il fan-out verso le piattaforme target avviene esclusivamente via RTMP.

5. **Verifica con account reale**: prima dell'integrazione di ciascuna piattaforma in produzione, e' necessario:
   - Ottenere una stream key reale e testare la connessione
   - Verificare i limiti di bitrate effettivi (possono differire da quelli nel services.json)
   - Verificare la policy ToS su multistreaming (rischio R1 del piano operativo)
   - Documentare l'experience di latenza e stabilita' della connessione

---

*Ricerca condotta tramite: WebSearch + WebFetch su documentazione Streamster, OBS services.json ufficiale (github.com/obsproject/obs-studio), forum OBS, LiveJasmin Wiki, Chaturbate Developer Portal, paperblog.com, splitcam.com guide, SplitCam/Xtreamer/Streamster knowledge bases.*
