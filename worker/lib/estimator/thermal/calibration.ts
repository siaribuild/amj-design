// CALIBRATION — the three facts that bear on the owner's dial, in one place.
//
//   axis 1  what parsed energy reports have DEMANDED
//   axis 2  what the active default ASSERTS, and on whose authority
//   axis 3  what the PUBLISHED CATALOGUE can deliver at each candidate cap
//
// Axis 3 is the axis this module exists for. An earlier proposal derived a
// tighter default from the reports in axes 1–2 and would have been exactly
// wrong: it would have taken deliverable published rows from 49 to 28 while the
// owner is deliberately holding most of the catalogue back pending a definitive
// product list. So the report presents the three axes and the cost of a change,
// and the human concludes.
//
// TWO PROPERTIES ARE ARCHITECTURAL HERE, NOT PROCEDURAL:
//   - This module contains no INSERT, UPDATE or DELETE and exports nothing that
//     writes. Auto-tuning the dial would re-create the disease this feature
//     cures, and the owner's withdrawal of the derivation rule is the proof.
//   - There is no `recommendedValue` field at any sample size. A withdrawn
//     derivation rule must not return dressed as a recommendation.
import type { Env } from "../../../types";
import { createCatalogueRepository, sanityExecutor, type QueryExecutor } from "../catalogue";
import { zoneCapValues } from "./computedBand";
import { resolveActiveDefaultBand, type ActiveDefaultBand, type DefaultBandMethod } from "./defaultBand";

/** The evidence floor: below five distinct projects, the demand axis is labelled
 *  thin rather than dressed up as advice. Two projects is a coincidence. */
export const CALIBRATION_PROJECT_FLOOR = 5;

const BASES = ["explicit_energy_report", "plan_derived", "default_envelope", "human_override"] as const;
export type RequirementBasisName = typeof BASES[number];

export interface CalibrationReport {
  computedAt: string;
  /** The catalogue state this reading was taken against, so two readings taken
   *  at different times can be compared rather than merely differ. */
  catalogueRevision: string;
  activeDefault: {
    maxUValue: number; version: string; method: DefaultBandMethod;
    source: string; derivedAt: string; interim: boolean;
  };
  basisCounts: Record<RequirementBasisName, number>;
  reportRows: {
    openings: number; distinctProjects: number;
    minUValue: number | null; maxUValue: number | null; meanUValue: number | null;
  };
  /** Products excluded from axis 3 entirely because they are withdrawn from
   *  sale. Surfaced rather than silently dropped: a withdrawn product can
   *  deliver nothing, and leaving it in either half of the ratio would distort
   *  the very number the dial-turner is reading. */
  disabledProductsExcluded: number;
  /** Whether the demand axis rests on enough distinct projects to mean anything.
   *  Below the floor it says "thin evidence" — never a number dressed as advice.
   *
   *  Note what is NOT in this type at any sample size: a recommended value. */
  sampleAdequate: boolean;
  candidateCaps: CapConsequence[];
}

export type CapOrigin = "active_default" | "zone_table" | "report_min" | "report_mean" | "report_max";

export interface CapConsequence {
  cap: number;
  /** Why this cap is on the list. Every candidate is derived from something the
   *  platform already asserts or has already observed — there are no hand-picked
   *  numbers here, which is the whole point. */
  origins: CapOrigin[];
  /** Axis 3, rows: what could actually be SOLD at this cap. */
  publishedRowsMeeting: number;
  publishedRowsTotal: number;
  /** Authored but not published, reported separately: the owner is deliberately
   *  holding rows back pending AMJ's definitive product list, and conflating the
   *  two would either overstate what can be sold or misread strategy as a gap. */
  unpublishedRowsMeeting: number;
  /** Axis 3, products: "can deliver" means what the estimator can actually
   *  select, so a product counts on its effective row set. */
  productsWithPublishedRowMeeting: number;
  productsTotal: number;
  /** THE CHANGE-COST STATEMENT: what moving the default to this cap would cost
   *  against today, in published rows and — the figure that actually matters —
   *  in products that would stop having any published row meeting the default.
   *  Null for the active cap, which costs nothing against itself. */
  deltaVsActive: { publishedRows: number; productsLosingAllPublishedRows: number } | null;
}

