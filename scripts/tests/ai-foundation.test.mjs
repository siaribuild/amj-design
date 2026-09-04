// LLM building-modelling foundation tests (strategy §8.2, §13, §17.3, §22.3).
// Pure/fake-bound: no CMS, no real D1/R2, no model calls. Proves the Phase 0
// contracts: taxonomy reconciliation, escalation policy (SHADOW by default —
// never a paid Pro call unless explicitly enabled), §13.4 determinism settings,
// the single §22.3 repair pass, and the §6.1-corrected idempotency hash.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ai-foundation");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export * as schema from ${p("worker/lib/ai/schema.ts")};
      export { evaluateEscalation, LOW_CONFIDENCE_THRESHOLD } from ${p("worker/lib/ai/escalation.ts")};
      export { stageHashPayload, stageInputHash, stageRawKey, runStage } from ${p("worker/lib/ai/stage.ts")};
      export { runSkill, toVendorSchema, readModelText, readModelUsage, classifyProviderFailure } from ${p("worker/lib/estimator/skills/runner.ts")};
      export { DEFAULT_PRIMARY_MODEL, DEFAULT_ESCALATION_MODEL, EXTRACTION_TEMPERATURE, PIPELINE_VERSION } from ${p("worker/lib/ai/versions.ts")};
      export { FEEDBACK_CATEGORIES } from ${p("worker/lib/estimator/persist.ts")};
      export { energyReportExtractor } from ${p("worker/lib/estimator/skills/energy.ts")};
      export { parseModelJson } from ${p("worker/lib/estimator/skills/json.ts")};
      export { outcomeQualityState } from ${p("worker/lib/ai/outcomes.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  schema, evaluateEscalation, LOW_CONFIDENCE_THRESHOLD, stageHashPayload, stageInputHash, stageRawKey, runStage,
  runSkill, toVendorSchema, readModelText, readModelUsage, classifyProviderFailure, DEFAULT_PRIMARY_MODEL, DEFAULT_ESCALATION_MODEL, EXTRACTION_TEMPERATURE, FEEDBACK_CATEGORIES,
  energyReportExtractor, parseModelJson, outcomeQualityState,
} = await import(pathToFileURL(outfile).href);

// ── Test doubles ─────────────────────────────────────────────────────────────
// A minimal skill: valid output is {"value": <number>}.
const testSkill = {
  id: "test_skill",
  promptVersion: "v1",
  responseSchema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] },
  buildPrompt: (i) => `TASK:${JSON.stringify(i)}`,
  validate: (raw) => {
    try {
      const v = typeof raw === "string" ? JSON.parse(raw) : raw;
      return v && typeof v.value === "number" ? { value: v.value } : null;
    } catch { return null; }
  },
};
const good = (value) => ({ response: JSON.stringify({ value }), usage: { prompt_tokens: 10, completion_tokens: 5 } });
const bad = () => ({ response: "not json at all", usage: { prompt_tokens: 10, completion_tokens: 5 } });

// Fake Env: scripted AI responses; a D1 stub that records writes and can serve a
// stage-cache hit; an in-memory R2.
function fakeEnv({ responses = [], stageHit = null, vars = {} } = {}) {
  const aiCalls = [], dbWrites = [], r2 = new Map();
  const env = {
    ...vars,
    AI: {
      run: async (model, params, opts) => {
        aiCalls.push({ model, params, opts });
        const r = responses.shift();
        if (r instanceof Error) throw r;
        return r ?? good(0);
      },
    },
    AI_GATEWAY_ID: "gw-test",
    DB: {
      prepare: (sql) => ({ bind: (...args) => ({
        first: async () => {
          if (/INSERT INTO ai_stage_runs/.test(sql)) {
            dbWrites.push({ sql, args });
            return { id: args[0] };
          }
          return sql.includes("FROM ai_stage_runs") ? stageHit : null;
        },
        run: async () => { dbWrites.push({ sql, args }); return {}; },
        all: async () => ({ results: [] }),
      }) }),
    },
    FILES: {
      get: async (k) => (r2.has(k) ? { text: async () => r2.get(k) } : null),
      put: async (k, v) => { r2.set(k, v); },
    },
  };
  return { env, aiCalls, dbWrites, r2 };
}

