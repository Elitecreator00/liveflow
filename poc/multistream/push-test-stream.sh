#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# LiveFlow PoC — Script di test push stream
# Simula il device inviando un segnale di test verso MediaMTX.
# Richiede: ffmpeg installato localmente (o docker exec).
#
# Uso:
#   chmod +x push-test-stream.sh
#   ./push-test-stream.sh
#
# Variabili override:
#   STREAM_KEY=mykey RTMP_HOST=192.168.1.x ./push-test-stream.sh
# ──────────────────────────────────────────────────────────────────

set -euo pipefail

STREAM_KEY="${STREAM_KEY:-liveflow_secret}"
RTMP_HOST="${RTMP_HOST:-localhost}"
RTMP_PORT="${RTMP_PORT:-1935}"
TARGET_URL="rtmp://${RTMP_HOST}:${RTMP_PORT}/live/${STREAM_KEY}"

# Durata del test in secondi (0 = infinito)
DURATION="${DURATION:-0}"

echo ""
echo "LiveFlow PoC — Test Stream Push"
echo "================================"
echo "Target:   ${TARGET_URL}"
echo "Video:    testsrc (1280x720, 30fps) — segnale a colori con timestamp"
echo "Audio:    sine 440Hz (tono di test)"
echo "Encoder:  H.264 (libx264) + AAC"
echo "Bitrate:  video 2000k, audio 128k"
echo ""
echo "Avvia OBS o un player HLS per verificare il fan-out:"
echo "  http://localhost:8081/hls/stream1/index.m3u8"
echo "  http://localhost:8082/hls/stream2/index.m3u8"
echo ""
echo "Premi Ctrl+C per fermare."
echo ""

# Costruisci argomento durata
DURATION_ARG=""
if [ "${DURATION}" -gt 0 ] 2>/dev/null; then
    DURATION_ARG="-t ${DURATION}"
fi

# Comando ffmpeg:
#   -re           legge alla velocita' del framerate (simula sorgente live)
#   testsrc       pattern a barre colorate con timecode visibile
#   lavfi sine    tono audio di test
#   -c:v libx264  encoding H.264 (equivalente a OBS/device)
#   -preset veryfast  veloce per test; in produzione usare medium
#   -tune zerolatency ottimizza per bassa latenza
#   -g 60         keyframe ogni 2s a 30fps
#   -c:a aac      encoding audio AAC
#   -f flv        container FLV per RTMP

ffmpeg \
    -hide_banner \
    -re \
    -f lavfi -i "testsrc2=size=1280x720:rate=30" \
    -f lavfi -i "sine=frequency=440:sample_rate=44100" \
    -c:v libx264 \
    -preset veryfast \
    -tune zerolatency \
    -b:v 2000k \
    -maxrate 2500k \
    -bufsize 4000k \
    -g 60 \
    -c:a aac \
    -b:a 128k \
    -ar 44100 \
    ${DURATION_ARG} \
    -f flv \
    "${TARGET_URL}"

echo ""
echo "Stream terminato."
