import type { Env } from "../../types";
import { uuid } from "../util";
import { contextKey, retrievalKey, RETRIEVAL_KEY_VERSION, isRetrievalOperation, isRequirementBasis } from "../estimator/learning";
import type { OpeningInput } from "../estimator/types";

export interface IssuedCartLine {
  id: string;
  external_ref: string | null;
  product_slug: string;
  options_json: string;
  dims_json: string;
  qty: number;
  line_total: number;
  ai_proposal_line_id: string | null;
  selected_variant_id: string | null;
  /** 'composite_parent' when the reviewer rebuilt this opening as joined units. */
  line_kind?: string | null;
}

/** Whether this opening carried a thermal requirement at all — the fourth
 *  field the retrieval key reads, and one the legacy context never recorded. */
const hasThermalRequirement = (opening: OpeningInput): boolean => {
  const r = opening.requirements ?? null;
  return !!r && (r.maxUValue != null || r.minShgc != null || r.maxShgc != null);
};

const object = (value: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const stable = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stable(row[key])}`).join(",")}}`;
};

export function outcomeQualityState(
  decision: "accepted" | "adjusted" | "no_ai_proposal",
  recommendationEligible: boolean,
): "approved" | "pending" | "rejected" {
  if (recommendationEligible) return "approved";
  return decision === "no_ai_proposal" ? "rejected" : "pending";
}

