// Issue the quote: a STATE CHANGE, not a copy (docs/quote-revisions-removal-
// plan.md, owner decision 2026-08-14 — "a quote is a quote"). There is one
// quote per project, updated in place; "issued" locks editing (EDITABLE in
// src/ops/ProjectRecord.tsx already excludes it) and that lock is what makes
// the quote stable — not a snapshot copy. Replaces worker/lib/revisions.ts.
import type { Env } from "../types";
import { uuid } from "./util";
import { referralDiscountState } from "./referral-discount";
import { captureRecommendationOutcomes, type IssuedCartLine } from "./ai/outcomes";
import { createLearningExample, refreshLearningExampleEligibility } from "./ai/examples";

export type IssueResult =
  | { ok: true; total: number; goods: number; delivery: number }
  // delivery_unset is a DISTINCT code, not a fourth "not_ready" — ProjectRecord.
  // tsx's ACTION_ERRORS map has no "not_ready" key at all, so folding this into
  // it would render the generic "That action could not be completed.", exactly
  // the useless message that map exists to avoid.
  | { ok: false; error: "not_found" | "not_ready" | "delivery_unset" };

interface LearningOutboxPayload {
  lines: IssuedCartLine[];
}

/** Claim and deliver one finalized-quote learning item. A delivery failure is
 * persisted for staff retry and never rolls back the issued quote. */
export async function processLearningOutbox(env: Env, outboxId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `UPDATE learning_outbox
        SET status='processing', attempts=attempts+1, last_error=NULL,
            updated_at=datetime('now')
      WHERE id=? AND (
        status IN ('pending','failed')
        OR (status='processing' AND updated_at < datetime('now','-10 minutes'))
      )
      RETURNING project_id, payload_json`,
  ).bind(outboxId).first<{ project_id: string; payload_json: string }>();
  if (!row) {
    const current = await env.DB.prepare("SELECT status FROM learning_outbox WHERE id=?")
      .bind(outboxId).first<{ status: string }>();
    return current?.status === "completed";
  }

  try {
    const payload = JSON.parse(row.payload_json) as LearningOutboxPayload;
    if (!Array.isArray(payload.lines)) throw new Error("invalid_learning_payload");
    await captureRecommendationOutcomes(env, row.project_id, payload.lines);
    // The immutable AI-vs-human record is best-effort and never blocks quote
    // issuance. Eligibility is governed separately: exact human acceptance is
    // approved immediately; adjusted lines remain pending until adjudicated.
    const exampleId = await createLearningExample(env, row.project_id);
    if (exampleId) await refreshLearningExampleEligibility(env, row.project_id);
    await env.DB.prepare(
      `UPDATE learning_outbox
          SET status='completed', completed_at=datetime('now'),
              updated_at=datetime('now'), last_error=NULL
        WHERE id=? AND status='processing'`,
    ).bind(outboxId).run();
    return true;
  } catch (error) {
    await env.DB.prepare(
      `UPDATE learning_outbox
          SET status='failed', last_error=?, updated_at=datetime('now')
        WHERE id=? AND status='processing'`,
    ).bind(String(error).slice(0, 1000), outboxId).run();
    return false;
  }
}

export async function drainLearningOutbox(env: Env, limit = 25): Promise<{ attempted: number; completed: number }> {
  const bounded = Math.max(1, Math.min(100, Math.floor(limit)));
  const { results } = await env.DB.prepare(
    `SELECT id FROM learning_outbox
      WHERE status IN ('pending','failed')
         OR (status='processing' AND updated_at < datetime('now','-10 minutes'))
      ORDER BY created_at LIMIT ?`,
  ).bind(bounded).all<{ id: string }>();
  let completed = 0;
  for (const row of results ?? []) {
    if (await processLearningOutbox(env, row.id)) completed += 1;
  }
  return { attempted: results?.length ?? 0, completed };
}

