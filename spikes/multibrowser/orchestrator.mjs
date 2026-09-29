// LiveFlow — Data-plane orchestrator (VPS).
// Riceve una "launch spec" dal control-plane (API) e accende una sessione browser
// ISOLATA: webcam virtuale dedicata + ingestor (sorgente LiveKit -> device) +
// container Neko (browser remoto) con proxy + fingerprint. Tear-down su DELETE.
//
// Avvio: ORCH_TOKEN=<segreto> node orchestrator.mjs   (bind 127.0.0.1:7090)
import express from 'express';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync } from 'node:fs';
const execFileP = promisify(execFile);

const PORT = Number(process.env.ORCH_PORT || 7090);
const TOKEN = process.env.ORCH_TOKEN || 'lf-orch-dev';
// IP pubblico del VPS: usato per il NAT1TO1 di Neko e per l'URL operatore, cosi'
// il browser dell'operatore (sul suo PC) raggiunge la sessione via internet.
const PUBLIC_HOST = process.env.PUBLIC_HOST || '57.131.31.233';
const INGESTOR = '/home/ubuntu/liveflow-multibrowser/ingestor.mjs';
const POLICY_BASE = '/home/ubuntu/liveflow-orchestrator/policies';

// Pool webcam virtuali: /dev/video10..17 (creati da setup-orchestrator.sh).
const POOL = [10, 11, 12, 13, 14, 15, 16, 17];
const free = new Set(POOL);
const sessions = new Map(); // sessionId -> {n, device, ing, name, webPort, muxPort, startedAt}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if ((req.headers['x-orch-token'] || '') !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
});

app.get('/health', (_req, res) =>
  res.json({ ok: true, freeDevices: free.size, active: [...sessions.keys()] }),
);

app.get('/sessions', (_req, res) =>
  res.json([...sessions.entries()].map(([id, s]) => ({
    sessionId: id, device: s.device, name: s.name,
    webPort: s.webPort, nekoUrl: `http://127.0.0.1:${s.webPort}/`, startedAt: s.startedAt,
  }))),
);

app.post('/sessions', async (req, res) => {
  const { sessionId, wsUrl, viewerToken, proxy, siteLabel } = req.body || {};
  if (!sessionId || !wsUrl || !viewerToken) {
    return res.status(400).json({ error: 'sessionId, wsUrl, viewerToken required' });
  }
  if (sessions.has(sessionId)) return res.status(409).json({ error: 'session exists' });
  const n = [...free][0];
  if (n === undefined) return res.status(503).json({ error: 'no free device' });
  free.delete(n);

  const device = `/dev/video${n}`;
  const webPort = 8100 + n; // 8110..8117 (UI Neko)
  const muxPort = 8200 + n; // 8210..8217 (WebRTC TCP mux)
  const name = `lf-sess-${String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)}`;
  let ing = null;

  try {
    // 1) ingestor host: sorgente LiveKit -> /dev/videoN
    ing = spawn('node', [INGESTOR], {
      env: { ...process.env, LIVEKIT_WS_URL: wsUrl, LIVEKIT_TOKEN: viewerToken, V4L2_DEVICE: device },
      stdio: 'ignore',
    });

    // 2) proxy per-sessione via managed policy di Chromium (host:port)
    const policyMount = [];
    if (proxy) {
      const pdir = `${POLICY_BASE}/${name}`;
      mkdirSync(pdir, { recursive: true });
      writeFileSync(`${pdir}/proxy.json`, JSON.stringify({ ProxyMode: 'fixed_servers', ProxyServer: proxy }));
      policyMount.push('-v', `${pdir}:/etc/chromium/policies/managed:ro`);
    }

    // 3) container Neko isolato (browser remoto) con la webcam virtuale mappata
    const args = [
      'run', '-d', '--name', name, '--restart', 'no',
      '-p', `0.0.0.0:${webPort}:8080`,
      '-p', `0.0.0.0:${muxPort}:${muxPort}`,
      '--device', `${device}:${device}`,
      '--shm-size=1g',
      '-e', 'NEKO_DESKTOP_SCREEN=1280x720@30',
      '-e', 'NEKO_MEMBER_PROVIDER=multiuser',
      '-e', 'NEKO_MEMBER_MULTIUSER_USER_PASSWORD=neko',
      '-e', 'NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=admin',
      '-e', 'NEKO_WEBRTC_ICELITE=true',
      '-e', `NEKO_WEBRTC_NAT1TO1=${PUBLIC_HOST}`,
      '-e', `NEKO_WEBRTC_TCPMUX=${muxPort}`,
      ...policyMount,
      'm1k1o/neko:chromium',
    ];
    const { stdout } = await execFileP('docker', args);

    sessions.set(sessionId, { n, device, ing, name, webPort, muxPort, startedAt: Date.now() });
    res.json({
      sessionId, device, containerId: stdout.trim().slice(0, 12),
      webPort, muxPort, nekoUrl: `http://${PUBLIC_HOST}:${webPort}/`, siteLabel: siteLabel || null,
    });
  } catch (e) {
    try { ing && ing.kill('SIGKILL'); } catch { /* noop */ }
    try { await execFileP('docker', ['rm', '-f', name]); } catch { /* noop */ }
    free.add(n);
    res.status(500).json({ error: String(e && (e.stderr || e.message) || e) });
  }
});

app.delete('/sessions/:id', async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  try { await execFileP('docker', ['rm', '-f', s.name]); } catch { /* noop */ }
  try { s.ing.kill('SIGKILL'); } catch { /* noop */ }
  sessions.delete(req.params.id);
  free.add(s.n);
  res.json({ stopped: true });
});

// bind 0.0.0.0: l'API (in dev sul PC) lo raggiunge via internet, protetto dal token.
app.listen(PORT, '0.0.0.0', () => console.log(`orchestrator on 0.0.0.0:${PORT} (public host ${PUBLIC_HOST})`));
