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

// ── Quote lifecycle & orders ─────────────────────────────────────────────────
export interface ApiPayment {
  kind: "deposit" | "balance";
  amount: number;
  percent: number;
  status: "due" | "paid" | "waived";
  reference: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
}
export interface ApiOrder {
  id: string;
  orderNo: string;
  stage: string;
  stageLabel: string;
  stageIndex: number;
  total: number | null;
  drawingsSignedOffAt: string | null;
  qaConfirmedAt: string | null;
  createdAt: string;
  payments: ApiPayment[];
  lines?: { external_ref: string | null; product_snapshot_json: string; qty: number; line_total: number }[];
}
export interface ApiRevision {
  id: string;
  revisionNo: number;
  status: string;
  total: number;
  issuedAt: string;
  acceptedAt: string | null;
  lines: { external_ref: string | null; product_snapshot_json: string; qty: number; line_total: number }[];
}

/** Submit the draft project for review (Draft -> Submitted). */
export const submitProject = (projectId: string) =>
  req<{ id: string; status: string }>(`/api/projects/${projectId}/submit`, { method: "POST" });

export const getRevisions = (projectId: string) =>
  req<{ revisions: ApiRevision[] }>(`/api/projects/${projectId}/revisions`);

/** Accept an issued revision -> creates the order + deposit invoice. */
export const acceptRevision = (revisionId: string) =>
  req<{ order: ApiOrder }>(`/api/revisions/${revisionId}/accept`, { method: "POST" });

export const getOrders = () => req<{ orders: ApiOrder[] }>("/api/orders");
export const getOrder = (orderId: string) => req<{ order: ApiOrder }>(`/api/orders/${orderId}`);

/** Customer sign-off gates. */
export const confirmDrawings = (orderId: string) =>
  req<{ order: ApiOrder }>(`/api/orders/${orderId}/confirm-drawings`, { method: "POST" });
export const confirmQa = (orderId: string) =>
  req<{ order: ApiOrder }>(`/api/orders/${orderId}/confirm-qa`, { method: "POST" });

// ── Guest tracking (anonymous, read-only) ────────────────────────────────────
/** Request a tracking code. Always neutral; `devCode` only in non-prod on a match. */
export const guestTrackRequest = (email: string, ref: string) =>
  req<{ ok: boolean; devCode?: string }>("/api/guest/track/request", {
    method: "POST",
    body: JSON.stringify({ email, ref }),
  });
export const guestTrackVerify = (email: string, ref: string, code: string) =>
  req<{ token: string }>("/api/guest/track/verify", {
    method: "POST",
    body: JSON.stringify({ email, ref, code }),
  });
export const guestRecord = (token: string) =>
  req<{ order: ApiOrder }>(`/api/guest/records/${token}`);

// ── Files (R2) ───────────────────────────────────────────────────────────────
export interface ApiFile {
  id: string;
  filename: string;
  kind: string;
  size: number;
  virus_status?: string;
}
/** Upload a file (multipart) — attaches to the current project. */
export async function uploadFile(file: File, kind = "upload"): Promise<{ file: ApiFile }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/files/upload", { method: "POST", credentials: "same-origin", body: fd });
  if (!res.ok) throw new Error(`upload → ${res.status}`);
  return res.json();
}
export const getProjectFiles = (projectId: string) =>
  req<{ files: ApiFile[] }>(`/api/projects/${projectId}/files`);
