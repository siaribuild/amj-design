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
import type { EnergyRequirementV1 } from "../ai/schema";

// Operation vocabulary the comment parser recognises. Fixed is the passive lite
// used to fill the remainder around operable units.
const OPERATIONS = ["awning", "fixed", "sliding", "casement", "hinged", "louvre", "stacker", "bifold", "double-hung", "tilt-turn"];
const OP_ALIASES: Record<string, string> = { "bi-fold": "bifold", "bi fold": "bifold", "tilt&turn": "tilt-turn", "tilt and turn": "tilt-turn", "awnings": "awning", "windows": "fixed" };

const normOp = (raw: string): string | null => {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (OP_ALIASES[s]) return OP_ALIASES[s];
  const singular = s.endsWith("s") ? s.slice(0, -1) : s;
  if (OPERATIONS.includes(s)) return s;
  if (OPERATIONS.includes(singular)) return singular;
  return null;
};

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
  const hay = raw.toLowerCase();
  const units: SplitUnitHint[] = [];

  // Pattern A: "<n> x <width>mm [wide] <operation>" (repeatable).
  const countWidth = /(\d+)\s*[x×]\s*(\d{2,4})\s*mm?\s*(?:wide\s+)?([a-z][a-z &-]*?)(?=\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = countWidth.exec(hay)) !== null) {
    const op = normOp(m[3]);
    if (op) units.push({ operation: op, count: Math.max(1, parseInt(m[1], 10)), widthMm: parseInt(m[2], 10) });
  }

  // Pattern B: an operation sequence joined by + / , (widths unknown), only when
  // Pattern A found nothing — otherwise the explicit widths win.
  if (!units.length && /[+/,]/.test(hay)) {
    for (const part of hay.split(/[+/,]|\band\b/)) {
      const op = normOp(part.replace(/\d+\s*mm?/g, "").replace(/wide/g, ""));
      if (op) units.push({ operation: op, count: 1, widthMm: null });
    }
  }

  // Pattern C: a bare "<n> x <operation>" with no width.
  if (!units.length) {
    const countOnly = /(\d+)\s*[x×]\s*([a-z][a-z-]*)/i.exec(hay);
    if (countOnly) {
      const op = normOp(countOnly[2]);
      if (op) units.push({ operation: op, count: Math.max(1, parseInt(countOnly[1], 10)), widthMm: null });
    }
  }

  return units.length ? { units, raw } : null;
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
  basis: "energy_report" | "schedule_comment" | "learned" | "default_even";
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
function layoutFromHint(hint: SplitHint, totalWidthMm: number, heightMm: number, fallbackOp: string): ProposedSegment[] | null {
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
  // Flatten the hint's operable units (respecting count).
  const operable: { operation: string; widthMm: number | null }[] = [];
  for (const u of hint.units) {
    if (u.operation === "fixed") continue; // fixed is derived, not placed as operable
    for (let i = 0; i < u.count; i++) operable.push({ operation: u.operation, widthMm: u.widthMm });
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
  return operable.map((u, i) => ({ operation: u.operation === fallbackOp || u.operation ? u.operation : fallbackOp, widthMm: even[i], heightMm }));
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
  const base = Math.floor(totalMm / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] = totalMm - base * (count - 1);
  return out;
}

/** Propose a split for an opening. Comment-authoritative, else an even split into
 *  the minimum number of equal units that each FIT the product's max width (so a
 *  >2× oversize opening becomes 3+, not two still-oversize halves — "just maths").
 *  With no max width known it falls back to a 50/50 two-way split. */
export function proposeSplit(
  opening: OpeningInput,
  hint: SplitHint | null,
  opts?: { maxWidthMm?: number | null },
): SplitProposal {
  const width = Math.max(0, Math.round(opening.widthMm ?? 0));
  const height = Math.max(0, Math.round(opening.heightMm ?? 0));
  const fallbackOp = opening.operationType ?? "awning";

  if (hint) {
    const segments = layoutFromHint(hint, width, height, fallbackOp);
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

  // Even default: the minimum equal units that each fit the product's max width.
  const maxW = opts?.maxWidthMm ?? null;
  const count = maxW && maxW > 0 ? Math.max(2, Math.ceil(width / maxW)) : 2;
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
  let areaSum = 0;
  let weighted = 0;
  for (const s of segments) {
    if (s.uValue == null) continue;
    const area = Math.max(0, s.widthMm) * Math.max(0, s.heightMm);
    if (area <= 0) continue;
    areaSum += area;
    weighted += area * s.uValue;
  }
  return areaSum > 0 ? weighted / areaSum : null;
}
