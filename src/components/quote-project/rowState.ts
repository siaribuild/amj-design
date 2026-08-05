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
  compositeAcrossFault, missingRequiredOptions,
} from "../../data/configurator";

export type RowState =
  /** Priced/complete, or carrying only technical flags. No badge, no action. */
  | { kind: "none" }
  /** The customer must supply something before this line can be quoted.
   *  `label` is the CHIP; `reason` is the sentence in the panel. They are two
   *  different lengths of the same statement, and the chip is not always
   *  "Incomplete": an opening whose unit is the wrong size is not incomplete,
   *  it is inconsistent — and its child says "Check size", so the parent saying
   *  something else made one fault read as two. */
  | { kind: "needs-input"; label: string; reason: string }
  /** Neutral attribute, not a warning. */
  | { kind: "composite"; units: number }
  /** A generated arrangement the customer should confirm. See O1 below. */
  | { kind: "confirm-layout"; units: number; deltaMm?: number | null };

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
    return { kind: "needs-input", ...blockingFault(item, duplicate) };
  }

  const units = compositeUnitCount(item);
  if (units > 0) {
    // A size fault reaches the needs-input branch above via
    // lineBlocksSubmission, so by here the composite reconciles. What is left is
    // the layout question the state was reserved for.
    // O1's missing trigger, now supplied: the units no longer add up to the
    // opening they were split out of. This is the reason code the state was
    // reserved for and could not previously name — it is not `fit` (which fires
    // for every oversized opening and would badge most composites), it is a
    // reconciliation failure between the dimensions that were set or parsed and
    // the sum of the parts, which is exactly what manual splitting and adding or
    // removing units can break. The server owns the tolerance and sends the
    // verdict; a well-formed split reads 0 and never badges.
    const flagged = item.coverageOutOfTolerance
      || Object.keys(item.review ?? {}).some((k) => CONFIRM_LAYOUT_REASON_KEYS.includes(k));
    return flagged
      ? { kind: "confirm-layout", units, deltaMm: item.coverageDeltaMm ?? null }
      : { kind: "composite", units };
  }

  // Everything else — including every warning-severity reason (glazing, material,
  // substitute, fit, thermal recommendation, a resolved document difference) —
  // is suppressed. Those are priced, submittable, and ours to confirm.
  return { kind: "none" };
}

/** The chip and the sentence, together, so the two can never disagree about
 *  which fault they are describing. Reuses the estimator's own per-field wording
 *  where it exists rather than inventing customer copy. */
function blockingFault(item: QItem, duplicate: boolean): { label: string; reason: string } {
  const incomplete = (reason: string) => ({ label: "Incomplete", reason });
  if (duplicate) return incomplete("Item ID already used");
  const errors = Object.entries(item.review ?? {})
    .filter(([key]) => severityOf(key) === "error")
    .map(([, reason]) => reason);
  if (errors.length) return incomplete(errors[0]);
  // Name the option, not the fact that one is missing. "Choose a colour" is
  // actionable from the row; "we need a little more detail" sends someone into
  // the editor to find out what.
  const missing = missingRequiredOptions(item);
  if (missing.length) {
    return incomplete(missing.length === 1
      ? `Choose ${missing[0].toLowerCase()}`
      : `Choose ${missing.slice(0, -1).map((m) => m.toLowerCase()).join(", ")} and ${missing[missing.length - 1].toLowerCase()}`);
  }
  // Named before the generic fallbacks, and named as geometry rather than as a
  // process: "the units do not fit" is checkable against the numbers on screen.
  // "Check size", NOT "Incomplete" — the same words its child uses, because it
  // is the same fault seen from one level up. Nothing about this opening is
  // missing; a unit disagrees with it about a number.
  if (compositeAcrossFault(item)) {
    return {
      label: "Check sizes",
      reason: item.compositeAxis === "horizontal"
        ? "A unit is a different width to this opening"
        : "A unit is a different height to this opening",
    };
  }
  if (!item.productSlug) return incomplete("Choose a product");
  if (!parseInt(item.width) || !parseInt(item.height)) return incomplete("Enter the opening size");
  return incomplete("We need a little more detail to price this");
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
