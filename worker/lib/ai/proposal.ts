import type { Env } from "../../types";
import { uuid } from "../util";
import { PIPELINE_VERSION } from "./versions";
import { parentRepresentative, type SelectionResult } from "../estimator/select";
import type { Tier } from "../../../src/data/recommendation";
import type { OpeningInput } from "../estimator/types";
import { defaultOptions } from "../../../src/data/configurator";
import { getProductBySlug } from "../../../src/data/catalogue";
import { dimsJson } from "../lines";

export interface ProposalSelection {
  openingId: string;
  quoteLineId: string | null;
  externalRef: string | null;
  opening: OpeningInput;
  result: SelectionResult;
}

export interface PublishProposalInput {
  projectId: string;
  aiRunId: string;
  buildingModelId: string;
  sourceGeneration: number;
  sourceManifestHash: string;
  processingToken?: string;
  lines: ProposalSelection[];
}

export interface PublishProposalResult {
  proposalId: string;
  published: boolean;
  appliedLines: number;
}

/** What the machine could and could not settle about one proposal line
 *  (AC-26, spec §4.11).
 *
 *  `dominant` — "the top two scores differed by at least 0.05" — is deleted with
 *  the ranker that produced it. It was a fact about the SCORER, and it answered
 *  the wrong question: two candidates being close said nothing about whether
 *  either of them actually met the customer's brief. The tier the pick came from
 *  does say that, so it is what these read now.
 *
 *  Lifted out of publishAiProposal so the mapping is one testable table rather
 *  than three expressions buried in a batch builder. */
export function proposalVerdict(input: {
  /** The tier the winning candidate competed from; null when nothing was picked. */
  tier: Tier | null;
  status: SelectionResult["status"];
  /** Whether the winning candidate actually serves the opening as a single unit. */
  fits: boolean;
  /** True when the opening carries no thermal requirement at all. */
  requirementAbsent: boolean;
  hasScheduleCommercialOption: boolean;
  documentReviewReasons: string[];
  /** The answer was a SPLIT. A proposed split is a starting point the drawings
   *  or the dimensions forced, never a final answer — `SplitProposal.reviewRequired`
   *  is typed as the literal `true` — so a human confirms the make-up before it
   *  is quoted, however well it scored. */
  isSplit?: boolean;
}): { confidence: "high" | "medium" | "low"; reviewRequired: boolean; thermalBandNotMet: boolean } {
  const requirementMet = input.tier === "meets";
  const badTier = input.tier === "misses" || input.tier === "thermal_unknown" || input.tier === "does_not_fit";

  const confidence = requirementMet && input.status === "ready" ? "high"
    : badTier || input.status === "unavailable" ? "low"
      : "medium";

  // A human confirms whenever the machine did not fully answer the brief.
  const reviewRequired = !(requirementMet && input.status === "ready")
    || !!input.isSplit
    || !input.fits
    || input.hasScheduleCommercialOption
    || input.documentReviewReasons.length > 0;

  // The thermal miss, read from the verdict rather than from a filter that no
  // longer exists — the same fact the ladder selected on. An opening with no
  // band cannot miss one.
  const thermalBandNotMet = !requirementMet && !input.requirementAbsent && input.tier != null;

  return { confidence, reviewRequired, thermalBandNotMet };
}

/** The single-unit candidate a proposal line is written from (design AD7).
 *
 *  `publishAiProposal` needs ONE product per line, and a make-up has none. When
 *  a split wins, the line is seeded from the best single-unit candidate — the
 *  honest runner-up — and `splitLine` converts it into segments immediately
 *  after. That is byte-for-byte the write path that already existed, so every
 *  lifecycle guard it carries (draft-only writes, `origin='ai'` scoping, the
 *  edited-line locks) is inherited rather than re-proven against a new one.
 *
 *  The candidate rows still tell the truth regardless: `selected: true` sits on
 *  the split's row, and the seed's row says it was not chosen. */
