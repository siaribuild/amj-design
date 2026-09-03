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
  completeAiRun,
} = await import(pathToFileURL(outfile).href);

test("aiJobDeadlineMs: drawing parsers receive 600s while non-drawing modes keep the 120s lease", () => {
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "auto_drawings" }), 600_000);
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "agentic_full" }), 600_000);
  assert.equal(aiJobDeadlineMs({ AI_EXTRACTION_MODE: "auto" }), 120_000);
  assert.equal(aiJobDeadlineMs({}), 120_000);
});

test("setDrawingProgress: writes phase + counts guarded by the exact processing token", async () => {
  const calls = [];
  const fakeEnv = { DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) } };
  await setDrawingProgress(fakeEnv, "proj_1", 3, "tok-abc", 7, 20, "opening_read");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /UPDATE ai_job_claim SET drawings_done=\?, drawings_total=\?, drawings_phase=\?/);
  assert.match(calls[0].sql, /WHERE project_id=\? AND source_generation=\? AND status='processing'\s+AND processing_token=\?/);
  assert.deepEqual(calls[0].args, [7, 20, "opening_read", "proj_1", 3, "tok-abc"]);
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
  assert.match(writes[0].sql, /drawings_done=NULL,\s+drawings_total=NULL, drawings_phase=NULL/);
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
