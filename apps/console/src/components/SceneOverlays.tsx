"use client";

import React, { useRef } from "react";
import type { SceneOverlay } from "@liveflow/api-client";

interface SceneOverlaysProps {
  overlays: SceneOverlay[];
  /** Modalità editor: abilita selezione e drag degli overlay. */
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Chiamata durante il drag con la nuova posizione in % (x, y). */
  onMove?: (id: string, x: number, y: number) => void;
}

/**
 * Render degli overlay scena sopra un contenitore relativo.
 *
 * Posizione/dimensioni in PERCENTUALE: `left/top` in % del contenitore, mentre
 * larghezza e font usano unità `cqw` (1cqw = 1% della larghezza del contenitore),
 * così tutto scala con il video ed è WYSIWYG a qualsiasi risoluzione.
 *
 * Senza le prop di editing è PURO e non-interattivo (`pointer-events-none`):
 * questa è la modalità riusata dalla pagina scena renderizzata da LiveKit Egress.
 * Con `editable` abilita drag e selezione per l'editor operatore.
 *
 * Il contenitore parent DEVE essere `position: relative`.
 */
export function SceneOverlays({
  overlays,
  editable = false,
  selectedId = null,
  onSelect,
  onMove,
}: SceneOverlaysProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    ox: number;
    oy: number;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent, o: SceneOverlay) => {
    if (!editable) return;
    e.preventDefault();
    onSelect?.(o.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: o.id, startX: e.clientX, startY: e.clientY, ox: o.x, oy: o.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0 || rect.height === 0) return;
    const dxPct = ((e.clientX - d.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - d.startY) / rect.height) * 100;
    const nx = Math.min(100, Math.max(0, d.ox + dxPct));
    const ny = Math.min(100, Math.max(0, d.oy + dyPct));
    onMove?.(d.id, Math.round(nx * 10) / 10, Math.round(ny * 10) / 10);
  };

  const endDrag = (e: React.PointerEvent) => {
    drag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  return (
    <div
      ref={containerRef}
      className={[
        "absolute inset-0 overflow-hidden",
        editable ? "" : "pointer-events-none",
      ].join(" ")}
      style={{ containerType: "inline-size" } as React.CSSProperties}
      aria-hidden="true"
    >
      {overlays
        .filter((o) => o.visible)
        .slice()
        .sort((a, b) => (a.z ?? 0) - (b.z ?? 0))
        .map((o) => {
          const selected = editable && o.id === selectedId;
          const base: React.CSSProperties = {
            position: "absolute",
            left: `${o.x}%`,
            top: `${o.y}%`,
            width: `${o.width}cqw`,
            zIndex: o.z ?? 0,
            ...(editable
              ? {
                  cursor: "move",
                  touchAction: "none",
                  outline: selected ? "2px solid var(--lf-primary, #8b5cf6)" : "1px dashed rgba(255,255,255,0.4)",
                  outlineOffset: "2px",
                }
              : {}),
          };
          const dragHandlers = editable
            ? {
                onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, o),
                onPointerMove: handlePointerMove,
                onPointerUp: endDrag,
                onPointerCancel: endDrag,
              }
            : {};

          if (o.type === "image") {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={o.id}
                src={o.url}
                alt=""
                draggable={false}
                style={{ ...base, height: "auto", objectFit: "contain" }}
                {...dragHandlers}
              />
            );
          }
          const hasBg = Boolean(o.background);
          return (
            <div
              key={o.id}
              style={{
                ...base,
                fontSize: `${o.fontSize ?? 5}cqw`,
                color: o.color ?? "#ffffff",
                background: o.background ?? "transparent",
                fontWeight: o.fontWeight ?? "700",
                lineHeight: 1.15,
                padding: hasBg ? "0.15em 0.4em" : 0,
                borderRadius: hasBg ? "0.2em" : 0,
                textShadow: hasBg ? "none" : "0 2px 8px rgba(0,0,0,0.65)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
              {...dragHandlers}
            >
              {o.text}
            </div>
          );
        })}
    </div>
  );
}
