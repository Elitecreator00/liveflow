// LiveFlow — Data-plane orchestrator delle stanze multi-browser (ADR-0011).
// IN-HOUSE: container Chromium+Xvfb nostro (Dockerfile in questa cartella),
// display remoto via CDP screencast (gateway WebSocket qui), niente Neko o
// altri servizi esterni.
//
// Per ogni stanza:
//   - webcam virtuale dedicata /dev/videoN (pool v4l2loopback) mappata come
//     /dev/video0 nel container, alimentata dall'ingestor LiveKit (sorgente
//     Studio) o da un placeholder ffmpeg se la stanza parte senza sorgente;
//   - profilo browser PERSISTENTE in $PROFILES_DIR/<roomId> (cookie/sessioni
//     sopravvivono ai riavvii; distrutto solo con DELETE);
//   - proxy unico (host:port come flag, credenziali risposte via CDP);
//   - identità nativa della stanza: TZ, lingua nel profilo, schermo Xvfb
//     (browser-prefs.mjs) — niente override CDP, vedi room-session.mjs.
//
// Avvio: ORCH_TOKEN=<segreto> node orchestrator.mjs   (porta 7090)
import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, rmSync, statSync, accessSync, openSync, constants as FS } from 'node:fs';
import { connect as netConnect } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomSession } from './room-session.mjs';
import { writeLanguagePrefs } from './browser-prefs.mjs';
import { containerClipboard } from './clipboard.mjs';
import { startProxyRelay, probeSocks5 } from './proxy-relay.mjs';
import {
  BROWSER_IDENTITY_PROBE,
  BROWSER_EXIT_PROBE,
  lookupExitIdentity,
  compareIdentity,
} from './identity-check.mjs';

const execFileP = promisify(execFile);
const HERE = fileURLToPath(new URL('.', import.meta.url));

const PORT = Number(process.env.ORCH_PORT || 7090);
const TOKEN = process.env.ORCH_TOKEN || 'lf-orch-dev';
const IMAGE = process.env.FARM_IMAGE || 'liveflow-browser';
const INGESTOR = process.env.INGESTOR || join(HERE, 'ingestor.mjs');
const PROFILES_DIR = process.env.PROFILES_DIR || join(homedir(), 'liveflow-farm', 'profiles');

// Rete Docker dedicata alla farm, a indirizzi fissi: l'IP di ogni stanza è noto
// PRIMA di accenderla, così il relay proxy può accettare solo quel container
// (vedi proxy-relay.mjs) invece di restare un proxy aperto sul gateway.
// Quanto attendere prima della verifica automatica: il tempo che la stanza
// apra la sua prima pagina.
const IDENTITY_CHECK_DELAY_MS = 15_000;

const FARM_NET = process.env.FARM_NET || 'liveflow-farm';
const FARM_SUBNET = process.env.FARM_SUBNET || '172.30.0.0/24';
const FARM_GATEWAY = process.env.FARM_GATEWAY || '172.30.0.1';

// Pool webcam virtuali /dev/video10..17 (create da setup-farm.sh) + porte CDP.
const POOL = [10, 11, 12, 13, 14, 15, 16, 17];
const free = new Set(POOL);
// Device che hanno fallito il priming: fuori dal pool finché la farm non viene
// reinizializzata (modprobe), ma visibili in /health per la diagnosi.
const broken = new Map(); // n -> motivo
const rooms = new Map(); // roomId -> {n, device, cdpPort, containerName, containerId, feeder, session, startedAt}

// ── Bootstrap: rimuovi container orfani di run precedenti ─────────────────────
try {
  const { stdout } = await execFileP('docker', ['ps', '-aq', '--filter', 'name=lf-room-']);
  const ids = stdout.trim().split('\n').filter(Boolean);
  if (ids.length) {
    await execFileP('docker', ['rm', '-f', ...ids]);
    console.log(`bootstrap: rimossi ${ids.length} container orfani`);
  }
} catch { /* docker non pronto: i lanci falliranno con errore chiaro */ }

