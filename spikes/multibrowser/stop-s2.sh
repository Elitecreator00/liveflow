#!/usr/bin/env bash
# Ferma i processi dello spike S2 (lasciati girare consumano CPU sul VPS condiviso).
# Eseguire come `bash stop-s2.sh` così l'argv è "bash stop-s2.sh" e i pkill -f
# sotto NON matchano la shell stessa (evita l'auto-kill che dava SSH 255).
pkill -f 'node ingestor.mjs' 2>/dev/null || true
pkill -x ffmpeg 2>/dev/null || true
pkill -x lk 2>/dev/null || true
docker stop liveflow-lk-spike 2>/dev/null || true
sleep 1
echo "ingestor: $(pgrep -fc 'ingestor.mjs' || echo 0)  ffmpeg: $(pgrep -xc ffmpeg || echo 0)  lk: $(pgrep -xc lk || echo 0)"
echo "livekit container: $(docker ps --filter name=liveflow-lk-spike --format '{{.Status}}' || echo stopped)"
echo "device idle: $(ls /dev/video10 2>/dev/null || echo MISSING)"
