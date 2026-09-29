/**
 * LiveFlow API Client
 * Typed HTTP client for the NestJS backend.
 * Falls back to mock data gracefully when the API is unreachable.
 *
 * Consumed via transpilePackages (no build step required).
 */

export const getBaseUrl = (): string =>
  (typeof process !== "undefined"
    ? (process.env["NEXT_PUBLIC_API_URL"] ?? "")
    : "") || "http://localhost:3001";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export type Platform =
  | "CHATURBATE"
  | "STRIPCHAT"
  | "MYFREECAMS"
  | "TWITCH"
  | "YOUTUBE"
  | "CUSTOM";

export interface ConnectedAccount {
  id: string;
  platform: Platform;
  platformUsername: string;
  isActive: boolean;
  createdAt: string;
}

export interface GoLivePayload {
  creatorId: string;
  connectedAccountIds: string[];
}

export interface GoLiveResponse {
  sessionId: string;
  streamKey: string;
  ingestUrl: string;
}

export interface StreamSession {
  id: string;
  status: "LIVE" | "ENDED" | "FAILED";
  startedAt: string;
  endedAt?: string;
  streamKey: string;
  agencyId: string;
  creatorId: string;
}

export interface StreamHealthStatus {
  isPublishing: boolean;
  readerCount: number;
  bytesReceived: number;
  bytesSent: number;
  paths: MediaMtxPath[];
}

export interface MediaMtxPath {
  name: string;
  source?: { type: string; id: string };
  readers: Array<{ type: string; id: string; bytesReceived: number; bytesSent: number }>;
  bytesReceived: number;
  bytesSent: number;
}

// ── Studio (LiveKit ingest + operator preview) ────────────────────────────
//
// TODO STEP B: when LiveKit Egress is added, these types will gain
//   egressId, sceneUrl, and compositeRtmpUrl fields.
//   See ADR-0004 and discovery/STUDIO_COMPOSITING_SPIKE.md.

export interface IngestSessionResponse {
  sessionId: string;
  /** LiveKit room name (== sessionId) */
  roomName: string;
  /** LiveKit WebSocket signaling URL reachable by the creator's device */
  wsUrl: string;
  /** LiveKit AccessToken: roomJoin + canPublish, canSubscribe=false */
  creatorToken: string;
}

export interface ActiveIngestSession {
  sessionId: string;
  creatorId: string;
  /** Nome del creator (displayName) — etichetta leggibile della sorgente. */
  creatorName: string;
  startedAt: string;
  /** LiveKit room name */
  roomName: string;
  /** LiveKit WebSocket signaling URL */
  wsUrl: string;
  /** LiveKit AccessToken: roomJoin + canSubscribe, canPublish=false */
  viewerToken: string;
}

export type MockStreamTile = {
  id: string;
  creatorName: string;
  platform: Platform;
  status: "live" | "offline" | "warn";
  quality: "excellent" | "good" | "degraded" | "critical" | "offline";
  bitrate: string;
  viewerCount: number;
  duration: string;
};

// ── Internal fetch helper ──────────────────────────────────────────────────

interface FetchOptions extends RequestInit {
  token?: string;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { token, ...init } = opts;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers ?? {}),
  };

  const res = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  return apiFetch<AuthTokens>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Streaming ─────────────────────────────────────────────────────────────

export async function goLive(
  agencyId: string,
  payload: GoLivePayload,
  token: string,
): Promise<GoLiveResponse> {
  return apiFetch<GoLiveResponse>(
    `/agencies/${agencyId}/streaming/go-live`,
    { method: "POST", body: JSON.stringify(payload), token },
  );
}

export async function stopLive(
  agencyId: string,
  sessionId: string,
  token: string,
): Promise<StreamSession> {
  return apiFetch<StreamSession>(
    `/agencies/${agencyId}/streaming/sessions/${sessionId}/stop`,
    { method: "POST", token },
  );
}

// ── Studio (LiveKit) ──────────────────────────────────────────────────────

export async function createIngestSession(
  token: string,
  creatorId?: string,
): Promise<IngestSessionResponse> {
  return apiFetch<IngestSessionResponse>("/studio/ingest-session", {
    method: "POST",
    body: JSON.stringify(creatorId ? { creatorId } : {}),
    token,
  });
}

