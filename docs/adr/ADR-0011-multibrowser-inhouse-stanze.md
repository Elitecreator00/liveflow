# ADR-0011 — Multi-browser in-house a "stanze": display remoto CDP, niente Neko

## Status

**Accepted** — 2026-06-12. Raffina **ADR-0010** (che resta valido per scope, target e guardrail di compliance): ne sostituisce la componente *remote display* (Neko) e il modello dati (profili/sessioni → **stanze**). Chiude in anticipo la decisione che ADR-0010 rimandava ad "ADR-0012 remote display (Neko vs CDP screencast)": **CDP screencast, in-house**.

## Context

Decisione dell'utente (2026-06-12): **nessun servizio/progetto esterno** per il multi-browser — Neko incluso. Il multi-browser va ricreato da zero, con un modello a **stanze**:

- ogni stanza ha **fingerprint unico** (generato alla creazione, stabile per sempre), **proxy unico** (impostato alla creazione, modificabile dai settings), **sessione totalmente isolata e persistente** (cookie/login sopravvivono ai riavvii), **nome** (default "Stanza 1, 2, … n");
- una stanza si **avvia scegliendo una sorgente streaming** (Studio LIVE → webcam virtuale) **o senza sorgente** (placeholder; utile per login/setup account);
- in **Studio**, accanto a ogni stream, un pulsante **"Apri in stanza"** apre quella sorgente in una stanza a scelta.

## Decision

### Display remoto: CDP screencast (in-house)

Il browser della stanza è pilotato via **Chrome DevTools Protocol** dall'orchestratore (data-plane, VPS): `Page.startScreencast` produce frame JPEG che un **gateway WebSocket** inoltra al viewer della Console (canvas); l'input dell'operatore (mouse/tastiera/navigazione/tab) torna indietro via `Input.dispatchMouseEvent/KeyEvent`, `Page.navigate`, `Target.*`. Autenticazione viewer: token **HMAC-SHA256(roomId.exp, ORCH_TOKEN)** firmato dal control-plane, scadenza 12h. Niente Neko/VNC: ~600 righe nostre (`tools/browser-farm/`), zero dipendenze di runtime oltre `express`, `ws`, `@livekit/rtc-node`, ffmpeg e Docker.

### Stanza = identità browser persistente

Modello `BrowserRoom` (Prisma): `name`, `fingerprint` (JSON, generato server-side da `FingerprintService`: UA/UA-CH Chrome-Windows plausibile, locale↔timezone coerenti, viewport/cores da pool reali), `encryptedProxy` (AES-256-GCM, C5; hint host:port senza credenziali verso la UI), stato runtime (`IDLE/PROVISIONING/RUNNING/ERROR`). Sostituisce `BrowserProfile`+`BrowserSession` di ADR-0010.

Sul VPS ogni stanza ha: **container dedicato** (immagine nostra `liveflow-browser`: Debian+Chromium+Xvfb+PulseAudio, `Dockerfile` in repo), **profilo persistente** montato (`~/liveflow-farm/profiles/<roomId>` → `/profile`, distrutto solo cancellando la stanza), **webcam virtuale dedicata** (`/dev/video1N → /dev/video0`), **proxy** via `--proxy-server` (credenziali HTTP risposte via CDP `Fetch.authRequired`, SOCKS autenticati via relay per stanza; mai su disco).

### Fingerprint: applicazione via CDP + ambiente container

`Emulation.setUserAgentOverride` (UA + metadata UA-CH), `setTimezoneOverride`, `setLocaleOverride`, `setHardwareConcurrencyOverride` su ogni pagina (auto-attach flat); `TZ`/`LANG`/`--lang`/`--window-size` coerenti nel container; `--disable-blink-features=AutomationControlled` (niente `navigator.webdriver`). `acceptLanguage` **senza q-values** (Chromium li riverserebbe in `navigator.languages`: anomalia rilevabile).

### Webcam virtuale: lezioni operative (validate in smoke test)

