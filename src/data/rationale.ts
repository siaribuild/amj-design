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
  /** What a MAKE-UP is made of; `null` on a single. The ladder names a split by
   *  its units ("Split: awning + fixed") and puts "2 units" where the figures
   *  would be — neither of which is derivable from the lead unit's slug, which
   *  is the only identity `candidate_result` anchors a make-up row to. */
  units: { productSlug: string; productName: string; operationType: string | null }[] | null;
}

/**
 * HOW A COMPOSITE LITE'S BAND WAS ARRIVED AT — the vocabulary the column
 * actually holds, declared ONCE and shared with the writer.
 *
 * It used to be `"explicit_ref" | "shared_type" | "computed" | "none"`, taken
 * from migration 0036's comment ("mirrors thermal/types.ts BandBasis"). No
 * writer has ever stored one of those. `splitCandidates.ts:374` stores
 * `explicit_energy_report` when a lite has its own band, and the split
 * proposal's own basis otherwise — so every AI-generated unit's provenance
 * resolved to `null` and WHY-AC-34's origin label silently vanished.
 *
 * THREE SPELLINGS OF ONE FACT: the migration's comment, the writer's literals,
 * and the reader's allow-list. The type was corrected once already, when the
 * architect saw that a lite's basis is not an opening's `RequirementBasis`; it
 * fixed the type and the VALUES still did not match. A type that is right and a
 * vocabulary that is wrong fails identically and looks more correct.
 *
 * `worker/lib/composite.ts`'s `SegmentInput.requirementBasis` references this
 * union instead of `string | null`, which is what let two vocabularies into one
 * column. What CATCHES a seventh spelling is a test, not the build:
 * `scripts/tests/ops2-why.test.mjs` reads this union and the writer's own
 * literals and asserts the writer's values are all members. The type alone is
 * not the guard — TS2322 is outside the typecheck gate's FATAL set, so a
 * mismatched writer builds clean and only the non-fatal count moves.
 */
export type UnitRequirementBasis =
  | "explicit_energy_report"   // this lite carried its own band in the report
  | "energy_report"            // the opening's report decided the split
  | "drawing"                  // read off the elevation — the architectural contract
  | "schedule_comment"         // the schedule asked for it in words
  | "learned"                  // how this pairing has been reviewed before
  | "default_pairing"          // the platform's own pairing rule
  | "default_even";            // an even division, nothing better available

export interface RationaleUnit {
  code: string;
  productSlug: string;
  productName: string;
  /** null = never captured (a segment written before Phase 3a). */
  figures: RationaleFigures | null;
  band: { maxUValue: number | null; minShgc: number | null; maxShgc: number | null } | null;
  basis: UnitRequirementBasis | null;
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
   *  and nothing is reconstructed from the deleted model's columns (D19).
   *
   *  It still carries `current`, because the approved mock (B8) keeps "This
   *  one" on this state: the line's own captured figures are a fact about the
   *  LINE and outlive the model that recorded the run. The design's block
   *  omitted it; the mock is the contract. */
  | { kind: "unrecorded"; current: RationaleCurrent }
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
       *  customer override does not move.
       *
       *  `null` is "the pick has not moved". Anything else is a change, and it
       *  names WHICH term moved because R12/WHY-AC-23 requires the panel to say
       *  frame or glazing rather than merely "changed". Both terms false is a
       *  real state and an honest one: the variant alone differs, so something
       *  moved and neither the frame nor the glass is what did. */
      selectionChanged: { product: boolean; glazing: boolean } | null;
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
