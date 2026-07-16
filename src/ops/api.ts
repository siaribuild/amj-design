// Ops console API client (/api/ops/*). Same-origin — served on ops.* by the Worker.
export interface OpsUser {
  id: string;
  email: string;
  name: string | null;
  type: string;
}

export interface OpsSummary {
  submissions: number;
  inReview: number;
  activeOrders: number;
  awaitingPayment: number;
  organisations: number;
  customers: number;
  approvalsPending: number;
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

/** Resolve the acting staff member, or null (not signed in / not staff). */
export async function opsMe(): Promise<OpsUser | null> {
  const res = await fetch("/api/ops/me", { credentials: "same-origin" });
  if (!res.ok) return null;
  const d = await res.json();
  return d.user ?? null;
}

export const opsChallenge = (email: string) =>
  req<{ ok: boolean; devCode?: string }>("/api/ops/auth/challenge", { method: "POST", body: JSON.stringify({ email }) });

export const opsVerify = (email: string, code: string) =>
  req<{ authenticated: boolean; user: OpsUser }>("/api/ops/auth/verify", { method: "POST", body: JSON.stringify({ email, code }) });

export const opsLogout = () => req<{ ok: boolean }>("/api/ops/auth/logout", { method: "POST" });

export const opsSummary = () => req<OpsSummary>("/api/ops/summary");
