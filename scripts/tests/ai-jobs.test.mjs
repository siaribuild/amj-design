import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ai-jobs");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export {
        classifyPipelineFailure,
        classifyJobException,
        customerSafeJobDiagnostic,
        dispatchAiExtractionJob,
        retryCurrentAiExtraction,
        aiJobDeadlineMs,
        setDrawingProgress,
        MAX_PROGRESS_LOG_BYTES,
        MAX_PROGRESS_MESSAGE_CHARS,
        parseDrawingProgressLog,
        processAiExtractionJob,
      } from ${p("worker/lib/ai/jobs.ts")};
      export { completeAiRun } from ${p("worker/lib/ai/runs.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});

const {
  classifyPipelineFailure,
  classifyJobException,
  customerSafeJobDiagnostic,
  dispatchAiExtractionJob,
  retryCurrentAiExtraction,
  aiJobDeadlineMs,
  setDrawingProgress,
  MAX_PROGRESS_LOG_BYTES,
  MAX_PROGRESS_MESSAGE_CHARS,
  parseDrawingProgressLog,
  processAiExtractionJob,
  completeAiRun,
} = await import(pathToFileURL(outfile).href);

test("parseDrawingProgressLog: rows are rebuilt from what the writer produces, nothing else crosses the API", () => {
  const raw = JSON.stringify([
    { at: 1_000, phase: "opening_read", done: 4, total: 27, message: "Rechecking 2 unclear openings" },
    { at: 2_000, phase: "opening_read", done: 8, total: 27, message: 7 },
    { at: 3_000, phase: "not_a_phase", done: 9, total: 27 },
    { phase: "opening_read", done: 9, total: 27 },
    "junk",
  ]);
  assert.deepEqual(parseDrawingProgressLog(raw), [
    { at: 1_000, phase: "opening_read", done: 4, total: 27, message: "Rechecking 2 unclear openings" },
    { at: 2_000, phase: "opening_read", done: 8, total: 27 },
  ]);
  assert.deepEqual(parseDrawingProgressLog("not json"), []);
});

test("aiJobDeadlineMs: drawing parsers receive 600s while non-drawing modes keep the 120s lease", () => {
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "auto_drawings" }), 600_000);
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "agentic_full" }), 600_000);
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "face_mapped" }), 600_000);
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "auto" }), 120_000);
  assert.equal(aiJobDeadlineMs({}), 120_000);
});

test("setDrawingProgress: writes phase + counts guarded by the exact processing token", async () => {
  const calls = [];
  const fakeEnv = { DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) } };
  const before = Date.now();
  await setDrawingProgress(fakeEnv, "proj_1", 3, "tok-abc", 7, 20, "opening_read", "Rechecking 2 unclear openings");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE ai_job_claim SET drawings_done=\?, drawings_total=\?, drawings_phase=\?, drawings_message=\?/);
  // Append-only (§9): every milestone is kept in a log the client reads, not
  // only the latest snapshot a poll happens to catch.
  // The log is one D1 row, so it stops growing by bytes - not by a count that
  // assumes how many plan files or schedule rows a project holds - well inside
  // the row limit, while the snapshot columns keep writing; past it the client
  // shows the live snapshot. (A 480-row run emits at most 730 milestones from
  // the engine, progressMilestoneCeiling in report.ts, plus the stage's
  // inventory milestone; the guard holds several such runs.)
  assert.match(calls[0].sql, new RegExp(`drawings_log=CASE WHEN length\\(CAST\\(coalesce\\(drawings_log,'\\[\\]'\\) AS BLOB\\)\\) < ${MAX_PROGRESS_LOG_BYTES} THEN json_insert\\(coalesce\\(drawings_log,'\\[\\]'\\), '\\$\\[#\\]', json\\(\\?\\)\\) ELSE drawings_log END`));
  assert.equal(MAX_PROGRESS_LOG_BYTES, 400_000);
  assert.match(calls[0].sql, /WHERE project_id=\? AND source_generation=\? AND status='processing'\s+AND processing_token=\?/);
  assert.deepEqual(calls[0].args.slice(0, 4), [7, 20, "opening_read", "Rechecking 2 unclear openings"]);
  assert.deepEqual(calls[0].args.slice(5), ["proj_1", 3, "tok-abc"]);
  const entry = JSON.parse(calls[0].args[4]);
  assert.deepEqual({ ...entry, at: undefined }, { phase: "opening_read", done: 7, total: 20, message: "Rechecking 2 unclear openings", at: undefined });
  assert.ok(entry.at >= before && entry.at <= Date.now());
  // A caller with no message to give leaves the column empty, not stale, and
  // the log entry carries no message either.
  await setDrawingProgress(fakeEnv, "proj_1", 3, "tok-abc", 8, 20, "opening_read");
  assert.deepEqual(calls[1].args.slice(0, 4), [8, 20, "opening_read", null]);
  assert.equal("message" in JSON.parse(calls[1].args[4]), false);
});

