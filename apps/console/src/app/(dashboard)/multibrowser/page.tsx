"use client";

// Multi-Browser a stanze (ADR-0011) — ogni stanza è un'identità browser
// persistente e totalmente isolata: fingerprint unico generato alla creazione,
// proxy unico (modificabile dai settings), profilo/cookie persistenti sul VPS.
// Una stanza si avvia da una sorgente Studio live (webcam virtuale) o senza
// sorgente (placeholder) per fare login/setup degli account. Il display remoto
// è in-house (CDP screencast), nessun servizio esterno.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  Badge,
  Button,
  Input,
  Spinner,
  StatTile,
} from "@liveflow/design-system";
import {
  BROWSER_ROOM_COUNTRIES,
  createBrowserRoom,
  deleteBrowserRoom,
  getActiveSessions,
  getRoomsRuntime,
  getToken,
  listBrowserRooms,
  startBrowserRoom,
  stopBrowserRoom,
  updateBrowserRoom,
  type ActiveIngestSession,
  type BrowserRoom,
  type RoomRuntimeStatus,
} from "@liveflow/api-client";
import { BrowserRoomViewer, ViewerChromeSpacer } from "../../../components/BrowserRoomViewer";
import { SourceFramePreview } from "../../../components/SourceFramePreview";
import { RoomIdentityCheck } from "../../../components/RoomIdentityCheck";

/** Colonne della griglia stanze: "auto" = quante ne stanno. */
type GridColumns = "auto" | 1 | 2 | 3 | 4;
const GRID_OPTIONS: GridColumns[] = ["auto", 1, 2, 3, 4];
const GRID_STORAGE_KEY = "lf.multibrowser.columns";
const GRID_GAP_REM = 1;