// ── §17.3 taxonomy reconciliation ────────────────────────────────────────────
test("override taxonomy: all 18 §17.3 codes present, each mapped to a valid learning layer", () => {
  assert.equal(schema.OVERRIDE_REASON_CODES.length, 18);
  for (const code of schema.OVERRIDE_REASON_CODES) {
    const layer = schema.OVERRIDE_REASONS[code].layer;
    assert.ok(FEEDBACK_CATEGORIES.includes(layer), `${code} → ${layer} must be a delivered feedback category`);
  }
  assert.ok(schema.isOverrideReason("WRONG_DIMENSION"));
  assert.ok(!schema.isOverrideReason("MADE_UP_CODE"));
});

test("a line without an AI proposal is finalized as non-learnable", () => {
  assert.equal(outcomeQualityState("no_ai_proposal", false), "rejected");
  assert.equal(outcomeQualityState("adjusted", false), "pending");
  assert.equal(outcomeQualityState("accepted", true), "approved");
});

test("taxonomy: only preference/commercial codes may train the ranker; thermal training excludes commercial preference (§17.5)", () => {
  assert.deepEqual(
    [...schema.RANKER_TRAINABLE_REASONS].sort(),
    ["COLOUR_OR_HARDWARE_PREFERENCE", "CUSTOMER_PREFERENCE", "PRICE_OPTIMIZATION"].sort(),
  );
  for (const code of schema.OVERRIDE_REASON_CODES) {
    const r = schema.OVERRIDE_REASONS[code];
    assert.ok(!(r.ranker && r.thermal), `${code}: a code cannot train both ranker and thermal`);
    if (r.thermal) assert.ok(code.startsWith("THERMAL_") || code.startsWith("SHGC_"), `${code}: thermal training only from thermal-target corrections`);
  }
});

test("observation origins: the §8.2 nine-class vocabulary", () => {
  assert.equal(schema.OBSERVATION_ORIGINS.length, 9);
  assert.ok(schema.isObservationOrigin("model_inferred"));
  assert.ok(!schema.isObservationOrigin("guessed"));
});

// ── BuildingModelV1 shape guard ──────────────────────────────────────────────
test("validateBuildingModelShape: accepts a minimal valid model, rejects broken openings", () => {
  const base = {
    schemaVersion: "building-model/1.0", projectId: "prj_1", inputMode: "schedule_only",
    jurisdiction: {}, rooms: [], assumptions: [], conflicts: [],
    openings: [{ externalRef: "W01", elementType: "window", evidence: [] }],
  };
  assert.ok(schema.validateBuildingModelShape(base));
  assert.ok(!schema.validateBuildingModelShape({ ...base, inputMode: "telepathy" }), "unknown input mode rejected");
  assert.ok(!schema.validateBuildingModelShape({ ...base, openings: [{ elementType: "window", evidence: [] }] }), "opening without externalRef rejected");
  assert.ok(!schema.validateBuildingModelShape({ ...base, openings: [{ externalRef: "W01", elementType: "wall", evidence: [] }] }), "bad elementType rejected");
  assert.ok(!schema.validateBuildingModelShape(null));
});

// ── Escalation policy (pure) ─────────────────────────────────────────────────
test("escalation: no signals ⇒ never triggered", () => {
  assert.deepEqual(evaluateEscalation({}), { triggered: false, reasons: [] });
});

test("escalation: each §13.2 signal maps to its trigger code", () => {
  assert.deepEqual(evaluateEscalation({ schemaFailedAfterRepair: true }).reasons, ["schema_validation_failed_after_repair"]);
  assert.deepEqual(evaluateEscalation({ revisionConflicts: 2 }).reasons, ["conflicting_document_revisions"]);
  assert.deepEqual(evaluateEscalation({ orientationUnknown: true }).reasons, ["orientation_unknown"]);
  const multi = evaluateEscalation({ dimensionMismatches: 1, uncertainFrameDecompositions: 1 });
  assert.deepEqual(multi.reasons.sort(), ["dimension_mismatch", "frame_decomposition_uncertain"].sort());
});

