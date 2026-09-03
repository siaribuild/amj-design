// The READ side of ops2's Metadata tab (design
// docs/runs/ops2-parse-metadata/02-design.md §3.2). One deep module, pattern
// transplanted from worker/lib/estimator/rationale.ts.
//
// IT READS STORED FACTS AND NOTHING ELSE — no catalogue call, no re-parse.
// A figure the parser never captured says so; nothing here fills a gap.
import type {
  LineMetaDto, MetaFact, MetaFactState, MetaReading, MetaRunSteps, MetaSplitUnit,
} from "../../../src/data/lineMeta";
import type { Env } from "../../types";

/** Unreadable JSON is no record, never a throw: this endpoint reports what a
 *  row carries, and a malformed blob is exactly the state a reviewer needs
 *  told rather than a 500 (pattern: rationale.ts's `parse<T>`). */
function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

interface LineRow { external_ref: string }

interface RunRow { id: string; started_at: string; drawing_report_json: string | null }

interface ReadingRow {
  split_state: string; split_json: string | null;
  orientation_state: string; orientation: string | null;
  elevation_state: string; elevation: string | null;
  room_state: string; room_label: string | null;
  gap_code: string | null; gap_note: string | null; crop_key: string | null;
  page_no: number | null; sheet_ref: string | null; region_json: string | null;
  confidence: string | null; flags_json: string | null;
  source_file_id: string | null; filename: string | null;
}

interface DrawingRunStepCounts extends MetaRunSteps { failedPhase?: string }
interface DrawingFileReport {
  fileId: string;
  steps: DrawingRunStepCounts;
  perOpening: { tag: string; outcome: "read" | "not_read" }[];
  wallMs: number;
  modelCalls: number;
}
interface DrawingReport { files: DrawingFileReport[] }

const FACT_STATES: readonly MetaFactState[] = ["value", "not_stated", "not_read"];
const asFactState = (state: string): MetaFactState =>
  FACT_STATES.includes(state as MetaFactState) ? (state as MetaFactState) : "not_stated";

const factOf = (state: string, value: string | null): MetaFact => ({ state: asFactState(state), value });

/** "x,y,w,h" from the stored `[fx0,fy0,fx1,fy1]` page-fraction corners. */
function regionOf(json: string | null): string | null {
  const box = parse<[number, number, number, number]>(json);
  if (!box || box.length !== 4) return null;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const [x0, y0, x1, y1] = box;
  return `${x0},${y0},${round(x1 - x0)},${round(y1 - y0)}`;
}

function readingOf(row: ReadingRow): MetaReading {
  const split = parse<{ units?: MetaSplitUnit[]; axis?: string }>(row.split_json);
  return {
    heading: factOf(row.orientation_state, row.orientation),
    elevation: factOf(row.elevation_state, row.elevation),
    room: factOf(row.room_state, row.room_label),
    split: {
      state: asFactState(row.split_state),
      axis: split?.axis ?? null,
      units: (split?.units ?? []).map((u) => ({
        role: u.role, ratio: u.ratio,
        operation: u.operation ?? null, derivedWidthMm: u.derivedWidthMm ?? null,
      })),
    },
    confidence: row.confidence === "high" || row.confidence === "low" ? row.confidence : null,
    flags: parse<string[]>(row.flags_json) ?? [],
    // AC-15's rule lives here, once: the stored encoding (`conflictReason`,
    // worker/lib/drawing/readings.ts) is never re-split on the client.
    source: {
      fileId: row.source_file_id,
      filename: row.filename,
      pageNo: row.page_no,
      sheetRef: row.sheet_ref,
      region: regionOf(row.region_json),
    },
  };
}

/** The containing file for this opening's tag — never an aggregate (AC-18).
 *  When several files claim the same tag, `sourceFileId` (the reading's own
 *  file) breaks the tie; without a reading, the first match stands. */
