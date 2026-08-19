// ═══════════════════════════════════════════════════════════════════════════════
// SELECTING A COMPOSITE — the system is chosen for the opening, the frames inside it
//
// Each unit of a composite used to be selected on its own merits. Nothing tied
// one unit's frame to the next, the ranker had no cross-segment term, and every
// fixed product in the catalogue shares one 400–3000 dimension rule — so
// geometry could not discriminate and the commercial term decided alone. The
// cheapest lite in the catalogue turned up beside whatever frame the opening
// happened to want, and an AMJ67T lite beside an AMJ80 awning was the routine
// outcome rather than the edge case.
//
// The fix is not a new comparator. It is the SAME comparator asked a bigger
// question: which frame system should this opening be built from, given that
// every unit must come out of it. So the loop is inverted —
//
//     for each system that can supply every unit
//         choose the best frame and glass for each unit WITHIN that system
//         unify the glass across the units
//         state the make-up as facts: averaged thermal deviation, summed price
//     run the SAME ladder over the make-ups
//
// — and this module declares no weight set of its own. That is AC-50: one
// opening and the same opening split in two cannot disagree about which product
// is better, because there is exactly one place a candidate is compared.
//
// ─── The three things it refuses to do ───────────────────────────────────────
//
// 1. REFUSE A LINE. If no single system can supply every unit — an untagged
//    catalogue, or an opening whose operations no one platform covers — it falls
//    back to exactly the old per-unit selection and raises the `composite`
//    warning. Thermal, dimensions and pricing all already refuse to produce an
//    empty line; a compatibility rule that produced one would be the only veto in
//    the engine, and it would fire hardest on the catalogue that needs it least.
//
// 2. Turn a window composite into a door one. A unit looks in its opening's own
//    category first and crosses only when the chosen system has nothing for that
//    operation there. In practice that is one case — a door composite taking a
//    fixed WINDOW lite from its own system — and it repairs a real fault:
//    `queryCandidates("doors","fixed")` is empty, so a door needing a lite fell
//    through to the parent's slug and priced a fixed panel as a whole sliding door.
//
// 3. Re-propose the geometry. The widths are the split proposal's, and that
//    proposal has its own precedence chain with documents at the top of it. A
//    system whose frames cannot build those widths simply scores lower on the
//    geometry component and loses; it is not an excuse to redraw the opening.
//
// Cost is roughly what it was: each inner selection is restricted to ONE system
// and so prices about 1/N of the candidates, N systems make it back up, and the
// glass trials reuse the pass they already ran wherever the answer is unchanged.
//
// Design: docs/product-compatibility-design.md §4–§6.
// ═══════════════════════════════════════════════════════════════════════════════
import type { CatalogueRepository } from "./catalogue";
import type { CatalogueCandidate, OpeningInput } from "./types";
import { selectForOpening, type PriceFn, type SelectionResult } from "./select";
import { coveringSystems, isBuildableTogether, partnersOf, systemOf } from "./compatibility";
import { area, glassOf, makeUpDeviation, type ScoredUnit } from "./compositeRank";
import { runLadder, type LadderCandidate } from "./ladder";
import { resolvedRequirement, type FilterOutcome } from "./rules";

/** One unit of the proposed make-up, ready to be selected for. */
export interface CompositeSegmentInput {
  /** The unit's own opening — its size, its band, its operation, its glass note. */
  opening: OpeningInput & { externalRef?: string | null };
  /** The category to look in first: the parent opening's own. */
  primaryCategory: string | null;
  /** Tried only when the chosen system has nothing for this operation in the
   *  primary category. Null ⇒ never cross. */
  alternateCategory: string | null;
  widthMm: number;
  heightMm: number;
  /** True when an energy report stated THIS unit's band. Such a unit keeps its
   *  own glass: the report is authoritative per component, and unifying over it
   *  would substitute a preference for an engineer's instruction. */
  ownBand: boolean;
}

export interface CompositeUnit {
  index: number;
  result: SelectionResult;
  /** Set only when the unit was found outside its opening's own category. */
  crossedToCategory: string | null;
}

export interface CompositeSelectionResult {
  units: CompositeUnit[];
  /** The system every unit came from; null when none could cover the opening. */
  system: string | null;
  /** True ⇒ the units were selected independently and may not couple. */
  mixedSystems: boolean;
  /** Distinct glass identities across the units. More than one means the
   *  one-glass preference could not be met by the frames involved. */
  glazingSlugs: string[];
  /** The make-up's requirement-relative thermal deviation — the fact the ladder
   *  tiered it by. null when it could not be measured (spec A2). */
  deviation: number | null;
  /** The sum of the units' totals in integer cents. null when any unit was
   *  unpriceable, because a partial sum is not a price. */
  totalCents: number | null;
  /** What a reviewer needs told, or null when there is nothing to say. */
  note: string | null;
}