test("a transient debounce-store failure cannot make a durable mutation look failed", async () => {
  const sends = [];
  const env = {
    KV: { put: async () => { throw new Error("KV unavailable"); } },
    AI_JOBS: { send: async (...args) => { sends.push(args); } },
  };
  await dispatchAiExtractionJob(env, { waitUntil() {} }, {
    projectId: "project-delete-committed",
    generation: 4,
    debounceToken: "delete-token",
  });
  assert.equal(sends.length, 1, "the durable queue still receives the job");
});

const failedSummary = (stageWarnings) => ({
  runId: "run-1",
  status: "failed",
  documents: 1,
  extractedLines: 0,
  conflicts: 0,
  energyApplied: 0,
  buildingModelId: null,
  estimate: null,
  stageWarnings,
});

test("provider rate limits are classified for reporting without an application retry window", () => {
  const structured = failedSummary([]);
  structured.failureKind = "transient_rate_limit";
  assert.deepEqual(classifyPipelineFailure(structured), {
    failureClass: "quota",
    code: "ai_provider_rate_limited",
  });
  assert.equal(
    classifyPipelineFailure(failedSummary([
      "skill_call_failed",
      "skill_call_error:AiGatewayError: HTTP 429 Too Many Requests",
    ])).failureClass,
    "quota",
    "rolling deployments still classify the previous warning shape",
  );
});

test("job policy retries transport faults but stops invalid immutable input", () => {
  const unavailable = failedSummary([]);
  unavailable.failureKind = "provider_unavailable";
  assert.equal(
    classifyPipelineFailure(unavailable).failureClass,
    "transient",
  );
  assert.equal(
    classifyPipelineFailure(failedSummary(["skill_call_error:HTTP 503 service unavailable"])).failureClass,
    "transient",
  );
  assert.equal(
    classifyPipelineFailure(failedSummary(["skill_output_invalid"])).failureClass,
    "permanent",
  );
  const invalid = failedSummary([]);
  invalid.failureKind = "invalid_output";
  assert.equal(classifyPipelineFailure(invalid).failureClass, "permanent");
  assert.equal(
    classifyPipelineFailure(failedSummary(["skill_call_error:7003 User Input Error"])).failureClass,
    "permanent",
  );
  assert.equal(classifyJobException(new Error("network timeout")).failureClass, "transient");
});

test("customer diagnostics expose a stable category, never provider text", () => {
  const diagnostic = customerSafeJobDiagnostic({
    failure_class: "transient",
    last_error: "AiGatewayError with secret upstream details",
    attempts: 3,
  });
  assert.deepEqual(diagnostic, {
    code: "RETRY_REQUIRED",
    retryable: true,
    retryAt: null,
  });
  assert.ok(!JSON.stringify(diagnostic).includes("secret"));
  assert.equal(
    customerSafeJobDiagnostic({
      failure_class: "quota",
      retry_after: "2026-07-29 12:00:00",
    }).code,
    "RATE_LIMITED",
  );
});

function retryEnv(current) {
  const writes = [];
  const sends = [];
  const puts = [];
  return {
    writes,
    sends,
    puts,
    env: {
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                first: async () => current,
                run: async () => {
                  writes.push({ sql, args });
                  return { meta: { changes: 1 } };
                },
              };
            },
          };
        },
      },
      KV: {
        put: async (...args) => { puts.push(args); },
      },
      AI_JOBS: {
        send: async (...args) => { sends.push(args); },
      },
    },
  };
}

