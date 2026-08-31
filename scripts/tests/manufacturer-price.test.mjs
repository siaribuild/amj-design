// Pure arithmetic for the manufacturer's-price uplift path. See CONTEXT.md and
// docs/runs/manufacturer-price-uplift/02-design.md — panel preview and Worker
// commit share these two functions so the two figures cannot diverge.
//
// THE NUMBERS ARE THE SPEC'S OWN, verified against the approved mock: 1,240 at
// 30% is 1,612.00; at 22% it is 1,512.80; declared inc-GST it is 1,127.27 ex
// before any uplift.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("manufacturer-price");
const outfile = join(runDir, "manufacturer-price-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/data/manufacturerPrice.ts")};`,
    resolveDir: projectRoot,
    sourcefile: "manufacturer-price-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { DEFAULT_UPLIFT_PCT, manufacturerExGst, upliftedLineTotal } =
  await import(pathToFileURL(outfile).href);

test("DEFAULT_UPLIFT_PCT is 30", () => {
  assert.equal(DEFAULT_UPLIFT_PCT, 30);
});

test("an ex-GST figure is taken as typed", () => {
  assert.equal(manufacturerExGst(1240, "ex"), 1240);
});

test("an inc-GST figure is divided by 1.1 and rounded to cents BEFORE any uplift", () => {
  // The spec's worked example: 1240 / 1.1 = 1127.2727…
  assert.equal(manufacturerExGst(1240, "inc"), 1127.27);
});

test("the uplift is a percentage of the ex-GST figure, rounded to cents", () => {
  assert.equal(upliftedLineTotal(1240, 30), 1612);
});

test("22% is the mock's other worked figure", () => {
  assert.equal(upliftedLineTotal(1240, 22), 1512.8);
});

test("the two compose: 1,240 declared inc-GST at 30% is 1,465.45", () => {
  assert.equal(upliftedLineTotal(manufacturerExGst(1240, "inc"), 30), 1465.45);
});

test("zero uplift passes the manufacturer's figure through unchanged", () => {
  assert.equal(upliftedLineTotal(1240, 0), 1240);
});

test("no $10 rounding: an awkward figure keeps its cents", () => {
  // 1237.13 + 30% = 1608.269 → 1608.27, never 1610. `round10` is the engine's
  // customer-facing grid and is deliberately not imported on this path (D2).
  assert.equal(upliftedLineTotal(1237.13, 30), 1608.27);
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });
