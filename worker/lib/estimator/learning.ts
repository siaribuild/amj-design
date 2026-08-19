import type { Env } from "../../types";
import type { OpeningInput } from "./types";

export const LEARNING_VERSION = "v2-finalized-contextual";

const bucket = (value: number | null | undefined, cuts: number[]) => {
  if (value == null || !Number.isFinite(value)) return "unknown";
  const idx = cuts.findIndex((cut) => value < cut);
  return idx < 0 ? `g${cuts.length}` : `g${idx}`;
};

/** A deliberately coarse but thermally relevant retrieval key. It avoids the old
 * global family|operation popularity signal while retaining enough density for
 * early datasets. */
export function contextKey(opening: OpeningInput): string {
  const t = opening.thermalContext;
  return [
    (opening.family || "any").toLowerCase(),
    (opening.operationType || "any").toLowerCase(),
    t?.requirementBasis || "none",
    t?.orientation || "unknown",
    t?.riskBand || "unknown",
    t?.climateZone || "unknown",
    t?.jurisdiction || "unknown",
    t?.buildingClass || "unknown",
    t?.envelopeClass || "unknown",
    bucket(opening.widthMm, [900, 1800, 3000]),
    bucket(opening.heightMm, [900, 1800, 2400]),
    bucket(t?.glazingToRoomFloorRatio, [0.15, 0.3, 0.5]),
  ].join("|");
}

// ═══════════════════════════════════════════════════════════════════════════
// THE RETRIEVAL KEY (D12, spec §4.8, design AD8)
//
// Record twelve fields, retrieve on four. The twelve-field `contextKey` above
// keeps being written — recording is untouched — but it is useless for LOOKUP:
// in production it produced 9 usable rows across 11 distinct keys, so every
// opening sat alone in its bucket and the model returned the neutral answer
// every time it was ever asked, and always would have. Four coarse fields put
// the density threshold at roughly 20 issued quotes instead of roughly 20,000.
//
// The key is STORED and VERSIONED, and every value it reads is present in
// `context_json`. That is what makes a later redefinition of the coarsening a
// recompute over stored rows rather than lost history (AC-30) — standard
// feature-store discipline, and the thing that makes "record twelve, retrieve
// four" safe rather than lossy.
// ═══════════════════════════════════════════════════════════════════════════

export const RETRIEVAL_KEY_VERSION = "rk-v1";

/** The five requirement bases a key may carry. Anything else is 'none'. A
 *  choice made against a real energy report is a different kind of evidence
 *  from one made against a default envelope, and merging them would let weak
 *  evidence outvote strong. */
const REQUIREMENT_BASES = new Set([
  "explicit_energy_report", "plan_derived", "default_envelope", "human_override", "none",
]);

/** An operation type is a catalogue enum, so it looks like one or it is 'other'.
 *  WHITELISTED, never escaped or truncated: escaping would let a customer's
 *  document text into a cross-account queryable index in a mangled form, and
 *  truncating would let it in as a plausible-looking prefix. */
const OPERATION = /^[a-z][a-z-]{0,23}$/;

/** By WIDTH, at 1800 and 3000 mm — width is what the frame series' max-width
 *  limits actually turn on, and it is the axis that decides whether a split is
 *  in play at all. Three bands rather than the legacy sixteen width×height
 *  combinations (AD8). */
function sizeBand(widthMm: unknown): "s" | "m" | "l" | "unknown" {
  const w = typeof widthMm === "number" ? widthMm : Number(widthMm);
  if (!Number.isFinite(w) || w <= 0) return "unknown";
  if (w < 1800) return "s";
  if (w <= 3000) return "m";
  return "l";
}

/**
 * `operationType | requirementBasis | sizeBand | thermalRequired`.
 *
 * AC-56 holds BY CONSTRUCTION: each of the four positions can only ever emit a
 * value from a closed set, so no substring of any customer document can appear
 * in the key and no customer's text becomes a queryable index across accounts.
 * A value that fails its enumeration is REPLACED, not sanitised — there is no
 * transformation of "Mrs J. Whitmore, 14 Ellerslie Road" that belongs in a
 * bucket name.
 *
 * `family` is deliberately absent: it is a function of the operation
 * (`operationForFamily`), so carrying both spends cardinality on no extra
 * information.
 */
