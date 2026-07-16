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
    drawingsSignedOffAt: o.drawings_signed_off_at,
    qaConfirmedAt: o.qa_confirmed_at,
    createdAt: o.created_at,
    payments: payments.map((p) => ({
      kind: p.kind, amount: p.amount, percent: p.percent, status: p.status,
      reference: p.reference, invoicedAt: p.invoiced_at, paidAt: p.paid_at,
    })),
  };
}

// Create an order from an accepted revision: snapshot lines, split payments 50/50,
// invoice the deposit now (balance invoiced later, at the QA stage).
export async function createOrderFromRevision(
  env: Env, revisionId: string, projectId: string,
): Promise<string> {
  const { results: revLines } = await env.DB
    .prepare("SELECT external_ref, product_snapshot_json, qty, line_total FROM revision_line WHERE revision_id = ?")
    .bind(revisionId).all<{ external_ref: string | null; product_snapshot_json: string; qty: number; line_total: number }>();

  const total = revLines.reduce((s, l) => s + (l.line_total || 0), 0);
  const deposit = Math.round(total * DEPOSIT_PERCENT / 100);
  const balance = Math.round((total - deposit) * 100) / 100;

  const orderId = uuid();
  const countRow = await env.DB.prepare('SELECT count(*) AS n FROM "order"').first<{ n: number }>();
  const orderNo = `AMJ-${58000 + ((countRow?.n ?? 0) + 1)}`;

  const stmts = [
    env.DB.prepare(
      `INSERT INTO "order" (id, project_id, accepted_revision_id, order_no, total, stage)
       VALUES (?, ?, ?, ?, ?, 'deposit_invoiced')`,
    ).bind(orderId, projectId, revisionId, orderNo, total),
    // deposit invoiced now; balance created but not yet invoiced (invoiced_at NULL)
    env.DB.prepare(
      "INSERT INTO payment (id, order_id, kind, amount, percent, status, invoiced_at) VALUES (?, ?, 'deposit', ?, ?, 'due', datetime('now'))",
    ).bind(uuid(), orderId, deposit, DEPOSIT_PERCENT),
    env.DB.prepare(
      "INSERT INTO payment (id, order_id, kind, amount, percent, status) VALUES (?, ?, 'balance', ?, ?, 'due')",
    ).bind(uuid(), orderId, balance, 100 - DEPOSIT_PERCENT),
    ...revLines.map((l) =>
      env.DB.prepare(
        "INSERT INTO order_line (id, order_id, external_ref, product_snapshot_json, qty, line_total) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(uuid(), orderId, l.external_ref, l.product_snapshot_json, l.qty, l.line_total),
    ),
    env.DB.prepare("UPDATE quote_revision SET snapshot_status = 'accepted', accepted_at = datetime('now') WHERE id = ?").bind(revisionId),
    env.DB.prepare("UPDATE project SET status_customer = 'closed', updated_at = datetime('now') WHERE id = ?").bind(projectId),
  ];
  await env.DB.batch(stmts);
  return orderId;
}
