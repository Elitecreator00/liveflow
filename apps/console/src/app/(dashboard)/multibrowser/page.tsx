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
  CardHeader,
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
import { BrowserRoomViewer } from "../../../components/BrowserRoomViewer";
import { SourceFramePreview } from "../../../components/SourceFramePreview";
import { RoomIdentityCheck } from "../../../components/RoomIdentityCheck";

export default function MultiBrowserPage(): React.ReactElement {
  const [rooms, setRooms] = useState<BrowserRoom[]>([]);
  // Stato vivo dal data-plane: dice quando una stanza si è fermata su una
  // verifica anti-bot. Va completata a mano dall'operatore, quindi la cosa
  // importante è che se ne accorga subito.
  const [runtime, setRuntime] = useState<Record<string, RoomRuntimeStatus>>({});
  const [sources, setSources] = useState<ActiveIngestSession[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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
          className="px-2 py-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast disabled:opacity-40 self-start sm:self-auto flex items-center gap-2"
        >
          {loading && <Spinner size="xs" variant="muted" />} Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatTile label="Stanze" value={rooms.length} accent="primary" subValue="identità isolate" />
        <StatTile label="In esecuzione" value={running} accent="success" subValue="browser attivi" />
        <StatTile label="Sorgenti live" value={sources.length} accent="danger" subValue="LiveKit rooms" />
      </div>

      <CreateRoomCard nextNumber={nextRoomNumber(rooms)} onCreated={() => void refresh()} />

      {rooms.length === 0 ? (
        <Card variant="ghost" padding="lg" className="text-center">
          <p className="text-text-muted text-sm">
            Nessuna stanza. Creane una: avrà un fingerprint unico e un profilo
            browser isolato e persistente.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))" }}>
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              sources={sources}
              runtime={runtime[room.id]}
              onChanged={() => void refresh()}
            />
          ))}
        </div>
      )}
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
  onCreated,
}: {
  nextNumber: number;
  onCreated: () => void;
}): React.ReactElement {
  const [name, setName] = useState("");
  const [proxy, setProxy] = useState("");
  const [country, setCountry] = useState("IT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await createBrowserRoom(
        { name: name.trim() || undefined, proxy: proxy.trim() || undefined, country },
        token,
      );
      setName("");
      setProxy("");
      onCreated();
    } catch (e) {
      setError((e as Error).message || "Creazione fallita");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="elevated" padding="md" className="space-y-3">
      <h3 className="text-sm font-semibold text-text-primary">Nuova stanza</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1.4fr_auto] sm:items-end">
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
        <Button onClick={() => void create()} disabled={busy}>
          {busy ? "Creazione…" : "Crea stanza"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Il <strong>paese</strong> fissa la geo del fingerprint (lingua + fuso orario): usa un
        proxy dello stesso paese, così IP e fingerprint sono coerenti. Fingerprint unico e
        persistente per stanza; il resto si cambia dai settings.
      </p>
      {error && <p className="text-xs text-danger break-words">{error}</p>}
    </Card>
  );
}

