// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE-PROJECT — COLLAPSED-ROW STATE MAPPING
//
// Plan §6. The three customer-facing row states are a PURE, DETERMINISTIC
// function of data that already exists. This matters beyond tidiness: the whole
// point of /quote-project is an A/B against /quote, and if the review-reason
// bucket were hand-triaged to make this arm look calmer we would be comparing
// "new presentation + a bespoke re-triage" — a confounded experiment whose
// result cannot be attributed to the interaction model.
//
// So: no new taxonomy, no per-line judgement calls, and the blocking predicate
// is the SAME lineBlocksSubmission the sticky counter and the server already
// use. Submit gates are unchanged by construction.
//
// The governing rule: a line is visually exceptional ONLY when the customer can
// meaningfully act on it. Technical review is a service promise, not a customer
// exception — it is explained once at submission, never as a per-line warning.
// ═══════════════════════════════════════════════════════════════════════════════
import {
  type QItem, hasDuplicateCode, lineBlocksSubmission, severityOf,
} from "../../data/configurator";

export type RowState =
  /** Priced/complete, or carrying only technical flags. No badge, no action. */
  | { kind: "none" }
  /** The customer must supply something before this line can be quoted. */
  | { kind: "needs-input"; reason: string }
  /** Neutral attribute, not a warning. */
  | { kind: "composite"; units: number }
  /** A generated arrangement the customer should confirm. See O1 below. */
  | { kind: "confirm-layout"; units: number };

// ─── O1: the `Confirm layout` trigger, deliberately inert ─────────────────────
// The brief reserves `Confirm layout` for "a generated composite that conflicts
// with an authoritative source, or another non-standard arrangement". The
// existing review vocabulary (REVIEW_SEVERITY) has no code that means that:
// `fit` fires for EVERY oversized opening, so wiring it here would badge most
// composites and re-create the per-line noise this route exists to remove.
//
// The state and its treatment are built; the trigger stays empty until eng
// designates a real reason code. Empty ⇒ no line ever resolves to it, so submit
// gates and the A/B stay untouched. Add the code here to switch it on.
export const CONFIRM_LAYOUT_REASON_KEYS: readonly string[] = [];

/**
 * A composite unit's reference, derived from its parent: W1 → W1A, W1B, W1C.
 *
 * "Unit 1" is a position in a list; W1A is a name the customer can say on the
 * phone and find on a schedule. The parent code is the reference everything else
 * on this line already uses, so the units belong to it visibly rather than
 * carrying a second, unrelated numbering.
 *
 * Falls back to "Unit N" only when the parent has no code to derive from.
 */
export function unitLabel(parentCode: string, index: number): string {
  const code = (parentCode || "").trim();
  return code ? `${code}${letterSuffix(index)}` : `Unit ${index + 1}`;
}

/** 0→A … 25→Z, 26→AA. Spreadsheet-style, so a 27-unit opening still reads. */
function letterSuffix(index: number): string {
  let suffix = "";
  let n = index;
  do {
    suffix = String.fromCharCode(65 + (n % 26)) + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return suffix;
}

/** How many physical units a composite parent is built from. Mirrors the count
 *  used by the existing composite panel, so the two can never disagree. */
export const compositeUnitCount = (item: QItem): number =>
  (item.segments ?? []).reduce((n, s) => n + Math.max(1, s.qtyPerParent), 0);

export const isComposite = (item: QItem): boolean => compositeUnitCount(item) > 0;

/**
 * The single mapping. Order is significant — a blocking line is a blocker first
 * and a composite second, because that is the only state the customer can act on.
 */
export function rowStateFor(item: QItem, items: QItem[]): RowState {
  const duplicate = hasDuplicateCode(items, item.id, item.code);
  if (lineBlocksSubmission(item) || duplicate) {
    return { kind: "needs-input", reason: blockingReason(item, duplicate) };
  }

  const units = compositeUnitCount(item);
  if (units > 0) {
    const flagged = Object.keys(item.review ?? {})
      .some((k) => CONFIRM_LAYOUT_REASON_KEYS.includes(k));
    return flagged ? { kind: "confirm-layout", units } : { kind: "composite", units };
  }

  // Everything else — including every warning-severity reason (glazing, material,
  // substitute, fit, thermal recommendation, a resolved document difference) —
  // is suppressed. Those are priced, submittable, and ours to confirm.
  return { kind: "none" };
}

/** A concise reason for the `Needs your input` badge. Reuses the estimator's own
 *  per-field wording where it exists rather than inventing customer copy. */
function blockingReason(item: QItem, duplicate: boolean): string {
  if (duplicate) return "Item ID already used";
  const errors = Object.entries(item.review ?? {})
    .filter(([key]) => severityOf(key) === "error")
    .map(([, reason]) => reason);
  if (errors.length) return errors[0];
  if (!item.productSlug) return "Choose a product";
  if (!parseInt(item.width) || !parseInt(item.height)) return "Enter the opening size";
  return "We need a little more detail to price this";
}

/** Which drawer field `Fix details` should land on, so the action opens the
 *  editor AT the problem rather than merely expanding the row (plan §7.4). */
export type FixTarget = "product" | "dims" | "options" | "qty" | "code";

export function fixTargetFor(item: QItem, items: QItem[]): FixTarget {
  if (hasDuplicateCode(items, item.id, item.code)) return "code";
  const keys = Object.keys(item.review ?? {}).filter((k) => severityOf(k) === "error");
  if (keys.includes("product") || !item.productSlug) return "product";
  if (keys.includes("dims") || !parseInt(item.width) || !parseInt(item.height)) return "dims";
  if (keys.includes("options")) return "options";
  if (keys.includes("qty")) return "qty";
  return "dims";
}
