// /api/ops — internal ops console API (staff-gated).
//
// O1: staff auth (domain-allowlisted internal OTP for dev; Cloudflare Access in
// prod), identity, and a dashboard summary. Queues, the quote workspace,
// approvals, etc. land in O2+.
import { Hono } from "hono";
import type { Env } from "../types";
import {
  clearCookie, consumeChallenge, createSession, destroySession, isEmail,
  normEmail, sessionCookie, sixDigit, storeChallenge, userDto,
} from "../lib/auth";
import { notify } from "../lib/email";
import { findOrCreateInternalUser, isStaffEmail, resolveStaff } from "../lib/staff";
import { issueRevision } from "../lib/revisions";
import { logEvent } from "../lib/activity";
import { uuid } from "../lib/util";
import { getProductBySlug } from "../../src/data/catalogue";
import { priceConfigured } from "../../src/data/configurator";

export const ops = new Hono<{ Bindings: Env }>();

// Internal workflow state machine (status_internal). 'issued' is reached via
// issue-revision; 'customer_clarification_required' via request-clarification.
const FLOW: Record<string, string[]> = {
  submitted: ["triage_pending", "estimator_assigned", "customer_clarification_required"],
  triage_pending: ["estimator_assigned", "customer_clarification_required"],
  estimator_assigned: ["technical_review_required", "approved_for_issue", "customer_clarification_required"],
  technical_review_required: ["estimator_assigned", "approved_for_issue", "customer_clarification_required"],
  approved_for_issue: ["issued", "estimator_assigned"],
  customer_clarification_required: ["estimator_assigned"],
};

export const STATUS_INTERNAL_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", triage_pending: "Awaiting triage",
  estimator_assigned: "Assigned", technical_review_required: "Technical review",
  approval_pending: "Approval pending", approved_for_issue: "Ready to issue",
  customer_clarification_required: "Awaiting customer", issued: "Quote issued",
};

const safeParse = (s: string): Record<string, any> => {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};

interface LineRow {
  id: string; external_ref: string | null; room_label: string | null; product_slug: string;
  options_json: string; dims_json: string; measured_by: string; qty: number; line_total: number | null; status: string;
}

const opsLineDto = (r: LineRow) => {
  const dims = safeParse(r.dims_json);
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
  };
};

// POST /api/ops/auth/challenge { email } — allowlisted staff only; neutral otherwise.
ops.post("/auth/challenge", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  if (isEmail(email) && isStaffEmail(c.env, email)) {
    const code = sixDigit();
    await storeChallenge(c.env, email, code);
    await notify(c.env, {
      recipient: email,
      eventType: "ops.code.requested",
      templateKey: "ops_signin_code",
      email: { to: email, subject: "Your AMJ ops sign-in code", text: `Your ops console code is ${code}. It expires in 10 minutes.` },
    });
    if (c.env.APP_ENV !== "production") return c.json({ ok: true, devCode: code });
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
  c.header("Set-Cookie", clearCookie("amj_session", c.env));
  return c.json({ ok: true });
});

// GET /api/ops/me — the acting staff member, or 401.
ops.get("/me", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ authenticated: false, user: null }, 401);
  return c.json({ authenticated: true, user: userDto(staff) });
});

// GET /api/ops/summary — dashboard counts (staff-gated).
ops.get("/summary", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);

  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM project WHERE status_customer = 'submitted')                       AS submissions,
      (SELECT count(*) FROM project WHERE status_customer = 'under_review')                    AS in_review,
      (SELECT count(*) FROM "order" WHERE stage NOT IN ('after_sales','cancelled'))            AS active_orders,
      (SELECT count(*) FROM "order" WHERE stage IN ('deposit_invoiced','balance_invoiced'))    AS awaiting_payment,
      (SELECT count(*) FROM organisation)                                                       AS organisations,
      (SELECT count(*) FROM user WHERE type = 'customer')                                       AS customers
  `).first<Record<string, number>>();

  return c.json({
    submissions: row?.submissions ?? 0,
    inReview: row?.in_review ?? 0,
    activeOrders: row?.active_orders ?? 0,
    awaitingPayment: row?.awaiting_payment ?? 0,
    organisations: row?.organisations ?? 0,
    customers: row?.customers ?? 0,
    approvalsPending: 0, // approvals engine lands in O4
  });
});

// GET /api/ops/queues/submissions — projects awaiting triage / review.
ops.get("/queues/submissions", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const { results } = await c.env.DB.prepare(`
    SELECT p.id, p.title, p.status_customer, p.status_internal, p.updated_at,
           o.name AS org_name, u.name AS customer_name, u.email AS customer_email,
           io.name AS assignee_name,
           (SELECT count(*) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL) AS item_count,
           (SELECT COALESCE(SUM(line_total), 0) FROM quote_line WHERE project_id = p.id AND revision_id IS NULL) AS total
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

  const { results: lines } = await c.env.DB.prepare("SELECT * FROM quote_line WHERE project_id = ? AND revision_id IS NULL ORDER BY position").bind(id).all<LineRow>();
  const { results: files } = await c.env.DB.prepare("SELECT id, kind, filename, size, virus_status, created_at FROM file_asset WHERE project_id = ? ORDER BY created_at DESC").bind(id).all();
  const { results: revisions } = await c.env.DB.prepare("SELECT id, revision_no, snapshot_status, totals_json, issued_at, accepted_at FROM quote_revision WHERE project_id = ? ORDER BY revision_no DESC").bind(id).all<any>();
  const { results: comments } = await c.env.DB.prepare("SELECT cm.id, cm.line_id, cm.kind, cm.body, cm.created_at, u.name AS author FROM comment cm LEFT JOIN user u ON u.id = cm.author_id WHERE cm.project_id = ? ORDER BY cm.created_at DESC").bind(id).all();
  const { results: activity } = await c.env.DB.prepare("SELECT a.action, a.occurred_at, COALESCE(u.name, a.actor) AS actor FROM audit_event a LEFT JOIN user u ON u.id = a.actor WHERE a.entity_type = 'project' AND a.entity_id = ? ORDER BY a.occurred_at DESC").bind(id).all();

  return c.json({
    project: {
      id: p.id, title: p.title ?? "Untitled project",
      statusCustomer: p.status_customer, statusInternal: p.status_internal,
      statusInternalLabel: STATUS_INTERNAL_LABEL[p.status_internal] ?? p.status_internal,
      nextStates: FLOW[p.status_internal] ?? [],
      org: p.org_name, customerName: p.customer_name, customerEmail: p.customer_email,
      assignee: p.assignee_name, internalOwnerId: p.internal_owner_id,
      updatedAt: p.updated_at,
    },
    lines: lines.map(opsLineDto),
    files,
    revisions: revisions.map((r: any) => ({ id: r.id, revisionNo: r.revision_no, status: r.snapshot_status, total: safeParse(r.totals_json).total ?? 0, issuedAt: r.issued_at, acceptedAt: r.accepted_at })),
    comments,
    activity,
  });
});

