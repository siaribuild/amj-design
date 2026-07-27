// /api/ops — internal ops console API (staff-gated).
//
// O1: staff auth (domain-allowlisted internal OTP for dev; Cloudflare Access in
// prod), identity, and a dashboard summary. Queues, the quote workspace,
// approvals, etc. land in O2+.
import { Hono } from "hono";
import type { Env } from "../types";
import {
  challengeAllowed, clearCookie, consumeChallenge, createSession, destroySession, isDevEnv,
  isEmail, normEmail, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { notify } from "../lib/email";
import { findOrCreateInternalUser, isStaffEmail, resolveStaff } from "../lib/staff";
import { drainLearningOutbox, issueRevision } from "../lib/revisions";
import { logEvent } from "../lib/activity";
import { evaluateApprovals, createApprovalInstance, resolveInstance, canApprove } from "../lib/approvals";
import { splitLine, mergeComposite } from "../lib/composite";
import { orderDto, applyTransition, markPaid, availableActions, type OrderRow } from "../lib/orders";
import { uuid } from "../lib/util";
import { scanFile } from "../lib/scan";
import {
  pricingOptionSlugsFromOptions, runProjectEstimate, toOpeningInput, type OpeningRow,
} from "../lib/estimator/estimate";
import { createCatalogueRepository, hasAnyExactPricingCoverage, sanityExecutor } from "../lib/estimator/catalogue";
import { checkHardRules } from "../lib/estimator/rules";
import { recordFeedback, FEEDBACK_CATEGORIES } from "../lib/estimator/persist";
import { runAiExtraction } from "../lib/ai/pipeline";
import { reserveAiRunBudget } from "../lib/ai/jobs";
import { isOverrideReason, OVERRIDE_REASONS } from "../lib/ai/schema";
import { getProductBySlug } from "../../src/data/catalogue";
import { priceItem } from "../lib/lines";
import { priceLine } from "../lib/estimator/pricing";

export const ops = new Hono<{ Bindings: Env }>();

// Internal workflow state machine (status_internal). 'issued' is reached via
// issue-revision; 'customer_clarification_required' via request-clarification.
// approved_for_issue is reached ONLY via submit-for-approval (which evaluates
// approval rules), never as a direct /status move.
const FLOW: Record<string, string[]> = {
  submitted: ["triage_pending", "estimator_assigned", "customer_clarification_required"],
  triage_pending: ["estimator_assigned", "customer_clarification_required"],
  estimator_assigned: ["technical_review_required", "customer_clarification_required"],
  technical_review_required: ["estimator_assigned", "customer_clarification_required"],
  approval_pending: [],
  approved_for_issue: ["issued", "estimator_assigned"],
  customer_clarification_required: ["estimator_assigned"],
};

// Statuses from which an estimator can submit the quote for approval.
export const CAN_SUBMIT_FOR_APPROVAL = new Set(["estimator_assigned", "technical_review_required"]);

export const STATUS_INTERNAL_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", triage_pending: "Awaiting triage",
  estimator_assigned: "Assigned", technical_review_required: "Technical review",
  approval_pending: "Approval pending", approved_for_issue: "Ready to issue",
  customer_clarification_required: "Awaiting customer", issued: "Quote issued",
};

const safeParse = (s: string): Record<string, any> => {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

// ── Persona RBAC ─────────────────────────────────────────────────────────────
// Being `type='internal'` (past Cloudflare Access in prod) is the perimeter, but
// it is NOT sufficient for money movements or bulk customer PII. A freshly
// provisioned staffer starts with role=null and must be assigned a role by an
// admin before they can act on sensitive surfaces. (Broader per-endpoint personas
// remain an O-series roadmap item; these gates cover the highest-risk operations.)
const ROLES = ["estimator", "technical_reviewer", "manager", "admin"];
const hasAssignedRole = (staff: { role: string | null }) => !!staff.role && ROLES.includes(staff.role);
const canRecordPayment = (staff: { role: string | null }) => staff.role === "manager" || staff.role === "admin";
const canManageLearning = (staff: { role: string | null }) => staff.role === "manager" || staff.role === "admin";
const canIssueQuote = (staff: { role: string | null }) =>
  staff.role === "estimator" || staff.role === "manager" || staff.role === "admin";
const canAdjudicateThermal = (staff: { role: string | null }) =>
  staff.role === "technical_reviewer" || staff.role === "manager" || staff.role === "admin";

async function unresolvedLineCount(env: Env, projectId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT count(*) AS count FROM quote_line
      WHERE project_id=? AND revision_id IS NULL
        AND (status <> 'ready' OR line_total IS NULL)`,
  ).bind(projectId).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

interface LineRow {
  id: string; project_id: string; external_ref: string | null; room_label: string | null; product_slug: string;
  options_json: string; dims_json: string; measured_by: string; qty: number; line_total: number | null; status: string;
  origin?: string | null; review_json?: string | null;
  ai_proposal_line_id?: string | null; selected_variant_id?: string | null;
  configuration_snapshot_json?: string | null; pricing_snapshot_json?: string | null;
  edited_fields?: string | null; edit_version: number;
  quote_edit_version?: number;
}

const opsLineDto = (r: LineRow) => {
  const dims = safeParse(r.dims_json);
  const review = r.review_json ? safeParse(r.review_json) : null;
  return {
    id: r.id,
    code: r.external_ref ?? "",
    room: r.room_label ?? "",
    productSlug: r.product_slug,
    productName: getProductBySlug(r.product_slug)?.name ?? r.product_slug,
    width: String(dims.width ?? ""),
    height: String(dims.height ?? ""),
    options: safeParse(r.options_json),
    qty: r.qty,
    lineTotal: r.line_total,
    status: r.status,
    selectedVariantId: r.selected_variant_id ?? null,
    // Provenance + unresolved technical-review reasons, so staff can see and act
    // on the flags the parser raised (material substitution, out-of-range, glazing…).
    origin: r.origin ?? "manual",
    review: review && Object.keys(review).length ? (review as Record<string, string>) : null,
  };
};

// POST /api/ops/auth/challenge { email } — allowlisted staff only; neutral otherwise.
ops.post("/auth/challenge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  if (isEmail(email) && isStaffEmail(c.env, email) && (await challengeAllowed(c.env, email))) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    await notify(c.env, {
      recipient: email,
      eventType: "ops.code.requested",
      templateKey: "ops_signin_code",
      email: { to: email, subject: "Your OpenFrame ops sign-in code", text: `Your ops console code is ${code}. It expires in 10 minutes.` },
    });
    if (isDevEnv(c.env)) return c.json({ ok: true, devCode: code });
  }
  return c.json({ ok: true });
});

// POST /api/ops/auth/verify { email, code } — starts an internal-user session.
ops.post("/auth/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const code = String(body?.code ?? "").trim();
  if (!isEmail(email) || !isStaffEmail(c.env, email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }
  if (!(await consumeChallenge(c.env, email, code))) return c.json({ error: "invalid_code" }, 400);

  const user = await findOrCreateInternalUser(c.env, email);
  const token = await createSession(c.env, user);
  c.header("Set-Cookie", sessionCookie(token, c.env), { append: true });
  return c.json({ authenticated: true, user: userDto(user) });
});

ops.post("/auth/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", clearCookie("apertly_session", c.env));
  return c.json({ ok: true });
});

// GET /api/ops/me — the acting staff member, or 401.
ops.get("/me", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ authenticated: false, user: null }, 401);
  return c.json({ authenticated: true, user: userDto(staff) });
});

// GET /api/ops/summary — dashboard counts (staff-gated). Resilient: a query
// failure degrades to zeros rather than 500-ing the whole dashboard.
ops.get("/summary", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);

  try {
    const row = await c.env.DB.prepare(`
      SELECT
        (SELECT count(*) FROM project WHERE status_customer = 'submitted')                       AS submissions,
        (SELECT count(*) FROM project WHERE status_customer = 'under_review')                    AS in_review,
        (SELECT count(*) FROM "order" WHERE stage NOT IN ('after_sales','cancelled'))            AS active_orders,
        (SELECT count(*) FROM "order" WHERE stage IN ('deposit_invoiced','balance_invoiced'))    AS awaiting_payment,
        (SELECT count(*) FROM user WHERE type = 'customer')                                       AS customers,
        (SELECT count(*) FROM approval_step WHERE state = 'pending')                              AS approvals_pending,
        (SELECT count(*) FROM enquiry WHERE workflow_status = 'new')                              AS new_enquiries
    `).first<Record<string, number>>();

    return c.json({
      submissions: row?.submissions ?? 0,
      inReview: row?.in_review ?? 0,
      activeOrders: row?.active_orders ?? 0,
      awaitingPayment: row?.awaiting_payment ?? 0,
      customers: row?.customers ?? 0,
      approvalsPending: row?.approvals_pending ?? 0,
      newEnquiries: row?.new_enquiries ?? 0,
    });
  } catch {
    return c.json({ submissions: 0, inReview: 0, activeOrders: 0, awaitingPayment: 0, customers: 0, approvalsPending: 0, newEnquiries: 0, degraded: true });
  }
});

// GET /api/ops/queues/submissions — projects awaiting triage / review.
ops.get("/queues/submissions", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.status_customer, p.status_internal, p.updated_at,
           o.name AS org_name, u.name AS customer_name, u.email AS customer_email,
           io.name AS assignee_name,
           -- PARENTS ONLY — same rule as loadLines(). A segment must never be
           -- summed beside the parent that already aggregates it.
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL AND parent_line_id IS NULL) AS item_count,
           (SELECT COALESCE(SUM(line_total), 0) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL AND parent_line_id IS NULL) AS total
      FROM project p
      LEFT JOIN organisation o ON o.id = p.organisation_id
      LEFT JOIN user u  ON u.id  = p.owner_user_id
      LEFT JOIN user io ON io.id = p.internal_owner_id
     WHERE p.status_customer IN ('submitted','needs_information','under_review')
     ORDER BY p.updated_at ASC`).all();
  return c.json({ submissions: results });
});

