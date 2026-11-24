"use client";

// Finestra dedicata a UNA stanza multi-browser: solo il browser remoto, senza
// sidebar né il resto della Console, come un programma a sé. Si apre dal
// pulsante "Apri in una finestra separata" del viewer (multibrowser/page.tsx).
//
// Fuori da (dashboard) per non ereditare sidebar e barra in alto, quindi il
// controllo di accesso è ripetuto qui: stessa regola del layout della Console.

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Spinner } from "@liveflow/design-system";
import {
  decodeJwtPayload,
  getRoomsRuntime,
  getToken,
  listBrowserRooms,
  type BrowserRoom,
  type RoomRuntimeStatus,
} from "@liveflow/api-client";
import { BrowserRoomViewer } from "@/components/BrowserRoomViewer";

const AGENCY_ROLES = ["OWNER", "MANAGER", "CHATTER"];

type LoadState = "loading" | "ready" | "unauthorized" | "missing";

export default function RoomWindowPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>("loading");
  const [room, setRoom] = useState<BrowserRoom | null>(null);
  const [runtime, setRuntime] = useState<RoomRuntimeStatus | undefined>(undefined);

  const load = useCallback(async () => {
    const token = getToken();
    const role = token ? decodeJwtPayload(token)?.["role"] : undefined;
    if (!token || typeof role !== "string" || !AGENCY_ROLES.includes(role)) {
      setState("unauthorized");
      return;
    }
    try {
      const rooms = await listBrowserRooms(token);
      const found = rooms.find((r) => r.id === id) ?? null;
      setRoom(found);
      setState(found ? "ready" : "missing");
    } catch {
      // Rete o API momentaneamente giù: si tiene l'ultimo stato noto.
      setState((s) => (s === "loading" ? "missing" : s));
    }
  }, [id]);

  // Il viewUrl porta un token a scadenza: si rinnova come nella Console.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  // Verifiche anti-bot: l'avviso deve comparire anche in questa finestra.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const token = getToken();
      if (!token || stop) return;
      try {
        const all = await getRoomsRuntime(token);
        if (!stop) setRuntime(all[id]);
      } catch {
        /* si riprova al giro dopo */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [id]);

  // Il nome della stanza nel titolo: è quello che si vede nella barra delle
  // applicazioni quando le finestre sono più d'una.
  useEffect(() => {
    document.title = room ? `${room.name} — LiveFlow` : "Stanza — LiveFlow";
  }, [room]);

  const running = room?.status === "RUNNING" && !!room.viewUrl;

  return (
    <div className="h-screen flex flex-col bg-bg-base overflow-hidden">
      {room && (
        <header className="flex items-center gap-2 px-3 h-9 shrink-0 border-b border-border-subtle bg-bg-surface">
          <span className="text-sm font-semibold text-text-primary truncate">{room.name}</span>
          {room.proxyHint && (
            <span className="text-2xs font-mono text-text-muted truncate hidden sm:inline">
              {room.proxyHint}
            </span>
          )}
          <span className="flex-1" />
          <Badge variant={running ? "success" : "default"} size="sm">
            {running ? "attiva" : "ferma"}
          </Badge>
        </header>
      )}

      {running && room?.viewUrl ? (
        <BrowserRoomViewer
          standalone
          viewUrl={room.viewUrl}
          roomId={room.id}
          title={room.name}
          captcha={runtime?.captcha ?? null}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          {state === "loading" ? (
            <Spinner size="md" variant="muted" />
          ) : (
            <>
              <p className="text-sm text-text-secondary max-w-sm">
                {state === "unauthorized"
                  ? "Sessione scaduta: accedi di nuovo alla Console, poi riapri la stanza."
                  : state === "missing"
                    ? "Stanza non trovata: potrebbe essere stata eliminata."
                    : "La stanza è ferma. Avviala dalla Console: questa finestra si collega da sola."}
              </p>
              {state === "unauthorized" && (
                <a
                  href="/login"
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-white hover:opacity-90"
                >
                  Vai al login
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
