// Typed client for the AMJ backend Worker (/api/*). Same-origin: in prod the
// Worker serves both the SPA and the API; in dev Vite proxies /api to :8787.
import type { QItem } from "./configurator";

export interface ApiProject {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

// One saved quote line as the server returns it (QItem minus its local id,
// plus the server-computed line total).
export interface ApiItem {
  code: string;
  productSlug: string;
  location: string;
  measuredBy: QItem["measuredBy"];
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  status: QItem["status"];
  lineTotal: number | null;
}

export interface CurrentProject {
  project: ApiProject | null;
  items: ApiItem[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Auth (passwordless email OTP) ────────────────────────────────────────────
export interface AuthUserDto {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  type: string;
}
export interface MeResponse {
  authenticated: boolean;
  anonymous: boolean;
  user: AuthUserDto | null;
}

/** Current session -> user, or anonymous. */
export const me = () => req<MeResponse>("/api/auth/me");

/** Request a one-time email code. `devCode` is returned only in non-prod. */
export const requestCode = (email: string) =>
  req<{ ok: boolean; devCode?: string }>("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

/** Verify a code: starts a session and merges the anon project. Throws on 400. */
export const verifyCode = (email: string, code: string) =>
  req<MeResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

export const logout = () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" });

/** The current project (session- or claim-cookie scoped) + its draft lines. */
export const getCurrentProject = () => req<CurrentProject>("/api/projects/current");

/** Snapshot-save the whole draft line set. Creates the project on first call. */
export const saveLines = (items: QItem[]) =>
  req<CurrentProject>("/api/projects/current/lines", {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
