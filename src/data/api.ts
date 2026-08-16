// Typed client for the OpenFrame backend Worker (/api/*). Same-origin: in prod the
// Worker serves both the SPA and the API; in dev Vite proxies /api to :8787.
import type { QItem, QSegment } from "./configurator";

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
  id: string;      // stable server line id (client stores it as QItem.serverId)
  code: string;
  productSlug: string;
  location: string;
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  status: QItem["status"];
  lineTotal: number | null;
  origin?: "manual" | "schedule" | "ai";
  aiPriced?: boolean;
  review?: Record<string, string> | null;
  segments?: QSegment[];
  compositeAxis?: "vertical" | "horizontal" | null;
  coverageDeltaMm?: number | null;
  coverageOutOfTolerance?: boolean;
}

// A source file attached to a project/order (e.g. the uploaded schedule).
export interface ApiScheduleFile {
  id: string;
  filename: string;
  kind: string;
  size: number | null;
  doc_type?: string | null;
  doc_type_source?: string | null;
}

/** E13 (design doc §8.4) — the stored-or-live-estimated delivery figure for
 *  the account area's "pending" quote-stage view. `indicative` selects the
 *  pending vs. issued copy; `conservative` selects the mapped vs. fallback-
 *  zone copy within the pending state. `amount` is null only when the
 *  resolved zone (including the fallback) has no rates yet — a data gap,
 *  not a code path the UI should treat as an error. */
export interface ApiProjectDelivery {
  postcode: string | null;
  amount: number | null;
  indicative: boolean;
  conservative: boolean;
}

export interface CurrentProject {
  project: ApiProject | null;
  items: ApiItem[];
  files?: ApiScheduleFile[];
  delivery?: ApiProjectDelivery;
}

/** Translate durable API lines into the editable client model in one place.
 * Keeping this boundary explicit prevents nested server-owned fields (notably
 * composite segments) being lost in one of several hand-written mappers. */
export function hydrateQuoteItems(items: ApiItem[], localIdSeed = Date.now(), previous: QItem[] = []): QItem[] {
  const localIdsByServerId = new Map(previous
    .filter((item): item is QItem & { serverId: string } => !!item.serverId)
    .map((item) => [item.serverId, item.id]));
  return items.map((item, index) => ({
    id: localIdsByServerId.get(item.id) ?? localIdSeed + index,
    serverId: item.id,
    code: item.code,
    productSlug: item.productSlug,
    location: item.location,
    width: item.width,
    height: item.height,
    options: item.options,
    qty: item.qty,
    status: item.status,
    origin: item.origin,
    aiPriced: item.aiPriced,
    review: item.review ?? null,
    lineTotal: item.lineTotal,
    segments: item.segments?.map((segment) => ({ ...segment, options: { ...segment.options } })),
    compositeAxis: item.compositeAxis ?? null,
    coverageDeltaMm: item.coverageDeltaMm ?? null,
    coverageOutOfTolerance: !!item.coverageOutOfTolerance,
  }));
}

// Failures carry the server's reason, not just a status. Before this, every
// rejection collapsed to a generic Error the callers could not distinguish —
// submitProject's catch (src/app/App.tsx) turned missing_postcode, ai_failed
// and a genuine server error into the same "rejected", which the submit form
// rendered as "check that every line is priced and your item codes are
// unique" for a customer who had typed three digits into a postcode field.
// Same shape as src/ops/api.ts's OpsApiError, ported here rather than shared —
// the ops client only ever talks to /api/ops/*.
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as any)?.error ?? `http_${res.status}`);
  }
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

/** Request a one-time email code. `devCode` is returned only in non-prod.
 *
 *  `token` is a Turnstile response, required by the Worker only when
 *  TURNSTILE_SECRET is configured — the endpoint is unauthenticated and will
 *  email any address on request, so the caller has to be vouched for. */
export const requestCode = (email: string, token?: string) =>
  req<{ ok: boolean; devCode?: string }>("/api/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ email, token }),
  });

/** Verify a code: starts a session and merges the anon project. Throws on 400. */
export const verifyCode = (email: string, code: string) =>
  req<MeResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

export const logout = () => req<{ ok: boolean }>("/api/auth/logout", { method: "POST" });

/** The current project (session- or claim-cookie scoped) + its draft lines + files. */
export const getCurrentProject = () => req<CurrentProject>("/api/projects/current");

/** Price one candidate line without saving it. The browser holds no rate data —
 *  the commercial model lives in D1 — so the composer asks the server for the
 *  figure it shows while the customer types. */
