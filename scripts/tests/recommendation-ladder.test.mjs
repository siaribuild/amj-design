// The selection LADDER (docs/specs/recommendation-model-design.md §4) — pure,
// fixture-only, no repository and no pricing engine. This suite owns the
// acceptance criteria that can be proven without wiring: AC-2/3/5, AC-13/14/15,
// AC-43/44/45/46/47/48, AC-51/52, and edge cases E8/E9/E10/E11.
//
// TS bundled with esbuild, same header pattern as estimator-rules.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("recommendation-ladder");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { deviationOf } from ${p("worker/lib/estimator/ladder.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { deviationOf } = await import(pathToFileURL(outfile).href);

// ── Fixtures ────────────────────────────────────────────────────────────────

/** A resolved requirement. Every axis is opt-in. */
const req = (over = {}) => ({
  maxUValue: null, minShgc: null, maxShgc: null,
  basis: "explicit_energy_report", absent: false, ...over,
});
const NO_REQ = req({ absent: true, basis: null });

/** A ladder candidate. Deviation and price are the only things that matter. */
let seq = 0;
const cand = (over = {}) => ({
  key: over.key ?? `k${++seq}`,
  productSlug: over.productSlug ?? "p-aaa",
  variantId: null,
  splitKey: null,
  excluded: false,
  fits: true,
  lastResort: false,
  deviation: 0,
  thermalRequired: true,
  priceCents: 100_000,
  ...over,
});

const byKey = (result, key) => result.ranked.find((c) => c.key === key);
const keysInOrder = (result) => result.ranked.map((c) => c.key);

// ── Deviation math (AC-13, D8) ──────────────────────────────────────────────

test("AC-13 deviationOf is miss divided by the requirement value", () => {
  const d = deviationOf(req({ maxUValue: 4.0 }), { uValue: 4.4, shgc: null });
  assert.equal(d.scalar, 0.1);
  assert.equal(d.absoluteMiss, 0.4);
  assert.equal(d.worstAxis, "uValue");
  assert.equal(d.perAxis.uValue, 0.1);
  assert.equal(d.perAxis.minShgc, null);
  assert.equal(d.perAxis.maxShgc, null);
});

test("AC-14/AC-15 every axis is commensurable and the WORST one decides", () => {
  // A 10% miss is 0.10 whichever axis carries it — the whole point of D8.
  const r = req({ maxUValue: 4.0, minShgc: 0.30 });
  assert.equal(deviationOf(r, { uValue: 4.4, shgc: 0.30 }).scalar, 0.1);
  assert.equal(deviationOf(r, { uValue: 4.0, shgc: 0.27 }).scalar, 0.1);
  // An SHGC CAP deviates upward.
  const cap = deviationOf(req({ maxShgc: 0.40 }), { uValue: null, shgc: 0.44 });
  assert.equal(cap.scalar, 0.1);
  assert.equal(cap.worstAxis, "maxShgc");
  assert.equal(cap.absoluteMiss, 0.04);
  // AC-15: missing Uw by 4% and the SHGC floor by 12% is a deviation of 0.12 on
  // minShgc, with both per-axis figures preserved for display.
  const worst = deviationOf(req({ maxUValue: 4.0, minShgc: 0.50 }), { uValue: 4.16, shgc: 0.44 });
  assert.equal(worst.scalar, 0.12);
  assert.equal(worst.worstAxis, "minShgc");
  assert.equal(worst.perAxis.uValue, 0.04);
  assert.equal(worst.perAxis.minShgc, 0.12);
});

test("A2/E8 an unmeasurable axis is UNKNOWN; an ABSENT requirement is zero", () => {
  // No figure on a constrained axis ⇒ the whole candidate is unknown, never 0.
  assert.equal(deviationOf(req({ maxUValue: 4.0 }), { uValue: null, shgc: 0.5 }).scalar, null);
  // Even when another axis IS measurably missed: the worst axis cannot be asserted.
  const partial = deviationOf(req({ maxUValue: 4.0, minShgc: 0.5 }), { uValue: null, shgc: 0.4 });
  assert.equal(partial.scalar, null);
  assert.equal(partial.worstAxis, null);
  assert.equal(partial.absoluteMiss, null);
  // Meeting every constrained axis is a real, measured zero with no worst axis.
  const met = deviationOf(req({ maxUValue: 4.0, minShgc: 0.30 }), { uValue: 3.2, shgc: 0.55 });
  assert.equal(met.scalar, 0);
  assert.equal(met.worstAxis, null);
  assert.equal(met.absoluteMiss, null);
  // AC-6/E5: no requirement at all is zero deviation, not unknown.
  assert.equal(deviationOf(NO_REQ, { uValue: null, shgc: null }).scalar, 0);
  // A requirement object that constrains no axis is the same thing.
  assert.equal(deviationOf(req(), { uValue: null, shgc: null }).scalar, 0);
});