test("escalation: critical-confidence threshold is a strict boundary", () => {
  assert.ok(evaluateEscalation({ criticalConfidence: { dimensions: LOW_CONFIDENCE_THRESHOLD - 0.01 } }).triggered);
  assert.ok(!evaluateEscalation({ criticalConfidence: { dimensions: LOW_CONFIDENCE_THRESHOLD } }).triggered);
});

// ── §6.1-corrected idempotency hash ──────────────────────────────────────────
test("stageInputHash: stable for identical parts; changes with prompt, model, pipeline or payload", async () => {
  const base = { pipelineVersion: "p1", stage: "s", promptVersion: "v1", model: "m1", payload: { a: 1 } };
  const h = await stageInputHash(base);
  assert.equal(await stageInputHash({ ...base }), h, "deterministic");
  for (const [k, v] of [["promptVersion", "v2"], ["model", "m2"], ["pipelineVersion", "p2"], ["payload", { a: 2 }], ["stage", "s2"]]) {
    assert.notEqual(await stageInputHash({ ...base, [k]: v }), h, `${k} change must re-run the stage`);
  }
});

test("stageInputHash: hashes inline images without retaining their base64 in the JSON payload", async () => {
  const first = { imageDataUrls: [{ renderId: "r1", dataUrl: "data:image/png;base64,QUFBQUFB" }], note: "kept" };
  const second = { imageDataUrls: [{ renderId: "r1", dataUrl: "data:image/png;base64,QkJCQkJC" }], note: "kept" };
  const compact = await stageHashPayload(first);
  assert.doesNotMatch(JSON.stringify(compact), /QUFBQUFB/);
  assert.match(JSON.stringify(compact), /sha256/);
  const parts = { pipelineVersion: "p1", stage: "vision", promptVersion: "v1", model: "m1" };
  assert.notEqual(
    await stageInputHash({ ...parts, payload: first }),
    await stageInputHash({ ...parts, payload: second }),
    "different image bytes must retain different cache identities",
  );
});

test("stageRawKey: §7.1 layout, traversal-safe", () => {
  assert.equal(
    stageRawKey("prj_1", "run_1", "schedule_parser", "abc123"),
    "projects/prj_1/runs/run_1/raw/schedule_parser-abc123.json",
  );
  assert.notEqual(
    stageRawKey("prj_1", "run_1", "schedule_parser", "doc-a"),
    stageRawKey("prj_1", "run_1", "schedule_parser", "doc-b"),
    "same-stage multi-document results cannot overwrite each other",
  );
  assert.ok(!stageRawKey("../../etc", "run/../x", "s", "../hash").includes(".."), "no traversal segments survive");
});

// ── Skill runner: single-model policy + §13.4 determinism + §22.3 repair ─────
test("runner: uses the env-resolved primary model with determinism settings and the gateway", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [good(42)] });
  const run = await runSkill(env, testSkill, { doc: "x" });
  assert.ok(run.ok);
  assert.deepEqual(run.data, { value: 42 });
  assert.equal(aiCalls.length, 1);
  assert.equal(aiCalls[0].model, DEFAULT_PRIMARY_MODEL, "defaults to Gemini 3.6 Flash");
  // Google-native shape: generationConfig, not top-level OpenAI params. Sending
  // the OpenAI shape is what produced HTTP 400 / gateway 7003 on every call.
  assert.equal(aiCalls[0].params.generationConfig.temperature, EXTRACTION_TEMPERATURE, "§13.4 near-zero temperature");
  assert.equal(aiCalls[0].params.response_format, undefined, "no OpenAI response_format on a Google model");
  assert.equal(aiCalls[0].params.messages, undefined, "no OpenAI messages[] on a Google model");
  assert.equal(aiCalls[0].params.contents[0].role, "user");
  assert.equal(typeof aiCalls[0].params.contents[0].parts[0].text, "string");
  assert.deepEqual(aiCalls[0].opts, { gateway: { id: "gw-test", collectLog: false } }, "routed through the gateway with payload logging enforced OFF (§21.1)");
  assert.equal(run.promptVersion, "v1");
  assert.equal(run.repaired, false);
});

