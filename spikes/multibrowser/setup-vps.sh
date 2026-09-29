#!/usr/bin/env bash
# Spike multi-browser — provisioning host Linux (S1). Idempotente, throwaway-grade.
# Testato su Ubuntu 22.04/24.04. Eseguire con sudo.
set -euo pipefail

echo "[1/4] Pacchetti base (docker, ffmpeg, build tools, dkms)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg ffmpeg build-essential dkms linux-headers-"$(uname -r)"

echo "[2/4] Docker engine (se assente)..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

echo "[3/4] v4l2loopback (modulo kernel per la webcam virtuale)..."
apt-get install -y v4l2loopback-dkms v4l2loopback-utils
# Carica subito un device di prova (rimosso al reboot; per S1 va bene).
modprobe v4l2loopback devices=1 video_nr=10 card_label="HD Webcam C920" exclusive_caps=1 || true

echo "[4/4] Verifica..."
echo "  docker:   $(docker --version 2>/dev/null || echo MANCANTE)"
echo "  ffmpeg:   $(ffmpeg -version 2>/dev/null | head -n1 || echo MANCANTE)"
echo "  v4l2:     $(ls -1 /dev/video* 2>/dev/null | tr '\n' ' ' || echo 'nessun /dev/video')"
echo
echo "OK. Prossimo passo: vedi README.md (S1 punto 2 in poi)."
