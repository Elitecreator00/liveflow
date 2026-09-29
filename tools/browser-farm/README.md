# LiveFlow browser-farm (data-plane, ADR-0011)

Farm multi-browser **in-house**: niente Neko, niente VNC, niente servizi
esterni. Ogni **stanza** è un container nostro (Chromium + Xvfb, `Dockerfile`)
con:

- **fingerprint unico e stabile** (generato dal control-plane alla creazione,
  applicato via CDP: UA/UA-CH, locale, timezone, hardwareConcurrency + TZ/lang
  reali del container);
- **proxy unico** (`--proxy-server` host:port; credenziali risposte via CDP
  `Fetch.authRequired`, mai scritte su disco);
- **profilo persistente e isolato** (`$PROFILES_DIR/<roomId>` montato su
  `/profile`: cookie e sessioni sopravvivono ai riavvii, distrutti solo alla
  cancellazione della stanza);
- **webcam virtuale dedicata** `/dev/video1N → /dev/video0` alimentata
  dall'ingestor LiveKit (sorgente Studio) o da un placeholder ffmpeg.

Il **display remoto è CDP screencast**: l'orchestratore fa da gateway
WebSocket (`/rooms/:id/view`) tra il DevTools del container e il viewer della
Console (frame JPEG in giù, input mouse/tastiera in su).

## File

| File | Ruolo |
|---|---|
| `orchestrator.mjs` | API HTTP (start/stop/destroy stanza) + gateway WS viewer |
| `room-session.mjs` | Runtime CDP di una stanza: fingerprint, tab, screencast, input |
| `cdp.mjs` | Client CDP minimale (flat sessions) |
| `ingestor.mjs` | LiveKit Room → FFmpeg → /dev/videoN |
| `Dockerfile` + `entrypoint.sh` | Immagine browser di stanza (`liveflow-browser`) |
| `deploy.sh` | Deploy su VPS (pm2 `liveflow-farm`, porta 7090) |

## API (auth: header `x-orch-token`)

- `GET  /health`
- `POST /rooms/:id/start` `{ name, fingerprint, proxy, wsUrl?, viewerToken? }`
- `POST /rooms/:id/stop` — il profilo resta
- `DELETE /rooms/:id` — stop + profilo distrutto
- `WS   /rooms/:id/view?token=exp.sig` — token HMAC-SHA256(`roomId.exp`,
  ORCH_TOKEN) firmato dal control-plane (scadenza 12h)

## Deploy

```bash
# dal PC: sincronizza la cartella sul VPS
scp -i ~/.ssh/chatflow_ovh -r tools/browser-farm ubuntu@57.131.31.233:~/liveflow-multibrowser/farm

# sul VPS: riusa il token già configurato nell'API
ORCH_TOKEN=<token> bash ~/liveflow-multibrowser/farm/deploy.sh
```

Variabili: `ORCH_PORT` (7090), `ORCH_TOKEN`, `FARM_IMAGE` (liveflow-browser),
`PROFILES_DIR` (~/liveflow-farm/profiles).
