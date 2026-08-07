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
// The fix is not a new ranker. It is the SAME ranker asked a bigger question:
// which frame system should this opening be built from, given that every unit
// must come out of it. So the loop is inverted —
//
//     for each system that can supply every unit
//         choose the best frame and glass for each unit WITHIN that system
//         unify the glass across the units
//         score the whole make-up: averaged thermal, summed price
//     take the best make-up
//
// — and the six weighted components are rank.ts's own, aggregated by area.
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
import type { HistoricalModel } from "./learning";
import type { ScoreComponents } from "./rank";
import { coveringSystems, partnersOf, systemOf } from "./compatibility";
import { area, commercialScores, glassOf, scoreComposite, type ScoredUnit } from "./compositeRank";
import type { FilterOutcome } from "./rules";

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
  score: number | null;
  components: ScoreComponents | null;
  /** What a reviewer needs told, or null when there is nothing to say. */
  note: string | null;
}

/** How many covering systems are actually tried. They arrive best-first (exact
 *  make-ups, then by how much of the opening the system covers itself), so this
 *  is a bound on work rather than a filter on quality — and four is already more
 *  platforms than any one opening has ever had available to it. */
const MAX_SYSTEMS = 4;
/** Distinct glasses trialled across the units. Pass one produces at most one per
 *  unit, and a composite is capped at a handful of units. */
const MAX_GLASS_TRIALS = 3;

interface MakeUp {
  system: string;
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
  historical?: HistoricalModel,
): Promise<CompositeSelectionResult> {
  if (segments.length < 2) return fallback(opening, segments, repo, priceFn, historical, null);

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
    return fallback(opening, segments, repo, priceFn, historical,
      "No single frame system supplies every unit of this opening, so the units were chosen "
      + "independently and may not couple — confirm the make-up at technical review.");
  }

  const combined = primary.map((p, i) => [...p, ...alternate[i]]);
  const makeUps: MakeUp[] = [];
  for (const { slug: system } of covering) {
    // The partners this system may reach through, resolved once. Without them a
    // unit the system cannot make itself is looked for in the wrong place: the
    // partner's product sits in the opening's own category, so asking only
    // "does THIS system have one here" sent the unit across the category
    // boundary and found nothing.
    const partners = new Set(partnersOf(combined, system).keys());
    const first = await selectAll(system, partners, null, segments, primary, alternate, repo, priceFn, historical, null);
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

    for (const glass of trials) {
      const trial = await selectAll(system, partners, glass, segments, primary, alternate, repo, priceFn, historical, first);
      if (trial) makeUps.push(trial);
    }
  }

  if (!makeUps.length) {
    return fallback(opening, segments, repo, priceFn, historical,
      "No frame system could supply a complete, priceable make-up for this opening — the units "
      + "were chosen independently and may not couple; confirm at technical review.");
  }

  // Commercial is normalised across the make-ups, which is the only level it can
  // honestly be normalised at: comparing one unit's price against another unit's
  // would say a small lite is a better deal than a large sash.
  const commercial = commercialScores(makeUps.map((m) => m.total));
  let best: { makeUp: MakeUp; score: number; components: ScoreComponents } | null = null;
  makeUps.forEach((makeUp, i) => {
    const { score, components } = scoreComposite(opening, makeUp.scored, commercial[i]);
    if (!best || score > best.score) best = { makeUp, score, components };
  });
  const chosen = best!;

  const glazingSlugs = [...new Set(
    chosen.makeUp.units.map((u) => glassOf(u.result.selected?.selectedVariant ?? null)).filter((g): g is string => !!g),
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
    score: chosen.score,
    components: chosen.components,
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
  partners: Set<string>,
  glazingSlug: string | null,
  segments: CompositeSegmentInput[],
  primary: CatalogueCandidate[][],
  alternate: CatalogueCandidate[][],
  repo: CatalogueRepository,
  priceFn: PriceFn,
  historical: HistoricalModel | undefined,
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
        repo, priceFn, historical,
        { systems, glazingSlugs: seg.ownBand || !glazingSlug ? null : [glazingSlug] },
      );

    const selected = result.selected;
    if (!selected) return null;
    units.push({ index: i, result, crossedToCategory });
    scored.push({
      opening: seg.opening, candidate: selected.candidate, variant: selected.selectedVariant,
      widthMm: seg.widthMm, heightMm: seg.heightMm, ownBand: seg.ownBand,
      total: selected.price?.total ?? null,
    });
    const unitTotal = selected.price?.total ?? null;
    total = total == null || unitTotal == null ? null : total + unitTotal;
  }

  return { system, glazingSlug, units, scored, total };
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
  historical: HistoricalModel | undefined,
  note: string | null,
): Promise<CompositeSelectionResult> {
  const units: CompositeUnit[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    let crossedToCategory: string | null = null;
    let result = await selectForOpening({ ...seg.opening, family: seg.primaryCategory ?? seg.opening.family ?? null },
      repo, priceFn, historical);
    if (!result.selected && seg.alternateCategory) {
      const crossed = await selectForOpening({ ...seg.opening, family: seg.alternateCategory },
        repo, priceFn, historical);
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
    score: null,
    components: null,
    note,
  };
}
