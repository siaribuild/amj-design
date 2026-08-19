// The outcome builder — the ONE place engine-internal shapes become the emitted
// contract (docs/specs/recommendation-model-design.md §5.4).
//
// FACTS, NEVER SENTENCES (D14, AC-21). The rules engine speaks prose: "size
// 1200×1400 outside 400–1000 mm — composite/custom unit, indicative price". None
// of that crosses this seam. Every exclusion is rebuilt from structured fields —
// the constraint that failed as an enum, the numbers that failed it as numbers —
// so the ops surface composes its own wording and no customer document text can
// ride along into a persisted column.
import type {
  CandidateOutcome, ExclusionConstraint, SelectionOutcome,
} from "../../../src/data/recommendation";
import {
  REQUIREMENT_TOLERANCE, SELECTION_VERSION,
  type Deviation, type LadderResult, type ResolvedRequirement,
} from "./ladder";
import type { FilterOutcome, FitFacts, OutcomeStatus } from "./rules";
import type { PriceSnapshot } from "./pricing";
import type { ShadowLearnedModel } from "./learning";
import type { OpeningInput } from "./types";

/** One candidate as the engine knows it, before the contract is stamped on it. */
export interface OutcomeCandidate {
  /** Matches the LadderCandidate key, which is how the verdict finds its row. */
  key: string;
  productSlug: string;
  sanityProductId: string;
  variantId: string | null;
  catalogueRevision: string;
  form: "single" | "split";
  units?: CandidateOutcome["units"];
  /** The rules engine's verdicts. Read for their STRUCTURE, never their prose. */
  filters: FilterOutcome[];
  /** This exact configuration's line status, for the run-status mapping. */
  ruleStatus: OutcomeStatus;
  /** What the product offers, so an exclusion can say what was available. */
  offered: {
    operationTypes: string[];
    glazingClasses: string[];
    schemaVersion: number | null;
  };
  /** What the opening asked for, so an exclusion can say what was required. */
  required: {
    operationType: string | null;
    doubleGlazed: boolean | null;
    lowE: boolean;
  };
  thermal: {
    uValue: number | null;
    shgc: number | null;
    deviation: Deviation;
    dataSource: "certified" | "estimated" | null;
  };
  fit: FitFacts;
  /** Only the two facts the contract needs. A make-up has no PriceSnapshot of
   *  its own — it is a sum — so the builder asks for the sum, not the shape. */
  price: { ok: boolean; total: number | null } | null;
}

export interface OutcomeInput {
  openingRef: string | null;
  requirement: ResolvedRequirement;
  tolerance: number;
  ladder: LadderResult;
  candidates: OutcomeCandidate[];
  /** Products of the right shape that were withheld as half-authored (E3). They
   *  never became candidates, so they are reported here and never as tier X. */
  withheldIncomplete: { slug: string; gaps: string[] }[];
  /** Products of the right shape reached the rules engine at all. */
  hadCandidates: boolean;
  /** The opening's own dimensions are known (E7). */
  sizeKnown: boolean;
  /** The dark learned layer (D11), consulted for DISPLAY and applied to nothing.
   *  It arrives here rather than at the ladder because this is the only place it
   *  is allowed to reach: staff see what it would have said, and the pick is
   *  already made by the time this runs. */
  shadow?: ShadowLearnedModel | null;
  /** The opening the shadow layer is looked up by. */
  opening?: OpeningInput | null;
}

/** A price that is missing, not `ok`, or ≤ 0 is not a price (spec A6, AC-52):
 *  the same single notion of priceable the ladder compares on, so the emitted
 *  contract and the selection can never disagree about what could be bought. */
function priceFacts(snapshot: { ok: boolean; total: number | null } | null): { total: number | null; ok: boolean } {
  const total = snapshot?.total ?? null;
  const ok = snapshot?.ok === true && total != null && Number.isFinite(total) && total > 0;
  return { total: ok ? total : null, ok };
}

