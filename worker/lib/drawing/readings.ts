// Model application (02-design-v2.md §3.5) — what a drawing reading DOES to
// the building model and, later, to persisted lines. Persistence
// (drawing_reading rows, ai_runs.drawing_report_json) is the D1-touching
// half of this file; grown alongside the pure functions below as enrich.ts
// (the orchestrator) needs them.
import type { DrawingReading, Orientation } from "./contract";
import type { Env } from "../../types";
import { uuid } from "../util";

/** Orientation is a PLAIN ASSIGNMENT, not `??=`: a high-confidence drawing
 *  reading outranks the plan-context fallback already present on the model. */
export function applyDrawingOrientation(
  model: { openings: { externalRef: string; wallOrientation: Orientation | null; wallOrientationSource: string | null }[] },
  readings: { externalRef: string; orientationState: string; orientation: Orientation | null; confidence?: string | null; flags?: unknown[] }[],
): void {
  const byRef = new Map(readings.map((r) => [r.externalRef, r]));
  for (const opening of model.openings) {
    const reading = byRef.get(opening.externalRef);
    if (reading?.orientationState === "value" && reading.orientation && reading.confidence !== "low" && !(reading.flags?.length)) {
      opening.wallOrientation = reading.orientation;
      opening.wallOrientationSource = "plan";
    }
  }
}

/** Room label → `quote_line.room_label`, guarded to rows that are still
 *  empty (§3.5) — a human's own label is never overwritten. Runs after
 *  `runProjectEstimate` materialises lines (readings apply before that has
 *  a row to guard, so this is a separate, later call). */
export async function applyDrawingRoom(
  env: Pick<Env, "DB">,
  projectId: string,
  readings: { externalRef: string; roomState: string; roomLabel: string | null; confidence?: string | null; flags?: unknown[] }[],
): Promise<void> {
  for (const r of readings) {
    if (r.roomState !== "value" || !r.roomLabel || r.confidence === "low" || r.flags?.length) continue;
    await env.DB.prepare(
      `UPDATE quote_line SET room_label=? WHERE project_id=? AND external_ref=? AND (room_label IS NULL OR room_label='')`,
    ).bind(r.roomLabel, projectId, r.externalRef).run();
  }
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
       confidence, flags_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    uuid(), projectId, aiRunId, r.sourceFileId, r.externalRef,
    r.splitState, r.split ? JSON.stringify(r.split) : null, r.orientationState, r.orientation,
    r.elevationState, r.elevation, r.roomState, r.roomLabel,
    r.gapCode, r.gapNote, r.cropKey, r.pageNo, r.sheetRef, r.regionJson ? JSON.stringify(r.regionJson) : null,
    r.confidence, JSON.stringify(r.flags),
  ));
  await env.DB.batch(stmts);
}