// ── TWO BOUNDS ON WORK, AND WHY THEY ARE NOT TUNED CONSTANTS ────────────────
//
// ASSUMED: the Definition of Done says `REQUIREMENT_TOLERANCE` is the only tuned
// constant in the SELECTION PATH, and these two numbers sit in it — they prune
// the candidate set before the ladder ever sees it. They are kept, on the
// grounds that a bound on enumeration is a different kind of thing from a
// preference weight: a weight says one candidate is BETTER than another, which
// is exactly the judgement this redesign moved into one comparator, while a cap
// says how much searching is enough and then lets the ladder decide among
// everything it found, equally. The owner may prefer a spec amendment naming
// them instead; either way this goes to acceptance.
//
// What makes the distinction enforceable rather than rhetorical: a weight is a
// FRACTION (a share of something) and a bound is a COUNT.
// recommendation-contract.test.mjs asserts that every module-level numeric
// constant in the selection path is a whole number, with the tolerance named as
// the single exception — so a resurrected `.15` cannot slip back in under a new
// name, whatever it is called.

/** How many covering systems are actually tried.
 *
 *  MUST STAY ABOVE THE NUMBER OF SYSTEMS THE CATALOGUE HAS (six today).
 *  Set ABOVE the number of systems the catalogue has (six), because the
 *  best-first ordering it relies on does not survive a tie. On an all-fixed
 *  composite every fixed-lite system covers the opening exactly and with the
 *  same own-segment count, so the sort collapses to its last tiebreak — the
 *  slug, which exists only to make runs reproducible — and a cap of four
 *  silently and permanently excluded sys-80, the largest platform in the
 *  catalogue, because "8" sorts after "1", "6" and "7". A bound has to be a
 *  bound on runaway work, not a lexical filter on which frames get a hearing. */
const MAX_SYSTEMS = 12;
/** Distinct glasses trialled across the units — a bound on WORK, like the one
 *  above, not a statement that three glasses are enough to be right.
 *
 *  The unpinned pass produces at most one glass per unit and a composite is a
 *  handful of units, so the realistic ceiling is already small; this stops a
 *  pathological opening from turning the search quadratic. The trials are taken
 *  largest-area-first, so what a tighter cap drops is the glass carried by the
 *  smallest lite — and every trial that survives is compared by the same ladder
 *  with no thumb on the scale. */
const MAX_GLASS_TRIALS = 3;

export interface MakeUp {
  system: string;
  /** Position in the best-first covering order — how many units this system
   *  supplies ITSELF rather than reaching a partner for. Carried so an exact
   *  tie between two make-ups resolves on a real fact rather than an alphabet. */
  coveringRank: number;
  glazingSlug: string | null;
  units: CompositeUnit[];
  scored: ScoredUnit[];
  total: number | null;
}

export async function selectForComposite(
  /** The PARENT opening, whose band the composite is judged against when no
   *  report stated per-unit ones. */
  opening: OpeningInput,
  segments: CompositeSegmentInput[],
  repo: CatalogueRepository,
  priceFn: PriceFn,
): Promise<CompositeSelectionResult> {
  const makeUps = await enumerateMakeUps(opening, segments, repo, priceFn);
  if ("fallback" in makeUps) return fallback(opening, segments, repo, priceFn, makeUps.fallback);
  return choose(opening, segments, makeUps.makeUps);
}

/** Every complete, single-system make-up this opening can be built from. The
 *  enumeration is the composite's own work; CHOOSING between the results is the
 *  ladder's, exactly as it is for a single unit (AC-50). */
