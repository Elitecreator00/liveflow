#!/usr/bin/env bash
# Deploy/persisti l'orchestratore con pm2 + token forte + firewall. Stampa il TOKEN
# da mettere nell'API (start.bat).
set -e
cd ~/liveflow-orchestrator
cp ~/liveflow-multibrowser/orchestrator.mjs .

# ferma vecchia istanza su :7090 (per PID via porta, evita pkill -f auto-match)
OLDPID=$(ss -tlnp 2>/dev/null | grep ':7090' | grep -oP 'pid=\K[0-9]+' | head -n1 || true)
[ -n "$OLDPID" ] && kill "$OLDPID" 2>/dev/null || true
pm2 delete liveflow-orch >/dev/null 2>&1 || true

TOKEN=$(openssl rand -hex 24)
PUBLIC_HOST=57.131.31.233 ORCH_TOKEN="$TOKEN" pm2 start orchestrator.mjs --name liveflow-orch --update-env >/dev/null
pm2 save >/dev/null 2>&1 || true

# firewall: orchestratore + range porte Neko (web 8110-8117, mux 8210-8217)
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow 7090/tcp >/dev/null 2>&1 || true
  sudo ufw allow 8110:8117/tcp >/dev/null 2>&1 || true
  sudo ufw allow 8210:8217/tcp >/dev/null 2>&1 || true
  echo "ufw: aperte 7090 + 8110-8117 + 8210-8217"
fi

sleep 2
echo "=== RISULTATO ==="
echo "ORCH_TOKEN=$TOKEN"
pm2 describe liveflow-orch 2>/dev/null | grep -E "status|name" | head -n2
curl -s -H "x-orch-token: $TOKEN" http://127.0.0.1:7090/health; echo
