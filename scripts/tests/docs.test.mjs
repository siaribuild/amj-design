// Documentation checks — deliberately two, and deliberately narrow.
//
// The operational docs sat three weeks and ~360 commits behind the code: a
// runbook still opened "release status: blocked" over issues that were all
// closed, another described role restrictions that had been deleted, and the
// operations guide named sign-in accounts that are not in the seed. Nothing in
// the repository bound any of it to reality.
//
// What is NOT asserted here matters as much as what is. A check that the docs
// name every npm script, or every wrangler var, turns a documentation omission
// into a red `npm test` for every developer — and with no CI, `npm test` is the
// only gate there is. Making it fail for prose teaches people to skip it, which
// is the same pathology that let a stale "blocked" banner sit unread for weeks.
//
// These two are different: both assert that a doc points at something that must
// exist, both would have caught real drift found in the 2026-08-10 audit triage,
// and neither can be tripped by ordinary editing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const docsDir = join(projectRoot, "docs");
const docFiles = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
const read = (rel) => readFileSync(join(projectRoot, rel), "utf8");

test("every `npm run <script>` named in the docs exists", () => {
  const scripts = new Set(Object.keys(JSON.parse(read("package.json")).scripts));
  const missing = [];
  for (const file of docFiles) {
    const body = readFileSync(join(docsDir, file), "utf8");
    for (const [, name] of body.matchAll(/npm run ([a-z0-9:-]+)/g)) {
      if (!scripts.has(name)) missing.push(`${file}: npm run ${name}`);
    }
  }
  assert.deepEqual(missing, [], "docs reference npm scripts that do not exist");
});

test("every sign-in address the operations guide names is in the seed", () => {
  // OPERATIONS.md tells a developer which accounts to sign in as. It listed
  // demo@openframe.com.au and staff@openframe.com.au, neither of which the seed
  // has ever created — so following the guide produced a rejected sign-in and no
  // explanation.
  const seed = read("scripts/db/seed.sql");
  const guide = read("docs/OPERATIONS.md");
  // Only addresses presented as credentials in the accounts table, not prose
  // mentions like a From address or an enquiry inbox.
  const listed = [...guide.matchAll(/^\|[^|]*\|\s*`([^`]+@[^`]+)`\s*\|/gm)].map((m) => m[1]);
  assert.ok(listed.length >= 3, "no seeded accounts listed — has the table moved?");
  const missing = listed.filter((email) => !seed.includes(email));
  assert.deepEqual(missing, [], "OPERATIONS.md names sign-in accounts the seed does not create");
});

/**
 * Suites the battery never names — matched on the whole argument.
 *
 * NOT `battery.includes(f)`: a bare basename is a substring of longer ones
 * ("api.test.mjs" inside "meta-api.test.mjs"), so that spelling called a suite
 * reachable that nothing runs, and the guard could be deleted from `npm test`
 * without going red.
 */
const unreachableSuites = (battery, suites) => {
  const args = new Set(battery.split(/\s+/));
  return suites.filter((f) => !args.has(`scripts/tests/${f}`));
};

test("every node suite in scripts/tests is reachable from `npm test`", () => {
  // A suite that no npm script names is a suite nobody runs. It passes the
  // moment its author runs it by hand, then silently stops being a gate:
  // `npm test` is the only battery there is, and the deploy protocol reads it.
  // Found 2026-09-05, when scripts/tests/ops2-attention.test.mjs was added to
  // `test:ops2` alone and so ran in no full pass.
  //
  // Narrow on purpose, and unlike the checks this file's header warns against:
  // it cannot be tripped by editing prose, only by adding a test file and not
  // registering it — which is the defect itself.
  const scripts = JSON.parse(read("package.json")).scripts;
  const battery = `${scripts["test:pure"]} ${scripts["test:heavy"]}`;
  const suites = readdirSync(join(projectRoot, "scripts", "tests"))
    .filter((f) => f.endsWith(".test.mjs"));
  assert.deepEqual(unreachableSuites(battery, suites), [], "test suites exist that `npm test` never runs");
});

test("reachability is an exact argument match, not a substring of another suite's name", () => {
  // `battery.includes("api.test.mjs")` is true for a battery that only runs
  // `meta-api.test.mjs`, and `pipeline.test.mjs` hides behind
  // `ai-pipeline.test.mjs` the same way — so the guard above could be removed
  // from `npm test` and stay green. The check is on the argument, not the text.
  const battery = "node --test scripts/tests/meta-api.test.mjs scripts/tests/ai-pipeline.test.mjs";
  assert.deepEqual(
    unreachableSuites(battery, ["api.test.mjs", "pipeline.test.mjs"]),
    ["api.test.mjs", "pipeline.test.mjs"],
  );
  assert.deepEqual(unreachableSuites(battery, ["meta-api.test.mjs"]), []);
});
