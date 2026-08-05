// ═══════════════════════════════════════════════════════════════════════════════
// DRAFTING CONVENTIONS — the interpretation layer, as data
//
// A `SymbolObservation` is convention-free: "two diagonals meeting at the top
// edge". Turning that into "awning" requires knowing what this practice means by
// it, and practices differ. So the meaning lives here, as a profile that can be
// read off a sheet's own legend, confirmed by a human, and stored — never as a
// switch statement compiled into the reader.
//
// THE READER AND THE WRITER SHARE THIS FILE. src/components/quote-project/
// Elevation.tsx draws composites using the same legend; if the two ever disagree
// the app would render a window differently from the drawing it was read from,
// and nobody would notice because both would look internally consistent.
//
// ─── The owner's decision on mismatches (Q4c) ─────────────────────────────────
// When a set is drawn to a different convention we do NOT auto-flip and carry on.
// A systematic error wearing a confident face is the worst outcome available. We
// withdraw every drawing-derived split for that set, ask once, and store the
// human's answer against the producer so the next job from that practice is read
// correctly without asking again.
// ═══════════════════════════════════════════════════════════════════════════════
import type { PanelClass, SymbolObservation } from "./types";

/** What the apex of a chevron points AT.
 *
 *  The Australian residential convention this platform already draws to: the V
 *  points at the HINGE. Some European sets point it at the opening edge, which
 *  inverts every casement hand and turns an awning into a hopper. */
export type ApexMeaning = "hinge" | "opening_edge";

/** Which side of the building an elevation is drawn from. Everything about
 *  left/right — casement hand, slider travel, the order of an asymmetric
 *  composite — inverts with this. */
export type ViewBasis = "outside" | "inside";

export interface SymbolProfile {
  id: string;
  /** Human-readable, for the ops surface: "AS 1288 residential (default)". */
  label: string;
  apexMeans: ApexMeaning;
  defaultViewBasis: ViewBasis;
  /** True when a dashed symbol means "opens away from the viewer". */
  dashedMeansAway: boolean;
  /** Confirmed by a person, against a real set. An unconfirmed profile may be
   *  used to READ but never to auto-apply. */
  confirmed: boolean;
  /** PDF Producer/Creator strings and title-block firm names this profile was
   *  confirmed against, so the next job from the same practice is recognised. */
  producerHints: string[];
}

/** The default, and the one Elevation.tsx already draws to.
 *
 *  Its legend, verbatim from that file: unmarked = fixed; the V's apex is the
 *  hinge; a single-headed arrow shows travel; solid opens toward the viewer and
 *  dashed opens away. */
export const DEFAULT_PROFILE: SymbolProfile = {
  id: "au-residential-v1",
  label: "Australian residential (default)",
  apexMeans: "hinge",
  defaultViewBasis: "outside",
  dashedMeansAway: true,
  confirmed: true,
  producerHints: [],
};

/** THE THREE CLASSES v1 IS ALLOWED TO CLAIM.
 *
 *  Each is convention-independent, which is exactly why these three and no more:
 *
 *    fixed     absence of marks. No convention is required to read nothing.
 *    sliding   a horizontal arrow — a distinct glyph, not a chevron, so it
 *              cannot be confused with an operable sash under any convention.
 *    operable  any diagonal or chevron. WHICH operable family it is comes from
 *              the schedule's type column, which is text.
 *
 *  Awning-versus-hopper and casement hand are observed and recorded in the
 *  SymbolObservation, and are deliberately not priced from the drawing until a
 *  profile has been confirmed for the producer. Reading a hinge edge wrong is
 *  invisible in the total and visible on site. */
export function classify(o: SymbolObservation): { klass: PanelClass; clarity: number } {
  if (o.marks === "none") return { klass: "fixed", clarity: o.clarity };
  if (o.marks === "arrows" && o.arrowAxis === "horizontal") {
    return { klass: "sliding", clarity: o.clarity };
  }
  if (o.marks === "diagonals" || o.marks === "louvre_bars" || o.marks === "mixed") {
    return { klass: "operable", clarity: o.clarity };
  }
  // A vertical arrow is a double-hung sash travelling up. Recorded as operable
  // rather than guessed at: the family still comes from the schedule.
  return { klass: "operable", clarity: Math.min(o.clarity, 0.5) };
}

/** The refinement a CONFIRMED profile buys: which operable family the symbol
 *  actually names. Returns null when the observation does not settle it — the
 *  caller then falls back to the schedule's type text, which is the safe answer
 *  and the one v1 uses everywhere.
 *
 *  Deliberately separate from classify(): classify is what we always trust, this
 *  is what we trust only once a human has confirmed how this practice draws. */
export function refineOperable(o: SymbolObservation, profile: SymbolProfile): string | null {
  if (!profile.confirmed || o.marks !== "diagonals" || !o.apexEdge) return null;
  if (o.midRail && o.apexCount === 2) return "double-hung";
  if (profile.apexMeans === "hinge") {
    if (o.apexEdge === "top") return "awning";
    if (o.apexEdge === "bottom") return "hopper";
    return "casement";
  }
  // apexMeans === "opening_edge" inverts the vertical pair.
  if (o.apexEdge === "bottom") return "awning";
  if (o.apexEdge === "top") return "hopper";
  return "casement";
}

/** How many openings must disagree with their non-drawing source, IN THE SAME
 *  DIRECTION, before we call it a convention mismatch rather than N mistakes.
 *
 *  Three is the smallest number at which "same direction" is meaningfully
 *  unlikely by chance, and the cost of the false positive is one question. */
export const MISMATCH_QUORUM = 3;
