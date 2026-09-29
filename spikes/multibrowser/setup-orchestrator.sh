#!/usr/bin/env bash
# Setup data-plane orchestrator sul VPS: pool di webcam virtuali + dipendenze.
set -e
DIR=/home/ubuntu/liveflow-orchestrator
mkdir -p "$DIR/policies"

echo "=== pool v4l2loopback: /dev/video10..17 (8 sessioni concorrenti) ==="
sudo modprobe videodev 2>/dev/null || true
sudo modprobe -r v4l2loopback 2>/dev/null || true
sudo modprobe v4l2loopback devices=8 video_nr=10,11,12,13,14,15,16,17 \
  card_label="HD Webcam C920,HD Webcam C920,HD Webcam C920,HD Webcam C920,HD Webcam C920,HD Webcam C920,HD Webcam C920,HD Webcam C920" \
  exclusive_caps=1,1,1,1,1,1,1,1
for n in 10 11 12 13 14 15 16 17; do sudo chmod 666 /dev/video$n; done
ls -1 /dev/video1[0-7]

echo "=== dipendenze node (express) ==="
cd "$DIR"
[ -f package.json ] || npm init -y >/dev/null 2>&1
npm i express@4 --silent --no-audit --no-fund >/dev/null 2>&1
echo "express: $(node -e "console.log(require('express/package.json').version)")"
echo "setup orchestrator OK"