// POST /api/ops/projects/:id/assign { userId? } — claim/assign the quote.
ops.post("/projects/:id/assign", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  const body = await c.req.json().catch(() => ({}));
  const targetId = typeof body?.userId === "string" && body.userId ? body.userId : staff.id;
  const res = await c.env.DB.prepare(
    "UPDATE project SET internal_owner_id = ?, status_internal = 'estimator_assigned', updated_at = datetime('now') WHERE id = ?",
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
  const project = await c.env.DB.prepare("SELECT status_internal FROM project WHERE id = ?").bind(id).first<{ status_internal: string }>();
  if (!project) return c.json({ error: "not_found" }, 404);
  // 'issued' / 'customer_clarification_required' have dedicated endpoints.
  if (target === "issued" || target === "customer_clarification_required" || !(FLOW[project.status_internal] ?? []).includes(target)) {
    return c.json({ error: "invalid_transition", from: project.status_internal }, 409);
  }
  await c.env.DB.prepare("UPDATE project SET status_internal = ?, updated_at = datetime('now') WHERE id = ?").bind(target, id).run();
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

  const cust = await c.env.DB.prepare("SELECT u.email FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO comment (id, project_id, author_id, kind, body) VALUES (?, ?, ?, 'clarification', ?)").bind(uuid(), id, staff.id, message),
    c.env.DB.prepare("UPDATE project SET status_customer = 'needs_information', status_internal = 'customer_clarification_required', updated_at = datetime('now') WHERE id = ?").bind(id),
  ]);
  await logEvent(c.env, { actor: staff.id, entityType: "project", entityId: id, action: "requested clarification" });
  if (cust?.email) {
    await notify(c.env, { recipient: cust.email, eventType: "clarification.requested", templateKey: "needs_info",
      email: { to: cust.email, subject: "We need a bit more info on your quote", text: message } });
  }
  return c.json({ ok: true, statusInternal: "customer_clarification_required", statusInternalLabel: STATUS_INTERNAL_LABEL.customer_clarification_required });
});

// PATCH /api/ops/lines/:id — estimator edits a draft line; server reprices.
ops.patch("/lines/:id", async (c) => {
  if (!(await resolveStaff(c.env, c.req.raw))) return c.json({ error: "forbidden" }, 403);
  const line = await c.env.DB.prepare("SELECT * FROM quote_line WHERE id = ? AND revision_id IS NULL").bind(c.req.param("id")).first<LineRow>();
  if (!line) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));

  const dims = safeParse(line.dims_json);
  const width = body?.width !== undefined ? String(body.width) : String(dims.width ?? "");
  const height = body?.height !== undefined ? String(body.height) : String(dims.height ?? "");
  const options = body?.options && typeof body.options === "object" ? body.options : safeParse(line.options_json);
  const qty = body?.qty !== undefined ? Math.max(1, Math.floor(Number(body.qty) || 1)) : line.qty;
  const code = body?.code !== undefined ? String(body.code) : line.external_ref;
  const room = body?.room !== undefined ? String(body.room) : line.room_label;

  const priced = priceConfigured({ productSlug: line.product_slug, width, height, options, qty });
  const lineTotal = priced.ok ? priced.total : null;
  const status = priced.ok ? "ready" : "incomplete";

  await c.env.DB.prepare(
    "UPDATE quote_line SET dims_json = ?, options_json = ?, qty = ?, external_ref = ?, room_label = ?, line_total = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
  ).bind(JSON.stringify({ width, height }), JSON.stringify(options), qty, code || null, room || null, lineTotal, status, line.id).run();

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
  const id = c.req.param("id");
  const rev = await issueRevision(c.env, id);
  if (!rev) return c.json({ error: "not_found" }, 404);
  await logEvent(c.env, { actor: staff?.id, entityType: "project", entityId: id, action: `issued revision ${rev.revisionNo}` });
  const cust = await c.env.DB.prepare("SELECT u.email FROM project p JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?").bind(id).first<{ email: string }>();
  if (cust?.email) {
    await notify(c.env, {
      recipient: cust.email, eventType: "revision.issued", templateKey: "quote_issued",
      email: { to: cust.email, subject: "Your AMJ quote is ready", text: `Your reviewed quote (revision ${rev.revisionNo}) is ready to review and accept.` },
    });
  }
  return c.json(rev);
});