// Rete della farm (idempotente).
try {
  await execFileP('docker', ['network', 'inspect', FARM_NET]);
} catch {
  try {
    await execFileP('docker', [
      'network', 'create', '--subnet', FARM_SUBNET, '--gateway', FARM_GATEWAY, FARM_NET,
    ]);
    console.log(`bootstrap: rete ${FARM_NET} (${FARM_SUBNET}) creata`);
  } catch (e) {
    console.error(`bootstrap: rete ${FARM_NET} non creata: ${String(e.stderr || e.message)}`);
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// Autenticazione server-to-server (control-plane API → qui).
app.use((req, res, next) => {
  if ((req.headers['x-orch-token'] || '') !== TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.get('/health', (_req, res) => {
  // `ready` dice se la farm può davvero avviare stanze: senza webcam virtuali
  // (modulo v4l2loopback non caricato dopo un aggiornamento kernel) ogni start
  // fallirebbe. La Console lo mostra PRIMA che l'operatore prema Avvia.
  const usable = POOL.filter((n) => deviceUsable(`/dev/video${n}`) === null);
  res.json({
    ok: true,
    ready: usable.length > 0,
    issue: usable.length > 0 ? null : FARM_MESSAGES.FARM_DEVICE_MISSING,
    devices: { total: POOL.length, usable: usable.length },
    broken: [...broken.entries()].map(([n, reason]) => ({ device: `/dev/video${n}`, reason })),
    freeDevices: free.size,
    rooms: [...rooms.keys()],
  });
});

app.get('/rooms', (_req, res) =>
  res.json(
    [...rooms.entries()].map(([id, r]) => ({
      roomId: id,
      device: r.device,
      cdpPort: r.cdpPort,
      containerId: r.containerId,
      relay: r.relay?.url ?? null,
      mirror: !!r.mirror,
      captcha: r.session?.captcha ?? null,
      identity: r.identity ?? null,
      viewers: r.session?.viewers.size ?? 0,
      startedAt: r.startedAt,
    })),
  ),
);

// ── Avvio stanza ──────────────────────────────────────────────────────────────
app.post('/rooms/:id/start', async (req, res) => {
  const roomId = sanitizeId(req.params.id);
  const { fingerprint, proxy, wsUrl, viewerToken, name, mirror, scene, homeUrl } = req.body || {};
  if (rooms.has(roomId)) return res.status(409).json({ error: 'room already running' });

  // Postazione: il primo device del pool che supera il priming (vedi
  // acquireDevice — un device rotto non deve bloccare l'avvio della stanza).
  let acquired;
  try {
    acquired = await acquireDevice();
  } catch (e) {
    const known = e instanceof FarmError;
    console.error(
      `room ${roomId} start FALLITO [${known ? e.code : 'FARM_UNEXPECTED'}]: ` +
        `${String((e && (e.detail || e.message)) || e)}`,
    );
    return res.status(known ? e.status : 500).json({
      code: known ? e.code : 'FARM_UNEXPECTED',
      error: known
        ? e.message
        : 'Avvio della stanza non riuscito sul server. Riprova; se persiste serve un intervento dell\'amministratore.',
      detail: known ? e.detail : String(e).slice(0, 2000),
    });
  }
  const { n, device } = acquired;
  // Substream del loopback ALSA dedicato alla stanza (0..7), simmetrico al pool
  // video. L'host scrive su hw:Loopback,0,N; il container cattura hw:Loopback,1,N.
  const aloopSub = n - POOL[0];
  const alsaDevice = `hw:Loopback,0,${aloopSub}`;
  const cdpPort = 9300 + n;
  // IP fisso del container e porta del relay: entrambi derivati dallo slot, così
  // sono noti prima dell'avvio e il relay può filtrare per IP sorgente.
  const containerIp = `${FARM_GATEWAY.replace(/\.\d+$/, '')}.${n}`;
  const relayPort = 9400 + n;
  const containerName = `lf-room-${roomId.slice(0, 48)}`;
  const profileDir = join(PROFILES_DIR, roomId);
  let feeder = null;
  let audioFeeder = null;
  let session = null;
  let relay = null;

  try {
    mkdirSync(profileDir, { recursive: true });
    // Lingua nelle preferenze del profilo, non via CDP: così vale identica in
    // pagina, iframe e worker (vedi browser-prefs.mjs).
    writeLanguagePrefs(profileDir, fingerprint);

    // 1) Proxy: verificato PRIMA di accendere qualsiasi cosa. Una stanza con
    //    proxy morto o scaduto non naviga, e senza proxy uscirebbe con l'IP
    //    del VPS — lo stesso per tutte le stanze (ADR-0011: un IP per identità).
    const proxyParts = parseProxyParts(proxy);
    if (proxyParts?.host) {
      assertProxySupported(proxyParts);
      await checkProxy(proxyParts);
    }
    let { proxyServer, proxyAuth } = parseProxy(proxy);

    // SOCKS con credenziali: Chromium non sa autenticarsi: gli diamo un proxy
    // HTTP locale senza password, che parla lui col SOCKS upstream. Le
    // credenziali restano in questo processo (mai nel container).
    if (needsRelay(proxyParts)) {
      relay = await startProxyRelay({
        upstream: proxyParts,
        listenHost: FARM_GATEWAY,
        port: relayPort,
        allowFrom: containerIp,
        label: roomId,
      });
      proxyServer = relay.url;
      proxyAuth = null;
    }

    // 2) Sorgente → webcam virtuale. Con sorgente Studio: ingestor LiveKit.
    //    Senza: placeholder ffmpeg (il device deve avere SEMPRE un writer,
    //    altrimenti getUserMedia resta appeso).
    if (wsUrl && viewerToken) {
      // Un solo ingestor pompa SIA video (→ /dev/videoN) SIA audio (→ loopback).
      // stdin aperto: è il canale dei comandi a caldo (specchio). stderr su
      // file: i log dell'ingestor (fps, frame scartati) servono a capire una
      // diretta lenta, e prima finivano nel nulla.
      const ingestorLog = openSync(join(HERE, `ingestor-${roomId}.log`), 'a');
      feeder = spawn('node', [INGESTOR], {
        env: {
          ...process.env,
          LIVEKIT_WS_URL: wsUrl,
          LIVEKIT_TOKEN: viewerToken,
          V4L2_DEVICE: device,
          ALSA_DEVICE: alsaDevice,
          MIRROR: mirror ? '1' : '0',
          SCENE: scene ? JSON.stringify(scene) : '',
        },
        stdio: ['pipe', ingestorLog, ingestorLog],
      });
      feeder.stdin?.on('error', () => { /* ingestor uscito: lo start fallirà altrove */ });
    } else {
      feeder = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-re',
        '-f', 'lavfi', '-i', 'color=c=0x12121a:s=1280x720:r=30',
        '-pix_fmt', 'yuv420p', '-f', 'v4l2', device,
      ], { stdio: 'ignore' });
      // Silenzio sul loopback: tiene il microfono "vivo" anche senza sorgente.
      audioFeeder = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
        '-f', 'alsa', alsaDevice,
      ], { stdio: 'ignore' });
    }


    // 3) Container nostro (Chromium+Xvfb). CDP esposto SOLO su loopback host.
    const fp = fingerprint ?? {};
    const args = [
      'run', '-d', '--name', containerName, '--restart', 'no',
      '--network', FARM_NET, '--ip', containerIp,
      // 9223 = socat nel container che inoltra al DevTools (vedi entrypoint.sh).
      '-p', `127.0.0.1:${cdpPort}:9223`,
      '--device', `${device}:/dev/video0`,
      // /dev/snd: il container deve vedere il loopback ALSA per il microfono.
      '--device', '/dev/snd',
      '-v', `${profileDir}:/profile`,
      '--shm-size=1g',
      '-e', `TZ=${fp.timezone || 'Europe/Rome'}`,
      '-e', `BROWSER_LANG=${fp.locale || 'it-IT'}`,
      '-e', `SCREEN_W=${fp.viewport?.width || 1280}`,
      '-e', `SCREEN_H=${fp.viewport?.height || 720}`,
      '-e', `ALSA_SUB=${aloopSub}`,
      ...(proxyServer ? ['-e', `PROXY_SERVER=${proxyServer}`] : []),
      IMAGE,
    ];
    console.log(
      `room ${roomId} avvio: ${device} cdp:${cdpPort} proxy:${proxyServer || 'no'} ` +
        `source:${wsUrl ? 'si' : 'no'} home:${homeUrl || 'predefinita'}`,
    );
    let containerId;
    try {
      const { stdout } = await execFileP('docker', args);
      containerId = stdout.trim().slice(0, 12);
    } catch (e) {
      throw classifyDockerError(e);
    }

    // 4) Aggancio CDP: auth proxy + screencast gateway.
    session = new RoomSession(cdpPort, proxyAuth, containerClipboard(containerName), homeUrl);
    try {
      await session.init();
    } catch (e) {
      throw new FarmError(
        'FARM_BROWSER_NOT_RESPONDING',
        'Il browser della stanza si è avviato ma non risponde ai comandi. ' +
          'Riprova; se persiste serve un intervento dell\'amministratore.',
        String(e.message || e),
      );
    }

    const entry = {
      n, device, cdpPort, containerName, containerId, feeder, audioFeeder, session,
      relay, mirror: !!mirror, hasSource: !!(wsUrl && viewerToken),
      proxyParts: proxyParts?.host ? proxyParts : null,

      startedAt: Date.now(),
    };
    rooms.set(roomId, entry);
    // Verifica da sola: l'operatore non deve ricordarsi di lanciarla, e finora
    // una stanza che navigava scoperta sembrava a posto come tutte le altre.
    scheduleIdentityCheck(roomId, entry);
    console.log(`room ${roomId} ("${name || '?'}") avviata: ${device} cdp:${cdpPort}`);
    res.json({ containerId });
  } catch (e) {
    // FarmError porta già la frase per l'operatore; qualunque altra cosa è un
    // imprevisto e non va riversata grezza nella Console.
    const known = e instanceof FarmError;
    const reason = String((e && (e.stderr || e.message)) || e);
    console.error(
      `room ${roomId} start FALLITO [${known ? e.code : 'FARM_UNEXPECTED'}]: ${reason}` +
        (known && e.detail ? `\n  detail: ${e.detail}` : ''),
    );
    // Diagnostica PRIMA del cleanup: stato + ultimi log del container — solo
    // se il container c'entra (per un device o un proxy KO non è mai partito).
    const containerInvolved =
      !known ||
      e.code === 'FARM_CONTAINER_START_FAILED' ||
      e.code === 'FARM_BROWSER_NOT_RESPONDING';
    if (containerInvolved) try {
      const { stdout: st } = await execFileP('docker', [
        'inspect', '-f', '{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}',
        containerName,
      ]);
      console.error(`  container state: ${st.trim()}`);
      const { stdout: lg, stderr: lgErr } = await execFileP('docker', [
        'logs', '--tail', '25', containerName,
      ]);
      console.error(`  container logs:\n${(lg || '') + (lgErr || '')}`.slice(0, 2500));
    } catch (di) {
      console.error(`  (inspect/logs non disponibili: ${String(di.message || di)})`);
    }
    try { session?.close(); } catch { /* noop */ }
    try { relay?.close(); } catch { /* noop */ }
    try { feeder?.kill('SIGKILL'); } catch { /* noop */ }
    try { audioFeeder?.kill('SIGKILL'); } catch { /* noop */ }
    try { await execFileP('docker', ['rm', '-f', containerName]); } catch { /* noop */ }
    free.add(n);
    res.status(known ? e.status : 500).json({
      code: known ? e.code : 'FARM_UNEXPECTED',
      error: known
        ? e.message
        : 'Avvio della stanza non riuscito sul server. Riprova; se persiste serve un intervento dell\'amministratore.',
      detail: known ? e.detail : reason.slice(0, 2000),
    });
  }
});

// ── Eval diagnostico nella tab attiva, via la sessione CDP della stanza ───────
// (usa la connessione CDP già aperta della stanza).
app.post('/rooms/:id/eval', async (req, res) => {
  const r = rooms.get(sanitizeId(req.params.id));
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    res.json({ value: await r.session.evalActive(String(req.body?.expr ?? '')) });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// ── Specchio della sorgente ───────────────────────────────────────────────────
// Il ribaltamento si fa QUI e non sul device della creator: sul telefono o sul
// PC costerebbe una ricodifica di ogni frame (canvas), che fa perdere la
// codifica accelerata e manda la diretta al rallentatore. L'ingestor riavvia
// solo FFmpeg (~200 ms di video); audio e connessione LiveKit restano intatti.
app.post('/rooms/:id/mirror', (req, res) => {
  const r = rooms.get(sanitizeId(req.params.id));
  if (!r) return res.status(404).json({ error: 'not found' });
  const mirror = !!req.body?.mirror;
  if (!r.hasSource || !r.feeder?.stdin?.writable) {
    return res.status(409).json({
      code: 'ROOM_WITHOUT_SOURCE',
      error: 'La stanza non ha una sorgente live: non c\'è nulla da specchiare.',
    });
  }
  r.feeder.stdin.write(`${JSON.stringify({ mirror })}\n`);
  r.mirror = mirror;
  console.log(`room ${r.containerName}: specchio ${mirror ? 'ON' : 'OFF'}`);
  res.json({ mirror });
});

// ── Coerenza dell'identità ────────────────────────────────────────────────────
// Confronta da dove esce davvero la stanza (richiesta geo-IP attraverso il suo
// proxy) con quello che il browser dichiara (fuso, lingua). Le incoerenze fra i
// due sono la causa più comune delle verifiche anti-bot.
app.get('/rooms/:id/identity', async (req, res) => {
  const r = rooms.get(sanitizeId(req.params.id));
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    // La misura che conta è quella del BROWSER: se non coincide con l'uscita
    // del proxy, la stanza sta navigando scoperta pur sembrando protetta.
    const [exit, browserExit, browser] = await Promise.all([
      r.proxyParts ? lookupExitIdentity(r.proxyParts) : Promise.resolve(null),
      r.session.evalDetached(BROWSER_EXIT_PROBE).catch(() => null),
      r.session.evalActive(BROWSER_IDENTITY_PROBE),
    ]);
    res.json({
      // `exit` è ciò che vede il sito: l'uscita del browser quando misurabile.
      exit: browserExit?.ip ? browserExit : exit,
      proxyExit: exit,
      browserExit,
      browser,
      findings: compareIdentity({
        exit,
        browserExit,
        browser,
        proxyConfigured: !!r.proxyParts,
      }),
    });
  } catch (e) {
    res.status(503).json({
      code: 'IDENTITY_CHECK_FAILED',
      error: 'Non è stato possibile verificare l\'identità della stanza: ' +
        'controlla che il proxy risponda e che la stanza abbia una pagina aperta.',
      detail: String((e && e.message) || e).slice(0, 500),
    });
  }
});


/**
 * Esegue la diagnosi appena la stanza è pronta e ne conserva l'esito, così la
 * Console può mostrare subito se qualcosa non torna. Un solo tentativo: se la
 * pagina non è ancora pronta l'operatore può sempre rilanciarla a mano.
 */
function scheduleIdentityCheck(roomId, entry) {
  const timer = setTimeout(async () => {
    if (rooms.get(roomId) !== entry) return;
    try {
      const [exit, browserExit, browser] = await Promise.all([
        entry.proxyParts ? lookupExitIdentity(entry.proxyParts) : Promise.resolve(null),
        entry.session.evalDetached(BROWSER_EXIT_PROBE).catch(() => null),
        entry.session.evalActive(BROWSER_IDENTITY_PROBE),
      ]);
      const findings = compareIdentity({
        exit,
        browserExit,
        browser,
        proxyConfigured: !!entry.proxyParts,
      });
      const worst = findings.some((f) => f.level === 'error')
        ? 'error'
        : findings.some((f) => f.level === 'warn')
          ? 'warn'
          : 'ok';
      entry.identity = { checkedAt: Date.now(), worst, findings };
      if (worst !== 'ok') {
        console.log(`room ${roomId} identità [${worst}]: ${findings[0]?.message}`);
      }
    } catch (e) {
      console.error(`room ${roomId} verifica identità non riuscita: ${String(e.message || e)}`);
    }
  }, IDENTITY_CHECK_DELAY_MS);
  timer.unref?.();
}

// ── Fotogramma della sorgente ─────────────────────────────────────────────────
// Cattura un frame dalla webcam virtuale: è ESATTAMENTE ciò che il sito riceve,
// specchio e scritte compresi. Serve perché i siti mostrano la propria anteprima
// ribaltata (self-view), quindi guardando lì non si capisce cosa esce davvero.
app.get('/rooms/:id/source-frame', async (req, res) => {
  const r = rooms.get(sanitizeId(req.params.id));
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    const { stdout } = await execFileP('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'v4l2', '-i', r.device,
      '-frames:v', '1', '-q:v', '6', '-f', 'mjpeg', 'pipe:1',
    ], { encoding: 'buffer', timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
    res.type('image/jpeg').send(stdout);
  } catch (e) {
    res.status(503).json({
      code: 'SOURCE_FRAME_UNAVAILABLE',
      error: 'Non è stato possibile leggere un fotogramma dalla sorgente.',
      detail: String((e && (e.stderr || e.message)) || e).slice(0, 500),
    });
  }
});

// ── Scena della sorgente (scritte, filtri) ────────────────────────────────────
// Gli overlay dello Studio finiscono nel filtergraph dell'ingestor: è l'unico
// punto in cui si possono comporre senza aggiungere latenza alla stanza (un
// render headless costerebbe secondi). L'ingestor accorpa gli aggiornamenti
// ravvicinati prima di riavviare FFmpeg.
app.post('/rooms/:id/scene', (req, res) => {
  const r = rooms.get(sanitizeId(req.params.id));
  if (!r) return res.status(404).json({ error: 'not found' });
  if (!r.hasSource || !r.feeder?.stdin?.writable) {
    return res.status(409).json({
      code: 'ROOM_WITHOUT_SOURCE',
      error: 'La stanza non ha una sorgente live: non c\'è nulla da comporre.',
    });
  }
  const scene = req.body?.scene ?? {};
  r.feeder.stdin.write(`${JSON.stringify({ scene })}\n`);
  res.json({ applied: true });
});

// ── Stop stanza (il profilo persistente RESTA) ────────────────────────────────
app.post('/rooms/:id/stop', async (req, res) => {
  const stopped = await stopRoom(sanitizeId(req.params.id));
  if (!stopped) return res.status(404).json({ error: 'not found' });
  res.json({ stopped: true });
});

// ── Distruzione stanza: stop + profilo (cookie/sessioni) eliminato ────────────
app.delete('/rooms/:id', async (req, res) => {
  const roomId = sanitizeId(req.params.id);
  await stopRoom(roomId);
  try {
    rmSync(join(PROFILES_DIR, roomId), { recursive: true, force: true });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
  res.json({ destroyed: true });
});

async function stopRoom(roomId) {
  const r = rooms.get(roomId);
  if (!r) return false;
  rooms.delete(roomId);

  try { r.session?.close(); } catch { /* noop */ }
  try { r.relay?.close(); } catch { /* noop */ }
  try { r.feeder?.kill('SIGKILL'); } catch { /* noop */ }
  try { r.audioFeeder?.kill('SIGKILL'); } catch { /* noop */ }
  try { await execFileP('docker', ['rm', '-f', r.containerName]); } catch { /* noop */ }
  free.add(r.n);
  console.log(`room ${roomId} fermata`);
  return true;
}

// ── Viewer WebSocket (operatore da Console) ───────────────────────────────────
// GET /rooms/:id/view?token=exp.sig — HMAC-SHA256(roomId.exp, ORCH_TOKEN):
// il token lo firma il control-plane, l'operatore non vede mai il segreto.
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const m = /^\/rooms\/([^/]+)\/view$/.exec(url.pathname);
  const roomId = m && sanitizeId(decodeURIComponent(m[1]));
  const room = roomId && rooms.get(roomId);
  if (!room || !verifyViewToken(roomId, url.searchParams.get('token') || '')) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    void room.session.addViewer(ws);
  });
});

