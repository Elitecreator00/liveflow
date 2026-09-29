// Spike S2 — sottoscrive una LiveKit Room e scrive i frame video su /dev/videoN
// (webcam virtuale v4l2loopback) via FFmpeg.
//
//   LIVEKIT_WS_URL=ws://127.0.0.1:7880 LIVEKIT_TOKEN=<viewerToken> \
//   V4L2_DEVICE=/dev/video10 node ingestor.mjs
//
// Richiede sul VPS:  npm i @livekit/rtc-node   e   ffmpeg nel PATH.
// Il token si genera con: lk token create --join --room <r> --identity ingestor ...
import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import {
  Room,
  RoomEvent,
  VideoStream,
  VideoBufferType,
  TrackKind,
} from '@livekit/rtc-node';

const WS_URL = process.env.LIVEKIT_WS_URL ?? 'ws://127.0.0.1:7880';
const TOKEN = process.env.LIVEKIT_TOKEN;
const DEVICE = process.env.V4L2_DEVICE ?? '/dev/video10';

if (!TOKEN) {
  console.error('Serve LIVEKIT_TOKEN. Vedi README.md (S2).');
  process.exit(1);
}

// Output FISSO verso il device: così il formato v4l2 non cambia mai (1280x720),
// indipendentemente dal layer simulcast in arrivo (320x180 / 640x360 / 1280x720).
const OUT_W = 1280;
const OUT_H = 720;

let ff = null;
let ffW = 0;
let ffH = 0;

// FFmpeg legge frame raw RGBA della dimensione corrente in ingresso e li SCALA a
// OUT_WxOUT_H prima di scriverli sul device v4l2 come yuv420p.
function startFfmpeg(width, height) {
  const errLog = openSync('ffmpeg.log', 'a');
  const proc = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'warning',
      '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`, '-r', '30',
      '-i', 'pipe:0',
      '-vf', `scale=${OUT_W}:${OUT_H}`,
      '-pix_fmt', 'yuv420p', '-f', 'v4l2', DEVICE,
    ],
    { stdio: ['pipe', errLog, errLog] },
  );
  // Senza handler, un EPIPE (ffmpeg morto) farebbe crashare l'intero processo.
  proc.stdin.on('error', (e) => console.error(`ffmpeg stdin ${e.code}`));
  proc.on('exit', (code) => console.error(`ffmpeg uscito con code ${code}`));
  console.error(`ffmpeg avviato: in ${width}x${height} -> out ${OUT_W}x${OUT_H} -> ${DEVICE}`);
  return proc;
}

// Se la dimensione in ingresso cambia (cambio layer simulcast), riavvia ffmpeg:
// il pipe rawvideo ha dimensione fissa, non può variare a metà.
function ensureFfmpeg(width, height) {
  if (ff && (width !== ffW || height !== ffH)) {
    try { ff.stdin.end(); ff.kill('SIGKILL'); } catch { /* noop */ }
    ff = null;
  }
  if (!ff) { ff = startFfmpeg(width, height); ffW = width; ffH = height; }
  return ff;
}

async function pump(track) {
  const stream = new VideoStream(track);
  for await (const ev of stream) {
    const rgba = ev.frame.convert(VideoBufferType.RGBA);
    const proc = ensureFfmpeg(rgba.width, rgba.height);
    // Buffer.from(Uint8Array) copia esattamente la view (gestisce byteOffset/length).
    if (proc.stdin.writable) proc.stdin.write(Buffer.from(rgba.data));
  }
}

async function main() {
  const room = new Room();
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind !== TrackKind.KIND_VIDEO) return;
    console.error(`Track video sottoscritta (${track.sid}) — pump su ${DEVICE}`);
    pump(track).catch((e) => console.error('pump interrotto:', e));
  });

  await room.connect(WS_URL, TOKEN, { autoSubscribe: true, dynacast: false });
  console.error(`Connesso a ${WS_URL}. In attesa di una track video...`);
}

main().catch((e) => { console.error('ingestor fallito:', e); process.exit(1); });
