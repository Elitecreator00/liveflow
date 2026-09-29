# LiveFlow browser-farm — immagine browser di stanza (ADR-0011, in-house).
# Chromium headful sotto Xvfb: serve un display vero perché la webcam virtuale
# v4l2 (mappata come /dev/video0) deve essere vista da getUserMedia come una
# camera reale. Il display remoto NON passa da qui: è CDP screencast via il
# gateway dell'orchestratore (niente Neko/VNC).
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-l10n \
    xvfb \
    socat \
    xclip \
    pulseaudio \
    pulseaudio-utils \
    fonts-liberation \
    fonts-dejavu-core \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
    tzdata \
  && rm -rf /var/lib/apt/lists/*

# uid 1000 = utente host (ubuntu): il volume /profile resta leggibile da
# entrambi i lati (profilo browser persistente per stanza). Gruppi video/audio:
# senza, /dev/video0 (webcam virtuale) non è accessibile e non viene enumerata.
RUN useradd -m -u 1000 -G video,audio browser && mkdir -p /profile && chown browser:browser /profile

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER browser
ENV HOME=/home/browser

ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]