function verifyViewToken(roomId, token) {
  const [expStr, sig] = token.split('.');
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  const expected = createHmac('sha256', TOKEN).update(`${roomId}.${exp}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sanitizeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '');
}

// ── Errori diagnosticabili ────────────────────────────────────────────────────
// Ogni fallimento di avvio esce come { code, error, detail }: "error" è la frase
// che l'operatore legge nella Console (cosa è successo + cosa fare), "detail" il
// dump tecnico che resta nei log. Senza questa distinzione un modulo kernel
// mancante arrivava all'operatore come uno stderr grezzo di ffmpeg.
class FarmError extends Error {
  constructor(code, message, detail = '', status = 503) {
    super(message);
    this.code = code;
    this.detail = String(detail || '').trim().slice(0, 2000);
    this.status = status;
  }
}

const FARM_MESSAGES = {
  FARM_DEVICE_MISSING:
    'Il server non ha webcam virtuali attive (modulo v4l2loopback non caricato, ' +
    'tipicamente dopo un aggiornamento del kernel). Nessuna stanza può partire ' +
    'finché un amministratore non ripristina la farm sul VPS.',
  FARM_FFMPEG_MISSING:
    'FFmpeg non è installato sul server: la farm non può alimentare la webcam ' +
    "virtuale della stanza. Serve un intervento dell'amministratore.",
  FARM_DOCKER_DOWN:
    'Il motore dei browser (Docker) non risponde sul server. Serve un intervento ' +
    "dell'amministratore.",
};

/**
 * Il device è utilizzabile? null se sì, altrimenti un FarmError già pronto.
 * Distingue i casi che prima finivano tutti nello stesso stderr: device
 * inesistente (modulo non caricato) vs permessi mancanti.
 */
function deviceUsable(device) {
  try {
    statSync(device);
  } catch {
    return new FarmError(
      'FARM_DEVICE_MISSING',
      FARM_MESSAGES.FARM_DEVICE_MISSING,
      device + ' non esiste',
    );
  }
  try {
    accessSync(device, FS.R_OK | FS.W_OK);
  } catch {
    return new FarmError(
      'FARM_DEVICE_PERMISSION',
      `Il server non può usare la webcam virtuale ${device}: permessi mancanti. ` +
        "Serve un intervento dell'amministratore sul VPS.",
      `${device} non leggibile/scrivibile dall'utente uid=${process.getuid?.() ?? '?'}`,
    );
  }
  return null;
}

