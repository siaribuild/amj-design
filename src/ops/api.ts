// Ops console API client (/api/ops/*). Same-origin — served on ops.* by the Worker.
export interface OpsUser {
  id: string;
  email: string;
  name: string | null;
  type: string;
  role: string | null;
}

export interface OpsSummary {
  submissions: number;
  inReview: number;
  activeOrders: number;
  awaitingPayment: number;
  customers: number;
  readyToIssue: number;
  newEnquiries: number;
  degraded?: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  // Failures carry the server's reason, not just a status. An unpriceable line
  // knows WHICH option has no price; throwing that away is what left the ops copy
  // saying "confirm its private rate rows" to someone who cannot open one.
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new OpsApiError(res.status, (body as any)?.error ?? `http_${res.status}`, (body as any)?.missingOptions);
  }
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

/** Logo + business name from Sanity Site Settings. Either may be null — the
 *  console shows its wordmark rather than a stand-in when they are. */
export interface OpsBrand { logo: string | null; businessName: string | null }
export const opsBrand = () => req<OpsBrand>("/api/ops/brand");

/** `accessLogout` is set whenever Cloudflare Access is the identity provider —
 *  in that mode clearing the local session achieves nothing and the browser has
 *  to be sent to Access's own logout endpoint. Null in dev, where the session
 *  cookie really is the identity. */
export const opsLogout = () =>
  req<{ ok: boolean; accessLogout: string | null }>("/api/ops/auth/logout", { method: "POST" });

export const opsSummary = () => req<OpsSummary>("/api/ops/summary");

// ── Quotes queue + workspace (O2) ────────────────────────────────────────────
export interface OpsSubmission {
  id: string;
  title: string;
  status_customer: string;
  status_internal: string;
  org_name: string | null;
  customer_name: string | null;
  customer_email: string | null;
  assignee_name: string | null;
  item_count: number;
  total: number;
  updated_at: string;
}
export interface OpsLine {
  id: string;
  code: string;
  room: string;
  productSlug: string;
  productName: string;
  width: string;
  height: string;
  options: Record<string, string>;
  qty: number;
  lineTotal: number | null;
  status: string;
  origin: string;
  selectedVariantId: string | null;
  /** Unresolved technical-review reasons (field → reason) from an auto-parse. */
  review: Record<string, string> | null;
  /** 'simple' | 'composite_parent' — one opening, or one built from joined frames. */
  lineKind?: string;
  compositeAxis?: string | null;
  /** The joined frames this opening is built from, when it is a composite. */
  segments?: OpsSegment[];
}
export interface OpsComment { id: string; line_id: string | null; kind: string; body: string; author: string | null; created_at: string }
export interface OpsRevision { id: string; revisionNo: number; status: string; total: number; issuedAt: string; acceptedAt: string | null }
export interface OpsActivity { actor: string | null; action: string; occurred_at: string }
export interface OpsWorkspace {
  project: {
    id: string; title: string; publicRef: string | null; statusCustomer: string; statusInternal: string;
    statusInternalLabel: string; nextStates: string[];
    unresolvedLineCount: number;
    org: string | null; customerName: string | null; customerEmail: string | null;
    // Submission contact, captured at submit time — the only identity an
    // anonymous submitter has, so the record must fall back to it.
    contactName: string | null; contactEmail: string | null;
    contactPhone: string | null; deliverySuburb: string | null;
    updatedAt: string;
  };
  lines: OpsLine[];
  files: { id: string; kind: string; filename: string; size: number; virus_status: string }[];
  compositePolicy: OpsCompositePolicy;
  revisions: OpsRevision[];
  comments: OpsComment[];
  activity: OpsActivity[];
  // Slice 1 additions — the merged record. Optional so the existing Quotes
  // workspace, which ignores them, keeps reading the same endpoint while the
  // merged plane is built beside it.
  lifecycle?: OpsLifecycle;
  daysInStage?: number | null;
  order?: {
    id: string; orderNo: string; stage: string; stageLabel: string;
    paymentStatus: string; acceptedRevisionId: string | null; createdAt: string;
    /** The contract total (goods + delivery) and the delivery component of it —
     *  worker/lib/orders.ts:141 re-derives from revision_line and used to lose
     *  the freight; these are what the header reads instead of re-summing
     *  order_line client-side. */
    total: number; deliveryTotal: number;
  } | null;
  payments?: OpsPayment[];
  /** Contract lines — what is actually being built, once a revision is accepted.
   *  The draft lines are no longer the truth at that point, and on an accepted
   *  project there are usually none left at all. */
  orderLines?: { id: string; code: string; room: string; qty: number; lineTotal: number; productName: string; width: string; height: string }[];
  /** What can be done to this job right now, derived server-side. */
  actions?: OpsRecordAction[];
  /** The Australian domestic delivery leg (0044) — computed live on every read.
   *  `amount` is null until a human settles it; never test it for truthiness,
   *  0 is a settled trade waiver. */
  delivery: OpsDelivery;
}

