// Project estimate orchestration (spec §18): run the deterministic engine over
// every opening_instance in a project and persist the selection. Ties the
// CatalogueRepository, hard rules, pricing, the ladder and persistence together.
//
// One pass per opening, and the answer may be a single unit or a split — both
// compete in the same ladder (D7). Materialisation afterwards only WRITES the
// make-up that won; it no longer re-decides anything.
import type { Env } from "../../types";
import { createCatalogueRepository, sanityExecutor } from "./catalogue";
import { resolvePairing, selectWithSplits, splitSegmentSpecs } from "./splitCandidates";
import { persistSelection } from "./persist";
import { buildApprovedThermalModel } from "./learning";
import { createCachedPriceResolver } from "./pricing";
import { uuid } from "../util";
import type { CatalogueCandidate, OpeningInput } from "./types";
import type { PerformanceVariant } from "./types";
import { publishAiProposal, type ProposalSelection } from "../ai/proposal";
import { splitLine, loadCompositePolicy } from "../composite";
import { type SplitHint } from "./split";

// Schedule TYPE text → structured operation (the delivered parser records the raw
// schedule term; the estimator needs the operation vocabulary the catalogue uses).
function operationFromType(typeText: string | null | undefined): string | null {
  const t = (typeText || "").toUpperCase();
  if (!t) return null;
  if (t.includes("AWNING")) return "awning";
  if (t.includes("STACKER") || t.includes("SLIDING") || t.includes("SLIDER")) return "sliding";
  if (t.includes("FIXED")) return "fixed";
  if (t.includes("CASEMENT")) return "casement";
  if (t.includes("LOUVRE") || t.includes("LOUVER")) return "louvre";
  if (t.includes("BIFOLD") || t.includes("BI-FOLD") || t.includes("BI FOLD")) return "bi-fold";
  if (t.includes("HUNG")) return "double-hung";
  if (t.includes("TILT")) return "tilt-turn";
  if (t.includes("PIVOT")) return "pivot";
  if (t.includes("HINGED") || t.includes("ENTRY")) return "hinged";
  return null;
}

// Bridge the delivered schedule extraction (parse_line) into opening_instance
// rows — extraction source #1 (spec §15). Idempotent: skips a project that
// already has openings. Returns how many it created.
export async function bridgeParseLinesToOpenings(env: Env, projectId: string): Promise<number> {
  const existing = await env.DB.prepare("SELECT count(*) AS n FROM opening_instance WHERE project_id = ?").bind(projectId).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) return 0;

  const job = await env.DB
    .prepare("SELECT id FROM schedule_parse_job WHERE project_id = ? AND status IN ('completed','needs_review') ORDER BY created_at DESC LIMIT 1")
    .bind(projectId).first<{ id: string }>();
  if (!job) return 0;

  const { results } = await env.DB
    .prepare("SELECT id, raw_json, mapped_dims_json, external_ref FROM parse_line WHERE job_id = ? ORDER BY source_index")
    .bind(job.id).all<{ id: string; raw_json: string; mapped_dims_json: string | null; external_ref: string | null }>();

  const stmts: D1PreparedStatement[] = [];
  for (const pl of results ?? []) {
    let raw: any = {}; let dims: any = {};
    try { raw = JSON.parse(pl.raw_json || "{}"); } catch { /* ignore */ }
    try { dims = pl.mapped_dims_json ? JSON.parse(pl.mapped_dims_json) : {}; } catch { /* ignore */ }
    const family = raw.section === "door" ? "doors" : "windows";
    const width = Number(dims.width ?? raw.widthMm) || null;
    const height = Number(dims.height ?? raw.heightMm) || null;
    stmts.push(env.DB.prepare(
      `INSERT INTO opening_instance (id, project_id, parse_line_id, external_ref, family, operation_type, width_mm, height_mm, status)
       VALUES (?,?,?,?,?,?,?,?, 'extracted')`,
    ).bind(uuid(), projectId, pl.id, pl.external_ref, family, operationFromType(raw.typeText), width, height));
  }
  if (stmts.length) await env.DB.batch(stmts);
  return stmts.length;
}

/** The other category a composite's unit may be sought in, or null for none.
 *
 *  ONE WAY ONLY: a door composite may take a fixed WINDOW lite, because
 *  queryCandidates("doors","fixed") is empty and a door needing a lite otherwise
 *  fell through to the parent's slug and priced a fixed panel as a whole sliding
 *  door. A window composite may never take a door.
 *
 *  It shipped symmetric once and that was a hole rather than a generalisation.
 *  `sliding` is claimed by sliding-window, sliding-door AND slim-frame-sliding-door
 *  while exactly one product in the catalogue is a sliding window — so on a wide
 *  sliding-window opening every door system reported EXACT coverage, out-scored
 *  the window on thermal (a thermally-broken door meets a band a conventional
 *  window misses), and the line was built as two sliding DOORS on the door rate
 *  card. Nothing downstream would have caught it: splitLine checks that a product
 *  slug exists, never that it belongs to the opening's category.
 *
 *  Exported for the test that guards it: the composite selector honestly crosses
 *  in whichever direction it is handed, so THIS is where the rule lives. */
