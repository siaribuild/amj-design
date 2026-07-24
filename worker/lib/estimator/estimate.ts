// Project estimate orchestration (spec §18): run the deterministic engine over
// every opening_instance in a project and persist the selection. Ties the
// CatalogueRepository, hard rules, pricing, ranker and persistence together.
import type { Env } from "../types";
import { createCatalogueRepository, sanityExecutor } from "./catalogue";
import { selectForOpening } from "./select";
import { persistSelection } from "./persist";
import { priceLine } from "./pricing";
import type { CatalogueCandidate, OpeningInput } from "./types";

interface OpeningRow {
  id: string; external_ref: string | null; family: string | null; operation_type: string | null;
  width_mm: number | null; height_mm: number | null; requirements_json: string | null;
}

function toOpeningInput(row: OpeningRow): OpeningInput & { externalRef: string | null } {
  let requirements: OpeningInput["requirements"] = null;
  try { const r = row.requirements_json ? JSON.parse(row.requirements_json) : null; if (r && typeof r === "object") requirements = r; } catch { /* ignore */ }
  return {
    externalRef: row.external_ref,
    family: row.family,
    operationType: row.operation_type,
    widthMm: row.width_mm,
    heightMm: row.height_mm,
    requirements,
  };
}

export interface EstimateSummary {
  openings: number;
  selected: number;
  lines: { openingId: string; externalRef: string | null; status: string; selectedProduct: string | null; total: number | null }[];
}

export async function runProjectEstimate(env: Env, projectId: string): Promise<EstimateSummary> {
  const { results } = await env.DB
    .prepare("SELECT id, external_ref, family, operation_type, width_mm, height_mm, requirements_json FROM opening_instance WHERE project_id = ? ORDER BY created_at")
    .bind(projectId).all<OpeningRow>();
  const openings = results ?? [];

  const repo = createCatalogueRepository(sanityExecutor(env));
  // Price a candidate for an opening via the private D1 rate card (family = the
  // product's series slug, e.g. awning-window; falls back to 'default').
  const priceFn = async (candidate: CatalogueCandidate, opening: OpeningInput) =>
    priceLine(env, {
      family: candidate.series ?? candidate.family ?? "default",
      widthMm: opening.widthMm ?? 0,
      heightMm: opening.heightMm ?? 0,
      qty: 1,
    });

  const lines: EstimateSummary["lines"] = [];
  let selectedCount = 0;
  for (const row of openings) {
    const opening = toOpeningInput(row);
    const result = await selectForOpening(opening, repo, priceFn);
    await persistSelection(env, { projectId, openingId: row.id, result });
    if (result.selected) selectedCount++;
    lines.push({
      openingId: row.id,
      externalRef: row.external_ref,
      status: result.selected ? result.selected.outcome.status : (result.status as string),
      selectedProduct: result.selected?.candidate.sanityProductId ?? null,
      total: result.selected?.price?.total ?? null,
    });
  }
  return { openings: openings.length, selected: selectedCount, lines };
}
