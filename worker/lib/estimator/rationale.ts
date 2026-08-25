// The READ side of ops2 "Why this product" (spec §9, design §4.7).
//
// One deep module, so the route stays four lines. Everything hard is here: which
// run answers for a line, which of four shapes the answer takes, and what may
// never leave the building.
//
// ── IT READS STORED FACTS AND NOTHING ELSE (R3, D3, D19) ────────────────────
// No catalogue call, no estimator call, no requirement re-derivation — not even
// to fill a gap this module can see. A figure that was never captured says so;
// filling it from today's catalogue would reverse D3 and D5 and quietly undo
// what Phase 3a exists to protect. The one non-D1 read is the STATIC product
// list, for display names, which is the record endpoint's own convention.
//
// ── AND IT NEVER READS `origin` ─────────────────────────────────────────────
// A customer override does not move `quote_line.origin` — it stays 'ai'. So
// attribution is a COMPARISON (R24, WHY-AC-29), and the thing compared is the
// pick (§7.0), whose predicate lives once in `worker/lib/figures.ts`.
import { getProductBySlug } from "../../../src/data/catalogue";
import type {
  LineRationaleDto, RationaleCandidate, RationaleCurrent, RationaleFigures,
  RationaleUnit, UnitBandBasis,
} from "../../../src/data/rationale";
import type { CandidateOutcome, SelectionOutcome } from "../../../src/data/recommendation";
import { glazingOf, pickMoved, storedOptions, storedPickOf } from "../figures";
import type { Env } from "../../types";

const BAND_BASES: readonly UnitBandBasis[] = ["explicit_ref", "shared_type", "computed", "none"];

/** Unreadable JSON is no record, never a throw: this endpoint reports what a
 *  row carries, and a malformed blob is exactly the state a reviewer needs told
 *  rather than a 500. */
function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

const productName = (slug: string): string => getProductBySlug(slug)?.name ?? slug;

/** The line's own captured column. THREE STATES, all preserved (spec §9.0):
 *  a NULL column is `null`, a present-and-null is `{uValue:null,shgc:null}`,
 *  and figures are figures. Collapsing any pair of them mis-states the other. */
function capturedFigures(json: string | null | undefined): RationaleFigures | null {
  const parsed = parse<Partial<RationaleFigures>>(json);
  if (!parsed) return null;
  return {
    uValue: typeof parsed.uValue === "number" ? parsed.uValue : null,
    shgc: typeof parsed.shgc === "number" ? parsed.shgc : null,
  };
}

/** ADDITIVE FROM AN ALLOW-LIST, never a spread of the stored outcome. The
 *  stored `CandidateOutcome` carries price, deltaToSelected, exclusions and the
 *  learned layer; every one of them is forbidden on this surface (D18, R9), and
 *  a copy-then-delete would forward the next field somebody adds. */
const candidateOf = (o: CandidateOutcome): RationaleCandidate => ({
  productSlug: o.productSlug,
  productName: productName(o.productSlug),
  variantId: o.variantId ?? null,
  form: o.form === "split" ? "split" : "single",
  tier: o.tier,
  rank: o.rank ?? null,
  figures: { uValue: o.thermal?.uValue ?? null, shgc: o.thermal?.shgc ?? null },
  fits: !!o.fit?.fits,
  units: o.form === "split" && o.units
    ? o.units.map((u) => ({
        productSlug: u.productSlug,
        productName: productName(u.productSlug),
        operationType: u.operationType ?? null,
      }))
    : null,
});

interface LineRow {
  id: string;
  external_ref: string | null;
  product_slug: string | null;
  selected_variant_id: string | null;
  options_json: string | null;
  performance_figures_json: string | null;
  line_kind: string | null;
  composite_origin: string | null;
  review_json: string | null;
  ai_proposal_line_id: string | null;
}

interface SegmentRow {
  product_slug: string | null;
  options_json: string | null;
  selected_variant_id: string | null;
  performance_figures_json: string | null;
  segment_requirements_json: string | null;
  segment_requirement_basis: string | null;
  segment_thermal_review: number | null;
  segment_seq: number | null;
}

const currentOf = (line: LineRow): RationaleCurrent => ({
  productSlug: line.product_slug ?? "",
  productName: productName(line.product_slug ?? ""),
  figures: capturedFigures(line.performance_figures_json),
});

const unitOf = (code: string, s: SegmentRow): RationaleUnit => {
  const band = parse<{ maxUValue?: number; minShgc?: number; maxShgc?: number }>(s.segment_requirements_json);
  const basis = s.segment_requirement_basis;
  return {
    code,
    productSlug: s.product_slug ?? "",
    productName: productName(s.product_slug ?? ""),
    figures: capturedFigures(s.performance_figures_json),
    band: band
      ? {
          maxUValue: typeof band.maxUValue === "number" ? band.maxUValue : null,
          minShgc: typeof band.minShgc === "number" ? band.minShgc : null,
          maxShgc: typeof band.maxShgc === "number" ? band.maxShgc : null,
        }
      : null,
    basis: BAND_BASES.includes(basis as UnitBandBasis) ? basis as UnitBandBasis : null,
    reviewFlag: s.segment_thermal_review === 1,
  };
};

