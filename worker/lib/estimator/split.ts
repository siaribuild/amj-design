// Composite split proposal (thermal rework WS5, owner spec 2026-07-31).
//
// A large opening is delivered as a COMPOSITE of coupled units. WHO splits and
// HOW is a human/design decision, so the platform only PROPOSES a split — a
// starting point the reviewer corrects — and every proposal is review-flagged.
//
// Precedence for the proposed layout:
//   1. schedule COMMENT (authoritative) — e.g. "2x 600mm WIDE AWNINGS" means two
//      600mm awnings with the remainder as a fixed lite: awning|fixed|awning.
//   2. learned practice (future — reviewer-outcome model once data exists).
//   3. 50/50 default — split the width into two equal units of the requested
//      operation.
//
// Deliberately NOT modelled (owner: not an authoritative thermal/joinery tool):
// mullion/jamb allowances. Widths partition the opening exactly; the reviewer
// owns the engineering.
import type { OpeningInput } from "./types";
import type { FamilyDefaultSplit } from "../../../src/data/catalogue";
import { proposePairedLayout } from "./pairing";
import type { EnergyRequirementV1 } from "../ai/schema";

// Operation vocabulary the comment parser recognises. Fixed is the passive lite
// used to fill the remainder around operable units.
const OPERATIONS = ["awning", "fixed", "sliding", "casement", "hinged", "louvre", "stacker", "bifold", "double-hung", "tilt-turn"];
const OP_ALIASES: Record<string, string> = {
  "bi-fold": "bifold", "bi fold": "bifold",
  // Every spelling a person actually types. "tilt&turn" alone was unreachable:
  // normOp collapses whitespace but does not remove it, so "TILT & TURN" — the
  // form with the spaces, which is how it is written — matched nothing and the
  // unit was silently dropped. Same for "DOUBLE HUNG": the hyphenated form is in
  // OPERATIONS and the spaced form matched nothing.
  "tilt&turn": "tilt-turn", "tilt & turn": "tilt-turn", "tilt turn": "tilt-turn", "tilt and turn": "tilt-turn",
  "double hung": "double-hung", "doublehung": "double-hung",
  "awnings": "awning", "windows": "fixed",
  // The trade's own shorthand, and the wording our OWN extraction prompt shows
  // the model as an example ("600 awn / fix / 600 awn") — which the parser could
  // not read back.
  "awn": "awning", "fix": "fixed", "csmt": "casement",
};

const normOp = (raw: string): string | null => {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (OP_ALIASES[s]) return OP_ALIASES[s];
  const singular = s.endsWith("s") ? s.slice(0, -1) : s;
  if (OPERATIONS.includes(s)) return s;
  if (OPERATIONS.includes(singular)) return singular;
  return null;
};

// A schedule comment is written by a person, and people write "AWNING + FIXED +
// AWNING." with a full stop, "W04: AWNING + FIXED", and "AMJ100T AWNING". The
// parser used to require the CLEANED FRAGMENT TO BE the operation, whole, so
// every one of those dropped the unit silently and the opening fell through to
// an even split of the wrong thing. So: find the operation INSIDE the fragment.
//
// The one word held back from that search is the generic noun. "2x 600mm WIDE
// WINDOWS" means two fixed panes, but "obscure glass to windows" is a glazing
// note about the whole line — so a generic term counts only when it is the
// entire descriptor, never when found among other words.
const GENERIC_TERMS = new Set(["window", "windows"]);

function findOperation(fragment: string): string | null {
  const cleaned = fragment.toLowerCase().normalize("NFKC")
    .replace(/[^a-z&-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const whole = normOp(cleaned);
  if (whole) return whole;
  // Longest phrase first, so "double hung" is never read as the bare "hung",
  // and "tilt & turn" is not three failed single words.
  const words = cleaned.split(" ");
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(" ");
      if (size === 1 && GENERIC_TERMS.has(phrase)) continue;
      const op = normOp(phrase);
      if (op) return op;
    }
  }
  return null;
}