export function proposalSeed(result: SelectionResult): SelectionResult["selected"] {
  if (result.selected?.price?.ok) return result.selected;
  if (!result.selectedSplit) return null;
  const representative = parentRepresentative(result);
  // A parent line has to carry a price before splitLine can reprice it into
  // segments, so an unpriceable representative is no seed at all.
  return representative?.price?.ok ? representative : null;
}

const parseArray = (value: string | null | undefined): string[] => {
  try {
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

export async function publishAiProposal(env: Env, input: PublishProposalInput): Promise<PublishProposalResult> {
  const proposalId = uuid();
  const current = await env.DB.prepare("SELECT ai_generation, status_customer FROM project WHERE id = ?")
    .bind(input.projectId).first<{ ai_generation: number; status_customer: string }>();
  if (!current || current.status_customer !== "draft" || current.ai_generation !== input.sourceGeneration) {
    return { proposalId, published: false, appliedLines: 0 };
  }

  const selected = input.lines.filter((line) => !!proposalSeed(line.result));
  const catalogueVersion = selected[0]?.result.catalogueVersion ?? null;
  const rankerVersion = selected[0]?.result.selectionVersion ?? null;
  const pricingVersion = selected.length ? proposalSeed(selected[0].result)?.price?.pricingPolicyVersion ?? null : null;

  const quoteIds = input.lines.map((line) => line.quoteLineId).filter((id): id is string => !!id);
  const quoteState = new Map<string, {
    id: string; origin: string | null; edited_fields: string | null; line_total: number | null;
    review_json: string | null; edit_version: number;
  }>();
  for (const id of quoteIds) {
    const row = await env.DB.prepare(
      `SELECT id, origin, edited_fields, line_total, review_json, edit_version
         FROM quote_line WHERE id = ?`,
    ).bind(id).first<{
      id: string; origin: string | null; edited_fields: string | null; line_total: number | null;
      review_json: string | null; edit_version: number;
    }>();
    if (row) quoteState.set(id, row);
  }

  // The conditional parent insert is the generation/draft compare-and-swap for
  // the entire publication batch. Every child references this row. If the
  // project changes generation or leaves draft before the batch executes, the
  // parent is absent, the FK-protected batch rolls back, and no stale cart write
  // can escape.
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO ai_proposal
         (id, project_id, ai_run_id, building_model_id, source_generation, source_manifest_hash,
          pipeline_version, catalogue_version, ranker_version, pricing_version, status)
       SELECT ?,?,?,?,?,?,?,?,?,?,'building'
         FROM project
        WHERE id=? AND ai_generation=? AND status_customer='draft'
          AND (
            ? IS NULL OR EXISTS (
              SELECT 1 FROM ai_job_claim
               WHERE project_id=project.id AND source_generation=project.ai_generation
                 AND status='processing' AND processing_token=?
            )
          )`,
    ).bind(
      proposalId, input.projectId, input.aiRunId, input.buildingModelId,
      input.sourceGeneration, input.sourceManifestHash, PIPELINE_VERSION,
      catalogueVersion, rankerVersion, pricingVersion,
      input.projectId, input.sourceGeneration,
      input.processingToken ?? null, input.processingToken ?? null,
    ),
  ];
  const positionRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(position), -1) + 1 AS n FROM quote_line WHERE project_id = ? AND parent_line_id IS NULL",
  ).bind(input.projectId).first<{ n: number }>();
  let nextPosition = positionRow?.n ?? 0;
  for (const line of input.lines) {
    const chosen = proposalSeed(line.result);
    const proposalLineId = uuid();
    const effectiveQuoteLineId = line.quoteLineId ?? uuid();
    let quote = line.quoteLineId ? quoteState.get(line.quoteLineId) : null;
    const isNewQuoteLine = !quote;
    const basis = recommendationBasis(line.opening);
    // SCAFFOLD WS7 (thermal rework): reserve this empty-line branch for GENUINE
    // no-product only (unknown operation / no dimensions). Once thermal is
    // non-blocking a thermal shortfall NEVER reaches here — it flows through the
    // real-line branch with a reviewRequired warning. Plan §4/WS7.
    if (!chosen) {
      if (!quote) {
        stmts.push(env.DB.prepare(
          `INSERT INTO quote_line
             (id, project_id, external_ref, product_slug, options_json,
              dims_json, qty, line_total, status, position, origin, review_json)
           SELECT ?,?,?,'','{}',?,?,NULL,'incomplete',?,'ai',?
             WHERE EXISTS (SELECT 1 FROM ai_proposal WHERE id=? AND status='building')`,
        ).bind(
          effectiveQuoteLineId, input.projectId, line.externalRef,
          JSON.stringify(dimsJson(line.opening.widthMm, line.opening.heightMm)),
          Math.max(1, Math.floor(line.opening.qty ?? 1)), nextPosition++,
          JSON.stringify({
            product: "We found this opening but could not select and exactly price a suitable configuration.",
          }),
          proposalId,
        ));
        stmts.push(env.DB.prepare(
          `UPDATE opening_instance SET quote_line_id=?
            WHERE id=? AND source_generation=?
              AND EXISTS (SELECT 1 FROM ai_proposal WHERE id=? AND status='building')`,
        ).bind(effectiveQuoteLineId, line.openingId, input.sourceGeneration, proposalId));
        quote = {
          id: effectiveQuoteLineId, origin: "ai", edited_fields: null, line_total: null,
          review_json: null, edit_version: 0,
        };
      }
      const configuration = {
        productId: null, productSlug: null, performanceVariantId: null,
        dimensions: { widthMm: line.opening.widthMm, heightMm: line.opening.heightMm },
        quantity: Math.max(1, Math.floor(line.opening.qty ?? 1)),
      };
      const rankingContext = {
        family: line.opening.family, operationType: line.opening.operationType,
        requirements: line.opening.requirements ?? {},
        advisoryRequirements: line.opening.advisoryRequirements ?? {},
        thermalContext: line.opening.thermalContext ?? {},
        dimensions: configuration.dimensions, quantity: configuration.quantity,
      };
      const unresolvedLocks = parseArray(quote.edited_fields);
      const canApplyUnresolved =
        (quote.origin === "ai" || quote.origin === "schedule") &&
        !["product_slug", "options_json", "dims_json", "qty"]
          .some((field) => unresolvedLocks.includes(field));
      stmts.push(env.DB.prepare(
        `INSERT INTO ai_proposal_line
           (id, proposal_id, project_id, opening_id, quote_line_id, external_ref, quantity,
            dimensions_json, product_id, product_slug, catalogue_revision, performance_variant_id,
            configuration_json, ranking_context_json, performance_json, price_snapshot_json,
            previous_line_total, recommendation_basis, confidence_band, assumptions_json,
            missing_inputs_json, alternatives_json, review_required, applied_to_cart)
         VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,NULL,NULL,?,?,'low','[]',?, ?,1,0)`,
      ).bind(
        proposalLineId, proposalId, input.projectId, line.openingId, effectiveQuoteLineId,
        line.externalRef, configuration.quantity, JSON.stringify(configuration.dimensions),
        JSON.stringify(configuration), JSON.stringify(rankingContext), quote.line_total,
        basis, JSON.stringify(["priceable_configuration"]),
        JSON.stringify([]),
      ));
      if (canApplyUnresolved) {
        stmts.push(env.DB.prepare(
          `UPDATE quote_line SET line_total=NULL, status='incomplete',
             review_json=json_patch(COALESCE(review_json,'{}'), ?),
             ai_proposal_line_id=?, selected_variant_id=NULL,
             configuration_snapshot_json=?, pricing_snapshot_json=NULL,
             recommendation_basis=?, recommendation_confidence='low',
             edit_version=edit_version+1
           WHERE id=? AND origin IN ('ai','schedule')
             AND edit_version=?
             AND EXISTS (
               SELECT 1 FROM project p JOIN ai_proposal ap ON ap.project_id=p.id
                WHERE ap.id=? AND ap.status='building' AND p.id=quote_line.project_id
                  AND p.ai_generation=? AND p.status_customer='draft'
             )`,
        ).bind(
          JSON.stringify({
            product: "We found this opening but could not select and exactly price a suitable configuration.",
          }),
          proposalLineId, JSON.stringify(configuration), basis, quote.id, quote.edit_version,
          proposalId, input.sourceGeneration,
        ));
        stmts.push(env.DB.prepare(
          `UPDATE ai_proposal_line SET applied_to_cart=1
            WHERE id=? AND EXISTS (
              SELECT 1 FROM quote_line q WHERE q.id=? AND q.ai_proposal_line_id=ai_proposal_line.id
            )`,
        ).bind(proposalLineId, quote.id));
      }
      continue;
    }
    if (!quote) {
      const draftOptions = {
        glassDescription: line.opening.scheduleRequirements?.glassDescription ?? null,
        glazing: line.opening.scheduleRequirements?.doubleGlazed === true
          ? "double"
          : line.opening.scheduleRequirements?.doubleGlazed === false ? "single" : null,
        colour: line.opening.scheduleRequirements?.colour ?? null,
        flyscreen: line.opening.scheduleRequirements?.flyscreen === true
          ? "yes"
          : line.opening.scheduleRequirements?.flyscreen === false ? "no" : null,
      };
      stmts.push(env.DB.prepare(
        `INSERT INTO quote_line
           (id, project_id, external_ref, product_slug, options_json,
            dims_json, qty, line_total, status, position, origin)
         SELECT ?,?,?,?,?,?,?,?, 'technical_review',?, 'ai'
           WHERE EXISTS (SELECT 1 FROM ai_proposal WHERE id=? AND status='building')`,
      ).bind(
        effectiveQuoteLineId, input.projectId, line.externalRef, chosen.candidate.slug,
        JSON.stringify(draftOptions),
        JSON.stringify(dimsJson(line.opening.widthMm, line.opening.heightMm)),
        Math.max(1, Math.floor(line.opening.qty ?? 1)), chosen.price!.total, nextPosition++,
        proposalId,
      ));
      stmts.push(env.DB.prepare(
        `UPDATE opening_instance SET quote_line_id = ?
          WHERE id = ? AND source_generation = ?
            AND EXISTS (SELECT 1 FROM ai_proposal WHERE id=? AND status='building')`,
      ).bind(effectiveQuoteLineId, line.openingId, input.sourceGeneration, proposalId));
      quote = {
        id: effectiveQuoteLineId, origin: "ai", edited_fields: null, line_total: null,
        review_json: null, edit_version: 0,
      };
    }
    const locks = parseArray(quote?.edited_fields);
    const priceFields = ["product_slug", "options_json", "dims_json", "qty"];
    const canApply = !!quote &&
      (quote.origin === "ai" || quote.origin === "schedule") &&
      !priceFields.some((field) => locks.includes(field));
    const hasScheduleCommercialOption =
      !!line.opening.scheduleRequirements?.colour ||
      line.opening.scheduleRequirements?.flyscreen != null;
    const documentReviewReasons = [...new Set(
      (line.opening.thermalContext?.technicalReviewReasons ?? [])
        .filter((reason): reason is string => typeof reason === "string" && !!reason)
        .slice(0, 20),
    )];
    const verdict = proposalVerdict({
      tier: line.result.selection.competingTier,
      status: chosen.outcome.status,
      // The WINNER's fit, in whichever form it won — the seed is a write-path
      // detail and its own fit says nothing about the answer.
      fits: (line.result.selectedSplit ?? chosen).candidateOutcome.fit.fits,
      isSplit: !!line.result.selectedSplit,
      requirementAbsent: line.result.selection.requirement.absent,
      hasScheduleCommercialOption,
      documentReviewReasons,
    });
    const confidence = verdict.confidence;
    const variant = chosen.selectedVariant;
    const displayProduct = getProductBySlug(chosen.candidate.slug);
    const cartOptions = {
      ...(displayProduct ? defaultOptions(displayProduct) : {}),
      glassDescription: line.opening.scheduleRequirements?.glassDescription ?? null,
      colour: line.opening.scheduleRequirements?.colour ?? null,
      flyscreen: line.opening.scheduleRequirements?.flyscreen === true
        ? "yes"
        : line.opening.scheduleRequirements?.flyscreen === false ? "no" : null,
      performanceVariantId: variant?.variantId ?? null,
      frameTechnology: variant?.frameTechnology ?? "unknown",
      glazing: variant?.glazingOptionSlug ?? null,
    };
    const configuration = {
      productId: chosen.candidate.sanityProductId,
      productSlug: chosen.candidate.slug,
      performanceVariantId: variant?.variantId ?? null,
      frameType: variant?.frameType ?? null,
      frameTechnology: variant?.frameTechnology ?? "unknown",
      glazing: variant?.glazingOptionSlug ?? null,
      options: cartOptions,
      pricingOptionSlugs: [...new Set([
        ...(line.opening.optionSlugs ?? []),
        // Glass identity is a per-m² chargeable option — price it explicitly.
        ...(variant?.glazingOptionSlug ? [variant.glazingOptionSlug] : []),
        ...(variant?.pricingOptionSlugs ?? []),
      ])],
      dimensions: { widthMm: line.opening.widthMm, heightMm: line.opening.heightMm },
      quantity: Math.max(1, Math.floor(line.opening.qty ?? 1)),
    };
    const performance = variant ? {
      uw: variant.uValue,
      shgc: variant.shgc,
      source: variant.dataSource,
      certified: variant.certified,
      certificationRef: variant.certificationRef,
    } : null;
    const rankingContext = {
      family: line.opening.family,
      operationType: line.opening.operationType,
      requirements: line.opening.requirements ?? {},
      advisoryRequirements: line.opening.advisoryRequirements ?? {},
      thermalContext: line.opening.thermalContext ?? {},
      dimensions: configuration.dimensions,
      quantity: configuration.quantity,
    };
    const thermalBandNotMet = verdict.thermalBandNotMet;
    const missingInputs = [
      line.opening.thermalContext?.orientation ? null : "orientation",
      line.opening.thermalContext?.roomAreaM2 != null ? null : "room_area",
      variant ? null : "performance_variant",
      thermalBandNotMet ? "thermal_band_not_met" : null,
    ].filter(Boolean);
    const documentReviewCopy = documentReviewReasons.filter((reason) => reason.includes(":"));
    if (!documentReviewCopy.length) {
      const labels: Record<string, string> = {
        energy_requirement_ambiguous: "The energy report contains conflicting requirements for this opening; human review is required.",
        energy_dimension_conflict: "The energy report and plan/schedule dimensions differ; the report value was used and human review is required.",
        energy_configuration_conflict: "The energy report and plan/schedule configuration differ; the report value was used and human review is required.",
        energy_requirement_context_mismatch: "The energy-report room or orientation does not agree with the plan; human review is required.",
        energy_requirement_unmatched: "An energy-report requirement could not be matched to the plan/schedule; human review is required.",
      };
      documentReviewCopy.push(...documentReviewReasons.flatMap((reason) => labels[reason] ? [labels[reason]] : []));
    }
    const reviewRequired = verdict.reviewRequired;
    stmts.push(env.DB.prepare(
      `INSERT INTO ai_proposal_line
         (id, proposal_id, project_id, opening_id, quote_line_id, external_ref, quantity,
          dimensions_json, product_id, product_slug, catalogue_revision, performance_variant_id,
          configuration_json, ranking_context_json, performance_json, price_snapshot_json, previous_line_total,
          recommendation_basis, confidence_band, assumptions_json, missing_inputs_json,
          alternatives_json, review_required, applied_to_cart)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      proposalLineId, proposalId, input.projectId, line.openingId, effectiveQuoteLineId,
      line.externalRef, configuration.quantity, JSON.stringify(configuration.dimensions),
      chosen.candidate.sanityProductId, chosen.candidate.slug, chosen.candidate.catalogueRevision,
      variant?.variantId ?? null, JSON.stringify(configuration),
      JSON.stringify(rankingContext), performance ? JSON.stringify(performance) : null, JSON.stringify(chosen.price),
      quote?.line_total ?? null, basis, confidence, JSON.stringify([]),
      JSON.stringify(missingInputs), JSON.stringify([]),
      reviewRequired ? 1 : 0, 0,
    ));

    if (canApply) {
      const review = JSON.stringify({
        thermalRecommendation: thermalBandNotMet
          ? "We selected the closest available glazing to the energy requirement and will confirm the final glass and performance during technical review."
          : reviewRequired
            ? "We will confirm this AI-recommended configuration and any schedule-specific options during technical review."
            : null,
        energyMapping: documentReviewCopy.length
          ? documentReviewCopy.join(" ")
          : null,
      });
      stmts.push(env.DB.prepare(
        `UPDATE quote_line SET
           product_slug = ?, options_json = json_patch(COALESCE(options_json, '{}'), ?),
           line_total = ?, status = ?, review_json = json_patch(COALESCE(review_json, '{}'), ?),
           ai_proposal_line_id = ?, selected_variant_id = ?,
           configuration_snapshot_json = ?, pricing_snapshot_json = ?,
           recommendation_basis = ?, recommendation_confidence = ?,
           edit_version=edit_version+1
         WHERE id = ?
           AND origin IN ('ai','schedule')
           AND edit_version=?
           AND EXISTS (
             SELECT 1 FROM project p JOIN ai_proposal ap ON ap.project_id=p.id
              WHERE ap.id=? AND ap.status='building' AND p.id=quote_line.project_id
                AND p.ai_generation=? AND p.status_customer='draft'
           )`,
      ).bind(
        chosen.candidate.slug, JSON.stringify(cartOptions), chosen.price!.total,
        reviewRequired ? "technical_review" : "ready",
        review, proposalLineId, variant?.variantId ?? null,
        JSON.stringify(configuration), JSON.stringify(chosen.price), basis, confidence,
        quote.id, isNewQuoteLine ? 0 : quote.edit_version,
        proposalId, input.sourceGeneration,
      ));
      stmts.push(env.DB.prepare(
        `UPDATE ai_proposal_line SET applied_to_cart=1
          WHERE id=? AND EXISTS (
            SELECT 1 FROM quote_line q
             WHERE q.id=? AND q.ai_proposal_line_id=ai_proposal_line.id
          )`,
      ).bind(proposalLineId, quote.id));
    }
  }

  // Reconcile the mutable cart to the current source generation. Untouched AI
  // rows that disappeared from the document set are removed; human-edited rows
  // survive but are made explicit technical-review items. Manual rows are never
  // included in this reconciliation.
  stmts.push(env.DB.prepare(
    `UPDATE quote_line
        SET status='technical_review',
            review_json=json_patch(COALESCE(review_json,'{}'), ?),
            updated_at=datetime('now')
      WHERE project_id=?
        AND (origin='ai' OR ai_proposal_line_id IS NOT NULL)
        AND edited_fields IS NOT NULL AND json_array_length(edited_fields) > 0
        AND NOT EXISTS (
          SELECT 1 FROM ai_proposal_line pl
           WHERE pl.proposal_id=? AND pl.quote_line_id=quote_line.id
        )
        AND EXISTS (SELECT 1 FROM project WHERE id=? AND ai_generation=? AND status_customer='draft')
        AND EXISTS (SELECT 1 FROM ai_proposal guard WHERE guard.id=? AND guard.status='building')`,
  ).bind(
    JSON.stringify({ noLongerInDocuments: "The source documents no longer contain this human-edited item; we will review it." }),
    input.projectId, proposalId, input.projectId, input.sourceGeneration, proposalId,
  ));
  stmts.push(env.DB.prepare(
    `DELETE FROM quote_line
      WHERE project_id=?
        AND (origin='ai' OR ai_proposal_line_id IS NOT NULL)
        AND (edited_fields IS NULL OR json_array_length(edited_fields)=0)
        AND NOT EXISTS (
          SELECT 1 FROM ai_proposal_line pl
           WHERE pl.proposal_id=? AND pl.quote_line_id=quote_line.id
        )
        AND EXISTS (SELECT 1 FROM project WHERE id=? AND ai_generation=? AND status_customer='draft')
        AND EXISTS (SELECT 1 FROM ai_proposal guard WHERE guard.id=? AND guard.status='building')`,
  ).bind(input.projectId, proposalId, input.projectId, input.sourceGeneration, proposalId));

  stmts.push(env.DB.prepare(
    `UPDATE ai_proposal SET status = 'superseded'
      WHERE project_id = ? AND status = 'published' AND id <> ?
        AND EXISTS (SELECT 1 FROM project WHERE id=? AND ai_generation=? AND status_customer='draft')
        AND EXISTS (SELECT 1 FROM ai_proposal guard WHERE guard.id=? AND guard.status='building')`,
  ).bind(input.projectId, proposalId, input.projectId, input.sourceGeneration, proposalId));
  stmts.push(env.DB.prepare(
    `UPDATE ai_proposal SET status = 'published', published_at = datetime('now')
      WHERE id = ? AND status='building'
        AND EXISTS (SELECT 1 FROM project WHERE id=? AND ai_generation=? AND status_customer='draft')`,
  ).bind(proposalId, input.projectId, input.sourceGeneration));
  try {
    await env.DB.batch(stmts);
  } catch {
    await env.DB.prepare("UPDATE ai_proposal SET status='superseded' WHERE id=? AND status='building'")
      .bind(proposalId).run().catch(() => {});
    return { proposalId, published: false, appliedLines: 0 };
  }

  const state = await env.DB.prepare("SELECT status FROM ai_proposal WHERE id = ?")
    .bind(proposalId).first<{ status: string }>();
  if (state?.status !== "published") {
    await env.DB.prepare("UPDATE ai_proposal SET status = 'superseded' WHERE id = ?").bind(proposalId).run();
    return { proposalId, published: false, appliedLines: 0 };
  }
  const applied = await env.DB.prepare(
    `SELECT count(*) AS n FROM ai_proposal_line
      WHERE proposal_id=? AND applied_to_cart=1 AND price_snapshot_json IS NOT NULL`,
  ).bind(proposalId).first<{ n: number }>();
  const appliedLines = applied?.n ?? 0;
  return { proposalId, published: true, appliedLines };
}

// SCAFFOLD WS7 (thermal rework): the thermal WARNING lands near here — when the
// chosen glass misses the resolved band (or the band was ambiguous/absent), set
// review_required=1 and add a thermal reason to review_json + missing_inputs_json,
// so the line is technical_review (submittable), not incomplete. Plan §4/WS7.
function recommendationBasis(opening: OpeningInput): string {
  if (opening.thermalContext?.requirementBasis === "explicit_energy_report") return "energy_report";
  if (opening.scheduleRequirements?.glassDescription || opening.scheduleRequirements?.doubleGlazed != null) {
    return "schedule_specification";
  }
  if (opening.thermalContext?.inputMode === "plans_no_report") return "building_context";
  return "default_allowance";
}
