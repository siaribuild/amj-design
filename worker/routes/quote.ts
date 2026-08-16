// /api — quote lifecycle: submit (customer), issue the quote (staff seam), read
// the issued quote (customer), accept (customer -> creates order + deposit invoice).
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject } from "../lib/access";
import { resolveStaff } from "../lib/staff";
import { isEmail, normEmail, resolveUser } from "../lib/auth";
import { createOrderFromProject, orderDto, depositOf, balanceOf, type OrderRow } from "../lib/orders";
import { onOrderCreated } from "../lib/referrals";
import { issuedReferralBadge } from "../lib/referral-discount";
import { issueQuote } from "../lib/issue";
import { loadLines } from "./projects";
import { logEvent } from "../lib/activity";
import { notify } from "../lib/email";
import { uuid } from "../lib/util";
import { deliveryCost, loadProjectAreaM2, loadZonesAndRanges, normalisePostcode, resolveZone, zoneIsPriced } from "../lib/delivery";
import { lastReconcileRun } from "../lib/pricing-admin";

export const quote = new Hono<{ Bindings: Env }>();

// GET /api/catalogue/offerability — which products the quote builder must not
// offer, and why. PUBLIC and unauthenticated, like the catalogue it qualifies:
// the browser already fetches the whole published catalogue straight from
// Sanity's CDN, so a list of slugs that cannot be quoted reveals nothing the
// caller could not already see. No prices and no private data cross this line.
//
// It exists because the browser CANNOT compute this. Two of the five gaps live
// in D1 (a named rate card that does not exist, an option with no price row),
// which the client has no access to and must never be given. The estimator does
// not use this endpoint — it holds the real candidates and computes the same
// verdict live (estimator/select.ts), so only the browser pays for the snapshot.
//
// `checked: false` is NOT an empty list. It means the last reconcile could not
// read the catalogue at all, so nothing was verified; the client leaves the
// picker unfiltered rather than hiding every product on an infrastructure
// fault. Failing open is right here — the fail-CLOSED guards downstream
// (loadRateCard, loadOptionSurcharges) still refuse to invent a price, so the
// worst case is a product offered that then declines to quote, not a wrong one.
quote.get("/catalogue/offerability", async (c) => {
  const run = await lastReconcileRun(c.env).catch(() => null);
  if (!run || run.notOfferable === null) return c.json({ checked: false, checkedAt: run?.checkedAt ?? null, products: [] });
  return c.json({
    checked: true,
    checkedAt: run.checkedAt,
    products: run.notOfferable.map((p) => ({ slug: p.slug, gaps: p.gaps })),
  });
});

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
                FROM quote_line WHERE project_id = ?`)
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
               WHERE project_id=project.id
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
           SELECT 1 FROM quote_line WHERE project_id=?
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

// POST /api/projects/:id/issue-quote — STAFF seam (shared with the ops console).
quote.post("/projects/:id/issue-quote", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!["estimator", "manager", "admin"].includes(staff.role ?? "")) {
    return c.json({ error: "forbidden_role" }, 403);
  }
  const result = await issueQuote(c.env, c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 409);
  return c.json({ total: result.total, goods: result.goods, delivery: result.delivery });
});

// GET /api/projects/:id/quote — customer view of the issued quote. There is one
// quote per project (docs/quote-revisions-removal-plan.md); `live: false` means
// the project has moved past 'quote_issued' (accepted elsewhere, or the customer
// asked for changes and it re-armed) — the caller shows "no longer live" rather
// than treating the response as an error.
quote.get("/projects/:id/quote", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const proj = await c.env.DB.prepare(
    "SELECT status_customer, delivery_amount, delivery_postcode, issued_at FROM project WHERE id = ?",
  ).bind(p.id).first<{
    status_customer: string; delivery_amount: number | null;
    delivery_postcode: string | null; issued_at: string | null;
  }>();
  if (!proj || proj.status_customer !== "quote_issued") {
    return c.json({ live: false, status: proj?.status_customer ?? p.status_customer });
  }
  // Same read as the live draft (loadLines) — an issued quote IS the project's
  // lines, just locked. One list shape at every stage; the customer's issued
  // view renders through the same component as the draft and the order.
  const lines = await loadLines(c.env, p.id);
  const goods = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);
  const delivery = proj.delivery_amount ?? 0;
  const total = goods + delivery;
  // One deposit percentage (0043), computed here rather than in the browser —
  // the same reason orders.ts computes it rather than the review screen.
  return c.json({
    live: true, status: proj.status_customer,
    total, goods, delivery, deliveryPostcode: proj.delivery_postcode ?? null,
    deposit: depositOf(goods, delivery), balance: balanceOf(goods, delivery),
    // The badge reads the stamp taken at issue, not live eligibility. This quote
    // said what it said; ordering ends the eligibility but does not make the
    // sentence untrue of the document.
    referral: await issuedReferralBadge(c.env, p.id),
    issuedAt: proj.issued_at, lines,
  });
});

// POST /api/projects/:id/request-changes { message } — the customer declines the
// issued quote and asks for changes. Honest state move: the project returns to
// "Under review" and staff revise + re-issue the SAME quote in place — there is
// no separate copy to keep or supersede any more.
quote.post("/projects/:id/request-changes", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const proj = await c.env.DB.prepare("SELECT status_customer, status_internal FROM project WHERE id=?")
    .bind(p.id).first<{ status_customer: string; status_internal: string }>();
  if (!proj || proj.status_customer !== "quote_issued" || proj.status_internal !== "issued") {
    return c.json({ error: "invalid_state", status: proj?.status_customer }, 409);
  }
  const body = await c.req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  if (!message) return c.json({ error: "empty" }, 400);
  const user = await resolveUser(c.env, c.req.raw);
  const committed = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO comment (id, project_id, author_id, kind, body)
       SELECT ?, ?, ?, 'clarification', ?
        WHERE EXISTS (SELECT 1 FROM project WHERE id=? AND status_customer='quote_issued' AND status_internal='issued')`,
    ).bind(uuid(), p.id, user?.id ?? p.owner_user_id, `Change request on issued quote: ${message}`, p.id),
    c.env.DB.prepare(
      // Re-arms the issue gate (C7). delivery_postcode survives — a customer
      // who writes "actually, deliver to Cairns" in the change request lands
      // here with the gate re-armed, staff correct the postcode via E7, and
      // the new figure freezes on the next issue. A destination change is a
      // new pricing pass, never an edit to the issued quote.
      `UPDATE project SET status_customer='under_review',
          status_internal='estimator_assigned',
          delivery_amount = NULL, delivery_note = NULL,
          delivery_settled_at = NULL, delivery_settle_json = NULL,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='quote_issued' AND status_internal='issued'`,
    ).bind(p.id),
  ]);
  if (Number(committed[1]?.meta?.changes ?? 0) !== 1) {
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

// POST /api/projects/:id/accept — customer accepts the issued quote.
quote.post("/projects/:id/accept", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const proj = await c.env.DB.prepare("SELECT status_customer, status_internal FROM project WHERE id=?")
    .bind(p.id).first<{ status_customer: string; status_internal: string }>();
  // The quote must still be issued AND the project still awaiting acceptance —
  // after a change request (project back to under_review) it is not acceptable.
  if (!proj || proj.status_customer !== "quote_issued" || proj.status_internal !== "issued") {
    return c.json({ error: "not_acceptable" }, 409);
  }

  // The claim and the order creation happen in ONE atomic batch (see
  // createOrderFromProject). Only the winning caller gets an order; concurrent
  // duplicates and any mid-flight failure roll back to a re-acceptable quote,
  // so an accepted quote can never be left without an order.
  const orderId = await createOrderFromProject(c.env, p.id);
  if (!orderId) return c.json({ error: "not_acceptable" }, 409);
  // The referred tradie's first order now exists, so the earning it owes is
  // created here rather than inside createOrderFromProject: the order lifecycle
  // does not need to know this feature exists, and pricing already imports the
  // referral module, so calling it from there would close an import cycle.
  await onOrderCreated(c.env, orderId);
  const order = await c.env.DB.prepare('SELECT * FROM "order" WHERE id = ?').bind(orderId).first<OrderRow>();
  return c.json({ order: await orderDto(c.env, order!) });
});