export async function enumerateMakeUps(
  opening: OpeningInput,
  segments: CompositeSegmentInput[],
  repo: CatalogueRepository,
  priceFn: PriceFn,
): Promise<{ makeUps: MakeUp[] } | { fallback: string | null }> {
  if (segments.length < 2) return { fallback: null };

  // Both categories per segment, up front. queryCandidates is cached per
  // (category, operation) for the life of the repository, so asking for the
  // alternate costs one call per distinct operation in the whole run — not one
  // per system, and not one per unit.
  const primary: CatalogueCandidate[][] = [];
  const alternate: CatalogueCandidate[][] = [];
  for (const seg of segments) {
    const op = seg.opening.operationType ?? null;
    primary.push(await repo.queryCandidates(seg.primaryCategory ?? null, op));
    alternate.push(seg.alternateCategory ? await repo.queryCandidates(seg.alternateCategory, op) : []);
  }

  const covering = coveringSystems(primary.map((p, i) => [...p, ...alternate[i]])).slice(0, MAX_SYSTEMS);
  if (!covering.length) {
    return { fallback:
      "No single frame system supplies every unit of this opening, so the units were chosen "
      + "independently and may not couple — confirm the make-up at technical review." };
  }

  const combined = primary.map((p, i) => [...p, ...alternate[i]]);
  const makeUps: MakeUp[] = [];
  for (const [coveringRank, { slug: system }] of covering.entries()) {
    // The partners this system may reach through, resolved once. Without them a
    // unit the system cannot make itself is looked for in the wrong place: the
    // partner's product sits in the opening's own category, so asking only
    // "does THIS system have one here" sent the unit across the category
    // boundary and found nothing.
    const partners = new Set(partnersOf(combined, system).keys());
    const first = await selectAll(system, coveringRank, partners, null, segments, primary, alternate, repo, priceFn, null);
    if (!first) continue;

    // The glasses the units chose for themselves, largest area first. Trialling
    // each and scoring the results is what turns "one glass across a composite"
    // from an assertion into a decision: the dominant glass is usually right, and
    // where a small unit carries the tighter band its glass gets its own hearing.
    const byGlass = new Map<string, number>();
    first.units.forEach((u, i) => {
      if (segments[i].ownBand) return;
      const glass = glassOf(u.result.selected?.selectedVariant ?? null);
      if (glass) byGlass.set(glass, (byGlass.get(glass) ?? 0) + area(segments[i]));
    });
    const trials = [...byGlass.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_GLASS_TRIALS)
      .map(([glass]) => glass);

    // THE UNPINNED PASS IS A SEED, NOT A COMPETITOR. Every unit picked its own
    // cheapest glass in it, so it is by construction the cheapest make-up on
    // offer and would win the commercial term every time — which would repeal
    // the one-glass rule using the very pass that exists to discover it. It
    // competes only when it is already single-glassed, i.e. when there is
    // nothing to unify.
    if (trials.length < 2) { makeUps.push(first); continue; }

    let anyTrial = false;
    for (const glass of trials) {
      const trial = await selectAll(system, coveringRank, partners, glass, segments, primary, alternate, repo, priceFn, first);
      if (trial) { makeUps.push(trial); anyTrial = true; }
    }
    // Every unification failed — no glass this system offers can be carried
    // across all its units at a price. The unpinned make-up is then the best
    // thing available and it is still SINGLE-SYSTEM, which is what this whole
    // function is for. Discarding it dropped the opening to the mixed-systems
    // fallback and told the reviewer the units may not couple, which was false:
    // they came from one platform and only the glass disagreed. The glass
    // disagreement is reported instead (glazingSlugs, below).
    if (!anyTrial) makeUps.push(first);
  }

  if (!makeUps.length) {
    return { fallback:
      "No frame system could supply a complete, priceable make-up for this opening — the units "
      + "were chosen independently and may not couple; confirm at technical review." };
  }
  return { makeUps };
}

/** Pick one make-up — through `runLadder`, the SAME comparator a single unit is
 *  chosen by (AC-50). This module declares no weight set and holds no second
 *  opinion about what matters; it converts each make-up into the four facts the
 *  ladder reads and lets the ladder answer. */
