#!/usr/bin/env python3
"""
LiveFlow PoC — Stream Health Monitor
Polling dell'API REST MediaMTX ogni N secondi.
Stampa bitrate, fps, reader count, stato publisher per ogni path attivo.

Uso standalone (fuori da Docker):
    pip install requests
    MEDIAMTX_API=http://localhost:9997 python health_monitor.py

In Docker: avviato automaticamente da docker-compose.
"""

import os
import sys
import time
import json
from datetime import datetime

try:
    import urllib.request
    import urllib.error
except ImportError:
    print("urllib non disponibile", file=sys.stderr)
    sys.exit(1)

MEDIAMTX_API = os.environ.get("MEDIAMTX_API", "http://localhost:9997")
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "5"))

RESET   = "\033[0m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
RED     = "\033[91m"
CYAN    = "\033[96m"
BOLD    = "\033[1m"

def fetch_json(url: str) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return None
    except Exception as e:
        return None

def human_bitrate(bps: int) -> str:
    """Converte bytes/sec in stringa leggibile."""
    if bps < 1000:
        return f"{bps} B/s"
    elif bps < 1_000_000:
        return f"{bps/1000:.1f} KB/s"
    else:
        return f"{bps/1_000_000:.2f} MB/s"

def print_divider():
    print(f"{CYAN}{'─' * 60}{RESET}")

def check_health():
    ts = datetime.now().strftime("%H:%M:%S")
    print_divider()
    print(f"{BOLD}[{ts}] LiveFlow Health Monitor — MediaMTX{RESET}")
    print_divider()

    # ── 1. Paths attivi ──────────────────────────────────────────
    paths_data = fetch_json(f"{MEDIAMTX_API}/v3/paths/list")
    if paths_data is None:
        print(f"{RED}[ERROR] Impossibile raggiungere MediaMTX API: {MEDIAMTX_API}{RESET}")
        print(f"        MediaMTX e' avviato? Attendi qualche secondo al primo avvio.")
        return

    items = paths_data.get("items", [])
    if not items:
        print(f"{YELLOW}[INFO] Nessun path attivo. In attesa che il device faccia push...{RESET}")
        print(f"       Comando test: ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \\")
        print(f"           -f lavfi -i sine=frequency=1000 -c:v libx264 -c:a aac \\")
        print(f"           -f flv rtmp://localhost:1935/live/$STREAM_KEY")
        return

    for path in items:
        name = path.get("name", "unknown")
        source = path.get("source")
        readers = path.get("readers", [])

        print(f"\n{BOLD}  Path:{RESET} /live/{name}")

        # Stato publisher
        if source:
            state = source.get("type", "unknown")
            bytes_rx = source.get("bytesReceived", 0)
            print(f"  {GREEN}[PUBLISHER ATTIVO]{RESET} tipo={state}")
            print(f"  Bytes ricevuti: {human_bitrate(bytes_rx)} (totale sessione)")
        else:
            print(f"  {RED}[NESSUN PUBLISHER]{RESET} path registrato ma nessuna sorgente attiva")

        # Reader count (include il processo FFmpeg fan-out)
        n_readers = len(readers)
        reader_color = GREEN if n_readers >= 2 else (YELLOW if n_readers == 1 else RED)
        print(f"  {reader_color}Reader attivi: {n_readers}{RESET}", end="")
        if n_readers == 0:
            print(f"  {YELLOW}(fan-out non ancora avviato){RESET}", end="")
        elif n_readers >= 2:
            print(f"  {GREEN}(fan-out attivo verso {n_readers} target){RESET}", end="")
        print()

        for i, r in enumerate(readers, 1):
            rtype = r.get("type", "unknown")
            bytes_sent = r.get("bytesSent", 0)
            print(f"    Reader {i}: tipo={rtype}, bytes_inviati={human_bitrate(bytes_sent)}")

    # ── 2. Riepilogo connessioni RTMP ────────────────────────────
    print()
    conns_data = fetch_json(f"{MEDIAMTX_API}/v3/rtmpconns/list")
    if conns_data:
        conns = conns_data.get("items", [])
        print(f"  Connessioni RTMP attive: {len(conns)}")
        for c in conns:
            state_c = c.get("state", "?")
            id_c = c.get("id", "?")[:8]
            path_c = c.get("path", "?")
            bytes_rx = c.get("bytesReceived", 0)
            bytes_tx = c.get("bytesSent", 0)
            arrow = "<-- publisher" if state_c == "publish" else "--> reader"
            rx_str = f"rx={human_bitrate(bytes_rx)}" if bytes_rx else ""
            tx_str = f"tx={human_bitrate(bytes_tx)}" if bytes_tx else ""
            print(f"    [{id_c}] {path_c} {arrow} {rx_str} {tx_str}")

    # ── 3. Hint verifica fan-out ─────────────────────────────────
    print()
    print(f"  {CYAN}Verifica HLS target-1:{RESET} http://localhost:8081/hls/stream1/index.m3u8")
    print(f"  {CYAN}Verifica HLS target-2:{RESET} http://localhost:8082/hls/stream2/index.m3u8")
    print(f"  {CYAN}Stat target-1:{RESET}        http://localhost:8081/stat")
    print(f"  {CYAN}Stat target-2:{RESET}        http://localhost:8082/stat")
    print(f"  {CYAN}Prometheus metrics:{RESET}   http://localhost:9998/metrics")

def main():
    print(f"{BOLD}LiveFlow PoC — Health Monitor avviato{RESET}")
    print(f"API MediaMTX: {MEDIAMTX_API}")
    print(f"Polling ogni {POLL_INTERVAL}s. Ctrl+C per fermare.\n")

    while True:
        try:
            check_health()
        except KeyboardInterrupt:
            print("\nMonitor fermato.")
            break
        except Exception as e:
            print(f"{RED}[ERRORE] {e}{RESET}")
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