/** THE recorded "no frame system could supply it" sentence (WHY-AC-38). It has
 *  exactly one stored home, `review_json.composite`, and when staff have
 *  resolved that flag the trace is gone and nothing is stated — a named
 *  residual under R18/D5, not a gap to fill. */
function splitNoteOf(line: LineRow): string | null {
  const review = parse<Record<string, unknown>>(line.review_json);
  const note = review?.composite;
  return typeof note === "string" && note.trim() !== "" ? note : null;
}

/**
 * The rationale for one PARENT line of one project, or `null` when this project
 * has no such line.
 *
 * ONE ENTRY POINT, and that is the authorization (X-AC-4): a line in another
 * project and a line that never existed fall out of the same SELECT as the same
 * `null`, so the two refusals are one code path saying one sentence rather than
 * a rule somebody remembered to write. Every read below hangs off that row.
 */
export async function lineRationale(
  env: Env,
  args: { projectId: string; lineId: string },
): Promise<LineRationaleDto | null> {
  const line = await env.DB.prepare(
    `SELECT id, external_ref, product_slug, selected_variant_id, options_json, performance_figures_json,
            line_kind, composite_origin, review_json, ai_proposal_line_id
       FROM quote_line
      WHERE id = ? AND project_id = ? AND parent_line_id IS NULL`,
  ).bind(args.lineId, args.projectId).first<LineRow>();
  if (!line) return null;

  const isComposite = line.line_kind === "composite_parent";
  const units = isComposite ? await unitsOf(env, args, line) : null;

  // An ops-decided split has no machine rationale to open (R17, WHY-AC-37): a
  // person decided it, and the panel says so with the line's own figures.
  if (isComposite && line.composite_origin === "ops") {
    return { kind: "human", current: currentOf(line), units };
  }

  const opening = await env.DB.prepare(
    `SELECT o.id FROM opening_instance o
      WHERE o.quote_line_id = ?
         OR o.id = (SELECT opening_id FROM ai_proposal_line WHERE id = ?)
      ORDER BY o.created_at DESC LIMIT 1`,
  ).bind(line.id, line.ai_proposal_line_id).first<{ id: string }>();
  if (!opening) return { kind: "human", current: currentOf(line), units };

  // THE MOST RECENT RUN ONLY (D19). An opening estimated twice is not two
  // rationales merged; earlier runs are not listed and not reconciled.
  const run = await env.DB.prepare(
    `SELECT id, selection_json FROM selection_run
      WHERE opening_id = ? ORDER BY created_at DESC LIMIT 1`,
  ).bind(opening.id).first<{ id: string; selection_json: string | null }>();
  if (!run) return { kind: "human", current: currentOf(line), units };

  const rows = (await env.DB.prepare(
    `SELECT outcome_json, performance_snapshot_json, selected
       FROM candidate_result WHERE selection_run_id = ?`,
  ).bind(run.id).all<{ outcome_json: string | null; performance_snapshot_json: string | null; selected: number }>()).results ?? [];

  const recorded = rows
    .map((r) => ({ outcome: parse<CandidateOutcome>(r.outcome_json), snapshot: r.performance_snapshot_json }))
    .filter((r): r is { outcome: CandidateOutcome; snapshot: string | null } => !!r.outcome);

  // ── THE TWO EMPTINESSES, WHICH ARE NOT THE SAME FACT ────────────────────
  // A run with rows that carry NO outcome_json predates migration 0055: an
  // earlier model whose reasoning was not recorded (WHY-AC-10).
  //
  // A run with NO ROWS AT ALL is the everything-withheld shape of "evaluated,
  // nothing chosen" — and it must not reach the line above. `every()` over an
  // empty set is TRUE, so the obvious spelling of the pre-0055 test would
  // report an earlier model for a run this platform completed last week
  // (`persist.ts:143` writes exactly this shape). The row count is what
  // separates them, so it is asked first and out loud.
  if (rows.length > 0 && recorded.length === 0) return { kind: "unrecorded", current: currentOf(line) };

  const chosen = recorded.find((r) => r.outcome.selected);
  // WHY-AC-9's SECOND meaning: the run ran and selected nothing. Told apart
  // from "this product has no published figure" by the KIND, never by looking
  // at the figures — which cannot tell them apart and never could.
  if (!chosen) return { kind: "unresolved", current: currentOf(line) };

  const selection = parse<SelectionOutcome>(run.selection_json);
  const requirement = selection?.requirement ?? chosen.outcome.requirement;

  const alternatives = recorded
    .filter((r) => !r.outcome.selected && r.outcome.tier !== "excluded" && r.outcome.rank != null)
    .sort((a, b) => (a.outcome.rank ?? 0) - (b.outcome.rank ?? 0))
    .slice(0, 4)                                   // D18: four runners-up, five rows
    .map((r) => candidateOf(r.outcome));

  const beatenSingle = chosen.outcome.form === "split"
    ? recorded
        .filter((r) => !r.outcome.selected && r.outcome.form !== "split"
          && r.outcome.tier !== "excluded" && r.outcome.rank != null)
        .sort((a, b) => (a.outcome.rank ?? 0) - (b.outcome.rank ?? 0))[0] ?? null
    : null;

  return {
    kind: "recommendation",
    requirement: {
      maxUValue: requirement?.maxUValue ?? null,
      minShgc: requirement?.minShgc ?? null,
      maxShgc: requirement?.maxShgc ?? null,
      basis: requirement?.basis ?? null,
      absent: !!requirement?.absent,
    },
    tolerance: typeof selection?.tolerance === "number" ? selection.tolerance : 0,
    competingTier: selection?.competingTier ?? null,
    recommended: candidateOf(chosen.outcome),
    alternatives,
    selectionChanged: selectionChanged(line, chosen, units),
    current: currentOf(line),
    composite: isComposite && units
      ? {
          origin: "ai",
          beatenSingle: beatenSingle ? candidateOf(beatenSingle.outcome) : null,
          units,
        }
      : null,
    unsuppliedSplitNote: splitNoteOf(line),
  };
}

