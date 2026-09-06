import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { unstable_readConfig } from "wrangler";
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
        consumeAiJobs,
        sendAiExtractionJob,
        enqueueAiExtraction,
        retryCurrentAiExtraction,
        aiJobDeadlineMs,
        setDrawingProgress,
        MAX_PROGRESS_LOG_BYTES,
        MAX_PROGRESS_MESSAGE_CHARS,
        parseDrawingProgressLog,
        failStalledAiExtraction,
        processAiExtractionJob,
        reapAbandonedAiJobs,
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
  consumeAiJobs,
  sendAiExtractionJob,
  enqueueAiExtraction,
  retryCurrentAiExtraction,
  aiJobDeadlineMs,
  setDrawingProgress,
  MAX_PROGRESS_LOG_BYTES,
  MAX_PROGRESS_MESSAGE_CHARS,
  parseDrawingProgressLog,
  failStalledAiExtraction,
  processAiExtractionJob,
  reapAbandonedAiJobs,
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

test("face_mapped has its own single-consumer queue without serialising existing AI jobs", async () => {
  const config = unstable_readConfig({ config: join(projectRoot, "wrangler.jsonc") }, { hideWarnings: true });
  const producer = (binding) => config.queues.producers.find((item) => item.binding === binding);
  const consumer = (queue) => config.queues.consumers.find((item) => item.queue === queue);

  assert.equal(producer("FACE_MAPPED_AI_JOBS")?.queue, "apertly-face-mapped-ai-jobs");
  assert.equal(consumer("apertly-ai-jobs")?.max_concurrency, undefined,
    "the existing production modes retain the queue's normal autoscaling");
  assert.equal(consumer("apertly-face-mapped-ai-jobs")?.max_concurrency, 1,
    "only the memory-heavy face_mapped engine is serialised");
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
  // shows the live snapshot. (A 480-row plan file emits at most 730 milestones
  // from the engine plus the stage's inventory milestone - the emitter count is
  // pinned in drawing-enrichment.test.mjs; the guard holds several such files.)
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
  assert.doesNotMatch(writes[0].sql, /triggered_by/, "the in-place reset never touches triggered_by");
  assert.equal(sends.length, 1, "the reset claim is sent through the durable queue");
  assert.equal(puts.length, 1, "debounce state follows the replacement token");
});

function enqueueEnv(current) {
  const batches = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return { sql, args, first: async () => current };
          },
        };
      },
      async batch(statements) {
        batches.push(statements);
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    },
    KV: { put: async () => {} },
    AI_JOBS: { send: async () => {} },
  };
  return { env, batches };
}

test("enqueueAiExtraction's INSERT carries triggered_by, defaulting to upload", async () => {
  const { env, batches } = enqueueEnv({ ai_generation: 5 });
  await enqueueAiExtraction(env, { waitUntil() {} }, "project-1");
  const insertStatement = batches[0][1];
  assert.match(insertStatement.sql, /triggered_by/);
  assert.ok(insertStatement.args.includes("upload"));
});

test("retryCurrentAiExtraction threads triggeredBy='ops' only into its fall-through enqueue", async () => {
  const { env, batches } = enqueueEnv({
    ai_generation: 20,
    status_customer: "draft",
    status: "completed",
    debounce_token: null,
    lease_dead: null,
    scheduled_dead: null,
  });
  const result = await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1", "ops");
  assert.equal(result.alreadyQueued, false);
  const insertStatement = batches[0][1];
  assert.match(insertStatement.sql, /triggered_by/);
  assert.ok(insertStatement.args.includes("ops"));
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

test("customer retry refuses a healthy claim inside the jobs layer", async () => {
  const { env, writes, sends } = retryEnv({
    ai_generation: 17,
    status_customer: "draft",
    status: "scheduled",
    debounce_token: "live-token",
    scheduled_dead: 0,
  });
  await assert.rejects(
    retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1", { failedOnly: true }),
    /ai_job_not_retryable/,
  );
  assert.equal(writes.length, 0);
  assert.equal(sends.length, 0);
});

test("the stalled-job watchdog preserves the existing queue timeout outside face_mapped", async () => {
  const calls = [];
  const env = (mode) => ({
    AI_EXTRACTION_MODE: mode,
    DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); return { meta: { changes: 0 } }; } }) }) },
    KV: { delete: async () => {} },
  });
  await failStalledAiExtraction(env("agentic_full"), "ordinary");
  await failStalledAiExtraction(env("face_mapped"), "mapped");
  assert.match(calls[0].sql, /updated_at < datetime\('now','-45 seconds'\)/);
  assert.deepEqual(calls[0].args, ["ordinary", "ordinary", 0]);
  assert.deepEqual(calls[1].args, ["mapped", "mapped", 1], "face_mapped alone may wait behind its single consumer");
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

