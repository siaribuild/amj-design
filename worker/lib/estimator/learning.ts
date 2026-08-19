import type { Env } from "../../types";
import type { OpeningInput } from "./types";

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

// HistoricalRow, Counts, smooth(), HistoricalModel, aggregateHistorical() and
// buildHistoricalModel() lived here and are GONE (ADR 0007).
//
// They fed the deleted 0.10 historical weight, and D12 explains why that never
// mattered: the twelve-field contextKey produced 9 usable rows across 11
// distinct keys in production — every opening alone in its bucket, so the model
// returned the neutral 0.5 every time it was ever asked, and always would have.
// A cheapest-wins ladder has no channel for a preference in any case.
//
// contextKey() itself STAYS: it is still written to the NOT NULL context_key
// column at capture, and recording is untouched (D12). Phase 3 adds the coarse
// retrieval key and the dark shadow model that reads it.

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
          // Preserve the original case context for retrieval density. The flag
          // records that approved precedent constrained eligibility without
          // rewriting a plan/default basis into a compliance claim.
          thermalPrecedentApplied: true,
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