export const previewPrice = async (item: { productSlug: string; width: string; height: string; options: Record<string, string>; qty: number }): Promise<{ ok: boolean; total: number | null; needsProject?: boolean }> => {
  const res = await fetch("/api/projects/current/price-preview", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
  });
  // Before the first save there is no project to scope the preview to (the claim
  // cookie is minted on save). That is not an unpriceable line — the save itself
  // creates the project and prices it — so flag it distinctly rather than throwing.
  if (res.status === 403) return { ok: false, total: null, needsProject: true };
  if (!res.ok) throw new Error(`/api/projects/current/price-preview → ${res.status}`);
  return res.json() as Promise<{ ok: boolean; total: number | null }>;
};

/** Composite mutations use the same server domain operations as Ops, scoped to
 * the caller's current draft. Units remain nested under their opening. */
export const updateCurrentSegment = (segmentId: string, patch: {
  productSlug: string; options: Record<string, string>; alongMm: number;
  /** The dimension ACROSS the split. Sent since it became editable — the server
   *  used to default it to the opening's, which quietly healed real mismatches. */
  acrossMm?: number;
  /** Free text on the unit, stored in the same column an opening's note uses. */
  note?: string;
}) => req<{ ok: boolean }>(`/api/projects/current/segments/${segmentId}`, {
  method: "PATCH", body: JSON.stringify(patch),
});

// There is deliberately no addCurrentSegment / removeCurrentSegment (owner,
// 2026-08-04). The server routes behind them are gone: the unit COUNT is the
// split decision, and the customer does not make that decision.

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
export const saveLines = (items: QItem[], title?: string, removedIds: string[] = []) =>
  req<CurrentProject>("/api/projects/current/lines", {
    method: "PUT",
    body: JSON.stringify(title === undefined ? { items, removedIds } : { items, title, removedIds }),
  });

