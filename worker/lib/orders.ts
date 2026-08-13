// Order fulfilment domain: the 12-stage journey, its transitions, the two-fold
// payment model, and order creation from an accepted revision. Shared by the
// customer routes (accept + sign-off gates) and the internal "staff" seams that
// the ops console will later drive.
import type { Env } from "../types";
import { uuid } from "./util";

export const STAGES = [
  "deposit_invoiced", "deposit_paid", "drawings_shared", "drawings_signed_off",
  "manufacturing", "qa_photos_shared", "balance_invoiced", "balance_paid",
  "customer_confirmed", "dispatched", "delivered", "after_sales",
] as const;
export type Stage = (typeof STAGES)[number];

// Customer-facing step labels (the 13-step process the client sees).
export const STAGE_LABEL: Record<Stage, string> = {
  deposit_invoiced: "Deposit invoice issued",
  deposit_paid: "Deposit received",
  drawings_shared: "Shop drawings shared",
  drawings_signed_off: "Drawings approved",
  manufacturing: "In manufacturing",
  qa_photos_shared: "Quality check — photos shared",
  balance_invoiced: "Final balance invoice issued",
  balance_paid: "Balance received",
  customer_confirmed: "Confirmed for dispatch",
  dispatched: "Dispatched",
  delivered: "Delivered",
  after_sales: "Completed — after-sales support",
};

export const DEPOSIT_PERCENT = 50;

// One place that computes a deposit (0043) — every reader (this module, the
// revision DTO in quote.ts, the dashboard summary row in projects.ts) calls
// these rather than repeating the arithmetic. Two arguments, not one
// pre-summed total, because that is what "50% of goods PLUS delivery" (D10)
// actually says: goods and delivery are named separately at every call site
// that has a delivery figure, and `delivery` defaults to 0 for the call sites
// that (for now) do not.
export const depositOf = (goods: number, delivery: number = 0): number =>
  Math.round(((goods + delivery) * DEPOSIT_PERCENT) / 100);
export const balanceOf = (goods: number, delivery: number = 0): number =>
  Math.round((goods + delivery) * 100) / 100 - depositOf(goods, delivery);

// Human labels for the transition actions (shown as ops buttons).
export const ACTION_LABEL: Record<string, string> = {
  "issue-drawings": "Issue shop drawings",
  "confirm-drawings": "Mark drawings approved",
  "start-manufacturing": "Start manufacturing",
  "share-qa": "Share QA photos",
  "invoice-balance": "Issue balance invoice",
  "confirm-qa": "Confirm for dispatch",
  "dispatch": "Mark dispatched",
  "deliver": "Mark delivered",
  "close": "Close (after-sales)",
  "pay:deposit": "Record deposit payment",
  "pay:balance": "Record balance payment",
};

interface TransitionDef {
  from: Stage;
  to: Stage;
  side: "customer" | "staff";
  stamp?: "drawings_signed_off_at" | "qa_confirmed_at";
  invoiceBalance?: true;
}

// Named linear transitions (payment steps handled separately in markPaid).
export const TRANSITIONS: Record<string, TransitionDef> = {
  "issue-drawings":      { from: "deposit_paid",        to: "drawings_shared",     side: "staff" },
  "confirm-drawings":    { from: "drawings_shared",     to: "drawings_signed_off", side: "customer", stamp: "drawings_signed_off_at" },
  "start-manufacturing": { from: "drawings_signed_off", to: "manufacturing",       side: "staff" },
  "share-qa":            { from: "manufacturing",       to: "qa_photos_shared",    side: "staff" },
  "invoice-balance":     { from: "qa_photos_shared",    to: "balance_invoiced",    side: "staff", invoiceBalance: true },
  "confirm-qa":          { from: "balance_paid",        to: "customer_confirmed",  side: "customer", stamp: "qa_confirmed_at" },
  "dispatch":            { from: "customer_confirmed",  to: "dispatched",          side: "staff" },
  "deliver":             { from: "dispatched",          to: "delivered",           side: "staff" },
  "close":               { from: "delivered",           to: "after_sales",         side: "staff" },
};

