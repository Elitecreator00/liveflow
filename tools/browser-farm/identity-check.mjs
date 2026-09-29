// Diagnosi di coerenza dell'identità di una stanza.
//
// PERCHÉ: i CAPTCHA e i blocchi arrivano soprattutto quando i segnali non
// combaciano — un'uscita in Regno Unito con fuso Europe/Rome e lingua it-IT è
// una combinazione che nessun utente reale produce. Oggi la stanza non dice
// nulla di tutto questo: si scopre solo venendo bloccati.
//
// COME: tre letture indipendenti.
//   1) Dove esce il BROWSER — la misura che conta, perché è quella che vede il
//      sito. Parte da un mondo isolato della pagina, così la CSP del sito non la
//      blocca e non serve aprire schede che disturbino chi sta lavorando.
//   2) Dove esce il proxy configurato — stessa richiesta fatta da Node
//      attraverso quel proxy. Se le due non coincidono il browser NON sta usando
//      il proxy: è il caso peggiore, perché la stanza sembra protetta e invece
//      naviga scoperta, e prima di questo controllo nessuno se ne accorgeva.
//   3) Cosa dichiara il browser — fuso, lingua, schermo, WebGL (nessuna rete).

import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { socks5Connect } from './proxy-relay.mjs';

const GEO_HOST = 'ipwho.is';
const GEO_PATH = '/?fields=ip,success,country,country_code,city,timezone,connection';

/**
 * Chiede al BROWSER qual è il suo IP pubblico. Va valutata
 * fuori dalla pagina dell'operatore (RoomSession.evalDetached): la CSP o il
 * service worker del sito visitato possono bloccarla.
 */
export const BROWSER_EXIT_PROBE = `fetch("https://ipwho.is/?fields=ip,country,country_code,city,timezone,connection")
  .then((r) => r.json())
  .then((d) => ({
    ip: d.ip ?? null,
    country: d.country ?? null,
    countryCode: d.country_code ?? null,
    city: d.city ?? null,
    timezone: (d.timezone && d.timezone.id) || d.timezone || null,
    isp: (d.connection && (d.connection.isp || d.connection.org)) || null,
  }))
  .catch(() => null)`;

/** Espressione valutata nella pagina: solo dati locali, nessuna rete. */
export const BROWSER_IDENTITY_PROBE = `(() => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return {
    timezone: tz,
    language: navigator.language || '',
    languages: (navigator.languages || []).join(','),
    platform: navigator.platform || '',
    screen: screen.width + 'x' + screen.height,
    webdriver: navigator.webdriver === true,
    // WebGL: un browser reale ce l'ha SEMPRE. Se manca, i controlli anti-bot
    // trattano l'ambiente come automatizzato e non fanno passare le verifiche.
    webgl: (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl");
        if (!gl) return null;
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "disponibile";
      } catch {
        return null;
      }
    })(),
  };
})()`;

/** Tunnel verso host:443 attraverso un proxy HTTP (CONNECT). */
function httpConnectTunnel({ host, port, username, password }, destHost, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port: Number(port) || 8080 });
    let buf = '';
    let settled = false;
    const fail = (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail(`timeout proxy (${timeoutMs}ms)`), timeoutMs);

    socket.on('error', (e) => fail(String(e.message || e)));
    socket.on('close', () => fail('connessione chiusa dal proxy'));
    socket.on('connect', () => {
      const auth = username
        ? 'Proxy-Authorization: Basic ' +
          Buffer.from(`${username}:${password}`).toString('base64') + '\r\n'
        : '';
      socket.write(
        `CONNECT ${destHost}:443 HTTP/1.1\r\nHost: ${destHost}:443\r\n${auth}\r\n`,
      );
    });
    socket.on('data', (d) => {
      buf += d.toString('latin1');
      if (!buf.includes('\r\n\r\n')) return;
      const status = Number(/^HTTP\/\d\.\d (\d{3})/.exec(buf)?.[1] || 0);
      if (status < 200 || status >= 300) return fail(`il proxy ha risposto ${status || '?'}`);
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('close');
      resolve(socket);
    });
  });
}

/** GET HTTPS su un socket già tunnelato (o diretto). Ritorna il corpo. */
function httpsGet(socket, host, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const tls = tlsConnect({ socket, servername: host }, () => {
      tls.write(
        `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: liveflow-identity-check\r\n` +
          'Accept: application/json\r\nConnection: close\r\n\r\n',
      );
    });
    let raw = '';
    const timer = setTimeout(() => {
      tls.destroy();
      reject(new Error(`timeout risposta (${timeoutMs}ms)`));
    }, timeoutMs);
    tls.setEncoding('utf8');
    tls.on('data', (c) => { raw += c; });
    tls.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(String(e.message || e)));
    });
    tls.on('end', () => {
      clearTimeout(timer);
      const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
      try {
        // Le risposte possono arrivare in chunked: si tiene il primo oggetto JSON.
        const start = body.indexOf('{');
        const end = body.lastIndexOf('}');
        resolve(JSON.parse(body.slice(start, end + 1)));
      } catch {
        reject(new Error('risposta del servizio geo-IP non leggibile'));
      }
    });
  });
}

/**
 * Da dove esce la stanza: IP pubblico, paese, fuso e operatore di rete.
 * `proxyParts` null = nessun proxy, quindi esce con l'IP del server.
 */
