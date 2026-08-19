// Split candidates — a split competes in the SAME ranking as a single unit
// (D7, design §7). It is never a post-pass rework of a pick already made, which
// is what `materialiseSplits` used to be and precisely what D7 forbids.
//
// WHY THIS MODULE EXISTS SEPARATELY FROM THE COMPOSITE SELECTOR
//
// Splits exist to solve DIMENSIONAL limits, and nothing else. A fixed lite is
// thermally better than an awning, so "awning + fixed" meets an awning's band
// more easily than an awning can — and if a thermal miss could open the gate,
// the estimator would learn to split its way out of every requirement it could
// not otherwise meet, quoting mullions nobody asked for. So the gate is a
// separate, tiny, structural thing: it reads a drawing instruction and a fit
// fact, and it has no parameter through which a requirement could arrive.

/** One evaluated single-unit configuration, as the gate needs to see it. */
interface FitEvidence {
  outcome: { passed: boolean };
  fit: { fits: boolean };
}

/**
 * May this opening be answered by a split at all? (AC-17, AC-18, AC-19.)
 *
 * Exactly two openers, both of them dimensional or documentary:
 *   (a) the drawings or schedule imply one — a comment matching the multi-unit
 *       vocabulary, an "OFFSET AWNING" type, or an energy report carrying
 *       per-unit components; or
 *   (b) no single unit fits the opening.
 *
 * AC-18 holds BY CONSTRUCTION: there is no requirement, deviation or tier in
 * this signature, so no thermal fact can reach the decision. That is the whole
 * design of the function — a later reader cannot accidentally add the wrong
 * condition to a thing that has nothing to add it to.
 *
 * A candidate that fits but failed a hard constraint proves nothing about
 * whether one unit can serve the opening, so it does not close the gate.
 */
export function splitsAreEligible(
  hint: unknown | null,
  evaluation: { rows: FitEvidence[] },
): boolean {
  if (hint) return true;
  return !evaluation.rows.some((row) => row.outcome.passed && row.fit.fits);
}
