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
import { splitLine, loadCompositePolicy, type SegmentSpec } from "../composite";
import { proposeSplit, type SplitHint } from "./split";
import { resolveScheduleType } from "../../../src/data/scheduleMatch";
import { defaultOptions } from "../../../src/data/configurator";
import { getProductBySlug } from "../../../src/data/catalogue";

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
    const splitWarnings = await materialiseSplits(env, { repo, priceFn, historical, proposalLines,
      splitHints: opts?.splitHints ?? new Map(), scheduleTypes: opts?.scheduleTypes ?? new Map() });
    return { openings: openings.length, selected: selectedCount, appliedToCart, lines, reviewWarnings: splitWarnings };
  }
  return { openings: openings.length, selected: selectedCount, appliedToCart, lines, reviewWarnings: [] };
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
  scheduleTypes: Map<string, string>;
}): Promise<string[]> {
  const reviewWarnings: string[] = [];
  // Read once per run, not per opening: it is one small D1 row and every
  // proposal below is measured against the same cap.
  const policy = await loadCompositePolicy(env);
  for (const pl of ctx.proposalLines) {
    const parent = pl.result.selected;
    const hint = (pl.externalRef && ctx.splitHints.get(pl.externalRef)) || null;
    const oversize = !!parent && (parent.outcome.filters ?? []).some((f) => f.filter === "dimensions" && f.severity === "warning");
    if (!hint && !oversize) continue;
    const quoteLineId = pl.quoteLineId ?? (await env.DB.prepare(
      "SELECT quote_line_id FROM opening_instance WHERE id=?",
    ).bind(pl.openingId).first<{ quote_line_id: string | null }>())?.quote_line_id ?? null;
    if (!quoteLineId) continue;

    // The family's authored pairing, when it has one. Two things are needed and
    // neither is on the parent product: the rule (which family supplies the
    // infill) and the widest frame THAT family makes — a panel cannot be sized
    // without it. The infill family's products come from the same cached
    // candidate query the selection already uses, so this is a cache hit in
    // every realistic project rather than a second round trip per opening.
    const rule = parent?.candidate.defaultSplit ?? null;
    let infillMaxWidthMm: number | null = null;
    if (rule?.infillFamilySlug && rule.infillOperation) {
      const infill = await ctx.repo.queryCandidates(parent!.candidate.family, rule.infillOperation);
      const widths = infill
        .filter((c) => c.series === rule.infillFamilySlug)
        .map((c) => c.dimensionRule?.maxWidthMm)
        .filter((w): w is number => typeof w === "number" && w > 0);
      // The WIDEST frame the family makes: the pairing asks "can one panel cover
      // this", and answering with a narrower product would invent an extra
      // mullion the manufacturer would not build.
      infillMaxWidthMm = widths.length ? Math.max(...widths) : null;
    }

    // The default split uses the product's max width so a >2× opening becomes 3+
    // units, not two still-oversize halves.
    const proposal = proposeSplit(pl.opening, hint, {
      maxWidthMm: parent?.candidate.dimensionRule?.maxWidthMm ?? null,
      // maxSegments is the REAL policy cap, not the proposer's safety bound: a
      // pairing that exceeds it would be built here and then refused by
      // validateSplit below, which reads to the customer as no split at all.
      pairing: {
        rule, infillMaxWidthMm, maxSegments: policy.maxSegments,
        // The schedule's own wording, not the stored operation: "OFFSET AWNING"
        // and "AWNING" resolve to one family and one operation_type, so this is
        // the only place the difference still exists.
        offset: /\boffset\b/i.test(pl.externalRef ? ctx.scheduleTypes.get(pl.externalRef) ?? "" : ""),
      },
    });
    if (proposal.segments.length < 2) continue;

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

    const parentRow = await env.DB.prepare("SELECT options_json FROM quote_line WHERE id=?")
      .bind(quoteLineId).first<{ options_json: string | null }>();
    let inheritedOptions: Record<string, string> = {};
    try {
      const parsed = JSON.parse(parentRow?.options_json ?? "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        inheritedOptions = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")]));
      }
    } catch { /* unreadable options are absent */ }

    const section = pl.opening.family === "doors" ? "door" : "window";
    const specs: SegmentSpec[] = [];
    for (const seg of proposal.segments) {
      // Resolve the tradie term (e.g. "fixed") to a manufacturer operation via the
      // Sanity Family → Schedule Aliases — "fixed" is an alias on Sliding Window,
      // so a fixed lite is a sliding-window frame, not an unknown operation.
      const operationType = hint?.source === "energy_report"
        ? seg.operation
        : resolveScheduleType(section, seg.operation).operationType ?? seg.operation;
      const requirement = seg.requirement ? {
        maxUValue: seg.requirement.maxUValue,
        minShgc: seg.requirement.shgcMin,
        maxShgc: seg.requirement.shgcMax,
      } : pl.opening.requirements;
      const glazingDescription = seg.performanceDescription ?? seg.glazingNote ?? pl.opening.scheduleRequirements?.glassDescription ?? null;
      const sub = {
        ...pl.opening,
        externalRef: seg.ref ?? null,
        operationType,
        widthMm: seg.widthMm,
        heightMm: seg.heightMm,
        requirements: requirement,
        thermalContext: {
          ...(pl.opening.thermalContext ?? {}),
          requirementBasis: seg.requirement ? "explicit_energy_report" as const : pl.opening.thermalContext?.requirementBasis,
        },
        scheduleRequirements: {
          ...(pl.opening.scheduleRequirements ?? {}),
          glassDescription: glazingDescription,
          doubleGlazed: glazingDescription && /\bDG\b|double\s+glaz/i.test(glazingDescription)
            ? true
            : pl.opening.scheduleRequirements?.doubleGlazed ?? null,
        },
      };
      const sel = await selectForOpening(sub, ctx.repo, ctx.priceFn, ctx.historical);
      const chosen = sel.selected;
      if (!chosen && hint?.source === "energy_report") {
        specs.length = 0;
        break;
      }
      const productSlug = chosen?.candidate.slug ?? parent?.candidate.slug ?? "";
      if (!productSlug) { specs.length = 0; break; }
      const variant = chosen?.selectedVariant ?? null;
      const displayProduct = getProductBySlug(productSlug);
      const options = {
        ...(displayProduct ? defaultOptions(displayProduct) : {}),
        ...inheritedOptions,
        glassDescription: glazingDescription ?? "",
        performanceVariantId: variant?.variantId ?? "",
        frameTechnology: variant?.frameTechnology ?? "unknown",
        glazing: variant?.glazingOptionSlug ?? "",
      };
      specs.push({
        widthMm: seg.widthMm,
        heightMm: seg.heightMm,
        // The segment's own best-fit product; only if the alias resolves to nothing
        // does it fall back to the parent's real product (never a fabricated one).
        productSlug,
        options,
        selectedVariantId: variant?.variantId ?? null,
        // THE MACHINE'S OWN RECORD OF THIS UNIT, frozen at the moment it chose.
        // A unit never gets an ai_proposal_line — that table requires an
        // opening_instance and a unit has none — so without this there is no
        // frozen account of what was proposed for it, and the thermal audit
        // could only report a blank beside a unit whose product it can plainly
        // see on the line. configuration_snapshot_json is written once, here,
        // and no human path updates it: updateSegment's SET clause omits it.
        configurationSnapshot: chosen ? {
          productSlug,
          variantId: variant?.variantId ?? null,
          uw: variant?.uValue ?? null,
          shgc: variant?.shgc ?? null,
          source: variant?.dataSource ?? null,
          catalogueRevision: chosen.candidate.catalogueRevision ?? null,
        } : null,
        resolvedBand: requirement ? {
          maxUValue: requirement.maxUValue ?? null,
          minShgc: requirement.minShgc ?? null,
          maxShgc: requirement.maxShgc ?? null,
          shgcTarget: seg.requirement?.shgcTarget ?? null,
        } : null,
        requirementBasis: seg.requirement ? "explicit_energy_report" : proposal.basis,
        thermalReview: !!chosen && (chosen.outcome.filters ?? []).some((filter) => filter.filter === "energy" && filter.severity === "warning"),
      });
    }
    if (specs.length !== proposal.segments.length) continue;

    const res = await splitLine(env, { parentId: quoteLineId, segments: specs, axis: proposal.axis, origin: "ai" });
    if (!res.ok) {
      // A refused split used to be dropped on the floor. The opening stays a
      // single oversize line — which is a defensible outcome — but nobody was
      // told that the make-up the documents stated had been rejected, so the one
      // person who could correct it never learned there was anything to correct.
      // The commonest cause is a comment naming more units than the composite
      // policy allows.
      // `in` rather than res.errors: this project is deliberately not strict, so
      // a boolean discriminant does not narrow the union.
      const why = ("errors" in res ? res.errors : []).join(" ");
      const warning = `${pl.externalRef ?? "Opening"}: the ${proposal.segments.length}-unit make-up `
        + `${proposal.basis === "schedule_comment" ? `from the schedule comment "${hint?.raw ?? ""}" ` : ""}`
        + `could not be built as a composite — ${why} Left as a single unit for human review.`;
      reviewWarnings.push(warning);
      await env.DB.prepare(
        `UPDATE quote_line SET status='technical_review',
           review_json=json_patch(COALESCE(review_json,'{}'), ?), updated_at=datetime('now')
         WHERE id=?`,
      ).bind(JSON.stringify({ composite: warning }), quoteLineId).run();
      continue;
    }

    const maxWidth = parent?.candidate.dimensionRule?.maxWidthMm ?? null;
    const warning = proposal.basis === "energy_report"
      ? `${pl.externalRef ?? "Opening"}: built as ${proposal.segments.length} report-defined components; confirm the document reconciliation during human review.`
      : `${pl.externalRef ?? "Opening"}: ${pl.opening.widthMm ?? "stated"} mm width exceeds the selected product${maxWidth ? `'s ${maxWidth} mm maximum` : " range"}; proposed as ${proposal.segments.length} joined units for human review.`;
    reviewWarnings.push(warning);
    await env.DB.prepare(
      `UPDATE quote_line SET status='technical_review',
         review_json=json_patch(COALESCE(review_json,'{}'), ?), updated_at=datetime('now')
       WHERE id=?`,
    ).bind(
      JSON.stringify({ composite: warning }), quoteLineId,
    ).run();
  }
  return [...new Set(reviewWarnings)];
}
