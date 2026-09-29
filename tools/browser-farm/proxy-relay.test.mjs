import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { startProxyRelay } from './proxy-relay.mjs';

/** SOCKS5 finto: risponde al saluto senza auth, poi al CONNECT dopo `delayMs`. */
function fakeSocks({ delayMs = 0, rep = 0x00 } = {}) {
  const conns = new Set();
  const server = createServer((s) => {
    conns.add(s);
    s.on('error', () => undefined);
    s.once('data', () => {
      s.write(Buffer.from([0x05, 0x00]));
      s.once('data', () => {
        setTimeout(() => {
          if (!s.destroyed) s.write(Buffer.from([0x05, rep, 0x00, 0x01, 1, 2, 3, 4, 0, 80]));
        }, delayMs);
      });
    });
  });
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r({ port: server.address().port, conns, close: () => { for (const c of conns) c.destroy(); server.close(); } })),
  );
}

let nextPort = 19400 + Math.floor(Math.random() * 500);

async function withRelay(upstream, fn) {
  const relay = await startProxyRelay({
    upstream: { host: '127.0.0.1', port: upstream.port },
    listenHost: '127.0.0.1',
    port: nextPort++,
    allowFrom: '127.0.0.1',
    label: 'test',
  });
  const errors = [];
  const onErr = (e) => errors.push(e);
  process.on('uncaughtException', onErr);
  try {
    await fn(Number(new URL(relay.url).port));
    await new Promise((r) => setTimeout(r, 300));
  } finally {
    process.off('uncaughtException', onErr);
    relay.close();
    upstream.close();
  }
  return errors;
}

test('il browser chiude di colpo mentre il relay attende il SOCKS: nessun crash', async () => {
  const upstream = await fakeSocks({ delayMs: 500 });
  const errors = await withRelay(upstream, async (port) => {
    const c = connect(port, '127.0.0.1');
    c.on('error', () => undefined);
    await new Promise((r) => c.on('connect', r));
    c.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
    await new Promise((r) => setTimeout(r, 100));
    c.resetAndDestroy(); // RST, come un browser che annulla la richiesta
    await new Promise((r) => setTimeout(r, 700)); // il SOCKS risponde dopo
  });
  assert.deepEqual(errors.map(String), []);
});

test('il SOCKS a monte cade a tunnel aperto: nessun crash', async () => {
  const upstream = await fakeSocks();
  const errors = await withRelay(upstream, async (port) => {
    const c = connect(port, '127.0.0.1');
    c.on('error', () => undefined);
    await new Promise((r) => c.on('connect', r));
    c.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n');
    const line = await new Promise((r) => c.once('data', (d) => r(d.toString())));
    assert.match(line, /200 Connection Established/);
    for (const s of upstream.conns) s.resetAndDestroy();
    await new Promise((r) => setTimeout(r, 200));
    c.destroy();
  });
  assert.deepEqual(errors.map(String), []);
});

test('SOCKS rifiuta la destinazione: il browser riceve 502', async () => {
  const upstream = await fakeSocks({ rep: 0x04 });
  await withRelay(upstream, async (port) => {
    const c = connect(port, '127.0.0.1');
    c.on('error', () => undefined);
    await new Promise((r) => c.on('connect', r));
    c.write('CONNECT v6only.example:443 HTTP/1.1\r\nHost: v6only.example:443\r\n\r\n');
    const line = await new Promise((r) => c.once('data', (d) => r(d.toString())));
    assert.match(line, /502/);
    c.destroy();
  });
});