// GET /api/ops/projects/:id — the internal quote workspace.
ops.get("/projects/:id", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const p = await c.env.DB.prepare(`
    SELECT p.*, o.name AS org_name, u.name AS customer_name, u.email AS customer_email, io.name AS assignee_name
      FROM project p
      LEFT JOIN organisation o ON o.id = p.organisation_id
      LEFT JOIN user u  ON u.id  = p.owner_user_id
      LEFT JOIN user io ON io.id = p.internal_owner_id
     WHERE p.id = ?`).bind(id).first<any>();
  if (!p) return c.json({ error: "not_found" }, 404);

  // PARENTS ONLY — the reviewer sees the same line list the customer does, with
  // segments nested inside their parent rather than loose beside it.
  const { results: lines } = await c.env.DB.prepare("SELECT * FROM quote_line WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL ORDER BY position").bind(id).all<LineRow>();
  const { results: files } = await c.env.DB.prepare("SELECT id, kind, filename, size, virus_status, created_at FROM file_asset WHERE project_id = ? ORDER BY created_at DESC").bind(id).all();
  const { results: revisions } = await c.env.DB.prepare("SELECT id, revision_no, snapshot_status, totals_json, issued_at, accepted_at FROM quote_revision WHERE project_id = ? ORDER BY revision_no DESC").bind(id).all<any>();
  const { results: comments } = await c.env.DB.prepare("SELECT cm.id, cm.line_id, cm.kind, cm.body, cm.created_at, u.name AS author FROM comment cm LEFT JOIN user u ON u.id = cm.author_id WHERE cm.project_id = ? ORDER BY cm.created_at DESC").bind(id).all();
  const { results: activity } = await c.env.DB.prepare("SELECT a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor WHERE a.entity_type = 'project' AND a.entity_id = ? ORDER BY a.occurred_at DESC").bind(id).all();

  const instance = await c.env.DB.prepare("SELECT id, state FROM approval_instance WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first<{ id: string; state: string }>();
  let approvals: any = null;
  if (instance) {
    const { results: steps } = await c.env.DB.prepare("SELECT s.trigger_family, s.reason, s.approver_role, s.state, s.comment, s.acted_at, u.name AS acted_by FROM approval_step s LEFT JOIN user u ON u.id = s.acted_by WHERE s.instance_id = ?").bind(instance.id).all();
    approvals = { state: instance.state, steps };
  }

  return c.json({
    project: {
      id: p.id, title: p.title ?? "Untitled project",
      statusCustomer: p.status_customer, statusInternal: p.status_internal,
      statusInternalLabel: STATUS_INTERNAL_LABEL[p.status_internal] ?? p.status_internal,
      nextStates: FLOW[p.status_internal] ?? [],
      canSubmitForApproval: CAN_SUBMIT_FOR_APPROVAL.has(p.status_internal) &&
        lines.every((line) => line.status === "ready" && line.line_total != null),
      unresolvedLineCount: lines.filter((line) => line.status !== "ready" || line.line_total == null).length,
      org: p.org_name, customerName: p.customer_name, customerEmail: p.customer_email,
      // Submission contact captured at submit time (persisted even for anon submitters).
      contactName: p.contact_name ?? null, contactEmail: p.contact_email ?? null,
      contactPhone: p.contact_phone ?? null, deliverySuburb: p.delivery_suburb ?? null,
      assignee: p.assignee_name, internalOwnerId: p.internal_owner_id,
      updatedAt: p.updated_at,
    },
    lines: lines.map(opsLineDto),
    files,
    revisions: revisions.map((r: any) => ({ id: r.id, revisionNo: r.revision_no, status: r.snapshot_status, total: safeParse(r.totals_json).total ?? 0, issuedAt: r.issued_at, acceptedAt: r.accepted_at })),
    comments,
    activity,
    approvals,
  });
});

// POST /api/ops/projects/:id/assign { userId? } — claim/assign the quote.
ops.post("/projects/:id/assign", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetId = typeof body?.userId === "string" && body.userId ? body.userId : staff.id;
  const res = await c.env.DB.prepare(
    `UPDATE project SET internal_owner_id=?, status_internal='estimator_assigned', updated_at=datetime('now')
      WHERE id=? AND status_internal IN (
        'draft','submitted','triage_pending','estimator_assigned',
        'technical_review_required','customer_clarification_required'
      )`,
  ).bind(targetId, c.req.param("id")).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  const assignee = await c.env.DB.prepare("SELECT name FROM user WHERE id = ?").bind(targetId).first<{ name: string }>();
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: c.req.param("id"), action: targetId === staff.id ? "assigned to self" : `assigned to ${assignee?.name ?? "staff"}` });
  return c.json({ ok: true, assignee: assignee?.name ?? null, statusInternal: "estimator_assigned" });
});

// POST /api/ops/projects/:id/status { statusInternal } — a validated workflow move.
ops.post("/projects/:id/status", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const target = String(body?.statusInternal ?? "");
  const project = await c.env.DB.prepare(
    "SELECT status_internal, quote_edit_version FROM project WHERE id = ?",
  ).bind(id).first<{ status_internal: string; quote_edit_version: number }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  // 'issued' / 'customer_clarification_required' have dedicated endpoints.
  if (target === "issued" || target === "customer_clarification_required" || !(FLOW[project.status_internal] ?? []).includes(target)) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  const moved = await c.env.DB.prepare(
    `UPDATE project SET status_internal=?, updated_at=datetime('now')
      WHERE id=? AND status_internal=?`,
  ).bind(target, id, project.status_internal).run();
  if (!moved.meta.changes) {
    return c.json({ error: "workflow_changed_retry" }, 409);
  }
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: `moved to ${STATUS_INTERNAL_LABEL[target] ?? target}` });
  return c.json({ statusInternal: target, statusInternalLabel: STATUS_INTERNAL_LABEL[target] ?? target, nextStates: FLOW[target] ?? [] });
});

// POST /api/ops/projects/:id/request-clarification { message } — ask the customer.
ops.post("/projects/:id/request-clarification", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ error: "empty" }, 400);

  const project = await c.env.DB.prepare(
    "SELECT status_internal FROM project WHERE id=?",
  ).bind(id).first<{ status_internal: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!(FLOW[project.status_internal] ?? []).includes("customer_clarification_required")) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  const cust = await c.env.DB.prepare("SELECT u.email FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string }>();
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment (id, project_id, author_id, kind, body)
       SELECT ?, ?, ?, 'clarification', ?
        WHERE EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_internal=?
        )`,
    ).bind(uuid(), id, staff.id, message, id, project.status_internal),
    c.env.DB.prepare(
      `UPDATE project SET status_customer='needs_information',
          status_internal='customer_clarification_required',
          updated_at=datetime('now')
        WHERE id=? AND status_internal=?`,
    ).bind(id, project.status_internal),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "workflow_changed_retry" }, 409);
  }
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: "requested clarification" });
  if (cust?.email) {
    await notify(c.env, { recipient: cust.email, eventType: "clarification.requested", templateKey: "needs_info",
      email: { to: cust.email, subject: "We need a bit more info on your quote", text: message } });
  }
  return c.json({ ok: true, statusInternal: "customer_clarification_required", statusInternalLabel: STATUS_INTERNAL_LABEL.customer_clarification_required });
});

// POST /api/ops/projects/:id/submit-for-approval — evaluate rules; gate or auto-clear.
ops.post("/projects/:id/submit-for-approval", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const project = await c.env.DB.prepare(
    "SELECT status_internal, quote_edit_version FROM project WHERE id = ?",
  ).bind(id).first<{ status_internal: string; quote_edit_version: number }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!["estimator_assigned", "technical_review_required"].includes(project.status_internal)) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  const unresolved = await unresolvedLineCount(c.env, id);
  if (unresolved > 0) return c.json({ error: "unresolved_lines", count: unresolved }, 409);
  const steps = await evaluateApprovals(c.env, id);
  if (steps.length === 0) {
    const approved = await c.env.DB.prepare(
      `UPDATE project SET status_internal='approved_for_issue', updated_at=datetime('now')
        WHERE id=? AND status_internal=? AND quote_edit_version=?
          AND NOT EXISTS (
            SELECT 1 FROM quote_line
             WHERE project_id=? AND revision_id IS NULL
               AND (status <> 'ready' OR line_total IS NULL)
          )
        RETURNING id`,
    ).bind(id, project.status_internal, project.quote_edit_version, id).first<{ id: string }>();
    if (!approved) return c.json({ error: "quote_changed_retry" }, 409);
    await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: "no approval required — ready to issue" });
    return c.json({ statusInternal: "approved_for_issue", steps: [] });
  }
  const instanceId = await createApprovalInstance(
    c.env, id, steps, project.status_internal, project.quote_edit_version,
  );
  if (!instanceId) return c.json({ error: "quote_changed_retry" }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: `submitted for approval (${steps.length} step${steps.length !== 1 ? "s" : ""})` });
  return c.json({ statusInternal: "approval_pending", steps: steps.map((s) => ({ family: s.family, role: s.role, reason: s.reason })) });
});

// GET /api/ops/approvals — pending steps the acting staff can clear (admin sees all).
ops.get("/approvals", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT s.id, s.trigger_family, s.reason, s.approver_role, s.state,
           ai.project_id, p.title, u.name AS customer_name, o.name AS org_name
      FROM approval_step s
      JOIN approval_instance ai ON ai.id = s.instance_id AND ai.state = 'pending'
      JOIN project p ON p.id = ai.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
      LEFT JOIN organisation o ON o.id = p.organisation_id
     WHERE s.state = 'pending'
     ORDER BY s.id`).all<any>();
  const approvals = results.filter((s) => canApprove(staff, s.approver_role));
  return c.json({ approvals, canActRoles: staff.role });
});