export interface OpsDelivery {
  postcode: string | null;
  suburb: string | null;
  zoneId: string | null;
  zoneLabel: string | null;
  basis: "postcode_zone" | "fallback_zone" | "unpriced_table";
  caveats: string[];
  areaM2: number;
  ratePerSqm: number | null;
  minCharge: number | null;
  maxCharge: number | null;
  /** LIVE, from the current zone table — moves when the owner edits a rate. */
  estimate: number | null;
  bound: "min" | "max" | "rate" | null;
  /** null => NOT SETTLED. 0 is a settled trade waiver (D14) — never `!amount`. */
  amount: number | null;
  settled: boolean;
  settledEstimate: number | null;
  settledAreaM2: number | null;
  settledZoneVersion: string | null;
  note: string | null;
  settledAt: string | null;
  settledBy: string | null;
  editable: boolean;
}
export const opsSetDelivery = (projectId: string, body: { amount: number | null; postcode?: string; note?: string }) =>
  write<{ ok: boolean; delivery: OpsDelivery }>(`/api/ops/projects/${projectId}/delivery`, "PUT", body);

export const opsSubmissions = () => req<{ submissions: OpsSubmission[] }>("/api/ops/queues/submissions");
export const opsProject = (id: string) => req<OpsWorkspace>(`/api/ops/projects/${id}`);
export interface OpsExactConfiguration {
  productSlug: string; productName: string; variantId: string;
  frameTechnology: string; glassBuildUp: string | null; coating: string | null;
  uValue: number | null; shgc: number | null;
}
export const opsPatchLine = (lineId: string, patch: Partial<{
  width: string; height: string; qty: number; code: string; room: string;
  productSlug: string; selectedVariantId: string; options: Record<string, string>;
  resolveReview: boolean | string[];
}>) =>
  req<{ line: OpsLine }>(`/api/ops/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(patch) });
export const opsLineConfigurations = (lineId: string) =>
  req<{ configurations: OpsExactConfiguration[] }>(`/api/ops/lines/${lineId}/configurations`);

export interface OpsRecommendationOutcome {
  id: string;
  external_ref: string | null;
  proposed_product_slug: string | null;
  proposed_variant_id: string | null;
  proposed_line_total: number | null;
  final_product_slug: string;
  final_variant_id: string | null;
  final_line_total: number;
  price_delta: number | null;
  decision: "accepted" | "adjusted" | "no_ai_proposal";
  reason_code: string;
  quality_state: "pending" | "approved" | "rejected";
  created_at: string;
}
export interface OpsRecommendationReason {
  code: string;
  layer: string;
  learnsProductPreference: boolean;
  learnsThermalTarget: boolean;
}
export const opsRecommendationOutcomes = (projectId: string) =>
  req<{ outcomes: OpsRecommendationOutcome[]; reasonOptions: OpsRecommendationReason[] }>(
    `/api/ops/projects/${projectId}/recommendation-outcomes`);
export const opsAdjudicateRecommendationOutcome = (
  outcomeId: string,
  body: {
    action: "approve" | "reject";
    reasonCode?: string;
    thermalTarget?: { maxUValue: number; minShgc: number | null; maxShgc: number | null };
  },
) => req<{ ok: boolean }>(`/api/ops/recommendation-outcomes/${outcomeId}`, {
  method: "PATCH",
  body: JSON.stringify(body),
});

// The Estimator review workspace lived here and is gone (2026-07-27). It reviewed
// the machine's product selection BEFORE submission — a stage at which staff have
// no part: the AI proposal is built into the customer's own draft, and the moment
// staff get involved is submission, which lands in Quotes. Quotes already offers
// the substantive act (opsLineConfigurations → swap in a different eligible
// configuration), and the candidate set persists in `candidate_result` for audit
// whether or not a screen renders it.

// ── LLM building-modelling pipeline (strategy §19) ───────────────────────────
// The pipeline runs automatically on upload; ops is a review-only surface, so
// there is no client-side run trigger. (POST /ai-runs remains server-side as the
// support lever for AI_EXTRACTION_MODE='manual'.)
// ── Thermal audit ────────────────────────────────────────────────────────────
// A snapshot of the PARSE: per line, the thermal target parsed from the source
// documents beside the product and glass the machine proposed for it. Every value
// comes from an INSERT-only record, so nothing here moves when a person edits the
// order, a product is withdrawn, or WERS data is re-imported.
export interface OpsThermalTarget {
  maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
  basis: string | null;
}
export interface OpsThermalProposed {
  productSlug: string | null; variantId: string | null;
  uw: number | null; shgc: number | null;
  source: string | null;                     // certified | estimated
}
export interface OpsThermalRow {
  lineId: string;
  ref: string | null;
  kind: 'line' | 'composite' | 'segment';
  /** Units inside a composite parent; 0 for anything that is not one. */
  unitCount: number;
  operation: string | null;
  widthMm: number | null;
  heightMm: number | null;
  target: OpsThermalTarget | null;
  /** The unit took the opening's target — the report did not name it. */
  targetInherited: boolean;
  proposed: OpsThermalProposed | null;
  /** header = a composite parent, groups units. no_record = a unit with no frozen proposal. */
  verdict: 'met' | 'missed' | 'no_target' | 'unknown' | 'header' | 'no_record';
  /** Signed distance outside the band per axis; null where that axis is fine or unconstrained. */
  miss: { uw: number | null; shgc: number | null } | null;
}
export const opsThermal = (projectId: string) =>
  req<{ rows: OpsThermalRow[] }>(`/api/ops/projects/${projectId}/thermal`);

export const opsBuildingModel = (projectId: string) =>
  req<{ id: string; status: string; run: { status: string; pipelineVersion: string; primaryModel: string }; model: any; evidence: any[] }>(
    `/api/ops/projects/${projectId}/building-model`);
export const opsAddNote = (id: string, body: string, lineId?: string) =>
  req<{ comment: OpsComment }>(`/api/ops/projects/${id}/note`, { method: "POST", body: JSON.stringify({ body, lineId }) });
export const opsIssueRevision = (id: string) =>
  req<{ id: string; revisionNo: number; total: number }>(`/api/ops/projects/${id}/issue-revision`, { method: "POST" });
export const opsSetStatus = (id: string, statusInternal: string) =>
  req<{ statusInternal: string; statusInternalLabel: string; nextStates: string[] }>(`/api/ops/projects/${id}/status`, { method: "POST", body: JSON.stringify({ statusInternal }) });
export const opsRequestClarification = (id: string, message: string) =>
  req<{ ok: boolean; statusInternalLabel: string }>(`/api/ops/projects/${id}/request-clarification`, { method: "POST", body: JSON.stringify({ message }) });

// submit-for-approval / approve / reject / delegate lived here and are gone
// (2026-07-28) with the approval engine. A priced quote is issued directly.

// ── Orders ops (O5) ──────────────────────────────────────────────────────────
export interface OpsPayment { kind: string; amount: number; percent: number; status: string; reference: string | null; invoicedAt: string | null; paidAt: string | null }
export interface OpsOrder {
  id: string; orderNo: string; stage: string; stageLabel: string; stageIndex: number;
  total: number | null; payments: OpsPayment[];
  title?: string; customerName?: string | null; customerEmail?: string | null; orgName?: string | null;
  lines?: { external_ref: string | null; product_snapshot_json: string; qty: number; line_total: number }[];
}
export interface OpsAction { action: string; label: string }

export const opsOrders = () => req<{ orders: OpsOrder[] }>("/api/ops/orders");
export const opsOrder = (id: string) => req<{ order: OpsOrder; actions: OpsAction[] }>(`/api/ops/orders/${id}`);
export const opsAdvanceOrder = (id: string, action: string) =>
  req<{ order: OpsOrder; actions: OpsAction[] }>(`/api/ops/orders/${id}/advance`, { method: "POST", body: JSON.stringify({ action }) });
export const opsPayOrder = (id: string, kind: string, reference?: string) =>
  req<{ order: OpsOrder; actions: OpsAction[] }>(`/api/ops/orders/${id}/pay`, { method: "POST", body: JSON.stringify({ kind, reference }) });

// ── Customers 360 (O5) — user-centric (real accounts are users, not orgs) ──────
export interface OpsCustomer {
  id: string; name: string | null; email: string; phone: string | null;
  company: string | null; abn: string | null; created_at: string | null;
  projects: number; orders: number;
}
export interface OpsCustomerDetail {
  customer: { id: string; name: string | null; email: string; phone: string | null; company: string | null; abn: string | null; createdAt: string | null };
  projects: { id: string; title: string | null; status_customer: string; status_internal: string; updated_at: string }[];
  orders: { id: string; order_no: string; stage: string; total: number | null }[];
}
export const opsCustomers = () => req<{ customers: OpsCustomer[] }>("/api/ops/customers");
export const opsCustomer = (id: string) => req<OpsCustomerDetail>(`/api/ops/customers/${id}`);
/** Staff edit of a customer's profile. Email (the unique login ID) is admin-only. */
export const opsUpdateCustomer = (id: string, patch: { name?: string; phone?: string; company?: string; abn?: string; email?: string }) =>
  req<{ ok: boolean; customer: OpsCustomerDetail["customer"] }>(`/api/ops/customers/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

// ── Admin (O6) ───────────────────────────────────────────────────────────────
export interface OpsFile { id: string; kind: string; filename: string; size: number; virus_status: string; scan_engine: string | null; scanned_at: string | null; created_at: string; project_title: string | null; customer_name: string | null }
export interface OpsAudit { entity_type: string; entity_id: string; action: string; occurred_at: string; actor: string | null }
export interface OpsStaff { id: string; email: string; name: string | null; role: string | null; last_verified_at: string | null }
export interface OpsSearchResult { type: string; id: string; label: string; hint: string }

export const opsFiles = () => req<{ files: OpsFile[] }>("/api/ops/files");
/** Re-run the scanner over a stored file (clears 'skipped'/'pending' so it can be
 *  downloaded again; an infected verdict moves the bytes to quarantine/ rather
 *  than deleting them — the stored copy is the only copy). */
export const opsRescanFile = (id: string) =>
  req<{ ok: boolean; status: string; engine: string; reason: string | null; quarantined: boolean }>(`/api/ops/files/${id}/rescan`, { method: "POST" });
export const opsAudit = (entity?: string) => req<{ events: OpsAudit[] }>(`/api/ops/audit${entity ? `?entity=${entity}` : ""}`);
export const opsStaff = () => req<{ staff: OpsStaff[]; roles: string[] }>("/api/ops/staff");
export const opsSetRole = (id: string, role: string) =>
  req<{ ok: boolean; role: string }>(`/api/ops/staff/${id}`, { method: "PATCH", body: JSON.stringify({ role }) });
export const opsSearch = (q: string) => req<{ results: OpsSearchResult[] }>(`/api/ops/search?q=${encodeURIComponent(q)}`);

// ── Enquiries (Contact-page leads) ───────────────────────────────────────────
export interface OpsEnquiryRow {
  id: string; reference: string; intent: string;
  name: string; company: string | null; email: string; phone: string | null;
  locationSuburb: string | null; locationState: string | null;
  sourceOwner: string; sourceEntryPoint: string;
  workflowStatus: string; contactOutcome: string; appointmentStatus: string; commercialOutcome: string;
  assignedUser: string | null; assignedName: string | null; createdAt: string;
}
export interface OpsEnquiryDetail extends OpsEnquiryRow {
  customerType: string | null; topic: string | null; message: string | null;
  locationId: string | null; productsInterest: string | null; bestTimeToCall: string | null;
  preferredDays: string[]; appointmentNotes: string | null;
  accountId: string | null; projectId: string | null;
  landingPath: string | null; referrer: string | null; utm: Record<string, string>;
  formVersion: string | null; privacyVersion: string | null; marketingOptIn: boolean;
  manufacturerQuoteRef: string | null; manufacturerOrderRef: string | null;
  handedOffAt: string | null; manufacturerAckAt: string | null; updatedAt: string;
}
export interface OpsEnquiryActivity { action: string; occurred_at: string; actor: string | null }

export const opsEnquiries = (params?: Record<string, string>) => {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v);
  const q = entries.length ? "?" + new URLSearchParams(entries).toString() : "";
  return req<{ enquiries: OpsEnquiryRow[] }>(`/api/ops/enquiries${q}`);
};
export const opsEnquiry = (id: string) =>
  req<{ enquiry: OpsEnquiryDetail; activity: OpsEnquiryActivity[] }>(`/api/ops/enquiries/${id}`);