/** One product's rows as the estimator would see them: profile rows if it has
 *  any, else the legacy per-product variants — the same preference `toCandidate`
 *  applies, so "can deliver" means what could actually be picked. */
export interface CalibrationProduct {
  disabled: boolean;
  rows: { uValue: number | null; published: boolean }[];
}

const meets = (row: { uValue: number | null; published: boolean }, cap: number) =>
  row.uValue != null && row.uValue <= cap;

export interface CalibrationInput {
  computedAt: string;
  catalogueRevision: string;
  activeDefault: ActiveDefaultBand;
  basisRows: { requirement_basis: string; n: number }[];
  reportStats: {
    openings: number; projects: number;
    minU: number | null; maxU: number | null; meanU: number | null;
  };
  /** Every authored row across the thermal PROFILE documents. Counted at the
   *  document level so a profile shared by several products is counted once —
   *  counting through products would double it and make the owner's own measured
   *  306/58 unreproducible. */
  profileRows: { uValue: number | null; published: boolean }[];
  products: CalibrationProduct[];
}

/** Two decimal places, the resolution a Uw figure is quoted at. Null stays null:
 *  no observations is not the same fact as zero. */
const round2 = (value: number | null | undefined): number | null =>
  value == null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;

/** The caps worth showing consequences for: the active default, the zone table's
 *  own values, and what reports have actually asked for — deduped and sorted.
 *
 *  Derived, never hand-picked. `computedBand.zoneCapValues()` is the only source
 *  of the zone term, so this module introduces no cap literal of its own. */
export function candidateCaps(
  activeCap: number,
  reportStats: { minU: number | null; meanU: number | null; maxU: number | null },
): { cap: number; origins: CapOrigin[] }[] {
  const origins = new Map<number, CapOrigin[]>();
  const add = (value: number | null, origin: CapOrigin) => {
    if (value == null || !Number.isFinite(value) || value <= 0) return;
    const existing = origins.get(value);
    if (existing) { if (!existing.includes(origin)) existing.push(origin); return; }
    origins.set(value, [origin]);
  };
  add(round2(activeCap), "active_default");
  for (const cap of zoneCapValues()) add(cap, "zone_table");
  add(round2(reportStats.minU), "report_min");
  add(round2(reportStats.meanU), "report_mean");
  add(round2(reportStats.maxU), "report_max");
  return [...origins.entries()]
    .sort(([a], [b]) => a - b)
    .map(([cap, capOrigins]) => ({ cap, origins: capOrigins }));
}

/** Pure: the three axes from already-read facts. Every number in, every number
 *  out — no identifier of any kind passes through this function. */
export function computeCalibration(input: CalibrationInput): CalibrationReport {
  const basisCounts = Object.fromEntries(BASES.map((b) => [b, 0])) as Record<RequirementBasisName, number>;
  for (const row of input.basisRows) {
    if ((BASES as readonly string[]).includes(row.requirement_basis)) {
      basisCounts[row.requirement_basis as RequirementBasisName] = Number(row.n) || 0;
    }
  }
  const active = input.activeDefault;
  return {
    computedAt: input.computedAt,
    catalogueRevision: input.catalogueRevision,
    activeDefault: {
      maxUValue: active.maxUValue, version: active.version, method: active.method,
      source: active.source, derivedAt: active.derivedAt, interim: active.interim,
    },
    basisCounts,
    reportRows: {
      openings: input.reportStats.openings,
      distinctProjects: input.reportStats.projects,
      minUValue: round2(input.reportStats.minU),
      maxUValue: round2(input.reportStats.maxU),
      meanUValue: round2(input.reportStats.meanU),
    },
    disabledProductsExcluded: input.products.filter((product) => product.disabled).length,
    sampleAdequate: input.reportStats.projects >= CALIBRATION_PROJECT_FLOOR,
    candidateCaps: capConsequences(active.maxUValue, input),
  };
}