export async function stopIngestSession(
  sessionId: string,
  token: string,
): Promise<{ sessionId: string; status: string }> {
  return apiFetch<{ sessionId: string; status: string }>(
    `/studio/ingest-session/${sessionId}/stop`,
    { method: "POST", token },
  );
}

/**
 * Specchio della sorgente. Il ribaltamento NON avviene sul device della
 * creator (lì costerebbe una ricodifica di ogni frame, con la diretta che va al
 * rallentatore su PC): qui si registra solo la scelta, applicata a valle.
 */
/** Verifica anti-bot in corso in una stanza: la completa l'operatore, a mano. */
export interface CaptchaState {
  type: string;
  /** epoch ms: da quanto la stanza è ferma in attesa. */
  since: number;
}

export interface IdentitySummary {
  checkedAt: number;
  worst: "ok" | "warn" | "error";
  findings: IdentityFinding[];
}

export interface RoomRuntimeStatus {
  captcha: CaptchaState | null;
  mirror: boolean;
  viewers: number;
  /** Esito della verifica automatica all'avvio: null se non ancora eseguita. */
  identity?: IdentitySummary | null;
}

export interface IdentityFinding {
  level: "ok" | "warn" | "error";
  message: string;
}

export interface IdentityReport {
  exit: {
    ip: string | null;
    country: string | null;
    countryCode: string | null;
    city: string | null;
    timezone: string | null;
    isp: string | null;
  };
  browser: {
    timezone: string;
    language: string;
    languages: string;
    platform: string;
    screen: string;
    webdriver: boolean;
    /** Renderer WebGL, null se assente: un browser reale ce l'ha sempre. */
    webgl?: string | null;
  };
  findings: IdentityFinding[];
}

/**
 * Stato vivo delle stanze: serve per accorgersi che una si è fermata su una
 * verifica anti-bot, che va completata a mano dal viewer.
 */
export async function getRoomsRuntime(
  token: string,
): Promise<Record<string, RoomRuntimeStatus>> {
  return apiFetch<Record<string, RoomRuntimeStatus>>("/browser-farm/rooms/runtime", {
    token,
  });
}

/** Coerenza fra uscita di rete reale e identità dichiarata dal browser. */
export async function checkRoomIdentity(
  roomId: string,
  token: string,
): Promise<IdentityReport> {
  return apiFetch<IdentityReport>(`/browser-farm/rooms/${roomId}/identity`, { token });
}

/**
 * Fotogramma di ciò che una stanza sta davvero inviando al sito (scritte e
 * specchio compresi).
 *
 * Serve perché i siti mostrano la propria anteprima ribaltata: da lì scritte e
 * specchio sembrano sbagliati anche quando sono corretti.
 */
export async function getRoomSourceFrame(
  roomId: string,
  token: string,
): Promise<Blob> {
  const res = await fetch(
    `${getBaseUrl()}/browser-farm/rooms/${roomId}/source-frame`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!res.ok) {
    throw new ApiError(res.status, await res.text().catch(() => ""));
  }
  return res.blob();
}

export async function setSourceMirror(
  sessionId: string,
  mirrored: boolean,
  token: string,
): Promise<{ mirrored: boolean }> {
  return apiFetch<{ mirrored: boolean }>(
    `/studio/ingest-session/${sessionId}/mirror`,
    { method: "POST", token, body: JSON.stringify({ mirrored }) },
  );
}

export async function getActiveSessions(
  token: string,
): Promise<ActiveIngestSession[]> {
  return apiFetch<ActiveIngestSession[]>("/studio/active", { token });
}

// ── Scene / overlay (M1.11) ────────────────────────────────────────────────
//
// Posizione/dimensioni in PERCENTUALE del canvas (0–100): rendering
// indipendente dalla risoluzione e WYSIWYG tra editor operatore e render cloud.

export type OverlayType = "text" | "image";

export interface SceneOverlay {
  id: string;
  type: OverlayType;
  /** % dal bordo sinistro */
  x: number;
  /** % dal bordo superiore */
  y: number;
  /** larghezza in % della larghezza canvas */
  width: number;
  /** z-index relativo */
  z?: number;
  visible: boolean;
  // text
  text?: string;
  /** dimensione font in % della larghezza canvas */
  fontSize?: number;
  color?: string;
  background?: string;
  fontWeight?: string;
  // image
  url?: string;
}

