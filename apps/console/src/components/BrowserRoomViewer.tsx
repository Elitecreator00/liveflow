"use client";

// BrowserRoomViewer — display remoto in-house di una stanza multi-browser
// (ADR-0011, niente Neko/servizi esterni). Il data-plane fa da gateway CDP:
//   server → client : frame JPEG binari (Page.screencastFrame) + meta JSON
//   client → server : input JSON (mouse/tastiera/navigazione/tab)
// Le coordinate mouse viaggiano normalizzate 0..1: è il server a riportarle
// sul viewport reale della stanza.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "@liveflow/design-system";

interface RemoteTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
}

interface ViewerMeta {
  url: string;
  title: string;
  tabs: RemoteTab[];
}

type ConnState = "connecting" | "connected" | "closed" | "error";

// Bitmask modifier CDP: Alt=1, Ctrl=2, Meta=4, Shift=8.
function cdpModifiers(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
}

const MOUSE_BUTTONS = ["left", "middle", "right"] as const;

// Altezze fisse della barra di navigazione e della riga delle tab: le usa anche
// ViewerChromeSpacer, così una stanza ferma occupa esattamente lo stesso spazio
// di una attiva e le card nella griglia restano allineate.
const TOOLBAR_H = "h-10";
const TABS_H = "h-8";

/** Spazio equivalente alle barre del viewer, per i riquadri segnaposto. */
export function ViewerChromeSpacer(): React.ReactElement {
  return (
    <div aria-hidden className="shrink-0">
      <div className={TOOLBAR_H} />
      <div className={TABS_H} />
    </div>
  );
}

// Il browser remoto è Linux: le scorciatoie usano Ctrl. Su Mac l'operatore usa
// Cmd, quindi Cmd+C/V/X/A/Z/… vanno tradotte in Ctrl, altrimenti non fanno nulla.
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
function remoteModifiers(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  const m = cdpModifiers(e);
  return IS_MAC && e.metaKey ? (m & ~4) | 2 : m;
}

/** Ctrl+V (Cmd+V su Mac): va lasciato al browser locale, che genera l'evento
 *  paste con il testo degli appunti dell'operatore. */
function isPasteShortcut(e: React.KeyboardEvent): boolean {
  return (IS_MAC ? e.metaKey : e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "v";
}

// Cursore CSS riportato dal browser remoto → valore sicuro per il canvas locale.
// I cursori `url(...)` puntano a risorse del sito remoto che qui non caricano:
// teniamo solo la keyword di fallback dopo la virgola. `auto` → freccia.
function cssCursor(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v || v === "auto") return "default";
  if (v.includes("url(")) {
    const fallback = v.slice(v.lastIndexOf(",") + 1).trim();
    return fallback && !fallback.includes("url(") ? fallback : "default";
  }
  return v;
}