export const alternateCategoryFor = (primaryCategory: string | null): string | null =>
  (primaryCategory === "doors" ? "windows" : null);

export interface OpeningRow {
  id: string; external_ref: string | null; family: string | null; operation_type: string | null;
  width_mm: number | null; height_mm: number | null; requirements_json: string | null;
  quote_line_id: string | null; qty: number | null; options_json: string | null;
  context_json: string | null; requirement_basis: string | null;
}

export function pricingOptionSlugsFromOptions(options: Record<string, unknown>): string[] {
  const canonical = (value: string) => value.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const nonCommercial = new Set([
    "pricingOptionSlugs", "glassDescription", "doubleGlazed",
    "performanceVariantId", "frameTechnology", "glassBuildUp", "glazing", "coating",
  ]);
  const explicit = Array.isArray(options.pricingOptionSlugs)
    ? options.pricingOptionSlugs.filter((value): value is string => typeof value === "string" && !!value)
    : [];
  return [...new Set([
    ...explicit,
    ...Object.entries(options).flatMap(([key, value]) => {
      if (nonCommercial.has(key) || value == null || value === false || value === "") return [];
      if (typeof value === "string") return [`${canonical(key)}:${canonical(value)}`];
      if (value === true) return [canonical(key)];
      return [];
    }),
  ])];
}

export function toOpeningInput(row: OpeningRow): OpeningInput & { externalRef: string | null } {
  let requirements: OpeningInput["requirements"] = null;
  let options: Record<string, unknown> = {};
  let context: OpeningInput["thermalContext"] = null;
  try { const r = row.requirements_json ? JSON.parse(row.requirements_json) : null; if (r && typeof r === "object") requirements = r; } catch { /* ignore */ }
  try {
    const value = row.options_json ? JSON.parse(row.options_json) : {};
    if (value && typeof value === "object" && !Array.isArray(value)) options = value;
  } catch { /* ignore */ }
  try { const value = row.context_json ? JSON.parse(row.context_json) : null; if (value && typeof value === "object") context = value; } catch { /* ignore */ }
  const optionSlugs = pricingOptionSlugsFromOptions(options);
  return {
    externalRef: row.external_ref,
    family: row.family,
    operationType: row.operation_type,
    widthMm: row.width_mm,
    heightMm: row.height_mm,
    qty: Math.max(1, Math.floor(row.qty ?? 1)),
    optionSlugs,
    scheduleRequirements: {
      doubleGlazed: typeof options.doubleGlazed === "boolean" ? options.doubleGlazed : null,
      glassDescription: typeof options.glassDescription === "string" ? options.glassDescription : null,
      colour: typeof options.colour === "string" ? options.colour : null,
      flyscreen: typeof options.flyscreen === "boolean" ? options.flyscreen : null,
    },
    thermalContext: context ? { ...context, requirementBasis: row.requirement_basis as any } : {
      requirementBasis: row.requirement_basis as any,
    },
    requirements,
  };
}

export interface EstimateSummary {
  openings: number;
  selected: number;
  appliedToCart: number;
  lines: { openingId: string; externalRef: string | null; status: string; selectedProduct: string | null; total: number | null }[];
  reviewWarnings: string[];
}