/**
 * Prende la prima postazione del pool che supera davvero il priming.
 *
 * Serve perché un device può restare in uno stato inconsistente (VIDIOC_G_FMT
 * EINVAL) dopo che un reader lo ha aperto senza un writer attivo: v4l2loopback
 * 0.12.x NON ha il parametro `keep_format` (il kernel lo ignora), quindi il
 * formato fissato dal priming non è garantito a vita. Un device così non deve
 * far fallire l'avvio: esce dal pool e si passa al successivo.
 */
async function acquireDevice() {
  let firstError = null;
  for (const candidate of [...free]) {
    const device = `/dev/video${candidate}`;
    try {
      await prepareDevice(device);
      free.delete(candidate);
      return { n: candidate, device };
    } catch (e) {
      firstError ??= e;
      // Occupato = transitorio: resta nel pool, magari si libera fra poco.
      if (e.code === 'FARM_DEVICE_BUSY') continue;
      free.delete(candidate);
      broken.set(candidate, e.message);
      console.error(
        `device ${device} escluso dal pool [${e.code}]: ${e.detail || e.message}`,
      );
    }
  }
  if (broken.size >= POOL.length) {
    throw new FarmError(
      'FARM_ALL_DEVICES_UNUSABLE',
      'Nessuna postazione browser è utilizzabile sul server: le webcam virtuali ' +
        'sono in stato inconsistente e vanno reinizializzate. Serve un intervento ' +
        "dell'amministratore sul VPS.",
      [...broken.entries()].map(([n, m]) => `video${n}: ${m}`).join(' | '),
    );
  }
  throw (
    firstError ??
    new FarmError(
      'FARM_NO_FREE_DEVICE',
      'Tutte le postazioni browser del server sono occupate (massimo ' +
        POOL.length +
        '). Ferma una stanza per liberarne una.',
    )
  );
}