test("retry reclaims a scheduled claim lost by an existing mode", async () => {
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
  assert.match(writes[0].sql, /updated_at < datetime\('now','-45 seconds'\)/,
    "the autoscaled queue retains its historical age-based reclaim");
  assert.match(writes[0].sql, /last_error='queue_send_failed'/);
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

test("setDrawingProgress: a milestone's words are bounded - they carry names read off the customer's drawings", async () => {
  const calls = [];
  const fakeEnv = { DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) } };
  await setDrawingProgress(fakeEnv, "proj_1", 3, "tok-abc", 1, 20, "elevation_inventory", "Reading ".padEnd(5_000, "x"));
  assert.equal(MAX_PROGRESS_MESSAGE_CHARS, 200);
  assert.equal(calls[0].args[3].length, MAX_PROGRESS_MESSAGE_CHARS, "the snapshot column");
  assert.equal(JSON.parse(calls[0].args[4]).message.length, MAX_PROGRESS_MESSAGE_CHARS, "the log entry");
});

test("processAiExtractionJob: an exception out of the pipeline is recorded transient, and the run it abandons is cancelled", async () => {
  const statements = [];
  const outage = () => { throw new Error("container unreachable"); };
  const env = {
    DB: {
      prepare: (sql) => ({ bind: (...args) => ({
        sql, args,
        first: async () => {
          if (sql.startsWith("SELECT ai_generation, status_customer FROM project")) return { ai_generation: 4, status_customer: "draft" };
          if (/UPDATE ai_job_claim\s+SET status='processing'/.test(sql)) return { project_id: "proj_1", attempts: 1 };
          return outage();
        },
        run: async () => {
          statements.push({ sql, args });
          if (sql.startsWith("UPDATE ai_job_claim") || sql.startsWith("INSERT INTO ai_runs")) return { meta: { changes: 1 } };
          return outage();
        },
        all: async () => outage(),
      }) }),
      batch: async (bound) => { statements.push(...bound); return bound.map(() => ({ meta: { changes: 1 } })); },
    },
    KV: { get: async () => null, delete: async () => {} },
  };
  const result = await processAiExtractionJob(env, { projectId: "proj_1", generation: 4, debounceToken: "tok" });
  // One automatic attempt is configured, so the failure is terminal.
  assert.equal(result.state, "failed");
  const transition = statements.find((s) => /UPDATE ai_job_claim\s+SET status=\?, lease_expires_at=NULL/.test(s.sql));
  assert.deepEqual(transition.args.slice(0, 3), ["failed", "ai_runtime_temporarily_unavailable", "transient"]);
  assert.ok(statements.some((s) => /UPDATE ai_runs SET status='cancelled'/.test(s.sql)), "the abandoned run row is cancelled");
});

test("dispatchAiExtractionJob: face_mapped is isolated and a failed send falls back to schedule-only on the existing queue", async () => {
  const ordinary = [];
  const faceMapped = [];
  const env = {
    AI_EXTRACTION_MODE: "face_mapped",
    KV: { put: async () => {} },
    AI_JOBS: { send: async (...args) => { ordinary.push(args); } },
    FACE_MAPPED_AI_JOBS: { send: async (...args) => { faceMapped.push(args); } },
  };
  const job = { projectId: "p", generation: 1, debounceToken: "t" };
  await dispatchAiExtractionJob(env, { waitUntil() {} }, job);
  assert.deepEqual(faceMapped, [[job, { delaySeconds: 0 }]]);
  assert.deepEqual(ordinary, []);

  env.FACE_MAPPED_AI_JOBS.send = async () => { throw new Error("face queue down"); };
  await dispatchAiExtractionJob(env, { waitUntil() {} }, job);
  assert.equal(ordinary.length, 1);
  assert.deepEqual(ordinary[0][0], { ...job, drawingFallback: "queue_send_failed" },
    "the safe queue carries an explicit diagnostic and cannot run drawing enrichment");

  ordinary.length = 0;
  await dispatchAiExtractionJob({ ...env, AI_EXTRACTION_MODE: "agentic_full" }, { waitUntil() {} }, job);
  assert.deepEqual(ordinary, [[job, { delaySeconds: 0 }]], "existing modes keep their existing queue");
});

test("face_mapped queue fallback distinguishes a rejected send from an unavailable binding", async () => {
  const job = { projectId: "p", generation: 1, debounceToken: "t" };
  const unavailable = await sendAiExtractionJob({ AI_EXTRACTION_MODE: "face_mapped" }, job);
  assert.deepEqual(unavailable, {
    sent: false,
    attempted: false,
    job: { ...job, drawingFallback: "queue_unavailable" },
  });

  const rejected = await sendAiExtractionJob({
    AI_EXTRACTION_MODE: "face_mapped",
    FACE_MAPPED_AI_JOBS: { send: async () => { throw new Error("down"); } },
  }, job);
  assert.deepEqual(rejected, {
    sent: false,
    attempted: true,
    job: { ...job, drawingFallback: "queue_send_failed" },
  });
});

