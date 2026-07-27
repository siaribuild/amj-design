// One job, one lifecycle.
//
// A project, its issued quote revisions and its order are the same job at
// different moments — `order` is 1:1 with `project`, and the split is storage
// rather than domain. This module derives the things every ops surface needs to
// say about that job, so the record plane and the list cannot drift apart:
//
//   phase        — which of the six coarse segments the job is in
//   stateLabel   — the precise state, in words, under the phase
//   waitingOn    — us, the customer, or nobody
//
// The six phases are deliberately coarse. The underlying vocabulary is ~9
// internal quote states plus 12 order stages, and a 21-step tracker is a product
// tour rather than information. The phase orients; the state label is the detail.
import { STAGE_LABEL, STAGES, type Stage } from "./orders";

export const PHASES = ["Intake", "Pricing", "Issued", "Accepted", "Production", "Delivered"] as const;
export type Phase = (typeof PHASES)[number];

/** Order stage → phase. Everything from acceptance onward is keyed on the order,
 *  because once an order exists it is the more precise account of where the job is. */
const STAGE_PHASE: Record<Stage, Phase> = {
  deposit_invoiced: "Accepted", deposit_paid: "Accepted",
  drawings_shared: "Accepted", drawings_signed_off: "Accepted",
  manufacturing: "Production", qa_photos_shared: "Production",
  balance_invoiced: "Production", balance_paid: "Production", customer_confirmed: "Production",
  dispatched: "Delivered", delivered: "Delivered", after_sales: "Delivered",
};

/** Internal quote state → phase, for a job that has not reached an order. */
const INTERNAL_PHASE: Record<string, Phase> = {
  draft: "Intake", submitted: "Intake", triage_pending: "Intake",
  estimator_assigned: "Pricing", technical_review_required: "Pricing",
  customer_clarification_required: "Pricing",
  // Approval states are legacy (the rules engine is being removed); a job sitting
  // in one is still, in every sense that matters, in pricing.
  approval_pending: "Pricing", approved_for_issue: "Pricing",
  issued: "Issued",
  // Set when a revision is accepted. The order normally takes over from here, so
  // this is the belt-and-braces path for a project without an order row.
  converted_to_order: "Accepted",
};

/** States where the ball is in the CUSTOMER's court. Everything else is ours —
 *  which is the whole point of the column: "what do I touch next". */
const CUSTOMER_WAITS = new Set([
  "customer_clarification_required", "issued",
  "drawings_shared", "deposit_invoiced", "balance_invoiced", "balance_paid",
]);

export interface Lifecycle {
  phase: Phase;
  phaseIndex: number;
  /** The precise state, in words — shown under the phase, never instead of it. */
  stateLabel: string;
  waitingOn: "Us" | "Customer" | "Nobody";
}

export function lifecycleOf(args: {
  statusInternal: string;
  statusCustomer: string;
  orderStage?: string | null;
}): Lifecycle {
  const stage = args.orderStage && (STAGES as readonly string[]).includes(args.orderStage)
    ? (args.orderStage as Stage) : null;

  const phase = stage
    ? STAGE_PHASE[stage]
    : INTERNAL_PHASE[args.statusInternal] ?? (args.statusCustomer === "accepted" ? "Accepted" : "Intake");

  const key = stage ?? args.statusInternal;
  const waitingOn = stage === "after_sales" ? "Nobody" : CUSTOMER_WAITS.has(key) ? "Customer" : "Us";

  return {
    phase,
    phaseIndex: PHASES.indexOf(phase),
    stateLabel: stage ? STAGE_LABEL[stage] : (INTERNAL_LABEL[args.statusInternal] ?? args.statusInternal),
    waitingOn,
  };
}

// Mirrors STATUS_INTERNAL_LABEL in routes/ops.ts. Duplicated here rather than
// imported to keep this module free of route dependencies; if they ever disagree,
// this one is the lifecycle's own vocabulary and the route should follow it.
const INTERNAL_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", triage_pending: "Awaiting triage",
  estimator_assigned: "Pricing", technical_review_required: "Technical review",
  approval_pending: "Approval pending", approved_for_issue: "Ready to issue",
  customer_clarification_required: "Awaiting customer", issued: "Quote issued",
  converted_to_order: "Accepted — order raised",
};

/** Whole days since an ISO/SQLite timestamp. Used for "days in stage", which is
 *  what makes a queue sortable by neglect rather than by recency. */
export function daysSince(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const t = Date.parse(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
