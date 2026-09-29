"use strict";

/**
 * LiveFlow PoC — Scene Server
 *
 * Porta 3000: serve la pagina HTML scena (aperta da Chrome headless nell'Egress)
 * Porta 3001: API REST + WebSocket per aggiornamenti overlay dall'operatore
 *
 * Logica:
 * - GET /           → pagina scena HTML (mostra feed camera + overlay)
 * - GET /health     → health check
 * - POST /overlays  → aggiorna lo stato degli overlay (operatore chiama questa API)
 *                     broadcast via WebSocket a tutti i client connessi (incluso Chrome headless)
 * - WS  /ws         → WebSocket: i browser connessi (Egress + operatore dashboard) ricevono updates
 */

const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const PORT_SCENE = 3000;
const PORT_API   = 3001;

// ──────────────────────────────────────────────
// Stato overlay condiviso (in produzione: Redis)
// ──────────────────────────────────────────────
let overlayState = {
  creatorName: "Creator Name",
  topText: "LIVE",
  bottomText: "Testo overlay — modifica via API",
  logoUrl: "", // URL immagine logo (opzionale)
  backgroundColor: "rgba(0, 0, 0, 0.55)",
  showOverlay: true,
  updatedAt: new Date().toISOString(),
};

// ──────────────────────────────────────────────
// Server 1: pagina scena (porta 3000)
// ──────────────────────────────────────────────
const sceneApp = express();
const sceneServer = http.createServer(sceneApp);

// WebSocket server per broadcast degli overlay aggiornamenti
const wss = new WebSocketServer({ server: sceneServer });

sceneApp.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Serve la pagina scena HTML
// Query params opzionali: ?room=poc-room&lvToken=... (usati da Egress)
sceneApp.get("/", (req, res) => {
  const room    = req.query.room    || "poc-room";
  const lvToken = req.query.lvToken || "";
  res.send(buildScenePage(room, lvToken));
});

wss.on("connection", (ws) => {
  console.log("[scene-ws] Client connesso — invio stato overlay corrente");
  // Invia lo stato corrente al client appena connesso
  ws.send(JSON.stringify({ type: "overlay-state", payload: overlayState }));

  ws.on("error", (err) => {
    console.error("[scene-ws] Errore:", err.message);
  });
});

function broadcastOverlay() {
  const msg = JSON.stringify({ type: "overlay-state", payload: overlayState });
  wss.clients.forEach((client) => {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  });
  console.log("[scene-ws] Broadcast overlay a", wss.clients.size, "client(s)");
}

sceneServer.listen(PORT_SCENE, "0.0.0.0", () => {
  console.log(`[scene] Pagina scena su http://0.0.0.0:${PORT_SCENE}`);
});

// ──────────────────────────────────────────────
// Server 2: overlay API (porta 3001)
// ──────────────────────────────────────────────
const apiApp = express();
apiApp.use(express.json());

apiApp.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /overlays — leggi stato corrente
apiApp.get("/overlays", (_req, res) => {
  res.json(overlayState);
});

// POST /overlays — aggiorna overlay e broadcast a tutti i browser connessi
apiApp.post("/overlays", (req, res) => {
  const update = req.body;
  overlayState = {
    ...overlayState,
    ...update,
    updatedAt: new Date().toISOString(),
  };
  console.log("[api] Overlay aggiornato:", overlayState);
  broadcastOverlay();
  res.json({ success: true, state: overlayState });
});

// DELETE /overlays — reset overlay
apiApp.delete("/overlays", (_req, res) => {
  overlayState = {
    creatorName: "Creator Name",
    topText: "LIVE",
    bottomText: "Testo overlay — modifica via API",
    logoUrl: "",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    showOverlay: true,
    updatedAt: new Date().toISOString(),
  };
  broadcastOverlay();
  res.json({ success: true, state: overlayState });
});

apiApp.listen(PORT_API, "0.0.0.0", () => {
  console.log(`[api] Overlay API su http://0.0.0.0:${PORT_API}`);
  console.log(`[api] POST /overlays con body JSON per aggiornare gli overlay`);
});

