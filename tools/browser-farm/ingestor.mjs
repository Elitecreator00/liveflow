// Ingestor — sottoscrive una LiveKit Room e riversa la sorgente creator nella
// stanza browser: video su /dev/videoN (webcam virtuale v4l2loopback) e audio su
// un loopback ALSA, entrambi via FFmpeg.
//
//   LIVEKIT_WS_URL=ws://127.0.0.1:7880 LIVEKIT_TOKEN=<viewerToken> \
//   V4L2_DEVICE=/dev/video10 ALSA_DEVICE=hw:Loopback,0,0 [MIRROR=1] node ingestor.mjs
//
// Richiede sul VPS: npm i @livekit/rtc-node e ffmpeg nel PATH.
//
// SPECCHIO: il ribaltamento avviene QUI, non sul telefono/PC della creator.
// Specchiare lato client obbliga a ricodificare ogni frame (canvas), il che fa
// perdere la codifica accelerata e su una webcam da PC a 720p manda la diretta al
// rallentatore. Qui è un filtro `hflip` di FFmpeg, praticamente gratis.
//
// SCENA: per lo stesso motivo, anche scritte e filtri dello Studio vengono
// applicati qui (vedi scene-filters.mjs) invece che da un browser headless:
// FFmpeg è già nel percorso, quindi non si aggiunge né un passaggio né
// latenza a una stanza che deve restare reattiva.
//
// Comandi a caldo, una riga JSON su stdin: {"mirror":true} e {"scene":{…}}.
import { spawn } from 'node:child_process';
import { openSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFilterChain, sceneShapeKey, outputSizeFor, LANDSCAPE } from './scene-filters.mjs';
import { createInterface } from 'node:readline';
import {
  Room,
  RoomEvent,
  VideoStream,
  VideoBufferType,
  AudioStream,
  TrackKind,
} from '@livekit/rtc-node';

const WS_URL = process.env.LIVEKIT_WS_URL ?? 'ws://127.0.0.1:7880';
const TOKEN = process.env.LIVEKIT_TOKEN;
const DEVICE = process.env.V4L2_DEVICE ?? '/dev/video10';
// Device ALSA loopback (lato playback) su cui scrivere l'audio della creator:
// la PulseAudio del container cattura il lato capture e lo espone come microfono.
// Vuoto = audio disabilitato (back-compat / stanza senza snd-aloop).
const ALSA_DEVICE = process.env.ALSA_DEVICE ?? '';

if (!TOKEN) {
  console.error('Serve LIVEKIT_TOKEN. Vedi README.md (S2).');
  process.exit(1);
}

// Attesa prima di applicare una scena: gli aggiornamenti dell'editor arrivano
// a raffica mentre si trascina uno slider.
const SCENE_DEBOUNCE_MS = 400;

// Quanto il vecchio FFmpeg resta aperto dopo che il nuovo ha preso il device.
const HANDOVER_MS = 400;

// Formato del device: deciso dal PRIMO frame (telefono → 720x1280, PC →
// 1280x720) e poi bloccato per tutta la vita dell'ingestor. Così il formato
// v4l2 non cambia mai mentre il browser lo legge, qualunque layer simulcast
// arrivi. È verificato sul VPS: dopo il priming (1280x720) il primo writer può
// fissare un formato diverso finché nessuno legge; cambiarlo con un reader
// aperto invece non è sicuro con v4l2loopback 0.12. Se la sorgente cambia
// orientamento a diretta avviata, l'immagine si adatta con bande nere.
let out = null;

let mirror = process.env.MIRROR === '1';
// Scena dello Studio (overlay + filtri). Arriva all'avvio via SCENE e poi si
// aggiorna a caldo: è ciò che rende visibile nella stanza quello che
// l'operatore scrive nell'editor.
let scene = parseSceneEnv(process.env.SCENE);
let sceneVersion = 0;
let pendingScene = null;
let sceneTimer = null;
let ff = null;
let ffW = 0;
let ffH = 0;
let ffMirror = mirror;
let ffSceneVersion = 0;

function parseSceneEnv(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.error('SCENE non è JSON valido: ignorata');
    return {};
  }
}

/** File d'appoggio per i testi: mai dentro il filtergraph (vedi scene-filters). */
function textFileFor(index) {
  const tag = DEVICE.replace(/[^a-zA-Z0-9]/g, '_');
  return join(tmpdir(), `lf-text-${tag}-${index}.txt`);
}
// Backpressure: mentre il pipe verso FFmpeg è pieno, i frame nuovi si BUTTANO.
// Accodarli farebbe crescere il ritardo a ogni secondo che passa; in una diretta
// l'unico frame che conta è l'ultimo.
let paused = false;
let framesIn = 0;
let framesDropped = 0;