- `v4l2loopback` con **parametri array**: `exclusive_caps=1,1,…` (un solo valore = solo primo device; senza exclusive_caps Chromium scarta i device con capability OUTPUT);
- **priming** (~0.4s di nero scritti dal data-plane prima di avviare il container) per fissare formato/capability ed evitare il deadlock reader-prima-del-writer;
- ⚠️ **`keep_format` NON esiste in v4l2loopback 0.12.x** (la versione DKMS su Ubuntu 24.04): il kernel lo scarta con `unknown parameter 'keep_format' ignored` — `modprobe` **non** dà errore, lo si vede solo in `dmesg`. Il formato fissato dal priming quindi *non* è persistente: un reader che apre il device senza un writer attivo può lasciarlo in stato inconsistente (`VIDIOC_G_FMT: Invalid argument`), irrecuperabile senza ricaricare il modulo. Perciò l'orchestratore **primerizza a ogni avvio e, se un device non regge, lo esclude dal pool e passa al successivo** (`acquireDevice`); i device esclusi sono visibili in `GET /health`;
- ⚠️ **`videodev` (core V4L2) e `snd-aloop` stanno in `linux-modules-extra`**, che il metapacchetto delle immagini cloud (`linux-virtual`) **non** installa: a ogni aggiornamento di kernel la farm restava senza `/dev/video*` e ogni avvio falliva. Fix: `linux-generic` installato sul VPS (tira `linux-modules-extra` per ogni kernel futuro) + `deploy.sh` che lo verifica;
- moduli e permessi **persistenti al reboot**: `/etc/modules-load.d/` + `/etc/modprobe.d/` per le opzioni, regola udev `99-liveflow-farm.rules` per i permessi (il `chmod 666` a mano non sopravvive a reboot o ricarica del modulo); utente container nei gruppi `video,audio`;
- mic virtuale PulseAudio via `module-remap-source` (Chromium **nasconde** le source "monitor");
- senza sorgente Studio, un **placeholder ffmpeg** tiene sempre un writer sul device.

### Errori: il data-plane parla all'operatore, non a se stesso

Ogni fallimento di `POST /rooms/:id/start` esce come `{ code, error, detail }`: `error` è la frase che la Console mostra (cosa è successo e cosa fare), `detail` il dump tecnico che resta nei log del server. L'API (`OrchestratorStartError`) la propaga e la salva in `lastError` — mai lo stderr grezzo. Codici: `FARM_DEVICE_MISSING`, `FARM_DEVICE_PERMISSION`, `FARM_DEVICE_BUSY`, `FARM_DEVICE_PRIMING_FAILED`, `FARM_ALL_DEVICES_UNUSABLE`, `FARM_NO_FREE_DEVICE`, `FARM_FFMPEG_MISSING`, `FARM_DOCKER_DOWN`, `FARM_IMAGE_MISSING`, `FARM_CONTAINER_START_FAILED`, `FARM_BROWSER_NOT_RESPONDING`, `ROOM_PROXY_UNREACHABLE`, `ROOM_PROXY_AUTH_FAILED`.

Il **proxy della stanza è verificato prima di accendere qualsiasi cosa** (CONNECT reale; TCP soltanto per SOCKS): un proxy scaduto faceva partire una stanza che poi non navigava, e un browser senza proxy funzionante uscirebbe con l'IP del VPS — lo stesso per tutte le stanze, cioè l'opposto del requisito "un IP per identità". `GET /health` riporta `ready`, i device utilizzabili e quelli esclusi, così la Console può dire che la farm è ferma *prima* che l'operatore prema Avvia.

### Proxy: schemi, autenticazione e relay per stanza

Chromium accetta in `--proxy-server` solo `http`, `https`, `socks4`, `socks5`. **`socks5h://` (convenzione di curl per "DNS risolto dal proxy") non è riconosciuto**: passato così com'era produceva `ERR_NO_SUPPORTED_PROXIES` su ogni pagina, con la stanza apparentemente avviata. Ora `parseProxyParts` normalizza gli alias (`socks5h`→`socks5`, `socks4a`→`socks4`) e uno schema fuori elenco viene rifiutato all'avvio con un messaggio esplicito.

**Chromium non sa autenticarsi sui proxy SOCKS**: la challenge CDP `Fetch.authRequired` esiste solo per i proxy HTTP (che rispondono 407), e la riga di comando non accetta credenziali SOCKS. Un SOCKS5 autenticato — il formato che diversi provider (Decodo/Smartproxy…) danno come esempio — produceva quindi una stanza che si apriva ma non navigava.

