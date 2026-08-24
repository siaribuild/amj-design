// Split candidates — a split competes in the SAME ranking as a single unit
// (D7, design §7). It is never a post-pass rework of a pick already made, which
// is what `materialiseSplits` used to be and precisely what D7 forbids.
//
// WHY THE GATE IS ITS OWN TINY FUNCTION
//
// Splits exist to solve DIMENSIONAL limits, and nothing else. A fixed lite is
// thermally better than an awning, so "awning + fixed" meets an awning's band
// more easily than an awning can — and if a thermal miss could open the gate,
// the estimator would learn to split its way out of every requirement it could
// not otherwise meet, quoting mullions nobody asked for. So the gate is a
// separate, tiny, structural thing: it reads a drawing instruction and a fit
// fact, and it has no parameter through which a requirement could arrive.
import type { CatalogueRepository } from "./catalogue";
import type { OpeningInput } from "./types";
import {
  decide, evaluateCandidates, parentRepresentative,
  type EvaluatedCandidate, type PriceFn, type SelectionResult,
} from "./select";
import { enumerateMakeUps, type CompositeUnit, type MakeUp } from "./compositeSelect";
import { area, makeUpDeviation } from "./compositeRank";
import { resolvedRequirement } from "./rules";
import type { ShadowLearnedModel } from "./learning";
import { proposeSplit, type ProposedSegment, type SplitHint, type SplitProposal } from "./split";
import type { Deviation } from "./ladder";
import type { CandidateOutcome } from "../../../src/data/recommendation";
import type { FamilyDefaultSplit } from "../../../src/data/catalogue";
import { resolveScheduleType } from "../../../src/data/scheduleMatch";
import { defaultOptions } from "../../../src/data/configurator";
import { getProductBySlug } from "../../../src/data/catalogue";
import type { SegmentSpec } from "../composite";

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

/** One unit of a proposed split, with everything materialisation will need —
 *  resolved once here rather than re-derived from the geometry later. */
export interface SplitUnitPlan {
  segment: ProposedSegment;
  /** The unit's own opening: its size, its operation, its band, its glass note. */
  opening: OpeningInput & { externalRef?: string | null };
  requirement: { maxUValue?: number | null; minShgc?: number | null; maxShgc?: number | null } | null;
  glazingDescription: string | null;
  /** True when an ENERGY REPORT stated this unit's own band. */
  ownBand: boolean;
}

export interface SplitCandidate {
  /** Stable identity within the run, echoed through the ladder. */
  key: string;
  /** The one frame system every unit came from. Combinability is hard (D3), so
   *  a make-up spanning two systems is never enumerated and never exists here. */
  system: string;
  glazingSlug: string | null;
  /** Per-segment selections — audit-complete, one SelectionResult per unit. */
  units: CompositeUnit[];
  plan: SplitUnitPlan[];
  axis: SplitProposal["axis"];
  proposalBasis: SplitProposal["basis"];
  note: string;
  /** The make-up's requirement-relative deviation (spec §4.7). */
  deviation: Deviation;
  /** Sum of the units' totals in integer cents; null when any unit is unpriced. */
  totalCents: number | null;
  /** Every unit's chosen product actually serves its own segment. */
  fits: boolean;
  /** Stamped by decide() once the ladder has ruled. */
  candidateOutcome: CandidateOutcome;
}

export interface SplitContext {
  repo: CatalogueRepository;
  priceFn: PriceFn;
  /** The geometry seed: the representative single-unit product's max width, so a
   *  >2× opening becomes 3+ units rather than two still-oversize halves. */
  parentMaxWidthMm?: number | null;
  pairing?: {
    rule: FamilyDefaultSplit | null;
    infillMaxWidthMm: number | null;
    maxSegments?: number | null;
    offset?: boolean;
  } | null;
  /** The opening's own category, and the one a unit may cross into. */
  primaryCategory?: string | null;
  alternateCategory?: string | null;
  section?: "window" | "door";
  /** The dark learned layer, forwarded to decide() so the outcome builder can
   *  stamp it. It reaches no comparator on the way through. */
  shadow?: ShadowLearnedModel | null;
  /** Resolve the family's authored pairing from the representative product.
   *  Async because the infill family's widest frame is a catalogue lookup, and
   *  a panel cannot be sized without it. Called at most once per opening. */
  resolvePairing?: (
    representative: EvaluatedCandidate | null,
  ) => Promise<SplitContext["pairing"]>;
}