async function unitsOf(
  env: Env, args: { projectId: string; lineId: string }, line: LineRow,
): Promise<RationaleUnit[]> {
  const code = line.external_ref ?? "";
  const segments = (await env.DB.prepare(
    `SELECT product_slug, options_json, selected_variant_id, performance_figures_json,
            segment_requirements_json, segment_requirement_basis, segment_thermal_review, segment_seq
       FROM quote_line
      WHERE parent_line_id = ? AND project_id = ?
      ORDER BY segment_seq`,
  ).bind(line.id, args.projectId).all<SegmentRow>()).results ?? [];
  // The unit's own name, exactly as every other ops2 surface spells it.
  return segments.map((s, i) => unitOf(`${code}${String.fromCharCode(65 + i)}`, s));
}

/**
 * R24 / WHY-AC-28-31 — has a PERSON moved this line off what the platform
 * recommended?
 *
 * NEVER from `origin`. A customer override leaves `quote_line.origin` at 'ai'
 * and `ai_proposal_line_id` set, so the flag a reader reaches for first answers
 * a different question — and answers it wrongly on exactly the lines a reviewer
 * is auditing.
 *
 * The comparison is §7.0's PICK — product, glass and variant — and its
 * predicate lives once, in `worker/lib/figures.ts`. Reused rather than
 * re-spelled: one rule in two places is what produced every defect of Phase 3a,
 * and this is the same rule asked from the other side.
 *
 * DIRECTION MATTERS. The LINE is the pick and the RECOMMENDATION is what it is
 * compared against, so the variant term fires only when the line itself names a
 * variant that differs. That is what keeps D16 honest: after a glazing-only
 * customer change the row deliberately KEEPS the estimator's
 * `selected_variant_id`, so a product+variant comparison would read those
 * overridden lines as platform-made. The glass term dominates precisely where
 * the stored id has gone stale.
 *
 * (Design §4.7 step 7 paraphrases the variant term as "only where both sides
 * name one". The predicate it points at is the authority; the difference shows
 * only when the LINE names a variant the recommendation did not, which is a
 * person having chosen one.)
 */
function selectionChanged(
  line: LineRow,
  chosen: { outcome: CandidateOutcome; snapshot: string | null },
  units: RationaleUnit[] | null,
): { product: boolean; glazing: boolean } | null {
  if (chosen.outcome.form === "split") {
    // A make-up is compared on the products it is made of. Its recorded units
    // carry no glass identity of their own, so there is no glazing term to
    // report — and inventing one from the parent's options would describe the
    // opening rather than the lite that moved.
    const recommended = (chosen.outcome.units ?? []).map((u) => u.productSlug).sort();
    const current = (units ?? []).map((u) => u.productSlug).sort();
    const moved = recommended.length !== current.length
      || recommended.some((slug, i) => slug !== current[i]);
    return moved ? { product: true, glazing: false } : null;
  }

  const glazing = parse<{ glazingOptionSlug?: string | null }>(chosen.snapshot)?.glazingOptionSlug ?? null;
  const recommendedPick = storedPickOf({
    product_slug: chosen.outcome.productSlug,
    selected_variant_id: chosen.outcome.variantId ?? null,
    options_json: JSON.stringify({ glazing }),
  });
  const pick = {
    productSlug: line.product_slug ?? "",
    variantId: line.selected_variant_id ?? null,
    options: storedOptions(line.options_json),
  };
  // `pickMoved` decides WHETHER anything moved — one home for that, §7.0's.
  // These two name WHICH, over the same glass expression it uses, so the
  // qualifier the panel prints cannot describe a different glass from the one
  // that decided the change.
  if (!pickMoved(pick, recommendedPick)) return null;
  return {
    product: pick.productSlug !== (recommendedPick!.productSlug ?? ""),
    glazing: glazingOf(pick.options) !== (recommendedPick!.glazing ?? ""),
  };
}
