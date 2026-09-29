// Diagnostica live LiveFlow → LiveKit.
//
//   node tools/livekit/check-live.mjs            # snapshot singolo (room/track attive ora)
//   node tools/livekit/check-live.mjs --watch    # watch: aspetta che vai live e dà verdetto
//
// In modalità --watch: appena pubblichi una track video l'harness la rileva, poi
// verifica che la connessione REGGA per STABLE_AFTER_S secondi. Se cade prima è il
// sintomo della vecchia instabilità media (WebRTC su interfaccia non-loopback su
// questo setup Windows: ws pubblico = IP LAN invece di localhost). Vedi nota in
// apps/api/.env → LIVEKIT_WS_PUBLIC_URL deve essere ws://localhost:7880 in dev su PC.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sdkPath = require.resolve('livekit-server-sdk', {
  paths: ['C:/Users/Utente/Documents/OF/LiveFlow/node_modules/.pnpm/livekit-server-sdk@2.15.3/node_modules'],
});
const { RoomServiceClient } = await import('file:///' + sdkPath.replace(/\\/g, '/'));

const HOSTS = ['http://localhost:7880', 'http://127.0.0.1:7880', 'http://192.168.1.3:7880'];
const KEY = 'devkey';
const SECRET = 'secret';
const WATCH = process.argv.includes('--watch');
const POLL_MS = 2000;
const STABLE_AFTER_S = 20; // oltre i ~15s del vecchio drop → consideriamo stabile

async function firstReachable() {
  for (const host of HOSTS) {
    try {
      const svc = new RoomServiceClient(host, KEY, SECRET);
      await svc.listRooms();
      return { svc, host };
    } catch { /* prova il prossimo */ }
  }
  return null;
}

function ts() { return new Date().toLocaleTimeString('it-IT'); }

async function snapshot(svc, host) {
  const rooms = await svc.listRooms();
  console.log(`\n[${ts()}] === ${host} ===`);
  if (!rooms.length) { console.log('  (nessuna room attiva)'); return []; }
  const videoPubs = [];
  for (const r of rooms) {
    console.log(`ROOM "${r.name}" part=${r.numParticipants} pub=${r.numPublishers}`);
    const parts = await svc.listParticipants(r.name);
    for (const p of parts) {
      console.log(`  • ${p.identity} state=${p.state} tracks=${p.tracks.length}`);
      for (const t of p.tracks) {
        const isVideo = t.type === 1 || t.type === 'VIDEO';
        console.log(`      - ${t.type} "${t.name}" muted=${t.muted} ${t.width}x${t.height}`);
        if (isVideo && !t.muted) videoPubs.push({ room: r.name, identity: p.identity, w: t.width, h: t.height });
      }
    }
  }
  return videoPubs;
}

const target = await firstReachable();
if (!target) {
  console.error('LiveKit non raggiungibile su nessun host noto. È avviato? (porta 7880)');
  process.exit(2);
}
const { svc, host } = target;

if (!WATCH) {
  await snapshot(svc, host);
  // niente process.exit(): forzarlo mentre i socket keep-alive del client si
  // chiudono provoca su Windows/Node l'assertion UV_HANDLE_CLOSING. Lasciamo
  // drenare l'event loop; il processo esce da solo in <1s.
  process.exitCode = 0;
} else {
  watchLoop();
}

// ── Watch mode ──────────────────────────────────────────────────────────────
function watchLoop() {
console.log(`Watch attivo su ${host}. Vai live dall'app creator (localhost:3100)…`);
console.log(`Verdetto: track video stabile per ≥${STABLE_AFTER_S}s = PASS.\n`);
let liveSince = null;     // epoch ms da cui vedo una track video
let lastSeenLive = false;

setInterval(async () => {
  let videoPubs = [];
  try { videoPubs = await snapshot(svc, host); }
  catch (e) { console.log(`[${ts()}] errore polling: ${(e.message || e).split('\n')[0]}`); return; }

  const isLive = videoPubs.length > 0;
  if (isLive && !lastSeenLive) {
    liveSince = Date.now();
    const v = videoPubs[0];
    console.log(`\n🟢 [${ts()}] LIVE rilevato: ${v.identity} ${v.w}x${v.h} (room ${v.room})`);
  } else if (!isLive && lastSeenLive) {
    const heldS = ((Date.now() - liveSince) / 1000);
    if (heldS < STABLE_AFTER_S) {
      console.log(`\n🔴 [${ts()}] FAIL — track caduta dopo ${heldS.toFixed(1)}s (<${STABLE_AFTER_S}s).`);
      console.log(`   Sintomo instabilità media. Verifica LIVEKIT_WS_PUBLIC_URL=ws://localhost:7880 in apps/api/.env e RIAVVIA l'api.`);
    } else {
      console.log(`\n⚪ [${ts()}] Stream terminato dopo ${heldS.toFixed(1)}s (stop volontario, ok).`);
    }
    liveSince = null;
  } else if (isLive && liveSince) {
    const heldS = ((Date.now() - liveSince) / 1000);
    if (heldS >= STABLE_AFTER_S && !target._passed) {
      target._passed = true;
      console.log(`\n✅ [${ts()}] PASS — track video stabile da ${heldS.toFixed(0)}s. La fix regge.`);
    }
  }
  lastSeenLive = isLive;
}, POLL_MS);
}