/** Restore the immutable, exactly-priced AI proposal for one draft line. */
export const restoreAiLine = (lineId: string) =>
  req<CurrentProject>(`/api/projects/current/lines/${lineId}/restore-ai`, {
    method: "POST",
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
  /** E14 — the delivery component of `total`, and goods (total minus it).
   *  worker/lib/orders.ts:141 used to re-derive the order total from lines
   *  alone and lose the freight; these are what confirm it survived. */
  delivery: number;
  goods: number;
  drawingsSignedOffAt: string | null;
  qaConfirmedAt: string | null;
  createdAt: string;
  payments: ApiPayment[];
  /** The referral badge, frozen at issue — the percentage this purchase carried
   *  and who to thank for it.
   *
   *  ONE percentage, never a total. The standing account discount is deliberately
   *  invisible, and a combined figure would disclose it by subtraction.
   *
   *  Read from the stamp taken when the quote was issued rather than from live
   *  eligibility: ordering is exactly what ends a tradie's eligibility, so a live
   *  lookup would erase the label at the moment it became a permanent fact about
   *  this order. `null` means render nothing — not "0%", not an empty chip. */
  referral?: { percent: number; referrerName: string } | null;
  // Project context for the account area (absent on the guest-tracking DTO).
  projectId?: string;
  projectTitle?: string | null;
  projectRef?: string | null;
  /** The destination, so the shared totals panel names it on the order exactly
   *  as the quote named it. */
  deliveryPostcode?: string | null;
  lineCount?: number;
  /** The SAME shape the quote's lines have, so one component renders both —
   *  openings at the top level, a composite's units nested inside their
   *  opening. Served by worker/lib/orders.ts's orderLines. */
  lines?: ApiItem[];
  // Source files carried onto the order (the uploaded schedule).
  files?: ApiScheduleFile[];
}
// The one quote a project has — read live off quote_line, not a frozen copy
// (docs/quote-revisions-removal-plan.md). `live: false` means it has moved
// past 'quote_issued' (accepted, or the customer asked for changes).
export type ApiQuote =
  | {
    live: true;
    status: string;
    /** goods + delivery (C8) — the customer-facing contract figure. */
    total: number;
    goods: number;
    delivery: number;
    deliveryPostcode: string | null;
    /** Server-computed (0043) — one deposit percentage, never Math.round(total/2)
     *  in the browser. */
    deposit: number;
    balance: number;
    issuedAt: string | null;
    /** The referral badge, frozen at issue. On the `live: true` arm only —
     *  there is no badge to show for a quote that is not issued, and a quote
     *  that never carried a referral has none either (`null`). */
    referral?: { percent: number; referrerName: string } | null;
    lines: ApiItem[];
  }
  | { live: false; status: string };

// postcode is REQUIRED, not optional — a caller that forgets it fails to
// compile, rather than 400ing at submit time with no indication why (D7/D8).
export interface SubmitContact { name: string; email: string; phone?: string; suburb?: string; postcode: string }
/** Outcome of a submission — callers gate their success UI on `ok`. */
export type SubmitResult = { ok: true; status: string } | { ok: false; error: string };

/** Submit the draft project for review (Draft -> Submitted). The server
 * re-validates state/lines/contact and persists the contact; throws on rejection. */
export const submitProject = (projectId: string, contact: SubmitContact) =>
  req<{ id: string; status: string }>(`/api/projects/${projectId}/submit`, {
    method: "POST",
    body: JSON.stringify({ contact }),
  });

/** E9 — a delivery PREVIEW for the submit screen. Never called from the
 *  builder (D8); writes nothing. `ok: false` means the table isn't priced
 *  yet (a deployment fault, not something to show the customer as an error). */
export interface DeliveryEstimatePreview {
  ok: boolean;
  amount?: number;
  zoneLabel?: string;
  /** True when the postcode fell to the fallback zone rather than matching
   *  its own priced zone — the caller shows "around" / "we'll confirm" copy. */
  conservative?: boolean;
}
export const getDeliveryEstimate = (projectId: string, postcode: string) =>
  req<DeliveryEstimatePreview>(`/api/projects/${projectId}/delivery-estimate`, {
    method: "POST",
    body: JSON.stringify({ postcode }),
  });

/** Update the signed-in customer's profile / business details / price preference. */
export const updateProfile = (patch: { name?: string; phone?: string; company?: string; abn?: string; priceGstMode?: "inc" | "ex" }) =>
  req<{ user: AuthUserDto }>("/api/auth/profile", { method: "POST", body: JSON.stringify(patch) });

export const getQuote = (projectId: string) =>
  req<ApiQuote>(`/api/projects/${projectId}/quote`);

/** Accept the issued quote -> creates the order + deposit invoice. */
export const acceptQuote = (projectId: string) =>
  req<{ order: ApiOrder }>(`/api/projects/${projectId}/accept`, { method: "POST" });

/** Decline the issued quote and ask for changes — project returns to Under review. */
export const requestChanges = (projectId: string, message: string) =>
  req<{ ok: boolean; status: string }>(`/api/projects/${projectId}/request-changes`, {
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
  issued_at: string | null;
  issued_total: number | null;
  /** Server-computed (0043) — accountModel.tsx no longer derives this itself. */
  issued_deposit: number | null;
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
/** Which record this guest session covers. The record itself is then read
 *  through the ordinary customer endpoints, which accept the same session — one
 *  payload and one view for guests and signed-in customers alike. */
export const guestRecord = () =>
  req<{ kind: "project" | "order"; id: string; status?: string }>("/api/guest/record");
export const guestSignOut = () => req<{ ok: boolean }>("/api/guest/signout", { method: "POST" });

// ── Files (R2) ───────────────────────────────────────────────────────────────
export interface ApiFile {
  id: string;
  filename: string;
  kind: string;
  size: number;
  virus_status?: string;
  doc_type?: string | null;
  doc_type_source?: string;
}
/** Thrown when the server refuses an upload for a reason worth showing the user
 *  (rejected by the scanner, scanner unavailable, too large, over quota). */
export class UploadError extends Error {
  constructor(readonly reason: string, readonly status: number) {
    super(reason);
    this.name = "UploadError";
  }
}

/** Upload a file (multipart) — attaches to the current project. Bytes are scanned
 *  server-side before they are stored, so this can reject. */
export async function uploadFile(file: File, kind = "upload"): Promise<{ file: ApiFile; duplicate?: boolean }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/files/upload", { method: "POST", credentials: "same-origin", body: fd });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new UploadError(String(body?.error ?? `http_${res.status}`), res.status);
  }
  return res.json();
}
export const getProjectFiles = (projectId: string) =>
  req<{ files: ApiFile[] }>(`/api/projects/${projectId}/files`);

// ── Schedule parsing ─────────────────────────────────────────────────────────
export interface ParseQuota { used: number; limit: number; remaining: number; resetsOn: string }
export interface ParseJob {
  jobId: string;
  status: "completed" | "needs_review" | "failed";
  engine: string;
  itemCount: number;
  needsReviewCount: number;
  /** Upsert digest (multi-file UX spec §3): what this parse did to the draft. */
  added?: number;
  updated?: number;
  removed?: number;
  keptForReview?: number;
  /** Manual-vs-schedule tag collisions awaiting a Link/Keep-separate decision. */
  collisions?: string[];
  /** Per-line field changes (Updated pills + old→new rows). Session-scoped. */
  changes?: { tag: string; field: "size" | "qty" | "product"; from: string; to: string }[];
  error?: string;
}

// ── AI extraction status (multi-file UX spec §2) ─────────────────────────────
export interface ExtractionRun {
  id: string;
  status: "queued" | "running" | "partial" | "completed" | "failed" | "cancelled";
  startedAt: string;
  updatedAt?: string;
  completedAt: string | null;
  summary: {
    extractedLines: number;
    conflicts: number;
    energyApplied: number;
    cartApplied?: number;
    documents: number;
    discrepancyWarnings?: string[];
  } | null;
  progressStage?:
    | "queued"
    | "reading_documents"
    | "extracting_schedule"
    | "building_envelope"
    | "matching_and_pricing"
    | "preparing_quote"
    | "waiting_capacity"
    | "complete";
  /** Stable, customer-safe category only. Provider responses are never exposed. */
  diagnostic?: {
    code:
      | "RATE_LIMITED"
      | "CATALOGUE_UNAVAILABLE"
      | "DOCUMENTS_NOT_UNDERSTOOD"
      | "SERVICE_CONFIGURATION_ERROR"
      | "TEMPORARY_FAILURE"
      | "RETRY_REQUIRED";
    retryable: boolean;
    retryAt: string | null;
  } | null;
}
export const extractionStatus = () =>
  req<{ run: ExtractionRun | null; basis?: Record<string, string> }>("/api/projects/current/extraction-status");
export const retryExtraction = () =>
  req<{ ok: true; alreadyQueued: boolean }>("/api/projects/current/extraction-retry", {
    method: "POST",
    body: JSON.stringify({}),
  });

/** Remove one document from a draft project (per-file Remove — spec §1c). */
export async function deleteFile(fileId: string): Promise<{ ok: boolean; removedLines: number; keptForReview: number }> {
  const res = await fetch(`/api/files/${fileId}`, { method: "DELETE", credentials: "same-origin" });
  if (!res.ok) throw new UploadError(String((await res.json().catch(() => ({})) as any)?.error ?? `http_${res.status}`), res.status);
  return res.json();
}

/** Resolve a manual-vs-schedule tag collision once (spec §1b). */
export const resolveCollision = (lineId: string, choice: "linked" | "separate") =>
  req<{ ok: boolean; choice: string }>(`/api/projects/current/lines/${lineId}/collision`, {
    method: "POST", body: JSON.stringify({ choice }),
  });
/** Outcome of a parse request. `needs_choice` ⇒ prompt Replace/Add; `quota` ⇒ over limit. */
export type ParseFailReason =
  | "rate_limited" | "busy" | "quota" | "too_large"
  | "no_schedule_found" | "no_text_layer" | "not_a_pdf" | "encrypted_pdf" | "too_many_pages" | "too_many_items"
  | "file_missing" | "scan_pending" | "file_not_scanned" | "parse_failed" | "network";
export type ParseResult =
  | { ok: true; job: ParseJob; quota: ParseQuota }
  | { ok: false; reason: "needs_choice"; existingItems: number; existingFile: string | null }
  | { ok: false; reason: "quota"; quota: ParseQuota }
  | { ok: false; reason: Exclude<ParseFailReason, "quota"> };

/** Parse an uploaded schedule file into estimator draft lines. mode is required
 *  only when the project already has lines (server returns needs_choice otherwise). */
export async function startParse(fileId: string, mode?: "replace" | "append"): Promise<ParseResult> {
  const res = await fetch("/api/projects/current/parse", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, ...(mode ? { mode } : {}) }),
  });
  const body = await res.json().catch(() => ({} as any));
  if (res.ok) return { ok: true, job: body.job, quota: body.quota };
  if (res.status === 409 && body?.error === "needs_choice") {
    return { ok: false, reason: "needs_choice", existingItems: body.existingItems ?? 0, existingFile: body.existingFile ?? null };
  }
  if (res.status === 409 && body?.error === "busy") return { ok: false, reason: "busy" };
  if (res.status === 409 && body?.error === "scan_pending") return { ok: false, reason: "scan_pending" };
  if (res.status === 429 && body?.error === "quota_exceeded") return { ok: false, reason: "quota", quota: body.quota };
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 413) return { ok: false, reason: "too_large" };
  const known = ["no_schedule_found", "no_text_layer", "not_a_pdf", "encrypted_pdf", "too_many_pages", "too_many_items", "file_missing", "file_not_scanned", "parse_failed"] as const;
  const reason = known.find((k) => k === body?.error) ?? "parse_failed";
  return { ok: false, reason };
}

export const getParseQuota = () => req<{ quota: ParseQuota }>("/api/projects/current/parse-quota");
export const getParseJob = (jobId: string) => req<{ job: { id: string; status: string; itemCount: number | null; error: string | null } }>(`/api/projects/current/parse-jobs/${jobId}`);

/** Clear the whole current draft — all lines AND every attached document. */
export const clearDraft = () => req<{ ok: boolean }>("/api/projects/current/clear", { method: "POST" });