/** Count and per-unit width stated inside one fragment, in the forms a schedule
 *  uses: "2 x 600mm", "2x600", "2 No.", "AWNING x2", "AWNING 900". */
function readCountAndWidth(fragment: string): { count: number; widthMm: number | null } {
  const s = fragment.toLowerCase().normalize("NFKC").replace(/[×✕]/g, "x");
  const countWidth = /(\d{1,4})\s*x\s*(\d{2,4})\s*(?:mm)?\b/.exec(s);
  if (countWidth) return { count: clampCount(countWidth[1]), widthMm: parseInt(countWidth[2], 10) };
  // "2 x", "x 2", and the estimator's-quantity form "2 No." / "2No".
  const count = /(\d{1,4})\s*x\b/.exec(s) ?? /\bx\s*(\d{1,4})\b/.exec(s) ?? /(\d{1,4})\s*nos?\.?(?=\s|$)/.exec(s);
  // A bare number is a width only at 3-4 digits: "AWNING 900" is a width,
  // the "04" of "W04" is not, and "AMJ100T" has no word boundary around its
  // digits so it never reads as one.
  const width = /\b(\d{2,4})\s*mm\b/.exec(s) ?? /\b(\d{3,4})\b/.exec(s);
  return { count: count ? clampCount(count[1]) : 1, widthMm: width ? parseInt(width[1], 10) : null };
}

const clampCount = (raw: string): number => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(Math.max(1, n), MAX_HINT_UNITS + 1) : 1;
};

/** The most units a COMMENT can credibly describe.
 *
 *  This is a safety bound, not a style rule. parseSplitHint is fed raw document
 *  text (pipeline.ts passes `l.notes` straight in), so the count in "9999999 x
 *  600mm AWNINGS" was an untrusted number that went unbounded into an array
 *  allocation: measured at 1.1 GB of heap and then a RangeError, uncaught, on a
 *  128 MB Worker. Below the throw was worse than the throw — "20000 x 600mm
 *  AWNINGS" SUCCEEDED in 4ms and the estimator then ran twenty thousand product
 *  selections before discarding every one. The LLM path is already clamped
 *  (schedule.ts); this is the same clamp for the deterministic path.
 *
 *  A comment claiming more than this is not a split instruction we can act on,
 *  so the hint is refused outright and the opening falls back to the even split,
 *  which is bounded by the product's own maximum width. */
const MAX_HINT_UNITS = 12;

/** Words that put one unit ABOVE another rather than beside it.
 *
 *  Everything below partitions the WIDTH. A comment describing a highlight over
 *  a fixed pane describes a partition of the HEIGHT, which this parser cannot
 *  express — SplitHint carries an axis but layoutFromHint only ever divides the
 *  width. Reading "FIXED + AWNING HIGHLIGHT ABOVE" as a side-by-side pair would
 *  state a confident, wrong make-up, so a stacked comment yields no hint at all
 *  and the opening keeps the caller's default. */
const STACKED = /\b(above|below|over|under|beneath|highlight|high[- ]?light|toplight|sub[- ]?light)\b/;

export interface SplitUnitHint {
  operation: string;
  count: number;
  /** Explicit per-unit width from the comment, when given. */
  widthMm: number | null;
  /** Exact height and source facts exist on report-defined components. */
  heightMm?: number | null;
  ref?: string | null;
  requirement?: EnergyRequirementV1 | null;
  performanceTypeId?: string | null;
  performanceDescription?: string | null;
  glazingNote?: string | null;
}
export interface SplitHint {
  units: SplitUnitHint[];
  raw: string;
  source?: "schedule_comment" | "energy_report";
  /** The energy report's components, carried alongside a PLAN-derived hint that
   *  won the geometry. Owner rule: the plan is the architectural contract and
   *  decides how an opening is divided; the report is the only document that
   *  carries a per-unit thermal target, and plans do not have them. So the two
   *  documents each supply what they are authoritative about, rather than one
   *  discarding the other. Never used to lay units out — only to attach targets
   *  to the units the plan already produced. */
  components?: SplitUnitHint[] | null;
  axis?: "vertical" | "horizontal";
}

