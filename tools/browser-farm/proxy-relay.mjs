// LiveFlow — Relay proxy per stanza (ADR-0011).
//
// PERCHÉ ESISTE: Chromium non sa autenticarsi sui proxy SOCKS. Con
// `--proxy-server=socks5://host:porta` non c'è modo di passare utente e
// password (la challenge CDP `Fetch.authRequired` vale solo per i proxy HTTP,
// che rispondono 407), quindi una stanza con un SOCKS5 autenticato si apriva
// ma non navigava.
//
// COSA FA: espone al container un proxy HTTP *senza* autenticazione, in ascolto
// sul gateway della rete Docker della farm, e inoltra tutto al SOCKS5 upstream
// autenticandosi lui (RFC 1928 + RFC 1929). Le credenziali restano nel processo
// dell'orchestratore: non entrano nel container, né nel profilo, né in
// `docker inspect`.
//
// SICUREZZA: il listener accetta SOLO connessioni dall'IP del container della
// stanza (rete Docker dedicata a IP fissi). Senza questo filtro sarebbe un open
// proxy per chiunque sappia raggiungere il gateway.
import { createServer } from 'node:http';
import { connect as netConnect } from 'node:net';

/** Handshake SOCKS5 completo fino al CONNECT: risolve al socket pronto. */
export function socks5Connect({ host, port, username, password }, destHost, destPort, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port: Number(port) || 1080 });
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    let settled = false;

    const fail = (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(msg));
    };
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners('data');
      socket.removeAllListeners('error');
      socket.removeAllListeners('close');
      resolve(socket);
    };
    const timer = setTimeout(() => fail(`timeout SOCKS5 in fase ${stage}`), timeoutMs);

    socket.on('error', (e) => fail(`SOCKS5 ${host}: ${e.message}`));
    socket.on('close', () => fail(`SOCKS5 ${host}: connessione chiusa in fase ${stage}`));
    socket.on('connect', () => {
      // Metodi offerti: nessuna auth (0x00) e user/password (0x02).
      socket.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
    });

    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);

      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05) return fail(`risposta SOCKS non valida (versione ${buf[0]})`);
        const method = buf[1];
        buf = buf.subarray(2);
        if (method === 0x00) {
          stage = 'connect';
          return sendConnect();
        }
        if (method === 0x02) {
          if (!username) return fail('il proxy SOCKS richiede utente e password');
          stage = 'auth';
          const u = Buffer.from(String(username), 'utf8');
          const p = Buffer.from(String(password ?? ''), 'utf8');
          return socket.write(
            Buffer.concat([
              Buffer.from([0x01, u.length]), u,
              Buffer.from([p.length]), p,
            ]),
          );
        }
        return fail(
          method === 0xff
            ? 'il proxy SOCKS non accetta i metodi di autenticazione offerti'
            : `metodo di autenticazione SOCKS non supportato (0x${method.toString(16)})`,
        );
      }

      if (stage === 'auth') {
        if (buf.length < 2) return;
        const status = buf[1];
        buf = buf.subarray(2);
        if (status !== 0x00) return fail('il proxy SOCKS ha rifiutato utente e password');
        stage = 'connect';
        return sendConnect();
      }

      // Risposta al CONNECT: VER REP RSV ATYP ADDR PORT (lunghezza variabile).
      if (buf.length < 5) return;
      if (buf[1] !== 0x00) return fail(`il proxy SOCKS ha rifiutato la connessione (codice ${buf[1]})`);
      const atyp = buf[3];
      const addrLen = atyp === 0x01 ? 4 : atyp === 0x03 ? 1 + buf[4] : atyp === 0x04 ? 16 : null;
      if (addrLen === null) return fail(`risposta SOCKS con indirizzo di tipo ${atyp}`);
      const total = 4 + addrLen + 2;
      if (buf.length < total) return;
      // Eventuali byte già arrivati dopo la risposta appartengono al flusso.
      const leftover = buf.subarray(total);
      if (leftover.length) socket.unshift(leftover);
      done();
    });

    function sendConnect() {
      const h = Buffer.from(destHost, 'utf8');
      const head = Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]);
      const tail = Buffer.alloc(2);
      tail.writeUInt16BE(destPort, 0);
      socket.write(Buffer.concat([head, h, tail]));
    }
  });
}