function documentOf(report: DrawingReport | null, externalRef: string, sourceFileId?: string | null) {
  if (!report) return { outcome: null as "read" | "not_read" | null, document: null };
  const candidates = report.files.filter((file) => file.perOpening.some((o) => o.tag === externalRef));
  const file = (sourceFileId && candidates.find((f) => f.fileId === sourceFileId)) || candidates[0];
  if (!file) return { outcome: null as "read" | "not_read" | null, document: null };
  const hit = file.perOpening.find((o) => o.tag === externalRef)!;
  const { failedPhase, ...steps } = file.steps;
  return {
    outcome: hit.outcome,
    document: {
      fileId: file.fileId, steps: steps as MetaRunSteps,
      failedPhase: failedPhase ?? null, wallMs: file.wallMs, modelCalls: file.modelCalls,
    },
  };
}

/** The entry SELECT shared by `lineMeta` and `lineCropKey` — wrong project,
 *  nonexistent, a manual line, and a post-issue project all fall out as the
 *  same `null` (X-AC-4-style single scoped entry point). */
async function entryLine(
  env: Pick<Env, "DB">, ref: { projectId: string; lineId: string },
): Promise<LineRow | null> {
  return env.DB.prepare(
    `SELECT q.external_ref
       FROM quote_line q JOIN project p ON p.id = q.project_id
      WHERE q.id = ?1 AND q.project_id = ?2
        AND q.origin = 'schedule'
        AND q.parent_line_id IS NULL
        AND p.status_internal <> 'issued'`,
  ).bind(ref.lineId, ref.projectId).first<LineRow>();
}

/** Latest run only (AC-19) — no chooser, no history. `rowid` breaks a
 *  same-second tie in insertion order (rationale.ts precedent). */
async function latestRun(env: Pick<Env, "DB">, projectId: string): Promise<RunRow | null> {
  return env.DB.prepare(
    `SELECT id, started_at, drawing_report_json FROM ai_runs
      WHERE project_id = ?1
      ORDER BY started_at DESC, rowid DESC LIMIT 1`,
  ).bind(projectId).first<RunRow>();
}

/**
 * THE CANONICAL READING for one opening in one run — the single place that
 * decides WHICH row answers, used by both endpoints.
 *
 * One run over several plan PDFs persists one reading per file per tag
 * (`enrichOpenings`), and the schema has no uniqueness constraint on
 * (project_id, ai_run_id, external_ref). Both endpoints used to run their own
 * unordered `.first()`, so the tab could pair facts read off one drawing with
 * crop bytes cut from another, and a run document belonging to neither — the
 * exact confusion AC-18 exists to prevent, and one an unordered SELECT will
 * produce as soon as a customer attaches two plan sets.
 *
 * The order is evidence first, then confidence, then age:
 *   1. a reading WITH a crop outranks one without — a reading you can check
 *      against pixels is worth more on an audit surface than one you cannot;
 *   2. `high` outranks `low` outranks unrecorded;
 *   3. oldest first, then rowid, so the result is stable across identical rows
 *      and does not move between the two endpoints or between two requests.
 *
 * Deterministic is the requirement; this particular ranking is the judgement.
 * Surfacing ALL applicable readings was the alternative the reviewers offered
 * and it is a bigger change than the defect warrants — but if staff start
 * seeing openings that genuinely appear on two drawings, that is the upgrade.
 */
async function canonicalReading(
  env: Pick<Env, "DB">, projectId: string, runId: string, externalRef: string,
): Promise<ReadingRow | null> {
  return env.DB.prepare(
    `SELECT r.split_state, r.split_json, r.orientation_state, r.orientation,
            r.elevation_state, r.elevation, r.room_state, r.room_label,
            r.gap_code, r.gap_note, r.crop_key, r.page_no, r.sheet_ref, r.region_json,
            r.confidence, r.flags_json, r.source_file_id, f.filename
       FROM drawing_reading r LEFT JOIN file_asset f ON f.id = r.source_file_id
      WHERE r.project_id = ?1 AND r.ai_run_id = ?2 AND r.external_ref = ?3
      ORDER BY CASE WHEN r.crop_key IS NOT NULL THEN 0 ELSE 1 END,
               CASE r.confidence WHEN 'high' THEN 0 WHEN 'low' THEN 1 ELSE 2 END,
               r.created_at, r.rowid
      LIMIT 1`,
  ).bind(projectId, runId, externalRef).first<ReadingRow>();
}