/** Integer cents, so float noise cannot flap an order (AD14). */
export const priceCentsOf = (snapshot: PriceSnapshot | null): number | null => {
  const { total, ok } = priceFacts(snapshot);
  return ok && total != null ? Math.round(total * 100) : null;
};

/** Rules prose in, structured facts out. Called only for excluded candidates —
 *  every other tier carries `exclusions: []`. */
function exclusionsOf(c: OutcomeCandidate, fitExcluded: boolean): CandidateOutcome["exclusions"] {
  const out: CandidateOutcome["exclusions"] = [];
  const push = (constraint: ExclusionConstraint, detail: Record<string, unknown>) =>
    out.push({ constraint, detail });

  for (const f of c.filters) {
    if (f.passed) continue;
    switch (f.filter) {
      case "publication":
        push("publication", { schemaVersion: c.offered.schemaVersion });
        break;
      case "operation":
        push("operation", {
          requiredOperation: c.required.operationType,
          offered: c.offered.operationTypes,
        });
        break;
      case "schedule_configuration":
        if (f.severity === "reject") {
          push("glazing_instruction", {
            required: { doubleGlazed: c.required.doubleGlazed, lowE: c.required.lowE },
            offeredClasses: c.offered.glazingClasses,
          });
        } else if (f.severity === "incomplete") {
          push("offerability", { gaps: ["glazing_class"] });
        }
        break;
      case "dimensions":
        // AD13: an opening whose size nobody knows yields a verdict per row, and
        // "not machine-selectable" is the truthful one. The run stays
        // needs_manual_review; nothing is silently chosen at an unknown size.
        if (f.severity === "manual_review") push("dimensions", { sizeUnknown: true });
        else if (f.severity === "incomplete") push("offerability", { gaps: ["dimension_rule"] });
        break;
      case "data_completeness":
        if (f.severity === "incomplete") push("offerability", { gaps: ["performance_variant"] });
        break;
      default:
        break;
    }
  }

  // The candidate passed every rule but does not serve this opening, and was not
  // promoted to the last resort. Fit is hard (D3), and the breach says which way.
  if (fitExcluded && !out.some((e) => e.constraint === "dimensions")) {
    push("dimensions", { breached: c.fit.breached, limit: c.fit.limit });
  }
  return out;
}

