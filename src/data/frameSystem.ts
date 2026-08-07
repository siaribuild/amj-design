// ═══════════════════════════════════════════════════════════════════════════════
// FRAME SYSTEMS — the extrusion platform a product is built on, and the rule for
// whether two of them may sit in one opening.
//
// It lives HERE, beside the catalogue, because three places need the same answer
// and none of them may disagree: the estimator choosing a composite's units, the
// server refusing a customer's incompatible unit, and the product picker that
// decides what the customer is offered in the first place. A picker that offers
// what the server then rejects is a dead end with no explanation, and two copies
// of a rule are two rules.
//
// The rule, in full:
//   1. Same system ⇒ compatible. No authoring needed, and it is the answer for
//      every system that makes its own fixed lite.
//   2. Otherwise compatible only if one of the two systems NAMES the other.
//      Symmetric — an edge is a fact about the joint, not about one side of it.
//   3. UNKNOWN NEVER BLOCKS. A product with no system is untagged, not
//      unpairable. The feature is gated on the catalogue being tagged by hand,
//      and an absent fact must never cost a line.
//
// Design: docs/product-compatibility-design.md.
// ═══════════════════════════════════════════════════════════════════════════════

/** How firmly one system's editor stands behind coupling with another. Absent
 *  from the list entirely ⇒ not compatible; SAME system needs no edge at all. */
export type FrameSystemAffinity = "preferred" | "allowed";

export interface FrameSystemEdge {
  /** The partner system's slug (sys-80, sys-100 …). */
  slug: string;
  severity: FrameSystemAffinity;
}

export interface FrameSystem {
  /** Depth-based and permanent — it is frozen into configuration snapshots. */
  slug: string;
  name: string | null;
  /** Empty is the DEFAULT and means "same system only", which is the right answer
   *  for every system that makes its own fixed lite. Never a gap to be filled in
   *  by inference: an unauthored edge is a decision the manufacturer has not made. */
  compatibleWith: FrameSystemEdge[];
}

/** `same` needs no authored edge; `preferred`/`allowed` come from one;
 *  `incompatible` is a tagged pair with no edge; `unknown` is at least one
 *  untagged product. */
export type CompatibilityVerdict = "same" | FrameSystemAffinity | "incompatible" | "unknown";

const edgeTo = (from: FrameSystem | null | undefined, toSlug: string): FrameSystemAffinity | null =>
  from?.compatibleWith?.find((e) => e.slug === toSlug)?.severity ?? null;

export function areSystemsCompatible(
  a: FrameSystem | null | undefined,
  b: FrameSystem | null | undefined,
): CompatibilityVerdict {
  if (!a?.slug || !b?.slug) return "unknown";
  if (a.slug === b.slug) return "same";
  // Either side may carry the edge, and `preferred` on one outranks `allowed` on
  // the other — a partner an editor singled out is not demoted because the
  // reciprocal row was left at its default.
  const severities = [edgeTo(a, b.slug), edgeTo(b, a.slug)].filter(Boolean);
  if (severities.includes("preferred")) return "preferred";
  if (severities.includes("allowed")) return "allowed";
  return "incompatible";
}

/** True when the pair may be built — INCLUDING the untagged case. Every
 *  enforcement point goes through this so "unknown never blocks" cannot be
 *  re-decided one caller at a time. */
export const systemsBuildableTogether = (
  a: FrameSystem | null | undefined,
  b: FrameSystem | null | undefined,
): boolean => areSystemsCompatible(a, b) !== "incompatible";

/** Whether a product may join a composite whose other units carry `siblings`.
 *  A unit with no siblings — the first one, or a composite nobody has tagged —
 *  is always allowed. */
export function fitsAlongside(
  candidate: FrameSystem | null | undefined,
  siblings: (FrameSystem | null | undefined)[],
): boolean {
  return siblings.every((s) => systemsBuildableTogether(candidate, s));
}
