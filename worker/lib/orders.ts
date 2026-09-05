// Order fulfilment domain: the 12-stage journey, its transitions, the two-fold
// payment model, and order creation from the accepted quote. Shared by the
// customer routes (accept + sign-off gates) and the internal "staff" seams that
// the ops console will later drive.
import type { Env } from "../types";
import { uuid } from "./util";
import { getProductBySlug } from "../../src/data/catalogue";
import { issuedReferralBadge } from "./referral-discount";

function safeParse(s: string | null | undefined): Record<string, unknown> {
  try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

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
   *  NULL DEFAULT 0: by the time an order exists, delivery was frozen at issue
   *  (it cannot move while a quote is issued — the edit lock covers it too). */
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
    // The badge follows the purchase onto the order, from the stamp taken at
    // issue. Ordering is exactly what ends the eligibility, so a live lookup here
    // would erase the label at the moment it became a permanent fact about this
    // order — and the order is what the customer looks at from now on.
    referral: await issuedReferralBadge(env, o.project_id),
  };
}

// The order's lines in the SAME shape the quote's are (loadLines in
// worker/routes/projects.ts), so ONE list component renders every stage —
// builder, pending project, issued quote and order. PARENTS ONLY at the top
// level, with a composite's units nested inside their opening, exactly as the
// customer authored it.
//
// Before 0047 this could not be done: order_line carried only ref/qty/total, so
// a split opening arrived at the contract as its pre-split parent frame — not
// what gets made. The units are real order_line rows now, and this is where
// they become visible to the customer and to production.
//
// `productSlug` is the frozen snapshot's slug and the renderer resolves the
// display NAME from the live catalogue, same as every other stage. That means a
// product renamed in Sanity after an order was placed shows its new name on the
// order — accepted deliberately: the alternative is a name-override prop that
// would fork the list component's behaviour, and product_snapshot_json still
// holds what was actually sold, which is what a dispute is settled from.
export async function orderLines(env: Env, orderId: string) {
  const { results } = await env.DB.prepare(
    // The AUTHORED order (0050), never the id: sorting a signed contract by a
    // UUID reorders it against the quote the customer accepted. Segments sort
    // within their parent by segment_seq; the JOIN gives a segment its parent's
    // position so the two levels cannot interleave.
    `SELECT l.id, l.external_ref, l.room_label, l.product_snapshot_json, l.dims_json, l.options_json,
            l.qty, l.line_total, l.parent_line_id, l.segment_seq, l.qty_per_parent, l.composite_axis
       FROM order_line l
       LEFT JOIN order_line parent ON parent.id = l.parent_line_id
      WHERE l.order_id = ?
      ORDER BY COALESCE(parent.position, l.position), l.segment_seq`,
  ).bind(orderId).all<{
    id: string; external_ref: string | null; room_label: string | null;
    product_snapshot_json: string; dims_json: string | null; options_json: string | null;
    qty: number; line_total: number; parent_line_id: string | null;
    segment_seq: number; qty_per_parent: number; composite_axis: string | null;
  }>();
  const rows = results ?? [];
  const slugOf = (snapshot: string) => String(safeParse(snapshot).productSlug ?? "");
  // The columns FIRST, the frozen snapshot underneath. Every order_line written
  // before 0047 has NULL dims_json/options_json — those columns did not exist,
  // and the geometry and specification lived inside product_snapshot_json
  // instead. Reading the columns alone empties the sizes and options on every
  // order placed before that migration: the customer's own record of what they
  // bought, blanked by a schema change. The reader this replaced merged the two
  // for exactly this reason, so the merge comes with it.
  const nested = (snapshot: string, key: "dims" | "options") => {
    const value = safeParse(snapshot)[key];
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  };
  const dimsOf = (row: { dims_json: string | null; product_snapshot_json: string }) =>
    ({ ...nested(row.product_snapshot_json, "dims"), ...safeParse(row.dims_json) });
  const optionsOf = (row: { options_json: string | null; product_snapshot_json: string }) =>
    ({ ...nested(row.product_snapshot_json, "options"), ...safeParse(row.options_json) }) as Record<string, string>;
  return rows.filter((r) => r.parent_line_id == null).map((parent) => {
    const dims = dimsOf(parent);
    const units = rows.filter((r) => r.parent_line_id === parent.id);
    return {
      id: parent.id,
      code: parent.external_ref ?? "",
      productSlug: slugOf(parent.product_snapshot_json),
      location: parent.room_label ?? "",
      width: String(dims.width ?? ""),
      height: String(dims.height ?? ""),
      options: optionsOf(parent),
      qty: parent.qty,
      // A contracted line is settled by definition — there is no unpriced or
      // review state left to express once an order exists.
      status: "Ready" as const,
      lineTotal: parent.line_total,
      compositeAxis: parent.composite_axis === "horizontal" ? "horizontal" as const
        : parent.composite_axis === "vertical" ? "vertical" as const : null,
      segments: units.map((unit) => {
        const unitDims = dimsOf(unit);
        return {
          id: unit.id,
          productSlug: slugOf(unit.product_snapshot_json),
          width: String(unitDims.width ?? ""),
          height: String(unitDims.height ?? ""),
          qtyPerParent: unit.qty_per_parent,
          qty: unit.qty,
          // Display-only, same rule as the quote: the parent's lineTotal is
          // authoritative and a client must never sum these. STAFF-VISIBLE:
          // this mapper serves the ops contract view too, and the customer
          // read redacts it at its own boundary (routes/orders.ts) - the
          // mapper describes the data, the route decides its audience.
          lineTotal: unit.line_total,
          options: optionsOf(unit),
          status: "Ready" as const,
          note: unit.room_label ?? "",
        };
      }),
    };
  });
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

// Accept the issued quote AND create its order as one atomic unit. There is no
// revision to claim any more — the claim is the order INSERT itself, gated on
// the project's state and guarded against a duplicate by the UNIQUE index on
// "order".project_id (one order per project, replacing what UNIQUE(accepted_
// revision_id) used to guard):
//   * D1 runs a batch as a single transaction — either all writes land or none do.
//   * The INSERT's `WHERE EXISTS (project still quote_issued/issued)` means only
//     a project that is actually acceptable produces a row; a concurrent duplicate
//     either finds the project already flipped to 'closed' below (0 rows) or
//     collides on idx_order_project, and the WHOLE batch rolls back → the loser
//     gets a clean conflict, the winner's order stands.
// Returns the new order id, or null when the project could not be claimed.
export async function createOrderFromProject(
  env: Env, projectId: string,
): Promise<string | null> {
  // PARENTS ONLY, same rule as every other read of the live quote (a
  // composite's segments belong to their parent) — but this time the segments
  // ARE carried across too, just as their own order_line rows, because this is
  // the one freeze that legally matters (docs/quote-revisions-removal-plan.md).
  // revision_line had no columns for a unit; order_line now does (0047).
  const { results: parents } = await env.DB
    .prepare(
      `SELECT id, external_ref, room_label, product_slug, options_json, dims_json,
              qty, line_total, selected_variant_id, line_kind, composite_axis, position
         FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL ORDER BY position`,
    )
    .bind(projectId)
    .all<{
      id: string; external_ref: string | null; room_label: string | null; product_slug: string;
      options_json: string; dims_json: string; qty: number; line_total: number | null;
      selected_variant_id: string | null; line_kind: string | null; composite_axis: string | null;
      position: number;
    }>();

  const compositeParentIds = parents.filter((p) => p.line_kind === "composite_parent").map((p) => p.id);
  let segments: {
    id: string; parent_line_id: string; segment_seq: number; qty_per_parent: number;
    product_slug: string; options_json: string; dims_json: string; qty: number;
    line_total: number | null; selected_variant_id: string | null;
  }[] = [];
  if (compositeParentIds.length) {
    const placeholders = compositeParentIds.map(() => "?").join(",");
    ({ results: segments } = await env.DB.prepare(
      `SELECT id, parent_line_id, segment_seq, qty_per_parent, product_slug,
              options_json, dims_json, qty, line_total, selected_variant_id
         FROM quote_line WHERE parent_line_id IN (${placeholders}) ORDER BY segment_seq`,
    ).bind(...compositeParentIds).all());
  }

  // THE FLIP (C8) — this line is the reason the whole feature exists.
  // Before it, this function re-derived the order total by summing lines and
  // never read a frozen delivery figure: delivery is a project-level charge
  // with no line (D17), so it was present on the quote the customer accepted
  // and absent from "order".total, payment.deposit.amount and payment.balance.
  // amount. Every screen stayed internally consistent — the contract total,
  // the payment rows, all agreeing with each other and disagreeing with the
  // document the customer accepted — and nothing threw. See T-B23 (scripts/
  // tests/delivery.test.mjs), five assertions in one subtest so a regression
  // here names which half broke.
  //
  // project.delivery_amount, not a snapshot: it cannot move while the quote is
  // issued (issue-lock + the delivery panel's own editable gate both exclude
  // 'issued'), so it is already the figure the customer accepted.
  const project = await env.DB.prepare(
    "SELECT status_customer, status_internal, delivery_amount FROM project WHERE id = ?",
  ).bind(projectId).first<{ status_customer: string; status_internal: string; delivery_amount: number | null }>();
  const goods = parents.reduce((s, l) => s + (l.line_total || 0), 0);
  const delivery = project?.delivery_amount ?? 0;
  const total = goods + delivery;
  const deposit = depositOf(goods, delivery);
  const balance = balanceOf(goods, delivery);

  const orderId = uuid();
  // Each parent's fresh order_line id, decided here so a segment's order_line
  // row can point at its NEW parent id in the same batch (quote_line ids are
  // not carried over — order_line has its own id space).
  const parentOrderLineId = new Map(parents.map((p) => [p.id, uuid()]));
  const snapshot = (productSlug: string) => {
    const p = getProductBySlug(productSlug);
    return JSON.stringify({ productSlug, productName: p?.name ?? productSlug });
  };
  // The number is assigned by the INSERT below, not derived above it.
  //
  // It used to be a SELECT before the batch. That failed SAFELY — the batch rolls
  // back and the caller returns 409 — but it failed for the wrong reason and told
  // the customer the wrong thing. Two different people accepting two different
  // quotes at the same moment both derived the same OF- number, and the loser
  // tripped the order_no UNIQUE index rather than the UNIQUE(project_id) guard
  // this path is actually built around. They were told their quote "may have
  // just changed and to refresh" when nothing about their quote had changed, and
  // refreshing showed them the same thing. The careful reasoning at the top of this
  // function is all about the same-project race; it never covered this one.
  //
  // substr is 1-based: position 4 is the first digit after the "OF-" prefix. The
  // subquery reads the pre-insert state of the table it inserts into, which is
  // exactly what is wanted, and it is evaluated inside the statement so no second
  // request can occupy the gap. Still gap-tolerant, still the same format.
  const NEXT_ORDER_NO =
    `'OF-' || (SELECT MAX(58000, COALESCE(MAX(CAST(substr(o2.order_no, 4) AS INTEGER)), 58000)) + 1 FROM "order" o2 WHERE o2.order_no LIKE 'OF-%')`;

  const stmts = [
    env.DB.prepare(
      // "order".delivery_total is what E14/E6 read back (worker/lib/orders.ts's
      // own orderDto, and the ops project DTO) — order_line itself carries no
      // delivery row, ever (D17). idx_order_project (UNIQUE) is what makes this
      // the claim: a concurrent duplicate either finds the project already
      // flipped to 'closed' (0 rows here) or collides on that index, and the
      // whole batch rolls back either way.
      `INSERT INTO "order" (id, project_id, order_no, total, delivery_total, stage)
       SELECT ?, ?, ${NEXT_ORDER_NO}, ?, ?, 'deposit_invoiced'
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND status_customer='quote_issued' AND status_internal='issued'
        )`,
    ).bind(orderId, projectId, total, delivery, projectId),
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
    ...parents.map((p) =>
      env.DB.prepare(
        `INSERT INTO order_line
           (id, order_id, external_ref, room_label, product_snapshot_json, dims_json,
            options_json, qty, line_total, line_kind, composite_axis, selected_variant_id, position)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
      ).bind(
        parentOrderLineId.get(p.id), orderId, p.external_ref, p.room_label,
        snapshot(p.product_slug), p.dims_json, p.options_json, p.qty, p.line_total ?? 0,
        p.line_kind ?? "simple", p.composite_axis, p.selected_variant_id, p.position, orderId,
      ),
    ),
    // Segments carry no external_ref/room_label of their own (same rule as
    // quote_line — one opening, one architect tag) and their price is
    // DISPLAY-ONLY: the parent's line_total already IS Σ(segments), which is
    // what was charged and what payments/totals above are computed from.
    ...segments.map((s) =>
      env.DB.prepare(
        `INSERT INTO order_line
           (id, order_id, external_ref, product_snapshot_json, dims_json, options_json,
            qty, line_total, parent_line_id, segment_seq, qty_per_parent, line_kind, selected_variant_id)
         SELECT ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'segment', ?
          WHERE EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
      ).bind(
        uuid(), orderId, snapshot(s.product_slug), s.dims_json, s.options_json,
        s.qty, s.line_total ?? 0, parentOrderLineId.get(s.parent_line_id), s.segment_seq,
        s.qty_per_parent, s.selected_variant_id, orderId,
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
          AND EXISTS (SELECT 1 FROM "order" WHERE id=?)`,
    ).bind(projectId, orderId),
  ];
  try {
    const committed = await env.DB.batch(stmts);
    // The order insert + final project transition are the commit proof.
    if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
        Number(committed[committed.length - 1]?.meta?.changes ?? 0) !== 1) {
      return null;
    }
    return orderId;
  } catch {
    // Rolled back — lost the race (duplicate order / number collision). The
    // project is untouched and stays re-acceptable, so the caller returns 409.
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
