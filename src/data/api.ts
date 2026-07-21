// Typed client for the OpenFrame backend Worker (/api/*). Same-origin: in prod the
// Worker serves both the SPA and the API; in dev Vite proxies /api to :8787.
import type { QItem } from "./configurator";

export interface ApiProject {
  id: string;
  ref: string | null;
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
  company: string | null;
  abn: string | null;
  priceGstMode: "inc" | "ex";
  type: string;
  createdAt: string | null;
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

/** A specific owned project + its lines (read-only) — e.g. to review a submission. */
export const getProject = (projectId: string) =>
  req<CurrentProject>(`/api/projects/${projectId}`);

// ── Showroom locations (public registry) ─────────────────────────────────────
export interface ApiLocation {
  id: string;
  stateCode: string;
  suburb: string;
  displayName: string;
  lat: number;
  lng: number;
  appointmentAvailable: boolean;
}
/** Active showroom locations for the Contact page (list + map + appointment). */
export const getLocations = () => req<{ locations: ApiLocation[] }>("/api/locations");

// ── Contact enquiries (question / showroom appointment) ──────────────────────
export interface EnquiryPayload {
  intent: "question" | "appointment_request";
  name: string;
  email: string;
  phone?: string;
  company?: string;
  privacyConsent: boolean;
  // question branch
  message?: string;
  // appointment branch
  locationId?: string;
  bestTimeToCall?: string;
  preferredDays?: string[];
  productsInterest?: string;
  notes?: string;
  // spam controls + attribution context (server owns the authoritative source)
  token?: string;
  website?: string; // honeypot
  client_context?: {
    landing_path?: string; referrer?: string;
    utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_term?: string; utm_content?: string;
  };
}
/** Submit a Contact-page enquiry. Returns the OpenFrame reference. Throws on 4xx. */
export const submitEnquiry = (payload: EnquiryPayload) =>
  req<{ ok: boolean; reference: string | null }>("/api/enquiries", { method: "POST", body: JSON.stringify(payload) });

/** Snapshot-save the whole draft line set (+ the project name). Creates the
 *  project on first call. */
export const saveLines = (items: QItem[], title?: string) =>
  req<CurrentProject>("/api/projects/current/lines", {
    method: "PUT",
    body: JSON.stringify(title === undefined ? { items } : { items, title }),
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
export interface ApiOrderLine {
  external_ref: string | null;
  room_label?: string | null;
  product_snapshot_json: string;
  dims_json?: string;
  qty: number;
  line_total: number;
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
  // Project context for the account area (absent on the guest-tracking DTO).
  projectId?: string;
  projectTitle?: string | null;
  projectRef?: string | null;
  lineCount?: number;
  revisionNo?: number | null;
  lines?: ApiOrderLine[];
}
export interface ApiRevision {
  id: string;
  revisionNo: number;
  status: string;
  total: number;
  issuedAt: string;
  acceptedAt: string | null;
  lines: ApiOrderLine[];
}

export interface SubmitContact { name: string; email: string; phone?: string; suburb?: string }
/** Outcome of a submission — callers gate their success UI on `ok`. */
export type SubmitResult = { ok: true; status: string } | { ok: false; error: string };

/** Submit the draft project for review (Draft -> Submitted). The server
 * re-validates state/lines/contact and persists the contact; throws on rejection. */
export const submitProject = (projectId: string, contact: SubmitContact) =>
  req<{ id: string; status: string }>(`/api/projects/${projectId}/submit`, {
    method: "POST",
    body: JSON.stringify({ contact }),
  });

/** Update the signed-in customer's profile / business details / price preference. */
export const updateProfile = (patch: { name?: string; phone?: string; company?: string; abn?: string; priceGstMode?: "inc" | "ex" }) =>
  req<{ user: AuthUserDto }>("/api/auth/profile", { method: "POST", body: JSON.stringify(patch) });

export const getRevisions = (projectId: string) =>
  req<{ revisions: ApiRevision[] }>(`/api/projects/${projectId}/revisions`);

/** Accept an issued revision -> creates the order + deposit invoice. */
export const acceptRevision = (revisionId: string) =>
  req<{ order: ApiOrder }>(`/api/revisions/${revisionId}/accept`, { method: "POST" });

/** Decline an issued revision and ask for changes — project returns to Under review. */
export const requestChanges = (revisionId: string, message: string) =>
  req<{ ok: boolean; status: string }>(`/api/revisions/${revisionId}/request-changes`, {
    method: "POST", body: JSON.stringify({ message }),
  });

export const getOrders = () => req<{ orders: ApiOrder[] }>("/api/orders");
export const getOrder = (orderId: string) => req<{ order: ApiOrder }>(`/api/orders/${orderId}`);

// The signed-in customer's projects (dashboard list).
export interface ApiProjectSummary {
  id: string;
  public_ref: string | null;
  title: string | null;
  status_customer: string;
  updated_at: string;
  created_at: string;
  item_count: number;
  draft_total: number;
  issued_revision_id: string | null;
  issued_revision_no: number | null;
  issued_total: number | null;
}
export const getProjects = () => req<{ projects: ApiProjectSummary[] }>("/api/projects");

// Clarification thread (when a project is "Needs information").
export interface ApiClarification { body: string; created_at: string; author: string | null; author_type: string | null }
export const getClarifications = (projectId: string) =>
  req<{ status: string; clarifications: ApiClarification[] }>(`/api/projects/${projectId}/clarifications`);
export const replyClarification = (projectId: string, message: string) =>
  req<{ ok: boolean; status: string }>(`/api/projects/${projectId}/clarification-reply`, { method: "POST", body: JSON.stringify({ message }) });

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
