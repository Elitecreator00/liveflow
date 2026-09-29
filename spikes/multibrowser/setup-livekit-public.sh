#!/usr/bin/env bash
# LiveKit self-hosted PUBBLICO sul VPS (dev+prod). Cartella dedicata, non tocca ChatFlow.
# Genera chiavi robuste, scrive la config con node_ip = IP pubblico, avvia il container
# e (se ufw attivo) apre le porte. Stampa KEY/SECRET da mettere nell'API locale.
set -e
DIR=/home/ubuntu/liveflow-livekit
mkdir -p "$DIR"
PUBIP=$(curl -s -4 ifconfig.me 2>/dev/null || echo 57.131.31.233)

# Chiavi forti (NON devkey/secret: il server e' pubblico).
KEY="LK$(openssl rand -hex 5)"
SECRET=$(openssl rand -hex 32)

cat > "$DIR/livekit-public.yaml" <<YAML
# LiveKit self-host pubblico (LiveFlow). node_ip = IP pubblico del VPS: i client
# (creator, operatore, farm) si connettono qui via il loro candidato pubblico,
# nessun problema mDNS/loopback come in locale.
port: 7880
bind_addresses:
  - "0.0.0.0"
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false
  node_ip: "$PUBIP"
keys:
  $KEY: $SECRET
logging:
  level: info
YAML

# libera la porta 7880 da eventuali container spike precedenti
docker rm -f liveflow-lk-spike 2>/dev/null || true
docker rm -f liveflow-livekit 2>/dev/null || true
docker run -d --name liveflow-livekit --restart unless-stopped --network host \
  -v "$DIR/livekit-public.yaml:/etc/livekit.yaml:ro" \
  livekit/livekit-server --config /etc/livekit.yaml >/dev/null

# firewall: apri le porte se ufw e' attivo (OVH spesso non ha host firewall)
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow 7880/tcp >/dev/null 2>&1 || true
  sudo ufw allow 7881/tcp >/dev/null 2>&1 || true
  sudo ufw allow 7882/udp >/dev/null 2>&1 || true
  echo "ufw: regole 7880/7881 tcp + 7882 udp aggiunte"
else
  echo "ufw non attivo: porte gestite da OVH panel / nessun host firewall"
fi

sleep 5
echo "=== RISULTATO ==="
echo "PUBIP=$PUBIP"
echo "LIVEKIT_KEY=$KEY"
echo "LIVEKIT_SECRET=$SECRET"
echo "container: $(docker ps --filter name=liveflow-livekit --format '{{.Status}}')"
docker logs liveflow-livekit 2>&1 | grep -i 'starting LiveKit server' | head -n1
