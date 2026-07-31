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
}
export interface SplitHint {
  units: SplitUnitHint[];
  raw: string;
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
}
export interface SplitProposal {
  segments: ProposedSegment[];
  /** Always 'vertical' here: coupled units partition the WIDTH, full height each. */
  axis: "vertical" | "horizontal";
  basis: "schedule_comment" | "learned" | "default_5050";
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

/** Even integer widths that sum EXACTLY to total (remainder to the last). */
export function evenWidths(totalMm: number, count: number): number[] {
  const base = Math.floor(totalMm / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] = totalMm - base * (count - 1);
  return out;
}

/** Propose a split for an opening. Comment-authoritative, else 50/50 default. */
export function proposeSplit(
  opening: OpeningInput,
  hint: SplitHint | null,
): SplitProposal {
  const width = Math.max(0, Math.round(opening.widthMm ?? 0));
  const height = Math.max(0, Math.round(opening.heightMm ?? 0));
  const fallbackOp = opening.operationType ?? "awning";

  if (hint) {
    const segments = layoutFromHint(hint, width, height, fallbackOp);
    if (segments && segments.length >= 2) {
      return {
        segments,
        axis: "vertical",
        basis: "schedule_comment",
        reviewRequired: true,
        note: `Proposed from the schedule comment "${hint.raw}" — confirm the split at review.`,
      };
    }
  }

  // 50/50 default: two equal units of the requested operation.
  const [w1, w2] = evenWidths(width, 2);
  return {
    segments: [
      { operation: fallbackOp, widthMm: w1, heightMm: height },
      { operation: fallbackOp, widthMm: w2, heightMm: height },
    ],
    axis: "vertical",
    basis: "default_5050",
    reviewRequired: true,
    note: "Proposed as an even 50/50 split (default) — confirm the configuration at review.",
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
