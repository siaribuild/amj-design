// ═══════════════════════════════════════════════════════════════════════════════
// READING THE DRAWINGS — the orchestrator, and the only module here that touches
// the world.
//
// Everything else in worker/lib/drawing/ is pure and testable without a document:
// crop boxes, request framing, assignment, verification. This is the one file
// that reads R2, calls the container and spends tokens, which is why it is thin
// and does no arithmetic of its own.
//
// ─── The account scope, which is the whole security boundary ──────────────────
//
// `callPlanParse` takes a projectId as an opaque instance key and authorises
// NOTHING. The container has no credentials and checks nobody. So the only thing
// standing between a job and another account's drawings is the query below:
// the file row is selected `WHERE project_id = ?`, and the R2 key comes from
// THAT ROW — never from anything a caller supplied, because an arbitrary key
// would fetch another project's document under this project's id.
//
// Three security reviews named this as the finding-shaped hole while it was
// still a promise in a comment. It is code now, and it is asserted.
//
// ─── What this deliberately does NOT do ───────────────────────────────────────
//
// It does not decide anything. Which boxes exist is Pass A's answer, which row
// owns which box is assign()'s arithmetic, whether a reading survives is
// verifyReading()'s, and none of them are re-litigated here. An orchestrator
// that starts making judgements is an orchestrator nobody can test.
// ═══════════════════════════════════════════════════════════════════════════════
import { getDocumentProxy } from "unpdf";
import type { Env } from "../../types";
import { runStage } from "../ai/stage";
import { elevationInventory, openingComposition, type CompositionReading } from "../estimator/skills/drawingRead";
import { assign, type ElevationBox, type ScheduleRow } from "./assign";
import { buildCropRequest, MAX_CROPS_PER_CALL, type CropIntent } from "./container";
import { callPlanParse, type CropFailureReason } from "./containerClient";
import { cropBoxFor, MIN_CROP_WIDTH_PX } from "./crop";
import { verifyReading, type Disagreement } from "./verifyReading";
import type { Region } from "./types";

/** The DPI multiplier a page is rendered at. A CALIBRATION KNOB — the evidence
 *  that would move it is the read rate at 2, 3 and 4 against a labelled fixture,
 *  not an argument. See the design's constants section. */
const RENDER_SCALE = 3;

export interface OpeningOutcome {
  tag: string;
  state: "read" | "not_stated" | "not_read";
  /** Ops-visible detail beneath the state, never a fourth state on the contract
   *  and never a customer surface (spec AC-10). */
  subReason?: string;
  reading?: CompositionReading;
  /** R2 key of the crop this reading was made from — the only thing that lets a
   *  human check a misread without reopening the PDF. */
  cropKey?: string;
  disagreements?: Disagreement[];
}

export interface DrawingReadResult {
  outcomes: OpeningOutcome[];
  /** Every opening the caller handed in, accounted for. */
  total: number;
  warnings: string[];
}

interface ElevationSheet {
  pageNo: number;
  label: string;
  pageWidthPt: number;
  pageHeightPt: number;
}

/** Page geometry, read from the document itself.
 *
 *  Not asked of the caller: a caller that had to measure the page would be a
 *  second place the scale could be wrong, and it would have to open the PDF to
 *  do it — which this has already done. */
async function measureSheets(pdfBytes: Uint8Array, pages: number[]): Promise<ElevationSheet[]> {
  const doc = await getDocumentProxy(Uint8Array.from(pdfBytes));
  const sheets: ElevationSheet[] = [];
  for (const pageNo of pages) {
    if (pageNo < 1 || pageNo > doc.numPages) continue;
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale: 1 });
    sheets.push({ pageNo, label: `p${pageNo}`, pageWidthPt: vp.width, pageHeightPt: vp.height });
    page.cleanup();
  }
  return sheets;
}

/**
 * Read every opening the schedule knows about, from the drawings.
 *
 * `rows` is the openings list the platform already extracted and which is
 * authoritative — this never re-derives it, and an opening it cannot read keeps
 * everything the schedule gave it.
 */
