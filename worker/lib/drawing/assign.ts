// Step: the locate judgement between Pass A boxes and the schedule (§3.3),
// pure. Rules, each one a test:
//
// - A row is matched ONLY against boxes on the elevation its tag was placed
//   on (ADR 0015 point 4) — an unplaced tag is not_read('unplaced'), never
//   matched set-wide (spec §10.4).
// - Within the elevation, order along the wall (floorplan_read's answer,
//   D-4) pairs rows to boxes, left to right; a tie or a leftover is
//   frame_ambiguous for BOTH candidates — never does one take the other's
//   (spec §13, twin-openings row).
import type { CropBoxPt } from "./contract";

export interface ScheduleRow {
  tag: string;
  widthMm: number;
  heightMm: number;
}

export interface Placement {
  elevation: string | null;
  orderOnWall: number | null;
}

export interface PassABox {
  box: [number, number, number, number]; // page fractions
}

export interface ElevationPageGeometry {
  widthPt: number;
  heightPt: number;
}

export type AssignOutcome =
  | { tag: string; outcome: "matched"; boxPt: CropBoxPt }
  | { tag: string; outcome: "not_read"; gapCode: "unplaced" | "frame_ambiguous" };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toPoints(box: [number, number, number, number], geo: ElevationPageGeometry): CropBoxPt {
  const [fx0, fy0, fx1, fy1] = box;
  return [round2(fx0 * geo.widthPt), round2(fy0 * geo.heightPt), round2(fx1 * geo.widthPt), round2(fy1 * geo.heightPt)];
}

export function assignOpenings(
  rows: ScheduleRow[],
  placements: Record<string, Placement>,
  boxesByElevation: Record<string, PassABox[]>,
  geometryByElevation: Record<string, ElevationPageGeometry>,
): AssignOutcome[] {
  // A duplicate order-on-wall (floorplan_read tied two tags to the same
  // position) makes every row sharing it ambiguous — computed per elevation
  // BEFORE any row is matched, so neither of a tied pair can slip through
  // by iteration order.
  const tiedTags = new Set<string>();
  const seenOrder = new Map<string, Map<number, string[]>>(); // elevation -> order -> tags
  for (const row of rows) {
    const placement = placements[row.tag];
    if (!placement?.elevation || placement.orderOnWall == null) continue;
    const byOrder = seenOrder.get(placement.elevation) ?? new Map<number, string[]>();
    const tags = byOrder.get(placement.orderOnWall) ?? [];
    tags.push(row.tag);
    byOrder.set(placement.orderOnWall, tags);
    seenOrder.set(placement.elevation, byOrder);
  }
  for (const byOrder of seenOrder.values()) {
    for (const tags of byOrder.values()) {
      if (tags.length > 1) tags.forEach((t) => tiedTags.add(t));
    }
  }

  return rows.map((row): AssignOutcome => {
    const placement = placements[row.tag];
    if (!placement?.elevation) return { tag: row.tag, outcome: "not_read", gapCode: "unplaced" };
    if (tiedTags.has(row.tag) || placement.orderOnWall == null) {
      return { tag: row.tag, outcome: "not_read", gapCode: "frame_ambiguous" };
    }
    // Order-on-wall is ONE-BASED, position into the elevation's boxes, left
    // to right as drawn.
    const boxes = [...(boxesByElevation[placement.elevation] ?? [])].sort((a, b) => a.box[0] - b.box[0]);
    const box = boxes[placement.orderOnWall - 1];
    const geo = geometryByElevation[placement.elevation];
    if (!box || !geo) return { tag: row.tag, outcome: "not_read", gapCode: "frame_ambiguous" };
    return { tag: row.tag, outcome: "matched", boxPt: toPoints(box.box, geo) };
  });
}
