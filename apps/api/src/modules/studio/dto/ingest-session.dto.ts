import { IsOptional, IsString } from 'class-validator';

export class CreateIngestSessionDto {
  /**
   * Optional creator ID. When omitted, defaults to the authenticated user's
   * creator record (for CREATOR role users calling from their own device).
   */
  @IsOptional()
  @IsString()
  creatorId?: string;
}

/**
 * Returned by POST /studio/ingest-session.
 * The creator uses wsUrl + creatorToken to publish via LiveKit SDK.
 */
export interface IngestSessionResponse {
  sessionId: string;
  /** LiveKit room name (== sessionId) */
  roomName: string;
  /** LiveKit WebSocket signaling URL (public, reachable by the creator's device) */
  wsUrl: string;
  /** LiveKit AccessToken for the creator: roomJoin + canPublish, canSubscribe=false */
  creatorToken: string;
}

/**
 * Returned by GET /studio/active (one item per LIVE session).
 * The operator uses wsUrl + viewerToken to preview via LiveKit SDK.
 */
export interface ActiveSessionItem {
  sessionId: string;
  creatorId: string;
  /** Nome del creator (displayName) — per mostrare la sorgente in modo leggibile. */
  creatorName: string;
  startedAt: Date;
  /** LiveKit room name */
  roomName: string;
  /** LiveKit WebSocket signaling URL */
  wsUrl: string;
  /** LiveKit AccessToken for the operator: roomJoin + canSubscribe, canPublish=false */
  viewerToken: string;
}
