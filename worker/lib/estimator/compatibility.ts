// ═══════════════════════════════════════════════════════════════════════════════
// FRAME COMPATIBILITY — which frames may be coupled in one opening
//
// A composite opening is two or more frames joined on site. They have to be the
// same extrusion PLATFORM: differing depths clash at the mullion and read as a
// mistake to anyone standing in front of the finished job.
//
// Nothing enforced that. Each unit's product was chosen on its own merits, and
// since every fixed product in the catalogue shares one 400–3000 dimension rule,
// geometry could not discriminate between them and the commercial term decided
// alone — so the cheapest lite in the catalogue turned up beside whatever frame
// the opening happened to want. An AMJ67T lite beside an AMJ80 awning was the
// routine outcome, not the edge case.
//
// ─── The two rules, in full ──────────────────────────────────────────────────
//   1. Same system ⇒ compatible. No authoring needed, and it is the answer for
//      every system that makes its own fixed lite (five of the six do).
//   2. Otherwise compatible only if one of the two systems NAMES the other in
//      `compatibleWith`. Symmetric, and closed: an unauthored pair is not
//      compatible, because an edge nobody has drawn is a decision the
//      manufacturer has not made.
//
// ─── UNKNOWN IS NOT INCOMPATIBLE ─────────────────────────────────────────────
// A product with no system is untagged, not unpairable. Every function here
// answers `unknown` for it, and every caller must treat `unknown` as permissive.
// The whole feature is gated on content — 34 products to tag — and until that is
// done the estimator has to behave exactly as it does today. An absent fact
// costing a line would be the worst possible failure mode for a catalogue that
// is mid-authoring.
//
// ─── Why this file is pure ───────────────────────────────────────────────────
// No D1, no Sanity client, no model — it takes candidates and returns verdicts.
// That makes every case testable against the real catalogue's shape rather than
// against a mock, the same reason `pairing.ts` is built this way.
//
// Design: docs/product-compatibility-design.md.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CatalogueCandidate, FrameSystem, FrameSystemAffinity } from "./types";

/** `same` needs no authored edge; `preferred`/`allowed` come from one; `incompatible`
 *  is a tagged pair with no edge; `unknown` is at least one untagged product. */
export type CompatibilityVerdict = "same" | FrameSystemAffinity | "incompatible" | "unknown";

/** The platform a candidate is built on, or null when its editor has not tagged it. */
export const systemOf = (candidate: CatalogueCandidate | null | undefined): string | null =>
  candidate?.frameSystem?.slug ?? null;

const edgeTo = (from: FrameSystem | null | undefined, toSlug: string): FrameSystemAffinity | null =>
  from?.compatibleWith?.find((e) => e.slug === toSlug)?.severity ?? null;

/**
 * May these two frames sit in one opening?
 *
 * Symmetric deliberately: an edge is a statement that two platforms couple, and
 * coupling is a property of the joint rather than of one side of it. If a
 * directional case ever turns up it needs its own decision, not an asymmetry
 * that emerged from whichever document an editor happened to open first.
 */
export function areCompatible(
  a: CatalogueCandidate | null | undefined,
  b: CatalogueCandidate | null | undefined,
): CompatibilityVerdict {
  const [sa, sb] = [systemOf(a), systemOf(b)];
  if (!sa || !sb) return "unknown";
  if (sa === sb) return "same";
  // Either side may carry the edge; `preferred` on one side outranks `allowed`
  // on the other, so a partner an editor singled out is not demoted by the
  // reciprocal row being left at its default.
  const severities = [edgeTo(a?.frameSystem, sb), edgeTo(b?.frameSystem, sa)].filter(Boolean);
  if (severities.includes("preferred")) return "preferred";
  if (severities.includes("allowed")) return "allowed";
  return "incompatible";
}

/** True when the pair may be built — including the untagged case, which is
 *  permissive by design (see the header). Use this at every enforcement point so
 *  "unknown never blocks" cannot be re-decided one caller at a time. */