export interface OrderRow {
  id: string;
  project_id: string;
  order_no: string;
  stage: Stage;
  total: number | null;
  /** The delivery component of `total` — "order".delivery_total (0044). NOT
   *  NULL DEFAULT 0, same reasoning as quote_revision.delivery_total: by the
   *  time an order exists the figure was frozen at issue. */
  delivery_total: number | null;
  drawings_signed_off_at: string | null;
  qa_confirmed_at: string | null;
  created_at: string;
}
export interface PaymentRow {
  id: string;
  kind: "deposit" | "balance";
  amount: number;
  percent: number;
  status: "due" | "paid" | "waived";
  reference: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
}

export async function orderDto(env: Env, o: OrderRow) {
  const { results: payments } = await env.DB
    .prepare("SELECT id, kind, amount, percent, status, reference, invoiced_at, paid_at FROM payment WHERE order_id = ? ORDER BY kind DESC")
    .bind(o.id).all<PaymentRow>();
  return {
    id: o.id,
    orderNo: o.order_no,
    stage: o.stage,
    stageLabel: STAGE_LABEL[o.stage],
    stageIndex: STAGES.indexOf(o.stage),
    total: o.total,
    // E14 — RecordDetailPage.tsx's contract total previously read order.total
    // with no breakdown; with delivery inside it and no order.delivery, the
    // customer's post-acceptance screen showed a number simply larger than
    // the lines summed to.
    delivery: o.delivery_total ?? 0,
    goods: (o.total ?? 0) - (o.delivery_total ?? 0),
    drawingsSignedOffAt: o.drawings_signed_off_at,
    qaConfirmedAt: o.qa_confirmed_at,
    createdAt: o.created_at,
    payments: payments.map((p) => ({
      kind: p.kind, amount: p.amount, percent: p.percent, status: p.status,
      reference: p.reference, invoicedAt: p.invoiced_at, paidAt: p.paid_at,
    })),
    // Source files carried onto the order (the uploaded schedule) — surfaced in
    // the account order view, the ops panel, and the order emails.
    files: await orderFiles(env, o.id, o.project_id),
  };
}

