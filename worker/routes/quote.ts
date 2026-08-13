// /api — quote lifecycle: submit (customer), issue revision (staff seam),
// list revisions (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject } from "../lib/access";
import { resolveStaff } from "../lib/staff";
import { isEmail, normEmail, resolveUser } from "../lib/auth";
import { createOrderFromRevision, orderDto, depositOf, balanceOf, type OrderRow } from "../lib/orders";
import { issueRevision } from "../lib/revisions";
import { logEvent } from "../lib/activity";
import { notify } from "../lib/email";
import { uuid } from "../lib/util";
import { deliveryCost, loadProjectAreaM2, loadZonesAndRanges, normalisePostcode, resolveZone, zoneIsPriced } from "../lib/delivery";

export const quote = new Hono<{ Bindings: Env }>();

function reconciliationReviewNote(lines: {
  external_ref: string | null;
  review_json: string | null;
  origin: string | null;
  ai_proposal_line_id: string | null;
}[]): string | null {
  const notes = new Set<string>();
  for (const line of lines) {
    if (line.origin !== "ai" && !line.ai_proposal_line_id) continue;
    let review: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(line.review_json ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) review = parsed;
    } catch { /* unreadable review data contributes no note */ }
    for (const key of ["energyMapping", "composite"] as const) {
      const value = typeof review[key] === "string" ? review[key].trim().slice(0, 1000) : "";
      if (!value) continue;
      notes.add(line.external_ref && !value.startsWith(`${line.external_ref}:`)
        ? `${line.external_ref}: ${value}`
        : value);
    }
  }
  if (!notes.size) return null;
  return `Automatic document reconciliation — human review required:\n${[...notes].map((note) => `- ${note}`).join("\n")}`.slice(0, 5000);
}

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
      // Re-arms the issue gate (C7) for the revision this reply leads to.
      // delivery_postcode is NOT cleared — the destination has not changed,
      // only the price of getting there. Without this the gate is armed once
      // per project, ever: R1's freight figure would issue on R2/R3/R4 no
      // matter how much the line set changed in between.
      `UPDATE project SET status_customer='under_review', status_internal='estimator_assigned',
          delivery_amount = NULL, delivery_note = NULL,
          delivery_settled_at = NULL, delivery_settle_json = NULL,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='needs_information'
          AND status_internal='customer_clarification_required'`,
    ).bind(p.id),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "invalid_state" }, 409);
  }
  await logEvent(c.env, { actor: user?.id ?? "customer", entityType: "project", entityId: p.id, action: "customer answered clarification" });
  const ref = p.public_ref ?? p.id;
  const cust = await c.env.DB.prepare(
    "SELECT COALESCE(u.name, p.contact_name) AS name FROM project p LEFT JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?",
  ).bind(p.id).first<{ name: string | null }>();
  const custName = cust?.name || "The customer";
  const internalTo = c.env.ENQUIRY_INTERNAL_TO || c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
  await notify(c.env, {
    recipient: internalTo, eventType: "clarification.answered", templateKey: "clarification_answered",
    vars: { ref, name: custName, message },
    email: { to: internalTo, subject: `Customer answered clarification — ${ref}`,
      text: `${custName} answered the clarification on quote ${ref}:\n\n${message}\n\nOpen the ops console → this project to continue the review.` },
  });
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
    `SELECT ai_generation, quote_edit_version,
        (SELECT count(*) FROM file_asset
          WHERE project_id=project.id AND virus_status='clean') AS clean_file_count
       FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM file_asset
           WHERE project_id=project.id AND virus_status='pending'
        )`,
  ).bind(p.id).first<{
    ai_generation: number; quote_edit_version: number; clean_file_count: number;
  }>();
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
      // AI is the preferred first pass, not a conversion deadlock. Any terminal
      // AI failure may fall back to human review when a clean source document
      // remains; the empty-payload guard below still prevents blank submissions.
      aiFallbackToHuman = terminal?.status === "failed";
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
  // The postcode is required at submit, inside this same form — no new step,
  // no new screen (D7/D8). Distinct codes for missing vs malformed so the
  // customer-facing message can say which: a customer who typed "300" and one
  // who typed nothing get different sentences on the review screen.
  const rawPostcode = typeof contact.postcode === "string" ? contact.postcode.trim() : "";
  if (!rawPostcode) return c.json({ error: "missing_postcode" }, 400);
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) return c.json({ error: "invalid_postcode" }, 400);

  const { results: lines } = await c.env.DB
    .prepare(`SELECT external_ref, status, line_total, origin, ai_proposal_line_id, review_json
                FROM quote_line WHERE project_id = ? AND revision_id IS NULL`)
    .bind(p.id).all<{
      external_ref: string | null; status: string; line_total: number | null;
      origin: string | null; ai_proposal_line_id: string | null; review_json: string | null;
    }>();
  // A terminal AI failure must not deadlock a registered customer's conversion.
  // Their clean source documents are the human-review payload even when AI could
  // not create cart lines on this attempt.
  if (lines.length === 0 && (!aiFallbackToHuman || submitState.clean_file_count === 0)) {
    return c.json({ error: "empty_quote" }, 400);
  }
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
  const reviewNote = reconciliationReviewNote(lines);

  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE project SET status_customer = 'submitted', status_internal = 'submitted',
         contact_name = ?, contact_email = ?, contact_phone = ?, delivery_suburb = ?,
         delivery_postcode = ?,
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
            EXISTS (
              SELECT 1 FROM quote_line
               WHERE project_id=project.id AND revision_id IS NULL
            ) OR EXISTS (
              SELECT 1 FROM file_asset
               WHERE project_id=project.id AND virus_status='clean'
            )
          )
          AND (
            owner_user_id IS NULL OR ai_generation=0 OR EXISTS (
              SELECT 1 FROM ai_job_claim current_job
               WHERE current_job.project_id=project.id
                 AND current_job.source_generation=project.ai_generation
                 AND (
                   current_job.status='completed' OR
                   current_job.status='failed'
                 )
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM ai_job_claim j
             WHERE j.project_id=project.id AND j.source_generation=project.ai_generation
               AND j.status IN ('scheduled','processing')
          )`,
    ).bind(
      contactName, contactEmail, contactPhone || null, suburb || null, postcode, p.id,
      submitState.ai_generation, submitState.quote_edit_version,
    ),
    // Backfill the signed-in user's profile from the contact when it's still blank.
    c.env.DB.prepare(
      "UPDATE user SET name = COALESCE(NULLIF(name, ''), ?), phone = COALESCE(NULLIF(phone, ''), ?) WHERE id = ?",
    ).bind(contactName, contactPhone || null, p.owner_user_id ?? "__anonymous_no_user__"),
  ]);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1) {
    const payload = await c.env.DB.prepare(
      `SELECT 1 AS present
         WHERE EXISTS (
           SELECT 1 FROM quote_line WHERE project_id=? AND revision_id IS NULL
         ) OR EXISTS (
           SELECT 1 FROM file_asset WHERE project_id=? AND virus_status='clean'
         )`,
    ).bind(p.id, p.id).first<{ present: number }>();
    if (!payload) return c.json({ error: "empty_quote" }, 400);
    return c.json({ error: "ai_processing" }, 409);
  }

  // Carry the same discrepancy text the customer saw into the staff review
  // thread at the moment the request is submitted. This is deliberately a note,
  // not a new workflow state or task.
  if (reviewNote) {
    await c.env.DB.prepare(
      "INSERT INTO comment (id, project_id, author_id, kind, body) VALUES (?, ?, ?, 'note', ?)",
    ).bind(uuid(), p.id, p.owner_user_id, reviewNote).run().catch((error) => {
      console.log(`[submit] reconciliation note failed: ${String(error)}`);
    });
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
    const reviewLine = reviewNote ? `\n\n${reviewNote}` : "";
    await notify(c.env, {
      recipient: contactEmail, eventType: "quote.submitted", templateKey: "quote_submitted",
      vars: { name: contactName, ref, scheduleNote: `${fileLine}${reviewLine}`, trackUrl: `${origin}/track-order` },
      email: { to: contactEmail, subject: `We've received your quote ${ref}`,
        text: `Hi ${contactName},\n\nThanks — your quote ${ref} is in for technical review.${fileLine}${reviewLine}\n\nTrack it any time at ${origin}/track-order using reference ${ref} and this email address.\n\n— OpenFrame` },
    });
    const internalTo = c.env.ENQUIRY_INTERNAL_TO || c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
    await notify(c.env, {
      recipient: internalTo, eventType: "quote.submitted.internal", templateKey: "quote_submitted_internal",
      vars: { ref, name: contactName, email: contactEmail, scheduleNote: `${fileLine}${reviewLine}` },
      email: { to: internalTo, subject: `New quote submitted ${ref}`,
        text: `${ref} submitted for technical review.\nCustomer: ${contactName} <${contactEmail}>${fileLine}${reviewLine}\n\nOpen the ops console → this project to review the schedule and lines.` },
    });
  } catch (e) {
    console.log(`[submit] notify failed: ${String(e)}`);
  }

  return c.json({ id: p.id, status: "submitted" });
});

