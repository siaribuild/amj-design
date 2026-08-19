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
  completeAiRun,
} = await import(pathToFileURL(outfile).href);

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

test("AC-42 the two engines stay exclusive — signing in schedules no AI job", async () => {
  // D5: the deterministic matcher serves a signed-out visitor with an indicative
  // price; the AI parser/estimator takes over for signed-in users. There is no
  // automatic re-run on sign-in, and products do not silently change under
  // someone who has already been quoted.
  //
  // A source scan, because the failure it guards is a NEW scheduling call site —
  // an auth route, a claim-merge, a "welcome back" refresh — any of which would
  // quietly re-price a visitor's lines the moment they created an account.
  const schedulers = [];
  const walk = async (dir) => {
    for (const entry of await readdir(join(projectRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { await walk(rel); continue; }
      if (!/\.ts$/.test(entry.name)) continue;
      const code = (await readFile(join(projectRoot, rel), "utf8"))
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
      if (/INSERT INTO ai_job_claim/i.test(code)) schedulers.push(rel);
    }
  };
  await walk("worker");

  // Exactly two homes: the upload-finalise path, and the retry/dispatch machinery
  // that re-runs work already scheduled. No auth or session route among them.
  assert.deepEqual(schedulers.sort(), ["worker/lib/ai/jobs.ts", "worker/routes/files.ts"]);
  for (const rel of schedulers) {
    assert.ok(!/auth|session|login|claim-merge/i.test(rel), `${rel} must not schedule AI work`);
  }
});
