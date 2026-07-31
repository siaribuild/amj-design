// Project estimate orchestration (spec §18): run the deterministic engine over
// every opening_instance in a project and persist the selection. Ties the
// CatalogueRepository, hard rules, pricing, ranker and persistence together.
import type { Env } from "../../types";
import { createCatalogueRepository, sanityExecutor } from "./catalogue";
import { selectForOpening } from "./select";
import { persistSelection } from "./persist";
import { buildHistoricalModel, buildApprovedThermalModel } from "./learning";
import { createCachedPriceResolver } from "./pricing";
import { uuid } from "../util";
import type { CatalogueCandidate, OpeningInput } from "./types";
import type { PerformanceVariant } from "./types";
import { publishAiProposal, type ProposalSelection } from "../ai/proposal";
import { splitLine, type SegmentSpec } from "../composite";
import { proposeSplit, type SplitHint } from "./split";

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
  // The learned preference model (Phase 6): built once from the reviewer-correction
  // corpus and reused across every opening in this run. Empty corpus ⇒ neutral.
  const [historical, thermalModel] = await Promise.all([
    buildHistoricalModel(env),
    buildApprovedThermalModel(env),
  ]);
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
        optionSlugs: [...new Set([...(opening.optionSlugs ?? []), ...(variant?.pricingOptionSlugs ?? [])])],
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
  for (const row of openings) {
    const opening = thermalModel.apply(toOpeningInput(row));
    const result = await selectForOpening(opening, repo, priceFn, historical);
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
    // WS5: after the lines exist, materialise a review-flagged composite for any
    // opening that the schedule comment says to split, or that is oversize.
    await materialiseSplits(env, { repo, priceFn, historical, proposalLines, splitHints: opts?.splitHints ?? new Map() });
  }
  return { openings: openings.length, selected: selectedCount, appliedToCart, lines };
}

/** For each opening with a split intent (comment or oversize), select a product
 *  per segment and turn its quote_line into a composite via splitLine (origin
 *  'ai', always review-flagged). Fixed lites have no dedicated product in the
 *  catalogue, so a segment whose operation has none falls back to the parent's
 *  real product (same frame series) — never an invented one. */
async function materialiseSplits(env: Env, ctx: {
  repo: Parameters<typeof selectForOpening>[1];
  priceFn: Parameters<typeof selectForOpening>[2];
  historical: Parameters<typeof selectForOpening>[3];
  proposalLines: ProposalSelection[];
  splitHints: Map<string, SplitHint>;
}): Promise<void> {
  for (const pl of ctx.proposalLines) {
    const parent = pl.result.selected;
    if (!pl.quoteLineId || !parent) continue;
    const hint = (pl.externalRef && ctx.splitHints.get(pl.externalRef)) || null;
    const oversize = (parent.outcome.filters ?? []).some((f) => f.filter === "dimensions" && f.severity === "warning");
    if (!hint && !oversize) continue;

    const proposal = proposeSplit(pl.opening, hint);
    if (proposal.segments.length < 2) continue;

    const specs: SegmentSpec[] = [];
    for (const seg of proposal.segments) {
      const sub = { ...pl.opening, externalRef: null, operationType: seg.operation, widthMm: seg.widthMm, heightMm: seg.heightMm };
      const sel = await selectForOpening(sub, ctx.repo, ctx.priceFn, ctx.historical);
      specs.push({
        widthMm: seg.widthMm,
        heightMm: seg.heightMm,
        // Segment's own best-fit product, else the parent's real product (fixed
        // lite has no product — do NOT fabricate one).
        productSlug: sel.selected?.candidate.slug ?? parent.candidate.slug,
      });
    }

    const res = await splitLine(env, { parentId: pl.quoteLineId, segments: specs, axis: proposal.axis, origin: "ai" });
    if (!res.ok) continue;

    // Per-segment band snapshot (migration 0036): the SAME resolved band across
    // segments (same glass by default), always review-flagged.
    const req = pl.opening.requirements ?? {};
    await env.DB.prepare(
      `UPDATE quote_line SET segment_requirements_json=?, segment_requirement_basis=?, segment_thermal_review=1
        WHERE parent_line_id=?`,
    ).bind(
      JSON.stringify({ maxUValue: req.maxUValue ?? null, minShgc: req.minShgc ?? null, maxShgc: req.maxShgc ?? null }),
      proposal.basis,
      pl.quoteLineId,
    ).run().catch(() => { /* band snapshot is advisory; never fail the run on it */ });
  }
}