export async function lookupExitIdentity(proxyParts, timeoutMs = 12000) {
  let socket;
  if (!proxyParts?.host) {
    socket = netConnect({ host: GEO_HOST, port: 443 });
  } else if (proxyParts.scheme === 'socks5') {
    socket = await socks5Connect(proxyParts, GEO_HOST, 443, timeoutMs);
  } else {
    socket = await httpConnectTunnel(proxyParts, GEO_HOST, timeoutMs);
  }
  const data = await httpsGet(socket, GEO_HOST, GEO_PATH, timeoutMs);
  if (data.success === false) throw new Error('il servizio geo-IP ha rifiutato la richiesta');
  return {
    ip: data.ip ?? null,
    country: data.country ?? null,
    countryCode: data.country_code ?? null,
    city: data.city ?? null,
    timezone: data.timezone?.id ?? data.timezone ?? null,
    isp: data.connection?.isp ?? data.connection?.org ?? null,
  };
}

/** "1.2.3.4 (London)" — usato nei messaggi di incoerenza. */
function describeExit(e) {
  if (!e?.ip) return 'un indirizzo sconosciuto';
  return e.city ? `${e.ip} (${e.city})` : e.ip;
}

/** Prime due lettere di un locale (it-IT → it). */
function langOf(locale) {
  return String(locale || '').split('-')[0].toLowerCase();
}

/** Paese dichiarato dal locale (it-IT → IT), se presente. */
function regionOf(locale) {
  const parts = String(locale || '').split('-');
  return parts.length > 1 ? parts[1].toUpperCase() : null;
}

/**
 * Confronta uscita reale e identità dichiarata dal browser.
 * Ritorna una lista di rilievi ordinata per gravità: sono le incoerenze che
 * fanno scattare le verifiche anti-bot, spiegate in modo che l'operatore sappia
 * cosa cambiare.
 */
export function compareIdentity({ exit, browserExit, browser, proxyConfigured }) {
  const findings = [];

  // Il controllo più importante: il browser esce da dove esce il proxy? Se no,
  // la stanza sembra protetta e invece naviga con l'IP del server.
  if (proxyConfigured && exit?.ip && browserExit?.ip && exit.ip !== browserExit.ip) {
    findings.push({
      level: 'error',
      message:
        'Il browser NON sta usando il proxy: esce da ' +
        describeExit(browserExit) +
        ', mentre il proxy configurato esce da ' +
        describeExit(exit) +
        '. La stanza sembra protetta e non lo è.',
    });
  }

  if (proxyConfigured && !browserExit?.ip) {
    findings.push({
      level: 'warn',
      message:
        'Non è stato possibile misurare da dove esce il browser, quindi la ' +
        'verifica del proxy resta incompleta. Riprova con una pagina aperta ' +
        'nella stanza.',
    });
  }

  if (!proxyConfigured) {
    findings.push({
      level: 'error',
      message:
        'La stanza esce senza proxy, quindi con l\'IP del server: tutte le stanze ' +
        'senza proxy condividono lo stesso indirizzo, ed è il modo più veloce per ' +
        'farsi bloccare.',
    });
  }

  // Da qui conta da dove esce davvero il browser: è ciò che vede il sito.
  const real = browserExit?.ip ? browserExit : exit;

  if (real?.timezone && browser?.timezone && real.timezone !== browser.timezone) {
    findings.push({
      level: 'error',
      message:
        `Fuso orario incoerente: la connessione esce da ${real.timezone} ma il ` +
        `browser dichiara ${browser.timezone}. È una delle incoerenze che i siti ` +
        'controllano per prime.',
    });
  }

  const region = regionOf(browser?.language);
  if (real?.countryCode && region && real.countryCode !== region) {
    findings.push({
      level: 'warn',
      message:
        `Lingua e paese non combaciano: uscita da ${real.countryCode} con lingua ` +
        `${browser.language}. Plausibile per un espatriato, ma sommata ad altri ` +
        'segnali aumenta i controlli.',
    });
  }

  if (browser && "webgl" in browser && !browser.webgl) {
    findings.push({
      level: "error",
      message:
        "Il browser non ha WebGL: nessun browser reale si presenta così, ed è uno " +
        "dei primi controlli anti-bot. Finché manca, le verifiche non passano " +
        "nemmeno completandole a mano.",
    });
  }

  if (browser?.webdriver) {
    findings.push({
      level: 'error',
      message:
        'Il browser espone navigator.webdriver: viene riconosciuto come ' +
        'automatizzato. Va corretto nella configurazione della stanza.',
    });
  }

  const isp = String(real?.isp || '').toLowerCase();
  if (isp && /(hosting|datacenter|data center|cloud|server|vps|ovh|hetzner|digitalocean|amazon|google|azure)/.test(isp)) {
    findings.push({
      level: 'warn',
      message:
        `L'IP di uscita risulta di un operatore da datacenter (${real.isp}). Gli IP ` +
        'residenziali ricevono molte meno verifiche: se il fornitore lo permette, ' +
        'usa un endpoint residenziale.',
    });
  }

  if (!findings.length) {
    findings.push({
      level: 'ok',
      message:
        'Nessuna incoerenza rilevata fra uscita di rete e identità del browser.',
    });
  }

  const order = { error: 0, warn: 1, ok: 2 };
  return findings.sort((a, b) => order[a.level] - order[b.level]);
}
