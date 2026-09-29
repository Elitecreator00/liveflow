export const WS_EVENTS = {
  // Server -> Client
  SESSION_STATUS: 'session:status',
  TARGET_STATUS: 'target:status',
  STREAM_HEALTH: 'stream:health',
  /** Scene/overlay state changed (operatore edita → render scena/preview si aggiorna live) */
  SCENE_UPDATE: 'scene:update',
  // Client -> Server
  SUBSCRIBE_SESSION: 'subscribe:session',
  UNSUBSCRIBE_SESSION: 'unsubscribe:session',
} as const;

/** Stato scena trasmesso ai subscriber della sessione (editor operatore + render Egress). */
export interface ScenePayload {
  sessionId: string;
  overlays: unknown[];
  filters?: unknown;
  background?: unknown;
  /** Effetti AR sul volto (ADR-0007 §2, step B.4). Opzionale per retrocompatibilità. */
  effects?: unknown;
  updatedAt: string;
}

export interface SessionStatusPayload {
  sessionId: string;
  status: string;
  agencyId: string;
}

export interface TargetStatusPayload {
  targetId: string;
  sessionId: string;
  platform: string;
  status: string;
  lastError?: string;
}