// ── Card stanza ───────────────────────────────────────────────────────────────
function RoomCard({
  room,
  sources,
  runtime,
  onChanged,
}: {
  room: BrowserRoom;
  sources: ActiveIngestSession[];
  /** Stato vivo dal data-plane (verifica anti-bot in corso, spettatori). */
  runtime?: RoomRuntimeStatus;
  onChanged: () => void;
}): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Anteprima della sorgente reale: il sito mostra la sua self-view ribaltata,
  // quindi da lì non si capisce cosa riceve davvero il pubblico.
  const [showSource, setShowSource] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
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

  const statusVariant =
    room.status === "RUNNING"
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

  return (
    <Card variant="elevated" padding="none" className="overflow-hidden">
      <CardHeader
        className="px-3 pt-3 pb-2"
        title={
          <span className="text-sm font-semibold text-text-primary">{room.name}</span>
        }
        actions={
          <div className="flex items-center gap-2">
            {identity && identity.worst !== "ok" && (
              <Badge variant={identity.worst === "error" ? "danger" : "warn"} size="sm">
                {identity.worst === "error" ? "identità a rischio" : "da controllare"}
              </Badge>
            )}
            <Badge variant={statusVariant} size="sm">
              {statusLabel}
            </Badge>
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`text-xs font-medium px-2 py-1 rounded-md transition ${
                showSettings
                  ? "bg-bg-overlay text-text-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-overlay"
              }`}
            >
              Settings
            </button>
          </div>
        }
      />

      {/* Identità della stanza */}
      <div className="px-3 pb-2 text-xs text-text-muted space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Paese</span>
          <span className="font-medium text-text-secondary">{countryLabel(room.country)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Fingerprint</span>
          <span className="font-mono text-text-secondary truncate">
            {fingerprintLabel(room)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Proxy</span>
          <span className="font-mono text-text-secondary">
            {room.proxyHint ?? "nessuno"}
          </span>
        </div>
        {room.sourceSessionId && (
          <div className="flex justify-between gap-2">
            <span>Sorgente</span>
            <span className="text-text-secondary truncate max-w-[60%] text-right">
              {sources.find((s) => s.sessionId === room.sourceSessionId)?.creatorName ?? "— (non più live)"}
            </span>
          </div>
        )}
      </div>

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

      {/* Avvio / stop */}
      <div className="px-3 pb-3 space-y-2">
        {room.status === "RUNNING" || room.status === "PROVISIONING" ? (
          <Button
            variant="danger"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => void act((t) => stopBrowserRoom(room.id, t))}
          >
            {busy ? "…" : "Ferma stanza"}
          </Button>
        ) : (
          <div className="flex gap-2">
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
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
      </div>

      {/* L'avviso completo vive dentro il viewer (anche a schermo intero):
          qui basta un richiamo che non copre nulla. */}
      {captcha && (
        <button
          type="button"
          onClick={() =>
            viewerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
          className="mx-3 mb-3 w-[calc(100%-1.5rem)] flex items-center gap-2 px-3 py-2 rounded-lg bg-warn-muted border border-warn/40 text-left hover:bg-warn/20 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <span aria-hidden className="text-warn">⚠</span>
          <span className="text-xs text-warn flex-1 min-w-0">
            Verifica {captchaLabel(captcha.type)} da completare
          </span>
          <span className="text-2xs font-mono text-warn/80">
            {formatWaiting(captcha.since)}
          </span>
        </button>
      )}

      {/* Coerenza dell'identità: le incoerenze qui fanno scattare le verifiche. */}
      {room.status === "RUNNING" && (
        <div className="border-t border-border-subtle">
          {identity && identity.worst !== "ok" && (
            <div
              role="alert"
              className={[
                "mx-3 mt-3 px-3 py-2 rounded-lg border text-xs leading-5",
                identity.worst === "error"
                  ? "bg-danger-muted border-danger/30 text-danger"
                  : "bg-warn-muted border-warn/30 text-warn",
              ].join(" ")}
            >
              {identity.findings[0]?.message}
            </div>
          )}
          <RoomIdentityCheck roomId={room.id} />
        </div>
      )}

      {/* Sorgente reale inviata al sito (scritte e specchio compresi) */}
      {room.status === "RUNNING" && (
        <div className="border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            aria-expanded={showSource}
            className="w-full px-3 py-2 flex items-center justify-between text-xs text-text-secondary hover:text-text-primary hover:bg-bg-overlay transition-colors duration-fast"
          >
            <span>Sorgente inviata al sito</span>
            <span aria-hidden className="text-text-muted">{showSource ? "nascondi" : "mostra"}</span>
          </button>
          {showSource && <SourceFramePreview roomId={room.id} />}
        </div>
      )}

      {/* Viewer remoto in-house */}
      {room.status === "RUNNING" && room.viewUrl && (
        <div ref={viewerRef}>
          <BrowserRoomViewer
            viewUrl={room.viewUrl}
            roomId={room.id}
            title={room.name}
            captcha={captcha}
            className="border-t border-border-subtle"
          />
        </div>
      )}
    </Card>
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
  onSave: (payload: { name?: string; proxy?: string; country?: string }) => void;
  onDelete: () => void;
}): React.ReactElement {
  const [name, setName] = useState(room.name);
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
            })
          }
        >
          Salva
        </Button>
      </div>
    </div>
  );
}