test("runner: AI_PRIMARY_MODEL overrides the default without a code change", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [good(1)], vars: { AI_PRIMARY_MODEL: "google/gemini-9.9-test" } });
  await runSkill(env, testSkill, {});
  assert.equal(aiCalls[0].model, "google/gemini-9.9-test");
});

test("runner: schema failure triggers exactly ONE repair pass, which can rescue the run", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [bad(), good(7)] });
  const run = await runSkill(env, testSkill, {});
  assert.ok(run.ok);
  assert.deepEqual(run.data, { value: 7 });
  assert.equal(run.repaired, true);
  assert.ok(run.warnings.includes("skill_output_repaired"));
  assert.equal(aiCalls.length, 2, "one primary + one repair, never more");
  assert.equal(aiCalls[1].params.contents.length, 1, "repair does not resend the source document or multimodal payload");
  assert.match(aiCalls[1].params.contents[0].parts[0].text, /repair the following model response/i);
  assert.doesNotMatch(aiCalls[1].params.contents[0].parts[0].text, /TASK:\{\}/,
    "only the rejected answer and schema are needed for structural repair");
});

test("runner: repair is bounded — two invalid responses ⇒ fail soft, no third call", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [bad(), bad()] });
  const run = await runSkill(env, testSkill, {});
  assert.ok(!run.ok);
  assert.equal(run.data, null);
  assert.ok(run.warnings.includes("skill_output_invalid"));
  assert.equal(aiCalls.length, 2, "repair happens once — never an unbounded loop");
});

test("runner: transport failure fails soft (degradation, not an exception)", async () => {
  const { env } = fakeEnv({ responses: [new Error("402 insufficient credits")] });
  const run = await runSkill(env, testSkill, {});
  assert.ok(!run.ok);
  assert.ok(run.warnings.includes("skill_call_failed"));
  assert.equal(run.failureKind, "permanent_request");
});

test("runner: provider failures emit a capped structured ops log", async () => {
  const entries = [];
  const original = console.error;
  console.error = (entry) => entries.push(entry);
  try {
    const { env } = fakeEnv({ responses: [new Error(`2021: Invalid User Credentials ${"x".repeat(300)}`)] });
    await runSkill(env, testSkill, {}, { telemetry: { aiRunId: "run-1", projectId: "project-1" } });
  } finally {
    console.error = original;
  }

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    event: "ai_model_call_error",
    aiRunId: "run-1",
    projectId: "project-1",
    skill: "test_skill",
    model: DEFAULT_PRIMARY_MODEL,
    failureKind: "transient_provider",
    error: entries[0].error,
  });
  assert.match(entries[0].error, /^Error: 2021: Invalid User Credentials/);
  assert.equal(entries[0].error.length, 200);
});

test("runner: provider errors retain retry semantics", () => {
  assert.equal(classifyProviderFailure(new Error("HTTP 429 RESOURCE_EXHAUSTED")), "transient_rate_limit");
  assert.equal(classifyProviderFailure(new Error("503 service unavailable")), "transient_provider");
  assert.equal(classifyProviderFailure(new Error("7003 User Input Error (400)")), "permanent_request");
});

test("runner: rate limits emit the structured warning consumed by job retry policy", async () => {
  const { env } = fakeEnv({ responses: [new Error("HTTP 429 RESOURCE_EXHAUSTED")] });
  const run = await runSkill(env, testSkill, {});
  assert.equal(run.failureKind, "transient_rate_limit");
  assert.ok(run.warnings.includes("skill_call_rate_limited"));
});

test("energy skill: carries a prompt version and no hardcoded model (single-model policy)", () => {
  assert.ok(energyReportExtractor.promptVersion, "promptVersion required for idempotency");
  assert.equal(energyReportExtractor.model, undefined, "model selection belongs to the runner/env");
});