Soluzione: **relay proxy per stanza** (`proxy-relay.mjs`, in-house, zero dipendenze). Espone al container un proxy HTTP *senza* autenticazione e inoltra al SOCKS5 upstream autenticandosi lui (handshake RFC 1928 + RFC 1929, `CONNECT` per HTTPS e rigiro della richiesta per l'HTTP in chiaro). Le credenziali restano nel processo dell'orchestratore: non entrano nel container né in `docker inspect`. Il preflight usa **lo stesso** codice di handshake del relay, quindi se il check passa la stanza naviga davvero, e un abbonamento scaduto esce come `ROOM_PROXY_AUTH_FAILED` invece che come pagina bianca.

Perché il relay non sia un open proxy, i container della farm stanno su una **rete Docker dedicata a indirizzi fissi** (`liveflow-farm`, `172.30.0.0/24`): lo slot `n` del pool determina IP del container (`172.30.0.<n>`) e porta del relay (`9400+n`), entrambi noti *prima* di accendere la stanza, e il relay accetta **solo** l'IP di quel container.

⚠️ **ufw**: il traffico container → gateway passa dalla catena INPUT dell'host, quindi va aperto esplicitamente, altrimenti le stanze con relay restano in `ERR_TIMED_OUT`:
`ufw allow from 172.30.0.0/24 to 172.30.0.1 port 9410:9417 proto tcp` (in `deploy.sh`).

Verificato end-to-end (2026-09-03) con un SOCKS5 autenticato reale: Google carica e `api.ipify.org` visto dalla stanza restituisce l'IP del proxy (UK), non quello del VPS; una stanza senza proxy continua a uscire con l'IP del VPS.

### Composizione della sorgente: nel filtergraph, non in un browser headless

Specchio, filtri colore e scritte dello Studio vengono applicati **nell'ingestor**, come filtri FFmpeg (`hflip`, `eq`, `hue`, `gblur`, `drawtext`), non da un render headless.

Motivo: la strada "ufficiale" del compositing (LiveKit Egress → RTMP) aggiunge secondi di latenza, mentre la stanza browser deve restare reattiva — l'operatore ci lavora dentro. FFmpeg è già nel percorso, quindi questi filtri non aggiungono né un passaggio né ritardo. Vale per la stanza; per lo stream verso le piattaforme resta valido il percorso Egress di ADR-0004.

- **Specchio**: mai sul device della creator. Ribaltare lì obbliga a ridisegnare ogni frame su un canvas, e `captureStream()` fa perdere la codifica accelerata: su una webcam da PC a 720p la diretta va **al rallentatore** (da telefono, che pubblica ~360p, il costo si nota molto meno — per questo il difetto sembrava riguardare solo il PC). Il flag viaggia `app creator → API (StreamSession.mirrored) → orchestrator → ingestor`.
- **Scena**: `SceneStateService` → `BrowserFarmService.applySourceScene` → `POST /rooms/:id/scene` → riga JSON sullo stdin dell'ingestor. Gli aggiornamenti ravvicinati (uno slider trascinato) vengono accorpati per 400 ms prima di riavviare FFmpeg.
- I **testi** non entrano mai nel filtergraph: vanno in un file (`textfile=`), così apici, due punti e percentuali non possono romperlo né iniettarvi altri filtri. Mapping CSS→FFmpeg e casi limite sono coperti da `scene-filters.test.mjs`.
- Ordine: `hflip → scale → colore → drawtext`. Lo specchio per primo (costa meno sul frame piccolo), le scritte per ultime — altrimenti uscirebbero ribaltate e sfocate insieme all'immagine.

**Limite noto**: gli overlay *immagine* non sono ancora compositati (solo testo); `invert` e `sepia`, graduali in CSS, si applicano tutto-o-niente oltre il 50%.

### ⚠️ I siti specchiano la propria anteprima: non giudicare da lì

Verificato su chatroulette.com (2026-09-04): il `<video>` della nostra webcam ha un contenitore con `transform: matrix(-1, 0, 0, 1, 0, 0)`, cioè `scaleX(-1)`. È il comportamento normale delle self-view (tutte le app selfie mostrano l'immagine speculare a chi si riprende), e **non altera il MediaStream inviato agli altri**.

Conseguenza pratica: nell'anteprima del sito **le scritte appaiono sempre rovesciate**, sia con lo specchio acceso sia spento — mentre il pubblico le legge correttamente. Chi prova la funzione guardando la propria immagine sul sito conclude, sbagliando, che "lo specchio ribalta anche il testo" e che "spegnendolo non cambia nulla".

Per verificare cosa esce davvero, guardare la sorgente e non il sito: `ffmpeg -f v4l2 -i /dev/videoN -frames:v 1 out.png` cattura esattamente il frame che il browser riceve.

### La prova che il proxy è davvero in uso

La diagnosi misurava l'uscita facendo la richiesta geo-IP **da Node attraverso il proxy configurato**: diceva quindi dove esce il proxy, non dove esce il browser. Se Chromium non avesse usato il proxy, il controllo avrebbe risposto "tutto a posto" — l'unico caso in cui serve davvero.

Ora si misurano entrambi e si confrontano:

- **uscita del browser** — `fetch` valutata in un **mondo isolato** della pagina attiva (`RoomSession.evalIsolated`, `Page.createIsolatedWorld`): non è soggetta alla CSP del sito e non richiede di aprire schede che disturbino l'operatore. È la misura che conta, perché è ciò che vede il sito;
- **uscita del proxy** — la richiesta da Node attraverso il proxy della stanza;
- se i due IP differiscono → rilievo di livello `error`: *"Il browser NON sta usando il proxy: esce da X, mentre il proxy configurato esce da Y"*. Fuso, lingua e tipo di rete vengono confrontati con l'uscita **del browser**, non più con quella del proxy.

La verifica parte **da sola 15 s dopo l'avvio** della stanza e l'esito finisce in `GET /browser-farm/rooms/runtime`: la Console mostra un badge sulla card senza che nessuno debba ricordarsi di lanciarla. Verificato su una stanza reale con proxy UK: browser e proxy escono entrambi da `45.154.151.120` (London), fingerprint `Europe/London` / `en-GB` — nessuna incoerenza.

### Stanze fantasma dopo un riavvio

A ogni riavvio dell'orchestratore i container vengono rimossi, ma il database restava a `RUNNING`: la Console mostrava stanze "attive" — complete di proxy, paese e fingerprint — che non esistevano più. `runtimeStatus` ora **riallinea** lo stato (→ `IDLE` con un `lastError` che lo spiega) confrontando il database con le stanze realmente presenti nel data-plane. Distinzione necessaria: `runtimeStatus()` torna `null` quando il data-plane non risponde, così un guasto di rete non fa spegnere stanze vive.

### ⚠️ Il browser deve essere un browser vero (WebGL)

`--disable-gpu` nei flag di Chromium lasciava le stanze **senza WebGL**: `canvas.getContext("webgl")` restituiva `null`. Nel mondo reale non esiste un browser così — è uno dei primi controlli anti-bot, e finché mancava le verifiche non passavano **nemmeno completandole a mano**, per quanti click umani si facessero.

Sostituito con rendering software: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`. Il renderer diventa `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))`, cioè quello che vedono gli utenti reali su VM e macchine senza GPU. Costa CPU solo quando una pagina usa davvero WebGL. Il renderer è ora tra i dati della diagnosi di identità, e la sua assenza è segnalata come errore.

**Nota sull'impronta**: il rilevamento dei CAPTCHA nasceva come `Runtime.evaluate` ogni 5 s in ogni stanza — cioè un'esecuzione JS periodica su ogni sito visitato, esattamente l'impronta che il resto del codice evita con cura (il probe del cursore è throttlato e non abilita `Runtime`). Riscritto come osservazione **passiva** del traffico (`Network.requestWillBeSent`): una sfida si riconosce dal caricamento del suo frame (`recaptcha/api2/bframe`, `hcaptcha/challenge`, `challenge-platform`), che avviene solo quando la sfida è realmente presentata; il reCAPTCHA v3 invisibile, presente ovunque, non genera falsi allarmi. Lo stato scade da solo dopo 25 s senza traffico.

**Input dell'operatore: verificato che funzionano.** Riprodotto il percorso completo (WebSocket del viewer → `Input.dispatchMouseEvent`) su un reCAPTCHA reale: prima del click il frame della sfida è `300x150 hidden`, dopo `400x580 visible`. I click arrivano al widget, anche dentro iframe di terze parti. Quando una verifica non si supera, la causa non è il viewer ma la reputazione dell'uscita di rete.

### Verifiche anti-bot: si segnalano, non si aggirano

**Decisione (2026-09-04): niente risoluzione automatica dei CAPTCHA**, né con servizi esterni (2captcha e simili) né con altri mezzi. Un CAPTCHA è la domanda "sei umano adesso?": farla risolvere da terzi dentro un browser che gira su un server, con fingerprint fabbricato e proxy dedicato, è aggiramento di un controllo d'accesso. Sommato a fingerprint e proxy per stanza, comporrebbe l'insieme classico dell'evasione anti-bot — un rischio concreto in una due diligence, oltre che una violazione dei ToS di ogni piattaforma di destinazione.

Al suo posto, due strumenti che risolvono lo stesso problema operativo:

1. **Rilevamento e avviso** (`captcha-watch.mjs`): l'orchestratore interroga ogni stanza ogni 5 s con una sonda che distingue una verifica **attiva** da un widget dormiente (quasi ogni sito tiene un reCAPTCHA v3 invisibile: segnalarlo renderebbe l'avviso inutile, quindi si controlla anche l'ingombro sullo schermo). Lo stato esce da `GET /browser-farm/rooms/runtime`; la Console mostra un avviso sulla card con da quanto la stanza è ferma e un pulsante che porta al viewer, dove mouse e tastiera dell'operatore funzionano già. **La verifica la completa una persona.**
2. **Diagnosi di coerenza** (`identity-check.mjs`, `GET /browser-farm/rooms/:id/identity`): confronta da dove esce davvero la stanza — richiesta geo-IP fatta da Node **attraverso il proxy della stanza**, non dal browser (la pagina aperta può avere una CSP che blocca le richieste esterne, e aprire una scheda disturberebbe l'operatore) — con ciò che il browser dichiara (fuso, lingua, `navigator.webdriver`). Segnala le incoerenze che fanno scattare i controlli: fuso discordante, lingua di un altro paese, IP di datacenter, stanza senza proxy.

Verificato il 2026-09-04: la sonda riconosce un reCAPTCHA reale e torna a zero su una pagina normale (nessun falso positivo); la diagnosi su una stanza senza proxy ha correttamente rilevato uscita `OVH SAS` da Milano e segnalato sia l'assenza di proxy sia l'IP da datacenter.

### Identità nativa, non emulata (2026-09-28)

**Sintomo**: loop di Cloudflare Turnstile sul login di Stripchat. La verifica si apriva, l'operatore la completava a mano, si chiudeva e si riapriva all'infinito (decine di cicli nel log di `captcha-watch`).

**Causa**: il fingerprint era applicato con override CDP (`Emulation.setUserAgentOverride`, `setLocaleOverride`, `setTimezoneOverride`, `setHardwareConcurrencyOverride`), che agiscono **solo sulla sessione della pagina** a cui sono inviati. Misurato sulla stanza reale:

| Contesto | Sistema | Versione | Lingua |
|---|---|---|---|
| Pagina di Stripchat | Windows | Chrome 136 | en-GB |
| Iframe di Turnstile (`challenges.cloudflare.com`, fuori processo) | Linux | Chromium 152 | en-US |
| Service worker del sito | Linux | Chromium 152 | en-US |

Un browser che è Windows e Linux insieme, versione 136 e 152, non esiste: Turnstile confronta la pagina col proprio iframe e rifiuta, qualunque cosa faccia la persona. In più la versione dichiarata era 16 major indietro rispetto al motore reale (le API disponibili la smentivano).

**Decisione**: niente più override CDP dell'identità. La stanza imposta solo ciò che un utente reale configura, e lo imposta **in modo nativo**, così vale identico in pagina, iframe, worker e header HTTP:
- **fuso**: `TZ` del container (c'era già);
- **lingua**: `intl.accept_languages` nelle preferenze del profilo, scritte dall'orchestratore prima dell'avvio (`browser-prefs.mjs`, senza il doppio `en` che il generatore produceva per le lingue inglesi); lingua dell'interfaccia (e quindi locale di `Intl`) via `LANGUAGE`, con il pacchetto `chromium-l10n` nell'immagine: prima c'era solo `en-US.pak` e ogni stanza, anche italiana, formattava le date all'americana;
- **schermo**: dimensione del display Xvfb (c'era già).

Sistema operativo, versione del browser e numero di core sono **quelli reali**, uguali per tutte le stanze. I campi `userAgent`, `uaFullVersion`, `platform*`, `hardwareConcurrency` del fingerprint restano nel DB per compatibilità ma non vengono applicati, e la Console non li mostra più. L'unicità della stanza sta in profilo, proxy, paese, lingua, fuso e schermo.

Verificato dopo il fix: pagina, iframe di Turnstile e service worker riportano tutti `Linux · Chrome 154 · Europe/London · en-GB (Intl en-GB) · WebGL`; il widget resta stabile in attesa del click invece di ciclare.

**Nello stesso intervento:**
- **Crash dell'orchestratore dal relay proxy.** Il socket del browser restava senza gestore d'errore mentre il relay attendeva il SOCKS a monte (fino a 15 s): un `ECONNRESET` (tab chiusa, richiesta annullata) era un'eccezione non gestita che abbatteva l'orchestratore e **tutte** le stanze. Ora ogni socket tracciato ha un gestore; `proxy-relay.test.mjs` riproduce il caso (fallisce sulla versione precedente).
- **La misura dell'uscita del browser falliva su molti siti.** Il fetch in mondo isolato è bloccato dalla CSP di Stripchat (e lo è anche `Network.loadNetworkResource`), e il suo service worker intercetta le richieste. Ora la sonda gira in una pagina `about:blank` di un **contesto browser temporaneo** (`RoomSession.evalDetached`): stesso proxy, nessuna CSP, invisibile al viewer, chiuso subito dopo.
- `brunhild.challenges.cloudflare.com` ha solo record AAAA (IPv6) e i proxy Decodo escono in IPv4, quindi quel CONNECT fallisce sempre (codice SOCKS 4). Con buona probabilità è una sonda IPv6 che fallisce anche agli utenti reali senza IPv6 (dopo il fix il widget non cicla più nonostante questi fallimenti): da tenere d'occhio, non una causa accertata di blocco.

### Fluidità del viewer e click persi (2026-09-28)

Sintomo: viewer poco fluido, click che "non fanno nulla". Misure (Wikipedia, scroll continuo):

| | Prima | Dopo |
|---|---|---|
| fps sul VPS | 12 | 28 |
| latenza input→frame sul VPS | 70-130 ms | 50-80 ms |
| fps dal PC dell'operatore | 12 | 17,6 |
| latenza dal PC | 190-517 ms | 160-175 ms |
| frame in coda dopo la fine dell'input | fino a 1,8 s | ~0,1 s |
| CPU della stanza su pagina animata | ~330% | ~40% |

Cause e correzioni:
1. **Compositing in 3D software.** Con `--use-angle=swiftshader` (introdotto per avere WebGL) anche la composizione della pagina passava da SwiftShader: ~15 fps a 330% di CPU, qualunque fossero qualità e dimensione dello screencast. `--disable-gpu-compositing` lascia SwiftShader solo a WebGL (renderer invariato, WebGL e WebGL2 verificati): ~30 fps a 40%.
2. **Input accodato senza limite.** Ogni `Input.dispatchMouseEvent` viene eseguito in serie dal renderer; 30 movimenti/s su un renderer più lento facevano crescere la coda e il click arrivava secondi dopo. `input-queue.mjs`: movimenti consecutivi fusi nell'ultimo, rotella sommata, click/tasti mai fusi e sempre in ordine.
3. **Click senza hover.** Il viewer scarta parte dei movimenti, quindi il click poteva cadere in un punto mai "raggiunto" dal mouse: i controlli basati su `pointerenter` lo ignoravano. Il server porta il puntatore sul punto prima di premere. Il viewer inoltre invia sempre l'ultimo movimento della finestra di throttle.
4. **Rilascio perso fuori dal riquadro.** Senza pointer capture il `mouseup` fuori dal canvas non partiva e il browser restava col tasto giù; il click successivo diventava un trascinamento. Ora `setPointerCapture`, e il server tiene lo stato dei tasti (`buttons` nei movimenti, quindi anche i trascinamenti funzionano).
5. **Frame senza controllo di flusso.** L'ack allo screencast partiva subito e i frame si accodavano sul WebSocket fino a 2 MB: lo schermo arrivava in ritardo e si cliccava dove un bottone *era*. Ora il viewer conferma ogni frame (`frameAck`) e il browser riceve l'ack solo quando ogni viewer ha meno di 2 frame in viaggio (tetto di 500 ms per un viewer bloccato); i viewer vecchi senza ack restano col limite sul buffer, abbassato a 512 KB.

Verifica funzionale: 40 click rapidi su 4 bottoni, ognuno preceduto da 8 movimenti casuali, tutti ricevuti sul bottone giusto e tutti dopo il `pointerenter`.

### Popup bloccati su about:blank (2026-09-28)

Sintomo: "Accedi con Google" su Stripchat blocca tutto. Il popup `googleApiPopup` si apriva ma restava su `about:blank` (cronologia con la sola voce vuota), e il viewer, che passa alla pagina più recente, mostrava quella finestra ferma.

Causa: con `Target.setAutoAttach` a livello browser, Chromium 154 tiene in pausa le finestre aperte dalla pagina finché il client non invia `Runtime.runIfWaitingForDebugger`, **anche se l'evento `attachedToTarget` riporta `waitingForDebugger: false`**. `RoomSession` non lo inviava mai. Riprodotto in un container pulito: senza sessione i 4 modi di aprire un popup (`window.open(url)`, `window.open('')` + `location`, form con `target`, `<a target>`) funzionano; con la sessione restano tutti vuoti; con lo sblocco tornano a funzionare. Scartate prima le ipotesi "finestra opener nascosta dal popup" (il popup resta vuoto anche con l'opener visibile) e "gara su Fetch" (spenta quando c'è il relay).

Correzione: ogni target agganciato viene sbloccato; le pagine **dopo** il setup (auth proxy e monitoraggio attivi prima della prima richiesta). Alla chiusura di un popup il viewer torna alla pagina che l'ha aperto. Nello stesso giro, in `#enableProxyAuth` i listener sono registrati prima di `Fetch.enable`: prima un evento `requestPaused` arrivato nel mezzo lasciava la richiesta sospesa per sempre (solo proxy HTTP con password).