function choose(
  opening: OpeningInput,
  segments: CompositeSegmentInput[],
  makeUps: MakeUp[],
): CompositeSelectionResult {
  const requirement = resolvedRequirement(opening);
  const deviations = makeUps.map((m) => makeUpDeviation(opening, m.scored, requirement).scalar);
  const totalCents = makeUps.map((m) => (m.total == null ? null : Math.round(m.total * 100)));

  const ladderInput: LadderCandidate[] = makeUps.map((m, i) => {
    // AD6: the largest-area unit is the make-up's identity, so the ladder's
    // slug/variant tiebreak stays meaningful; splitKey separates two make-ups
    // that happen to share it.
    const lead = [...m.scored].sort((a, b) => area(b) - area(a))[0] ?? null;
    return {
      key: String(i),
      productSlug: lead?.candidate.slug ?? m.system,
      variantId: lead?.variant?.variantId ?? null,
      // The LAST tiebreak, reached only when tier, price and deviation are all
      // equal — so it can never outrank anything the ladder actually judges on.
      // It leads with the covering rank because `coveringSystems` already sorted
      // best-first by how many units the system supplies ITSELF, and that is a
      // real fact about the make-up; falling back to the system slug instead
      // would hand an identical opening to whichever platform sorts earlier in
      // the alphabet, which is the arbitrariness this tiebreak exists to avoid.
      splitKey: [String(m.coveringRank).padStart(3, "0"), m.system, m.glazingSlug ?? "-",
        ...m.units.map((u) => u.result.selected?.candidate.slug ?? "?")].join("|"),
      excluded: false,
      // A make-up containing a unit that does not actually fit its segment is a
      // last-resort answer, not a fitting one — the same fact, read the same way,
      // as it is for a single unit.
      fits: m.units.every((u) => u.result.selected?.candidateOutcome.fit.fits === true),
      lastResort: true,
      deviation: deviations[i],
      thermalRequired: !requirement.absent,
      priceCents: totalCents[i],
    };
  });

  const ladder = runLadder(ladderInput);
  const winner = ladder.selectedKey ?? ladder.ranked[0]?.key ?? "0";
  const index = Number(winner);
  const chosen = { makeUp: makeUps[index], deviation: deviations[index], totalCents: totalCents[index] };

  // Only the units that were ASKED to share a glass. A unit whose band an
  // engineer stated is deliberately left out of unification, so counting its
  // glass here reported "no single glazing is offered by every frame" on every
  // opening with a per-component energy report — the one case where differing
  // glass is the correct, instructed answer.
  const unified = chosen.makeUp.units.filter((u) => !segments[u.index]?.ownBand);
  const glazingSlugs = [...new Set(
    unified.map((u) => glassOf(u.result.selected?.selectedVariant ?? null)).filter((g): g is string => !!g),
  )];
  const crossed = chosen.makeUp.units.filter((u) => u.crossedToCategory);
  const notes: string[] = [];
  if (crossed.length) {
    notes.push(`${crossed.length === 1 ? "One unit is" : `${crossed.length} units are`} a `
      + `${crossed[0].crossedToCategory === "windows" ? "window" : "door"} frame from the same system — `
      + "this system makes no such unit in the opening's own category; confirm at review.");
  }
  if (glazingSlugs.length > 1) {
    notes.push("The units do not all carry the same glass — no single glazing is offered by every "
      + "frame in this make-up; confirm the glazing at review.");
  }

  return {
    units: chosen.makeUp.units,
    system: chosen.makeUp.system,
    mixedSystems: false,
    glazingSlugs,
    deviation: chosen.deviation,
    totalCents: chosen.totalCents,
    note: notes.length ? notes.join(" ") : null,
  };
}

/** Select every unit within one system, optionally pinned to one glass. Returns
 *  null when any unit comes back unselected — a make-up with a hole in it is not
 *  a make-up, and the caller has other systems to try. */
/** Where one unit may be drawn from, in the order the design fixes: the system's
 *  own frames in the opening's own category, then a declared partner's there,
 *  then the same two in the alternate category. "Own first" is what makes an
 *  exact make-up exact — a partner is a fallback for a unit the system cannot
 *  make, never an alternative supplier for one it can. */
function sourceFor(
  seg: CompositeSegmentInput,
  system: string,
  partners: Set<string>,
  here: CatalogueCandidate[],
  there: CatalogueCandidate[],
): { category: string | null; systems: string[]; crossedToCategory: string | null } | null {
  const has = (list: CatalogueCandidate[], want: (s: string) => boolean) =>
    list.some((c) => { const s = systemOf(c); return !!s && want(s); });
  const own = (s: string) => s === system;
  const partner = (s: string) => partners.has(s);
  const fromPartners = [...partners];

  if (has(here, own)) return { category: seg.primaryCategory, systems: [system], crossedToCategory: null };
  if (partners.size && has(here, partner)) {
    return { category: seg.primaryCategory, systems: fromPartners, crossedToCategory: null };
  }
  if (!seg.alternateCategory) return null;
  if (has(there, own)) return { category: seg.alternateCategory, systems: [system], crossedToCategory: seg.alternateCategory };
  if (partners.size && has(there, partner)) {
    return { category: seg.alternateCategory, systems: fromPartners, crossedToCategory: seg.alternateCategory };
  }
  return null;
}