export function BrowserRoomViewer({
  viewUrl,
  roomId,
  title,
  captcha = null,
  className,
  standalone = false,
  onPopOut,
}: {
  viewUrl: string;
  /** Identità stabile della stanza: la connessione si aggancia a questo, NON a
   *  viewUrl (che ruota a ogni poll perché il token ha una nuova scadenza). */
  roomId: string;
  /** Nome stanza, mostrato nell'header in modalità espansa. */
  title?: string;
  /**
   * Verifica anti-bot in corso. L'avviso vive QUI dentro e non nella card:
   * a schermo intero il viewer copre la pagina (fixed inset-0), quindi un
   * avviso esterno finirebbe tagliato dietro proprio quando serve.
   */
  captcha?: { type: string; since: number } | null;
  className?: string;
  /**
   * Finestra dedicata alla stanza (/room/[id]): il viewer riempie la finestra
   * e "Schermo intero" usa direttamente il fullscreen del browser.
   */
  standalone?: boolean;
  /** Se presente, mostra il pulsante "Apri in una finestra separata". */
  onPopOut?: () => void;
}): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastMoveRef = useRef(0);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
    },
    [],
  );
  const [connState, setConnState] = useState<ConnState>("connecting");
  const [meta, setMeta] = useState<ViewerMeta | null>(null);
  // Conferma breve di copia/incolla sopra lo schermo remoto.
  const [clipNotice, setClipNotice] = useState<string | null>(null);
  const clipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashClip = useCallback((text: string) => {
    setClipNotice(text);
    if (clipTimerRef.current) clearTimeout(clipTimerRef.current);
    clipTimerRef.current = setTimeout(() => setClipNotice(null), 1600);
  }, []);
  useEffect(
    () => () => {
      if (clipTimerRef.current) clearTimeout(clipTimerRef.current);
    },
    [],
  );
  const [urlInput, setUrlInput] = useState("");
  const [urlDirty, setUrlDirty] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Fullscreen nativo del browser attivo (finestra dedicata o viewer espanso).
  const [nativeFs, setNativeFs] = useState(false);

  // ── Schermo intero ─────────────────────────────────────────────────────────
  // Il viewer vive in un nodo "host" che si SPOSTA: dentro la card quando è
  // compresso, direttamente nel <body> quando è espanso. Restare nella card non
  // funziona: il contenitore della pagina ha un'animazione con transform, che
  // per il CSS trasforma `position: fixed` in "fisso dentro il contenitore" —
  // la sidebar e la barra in alto restavano sopra e il resto si vedeva dietro.
  // Spostare il nodo (invece di ricrearlo) conserva il canvas: l'immagine non
  // sparisce finché la pagina remota non cambia.
  const slotRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    setHost(el);
    return () => el.remove();
  }, []);

  useLayoutEffect(() => {
    if (!host) return;
    if (expanded && !standalone) {
      host.className = "fixed inset-0 z-[300] flex flex-col bg-bg-base";
      document.body.appendChild(host);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
    host.className = standalone ? "flex flex-col flex-1 min-h-0" : "flex flex-col";
    slotRef.current?.appendChild(host);
    return undefined;
  }, [host, expanded, standalone]);

  // Uscita dal fullscreen nativo (Esc, F11, gesto del sistema): il viewer
  // espanso torna nella card, invece di restare un riquadro a tutta finestra.
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement;
      // Conta solo il fullscreen di QUESTO viewer: con più stanze nella pagina
      // l'evento arriva a tutte.
      const mine = !!fs && (standalone || fs === host);
      setNativeFs(mine);
      if (!fs) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [host, standalone]);

  const collapse = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setExpanded(false);
  };

  const toggleFullscreen = () => {
    if (nativeFs || expanded) {
      collapse();
      return;
    }
    if (standalone) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      return;
    }
    setExpanded(true);
    // Fullscreen vero del monitor; se il browser lo nega resta comunque il
    // viewer a tutta finestra sopra la Console.
    void host?.requestFullscreen?.().catch(() => undefined);
  };

  // viewUrl più recente, letto solo al momento di (ri)connettere. Così il poll
  // che cambia il token NON forza una riconnessione continua.
  const viewUrlRef = useRef(viewUrl);
  useEffect(() => {
    viewUrlRef.current = viewUrl;
  }, [viewUrl]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // ── Connessione WS + rendering frame ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let drawing = false;
    setConnState("connecting");

    const ws = new WebSocket(viewUrlRef.current);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => !cancelled && setConnState("connected");
    ws.onerror = () => !cancelled && setConnState("error");
    ws.onclose = () => {
      if (!cancelled) setConnState((s) => (s === "error" ? s : "closed"));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (cancelled) return;
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data) as { type: string; css?: string; text?: string } & ViewerMeta;
          if (msg.type === "meta") {
            setMeta({ url: msg.url, title: msg.title, tabs: msg.tabs ?? [] });
            setUrlInput((prev) => (urlDirtyRef.current ? prev : msg.url));
          } else if (msg.type === "clipboard" && typeof msg.text === "string") {
            // Testo copiato nel browser remoto (Ctrl+C) → appunti dell'operatore.
            // Arriva ~150 ms dopo il tasto, dentro la finestra di attivazione
            // utente che il browser richiede per scrivere negli appunti.
            const text = msg.text;
            navigator.clipboard
              ?.writeText(text)
              .then(() => flashClip("Copiato"))
              .catch(() => flashClip("Il browser non ha consentito la copia"));
          } else if (msg.type === "cursor") {
            // Forma del cursore calcolata dal browser remoto (lo screencast non
            // la trasmette): la applichiamo al canvas locale.
            const canvas = canvasRef.current;
            if (canvas) canvas.style.cursor = cssCursor(msg.css);
          }
        } catch {
          /* messaggio non-JSON: ignora */
        }
        return;
      }
      // Frame JPEG binario. Ogni frame ricevuto va confermato (anche se
      // scartato): il server manda il successivo solo quando i precedenti sono
      // smaltiti, così lo schermo non accumula ritardo quando la rete è lenta.
      const ack = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"frameAck"}');
      };
      // Drop se il decode è ancora in corso (meglio perdere un frame che
      // accumulare latenza).
      if (drawing) {
        ack();
        return;
      }
      drawing = true;
      const blob = new Blob([ev.data as ArrayBuffer], { type: "image/jpeg" });
      createImageBitmap(blob)
        .then((bmp) => {
          const canvas = canvasRef.current;
          if (!canvas || cancelled) return;
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
            canvas.width = bmp.width;
            canvas.height = bmp.height;
          }
          canvas.getContext("2d")?.drawImage(bmp, 0, 0);
          bmp.close();
        })
        .catch(() => undefined)
        .finally(() => {
          drawing = false;
          ack();
        });
    };

    return () => {
      cancelled = true;
      wsRef.current = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, retryNonce]);

  // ESC esce dalla modalità espansa (quando il focus non è sul canvas, che
  // intercetta i tasti per il browser remoto — lì usa il pulsante Comprimi).
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Ref-mirror di urlDirty per usarlo dentro onmessage senza ri-creare il WS.
  const urlDirtyRef = useRef(false);
  useEffect(() => {
    urlDirtyRef.current = urlDirty;
  }, [urlDirty]);

  // ── Input: mouse ───────────────────────────────────────────────────────────
  // Il canvas usa `object-contain`: il frame è scalato mantenendo l'aspect ratio
  // e centrato, con bande (letter/pillarbox) quando il box NON è 16:9 (tipico in
  // schermo intero). Il bounding rect include le bande, quindi bisogna mappare le
  // coordinate sull'AREA REALE dell'immagine, non sull'intero elemento — altrimenti
  // i click cadono sfasati e il probe del cursore sonda l'elemento sbagliato.
  const normCoords = (e: React.PointerEvent | React.WheelEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { nx: 0, ny: 0 };
    const rect = canvas.getBoundingClientRect();
    const iw = canvas.width || rect.width;
    const ih = canvas.height || rect.height;
    const scale = Math.min(rect.width / iw, rect.height / ih);
    const dispW = iw * scale;
    const dispH = ih * scale;
    const offX = rect.left + (rect.width - dispW) / 2;
    const offY = rect.top + (rect.height - dispH) / 2;
    return {
      nx: Math.min(1, Math.max(0, (e.clientX - offX) / dispW)),
      ny: Math.min(1, Math.max(0, (e.clientY - offY) / dispH)),
    };
  };

  const sendMove = (nx: number, ny: number, modifiers: number) => {
    lastMoveRef.current = performance.now();
    send({ type: "mouse", kind: "move", nx, ny, button: "none", modifiers });
  };

  const onPointer = (kind: "move" | "down" | "up") => (e: React.PointerEvent) => {
    const { nx, ny } = normCoords(e);
    const modifiers = cdpModifiers(e);
    if (kind === "move") {
      // Throttle ~30 msg/s: il move è il flusso più chiacchierone. Il campione
      // scartato non si perde: parte in coda alla finestra, così la posizione
      // dove il mouse si FERMA arriva sempre al browser.
      const wait = 33 - (performance.now() - lastMoveRef.current);
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
      if (wait > 0) {
        moveTimerRef.current = setTimeout(() => {
          moveTimerRef.current = null;
          sendMove(nx, ny, modifiers);
        }, wait);
        return;
      }
      sendMove(nx, ny, modifiers);
      return;
    }
    // Un movimento in attesa è ormai superato dal click, che porta la sua
    // posizione (il server ci sposta il puntatore prima di premere).
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const canvas = canvasRef.current;
    if (kind === "down") {
      canvas?.focus();
      // Cattura: il rilascio arriva anche se avviene fuori dal riquadro. Senza,
      // il browser remoto restava col tasto "giù" e il click dopo diventava
      // un trascinamento — cioè un click che non fa nulla.
      try {
        canvas?.setPointerCapture(e.pointerId);
      } catch {
        /* puntatore già rilasciato */
      }
    } else if (canvas?.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    e.preventDefault();
    send({
      type: "mouse",
      kind,
      nx,
      ny,
      button: MOUSE_BUTTONS[e.button] ?? "left",
      modifiers,
    });
  };

  const onWheel = (e: React.WheelEvent) => {
    const { nx, ny } = normCoords(e);
    send({
      type: "mouse",
      kind: "wheel",
      nx,
      ny,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      modifiers: cdpModifiers(e),
    });
  };

  // ── Input: tastiera ────────────────────────────────────────────────────────
  const onKey = (kind: "down" | "up") => (e: React.KeyboardEvent) => {
    // Incolla: niente preventDefault e niente inoltro del tasto, così il
    // browser locale genera l'evento paste (onPaste) con i NOSTRI appunti.
    // Prima il tasto veniva bloccato e girato al remoto, che incollava i suoi
    // appunti, sempre vuoti.
    if (isPasteShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    let text: string | undefined;
    if (kind === "down" && !e.ctrlKey && !e.metaKey) {
      if (e.key.length === 1) text = e.key;
      else if (e.key === "Enter") text = "\r";
    }
    send({
      type: "key",
      kind,
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      text,
      modifiers: remoteModifiers(e),
    });
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text");
    if (text) {
      send({ type: "paste", text });
      flashClip("Incollato");
    }
  };

  const navigate = () => {
    const url = urlInput.trim();
    if (!url) return;
    send({ type: "navigate", url: url.includes("://") ? url : `https://${url}` });
    setUrlDirty(false);
    canvasRef.current?.focus();
  };

  const tabs = meta?.tabs ?? [];
  // Schermo che riempie lo spazio disponibile (finestra dedicata o espanso);
  // altrimenti riquadro 16:9 dentro la card.
  const fill = expanded || standalone;
  const isFullscreen = expanded || nativeFs;

  const content = (
    <div className={`flex flex-col bg-bg-base ${fill ? "flex-1 min-h-0" : ""}`}>
      {/* ── Header (solo in modalità espansa) ───────────────────────────── */}
      {expanded && !standalone && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border-subtle bg-bg-surface shrink-0">
          <span className="text-sm font-semibold text-text-primary truncate">
            {title || "Stanza"}
            {meta?.title ? <span className="text-text-muted font-normal"> — {meta.title}</span> : null}
          </span>
          <button
            onClick={collapse}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-bg-overlay text-text-secondary hover:text-text-primary transition-colors"
          >
            Esci (Esc) ✕
          </button>
        </div>
      )}

      {/* ── Toolbar navigazione ─────────────────────────────────────────── */}
      <div className={`flex items-center gap-1.5 px-2 border-b border-border-subtle bg-bg-surface shrink-0 ${TOOLBAR_H}`}>
        <ToolbarButton label="Indietro" onClick={() => send({ type: "history", dir: "back" })}>
          ←
        </ToolbarButton>
        <ToolbarButton label="Avanti" onClick={() => send({ type: "history", dir: "forward" })}>
          →
        </ToolbarButton>
        <ToolbarButton label="Ricarica" onClick={() => send({ type: "reload" })}>
          ⟳
        </ToolbarButton>
        <input
          value={urlInput}
          onChange={(e) => {
            setUrlInput(e.target.value);
            setUrlDirty(true);
          }}
          onKeyDown={(e) => e.key === "Enter" && navigate()}
          placeholder="https://…"
          spellCheck={false}
          className="flex-1 min-w-0 px-2.5 py-1 rounded-md bg-bg-base border border-border-subtle text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-focus"
        />
        <ToolbarButton label="Vai" onClick={navigate}>
          Vai
        </ToolbarButton>
        <span aria-hidden className="w-px h-4 bg-border-subtle mx-0.5 shrink-0" />
        {onPopOut && !expanded && (
          <ToolbarButton label="Apri in una finestra separata" onClick={onPopOut}>
            <IconPopOut />
          </ToolbarButton>
        )}
        <ToolbarButton
          label={isFullscreen ? "Esci da schermo intero" : "Schermo intero"}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <IconCollapse /> : <IconExpand />}
        </ToolbarButton>
      </div>

      {/* ── Tab della stanza ────────────────────────────────────────────── */}
      {/* Sempre presente (anche senza tab): l'altezza del viewer resta fissa e
          gli schermi delle stanze affiancate non saltano. */}
        <div className={`flex items-center gap-1 px-2 border-b border-border-subtle bg-bg-surface overflow-x-auto shrink-0 ${TABS_H}`}>
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-1 max-w-[180px] shrink-0 px-2 py-0.5 rounded-md text-[11px] cursor-pointer border ${
                t.active
                  ? "bg-bg-overlay text-text-primary border-border-strong"
                  : "text-text-muted border-transparent hover:bg-bg-overlay/60"
              }`}
              onClick={() => send({ type: "tab", action: "activate", id: t.id })}
              title={t.url}
            >
              <span className="truncate">{t.title || t.url || "Nuova tab"}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    send({ type: "tab", action: "close", id: t.id });
                  }}
                  className="text-text-muted hover:text-danger leading-none"
                  aria-label="Chiudi tab"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => send({ type: "tab", action: "new" })}
            className="shrink-0 px-1.5 py-0.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-overlay text-xs"
            aria-label="Nuova tab"
          >
            +
          </button>
        </div>

      {/* ── Schermo remoto ──────────────────────────────────────────────── */}
      <div
        className={fill ? "relative bg-black flex-1 min-h-0" : "relative bg-black"}
        style={fill ? undefined : { aspectRatio: "16 / 9" }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          className="w-full h-full object-contain outline-none"
          onPointerMove={onPointer("move")}
          onPointerDown={onPointer("down")}
          onPointerUp={onPointer("up")}
          onWheel={onWheel}
          onKeyDown={onKey("down")}
          onKeyUp={onKey("up")}
          onPaste={onPaste}
          onContextMenu={(e) => e.preventDefault()}
        />
        {/* Verifica anti-bot: la completa l'operatore col mouse. Sta SOPRA lo
            schermo e lascia passare i click: non sposta il layout (gli schermi
            delle stanze affiancate restano allineati) e non copre la casella. */}
        {captcha && (
          <div
            role="alert"
            className="pointer-events-none absolute top-0 inset-x-0 flex items-center gap-2 px-3 py-1.5 bg-warn text-warn-fg shadow-md"
          >
            <span aria-hidden>⚠</span>
            <p className="text-xs font-medium leading-5 flex-1 min-w-0 truncate">
              Verifica {captchaTypeLabel(captcha.type)} da completare qui col mouse — la
              stanza resta ferma finché non passa
            </p>
            <span className="text-2xs font-mono shrink-0 opacity-80">
              {formatSince(captcha.since)}
            </span>
          </div>
        )}
        {clipNotice && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-black/80 px-3 py-1 text-xs text-white shadow">
            {clipNotice}
          </div>
        )}
        {connState !== "connected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-xs text-text-muted">
            {connState === "connecting" ? (
              <>
                <Spinner size="md" variant="muted" />
                <span>Connessione alla stanza…</span>
              </>
            ) : (
              <>
                <span>{connState === "error" ? "Connessione fallita" : "Disconnesso"}</span>
                <button
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="px-2 py-1 rounded-md bg-bg-overlay text-text-secondary hover:text-text-primary"
                >
                  Riconnetti
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      ref={slotRef}
      className={`flex flex-col ${standalone ? "flex-1 min-h-0" : ""} ${className ?? ""}`}
    >
      {host && createPortal(content, host)}
      {/* Segnaposto mentre la stanza è a schermo intero: la card non collassa. */}
      {expanded && !standalone && (
        <div
          className="flex items-center justify-center bg-black/60 text-xs text-text-muted"
          style={{ aspectRatio: "16 / 9" }}
        >
          A schermo intero
        </div>
      )}
    </div>
  );
}

function IconExpand(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
    </svg>
  );
}

function IconCollapse(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
    </svg>
  );
}

function IconPopOut(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 2h5v5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5" />
    </svg>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="shrink-0 px-2 py-1 rounded-md text-xs text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast"
    >
      {children}
    </button>
  );
}

/** Nome leggibile della verifica: l'operatore non deve vedere sigle. */
function captchaTypeLabel(type: string): string {
  switch (type) {
    case "recaptcha":  return "reCAPTCHA";
    case "hcaptcha":   return "hCaptcha";
    case "turnstile":  return "Cloudflare";
    case "arkose":     return "Arkose";
    default:           return "controllo anti-bot";
  }
}

/** Da quanto la stanza è in attesa. */
function formatSince(since: number): string {
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h`;
}