async function actOnStep(c: any, action: "approved" | "rejected") {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const stepId = c.req.param("stepId");
  const step = await c.env.DB.prepare(
    "SELECT s.*, ai.project_id FROM approval_step s JOIN approval_instance ai ON ai.id = s.instance_id WHERE s.id = ?",
  ).bind(stepId).first<any>();
  if (!step) return c.json({ error: "not_found" }, 404);
  if (step.state !== "pending") return c.json({ error: "already_acted" }, 409);
  if (!canApprove(staff, step.approver_role)) return c.json({ error: "wrong_role" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const acted = await c.env.DB.prepare(
    `UPDATE approval_step SET state = ?, acted_by = ?, acted_at = datetime('now'), comment = ?
      WHERE id = ? AND state='pending' AND approver_role=?
      RETURNING id`,
  ).bind(action, staff.id, typeof body?.comment === "string" ? body.comment : null, stepId, step.approver_role)
    .first<{ id: string }>();
  if (!acted) return c.json({ error: "already_acted" }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: step.project_id, action: `${action === "approved" ? "approved" : "rejected"} ${step.trigger_family} approval` });
  const instanceState = await resolveInstance(c.env, step.instance_id);
  return c.json({ ok: true, stepState: action, instanceState });
}

// POST /api/ops/approvals/:stepId/approve | /reject
ops.post("/approvals/:stepId/approve", (c) => actOnStep(c, "approved"));
ops.post("/approvals/:stepId/reject", (c) => actOnStep(c, "rejected"));

// POST /api/ops/approvals/:stepId/delegate { role } — re-route to another role.
// Only someone who could act on the step (its required role, or an admin) may
// delegate it — otherwise an estimator could reroute a manager step to itself.
ops.post("/approvals/:stepId/delegate", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const role = String(body?.role ?? "").trim();
  const valid = ["estimator", "technical_reviewer", "manager", "admin"];
  if (!valid.includes(role)) return c.json({ error: "invalid_role" }, 400);
  const step = await c.env.DB.prepare(
    "SELECT s.approver_role, s.state, ai.project_id FROM approval_step s JOIN approval_instance ai ON ai.id = s.instance_id WHERE s.id = ?",
  ).bind(c.req.param("stepId")).first<{ approver_role: string; state: string; project_id: string }>();
  if (!step || step.state !== "pending") return c.json({ error: "not_found" }, 404);
  if (!canApprove(staff, step.approver_role)) return c.json({ error: "wrong_role" }, 403);
  await c.env.DB.prepare("UPDATE approval_step SET approver_role = ? WHERE id = ? AND state = 'pending'").bind(role, c.req.param("stepId")).run();
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: step.project_id, action: `delegated ${step.approver_role} approval → ${role}` });
  return c.json({ ok: true, approverRole: role });
});

// PATCH /api/ops/lines/:id — estimator edits a draft line; server reprices.
// The set of internal states in which a reviewer may still change a line.
const EDITABLE_STATES = `'submitted','triage_pending','estimator_assigned','technical_review_required','customer_clarification_required'`;

/** Resolve an editable parent opening for a staff caller, or null. */
async function editableParent(env: Env, req: Request, lineId: string) {
  const staff = await resolveStaff(env, req);
  if (!staff || !hasAssignedRole(staff)) return null;
  return env.DB.prepare(
    `SELECT q.* FROM quote_line q JOIN project p ON p.id=q.project_id
      WHERE q.id=? AND q.revision_id IS NULL AND q.parent_line_id IS NULL
        AND p.status_internal IN (${EDITABLE_STATES})`,
  ).bind(lineId).first<LineRow & { project_id: string }>();
}

// POST /api/ops/lines/:id/split — plan one opening as several joined units.
//
// Ops only, by design: the customer cannot choose a composite. The AI proposal
// path calls splitLine() directly; this is the human correction surface.
ops.post("/lines/:id/split", async (c) => {
  const parent = await editableParent(c.env, c.req.raw, c.req.param("id"));
  if (!parent) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const segments = Array.isArray(body?.segments) ? body.segments : [];
  const axis = body?.axis === "horizontal" ? "horizontal" : "vertical";
  const result = await splitLine(c.env, {
    parentId: parent.id,
    axis,
    origin: "ops",
    segments: segments.map((s: Record<string, unknown>) => ({
      widthMm: Number(s?.widthMm) || 0,
      heightMm: Number(s?.heightMm) || 0,
      productSlug: String(s?.productSlug ?? ""),
      qtyPerParent: Number(s?.qtyPerParent) || 1,
      options: (s?.options && typeof s.options === "object" ? s.options : {}) as Record<string, string>,
    })),
  });
  if (!result.ok) return c.json({ error: "invalid_split", errors: result.errors }, 400);
  await logEvent(c.env, { entityType: "project", entityId: parent.project_id, action: "line.split", after: { lineId: parent.id, units: segments.length } });
  return c.json({ ok: true });
});

// POST /api/ops/lines/:id/merge — undo a split.
//
// The `fit` warning is restored deliberately: the reason the opening was split
// (no single unit is made this wide) is still true, and letting it return as a
// clean line would present an unbuildable single unit as Ready.
ops.post("/lines/:id/merge", async (c) => {
  const parent = await editableParent(c.env, c.req.raw, c.req.param("id"));
  if (!parent) return c.json({ error: "not_found" }, 404);
  await mergeComposite(c.env, parent.id);
  await c.env.DB.prepare(
    `UPDATE quote_line
        SET review_json = json_patch(COALESCE(review_json,'{}'), ?),
            status='technical_review', updated_at=datetime('now')
      WHERE id=?`,
  ).bind(
    JSON.stringify({ fit: "No single unit is made at this size — we will confirm how it is built and price it at technical review." }),
    parent.id,
  ).run();
  await logEvent(c.env, { entityType: "project", entityId: parent.project_id, action: "line.merge", after: { lineId: parent.id } });
  return c.json({ ok: true });
});

