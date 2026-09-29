# Spike multi-browser — validazione tecnica (ADR-0010)

Obiettivo: provare la meccanica **sorgente → webcam virtuale → browser** su un host Linux,
prima di costruire la farm completa. Non è codice di produzione: è spike, throwaway-grade.

> v4l2loopback è un modulo **kernel Linux**: questi spike NON girano su Windows/WSL2.
> Servono su un VPS/VM Linux reale (Ubuntu 22.04/24.04 consigliato, ~2 vCPU / 4GB).

## S1 — la webcam virtuale è vista come reale (senza LiveKit)

```bash
# 1. setup host (una tantum): docker + v4l2loopback
sudo bash setup-vps.sh

# 2. crea il device webcam virtuale /dev/video10 con label plausibile
sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="HD Webcam C920" exclusive_caps=1

# 3. alimentalo con una sorgente di test (barre colore 1280x720@30)
ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 -pix_fmt yuv420p -f v4l2 /dev/video10

# 4. in un browser che vede /dev/video10 apri getusermedia-test.html:
#    deve comparire "HD Webcam C920" nell'elenco camere e mostrare le barre.
```

PASS S1 = il sito vede la webcam finta come una camera fisica, senza override JS.

## S2 — la sorgente reale è una LiveKit Room dello Studio

Sostituisce `testsrc` con la traccia video pubblicata dalla creator nello Studio.

```bash
# Ottieni wsUrl + viewerToken dal control-plane (API LiveFlow):
#   POST /auth/login  → accessToken
#   GET  /studio/active → { roomName, wsUrl, viewerToken } della sessione LIVE
# Passali all'ingestor che sottoscrive la room e scrive i frame su /dev/video10:

LIVEKIT_WS_URL="ws://<ip>:7880" \
LIVEKIT_TOKEN="<viewerToken>" \
V4L2_DEVICE="/dev/video10" \
node ingestor.mjs
```

PASS S2 = la pagina getUserMedia mostra il video della creator con latenza <2s.

## S4 / S5 (dopo S1–S2)
- S4: `docker-compose.spike.yml` avvia Chromium+Neko con `/dev/video10` mappato → apri la
  URL Neko **da Chrome su qualsiasi PC** e verifica di vedere/guidare il browser remoto.
- S5: alza `devices=3 video_nr=10,11,12`, tre ingestor, tre container con proxy/fingerprint
  distinti → isolamento confermato.

## Mappa verso la farm di produzione
Questi pezzi diventano, nel data-plane: `setup-vps.sh` → provisioning host;
`ingestor.mjs` → servizio ingestor per-sessione; `docker-compose.spike.yml` → template
container per-sessione (Camoufox al posto di Chromium); la *launch spec* arriva dal
control-plane NestJS (`modules/browser-farm`).
