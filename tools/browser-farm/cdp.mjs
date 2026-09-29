// Client CDP (Chrome DevTools Protocol) minimale, in-house (ADR-0011).
// Una sola connessione WebSocket browser-level con sessioni "flat": i comandi
// verso le singole pagine viaggiano con sessionId. Niente librerie di
// automazione esterne: solo `ws` + il protocollo.
import WebSocket from 'ws';

export class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject}
    this.handlers = new Map(); // method -> Set<fn({params, sessionId})>
    this.closed = false;
  }

  async open() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl, { perMessageDeflate: false });
      this.ws = ws;
      ws.once('open', resolve);
      ws.once('error', reject);
      ws.on('message', (data) => this.#onMessage(data));
      ws.on('close', () => {
        this.closed = true;
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('CDP connection closed'));
        }
        this.pending.clear();
        this.#emit('__closed__', {});
      });
    });
    return this;
  }

  /** Invia un comando; sessionId opzionale per i comandi page-level. */
  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('CDP closed'));
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, new Set());
    this.handlers.get(method).add(fn);
    return () => this.handlers.get(method)?.delete(fn);
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* noop */ }
  }

  #onMessage(data) {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.method ?? ''})`));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (msg.method) this.#emit(msg.method, { params: msg.params ?? {}, sessionId: msg.sessionId });
  }

  #emit(method, payload) {
    const set = this.handlers.get(method);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { console.error(`cdp handler ${method}:`, e); }
    }
  }
}

/**
 * Attende che il DevTools endpoint del container risponda e apre la
 * connessione browser-level. Il browser parte insieme a Xvfb: i primi
 * tentativi possono fallire, è normale.
 */
// 45s: il primo container dopo un restart del farm (Docker freddo, contesa I/O)
// può metterci a esporre il DevTools molto più dei ~2s a regime.
export async function connectCdp(port, { timeoutMs = 45000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      // Timeout per-tentativo: durante il cold start docker-proxy può accettare
      // la connessione e non rispondere mai — senza abort il loop si blocca.
      const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const { webSocketDebuggerUrl } = await res.json();
        // Il browser riporta host/porta INTERNI al container: riscriviamo
        // sull'endpoint mappato lato host, tenendo solo il path.
        const path = new URL(webSocketDebuggerUrl).pathname;
        return await new Cdp(`ws://127.0.0.1:${port}${path}`).open();
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`CDP non raggiungibile su :${port} (${String(lastErr)})`);
}