/**
 * FFmpeg legge frame raw della dimensione corrente in ingresso e li adatta a
 * `out` (senza deformarli) prima di scriverli sul device v4l2 come yuv420p.
 *
 * I frame arrivano in I420 (lo stesso formato del decoder): niente conversione a
 * RGBA, che costava una trasformazione per frame e triplicava i byte nel pipe
 * (~27 MB/s contro ~10 MB/s a 360p30).
 */
function startFfmpeg(width, height) {
  const errLog = openSync('ffmpeg.log', 'a');
  if (!out) {
    out = outputSizeFor(width, height);
    console.error(
      `formato webcam virtuale: ${out.width}x${out.height} ` +
        `(sorgente ${width}x${height}, ${out.height > out.width ? 'verticale' : 'orizzontale'})`,
    );
  }
  // Specchio + filtri + scritte della scena, in un filtergraph solo: FFmpeg è
  // già nel percorso, quindi non costa un passaggio in più né latenza.
  const { chain, files } = buildFilterChain({
    scene,
    mirror,
    width: out.width,
    height: out.height,
    textFileFor,
  });
  writeTextFiles(files);
  const filters = chain;
  const proc = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'warning',
      // Nessun buffering in ingresso: ogni frame va verso il device appena arriva.
      '-fflags', 'nobuffer', '-flags', 'low_delay',
      '-f', 'rawvideo', '-pix_fmt', 'yuv420p',
      '-s', `${width}x${height}`, '-r', '30',
      '-i', 'pipe:0',
      '-vf', filters,
      '-sws_flags', 'fast_bilinear',
      '-pix_fmt', 'yuv420p', '-f', 'v4l2', DEVICE,
    ],
    { stdio: ['pipe', errLog, errLog] },
  );
  // Senza handler, un EPIPE (ffmpeg morto) farebbe crashare l'intero processo.
  proc.stdin.on('error', (e) => console.error(`ffmpeg stdin ${e.code}`));
  proc.on('exit', (code) => console.error(`ffmpeg uscito con code ${code}`));
  paused = false;
  ffMirror = mirror;
  ffSceneVersion = sceneVersion;
  console.error(
    `ffmpeg avviato: in ${width}x${height} i420 -> out ${out.width}x${out.height}` +
      `${mirror ? ' (specchio)' : ''} -> ${DEVICE} | filtri: ${filters}`,
  );
  return proc;
}

/**
 * Scrive i testi degli overlay. Rename atomico: `drawtext` con reload=1 rilegge
 * il file a ogni frame e non deve mai trovarlo troncato.
 */
function writeTextFiles(files) {
  for (const f of files) {
    try {
      const tmp = `${f.path}.tmp`;
      writeFileSync(tmp, f.content, 'utf8');
      renameSync(tmp, f.path);
    } catch (e) {
      console.error(`testo overlay non scritto (${f.path}): ${e.message}`);
    }
  }
}

/**
 * Riavvia FFmpeg se cambia qualcosa che il pipe non può cambiare a metà: la
 * dimensione dei frame (cambio layer simulcast o rotazione camera), lo specchio
 * o la scena.
 */
function ensureFfmpeg(width, height) {
  const changed =
    ff &&
    (width !== ffW || height !== ffH || mirror !== ffMirror || sceneVersion !== ffSceneVersion);

  if (changed) {
    // Il vecchio processo si chiude DOPO che il nuovo ha aperto il device: se
    // v4l2loopback resta senza writer azzera il formato, e chi sta già leggendo
    // (il browser della stanza, e quindi il sito) si ferma sull'ultimo frame.
    const previous = ff;
    ff = startFfmpeg(width, height);
    ffW = width;
    ffH = height;
    setTimeout(() => {
      try { previous.stdin.end(); previous.kill('SIGKILL'); } catch { /* noop */ }
    }, HANDOVER_MS);
    return ff;
  }

  if (!ff) { ff = startFfmpeg(width, height); ffW = width; ffH = height; }
  return ff;
}

async function pump(track) {
  const stream = new VideoStream(track);
  for await (const ev of stream) {
    const frame = ev.frame.convert(VideoBufferType.I420);
    framesIn += 1;
    const proc = ensureFfmpeg(frame.width, frame.height);
    if (!proc.stdin.writable) continue;

    // Il pipe è pieno: si scarta finché FFmpeg non si è ripreso, così il ritardo
    // resta costante invece di accumularsi in memoria.
    if (paused) {
      framesDropped += 1;
      continue;
    }
    const buf = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    if (!proc.stdin.write(buf)) {
      paused = true;
      proc.stdin.once('drain', () => { paused = false; });
    }
  }
}