ops.patch("/lines/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const line = await c.env.DB.prepare(
    `SELECT q.*, p.quote_edit_version FROM quote_line q JOIN project p ON p.id=q.project_id
      WHERE q.id=? AND q.revision_id IS NULL
        AND p.status_internal IN (
          'submitted','triage_pending','estimator_assigned',
          'technical_review_required','customer_clarification_required'
        )`,
  ).bind(c.req.param("id")).first<LineRow>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const dims = safeParse(line.dims_json);
  const width = body?.width !== undefined ? String(body.width) : String(dims.width ?? "");
  const height = body?.height !== undefined ? String(body.height) : String(dims.height ?? "");
  const options = body?.options && typeof body.options === "object" && !Array.isArray(body.options)
    ? body.options as Record<string, unknown>
    : safeParse(line.options_json);
  const qty = body?.qty !== undefined ? Math.max(1, Math.floor(Number(body.qty) || 1)) : line.qty;
  const productSlug = body?.productSlug !== undefined ? String(body.productSlug) : line.product_slug;
  const code = body?.code !== undefined ? String(body.code) : line.external_ref;
  const room = body?.room !== undefined ? String(body.room) : line.room_label;

  // Technical-review reasons are NOT cleared as a side effect of an edit — an
  // estimator changing qty must not silently mark a substitution/out-of-range line
  // ready. They are resolved only by an explicit request: resolveReview === true
  // clears them all, or an array clears the named keys.
  const existingReview = safeParse(line.review_json ?? "") as Record<string, string>;
  let review: Record<string, string> = { ...existingReview };
  const rr = body?.resolveReview;
  if (rr === true) review = {};
  else if (Array.isArray(rr)) for (const k of rr) delete review[String(k)];
  const hasReview = Object.keys(review).length > 0;
  const resolvedKeys = Object.keys(existingReview).filter((k) => !(k in review));

  let lineTotal: number | null;
  let nextPricingSnapshot: string | null = line.pricing_snapshot_json ?? null;
  let nextConfigurationSnapshot: string | null = line.configuration_snapshot_json ?? null;
  let nextVariantId = line.selected_variant_id ?? null;
  const aiManaged = line.origin === "ai" || !!line.ai_proposal_line_id;
  const requestedVariantId = body?.selectedVariantId !== undefined ? String(body.selectedVariantId) : null;
  if (aiManaged) {
    if (productSlug !== line.product_slug && !requestedVariantId) {
      return c.json({ error: "selected_variant_required" }, 400);
    }
    const effectiveVariantId = requestedVariantId || line.selected_variant_id;
    if (!effectiveVariantId) return c.json({ error: "selected_variant_required" }, 409);
    const opening = await c.env.DB.prepare(
      `SELECT o.* FROM opening_instance o
        WHERE o.quote_line_id=?
           OR o.id=(SELECT opening_id FROM ai_proposal_line WHERE id=?)
        ORDER BY o.created_at DESC LIMIT 1`,
    ).bind(line.id, line.ai_proposal_line_id ?? "").first<OpeningRow>();
    if (!opening) return c.json({ error: "opening_not_found" }, 409);
    const openingInput = {
      ...toOpeningInput(opening),
      widthMm: Number(width) || null, heightMm: Number(height) || null, qty,
    };
    const repo = createCatalogueRepository(sanityExecutor(c.env));
    const candidate = (await repo.queryCandidates(opening.family, opening.operation_type))
      .find((row) => row.slug === productSlug);
    if (!candidate?.pricingRef) return c.json({ error: "exact_pricing_unavailable" }, 409);
    const rule = checkHardRules(openingInput, candidate);
    const variant = candidate.performanceVariants.find((v) =>
      v.variantId === effectiveVariantId && v.published &&
      (!rule.eligibleVariantIds?.length || rule.eligibleVariantIds.includes(v.variantId)));
    if (!rule.passed || !variant) return c.json({ error: "configuration_not_eligible" }, 409);
    // Pricing identifiers are derived from the effective quote options and the
    // validated catalogue variant. The browser never supplies private surcharge
    // identifiers and cannot omit a chargeable selection.
    const pricingOptionSlugs = [...new Set([
      ...pricingOptionSlugsFromOptions(options),
      ...(variant.pricingOptionSlugs ?? []),
    ])];
    const exact = await priceLine(c.env, {
      family: candidate.pricingRef, widthMm: Number(width), heightMm: Number(height), qty,
      optionSlugs: pricingOptionSlugs, requireExactRate: true, requireAllOptions: true,
    }).catch(() => null);
    if (!exact?.ok) return c.json({ error: "exact_pricing_unavailable" }, 409);
    lineTotal = exact.total;
    nextVariantId = variant.variantId;
    nextPricingSnapshot = JSON.stringify(exact);
    nextConfigurationSnapshot = JSON.stringify({
      productId: candidate.sanityProductId, productSlug: candidate.slug,
      performanceVariantId: variant.variantId, frameType: variant.frameType,
      frameTechnology: variant.frameTechnology, glazing: variant.glassBuildUp,
      coating: variant.coating, options, pricingOptionSlugs,
      dimensions: { widthMm: Number(width), heightMm: Number(height) }, quantity: qty,
    });
  } else {
    // Same engine as the customer save and the schedule parse — a reviewer edit
    // must never produce a different number from the one the customer saw.
    lineTotal = await priceItem(c.env, { productSlug, width, height, options, qty });
  }
  // Readiness is derived, never forced: unpriced ⇒ incomplete; priced but still
  // carrying review flags ⇒ technical_review (submittable, staff must resolve);
  // priced + no flags ⇒ ready.
  const status = lineTotal == null ? "incomplete" : hasReview ? "technical_review" : "ready";

  const locks = new Set<string>();
  try {
    const parsed = JSON.parse(line.edited_fields ?? "[]");
    if (Array.isArray(parsed)) for (const value of parsed) if (typeof value === "string") locks.add(value);
  } catch { /* malformed legacy locks become an empty set */ }
  if (body?.productSlug !== undefined && productSlug !== line.product_slug) locks.add("product_slug");
  if (body?.options !== undefined && JSON.stringify(options) !== JSON.stringify(safeParse(line.options_json))) locks.add("options_json");
  if ((body?.width !== undefined && width !== String(dims.width ?? "")) ||
      (body?.height !== undefined && height !== String(dims.height ?? ""))) locks.add("dims_json");
  if (body?.qty !== undefined && qty !== line.qty) locks.add("qty");

  const mutableStates = [
    "submitted", "triage_pending", "estimator_assigned",
    "technical_review_required", "customer_clarification_required",
  ];
  const updated = await c.env.DB.batch([
    c.env.DB.prepare(
    `UPDATE quote_line SET product_slug=?, dims_json=?, options_json=?, qty=?, external_ref=?, room_label=?,
       line_total=?, status=?, review_json=?, pricing_snapshot_json=?,
       configuration_snapshot_json=?, selected_variant_id=?, edited_fields=?,
       edit_version=edit_version+1, updated_at=datetime('now')
       WHERE id=? AND edit_version=?
         AND EXISTS (
           SELECT 1 FROM project WHERE id=? AND quote_edit_version=?
             AND status_internal IN (${mutableStates.map(() => "?").join(",")})
         )`,
    ).bind(
    productSlug, JSON.stringify({ width, height }), JSON.stringify(options), qty, code || null, room || null,
    lineTotal, status, hasReview ? JSON.stringify(review) : null,
    nextPricingSnapshot, nextConfigurationSnapshot, nextVariantId, JSON.stringify([...locks]),
    line.id, line.edit_version, line.project_id, line.quote_edit_version ?? 0, ...mutableStates,
    ),
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=quote_edit_version+1, updated_at=datetime('now')
        WHERE id=? AND quote_edit_version=?
          AND status_internal IN (${mutableStates.map(() => "?").join(",")})`,
    ).bind(line.project_id, line.quote_edit_version ?? 0, ...mutableStates),
  ]);
  if (Number(updated[0]?.meta?.changes ?? 0) !== 1 ||
      Number(updated[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "line_changed_reload_required" }, 409);
  }

  if (resolvedKeys.length) {
    await logEvent(c.env, { actor: staff.id, entityType: "quote_line", entityId: line.id, action: `resolved technical review: ${resolvedKeys.join(", ")}` });
  }

  const fresh = await c.env.DB.prepare("SELECT * FROM quote_line WHERE id = ?").bind(line.id).first<LineRow>();
  return c.json({ line: opsLineDto(fresh!) });
});

// POST /api/ops/projects/:id/note { body, lineId? } — technical-review note.
ops.post("/projects/:id/note", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body?.body ?? "").trim();
  if (!text) return c.json({ error: "empty" }, 400);
  const id = uuid();
  await c.env.DB.prepare(
    "INSERT INTO comment (id, project_id, line_id, author_id, kind, body) VALUES (?, ?, ?, ?, 'note', ?)",
  ).bind(id, c.req.param("id"), typeof body?.lineId === "string" ? body.lineId : null, staff.id, text).run();
  return c.json({ comment: { id, body: text, author: staff.name, kind: "note", created_at: new Date().toISOString() } });
});

// POST /api/ops/projects/:id/issue-revision — issue the reviewed quote + notify customer.
ops.post("/projects/:id/issue-revision", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canIssueQuote(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const rev = await issueRevision(c.env, id);
  if (!rev.ok) return c.json({ error: rev.error }, rev.error === "not_found" ? 404 : 409);
  await logEvent(c.env, { actor: staff?.id, entityType: "project", entityId: id, action: `issued revision ${rev.revisionNo}` });
  const cust = await c.env.DB.prepare("SELECT u.email FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string }>();
  if (cust?.email) {
    await notify(c.env, {
      recipient: cust.email, eventType: "revision.issued", templateKey: "quote_issued",
      email: { to: cust.email, subject: "Your OpenFrame quote is ready", text: `Your reviewed quote (revision ${rev.revisionNo}) is ready to review and accept.` },
    });
  }
  return c.json({ id: rev.id, revisionNo: rev.revisionNo, total: rev.total });
});

// ═══════════════════════════════════════════════════════════════════════════
// O5 — Orders operations
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/ops/orders — all orders with customer + stage + payments.
ops.get("/orders", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT o.*, p.title, u.name AS customer_name, org.name AS org_name
      FROM "order" o
      JOIN project p ON p.id = o.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
      LEFT JOIN organisation org ON org.id = p.organisation_id
     ORDER BY o.created_at DESC`).all<any>();
  const list = await Promise.all(results.map(async (o) => ({
    ...(await orderDto(c.env, o as OrderRow)),
    title: o.title, customerName: o.customer_name, orgName: o.org_name,
  })));
  return c.json({ orders: list });
});

