"use client";

/**
 * Anteprima di ciò che una stanza sta REALMENTE inviando al sito.
 *
 * Perché esiste: i siti mostrano la propria anteprima ribaltata (self-view, es.
 * chatroulette applica `scaleX(-1)` al contenitore del video). Guardando lì,
 * scritte e specchio sembrano sbagliati anche quando sono corretti, e non c'è
 * modo di capire cosa vede davvero il pubblico. Qui si guarda la sorgente alla
 * fonte: un fotogramma preso dalla webcam virtuale della stanza.
 *
 * È uno snapshot aggiornato a intervalli, non un video: basta per verificare
 * scritte, filtri e specchio, e non aggiunge carico al percorso della diretta.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getRoomSourceFrame, getToken } from "@liveflow/api-client";
import { Spinner } from "@liveflow/design-system";

const REFRESH_MS = 2000;

export function SourceFramePreview({
  roomId,
  className = "",
}: {
  roomId: string;
  className?: string;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const blob = await getRoomSourceFrame(roomId, token);
      const next = URL.createObjectURL(blob);
      // L'URL precedente va liberato o la memoria cresce a ogni aggiornamento.
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next;
      setUrl(next);
      setError(null);
    } catch {
      setError("Sorgente non leggibile in questo momento.");
    }
  }, [roomId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(id);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, [load]);

  return (
    <div className={`relative bg-black aspect-video ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Fotogramma inviato al sito dalla stanza"
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          {error ? (
            <p className="text-xs text-text-muted px-3 text-center">{error}</p>
          ) : (
            <Spinner size="sm" variant="muted" />
          )}
        </div>
      )}
      <span className="absolute top-2 left-2 text-2xs font-medium px-1.5 py-0.5 rounded bg-black/60 text-white/90">
        Come lo vede il sito
      </span>
    </div>
  );
}