export async function readDrawings(env: Env, args: {
  aiRunId: string;
  projectId: string;
  sourceGeneration: number;
  fileId: string;
  rows: ScheduleRow[];
  /** The pages the router judged to be drawing sheets. */
  elevationPages: number[];
  /** Called as each opening resolves, so the customer's counter moves. The
   *  denominator is the real opening count and a `not_read` still advances it:
   *  a bar that stalls on what it could not read is lying about work it did. */
  onProgress?: (done: number, total: number) => Promise<void>;
}): Promise<DrawingReadResult> {
  const warnings: string[] = [];
  const outcomes: OpeningOutcome[] = [];
  const total = args.rows.length;

  // THE DENOMINATOR IS ANNOUNCED BEFORE ANY WORK. This is the "20 openings
  // discovered" moment: without it the UI has a numerator and no total to put it
  // over, and the customer watches a spinner instead of a count.
  await args.onProgress?.(0, total);

  // ── Is the quote already finished? Asked ONCE ─────────────────────────────
  //
  // Defence in depth on a privacy rule, not a load-bearing guard, and the
  // difference is worth stating because a previous version of this asked per
  // opening and latched — twenty extra reads a job against a transition that
  // cannot occur.
  //
  // IT CANNOT OCCUR, from the code rather than from reasoning about it. Every
  // pipeline writer of `status_customer` is guarded on `='draft'` (jobs.ts:220,
  // 231, 239, 325, 677; pipeline.ts:1050, 1067; proposal.ts:166), so a read runs
  // only while a project is draft. `closed` is reachable only FROM
  // `quote_issued` (orders.ts:412, guarded on exactly that), `expired` is never
  // written at all, and `quote_issued` requires an ops review of a quote that
  // only exists once this read has finished. The workflow is hours to days and
  // strictly ordered.
  //
  // So this catches one thing: a read somehow started against an
  // already-finished project. That is cheap to check once and worth checking,
  // because the cost of being wrong is creating fragments of a customer's
  // drawings for a quote whose evidence was deliberately deleted.
  const terminal = await isTerminalProject(env, args.projectId);

  const pdfBytes = await planBytes(env, args.projectId, args.fileId);
  if (!pdfBytes) {
    // Nothing was read because nothing was opened — but every opening IS
    // resolved, so the counter has to say so. Returning here without reporting
    // left the job finished and the bar sitting at nothing, which is the same
    // dishonesty as a bar that stalls on what it could not read.
    await args.onProgress?.(total, total);
    return {
      total,
      warnings: ["drawing_read: the plan file could not be read"],
      outcomes: args.rows.map((r) => ({ tag: r.tag, state: "not_read" as const, subReason: "no_document" })),
    };
  }

  const sheets = await measureSheets(pdfBytes, args.elevationPages);

  // ── Render each sheet whole, as a full-page crop ───────────────────────────
  // THE FIRST OF TWO CONTAINER CALLS, and the floor is two by construction: Pass
  // B cannot be batched until Pass A's boxes have come back here and been
  // assigned. The container renders pages and cuts rectangles; a whole sheet is
  // just the rectangle that is the whole page, so this needs no second endpoint.
  const sheetImages = new Map<number, Uint8Array>();
  // BATCHED, like the per-opening crops. A single request whose `deferred` was
  // ignored silently lost every sheet past the cap, and every opening on those
  // sheets became not_read with nothing said about why. The container also
  // refuses more than 20 pages outright, so one call was never going to be
  // enough for a large set.
  let pendingSheets: CropIntent[] = sheets.map((s) => ({
    id: `sheet:${s.pageNo}`,
    pageNo: s.pageNo,
    box: {
      left: 0, top: 0,
      width: Math.ceil(s.pageWidthPt * RENDER_SCALE),
      height: Math.ceil(s.pageHeightPt * RENDER_SCALE),
    },
  }));
  while (pendingSheets.length) {
    const req = buildCropRequest(pendingSheets, RENDER_SCALE);
    if (req.pages.length === 0) break;
    try {
      const res = await callPlanParse(env, args, req, pdfBytes);
      for (const c of res.crops) sheetImages.set(Number(c.id.slice("sheet:".length)), c.bytes);
      for (const f of res.failures) warnings.push(`drawing_read: sheet ${f.id} did not render (${f.reason})`);
    } catch (err) {
      warnings.push(`drawing_read: a sheet batch could not be rendered (${(err as Error).message})`);
    }
    const deferred = new Set(req.deferred);
    pendingSheets = pendingSheets.filter((i) => deferred.has(i.id));
  }

  // ── Pass A, once per elevation ─────────────────────────────────────────────
  const boxesBySheet = new Map<number, ElevationBox[]>();
  for (const sheet of sheets) {
    const image = sheetImages.get(sheet.pageNo);
    if (!image) continue;
    const run = await runStage(env, {
      aiRunId: args.aiRunId,
      projectId: args.projectId,
      skill: elevationInventory,
      input: { imageDataUrl: dataUrl(image), sheetLabel: sheet.label },
    });
    if (!run.ok || !run.data) {
      warnings.push(`drawing_read: elevation ${sheet.label} was not inventoried`);
      continue;
    }
    boxesBySheet.set(sheet.pageNo, run.data.windows);
  }

  // ── Assign, per sheet, in arithmetic ───────────────────────────────────────
  const located = new Map<string, { sheet: ElevationSheet; region: Region }>();
  const unlocated = new Map<string, string>();
  for (const sheet of sheets) {
    const boxes = boxesBySheet.get(sheet.pageNo);
    if (!boxes?.length) continue;
    const result = assign({ rows: args.rows, boxes, elevation: sheet.label });
    for (const [tag, a] of result.assigned) {
      // First sheet to own a row keeps it. A row two SHEETS both claim is the
      // same fault as a box two rows claim, and is caught by the same rule.
      if (located.has(tag)) { unlocated.set(tag, "ambiguous_sheet"); located.delete(tag); continue; }
      if (!unlocated.has(tag)) located.set(tag, { sheet, region: boxes[a.boxIndex].region });
    }
    for (const n of result.notRead) if (!located.has(n.tag)) unlocated.set(n.tag, n.subReason);
  }

  // ── Crop only what is located. Nothing reaches the model unlocated ──────────
  const intents: CropIntent[] = [];
  for (const [tag, { sheet, region }] of located) {
    intents.push({
      id: tag,
      pageNo: sheet.pageNo,
      box: cropBoxFor(region, sheet.pageWidthPt, sheet.pageHeightPt, RENDER_SCALE),
    });
  }

  const crops = new Map<string, { bytes: Uint8Array; width: number; height: number }>();
  const cropFailed = new Map<string, CropFailureReason>();
  let pending = intents;
  while (pending.length) {
    const request = buildCropRequest(pending, RENDER_SCALE);
    // An all-gaps batch pays a cold start and a bill to be told what it already
    // knows. `pages.length > 0` is the check; there is no helper for it.
    if (request.pages.length > 0) {
      try {
        const res = await callPlanParse(env, args, request, pdfBytes);
        for (const c of res.crops) crops.set(c.id, { bytes: c.bytes, width: c.width, height: c.height });
        for (const f of res.failures) cropFailed.set(f.id, f.reason);
      } catch (err) {
        warnings.push(`drawing_read: the renderer refused a batch (${(err as Error).message})`);
        for (const p of request.pages.flatMap((x) => x.crops)) cropFailed.set(p.id, "unknown");
      }
    }
    for (const tag of request.gaps) unlocated.set(tag, "no_crop_box");
    const deferred = new Set(request.deferred);
    pending = pending.filter((i) => deferred.has(i.id));
  }

  // ── Pass B, one call per located opening ───────────────────────────────────
  let done = 0;
  const advance = async () => { done++; await args.onProgress?.(done, total); };

  for (const row of args.rows) {
    const place = located.get(row.tag);
    const crop = crops.get(row.tag);
    if (!place || !crop) {
      outcomes.push({
        tag: row.tag,
        state: "not_read",
        subReason: cropFailed.get(row.tag) ?? unlocated.get(row.tag) ?? "unlocated",
      });
      await advance();
      continue;
    }

    const run = await runStage(env, {
      aiRunId: args.aiRunId,
      projectId: args.projectId,
      skill: openingComposition,
      input: {
        imageDataUrl: dataUrl(crop.bytes),
        tag: row.tag,
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        typeText: row.typeText,
      },
    });

    // The crop is stored whatever the reading said. A decline a reviewer cannot
    // look at is a decline they cannot check, and `not_read` is exactly the case
    // where someone will want to see what the model saw.
    //
    // EXCEPT ON A REPLAY. runStage's cached path returns the ORIGINAL row's id,
    // found by project across all runs, so it belongs to a different ai_run.
    // Writing a crop keyed on it under THIS run produces a fresh R2 object, and
    // the outcome update — scoped by id AND ai_run_id — then matches nothing,
    // because those two came from different runs. Bytes with nothing pointing at
    // them, once per opening per replay. The original run already stored its
    // crop and recorded its outcome; reuse them.
    // On a replay, reuse what the original run stored — IF it still exists. A
    // replay can land on a row that predates metrics_json, whose crop store
    // failed, or whose crop the retention rule has since deleted at a terminal
    // quote state. In all three the key comes back undefined, and simply
    // shrugging leaves the reading with no evidence at all. An orphan is
    // recoverable; a hole is not.
    const evidence: CropEvidence = run.cached
      ? await cropEvidenceFor(env, run.stageRunId)
      : { kind: "absent" };
    let cropKey = evidence.kind === "reuse" ? evidence.key : undefined;
    // `deleted` means retention removed it deliberately. The reading still
    // stands — it was made from a crop that legitimately existed at the time —
    // but the evidence is gone by policy and must not be re-created.
    // `absent` may be filled — unless the quote is already finished, in which
    // case creating evidence now is the resurrection the retention rule forbids,
    // arriving by the front door rather than through a replay.
    if (evidence.kind === "absent" && !terminal) {
      // Keyed on the OPENING under this run, not on a stage id that belongs to
      // someone else's run — which is what produced the orphan in the first
      // place.
      cropKey = await storeCrop(env, args, run.cached ? row.tag : (run.stageRunId ?? row.tag), crop.bytes);
      // Back-fill the row that actually produced the reading, scoped by its own
      // primary key: a replay writes no row of its own, so this is completing
      // that record rather than rewriting history.
      if (run.cached && cropKey && run.stageRunId) await backfillCropKey(env, run.stageRunId, cropKey);
    }

    if (!run.ok || !run.data) {
      const outcome: OpeningOutcome = { tag: row.tag, state: "not_read", subReason: "invalid_output", cropKey };
      outcomes.push(outcome);
      if (!run.cached) await recordOutcome(env, args.aiRunId, run.stageRunId, outcome);
      await advance();
      continue;
    }

    const reading = run.data;
    if (reading.outcome !== "read") {
      const outcome: OpeningOutcome = { tag: row.tag, state: reading.outcome, subReason: reading.reason, cropKey, reading };
      outcomes.push(outcome);
      if (!run.cached) await recordOutcome(env, args.aiRunId, run.stageRunId, outcome);
      await advance();
      continue;
    }

    const verified = verifyReading({ row, reading });
    const outcome: OpeningOutcome = {
      tag: row.tag,
      state: "read",
      reading,
      cropKey,
      // Surfaced, never resolved — the reviewer decides.
      disagreements: verified.agrees ? undefined : verified.disagreements,
    };
    outcomes.push(outcome);
    if (!run.cached) await recordOutcome(env, args.aiRunId, run.stageRunId, outcome);
    await advance();
  }

  return { outcomes, total, warnings };
}