Verificato: click reale su "Accedi con Google" di Stripchat → popup su `stripchat.com/googleAuthorization.html` → `accounts.google.com/v3/signin/identifier` in ~1 s.

### Click sfasati con la pagina zoomata (2026-09-29)

Sintomo: nella Room 1 il "Log In" di Stripchat non si poteva cliccare. Causa: nel profilo della stanza c'era uno zoom del 150% salvato per `stripchat.com` (`partition.per_host_zoom_levels`, `zoom_level 2.22`), con buona probabilità da un Ctrl+rotella o da un pizzico sul touchpad, che il viewer inoltra come Ctrl+rotella. Lo screencast riporta le dimensioni in **pixel del frame** (`deviceWidth` 1919), mentre `Input.dispatchMouseEvent` vuole **pixel CSS** (1279 a quello zoom): ogni click finiva moltiplicato per 1,5, e il Log In in alto a destra cadeva fuori dalla pagina. In un banco di prova al 150% la versione vecchia riceveva solo il click in alto a sinistra su 4 bottoni; la nuova tutti e 4.

Correzione: `RoomSession` legge lo zoom della pagina (`Page.getLayoutMetrics`: `layoutViewport` / `cssLayoutViewport`) e riporta le coordinate normalizzate del viewer sull'area CSS. Lo zoom si rilegge quando cambia la geometria del frame, dopo ogni input con Ctrl, al cambio di tab e comunque ogni 2 s. Lo zoom salvato della Room 1 è stato azzerato (copia del file in `Preferences.bak-zoom`). Verificato sulla stanza: click su "Log In" dal viewer → si apre il modulo di accesso.

