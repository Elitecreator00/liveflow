"use strict";

/**
 * LiveFlow PoC — Orchestrator
 *
 * Simula il ruolo di apps/api nel flusso reale:
 *
 * 1. Genera un access token LiveKit per il publisher di test
 *    (in produzione: il token è generato al momento della sessione Go Live)
 *
 * 2. Avvia un LiveKit Egress di tipo WebCompositeEgress:
 *    - URL template: http://scene-server:3000/?room=poc-room
 *    - Output RTMP: rtmp://mediamtx:1935/live/composited
 *    (Egress apre Chrome headless, carica la pagina scena, cattura il composito,
 *     encode H.264, e pusha RTMP verso MediaMTX)
 *
 * 3. Avvia un processo FFmpeg di fan-out (simula ADR-0002):
 *    Legge il composito da MediaMTX → pusha verso rtmp-dummy:1935/live/fanout
 *    (In produzione: N processi FFmpeg, uno per piattaforma)
 *
 * 4. Demo overlay update:
 *    Ogni 10 secondi aggiorna il testo overlay chiamando l'API del scene-server
 *    (simula le azioni dell'operatore dalla dashboard)
 */

import("node-fetch").then(({ default: fetch }) => {
  runOrchestrator(fetch).catch((err) => {
    console.error("[orchestrator] Errore fatale:", err);
    process.exit(1);
  });
});