function capConsequences(activeCap: number, input: CalibrationInput): CapConsequence[] {
  const publishedRows = input.profileRows.filter((row) => row.published);
  const sellable = input.products.filter((product) => !product.disabled);
  const deliversAt = (product: CalibrationProduct, cap: number) =>
    product.rows.some((row) => row.published && meets(row, cap));
  const activeRowsMeeting = publishedRows.filter((row) => meets(row, activeCap)).length;

  return candidateCaps(activeCap, input.reportStats).map((candidate) => {
    const rowsMeeting = publishedRows.filter((row) => meets(row, candidate.cap)).length;
    return {
      ...candidate,
      publishedRowsMeeting: rowsMeeting,
      publishedRowsTotal: publishedRows.length,
      unpublishedRowsMeeting: input.profileRows.filter((row) => !row.published && meets(row, candidate.cap)).length,
      // A product with no published row meeting the cap counts once in the
      // denominator and never in a numerator — it must not vanish from either.
      productsWithPublishedRowMeeting: sellable.filter((product) => deliversAt(product, candidate.cap)).length,
      productsTotal: sellable.length,
      deltaVsActive: candidate.origins.includes("active_default") ? null : {
        publishedRows: rowsMeeting - activeRowsMeeting,
        productsLosingAllPublishedRows: sellable
          .filter((product) => deliversAt(product, activeCap) && !deliversAt(product, candidate.cap)).length,
      },
    };
  });
}

// ── The reads ────────────────────────────────────────────────────────────────
//
// Two D1 statements and two catalogue queries. Every one of them is a read, and
// that is a property of this file rather than a habit: there is no write verb
// anywhere in it, and nothing it exports can write.

/** Axis 3, rows. Counted over the thermal PROFILE documents themselves, because
 *  a profile referenced by several products must be counted once — going through
 *  products would double it and make the owner's own measured 306/58 impossible
 *  to reproduce. Published is `published !== false`, the reading the rest of the
 *  catalogue layer already uses.
 *
 *  `_id` is deliberately NOT projected. Nothing here needs a document identity,
 *  and identity that is never fetched cannot leak into a cross-account aggregate
 *  by a later careless mapping. `_rev` is, because the report states which
 *  catalogue state it was taken against. */
const PROFILE_ROWS_QUERY = `*[_type == "thermalProfile"]{ "rev": _rev, "rows": rows[]{ uValue, published } }`;

/** THE CURRENT EXTRACTION OF EACH PROJECT, and the reason axis 1 is a reading of
 *  demand rather than of upload history.
 *
 *  `opening_requirements` is insert-only by design: every pipeline pass writes a
 *  NEW `building_models` row and a fresh set of requirement rows under it, so a
 *  project reprocessed eight times carries eight copies of every opening its one
 *  energy report demanded. Counting the table raw made axis 1 report retries.
 *  Measured in production: 255 explicit-report rows against 34 distinct
 *  (project, opening) pairs across 2 projects — 7.5x.
 *
 *  DEDUPED BY BUILDING MODEL, NOT BY OPENING REF, and the two are not the same
 *  answer once a rerun changes what was extracted:
 *
 *    - Every run rebuilds the model from ALL of the project's current files
 *      (`ingestProjectFiles(projectId)`), so the newest model is the complete
 *      current reading, never a partial one. There is nothing to lose by
 *      dropping the older models, and a corrected Uw REPLACES the misread one
 *      instead of being averaged with it.
 *    - Deduping by opening ref would need its own tiebreak anyway ("which run's
 *      value for W04?"), and it would keep openings a corrected extraction no
 *      longer contains — reporting demand that no current report makes.
 *    - One model also keeps the axis internally coherent: openings, min, max and
 *      mean all describe the same reading, rather than a mixture of readings.
 *
 *  A parent frame and its thermal children are distinct rows under one model and
 *  are meant to count separately, which is a second reason not to collapse refs.
 *
 *  `created_at` orders the runs; `rowid` breaks the tie when two land inside the
 *  same second. No identifier is selected out of this — the CTE exists only to
 *  be joined against. */
const CURRENT_MODEL = `
  WITH current_model AS (
    SELECT bm.id AS id
      FROM building_models bm
     WHERE bm.id = (SELECT b.id FROM building_models b
                     WHERE b.project_id = bm.project_id
                     ORDER BY b.created_at DESC, b.rowid DESC
                     LIMIT 1)
  )`;

