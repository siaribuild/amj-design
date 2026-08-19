// Selection orchestration. Pure core: given an opening, a CatalogueRepository
// and a pricing function, it queries published candidates, applies the
// deterministic hard rules, prices every eligible configuration — and then hands
// the whole set to the LADDER, which is the only thing in this codebase that
// decides one candidate is better than another. D1 persistence is a separate
// concern (persistSelection) so this is testable against a fixture.
//
// Two stages behind one public interface (design §5.2):
//
//   evaluateCandidates — what the catalogue offers for this opening, priced.
//                        Knows nothing about which is best.
//   decide             — stamps ladder facts, runs the ladder, builds the
//                        emitted contract. Chooses nothing itself either; the
//                        ladder does, and the ladder does it for every path.
import { catalogueCandidateOfferability, type CatalogueRepository } from "./catalogue";
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";
import {
  checkHardRules, fitFacts, resolvedRequirement, RULE_VERSION,
  type FitFacts, type RuleOutcome,
} from "./rules";
import {
  deviationOf, runLadder, REQUIREMENT_TOLERANCE, SELECTION_VERSION,
  type LadderCandidate, type ResolvedRequirement,
} from "./ladder";
import { buildOutcomes, priceCentsOf, type OutcomeCandidate } from "./outcome";
import type { CandidateOutcome, SelectionOutcome } from "../../../src/data/recommendation";
import type { PriceSnapshot } from "./pricing";
import { eligiblePerformanceVariants } from "./configuration";
// Type-only, so no runtime cycle: splitCandidates.ts imports the VALUES here.
import type { SplitCandidate } from "./splitCandidates";
import { leadUnitOf } from "./splitCandidates";

export type PriceFn = (
  candidate: CatalogueCandidate,
  opening: OpeningInput,
  variant: PerformanceVariant | null,
) => Promise<PriceSnapshot | null>;

export interface EvaluatedCandidate {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
  selectedVariant: PerformanceVariant | null;
  price: PriceSnapshot | null;
  /** The emitted verdict — tier, rank, deviation, exclusions, price delta.
   *  Replaces the deleted `score` / `components` / `rank` / `selected`. */
  candidateOutcome: CandidateOutcome;
}

export interface SelectionResult {
  openingRef: string | null;
  ruleVersion: string;
  /** 'ladder-v1'. Written to the ranker_version columns, which keep their names
   *  so a rename does not ripple through four tables (AD16). */
  selectionVersion: string;
  catalogueVersion: string;
  evaluated: EvaluatedCandidate[];
  /** Split make-ups that competed in the SAME ladder as the single units.
   *  Empty when the opening was not eligible for one (D7, AC-18). */
  splits: SplitCandidate[];
  /** The run-level contract, persisted as selection_run.selection_json. */
  selection: SelectionOutcome;
  /** Chosen candidate (null when nothing could be selected, or a split won). */
  selected: EvaluatedCandidate | null;
  /** The winning split, when one beat every single unit. Never both — one
   *  competition produces one winner. */
  selectedSplit: SplitCandidate | null;
  /** Why a split was considered and none could be offered — a reviewer's only
   *  notice that the documents implied a make-up nothing could supply. */
  splitNote: string | null;
  /** Line status: the selected candidate's status, else the "best failure". */
  status: SelectionOutcome["status"];
  /** Products that WOULD have been candidates but were withheld as incomplete,
   *  with the gap codes that withheld them. Carried so a reviewer is told which
   *  record to fix instead of reading "no product fits" and re-measuring an
   *  opening that was never the problem. Empty on a healthy catalogue. */
  withheldIncomplete: { slug: string; gaps: string[] }[];
}

/** What a UNIT of a composite may be chosen from. Absent on a plain opening,
 *  which is selected in isolation exactly as it always was. */