// A project in PRICING may be issued — this is the enforcement point regardless
// of which endpoint calls it.
//
// It used to require `approved_for_issue`, a state only the approval engine could
// produce. When that engine was removed (0033) the state stopped being reachable
// and issuing became impossible; the tests caught it as a blanket 409. The real
// protection was never the approval anyway — it is the two line checks below,
// which refuse to issue a quote that is unpriced or still carries a review flag.
// Exported: the delivery panel's editable set (E7, design doc §6.3) is this
// set PLUS 'draft' — a project that has not even reached the queue yet can
// still have its postcode corrected.
export const ISSUABLE_FROM = new Set([
  "estimator_assigned", "technical_review_required", "customer_clarification_required",
  "submitted", "triage_pending",
]);

export async function issueQuote(env: Env, projectId: string): Promise<IssueResult> {
  const project = await env.DB.prepare(
    "SELECT id, owner_user_id, status_internal, quote_edit_version, delivery_amount, delivery_postcode, delivery_settle_json FROM project WHERE id = ?",
  ).bind(projectId).first<{
    id: string; owner_user_id: string | null; status_internal: string; quote_edit_version: number;
    delivery_amount: number | null;
    delivery_postcode: string | null; delivery_settle_json: string | null;
  }>();
  if (!project) return { ok: false, error: "not_found" };
  if (!ISSUABLE_FROM.has(project.status_internal)) return { ok: false, error: "not_ready" };

  // PARENTS ONLY — the same rule loadLines() and every customer-facing view
  // follow. A composite parent's line_total already IS the sum of its units, so
  // without this the issued quote charged for the opening AND for each unit
  // inside it. Verified against a dev database before the guard: a project ops
  // priced at $9,800 issued at $16,400, with the units appearing on the
  // customer's quote as extra lines carrying no item code — the exact
  // double-charge CompositePanel writes "included" instead of an amount to
  // prevent, arriving through the snapshot instead of the screen.
  //
  // The readiness gates below stay correct on parents alone: recomputeComposite
  // rolls an unpriced or flagged unit up into its parent's line_total and
  // status, so a bad unit still blocks the issue through its opening.
  //
  // There is no more `revision_id IS NULL` clause — that column is gone
  // (0049); every quote_line row for a project is the one live quote.
  const { results: lines } = await env.DB
    .prepare(`SELECT id, external_ref, room_label, product_slug, options_json, dims_json,
                    qty, line_total, status, ai_proposal_line_id, selected_variant_id,
                    configuration_snapshot_json, pricing_snapshot_json,
                    recommendation_basis, recommendation_confidence, line_kind
               FROM quote_line
              WHERE project_id = ? AND parent_line_id IS NULL
              ORDER BY position`)
    .bind(projectId)
    .all<{
      id: string; external_ref: string | null; room_label: string | null; product_slug: string;
      options_json: string; dims_json: string; qty: number; line_total: number | null; status: string;
      ai_proposal_line_id: string | null; selected_variant_id: string | null;
      configuration_snapshot_json: string | null; pricing_snapshot_json: string | null;
      recommendation_basis: string | null; recommendation_confidence: string | null;
      line_kind: string | null;
    }>();

  // Never issue an empty or partially-priced quote: a NULL line_total means the
  // line couldn't be priced, and issuing it would silently coerce it to $0 (and
  // let a zero-value order be created downstream). Refuse until it's resolved.
  if (lines.length === 0 || lines.some((l) => l.line_total == null)) return { ok: false, error: "not_ready" };
  // Nor issue while a line still carries an unresolved technical-review flag — a
  // material substitution, out-of-range unit, or glazing conflict must be cleared
  // by staff before the quote goes out. Readiness is enforced here, at the gate.
  if (lines.some((l) => l.status === "technical_review" || l.status === "incomplete")) return { ok: false, error: "not_ready" };

  // GUARD 8 — delivery must be SETTLED, not non-zero. A trade customer
  // arranging their own freight is priced at 0 and that is an answer; NULL is
  // the absence of one, and issuing on it freezes a figure nobody has looked
  // at into a document the business then has to honour (design doc D12).
  // Placed AFTER the line guards so a job with both problems reports the line
  // problem first — lines are the reviewer's actual work, delivery is one
  // field, and surfacing the trivial blocker while hiding the substantial one
  // trains people to distrust the gate.
  if (project.delivery_amount == null) return { ok: false, error: "delivery_unset" };

  // THE FLIP (C8): total is goods + delivery, not goods alone — D10 sets the
  // deposit at 50% of goods + delivery. Nothing is frozen into a totals blob
  // any more: lines cannot change while status_internal='issued' (the EDITABLE
  // gate), so goods/delivery are computed live, here and at every later read,
  // off the same quote_line + project.delivery_amount rows.
  const goods = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const delivery = project.delivery_amount ?? 0; // GUARD 8 above already refused NULL
  const total = goods + delivery;
  const outboxId = uuid();
  const issuedLines = lines.map((line) => ({
    ...line,
    line_total: line.line_total ?? 0,
  })) as IssuedCartLine[];

  // The issued-quote badge needs a FROZEN fact, and the per-line pricing snapshot
  // is not one: a customer edit nulls pricing_snapshot_json, so a badge derived
  // from it would vanish the moment the customer touched a line. Stamped here, at
  // the same instant delivery freezes — the precedent 0044 already set.
  //
  // It is a LABEL, never a price. Nothing recomputes a total from it, so an
  // issued quote is still never re-priced by a later change in eligibility: the
  // percentage that was true when the offer went out stays on the document.
  const referral = await referralDiscountState(env, project.owner_user_id);
  const referralPercentAtIssue = referral.state === "available" ? referral.percent : null;

  const stmts = [
    // The optimistic guard is quote_edit_version: if the quote changed while we
    // were reading it above, this update matches nothing and the whole batch is
    // reported as a conflict.
    env.DB.prepare(
      `UPDATE project SET status_customer='quote_issued', status_internal='issued',
          issued_at=datetime('now'), updated_at=datetime('now'),
          referral_percent_at_issue=?
        WHERE id=? AND quote_edit_version=?
          -- IS, not =: NULL-safe by construction even though GUARD 8 above has
          -- already excluded NULL. The issue freezes exactly the delivery
          -- figure it read at the top of this call, or it fails.
          AND delivery_amount IS ?`,
    ).bind(referralPercentAtIssue, projectId, project.quote_edit_version, project.delivery_amount),
    // One outbox row per finalized quote (UNIQUE(project_id)) — a re-issue after
    // a request-changes round trip (an accepted edge case, not actively designed
    // for) replaces the pending payload rather than colliding.
    env.DB.prepare(
      `INSERT INTO learning_outbox (id, project_id, payload_json)
       SELECT ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM project WHERE id=? AND status_internal='issued')
       ON CONFLICT(project_id) DO UPDATE SET
         payload_json=excluded.payload_json, status='pending', attempts=0,
         last_error=NULL, updated_at=datetime('now'), completed_at=NULL`,
    ).bind(outboxId, projectId, JSON.stringify({ lines: issuedLines }), projectId),
  ];
  let committed: D1Result[];
  try {
    committed = await env.DB.batch(stmts);
  } catch {
    // Rolled back. Whatever the cause — a residual conflict, a constraint this
    // function does not model — the caller's contract is a 409, not a 500.
    // orders.ts has always handled its batch this way; this one did not.
    return { ok: false, error: "not_ready" };
  }
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1) {
    return { ok: false, error: "not_ready" };
  }
  // The upsert means outboxId above may not be the row's id when this is a
  // re-issue (ON CONFLICT keeps the original id) — read back the live one.
  const outbox = await env.DB.prepare("SELECT id FROM learning_outbox WHERE project_id = ?")
    .bind(projectId).first<{ id: string }>();
  if (outbox) await processLearningOutbox(env, outbox.id);
  // Finalization creates the learning example (LLM strategy §16.3/§17.2): the AI
  // proposal vs the human-approved outcome, retrieval-eligible immediately,
  // training-gated. Best-effort — issuing must never fail because capture did.
  return { ok: true, total, goods, delivery };
}
