// src/data/rationale.ts — what the "Why this product" surface is told.
//
// ZERO runtime imports, exactly like `./recommendation` beside it: facts only,
// never sentences. Every word on the screen is composed by the skin
// (`src/ops2/projects/whyCopy.ts`), so a second skin cannot drift from the
// first by inheriting different prose.
//
// ── WHAT IS DELIBERATELY ABSENT, AND WHY IT IS ABSENT HERE ──────────────────
// The surface must never show money (D18), an excluded candidate (R9) or a
// withheld product (D18), and must never caption a figure with a variant id
// (WHY-AC-4, load-bearing for D16). Each of those is enforced by the SHAPE of
// this contract rather than by a rule someone has to keep obeying: there is no
// price field, no exclusion field, no withheld field, and `current` carries no
// `variantId`. A skin cannot render a fact it was never given.
import type { RequirementBasis, Tier } from "./recommendation";

/** A pair of thermal figures as recorded. Three states matter and the contract
 *  keeps all three (spec §9.0, SNAP-AC-8):
 *    • `null` in place of this object — never captured (the column is NULL);
 *    • `{uValue:null, shgc:null}` — captured, and there was no figure;
 *    • numbers — captured, with figures.
 *  They mean different things and the panel must not collapse them. */
export interface RationaleFigures { uValue: number | null; shgc: number | null }

export interface RationaleCandidate {
  productSlug: string;
  /** The record endpoint's display convention: the static catalogue name, the
   *  slug when there is none — so a product that has left the catalogue still
   *  renders from the recorded facts (WHY-AC-19). */
  productName: string;
  variantId: string | null;
  form: "single" | "split";
  tier: Tier;
  rank: number | null;
  /** The RECORDED thermal facts, out of `outcome_json`. Never a live lookup. */
  figures: RationaleFigures;
  fits: boolean;
}

/** How a composite lite's own band was arrived at. This is `quote_line.
 *  segment_requirement_basis`'s OWN vocabulary (migration 0036, mirroring
 *  `thermal/types.ts` BandBasis) and deliberately not `RequirementBasis`: a
 *  lite's band is resolved by a different mechanism from an opening's
 *  requirement, and mapping one onto the other would state a provenance the row
 *  does not carry. */
export type UnitBandBasis = "explicit_ref" | "shared_type" | "computed" | "none";

export interface RationaleUnit {
  code: string;
  productSlug: string;
  productName: string;
  /** null = never captured (a segment written before Phase 3a). */
  figures: RationaleFigures | null;
  band: { maxUValue: number | null; minShgc: number | null; maxShgc: number | null } | null;
  basis: UnitBandBasis | null;
  /** `quote_line.segment_thermal_review` — shown against THIS unit (WHY-AC-36). */
  reviewFlag: boolean;
}

/** The line's current product as the line itself records it. NO `variantId`:
 *  after a glazing-only customer change the row keeps the estimator's
 *  `selected_variant_id` while the figures describe the customer's glass (D16),
 *  and WHY-AC-4 forbids captioning the figures with that id. Omitting it makes
 *  the forbidden caption impossible rather than merely forbidden. */
export interface RationaleCurrent {
  productSlug: string;
  productName: string;
  figures: RationaleFigures | null;
}

export type LineRationaleDto =
  /** No selection run resolvable, or an ops-decided split (R13, R17, D6). */
  | {
      kind: "human";
      current: RationaleCurrent;
      /** Composite only (WHY-AC-37); null on a simple line. */
      units: RationaleUnit[] | null;
    }
  /** A run exists but predates `outcome_json` (migration 0055). WHY-AC-10 —
   *  and nothing is reconstructed from the deleted model's columns (D19). */
  | { kind: "unrecorded" }
  /** A run exists and selected NOTHING. `persist.ts:143` stores a run whose
   *  every candidate is `selected=0`, and a run with zero candidate rows is the
   *  everything-withheld shape of the same fact. This is WHY-AC-9's SECOND
   *  meaning: "evaluated, nothing chosen" is not "this product has no published
   *  figure", and the KIND — never the figures — is what tells them apart. */
  | { kind: "unresolved"; current: RationaleCurrent }
  | {
      kind: "recommendation";
      /** From the stored run ONLY. Nothing re-resolves a requirement (R23). */
      requirement: {
        maxUValue: number | null; minShgc: number | null; maxShgc: number | null;
        basis: RequirementBasis | null;
        absent: boolean;
      };
      /** Stamped per run — the skin renders `0.08` as `8%` (WHY-AC-6). */
      tolerance: number;
      competingTier: Tier | null;
      recommended: RationaleCandidate;
      /** At most FOUR, ascending rank — five rows in total (D18). */
      alternatives: RationaleCandidate[];
      /** R24: derived by comparing the recorded recommendation's PICK against
       *  the line's current pick (§7.0). Never read from `origin`, which a
       *  customer override does not move. */
      selectionChanged: boolean;
      current: RationaleCurrent;
      composite: null | {
        origin: "ai" | "ops";
        /** The best-ranked stored SINGLE the make-up beat (WHY-AC-33). */
        beatenSingle: RationaleCandidate | null;
        units: RationaleUnit[];
      };
      /** The recorded "no frame system could supply it" sentence, when the
       *  review flag it lives on is still unresolved (WHY-AC-38). */
      unsuppliedSplitNote: string | null;
    };