// ── Stage runner: SHADOW escalation is the load-bearing owner decision ───────
test("stage: escalation trigger in shadow mode is RECORDED but the Pro model is never called", async () => {
  const { env, aiCalls, dbWrites } = fakeEnv({ responses: [good(3)] });
  const res = await runStage(env, {
    aiRunId: "run1", projectId: "prj1", skill: testSkill, input: { d: 1 },
    signals: () => ({ orientationUnknown: true }),
  });
  assert.ok(res.ok);
  assert.equal(res.escalation.triggered, true);
  assert.deepEqual(res.escalation.reasons, ["orientation_unknown"]);
  assert.equal(res.escalation.taken, false, "SHADOW: decision logged, model NOT called");
  assert.equal(aiCalls.length, 1, "only the primary model ran");
  assert.equal(aiCalls[0].model, DEFAULT_PRIMARY_MODEL);
  const stageWrite = dbWrites.find((w) => /UPDATE ai_stage_runs/.test(w.sql));
  assert.ok(stageWrite, "stage record persisted");
  assert.equal(stageWrite.args[5], 1, "escalation_triggered=1");
  assert.equal(stageWrite.args[7], 0, "escalation_taken=0");
});

test("stage: with AI_ESCALATION_MODE='on' the escalation model actually runs and is recorded as taken", async () => {
  const { env, aiCalls, dbWrites } = fakeEnv({
    responses: [good(3), good(9)],
    vars: { AI_ESCALATION_MODE: "on" },
  });
  const res = await runStage(env, {
    aiRunId: "run1", projectId: "prj1", skill: testSkill, input: { d: 1 },
    signals: () => ({ envelopeGaps: true }),
  });
  assert.ok(res.ok);
  assert.equal(res.escalation.taken, true);
  assert.deepEqual(res.data, { value: 9 }, "escalated result adopted");
  assert.equal(aiCalls.length, 2);
  assert.equal(aiCalls[1].model, DEFAULT_ESCALATION_MODEL, "second call goes to Gemini 3.1 Pro");
  const stageWrite = dbWrites.find((w) => /UPDATE ai_stage_runs/.test(w.sql));
  assert.equal(stageWrite.args[7], 1, "escalation_taken=1");
});

test("stage: no trigger ⇒ no escalation even when enabled", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [good(5)], vars: { AI_ESCALATION_MODE: "on" } });
  const res = await runStage(env, { aiRunId: "r", projectId: "p", skill: testSkill, input: {} });
  assert.ok(res.ok && !res.escalation.triggered && !res.escalation.taken);
  assert.equal(aiCalls.length, 1);
});

test("stage: idempotent replay from R2 archive makes ZERO model calls and re-validates content", async () => {
  const { env, aiCalls, r2 } = fakeEnv({
    responses: [],
    stageHit: { id: "prev-stage", result_r2_key: "projects/prj1/runs/run0/raw/test_skill.json" },
    vars: { AI_STAGE_CACHE: "on" },
  });
  r2.set("projects/prj1/runs/run0/raw/test_skill.json", JSON.stringify({ value: 11 }));
  const res = await runStage(env, { aiRunId: "run1", projectId: "prj1", skill: testSkill, input: { d: 1 } });
  assert.ok(res.ok);
  assert.equal(res.cached, true);
  assert.deepEqual(res.data, { value: 11 });
  assert.equal(aiCalls.length, 0, "no spend on an unchanged input");
});

test("stage: replay is OFF by default — a re-parse tests extraction, not the archive", async () => {
  // Owner rule, 2026-08-06. A replay is invisible in the product: the run
  // completes in milliseconds reporting the previous answer, so "did extraction
  // improve?" is answered by the run that predates the change. Clearing the
  // project does not help either — the archive is keyed on document content,
  // prompt version, model and pipeline version, so re-uploading identical bytes
  // hits the same entry. Accurate testing outranks saved spend until extraction
  // settles; AI_STAGE_CACHE='on' restores it.
  const { env, aiCalls, r2 } = fakeEnv({
    responses: [good(7)],
    stageHit: { id: "prev-stage", result_r2_key: "projects/prj1/runs/run0/raw/test_skill.json" },
  });
  r2.set("projects/prj1/runs/run0/raw/test_skill.json", JSON.stringify({ value: 11 }));
  const res = await runStage(env, { aiRunId: "run1", projectId: "prj1", skill: testSkill, input: { d: 1 } });
  assert.ok(res.ok);
  assert.equal(res.cached, false, "a perfectly good archive is ignored");
  assert.deepEqual(res.data, { value: 7 }, "the model answered, not the archive");
  assert.equal(aiCalls.length, 1, "the whole point: the provider is actually called");
  assert.deepEqual(res.warnings, [], "and nothing claims a replay happened");
});

