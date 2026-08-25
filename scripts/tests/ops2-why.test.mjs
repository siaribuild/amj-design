// "Why this product" — every sentence on the surface, held where it can be read
// without a browser.
//
// The copy module is PURE: it takes the rationale DTO and returns strings. That
// is the whole reason it exists as a module rather than as JSX — R2's ban ("no
// word frames a human's change as an error") is a claim about a string table,
// and a claim about a string table is settled by reading the table.
//
// TS is bundled once with esbuild, as ops2-navigation.test.mjs does.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-why");
const outfile = join(runDir, "ops2-why-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/ops2/projects/whyCopy.ts")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-why-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { await removeRunDir(runDir); });

const REQUIREMENT = (o = {}) => ({
  maxUValue: 3.9, minShgc: null, maxShgc: 0.44,
  basis: "explicit_energy_report", absent: false, ...o,
});

test("WHY-AC-2/3 the caps, and the label saying where they came from", () => {
  // The figures, at the precision the mock shows — two places on both axes, so
  // 3.9 and 3.90 are one number and read as one number.
  assert.equal(M.requirementText(REQUIREMENT()), "Uw ≤ 3.90 · SHGC ≤ 0.44");
  assert.equal(M.requirementText(REQUIREMENT({ maxShgc: null })), "Uw ≤ 3.90");
  assert.equal(M.requirementText(REQUIREMENT({ minShgc: 0.35 })), "Uw ≤ 3.90 · SHGC 0.35–0.44");

  // WHY-AC-3: no cap figure at all, and no em-dash standing in for one. This
  // opening was never given a requirement; a blank row would claim the platform
  // looked and found nothing.
  assert.equal(M.requirementText(REQUIREMENT({ absent: true })), "this opening had no thermal requirement");
  assert.equal(M.requirementText(REQUIREMENT({ absent: true, maxUValue: 3.9 })),
    "this opening had no thermal requirement", "absent wins over a stale cap on the same record");

  // R4: the origin label is a fact about the requirement, one per basis.
  assert.deepEqual(
    ["explicit_energy_report", "plan_derived", "default_envelope", "human_override"]
      .map((b) => M.basisLabel(b)),
    [
      "parsed from an energy report",
      "modelled by the platform from the plan",
      "a default value the platform applies",
      "set by a person",
    ],
  );
  assert.equal(M.basisLabel(null), null, "no basis recorded, so no label — never an invented one");
  assert.equal(M.basisLabel("something_new"), null, "and a basis this build does not know is not guessed at");
});

test("WHY-AC-4 §9.0 a figure that is not a number is never rendered as one", () => {
  assert.equal(M.figuresText({ uValue: 3.72, shgc: 0.41 }), "Uw 3.72 · SHGC 0.41");

  // ONE AXIS MISSING. The other is still worth reading, so the row survives and
  // says which half is absent — never a zero, never a dash, never a dropped row.
  assert.equal(M.figuresText({ uValue: 3.72, shgc: null }), "Uw 3.72 · SHGC not recorded");
  assert.equal(M.figuresText({ uValue: null, shgc: 0.41 }), "Uw not recorded · SHGC 0.41");

  // A REAL ZERO IS A FIGURE. `0` is falsy and this is exactly where a truthiness
  // test would swallow it and report the absence the spec forbids.
  assert.equal(M.figuresText({ uValue: 0, shgc: 0 }), "Uw 0.00 · SHGC 0.00");

  // BOTH ABSENCES SAY THE SAME THING HERE, deliberately. `null` (never
  // captured) and `{null,null}` (captured, no figure) are the same thing to say
  // about a NUMBER; which one it is is said by the panel's foot sentence and by
  // the DTO's kind. This function can only see the figures, and §9.0 is explicit
  // that the figures cannot tell them apart.
  assert.equal(M.figuresText({ uValue: null, shgc: null }), "not recorded");
  assert.equal(M.figuresText(null), "not recorded");
  assert.equal(M.figuresText(undefined), "not recorded");
});

/** A `recommendation` DTO, with the one thing each case turns on overridden. */
const recommendation = (o = {}) => ({
  kind: "recommendation",
  requirement: REQUIREMENT(o.requirement),
  tolerance: o.tolerance ?? 0.08,
  competingTier: o.competingTier ?? "meets",
  recommended: {
    productSlug: "amj67-awning", productName: "AMJ67T Awning", variantId: "v1",
    form: o.form ?? "single", tier: o.competingTier ?? "meets", rank: 1,
    figures: { uValue: 3.41, shgc: 0.39 }, fits: true, units: o.units ?? null,
  },
  alternatives: [],
  selectionChanged: o.selectionChanged ?? null,
  current: { productSlug: "amj67-awning", productName: "AMJ67 Awning", figures: { uValue: 3.72, shgc: 0.41 } },
  composite: o.composite ?? null,
  unsuppliedSplitNote: null,
});

test("WHY-AC-5/6 the 'Chosen' sentence names the winning rule, and reads the band off the run", () => {
  const chosen = (o) => M.chosenLine(recommendation(o));

  assert.equal(chosen({ competingTier: "meets" }).text, "the cheapest of those that met the caps");
  assert.equal(chosen({ competingTier: "within_tolerance" }).text,
    "nothing met the caps, so the cheapest within 8% of the closest");
  assert.equal(chosen({ competingTier: "misses" }).text,
    "nothing came within the 8% band, so the closest was taken");
  assert.equal(chosen({ competingTier: "thermal_unknown" }).text,
    "no figure existed on the constrained axis, so it was chosen on fit and price");
  assert.equal(chosen({ competingTier: "does_not_fit" }).text,
    "nothing fitted this opening, so the best fit was taken");

  // WHY-AC-6: THE BAND IS THE RUN'S. A run stamped 0.05 says 5% on the same
  // sentence a run stamped 0.08 says 8% on — this is the assertion that catches
  // a hardcoded 5, which is what the number was for the whole life of the model.
  assert.match(chosen({ competingTier: "within_tolerance", tolerance: 0.05 }).text, /within 5% of/);
  assert.match(chosen({ competingTier: "misses", tolerance: 0.125 }).text, /the 12.5% band/);
  assert.match(chosen({ competingTier: "within_tolerance", tolerance: 0.1 }).text, /within 10% of/);

  // R7: the band is NAMED, never paraphrased as "the closest available".
  for (const tier of ["within_tolerance", "misses"]) {
    assert.match(chosen({ competingTier: tier }).text, /\d+(\.\d+)?%/, `${tier} states the band as a figure`);
  }

  // WHY-AC-3's other half: with no requirement, the sentence claims no thermal
  // victory — every candidate meets by definition and saying so would be a
  // boast about nothing.
  assert.equal(chosen({ requirement: { absent: true } }).text, "the cheapest that fitted the opening");
  assert.equal(chosen({ requirement: { absent: true } }).text.includes("cap"), false);

  // TONE. `warn` in this console means "ours to resolve, the human proceeds" —
  // never attention/red, because nothing on this surface is an error.
  assert.equal(chosen({ competingTier: "meets" }).tone, "plain");
  for (const tier of ["within_tolerance", "misses", "thermal_unknown", "does_not_fit"]) {
    assert.equal(chosen({ competingTier: tier }).tone, "warn", `${tier} is unresolved, so it is toned`);
  }
});