/**
 * Avvia il relay della stanza. Risolve quando è in ascolto.
 *
 * @param {object} o
 * @param {{host,port,username,password}} o.upstream  proxy SOCKS5 a monte
 * @param {string} o.listenHost  gateway della rete Docker (es. 172.30.0.1)
 * @param {number} o.port        porta dedicata alla stanza
 * @param {string} o.allowFrom   unico IP ammesso (il container della stanza)
 * @param {string} o.label       roomId, per i log
 */
export function startProxyRelay({ upstream, listenHost, port, allowFrom, label = '' }) {
  const server = createServer();
  const sockets = new Set();
  let closed = false;

  const allowed = (socket) => {
    const ip = (socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (ip === allowFrom) return true;
    console.error(`relay ${label}: connessione rifiutata da ${ip} (atteso ${allowFrom})`);
    socket.destroy();
    return false;
  };

  // Ogni socket del relay ha SEMPRE un gestore d'errore. Il browser chiude
  // connessioni di continuo (tab chiuse, richieste annullate), anche mentre il
  // relay attende ancora il SOCKS a monte (fino a 15 s): un ECONNRESET senza
  // listener è un'eccezione non gestita, che abbatteva l'intero orchestratore
  // e con lui TUTTE le stanze.
  const track = (socket) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => sockets.delete(socket));
  };

  // HTTPS e tutto ciò che passa da un tunnel.
  server.on('connect', async (req, clientSocket, head) => {
    if (!allowed(clientSocket)) return;
    track(clientSocket);
    const [host, rawPort] = splitHostPort(req.url, 443);
    try {
      const upstreamSocket = await socks5Connect(upstream, host, rawPort, 15000);
      track(upstreamSocket);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstreamSocket.write(head);
      pipe(clientSocket, upstreamSocket);
    } catch (e) {
      console.error(`relay ${label}: CONNECT ${host}:${rawPort} fallito — ${e.message}`);
      if (!clientSocket.destroyed) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });

  // HTTP in chiaro: la richiesta arriva con URL assoluto e va rigirata così com'è.
  server.on('request', async (req, res) => {
    if (!allowed(req.socket)) return;
    track(req.socket);
    let target;
    try {
      target = new URL(req.url);
    } catch {
      res.writeHead(400).end('richiesta proxy non valida');
      return;
    }
    const port = Number(target.port) || 80;
    try {
      const upstreamSocket = await socks5Connect(upstream, target.hostname, port, 15000);
      track(upstreamSocket);
      const path = target.pathname + target.search;
      const headers = [`${req.method} ${path} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        // proxy-connection non ha senso oltre il primo hop.
        if (/^proxy-connection$/i.test(req.rawHeaders[i])) continue;
        headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      upstreamSocket.write(headers.join('\r\n') + '\r\n\r\n');
      req.pipe(upstreamSocket);
      // Si risponde sul socket grezzo: la risposta upstream è già HTTP completo.
      res.detachSocket?.(req.socket);
      upstreamSocket.pipe(req.socket);
      req.socket.on('close', () => upstreamSocket.destroy());
    } catch (e) {
      console.error(`relay ${label}: ${req.method} ${target.hostname} fallito — ${e.message}`);
      if (!res.headersSent) res.writeHead(502).end('proxy upstream non raggiungibile');
    }
  });

  server.on('clientError', (_e, socket) => socket.destroy());

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, listenHost, () => {
      server.removeListener('error', reject);
      console.log(`relay ${label}: http://${listenHost}:${port} → socks5://${upstream.host}:${upstream.port} (solo da ${allowFrom})`);
      resolve({
        url: `http://${listenHost}:${port}`,
        close() {
          if (closed) return;
          closed = true;
          for (const s of sockets) s.destroy();
          sockets.clear();
          server.close();
        },
      });
    });
  });
}

function splitHostPort(authority, fallbackPort) {
  const m = /^\[(.+)\]:(\d+)$/.exec(authority) || /^([^:]+):(\d+)$/.exec(authority);
  return m ? [m[1], Number(m[2])] : [authority, fallbackPort];
}

function pipe(a, b) {
  a.pipe(b);
  b.pipe(a);
  const kill = () => {
    a.destroy();
    b.destroy();
  };
  a.on('error', kill);
  b.on('error', kill);
  a.on('close', kill);
  b.on('close', kill);
}

/**
 * Verifica che il SOCKS5 accetti le credenziali, senza tenere aperto nulla:
 * l'orchestratore lo usa come preflight prima di avviare la stanza.
 */
export async function probeSocks5(upstream, timeoutMs = 8000) {
  const socket = await socks5Connect(upstream, 'example.com', 443, timeoutMs);
  socket.destroy();
}
