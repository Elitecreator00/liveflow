// RoomSession — runtime CDP di UNA stanza (ADR-0011).
// Pilota il Chromium del container: gestisce le tab, l'auth del proxy,
// fa partire lo screencast (frame JPEG) e smista l'input dell'operatore.
// Display remoto 100% in-house: nessun Neko/VNC/servizio esterno.
import { connectCdp } from './cdp.mjs';
import { applyRequest, expireIfIdle } from './captcha-watch.mjs';
import { createInputPump } from './input-queue.mjs';
import { isCopyShortcut } from './clipboard.mjs';

// Bitmask modifier CDP: Alt=1, Ctrl=2, Meta=4, Shift=8 (già così dal viewer).
const BUTTON_MASK = { left: 1, right: 2, middle: 4 };

// Frame in viaggio verso un viewer prima che il browser ne produca altri.
// Con 2 la latenza resta ~1 RTT e il flusso non si ferma fra un ack e l'altro.
const MAX_FRAMES_IN_FLIGHT = 2;
// Oltre questa attesa si riprende comunque (viewer bloccato o tab nascosta).
const ACK_TIMEOUT_MS = 500;

// Home page della stanza (prima pagina + nuove tab).
const HOME_URL = 'https://www.google.com/';

export class RoomSession {
  /**
   * @param {number} cdpPort  porta DevTools (host) del container della stanza
   * @param {{username:string,password:string}|null} proxyAuth credenziali proxy
   * @param {{read():Promise<string>, write(t:string):Promise<void>}|null} clipboard
   *        appunti del container (clipboard.mjs); null = incolla via insertText
   */
  constructor(cdpPort, proxyAuth, clipboard = null) {
    this.cdpPort = cdpPort;
    this.clipboard = clipboard;
    this.proxyAuth = proxyAuth;
    this.cdp = null;
    this.targets = new Map(); // targetId -> {sessionId, url, title}
    this.activeId = null;     // targetId con lo screencast attivo
    this.viewers = new Set(); // WebSocket degli operatori collegati
    // Area della pagina in PIXEL CSS (le coordinate che vuole Input.dispatch*).
    this.screen = { width: 1280, height: 720 };
    // Pixel del frame (metadata dello screencast) e zoom della pagina: con uno
    // zoom ≠ 100% i due differiscono (150% → 1919 px di frame, 1279 CSS).
    this.device = { width: 1280, height: 720 };
    this.zoom = 1;
    this.zoomCheckedAt = 0;
    this.zoomChecking = false;
    this.lastClick = { x: 0, y: 0, t: 0, count: 1 };
    // Stato del mouse remoto: ultima posizione inviata e tasti premuti (bitmask
    // CDP), per i trascinamenti e per portare il puntatore sul punto del click.
    this.pointer = { x: -1, y: -1, buttons: 0 };
    // Input serializzato con fusione dei movimenti (vedi input-queue.mjs).
    this.input = createInputPump((msg) => this.#handleInput(msg));
    // Controllo di flusso dello screencast: il browser produce il frame
    // successivo solo dopo l'ack, che diamo quando i viewer hanno smaltito.
    this.pendingAck = null;   // {frameSession, cdpSession} in attesa di ack
    this.ackTimer = null;
    this.cursorAt = 0;        // ultimo probe cursore (throttle)
    this.cursorCss = '';      // ultimo cursore inviato al viewer
    this.cursorLast = null;   // ultima posizione {x,y,sid} per il probe trailing
    this.cursorTimer = null;  // probe trailing programmato (mouse fermo su link)
    this.metaTimer = null;
    this.homeNavigated = false; // prima pagina già portata sulla home?
    this.probeContexts = new Set(); // contesti di diagnostica (evalDetached)
    // Sfida anti-bot in corso: { type, since, lastSeen } oppure null. La
    // completa l'operatore dal viewer, qui si osserva soltanto.
    this.captcha = null;
    this.captchaExpiry = setInterval(() => {
      const next = expireIfIdle(this.captcha);
      if (next !== this.captcha) this.#setCaptcha(next);
    }, 5000);
    this.captchaExpiry.unref?.();
  }

  async init() {
    this.cdp = await connectCdp(this.cdpPort);

    this.cdp.on('Network.requestWillBeSent', ({ params }) => {
      const next = applyRequest(this.captcha, params?.request?.url);
      if (next !== this.captcha) this.#setCaptcha(next);
    });
    this.cdp.on('Target.attachedToTarget', ({ params }) => {
      void this.#onAttached(params);
    });
    this.cdp.on('Target.detachedFromTarget', ({ params }) => {
      for (const [tid, t] of this.targets) {
        if (t.sessionId === params.sessionId) {
          this.targets.delete(tid);
          if (this.activeId === tid) {
            this.activeId = null;
            // Popup chiuso (es. login Google completato): torna alla pagina
            // che l'ha aperto, non a una tab qualsiasi.
            if (t.openerId && this.targets.has(t.openerId)) {
              void this.#activate(t.openerId).catch(() => undefined);
            } else {
              void this.#activateAny();
            }
          }
        }
      }
      this.#scheduleMeta();
    });
    this.cdp.on('Target.targetInfoChanged', ({ params }) => {
      const t = this.targets.get(params.targetInfo.targetId);
      if (t) {
        t.url = params.targetInfo.url;
        t.title = params.targetInfo.title;
        this.#scheduleMeta();
      }
    });
    this.cdp.on('Page.screencastFrame', ({ params, sessionId }) => {
      void this.#onFrame(params, sessionId);
    });
    this.cdp.on('__closed__', () => this.#broadcastJson({ type: 'meta', url: '', title: 'Browser terminato', tabs: [] }));

    // Auto-attach flat a tutte le pagine presenti e future (popup inclusi).
    await this.cdp.send('Target.setDiscoverTargets', { discover: true });
    await this.cdp.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });

    // Se non esiste nessuna pagina (avvio a freddo), creane una sulla home.
    await new Promise((r) => setTimeout(r, 300));
    if (this.targets.size === 0) {
      await this.cdp.send('Target.createTarget', { url: HOME_URL });
      this.homeNavigated = true;
    }
  }