/** The plan file's bytes, under the project's own scope.
 *
 *  THE security boundary of this module — see the header. The row is selected by
 *  project, and the R2 key comes from the row. */
async function planBytes(env: Env, projectId: string, fileId: string): Promise<Uint8Array | null> {
  const row = await env.DB.prepare(
    `SELECT r2_key FROM file_asset
      WHERE project_id = ? AND id = ? AND virus_status = 'clean'`,
  ).bind(projectId, fileId).first<{ r2_key: string }>();
  if (!row?.r2_key) return null;
  const obj = await env.FILES.get(row.r2_key).catch(() => null);
  return obj ? new Uint8Array(await obj.arrayBuffer()) : null;
}

/** Where a crop lives.
 *
 *  Its own key, NOT `ai_stage_runs.result_r2_key` — that is the replay archive
 *  the stage layer reads back and re-validates as JSON, and a PNG there breaks
 *  replay. The key travels in `metrics_json` instead. */
async function storeCrop(env: Env, args: { projectId: string; aiRunId: string }, stageRunId: string, bytes: Uint8Array): Promise<string | undefined> {
  const key = `projects/${safe(args.projectId)}/runs/${safe(args.aiRunId)}/crops/${safe(stageRunId)}.png`;
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    return key;
  } catch {
    // Evidence that could not be stored is not a reading that did not happen.
    return undefined;
  }
}