// POST /api/projects/:id/delivery-estimate { postcode } — E9. A PREVIEW for the
// submit screen; writes nothing. Owner-scoped, the same guard as everything
// else on this project.
//
// Body carries the postcode, not a query string — an address is not a URL
// parameter (and never belongs in one, per this codebase's own privacy rule).
//
// THIS ENDPOINT MUST NEVER BE CALLED FROM THE BUILDER. Delivery must not enter
// the running estimate (D8) — the guard is T-A30 on quoteSummary, a test, not
// a comment, but the comment is here too because a route this easy to wire
// into the wrong screen deserves saying twice.
//
// Always 200 with `ok`, never a hard error for "the table isn't priced yet" —
// D9 says never show nothing, and a customer mid-submission should not see a
// broken form because a zone the owner hasn't priced happened to match. The
// one real error is a malformed postcode, which is a bad request, not an
// unpriced destination.
quote.post("/projects/:id/delivery-estimate", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const postcode = normalisePostcode(body?.postcode);
  if (!postcode) return c.json({ error: "invalid_postcode" }, 400);

  const [{ zones, ranges }, area] = await Promise.all([
    loadZonesAndRanges(c.env),
    loadProjectAreaM2(c.env, p.id),
  ]);
  const resolution = resolveZone(postcode, zones, ranges);
  if (!resolution.zone || !zoneIsPriced(resolution.zone)) {
    // Branch 4 — a deployment fault (the fallback itself has no rates), not a
    // business state. The release checklist keeps this off the customer-facing
    // release; if it is somehow reached anyway, the form degrades to no number
    // rather than an error the customer cannot act on.
    return c.json({ ok: false });
  }
  const zone = resolution.zone as { minCharge: number; ratePerSqm: number; maxCharge: number };
  return c.json({
    ok: true,
    amount: deliveryCost(area.areaM2, zone),
    zoneLabel: resolution.zone.label,
    conservative: resolution.basis !== "postcode_zone",
  });
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
    const total = safeParse(r.totals_json).total ?? 0;
    // One deposit percentage (0043), computed here rather than in the browser —
    // the same reason orders.ts computes it rather than the review screen.
    const deposit = depositOf(total);
    const balance = balanceOf(total);
    return {
      id: r.id, revisionNo: r.revision_no, status: r.snapshot_status,
      total, deposit, balance, issuedAt: r.issued_at, acceptedAt: r.accepted_at,
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
      // Re-arms the issue gate (C7). delivery_postcode survives — a customer
      // who writes "actually, deliver to Cairns" in the change request lands
      // here with the gate re-armed, staff correct the postcode via E7, and
      // the new figure freezes on R2. A destination change is a new
      // revision, never an edit to an issued one.
      `UPDATE project SET status_customer='under_review',
          status_internal='estimator_assigned',
          delivery_amount = NULL, delivery_note = NULL,
          delivery_settled_at = NULL, delivery_settle_json = NULL,
          updated_at=datetime('now')
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
  const ref = p.public_ref ?? p.id;
  const cust = await c.env.DB.prepare(
    "SELECT COALESCE(u.name, p.contact_name) AS name FROM project p LEFT JOIN user u ON u.id = p.owner_user_id WHERE p.id = ?",
  ).bind(p.id).first<{ name: string | null }>();
  const custName = cust?.name || "The customer";
  const internalTo = c.env.ENQUIRY_INTERNAL_TO || c.env.CONTACT_TO || c.env.EMAIL_FROM || "quotes@openframe.com.au";
  await notify(c.env, {
    recipient: internalTo, eventType: "quote.changes_requested", templateKey: "quote_changes_requested",
    vars: { ref, name: custName, message },
    email: { to: internalTo, subject: `Customer requested changes — ${ref}`,
      text: `${custName} requested changes on the issued quote ${ref}:\n\n${message}\n\nOpen the ops console → this project to revise and re-issue.` },
  });
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
