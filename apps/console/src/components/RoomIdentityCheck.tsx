"use client";

/**
 * Diagnosi di coerenza dell'identità di una stanza.
 *
 * Perché: le verifiche anti-bot arrivano quasi sempre quando i segnali non
 * combaciano — un'uscita di rete in un paese e un browser che ne dichiara un
 * altro. Finora la stanza non lo diceva: si scopriva solo venendo bloccati.
 * Qui l'operatore vede da dove esce davvero, cosa dichiara il browser, e cosa
 * conviene correggere.
 */

import React, { useCallback, useState } from "react";
import {
  checkRoomIdentity,
  getToken,
  type IdentityReport,
} from "@liveflow/api-client";
import { Button, Spinner } from "@liveflow/design-system";

const LEVEL_STYLE: Record<string, string> = {
  error: "bg-danger-muted border-danger/30 text-danger",
  warn: "bg-warn-muted border-warn/30 text-warn",
  ok: "bg-success-muted border-success/30 text-success",
};

export function RoomIdentityCheck({ roomId }: { roomId: string }): React.ReactElement {
  const [report, setReport] = useState<IdentityReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await checkRoomIdentity(roomId, token));
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Diagnosi non riuscita. Riprova fra qualche secondo.",
      );
    } finally {
      setBusy(false);
    }
  }, [roomId]);

  return (
    <div className="px-3 py-2 space-y-2">
      <Button
        variant="outline"
        size="sm"
        fullWidth
        loading={busy}
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Verifica in corso…" : "Verifica identità"}
      </Button>

      {error && <p className="text-xs text-danger break-words">{error}</p>}

      {report && (
        <div className="space-y-2 animate-fade-in">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
            <Row label="IP di uscita" value={report.exit.ip} />
            <Row
              label="Posizione"
              value={
                [report.exit.city, report.exit.countryCode].filter(Boolean).join(", ") || null
              }
            />
            <Row label="Rete" value={report.exit.isp} />
            <Row label="Fuso (rete)" value={report.exit.timezone} />
            <Row label="Fuso (browser)" value={report.browser.timezone} />
            <Row label="Lingua" value={report.browser.language} />
            <Row label="WebGL" value={report.browser.webgl ?? null} />
          </div>

          <ul className="space-y-1">
            {report.findings.map((f, i) => (
              <li
                key={i}
                className={`text-2xs leading-4 px-2 py-1.5 rounded border ${
                  LEVEL_STYLE[f.level] ?? LEVEL_STYLE.ok
                }`}
              >
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {busy && !report && (
        <div className="flex justify-center py-2">
          <Spinner size="sm" variant="muted" />
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }): React.ReactElement {
  return (
    <>
      <span className="text-text-muted">{label}</span>
      <span className="font-mono text-text-secondary truncate" title={value ?? undefined}>
        {value ?? "—"}
      </span>
    </>
  );
}