export async function readCalibration(env: Env, executor?: QueryExecutor): Promise<CalibrationReport> {
  const exec = executor ?? sanityExecutor(env);
  // One repository instance: it holds its own cache, so two would query twice.
  const repo = createCatalogueRepository(exec);

  // Axis 1 — counts by basis. No identifier column is selected. Deduped by
  // current building model for the same reason the statistics below are: these
  // counts are read as "what the reports said", and a reprocessed project would
  // otherwise weight itself by how many times it was reprocessed.
  const basis = await env.DB.prepare(
    `${CURRENT_MODEL}
     SELECT r.requirement_basis AS requirement_basis, COUNT(*) AS n
       FROM opening_requirements r
       JOIN current_model m ON m.id = r.building_model_id
      GROUP BY r.requirement_basis`,
  ).all<{ requirement_basis: string; n: number }>();

  // Axis 1 — what reports have demanded. `project_id` appears ONLY inside a
  // COUNT(DISTINCT …): the aggregate is deliberately unscoped across accounts
  // because that is its purpose, so the guard is that no identifier can come
  // back out of it.
  //
  // `distinctProjects` rides the same join, and its meaning tightens with it: a
  // project counts when its CURRENT extraction demands something explicit, not
  // when some superseded run once did. That is the reading the evidence floor
  // wants — five projects whose reports still say so.
  const stats = await env.DB.prepare(
    `${CURRENT_MODEL}
     SELECT COUNT(*) AS openings, COUNT(DISTINCT r.project_id) AS projects,
            MIN(r.max_u_value) AS minU, MAX(r.max_u_value) AS maxU, AVG(r.max_u_value) AS meanU
       FROM opening_requirements r
       JOIN current_model m ON m.id = r.building_model_id
      WHERE r.requirement_basis = 'explicit_energy_report' AND r.max_u_value IS NOT NULL`,
  ).first<{ openings: number; projects: number; minU: number | null; maxU: number | null; meanU: number | null }>();

  // Axis 2 — what the default asserts, and on whose authority.
  const activeDefault = await resolveActiveDefaultBand(env.DB);

  // Axis 3 — rows from the profile documents, products through the repository so
  // that "can deliver" means what the estimator could actually select.
  const profiles = env.SANITY_PROJECT_ID ? await exec(PROFILE_ROWS_QUERY, {}) : [];
  const profileRows = (Array.isArray(profiles) ? profiles : []).flatMap((profile: any) =>
    (Array.isArray(profile?.rows) ? profile.rows : []).map((row: any) => ({
      uValue: typeof row?.uValue === "number" ? row.uValue : null,
      published: row?.published !== false,
    })));

  const candidates = env.SANITY_PROJECT_ID ? await repo.queryCandidates(null, null) : [];
  const products: CalibrationProduct[] = candidates.map((candidate) => ({
    disabled: candidate.disabled === true,
    // `performanceVariants` is already the EFFECTIVE row set — profile rows when
    // the product has a profile, legacy variants otherwise — because that is the
    // preference `toCandidate` applies for selection.
    rows: candidate.performanceVariants.map((variant) => ({
      uValue: variant.uValue ?? null,
      published: variant.published !== false,
    })),
  }));

  const revisions = (Array.isArray(profiles) ? profiles : [])
    .map((profile: any) => String(profile?.rev ?? "")).sort().join("|");
  const catalogueRevision = `${repo.catalogueVersion(candidates)}+p${fnv1a(revisions)}`;

  return computeCalibration({
    computedAt: new Date().toISOString(),
    catalogueRevision,
    activeDefault,
    basisRows: basis.results ?? [],
    reportStats: {
      openings: Number(stats?.openings ?? 0),
      projects: Number(stats?.projects ?? 0),
      minU: stats?.minU ?? null,
      maxU: stats?.maxU ?? null,
      meanU: stats?.meanU ?? null,
    },
    profileRows,
    products,
  });
}

/** A short deterministic token over the profile revisions, so a change to a
 *  profile that no product references still moves the stated revision. */
function fnv1a(text: string): string {
  let hash = 2166136261;
  for (const ch of text) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
