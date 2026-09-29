#!/usr/bin/env bash
# Spike S2 — sorgente LiveKit reale -> webcam virtuale. Self-contained sul VPS.
set -e
cd /home/ubuntu/liveflow-multibrowser
export LIVEKIT_URL=ws://127.0.0.1:7880
export LIVEKIT_API_KEY=devkey
export LIVEKIT_API_SECRET=secretsecretsecretsecretsecret32
ROOM=spike-room

echo "=== reload v4l2loopback pulito (azzera formato bloccato) ==="
pkill -x ffmpeg 2>/dev/null || true
pkill -f 'node ingestor.mjs' 2>/dev/null || true
sleep 1
sudo modprobe -r v4l2loopback 2>/dev/null || true
sudo modprobe v4l2loopback devices=1 video_nr=10 card_label="HD Webcam C920" exclusive_caps=1
sudo chmod 666 /dev/video10
ls -l /dev/video10

echo "=== avvio publisher (demo video loop) ==="
pkill -x lk 2>/dev/null || true
sleep 1
nohup lk room join --identity publisher --room "$ROOM" --publish-demo > pub.log 2>&1 &
sleep 5
echo "--- pub.log ---"; tail -n 6 pub.log

echo "=== token ingestor (subscriber) ==="
# NB: lk stampa un banner "Using url..." su stdout prima del token → tengo solo la riga JWT.
TOKEN=$(lk token create --join --room "$ROOM" --identity ingestor --valid-for 2h --token-only 2>/dev/null | grep -E '^eyJ' | head -n1)
echo "token len: ${#TOKEN}"

echo "=== rendo scrivibile il device virtuale (transient) ==="
sudo chmod 666 /dev/video10

echo "=== avvio ingestor (LiveKit -> ffmpeg -> /dev/video10) ==="
pkill -f 'node ingestor.mjs' 2>/dev/null || true
sleep 1
LIVEKIT_TOKEN="$TOKEN" LIVEKIT_WS_URL=ws://127.0.0.1:7880 V4L2_DEVICE=/dev/video10 \
  nohup node ingestor.mjs > ing.log 2>&1 &
sleep 9
echo "--- ing.log ---"; tail -n 15 ing.log
echo "=== ffmpeg dell'ingestor attivo? ==="
pgrep -x ffmpeg -a || echo "NESSUN ffmpeg (ingestor non sta scrivendo)"

echo "=== readback: 1 frame DAL device (atteso: video demo) ==="
ffmpeg -hide_banner -loglevel error -f v4l2 -i /dev/video10 -frames:v 1 -update 1 -y s2-proof.jpg
ls -l s2-proof.jpg && file s2-proof.jpg
