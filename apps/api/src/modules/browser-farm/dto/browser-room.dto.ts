import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BrowserRoomStatus } from '@prisma/client';

/**
 * POST /browser-farm/rooms — crea una stanza multi-browser (ADR-0011).
 * Il fingerprint NON si passa: lo genera il server, unico e coerente, alla
 * creazione, e resta stabile per tutta la vita della stanza.
 */
export class CreateRoomDto {
  /** Nome della stanza; default "Stanza N". */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  /**
   * Proxy della stanza (es. http://user:pass@host:port). Impostato alla
   * creazione, modificabile dai settings. Cifrato a riposo (C5).
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  proxy?: string;

  /**
   * Codice paese (es. "IT", "US") che fissa la geo del fingerprint
   * (locale + timezone). Va scelto coerente col paese del proxy. Assente =
   * geo casuale.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

/**
 * PATCH /browser-farm/rooms/:id — settings della stanza.
 * `proxy: ""` rimuove il proxy. Le modifiche al proxy valgono dal prossimo
 * avvio (il browser lo riceve come parametro di lancio).
 */
export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  proxy?: string;

  /**
   * Cambia il paese della stanza: ri-geolocalizza il fingerprint (locale +
   * timezone) mantenendo il resto. Vale dal prossimo avvio.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;
}

/**
 * POST /browser-farm/rooms/:id/start — avvia la stanza.
 * Con sourceSessionId la sorgente Studio LIVE viene iniettata come webcam
 * virtuale (binding C1); senza, la stanza parte con un placeholder sulla
 * webcam (utile per login/setup degli account prima di andare live).
 */
export class StartRoomDto {
  @IsOptional()
  @IsString()
  sourceSessionId?: string;
}

/** Sintesi del fingerprint mostrata all'operatore (mai i dettagli interni). */
export interface FingerprintSummary {
  userAgent: string;
  locale: string;
  timezone: string;
  viewport: { width: number; height: number };
}

/** Codice paese della geo del fingerprint (derivato da locale+timezone). */
export type RoomCountry = string;

/**
 * Vista operatore di una stanza. Il proxy non esce mai in chiaro: solo
 * `proxyHint` (host:port senza credenziali). `viewUrl` è il WebSocket del
 * viewer in-house (CDP screencast), presente solo quando la stanza è RUNNING.
 */
export interface BrowserRoomView {
  id: string;
  name: string;
  status: BrowserRoomStatus;
  sourceSessionId: string | null;
  proxyHint: string | null;
  fingerprint: FingerprintSummary;
  /** Codice paese della geo (es. "IT"); null se non riconosciuto. */
  country: RoomCountry | null;
  viewUrl: string | null;
  lastError: string | null;
  startedAt: Date | null;
  createdAt: Date;
}