async function selectAll(
  system: string,
  coveringRank: number,
  partners: Set<string>,
  glazingSlug: string | null,
  segments: CompositeSegmentInput[],
  primary: CatalogueCandidate[][],
  alternate: CatalogueCandidate[][],
  repo: CatalogueRepository,
  priceFn: PriceFn,
  /** The unpinned pass, reused wherever pinning cannot change the answer. */
  reuse: MakeUp | null,
): Promise<MakeUp | null> {
  const units: CompositeUnit[] = [];
  const scored: ScoredUnit[] = [];
  let total: number | null = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const source = sourceFor(seg, system, partners, primary[i], alternate[i]);
    if (!source) return null;
    const { category, systems, crossedToCategory } = source;

    // A unit whose band an engineer stated keeps its own glass; and a unit that
    // already chose this glass has nothing to gain from being asked again.
    const previous = reuse?.units[i]?.result ?? null;
    const unchanged = previous && (seg.ownBand
      || glassOf(previous.selected?.selectedVariant ?? null) === glazingSlug);
    const result = unchanged
      ? previous
      : await selectForOpening(
        { ...seg.opening, family: category ?? seg.opening.family ?? null },
        repo, priceFn,
        { systems, glazingSlugs: seg.ownBand || !glazingSlug ? null : [glazingSlug] },
      );

    const selected = result.selected;
    if (!selected) return null;
    // EVERY PAIR, not just each unit against the system it was drawn from.
    //
    // A system may reach a unit through a declared partner, and two DIFFERENT
    // partners of the same hub need not be compatible with each other: sys-125
    // naming both sys-100 and sys-150 says nothing about sys-100 beside sys-150.
    // Checking only hub-to-supplier let exactly that make-up through, and it was
    // reported as a clean single-system one. Compatibility is a property of the
    // joints, so it is verified across the joints.
    for (const built of units) {
      if (!isBuildableTogether(built.result.selected?.candidate, selected.candidate)) return null;
    }
    units.push({ index: i, result, crossedToCategory });
    scored.push({
      opening: seg.opening, candidate: selected.candidate, variant: selected.selectedVariant,
      widthMm: seg.widthMm, heightMm: seg.heightMm, ownBand: seg.ownBand,
      total: selected.price?.total ?? null,
    });
    const unitTotal = selected.price?.total ?? null;
    total = total == null || unitTotal == null ? null : total + unitTotal;
  }

  return { system, coveringRank, glazingSlug, units, scored, total };
}

/** Today's behaviour, unchanged, plus a warning that says so.
 *
 *  The one thing it adds is the category crossing, and only in its degenerate
 *  form: a unit whose operation has NO candidate at all in the opening's own
 *  category looks in the other one. That is the fixed-lite-for-a-door case, and
 *  leaving it alone here would keep pricing a fixed panel as a whole sliding
 *  door on exactly the openings this fallback exists to serve. */
async function fallback(
  opening: OpeningInput,
  segments: CompositeSegmentInput[],
  repo: CatalogueRepository,
  priceFn: PriceFn,
  note: string | null,
): Promise<CompositeSelectionResult> {
  const units: CompositeUnit[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let crossedToCategory: string | null = null;
    let result = await selectForOpening({ ...seg.opening, family: seg.primaryCategory ?? seg.opening.family ?? null },
      repo, priceFn);
    if (!result.selected && seg.alternateCategory) {
      const crossed = await selectForOpening({ ...seg.opening, family: seg.alternateCategory },
        repo, priceFn);
      if (crossed.selected) { result = crossed; crossedToCategory = seg.alternateCategory; }
    }
    units.push({ index: i, result, crossedToCategory });
  }

  // The reserved `composite` filter, at severity `warning` — declared with the
  // engine and never pushed until now. It rides on the unit's own outcome so it
  // is persisted with everything else the machine decided, and it downgrades a
  // `ready` unit to an indicative estimate for the same reason a dimension or a
  // thermal miss does: the answer is defensible, and it is not confirmed.
  if (note) {
    const filter: FilterOutcome = {
      filter: "composite", passed: false, severity: "warning",
      reason: "no single frame system supplies every unit — units chosen independently, confirm coupling at review",
    };
    for (const unit of units) {
      const selected = unit.result.selected;
      if (!selected) continue;
      selected.outcome.filters = [...selected.outcome.filters, filter];
      if (selected.outcome.status === "ready") selected.outcome.status = "commercial_only_estimate";
      if (unit.result.status === "ready") unit.result.status = "commercial_only_estimate";
    }
  }

  return {
    units,
    system: null,
    mixedSystems: !!note,
    glazingSlugs: [...new Set(
      units.map((u) => glassOf(u.result.selected?.selectedVariant ?? null)).filter((g): g is string => !!g),
    )],
    deviation: null,
    totalCents: null,
    note,
  };
}