export async function runProjectEstimate(env: Env, projectId: string, proposal?: {
  aiRunId: string;
  buildingModelId: string;
  sourceGeneration: number;
  sourceManifestHash: string;
  processingToken?: string;
}, opts?: {
  /** Per-opening (external_ref) split hints parsed from schedule comments; the AI
   *  proposes + materialises a review-flagged composite for these and for oversize
   *  openings (WS5). Absent ⇒ no auto-split. */
  splitHints?: Map<string, SplitHint>;
  /** Per-opening (external_ref) schedule TYPE text, verbatim. Carried separately
   *  because operation_type is stored normalised — pipeline writes
   *  operationFrom(familyRequested), so "OFFSET AWNING" reaches the estimator as
   *  plain "awning" and the family default cannot tell the two make-ups apart.
   *  Not a split hint: a hint means a document stated a layout, and stating one
   *  here would force a proposal onto openings that fit in a single frame. */
  scheduleTypes?: Map<string, string>;
}): Promise<EstimateSummary> {
  // Extraction source #1: if the project has parsed schedule lines but no
  // openings yet, bridge them first (idempotent).
  await bridgeParseLinesToOpenings(env, projectId);

  const { results } = await env.DB
    .prepare(`SELECT id, external_ref, family, operation_type, width_mm, height_mm,
                    requirements_json, quote_line_id, qty, options_json, context_json, requirement_basis
               FROM opening_instance
              WHERE project_id = ? AND (? IS NULL OR source_generation = ?)
              ORDER BY created_at`)
    .bind(projectId, proposal?.sourceGeneration ?? null, proposal?.sourceGeneration ?? null).all<OpeningRow>();
  const openings = results ?? [];

  const repo = createCatalogueRepository(sanityExecutor(env));
  // The approved-thermal advisory model: human precedent resolved into the
  // opening's requirement, which the ladder then judges every candidate against.
  // The old commercial preference model that also lived here is gone with the
  // weights (ADR 0007) — a cheapest-wins ladder has no channel for a preference,
  // and the dark learned layer that replaces it arrives with Phase 3.
  const thermalModel = await buildApprovedThermalModel(env);
  // The project's owner, for the account discount. Resolved once here rather than
  // per candidate — an estimate prices dozens of candidates per opening.
  const owner = await env.DB.prepare("SELECT owner_user_id FROM project WHERE id = ?")
    .bind(projectId).first<{ owner_user_id: string | null }>();
  const priceFromCache = await createCachedPriceResolver(env, owner?.owner_user_id ?? null);

  // Price a candidate for an opening via the private D1 rate card, keyed on the
  // product's pricingRef (a PRODUCT slug since 0031; falls back to 'default').
  const priceFn = async (candidate: CatalogueCandidate, opening: OpeningInput, variant: PerformanceVariant | null) => {
    if (!candidate.pricingRef) return null;
    const pricingKey = candidate.pricingRef;
    try {
      return priceFromCache({
        family: pricingKey,
        widthMm: opening.widthMm ?? 0,
        heightMm: opening.heightMm ?? 0,
        qty: opening.qty ?? 1,
        // The selected glass identity is a chargeable (per-m²) option: its slug
        // must be priced, not just the free-text pricingOptionSlugs escape hatch.
        optionSlugs: [...new Set([
          ...(opening.optionSlugs ?? []),
          ...(variant?.glazingOptionSlug ? [variant.glazingOptionSlug] : []),
          ...(variant?.pricingOptionSlugs ?? []),
        ])],
        // A declared product pricing reference is an exact private CPQ contract.
        // Falling back to a generic operation price would make thermally broken /
        // coating recommendations look priced while silently omitting their cost.
        requireExactRate: !!candidate.pricingRef,
        requireAllOptions: true,
      });
    } catch {
      return null;
    }
  };

  const lines: EstimateSummary["lines"] = [];
  let selectedCount = 0;
  let appliedToCart = 0;
  const proposalLines: ProposalSelection[] = [];
  // Read once per run, not per opening: it is one small D1 row, and every split
  // proposed below is measured against the same cap.
  const policy = await loadCompositePolicy(env);
  const splitHints = opts?.splitHints ?? new Map<string, SplitHint>();
  const scheduleTypes = opts?.scheduleTypes ?? new Map<string, string>();

  for (const row of openings) {
    const opening = thermalModel.apply(toOpeningInput(row));
    // THE HINT IS READ BEFORE SELECTION, NOT AFTER IT (D7).
    //
    // It used to arrive in a post-pass that reworked a pick already made. Now it
    // is one of the two things that decide whether a split may be a candidate at
    // all, and the split it admits competes in the same ladder as every single
    // unit rather than replacing their winner.
    const hint = (row.external_ref && splitHints.get(row.external_ref)) || null;
    const result = await selectWithSplits(opening, hint, {
      repo,
      priceFn,
      primaryCategory: opening.family ?? null,
      // ONE WAY ONLY. A door composite may take a fixed WINDOW lite; a window
      // composite may never take a door.
      alternateCategory: alternateCategoryFor(opening.family ?? null),
      resolvePairing: (representative) => resolvePairing(repo, {
        representative,
        maxSegments: policy.maxSegments,
        // The schedule's own wording, not the stored operation: "OFFSET AWNING"
        // and "AWNING" resolve to one family and one operation_type, so this is
        // the only place the difference still exists.
        offset: /\boffset\b/i.test(row.external_ref ? scheduleTypes.get(row.external_ref) ?? "" : ""),
      }),
    });
    await persistSelection(env, { projectId, openingId: row.id, result });
    proposalLines.push({
      openingId: row.id,
      quoteLineId: row.quote_line_id,
      externalRef: row.external_ref,
      opening,
      result,
    });
    if (result.selected) selectedCount++;
    lines.push({
      openingId: row.id,
      externalRef: row.external_ref,
      status: result.selected ? result.selected.outcome.status : (result.status as string),
      selectedProduct: result.selected?.candidate.sanityProductId ?? null,
      total: result.selected?.price?.total ?? null,
    });
  }
  if (proposal) {
    const published = await publishAiProposal(env, {
      projectId,
      ...proposal,
      lines: proposalLines,
    });
    if (!published.published) {
      const current = await env.DB.prepare("SELECT ai_generation, status_customer FROM project WHERE id=?")
        .bind(projectId).first<{ ai_generation: number; status_customer: string }>();
      if (current?.status_customer === "draft" && current.ai_generation === proposal.sourceGeneration) {
        throw new Error("proposal_publication_failed");
      }
    }
    appliedToCart = published.appliedLines;
    // After the lines exist, rebuild the make-ups that WON as composites. The
    // choice was made during candidate generation; this only writes it.
    const splitWarnings: string[] = [];
    for (const pl of proposalLines) {
      splitWarnings.push(...await materialiseSelectedSplit(env, pl));
    }
    return { openings: openings.length, selected: selectedCount, appliedToCart, lines, reviewWarnings: [...new Set(splitWarnings)] };
  }
  return { openings: openings.length, selected: selectedCount, appliedToCart, lines, reviewWarnings: [] };
}

