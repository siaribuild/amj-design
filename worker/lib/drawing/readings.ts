// Model application (02-design-v2.md §3.5) — what a drawing reading DOES to
// the building model and, later, to persisted lines. Persistence
// (drawing_reading rows, ai_runs.drawing_report_json) is the D1-touching
// half of this file; grown alongside the pure functions below as enrich.ts
// (the orchestrator) needs them.
import type { DrawingFlag, DrawingReading, Orientation } from "./contract";
import type { Env } from "../../types";
import { uuid } from "../util";

type DrawingField = "split" | "orientation";

const NON_BLOCKING_FLAGS: Record<DrawingField, ReadonlySet<DrawingFlag>> = {
  split: new Set(["northAssumed", "manufacturability"]),
  orientation: new Set(["manufacturability", "scheduleDrawingMismatch", "drawingInconsistency", "notVisibleOnElevations"]),
};

/** Field-scoped trust: new/unknown flags block by default. A low reading may
 * pass one field only when its low status is entirely caused by flags that do
 * not concern that field; genuine model uncertainty carries agentEvidenceWeak. */
export function drawingFieldBlocked(
  reading: { confidence?: string | null; flags?: unknown[] },
  field: DrawingField,
): boolean {
  const flags = Array.isArray(reading.flags) ? reading.flags : [];
  if (!flags.length) return reading.confidence === "low";
  return flags.some((flag) => typeof flag !== "string" || !NON_BLOCKING_FLAGS[field].has(flag as DrawingFlag));
}

/** Orientation is a PLAIN ASSIGNMENT, not `??=`: a high-confidence drawing
 *  reading outranks the plan-context fallback already present on the model. */
export function applyDrawingOrientation(
  model: { openings: { externalRef: string; wallOrientation: Orientation | null; wallOrientationSource: string | null }[] },
  readings: { externalRef: string; orientationState: string; orientation: Orientation | null; confidence?: string | null; flags?: unknown[] }[],
): void {
  const byRef = new Map(readings.map((r) => [r.externalRef, r]));
  for (const opening of model.openings) {
    const reading = byRef.get(opening.externalRef);
    if (reading?.orientationState === "value" && reading.orientation && !drawingFieldBlocked(reading, "orientation")) {
      opening.wallOrientation = reading.orientation;
      opening.wallOrientationSource = "plan";
    }
  }
}

/** Schedule comments are customer-visible line notes. Keep the empty-only
 * guard so a customer's own note is never overwritten. */
export async function applyScheduleNotes(
  env: Pick<Env, "DB">,
  projectId: string,
  notes: { externalRef: string; note: string | null }[],
): Promise<void> {
  const statements = notes
    .map(({ externalRef, note }) => ({ externalRef, note: note?.trim().slice(0, 500) || null }))
    .filter((item): item is { externalRef: string; note: string } => !!item.note)
    .map(({ externalRef, note }) => env.DB.prepare(
      `UPDATE quote_line SET room_label=? WHERE project_id=? AND external_ref=? AND (room_label IS NULL OR room_label='')`,
    ).bind(note, projectId, externalRef));
  if (statements.length) await env.DB.batch(statements);
}

/** One shape for any two-sided disagreement — resolves the build's own open
 *  loop (design §14a): AC-9 (schedule vs drawing) and AC-15 (plans vs
 *  energy report) both reach the reviewer through this same string, via the
 *  existing `flagOpening` -> `review_json` channel (zero new machinery). */
export function conflictReason(sideA: string, sideB: string): string {
  return `${sideA} | ${sideB}`;
}

/** Persists every reading for a run — the release-gate/method-report unit
 *  (§6.1); no `src/` reader exists after the ops descope. Batched: one D1
 *  round trip for the whole file's readings, not one per opening. */
export async function persistReadings(
  env: Pick<Env, "DB">,
  projectId: string,
  aiRunId: string,
  readings: DrawingReading[],
): Promise<void> {
  if (!readings.length) return;
  const stmts = readings.map((r) => env.DB.prepare(
    `INSERT INTO drawing_reading (
       id, project_id, ai_run_id, source_file_id, external_ref,
       split_state, split_json, orientation_state, orientation,
       elevation_state, elevation, room_state, room_label,
       gap_code, gap_note, crop_key, page_no, sheet_ref, region_json,
       confidence, flags_json, wall_order, frame_box_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    uuid(), projectId, aiRunId, r.sourceFileId, r.externalRef,
    r.splitState, r.split ? JSON.stringify(r.split) : null, r.orientationState, r.orientation,
    r.elevationState, r.elevation, r.roomState, r.roomLabel,
    r.gapCode, r.gapNote, r.cropKey, r.pageNo, r.sheetRef, r.regionJson ? JSON.stringify(r.regionJson) : null,
    r.confidence, JSON.stringify(r.flags),
    r.wallOrder ?? null, r.frameBoxPt ? JSON.stringify(r.frameBoxPt) : null,
  ));
  await env.DB.batch(stmts);
}
