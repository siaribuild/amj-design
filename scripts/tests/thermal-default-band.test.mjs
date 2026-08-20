// The owner's dial and the calibration that shows its consequences.
//
// TB-18 BINDS EVERY TEST IN THIS FILE: no assertion here fixes what the default
// Uw *ought* to be. Tests read the active record and assert FLOW. The single
// permitted business literal in the whole feature is TB-16's seed-equals-today's
// -value check immediately below, and it exists for exactly one reason —
// deploying this feature must move no existing estimate.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("thermal-default-band");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { SEED_DEFAULT_BAND, resolveActiveDefaultBand } from ${p("worker/lib/estimator/thermal/defaultBand.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const { SEED_DEFAULT_BAND, resolveActiveDefaultBand } = await import(pathToFileURL(outfile).href);

// ── TB-16: the seed changes no estimate, and tells the truth ─────────────────
test("TB-16: the seed carries today's value, and admits nothing citable stands behind it", () => {
  // THE ONE PERMITTED LITERAL. 4.0 is not a claim that 4.0 is correct — it is
  // the constant the platform has carried since the default envelope was
  // written, pinned here so that shipping the dial moves no existing estimate.
  // Choosing the number is the owner's business decision, not engineering's.
  assert.equal(SEED_DEFAULT_BAND.maxUValue, 4.0);
  assert.equal(SEED_DEFAULT_BAND.method, "unsourced_legacy");
  assert.match(SEED_DEFAULT_BAND.source, /no citable source/i,
    "the instrument's first act is to admit the number in force was chosen by nobody");
  assert.equal(SEED_DEFAULT_BAND.observations, null, "it is not derived from observations");
  assert.equal(SEED_DEFAULT_BAND.interim, true);
  assert.equal(SEED_DEFAULT_BAND.setBy, "system_seed");
  assert.equal(SEED_DEFAULT_BAND.version, "seed:1");
});

// ── TB-17, unit leg: resolution ──────────────────────────────────────────────
// A fake D1 whose `first()` returns whatever row the test hands it.
const fakeDb = (row, opts = {}) => ({
  prepare(sql) {
    opts.sql?.push(sql);
    return { first: async () => (opts.throws ? Promise.reject(new Error("d1 down")) : row) };
  },
});

test("TB-17: the newest ledger row supersedes the seed; an empty or unreadable table falls back to it", async () => {
  const sql = [];
  const active = await resolveActiveDefaultBand(fakeDb({
    id: 7, max_u_value: 2.8, method: "abcb_glazing_calculator",
    source: "ABCB Glazing Calculator, Melbourne detached, 2026-08-20",
    derived_at: "2026-08-20", observations_json: null, set_by: "owner", interim: 0,
  }, { sql }));
  assert.equal(active.version, "row:7", "the requirement will snapshot WHICH row said so");
  assert.equal(active.maxUValue, 2.8);
  assert.equal(active.method, "abcb_glazing_calculator");
  assert.equal(active.interim, false);
  assert.equal(active.setBy, "owner");
  assert.match(sql.join(" "), /ORDER BY id DESC/i, "newest row wins");

  // The empty table is the normal state on the day this ships.
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb(null)), SEED_DEFAULT_BAND);
  // A row that cannot be a cap is not a cap. Never throw: an unreadable dial
  // must not take an extraction run down with it.
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb({ id: 9, max_u_value: 0, method: "manual", source: "x", derived_at: "y", set_by: "z", interim: 1 })), SEED_DEFAULT_BAND);
  assert.deepEqual(await resolveActiveDefaultBand(fakeDb(null, { throws: true })), SEED_DEFAULT_BAND);
});
