// /api — quote lifecycle: submit (customer), issue revision (staff seam),
// list revisions (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject } from "../lib/access";
import { resolveStaff } from "../lib/staff";
import { isEmail, normEmail, resolveUser } from "../lib/auth";
import { createOrderFromRevision, orderDto, type OrderRow } from "../lib/orders";
import { issueRevision } from "../lib/revisions";
import { logEvent } from "../lib/activity";
import { notify } from "../lib/email";
import { uuid } from "../lib/util";

export const quote = new Hono<{ Bindings: Env }>();

// GET /api/projects/:id/clarifications — clarification thread for the customer.
quote.get("/projects/:id/clarifications", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT cm.body, cm.created_at, u.name AS author, u.type AS author_type FROM comment cm LEFT JOIN user u ON u.id = cm.author_id WHERE cm.project_id = ? AND cm.kind = 'clarification' ORDER BY cm.created_at ASC")
    .bind(p.id).all();
  return c.json({ status: p.status_customer, clarifications: results });
});

// POST /api/projects/:id/clarification-reply { message } — customer responds; back to review.
quote.post("/projects/:id/clarification-reply", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  if (p.status_customer !== "needs_information") return c.json({ error: "invalid_state" }, 409);
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return c.json({ error: "empty" }, 400);
  const user = await resolveUser(c.env, c.req.raw);
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment (id, project_id, author_id, kind, body)
       SELECT ?, ?, ?, 'clarification', ?
        WHERE EXISTS (
          SELECT 1 FROM project WHERE id=? AND status_customer='needs_information'
            AND status_internal='customer_clarification_required'
        )`,
    ).bind(uuid(), p.id, user?.id ?? p.owner_user_id, message, p.id),
    c.env.DB.prepare(
      `UPDATE project SET status_customer='under_review', status_internal='estimator_assigned',
          updated_at=datetime('now')
        WHERE id=? AND status_customer='needs_information'
          AND status_internal='customer_clarification_required'`,
    ).bind(p.id),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "invalid_state" }, 409);
  }
  await logEvent(c.env, { actor: user?.id ?? "customer", entityType: "project", entityId: p.id, action: "customer answered clarification" });
  await notify(c.env, { recipient: "ops", eventType: "clarification.answered", channel: "inbox", templateKey: "clarification_answered" });
  return c.json({ ok: true, status: "under_review" });
});

// POST /api/projects/:id/submit { contact:{ name, email, phone?, suburb? } } —
// customer submits the draft for review. The server is the authority on whether a
// project may progress: it re-validates state, line readiness, code uniqueness and
// contact details (the client's checks are advisory only) and persists the contact
// so anonymous submissions carry a durable identity for staff.
quote.post("/projects/:id/submit", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  if (p.status_customer !== "draft") {
    return c.json({ error: "invalid_state", status: p.status_customer }, 409);
  }
  const submitState = await c.env.DB.prepare(
    `SELECT ai_generation, quote_edit_version FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM file_asset
           WHERE project_id=project.id AND virus_status='pending'
        )`,
  ).bind(p.id).first<{ ai_generation: number; quote_edit_version: number }>();
  if (!submitState) return c.json({ error: "invalid_state" }, 409);
  // Registered-user AI is part of the estimate, not a background decoration.
  // Do not freeze a cart while its current document generation is still queued
  // or processing. The proposal publisher independently requires draft status,
  // closing the reverse race as well.
  let aiFallbackToHuman = false;
  if (p.owner_user_id) {
    // D1 is the durable job authority. The debounce KV marker is deliberately
    // not a submission lock: it can outlive a terminal Cloudflare 429.
    const running = await c.env.DB.prepare(
      `SELECT 1 AS pending FROM ai_job_claim j
        JOIN project p ON p.id=j.project_id AND p.ai_generation=j.source_generation
       WHERE j.project_id=? AND j.status IN ('scheduled','processing') LIMIT 1`,
    ).bind(p.id).first<{ pending: number }>().catch(() => null);
    if (running) return c.json({ error: "ai_processing" }, 409);
    const generation = submitState.ai_generation;
    if (generation > 0) {
      const terminal = await c.env.DB.prepare(
        "SELECT status, failure_class FROM ai_job_claim WHERE project_id=? AND source_generation=?",
      ).bind(p.id, generation).first<{ status: string; failure_class: string | null }>();
      aiFallbackToHuman = terminal?.status === "failed" && terminal.failure_class === "quota";
      if (terminal?.status !== "completed" && !aiFallbackToHuman) {
        return c.json({ error: "ai_failed" }, 409);
      }
    }
  }

  const body = await c.req.json().catch(() => ({}));
  const contact = (body?.contact && typeof body.contact === "object" ? body.contact : {}) as Record<string, unknown>;
  const contactName = String(contact.name ?? "").trim();
  const contactEmail = normEmail(contact.email);
  const contactPhone = String(contact.phone ?? "").trim();
  const suburb = String(contact.suburb ?? "").trim();
  if (!contactName || !isEmail(contactEmail)) {
    return c.json({ error: "missing_contact" }, 400);
  }

  const { results: lines } = await c.env.DB
    .prepare(`SELECT external_ref, status, line_total, origin, ai_proposal_line_id, review_json
                FROM quote_line WHERE project_id = ? AND revision_id IS NULL`)
    .bind(p.id).all<{
      external_ref: string | null; status: string; line_total: number | null;
      origin: string | null; ai_proposal_line_id: string | null; review_json: string | null;
    }>();
  // A provider capacity failure must not deadlock a registered customer's
  // conversion. Their clean source documents are the human review payload even
  // when AI could not create cart lines on this attempt.
  if (lines.length === 0 && !aiFallbackToHuman) return c.json({ error: "empty_quote" }, 400);
  // 'ready' and 'technical_review' may both be submitted: a technical_review line
  // is priced and is exactly what submission escalates to an technician (e.g.
  // timber→aluminium substitution, a composite unit for an out-of-range opening).
  // Only customer-fixable gaps ('incomplete' / unpriced) block submission.
  const reviewableCustomerAiEdit = (line: typeof lines[number]) => {
    if (!p.owner_user_id || (line.origin !== "ai" && !line.ai_proposal_line_id) ||
        line.status !== "technical_review" || line.line_total != null) return false;
    try {
      const review = JSON.parse(line.review_json ?? "{}");
      return !!review?.customerConfigurationChanged;
    } catch {
      return false;
    }
  };
  if (lines.some((l) =>
    ((l.status !== "ready" && l.status !== "technical_review") || l.line_total == null) &&
    !reviewableCustomerAiEdit(l))) {
    return c.json({ error: "incomplete_lines" }, 400);
  }
  const codes = lines.map((l) => (l.external_ref ?? "").trim().toUpperCase()).filter(Boolean);
  if (new Set(codes).size !== codes.length) return c.json({ error: "duplicate_codes" }, 400);

  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE project SET status_customer = 'submitted', status_internal = 'submitted',
         contact_name = ?, contact_email = ?, contact_phone = ?, delivery_suburb = ?,
         updated_at = datetime('now')
        WHERE id = ? AND status_customer='draft'
           AND ai_generation=?
           AND quote_edit_version=?
           AND quote_mutation_token IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM file_asset
              WHERE project_id=project.id AND virus_status='pending'
           )
          AND (
            owner_user_id IS NULL OR ai_generation=0 OR EXISTS (
              SELECT 1 FROM ai_job_claim current_job
               WHERE current_job.project_id=project.id
                 AND current_job.source_generation=project.ai_generation
                 AND (
                   current_job.status='completed' OR
                   (current_job.status='failed' AND current_job.failure_class='quota')
                 )
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM ai_job_claim j
             WHERE j.project_id=project.id AND j.source_generation=project.ai_generation
               AND j.status IN ('scheduled','processing')
          )`,
    ).bind(
      contactName, contactEmail, contactPhone || null, suburb || null, p.id,
      submitState.ai_generation, submitState.quote_edit_version,
    ),
    // Backfill the signed-in user's profile from the contact when it's still blank.
    c.env.DB.prepare(
      "UPDATE user SET name = COALESCE(NULLIF(name, ''), ?), phone = COALESCE(NULLIF(phone, ''), ?) WHERE id = ?",
    ).bind(contactName, contactPhone || null, p.owner_user_id ?? "__anonymous_no_user__"),
  ]);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "ai_processing" }, 409);
  }

  // Notify customer + internal queue that the quote is in for review, and include
  // the uploaded schedule (name) so the reviewer knows the source is attached.
  try {
    const sched = await c.env.DB
      .prepare("SELECT filename FROM file_asset WHERE project_id = ? AND kind = 'schedule' ORDER BY created_at DESC LIMIT 1")
      .bind(p.id).first<{ filename: string }>();
    const ref = p.public_ref ?? p.id;
    const origin = new URL(c.req.url).origin;
    const fileLine = sched ? `\nUploaded schedule: ${sched.filename} (attached to this quote for technical review)` : "";
    await notify(c.env, {
      recipient: contactEmail, eventType: "quote.submitted", templateKey: "quote_submitted",
      email: { to: contactEmail, subject: `We've received your quote ${ref}`,
        text: `Hi ${contactName},\n\nThanks — your quote ${ref} is in for technical review.${fileLine}\n\nTrack it any time at ${origin}/track-order using reference ${ref} and this email address.\n\n— OpenFrame` },
    });
    const internalTo = c.env.ENQUIRY_INTERNAL_TO || c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
    await notify(c.env, {
      recipient: internalTo, eventType: "quote.submitted.internal", templateKey: "quote_submitted_internal",
      email: { to: internalTo, subject: `New quote submitted ${ref}`,
        text: `${ref} submitted for technical review.\nCustomer: ${contactName} <${contactEmail}>${fileLine}\n\nOpen the ops console → this project to review the schedule and lines.` },
    });
  } catch (e) {
    console.log(`[submit] notify failed: ${String(e)}`);
  }

  return c.json({ id: p.id, status: "submitted" });
});