/**
 * Prepara il device: preflight + priming (~0.4s di nero) per fissare formato e
 * capability PRIMA che Chromium lo apra.
 */
async function prepareDevice(device) {
  const unusable = deviceUsable(device);
  if (unusable) throw unusable;
  try {
    await execFileP('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=1280x720:r=30',
      '-frames:v', '12', '-pix_fmt', 'yuv420p', '-f', 'v4l2', device,
    ], { timeout: 8000 });
  } catch (e) {
    throw classifyPrimingError(e, device);
  }
}

/** stderr di ffmpeg → causa vera (ffmpeg assente, device occupato/permessi/sparito). */
function classifyPrimingError(e, device) {
  const detail = String(e.stderr || e.message || e);
  if (e.code === 'ENOENT' && !detail.includes(device)) {
    return new FarmError('FARM_FFMPEG_MISSING', FARM_MESSAGES.FARM_FFMPEG_MISSING, detail);
  }
  if (/Device or resource busy|Resource temporarily unavailable/i.test(detail)) {
    return new FarmError(
      'FARM_DEVICE_BUSY',
      `La webcam virtuale ${device} è occupata da un altro processo. Riprova tra ` +
        'qualche secondo; se persiste, ferma tutte le stanze e riavviale.',
      detail,
    );
  }
  if (/Permission denied/i.test(detail)) {
    return new FarmError(
      'FARM_DEVICE_PERMISSION',
      `Il server non può usare la webcam virtuale ${device}: permessi mancanti. ` +
        "Serve un intervento dell'amministratore sul VPS.",
      detail,
    );
  }
  // "Unable to open V4L2 device" + "No such file or directory": il device non
  // c'è più (modulo scaricato, o kernel aggiornato senza v4l2loopback).
  if (/Unable to open V4L2 device|No such file or directory|Cannot open video device/i.test(detail)) {
    return new FarmError('FARM_DEVICE_MISSING', FARM_MESSAGES.FARM_DEVICE_MISSING, detail);
  }
  return new FarmError(
    'FARM_DEVICE_PRIMING_FAILED',
    `Preparazione della webcam virtuale ${device} non riuscita sul server. ` +
      "Riprova; se persiste serve un intervento dell'amministratore.",
    detail,
  );
}