export async function captureRecommendationOutcomes(
  env: Env,
  projectId: string,
  lines: IssuedCartLine[],
): Promise<void> {
  const stmts: D1PreparedStatement[] = [];
  for (const line of lines) {
    const proposal = line.ai_proposal_line_id
      ? await env.DB.prepare(
        `SELECT pl.configuration_json, pl.ranking_context_json, pl.opening_id,
                pl.performance_variant_id, pl.product_slug, pl.price_snapshot_json
           FROM ai_proposal_line pl
          WHERE pl.id = ?`,
      ).bind(line.ai_proposal_line_id).first<any>()
      : null;
    const rankingContext = object(proposal?.ranking_context_json);
    const context = object(
      rankingContext.thermalContext && typeof rankingContext.thermalContext === "object"
        ? JSON.stringify(rankingContext.thermalContext)
        : null,
    );
    const proposedDimensions = rankingContext.dimensions && typeof rankingContext.dimensions === "object"
      ? rankingContext.dimensions as Record<string, unknown>
      : {};
    const finalDimensions = object(line.dims_json);
    const opening: OpeningInput = {
      family: typeof rankingContext.family === "string" ? rankingContext.family : null,
      operationType: typeof rankingContext.operationType === "string" ? rankingContext.operationType : null,
      widthMm: Number(finalDimensions.width) || null,
      heightMm: Number(finalDimensions.height) || null,
      qty: typeof rankingContext.quantity === "number" ? rankingContext.quantity : line.qty,
      requirements: rankingContext.requirements && typeof rankingContext.requirements === "object"
        ? rankingContext.requirements as OpeningInput["requirements"] : {},
      thermalContext: {
        ...context,
        requirementBasis: typeof context.requirementBasis === "string" ? context.requirementBasis : null,
      } as OpeningInput["thermalContext"],
    };
    const proposedPrice = object(proposal?.price_snapshot_json);
    const proposedTotal = typeof proposedPrice.total === "number" ? proposedPrice.total : null;
    const proposedConfiguration = object(proposal?.configuration_json);
    const proposedOptions = proposedConfiguration.options && typeof proposedConfiguration.options === "object"
      ? proposedConfiguration.options : {};
    const finalOptions = object(line.options_json);
    const sameCoreConfiguration = !!proposal &&
      proposal.product_slug === line.product_slug &&
      (proposal.performance_variant_id ?? null) === (line.selected_variant_id ?? null) &&
      Number(proposedDimensions.widthMm) === Number(finalDimensions.width) &&
      Number(proposedDimensions.heightMm) === Number(finalDimensions.height) &&
      Number(rankingContext.quantity ?? line.qty) === line.qty;
    const accepted = sameCoreConfiguration &&
      stable(proposedOptions) === stable(finalOptions) &&
      proposedTotal === line.line_total;
    const decision = !proposal ? "no_ai_proposal" : accepted ? "accepted" : "adjusted";
    // Eligibility used to depend on a reason code logged in the ops Estimator tab.
    // That tab reviewed the proposal BEFORE submission, a stage staff take no part
    // in, and it is gone — so the gate moves to where the human actually is.
    //
    // Issuing a quote IS the review. A line issued exactly as proposed carries the
    // reviewer's endorsement and trains the ranker immediately. A line staff
    // CHANGED before issuing stays `pending`: the final configuration is what they
    // chose, but whether that choice is a ranking lesson ("the AI picked a product
    // that misses the U-value") or noise ("the customer wanted a different colour")
    // is not derivable from the diff. A manager settles it afterwards, on the
    // issued outcome, via PATCH /api/ops/recommendation-outcomes/:id.
    // A COMPOSITE is never an endorsement, however identical the fields look.
    //
    // sameCoreConfiguration compares product, variant, dimensions and quantity —
    // and a split changes NONE of them: the parent keeps the product the AI chose
    // and the opening's size never moves, by design. So a reviewer deciding "no
    // single unit is made this wide, build it as two 1750s" scored as core-
    // configuration-unchanged and went in as an approved lesson reading "the
    // AMJ80 sliding window was the right answer at 3500 mm, it just cost more
    // than predicted" — the exact inverse of what happened.
    //
    // What the decomposition SHOULD teach is not expressible here: this table
    // records one configuration against another, and a composite's answer is N
    // units with their own products and geometry. Until that is modelled, the
    // honest state is `pending` — a human settles it — rather than a confident
    // wrong one.
    const isComposite = line.line_kind === "composite_parent";
    const recommendationEligible = sameCoreConfiguration && !isComposite;
    // A line with no AI proposal contains no recommendation signal to adjudicate.
    // Finalize it immediately as non-learnable so it cannot leave the revision's
    // learning example pending forever, while still retaining the immutable audit
    // outcome explaining why it was excluded.
    const qualityState = outcomeQualityState(decision, recommendationEligible);
    const finalConfiguration = {
      productSlug: line.product_slug,
      performanceVariantId: line.selected_variant_id,
      options: object(line.options_json),
      dimensions: object(line.dims_json),
      quantity: line.qty,
    };
    // RECORD TWELVE, RETRIEVE FOUR (D12, design AD9).
    //
    // The twelve context fields are untouched — recording is not what was broken
    // — and three facts are ADDED beside them. They are additions rather than a
    // convenience: the retrieval key bands on WIDTH, and width existed only
    // inside the legacy key's own bucketing, so without recording it here the
    // key would not be recomputable from `context_json` alone (AC-30) and a
    // later redefinition of the coarsening would be lost history instead of a
    // recompute.
    const recordedContext = {
      ...context,
      family: opening.family,
      operationType: opening.operationType,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm,
      thermalRequired: hasThermalRequirement(opening) ? 1 : 0,
    };
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO recommendation_outcome
         (id, project_id, quote_line_id, ai_proposal_line_id,
          external_ref, context_key, context_json, proposed_product_slug,
          proposed_variant_id, proposed_config_json, proposed_line_total,
          final_product_slug, final_variant_id, final_config_json, final_line_total,
          price_delta, decision, reason_code, recommendation_eligible,
          thermal_eligible, quality_state, retrieval_key, retrieval_key_version, provenance)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,'in_platform')`,
    ).bind(
      uuid(), projectId, line.id, line.ai_proposal_line_id, line.external_ref,
      contextKey(opening), JSON.stringify(recordedContext),
      proposal?.product_slug ?? null, proposal?.performance_variant_id ?? null,
      proposal?.configuration_json ?? null, proposedTotal, line.product_slug,
      line.selected_variant_id, JSON.stringify(finalConfiguration), line.line_total,
      proposedTotal == null ? null : line.line_total - proposedTotal, decision,
      decision === "accepted" ? "HUMAN_ACCEPTED"
        // Naming the composite case matters more than the eligibility flag: it is
        // the one adjustment whose CAUSE is recoverable from the record, and
        // without it every split lands in the same undifferentiated bucket as a
        // colour change.
        : decision === "adjusted" ? (isComposite ? "HUMAN_BUILT_AS_COMPOSITE" : "HUMAN_ADJUSTED_UNSPECIFIED")
        : "NO_AI_PROPOSAL",
      recommendationEligible ? 1 : 0,
      qualityState,
      // Computed from the SAME context that was just recorded, so the row can
      // always be re-bucketed from what it stored.
      retrievalKey(recordedContext), RETRIEVAL_KEY_VERSION,
      // `provenance` is bound literally in the statement above rather than as a
      // parameter: a row written by this function came through the platform's
      // own review flow by definition, and there is no caller who could say
      // otherwise. The backfill ingest is a different function for that reason.
    ));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

/** One pre-platform decision being filed into the learning corpus. */
export interface BackfillLine {
  externalRef?: string | null;
  quoteLineId?: string | null;
  context: Record<string, unknown>;
  finalProductSlug: string;
  finalVariantId?: string | null;
  finalConfig: unknown;
  finalLineTotal: number;
}

export interface BackfillResult {
  written: number;
  refused: { line: number; field: string }[];
  error?: string;
}

/** A catalogue slug shape. Deliberately a SHAPE check and not a lookup against
 *  the current catalogue: D18's whole point is history, and the most valuable
 *  rows are for products that were genuinely manufactured and have since been
 *  discontinued. Refusing those would bias the corpus toward what happens to be
 *  on sale today — the opposite of ground truth.
 *
 *  A typo therefore can reach the corpus, and that is a bounded cost: the layer
 *  is dark, the row is permanently flagged `backfilled`, and a slug nothing else
 *  names can never be the modal choice in its bucket. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,79}$/;

/**
 * File pre-platform decisions into the learning corpus (D18, design §8.4).
 *
 * The seeded rows are REAL: actual plans, with the products that were actually
 * ordered, so `final_product_slug` is ground truth from manufacturing. They are
 * flagged `backfilled` for a narrower reason than fabrication — those decisions
 * were made outside the platform's review flow and may lack the thermal context
 * the retrieval key reads. A reviewer told "3 of 4 similar openings went this
 * way" has to be able to see which of the four were in-platform.
 *
 * Every context value is validated against the SAME enumerations the retrieval
 * key uses, and a value that fails is REFUSED rather than coerced. Coercing
 * would file a staff typo under 'other' and leave nobody to notice; refusing
 * sends it back to be fixed at the source.
 */
export async function captureBackfilledOutcomes(
  env: Env,
  args: { projectId: string; lines: BackfillLine[] },
): Promise<BackfillResult> {
  // THE PROJECT ID IS VERIFIED, NEVER TRUSTED. A body-supplied identifier is a
  // claim; this table hangs off a real foreign key, and every row written below
  // uses the id that resolved here rather than the one that arrived.
  const project = await env.DB.prepare("SELECT id FROM project WHERE id = ?")
    .bind(args.projectId).first<{ id: string }>();
  if (!project) return { written: 0, refused: [], error: "project_not_found" };

  const refused: BackfillResult["refused"] = [];
  const stmts: D1PreparedStatement[] = [];

  args.lines.forEach((line, index) => {
    const context = line.context ?? {};
    const problems: string[] = [];
    if (!isRetrievalOperation(context.operationType)) {
      problems.push("context.operationType");
    }
    if (!isRequirementBasis(context.requirementBasis)) {
      problems.push("context.requirementBasis");
    }
    if (typeof line.finalProductSlug !== "string" || !SLUG.test(line.finalProductSlug)) {
      problems.push("finalProductSlug");
    }
    if (typeof line.finalLineTotal !== "number" || !Number.isFinite(line.finalLineTotal)) {
      problems.push("finalLineTotal");
    }
    if (problems.length) {
      // The field name only. A refusal that echoed the offending value would put
      // the customer document text it just refused into a response and a log.
      for (const field of problems) refused.push({ line: index, field });
      return;
    }

    const width = Number(context.widthMm);
    const height = Number(context.heightMm);
    const recordedContext = {
      ...context,
      widthMm: Number.isFinite(width) ? width : null,
      heightMm: Number.isFinite(height) ? height : null,
      thermalRequired: context.thermalRequired === 1 || context.thermalRequired === true ? 1 : 0,
    };
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO recommendation_outcome
         (id, project_id, quote_line_id, ai_proposal_line_id,
          external_ref, context_key, context_json, proposed_product_slug,
          proposed_variant_id, proposed_config_json, proposed_line_total,
          final_product_slug, final_variant_id, final_config_json, final_line_total,
          price_delta, decision, reason_code, recommendation_eligible,
          thermal_eligible, quality_state, retrieval_key, retrieval_key_version, provenance)
       VALUES (?,?,?,NULL,?,?,?,NULL,NULL,NULL,NULL,?,?,?,?,NULL,'adjusted','BACKFILLED_HISTORY',1,0,'approved',?,?,'backfilled')`,
    ).bind(
      uuid(), project.id, line.quoteLineId ?? null, line.externalRef ?? null,
      contextKey(backfillOpening(recordedContext)), JSON.stringify(recordedContext),
      line.finalProductSlug, line.finalVariantId ?? null,
      JSON.stringify(line.finalConfig ?? {}), line.finalLineTotal,
      retrievalKey(recordedContext), RETRIEVAL_KEY_VERSION,
    ));
  });

  if (stmts.length) await env.DB.batch(stmts);
  return { written: stmts.length, refused };
}

/** The legacy twelve-field key is NOT NULL on this table, so a backfilled row
 *  still gets one — computed from whatever context the owner had. It is not
 *  what anything retrieves by; it is what keeps the row shaped like every
 *  other row, so a later recompute has one fewer special case. */
const backfillOpening = (context: Record<string, unknown>): OpeningInput => ({
  family: typeof context.family === "string" ? context.family : null,
  operationType: typeof context.operationType === "string" ? context.operationType : null,
  widthMm: typeof context.widthMm === "number" ? context.widthMm : null,
  heightMm: typeof context.heightMm === "number" ? context.heightMm : null,
  thermalContext: context as OpeningInput["thermalContext"],
});