export function retrievalKey(context: {
  operationType?: unknown;
  requirementBasis?: unknown;
  widthMm?: unknown;
  thermalRequired?: unknown;
}): string {
  const operation = typeof context.operationType === "string" && OPERATION.test(context.operationType.toLowerCase())
    ? context.operationType.toLowerCase()
    : "other";
  const basis = typeof context.requirementBasis === "string" && REQUIREMENT_BASES.has(context.requirementBasis)
    ? context.requirementBasis
    : "none";
  const thermal = context.thermalRequired === true || context.thermalRequired === 1 || context.thermalRequired === "1"
    ? "1" : "0";
  return [operation, basis, sizeBand(context.widthMm), thermal].join("|");
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SHADOW MODEL — dark by construction (D11)
//
// It records what it WOULD have said and is wired into nothing the ladder
// reads. `runProjectEstimate` builds it once per run and hands it to the
// OUTCOME BUILDER, which stamps a `learned` block on each candidate for staff
// to see. The ladder's interface has no parameter that could receive it, so
// "removing the learned model changes no selection anywhere" (AC-32) is a fact
// about the type signature rather than a promise about the code.
// ═══════════════════════════════════════════════════════════════════════════

/** The density floor, raised from the legacy 2 (spec A10). Laplace smoothing on
 *  n=2 swings between 0.25 and 0.5 on a single row — the model would announce a
 *  preference on evidence one more quote could reverse. At n≥5 the estimate is
 *  stable enough to put in front of a reviewer as "this is what humans did".
 *
 *  A LEARNED-LAYER constant, not a ladder one: it changes what staff are shown
 *  and can move no recommendation (AC-4 is about the selection path). */
export const SHADOW_MIN_OBSERVATIONS = 5;

export interface ShadowRow {
  retrieval_key: string | null;
  final_product_slug: string | null;
  provenance: string | null;
}

export interface ShadowLookup {
  retrievalKey: string;
  observations: number;
  provenance: { inPlatform: number; backfilled: number };
  /** Rows in this bucket naming THIS product. Raw counts, always exposed, so a
   *  reviewer can discount a thin lead themselves. */
  supportFor(productSlug: string): number;
  /** The unique modal product, or null below the floor / on a tie (AC-31). */
  preferredSlug: string | null;
}

export interface ShadowLearnedModel {
  version: string;
  lookup(opening: OpeningInput): ShadowLookup;
}

interface Bucket {
  total: number;
  inPlatform: number;
  backfilled: number;
  bySlug: Map<string, number>;
}

const EMPTY: Bucket = { total: 0, inPlatform: 0, backfilled: 0, bySlug: new Map() };

/** Pure, so the whole model is testable without a database. */
export function aggregateShadow(rows: ShadowRow[]): ShadowLearnedModel {
  const buckets = new Map<string, Bucket>();
  for (const row of rows ?? []) {
    // A row with no key belongs to no bucket. Counting it in the nearest one
    // would put pre-platform history behind a claim about a specific kind of
    // opening — which is the opposite of what the key exists to establish.
    if (!row.retrieval_key || !row.final_product_slug) continue;
    const bucket = buckets.get(row.retrieval_key)
      ?? { total: 0, inPlatform: 0, backfilled: 0, bySlug: new Map<string, number>() };
    bucket.total += 1;
    // D18: a backfilled row is REAL — an actual plan with the product that was
    // actually manufactured. The flag exists because the decision was made
    // outside the platform's review flow and may lack the thermal context the
    // key reads, not because it is less true. So it counts EQUALLY and the
    // split is reported; down-weighting it would need a weight, and an
    // unsourced weight nobody can defend is the disease this redesign cures.
    if (row.provenance === "in_platform") bucket.inPlatform += 1;
    else if (row.provenance === "backfilled") bucket.backfilled += 1;
    bucket.bySlug.set(row.final_product_slug, (bucket.bySlug.get(row.final_product_slug) ?? 0) + 1);
    buckets.set(row.retrieval_key, bucket);
  }

  return {
    version: RETRIEVAL_KEY_VERSION,
    lookup(opening) {
      const key = retrievalKey(shadowContext(opening));
      const bucket = buckets.get(key) ?? EMPTY;
      return {
        retrievalKey: key,
        observations: bucket.total,
        provenance: { inPlatform: bucket.inPlatform, backfilled: bucket.backfilled },
        supportFor: (slug) => bucket.bySlug.get(slug) ?? 0,
        preferredSlug: modalSlug(bucket),
      };
    },
  };
}

/**
 * Build the shadow model from the reviewed corpus.
 *
 * THE READ IS CROSS-TENANT, and that is worth naming rather than glossing: it
 * aggregates over every account's approved outcomes. What makes it defensible is
 * WHAT LEAVES — a product slug and some counts. No project id, no account id, no
 * price, no free text and no `context_json` is selected, so nothing that could
 * identify one customer's job can reach another customer's estimate. The bucket
 * itself is four enumerated values (see `retrievalKey`), so it carries no
 * customer text either.
 *
 * `recommendation_eligible = 1 AND quality_state = 'approved'` is the reviewed
 * corpus and only that: a `pending` row is an unsettled question and a
 * `rejected` one is a recorded mistake, and neither is evidence about what
 * humans choose. A row with no key belongs to no bucket, so it is not fetched.
 */
export async function buildShadowModel(env: Env): Promise<ShadowLearnedModel> {
  const { results } = await env.DB.prepare(
    `SELECT retrieval_key, final_product_slug, provenance
       FROM recommendation_outcome
      WHERE recommendation_eligible = 1
        AND quality_state = 'approved'
        AND retrieval_key IS NOT NULL`,
  ).all<ShadowRow>();
  return aggregateShadow(results ?? []);
}

/** The UNIQUE modal product, above the floor. A bare argmax on a tie is an
 *  alphabetical coin flip dressed up as "the layer would have preferred X"; the
 *  reviewer sees the counts either way, so suppressing the claim costs them
 *  nothing and asserting it would cost them their trust the first time they
 *  checked. A thin but genuine lead IS reported — withholding a 3-of-5 majority
 *  would need a second threshold with nothing behind it. */
function modalSlug(bucket: Bucket): string | null {
  if (bucket.total < SHADOW_MIN_OBSERVATIONS) return null;
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [slug, count] of bucket.bySlug) {
    if (count > bestCount) { best = slug; bestCount = count; tied = false; }
    else if (count === bestCount) tied = true;
  }
  return tied ? null : best;
}