/** Errore di `docker run` → causa leggibile (daemon giù, immagine mancante). */
function classifyDockerError(e) {
  const detail = String(e.stderr || e.message || e);
  if (/Cannot connect to the Docker daemon|Is the docker daemon running|ENOENT/i.test(detail)) {
    return new FarmError('FARM_DOCKER_DOWN', FARM_MESSAGES.FARM_DOCKER_DOWN, detail);
  }
  if (/Unable to find image|No such image|pull access denied|manifest unknown/i.test(detail)) {
    return new FarmError(
      'FARM_IMAGE_MISSING',
      `L'immagine del browser (${IMAGE}) non è presente sul server: va rieseguito ` +
        'il deploy della farm.',
      detail,
    );
  }
  return new FarmError(
    'FARM_CONTAINER_START_FAILED',
    'Il browser della stanza non è partito sul server. Riprova; se persiste serve ' +
      "un intervento dell'amministratore.",
    detail,
  );
}

/**
 * Schemi proxy che Chromium accetta in `--proxy-server`, con gli alias che i
 * provider mettono nei loro esempi. `socks5h` (DNS risolto dal proxy) è una
 * convenzione di curl che Chromium NON conosce: passata così com'era faceva
 * fallire ogni navigazione con ERR_NO_SUPPORTED_PROXIES.
 */