// GET /api/ops/orders/:id — order detail + lines + the actions staff can take.
ops.get("/orders/:id", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const o = await c.env.DB.prepare(`
    SELECT o.*, p.title, u.name AS customer_name, u.email AS customer_email, org.name AS org_name
      FROM "order" o
      JOIN project p ON p.id = o.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
      LEFT JOIN organisation org ON org.id = p.organisation_id
     WHERE o.id = ?`).bind(c.req.param("id")).first<any>();
  if (!o) return c.json({ error: "not_found" }, 404);
  const { results: lines } = await c.env.DB.prepare("SELECT external_ref, product_snapshot_json, qty, line_total FROM order_line WHERE order_id = ?").bind(o.id).all();
  return c.json({
    order: { ...(await orderDto(c.env, o as OrderRow)), title: o.title, customerName: o.customer_name, customerEmail: o.customer_email, orgName: o.org_name, lines },
    actions: availableActions(o as OrderRow),
  });
});

// POST /api/ops/orders/:id/advance { action } — any fulfilment transition (the
// internal console can also record customer-side confirmations by phone).
ops.post("/orders/:id/advance", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const err = await applyTransition(c.env, order, String(body?.action ?? ""));
  if (err) return c.json({ error: err }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "order", entityId: order.id, action: `advanced: ${body?.action}` });
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!), actions: availableActions(fresh!) });
});

// POST /api/ops/orders/:id/pay { kind, reference } — record a manual payment.
ops.post("/orders/:id/pay", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canRecordPayment(staff)) return c.json({ error: "forbidden_role" }, 403);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(c.req.param("id")).first<OrderRow>();
  if (!order) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const kind = body?.kind === "balance" ? "balance" : "deposit";
  const err = await markPaid(c.env, order, kind, typeof body?.reference === "string" ? body.reference : null);
  if (err) return c.json({ error: err, stage: order.stage }, 409);
  await logEvent(c.env, { actor: staff.id, entityType: "order", entityId: order.id, action: `recorded ${kind} payment` });
  const fresh = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(order.id).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, fresh!), actions: availableActions(fresh!) });
});

// ═══════════════════════════════════════════════════════════════════════════
// O5 — Customers 360
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/ops/customers — registered customers (real accounts are user rows;
// the organisation layer isn't wired, so this is user-centric). Business name +
// ABN come from the customer's own profile (see /auth/profile).
ops.get("/customers", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.company, u.abn, u.created_at,
           (SELECT count(*) FROM project WHERE owner_user_id = u.id) AS projects,
           (SELECT count(*) FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = u.id) AS orders
      FROM user u
     WHERE u.type = 'customer'
     ORDER BY u.created_at DESC`).all();
  return c.json({ customers: results });
});

// PATCH /api/ops/customers/:id { name?, phone?, company?, abn?, email? } — staff
// edit of a customer's profile. Profile fields need an assigned role (same gate as
// seeing the PII); the sign-in EMAIL is the unique login ID — customers can never
// edit it themselves and only an ADMIN may change it here. Sessions stay valid
// (keyed by user id); the next OTP sign-in simply uses the new address.
ops.patch("/customers/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const u = await c.env.DB.prepare("SELECT id, email FROM user WHERE id = ? AND type = 'customer'").bind(id).first<{ id: string; email: string }>();
  if (!u) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const sets: string[] = []; const binds: unknown[] = []; const changed: string[] = [];
  const strField = (key: string, col: string, max: number) => {
    if (body?.[key] !== undefined) {
      const v = String(body[key]).trim().slice(0, max);
      sets.push(`${col} = ?`); binds.push(v || null); changed.push(col);
    }
  };
  strField("name", "name", 200);
  strField("phone", "phone", 60);
  strField("company", "company", 200);
  strField("abn", "abn", 40);

  let emailNote = "";
  if (body?.email !== undefined) {
    if (staff.role !== "admin") return c.json({ error: "admin_only" }, 403);
    const email = normEmail(body.email);
    if (!isEmail(email)) return c.json({ error: "invalid_email" }, 400);
    if (email !== u.email) {
      const taken = await c.env.DB.prepare("SELECT 1 FROM user WHERE email = ?").bind(email).first();
      if (taken) return c.json({ error: "email_in_use" }, 409);
      sets.push("email = ?"); binds.push(email); changed.push("email");
      emailNote = ` (${u.email} → ${email})`;
    }
  }

  if (sets.length) {
    await c.env.DB.prepare(`UPDATE user SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
    await logEvent(c.env, { actor: staff.id, entityType: "user", entityId: id, action: `updated customer profile: ${changed.join(", ")}${emailNote}` });
  }
  const fresh = await c.env.DB.prepare("SELECT id, name, email, phone, company, abn, created_at FROM user WHERE id = ?").bind(id).first<any>();
  return c.json({
    ok: true,
    customer: { id: fresh.id, name: fresh.name, email: fresh.email, phone: fresh.phone, company: fresh.company, abn: fresh.abn, createdAt: fresh.created_at },
  });
});

// GET /api/ops/customers/:id — 360: the customer, their projects, and orders.
ops.get("/customers/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const u = await c.env.DB.prepare("SELECT * FROM user WHERE id = ? AND type = 'customer'").bind(id).first<any>();
  if (!u) return c.json({ error: "not_found" }, 404);
  const { results: projects } = await c.env.DB.prepare("SELECT id, title, status_customer, status_internal, updated_at FROM project WHERE owner_user_id = ? ORDER BY updated_at DESC").bind(id).all();
  const { results: ordersRows } = await c.env.DB.prepare('SELECT o.id, o.order_no, o.stage, o.total FROM "order" o JOIN project p ON p.id = o.project_id WHERE p.owner_user_id = ? ORDER BY o.created_at DESC').bind(id).all();
  return c.json({
    customer: {
      id: u.id, name: u.name, email: u.email, phone: u.phone,
      company: u.company, abn: u.abn, createdAt: u.created_at,
    },
    projects, orders: ordersRows,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O6 — Admin (rules, files, audit, staff/roles, search)
// ═══════════════════════════════════════════════════════════════════════════

const isAdmin = (staff: { role: string | null }) => staff.role === "admin";

// GET /api/ops/rules — approval rules.
ops.get("/rules", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare("SELECT id, name, trigger_family, condition_json, approver_role, active FROM approval_rule ORDER BY trigger_family").all();
  return c.json({ rules: results });
});

// PATCH /api/ops/rules/:id { active?, value? } — toggle / retune a rule (admin only).
ops.patch("/rules/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!isAdmin(staff)) return c.json({ error: "admin_only" }, 403);
  const rule = await c.env.DB.prepare("SELECT * FROM approval_rule WHERE id = ?").bind(c.req.param("id")).first<any>();
  if (!rule) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  let condition = rule.condition_json;
  if (body?.value !== undefined) {
    const cond = safeParse(rule.condition_json);
    cond.value = Number(body.value) || 0;
    condition = JSON.stringify(cond);
  }
  const active = body?.active !== undefined ? (body.active ? 1 : 0) : rule.active;
  await c.env.DB.prepare("UPDATE approval_rule SET active = ?, condition_json = ? WHERE id = ?").bind(active, condition, rule.id).run();
  await logEvent(c.env, { actor: staff.id, entityType: "rule", entityId: rule.id, action: "updated approval rule" });
  return c.json({ ok: true });
});

// GET /api/ops/files — all uploaded files across projects.
ops.get("/files", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT fa.id, fa.kind, fa.filename, fa.size, fa.virus_status, fa.scan_engine, fa.scanned_at, fa.created_at,
           p.title AS project_title, u.name AS customer_name
      FROM file_asset fa
      LEFT JOIN project p ON p.id = fa.project_id
      LEFT JOIN user u ON u.id = p.owner_user_id
     ORDER BY fa.created_at DESC`).all();
  return c.json({ files: results });
});

// POST /api/ops/files/:id/rescan — run the scanner over a stored file and record
// the verdict. This is how the pre-scanning backlog ('skipped') and any file whose
// inline scan failed ('pending') get cleared for download; an infected verdict
// purges the bytes from R2 rather than leaving them parked in the bucket.
ops.post("/files/:id/rescan", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const fa = await c.env.DB.prepare("SELECT id, r2_key, filename FROM file_asset WHERE id = ?").bind(id)
    .first<{ id: string; r2_key: string; filename: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);

  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const result = await scanFile(c.env, {
    bytes: new Uint8Array(await obj.arrayBuffer()), filename: fa.filename, contentType,
  });

  const status = result.verdict === "clean" ? "clean" : result.verdict === "infected" ? "infected" : "pending";
  if (result.verdict === "infected") await c.env.FILES.delete(fa.r2_key).catch(() => {});
  await c.env.DB.prepare("UPDATE file_asset SET virus_status = ?, scan_engine = ?, scanned_at = datetime('now') WHERE id = ?")
    .bind(status, result.engine, id).run();
  await logEvent(c.env, {
    actor: staff.id, entityType: "file", entityId: id,
    action: `rescanned file → ${status}${result.reason ? ` (${result.reason})` : ""}`,
  });
  return c.json({ ok: true, status, engine: result.engine, reason: result.reason ?? null });
});

// ═══════════════════════════════════════════════════════════════════════════
// Estimator (CPQ) — run the deterministic engine over a project's openings and
// capture review feedback. Internal, role-gated. The selection is deterministic
// and versioned; the AI extraction tier is a separate (flagged) path.
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/ops/projects/:id/estimate — select + price every opening_instance.
// SUPPORT LEVER ONLY (not in the ops UI): the pipeline estimates automatically on
// upload and after each logged correction; this remains for support/debugging.
ops.post("/projects/:id/estimate", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const project = await c.env.DB.prepare("SELECT id FROM project WHERE id = ?").bind(projectId).first();
  if (!project) return c.json({ error: "not_found" }, 404);
  const summary = await runProjectEstimate(c.env, projectId);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: projectId, action: `estimator run — ${summary.selected}/${summary.openings} openings selected` });
  return c.json(summary);
});

// GET /api/ops/projects/:id/draft-lines — the estimator's current draft lines.
ops.get("/projects/:id/draft-lines", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.opening_id, d.status, d.confidence, d.catalogue_snapshot_json, d.price_snapshot_json, d.warnings_json,
            o.external_ref, o.room
       FROM draft_order_line d LEFT JOIN opening_instance o ON o.id = d.opening_id
      WHERE d.project_id = ? ORDER BY d.created_at`,
  ).bind(c.req.param("id")).all<any>();
  return c.json({ lines: (results ?? []).map((r) => ({
    id: r.id, openingId: r.opening_id, externalRef: r.external_ref, room: r.room,
    status: r.status, confidence: r.confidence,
    catalogue: safeParse(r.catalogue_snapshot_json ?? "{}"),
    price: safeParse(r.price_snapshot_json ?? "{}"),
    warnings: safeParse(r.warnings_json ?? "[]"),
  })) });
});