function readGridColumns(): GridColumns {
  try {
    const v = localStorage.getItem(GRID_STORAGE_KEY);
    if (v === "auto" || v === null) return "auto";
    const n = Number(v);
    return n === 1 || n === 2 || n === 3 || n === 4 ? n : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Al massimo N colonne, ma mai più strette di 340px: su uno schermo piccolo la
 * griglia va a capo invece di schiacciare gli schermi delle stanze.
 */
function gridTemplate(cols: GridColumns): string {
  if (cols === "auto") return "repeat(auto-fill, minmax(420px, 1fr))";
  const gaps = `${(cols - 1) * GRID_GAP_REM}rem`;
  return `repeat(auto-fill, minmax(max(340px, calc((100% - ${gaps}) / ${cols})), 1fr))`;
}

export default function MultiBrowserPage(): React.ReactElement {
  const [rooms, setRooms] = useState<BrowserRoom[]>([]);
  // Stato vivo dal data-plane: dice quando una stanza si è fermata su una
  // verifica anti-bot. Va completata a mano dall'operatore, quindi la cosa
  // importante è che se ne accorga subito.
  const [runtime, setRuntime] = useState<Record<string, RoomRuntimeStatus>>({});
  const [sources, setSources] = useState<ActiveIngestSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [columns, setColumns] = useState<GridColumns>("auto");
  useEffect(() => setColumns(readGridColumns()), []);
  const chooseColumns = (c: GridColumns) => {
    setColumns(c);
    try {
      localStorage.setItem(GRID_STORAGE_KEY, String(c));
    } catch {
      /* preferenza solo per questa visita */
    }
  };

  // ── Finestre separate ──────────────────────────────────────────────────────
  // Una stanza aperta nella sua finestra non resta collegata anche qui: due
  // viewer della stessa stanza raddoppiano banda e lavoro del server.
  const windowsRef = useRef(new Map<string, Window>());
  const [poppedOut, setPoppedOut] = useState<Set<string>>(() => new Set());
  const [popupBlocked, setPopupBlocked] = useState(false);

  const syncPoppedOut = useCallback(() => {
    for (const [id, w] of windowsRef.current) {
      if (w.closed) windowsRef.current.delete(id);
    }
    setPoppedOut((prev) => {
      const next = new Set(windowsRef.current.keys());
      return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
    });
  }, []);

  useEffect(() => {
    const t = setInterval(syncPoppedOut, 1000);
    return () => clearInterval(t);
  }, [syncPoppedOut]);

  const openRoomWindow = useCallback(
    (room: BrowserRoom) => {
      const existing = windowsRef.current.get(room.id);
      if (existing && !existing.closed) {
        existing.focus();
        return;
      }
      const w = Math.min(1440, window.screen.availWidth);
      const h = Math.min(900, window.screen.availHeight);
      const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
      const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
      const win = window.open(
        `/room/${encodeURIComponent(room.id)}`,
        `lf-room-${room.id}`,
        `popup=yes,width=${w},height=${h},left=${left},top=${top}`,
      );
      if (!win) {
        setPopupBlocked(true);
        return;
      }
      setPopupBlocked(false);
      windowsRef.current.set(room.id, win);
      syncPoppedOut();
    },
    [syncPoppedOut],
  );

  const focusRoomWindow = (roomId: string) => windowsRef.current.get(roomId)?.focus();
  const closeRoomWindow = (roomId: string) => {
    windowsRef.current.get(roomId)?.close();
    windowsRef.current.delete(roomId);
    syncPoppedOut();
  };

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const [r, src] = await Promise.all([
        listBrowserRooms(token).catch(() => [] as BrowserRoom[]),
        getActiveSessions(token).catch(() => [] as ActiveIngestSession[]),
      ]);
      setRooms(r);
      setSources(src);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // Le verifiche anti-bot compaiono e spariscono in fretta: qui si guarda spesso,
  // ma è una sola chiamata leggera che non tocca le stanze.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const token = getToken();
      if (!token || stop) return;
      try {
        setRuntime(await getRoomsRuntime(token));
      } catch {
        /* data-plane non raggiungibile: si riprova al giro dopo */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  const running = rooms.filter((r) => r.status === "RUNNING").length;
  const waiting = Object.values(runtime).filter((r) => r.captcha).length;

  return (
    <div className="space-y-5 max-w-[1920px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 className="lf-section-title">Multi-Browser</h2>
          <p className="lf-section-desc">
            Stanze browser isolate: fingerprint e proxy unici per stanza, sessioni
            persistenti, webcam virtuale dalla sorgente Studio.
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="px-2 py-1 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast disabled:opacity-40 self-start sm:self-auto flex items-center gap-2"
        >
          {loading && <Spinner size="xs" variant="muted" />} Aggiorna
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Stanze" value={rooms.length} accent="primary" subValue="identità isolate" />
        <StatTile label="In esecuzione" value={running} accent="success" subValue="browser attivi" />
        <StatTile label="Sorgenti live" value={sources.length} accent="danger" subValue="LiveKit rooms" />
        <StatTile
          label="Verifiche"
          value={waiting}
          accent={waiting ? "warn" : "primary"}
          subValue={waiting ? "da completare" : "nessuna in attesa"}
        />
      </div>

      <CreateRoomCard
        nextNumber={nextRoomNumber(rooms)}
        defaultOpen={loaded && rooms.length === 0}
        onCreated={() => void refresh()}
      />

      {rooms.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Stanze <span className="text-text-muted font-normal">({rooms.length})</span>
          </h3>
          <ColumnsPicker value={columns} onChange={chooseColumns} />
        </div>
      )}

      {popupBlocked && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warn-muted border border-warn/30 text-xs text-warn"
        >
          <span className="flex-1">
            Il browser ha bloccato la nuova finestra. Consenti i popup per questo sito
            (icona nella barra degli indirizzi) e riprova.
          </span>
          <button onClick={() => setPopupBlocked(false)} className="font-medium hover:opacity-80">
            Ok
          </button>
        </div>
      )}

      {rooms.length === 0 ? (
        loaded && (
          <Card variant="ghost" padding="lg" className="text-center">
            <p className="text-text-muted text-sm">
              Nessuna stanza. Creane una: avrà un fingerprint unico e un profilo
              browser isolato e persistente.
            </p>
          </Card>
        )
      ) : (
        <div
          className="grid items-start"
          style={{ gridTemplateColumns: gridTemplate(columns), gap: `${GRID_GAP_REM}rem` }}
        >
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              sources={sources}
              runtime={runtime[room.id]}
              poppedOut={poppedOut.has(room.id)}
              onPopOut={() => openRoomWindow(room)}
              onFocusWindow={() => focusRoomWindow(room.id)}
              onCloseWindow={() => closeRoomWindow(room.id)}
              onChanged={() => void refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ColumnsPicker({
  value,
  onChange,
}: {
  value: GridColumns;
  onChange: (c: GridColumns) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">Colonne</span>
      <div
        role="radiogroup"
        aria-label="Colonne della griglia"
        className="flex items-center p-0.5 rounded-lg bg-bg-surface border border-border-subtle"
      >
        {GRID_OPTIONS.map((c) => (
          <button
            key={String(c)}
            role="radio"
            aria-checked={value === c}
            onClick={() => onChange(c)}
            className={`min-w-[2rem] px-2 py-1 rounded-md text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
              value === c
                ? "bg-bg-overlay text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {c === "auto" ? "Auto" : c}
          </button>
        ))}
      </div>
    </div>
  );
}

function nextRoomNumber(rooms: BrowserRoom[]): number {
  return (
    rooms.reduce((acc, r) => {
      const m = /^Stanza (\d+)$/.exec(r.name.trim());
      return m ? Math.max(acc, Number(m[1])) : acc;
    }, 0) + 1
  );
}

// ── Creazione stanza ──────────────────────────────────────────────────────────
function CreateRoomCard({
  nextNumber,
  defaultOpen,
  onCreated,
}: {
  nextNumber: number;
  /** Aperta da sola quando non esiste ancora nessuna stanza. */
  defaultOpen: boolean;
  onCreated: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const [name, setName] = useState("");
  const [proxy, setProxy] = useState("");
  const [country, setCountry] = useState("IT");
  const [homeUrl, setHomeUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await createBrowserRoom(
        {
          name: name.trim() || undefined,
          proxy: proxy.trim() || undefined,
          country,
          homeUrl: homeUrl.trim() || undefined,
        },
        token,
      );
      setName("");
      setProxy("");
      setHomeUrl("");
      setOpen(false);
      onCreated();
    } catch (e) {
      setError((e as Error).message || "Creazione fallita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="elevated" padding="none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-bg-overlay/40 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <span
            aria-hidden
            className="w-5 h-5 rounded-md bg-primary/20 text-primary-hover flex items-center justify-center text-sm leading-none"
          >
            {open ? "−" : "+"}
          </span>
          Nuova stanza
        </span>
        <span className="text-xs text-text-muted">{open ? "chiudi" : "crea"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border-subtle">
          <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_1.4fr_1.2fr] lg:items-end">
            <Input
              label="Nome"
              placeholder={`Stanza ${nextNumber}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Paese</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="px-2 py-2 rounded-md bg-bg-base border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-border-focus"
              >
                {BROWSER_ROOM_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Proxy (residential/ISP consigliato)"
              placeholder="http://user:pass@host:port"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
            />
            <Input
              label="Home page (facoltativa)"
              placeholder="https://sito.com"
              value={homeUrl}
              onChange={(e) => setHomeUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-xs text-text-muted max-w-2xl">
              Il <strong>paese</strong> fissa la geo del fingerprint (lingua + fuso orario): usa un
              proxy dello stesso paese, così IP e fingerprint sono coerenti. Senza home page si
              apre quella predefinita.
            </p>
            <Button onClick={() => void create()} disabled={busy} className="shrink-0">
              {busy ? "Creazione…" : "Crea stanza"}
            </Button>
          </div>
          {error && <p className="text-xs text-danger break-words">{error}</p>}
        </div>
      )}
    </Card>
  );
}

// ── Card stanza ───────────────────────────────────────────────────────────────
// Lo schermo sta SUBITO sotto l'intestazione, in ogni card (anche ferma, con un
// segnaposto): con più stanze affiancate gli schermi restano allineati, invece
// di scivolare in basso di quanto è lungo il pannello sopra.
function RoomCard({
  room,
  sources,
  runtime,
  poppedOut,
  onPopOut,
  onFocusWindow,
  onCloseWindow,
  onChanged,
}: {
  room: BrowserRoom;
  sources: ActiveIngestSession[];
  /** Stato vivo dal data-plane (verifica anti-bot in corso, spettatori). */
  runtime?: RoomRuntimeStatus;
  /** La stanza è aperta nella sua finestra separata. */
  poppedOut: boolean;
  onPopOut: () => void;
  onFocusWindow: () => void;
  onCloseWindow: () => void;
  onChanged: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Anteprima della sorgente reale: il sito mostra la sua self-view ribaltata,
  // quindi da lì non si capisce cosa riceve davvero il pubblico.
  const [showSource, setShowSource] = useState(false);
  const captcha = runtime?.captcha ?? null;
  // Verifica eseguita da sola all'avvio: se qualcosa non torna si vede subito,
  // senza doverla chiedere.
  const identity = runtime?.identity ?? null;
  const [sourceId, setSourceId] = useState<string>("");

  const act = async (fn: (token: string) => Promise<unknown>) => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await fn(token);
      onChanged();
    } catch (e) {
      setError((e as Error).message || "Operazione fallita");
    } finally {
      setBusy(false);
    }
  };

  const isRunning = room.status === "RUNNING";
  const statusVariant =
    isRunning
      ? "success"
      : room.status === "ERROR"
        ? "danger"
        : room.status === "PROVISIONING"
          ? "warn"
          : "default";

  const statusLabel = {
    IDLE: "ferma",
    PROVISIONING: "in avvio",
    RUNNING: "attiva",
    ERROR: "errore",
  }[room.status];

  const sourceName = room.sourceSessionId
    ? sources.find((s) => s.sessionId === room.sourceSessionId)?.creatorName ?? "non più live"
    : null;

  return (
    <Card
      variant="elevated"
      padding="none"
      className={`flex flex-col ${captcha ? "ring-1 ring-warn/50" : ""}`}
    >
      {/* ── Intestazione ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border-subtle">
        <span
          aria-hidden
          className={`w-2 h-2 rounded-full shrink-0 ${
            isRunning ? "bg-success" : room.status === "ERROR" ? "bg-danger" : room.status === "PROVISIONING" ? "bg-warn animate-pulse" : "bg-text-muted/50"
          }`}
        />
        <span className="text-sm font-semibold text-text-primary truncate min-w-0">
          {room.name}
        </span>
        <span className="flex-1" />
        {captcha && (
          <Badge variant="warn" size="sm">
            ⚠ {formatWaiting(captcha.since)}
          </Badge>
        )}
        <Badge variant={statusVariant} size="sm">
          {statusLabel}
        </Badge>
        <button
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          title="Impostazioni stanza"
          className={`shrink-0 text-xs font-medium px-2 py-1 rounded-md transition-colors duration-fast ${
            showSettings
              ? "bg-bg-overlay text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-overlay"
          }`}
        >
          Settings
        </button>
      </div>

      {/* ── Schermo ──────────────────────────────────────────────────────── */}
      {isRunning && room.viewUrl && !poppedOut ? (
        <BrowserRoomViewer
          viewUrl={room.viewUrl}
          roomId={room.id}
          title={room.name}
          captcha={captcha}
          onPopOut={onPopOut}
        />
      ) : (
        <ScreenPlaceholder>
          {poppedOut && isRunning ? (
            <>
              <span className="text-text-secondary">Aperta in una finestra separata</span>
              {captcha && (
                <span className="text-warn">
                  Verifica {captchaLabel(captcha.type)} da completare nella finestra
                </span>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={onFocusWindow}
                  className="px-2.5 py-1 rounded-md bg-bg-overlay text-text-primary hover:opacity-90"
                >
                  Mostra finestra
                </button>
                <button
                  onClick={onCloseWindow}
                  className="px-2.5 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-overlay"
                >
                  Riporta qui
                </button>
              </div>
            </>
          ) : room.status === "PROVISIONING" ? (
            <>
              <Spinner size="sm" variant="muted" />
              <span>Avvio del browser…</span>
            </>
          ) : room.status === "ERROR" ? (
            <span className="text-danger">Avvio non riuscito</span>
          ) : (
            <span>Stanza ferma</span>
          )}
        </ScreenPlaceholder>
      )}

      {/* ── Identità della stanza (compatta) ─────────────────────────────── */}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 px-3 pt-2.5 pb-2 text-2xs">
        <Meta label="Paese" value={countryLabel(room.country)} />
        <Meta label="Fingerprint" value={fingerprintLabel(room)} mono />
        <Meta label="Proxy" value={room.proxyHint ?? "nessuno"} mono warn={!room.proxyHint} />
        <Meta label="Home" value={room.homeUrl ? homeLabel(room.homeUrl) : "predefinita"} mono />
        {sourceName && <Meta label="Sorgente" value={sourceName} />}
      </dl>

      {showSettings && (
        <RoomSettings
          room={room}
          busy={busy}
          onSave={(payload) =>
            void act((t) =>
              updateBrowserRoom(room.id, payload, t),
            ).then(() => setShowSettings(false))
          }
          onDelete={() => {
            if (
              window.confirm(
                `Eliminare "${room.name}"? L'identità (fingerprint, cookie, sessioni) verrà distrutta per sempre.`,
              )
            ) {
              void act((t) => deleteBrowserRoom(room.id, t));
            }
          }}
        />
      )}

      {/* ── Avvio / stop ─────────────────────────────────────────────────── */}
      <div className="px-3 pb-3 space-y-2">
        {room.status === "RUNNING" || room.status === "PROVISIONING" ? (
          <div className="flex gap-2">
            {isRunning && !poppedOut && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onPopOut}>
                Apri in finestra
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              className="flex-1"
              disabled={busy}
              onClick={() => {
                if (poppedOut) onCloseWindow();
                void act((t) => stopBrowserRoom(room.id, t));
              }}
            >
              {busy ? "…" : "Ferma stanza"}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              aria-label="Sorgente video"
              className="flex-1 min-w-0 px-2 py-1.5 rounded-md bg-bg-base border border-border-subtle text-xs text-text-primary focus:outline-none focus:border-border-focus"
            >
              <option value="">Senza sorgente (solo login/setup)</option>
              {sources.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  🔴 {s.creatorName} (live)
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void act((t) =>
                  startBrowserRoom(room.id, sourceId ? { sourceSessionId: sourceId } : {}, t),
                )
              }
            >
              {busy ? "Avvio…" : "Avvia"}
            </Button>
          </div>
        )}
        {room.status === "ERROR" && room.lastError && (
          <div className="flex gap-2 items-start rounded-md bg-danger/10 border border-danger/30 px-2 py-1.5">
            <span aria-hidden className="text-danger text-xs leading-5">⚠</span>
            <p className="text-xs text-danger break-words leading-5">{room.lastError}</p>
          </div>
        )}
        {error && <p className="text-xs text-danger break-words">{error}</p>}
        {isRunning && identity && identity.worst !== "ok" && (
          <div
            role="alert"
            className={[
              "px-3 py-2 rounded-lg border text-xs leading-5",
              identity.worst === "error"
                ? "bg-danger-muted border-danger/30 text-danger"
                : "bg-warn-muted border-warn/30 text-warn",
            ].join(" ")}
          >
            {identity.findings[0]?.message}
          </div>
        )}
      </div>

      {/* ── Diagnostica (a richiesta) ────────────────────────────────────── */}
      {isRunning && (
        <div className="border-t border-border-subtle">
          <RoomIdentityCheck roomId={room.id} />
          <Disclosure
            label="Sorgente inviata al sito"
            open={showSource}
            onToggle={() => setShowSource((v) => !v)}
            className="border-t border-border-subtle"
          />
          {showSource && <SourceFramePreview roomId={room.id} />}
        </div>
      )}
    </Card>
  );
}

/** Riquadro 16:9 al posto dello schermo: tiene allineate le card nella griglia. */
function ScreenPlaceholder({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    // Uno spazio unico alto quanto barre + schermo di una stanza attiva; il
    // contenuto sta centrato sull'insieme.
    <div className="relative flex flex-col bg-bg-base border-b border-border-subtle">
      <ViewerChromeSpacer />
      <div style={{ aspectRatio: "16 / 9" }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-xs text-text-muted text-center px-4">
        {children}
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  mono = false,
  warn = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  warn?: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0 max-w-full">
      <dt className="text-text-muted shrink-0">{label}</dt>
      <dd
        className={`truncate ${mono ? "font-mono" : "font-medium"} ${
          warn ? "text-warn" : "text-text-secondary"
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function Disclosure({
  label,
  open,
  onToggle,
  className = "",
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`w-full px-3 py-2 flex items-center justify-between text-xs text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast ${className}`}
    >
      <span>{label}</span>
      <span aria-hidden className="text-text-muted">{open ? "nascondi" : "mostra"}</span>
    </button>
  );
}

/** Nome leggibile della verifica, per non mostrare sigle tecniche. */
function captchaLabel(type: string): string {
  switch (type) {
    case "recaptcha":   return "reCAPTCHA";
    case "hcaptcha":    return "hCaptcha";
    case "turnstile":   return "Cloudflare Turnstile";
    case "cloudflare":  return "controllo Cloudflare";
    case "arkose":      return "Arkose/FunCaptcha";
    default:            return "controllo anti-bot";
  }
}

/** Da quanto la stanza è ferma: dice se è appena successo o se è dimenticata. */
function formatWaiting(since: number): string {
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}min`;
}

/** Lingua · fuso · schermo: le parti dell'identità che la stanza imposta davvero.
 *  Sistema e versione del browser sono quelli reali, uguali per tutte. */
function fingerprintLabel(room: BrowserRoom): string {
  const fp = room.fingerprint;
  return [
    fp.locale,
    fp.timezone.split("/")[1] ?? fp.timezone,
    `${fp.viewport.width}×${fp.viewport.height}`,
  ].join(" · ");
}

/** "https://www.sito.com/" → "www.sito.com": nella card basta il dominio. */
function homeLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return url;
  }
}

function countryLabel(code: string | null): string {
  if (!code) return "—";
  return BROWSER_ROOM_COUNTRIES.find((c) => c.code === code)?.label ?? code;
}

// ── Settings stanza (nome, proxy, elimina) ────────────────────────────────────
function RoomSettings({
  room,
  busy,
  onSave,
  onDelete,
}: {
  room: BrowserRoom;
  busy: boolean;
  onSave: (payload: { name?: string; proxy?: string; country?: string; homeUrl?: string }) => void;
  onDelete: () => void;
}): React.ReactElement {
  const [name, setName] = useState(room.name);
  const [homeUrl, setHomeUrl] = useState(room.homeUrl ?? "");
  const [proxy, setProxy] = useState("");
  const [proxyTouched, setProxyTouched] = useState(false);
  const [country, setCountry] = useState(room.country ?? "");

  return (
    <div className="mx-3 mb-2 p-3 rounded-lg bg-bg-base border border-border-subtle space-y-2">
      <Input label="Nome stanza" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Paese (geo del fingerprint)</span>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="px-2 py-2 rounded-md bg-bg-surface border border-border-subtle text-sm text-text-primary focus:outline-none focus:border-border-focus"
        >
          {!room.country && <option value="">(attuale: {room.fingerprint.locale})</option>}
          {BROWSER_ROOM_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <Input
        label={`Proxy${room.proxyHint ? ` (attuale: ${room.proxyHint})` : ""}`}
        placeholder={room.proxyHint ? "Nuovo proxy (vuoto = rimuovi)" : "http://user:pass@host:port"}
        value={proxy}
        onChange={(e) => {
          setProxy(e.target.value);
          setProxyTouched(true);
        }}
      />
      <Input
        label="Home page (prima pagina e nuove tab)"
        placeholder="https://sito.com — vuoto = home predefinita"
        value={homeUrl}
        onChange={(e) => setHomeUrl(e.target.value)}
      />
      <p className="text-[11px] text-text-muted">
        Cambiare paese ri-genera la geo del fingerprint (lingua + fuso); usa un proxy
        coerente. Le modifiche valgono dal prossimo avvio.
      </p>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onDelete}
          disabled={busy}
          className="text-xs font-medium px-2 py-1 rounded-md bg-danger-muted text-danger hover:opacity-80 transition disabled:opacity-40"
        >
          Elimina stanza
        </button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            onSave({
              ...(name.trim() && name.trim() !== room.name ? { name: name.trim() } : {}),
              ...(proxyTouched ? { proxy: proxy.trim() } : {}),
              ...(country && country !== room.country ? { country } : {}),
              ...(homeUrl.trim() !== (room.homeUrl ?? "") ? { homeUrl: homeUrl.trim() } : {}),
            })
          }
        >
          Salva
        </Button>
      </div>
    </div>
  );
}