// ── Audio: track LiveKit → microfono virtuale (ALSA loopback) via FFmpeg ──────
// PCM s16le 48k mono dallo stream → device ALSA (hw:Loopback,0,N). FFmpeg legge
// raw dal pipe e lo scrive sul loopback; la PulseAudio del container cattura
// hw:Loopback,1,N e lo pubblica come "Microphone" (vedi entrypoint.sh).
// NB: l'audio non si scarta mai — un buco si sente, un frame video no.
let aff = null;
function startAudioFfmpeg() {
  const errLog = openSync('ffmpeg-audio.log', 'a');
  const proc = spawn(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'warning',
      '-f', 's16le', '-ar', '48000', '-ac', '1', '-i', 'pipe:0',
      '-f', 'alsa', ALSA_DEVICE,
    ],
    { stdio: ['pipe', errLog, errLog] },
  );
  proc.stdin.on('error', (e) => console.error(`ffmpeg-audio stdin ${e.code}`));
  proc.on('exit', (code) => {
    console.error(`ffmpeg-audio uscito con code ${code}`);
    if (aff === proc) aff = null;
  });
  console.error(`ffmpeg-audio avviato: in 48000/mono -> ${ALSA_DEVICE}`);
  return proc;
}

async function pumpAudio(track) {
  // Forza 48kHz mono: formato fisso verso il loopback (niente rinegoziazioni).
  const stream = new AudioStream(track, 48000, 1);
  for await (const frame of stream) {
    if (!aff) aff = startAudioFfmpeg();
    const d = frame.data; // Int16Array PCM interlacciato
    if (aff.stdin.writable) aff.stdin.write(Buffer.from(d.buffer, d.byteOffset, d.byteLength));
  }
}

// ── Comandi a caldo (stdin, una riga JSON) ───────────────────────────────────
// {"mirror":true} — l'orchestratore lo usa quando la creator tocca lo specchio:
// riavvia solo FFmpeg (~200 ms di video), la connessione LiveKit e l'audio
// restano intatti.
function listenCommands() {
  if (!process.stdin.readable) return;
  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    try {
      const cmd = JSON.parse(text);
      if (typeof cmd.mirror === 'boolean' && cmd.mirror !== mirror) {
        mirror = cmd.mirror;
        console.error(`comando: specchio ${mirror ? 'ON' : 'OFF'}`);
        // Il riavvio avviene al primo frame utile, dentro ensureFfmpeg.
      }
      if (cmd.scene && typeof cmd.scene === 'object') {
        // Mentre l'operatore trascina uno slider arrivano decine di
        // aggiornamenti: si applica l'ultimo, dopo una breve quiete, per non
        // riavviare FFmpeg a raffica.
        pendingScene = cmd.scene;
        if (sceneTimer) clearTimeout(sceneTimer);
        sceneTimer = setTimeout(() => {
          const next = pendingScene ?? {};
          pendingScene = null;
          // Solo il testo è cambiato? Basta riscrivere i file: drawtext li
          // rilegge da solo e nessuno vede uno stacco. Il riavvio serve solo se
          // cambia la forma del filtergraph.
          const sameShape = sceneShapeKey(next) === sceneShapeKey(scene);
          scene = next;
          if (sameShape) {
            const size = out ?? LANDSCAPE;
            const { files } = buildFilterChain({
              scene,
              mirror,
              width: size.width,
              height: size.height,
              textFileFor,
            });
            writeTextFiles(files);
            console.error('comando: testo aggiornato a caldo (nessun riavvio)');
            return;
          }
          sceneVersion += 1;
          console.error(
            `comando: scena aggiornata (v${sceneVersion}, ` +
              `${scene.overlays?.length ?? 0} overlay)`,
          );
        }, SCENE_DEBOUNCE_MS);
      }
    } catch {
      console.error(`comando non valido: ${text.slice(0, 80)}`);
    }
  });
}

// Diagnostica: fps effettivi e frame scartati. È il primo posto dove guardare
// quando qualcuno dice "la diretta è lenta".
function startStats() {
  let lastIn = 0;
  let lastDropped = 0;
  setInterval(() => {
    const fps = framesIn - lastIn;
    const dropped = framesDropped - lastDropped;
    lastIn = framesIn;
    lastDropped = framesDropped;
    if (fps || dropped) {
      console.error(`stats: ${fps} fps in, ${dropped} scartati, ${ffW}x${ffH}`);
    }
  }, 10_000).unref();
}

async function main() {
  const room = new Room();
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === TrackKind.KIND_VIDEO) {
      console.error(`Track video sottoscritta (${track.sid}) — pump su ${DEVICE}`);
      pump(track).catch((e) => console.error('pump video interrotto:', e));
    } else if (track.kind === TrackKind.KIND_AUDIO && ALSA_DEVICE) {
      console.error(`Track audio sottoscritta (${track.sid}) — pump su ${ALSA_DEVICE}`);
      pumpAudio(track).catch((e) => console.error('pump audio interrotto:', e));
    }
  });

  listenCommands();
  startStats();

  await room.connect(WS_URL, TOKEN, { autoSubscribe: true, dynacast: false });
  console.error(`Connesso a ${WS_URL}. In attesa di una track video...`);
}

main().catch((e) => { console.error('ingestor fallito:', e); process.exit(1); });