export interface SelectionRestriction {
  /** Frame systems this unit may come from — the composite has committed to one,
   *  and its units have to couple. A HARD filter: compositeSelect only ever
   *  passes a system it has already confirmed covers this segment, so an empty
   *  result here is a caller fault rather than a catalogue one. */
  systems?: readonly string[] | null;
  /** The composite's glass. SOFT, deliberately: a frame that offers none of these
   *  keeps its own eligible set rather than dropping out. Glass is mandatory, so
   *  a hard filter would empty a frame and re-create the empty line that the
   *  whole non-blocking contract exists to prevent — and the composite reports
   *  the disagreement instead. */
  glazingSlugs?: readonly string[] | null;
}

/** One priced configuration, before the ladder has an opinion about it. */
interface EvaluatedRow {
  candidate: CatalogueCandidate;
  outcome: RuleOutcome;
  selectedVariant: PerformanceVariant | null;
  price: PriceSnapshot | null;
  fit: FitFacts;
}

export interface Evaluation {
  rows: EvaluatedRow[];
  /** Products that reached the rules engine at all. */
  hadCandidates: boolean;
  catalogueVersion: string;
  withheldIncomplete: { slug: string; gaps: string[] }[];
}

export async function evaluateCandidates(
  opening: OpeningInput & { externalRef?: string | null },
  repo: CatalogueRepository,
  priceFn: PriceFn,
  restrict?: SelectionRestriction | null,
): Promise<Evaluation> {
  const all = await repo.queryCandidates(opening.family ?? null, opening.operationType ?? null);
  // WITHDRAWN PRODUCTS ARE NEVER CHOSEN BY THE MACHINE.
  //
  // Here rather than in the GROQ, deliberately: every caller of this function is
  // an automatic path (the estimate run and the composite selector), while ops
  // reaches the same repository through queryCandidates + checkHardRules to list
  // configurations and revalidate a line. Filtering in the query would have taken
  // a disabled product away from ops too, and ops is exactly who still needs it —
  // an order placed before the product was withdrawn still has to be repriced.
  const sellable = all.filter((c) => !c.disabled);
  // INCOMPLETE PRODUCTS ARE NEVER CHOSEN BY THE MACHINE EITHER.
  //
  // A product whose catalogue record is missing a piece the estimator needs —
  // no usable glazing/thermal row, no dimension rule, no operation type, no
  // pricing ref — cannot be recommended to a customer on any honest basis. It
  // is withheld BEFORE the ladder and reported in withheldIncomplete (E3), so a
  // reviewer is told which of the three records to go and fix rather than
  // reading "no product fits this opening".
  //
  // Computed live from the candidates already in hand, NOT from the cached
  // reconcile verdict: this path has the real data, so it does not need — and
  // must not inherit — the staleness of a snapshot taken up to ten minutes ago.
  const complete: CatalogueCandidate[] = [];
  const withheldIncomplete: { slug: string; gaps: string[] }[] = [];
  for (const c of sellable) {
    const offerability = catalogueCandidateOfferability(c);
    if (offerability.offerable) complete.push(c);
    else withheldIncomplete.push({ slug: c.slug, gaps: offerability.gaps });
  }
  const systems = restrict?.systems;
  const candidates = systems?.length
    ? complete.filter((c) => !!c.frameSystem && systems.includes(c.frameSystem.slug))
    : complete;
  const catalogueVersion = repo.catalogueVersion(candidates);

  const rows: EvaluatedRow[] = [];
  for (const candidate of candidates) {
    const fit = fitFacts(opening, candidate.dimensionRule);
    const outcome = checkHardRules(opening, candidate, RULE_VERSION);
    if (outcome.passed && opening.thermalContext?.thermalPrecedentApplied === true) {
      outcome.status = "commercial_only_estimate";
      outcome.energyCertified = false;
    }
    if (!outcome.passed) {
      rows.push({ candidate, outcome, selectedVariant: null, price: null, fit });
      continue;
    }
    // Every published variant that satisfies the schedule's glazing instruction
    // is a candidate configuration. Thermal no longer culls this set — the
    // ladder tiers the ones that miss, so a near-miss stays selectable (D4).
    const eligible = eligiblePerformanceVariants(candidate, outcome);
    // The composite's glass, applied per frame. Soft (see SelectionRestriction):
    // a frame rated for none of them keeps its own set, and the composite says so.
    const pinned = restrict?.glazingSlugs?.length
      ? eligible.filter((v) => restrict.glazingSlugs!.includes(v.glazingOptionSlug ?? v.variantId))
      : eligible;
    const variants = pinned.length ? pinned : eligible;
    if (!variants.length) {
      rows.push({ candidate, outcome, selectedVariant: null, price: null, fit });
      continue;
    }
    for (const variant of variants) {
      const exactOutcome: RuleOutcome = {
        ...outcome,
        // Line STATUS only, never ordering (AC-49, A7). The comparator cannot
        // see this field, so inverting every catalogue record's data source
        // changes no rank anywhere.
        energyCertified: isCertified(variant),
        status: hasThermalRequirement(opening) && !isCertified(variant)
          ? "commercial_only_estimate"
          : outcome.status,
      };
      const price = await priceFn(candidate, opening, variant);
      rows.push({ candidate, outcome: exactOutcome, selectedVariant: variant, price, fit });
    }
  }

  return { rows, hadCandidates: candidates.length > 0, catalogueVersion, withheldIncomplete };
}