// ──────────────────────────────────────────────
// Builder HTML della pagina scena
// Questo è il template che Chrome headless (Egress) renderizza.
// In produzione: componente React condiviso con l'editor operatore.
// ──────────────────────────────────────────────
function buildScenePage(room, lvToken) {
  return /* html */ `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LiveFlow Scene — ${room}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: #000;
      font-family: 'Inter', 'Helvetica Neue', sans-serif;
    }

    /* ── Feed camera ── */
    #video-feed {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* ── Overlay container ── */
    #overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: opacity 0.3s ease;
    }
    #overlay.hidden { opacity: 0; }

    /* ── Top bar ── */
    #top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      background: var(--overlay-bg, rgba(0,0,0,0.55));
    }
    #live-badge {
      background: #e53e3e;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1.5px;
      padding: 3px 10px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    #top-text {
      color: #fff;
      font-size: 18px;
      font-weight: 600;
    }
    #creator-name {
      margin-left: auto;
      color: #e2e8f0;
      font-size: 15px;
      font-weight: 500;
    }

    /* ── Bottom bar ── */
    #bottom-bar {
      padding: 10px 20px;
      background: var(--overlay-bg, rgba(0,0,0,0.55));
    }
    #bottom-text {
      color: #e2e8f0;
      font-size: 15px;
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Logo ── */
    #logo {
      position: absolute;
      top: 70px;
      right: 20px;
      max-height: 60px;
      max-width: 120px;
      object-fit: contain;
      opacity: 0.85;
    }

    /* ── Status (debug) ── */
    #status {
      position: absolute;
      bottom: 50px;
      left: 20px;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
    }
  </style>
</head>
<body>

  <!-- Feed video: in PoC usa un video test; in produzione usa LiveKit JS SDK -->
  <video id="video-feed" autoplay muted playsinline></video>

  <!-- Overlay scena -->
  <div id="overlay">
    <div id="top-bar">
      <span id="live-badge">LIVE</span>
      <span id="top-text">LIVE</span>
      <span id="creator-name">Creator Name</span>
    </div>
    <div id="bottom-bar">
      <span id="bottom-text">Testo overlay — modifica via API</span>
    </div>
  </div>

  <!-- Logo opzionale -->
  <img id="logo" src="" alt="" style="display:none;" />

  <div id="status">room: ${room} | ws: connecting…</div>

  <script>
    // ── Costanti di connessione ──────────────────────
    const ROOM     = ${JSON.stringify(room)};
    const LV_TOKEN = ${JSON.stringify(lvToken)};
    // Il scene-server è sempre sullo stesso host della pagina
    const WS_URL   = "ws://" + location.hostname + ":3000";

    // ── Applicazione stato overlay ───────────────────
    function applyOverlayState(state) {
      document.getElementById("creator-name").textContent = state.creatorName || "";
      document.getElementById("top-text").textContent     = state.topText     || "";
      document.getElementById("bottom-text").textContent  = state.bottomText  || "";
      document.documentElement.style.setProperty(
        "--overlay-bg", state.backgroundColor || "rgba(0,0,0,0.55)"
      );
      const overlay = document.getElementById("overlay");
      if (state.showOverlay === false) {
        overlay.classList.add("hidden");
      } else {
        overlay.classList.remove("hidden");
      }
      const logo = document.getElementById("logo");
      if (state.logoUrl) {
        logo.src = state.logoUrl;
        logo.style.display = "block";
      } else {
        logo.style.display = "none";
      }
      document.getElementById("status").textContent =
        "room: " + ROOM + " | overlay: " + state.updatedAt;
    }

    // ── WebSocket: riceve aggiornamenti overlay ──────
    let ws;
    let wsReconnectDelay = 500;

    function connectWS() {
      ws = new WebSocket(WS_URL);

      ws.addEventListener("open", () => {
        console.log("[ws] Connesso a scene-server");
        document.getElementById("status").textContent =
          "room: " + ROOM + " | ws: connected";
        wsReconnectDelay = 500; // reset backoff
      });

      ws.addEventListener("message", (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "overlay-state") {
            applyOverlayState(msg.payload);
          }
        } catch (e) {
          console.error("[ws] Parse error:", e);
        }
      });

      ws.addEventListener("close", () => {
        console.warn("[ws] Disconnesso — retry in", wsReconnectDelay, "ms");
        document.getElementById("status").textContent =
          "room: " + ROOM + " | ws: reconnecting…";
        setTimeout(connectWS, wsReconnectDelay);
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, 5000);
      });

      ws.addEventListener("error", (e) => {
        console.error("[ws] Errore:", e);
      });
    }

    connectWS();

    // ── Feed video ───────────────────────────────────
    // PoC: se non c'è un token LiveKit reale, genera un test pattern
    // canvas → stream → video element.
    // In produzione: usare @livekit/client JS SDK per ricevere il feed WebRTC.
    (function setupTestFeed() {
      const video = document.getElementById("video-feed");

      if (LV_TOKEN) {
        // Produzione: connetti a LiveKit Room e usa il track video del publisher
        // Richiede <script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js">
        // e connessione al server LiveKit.
        // Implementazione lasciata a Fase 1 — vedi README.
        console.log("[livekit] Token disponibile, LiveKit SDK da includere per feed reale");
      }

      // Fallback PoC: canvas animato che simula il feed camera
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");

      let frame = 0;
      function drawFrame() {
        // Sfondo gradiente che cambia nel tempo
        const hue = (frame / 2) % 360;
        const grad = ctx.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, "hsl(" + hue + ",60%,20%)");
        grad.addColorStop(1, "hsl(" + ((hue + 120) % 360) + ",60%,15%)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1280, 720);

        // "Simulazione camera": cerchio che si muove
        const cx = 640 + 200 * Math.sin(frame * 0.03);
        const cy = 360 + 100 * Math.cos(frame * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        ctx.fill();

        // Timestamp
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "16px monospace";
        ctx.fillText("Simulazione feed camera — " + new Date().toLocaleTimeString(), 20, 680);

        frame++;
        requestAnimationFrame(drawFrame);
      }
      drawFrame();

      video.srcObject = canvas.captureStream(30);
    })();
  </script>
</body>
</html>`;
}