/** Filtri/effetti sulla sorgente video (resi via CSS `filter`, WYSIWYG con l'Egress). */
export interface SceneFilters {
  /** % (100 = neutro) */
  brightness?: number;
  contrast?: number;
  saturate?: number;
  /** % (0 = neutro) */
  grayscale?: number;
  sepia?: number;
  invert?: number;
  /** gradi */
  hueRotate?: number;
  /** px */
  blur?: number;
  /** nome preset selezionato (UI) */
  preset?: string;
}

/**
 * Sfondo AI (ADR-0007 §1). Segmentazione persona (MediaPipe) calcolata lato
 * render/preview operatore (WYSIWYG). La creator pubblica grezzo.
 */
export interface SceneBackground {
  mode: "none" | "blur" | "image";
  /** raggio di sfocatura in px (mode 'blur') */
  blur?: number;
  /** URL immagine di sfondo (mode 'image') */
  imageUrl?: string;
}

/**
 * Effetti AR sul volto (ADR-0007 §2, step B.4).
 * Calcolati lato nostro (MediaPipe Face Landmarker), controllati dall'operatore.
 * Tutti i campi sono opzionali; assenza = effetto disattivato (retrocompatibile).
 */
export interface SceneEffects {
  /** Ritocco pelle/glow. intensity: 0–100 (0 = disattivato). */
  beautify?: {
    enabled: boolean;
    /** 0–100 */
    intensity: number;
  };
  /** Oscuramento/privacy volto. mode: 'pixelate' | 'blur'. */
  facePrivacy?: {
    enabled: boolean;
    mode: "pixelate" | "blur";
    /** 0–100: intensità effetto (pixel size per pixelate, raggio per blur) */
    intensity: number;
  };
}

export interface SceneState {
  sessionId: string;
  overlays: SceneOverlay[];
  filters?: SceneFilters;
  background?: SceneBackground;
  /** Effetti AR sul volto. Opzionale per retrocompatibilità. */
  effects?: SceneEffects;
  updatedAt: string;
}

export async function getSceneState(
  sessionId: string,
  token: string,
): Promise<SceneState> {
  return apiFetch<SceneState>(`/studio/sessions/${sessionId}/scene`, { token });
}

export async function updateSceneState(
  sessionId: string,
  overlays: SceneOverlay[],
  filters: SceneFilters | undefined,
  background: SceneBackground | undefined,
  effectsOrToken: SceneEffects | undefined | string,
  token?: string,
): Promise<SceneState> {
  // Overload: legacy 5-arg call (no effects) passes token as 5th arg.
  let resolvedEffects: SceneEffects | undefined;
  let resolvedToken: string;
  if (typeof effectsOrToken === "string") {
    resolvedEffects = undefined;
    resolvedToken = effectsOrToken;
  } else {
    if (!token) {
      throw new Error(
        "updateSceneState: token richiesto quando si passa effects (firma a 6 argomenti)",
      );
    }
    resolvedEffects = effectsOrToken;
    resolvedToken = token;
  }
  return apiFetch<SceneState>(`/studio/sessions/${sessionId}/scene`, {
    method: "PUT",
    body: JSON.stringify({ overlays, filters, background, effects: resolvedEffects }),
    token: resolvedToken,
  });
}

/** Avvia il render Egress della scena (composito → RTMP → fan-out). */
export async function startSceneRender(
  sessionId: string,
  token: string,
): Promise<{ egressId: string; rtmpUrl: string }> {
  return apiFetch(`/studio/sessions/${sessionId}/render/start`, {
    method: "POST",
    token,
  });
}

/** Ferma il render Egress della scena. */
export async function stopSceneRender(
  sessionId: string,
  token: string,
): Promise<{ stopped: boolean }> {
  return apiFetch(`/studio/sessions/${sessionId}/render/stop`, {
    method: "POST",
    token,
  });
}

/**
 * Carica un'immagine (dalla galleria/PC) come asset e ritorna l'URL assoluto
 * da usare in un overlay immagine. Legge il File come data URL e lo invia all'API.
 */