test("dispatchAiExtractionJob: an inline recovery is not exposed as failed before it claims the job", async () => {
  const writes = [];
  let inline;
  const statement = (sql, args = []) => ({
    bind: (...bound) => statement(sql, bound),
    first: async () => null,
    run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; },
  });
  const env = {
    AI_EXTRACTION_MODE: "face_mapped",
    KV: { put: async () => {} },
    FACE_MAPPED_AI_JOBS: { send: async () => { throw new Error("face queue down"); } },
    AI_JOBS: { send: async () => { throw new Error("ordinary queue down"); } },
    DB: { prepare: (sql) => statement(sql) },
  };
  await dispatchAiExtractionJob(env, { waitUntil: (promise) => { inline = promise; } }, {
    projectId: "p", generation: 1, debounceToken: "t",
  });
  await inline;
  assert.equal(writes.some(({ sql }) => /SET last_error=\?, failure_class=\?/.test(sql)), false,
    "the poll must not see queue_send_failed while the inline schedule fallback is starting");
});

test("consumeAiJobs: a duplicate held by a live lease is acknowledged, not retried into the queue", async () => {
  let acked = 0;
  let retried = 0;
  const env = {
    DB: { prepare: (sql) => ({
      bind: () => ({
        first: async () => sql.startsWith("SELECT ai_generation")
          ? { ai_generation: 1, status_customer: "draft" }
          : sql.startsWith("SELECT status")
            ? { status: "processing", attempts: 1, retry_after: null }
            : null,
      }),
    }) },
  };
  await consumeAiJobs({ messages: [{
    body: { projectId: "p", generation: 1, debounceToken: "t" },
    ack: () => { acked += 1; },
    retry: () => { retried += 1; },
  }] }, env);
  assert.equal(acked, 1);
  assert.equal(retried, 0);
});

test("reapAbandonedAiJobs: the claim says what became of a redispatch - sent, it is a healthy scheduled claim again; unsent, it is marked, so nothing looks queued forever", async () => {
  const make = (send) => {
    const writes = [];
    const env = {
      AI_JOBS: { send: async (...args) => { writes.push({ send: args }); return send(...args); } },
      // The reaper's first scan is prepared without a bind: the statement
      // answers bound or not.
      DB: { prepare: (sql) => {
        const statement = (args) => ({
          all: async () => /status='processing' AND lease_expires_at/.test(sql) ? { results: [] } : { results: [{ project_id: "p", source_generation: 3, debounce_token: "t" }] },
          run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; },
          first: async () => null,
        });
        return { ...statement([]), bind: (...args) => statement(args) };
      } },
    };
    return { env, writes };
  };
  // The outcome clears retry_after too - the poll fails a send-failed claim
  // only when none is set, and a re-scheduled lease carries one - and is
  // guarded by the claim's token, so an old cron result cannot overwrite a
  // claim the customer's retry replaced meanwhile.
  const marker = (writes) => writes.filter((w) => /SET last_error=\?, failure_class=\?, retry_after=NULL, updated_at=datetime\('now'\)\s+WHERE project_id=\? AND source_generation=\? AND status='scheduled' AND debounce_token=\?/.test(w.sql)).at(-1);
  const sent = make(async () => {});
  await reapAbandonedAiJobs(sent.env);
  assert.deepEqual(marker(sent.writes)?.args, [null, null, "p", 3, "t"], "a sent redispatch clears a marker a failed first send left, so the poll does not fail healthy work");
  assert.ok(sent.writes.indexOf(marker(sent.writes)) < sent.writes.findIndex((entry) => entry.send),
    "the marker is cleared before publish, so a status poll cannot fail a message already accepted by the queue");
  const unsent = make(async () => { throw new Error("queue down"); });
  await reapAbandonedAiJobs(unsent.env);
  assert.deepEqual(marker(unsent.writes)?.args, ["queue_send_failed", "transient", "p", 3, "t"], "a redispatch that failed to send is marked for the poll and the retry");
});

// --- Criterion 11 and the ops "Try again" button ------------------------------
// Criterion 11 excludes an ops-triggered BUILDING-MODEL run (the `ai_runs`
// subsystem) from the parse counts. It does not speak to the ops retry of a
// customer's own document, and the two must not be conflated:
//
// The reclaim branch updates the claim IN PLACE, same generation. That row is
// the only record the counts have of the customer's document. Tagging it 'ops'
// would delete a real customer parse from both cards - a document that failed,
// was retried by staff and then succeeded would appear nowhere at all, which is
// the opposite of the visibility this feature exists to give. The fall-through
// enqueue, which starts a genuinely NEW generation from ops, is tagged 'ops'
// and correctly excluded.
test("an ops retry reclaims in place and leaves the claim's origin alone", async () => {
  const { env, writes } = retryEnv({
    ai_generation: 21,
    status_customer: "draft",
    status: "failed",
    debounce_token: "old-token",
  });
  await retryCurrentAiExtraction(env, { waitUntil() {} }, "project-1", "ops");
  assert.equal(writes.length, 1);
  assert.doesNotMatch(
    writes[0].sql,
    /triggered_by/,
    "the customer's parse keeps its origin, or staff pressing retry erases it from the counts",
  );
});