// Files attached to an order: those linked to the order plus the project's
// schedule (deduped) — so the source travels with the order for technical review.
export async function orderFiles(env: Env, orderId: string, projectId: string) {
  const { results } = await env.DB
    .prepare("SELECT id, filename, kind, size FROM file_asset WHERE order_id = ? OR (project_id = ? AND kind = 'schedule') ORDER BY created_at DESC")
    .bind(orderId, projectId).all<{ id: string; filename: string; kind: string; size: number | null }>();
  const seen = new Set<string>();
  return (results ?? []).filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

// Accept an issued revision AND create its order as one atomic unit. The revision
// claim (issued -> accepted) is the FIRST statement in the same D1 batch that
// creates the order, so the two can never diverge:
//   * D1 runs a batch as a single transaction — either all writes land or none do.
//   * The claim's `WHERE snapshot_status = 'issued'` means only the first caller
//     flips it; a concurrent duplicate matches 0 rows, its order INSERT collides
//     on the UNIQUE(accepted_revision_id) index, and the WHOLE batch rolls back
//     (including any no-op) → the loser gets a clean conflict, the winner's order
//     stands, and a genuine failure leaves the revision re-acceptable (no strand).
// Returns the new order id, or null when the revision could not be claimed.
export async function createOrderFromRevision(
  env: Env, revisionId: string, projectId: string,
): Promise<string | null> {
  const { results: revLines } = await env.DB
    .prepare("SELECT external_ref, product_snapshot_json, qty, line_total FROM revision_line WHERE revision_id = ?")
    .bind(revisionId).all<{ external_ref: string | null; product_snapshot_json: string; qty: number; line_total: number }>();

  // THE FLIP (C8) — this line is the reason the whole feature exists.
  // Before it, this function re-derived the order total by summing
  // revision_line and never read totals_json: delivery is a project-level
  // charge with no line (D17), so it was present on the quote the customer
  // accepted and absent from "order".total, payment.deposit.amount and
  // payment.balance.amount. Every screen stayed internally consistent — the
  // contract total, the payment rows, all agreeing with each other and
  // disagreeing with the document the customer accepted — and nothing threw.
  // See T-B23 (scripts/tests/delivery.test.mjs), five assertions in one
  // subtest so a regression here names which half broke.
  const revision = await env.DB.prepare("SELECT delivery_total FROM quote_revision WHERE id = ?")
    .bind(revisionId).first<{ delivery_total: number | null }>();
  const goods = revLines.reduce((s, l) => s + (l.line_total || 0), 0);
  const delivery = revision?.delivery_total ?? 0;
  const total = goods + delivery;
  const deposit = depositOf(goods, delivery);
  const balance = balanceOf(goods, delivery);

  const orderId = uuid();
  // The number is assigned by the INSERT below, not derived above it.
  //
  // It used to be a SELECT before the batch. That failed SAFELY — the batch rolls
  // back and the caller returns 409 — but it failed for the wrong reason and told
  // the customer the wrong thing. Two different people accepting two different
  // quotes at the same moment both derived the same OF- number, and the loser
  // tripped the order_no UNIQUE index rather than the UNIQUE(accepted_revision_id)
  // guard this path is actually built around. They were told their quote "may have
  // just changed and to refresh" when nothing about their quote had changed, and
  // refreshing showed them the same thing. The careful reasoning at the top of this
  // function is all about the same-revision race; it never covered this one.
  //
  // substr is 1-based: position 4 is the first digit after the "OF-" prefix. The
  // subquery reads the pre-insert state of the table it inserts into, which is
  // exactly what is wanted, and it is evaluated inside the statement so no second
  // request can occupy the gap. Still gap-tolerant, still the same format.
  const NEXT_ORDER_NO =
    `'OF-' || (SELECT MAX(58000, COALESCE(MAX(CAST(substr(o2.order_no, 4) AS INTEGER)), 58000)) + 1 FROM "order" o2 WHERE o2.order_no LIKE 'OF-%')`;

  const stmts = [
    // Claim the revision inside the transaction — gates the whole order creation.
    env.DB.prepare(
      `UPDATE quote_revision SET snapshot_status='accepted',
          accepted_at=datetime('now')
        WHERE id=? AND project_id=? AND snapshot_status='issued'
          AND EXISTS (
            SELECT 1 FROM project
             WHERE id=? AND status_customer='quote_issued'
               AND status_internal='issued'
               AND current_revision_id=?
          )`,
    ).bind(revisionId, projectId, projectId, revisionId),
    env.DB.prepare(
      // "order".delivery_total is what E14/E6 read back (worker/lib/orders.ts's
      // own orderDto, and the ops project DTO) — order_line itself carries no
      // delivery row, ever (D17).
      `INSERT INTO "order" (id, project_id, accepted_revision_id, order_no, total, delivery_total, stage)
       SELECT ?, ?, ?, ${NEXT_ORDER_NO}, ?, ?, 'deposit_invoiced'
        WHERE EXISTS (
          SELECT 1 FROM quote_revision
           WHERE id=? AND project_id=? AND snapshot_status='accepted'
        )
          AND EXISTS (
            SELECT 1 FROM project
             WHERE id=? AND status_customer='quote_issued'
               AND status_internal='issued'
               AND current_revision_id=?
          )`,
    ).bind(
      orderId, projectId, revisionId, total, delivery,
      revisionId, projectId, projectId, revisionId,
    ),
    // deposit invoiced now; balance created but not yet invoiced (invoiced_at NULL)
    env.DB.prepare(
      `INSERT INTO payment (id, order_id, kind, amount, percent, status, invoiced_at)
       SELECT ?, ?, 'deposit', ?, ?, 'due', datetime('now')
        WHERE EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
    ).bind(uuid(), orderId, deposit, DEPOSIT_PERCENT, orderId),
    env.DB.prepare(
      `INSERT INTO payment (id, order_id, kind, amount, percent, status)
       SELECT ?, ?, 'balance', ?, ?, 'due'
        WHERE EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
    ).bind(uuid(), orderId, balance, 100 - DEPOSIT_PERCENT, orderId),
    ...revLines.map((l) =>
      env.DB.prepare(
        `INSERT INTO order_line
           (id, order_id, external_ref, product_snapshot_json, qty, line_total)
         SELECT ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
      ).bind(
        uuid(), orderId, l.external_ref, l.product_snapshot_json, l.qty,
        l.line_total, orderId,
      ),
    ),
    // Carry the uploaded schedule onto the order so it stays with the record for
    // the manufacturer / technical review (the file bytes remain in R2).
    env.DB.prepare(
      `UPDATE file_asset SET order_id=?
        WHERE project_id=? AND kind='schedule'
          AND EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
    ).bind(orderId, projectId, orderId),
    env.DB.prepare(
      `UPDATE project SET status_customer='closed', updated_at=datetime('now')
        WHERE id=? AND status_customer='quote_issued' AND status_internal='issued'
          AND current_revision_id=?
          AND EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
    ).bind(projectId, revisionId, orderId),
  ];
  try {
    // A committed batch means the order rows landed. Either the claim flipped the
    // revision (normal path) or it was already 'accepted' but orderless and we've
    // now healed it — both leave exactly one order for this revision.
    const committed = await env.DB.batch(stmts);
    // The order insert + final project transition are the commit proof. The
    // revision claim may legitimately be a no-op only for the documented
    // accepted-but-orderless recovery case; request-changes still blocks the
    // insert because it atomically moves the project out of quote_issued.
    if (Number(committed[1]?.meta?.changes ?? 0) !== 1 ||
        Number(committed[committed.length - 1]?.meta?.changes ?? 0) !== 1) {
      return null;
    }
    return orderId;
  } catch {
    // Rolled back — lost the race (duplicate order / number collision). The
    // revision is untouched and stays re-acceptable, so the caller returns 409.
    return null;
  }
}

// Apply a named fulfilment transition. Returns an error code or null on success.
export async function applyTransition(env: Env, order: OrderRow, action: string): Promise<string | null> {
  const t = TRANSITIONS[action];
  if (!t) return "unknown_action";
  if (order.stage !== t.from) return "stage_conflict";
  const stampSql = t.stamp ? `, ${t.stamp} = datetime('now')` : "";
  await env.DB.prepare(`UPDATE "order" SET stage = ?${stampSql}, updated_at = datetime('now') WHERE id = ?`).bind(t.to, order.id).run();
  if (t.invoiceBalance) {
    await env.DB.prepare("UPDATE payment SET invoiced_at = datetime('now') WHERE order_id = ? AND kind = 'balance'").bind(order.id).run();
  }
  return null;
}

// Record a manual payment (deposit/balance) and advance the matching stage.
export async function markPaid(env: Env, order: OrderRow, kind: "deposit" | "balance", reference?: string | null): Promise<string | null> {
  const expectFrom = kind === "deposit" ? "deposit_invoiced" : "balance_invoiced";
  const to = kind === "deposit" ? "deposit_paid" : "balance_paid";
  if (order.stage !== expectFrom) return "stage_conflict";
  await env.DB.batch([
    env.DB.prepare("UPDATE payment SET status = 'paid', paid_at = datetime('now'), reference = ? WHERE order_id = ? AND kind = ?")
      .bind(reference ?? null, order.id, kind),
    env.DB.prepare('UPDATE "order" SET stage = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(to, order.id),
  ]);
  return null;
}

// Actions a staff member can take from the current stage (transitions + payments).
export function availableActions(order: OrderRow): { action: string; label: string }[] {
  const out: { action: string; label: string }[] = [];
  if (order.stage === "deposit_invoiced") out.push({ action: "pay:deposit", label: ACTION_LABEL["pay:deposit"] });
  if (order.stage === "balance_invoiced") out.push({ action: "pay:balance", label: ACTION_LABEL["pay:balance"] });
  for (const [key, t] of Object.entries(TRANSITIONS)) {
    if (t.from === order.stage) out.push({ action: key, label: ACTION_LABEL[key] ?? key });
  }
  return out;
}