// POST /api/ops/projects/:id/feedback — record ONE reviewer correction. A
// reason-code CATEGORY is mandatory (free-text-only is rejected) so the correction
// routes to the right layer (spec §12, §6a).
ops.post("/projects/:id/feedback", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const body = await c.req.json().catch(() => ({} as any));
  const res = await recordFeedback(c.env, {
    projectId,
    openingId: body?.openingId ?? null,
    selectionRunId: body?.selectionRunId ?? null,
    field: String(body?.field ?? "").slice(0, 60),
    initialValue: body?.initialValue,
    finalValue: body?.finalValue,
    category: String(body?.category ?? ""),
    reasonCode: String(body?.reasonCode ?? ""),
    reviewerId: staff.id,
    note: body?.note ? String(body.note).slice(0, 500) : null,
  });
  if (!res.ok) {
    return c.json({ error: res.error, categories: FEEDBACK_CATEGORIES }, 400);
  }
  // Ops is review-only (owner decision 2026-07-25): a logged correction re-runs
  // the DETERMINISTIC selection automatically (no AI spend) so the learned
  // preference is reflected without anyone clicking a run button. Best-effort.
  await runProjectEstimate(c.env, projectId).catch(() => { /* review stays valid even if re-rank fails */ });
  return c.json({ ok: true, id: res.id });
});

// GET /api/ops/lines/:id/configurations — exact, currently eligible catalogue
// configurations for a review line. Loaded on demand to avoid a Sanity request
// per row when opening the quote workspace.
ops.get("/lines/:id/configurations", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const line = await c.env.DB.prepare(
    "SELECT * FROM quote_line WHERE id=? AND revision_id IS NULL",
  ).bind(c.req.param("id")).first<LineRow>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const opening = await c.env.DB.prepare(
    `SELECT o.* FROM opening_instance o
      WHERE o.quote_line_id=?
         OR o.id=(SELECT opening_id FROM ai_proposal_line WHERE id=?)
      ORDER BY o.created_at DESC LIMIT 1`,
  ).bind(line.id, line.ai_proposal_line_id ?? "").first<OpeningRow>();
  if (!opening) return c.json({ error: "opening_not_found" }, 409);
  const dims = safeParse(line.dims_json);
  const input = {
    ...toOpeningInput(opening),
    widthMm: Number(dims.width) || null,
    heightMm: Number(dims.height) || null,
    qty: Math.max(1, Math.floor(line.qty || 1)),
  };
  const repo = createCatalogueRepository(sanityExecutor(c.env));
  const candidates = await repo.queryCandidates(opening.family, opening.operation_type);
  const configurations = candidates.flatMap((candidate) => {
    if (!candidate.pricingRef) return [];
    const rule = checkHardRules(input, candidate);
    if (!rule.passed) return [];
    return candidate.performanceVariants
      .filter((variant) => variant.published &&
        (!rule.eligibleVariantIds?.length || rule.eligibleVariantIds.includes(variant.variantId)))
      .map((variant) => ({
        productSlug: candidate.slug,
        productName: candidate.name,
        variantId: variant.variantId,
        frameTechnology: variant.frameTechnology,
        glassBuildUp: variant.glassBuildUp,
        coating: variant.coating,
        uValue: variant.uValue,
        shgc: variant.shgc,
      }));
  });
  return c.json({ configurations });
});

// PATCH /api/ops/recommendation-outcomes/:id — explicitly adjudicate a
// finalized human adjustment before it can influence future recommendations.
// Physical/thermal corrections remain a separate signal from commercial
// preference learning.
ops.patch("/recommendation-outcomes/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  if (action === "reject") {
    const changed = await c.env.DB.prepare(
      `UPDATE recommendation_outcome
          SET quality_state='rejected', recommendation_eligible=0, thermal_eligible=0,
              reviewed_by=?, reviewed_at=datetime('now')
        WHERE id=? AND quality_state='pending' RETURNING id`,
    ).bind(staff.id, c.req.param("id")).first<{ id: string }>();
    if (!changed) return c.json({ error: "not_found_or_final" }, 409);
    return c.json({ ok: true, qualityState: "rejected" });
  }
  const reasonCode = String(body?.reasonCode ?? "").trim();
  if (action !== "approve" || !isOverrideReason(reasonCode)) {
    return c.json({ error: "invalid_reason_code" }, 400);
  }
  const policy = OVERRIDE_REASONS[reasonCode];
  if (policy.thermal && !canAdjudicateThermal(staff)) {
    return c.json({ error: "thermal_review_role_required" }, 403);
  }
  let reviewedThermal: string | null = null;
  if (policy.thermal) {
    const raw = body?.thermalTarget && typeof body.thermalTarget === "object" ? body.thermalTarget : {};
    const maxUValue = Number(raw.maxUValue);
    const minShgc = raw.minShgc == null ? null : Number(raw.minShgc);
    const maxShgc = raw.maxShgc == null ? null : Number(raw.maxShgc);
    if (!Number.isFinite(maxUValue) || maxUValue < 0.5 || maxUValue > 10 ||
        (minShgc != null && (!Number.isFinite(minShgc) || minShgc < 0 || minShgc > 1)) ||
        (maxShgc != null && (!Number.isFinite(maxShgc) || maxShgc < 0 || maxShgc > 1)) ||
        (minShgc != null && maxShgc != null && minShgc > maxShgc)) {
      return c.json({ error: "valid_thermal_target_required" }, 400);
    }
    reviewedThermal = JSON.stringify({ maxUValue, minShgc, maxShgc });
  }
  const changed = await c.env.DB.prepare(
    `UPDATE recommendation_outcome
        SET reason_code=?, quality_state='approved',
            recommendation_eligible=?, thermal_eligible=?,
            reviewed_thermal_json=?, reviewed_by=?, reviewed_at=datetime('now')
      WHERE id=? AND decision='adjusted' AND quality_state='pending'
      RETURNING id`,
  ).bind(
    reasonCode, policy.ranker ? 1 : 0, policy.thermal ? 1 : 0,
    reviewedThermal, staff.id, c.req.param("id"),
  ).first<{ id: string }>();
  if (!changed) return c.json({ error: "not_found_or_final" }, 409);
  await logEvent(c.env, {
    actor: staff.id, entityType: "recommendation_outcome", entityId: changed.id,
    action: `adjudicated recommendation outcome: ${reasonCode}`,
  });
  return c.json({
    ok: true, qualityState: "approved",
    recommendationEligible: policy.ranker, thermalEligible: policy.thermal,
  });
});