export const isBuildableTogether = (
  a: CatalogueCandidate | null | undefined,
  b: CatalogueCandidate | null | undefined,
): boolean => areCompatible(a, b) !== "incompatible";

/** Candidates a composite on `systemSlug` may draw a unit from: the system's own
 *  frames, plus any partner system's. Untagged candidates are EXCLUDED here —
 *  not because they are incompatible, but because a composite that has committed
 *  to a system should be built from frames known to belong to it. The untagged
 *  case is handled one level up, by there being no covering system at all. */
export function candidatesInSystem(
  candidates: CatalogueCandidate[],
  systemSlug: string,
  partners?: ReadonlyMap<string, FrameSystemAffinity>,
): CatalogueCandidate[] {
  return candidates.filter((c) => {
    const s = systemOf(c);
    return !!s && (s === systemSlug || !!partners?.has(s));
  });
}

/** Partner systems of `systemSlug`, gathered from every candidate that carries an
 *  edge either way. Built from the candidate set rather than a system index
 *  because the projection has no separate systems query — the edges ride along on
 *  the products, which is the only place this module can see them. */
export function partnersOf(candidates: CatalogueCandidate[][], systemSlug: string): Map<string, FrameSystemAffinity> {
  const out = new Map<string, FrameSystemAffinity>();
  const better = (a: FrameSystemAffinity, b: FrameSystemAffinity | undefined) =>
    a === "preferred" || b === undefined ? a : b;
  for (const segment of candidates) {
    for (const c of segment) {
      const sys = c.frameSystem;
      if (!sys) continue;
      if (sys.slug === systemSlug) {
        for (const e of sys.compatibleWith) out.set(e.slug, better(e.severity, out.get(e.slug)));
      } else {
        const back = edgeTo(sys, systemSlug);
        if (back) out.set(sys.slug, better(back, out.get(sys.slug)));
      }
    }
  }
  out.delete(systemSlug);
  return out;
}

export interface CoveringSystem {
  slug: string;
  /** How many segments this system supplies from its OWN frames. */
  ownSegments: number;
  /** True when every segment is supplied by the system itself — no partner
   *  needed. The make-up a reviewer expects, and what should be tried first. */
  exact: boolean;
}

/**
 * The systems that could build the WHOLE composite — one entry per system that
 * supplies every segment, itself or through a declared partner.
 *
 * `candidatesPerSegment` is the already-operation-filtered candidate list for
 * each unit, in order. Returns best-first: exact make-ups before mixed ones, then
 * by how much of the opening the system covers itself, then by slug so the answer
 * is stable across runs (a selection that reordered itself between two identical
 * estimates would be unexplainable to the reviewer looking at both).
 *
 * EMPTY IS A REAL AND EXPECTED ANSWER — an untagged catalogue, or an opening
 * whose operations no single platform covers. The caller falls back to
 * independent per-segment selection and warns. It must never refuse the line.
 */
export function coveringSystems(candidatesPerSegment: CatalogueCandidate[][]): CoveringSystem[] {
  if (!candidatesPerSegment.length) return [];
  const universe = new Set<string>();
  for (const segment of candidatesPerSegment) {
    for (const c of segment) {
      const s = systemOf(c);
      if (s) universe.add(s);
    }
  }

  const out: CoveringSystem[] = [];
  for (const slug of universe) {
    const partners = partnersOf(candidatesPerSegment, slug);
    let ownSegments = 0;
    let covers = true;
    for (const segment of candidatesPerSegment) {
      const own = segment.some((c) => systemOf(c) === slug);
      if (own) { ownSegments++; continue; }
      if (!segment.some((c) => { const s = systemOf(c); return !!s && partners.has(s); })) { covers = false; break; }
    }
    if (covers) out.push({ slug, ownSegments, exact: ownSegments === candidatesPerSegment.length });
  }

  return out.sort((a, b) =>
    Number(b.exact) - Number(a.exact) || b.ownSegments - a.ownSegments || a.slug.localeCompare(b.slug));
}
