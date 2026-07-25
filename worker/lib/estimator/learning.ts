import type { Env } from "../../types";
import type { CatalogueCandidate, OpeningInput, PerformanceVariant } from "./types";

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

export interface HistoricalRow {
  context_key: string;
  final_product_slug: string;
  final_variant_id: string | null;
  decision: "accepted" | "adjusted" | "no_ai_proposal";
  reason_code: string;
}

interface Counts { accepts: number }
const smooth = (n: number, total: number) => (n + 1) / (total + 2);

export interface HistoricalModel {
  version: string;
  observations: number;
  scoreFor(
    candidate: CatalogueCandidate,
    opening: OpeningInput,
    variant?: PerformanceVariant | null,
  ): number;
}

export function aggregateHistorical(rows: HistoricalRow[]): HistoricalModel {
  const exact = new Map<string, number>();
  const contextTotals = new Map<string, number>();
  let observations = 0;
  for (const row of rows ?? []) {
    if (!row.context_key || !row.final_product_slug) continue;
    observations++;
    const variant = row.final_variant_id || "any";
    const exactKey = `${row.context_key}::${row.final_product_slug}::${variant}`;
    exact.set(exactKey, (exact.get(exactKey) ?? 0) + 1);
    contextTotals.set(row.context_key, (contextTotals.get(row.context_key) ?? 0) + 1);
  }
  return {
    version: LEARNING_VERSION,
    observations,
    scoreFor(candidate, opening, variant) {
      if (!observations) return 0.5;
      const ctx = contextKey(opening);
      const ctxTotal = contextTotals.get(ctx) ?? 0;
      if (ctxTotal < 2) return 0.5;
      const exactCount = exact.get(`${ctx}::${candidate.slug}::${variant?.variantId || "any"}`) ?? 0;
      return smooth(exactCount, ctxTotal);
    },
  };
}

export async function buildHistoricalModel(env: Env): Promise<HistoricalModel> {
  const { results } = await env.DB.prepare(
    `SELECT context_key, final_product_slug, final_variant_id, decision, reason_code
       FROM recommendation_outcome
      WHERE recommendation_eligible = 1
        AND thermal_eligible = 0
        AND quality_state = 'approved'`,
  ).all<HistoricalRow>();
  return aggregateHistorical(results ?? []);
}

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
          requirementBasis: "human_override",
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
