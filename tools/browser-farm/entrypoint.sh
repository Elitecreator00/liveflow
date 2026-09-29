#!/bin/sh
# Entrypoint del container di stanza (ADR-0011).
# Xvfb (display vero per getUserMedia) + mic virtuale silenzioso + Chromium
# con profilo persistente, proxy e dimensioni schermo della stanza.
set -e

SCREEN_W="${SCREEN_W:-1280}"
SCREEN_H="${SCREEN_H:-720}"

export DISPLAY=:99
Xvfb :99 -screen 0 "${SCREEN_W}x${SCREEN_H}x24" -nolisten tcp &

# Microfono virtuale. Con ALSA_SUB: la source è alimentata dall'host via il
# loopback ALSA (hw:Loopback,1,$ALSA_SUB), dove l'ingestor scrive l'audio della
# creator → il sito sente l'audio reale dello stream. Senza ALSA_SUB: mic muto
# (null-sink + remap), per stanze senza sorgente audio.
pulseaudio --start --exit-idle-time=-1 2>/dev/null || true
if [ -n "$ALSA_SUB" ]; then
  pactl load-module module-alsa-source device="hw:Loopback,1,${ALSA_SUB}" \
    source_name=virtual_mic source_properties=device.description=Microphone \
    rate=48000 channels=1 format=s16le 2>/dev/null || true
  pactl set-default-source virtual_mic 2>/dev/null || true
else
  # Il remap serve perché Chromium NASCONDE le source "monitor": solo una source
  # rimappata appare come microfono vero in enumerateDevices.
  pactl load-module module-null-sink sink_name=mic_sink \
    sink_properties=device.description=Speakers 2>/dev/null || true
  pactl load-module module-remap-source master=mic_sink.monitor \
    source_name=virtual_mic source_properties=device.description=Microphone 2>/dev/null || true
  pactl set-default-source virtual_mic 2>/dev/null || true
fi

# Lingua dell'interfaccia = locale di Intl (date, numeri) in pagina, iframe e
# worker. Su Linux Chromium la prende da LANGUAGE, non da --lang, e serve il
# pacchetto lingua (chromium-l10n): con il solo en-US.pak ogni stanza, anche
# italiana, formattava le date all'americana contro un navigator.languages
# it-IT. I nomi POSIX usano l'underscore (it_IT), non il trattino.
# navigator.languages e Accept-Language vengono invece dalle preferenze del
# profilo, scritte dall'orchestratore (browser-prefs.mjs).
POSIX_LANG="$(printf '%s' "${BROWSER_LANG:-it-IT}" | tr '-' '_')"
export LANGUAGE="$POSIX_LANG"
export LANG="$POSIX_LANG.UTF-8"

# Lock di un'istanza precedente morta male (container ucciso con docker rm -f):
# senza rimuoverli Chromium si rifiuta di partire ("profile appears to be in use
# ... on another computer <vecchio-hostname>") ed esce, e il DevTools non sale.
# Sicuro: l'orchestratore garantisce UN solo container per stanza alla volta.
rm -f /profile/Singleton* 2>/dev/null || true

# In headful Chromium ascolta il DevTools solo su 127.0.0.1 interno: socat lo
# espone sulla 9223 del container, che l'orchestratore mappa su loopback host.
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &

# --use-gl=angle + swiftshader: WebGL tramite rendering software. Con
# --disable-gpu (com'era prima) WebGL risultava del tutto ASSENTE, e un browser
# senza WebGL nel mondo reale non esiste: i controlli anti-bot lo leggono come
# ambiente automatizzato e non lasciano passare le verifiche, per quanti click
# umani si facciano. Costa CPU solo quando una pagina usa davvero WebGL.
# --disable-gpu-compositing: SwiftShader SOLO per WebGL, non per comporre la
# pagina. Senza, ogni frame passava dal 3D software: ~15 fps a 330% di CPU
# contro ~30 fps a 40% (misurato 28/09/2026, stesso WebGL/renderer).
# --disable-blink-features=AutomationControlled: niente navigator.webdriver.
# --use-fake-ui-for-media-stream: autoconsenso camera/mic (nessun prompt).
exec chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --use-gl=angle \
  --use-angle=swiftshader \
  --enable-unsafe-swiftshader \
  --disable-gpu-compositing \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir=/profile \
  --window-position=0,0 \
  --window-size="${SCREEN_W},${SCREEN_H}" \
  --lang="${BROWSER_LANG:-it-IT}" \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  --disable-blink-features=AutomationControlled \
  --use-fake-ui-for-media-stream \
  --autoplay-policy=no-user-gesture-required \
  ${PROXY_SERVER:+--proxy-server="$PROXY_SERVER"} \
  about:blank
