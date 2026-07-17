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
export const opsPatchLine = (lineId: string, patch: Partial<{ width: string; height: string; qty: number; code: string; room: string; options: Record<string, string> }>) =>
  req<{ line: OpsLine }>(`/api/ops/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(patch) });
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

// ── Customers 360 (O5) ───────────────────────────────────────────────────────
export interface OpsCustomer {
  id: string; name: string; trading_name: string | null; abn: string | null; account_status: string;
  projects: number; orders: number; contact_name: string | null; contact_email: string | null;
}
export interface OpsCustomerDetail {
  org: { id: string; name: string; tradingName: string | null; abn: string | null; accountStatus: string };
  members: { id: string; name: string | null; email: string; phone: string | null; role: string }[];
  projects: { id: string; title: string | null; status_customer: string; status_internal: string; updated_at: string }[];
  orders: { id: string; order_no: string; stage: string; total: number | null }[];
}
export const opsCustomers = () => req<{ customers: OpsCustomer[] }>("/api/ops/customers");
export const opsCustomer = (orgId: string) => req<OpsCustomerDetail>(`/api/ops/customers/${orgId}`);