/** Write what happened to this opening onto its own stage row.
 *
 *  `metrics_json`, NOT `result_r2_key` — that key is the replay archive the
 *  stage layer reads back and re-validates as JSON, and a PNG key there breaks
 *  replay. This column exists on ai_stage_runs (0016) and nothing wrote it until
 *  now, which meant the crop sat in R2 with nothing pointing at it: the ops
 *  readings surface queries exactly this.
 *
 *  Scoped by ai_run_id as well as id. An id alone is a primary key and would be
 *  correct, but every other write in this pipeline carries its run and a
 *  narrower guard costs nothing. */
async function recordOutcome(env: Env, aiRunId: string, stageRunId: string | null, outcome: OpeningOutcome): Promise<void> {
  if (!stageRunId) return;
  await env.DB.prepare(
    "UPDATE ai_stage_runs SET metrics_json=? WHERE id=? AND ai_run_id=?",
  ).bind(JSON.stringify({
    tag: outcome.tag,
    state: outcome.state,
    subReason: outcome.subReason ?? null,
    cropKey: outcome.cropKey ?? null,
    disagreements: outcome.disagreements ?? [],
  }), stageRunId, aiRunId).run().catch(() => {});
}

/** The crop a previous run already stored for this exact input.
 *
 *  Scoped by id alone because that is what a replay hands back — the row belongs
 *  to a different ai_run by construction, so scoping by this run's id would
 *  return nothing, which is the bug this exists to avoid rather than repeat. */