ops.get("/projects/:id/recommendation-outcomes", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(
    `SELECT id, quote_revision_id, quote_line_id, ai_proposal_line_id, external_ref,
            context_key, context_json, proposed_config_json, final_config_json,
            proposed_product_slug, proposed_variant_id, proposed_line_total,
            final_product_slug, final_variant_id, final_line_total, price_delta,
            decision, reason_code, recommendation_eligible, thermal_eligible,
            quality_state, reviewed_by, reviewed_at, created_at
       FROM recommendation_outcome
      WHERE project_id=? ORDER BY created_at DESC`,
  ).bind(c.req.param("id")).all();
  return c.json({ outcomes: results ?? [] });
});

// POST /api/ops/projects/:id/ai-runs — run the LLM building-modelling pipeline
// (strategy §19.1): ingest documents, extract via the single primary model,
// persist the evidence-linked building model, then deterministic selection.
// SUPPORT LEVER ONLY (not in the ops UI): extraction fires automatically on
// upload; this is the manual trigger for AI_EXTRACTION_MODE='manual' incidents.
// Retry durable finalized-quote learning delivery after transient D1/R2 errors.
ops.post("/learning-outbox/drain", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!canManageLearning(staff)) return c.json({ error: "forbidden_role" }, 403);
  const result = await drainLearningOutbox(c.env);
  await logEvent(c.env, {
    actor: staff.id, entityType: "learning_outbox", entityId: "batch",
    action: `retried learning delivery: ${result.completed}/${result.attempted} completed`,
  });
  return c.json(result);
});

ops.post("/projects/:id/ai-runs", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const project = await c.env.DB.prepare("SELECT id FROM project WHERE id = ?").bind(projectId).first();
  if (!project) return c.json({ error: "not_found" }, 404);
  if (!c.env.AI) return c.json({ error: "ai_unavailable" }, 409);
  if (!(await hasAnyExactPricingCoverage(c.env))) {
    return c.json({ error: "pricing_catalogue_not_ready" }, 409);
  }
  if (!(await reserveAiRunBudget(c.env, projectId))) return c.json({ error: "ai_budget_exhausted" }, 429);
  const summary = await runAiExtraction(c.env, projectId);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: projectId, action: `ai extraction ${summary.status} — ${summary.extractedLines} lines, ${summary.conflicts} conflicts` });
  return c.json(summary);
});

// GET /api/ops/projects/:id/building-model — the latest evidence-linked building
// model + its run status (strategy §19.2 review surface).
ops.get("/projects/:id/building-model", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT b.id, b.schema_version, b.status, b.model_json, b.confidence_json, b.created_at,
            r.status AS run_status, r.pipeline_version, r.primary_model, r.input_mode
       FROM building_models b JOIN ai_runs r ON r.id = b.ai_run_id
      WHERE b.project_id = ? ORDER BY b.created_at DESC LIMIT 1`,
  ).bind(projectId).first<any>();
  if (!row) return c.json({ error: "not_found" }, 404);
  const { results: evidence } = await c.env.DB.prepare(
    "SELECT entity_path, file_id, page_no, extracted_text, origin, confidence, review_state FROM evidence_items WHERE project_id = ? ORDER BY entity_path",
  ).bind(projectId).all<any>();
  return c.json({
    id: row.id, schemaVersion: row.schema_version, status: row.status, createdAt: row.created_at,
    run: { status: row.run_status, pipelineVersion: row.pipeline_version, primaryModel: row.primary_model, inputMode: row.input_mode },
    model: safeParse(row.model_json ?? "{}"),
    confidence: safeParse(row.confidence_json ?? "{}"),
    evidence: evidence ?? [],
  });
});

// GET /api/ops/estimator/projects — projects that have estimator openings, with a
// status breakdown, so the review workspace can list them.
ops.get("/estimator/projects", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT o.project_id AS id, p.title, p.status_customer,
           count(*) AS openings,
           SUM(CASE WHEN o.status IN ('needs_manual_review','catalogue_data_incomplete') THEN 1 ELSE 0 END) AS attention
      FROM opening_instance o LEFT JOIN project p ON p.id = o.project_id
     GROUP BY o.project_id ORDER BY attention DESC, p.title`).all<any>();
  return c.json({ projects: (results ?? []).map((r) => ({
    id: r.id, title: r.title ?? "Untitled project", statusCustomer: r.status_customer,
    openings: r.openings, attention: r.attention,
  })) });
});

// GET /api/ops/projects/:id/estimator — the review workspace payload: each opening
// with its full candidate_result set (pass/fail + score), the selected candidate,
// the draft line + price snapshot, and evidence refs.
ops.get("/projects/:id/estimator", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const projectId = c.req.param("id");

  const { results: openings } = await c.env.DB.prepare(
    "SELECT id, external_ref, room, family, operation_type, width_mm, height_mm, status FROM opening_instance WHERE project_id = ? ORDER BY created_at",
  ).bind(projectId).all<any>();

  const out = [];
  for (const o of openings ?? []) {
    const run = await c.env.DB.prepare("SELECT id FROM selection_run WHERE opening_id = ? ORDER BY created_at DESC LIMIT 1").bind(o.id).first<{ id: string }>();
    let candidates: any[] = [];
    if (run) {
      const { results } = await c.env.DB.prepare(
        "SELECT sanity_product_id, selected_variant_id, catalogue_rev, hard_rule_passed, hard_rule_outcome_json, score, score_components_json, reason_codes, rank, selected FROM candidate_result WHERE selection_run_id = ? ORDER BY selected DESC, rank",
      ).bind(run.id).all<any>();
      candidates = (results ?? []).map((r) => ({
        productId: r.sanity_product_id, variantId: r.selected_variant_id, catalogueRev: r.catalogue_rev,
        passed: !!r.hard_rule_passed, filters: safeParse(r.hard_rule_outcome_json ?? "[]"),
        score: r.score, components: safeParse(r.score_components_json ?? "null"), rank: r.rank, selected: !!r.selected,
        failReasons: safeParse(r.reason_codes ?? "[]"),
        productName: getProductBySlug(String(r.sanity_product_id).replace(/^product-/, ""))?.name ?? r.sanity_product_id,
      }));
    }
    const draft = await c.env.DB.prepare("SELECT id, status, confidence, catalogue_snapshot_json, price_snapshot_json, warnings_json FROM draft_order_line WHERE opening_id = ? ORDER BY created_at DESC LIMIT 1").bind(o.id).first<any>();
    out.push({
      id: o.id, externalRef: o.external_ref, room: o.room, family: o.family,
      operation: o.operation_type, width: o.width_mm, height: o.height_mm, status: o.status,
      selectionRunId: run?.id ?? null,
      candidates,
      draft: draft ? { id: draft.id, status: draft.status, confidence: draft.confidence,
        catalogue: safeParse(draft.catalogue_snapshot_json ?? "{}"), price: safeParse(draft.price_snapshot_json ?? "{}"),
        warnings: safeParse(draft.warnings_json ?? "[]") } : null,
    });
  }
  return c.json({ openings: out, categories: FEEDBACK_CATEGORIES });
});

// GET /api/ops/files/:id/download — staff download (any file).
ops.get("/files/:id/download", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const fa = await c.env.DB.prepare("SELECT r2_key, filename, virus_status FROM file_asset WHERE id = ?").bind(c.req.param("id")).first<{ r2_key: string; filename: string; virus_status: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  // Same gate as the customer path — staff are the likelier malware target, since
  // they open customer uploads on managed desktops. Unscanned files need a rescan.
  if (fa.virus_status === "infected") return c.json({ error: "quarantined" }, 403);
  if (fa.virus_status !== "clean") return c.json({ error: "scan_pending" }, 409);
  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${fa.filename}"`, "X-Content-Type-Options": "nosniff" } });
});

// GET /api/ops/audit — recent audit events (optionally ?entity=project|order).
ops.get("/audit", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const entity = c.req.query("entity");
  const base = "SELECT a.entity_type, a.entity_id, a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor";
  const q = entity ? `${base} WHERE a.entity_type = ? ORDER BY a.occurred_at DESC LIMIT 200` : `${base} ORDER BY a.occurred_at DESC LIMIT 200`;
  const stmt = entity ? c.env.DB.prepare(q).bind(entity) : c.env.DB.prepare(q);
  const { results } = await stmt.all();
  return c.json({ events: results });
});

// GET /api/ops/staff — internal users + roles.
ops.get("/staff", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare("SELECT id, email, name, role, last_verified_at FROM user WHERE type = 'internal' ORDER BY name").all();
  return c.json({ staff: results, roles: ["estimator", "technical_reviewer", "manager", "admin"] });
});