// POST /api/projects/:id/issue-revision — STAFF seam (shared with the ops console).
quote.post("/projects/:id/issue-revision", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!["estimator", "manager", "admin"].includes(staff.role ?? "")) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  const rev = await issueRevision(c.env, c.req.param("id"));
  if (!rev.ok) return c.json({ error: rev.error }, rev.error === "not_found" ? 404 : 409);
  return c.json({ id: rev.id, revisionNo: rev.revisionNo, total: rev.total });
});

// GET /api/projects/:id/revisions — customer view of issued revisions.
quote.get("/projects/:id/revisions", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT id, revision_no, snapshot_status, totals_json, issued_at, accepted_at FROM quote_revision WHERE project_id = ? ORDER BY revision_no DESC")
    .bind(p.id).all<{ id: string; revision_no: number; snapshot_status: string; totals_json: string; issued_at: string; accepted_at: string | null }>();
  const revisions = await Promise.all(results.map(async (r) => {
    const { results: rl } = await c.env.DB
      .prepare("SELECT external_ref, room_label, product_snapshot_json, dims_json, qty, line_total FROM revision_line WHERE revision_id = ?")
      .bind(r.id).all();
    return {
      id: r.id, revisionNo: r.revision_no, status: r.snapshot_status,
      total: safeParse(r.totals_json).total ?? 0, issuedAt: r.issued_at, acceptedAt: r.accepted_at,
      lines: rl,
    };
  }));
  return c.json({ revisions });
});