/**
 * The Metadata tab's read for one PARENT line of one project, or `null` when
 * this project has no such available line — wrong project, nonexistent, a
 * manual line, and a post-issue project all fall out of the same SELECT as
 * the same `null` (X-AC-4-style single scoped entry point).
 */
export async function lineMeta(
  env: Pick<Env, "DB">, ref: { projectId: string; lineId: string },
): Promise<LineMetaDto | null> {
  const line = await entryLine(env, ref);
  if (!line) return null;

  const run = await latestRun(env, ref.projectId);
  // EVERY FIELD, ON EVERY RETURN. The DTO is a contract the client dereferences
  // without guarding - `dto.reasoningParts.length` is read directly - so an
  // early return that omits a field does not degrade, it throws. Both fields
  // were added at the bottom of this function and missed here.
  if (!run) return { hasCrop: false, gapCode: null, reasoningParts: [], reading: null, run: null };

  const reading = await canonicalReading(env, ref.projectId, run.id, line.external_ref);

  const report = parse<DrawingReport>(run.drawing_report_json);
  const { outcome, document } = documentOf(report, line.external_ref, reading?.source_file_id);

  // A DECLINED ROW IS NOT A READING. When the parser declines an opening it
  // still persists a row - all four facts `not_read`, a `gap_code` naming why -
  // so "a row exists" and "we read this opening" are different questions. This
  // is the form AC-7 takes in production, rather than the row being absent
  // altogether. Rendering it as a reading fills the panel with `not_read`
  // states and an empty flag list instead of saying plainly that no reading
  // exists. The gap code moves to the top level so the Image panel can still
  // name the recorded reason (AC-10). Codex P1, 2026-09-02.
  // A GAP CODE IS WHAT MAKES IT A DECLINE. "No fact was read" alone is not
  // enough: a row can carry every state as `not_read` and still be a real
  // reading, holding the source document, page and region that place the
  // opening - and the tab shows exactly that. What distinguishes a decline is
  // that the parser recorded WHY it produced nothing. Requiring both is the
  // difference between hiding a decline and hiding evidence.
  // THE RUN'S OWN VERDICT COUNTS TOO. Requiring every fact to be unread missed
  // the common production shape: a declined opening can still carry a fact that
  // did not come from reading the drawing - `room_label` is applied from plan
  // context by `applyKnownRooms`, independently of whether the composition was
  // ever read. Such a row has one "value" among four and was therefore rendered
  // as a full reading, which is precisely the case AC-7 is about.
  //
  // So either signal makes it a decline: nothing was read off the drawing, OR
  // the run itself reported this opening as `not_read`. The gap code stays
  // mandatory - it is what separates a decline from a reading that simply found
  // little, and it is the sentence the Image panel shows.
  const readNothing = !!reading && reading.split_state !== "value"
    && reading.orientation_state !== "value" && reading.elevation_state !== "value"
    && reading.room_state !== "value";
  const declined = !!reading?.gap_code && (readNothing || outcome === "not_read");

  return {
    hasCrop: !!reading?.crop_key,
    gapCode: reading?.gap_code ?? null,
    reasoningParts: reading?.gap_note ? reading.gap_note.split("|").map((s) => s.trim()) : [],
    reading: reading && !declined ? readingOf(reading) : null,
    run: { startedAt: run.started_at, outcome, document },
  };
}

/**
 * Resolves the R2 key behind one line's crop, for the /meta/crop route —
 * same entry SELECT and latest-run scoping as `lineMeta`, so the two never
 * drift on which reading answers. `null` means no such available line
 * (same 404 as `lineMeta`); a found line with no crop yet returns
 * `cropKey: null`.
 */
export async function lineCropKey(
  env: Pick<Env, "DB">, ref: { projectId: string; lineId: string },
): Promise<{ externalRef: string; cropKey: string | null } | null> {
  const line = await entryLine(env, ref);
  if (!line) return null;

  const run = await latestRun(env, ref.projectId);
  if (!run) return { externalRef: line.external_ref, cropKey: null };

  // THE SAME ROW `lineMeta` SHOWS. A second lookup here was how the crop
  // could come from a different file than the facts beside it.
  const reading = await canonicalReading(env, ref.projectId, run.id, line.external_ref);

  return { externalRef: line.external_ref, cropKey: reading?.crop_key ?? null };
}