// PATCH /api/ops/staff/:id { role } — change a staff member's role (admin only).
ops.patch("/staff/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!isAdmin(staff)) return c.json({ error: "admin_only" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const role = String(body?.role ?? "").trim();
  const valid = ["estimator", "technical_reviewer", "manager", "admin"];
  if (!valid.includes(role)) return c.json({ error: "invalid_role" }, 400);
  const res = await c.env.DB.prepare("UPDATE user SET role = ? WHERE id = ? AND type = 'internal'").bind(role, c.req.param("id")).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  await logEvent(c.env, { actor: staff.id, entityType: "user", entityId: c.req.param("id"), action: `set role ${role}` });
  return c.json({ ok: true, role });
});

// ═══════════════════════════════════════════════════════════════════════════
// Enquiries — Contact-page leads (questions + showroom appointments). Every lead
// carries a durable OpenFrame reference + immutable source_owner; four independent
// status dimensions; manufacturer handoff + downstream reconciliation. Contains
// customer PII, so gated behind an assigned role like Customers/Files.
// ═══════════════════════════════════════════════════════════════════════════
const ENQUIRY_DIMENSIONS: Record<string, string[]> = {
  workflow_status: ["new", "assigned", "in_progress", "waiting_on_customer", "closed"],
  contact_outcome: ["not_contacted", "attempted", "contacted", "no_response"],
  appointment_status: ["not_applicable", "requested", "proposed", "confirmed", "completed", "cancelled", "no_show"],
  commercial_outcome: ["unknown", "manufacturer_quote_created", "order_placed", "lost", "not_applicable"],
};

const enquiryRowDto = (r: any) => ({
  id: r.id, reference: r.public_reference, intent: r.intent,
  name: r.name, company: r.company,
  email: r.email_display || r.email, phone: r.phone_display || r.phone,
  locationSuburb: r.location_suburb, locationState: r.location_state,
  sourceOwner: r.source_owner, sourceEntryPoint: r.source_entry_point,
  workflowStatus: r.workflow_status, contactOutcome: r.contact_outcome,
  appointmentStatus: r.appointment_status, commercialOutcome: r.commercial_outcome,
  assignedUser: r.assigned_user, assignedName: r.assigned_name,
  createdAt: r.created_at,
});

const enquiryDetailDto = (r: any) => ({
  ...enquiryRowDto(r),
  customerType: r.customer_type, topic: r.topic, message: r.message,
  locationId: r.location_id, productsInterest: r.products_interest,
  bestTimeToCall: r.best_time_to_call, preferredDays: safeParse(r.preferred_days_json || "[]"),
  appointmentNotes: r.appointment_notes,
  accountId: r.account_id, projectId: r.project_id,
  landingPath: r.landing_path, referrer: r.referrer, utm: safeParse(r.utm_json || "{}"),
  formVersion: r.form_version, privacyVersion: r.privacy_version, marketingOptIn: !!r.marketing_opt_in,
  manufacturerQuoteRef: r.manufacturer_quote_ref, manufacturerOrderRef: r.manufacturer_order_ref,
  handedOffAt: r.handed_off_at, manufacturerAckAt: r.manufacturer_ack_at,
  updatedAt: r.updated_at,
});

// GET /api/ops/enquiries — filterable list, newest first.
ops.get("/enquiries", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const q = c.req.query();
  const where: string[] = []; const binds: unknown[] = [];
  const eq = (param: string, col: string) => { if (q[param]) { where.push(`e.${col} = ?`); binds.push(q[param]); } };
  eq("intent", "intent"); eq("status", "workflow_status"); eq("state", "location_state");
  eq("contact", "contact_outcome"); eq("appointment", "appointment_status");
  eq("commercial", "commercial_outcome"); eq("assigned", "assigned_user");
  if (q.from) { where.push("e.created_at >= ?"); binds.push(q.from); }
  if (q.to) { where.push("e.created_at <= ?"); binds.push(q.to); }
  const sql = `SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.created_at DESC LIMIT 300`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ enquiries: results.map(enquiryRowDto) });
});

// GET /api/ops/enquiries/:id — full lead + attribution + activity trail.
ops.get("/enquiries/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const e = await c.env.DB.prepare(
    "SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user WHERE e.id = ?",
  ).bind(c.req.param("id")).first<any>();
  if (!e) return c.json({ error: "not_found" }, 404);
  const { results: activity } = await c.env.DB.prepare(
    "SELECT a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor WHERE a.entity_type = 'enquiry' AND a.entity_id = ? ORDER BY a.occurred_at DESC",
  ).bind(c.req.param("id")).all();
  return c.json({ enquiry: enquiryDetailDto(e), activity });
});

// PATCH /api/ops/enquiries/:id — assign, move any status dimension, reconcile with
// a downstream AMJ quote/order, or acknowledge the handoff. source_owner is never
// settable here (server-owned).
ops.patch("/enquiries/:id", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT id FROM enquiry WHERE id = ?").bind(id).first();
  if (!exists) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const sets: string[] = []; const binds: unknown[] = [];
  const dim = (key: string, col: string) => {
    if (body?.[key] !== undefined && ENQUIRY_DIMENSIONS[col].includes(String(body[key]))) { sets.push(`${col} = ?`); binds.push(String(body[key])); }
  };
  dim("workflowStatus", "workflow_status");
  dim("contactOutcome", "contact_outcome");
  dim("appointmentStatus", "appointment_status");
  dim("commercialOutcome", "commercial_outcome");
  if (body?.assignedUser !== undefined) { sets.push("assigned_user = ?"); binds.push(body.assignedUser ? String(body.assignedUser) : null); }
  if (body?.manufacturerQuoteRef !== undefined) { sets.push("manufacturer_quote_ref = ?"); binds.push(String(body.manufacturerQuoteRef).trim().slice(0, 120) || null); }
  if (body?.manufacturerOrderRef !== undefined) { sets.push("manufacturer_order_ref = ?"); binds.push(String(body.manufacturerOrderRef).trim().slice(0, 120) || null); }
  if (body?.manufacturerAck === true) sets.push("manufacturer_ack_at = datetime('now')");
  if (!sets.length) return c.json({ error: "no_changes" }, 400);

  sets.push("updated_at = datetime('now')");
  await c.env.DB.prepare(`UPDATE enquiry SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();
  await logEvent(c.env, { actor: staff.id, entityType: "enquiry", entityId: id, action: "updated enquiry" });
  const fresh = await c.env.DB.prepare(
    "SELECT e.*, u.name AS assigned_name FROM enquiry e LEFT JOIN user u ON u.id = e.assigned_user WHERE e.id = ?",
  ).bind(id).first<any>();
  return c.json({ enquiry: enquiryDetailDto(fresh) });
});

// POST /api/ops/enquiries/:id/contact-log — record a contact attempt/outcome.
ops.post("/enquiries/:id/contact-log", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const outcome = ENQUIRY_DIMENSIONS.contact_outcome.includes(String(body?.outcome)) ? String(body.outcome) : "attempted";
  const note = String(body?.note ?? "").trim().slice(0, 500);
  const res = await c.env.DB.prepare("UPDATE enquiry SET contact_outcome = ?, updated_at = datetime('now') WHERE id = ?").bind(outcome, id).run();
  if (!res.meta.changes) return c.json({ error: "not_found" }, 404);
  await logEvent(c.env, { actor: staff.id, entityType: "enquiry", entityId: id, action: `contact ${outcome}${note ? `: ${note}` : ""}` });
  return c.json({ ok: true, contactOutcome: outcome });
});

// GET /api/ops/search?q= — omnibox across projects, orders, orgs, customers.
ops.get("/search", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 2) return c.json({ results: [] });
  const like = `%${q}%`;
  const projects = (await c.env.DB.prepare("SELECT id, title, status_customer FROM project WHERE title LIKE ? LIMIT 8").bind(like).all()).results;
  const orders = (await c.env.DB.prepare('SELECT id, order_no, stage FROM "order" WHERE order_no LIKE ? LIMIT 8').bind(like).all()).results;
  const orgs = (await c.env.DB.prepare("SELECT id, name FROM organisation WHERE name LIKE ? LIMIT 8").bind(like).all()).results;
  const customers = (await c.env.DB.prepare("SELECT id, name, email FROM user WHERE type = 'customer' AND (name LIKE ? OR email LIKE ?) LIMIT 8").bind(like, like).all()).results;
  return c.json({
    results: [
      ...projects.map((p: any) => ({ type: "project", id: p.id, label: p.title ?? "Untitled", hint: p.status_customer })),
      ...orders.map((o: any) => ({ type: "order", id: o.id, label: o.order_no, hint: o.stage })),
      ...orgs.map((o: any) => ({ type: "organisation", id: o.id, label: o.name, hint: "organisation" })),
      ...customers.map((u: any) => ({ type: "customer", id: u.id, label: u.name ?? u.email, hint: u.email })),
    ],
  });
});