test("staff retry resets and dispatches the same failed generation durably", async () => {
  const { env, writes, sends, puts } = retryEnv({
    ai_generation: 16,
    status_customer: "draft",
    status: "failed",
    debounce_token: "old-token",
  });
  const result = await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1");
  assert.equal(result.job.generation, 16);
  assert.equal(result.alreadyQueued, false);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /status='scheduled'/);
  assert.match(writes[0].sql, /attempts=0/);
  assert.match(writes[0].sql, /drawings_done=NULL,\s+drawings_total=NULL, drawings_phase=NULL, drawings_message=NULL, drawings_log=NULL/,
    "a fresh attempt starts a fresh log; the previous attempt's milestones are not shown beside it");
  assert.equal(sends.length, 1, "the reset claim is sent through the durable queue");
  assert.equal(puts.length, 1, "debounce state follows the replacement token");
});

test("staff retry is idempotent while the current generation is already queued", async () => {
  const { env, writes, sends } = retryEnv({
    ai_generation: 17,
    status_customer: "draft",
    status: "processing",
    debounce_token: "live-token",
  });
  const result = await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1");
  assert.equal(result.alreadyQueued, true);
  assert.equal(result.job.debounceToken, "live-token");
  assert.equal(writes.length, 0);
  assert.equal(sends.length, 0);
});

test("retry reclaims an expired processing lease instead of reporting dead work as live", async () => {
  const { env, writes, sends } = retryEnv({
    ai_generation: 18,
    status_customer: "draft",
    status: "processing",
    debounce_token: "dead-token",
    lease_dead: 1,
    scheduled_dead: 0,
  });
  const result = await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1");
  assert.equal(result.alreadyQueued, false);
  assert.equal(result.job.generation, 18);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /lease_expires_at < datetime\('now'\)/);
  assert.equal(sends.length, 1);
});

test("retry reclaims a scheduled claim that was never dispatched", async () => {
  const { env, writes, sends } = retryEnv({
    ai_generation: 19,
    status_customer: "draft",
    status: "scheduled",
    debounce_token: "lost-token",
    lease_dead: 0,
    scheduled_dead: 1,
  });
  const result = await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1");
  assert.equal(result.alreadyQueued, false);
  assert.equal(result.job.generation, 19);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /status='scheduled' AND retry_after IS NULL/);
  assert.equal(sends.length, 1);
});

test("terminal AI runs cannot be overwritten by a late completion", async () => {
  let statement = null;
  const env = {
    DB: {
      prepare(sql) {
        statement = sql;
        return {
          bind() {
            return { run: async () => ({ meta: { changes: 0 } }) };
          },
        };
      },
    },
  };
  await completeAiRun(env, "run-cancelled", { status: "completed" });
  assert.match(statement, /status = 'running'/);
});