test("stage: corrupt R2 archive falls through to a fresh model run (storage is not a trust boundary)", async () => {
  const { env, aiCalls, r2 } = fakeEnv({
    responses: [good(4)],
    stageHit: { id: "prev-stage", result_r2_key: "projects/prj1/runs/run0/raw/test_skill.json" },
    vars: { AI_STAGE_CACHE: "on" },
  });
  r2.set("projects/prj1/runs/run0/raw/test_skill.json", "corrupted ]]] payload");
  const res = await runStage(env, { aiRunId: "run1", projectId: "prj1", skill: testSkill, input: { d: 1 } });
  assert.ok(res.ok);
  assert.equal(res.cached, false, "invalid archive is never trusted");
  assert.deepEqual(res.data, { value: 4 });
  assert.equal(aiCalls.length, 1);
});

test("stage: failed skill call persists a 'failed' stage record and fails soft", async () => {
  const { env, dbWrites } = fakeEnv({ responses: [new Error("boom"), new Error("boom")] });
  const res = await runStage(env, { aiRunId: "r", projectId: "p", skill: testSkill, input: {} });
  assert.ok(!res.ok);
  assert.equal(res.data, null);
  const started = dbWrites.find((w) => /INSERT INTO ai_stage_runs/.test(w.sql));
  const stageWrite = dbWrites.find((w) => /UPDATE ai_stage_runs/.test(w.sql));
  assert.ok(started, "the running stage is visible before the provider returns");
  assert.equal(stageWrite.args[2], "failed");
});

test("stage: a same-input retry updates the unique stage row with diagnostics and zero token counts", async () => {
  const { env, dbWrites } = fakeEnv({ responses: [new Error("HTTP 503 upstream unavailable")] });
  const res = await runStage(env, { aiRunId: "r", projectId: "p", skill: testSkill, input: {} });

  assert.equal(res.failureKind, "transient_provider");
  const started = dbWrites.find((w) => /INSERT INTO ai_stage_runs/.test(w.sql));
  assert.match(started.sql, /ON CONFLICT\s*\(ai_run_id,\s*stage,\s*input_hash\)\s*DO UPDATE/i);
  const completed = dbWrites.find((w) => /UPDATE ai_stage_runs/.test(w.sql));
  assert.match(completed.sql, /WHERE ai_run_id=\? AND stage=\? AND input_hash=\?/i);
  assert.equal(completed.args[8], 0, "a provider failure before usage reports a known zero, not NULL");
  assert.equal(completed.args[9], 0);
  assert.deepEqual(JSON.parse(completed.args[10]), {
    failureKind: "transient_provider",
    warnings: res.warnings,
  });
});

// ── Vendor schema shape (§13.4) ──────────────────────────────────────────────
// Google's structured output is an OpenAPI 3.0 subset: one `type` plus
// `nullable`. The JSON-Schema union `type: ["string","null"]` — which every
// skill uses for optional fields — is rejected with HTTP 400 at the provider,
// before any tokens are spent. That is what "skill_call_failed" was hiding.
test("toVendorSchema: nullable unions become OpenAPI 3.0 nullable", () => {
  assert.deepEqual(toVendorSchema({ type: ["string", "null"] }), { type: "string", nullable: true });
  assert.deepEqual(toVendorSchema({ type: ["number", "null"] }), { type: "number", nullable: true });
  assert.deepEqual(toVendorSchema({ type: "string" }), { type: "string" }, "a plain type is untouched");
});