export const opsUpdateEnquiry = (id: string, patch: Record<string, unknown>) =>
  req<{ enquiry: OpsEnquiryDetail }>(`/api/ops/enquiries/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const opsLogContact = (id: string, outcome: string, note?: string) =>
  req<{ ok: boolean; contactOutcome: string }>(`/api/ops/enquiries/${id}/contact-log`, { method: "POST", body: JSON.stringify({ outcome, note }) });

// ── Pricing (the D1 commercial layer) ────────────────────────────────────────
export interface OpsRateCardRow {
  id: string; perimRate: number; areaRate: number; minCharge: number;
  version: string; updatedAt: string | null;
  modifierCount: number;
  productName: string | null; familySlug: string | null;
}
export interface OpsModifier {
  id: string; seq: number; label: string | null;
  whenField: "width" | "height" | "area" | "qty";
  whenOp: ">" | ">=" | "<" | "<=" | "==";
  whenValue: number; thenType: "percent" | "fixed"; thenValue: number;
}
export interface OpsSample { key: "small" | "typical" | "large"; widthMm: number; heightMm: number; qty: number }
export interface OpsPriceStep {
  key: string; label: string; detail?: string;
  amount: number | null; runningTotal: number; applied: boolean;
}
export interface OpsPricedSample {
  sample: OpsSample;
  snapshot: { ok: boolean; unit: number; total: number; depositAmount: number; steps?: OpsPriceStep[]; appliedModifiers: string[] };
}
export interface OpsReconcileRun {
  ok: boolean; checkedAt: string;
  missing: { slug: string; productSlugs: string[] }[];
  orphaned: string[];
  productsWithoutRateCard: string[];
  /** Products too incomplete to offer a customer, each with its gap codes.
   *  NULL means offerability was NOT CHECKED on that run (the catalogue could
   *  not be read) — distinct from [] meaning checked and all fine, and the
   *  banner must not render the two the same way. */
  notOfferable: { slug: string; name: string | null; gaps: string[] }[] | null;
}

// Pricing writes need the RESPONSE BODY on failure, not just a status: a 409 is
// "someone else changed this while you had it open", which is a different message
// and a different remedy from a generic failure.
export class OpsApiError extends Error {
  constructor(public status: number, public code: string, public missingOptions: string[] = []) { super(code); }
}
const write = <T>(path: string, method: string, body: unknown): Promise<T> =>
  req<T>(path, { method, body: JSON.stringify(body ?? {}) });

export const opsRateCards = () =>
  req<{ canEdit: boolean; sample: OpsSample; cards: OpsRateCardRow[] }>("/api/ops/pricing/rate-cards");

export const opsRateCard = (id: string) =>
  req<{
    canEdit: boolean;
    card: { id: string; perimRate: number; areaRate: number; minCharge: number; version: string };
    updatedAt: string | null; modifiers: OpsModifier[];
    samples: OpsSample[]; samplesFromHistory: boolean; sampleLineCount: number;
    draftExposure: { lines: number; projects: number };
  }>(`/api/ops/pricing/rate-cards/${id}`);

export const opsPricePreview = (body: {
  rateCardId: string; perimRate?: number; areaRate?: number; minCharge?: number;
  modifiers?: OpsModifier[]; samples?: OpsSample[];
}) => write<{ samples: OpsPricedSample[] }>("/api/ops/pricing/preview", "POST", body);

export const opsSaveRateCard = (id: string, body: {
  perimRate: number; areaRate: number; minCharge: number; expectedVersion: string;
}) => write<{ ok: boolean; version: string }>(`/api/ops/pricing/rate-cards/${id}`, "PUT", body);

export const opsSaveModifiers = (id: string, body: { modifiers: OpsModifier[]; expectedVersion: string }) =>
  write<{ ok: boolean; version: string }>(`/api/ops/pricing/rate-cards/${id}/modifiers`, "PUT", body);

export const opsCreateRateCard = (id: string) =>
  write<{ ok: boolean; id: string }>("/api/ops/pricing/rate-cards", "POST", { id });

export const opsDeleteRateCard = (id: string) =>
  write<{ ok: boolean }>(`/api/ops/pricing/rate-cards/${encodeURIComponent(id)}`, "DELETE", {});

export const opsRenameRateCard = (id: string, newId: string) =>
  write<{ ok: boolean; id: string }>(`/api/ops/pricing/rate-cards/${encodeURIComponent(id)}/rename`, "PUT", { newId });

// ── Delivery zones (0044) — the Australian domestic delivery leg ────────────
export interface OpsDeliveryRange { id: number; pcFrom: number; pcTo: number; note: string | null }
export interface OpsDeliveryZone {
  id: string; label: string;
  minCharge: number | null; ratePerSqm: number | null; maxCharge: number | null;
  isFallback: boolean; sortOrder: number; version: string; active: boolean; updatedAt: string;
  ranges: OpsDeliveryRange[];
}
export interface OpsDeliveryZonesResponse {
  canEdit: boolean;
  zones: OpsDeliveryZone[];
  summary: { zoneCount: number; unpricedCount: number; postcodeCount: number };
  overlaps: { a: { id: number; zoneId: string; from: number; to: number }; b: { id: number; zoneId: string; from: number; to: number } }[];
}
export const opsDeliveryZones = () => req<OpsDeliveryZonesResponse>("/api/ops/pricing/delivery-zones");

export const opsCreateDeliveryZone = (id: string, label: string) =>
  write<{ ok: boolean; id: string }>("/api/ops/pricing/delivery-zones", "POST", { id, label });

export const opsSaveDeliveryZone = (id: string, body: {
  label?: string; minCharge?: number; ratePerSqm?: number; maxCharge?: number; active?: boolean; expectedVersion?: string;
}) => write<{ ok: boolean; version: string }>(`/api/ops/pricing/delivery-zones/${encodeURIComponent(id)}`, "PUT", body);

export const opsDeleteDeliveryZone = (id: string) =>
  write<{ ok: boolean }>(`/api/ops/pricing/delivery-zones/${encodeURIComponent(id)}`, "DELETE", {});

export const opsCreateDeliveryRange = (zoneId: string, body: { pcFrom: number; pcTo: number; note?: string }) =>
  write<{ ok: boolean; id: number }>(`/api/ops/pricing/delivery-zones/${encodeURIComponent(zoneId)}/ranges`, "POST", body);

export const opsDeleteDeliveryRange = (zoneId: string, rangeId: number) =>
  write<{ ok: boolean }>(`/api/ops/pricing/delivery-zones/${encodeURIComponent(zoneId)}/ranges/${rangeId}`, "DELETE", {});

export type OpsSurchargeBasis = "per_unit" | "per_sqm";
export const opsPricingOptions = () =>
  req<{ canEdit: boolean; reconcile: OpsReconcileRun | null; options: { slug: string; surcharge: number; version: string; basis: OpsSurchargeBasis; offeredBy: number }[] }>("/api/ops/pricing/options");

export const opsSaveOption = (slug: string, surcharge: number, expectedVersion?: string, basis?: OpsSurchargeBasis) =>
  write<{ ok: boolean; version: string }>(`/api/ops/pricing/options/${encodeURIComponent(slug)}`, "PUT", { surcharge, expectedVersion, basis });

export const opsReconcile = () => write<{ run: OpsReconcileRun }>("/api/ops/pricing/reconcile", "POST", {});
export const opsReconcileLast = () => req<{ run: OpsReconcileRun | null }>("/api/ops/pricing/reconcile");

// depositPercent left the payload in 0043 — there is one deposit percentage in
// this codebase now (DEPOSIT_PERCENT, worker/lib/orders.ts) and it is not an
// editable policy row. opsSavePolicy is gone with the control it saved.
export const opsPricingPolicy = () =>
  req<{ canEdit: boolean; policy: { version: string } }>("/api/ops/pricing/policy");

export interface OpsCatalogueMirror {
  source: "sanity" | "builtin"; loadedAt: string | null; productCount: number;
  categories: {
    slug: string; name: string;
    families: { slug: string; name: string; productCount: number; optionCount: number; hasRateCard: boolean; productsWithoutCard: string[] }[];
  }[];
}
export const opsCatalogueMirror = () => req<OpsCatalogueMirror>("/api/ops/pricing/catalogue");

// ── Projects — the merged record (Slice 1) ───────────────────────────────────
// One job, one row, whatever stage it is at. What used to be the Quotes queue
// and the Orders list are the same set of records filtered differently.
export type OpsPhase = "Intake" | "Pricing" | "Issued" | "Accepted" | "Production" | "Delivered";
export const OPS_PHASES: OpsPhase[] = ["Intake", "Pricing", "Issued", "Accepted", "Production", "Delivered"];

export interface OpsLifecycle {
  phase: OpsPhase;
  phaseIndex: number;
  /** The precise state, in words — shown under the phase, never instead of it. */
  stateLabel: string;
  waitingOn: "Us" | "Customer" | "Nobody";
}

export interface OpsProjectRow extends OpsLifecycle {
  id: string; ref: string; title: string;
  customerName: string | null; customerEmail: string | null; org: string | null;
  lineCount: number;
  value: number;
  /** Which kind of number `value` is: an estimate, an issued quote, or a contract. */
  valueBasis: "est." | "issued" | "contract";
  unresolved: number;
  orderNo: string | null;
  daysInStage: number | null;
  updatedAt: string;
}

export interface OpsPayment {
  kind: string; amount: number; percent: number; status: string;
  reference: string | null; invoiced_at: string | null; paid_at: string | null;
}

export const opsProjects = () => req<{ projects: OpsProjectRow[] }>("/api/ops/projects");

// ── Record actions (Slice 2) ─────────────────────────────────────────────────
export interface OpsRecordAction {
  id: string; label: string;
  tier: "primary" | "secondary" | "overflow";
  /** Applies, but cannot run yet — shown disabled with this sentence beside it. */
  blockedReason?: string;
  /** Moves money or emails the customer ⇒ confirm in place before running. */
  confirm?: string;
}

export const opsStartPricing = (id: string) =>
  req<{ ok: boolean; statusInternal: string }>(`/api/ops/projects/${id}/start-pricing`, { method: "POST", body: "{}" });

// ── Composite openings (split / merge) ───────────────────────────────────────
// ONE opening built from several joined frames. Ops-only by design: a customer
// cannot choose a composite, but a 3500mm door that no single unit is made at
// has to become one before it can be priced or built.
//
// These endpoints have existed since the composite work and had no caller until
// now, which is why splitting was unreachable from the console.
export interface OpsSegment {
  id: string; productSlug: string; productName: string;
  width: string; height: string;
  /** How many of this frame go into ONE opening. */
  qtyPerParent: number;
  qty: number; lineTotal: number | null;
  /** The unit's own specification. Segments used to be created with NO options
   *  at all — the opening's colour and hardware were discarded on split, along
   *  with their surcharges — and the console could not display or set them. */
  options: Record<string, string>;
  status: string;
  /** Free text on the unit — the same field, meaning and column an opening
   *  uses. A unit carries the same kind of information as a childless opening;
   *  the only difference is that it has a parent (owner). */
  note: string;
}

/** The split rules, from D1. The console used to hardcode a unit count of
 *  [2,3,4] and reimplement the even-split maths without the joiner allowance. */
export interface OpsCompositePolicy {
  toleranceMm: number; defaultJoinerMm: number; maxSegments: number;
}

/** Change ONE unit, leaving its siblings untouched. `qty` is deliberately
 *  absent — it is derived from the opening, and composite.ts owns it. */
export const opsPatchSegment = (segmentId: string, patch: Partial<{
  productSlug: string; options: Record<string, string>;
  alongMm: number;
  /** ACROSS the split. The route accepts it now; it previously had no such
   *  parameter at any layer while the console rendered the field editable and
   *  captioned it as locked. */
  acrossMm: number;
  qtyPerParent: number; note: string;
}>) => req<{ ok: boolean }>(`/api/ops/segments/${segmentId}`, { method: "PATCH", body: JSON.stringify(patch) });

/** Append a unit, inheriting product and spec from the last one. */
export const opsAddSegment = (lineId: string) =>
  req<{ ok: boolean; id: string }>(`/api/ops/lines/${lineId}/segments`, { method: "POST", body: "{}" });

/** Remove a unit. Refused below two — that is a merge, not a removal. */
export const opsRemoveSegment = (segmentId: string) =>
  req<{ ok: boolean }>(`/api/ops/segments/${segmentId}`, { method: "DELETE" });

/** The live figure for the editor, priced in the RECORD OWNER's context rather
 *  than the staff member's — the customer preview would be the wrong number. */
export const opsLinePricePreview = (lineId: string) =>
  (item: { productSlug: string; width: string; height: string; options: Record<string, string>; qty: number }) =>
    req<{ ok: boolean; total: number | null }>(`/api/ops/lines/${lineId}/price-preview`, {
      method: "POST", body: JSON.stringify(item),
    });

export const opsSplitLine = (lineId: string, body: {
  axis: "vertical" | "horizontal";
  segments: { widthMm: number; heightMm: number; productSlug: string; qtyPerParent: number }[];
}) => req<{ ok: boolean }>(`/api/ops/lines/${lineId}/split`, { method: "POST", body: JSON.stringify(body) });

export const opsMergeComposite = (lineId: string) =>
  req<{ ok: boolean }>(`/api/ops/lines/${lineId}/merge`, { method: "POST", body: "{}" });