const PROXY_SCHEMES = {
  http: 'http',
  https: 'https',
  socks: 'socks5',
  socks4: 'socks4',
  socks4a: 'socks4',
  socks5: 'socks5',
  socks5h: 'socks5',
};

/**
 * Il proxy è utilizzabile da Chromium? Va verificato PRIMA di accendere la
 * stanza: entrambi questi casi producevano un browser che si apriva ma non
 * navigava, senza dire perché.
 */
function assertProxySupported({ scheme, rawScheme, username }) {
  if (!scheme) {
    throw new FarmError(
      'ROOM_PROXY_SCHEME_UNSUPPORTED',
      `Il proxy della stanza usa uno schema che il browser non supporta ` +
        `("${rawScheme}://"). Ammessi: http, https, socks4, socks5 (socks5h vale ` +
        'come socks5). Di solito basta indicare il proxy come ' +
        'host:porta:utente:password, senza schema.',
      `schema "${rawScheme}" non in ${Object.keys(PROXY_SCHEMES).join(',')}`,
      502,
    );
  }
  // NB: un SOCKS con credenziali è supportato, ma non da Chromium: ci pensa il
  // relay per stanza (proxy-relay.mjs), che si autentica lui a monte.
}

/** La stanza ha bisogno del relay? Solo i SOCKS autenticati: Chromium non sa farlo. */
function needsRelay(p) {
  return !!p && !!p.scheme?.startsWith('socks') && !!p.username;
}

/**
 * Verifica che il proxy della stanza risponda PRIMA di accendere il browser.
 * Un proxy scaduto faceva partire una stanza che poi non navigava; peggio,
 * senza proxy funzionante il browser uscirebbe con l'IP del VPS — lo stesso per
 * tutte le stanze, cioè l'opposto di ADR-0011 (un IP per identità). Su HTTP si
 * prova una CONNECT reale, su SOCKS5 l'handshake RFC 1928: così "proxy giù",
 * "credenziali rifiutate" e "richiede credenziali" restano messaggi diversi.
 */
