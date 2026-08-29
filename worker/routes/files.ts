// /api — file uploads/downloads backed by R2 (plans, schedules, drawings, QA
// photos). File bytes live in R2; a file_asset row in D1 points at them.
import { Hono } from "hono";
import type { Env } from "../types";
import { ownedProject, resolveOrCreateCurrentProject } from "../lib/access";
import { resolveUser } from "../lib/auth";
import { uuid } from "../lib/util";
import { scanFile } from "../lib/scan";
import { autoExtractionEnabled } from "../lib/ai/versions";
import { dispatchAiExtractionJob, type AiExtractionJob } from "../lib/ai/jobs";
import { sha256hex } from "../lib/ai/hash";
import { derivedKeys } from "../lib/ai/ingest";
import { purgeProjectCrops } from "../lib/drawing/crops";
import { deriveSubject } from "../lib/parse";

export const files = new Hono<{ Bindings: Env }>();

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const KINDS = new Set(["upload", "plan", "schedule", "other"]);
const MAX_FILES_PER_PROJECT = 25;   // quota per project
const UPLOAD_RATE_WINDOW = 60;      // seconds
const UPLOAD_RATE_MAX = 15;         // uploads per source per window (bounds anon abuse)
const ANON_UPLOAD_BYTES_PER_DAY = 150 * 1024 * 1024;
const USER_UPLOAD_BYTES_PER_DAY = 1024 * 1024 * 1024;
const GLOBAL_UPLOAD_BYTES_PER_HOUR = 5 * 1024 * 1024 * 1024;

/** Refuse a reservation, RECORDING WHY.
 *
 *  The reason used to be returned to the browser and then dropped, so "why was
 *  my file rejected?" could not be answered from the database — it had to be
 *  reconstructed by re-running the scanner against a copy of the file the
 *  customer still happened to have. Both figures exist at the moment of refusal;
 *  now they are kept (migration 0041). */
async function rejectUploadReservation(
  env: Env, id: string, projectId: string,
  reason?: string | null, detail?: string | null,
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM file_asset WHERE id=? AND project_id=? AND virus_status='pending'",
    ).bind(id, projectId),
    env.DB.prepare(
      `UPDATE upload_reservation SET status='rejected', completed_at=datetime('now'),
              reason=?, detail=?
        WHERE id=? AND project_id=? AND status='reserved'`,
    ).bind(reason ?? null, detail ?? null, id, projectId),
  ]).catch(() => { /* pending row remains fail-closed and customer-removable */ });
}

// Exported: `worker/lib/drawing/crops.ts` reuses this rather than a second
// list-and-delete loop (this is the same list/delete pattern the crop
// lifecycle needs, only the prefix differs).
export async function purgeR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 500 });
    await Promise.all(page.objects.map((object) => bucket.delete(object.key)));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