const isCertified = (v: PerformanceVariant | null) =>
  !!(v && v.certified && v.dataSource === "certified");

function hasThermalRequirement(opening: OpeningInput): boolean {
  return !resolvedRequirement(opening).absent;
}

const rowKey = (row: EvaluatedRow) =>
  `${row.candidate.sanityProductId}::${row.selectedVariant?.variantId ?? "none"}`;

export function decide(
  opening: OpeningInput & { externalRef?: string | null },
  evaluation: Evaluation,
  opts?: { splits?: SplitCandidate[]; tolerance?: number },
): SelectionResult {
  const requirement = resolvedRequirement(opening);
  const tolerance = opts?.tolerance ?? REQUIREMENT_TOLERANCE;
  const splits = opts?.splits ?? [];
  const sizeKnown = !!opening.widthMm && !!opening.heightMm;
  // A last resort is only needed when nothing else can serve the opening. A
  // complete split make-up CAN, so its existence retires the promotion entirely
  // (design §7.2) — a non-fitting single unit is then simply excluded.
  const lastResortIds = splits.length ? new Set<string>() : lastResortProductIds(evaluation.rows);

  const singleInput: LadderCandidate[] = evaluation.rows.map((row) => ({
    key: rowKey(row),
    productSlug: row.candidate.slug,
    variantId: row.selectedVariant?.variantId ?? null,
    splitKey: null,
    excluded: !row.outcome.passed,
    fits: row.fit.fits,
    lastResort: row.outcome.passed && !row.fit.fits && lastResortIds.has(row.candidate.sanityProductId),
    deviation: deviationOf(requirement, {
      uValue: row.selectedVariant?.uValue ?? null,
      shgc: row.selectedVariant?.shgc ?? null,
    }).scalar,
    thermalRequired: !requirement.absent,
    priceCents: priceCentsOf(row.price),
  }));

  // ONE ladder, both forms. A split and a single unit are compared by the same
  // comparator over the same four facts, so the answer cannot depend on which
  // shape the answer happens to take (AC-17, AC-50).
  const ladder = runLadder([...singleInput, ...splits.map((split) => splitLadderCandidate(split, !requirement.absent))], tolerance);
  const { outcomes, selection } = buildOutcomes({
    openingRef: opening.externalRef ?? null,
    requirement,
    tolerance,
    ladder,
    candidates: [
      ...evaluation.rows.map((row) => outcomeCandidateOf(opening, row, requirement)),
      ...splits.map(splitOutcomeCandidate),
    ],
    withheldIncomplete: evaluation.withheldIncomplete,
    hadCandidates: evaluation.hadCandidates || splits.length > 0,
    sizeKnown,
  });

  const evaluated: EvaluatedCandidate[] = evaluation.rows.map((row, i) => ({
    candidate: row.candidate,
    outcome: row.outcome,
    selectedVariant: row.selectedVariant,
    price: row.price,
    candidateOutcome: outcomes[i],
  }));
  splits.forEach((split, i) => { split.candidateOutcome = outcomes[evaluation.rows.length + i]; });

  return {
    openingRef: opening.externalRef ?? null,
    ruleVersion: RULE_VERSION,
    selectionVersion: SELECTION_VERSION,
    catalogueVersion: evaluation.catalogueVersion,
    evaluated,
    splits,
    selection,
    selected: evaluated.find((e) => e.candidateOutcome.selected) ?? null,
    selectedSplit: splits.find((s) => s.candidateOutcome.selected) ?? null,
    splitNote: null,
    status: selection.status,
    withheldIncomplete: evaluation.withheldIncomplete,
  };
}

