"use client";

// "Apri in stanza" — accanto a ogni stream dello Studio (ADR-0011): apre la
// sorgente live in una stanza multi-browser, iniettandola come webcam virtuale.
// Le stanze si gestiscono in /multibrowser; qui si sceglie solo dove aprire.

import React, { useEffect, useRef, useState } from "react";
import { Spinner } from "@liveflow/design-system";
import {
  getToken,
  listBrowserRooms,
  startBrowserRoom,
  type BrowserRoom,
} from "@liveflow/api-client";

export function OpenInRoomMenu({
  sourceSessionId,
}: {
  sourceSessionId: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [rooms, setRooms] = useState<BrowserRoom[] | null>(null);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Chiusura al click fuori dal menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    setError(null);
    if (next && rooms === null) {
      const token = getToken();
      if (!token) return;
      try {
        setRooms(await listBrowserRooms(token));
      } catch {
        setRooms([]);
      }
    }
  };

  const openInRoom = async (room: BrowserRoom) => {
    const token = getToken();
    if (!token) return;
    setBusyRoom(room.id);
    setError(null);
    try {
      await startBrowserRoom(room.id, { sourceSessionId }, token);
      setDone(room.name);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message || "Avvio fallito");
    } finally {
      setBusyRoom(null);
    }
  };

  if (done) {
    return (
      <a
        href="/multibrowser"
        className="text-xs font-medium px-2 py-1 rounded-md bg-success-muted text-success border border-success/20 hover:opacity-80 transition-colors"
        title={`Aperta in ${done} — vai al multi-browser`}
      >
        In {done} ↗
      </a>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => void toggle()}
        className="text-xs font-medium px-2 py-1 rounded-md bg-bg-overlay text-text-secondary border border-border-subtle hover:text-text-primary transition-colors"
      >
        Apri in stanza
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg border border-border-subtle bg-bg-surface shadow-lg p-1">
          {rooms === null ? (
            <div className="flex items-center justify-center py-3">
              <Spinner size="xs" variant="muted" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="px-2 py-2 text-xs text-text-muted">
              Nessuna stanza.{" "}
              <a href="/multibrowser" className="text-primary-hover hover:underline">
                Creane una
              </a>
            </div>
          ) : (
            rooms.map((room) => {
              const busy = busyRoom === room.id;
              const occupied = room.status === "RUNNING" || room.status === "PROVISIONING";
              return (
                <button
                  key={room.id}
                  disabled={busy || occupied}
                  onClick={() => void openInRoom(room)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-xs text-text-primary hover:bg-bg-overlay disabled:opacity-40 transition-colors"
                  title={occupied ? "Stanza già in uso: fermala prima" : `Apri in ${room.name}`}
                >
                  <span className="truncate">{room.name}</span>
                  {busy ? (
                    <Spinner size="xs" variant="muted" />
                  ) : (
                    <span className="text-text-muted shrink-0">
                      {occupied ? "in uso" : room.proxyHint ? "proxy ✓" : "no proxy"}
                    </span>
                  )}
                </button>
              );
            })
          )}
          {error && <p className="px-2 py-1 text-[11px] text-danger break-words">{error}</p>}
        </div>
      )}
    </div>
  );
}