// POST /api/files/upload — multipart (file, [kind]); attaches to the current
// project (created + claim-cookie minted if the anon user has none yet).
files.post("/files/upload", async (c) => {
  // Per-source rate limit — bounds an anonymous caller looping "new cookie →
  // upload" to create unlimited projects/objects. Keyed by session/claim cookie
  // when present, else the connecting IP.
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const rlKey = `uprl:${ip}`;
  const used = parseInt((await c.env.KV.get(rlKey)) ?? "0", 10) || 0;
  if (used >= UPLOAD_RATE_MAX) return c.json({ error: "rate_limited" }, 429);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "no_file" }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: "too_large" }, 413);
  const kindRaw = String(form?.get("kind") ?? "upload");
  const kind = KINDS.has(kindRaw) ? kindRaw : "upload";

  const { project, cookie } = await resolveOrCreateCurrentProject(c.env, c.req.raw);
  const user = await resolveUser(c.env, c.req.raw);
  if (cookie) c.header("Set-Cookie", cookie);

  const projectState = await c.env.DB.prepare(
    `SELECT quote_edit_version FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(project.id).first<{ quote_edit_version: number }>();
  if (!projectState) return c.json({ error: "locked" }, 409);

  const id = uuid();
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
  const r2Key = `project/${project.id}/${id}-${safeName}`;
  const subject = await deriveSubject(c.env, {
    userId: user?.id ?? null, claimToken: null, ip,
  });
  const ipSubject = await deriveSubject(c.env, {
    userId: null, claimToken: null, ip,
  });
  const subjectDailyBytes = user ? USER_UPLOAD_BYTES_PER_DAY : ANON_UPLOAD_BYTES_PER_DAY;
  const nextQuoteVersion = projectState.quote_edit_version + 1;
  const mutationToken = uuid();

  // D1 is the authoritative capacity reservation. Unlike the KV fast-path, this
  // INSERT is serialized and cannot be bypassed by parallel requests. It also
  // caps account/IP churn and total hourly storage exposure across projects.
  const reserved = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO upload_reservation
         (id, project_id, subject, ip_subject, size, status)
       SELECT ?, ?, ?, ?, ?, 'reserved'
        WHERE (
          SELECT count(*) FROM upload_reservation
           WHERE ip_subject=? AND status<>'rejected'
             AND created_at>=datetime('now','-1 minute')
        ) < ?
          AND COALESCE((
            SELECT sum(size) FROM upload_reservation
             WHERE subject=? AND status<>'rejected'
               AND created_at>=datetime('now','-1 day')
          ),0) + ? <= ?
          AND COALESCE((
            SELECT sum(size) FROM upload_reservation
             WHERE status<>'rejected'
               AND created_at>=datetime('now','-1 hour')
          ),0) + ? <= ?`,
    ).bind(
      id, project.id, subject, ipSubject, file.size,
      ipSubject, UPLOAD_RATE_MAX,
      subject, file.size, subjectDailyBytes,
      file.size, GLOBAL_UPLOAD_BYTES_PER_HOUR,
    ),
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token IS NULL
          AND (SELECT count(*) FROM file_asset WHERE project_id=?) < ?
          AND EXISTS (
            SELECT 1 FROM upload_reservation
             WHERE id=? AND project_id=? AND status='reserved'
          )`,
    ).bind(
      nextQuoteVersion, mutationToken, project.id,
      projectState.quote_edit_version, project.id, MAX_FILES_PER_PROJECT,
      id, project.id,
    ),
    c.env.DB.prepare(
      `INSERT INTO file_asset
         (id, project_id, kind, source, r2_key, filename, size, virus_status,
          uploaded_by)
       SELECT ?, ?, ?, 'customer', ?, ?, ?, 'pending', ?
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND status_customer='draft' AND quote_edit_version=?
             AND quote_mutation_token=?
        )`,
    ).bind(
      id, project.id, kind, r2Key, file.name, file.size, user?.id ?? null,
      project.id, nextQuoteVersion, mutationToken,
    ),
    c.env.DB.prepare(
      `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND quote_mutation_token=?`,
    ).bind(project.id, nextQuoteVersion, mutationToken),
  ]);
  if (Number(reserved[0]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "rate_limited" }, 429);
  }
  if (Number(reserved[1]?.meta?.changes ?? 0) !== 1 ||
      Number(reserved[2]?.meta?.changes ?? 0) !== 1 ||
      Number(reserved[3]?.meta?.changes ?? 0) !== 1) {
    await c.env.DB.prepare(
      `UPDATE upload_reservation SET status='rejected', completed_at=datetime('now')
        WHERE id=? AND status='reserved'`,
    ).bind(id).run();
    return c.json({ error: "project_changed_retry" }, 409);
  }

  await c.env.KV.put(rlKey, String(used + 1), { expirationTtl: UPLOAD_RATE_WINDOW });

  // Bytes only reach R2 once a scanner has returned 'clean'. D1 holds a pending
  // metadata reservation meanwhile, which blocks submission and atomically owns
  // the per-project/global capacity.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = await sha256hex(bytes);
  // Browser metadata is only a convenience check. Hash the actual bytes here so
  // stale tabs, renamed files and deterministically resized photos cannot create
  // another file row or spend another AI extraction. The existing clean object
  // has already passed scanning, so identical bytes can be reused safely.
  const duplicate = await c.env.DB.prepare(
    `SELECT id, filename, kind, size
       FROM file_asset
      WHERE project_id=? AND checksum=? AND virus_status='clean' AND id<>?
      ORDER BY created_at DESC LIMIT 1`,
  ).bind(project.id, checksum, id).first<{
    id: string; filename: string; kind: string; size: number | null;
  }>();
  if (duplicate) {
    await rejectUploadReservation(c.env, id, project.id, "duplicate", duplicate.filename);
    return c.json({
      file: {
        id: duplicate.id,
        filename: duplicate.filename,
        kind: duplicate.kind,
        size: duplicate.size,
        status: "clean",
      },
      duplicate: true,
    });
  }
  let verdict;
  try {
    verdict = await scanFile(c.env, {
      bytes, filename: file.name, contentType: file.type || "application/octet-stream",
    });
  } catch {
    await rejectUploadReservation(c.env, id, project.id, "scanner_error", "The scanner threw");
    return c.json({ error: "scan_unavailable", reason: "scanner_error" }, 503);
  }
  if (verdict.verdict === "infected") {
    await rejectUploadReservation(c.env, id, project.id, verdict.reason ?? "rejected", verdict.detail ?? null);
    return c.json({ error: "file_rejected", reason: verdict.reason ?? "rejected", detail: verdict.detail ?? null }, 422);
  }
  if (verdict.verdict !== "clean") {
    await rejectUploadReservation(c.env, id, project.id, verdict.reason ?? "unknown", verdict.detail ?? null);
    return c.json({ error: "scan_unavailable", reason: verdict.reason ?? "unknown" }, 503);
  }

  try {
    await c.env.FILES.put(r2Key, bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
  } catch {
    await rejectUploadReservation(c.env, id, project.id, "storage_unavailable", null);
    return c.json({ error: "storage_unavailable" }, 503);
  }

  const shouldScheduleAi = autoExtractionEnabled(c.env) && !!user;
  const finalizeState = await c.env.DB.prepare(
    `SELECT quote_edit_version, ai_generation FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(project.id).first<{ quote_edit_version: number; ai_generation: number }>();
  if (!finalizeState) {
    await c.env.FILES.delete(r2Key).catch(() => {});
    await rejectUploadReservation(c.env, id, project.id, "project_changed_retry", null);
    return c.json({ error: "project_changed_retry" }, 409);
  }
  const finalizedVersion = finalizeState.quote_edit_version + 1;
  const finalizeToken = uuid();
  const aiJob: AiExtractionJob | null = shouldScheduleAi ? {
    projectId: project.id,
    generation: finalizeState.ai_generation + 1,
    debounceToken: uuid(),
  } : null;
  const finalizedStatements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE project SET quote_edit_version=?, ai_generation=?,
          quote_mutation_token=?,
          updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND quote_edit_version=?
          AND ai_generation=?
          AND quote_mutation_token IS NULL
          AND EXISTS (
            SELECT 1 FROM file_asset
             WHERE id=? AND project_id=? AND virus_status='pending'
          )`,
    ).bind(
      finalizedVersion, aiJob?.generation ?? finalizeState.ai_generation,
      finalizeToken, project.id, finalizeState.quote_edit_version,
      finalizeState.ai_generation, id, project.id,
    ),
    c.env.DB.prepare(
      `UPDATE file_asset SET checksum=?, virus_status='clean', scan_engine=?,
          scanned_at=datetime('now')
        WHERE id=? AND project_id=? AND virus_status='pending'
          AND EXISTS (
            SELECT 1 FROM project
             WHERE id=? AND status_customer='draft' AND quote_edit_version=?
               AND quote_mutation_token=?
          )`,
    ).bind(
      checksum, verdict.engine, id, project.id,
      project.id, finalizedVersion, finalizeToken,
    ),
    c.env.DB.prepare(
      `UPDATE upload_reservation SET status='clean', completed_at=datetime('now')
        WHERE id=? AND project_id=? AND status='reserved'
          AND EXISTS (
            SELECT 1 FROM file_asset
             WHERE id=? AND project_id=? AND virus_status='clean'
          )`,
    ).bind(id, project.id, id, project.id),
  ];
  let aiJobIndex = -1;
  if (aiJob) {
    aiJobIndex = finalizedStatements.length;
    finalizedStatements.push(c.env.DB.prepare(
      `INSERT INTO ai_job_claim
         (project_id, source_generation, debounce_token, status, attempts)
       SELECT ?, ?, ?, 'scheduled', 0
        WHERE EXISTS (
          SELECT 1 FROM project
           WHERE id=? AND status_customer='draft' AND ai_generation=?
             AND quote_edit_version=? AND quote_mutation_token=?
        )
          AND EXISTS (
            SELECT 1 FROM file_asset
             WHERE id=? AND project_id=? AND virus_status='clean'
          )`,
    ).bind(
      project.id, aiJob.generation, aiJob.debounceToken,
      project.id, aiJob.generation, finalizedVersion, finalizeToken,
      id, project.id,
    ));
  }
  const finalizeReleaseIndex = finalizedStatements.length;
  finalizedStatements.push(c.env.DB.prepare(
      `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND ai_generation=?
          AND quote_edit_version=?
          AND quote_mutation_token=?`,
    ).bind(
      project.id, aiJob?.generation ?? finalizeState.ai_generation,
      finalizedVersion, finalizeToken,
    ));
  const finalized = await c.env.DB.batch(finalizedStatements);
  if (Number(finalized[0]?.meta?.changes ?? 0) !== 1 ||
      Number(finalized[1]?.meta?.changes ?? 0) !== 1 ||
      Number(finalized[2]?.meta?.changes ?? 0) !== 1 ||
      (aiJobIndex >= 0 && Number(finalized[aiJobIndex]?.meta?.changes ?? 0) !== 1) ||
      Number(finalized[finalizeReleaseIndex]?.meta?.changes ?? 0) !== 1) {
    await c.env.FILES.delete(r2Key).catch(() => {});
    await rejectUploadReservation(c.env, id, project.id, "project_changed_retry", null);
    return c.json({ error: "project_changed_retry" }, 409);
  }

  // LLM strategy §6 (owner decisions 2026-07-25): extraction runs AUTOMATICALLY on
  // every clean upload — the deterministic layer above only GATES (type, malware,
  // size, quota); the AI tier interprets. Fire-and-forget after the response so
  // the customer never waits on a model; stage idempotency makes re-processing
  // unchanged documents free, and any failure degrades to the deterministic
  // parse + manual review. AI_EXTRACTION_MODE='manual' is the kill-switch.
  //
  // REGISTERED USERS ONLY: anonymous uploads stay deterministic-only. This bounds
  // model spend to identifiable accounts (an anonymous loop can't drain the
  // gateway cap and deny AI to real users), keeps unconsented documents away
  // from the external model, and makes AI interpretation the registration
  // incentive. Anonymous users keep the instant free parse — no capability loss
  // on clean digital schedules.
  //
  // RUN COALESCING (UX spec §4, ~10s trailing debounce): schedule + energy
  // uploaded together must produce ONE run — otherwise the customer watches
  // assumption-based prices appear and mutate seconds later. Each upload stamps
  // a fresh token; only the sleeper still holding the LATEST token runs, so a
  // burst of N files costs one extraction pass and lines are born report-backed.
  if (aiJob) await dispatchAiExtractionJob(c.env, c.executionCtx, aiJob, 10);

  return c.json({ file: { id, filename: file.name, kind, size: file.size, status: "clean" } });
});

// GET /api/projects/:id/files — list a project's files (owner only).
files.get("/projects/:id/files", async (c) => {
  const p = await ownedProject(c.env, c.req.raw, c.req.param("id"));
  if (!p) return c.json({ error: "not_found" }, 404);
  const { results } = await c.env.DB
    .prepare("SELECT id, kind, filename, size, virus_status, doc_type, doc_type_source, created_at FROM file_asset WHERE project_id = ? ORDER BY created_at DESC")
    .bind(p.id).all();
  return c.json({ files: results });
});

// DELETE /api/files/:id — remove one document from a DRAFT project (multi-file
// UX spec §1c: the per-file Remove is the "start over" affordance and the
// wrong-project early exit that replaced the Replace/Add prompt). Post-draft
// files stay locked: they are integral to a submitted/issued record.
//
// Reconciliation mirrors the importer's rules: draft lines SOLELY sourced by
// this file (via its parse jobs) are removed when unedited, kept + flagged
// noLongerInDocuments when a human edited them — never silently deleted.
files.delete("/files/:id", async (c) => {
  const fa = await c.env.DB.prepare("SELECT id, project_id, r2_key, kind FROM file_asset WHERE id = ?").bind(c.req.param("id"))
    .first<{ id: string; project_id: string; r2_key: string; kind: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  const p = await ownedProject(c.env, c.req.raw, fa.project_id);
  if (!p) return c.json({ error: "not_found" }, 404);
  if ((p as { status_customer?: string }).status_customer !== "draft") return c.json({ error: "locked" }, 409);
  const user = await resolveUser(c.env, c.req.raw);
  // Re-read only if there is something LEFT to read. Deleting the last document
  // used to enqueue a run over an empty project: the customer saw "reading
  // document" with no document attached, and the run then failed
  // FILE_UNSUPPORTED with documents:0. Nothing to re-derive from is not a
  // failure state, it is an empty one.
  //
  // The filter mirrors ingestProjectFiles exactly — if it would not be ingested,
  // it cannot justify an ingestion.
  const remaining = await c.env.DB.prepare(
    `SELECT count(*) AS n FROM file_asset
      WHERE project_id = ? AND id <> ? AND kind IN ('upload','plan','schedule')
        AND virus_status = 'clean'`,
  ).bind(fa.project_id, fa.id).first<{ n: number }>();
  const documentsRemain = Number(remaining?.n ?? 0) > 0;
  const shouldRecompute = autoExtractionEnabled(c.env) && !!user && documentsRemain;
  const generationRow = await c.env.DB.prepare(
    `SELECT ai_generation, quote_edit_version FROM project
      WHERE id=? AND status_customer='draft' AND quote_mutation_token IS NULL`,
  ).bind(fa.project_id).first<{ ai_generation: number; quote_edit_version: number }>();
  if (!generationRow) return c.json({ error: "locked" }, 409);
  const job: AiExtractionJob | null = shouldRecompute ? {
    projectId: fa.project_id,
    generation: generationRow.ai_generation + 1,
    debounceToken: uuid(),
  } : null;
  const expectedGeneration = job?.generation ?? generationRow.ai_generation;
  const nextQuoteVersion = generationRow.quote_edit_version + 1;
  const mutationToken = uuid();

  // Lines this file sourced: schedule-origin draft lines reached through the
  // file's parse jobs. Manual lines are never touched.
  const { results: sourced } = await c.env.DB.prepare(
    `SELECT DISTINCT q.id, q.edited_fields FROM quote_line q
       JOIN parse_line pl ON pl.quote_line_id = q.id
       JOIN schedule_parse_job j ON j.id = pl.job_id
      WHERE j.file_asset_id = ? AND q.project_id = ? AND q.origin = 'schedule'`,
  ).bind(fa.id, fa.project_id).all<{ id: string; edited_fields: string | null }>();
  const affected = new Map<string, { id: string; edited_fields: string | null }>();
  for (const row of sourced ?? []) affected.set(row.id, row);

  let removedLines = 0, keptForReview = 0;
  const mutationGuard = `EXISTS (
    SELECT 1 FROM project
     WHERE id=? AND status_customer='draft' AND ai_generation=?
       AND quote_edit_version=? AND quote_mutation_token=?
  )`;
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE project SET ai_generation=?, quote_edit_version=?,
          quote_mutation_token=?, updated_at=datetime('now')
        WHERE id=? AND status_customer='draft' AND ai_generation=?
          AND quote_edit_version=? AND quote_mutation_token IS NULL
          AND EXISTS (
            SELECT 1 FROM file_asset WHERE id=? AND project_id=?
          )`,
    ).bind(
      expectedGeneration, nextQuoteVersion, mutationToken, fa.project_id,
      generationRow.ai_generation, generationRow.quote_edit_version,
      fa.id, fa.project_id,
    ),
  ];
  let jobInsertIndex = -1;
  if (job) {
    jobInsertIndex = stmts.length;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO ai_job_claim
         (project_id, source_generation, debounce_token, status, attempts)
       SELECT ?, ?, ?, 'scheduled', 0
        WHERE ${mutationGuard}`,
    ).bind(
      fa.project_id, job.generation, job.debounceToken,
      fa.project_id, expectedGeneration, nextQuoteVersion, mutationToken,
    ));
  }
  for (const r of affected.values()) {
    const edited = (() => { try { const v = JSON.parse(r.edited_fields || "[]"); return Array.isArray(v) && v.length > 0; } catch { return false; } })();
    if (edited) {
      stmts.push(c.env.DB.prepare(
        `UPDATE quote_line SET status='technical_review',
           review_json = json_patch(COALESCE(review_json,'{}'), ?)
         WHERE id = ? AND EXISTS (
            SELECT 1 FROM project WHERE id=? AND status_customer='draft'
              AND ai_generation=? AND quote_edit_version=?
              AND quote_mutation_token=?
          )`,
      ).bind(JSON.stringify({
        noLongerInDocuments: "The source documents no longer contain this edited item; we will review it.",
      }), r.id, fa.project_id, expectedGeneration, nextQuoteVersion, mutationToken));
      keptForReview++;
    } else {
      stmts.push(c.env.DB.prepare(
         `DELETE FROM quote_line WHERE id = ? AND EXISTS (
           SELECT 1 FROM project WHERE id=? AND status_customer='draft'
             AND ai_generation=? AND quote_edit_version=?
             AND quote_mutation_token=?
          )`,
      ).bind(r.id, fa.project_id, expectedGeneration, nextQuoteVersion, mutationToken));
      removedLines++;
    }
  }
  // Keep the currently published AI cart/model until a replacement generation
  // succeeds. Its generation-aware publisher atomically reconciles removed and
  // retained openings; a queue/provider failure therefore cannot erase the cart.
  const fileDeleteIndex = stmts.length;
  stmts.push(c.env.DB.prepare(
    `DELETE FROM file_asset WHERE id=? AND project_id=? AND ${mutationGuard}`,
  ).bind(
    fa.id, fa.project_id, fa.project_id, expectedGeneration,
    nextQuoteVersion, mutationToken,
  ));
  stmts.push(c.env.DB.prepare(
    `UPDATE upload_reservation
        SET status=CASE WHEN status='reserved' THEN 'rejected' ELSE status END,
            completed_at=COALESCE(completed_at, datetime('now'))
      WHERE id=? AND project_id=? AND ${mutationGuard}`,
  ).bind(
    fa.id, fa.project_id, fa.project_id, expectedGeneration,
    nextQuoteVersion, mutationToken,
  ));
  const releaseIndex = stmts.length;
  stmts.push(c.env.DB.prepare(
    `UPDATE project SET quote_mutation_token=NULL, updated_at=datetime('now')
      WHERE id=? AND status_customer='draft' AND ai_generation=?
        AND quote_edit_version=? AND quote_mutation_token=?`,
  ).bind(
    fa.project_id, expectedGeneration, nextQuoteVersion, mutationToken,
  ));
  const committed = await c.env.DB.batch(stmts);
  if (Number(committed[0]?.meta?.changes ?? 0) !== 1 ||
      (jobInsertIndex >= 0 && Number(committed[jobInsertIndex]?.meta?.changes ?? 0) !== 1)) {
    return c.json({ error: "project_changed_retry" }, 409);
  }
  // Production D1 includes FK cascade work in DELETE change counts, while local
  // SQLite reports only the directly deleted file row. Both are successful; the
  // guard only needs to reject zero (the file vanished between read and commit).
  if (Number(committed[fileDeleteIndex]?.meta?.changes ?? 0) < 1) {
    return c.json({ error: "project_changed_retry" }, 409);
  }
  if (Number(committed[releaseIndex]?.meta?.changes ?? 0) !== 1) {
    return c.json({ error: "project_changed_retry" }, 409);
  }
  await c.env.FILES.delete(fa.r2_key).catch(() => { /* row is the source of truth; orphaned bytes are unreachable */ });
  await Promise.all([
    c.env.FILES.delete(derivedKeys(fa.project_id, fa.id).markdown),
    purgeR2Prefix(c.env.FILES, `projects/${fa.project_id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}/runs/`),
  ]).catch(() => { /* DB is authoritative; lifecycle cleanup can retry orphaned derivatives */ });
  // Trigger #1 of crop retention (§7): deleting a source document
  // invalidates crops derived from it — an auto re-parse regenerates them.
  await purgeProjectCrops(c.env, fa.project_id).catch(() => {});

  // The remaining documents re-establish the project's evidence (registered
  // users; same auto path as upload).
  if (job) await dispatchAiExtractionJob(c.env, c.executionCtx, job, 0);
  return c.json({ ok: true, removedLines, keptForReview });
});

// GET /api/files/:id/download — stream bytes from R2 (owner only).
files.get("/files/:id/download", async (c) => {
  const fa = await c.env.DB.prepare("SELECT * FROM file_asset WHERE id = ?").bind(c.req.param("id"))
    .first<{ project_id: string; r2_key: string; filename: string; virus_status: string }>();
  if (!fa) return c.json({ error: "not_found" }, 404);
  if (!(await ownedProject(c.env, c.req.raw, fa.project_id))) return c.json({ error: "not_found" }, 404);
  // Only ever serve bytes a scanner cleared. 'infected' is refused outright;
  // 'pending'/'skipped' means unscanned (a legacy row, or a scan that never
  // completed) and is withheld until staff re-scan it.
  if (fa.virus_status === "infected") return c.json({ error: "quarantined" }, 403);
  if (fa.virus_status !== "clean") return c.json({ error: "scan_pending" }, 409);
  const obj = await c.env.FILES.get(fa.r2_key);
  if (!obj) return c.json({ error: "gone" }, 404);
  // Sanitised filename (strip quotes/control chars → no header injection) + a safe
  // RFC 5987 fallback. Private/no-store so a shared cache never retains PII bytes.
  const safe = fa.filename.replace(/[\r\n"\\]/g, "_").replace(/[\x00-\x1f]/g, "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fa.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
});