/** A make-up, as the four facts the ladder reads. Its identity for the tiebreak
 *  is the largest-area unit's (AD6); `splitKey` separates two make-ups that
 *  happen to share it. */
function splitLadderCandidate(split: SplitCandidate, thermalRequired: boolean): LadderCandidate {
  const lead = leadUnitOf(split)?.result.selected ?? null;
  return {
    key: split.key,
    productSlug: lead?.candidate.slug ?? split.system,
    variantId: lead?.selectedVariant?.variantId ?? null,
    splitKey: [split.system, split.glazingSlug ?? "-",
      ...split.units.map((u) => u.result.selected?.candidate.slug ?? "?")].join("|"),
    excluded: false,
    fits: split.fits,
    // A split that does not fit has failed at the one job it exists to do, so it
    // can only ever be an answer of last resort — below every fitting candidate,
    // in either form.
    lastResort: true,
    deviation: split.deviation.scalar,
    thermalRequired,
    priceCents: split.totalCents,
  };
}

function splitOutcomeCandidate(split: SplitCandidate): OutcomeCandidate {
  const lead = leadUnitOf(split);
  const chosen = lead?.result.selected ?? null;
  return {
    key: split.key,
    productSlug: chosen?.candidate.slug ?? split.system,
    sanityProductId: chosen?.candidate.sanityProductId ?? split.system,
    variantId: chosen?.selectedVariant?.variantId ?? null,
    catalogueRevision: chosen?.candidate.catalogueRevision ?? "",
    form: "split",
    units: split.units.map((unit) => {
      const plan = split.plan[unit.index];
      const sel = unit.result.selected;
      return {
        productSlug: sel?.candidate.slug ?? "",
        variantId: sel?.selectedVariant?.variantId ?? null,
        widthMm: plan?.segment.widthMm ?? 0,
        heightMm: plan?.segment.heightMm ?? 0,
        operationType: plan?.opening.operationType ?? null,
      };
    }),
    // A make-up exists only because every one of its units passed within its
    // system, so there is no rules verdict left to report at the make-up level.
    filters: [],
    ruleStatus: "commercial_only_estimate",
    offered: { operationTypes: [], glazingClasses: [], schemaVersion: null },
    required: { operationType: null, doubleGlazed: null, lowE: false },
    thermal: {
      uValue: null,
      shgc: null,
      deviation: split.deviation,
      // A composite is not one catalogue cell and carries no certification of
      // its own; the units' own rows say where their figures came from.
      dataSource: null,
    },
    fit: {
      fits: split.fits,
      widthMm: split.plan.reduce((sum, u) => sum + u.segment.widthMm, 0),
      heightMm: split.plan[0]?.segment.heightMm ?? null,
      limit: null,
      breached: [],
    },
    price: split.totalCents == null ? null : { ok: true, total: split.totalCents / 100 },
  };
}