test("AC-42 signing in schedules no AI job and re-decides no product", async () => {
  // D5: the deterministic matcher serves a signed-out visitor with an indicative
  // price; the AI parser/estimator takes over for signed-in users. There is no
  // automatic re-run on sign-in, and products do not silently change under
  // someone who has already been quoted.
  //
  // Scanned for the CALL, not for the SQL. `enqueueAiExtraction` contains the
  // INSERT and lives in jobs.ts, so a scan for the statement text would pass
  // however many routes imported and called it — the caller's filename never
  // enters the question. What matters is which route can reach the machinery.
  const ENTRY_POINTS = [
    // Anything that can put AI work in the queue…
    "dispatchAiExtractionJob", "enqueueAiExtraction", "retryCurrentAiExtraction",
    // …and anything that can re-decide a product on an existing line, which is
    // the second half of the criterion and was not asserted at all before.
    "runProjectEstimate", "selectWithSplits", "selectForOpening", "matchSchedule",
  ];
  const callers = new Map();
  for (const entry of await readdir(join(projectRoot, "worker/routes"), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const code = (await readFile(join(projectRoot, "worker/routes", entry.name), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    const hits = ENTRY_POINTS.filter((fn) => new RegExp(`[^A-Za-z0-9_]${fn}[ ]*[(]`).test(code));
    if (hits.length) callers.set(entry.name, hits.sort());
  }

  // The identity surface reaches NONE of it. A visitor who signs in gets their
  // draft claimed and nothing re-run: no job queued, no line re-matched, no
  // product re-selected under a quote they have already seen.
  assert.equal(callers.get("auth.ts"), undefined, "the auth route must not schedule or re-decide anything");

  // And the full set of routes that CAN, so a new one is a deliberate change
  // rather than something that arrives unnoticed.
  assert.deepEqual([...callers.keys()].sort(), ["files.ts", "ops.ts", "parse.ts"]);
  // Uploading a file is the one customer-facing trigger (D5/AC-42).
  assert.deepEqual(callers.get("files.ts"), ["dispatchAiExtractionJob"]);
  // The other two are staff-side or a retry of work already scheduled — neither
  // is reached by signing in.
  assert.ok(callers.get("ops.ts").every((fn) => /retry|runProjectEstimate/.test(fn)), callers.get("ops.ts").join());
  assert.ok(callers.get("parse.ts").every((fn) => /retry|matchSchedule/.test(fn)), callers.get("parse.ts").join());
});

test("classifyJobException: a deadline that reached the runner as an exception is the deadline, transient, not a document nobody understood", () => {
  assert.deepEqual(classifyJobException(new Error("ai_processing_deadline_exceeded")), { failureClass: "transient", code: "ai_processing_deadline_exceeded" });
});

test("setDrawingProgress: a milestone's words are bounded - they carry names read off the customer's drawings", async () => {
  const calls = [];
  const fakeEnv = { DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) } };
  await setDrawingProgress(fakeEnv, "proj_1", 3, "tok-abc", 1, 20, "elevation_inventory", "Reading ".padEnd(5_000, "x"));
  assert.equal(MAX_PROGRESS_MESSAGE_CHARS, 200);
  assert.equal(calls[0].args[3].length, MAX_PROGRESS_MESSAGE_CHARS, "the snapshot column");
  assert.equal(JSON.parse(calls[0].args[4]).message.length, MAX_PROGRESS_MESSAGE_CHARS, "the log entry");
});

test("processAiExtractionJob: a pipeline that throws the deadline is recorded as the deadline, transient, and the run it abandons is cancelled", async () => {
  const statements = [];
  const deadline = () => { throw new Error("ai_processing_deadline_exceeded"); };
  const env = {
    DB: {
      prepare: (sql) => ({ bind: (...args) => ({
        sql, args,
        first: async () => {
          if (sql.startsWith("SELECT ai_generation, status_customer FROM project")) return { ai_generation: 4, status_customer: "draft" };
          if (/UPDATE ai_job_claim\s+SET status='processing'/.test(sql)) return { project_id: "proj_1", attempts: 1 };
          return deadline();
        },
        run: async () => {
          statements.push({ sql, args });
          if (sql.startsWith("UPDATE ai_job_claim") || sql.startsWith("INSERT INTO ai_runs")) return { meta: { changes: 1 } };
          return deadline();
        },
        all: async () => deadline(),
      }) }),
      batch: async (bound) => { statements.push(...bound); return bound.map(() => ({ meta: { changes: 1 } })); },
    },
    KV: { get: async () => null, delete: async () => {} },
  };
  const result = await processAiExtractionJob(env, { projectId: "proj_1", generation: 4, debounceToken: "tok" });
  // One automatic attempt is configured, so the deadline is terminal.
  assert.equal(result.state, "failed");
  const transition = statements.find((s) => /UPDATE ai_job_claim\s+SET status=\?, lease_expires_at=NULL/.test(s.sql));
  assert.deepEqual(transition.args.slice(0, 3), ["failed", "ai_processing_deadline_exceeded", "transient"]);
  assert.ok(statements.some((s) => /UPDATE ai_runs SET status='cancelled'/.test(s.sql)), "the abandoned run row is cancelled");
});