export async function uploadSceneImage(file: File, token: string): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lettura file fallita"));
    reader.readAsDataURL(file);
  });
  const res = await apiFetch<{ url: string }>("/studio/uploads", {
    method: "POST",
    body: JSON.stringify({ dataUrl }),
    token,
  });
  return res.url.startsWith("http") ? res.url : `${getBaseUrl()}${res.url}`;
}

// ── Creators ──────────────────────────────────────────────────────────────

export interface Creator {
  id: string;
  displayName: string;
  email: string;
  createdAt: string;
  platforms?: Array<{
    platform: Platform;
    platformUsername: string;
    isActive: boolean;
  }>;
}

export interface CreateCreatorPayload {
  displayName: string;
  email: string;
  password: string;
}

export interface ConnectAccountPayload {
  platform: Platform;
  platformUsername: string;
  streamKey: string;
}

export async function createCreator(
  agencyId: string,
  payload: CreateCreatorPayload,
  token: string,
): Promise<Creator> {
  return apiFetch<Creator>(`/agencies/${agencyId}/creators`, {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

export async function listCreators(
  agencyId: string,
  token: string,
): Promise<Creator[]> {
  return apiFetch<Creator[]>(`/agencies/${agencyId}/creators`, { token });
}

export async function connectAccount(
  agencyId: string,
  creatorId: string,
  payload: ConnectAccountPayload,
  token: string,
): Promise<ConnectedAccount> {
  return apiFetch<ConnectedAccount>(
    `/agencies/${agencyId}/creators/${creatorId}/accounts`,
    { method: "POST", body: JSON.stringify(payload), token },
  );
}

export async function listConnectedAccounts(
  agencyId: string,
  creatorId: string,
  token: string,
): Promise<ConnectedAccount[]> {
  return apiFetch<ConnectedAccount[]>(
    `/agencies/${agencyId}/creators/${creatorId}/accounts`,
    { token },
  );
}

// ── Multi-browser (stanze, ADR-0011) ──────────────────────────────────────
//
// Una stanza = identità browser persistente e totalmente isolata: fingerprint
// unico generato alla creazione, proxy unico (modificabile dai settings),
// profilo browser persistente sul VPS. Display remoto in-house (CDP screencast
// via WebSocket `viewUrl`), nessun servizio esterno.

export type BrowserRoomStatus = "IDLE" | "PROVISIONING" | "RUNNING" | "ERROR";

/**
 * Paesi selezionabili per la geo del fingerprint (codice + etichetta). Va
 * tenuta allineata a GEO_POOL nel FingerprintService dell'API. Scegliere il
 * paese coerente col proxy: IP e timezone/locale devono combaciare.
 */
export const BROWSER_ROOM_COUNTRIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "IT", label: "🇮🇹 Italia" },
  { code: "US", label: "🇺🇸 Stati Uniti" },
  { code: "GB", label: "🇬🇧 Regno Unito" },
  { code: "DE", label: "🇩🇪 Germania" },
  { code: "FR", label: "🇫🇷 Francia" },
  { code: "ES", label: "🇪🇸 Spagna" },
  { code: "NL", label: "🇳🇱 Paesi Bassi" },
  { code: "PL", label: "🇵🇱 Polonia" },
  { code: "PT", label: "🇵🇹 Portogallo" },
  { code: "RO", label: "🇷🇴 Romania" },
  { code: "CA", label: "🇨🇦 Canada" },
  { code: "BR", label: "🇧🇷 Brasile" },
];

export interface BrowserRoomFingerprint {
  userAgent: string;
  locale: string;
  timezone: string;
  viewport: { width: number; height: number };
}

export interface BrowserRoom {
  id: string;
  name: string;
  status: BrowserRoomStatus;
  sourceSessionId: string | null;
  /** Proxy senza credenziali (host:port); null = nessun proxy. */
  proxyHint: string | null;
  fingerprint: BrowserRoomFingerprint;
  /** Codice paese della geo (es. "IT"); null se non riconosciuto. */
  country: string | null;
  /** WebSocket del viewer in-house; presente solo quando RUNNING. */
  viewUrl: string | null;
  lastError: string | null;
  startedAt: string | null;
  createdAt: string;
}

/** Crea una stanza (nome default "Stanza N", fingerprint generato dal server). */
export async function createBrowserRoom(
  payload: { name?: string; proxy?: string; country?: string },
  token: string,
): Promise<BrowserRoom> {
  return apiFetch<BrowserRoom>("/browser-farm/rooms", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

export async function listBrowserRooms(token: string): Promise<BrowserRoom[]> {
  return apiFetch<BrowserRoom[]>("/browser-farm/rooms", { token });
}

/** Settings stanza: nome e/o proxy (`proxy: ""` lo rimuove; vale dal prossimo avvio). */
export async function updateBrowserRoom(
  roomId: string,
  payload: { name?: string; proxy?: string; country?: string },
  token: string,
): Promise<BrowserRoom> {
  return apiFetch<BrowserRoom>(`/browser-farm/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    token,
  });
}

/** Elimina la stanza e il suo profilo persistente sul data-plane. */
export async function deleteBrowserRoom(
  roomId: string,
  token: string,
): Promise<{ id: string }> {
  return apiFetch(`/browser-farm/rooms/${roomId}`, { method: "DELETE", token });
}

/**
 * Avvia la stanza: con `sourceSessionId` la sorgente Studio LIVE diventa la
 * webcam virtuale; senza, la stanza parte con un placeholder (login/setup).
 */
export async function startBrowserRoom(
  roomId: string,
  payload: { sourceSessionId?: string },
  token: string,
): Promise<BrowserRoom> {
  return apiFetch<BrowserRoom>(`/browser-farm/rooms/${roomId}/start`, {
    method: "POST",
    body: JSON.stringify(payload),
    token,
  });
}

export async function stopBrowserRoom(
  roomId: string,
  token: string,
): Promise<BrowserRoom> {
  return apiFetch<BrowserRoom>(`/browser-farm/rooms/${roomId}/stop`, {
    method: "POST",
    token,
  });
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function getStreamHealth(
  token: string,
): Promise<StreamHealthStatus> {
  return apiFetch<StreamHealthStatus>("/health/stream", { token });
}

// ── Mock data (fallback when API unreachable) ──────────────────────────────

export const MOCK_STREAM_TILES: MockStreamTile[] = [
  {
    id: "mock-1",
    creatorName: "Luna_Star",
    platform: "CHATURBATE",
    status: "live",
    quality: "excellent",
    bitrate: "4500 kbps",
    viewerCount: 1243,
    duration: "01:32:10",
  },
  {
    id: "mock-2",
    creatorName: "Violet_Rose",
    platform: "STRIPCHAT",
    status: "live",
    quality: "good",
    bitrate: "3800 kbps",
    viewerCount: 892,
    duration: "00:47:22",
  },
  {
    id: "mock-3",
    creatorName: "Sky_Blue",
    platform: "MYFREECAMS",
    status: "warn",
    quality: "degraded",
    bitrate: "2100 kbps",
    viewerCount: 314,
    duration: "02:11:05",
  },
  {
    id: "mock-4",
    creatorName: "Nova_X",
    platform: "CHATURBATE",
    status: "live",
    quality: "excellent",
    bitrate: "5000 kbps",
    viewerCount: 2107,
    duration: "00:28:44",
  },
  {
    id: "mock-5",
    creatorName: "Ember_K",
    platform: "STRIPCHAT",
    status: "offline",
    quality: "offline",
    bitrate: "—",
    viewerCount: 0,
    duration: "—",
  },
  {
    id: "mock-6",
    creatorName: "Crystal_V",
    platform: "MYFREECAMS",
    status: "live",
    quality: "good",
    bitrate: "4100 kbps",
    viewerCount: 678,
    duration: "01:05:33",
  },
];

export const MOCK_CONNECTED_ACCOUNTS: ConnectedAccount[] = [
  {
    id: "acct-1",
    platform: "CHATURBATE",
    platformUsername: "luna_star_cb",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "acct-2",
    platform: "STRIPCHAT",
    platformUsername: "luna_star_sc",
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "acct-3",
    platform: "MYFREECAMS",
    platformUsername: "luna_star_mfc",
    isActive: false,
    createdAt: new Date().toISOString(),
  },
];
