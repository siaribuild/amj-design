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
import { normalizeOpeningRef } from "../ai/energyMap";

export interface ScheduleRow {
  tag: string;
  widthMm: number;
  heightMm: number;
}

export interface Placement {
  elevation: string | null;
  orderOnWall: number | null;
  storey?: "ground" | "first" | null;
}

export interface PassABox {
  box: [number, number, number, number]; // page fractions
  unitProportions?: number[];
  storey?: "ground" | "first" | null;
}

export interface ElevationPageGeometry {
  widthPt: number;
  heightPt: number;
  originXPt?: number;
  originYPt?: number;
}

export type AssignOutcome =
  | { tag: string; outcome: "matched"; boxPt: CropBoxPt; unitProportions?: number[] }
  | { tag: string; outcome: "not_read"; gapCode: "unplaced" | "frame_ambiguous" };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toPoints(box: [number, number, number, number], geo: ElevationPageGeometry): CropBoxPt {
  const [fx0, fy0, fx1, fy1] = box;
  const ox = geo.originXPt ?? 0;
  const oy = geo.originYPt ?? 0;
  return [
    round2(ox + fx0 * geo.widthPt), round2(oy + fy0 * geo.heightPt),
    round2(ox + fx1 * geo.widthPt), round2(oy + fy1 * geo.heightPt),
  ];
}

export const PROPORTION_TOLERANCE = 0.25;

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
  // Case and drawing separators are presentation, not identity: the schedule
  // keeps a tag's printed spelling exactly, but a placement's key came from
  // the model reading the SAME tag off a different sheet — normalized the
  // same way every other schedule/drawing join in this codebase is (Codex
  // review finding: an exact-match lookup here silently unplaced any tag
  // whose case or punctuation differed between the two documents).
  const placementFor = (tag: string): Placement | undefined => placements[normalizeOpeningRef(tag) ?? tag];

  const groupKey = (placement: Placement) => `${placement.elevation ?? ""}|${placement.storey ?? "unknown"}`;
  const tiedTags = new Set<string>();
  const tiedBoxFor = new Map<string, PassABox>();
  const seenOrder = new Map<string, Map<number, string[]>>();
  for (const row of rows) {
    const placement = placementFor(row.tag);
    if (!placement?.elevation || placement.orderOnWall == null) continue;
    const key = groupKey(placement);
    const byOrder = seenOrder.get(key) ?? new Map<number, string[]>();
    const tags = byOrder.get(placement.orderOnWall) ?? [];
    tags.push(row.tag);
    byOrder.set(placement.orderOnWall, tags);
    seenOrder.set(key, byOrder);
  }
  for (const byOrder of seenOrder.values()) {
    for (const tags of byOrder.values()) {
      if (tags.length > 1) tags.forEach((t) => tiedTags.add(t));
    }
  }

  const boxesFor = (placement: Placement): PassABox[] => {
    const all = boxesByElevation[placement.elevation ?? ""] ?? [];
    if (!placement.storey) return [...all];
    const onStorey = all.filter((box) => box.storey === placement.storey);
    return onStorey.length ? onStorey : [...all];
  };

  // A duplicated order is recoverable only when the relative schedule and
  // box widths produce exactly one valid one-to-one assignment.
  for (const byOrder of seenOrder.values()) {
    for (const tags of byOrder.values()) {
      if (tags.length < 2) continue;
      const tiedRows = tags.map((tag) => rows.find((row) => row.tag === tag)!).filter(Boolean);
      const placement = placementFor(tags[0]);
      if (!placement) continue;
      const boxes = boxesFor(placement);
      if (boxes.length !== tiedRows.length) continue;
      const maxSchedule = Math.max(...tiedRows.map((row) => row.widthMm));
      const maxBox = Math.max(...boxes.map((box) => box.box[2] - box.box[0]));
      const solutions: number[][] = [];
      const search = (rowIndex: number, used: Set<number>, assignment: number[]) => {
        if (solutions.length > 1) return;
        if (rowIndex === tiedRows.length) {
          solutions.push([...assignment]);
          return;
        }
        const scheduleRatio = tiedRows[rowIndex].widthMm / maxSchedule;
        boxes.forEach((box, boxIndex) => {
          if (used.has(boxIndex)) return;
          const boxRatio = (box.box[2] - box.box[0]) / maxBox;
          if (Math.abs(scheduleRatio - boxRatio) > PROPORTION_TOLERANCE) return;
          used.add(boxIndex); assignment.push(boxIndex);
          search(rowIndex + 1, used, assignment);
          assignment.pop(); used.delete(boxIndex);
        });
      };
      search(0, new Set(), []);
      if (solutions.length === 1) {
        tiedRows.forEach((row, index) => {
          tiedTags.delete(row.tag);
          tiedBoxFor.set(row.tag, boxes[solutions[0][index]]);
        });
      }
    }
  }

  const proportionInvalid = new Set<string>();
  for (const [key, byOrder] of seenOrder) {
    const groupRows = rows.filter((row) => {
      const placement = placementFor(row.tag);
      return placement && groupKey(placement) === key && placement.orderOnWall != null && (byOrder.get(placement.orderOnWall)?.length ?? 0) === 1;
    });
    if (groupRows.length < 2) continue;
    const placement = placementFor(groupRows[0].tag)!;
    const boxes = boxesFor(placement).sort((a, b) => a.box[0] - b.box[0]);
    if (boxes.length < groupRows.length) continue;
    const maxSchedule = Math.max(...groupRows.map((row) => row.widthMm));
    const maxBox = Math.max(...boxes.slice(0, groupRows.length).map((box) => box.box[2] - box.box[0]));
    const mismatch = groupRows.some((row) => {
      const rowPlacement = placementFor(row.tag)!;
      const box = boxes[rowPlacement.orderOnWall! - 1];
      if (!box || maxSchedule <= 0 || maxBox <= 0) return true;
      const scheduleRatio = row.widthMm / maxSchedule;
      const boxRatio = (box.box[2] - box.box[0]) / maxBox;
      return Math.abs(scheduleRatio - boxRatio) > PROPORTION_TOLERANCE;
    });
    if (mismatch) groupRows.forEach((row) => proportionInvalid.add(row.tag));
  }

  return rows.map((row): AssignOutcome => {
    const placement = placementFor(row.tag);
    if (!placement?.elevation) return { tag: row.tag, outcome: "not_read", gapCode: "unplaced" };
    if (tiedTags.has(row.tag) || proportionInvalid.has(row.tag) || placement.orderOnWall == null) {
      return { tag: row.tag, outcome: "not_read", gapCode: "frame_ambiguous" };
    }
    // Order-on-wall is ONE-BASED, position into the elevation's boxes, left
    // to right as drawn.
    const boxes = boxesFor(placement).sort((a, b) => a.box[0] - b.box[0]);
    const box = tiedBoxFor.get(row.tag) ?? boxes[placement.orderOnWall - 1];
    const geo = geometryByElevation[placement.elevation];
    if (!box || !geo) return { tag: row.tag, outcome: "not_read", gapCode: "frame_ambiguous" };
    return { tag: row.tag, outcome: "matched", boxPt: toPoints(box.box, geo), ...(box.unitProportions ? { unitProportions: box.unitProportions } : {}) };
  });
}