test("toVendorSchema: recurses through properties, items and nesting", () => {
  const out = toVendorSchema({
    type: "object",
    properties: {
      jurisdiction: { type: "object", properties: { state: { type: ["string", "null"] } } },
      rooms: { type: "array", items: { type: "object", properties: { areaM2: { type: ["number", "null"] } } } },
    },
    required: ["rooms"],
  });
  assert.deepEqual(out.properties.jurisdiction.properties.state, { type: "string", nullable: true });
  assert.deepEqual(out.properties.rooms.items.properties.areaM2, { type: "number", nullable: true });
  assert.deepEqual(out.required, ["rooms"], "non-schema keys survive untouched");
});

test("toVendorSchema: a union of two REAL types is left alone, never guessed", () => {
  // No OpenAPI 3.0 equivalent exists. Silently picking one would change what the
  // model is asked for; failing loudly at the provider is the honest outcome.
  assert.deepEqual(toVendorSchema({ type: ["string", "number"] }), { type: ["string", "number"] });
});

test("CONTRACT: no shipped skill schema reaches the provider with a union type", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { projectRoot } = await import("./helpers.mjs");
  const dir = join(projectRoot, "worker/lib/estimator/skills");
  const skills = readdirSync(dir).filter((f) => f.endsWith(".ts") && !["types.ts", "runner.ts"].includes(f));
  assert.ok(skills.length >= 3, "sanity: the skill directory should not be empty");
  // The skills are ALLOWED to be written in plain JSON Schema — that is what
  // their validators speak. The guarantee is that the runner normalises them,
  // so assert the normaliser handles the exact construct they use.
  for (const file of skills) {
    const src = readFileSync(join(dir, file), "utf8");
    for (const [, types] of src.matchAll(/type:\s*(\[[^\]]*\])/g)) {
      const parsed = JSON.parse(types.replace(/'/g, '"'));
      if (!parsed.includes("null")) continue;
      const norm = toVendorSchema({ type: parsed });
      assert.equal(Array.isArray(norm.type), false, `${file}: ${types} must not reach the provider as a union`);
      assert.equal(norm.nullable, true, `${file}: ${types} must become nullable`);
    }
  }
});

// ── Provider response shapes ─────────────────────────────────────────────────
// Google returns candidates[0].content.parts[].text and usageMetadata; the
// OpenAI-ish providers return response + usage. Reading only the latter meant a
// successful Google call would still have looked empty.
test("readModelText: reads Google candidates, falls back to the OpenAI shape", () => {
  assert.equal(
    readModelText({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: "1}" }] } }] }),
    '{"a":1}',
    "multi-part text is joined, not truncated to the first part",
  );
  assert.equal(readModelText({ response: "plain" }), "plain");
  assert.equal(
    readModelText({ choices: [{ message: { content: '{"a":2}' } }] }),
    '{"a":2}',
    "Cloudflare OpenAI-compatible responses expose generated text through choices",
  );
  // No candidates falls through to the generic branch: a string, never a
  // throw. validate() then rejects it and the repair pass runs, which is the
  // designed path for an unusable response.
  assert.equal(typeof readModelText({ candidates: [] }), "string");
});

test("readModelUsage: Google usageMetadata and OpenAI usage both counted", () => {
  assert.deepEqual(
    readModelUsage({ usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 4 } }),
    { input: 11, output: 4 },
  );
  assert.deepEqual(readModelUsage({ usage: { prompt_tokens: 3, completion_tokens: 2 } }), { input: 3, output: 2 });
  assert.deepEqual(readModelUsage({}), { input: 0, output: 0 }, "absent usage is zero, never NaN");
});

test("runner: a multimodal skill sends Google inlineData, not image_url", async () => {
  const imageSkill = {
    id: "image-probe", promptVersion: "v1",
    responseSchema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] },
    buildPrompt: () => "text only",
    buildContent: () => ([
      { type: "text", text: "look at this" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAB" } },
    ]),
    validate: (raw) => { try { const v = JSON.parse(raw); return typeof v?.value === "number" ? v : null; } catch { return null; } },
  };
  const { env, aiCalls } = fakeEnv({ responses: [good(1)] });
  await runSkill(env, imageSkill, {});
  const parts = aiCalls[0].params.contents[0].parts;
  assert.deepEqual(parts[0], { text: "look at this" });
  assert.deepEqual(parts[1], { inlineData: { mimeType: "image/png", data: "AAAB" } },
    "a data: URL becomes inlineData — image_url has no Google equivalent");
});

