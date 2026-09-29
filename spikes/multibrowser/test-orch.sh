#!/usr/bin/env bash
# Test end-to-end dell'orchestratore: publisher demo -> POST /sessions -> verifica.
set -e
export LIVEKIT_URL=ws://127.0.0.1:7880
export LIVEKIT_API_KEY=LKf6e5136854
export LIVEKIT_API_SECRET="${LIVEKIT_API_SECRET:?imposta LIVEKIT_API_SECRET (segreto della chiave LiveKit)}"
ROOM=orch-test
ORCH="http://127.0.0.1:7090"
TOK=lf-orch-secret

echo "=== publisher demo nella room $ROOM ==="
pkill -x lk 2>/dev/null || true
sleep 1
nohup lk room join --identity pub --room "$ROOM" --publish-demo > /tmp/pub.log 2>&1 &
sleep 5
tail -n 2 /tmp/pub.log

echo "=== viewer token per l'ingestor ==="
VTOK=$(lk token create --join --room "$ROOM" --identity ingestor --valid-for 2h --token-only 2>/dev/null | grep -E '^eyJ' | head -n1)
echo "token len: ${#VTOK}"

echo "=== POST /sessions ==="
curl -s -H "x-orch-token: $TOK" -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"orchtest\",\"wsUrl\":\"ws://127.0.0.1:7880\",\"viewerToken\":\"$VTOK\",\"siteLabel\":\"webcamtests.com\"}" \
  "$ORCH/sessions"
echo

echo "=== attendo avvio (12s) ==="
sleep 12
echo "--- container sessione ---"
docker ps --filter name=lf-sess- --format "{{.Names}}  {{.Status}}  {{.Ports}}"
echo "--- ingestor + ffmpeg (feed webcam) ---"
pgrep -af "ingestor.mjs" | head -n1 || echo "nessun ingestor"
echo "ffmpeg attivi: $(pgrep -xc ffmpeg || echo 0)"
echo "--- neko log ---"
docker logs lf-sess-orchtest 2>&1 | tail -n 6
echo "--- health orchestratore ---"
curl -s -H "x-orch-token: $TOK" "$ORCH/sessions"; echo
