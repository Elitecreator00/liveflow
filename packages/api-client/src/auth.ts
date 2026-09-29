/**
 * Client-side auth helpers.
 * Stores the JWT in localStorage (access token only — no sensitive data).
 */

const TOKEN_KEY = "lf_access_token";
const AGENCY_KEY = "lf_agency_id";
const USER_KEY = "lf_user";

export interface StoredUser {
  id: string;
  email: string;
  agencyId: string;
  role: string;
}

export function saveAuth(token: string, user?: Partial<StoredUser>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  if (user?.agencyId) localStorage.setItem(AGENCY_KEY, user.agencyId);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  // Invalida i token scaduti: senza questo controllo un token vecchio
  // supererebbe il guard ma l'API risponderebbe 401.
  const payload = decodeJwtPayload(token);
  const exp = payload?.["exp"];
  if (typeof exp === "number" && exp * 1000 <= Date.now()) {
    clearAuth();
    return null;
  }
  return token;
}

export function getAgencyId(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(AGENCY_KEY);
  if (stored) return stored;
  // Fallback robusto: ricava l'agencyId dal token se non fosse stato persistito.
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  const aid = payload?.["agencyId"];
  return typeof aid === "string" && aid ? aid : null;
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(AGENCY_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/** Decode JWT payload (no verification — trust the server). */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}
