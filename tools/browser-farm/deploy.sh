#!/usr/bin/env bash
# Deploy della farm in-house sul VPS (da lanciare SUL VPS, dentro la cartella
# sincronizzata ~/liveflow-multibrowser/farm). Sostituisce il vecchio
# orchestratore Neko (pm2 liveflow-orch) con liveflow-farm.
#
# Uso:  ORCH_TOKEN=<token-esistente> bash deploy.sh
#       (senza ORCH_TOKEN ne genera uno nuovo e lo stampa: va copiato
#        nell'API come ORCH_TOKEN)
set -e
cd "$(dirname "$0")"

echo "== dipendenze node =="
npm install --omit=dev --no-audit --no-fund

echo "== immagine browser (liveflow-browser) =="
docker build -t liveflow-browser .

# Il pool di webcam virtuali dipende da moduli che NON stanno nel pacchetto
# kernel base: videodev (core V4L2) e snd-aloop vivono in linux-modules-extra.
# Il metapacchetto usato dalle immagini cloud (linux-virtual) non lo tira dentro,
# quindi a ogni aggiornamento di kernel la farm restava senza /dev/video* e ogni
# avvio falliva con uno stderr di ffmpeg. linux-generic lo mantiene allineato.
echo "== moduli kernel necessari (videodev, snd-aloop) =="
if ! modinfo videodev >/dev/null 2>&1 || ! modinfo snd-aloop >/dev/null 2>&1; then
  echo "   mancanti per $(uname -r): installo linux-modules-extra"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    "linux-modules-extra-$(uname -r)" linux-generic
fi

# ATTENZIONE: v4l2loopback 0.12.x NON supporta keep_format (il kernel lo scarta
# con "unknown parameter ... ignored"). Il formato fissato dal priming non è
# quindi garantito a vita: l'orchestratore prima di ogni stanza rifà il priming
# e, se un device è rimasto inconsistente, passa al successivo del pool.
echo "== webcam virtuali (pool /dev/video10..17) =="
V4L2_OPTS='devices=8 video_nr=10,11,12,13,14,15,16,17 card_label="HD Webcam C920","HD Webcam C920","HD Webcam C920","HD Webcam C920","HD Webcam C920","HD Webcam C920","HD Webcam C920","HD Webcam C920" exclusive_caps=1,1,1,1,1,1,1,1'
if modinfo v4l2loopback 2>/dev/null | grep -q 'parm:.*keep_format'; then
  V4L2_OPTS="$V4L2_OPTS keep_format=1,1,1,1,1,1,1,1"
fi
if ! ls /dev/video17 >/dev/null 2>&1; then
  sudo modprobe v4l2loopback $V4L2_OPTS
fi
# Persistenza: al reboot il modulo si ricarica con le stesse opzioni.
echo v4l2loopback | sudo tee /etc/modules-load.d/v4l2loopback.conf >/dev/null
printf 'options v4l2loopback %s\n' "$V4L2_OPTS" \
  | sudo tee /etc/modprobe.d/v4l2loopback.conf >/dev/null

# Microfoni virtuali: loopback ALSA (snd-aloop), 8 substream = 8 stanze. L'host
# scrive su hw:Loopback,0,N, il container cattura hw:Loopback,1,N (vedi
# entrypoint.sh / ingestor.mjs).
echo "== microfoni virtuali (snd-aloop, 8 substream) =="
if ! [ -e /proc/asound/Loopback ]; then
  sudo modprobe snd-aloop index=10 id=Loopback pcm_substreams=8
fi
if ! grep -q '^snd-aloop' /etc/modules-load.d/snd-aloop.conf 2>/dev/null; then
  echo 'snd-aloop' | sudo tee /etc/modules-load.d/snd-aloop.conf >/dev/null
  printf 'options snd-aloop index=10 id=Loopback pcm_substreams=8\n' | sudo tee /etc/modprobe.d/snd-aloop.conf >/dev/null
fi

# Permessi via udev: valgono anche dopo un reboot o una ricarica dei moduli
# (l'orchestratore gira come ubuntu, il container come utente non-root).
sudo tee /etc/udev/rules.d/99-liveflow-farm.rules >/dev/null <<'RULES'
# LiveFlow farm: webcam virtuali + loopback ALSA accessibili a orchestrator e container.
SUBSYSTEM=="video4linux", KERNEL=="video1[0-7]", MODE="0666"
SUBSYSTEM=="sound", KERNEL=="pcmC10D*", MODE="0666"
SUBSYSTEM=="sound", KERNEL=="controlC10", MODE="0666"
RULES
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=video4linux --subsystem-match=sound
sudo chmod 666 /dev/video1[0-7] 2>/dev/null || true
sudo chmod 666 /dev/snd/* 2>/dev/null || true

echo "== stop vecchie istanze =="
pm2 delete liveflow-orch >/dev/null 2>&1 || true
pm2 delete liveflow-farm >/dev/null 2>&1 || true
OLDPID=$(ss -tlnp 2>/dev/null | grep ':7090' | grep -oP 'pid=\K[0-9]+' | head -n1 || true)
[ -n "$OLDPID" ] && kill "$OLDPID" 2>/dev/null || true

TOKEN="${ORCH_TOKEN:-$(openssl rand -hex 24)}"
ORCH_TOKEN="$TOKEN" pm2 start orchestrator.mjs --name liveflow-farm --update-env >/dev/null
pm2 save >/dev/null 2>&1 || true

# Firewall: la 7090 (HTTP control + WS viewer multiplexati) verso internet, e il
# range dei relay proxy raggiungibile SOLO dai container della farm. Senza questa
# seconda regola ufw scarta il traffico container -> gateway, e le stanze con
# proxy SOCKS autenticato finiscono in ERR_TIMED_OUT.
if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
  sudo ufw allow 7090/tcp >/dev/null 2>&1 || true
  sudo ufw allow from 172.30.0.0/24 to 172.30.0.1 port 9410:9417 proto tcp \n    comment "LiveFlow farm: relay proxy per stanza" >/dev/null 2>&1 || true
fi

sleep 2
echo "=== RISULTATO ==="
echo "ORCH_TOKEN=$TOKEN"
curl -s -H "x-orch-token: $TOKEN" http://127.0.0.1:7090/health; echo
