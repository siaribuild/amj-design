import type { Env } from "../../types";
import { uuid } from "../util";
import { contextKey } from "../estimator/learning";
import type { OpeningInput } from "../estimator/types";
import { isOverrideReason, OVERRIDE_REASONS } from "./schema";

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
}

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

export async function captureRecommendationOutcomes(
  env: Env,
  projectId: string,
  revisionId: string,
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
    const feedback = proposal?.opening_id
      ? await env.DB.prepare(
        `SELECT reason_code FROM review_feedback
          WHERE project_id=? AND opening_id=?
          ORDER BY created_at DESC LIMIT 1`,
      ).bind(projectId, proposal.opening_id).first<{ reason_code: string }>()
      : null;
    const governedReason = feedback && isOverrideReason(feedback.reason_code)
      ? feedback.reason_code : null;
    const governedRanker = governedReason ? OVERRIDE_REASONS[governedReason].ranker : false;
    const recommendationEligible = sameCoreConfiguration || (!!proposal && decision === "adjusted" && governedRanker);
    const qualityState = recommendationEligible ? "approved" : "pending";
    const finalConfiguration = {
      productSlug: line.product_slug,
      performanceVariantId: line.selected_variant_id,
      options: object(line.options_json),
      dimensions: object(line.dims_json),
      quantity: line.qty,
    };
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO recommendation_outcome
         (id, project_id, quote_revision_id, quote_line_id, ai_proposal_line_id,
          external_ref, context_key, context_json, proposed_product_slug,
          proposed_variant_id, proposed_config_json, proposed_line_total,
          final_product_slug, final_variant_id, final_config_json, final_line_total,
          price_delta, decision, reason_code, recommendation_eligible,
          thermal_eligible, quality_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
    ).bind(
      uuid(), projectId, revisionId, line.id, line.ai_proposal_line_id, line.external_ref,
      contextKey(opening), JSON.stringify({ ...context, family: opening.family, operationType: opening.operationType }),
      proposal?.product_slug ?? null, proposal?.performance_variant_id ?? null,
      proposal?.configuration_json ?? null, proposedTotal, line.product_slug,
      line.selected_variant_id, JSON.stringify(finalConfiguration), line.line_total,
      proposedTotal == null ? null : line.line_total - proposedTotal, decision,
      decision === "accepted" ? "HUMAN_ACCEPTED"
        : governedReason ?? (decision === "adjusted" ? "HUMAN_ADJUSTED_UNSPECIFIED" : "NO_AI_PROPOSAL"),
      recommendationEligible ? 1 : 0,
      qualityState,
    ));
  }
  if (stmts.length) await env.DB.batch(stmts);
}