/** The states at which a quote is finished and its crops are deleted: issued in
 *  final form, or voided.
 *
 *  `0001_customer_core.sql:59` is a CHECK CONSTRAINT, not a trigger, and an
 *  earlier version of this comment called it one. There is no `CREATE TRIGGER`
 *  anywhere in `migrations/` and there never was — the deletion is application
 *  code, in `issue.ts` (crops only; the source documents are deliberately kept)
 *  and in the draft-clear route (the whole derived prefix; its owner threw it
 *  away). Both were written after this comment claimed they existed, which is
 *  how a comment describing a control nobody built survives review: it names a
 *  real line in a real file.
 *
 *  `expired` is in the CHECK and is written by nothing. It stays here because
 *  the constraint admits it, not because anything produces it. */
const TERMINAL_STATES = new Set(["quote_issued", "accepted", "expired", "closed"]);

/**
 * Is this quote already finished?
 *
 * THE ROOT CAUSE of three rounds of replay fixes. Crops are deleted when a quote
 * reaches a terminal state, and that deletion is the privacy control. But
 * `absent` — a stage row that never had a crop — still stored one, and a FRESH
 * run is `absent` by construction, so this was never really about replay: ANY
 * read on a finished quote wrote new fragments of a customer's drawings, for a
 * quote whose evidence had just been deleted on purpose.
 *
 * Unknown is NOT terminal. A project the query cannot find is not evidence that
 * it is finished, and defaulting the other way would silently stop storing
 * evidence for every live quote the moment this query broke.
 */