async function checkProxy(parts, timeoutMs = 8000) {
  const { scheme, host, port, username, password } = parts;
  const label = `${host}${port ? `:${port}` : ''}`;

  if (scheme === 'socks5') {
    // Handshake RFC 1928/1929 completo: è lo stesso codice che poi userà il
    // relay, quindi se passa qui la stanza naviga davvero.
    try {
      await probeSocks5(parts, timeoutMs);
      return;
    } catch (e) {
      const detail = String(e.message || e);
      if (/rifiutato utente e password|richiede utente e password/i.test(detail)) {
        throw new FarmError(
          'ROOM_PROXY_AUTH_FAILED',
          `Il proxy della stanza (${label}) risponde ma rifiuta le credenziali. ` +
            'Di solito significa abbonamento al proxy scaduto o esaurito, oppure ' +
            'utente e password da aggiornare nelle impostazioni della stanza.',
          detail,
          502,
        );
      }
      throw new FarmError(
        'ROOM_PROXY_UNREACHABLE',
        `Il proxy della stanza (${label}) non risponde. Controlla che ` +
          "l'abbonamento sia attivo e che host e porta siano corretti, oppure " +
          'togli il proxy dalle impostazioni della stanza per avviarla senza.',
        detail,
        502,
      );
    }
  }
  const down = (detail) =>
    new FarmError(
      'ROOM_PROXY_UNREACHABLE',
      `Il proxy della stanza (${label}) non risponde. Controlla che l'abbonamento ` +
        'sia attivo e che host e porta siano corretti, oppure togli il proxy dalle ' +
        'impostazioni della stanza per avviarla senza.',
      detail,
      502,
    );

  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port: Number(port) || 8080 });
    let settled = false;
    let buf = Buffer.alloc(0);
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(down(`nessuna risposta entro ${timeoutMs}ms`)),
      timeoutMs,
    );

    socket.on('error', (e) => finish(down(String(e.message || e))));
    socket.on('close', () => finish(down('connessione chiusa dal proxy senza risposta')));

    socket.on('connect', () => {
      if (scheme === 'socks4') {
        // SOCKS4 non ha handshake da client: il TCP aperto è tutto ciò che
        // possiamo verificare senza aprire una connessione vera.
        return finish(null);
      }
      const auth = username
        ? 'Proxy-Authorization: Basic ' +
          Buffer.from(`${username}:${password}`).toString('base64') + '\r\n'
        : '';
      socket.write(
        `CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n${auth}\r\n`,
      );
    });

    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);

      const text = buf.toString('latin1');
      if (!text.includes('\r\n')) return;
      const line = text.split('\r\n')[0];
      const status = Number(/^HTTP\/\d\.\d (\d{3})/.exec(text)?.[1] || 0);
      if (status >= 200 && status < 300) return finish(null);
      if (status === 407) {
        return finish(
          new FarmError(
            'ROOM_PROXY_AUTH_FAILED',
            `Il proxy della stanza (${label}) risponde ma rifiuta le credenziali ` +
              '(407). Di solito significa abbonamento al proxy scaduto o esaurito, ' +
              'oppure utente e password da aggiornare nelle impostazioni della stanza.',
            line,
            502,
          ),
        );
      }
      finish(down(`il proxy ha risposto "${line || '?'}"`));
    });
  });
}

/**
 * Normalizza un proxy nei formati che i provider usano davvero:
 *   - scheme://user:pass@host:port  (URL completo)
 *   - user:pass@host:port           (senza scheme)
 *   - host:port:user:pass           (formato Decodo/Smartproxy/Oxylabs)
 *   - host:port                     (senza auth)
 * Ritorna { scheme, host, port, username, password } o null.
 */
function parseProxyParts(proxy) {
  const raw = (proxy || '').trim();
  if (!raw) return null;
  // Con scheme esplicito o credenziali inline @ → lo gestisce URL.
  if (raw.includes('://') || raw.includes('@')) {
    try {
      const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
      const rawScheme = (u.protocol.replace(':', '') || 'http').toLowerCase();
      return {
        // `scheme` è quello che passiamo a Chromium (undefined = non supportato),
        // `rawScheme` quello scritto dall'operatore, per il messaggio d'errore.
        scheme: PROXY_SCHEMES[rawScheme],
        rawScheme,
        host: u.hostname,
        port: u.port,
        username: u.username ? decodeURIComponent(u.username) : '',
        password: u.password ? decodeURIComponent(u.password) : '',
      };
    } catch {
      return null;
    }
  }
  // host:port[:user:pass] — la password può contenere ':' (resto della stringa).
  const parts = raw.split(':');
  if (parts.length >= 4) {
    return {
      scheme: 'http',
      rawScheme: 'http',
      host: parts[0],
      port: parts[1],
      username: parts[2],
      password: parts.slice(3).join(':'),
    };
  }
  if (parts.length === 2) {
    return {
      scheme: 'http',
      rawScheme: 'http',
      host: parts[0],
      port: parts[1],
      username: '',
      password: '',
    };
  }
  return {
    scheme: 'http',
    rawScheme: 'http',
    host: raw,
    port: '',
    username: '',
    password: '',
  };
}

/** → { proxyServer: "scheme://host:port", proxyAuth: {username,password}|null }. */
function parseProxy(proxy) {
  const p = parseProxyParts(proxy);
  if (!p || !p.host) return { proxyServer: null, proxyAuth: null };
  const proxyServer = `${p.scheme || 'http'}://${p.host}${p.port ? `:${p.port}` : ''}`;
  const proxyAuth = p.username ? { username: p.username, password: p.password } : null;
  return { proxyServer, proxyAuth };
}

// bind 0.0.0.0: l'API (control-plane) e il viewer della Console arrivano via
// internet; HTTP protetto dal token, WS dal token HMAC firmato a scadenza.
server.listen(PORT, '0.0.0.0', () =>
  console.log(`farm orchestrator on 0.0.0.0:${PORT} (image ${IMAGE}, profiles ${PROFILES_DIR})`),
);