/** The four fields the key reads, off an opening rather than off a stored row. */
const shadowContext = (opening: OpeningInput) => ({
  operationType: opening.operationType ?? null,
  requirementBasis: opening.thermalContext?.requirementBasis ?? null,
  widthMm: opening.widthMm ?? null,
  thermalRequired: !resolvedRequirementAbsent(opening),
});

/** Whether this opening carries a thermal requirement at all. Read through the
 *  same coherence-guarded resolution selection uses, so the bucket a lookup
 *  lands in matches the bucket the capture wrote. */
function resolvedRequirementAbsent(opening: OpeningInput): boolean {
  const r = opening.requirements ?? null;
  return !r || (r.maxUValue == null && r.minShgc == null && r.maxShgc == null);
}

// HistoricalRow, Counts, smooth(), HistoricalModel, aggregateHistorical() and
// buildHistoricalModel() lived here and are GONE (ADR 0007).
//
// They fed the deleted 0.10 historical weight, and D12 explains why that never
// mattered: the twelve-field contextKey produced 9 usable rows across 11
// distinct keys in production — every opening alone in its bucket, so the model
// returned the neutral 0.5 every time it was ever asked, and always would have.
// A cheapest-wins ladder has no channel for a preference in any case.
//
// contextKey() itself STAYS: it is still written to the NOT NULL context_key
// column at capture, and recording is untouched (D12). Phase 3 adds the coarse
// retrieval key and the dark shadow model that reads it.

interface ThermalCorrectionRow {
  context_key: string;
  reviewed_thermal_json: string;
}

export interface ApprovedThermalModel {
  observations: number;
  apply(opening: OpeningInput): OpeningInput;
}

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Physical learning is isolated from commercial ranking. Only explicitly
 * adjudicated thermal targets are read, and an exact context needs at least
 * three examples before it can supply an inferred requirement. Explicit energy
 * reports always win. */
export function aggregateApprovedThermal(rows: ThermalCorrectionRow[]): ApprovedThermalModel {
  const groups = new Map<string, { maxU: number[]; minShgc: number[]; maxShgc: number[] }>();
  for (const row of rows ?? []) {
    try {
      const value = JSON.parse(row.reviewed_thermal_json || "{}");
      if (typeof value.maxUValue !== "number") continue;
      const group = groups.get(row.context_key) ?? { maxU: [], minShgc: [], maxShgc: [] };
      group.maxU.push(value.maxUValue);
      if (typeof value.minShgc === "number") group.minShgc.push(value.minShgc);
      if (typeof value.maxShgc === "number") group.maxShgc.push(value.maxShgc);
      groups.set(row.context_key, group);
    } catch { /* malformed historical row is excluded */ }
  }
  const observations = [...groups.values()].reduce((sum, group) => sum + group.maxU.length, 0);
  return {
    observations,
    apply(opening) {
      if (opening.thermalContext?.requirementBasis === "explicit_energy_report") return opening;
      const group = groups.get(contextKey(opening));
      if (!group || group.maxU.length < 3) return opening;
      return {
        ...opening,
        advisoryRequirements: {
          maxUValue: median(group.maxU),
          minShgc: group.minShgc.length >= 3 ? median(group.minShgc) : null,
          maxShgc: group.maxShgc.length >= 3 ? median(group.maxShgc) : null,
        },
        thermalContext: {
          ...(opening.thermalContext ?? {}),
          // Preserve the original case context for retrieval density. The flag
          // records that approved precedent constrained eligibility without
          // rewriting a plan/default basis into a compliance claim.
          thermalPrecedentApplied: true,
        },
      };
    },
  };
}

export async function buildApprovedThermalModel(env: Env): Promise<ApprovedThermalModel> {
  const { results } = await env.DB.prepare(
    `SELECT context_key, reviewed_thermal_json
       FROM recommendation_outcome
      WHERE thermal_eligible=1 AND recommendation_eligible=0
        AND quality_state='approved' AND reviewed_thermal_json IS NOT NULL`,
  ).all<ThermalCorrectionRow>();
  return aggregateApprovedThermal(results ?? []);
}