async function runOrchestrator(fetch) {
  const LIVEKIT_URL    = "http://livekit:7880";
  const LIVEKIT_KEY    = "devkey";
  const LIVEKIT_SECRET = "secret";
  const ROOM_NAME      = "poc-room";
  const SCENE_API_URL  = "http://scene-server:3001";
  const MEDIAMTX_URL   = "rtmp://mediamtx:1935/live/composited";
  const FANOUT_URL     = "rtmp://rtmp-dummy:1935/live/fanout";

  console.log("[orchestrator] Avvio — LiveFlow Compositing PoC");
  console.log("[orchestrator] LiveKit URL:", LIVEKIT_URL);

  // ── Attendi che i servizi siano pronti ──────────────────────────
  await waitForService("http://livekit:7880/", "LiveKit", fetch, 60);
  await waitForService("http://scene-server:3000/health", "Scene Server", fetch, 30);
  await waitForService("http://mediamtx:9997/v3/paths/list", "MediaMTX", fetch, 30);

  // ── 1. Genera token LiveKit ──────────────────────────────────────
  console.log("[orchestrator] Generazione token LiveKit...");
  const { AccessToken } = await import("livekit-server-sdk");

  // Token per il publisher (telefono/test-source) — ha permesso di pubblicare
  const publisherToken = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, {
    identity: "test-creator",
    name: "Test Creator",
  });
  publisherToken.addGrant({ roomJoin: true, room: ROOM_NAME, canPublish: true, canSubscribe: false });
  const publisherJwt = await publisherToken.toJwt();
  console.log("[orchestrator] Publisher JWT generato (prime 60 char):", publisherJwt.substring(0, 60) + "...");

  // Token per Egress — usato nell'URL della pagina scena
  const egressToken = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, {
    identity: "egress-renderer",
    name: "Egress Renderer",
  });
  egressToken.addGrant({ roomJoin: true, room: ROOM_NAME, canPublish: false, canSubscribe: true, hidden: true });
  const egressJwt = await egressToken.toJwt();

  // ── 2. Avvia LiveKit Egress ─────────────────────────────────────
  // Usa l'API REST di LiveKit Egress per avviare un WebCompositeEgress
  // (l'SDK livekit-server-sdk espone EgressClient per questo)
  console.log("[orchestrator] Avvio LiveKit Egress...");

  const { EgressClient } = await import("livekit-server-sdk");
  const egressClient = new EgressClient(LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET);

  // URL della pagina scena: Egress la aprirà con Chrome headless
  const sceneUrl = `http://scene-server:3000/?room=${ROOM_NAME}&lvToken=${encodeURIComponent(egressJwt)}`;

  let egressInfo;
  try {
    egressInfo = await egressClient.startWebEgress(ROOM_NAME, {
      url: sceneUrl,
      audioOnly: false,
      videoOnly: false,
      awaitStartSignal: false,
      // Output RTMP verso MediaMTX
      stream: {
        urls: [MEDIAMTX_URL],
      },
      // Dimensioni del virtual display (devono corrispondere al CSS della pagina scena: 1280x720)
      layout: {
        width: 1280,
        height: 720,
        depth: 24,
      },
    });
    console.log("[orchestrator] Egress avviato — ID:", egressInfo.egressId);
    console.log("[orchestrator] Egress status:", egressInfo.status);
    console.log("[orchestrator] URL scena:", sceneUrl);
  } catch (err) {
    console.error("[orchestrator] Errore avvio Egress:", err.message);
    console.error("[orchestrator] Dettaglio:", err);
    console.log("[orchestrator] Continuando senza Egress (verifica che livekit-egress sia avviato)");
  }

  // ── 3. Attendi che MediaMTX veda il composito ───────────────────
  console.log("[orchestrator] Attendo stream composito su MediaMTX...");
  await waitForRtmpPath("http://mediamtx:9997/v3/paths/list", "composited", fetch, 90);

  // ── 4. Avvia FFmpeg fan-out (simula ADR-0002) ───────────────────
  console.log("[orchestrator] Avvio FFmpeg fan-out verso rtmp-dummy...");
  const { spawn } = await import("child_process");

  const ffmpegFanout = spawn("ffmpeg", [
    "-re",
    "-i", MEDIAMTX_URL,
    "-c", "copy",    // pass-through: nessun re-encode nel fan-out (ADR-0002 pattern)
    "-f", "flv",
    FANOUT_URL,
  ], { stdio: "inherit" });

  ffmpegFanout.on("exit", (code, signal) => {
    console.log(`[orchestrator] FFmpeg fan-out terminato — code=${code} signal=${signal}`);
  });
  ffmpegFanout.on("error", (err) => {
    console.error("[orchestrator] FFmpeg fan-out errore:", err.message);
  });

  console.log("[orchestrator] Fan-out FFmpeg avviato (PID:", ffmpegFanout.pid, ")");
  console.log("[orchestrator] Stream composito disponibile su:");
  console.log("   RTMP composito:  rtmp://localhost:1935/live/composited");
  console.log("   HLS composito:   http://localhost:8888/live/composited");
  console.log("   HLS fan-out:     http://localhost:8081/live/fanout");
  console.log("   Overlay API:     http://localhost:3001/overlays");

  // ── 5. Demo: aggiorna overlay ogni 10 secondi ───────────────────
  let updateCount = 0;
  const overlayMessages = [
    "Overlay aggiornato dall'operatore — messaggio 1",
    "LiveFlow Studio — compositing cloud attivo",
    "Overlay dinamico live senza interruzione stream",
    "Testo aggiornato in < 200ms dall'editor dashboard",
  ];

  async function updateOverlay() {
    updateCount++;
    const msg = overlayMessages[updateCount % overlayMessages.length];
    const body = {
      bottomText: msg,
      creatorName: `Creator ${updateCount}`,
      topText: updateCount % 2 === 0 ? "LIVE" : "ON AIR",
    };
    try {
      const res = await fetch(`${SCENE_API_URL}/overlays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      console.log(`[orchestrator] Overlay update #${updateCount} inviato:`, body.bottomText);
    } catch (err) {
      console.error("[orchestrator] Errore update overlay:", err.message);
    }
  }

  // Avvia demo overlay updates
  const overlayInterval = setInterval(updateOverlay, 10_000);

  // Cleanup on exit
  process.on("SIGTERM", () => {
    console.log("[orchestrator] SIGTERM ricevuto — cleanup...");
    clearInterval(overlayInterval);
    ffmpegFanout.kill("SIGTERM");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("[orchestrator] SIGINT ricevuto — cleanup...");
    clearInterval(overlayInterval);
    ffmpegFanout.kill("SIGTERM");
    process.exit(0);
  });

  console.log("[orchestrator] PoC attivo — overlay aggiornato ogni 10s. Ctrl+C per terminare.");
}

// ── Utility: attendi che un servizio HTTP risponda ──────────────────────────
async function waitForService(url, name, fetch, maxAttempts) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) {
        console.log(`[orchestrator] ${name} pronto (${url})`);
        return;
      }
    } catch (_) {}
    attempts++;
    console.log(`[orchestrator] Attendo ${name}... (${attempts}/${maxAttempts})`);
    await sleep(2000);
  }
  throw new Error(`Timeout attesa ${name} su ${url}`);
}

// ── Utility: attendi che MediaMTX veda un publisher su un path ──────────────
async function waitForRtmpPath(apiUrl, pathName, fetch, maxAttempts) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      const paths = data.items || [];
      const found = paths.find((p) => p.name && p.name.includes(pathName) && p.readyState === "ready");
      if (found) {
        console.log(`[orchestrator] Path RTMP '${pathName}' pronto su MediaMTX`);
        return;
      }
    } catch (_) {}
    attempts++;
    console.log(`[orchestrator] Attendo path '${pathName}' su MediaMTX... (${attempts}/${maxAttempts})`);
    await sleep(2000);
  }
  console.warn(`[orchestrator] Timeout attesa path '${pathName}' su MediaMTX — continuando comunque`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