export function buildOutcomes(input: OutcomeInput): {
  outcomes: CandidateOutcome[];
  selection: SelectionOutcome;
} {
  const { ladder, requirement } = input;
  const tiered = new Map(ladder.ranked.map((t) => [t.key, t]));
  const winner = ladder.ranked.find((t) => t.selected) ?? null;
  const winnerCandidate = winner ? input.candidates.find((c) => c.key === winner.key) ?? null : null;
  const selectedTotal = winnerCandidate ? priceFacts(winnerCandidate.price).total : null;

  const requirementBlock: CandidateOutcome["requirement"] = {
    maxUValue: requirement.maxUValue,
    minShgc: requirement.minShgc,
    maxShgc: requirement.maxShgc,
    basis: requirement.basis,
    absent: requirement.absent,
  };

  // Looked up ONCE per run, not per candidate: the bucket is a property of the
  // opening, and only `supportFor` varies between candidates.
  const learned = input.shadow && input.opening ? input.shadow.lookup(input.opening) : null;

  const outcomes = input.candidates.map((c) => {
    const t = tiered.get(c.key);
    const tier = t?.tier ?? "excluded";
    const excluded = tier === "excluded";
    // A fit exclusion is the case where nothing in the rules engine objected —
    // the product simply is not made at this size and was not the last resort.
    const fitExcluded = excluded && !c.fit.fits && c.filters.every((f) => f.passed || f.severity === "warning");
    const price = priceFacts(c.price);
    const outcome: CandidateOutcome = {
      productSlug: c.productSlug,
      sanityProductId: c.sanityProductId,
      variantId: c.variantId,
      catalogueRevision: c.catalogueRevision,
      form: c.form,
      ...(c.units ? { units: c.units } : {}),
      tier,
      rank: t?.rank ?? null,
      selected: t?.selected ?? false,
      competing: t?.competing ?? false,
      exclusions: excluded ? exclusionsOf(c, fitExcluded) : [],
      requirement: requirementBlock,
      thermal: {
        uValue: c.thermal.uValue,
        shgc: c.thermal.shgc,
        deviation: c.thermal.deviation.perAxis,
        worstAxis: c.thermal.deviation.worstAxis,
        normalisedDeviation: requirement.absent ? 0 : c.thermal.deviation.scalar,
        absoluteMiss: c.thermal.deviation.absoluteMiss,
        dataSource: c.thermal.dataSource,
      },
      fit: {
        fits: c.fit.fits,
        widthMm: c.fit.widthMm,
        heightMm: c.fit.heightMm,
        limit: c.fit.limit,
        breached: c.fit.breached,
      },
      price: {
        total: price.total,
        currency: "AUD",
        ok: price.ok,
        // A17, fixed here so nobody guesses: candidate MINUS pick. Negative means
        // this candidate is cheaper than the one we chose — which is exactly the
        // question a reviewer asks first.
        deltaToSelected: price.total != null && selectedTotal != null
          ? round2(price.total - selectedTotal)
          : null,
      },
      // D11: recorded, shown, and applied to nothing. `applied` is the literal
      // `false` in this release — not a flag someone could flip on, because
      // flipping it would require the ladder to gain a parameter it does not
      // have. Turning the layer on is a later release and a design decision,
      // not a boolean.
      learned: learned ? {
        retrievalKey: learned.retrievalKey,
        retrievalKeyVersion: input.shadow!.version,
        observations: learned.observations,
        support: learned.supportFor(c.productSlug),
        wouldPrefer: learned.preferredSlug != null && learned.preferredSlug === c.productSlug,
        applied: false,
        provenance: learned.provenance,
      } : null,
    };
    return outcome;
  });

  const selection: SelectionOutcome = {
    version: SELECTION_VERSION,
    openingRef: input.openingRef,
    requirement: requirementBlock,
    tolerance: input.tolerance ?? REQUIREMENT_TOLERANCE,
    competingTier: ladder.competingTier,
    selectedProductSlug: winnerCandidate?.productSlug ?? null,
    status: runStatus(input, winner?.tier ?? null, winnerCandidate?.ruleStatus ?? null),
    withheldIncomplete: input.withheldIncomplete,
  };

  return { outcomes, selection };
}

// Money in, money out: the engine's own unit, not cents, and not a float tail.
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Design §5.6. The order of these branches is load-bearing: an unknown opening
 *  size excludes every candidate, so it has to be asked about before "everything
 *  failed a hard constraint" — otherwise a measuring gap reads as a catalogue
 *  that sells nothing of this shape, and someone re-measures the wrong thing. */
function runStatus(
  input: OutcomeInput,
  winnerTier: string | null,
  winnerRuleStatus: OutcomeStatus | null,
): SelectionOutcome["status"] {
  if (winnerTier) {
    // Only a candidate that MET the requirement can inherit `ready`; every other
    // tier is an indicative estimate a human confirms (AC-9, spec §4.6).
    return winnerTier === "meets" ? (winnerRuleStatus ?? "ready") : "commercial_only_estimate";
  }
  // E3: products of this shape existed but were half-authored. Saying
  // "no_candidate" would send someone to check the opening instead of the
  // catalogue record that is actually the problem.
  if (!input.hadCandidates) {
    return input.withheldIncomplete.length ? "catalogue_data_incomplete" : "no_candidate";
  }
  if (!input.sizeKnown) return "needs_manual_review";
  const survivors = input.ladder.ranked.filter((t) => t.tier !== "excluded");
  // AC-7: every candidate failed a hard constraint. The catalogue genuinely
  // offers nothing that can serve this opening.
  if (!survivors.length) return "no_candidate";
  // E9: something survived but nothing could be priced — a rate-card gap.
  return "catalogue_data_incomplete";
}
