/**
 * WebSocket client for the /live namespace (socket.io).
 * Connects to the NestJS RealtimeGateway.
 */

import type { Socket } from "socket.io-client";

export type WsConnectionState = "connecting" | "connected" | "disconnected";

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

export const WS_EVENTS = {
  SESSION_STATUS: "session:status",
  TARGET_STATUS: "target:status",
  STREAM_HEALTH: "stream:health",
  SCENE_UPDATE: "scene:update",
  SUBSCRIBE_SESSION: "subscribe:session",
  UNSUBSCRIBE_SESSION: "unsubscribe:session",
} as const;

export interface SceneUpdatePayload {
  sessionId: string;
  overlays: unknown[];
  filters?: unknown;
  background?: unknown;
  /** Effetti AR sul volto (ADR-0007 §2). Opzionale per retrocompatibilità. */
  effects?: unknown;
  updatedAt: string;
}

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export async function connectSocket(token: string): Promise<Socket> {
  // Lazy-load socket.io-client to avoid SSR issues
  const { io } = await import("socket.io-client");
  const baseUrl =
    (typeof process !== "undefined" && process.env["NEXT_PUBLIC_API_URL"]) ??
    "http://localhost:3001";

  if (socket?.connected) return socket;

  socket = io(`${baseUrl}/live`, {
    auth: { token },
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function subscribeSession(sessionId: string): void {
  socket?.emit(WS_EVENTS.SUBSCRIBE_SESSION, { sessionId });
}

export function unsubscribeSession(sessionId: string): void {
  socket?.emit(WS_EVENTS.UNSUBSCRIBE_SESSION, { sessionId });
}

/** Registra un handler per gli aggiornamenti di scena; ritorna la funzione di cleanup. */
export function onSceneUpdate(
  handler: (payload: SceneUpdatePayload) => void,
): () => void {
  socket?.on(WS_EVENTS.SCENE_UPDATE, handler);
  return () => socket?.off(WS_EVENTS.SCENE_UPDATE, handler);
}