/** The family's authored pairing, resolved from the product this opening would
 *  otherwise have been built from.
 *
 *  Two things are needed and NEITHER is on the opening: the rule — which family
 *  supplies the infill — hangs off that product, and the widest frame that
 *  family makes is a catalogue lookup. The pairing asks "can one panel cover
 *  this", and answering with a narrower product would invent an extra mullion
 *  the manufacturer would not build.
 *
 *  The infill family's products come from the same cached candidate query the
 *  selection already used, so in a realistic project this is a cache hit rather
 *  than a second round trip per opening. */
export async function resolvePairing(
  repo: CatalogueRepository,
  args: {
    representative: EvaluatedCandidate | null;
    /** The REAL policy cap, not the proposer's safety bound: a pairing that
     *  exceeded it would be built and then refused by validateSplit, which
     *  reads to the customer as no split at all. */
    maxSegments: number | null;
    /** The schedule said OFFSET — the operable pane is the smaller share. */
    offset: boolean;
  },
): Promise<SplitContext["pairing"]> {
  const rule = args.representative?.candidate.defaultSplit ?? null;
  let infillMaxWidthMm: number | null = null;
  if (rule?.infillFamilySlug && rule.infillOperation) {
    const infill = await repo.queryCandidates(
      args.representative!.candidate.family, rule.infillOperation,
    );
    const widths = infill
      .filter((c) => c.series === rule.infillFamilySlug)
      .map((c) => c.dimensionRule?.maxWidthMm)
      .filter((w): w is number => typeof w === "number" && w > 0);
    infillMaxWidthMm = widths.length ? Math.max(...widths) : null;
  }
  return { rule, infillMaxWidthMm, maxSegments: args.maxSegments, offset: args.offset };
}

/**
 * Every complete, single-system make-up this opening can be built from, as
 * candidates (design §7.2).
 *
 * The geometry comes from the existing precedence chain unchanged — comment,
 * then the family's authored pairing, then an even split — and the make-ups from
 * the same `enumerateMakeUps` the composite path uses. Nothing here chooses
 * between them; that is the ladder's job, and it does it for splits and single
 * units in one pass.
 */
export async function enumerateSplitCandidates(
  opening: OpeningInput & { externalRef?: string | null },
  hint: SplitHint | null,
  ctx: SplitContext,
): Promise<{ splits: SplitCandidate[]; note: string | null }> {
  const proposal = proposeSplit(opening, hint, {
    maxWidthMm: ctx.parentMaxWidthMm ?? null,
    pairing: ctx.pairing ?? null,
  });
  if (proposal.segments.length < 2) return { splits: [], note: null };

  // The plan decided the geometry; the report is the only document carrying a
  // per-unit thermal target, so its components are matched onto the units the
  // plan produced — by operation, in document order, each claimed once. A unit
  // with no counterpart keeps the opening's band, which is the conservative
  // reading and is what the thermal audit reports as inherited.
  if (hint?.components?.length && proposal.basis !== "energy_report") {
    const pool = [...hint.components];
    for (const seg of proposal.segments) {
      const i = pool.findIndex((cp) => (cp.operation || "fixed") === seg.operation);
      if (i < 0) continue;
      const cp = pool.splice(i, 1)[0];
      seg.requirement = cp.requirement ?? seg.requirement;
      seg.ref = seg.ref ?? cp.ref ?? null;
      seg.performanceTypeId = seg.performanceTypeId ?? cp.performanceTypeId ?? null;
      seg.performanceDescription = seg.performanceDescription ?? cp.performanceDescription ?? null;
      seg.glazingNote = seg.glazingNote ?? cp.glazingNote ?? null;
    }
  }

  const section = ctx.section ?? (opening.family === "doors" ? "door" : "window");
  const plan: SplitUnitPlan[] = proposal.segments.map((segment) => {
    // Resolve the tradie term (e.g. "fixed") to a manufacturer operation via the
    // Sanity Family → Schedule Aliases — "fixed" is an alias on Sliding Window,
    // so a fixed lite is a sliding-window frame, not an unknown operation.
    const operationType = hint?.source === "energy_report"
      ? segment.operation
      : resolveScheduleType(section, segment.operation).operationType ?? segment.operation;
    const requirement = segment.requirement
      ? {
          maxUValue: segment.requirement.maxUValue,
          minShgc: segment.requirement.shgcMin,
          maxShgc: segment.requirement.shgcMax,
        }
      : opening.requirements ?? null;
    const glazingDescription = segment.performanceDescription
      ?? segment.glazingNote
      ?? opening.scheduleRequirements?.glassDescription
      ?? null;
    return {
      segment,
      requirement,
      glazingDescription,
      ownBand: !!segment.requirement,
      opening: {
        ...opening,
        externalRef: segment.ref ?? null,
        operationType,
        widthMm: segment.widthMm,
        heightMm: segment.heightMm,
        requirements: requirement,
        thermalContext: {
          ...(opening.thermalContext ?? {}),
          requirementBasis: segment.requirement
            ? ("explicit_energy_report" as const)
            : opening.thermalContext?.requirementBasis,
        },
        scheduleRequirements: {
          ...(opening.scheduleRequirements ?? {}),
          glassDescription: glazingDescription,
          doubleGlazed: glazingDescription && /\bDG\b|double\s+glaz/i.test(glazingDescription)
            ? true
            : opening.scheduleRequirements?.doubleGlazed ?? null,
        },
      },
    };
  });

  const primaryCategory = ctx.primaryCategory ?? opening.family ?? null;
  const enumerated = await enumerateMakeUps(
    opening,
    plan.map((unit) => ({
      opening: unit.opening,
      primaryCategory,
      alternateCategory: ctx.alternateCategory ?? null,
      widthMm: unit.segment.widthMm,
      heightMm: unit.segment.heightMm,
      // A unit whose band an ENGINEER stated keeps its own glass; the one-glass
      // preference must not overrule a report's per-component instruction.
      ownBand: unit.ownBand,
    })),
    ctx.repo,
    ctx.priceFn,
  );
  // AC-8 / D3, by construction: `enumerateMakeUps` only ever produces make-ups
  // whose units come from ONE frame system. When no system can supply every
  // unit it returns a fallback signal instead, and there is simply no candidate
  // — an uncouplable composite is not a dearer option that lost, it was never an
  // option. The opening keeps its honest single-unit answer.
  if ("fallback" in enumerated) return { splits: [], note: enumerated.fallback };

  const requirement = resolvedRequirement(opening);
  return {
    splits: enumerated.makeUps.map((makeUp, index) =>
      toCandidate(makeUp, index, plan, proposal, opening, requirement)),
    note: null,
  };
}