export async function isTerminalProject(env: Env, projectId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT status_customer FROM project WHERE id = ?",
  ).bind(projectId).first<{ status_customer: string }>().catch(() => null);
  return row ? TERMINAL_STATES.has(row.status_customer) : false;
}

export type CropEvidence =
  /** The original run's crop is still there — reuse it, store nothing. */
  | { kind: "reuse"; key: string }
  /** The row NAMES a crop whose object is gone: retention removed it when the
   *  quote reached a terminal state. Do not re-create it. */
  | { kind: "deleted" }
  /** The row never had a crop — it predates metrics_json, or the store failed.
   *  This one may be filled. */
  | { kind: "absent" };

/**
 * What evidence, if any, a replayed reading already has.
 *
 * THE MIDDLE CASE IS THE POINT. Crops die when their quote is issued or voided —
 * the owner's retention decision, and the privacy control behind it: fragments
 * of a customer's drawings stop existing. Storing a fresh crop whenever the
 * cached key failed to resolve re-created exactly what the policy had removed,
 * so a re-run after issue resurrected it, silently.
 *
 * A row that NAMES a key whose object is gone was deleted on purpose. A row that
 * names no key never had one. Only the second may be filled.
 */
export async function cropEvidenceFor(env: Env, stageRunId: string | null): Promise<CropEvidence> {
  if (!stageRunId) return { kind: "absent" };
  const row = await env.DB.prepare(
    "SELECT metrics_json FROM ai_stage_runs WHERE id=?",
  ).bind(stageRunId).first<{ metrics_json: string | null }>().catch(() => null);
  if (!row?.metrics_json) return { kind: "absent" };
  let key: unknown;
  try { key = JSON.parse(row.metrics_json)?.cropKey; } catch { return { kind: "absent" }; }
  if (typeof key !== "string" || !key) return { kind: "absent" };
  const still = await env.FILES.head(key).catch(() => null);
  return still ? { kind: "reuse", key } : { kind: "deleted" };
}

/** Complete the record of the run that produced a reading, when a replay had to
 *  store the crop it should already have had. Scoped by primary key alone: the
 *  row belongs to a different ai_run by construction, which is the whole reason
 *  the id-plus-run guard matched nothing here. */
async function backfillCropKey(env: Env, stageRunId: string, cropKey: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE ai_stage_runs
        SET metrics_json = json_patch(COALESCE(metrics_json, '{}'), ?)
      WHERE id = ?`,
  ).bind(JSON.stringify({ cropKey }), stageRunId).run().catch(() => {});
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);

const dataUrl = (bytes: Uint8Array): string => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(binary)}`;
};

/**
 * Move the customer's counter.
 *
 * The same token guard every other progress write uses, and it is not
 * decoration: a job whose lease expired has had its work re-claimed by another
 * worker, and without the guard the abandoned run keeps writing counts over the
 * one that actually owns the job — two workers fighting over one bar, in the one
 * place a customer is watching.
 *
 * Two columns, and deliberately NOT a new `progress_stage` value: that column
 * carries a CHECK constraint, SQLite cannot extend a CHECK in place, and doing
 * it means rebuilding ai_job_claim — the recipe whose DROP once cascade-deleted
 * production rows here. The UI derives the label from the counts.
 */
export async function recordDrawingProgress(env: Env, args: {
  projectId: string;
  sourceGeneration: number;
  processingToken: string;
  done: number;
  total: number;
}): Promise<void> {
  await env.DB.prepare(
    `UPDATE ai_job_claim
        SET drawings_done=?, drawings_total=?, updated_at=datetime('now')
      WHERE project_id=? AND source_generation=? AND status='processing'
        AND processing_token=?`,
  ).bind(args.done, args.total, args.projectId, args.sourceGeneration, args.processingToken).run();
}

export { RENDER_SCALE, MIN_CROP_WIDTH_PX, MAX_CROPS_PER_CALL };
