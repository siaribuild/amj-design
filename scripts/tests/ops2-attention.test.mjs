// Attention model (pure) — scripts/tests/ops2-attention.test.mjs
//
// Bundles src/ops2/attention/attention.ts together with the two modules it
// is specified to route through — src/ops2/projects/queue.ts (WAIT_CHIPS,
// the runtime half of the ChipKey closure) and src/ops2/nav/destinations.ts
// (DESTINATIONS, the registered-route source of truth) — exactly the way
// ops2-navigation.test.mjs bundles destinations.ts with lineRoute.ts. This
// keeps the model's compile-time types (ChipKey, DestinationId) honest
// against the runtime data the model is required to build hrefs from,
// rather than letting the test assert against string literals that could
// drift from the real registries.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-attention");
const outfile = join(runDir, "ops2-attention-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseSummary, attentionGroups } from ${p("src/ops2/attention/attention.ts")};
      export { WAIT_CHIPS } from ${p("src/ops2/projects/queue.ts")};
      export { DESTINATIONS } from ${p("src/ops2/nav/destinations.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ops2-attention-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
const { parseSummary, attentionGroups, WAIT_CHIPS, DESTINATIONS } = M;

test.after(async () => {
  await removeRunDir(runDir);
});

// A registered pathname for every destination, per criterion 7.
const REGISTERED_PATHS = new Set(DESTINATIONS.map((d) => d.path));
// The closed set of chip keys a wait query is allowed to name, per criterion 11.
const CHIP_KEYS = new Set(WAIT_CHIPS.map((c) => c.key));

const FULL_COUNTS = {
  submissions: 4,
  inReview: 2,
  readyToIssue: 1,
  awaitingPayment: 3,
  newEnquiries: 2,
  tradeApplications: 1,
};

// Every row's href must resolve to a registered destination pathname (7),
// and — where a query string is present — it must be exactly `wait=<k>`
// with k a WAIT_CHIPS key, never a REFINEMENTS-style extra param (11).
function assertRowHref(row) {
  const url = new URL(row.href, "http://ops2.local");
  assert.ok(
    REGISTERED_PATHS.has(url.pathname),
    `${row.key} href pathname "${url.pathname}" is not a registered destination`,
  );
  if (url.search === "") return;
  const params = [...url.searchParams.keys()];
  assert.deepEqual(params, ["wait"], `${row.key} href carries unexpected params: ${url.search}`);
  const chip = url.searchParams.get("wait");
  assert.ok(CHIP_KEYS.has(chip), `${row.key} href wait="${chip}" is not a WAIT_CHIPS key`);
}

test("attentionGroups: full non-zero summary — group order, Projects lifecycle row order, counts pass through (criterion 1)", () => {
  const groups = attentionGroups(FULL_COUNTS);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["projects", "enquiries", "customers"],
  );
  const projects = groups[0];
  assert.deepEqual(
    projects.rows.map((r) => r.key),
    ["submissions", "inReview", "readyToIssue", "awaitingPayment"],
  );
  for (const row of projects.rows) {
    assert.equal(row.count, FULL_COUNTS[row.key]);
  }
  assert.equal(groups[1].rows[0].count, FULL_COUNTS.newEnquiries);
  assert.equal(groups[2].rows[0].count, FULL_COUNTS.tradeApplications);
});

test("attentionGroups: a zero count inside a non-zero group emits no row for it (criterion 3)", () => {
  const counts = { ...FULL_COUNTS, inReview: 0 };
  const groups = attentionGroups(counts);
  const projects = groups.find((g) => g.id === "projects");
  assert.deepEqual(
    projects.rows.map((r) => r.key),
    ["submissions", "readyToIssue", "awaitingPayment"],
  );
});

test("attentionGroups: a group whose rows are all zero is absent entirely, and the remaining groups keep stable order (criterion 4)", () => {
  const counts = { ...FULL_COUNTS, newEnquiries: 0 };
  const groups = attentionGroups(counts);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["projects", "customers"],
  );
});

test("attentionGroups: all six counts zero yields an empty array (criterion 5)", () => {
  const zero = {
    submissions: 0,
    inReview: 0,
    readyToIssue: 0,
    awaitingPayment: 0,
    newEnquiries: 0,
    tradeApplications: 0,
  };
  assert.deepEqual(attentionGroups(zero), []);
});

test("parseSummary: degraded:true, a missing key, and a non-number value all parse strictly to \"degraded\" — never a zero count (criterion 18, model side)", () => {
  assert.equal(parseSummary({ ...FULL_COUNTS, degraded: true }), "degraded");
  const { submissions, ...missingSubmissions } = FULL_COUNTS;
  assert.equal(parseSummary(missingSubmissions), "degraded");
  assert.equal(parseSummary({ ...FULL_COUNTS, awaitingPayment: "3" }), "degraded");
});

test("attentionGroups: every row href names a registered destination path, and every query string is exactly wait=<ChipKey> with no other params (criteria 7, 11)", () => {
  const groups = attentionGroups(FULL_COUNTS);
  for (const group of groups) {
    for (const row of group.rows) {
      assertRowHref(row);
    }
  }
});

test("attentionGroups: the wait mapping — submissions/inReview/readyToIssue -> wait=us, awaitingPayment -> wait=customer (criterion 12)", () => {
  const groups = attentionGroups(FULL_COUNTS);
  const projects = groups.find((g) => g.id === "projects");
  const byKey = Object.fromEntries(projects.rows.map((r) => [r.key, r.href]));
  assert.equal(new URL(byKey.submissions, "http://ops2.local").search, "?wait=us");
  assert.equal(new URL(byKey.inReview, "http://ops2.local").search, "?wait=us");
  assert.equal(new URL(byKey.readyToIssue, "http://ops2.local").search, "?wait=us");
  assert.equal(new URL(byKey.awaitingPayment, "http://ops2.local").search, "?wait=customer");
});

test("attentionGroups: every row label is number-leading (starts with its count)", () => {
  const groups = attentionGroups(FULL_COUNTS);
  for (const group of groups) {
    for (const row of group.rows) {
      assert.ok(
        row.label.startsWith(String(row.count)),
        `label "${row.label}" for ${row.key} does not start with its count ${row.count}`,
      );
    }
  }
});