  // ── Setup per-pagina ────────────────────────────────────────────────────────

  /**
   * Sblocca un target appena agganciato. Con l'auto-attach a livello browser,
   * Chromium (verificato su 154) tiene in pausa le finestre aperte dalla
   * pagina finché il client non lo chiede, ANCHE quando l'evento dichiara
   * waitingForDebugger: false. Senza questo ogni popup — "Accedi con Google",
   * Apple, pagamenti — restava su about:blank per sempre, e il viewer mostrava
   * quella finestra vuota: sembrava tutto bloccato.
   */
  #release(sessionId) {
    this.cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined);
  }

  async #onAttached({ sessionId, targetInfo }) {
    if (targetInfo.type !== 'page') {
      this.#release(sessionId); // iframe fuori processo, worker, UI del browser
      return;
    }
    // Pagine di diagnostica (evalDetached): mai nel viewer né fra le tab.
    if (this.probeContexts.has(targetInfo.browserContextId)) {
      this.#release(sessionId);
      return;
    }
    const targetId = targetInfo.targetId;
    this.targets.set(targetId, {
      sessionId,
      url: targetInfo.url,
      title: targetInfo.title,
      // Chi l'ha aperta: alla chiusura di un popup si torna lì.
      openerId: targetInfo.openerId ?? null,
    });

    // Niente override Emulation.* (UA, fuso, lingua, core): valevano solo per
    // la sessione della pagina, mentre iframe fuori processo e worker vedevano
    // il browser vero — un'identità doppia che le verifiche anti-bot rifiutano
    // anche quando le completa una persona. L'identità della stanza è nativa:
    // TZ del container, lingua nelle preferenze del profilo, schermo Xvfb
    // (orchestrator.mjs + browser-prefs.mjs).
    try {
      await this.cdp.send('Page.enable', {}, sessionId);
      // Network serve solo a riconoscere le sfide anti-bot dal traffico, senza
      // eseguire codice nella pagina (vedi captcha-watch.mjs).
      await this.cdp.send('Network.enable', {}, sessionId).catch(() => undefined);
      if (this.proxyAuth) await this.#enableProxyAuth(sessionId);
      // Prima pagina (about:blank dall'avvio container) → home Google, ma solo
      // DOPO aver agganciato l'auth proxy, così la prima
      // richiesta passa già dal proxy autenticato (niente errore al primo load).
      if (!this.homeNavigated && (!targetInfo.url || targetInfo.url === 'about:blank')) {
        this.homeNavigated = true;
        await this.cdp.send('Page.navigate', { url: HOME_URL }, sessionId).catch(() => undefined);
      }
    } catch (e) {
      console.error(`room :${this.cdpPort} setup target failed:`, e.message);
    } finally {
      // Solo DOPO il setup: la prima richiesta del popup parte già con auth
      // proxy e monitoraggio attivi.
      this.#release(sessionId);
    }

    // La pagina più recente (popup di login ecc.) prende il focus del viewer.
    await this.#activate(targetId).catch(() => undefined);
    this.#scheduleMeta();
  }

  /** Proxy con credenziali: Chromium non le accetta in --proxy-server, quindi
   *  rispondiamo noi alla challenge via Fetch.authRequired. */
  async #enableProxyAuth(sessionId) {
    // I listener vanno registrati PRIMA di Fetch.enable: una richiesta già in
    // volo (la prima navigazione di un popup) può essere sospesa subito, e un
    // evento arrivato prima del listener la lascerebbe ferma per sempre.
    const offPaused = this.cdp.on('Fetch.requestPaused', ({ params, sessionId: sid }) => {
      if (sid !== sessionId) return;
      this.cdp.send('Fetch.continueRequest', { requestId: params.requestId }, sid)
        .catch(() => undefined);
    });
    const offAuth = this.cdp.on('Fetch.authRequired', ({ params, sessionId: sid }) => {
      if (sid !== sessionId) return;
      const isProxy = params.authChallenge?.source === 'Proxy';
      this.cdp.send('Fetch.continueWithAuth', {
        requestId: params.requestId,
        authChallengeResponse: isProxy
          ? {
              response: 'ProvideCredentials',
              username: this.proxyAuth.username,
              password: this.proxyAuth.password,
            }
          : { response: 'Default' },
      }, sid).catch(() => undefined);
    });
    await this.cdp.send('Fetch.enable', {
      handleAuthRequests: true,
      patterns: [{ urlPattern: '*' }],
    }, sessionId);
    return () => { offPaused(); offAuth(); };
  }

  // ── Screencast / tab attiva ────────────────────────────────────────────────

  async #activate(targetId) {
    const target = this.targets.get(targetId);
    if (!target) return;
    const prev = this.activeId ? this.targets.get(this.activeId) : null;
    this.activeId = targetId;
    this.cursorCss = ''; // tab cambiata: forza un re-invio del cursore
    this.pointer = { x: -1, y: -1, buttons: 0 }; // nuova pagina: nessun tasto giù
    this.zoomCheckedAt = 0; // lo zoom è per sito: rileggerlo sulla nuova tab
    // Conteggi da zero sulla nuova tab; l'ack in sospeso si conferma subito,
    // così nessuno screencast resta fermo ad aspettarlo.
    for (const ws of this.viewers) ws.lfInFlight = 0;
    this.#maybeAck(true);
    if (this.cursorTimer) { clearTimeout(this.cursorTimer); this.cursorTimer = null; }
    this.cursorLast = null;

    if (prev && prev !== target) {
      await this.cdp.send('Page.stopScreencast', {}, prev.sessionId).catch(() => undefined);
    }
    await this.cdp.send('Target.activateTarget', { targetId }).catch(() => undefined);
    if (this.viewers.size > 0) await this.#startScreencast(target);
    this.#scheduleMeta();
  }

  async #activateAny() {
    const first = [...this.targets.keys()][0];
    if (first) await this.#activate(first).catch(() => undefined);
  }

  async #startScreencast(target) {
    const params = {
      format: 'jpeg',
      quality: 60,
      maxWidth: 1280,
      maxHeight: 720,
      everyNthFrame: 1,
    };
    try {
      await this.cdp.send('Page.startScreencast', params, target.sessionId);
    } catch (e) {
      // Subito dopo un target-swap la pagina può non essere ancora pronta
      // ("Not attached to an active page"): un retry breve la riprende.
      await new Promise((r) => setTimeout(r, 400));
      if (this.activeId && this.targets.get(this.activeId) === target) {
        await this.cdp
          .send('Page.startScreencast', params, target.sessionId)
          .catch((e2) => console.error(`room :${this.cdpPort} startScreencast:`, e2.message));
      }
    }
  }

  /**
   * Frame dello screencast → viewer, con controllo di flusso.
   *
   * Prima l'ack al browser partiva subito e i frame si accodavano sul
   * WebSocket fino a 2 MB: con la banda dell'operatore più stretta del flusso
   * (~30 fps × 50-250 KB) lo schermo arrivava con secondi di ritardo, e si
   * cliccava dove un bottone ERA. Ora il viewer conferma ogni frame disegnato
   * e il browser riceve l'ack solo quando ogni viewer ne ha meno di
   * MAX_FRAMES_IN_FLIGHT in viaggio: il frame rate si adatta alla rete e
   * l'immagine resta al massimo ~1 RTT indietro.
   */
  #onFrame(params, sessionId) {
    const active = this.activeId ? this.targets.get(this.activeId) : null;
    if (!active || active.sessionId !== sessionId) {
      // Frame di una tab non più attiva: ack e basta.
      this.cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }, sessionId)
        .catch(() => undefined);
      return;
    }
    const meta = params.metadata ?? {};
    if (meta.deviceWidth && meta.deviceHeight) {
      const changed =
        meta.deviceWidth !== this.device.width || meta.deviceHeight !== this.device.height;
      this.device = { width: meta.deviceWidth, height: meta.deviceHeight };
      this.#updateScreen();
      // Lo zoom si rilegge quando cambia la geometria del frame e comunque
      // ogni 2 s (Ctrl+rotella, Ctrl+0 o un sito che cambia zoom non la toccano).
      if (changed || Date.now() - this.zoomCheckedAt > 2000) void this.#checkZoom(sessionId);
    }
    const buf = Buffer.from(params.data, 'base64');
    for (const ws of this.viewers) {
      if (ws.readyState !== ws.OPEN) continue;
      // Viewer che non conferma i frame (Console non ancora ricaricata): solo
      // il vecchio limite sul buffer, abbassato.
      if (!ws.lfAcks && ws.bufferedAmount > 512_000) continue;
      if (ws.lfAcks && ws.lfInFlight >= MAX_FRAMES_IN_FLIGHT) continue;
      ws.lfInFlight = (ws.lfInFlight ?? 0) + 1;
      ws.send(buf);
    }
    this.pendingAck = { frameSession: params.sessionId, cdpSession: sessionId };
    this.#maybeAck();
  }

  #updateScreen() {
    this.screen = {
      width: this.device.width / this.zoom,
      height: this.device.height / this.zoom,
    };
  }

  /**
   * Zoom della pagina = pixel del viewport / pixel CSS del viewport.
   *
   * Lo screencast riporta le dimensioni in pixel del frame, mentre i click vanno
   * dati in pixel CSS. Finché lo zoom è 100% coincidono; con la pagina al 150%
   * (salvato nel profilo per sito, basta un Ctrl+rotella o un pizzico sul
   * touchpad) ogni click finiva 1,5 volte più in là: il "Log In" di Stripchat,
   * in alto a destra, cadeva fuori dalla pagina.
   */
  async #checkZoom(sid) {
    if (this.zoomChecking) return;
    this.zoomChecking = true;
    this.zoomCheckedAt = Date.now();
    try {
      const m = await this.cdp.send('Page.getLayoutMetrics', {}, sid);
      const dev = m?.layoutViewport?.clientWidth;
      const css = m?.cssLayoutViewport?.clientWidth;
      const active = this.activeId ? this.targets.get(this.activeId) : null;
      if (dev > 0 && css > 0 && active?.sessionId === sid) {
        const zoom = Math.round((dev / css) * 1000) / 1000;
        if (Math.abs(zoom - this.zoom) > 0.01) {
          this.zoom = zoom;
          this.#updateScreen();
        }
      }
    } catch {
      /* pagina in navigazione: si riprova al prossimo frame */
    } finally {
      this.zoomChecking = false;
    }
  }

  /** Ack al browser se nessun viewer è saturo; altrimenti attende (con tetto). */
  #maybeAck(force = false) {
    if (!this.pendingAck) return;
    const saturated = [...this.viewers].some(
      (ws) => ws.readyState === ws.OPEN && ws.lfAcks && ws.lfInFlight >= MAX_FRAMES_IN_FLIGHT,
    );
    if (saturated && !force) {
      if (!this.ackTimer) {
        this.ackTimer = setTimeout(() => {
          this.ackTimer = null;
          // Un viewer bloccato non deve congelare gli altri: si riparte da zero.
          for (const ws of this.viewers) ws.lfInFlight = 0;
          this.#maybeAck(true);
        }, ACK_TIMEOUT_MS);
      }
      return;
    }
    if (this.ackTimer) { clearTimeout(this.ackTimer); this.ackTimer = null; }
    const { frameSession, cdpSession } = this.pendingAck;
    this.pendingAck = null;
    this.cdp.send('Page.screencastFrameAck', { sessionId: frameSession }, cdpSession)
      .catch(() => undefined);
  }

  // ── Viewer (operatore) ─────────────────────────────────────────────────────

  async addViewer(ws) {
    this.viewers.add(ws);
    ws.on('close', () => void this.removeViewer(ws));
    ws.lfInFlight = 0;
    ws.lfAcks = false;
    ws.on('message', (data) => this.#onViewerMessage(ws, data));
    this.#sendMeta(ws);
    const active = this.activeId ? this.targets.get(this.activeId) : null;
    if (active && this.viewers.size >= 1) await this.#startScreencast(active);
  }

  async removeViewer(ws) {
    this.viewers.delete(ws);
    this.#maybeAck(); // un viewer saturo che se ne va non deve bloccare gli altri
    // Nessun operatore collegato → stop screencast (il browser continua a girare).
    if (this.viewers.size === 0 && this.activeId) {
      const active = this.targets.get(this.activeId);
      if (active) {
        await this.cdp.send('Page.stopScreencast', {}, active.sessionId).catch(() => undefined);
      }
    }
  }

  #scheduleMeta() {
    if (this.metaTimer) return;
    this.metaTimer = setTimeout(() => {
      this.metaTimer = null;
      this.#broadcastJson(this.#metaPayload());
    }, 150);
  }

  #metaPayload() {
    const active = this.activeId ? this.targets.get(this.activeId) : null;
    return {
      type: 'meta',
      url: active?.url ?? '',
      title: active?.title ?? '',
      tabs: [...this.targets.entries()].map(([id, t]) => ({
        id,
        title: t.title,
        url: t.url,
        active: id === this.activeId,
      })),
    };
  }

  #sendMeta(ws) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(this.#metaPayload()));
  }

  #broadcastJson(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.viewers) {
      if (ws.readyState === ws.OPEN) ws.send(s);
    }
  }

  // ── Input dell'operatore ───────────────────────────────────────────────────

  #onViewerMessage(ws, data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.type === 'frameAck') {
      ws.lfAcks = true;
      ws.lfInFlight = Math.max(0, (ws.lfInFlight ?? 0) - 1);
      this.#maybeAck();
      return;
    }
    // Il viewer che ha premuto Ctrl+C riceve il testo copiato (e solo lui:
    // non si scrivono gli appunti degli altri operatori collegati).
    Object.defineProperty(msg, 'origin', { value: ws, enumerable: false });
    this.input.push(msg);
  }

  async #handleInput(msg) {
    const active = this.activeId ? this.targets.get(this.activeId) : null;
    if (!active) return;
    const sid = active.sessionId;
    // Ctrl+rotella / Ctrl+più/meno/0 cambiano lo zoom: rileggerlo al prossimo frame.
    if (((msg.modifiers ?? 0) & 2) !== 0) this.zoomCheckedAt = 0;

    try {
      switch (msg.type) {
        case 'mouse':
          await this.#mouse(msg, sid);
          break;
        case 'key': {
          const type = msg.kind === 'up' ? 'keyUp' : msg.text ? 'keyDown' : 'rawKeyDown';
          await this.cdp.send('Input.dispatchKeyEvent', {
            type,
            key: msg.key,
            code: msg.code,
            windowsVirtualKeyCode: msg.keyCode || 0,
            nativeVirtualKeyCode: msg.keyCode || 0,
            text: msg.text,
            unmodifiedText: msg.text,
            modifiers: msg.modifiers || 0,
          }, sid);
          if (isCopyShortcut(msg)) void this.#sendCopied(msg.origin);
          break;
        }
        case 'text':
          await this.cdp.send('Input.insertText', { text: String(msg.text ?? '') }, sid);
          break;
        case 'paste':
          await this.#paste(String(msg.text ?? ''), sid);
          break;
        case 'navigate':
          await this.cdp.send('Page.navigate', { url: String(msg.url ?? 'about:blank') }, sid);
          break;
        case 'reload':
          await this.cdp.send('Page.reload', {}, sid);
          break;
        case 'history': {
          const { currentIndex, entries } = await this.cdp.send('Page.getNavigationHistory', {}, sid);
          const idx = msg.dir === 'back' ? currentIndex - 1 : currentIndex + 1;
          if (entries[idx]) {
            await this.cdp.send('Page.navigateToHistoryEntry', { entryId: entries[idx].id }, sid);
          }
          break;
        }
        case 'tab':
          if (msg.action === 'new') {
            await this.cdp.send('Target.createTarget', { url: HOME_URL });
          } else if (msg.action === 'activate' && this.targets.has(msg.id)) {
            await this.#activate(msg.id);
          } else if (msg.action === 'close' && this.targets.has(msg.id)) {
            await this.cdp.send('Target.closeTarget', { targetId: msg.id });
          }
          break;
        default:
          break;
      }
    } catch (e) {
      console.error(`room :${this.cdpPort} input ${msg.type}:`, e.message);
    }
  }

  /**
   * Incolla il testo dell'operatore come un incolla nativo: appunti remoti +
   * Ctrl+V nella pagina (il sito riceve l'evento paste). Se gli appunti del
   * container non sono disponibili, ripiega sull'inserimento diretto.
   */
  async #paste(text, sid) {
    if (!text) return;
    if (this.clipboard) {
      try {
        await this.clipboard.write(text);
        for (const type of ['rawKeyDown', 'keyUp']) {
          await this.cdp.send('Input.dispatchKeyEvent', {
            type, key: 'v', code: 'KeyV',
            windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86,
            modifiers: 2, // Ctrl: il browser remoto è Linux
          }, sid);
        }
        return;
      } catch (e) {
        console.error(`room :${this.cdpPort} incolla via appunti fallito:`, e.message);
      }
    }
    await this.cdp.send('Input.insertText', { text }, sid);
  }

  /** Dopo Ctrl+C/Ctrl+X: rilegge gli appunti remoti e li manda al viewer. */
  async #sendCopied(ws) {
    if (!this.clipboard || !ws) return;
    // Il comando copia della pagina è sincrono al tasto, ma lasciamo un attimo
    // a eventuali handler JS del sito che riscrivono gli appunti.
    await new Promise((r) => setTimeout(r, 120));
    try {
      const text = await this.clipboard.read();
      if (text && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'clipboard', text }));
    } catch (e) {
      console.error(`room :${this.cdpPort} lettura appunti fallita:`, e.message);
    }
  }

  async #mouse(msg, sid) {
    const x = Math.round((msg.nx ?? 0) * this.screen.width);
    const y = Math.round((msg.ny ?? 0) * this.screen.height);

    if (msg.kind === 'wheel') {
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x, y,
        deltaX: msg.deltaX ?? 0,
        deltaY: msg.deltaY ?? 0,
        modifiers: msg.modifiers || 0,
      }, sid);
      return;
    }

    // Riflette la forma del cursore (manina su link, I-beam su testo, …) che lo
    // screencast NON trasmette: il viewer vede solo i pixel della pagina, non il
    // cursore dell'OS. Probiamo l'elemento sotto il puntatore e mandiamo la sua
    // cursor CSS al viewer. Throttle + niente Runtime.enable (che è un tell CDP
    // per gli antibot): Runtime.evaluate "una tantum" è molto meno rilevabile.
    if (msg.kind === 'move') void this.#probeCursor(x, y, sid);

    // Doppio click: due down ravvicinati (<350ms, <6px) → clickCount 2.
    let clickCount = 1;
    if (msg.kind === 'down') {
      const now = Date.now();
      const near =
        Math.abs(x - this.lastClick.x) < 6 && Math.abs(y - this.lastClick.y) < 6;
      clickCount = now - this.lastClick.t < 350 && near ? this.lastClick.count + 1 : 1;
      this.lastClick = { x, y, t: now, count: clickCount };
    } else if (msg.kind === 'up') {
      clickCount = this.lastClick.count;
    }

    const mask = BUTTON_MASK[msg.button] ?? 1;
    const modifiers = msg.modifiers || 0;

    // Il viewer scarta parte dei movimenti (e la coda li fonde): senza questo
    // il click arrivava in un punto dove la pagina non aveva mai "visto"
    // arrivare il mouse, e i controlli che reagiscono all'hover (menu, bottoni
    // con pointerenter) lo ignoravano. Prima si porta il puntatore lì.
    if (msg.kind !== 'move' && (x !== this.pointer.x || y !== this.pointer.y)) {
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y, button: 'none', buttons: this.pointer.buttons, modifiers,
      }, sid);
      this.pointer.x = x;
      this.pointer.y = y;
    }

    if (msg.kind === 'move') {
      // Con un tasto premuto il movimento è un trascinamento (selezione testo,
      // slider): il browser deve sapere quale tasto è giù.
      const held = Object.keys(BUTTON_MASK).find((b) => this.pointer.buttons & BUTTON_MASK[b]);
      await this.cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x, y,
        button: held ?? 'none',
        buttons: this.pointer.buttons,
        modifiers,
      }, sid);
      this.pointer.x = x;
      this.pointer.y = y;
      return;
    }

    if (msg.kind === 'down') this.pointer.buttons |= mask;
    else this.pointer.buttons &= ~mask;
    await this.cdp.send('Input.dispatchMouseEvent', {
      type: msg.kind === 'down' ? 'mousePressed' : 'mouseReleased',
      x, y,
      button: msg.button || 'left',
      buttons: this.pointer.buttons,
      clickCount,
      modifiers,
    }, sid);
  }

  /** Cursore CSS dell'elemento sotto (x,y) → viewer. Throttle ~16/s e dedup:
   *  mandiamo solo i cambi, così il flusso resta trascurabile.
   *  Throttle con trailing edge: se arriviamo durante la finestra programmiamo
   *  un probe finale sull'ultima posizione, altrimenti il campione dove il mouse
   *  si FERMA (es. fermo su un link) verrebbe perso e il cursore non cambierebbe. */
  #probeCursor(x, y, sid) {
    this.cursorLast = { x, y, sid };
    const wait = this.cursorAt + 60 - Date.now();
    if (wait > 0) {
      if (!this.cursorTimer) {
        this.cursorTimer = setTimeout(() => {
          this.cursorTimer = null;
          const l = this.cursorLast;
          if (l) void this.#runCursorProbe(l.x, l.y, l.sid);
        }, wait);
      }
      return;
    }
    void this.#runCursorProbe(x, y, sid);
  }

  async #runCursorProbe(x, y, sid) {
    this.cursorAt = Date.now();
    try {
      const r = await this.cdp.send('Runtime.evaluate', {
        expression:
          `(()=>{const e=document.elementFromPoint(${x},${y});` +
          `return e?getComputedStyle(e).cursor:'default';})()`,
        returnByValue: true,
      }, sid);
      const css = r?.result?.value;
      // Solo per la tab ancora attiva e solo se è cambiato.
      const active = this.activeId ? this.targets.get(this.activeId) : null;
      if (!active || active.sessionId !== sid) return;
      if (typeof css === 'string' && css !== this.cursorCss) {
        this.cursorCss = css;
        this.#broadcastJson({ type: 'cursor', css });
      }
    } catch { /* pagina in navigazione: ignora */ }
  }

  /** Aggiorna lo stato della sfida e lo annuncia una volta sola. */
  #setCaptcha(next) {
    const before = this.captcha;
    this.captcha = next;
    if (!before && next) {
      console.log(`room :${this.cdpPort} verifica ${next.type} da completare`);
    } else if (before && !next) {
      console.log(`room :${this.cdpPort} verifica chiusa`);
    }
  }

  /**
   * Valuta un'espressione in una pagina about:blank di un contesto browser
   * SEPARATO e temporaneo, chiuso subito dopo.
   *
   * Serve per le richieste di rete di diagnostica (da dove esce il browser).
   * Farle nella pagina aperta dall'operatore non è affidabile: Stripchat, per
   * esempio, blocca con la sua CSP qualunque fetch verso host esterni, anche da
   * un mondo isolato e anche via Network.loadNetworkResource, e ha un service
   * worker che intercetta le richieste. about:blank non ha né l'una né l'altro.
   * Il contesto separato usa lo stesso --proxy-server del browser, quindi misura
   * il proxy che la stanza sta DAVVERO usando; non compare nel viewer, non
   * tocca la navigazione dell'operatore e non condivide cookie col profilo.
   */
  async evalDetached(expression, timeoutMs = 15000) {
    const { browserContextId } = await this.cdp.send('Target.createBrowserContext', {
      disposeOnDetach: true,
    });
    this.probeContexts.add(browserContextId);
    let offAuth = null;
    try {
      const { targetId } = await this.cdp.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId,
        background: true,
      });
      const { sessionId } = await this.cdp.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      if (this.proxyAuth) offAuth = await this.#enableProxyAuth(sessionId);
      const r = await Promise.race([
        this.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId),
        new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), timeoutMs)),
      ]);
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      }
      return r.result.value;
    } finally {
      offAuth?.();
      await this.cdp.send('Target.disposeBrowserContext', { browserContextId }).catch(() => undefined);
      this.probeContexts.delete(browserContextId);
    }
  }

  /** Valuta un'espressione nella tab attiva ATTRAVERSO la sessione della stanza
   *  — solo diagnostica. */
  async evalActive(expression) {
    const active = this.activeId ? this.targets.get(this.activeId) : null;
    if (!active) throw new Error('no active target');
    const r = await this.cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      active.sessionId,
    );
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  close() {
    if (this.captchaExpiry) { clearInterval(this.captchaExpiry); this.captchaExpiry = null; }
    if (this.ackTimer) { clearTimeout(this.ackTimer); this.ackTimer = null; }
    if (this.cursorTimer) { clearTimeout(this.cursorTimer); this.cursorTimer = null; }
    if (this.metaTimer) { clearTimeout(this.metaTimer); this.metaTimer = null; }
    for (const ws of this.viewers) {
      try { ws.close(); } catch { /* noop */ }
    }
    this.viewers.clear();
    this.cdp?.close();
  }
}