/** Turn the make-up that WON into a composite quote line (design §7.3).
 *
 *  This is the surviving rump of `materialiseSplits`, and the difference is the
 *  whole of D7. The old function chose: it re-ran the composite selector after
 *  the proposal was published and replaced a pick already made. This one only
 *  rebuilds — the split already beat every single unit in the same ladder, and
 *  every product, glass and dimension below comes off that candidate.
 *
 *  The failure paths are unchanged. A refused split leaves the opening as its
 *  single-unit parent, which is now an honestly ranked answer rather than an
 *  orphaned one, and says so on the line. */
export async function materialiseSelectedSplit(env: Env, pl: ProposalSelection): Promise<string[]> {
  const split = pl.result.selectedSplit;
  if (!split) return [];
  const quoteLineId = pl.quoteLineId ?? (await env.DB.prepare(
    "SELECT quote_line_id FROM opening_instance WHERE id=?",
  ).bind(pl.openingId).first<{ quote_line_id: string | null }>())?.quote_line_id ?? null;
  if (!quoteLineId) return [];

  const parentRow = await env.DB.prepare("SELECT options_json FROM quote_line WHERE id=?")
    .bind(quoteLineId).first<{ options_json: string | null }>();
  let inheritedOptions: Record<string, string> = {};
  try {
    const parsed = JSON.parse(parentRow?.options_json ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      inheritedOptions = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
    }
  } catch { /* unreadable options are absent */ }

  const specs = splitSegmentSpecs(split, { inheritedOptions });
  if (specs.length !== split.plan.length) return [];

  const warnings: string[] = [];
  const label = pl.externalRef ?? "Opening";
  const res = await splitLine(env, { parentId: quoteLineId, segments: specs, axis: split.axis, origin: "ai" });
  if (!res.ok) {
    // A refused split used to be dropped on the floor. The opening stays a
    // single line — a defensible outcome — but nobody was told the make-up the
    // documents stated had been rejected, so the one person who could correct it
    // never learned there was anything to correct. The commonest cause is a
    // comment naming more units than the composite policy allows.
    // `in` rather than res.errors: this project is deliberately not strict, so a
    // boolean discriminant does not narrow the union.
    const why = ("errors" in res ? res.errors : []).join(" ");
    const warning = `${label}: the ${specs.length}-unit make-up `
      + `${split.proposalBasis === "schedule_comment" ? "from the schedule comment " : ""}`
      + `could not be built as a composite — ${why} Left as a single unit for human review.`;
    warnings.push(warning);
    await flagForReview(env, quoteLineId, warning);
    return warnings;
  }

  const warning = split.proposalBasis === "energy_report"
    ? `${label}: built as ${specs.length} report-defined components; confirm the document reconciliation during human review.`
    : `${label}: ${pl.opening.widthMm ?? "stated"} mm width proposed as ${specs.length} joined units for human review.`;
  warnings.push(warning);
  await flagForReview(env, quoteLineId, warning);
  return warnings;
}

/** A composite the machine proposed is never a finished answer — the line says
 *  so, and carries the reason a reviewer needs. */
async function flagForReview(env: Env, quoteLineId: string, warning: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE quote_line SET status='technical_review',
       review_json=json_patch(COALESCE(review_json,'{}'), ?), updated_at=datetime('now')
     WHERE id=?`,
  ).bind(JSON.stringify({ composite: warning }), quoteLineId).run();
}
