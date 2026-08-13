// What a staffer can do to a job right now, derived server-side.
//
// The record plane shows ONE primary action — the single move that advances this
// job from here — with everything else outlined or behind an overflow. Deriving
// that here rather than in the console keeps the two honest: the Worker refuses
// what the UI hides, and the UI cannot offer what the Worker would reject.
//
// The distinction that matters:
//   • INAPPLICABLE actions are omitted. Roughly 15 actions span 21 states; showing
//     the inapplicable ones disabled produces a permanently grey toolbar, which
//     teaches people to stop reading the toolbar.
//   • BLOCKED actions are returned WITH a reason. "Issue reviewed quote" must stay
//     visible when three lines are unpriced, saying so — hiding it makes the
//     console look broken to someone who expects it.
import { availableActions, type OrderRow } from "./orders";

export type ActionTier = "primary" | "secondary" | "overflow";

export interface OpsAction {
  /** `status:<state>` | `start-pricing` | `issue-revision` | `request-clarification`
   *  | `note` | `advance:<transition>` | `pay:<kind>` */
  id: string;
  label: string;
  tier: ActionTier;
  /** Present when the action applies but cannot run yet. Shown, disabled, with
   *  this sentence beside it. */
  blockedReason?: string;
  /** Moves money or emails the customer ⇒ the console confirms in place first. */
  confirm?: string;
}

export function actionsFor(args: {
  statusInternal: string;
  order: OrderRow | null;
  unresolvedLines: number;
  customerEmail: string | null;
  /** project.delivery_amount == null — the issue gate's other half (C7,
   *  design doc §6.4/§7.2). Never a truthiness check upstream of this: 0 is
   *  settled (a trade waiver), only NULL is unset. */
  deliveryUnset: boolean;
}): OpsAction[] {
  const out: OpsAction[] = [];

  // ── Post-acceptance: the order's own stage machine is the authority ───────
  if (args.order) {
    const available = availableActions(args.order);
    available.forEach((a, i) => {
      const isPay = a.action.startsWith("pay:");
      out.push({
        id: isPay ? a.action : `advance:${a.action}`,
        label: a.label,
        tier: i === 0 ? "primary" : "secondary",
        confirm: isPay
          ? "Records the payment as received. The customer sees it on their record."
          : undefined,
      });
    });
    out.push({ id: "note", label: "Add a note", tier: "secondary" });
    return out;
  }

  // ── Pre-acceptance: the quote's internal workflow ─────────────────────────
  if (args.statusInternal === "submitted" || args.statusInternal === "triage_pending") {
    // This is what /assign used to do as a side effect of setting an owner. With
    // owners gone it stands on its own — and it must, or a submitted quote has no
    // route into pricing at all.
    out.push({ id: "start-pricing", label: "Start pricing", tier: "primary" });
  } else if (args.statusInternal === "estimator_assigned" || args.statusInternal === "technical_review_required") {
    out.push({
      id: "issue-revision", label: "Issue reviewed quote", tier: "primary",
      // Lines report first when both are wrong — lines are the reviewer's
      // actual work, delivery is one field, and surfacing the trivial
      // blocker while hiding the substantial one trains people to distrust
      // the gate.
      blockedReason: args.unresolvedLines > 0
        ? `${args.unresolvedLines} line${args.unresolvedLines === 1 ? " is" : "s are"} unpriced or unresolved`
        : args.deliveryUnset
          ? "Delivery has not been set on this project — enter a figure, or 0, in the Delivery panel."
          : undefined,
      confirm: `Freezes this quote as a new revision and emails it to ${args.customerEmail ?? "the customer"}.`,
    });
    if (args.statusInternal === "estimator_assigned") {
      out.push({ id: "status:technical_review_required", label: "Send to technical review", tier: "secondary" });
    } else {
      out.push({ id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" });
    }
  } else if (args.statusInternal === "customer_clarification_required") {
    out.push({ id: "status:estimator_assigned", label: "Resume pricing", tier: "primary" });
  }

  if (args.statusInternal !== "issued") {
    out.push({
      id: "request-clarification", label: "Request clarification", tier: "secondary",
      confirm: `Emails ${args.customerEmail ?? "the customer"} and pauses the quote until they reply.`,
    });
  }
  out.push({ id: "note", label: "Add a note", tier: "secondary" });
  return out;
}