// POST /api/revisions/:id/request-changes { message } — the customer declines the
// issued revision and asks for changes. Honest state move: the project returns to
// "Under review" (the revision itself stays on file, immutable) and we issue a
// fresh revision. The accept guard below stops a stale client accepting afterwards.
quote.post("/revisions/:id/request-changes", async (c) => {
  const revisionId = c.req.param("id");
  const rev = await c.env.DB.prepare("SELECT id, project_id, snapshot_status FROM quote_revision WHERE id = ?").bind(revisionId).first<{ id: string; project_id: string; snapshot_status: string }>();
  if (!rev) return c.json({ error: "not_found" }, 404);
  const p = await ownedProject(c.env, c.req.raw, rev.project_id);
  if (!p) return c.json({ error: "not_found" }, 404);
  if (rev.snapshot_status !== "issued" || p.status_customer !== "quote_issued") {
    return c.json({ error: "invalid_state", status: p.status_customer }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  if (!message) return c.json({ error: "empty" }, 400);
  const user = await resolveUser(c.env, c.req.raw);
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment (id, project_id, author_id, kind, body)
       SELECT ?, ?, ?, 'clarification', ?
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND status_customer='quote_issued' AND status_internal='issued'
             AND current_revision_id=?
        )
          AND EXISTS (
            SELECT 1 FROM quote_revision
             WHERE id=? AND project_id=? AND snapshot_status='issued'
          )`,
    ).bind(
      uuid(), p.id, user?.id ?? p.owner_user_id,
      `Change request on issued quote: ${message}`,
      p.id, revisionId, revisionId, p.id,
    ),
    c.env.DB.prepare(
      `UPDATE project SET status_customer='under_review',
          status_internal='estimator_assigned', updated_at=datetime('now')
        WHERE id=? AND status_customer='quote_issued' AND status_internal='issued'
          AND current_revision_id=?
          AND EXISTS (
            SELECT 1 FROM quote_revision
             WHERE id=? AND project_id=? AND snapshot_status='issued'
          )`,
    ).bind(p.id, revisionId, revisionId, p.id),
    c.env.DB.prepare(
      `UPDATE quote_revision SET snapshot_status='superseded'
        WHERE id=? AND project_id=? AND snapshot_status='issued'
          AND EXISTS (
            SELECT 1 FROM project
             WHERE id=? AND status_customer='under_review'
               AND status_internal='estimator_assigned'
               AND current_revision_id=?
          )`,
    ).bind(revisionId, p.id, p.id, revisionId),
    c.env.DB.prepare(
      `UPDATE project SET current_revision_id=NULL
        WHERE id=? AND status_customer='under_review'
          AND status_internal='estimator_assigned'
          AND current_revision_id=?
          AND EXISTS (
            SELECT 1 FROM quote_revision
             WHERE id=? AND project_id=? AND snapshot_status='superseded'
          )`,
    ).bind(p.id, revisionId, revisionId, p.id),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[2]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[3]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "invalid_state" }, 409);
  }
  await logEvent(c.env, { actor: user?.id ?? "customer", entityType: "project", entityId: p.id, action: "customer requested changes on issued quote" });
  await notify(c.env, { recipient: "ops", eventType: "quote.changes_requested", channel: "inbox", templateKey: "quote_changes_requested" });
  return c.json({ ok: true, status: "under_review" });
});

// POST /api/revisions/:id/accept — customer accepts an issued revision.
quote.post("/revisions/:id/accept", async (c) => {
  const revisionId = c.req.param("id");
  const rev = await c.env.DB.prepare("SELECT id, project_id, snapshot_status FROM quote_revision WHERE id = ?").bind(revisionId).first<{ id: string; project_id: string; snapshot_status: string }>();
  if (!rev) return c.json({ error: "not_found" }, 404);
  const proj = await ownedProject(c.env, c.req.raw, rev.project_id);
  if (!proj) return c.json({ error: "not_found" }, 404);
  // The revision must be live AND the project still awaiting acceptance — after a
  // change request (project back to under_review) the old revision is not acceptable.
  if (rev.snapshot_status !== "issued" || proj.status_customer !== "quote_issued") return c.json({ error: "not_acceptable" }, 409);

  // The claim (issued -> accepted) and the order creation happen in ONE atomic
  // batch (see createOrderFromRevision). Only the winning caller gets an order;
  // concurrent duplicates and any mid-flight failure roll back to a re-acceptable
  // revision, so an accepted revision can never be left without an order.
  const orderId = await createOrderFromRevision(c.env, revisionId, rev.project_id);
  if (!orderId) return c.json({ error: "not_acceptable" }, 409);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(orderId).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, order!) });
});

function safeParse(s: string): Record<string, any> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