### Copia e incolla (2026-09-29)

Sintomo: impossibile copiare o incollare testo nel browser della stanza. Cause:
- **Incolla**: il viewer faceva `preventDefault` su ogni tasto, Ctrl+V compreso, quindi il browser dell'operatore non generava mai l'evento `paste`; il Ctrl+V arrivava al browser remoto, che incollava i propri appunti (vuoti).
- **Copia**: il Ctrl+C riempiva gli appunti X del container e niente li riportava all'operatore.

Soluzione (`clipboard.mjs`, `xclip` nell'immagine): gli appunti del browser remoto sono la selezione CLIPBOARD di X sul display Xvfb, letta e scritta con `docker exec … xclip`. Incolla: il viewer lascia passare Ctrl+V (Cmd+V su Mac) al browser locale e invia `{type:'paste', text}`; il server scrive gli appunti remoti e preme Ctrl+V nella pagina, quindi il sito riceve un incolla **nativo**, evento `paste` incluso (fallback: `Input.insertText`). Copia: dopo Ctrl+C/Ctrl+X il server rilegge gli appunti e manda `{type:'clipboard', text}` **solo** al viewer che ha premuto il tasto, che li scrive in quelli dell'operatore (`navigator.clipboard.writeText`, dentro la finestra di attivazione utente). Nessun codice eseguito nella pagina, quindi funziona anche in iframe e campi di input. Su Mac Cmd+tasto viene tradotto in Ctrl, perché il browser remoto è Linux.

Trappola: `xclip -i` resta in background a possedere la selezione (modello X) ed eredita stdout/stderr; con i canali collegati `docker exec` aspettava ~2,1 s per ogni incolla. Con output rediretto a `/dev/null`: ~90 ms.

Verificato via viewer: incolla in un campo in 122 ms, con evento `paste` ricevuto dalla pagina; Ctrl+A e Ctrl+C in una textarea riportano al viewer il testo esatto (accenti ed emoji inclusi).

### Anteprima della sorgente reale

`GET /browser-farm/rooms/:id/source-frame` restituisce un fotogramma JPEG catturato dalla webcam virtuale della stanza: è **esattamente** ciò che il sito riceve, scritte, filtri e specchio compresi. La Console lo mostra nella card della stanza ("Sorgente inviata al sito"), aggiornandolo ogni 2 s solo quando il pannello è aperto.

Esiste perché la self-view dei siti è ribaltata (vedi sopra) e quindi inservibile per verificare il risultato. È uno snapshot, non un flusso: basta a controllare la composizione e non aggiunge carico al percorso della diretta.

### Aggiornamenti senza stacco

- **Testo**: `drawtext` usa `textfile=` con `reload=1`, quindi FFmpeg rilegge il file a ogni frame. Cambiare una scritta riscrive il file (rename atomico) e **non riavvia niente**: chi guarda non vede alcuna interruzione. `sceneShapeKey()` distingue "è cambiato solo il contenuto" da "è cambiata la forma del filtergraph" (filtri, posizioni, stili, numero di overlay), che invece richiede il riavvio.
- **Riavvio con passaggio di consegne**: quando il filtergraph cambia davvero (specchio, filtri), il nuovo FFmpeg apre il device *prima* che il vecchio venga chiuso. Senza questa sovrapposizione v4l2loopback resterebbe un istante senza writer, azzererebbe il formato (0.12.x non ha `keep_format`) e il consumer già collegato — il browser della stanza, quindi il sito — si fermerebbe sull'ultimo frame.

### Trasporto verso il device

I frame passano a FFmpeg in **I420** (lo stesso formato del decoder): niente conversione a RGBA, che costava una trasformazione per frame e triplicava i byte nel pipe (~27 MB/s contro ~10 MB/s a 360p30). Quando il pipe è pieno i frame nuovi vengono **scartati**, non accodati: in una diretta conta solo l'ultimo frame, e accodare farebbe crescere il ritardo a ogni secondo. `GET /health` e il log per stanza (`ingestor-<roomId>.log`) riportano fps e frame scartati.

**Verificato il 2026-09-04** con sorgente di test (`lk --publish-demo`): ingresso I420 1280x720, 30 fps, 0 frame scartati; scritta e filtri comparsi nel frame catturato da `/dev/video10`; con lo specchio attivo l'immagine è ribaltata ma il testo resta leggibile.

## Smoke test (VPS, 2026-06-12; riverificato 2026-09-03)

Stanza avviata senza sorgente: fingerprint visto dalla pagina = `Win32 / it-IT / ["it-IT","it","en"] / Europe/Rome / webdriver=false / 8 core / UA Chrome-Windows`; `enumerateDevices` → `videoinput: HD Webcam C920`; `getUserMedia(video+audio)` → track `1280x720@30`; viewer WS: meta+tab, navigazione, 6 frame JPEG (ffd8) ricevuti.

**2026-09-03** — la farm era ferma da un aggiornamento di kernel (`linux-modules-extra` mancante → niente `videodev` → `v4l2loopback` non caricabile, `/dev/video*` assenti): ogni avvio falliva con lo stderr di ffmpeg riversato in Console. Ripristinata (moduli + persistenza + udev), riverificata end-to-end via API pubblica: stanza creata → `RUNNING` → `videoinput: HD Webcam C920` in Chromium → fermata → eliminata.

## Consequences

### Positive
- Zero dipendenze da progetti esterni per il display remoto; protocollo viewer sotto il nostro controllo (estendibile: clipboard, file upload, audio).
- Identità per-stanza stabili e persistenti (requisito anti-link di ADR-0010/Scenario B) con UX semplice (stanze nominate).
- Meno superficie: una porta sola (7090) per control+viewer; niente porte Neko 8110-8217.

### Negative / Rischi
- Viewer JPEG-su-WS: più banda/latenza di WebRTC (Neko) a parità di fps; accettabile per supervisione operatore, da rivalutare se serve 30fps fluidi.
- Fingerprint a livello CDP: meno profondo di Camoufox (canvas/WebGL/JA3 restano honest-Linux-Chromium). Il percorso engine anti-detect pluggable di ADR-0010 resta aperto (eventuale ADR futuro).
- Gli override CDP vivono nella sessione DevTools dell'orchestratore: se il processo farm si riavvia, le stanze vengono fermate (bootstrap rimuove i container orfani) e vanno riavviate dalla Console.

## Riferimenti

ADR-0009 (superseded), ADR-0010 (scope/compliance, resta Accepted), `tools/browser-farm/` (data-plane + README), `apps/api/src/modules/browser-farm/` (control-plane), `apps/console/src/components/BrowserRoomViewer.tsx` (viewer).
