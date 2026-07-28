// Issue an immutable quote revision: snapshot the current draft lines into
// revision_line and move the project to "quote issued". Shared by the customer
// staff-seam and the ops console.
import type { Env } from "../types";
import { uuid } from "./util";
import { getProductBySlug } from "../../src/data/catalogue";
import { captureRecommendationOutcomes, type IssuedCartLine } from "./ai/outcomes";

function safeParse(s: string): Record<string, unknown> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export type IssueResult =
  | { ok: true; id: string; revisionNo: number; total: number }
  | { ok: false; error: "not_found" | "not_ready" };

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
      RETURNING project_id, quote_revision_id, payload_json`,
  ).bind(outboxId).first<{
    project_id: string; quote_revision_id: string; payload_json: string;
  }>();
  if (!row) {
    const current = await env.DB.prepare("SELECT status FROM learning_outbox WHERE id=?")
      .bind(outboxId).first<{ status: string }>();
    return current?.status === "completed";
  }

  try {
    const payload = JSON.parse(row.payload_json) as LearningOutboxPayload;
    if (!Array.isArray(payload.lines)) throw new Error("invalid_learning_payload");
    await captureRecommendationOutcomes(env, row.project_id, row.quote_revision_id, payload.lines);
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
const ISSUABLE_FROM = new Set([
  "estimator_assigned", "technical_review_required", "customer_clarification_required",
  "submitted", "triage_pending",
]);

export async function issueRevision(env: Env, projectId: string): Promise<IssueResult> {
  const project = await env.DB.prepare(
    "SELECT id, status_internal, quote_edit_version FROM project WHERE id = ?",
  ).bind(projectId).first<{ id: string; status_internal: string; quote_edit_version: number }>();
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
  const { results: lines } = await env.DB
    .prepare(`SELECT id, external_ref, room_label, product_slug, options_json, dims_json,
                    qty, line_total, status, ai_proposal_line_id, selected_variant_id,
                    configuration_snapshot_json, pricing_snapshot_json,
                    recommendation_basis, recommendation_confidence, line_kind
               FROM quote_line
              WHERE project_id = ? AND revision_id IS NULL AND parent_line_id IS NULL
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

  const maxRow = await env.DB.prepare("SELECT COALESCE(MAX(revision_no), 0) AS n FROM quote_revision WHERE project_id = ?").bind(projectId).first<{ n: number }>();
  const revisionNo = (maxRow?.n ?? 0) + 1;
  const revisionId = uuid();
  const outboxId = uuid();
  const total = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const issuedLines = lines.map((line) => ({
    ...line,
    line_total: line.line_total ?? 0,
  })) as IssuedCartLine[];

  const stmts = [
    env.DB.prepare(
      `INSERT INTO quote_revision
         (id, project_id, revision_no, snapshot_status, totals_json)
       SELECT ?, ?, ?, 'issued', ?
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND quote_edit_version=?
        )`,
    ).bind(revisionId, projectId, revisionNo, JSON.stringify({ total }), projectId, project.quote_edit_version),
    ...lines.map((l) => {
      const p = getProductBySlug(l.product_slug);
      const snapshot = JSON.stringify({
        productSlug: l.product_slug,
        productName: p?.name ?? l.product_slug,
        options: safeParse(l.options_json),
        dims: safeParse(l.dims_json),
        performanceVariantId: l.selected_variant_id,
        configuration: safeParse(l.configuration_snapshot_json || "{}"),
        pricing: safeParse(l.pricing_snapshot_json || "{}"),
        recommendationBasis: l.recommendation_basis,
        recommendationConfidence: l.recommendation_confidence,
      });
      return env.DB.prepare(
        `INSERT INTO revision_line
           (id, revision_id, external_ref, room_label, product_snapshot_json, dims_json, options_json, qty, line_total)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM quote_revision WHERE id=?)`,
      ).bind(uuid(), revisionId, l.external_ref, l.room_label, snapshot, l.dims_json, l.options_json, l.qty, l.line_total ?? 0, revisionId);
    }),
    env.DB.prepare(
      `INSERT INTO learning_outbox
         (id, project_id, quote_revision_id, payload_json)
       SELECT ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM quote_revision WHERE id=?)`,
    ).bind(outboxId, projectId, revisionId, JSON.stringify({ lines: issuedLines }), revisionId),
    env.DB.prepare(
      `UPDATE quote_revision SET snapshot_status='superseded'
        WHERE project_id=? AND id<>? AND snapshot_status='issued'
          AND EXISTS (
            SELECT 1 FROM quote_revision
             WHERE id=? AND project_id=? AND snapshot_status='issued'
          )`,
    ).bind(projectId, revisionId, revisionId, projectId),
    env.DB.prepare(
      // The optimistic guard is quote_edit_version: if the quote changed while we
      // were snapshotting it, this update matches nothing and the whole batch is
      // reported as a conflict. The old status_internal='approved_for_issue' term
      // was the approval gate, not the concurrency guard.
      `UPDATE project SET status_customer='quote_issued', status_internal='issued',
          current_revision_id=?, updated_at=datetime('now')
        WHERE id=? AND quote_edit_version=?
          AND EXISTS (SELECT 1 FROM quote_revision WHERE id=?)`,
    ).bind(revisionId, projectId, project.quote_edit_version, revisionId),
  ];
  const committed = await env.DB.batch(stmts);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      Number(committed[committed.length - 1]?.meta?.changes ?? 0) !== 1) {
    return { ok: false, error: "not_ready" };
  }
  await processLearningOutbox(env, outboxId);
  // Finalization creates the learning example (LLM strategy §16.3/§17.2): the AI
  // proposal vs the human-approved outcome, retrieval-eligible immediately,
  // training-gated. Best-effort — issuing must never fail because capture did.
  return { ok: true, id: revisionId, revisionNo, total };
}