function toCandidate(
  makeUp: MakeUp,
  index: number,
  plan: SplitUnitPlan[],
  proposal: SplitProposal,
  opening: OpeningInput,
  requirement: ReturnType<typeof resolvedRequirement>,
): SplitCandidate {
  return {
    key: `split::${index}`,
    system: makeUp.system,
    glazingSlug: makeUp.glazingSlug,
    units: makeUp.units,
    plan,
    axis: proposal.axis,
    proposalBasis: proposal.basis,
    note: proposal.note,
    // The same contagion rule a composite obeys: a unit with no figure on a
    // constrained axis makes the whole make-up unknown (spec A2). Without it a
    // split could look thermally better than a single unit merely because one of
    // its lites has no data — a gap reading as an advantage.
    deviation: makeUpDeviation(opening, makeUp.scored, requirement),
    totalCents: makeUp.total == null ? null : Math.round(makeUp.total * 100),
    fits: makeUp.units.every((u) => u.result.selected?.candidateOutcome.fit.fits === true),
    candidateOutcome: undefined as unknown as CandidateOutcome,
  };
}

/** Turn the WINNING make-up into the segments `splitLine` writes.
 *
 *  Materialisation is now the tail of a decision rather than a decision of its
 *  own: the make-up already won the ladder against every single unit, and this
 *  only rebuilds it. Nothing here chooses a product, a glass or a geometry —
 *  each one comes off the candidate that won.
 *
 *  Returns [] when any unit came back unselected, which is not a make-up and
 *  must never be half-written. */
