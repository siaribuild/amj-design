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