/** Parse a schedule COMMENT into a split hint, or null when it describes no split.
 *  Handles the common trade shorthands:
 *    "2x 600mm WIDE AWNINGS"            → [{awning, count 2, width 600}]
 *    "AWNING + FIXED + AWNING"          → sequence, widths unknown
 *    "2 x 600 AWNING + FIXED"           → mixed */
export function parseSplitHint(comment: string | null | undefined): SplitHint | null {
  if (!comment) return null;
  const raw = comment.trim();
  // Written before any splitting: "and" is a separator here, so the one alias
  // that CONTAINS it ("TILT AND TURN") would otherwise be torn into two
  // fragments and both halves discarded.
  const hay = raw.toLowerCase().normalize("NFKC").replace(/\btilt\s*(?:and|&)\s*turn\b/g, "tilt-turn");
  if (STACKED.test(hay)) return null;

  // Pattern A: "<n> x <width>mm [wide] <operation>", repeatable, over the WHOLE
  // comment — this is the form that names several differently-sized groups in
  // one breath ("2x 600mm awnings 1x 900mm fixed") with no separator to split
  // on. It only wins when it finds more than one group; a single hit is left to
  // the fragment pass below, which reads the same text with more context.
  const units: SplitUnitHint[] = [];
  // `mm` is OPTIONAL, not "m with an optional second m" — /\s*mm?\s*/ required
  // at least one literal m, so "2 x 600 AWNING" (the form this function's own
  // docstring promises to handle) never matched here.
  const countWidth = /(\d{1,4})\s*[x×]\s*(\d{2,4})\s*(?:mm)?\s*(?:wide\s+)?([a-z][a-z &-]*?)(?=\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = countWidth.exec(hay)) !== null) {
    const op = findOperation(m[3]);
    if (op) units.push({ operation: op, count: clampCount(m[1]), widthMm: parseInt(m[2], 10) });
  }

  // Pattern B: one unit per fragment. Splitting first and reading the operation
  // WITHIN each fragment is what lets a label, a product code, a bare width or a
  // trailing qualifier sit beside the operation without erasing it.
  if (units.length < 2) {
    units.length = 0;
    for (const part of hay.split(/[+/,;]|\band\b/)) {
      const op = findOperation(part);
      if (!op) continue;
      const { count, widthMm } = readCountAndWidth(part);
      units.push({ operation: op, count, widthMm });
    }
  }

  if (!units.length) return null;
  // ONE unit is not a split. A line noted "FIXED" describes the whole window,
  // and treating it as a hint would force a proposal on an in-range opening —
  // shouldPropose returns true for any hint at all — and saw a perfectly normal
  // 900mm window in half.
  const total = units.reduce((n, u) => n + u.count, 0);
  if (total < 2 || total > MAX_HINT_UNITS) return null;
  return { units, raw };
}

export interface ProposedSegment {
  operation: string;
  widthMm: number;
  heightMm: number;
  ref?: string | null;
  requirement?: EnergyRequirementV1 | null;
  performanceTypeId?: string | null;
  performanceDescription?: string | null;
  glazingNote?: string | null;
}
export interface SplitProposal {
  segments: ProposedSegment[];
  /** Always 'vertical' here: coupled units partition the WIDTH, full height each. */
  axis: "vertical" | "horizontal";
  basis: "energy_report" | "schedule_comment" | "learned" | "default_pairing" | "default_even";
  /** ALWAYS true — a proposed split is a starting point, never a final answer. */
  reviewRequired: true;
  note: string;
}

