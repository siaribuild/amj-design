// Project estimate orchestration (spec §18): run the deterministic engine over
// every opening_instance in a project and persist the selection. Ties the
// CatalogueRepository, hard rules, pricing, ranker and persistence together.
import type { Env } from "../types";
import { createCatalogueRepository, sanityExecutor } from "./catalogue";
import { selectForOpening } from "./select";
import { persistSelection } from "./persist";
import { priceLine } from "./pricing";
import { uuid } from "../util";
import type { CatalogueCandidate, OpeningInput } from "./types";

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
  // Extraction source #1: if the project has parsed schedule lines but no
  // openings yet, bridge them first (idempotent).
  await bridgeParseLinesToOpenings(env, projectId);

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
