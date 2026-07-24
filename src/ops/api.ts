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
  approvalsPending: number;
  newEnquiries: number;
  degraded?: boolean;
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
  /** Unresolved technical-review reasons (field → reason) from an auto-parse. */
  review: Record<string, string> | null;
}
export interface OpsComment { id: string; line_id: string | null; kind: string; body: string; author: string | null; created_at: string }
export interface OpsRevision { id: string; revisionNo: number; status: string; total: number; issuedAt: string; acceptedAt: string | null }
export interface OpsActivity { actor: string | null; action: string; occurred_at: string }
export interface OpsApprovalStep { trigger_family: string; reason: string | null; approver_role: string; state: string; comment: string | null; acted_at: string | null; acted_by: string | null }
export interface OpsApprovals { state: string; steps: OpsApprovalStep[] }
export interface OpsWorkspace {
  project: {
    id: string; title: string; statusCustomer: string; statusInternal: string;
    statusInternalLabel: string; nextStates: string[]; canSubmitForApproval: boolean;
    org: string | null; customerName: string | null; customerEmail: string | null;
    assignee: string | null; internalOwnerId: string | null; updatedAt: string;
  };
  lines: OpsLine[];
  files: { id: string; kind: string; filename: string; size: number; virus_status: string }[];
  revisions: OpsRevision[];
  comments: OpsComment[];
  activity: OpsActivity[];
  approvals: OpsApprovals | null;
}

export interface OpsApprovalTask {
  id: string; trigger_family: string; reason: string | null; approver_role: string;
  project_id: string; title: string; customer_name: string | null; org_name: string | null;
}

export const opsSubmissions = () => req<{ submissions: OpsSubmission[] }>("/api/ops/queues/submissions");
export const opsProject = (id: string) => req<OpsWorkspace>(`/api/ops/projects/${id}`);
export const opsAssign = (id: string, userId?: string) =>
  req<{ ok: boolean; assignee: string | null; statusInternal: string }>(`/api/ops/projects/${id}/assign`, { method: "POST", body: JSON.stringify({ userId }) });
export const opsPatchLine = (lineId: string, patch: Partial<{ width: string; height: string; qty: number; code: string; room: string; options: Record<string, string>; resolveReview: boolean | string[] }>) =>
  req<{ line: OpsLine }>(`/api/ops/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(patch) });

// ── Estimator (CPQ) review workspace ─────────────────────────────────────────
export interface EstimatorProject { id: string; title: string; statusCustomer: string; openings: number; attention: number }
export interface ScoreComponents {
  compliance: number; geometry: number; configuration: number;
  commercial: number; historical: number; dataCompleteness: number;
}
export interface EstimatorCandidate {
  productId: string; productName: string; catalogueRev: string; passed: boolean;
  filters: { filter: string; passed: boolean; severity?: string; reason?: string }[];
  score: number | null; components: ScoreComponents | null; rank: number | null; selected: boolean; failReasons: string[];
}
export interface EstimatorOpening {
  id: string; externalRef: string | null; room: string | null; family: string | null;
  operation: string | null; width: number | null; height: number | null; status: string;
  selectionRunId: string | null;
  candidates: EstimatorCandidate[];
  draft: { id: string; status: string; confidence: number | null; catalogue: any; price: any; warnings: string[] } | null;
}
export const opsEstimatorProjects = () => req<{ projects: EstimatorProject[] }>("/api/ops/estimator/projects");
export const opsEstimatorWorkspace = (projectId: string) =>
  req<{ openings: EstimatorOpening[]; categories: string[] }>(`/api/ops/projects/${projectId}/estimator`);
export const opsRunEstimate = (projectId: string) =>
  req<{ openings: number; selected: number; lines: any[] }>(`/api/ops/projects/${projectId}/estimate`, { method: "POST", body: "{}" });
export const opsEstimatorFeedback = (projectId: string, body: { openingId?: string; selectionRunId?: string; field: string; category: string; reasonCode: string; initialValue?: any; finalValue?: any; note?: string }) =>
  req<{ ok: boolean; id: string }>(`/api/ops/projects/${projectId}/feedback`, { method: "POST", body: JSON.stringify(body) });
export const opsAddNote = (id: string, body: string, lineId?: string) =>
  req<{ comment: OpsComment }>(`/api/ops/projects/${id}/note`, { method: "POST", body: JSON.stringify({ body, lineId }) });
export const opsIssueRevision = (id: string) =>
  req<{ id: string; revisionNo: number; total: number }>(`/api/ops/projects/${id}/issue-revision`, { method: "POST" });
export const opsSetStatus = (id: string, statusInternal: string) =>
  req<{ statusInternal: string; statusInternalLabel: string; nextStates: string[] }>(`/api/ops/projects/${id}/status`, { method: "POST", body: JSON.stringify({ statusInternal }) });
export const opsRequestClarification = (id: string, message: string) =>
  req<{ ok: boolean; statusInternalLabel: string }>(`/api/ops/projects/${id}/request-clarification`, { method: "POST", body: JSON.stringify({ message }) });
export const opsSubmitForApproval = (id: string) =>
  req<{ statusInternal: string; steps: { family: string; role: string; reason: string }[] }>(`/api/ops/projects/${id}/submit-for-approval`, { method: "POST" });

export const opsApprovals = () => req<{ approvals: OpsApprovalTask[]; canActRoles: string | null }>("/api/ops/approvals");
export const opsApprove = (stepId: string, comment?: string) =>
  req<{ ok: boolean; stepState: string; instanceState: string }>(`/api/ops/approvals/${stepId}/approve`, { method: "POST", body: JSON.stringify({ comment }) });
export const opsReject = (stepId: string, comment?: string) =>
  req<{ ok: boolean; stepState: string; instanceState: string }>(`/api/ops/approvals/${stepId}/reject`, { method: "POST", body: JSON.stringify({ comment }) });

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
export interface OpsRule { id: string; name: string; trigger_family: string; condition_json: string; approver_role: string; active: number }
export interface OpsFile { id: string; kind: string; filename: string; size: number; virus_status: string; scan_engine: string | null; scanned_at: string | null; created_at: string; project_title: string | null; customer_name: string | null }
export interface OpsAudit { entity_type: string; entity_id: string; action: string; occurred_at: string; actor: string | null }
export interface OpsStaff { id: string; email: string; name: string | null; role: string | null; last_verified_at: string | null }
export interface OpsSearchResult { type: string; id: string; label: string; hint: string }

export const opsRules = () => req<{ rules: OpsRule[] }>("/api/ops/rules");
export const opsPatchRule = (id: string, patch: { active?: boolean; value?: number }) =>
  req<{ ok: boolean }>(`/api/ops/rules/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const opsFiles = () => req<{ files: OpsFile[] }>("/api/ops/files");
/** Re-run the scanner over a stored file (clears 'skipped'/'pending' so it can be
 *  downloaded again; an infected verdict purges the bytes). */
export const opsRescanFile = (id: string) =>
  req<{ ok: boolean; status: string; engine: string; reason: string | null }>(`/api/ops/files/${id}/rescan`, { method: "POST" });
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