/** True when an opening is a split candidate: it exceeds the given max product
 *  width, or the comment explicitly asks for a split. A normal-size opening with
 *  no comment is NOT split. */
export function shouldPropose(opening: { widthMm?: number | null }, hint: SplitHint | null, maxProductWidthMm: number | null): boolean {
  if (hint) return true;
  const w = opening.widthMm ?? 0;
  return maxProductWidthMm != null && w > maxProductWidthMm;
}

/** Place operable units symmetrically with a fixed lite filling the remainder:
 *  2 awnings → awning | fixed | awning. Odd counts keep the fixed central. */
function layoutFromHint(hint: SplitHint, totalWidthMm: number, heightMm: number, fallbackOp: string, maxWidthMm: number | null): ProposedSegment[] | null {
  // A width WE derive has to be buildable; a width the ARCHITECT stated is
  // theirs, and a disagreement with the opening is the coverage delta the
  // estimator already reports. So the product maximum bounds only the widths
  // this function invents, and only for units carrying the parent's operation —
  // a fixed lite is a different product with its own, wider maximum, which is
  // why the 2000mm lite in the owner's W4 example is not bound by an awning's
  // 1300mm limit.
  const derivedFits = (op: string, widthMm: number): boolean =>
    !(maxWidthMm && maxWidthMm > 0) || op === "fixed" || op !== fallbackOp || widthMm <= maxWidthMm;
  // An explicit report component schedule owns row order, operations and each
  // component's thermal facts. Architectural documents own the total opening
  // dimensions. Preserve primary-operation sizes where possible and absorb a
  // size disagreement into supplementary components (for example the fixed lite
  // in awning + fixed + awning).
  if (hint.source === "energy_report") {
    const expanded = hint.units.flatMap((unit) => Array.from({ length: Math.max(1, unit.count) }, () => ({
      operation: unit.operation || fallbackOp,
      widthMm: unit.widthMm ?? 0,
      heightMm: unit.heightMm ?? heightMm,
      ref: unit.ref ?? null,
      requirement: unit.requirement ?? null,
      performanceTypeId: unit.performanceTypeId ?? null,
      performanceDescription: unit.performanceDescription ?? null,
      glazingNote: unit.glazingNote ?? null,
    })));
    if (expanded.length < 2 || expanded.some((segment) => segment.widthMm <= 0 || segment.heightMm <= 0)) return null;
    return fitReportComponentsToOpening(expanded, hint.axis ?? "vertical", totalWidthMm, heightMm, fallbackOp);
  }
  // Flatten in the order the comment STATED, keeping every unit including fixed.
  //
  // The fixed used to be dropped here on the reasoning that it is "derived, not
  // placed" — true when the comment names only the operable units ("2x 600mm
  // WIDE AWNINGS"), and wrong when it names the whole sequence. The consequence
  // was that saying the answer out loud produced a worse plan than saying
  // nothing: on a 3200mm opening, "AWNING + FIXED + AWNING" yielded two 1600mm
  // awnings and no lite, while "2x 600mm WIDE AWNINGS" correctly yielded
  // awning | fixed | awning. An architect who spells out the make-up must not be
  // punished for it.
  const stated: { operation: string; widthMm: number | null }[] = [];
  for (const u of hint.units) {
    for (let i = 0; i < Math.max(1, u.count); i++) {
      stated.push({ operation: u.operation, widthMm: u.widthMm });
    }
  }
  const statesFixed = stated.some((u) => u.operation === "fixed");
  const operable = stated.filter((u) => u.operation !== "fixed");

  // THE COMMENT NAMED THE WHOLE SEQUENCE. Honour it verbatim: the order is the
  // architect's, and a stated width is theirs too. Only the unstated widths are
  // ours to fill, and they take the remainder evenly.
  if (statesFixed) {
    const specified = stated.reduce((s, u) => s + (u.widthMm ?? 0), 0);
    const unstated = stated.filter((u) => u.widthMm == null).length;
    if (!unstated) {
      // Every width given. Trust them; a total that disagrees with the opening
      // is the coverage delta the estimator already reports, not ours to fudge.
      return stated.map((u) => ({ operation: u.operation, widthMm: u.widthMm!, heightMm }));
    }
    const remainder = totalWidthMm - specified;
    if (remainder < unstated) return null;          // nothing left to share out
    const share = evenWidths(remainder, unstated);
    let n = 0;
    // NOT bounded by the product maximum, deliberately. The comment named which
    // units exist and in what order; if that make-up cannot be built at this
    // width the answer is to show it and flag the oversize unit at review, not
    // to quietly substitute a different make-up. Declining here would have taken
    // "AMJ100T AWNING + FIXED" on a 3200mm opening — parsed perfectly — and
    // returned three awnings and no lite.
    return stated.map((u) => ({
      operation: u.operation,
      widthMm: u.widthMm ?? share[n++],
      heightMm,
    }));
  }

  if (!operable.length) {
    // A fixed-only or unrecognised hint → fall back to the caller's default.
    return null;
  }
  const specifiedTotal = operable.reduce((s, u) => s + (u.widthMm ?? 0), 0);
  const anyUnspecified = operable.some((u) => u.widthMm == null);

  // If every operable unit has an explicit width, the fixed lite is the remainder.
  if (!anyUnspecified) {
    const remainder = totalWidthMm - specifiedTotal;
    const half = Math.floor(operable.length / 2);
    const left = operable.slice(0, half);
    const right = operable.slice(half);
    const seg = (u: { operation: string; widthMm: number | null }): ProposedSegment => ({ operation: u.operation, widthMm: u.widthMm!, heightMm });
    const segments = left.map(seg);
    if (remainder > 1) segments.push({ operation: "fixed", widthMm: remainder, heightMm });
    segments.push(...right.map(seg));
    return segments;
  }

  // Widths not given: distribute the total evenly across the operable units
  // (plus fallback op if only one type), no derived fixed.
  const even = evenWidths(totalWidthMm, operable.length);
  const segments = operable.map((u, i) => ({ operation: u.operation === fallbackOp || u.operation ? u.operation : fallbackOp, widthMm: even[i], heightMm }));
  // "2 x AWNING" on a 3200mm opening asked for two 1600mm awnings against a
  // 1300mm maximum — a stated COUNT the product cannot honour. A count is a
  // weaker claim than a make-up: nothing is lost by declining, because the even
  // split falls back to the SAME operation in units that can actually be made.
  // (The stated-make-up branch above deliberately does not do this.)
  if (segments.some((s) => !derivedFits(s.operation, s.widthMm))) return null;
  return segments;
}