export function splitSegmentSpecs(
  split: SplitCandidate,
  args: { inheritedOptions?: Record<string, string> },
): SegmentSpec[] {
  const specs: SegmentSpec[] = [];
  for (const unit of split.units) {
    const plan = split.plan[unit.index];
    const chosen = unit.result.selected;
    if (!plan || !chosen) return [];
    const variant = chosen.selectedVariant;
    const displayProduct = getProductBySlug(chosen.candidate.slug);
    specs.push({
      widthMm: plan.segment.widthMm,
      heightMm: plan.segment.heightMm,
      productSlug: chosen.candidate.slug,
      options: {
        ...(displayProduct ? defaultOptions(displayProduct) : {}),
        // Every unit INHERITS the opening's spec. Building them blank discarded
        // the customer's colour and hardware and, because most option rows carry
        // a surcharge, re-priced the units as bare product.
        ...(args.inheritedOptions ?? {}),
        glassDescription: plan.glazingDescription ?? "",
        performanceVariantId: variant?.variantId ?? "",
        frameTechnology: variant?.frameTechnology ?? "unknown",
        glazing: variant?.glazingOptionSlug ?? "",
      },
      selectedVariantId: variant?.variantId ?? null,
      // THE MACHINE'S OWN RECORD OF THIS UNIT, frozen at the moment it chose.
      // A unit never gets an ai_proposal_line — that table requires an
      // opening_instance and a unit has none — so without this there is no
      // frozen account of what was proposed for it, and the thermal audit could
      // only report a blank beside a unit whose product it can plainly see on
      // the line. Written once, here; no human path updates it.
      configurationSnapshot: {
        productSlug: chosen.candidate.slug,
        variantId: variant?.variantId ?? null,
        uw: variant?.uValue ?? null,
        shgc: variant?.shgc ?? null,
        catalogueRevision: chosen.candidate.catalogueRevision ?? null,
        // WHY THIS FRAME AND NOT THE CHEAPER ONE. The unit was not chosen on its
        // own merits — it came out of the system picked for the whole opening —
        // so the frozen record has to name the system, or a reviewer reading it
        // back has no account of the decision that produced it.
        frameSystem: split.system,
      },
      resolvedBand: plan.requirement ? {
        maxUValue: plan.requirement.maxUValue ?? null,
        minShgc: plan.requirement.minShgc ?? null,
        maxShgc: plan.requirement.maxShgc ?? null,
        shgcTarget: plan.segment.requirement?.shgcTarget ?? null,
      } : null,
      requirementBasis: plan.ownBand ? "explicit_energy_report" : split.proposalBasis,
      // The unit's own verdict, not a filter that no longer exists: it did not
      // meet the band it was judged against, whatever the make-up averaged to.
      thermalReview: chosen.candidateOutcome.tier !== "meets",
    });
  }
  return specs;
}

/** The largest-area unit, whose product and variant stand as the split's
 *  identity in `candidate_result`'s NOT NULL columns (design AD6). `units[]` in
 *  the outcome is the authoritative description; these columns only need to not
 *  lie about which catalogue record the row is anchored to. */
export function leadUnitOf(candidate: SplitCandidate): CompositeUnit | null {
  const withArea = candidate.units.map((unit) => ({
    unit,
    area: area({
      widthMm: candidate.plan[unit.index]?.segment.widthMm ?? 0,
      heightMm: candidate.plan[unit.index]?.segment.heightMm ?? 0,
    }),
  }));
  return withArea.sort((a, b) => b.area - a.area || a.unit.index - b.unit.index)[0]?.unit ?? null;
}

/**
 * Select an opening, with split candidates in the same competition (design §7.2).
 *
 * The single-unit evaluation runs first because the split's GEOMETRY needs a
 * frame width to divide by — not because a pick is made from it. The
 * representative it reads is a dimension input, and every candidate it produced
 * goes into the final ladder alongside the splits, unchanged and undecided.
 */
export async function selectWithSplits(
  opening: OpeningInput & { externalRef?: string | null },
  hint: SplitHint | null,
  ctx: SplitContext,
): Promise<SelectionResult> {
  const evaluation = await evaluateCandidates(opening, ctx.repo, ctx.priceFn);
  if (!splitsAreEligible(hint, evaluation)) return decide(opening, evaluation, { shadow: ctx.shadow ?? undefined });

  // WHICH PRODUCT'S GEOMETRY THE SPLIT DIVIDES BY.
  //
  // A preliminary ladder run over the single units alone answers "what would
  // this opening otherwise be built from" — and that is a DIMENSION input, not
  // a recommendation. It decides nothing: every candidate it ranked goes back
  // into the final ladder with the splits present, undecided. Reading the
  // representative's max width and its family's authored pairing is what the
  // proposal has always done, so the geometry a customer sees does not move.
  const representative = parentRepresentative(decide(opening, evaluation));
  const { splits, note } = await enumerateSplitCandidates(opening, hint, {
    ...ctx,
    parentMaxWidthMm: ctx.parentMaxWidthMm
      ?? representative?.candidate.dimensionRule?.maxWidthMm
      ?? null,
    pairing: ctx.resolvePairing ? await ctx.resolvePairing(representative) : ctx.pairing ?? null,
  });
  // A split was considered and nothing could supply it. Somebody has to be
  // told: refusing silently would leave a reviewer looking at one oversize line
  // with no hint that a make-up was tried and why it could not be built.
  return { ...decide(opening, evaluation, { splits, shadow: ctx.shadow ?? undefined }), splitNote: note };
}