// ── Model output parsing ─────────────────────────────────────────────────────
// Three copies of a bare JSON.parse discarded correct answers wrapped in a
// markdown fence — which is exactly what a model returns when the request
// cannot enforce a JSON mime type. Two paid calls per run, both binned.
test("parseModelJson: plain JSON, fenced JSON, and prose-wrapped JSON all parse", () => {
  assert.deepEqual(parseModelJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('```\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Sure — here you go:\n{"a":1}\nHope that helps.'), { a: 1 });
  assert.deepEqual(parseModelJson('[{"a":1}]'), [{ a: 1 }]);
});

test("parseModelJson: braces INSIDE strings do not end the object", () => {
  assert.deepEqual(parseModelJson('prose {"note":"a } brace","ok":true} tail'), { note: "a } brace", ok: true });
  assert.deepEqual(parseModelJson('{"esc":"quote \\" and } brace"}'), { esc: 'quote " and } brace' });
});

test("parseModelJson: refuses what is genuinely not JSON", () => {
  assert.equal(parseModelJson("I cannot help with that."), null);
  assert.equal(parseModelJson(""), null);
  assert.equal(parseModelJson('{"truncated": [1,2'), null, "a cut-off response is not silently half-read");
});

test("runner: a REJECTED response is carried out for archiving, an accepted one is not", async () => {
  const fenced = { response: '```json\n{"value":5}\n```', usage: { prompt_tokens: 1, completion_tokens: 1 } };
  const { env: env1 } = fakeEnv({ responses: [fenced] });
  const okRun = await runSkill(env1, testSkill, {});
  assert.ok(okRun.ok, "the test skill's own validator still governs the fields");
  assert.equal(okRun.rejectedRaw, undefined, "nothing to archive when it parsed");

  const { env: env2 } = fakeEnv({ responses: [bad(), bad()] });
  const failRun = await runSkill(env2, testSkill, {});
  assert.equal(failRun.ok, false);
  assert.equal(failRun.rejectedRaw, "not json at all", "the text survives for diagnosis");
});

// ── Schema instruction ───────────────────────────────────────────────────────
// No schema parameter is accepted by this provider, so the contract has to be in
// the prompt. Without it the model answered a plan-context request with
// {project, areasSqm, openings[{reference, room, orientation}]} — its own
// invention — while the validator required {rooms[], openings[{ref, roomId}]}.
test("runner: the response schema is appended to a text prompt", async () => {
  const { env, aiCalls } = fakeEnv({ responses: [good(1)] });
  await runSkill(env, testSkill, {});
  const sent = aiCalls[0].params.contents[0].parts.map((p) => p.text ?? "").join("\n");
  assert.match(sent, /JSON Schema/i, "the model is told the shape it must return");
  assert.ok(sent.includes(JSON.stringify(testSkill.responseSchema)), "the actual schema travels, not a paraphrase");
});

test("runner: a multimodal prompt gets the schema as a trailing TEXT part", async () => {
  const imageSkill = {
    id: "img", promptVersion: "v1",
    responseSchema: { type: "object", properties: { value: { type: "number" } }, required: ["value"] },
    buildPrompt: () => "text",
    buildContent: () => ([{ type: "image_url", image_url: { url: "data:image/png;base64,AAAB" } }]),
    validate: (raw) => { try { const v = JSON.parse(raw); return typeof v?.value === "number" ? v : null; } catch { return null; } },
  };
  const { env, aiCalls } = fakeEnv({ responses: [good(1)] });
  await runSkill(env, imageSkill, {});
  const parts = aiCalls[0].params.contents[0].parts;
  assert.ok(parts[0].inlineData, "the image is still first");
  assert.match(parts.at(-1).text, /JSON Schema/i, "the schema does not displace the image");
});