/** Allocate a positive integer total proportionally, preserving the exact sum. */
function proportionalParts(source: number[], target: number): number[] {
  if (!source.length) return [];
  if (target < source.length) return evenWidths(target, source.length);
  const sourceTotal = source.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (sourceTotal <= 0) return evenWidths(target, source.length);
  const distributable = target - source.length;
  const shares = source.map((value, index) => {
    const exact = distributable * Math.max(0, value) / sourceTotal;
    return { index, whole: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  const out = shares.map((share) => 1 + share.whole);
  let remainder = target - out.reduce((sum, value) => sum + value, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {
    if (remainder-- <= 0) break;
    out[share.index]++;
  }
  return out;
}

function fitReportComponentsToOpening(
  segments: ProposedSegment[],
  axis: "vertical" | "horizontal",
  openingWidthMm: number,
  openingHeightMm: number,
  fallbackOp: string,
): ProposedSegment[] {
  const along = axis === "vertical" ? "widthMm" : "heightMm";
  const across = axis === "vertical" ? "heightMm" : "widthMm";
  const totalAlong = axis === "vertical" ? openingWidthMm : openingHeightMm;
  const totalAcross = axis === "vertical" ? openingHeightMm : openingWidthMm;
  const primary = normOp(fallbackOp) ?? fallbackOp.trim().toLowerCase();
  const sourceAlong = segments.map((segment) => segment[along]);
  const supplementary = segments
    .map((segment, index) => ({ index, operation: normOp(segment.operation) ?? segment.operation.trim().toLowerCase() }))
    .filter((segment) => segment.operation !== primary)
    .map((segment) => segment.index);

  let fittedAlong = [...sourceAlong];
  const sourceTotal = sourceAlong.reduce((sum, value) => sum + value, 0);
  if (sourceTotal !== totalAlong) {
    const supplementarySet = new Set(supplementary);
    const preservedPrimaryTotal = sourceAlong.reduce((sum, value, index) =>
      sum + (supplementarySet.has(index) ? 0 : value), 0);
    const supplementaryTarget = totalAlong - preservedPrimaryTotal;
    if (supplementary.length > 0 && supplementaryTarget >= supplementary.length) {
      const adjusted = proportionalParts(supplementary.map((index) => sourceAlong[index]), supplementaryTarget);
      supplementary.forEach((index, position) => { fittedAlong[index] = adjusted[position]; });
    } else {
      // If the opening is too small to retain the primary components, every
      // component participates proportionally rather than producing zero or
      // negative supplementary geometry.
      fittedAlong = proportionalParts(sourceAlong, totalAlong);
    }
  }

  return segments.map((segment, index) => ({
    ...segment,
    [along]: fittedAlong[index],
    [across]: totalAcross,
  }));
}

/** Even integer widths that sum EXACTLY to total (remainder to the last). */
export function evenWidths(totalMm: number, count: number): number[] {
  if (!Number.isFinite(count) || count < 1) return [];
  const base = Math.floor(totalMm / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] = totalMm - base * (count - 1);
  return out;
}

/** Propose a split for an opening. Comment-authoritative, then the family's own
 *  default pairing, then an even split into the minimum number of equal units
 *  that each FIT the product's max width (so a >2× oversize opening becomes 3+,
 *  not two still-oversize halves — "just maths"). With no max width known it
 *  falls back to a 50/50 two-way split. */
export function proposeSplit(
  opening: OpeningInput,
  hint: SplitHint | null,
  opts?: {
    maxWidthMm?: number | null;
    /** The opening family's authored pairing rule, and the widest frame the
     *  infill family makes. Both or neither — the rule alone cannot size a
     *  panel. Absent means "no opinion", which is every unauthored family. */
    pairing?: {
      rule: FamilyDefaultSplit | null;
      infillMaxWidthMm: number | null;
      maxSegments?: number | null;
    } | null;
  },
): SplitProposal {
  const width = Math.max(0, Math.round(opening.widthMm ?? 0));
  const height = Math.max(0, Math.round(opening.heightMm ?? 0));
  const fallbackOp = opening.operationType ?? "awning";

  if (hint) {
    const segments = layoutFromHint(hint, width, height, fallbackOp, opts?.maxWidthMm ?? null);
    if (segments && segments.length >= 2) {
      return {
        segments,
        axis: hint.axis ?? "vertical",
        basis: hint.source === "energy_report" ? "energy_report" : "schedule_comment",
        reviewRequired: true,
        note: hint.source === "energy_report"
          ? `Built from the energy report's authoritative component schedule (${hint.raw}) — confirm document discrepancies at review.`
          : `Proposed from the schedule comment "${hint.raw}" — confirm the split at review.`,
      };
    }
  }

  // THE FAMILY'S OWN ANSWER, beneath anything a document actually said.
  //
  // An opening too wide for one frame is not N of that frame. A 2050mm awning
  // against a 1300mm maximum was delivered as two 1025mm awnings — two chain
  // winders where the manufacturer builds one sash and a lite. The rule that
  // says so is authored per family in Sanity and is a weaker claim than any
  // document, which is why it sits here and not above the hint.
  const pairingRule = opts?.pairing?.rule ?? null;
  const infillMax = opts?.pairing?.infillMaxWidthMm ?? null;
  const infillOp = pairingRule?.infillOperation?.trim() || null;
  if (pairingRule && infillOp && infillMax && opts?.maxWidthMm) {
    const paired = proposePairedLayout({
      openingWidthMm: width,
      operableMaxWidthMm: opts.maxWidthMm,
      infillMaxWidthMm: infillMax,
      // The composite policy's own cap, when the caller knows it. MAX_HINT_UNITS
      // is a safety bound, not a policy — a plan that exceeds the real cap is
      // refused by validateSplit later, and refusing it HERE instead keeps the
      // pairing from being silently dropped for a reason nobody sees.
      maxSegments: opts.pairing?.maxSegments ?? MAX_HINT_UNITS,
      rule: pairingRule,
    });
    if (paired) {
      return {
        segments: paired.units.map((u) => ({
          // A role becomes an operation here and nowhere else: the pairing module
          // is deliberately catalogue-free, so it names roles and this is the one
          // place that knows which family fills them.
          operation: u.role === "infill" ? infillOp : fallbackOp,
          widthMm: u.widthMm,
          heightMm: height,
        })),
        axis: "vertical",
        basis: "default_pairing",
        reviewRequired: true,
        note: paired.note,
      };
    }
  }

  // Even default: the minimum equal units that each fit the product's max width.
  // Bounded for the same reason the hint is: `width` comes from a parsed
  // document, and a misread dimension (a metre value read as millimetres, an OCR
  // slip) would otherwise ask for thousands of segments. Past the cap the units
  // no longer fit the product, which the reviewer sees — the composite validator
  // refuses more than a handful of units anyway.
  const maxW = opts?.maxWidthMm ?? null;
  const count = Math.min(
    maxW && maxW > 0 ? Math.max(2, Math.ceil(width / maxW)) : 2,
    MAX_HINT_UNITS,
  );
  const widths = evenWidths(width, count);
  return {
    segments: widths.map((w) => ({ operation: fallbackOp, widthMm: w, heightMm: height })),
    axis: "vertical",
    basis: "default_even",
    reviewRequired: true,
    note: count === 2
      ? "Proposed as an even 50/50 split (default) — confirm the configuration at review."
      : `Proposed as ${count} equal units so each fits the product width (default) — confirm at review.`,
  };
}

/** Area-weighted whole-composite Uw from its priced segments. The owner's goal:
 *  average the segment Uws (all with the same glass by default) and fit that to
 *  the opening requirement — NOT a per-lite precision model. Returns null when no
 *  segment carries a Uw. */
export function compositeAveragedUw(segments: { widthMm: number; heightMm: number; uValue: number | null }[]): number | null {
  return areaWeighted(segments, (s) => s.uValue);
}

/** The SHGC counterpart, for the same reason and by the same weighting. Uw alone
 *  cannot answer a band: SHGC is two-sided — a report may set a floor to admit
 *  winter sun and a ceiling to keep summer heat out — so a composite scored on
 *  its averaged Uw and its units' individual SHGCs would be judged against half
 *  its own requirement. */
export function compositeAveragedShgc(segments: { widthMm: number; heightMm: number; shgc: number | null }[]): number | null {
  return areaWeighted(segments, (s) => s.shgc);
}

function areaWeighted<T extends { widthMm: number; heightMm: number }>(
  segments: T[],
  value: (s: T) => number | null,
): number | null {
  let areaSum = 0;
  let weighted = 0;
  for (const s of segments) {
    const v = value(s);
    if (v == null) continue;
    const area = Math.max(0, s.widthMm) * Math.max(0, s.heightMm);
    if (area <= 0) continue;
    areaSum += area;
    weighted += area * v;
  }
  return areaSum > 0 ? weighted / areaSum : null;
}