function outcomeCandidateOf(
  opening: OpeningInput,
  row: EvaluatedRow,
  requirement: ResolvedRequirement,
): OutcomeCandidate {
  const glass = (opening.scheduleRequirements?.glassDescription ?? "").toLowerCase();
  return {
    key: rowKey(row),
    productSlug: row.candidate.slug,
    sanityProductId: row.candidate.sanityProductId,
    variantId: row.selectedVariant?.variantId ?? null,
    catalogueRevision: row.candidate.catalogueRevision,
    form: "single",
    filters: row.outcome.filters,
    ruleStatus: row.outcome.status,
    offered: {
      operationTypes: row.candidate.configuration?.operationTypes ?? [],
      glazingClasses: [...new Set(
        row.candidate.performanceVariants
          .filter((v) => v.published)
          .map((v) => v.glazingClass)
          .filter((cls): cls is string => !!cls),
      )],
      schemaVersion: row.candidate.schemaVersion,
    },
    required: {
      operationType: opening.operationType ?? null,
      doubleGlazed: opening.scheduleRequirements?.doubleGlazed ?? null,
      lowE: /\blow[- ]?e\b/.test(glass),
    },
    thermal: {
      uValue: row.selectedVariant?.uValue ?? null,
      shgc: row.selectedVariant?.shgc ?? null,
      deviation: deviationOf(requirement, {
        uValue: row.selectedVariant?.uValue ?? null,
        shgc: row.selectedVariant?.shgc ?? null,
      }),
      dataSource: row.selectedVariant
        ? (row.selectedVariant.dataSource === "certified" ? "certified" : "estimated")
        : null,
    },
    fit: row.fit,
    price: row.price,
  };
}

/** AD15 / spec §4.6. When NOTHING fits, the platform still owes an indicative
 *  number plus a warning rather than "we sell nothing that shape" — so the
 *  largest-capacity product of the required operation is promoted into tier E
 *  and priced at the REAL opening dimensions. The ladder never picks which
 *  product deserves this; the generator stamps it, and only when it has to.
 *
 *  Largest capacity, slug as the tiebreak, mirroring the anonymous matcher's
 *  existing rule so both engines keep agreeing about the oversize promise. */
function lastResortProductIds(rows: EvaluatedRow[]): Set<string> {
  const usable = rows.filter((r) => r.outcome.passed);
  if (usable.some((r) => r.fit.fits)) return new Set();

  let best: { id: string; slug: string; capacity: number } | null = null;
  for (const row of usable) {
    const limit = row.fit.limit;
    if (!limit) continue;
    const capacity = (limit.maxWidthMm ?? 0) * (limit.maxHeightMm ?? 0);
    if (!best || capacity > best.capacity || (capacity === best.capacity && row.candidate.slug < best.slug)) {
      best = { id: row.candidate.sanityProductId, slug: row.candidate.slug, capacity };
    }
  }
  return best ? new Set([best.id]) : new Set();
}

export async function selectForOpening(
  opening: OpeningInput & { externalRef?: string | null },
  repo: CatalogueRepository,
  priceFn: PriceFn,
  restrict?: SelectionRestriction | null,
): Promise<SelectionResult> {
  return decide(opening, await evaluateCandidates(opening, repo, priceFn, restrict));
}

/** The best single-unit candidate in the ranked order — the row a proposal line
 *  is seeded from when a split wins (design §7.4, Phase 2), and the honest
 *  runner-up to show beside a split. Null when nothing was in the running. */
export function parentRepresentative(result: SelectionResult): EvaluatedCandidate | null {
  const ranked = result.evaluated
    .filter((e) => e.candidateOutcome.rank != null)
    .sort((a, b) => (a.candidateOutcome.rank ?? 0) - (b.candidateOutcome.rank ?? 0));
  return ranked[0] ?? null;
}
