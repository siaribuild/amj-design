// AC-49a — the golden pricing corpus, and the guards that make it proof rather
// than decoration (referral program, docs/specs/referral-program.md §AC-49,
// docs/design/referral-program.md §13.2, ticket T0).
//
// WHAT THIS SUITE IS FOR. The referral discount is composed into the ONE
// discount step that already prices every line (worker/lib/estimator/pricing.ts).
// AC-49 is the criterion the whole feature lives or dies on: every existing
// account and every existing quote must price identically afterwards. "We didn't
// mean to change anything" does not satisfy it — this corpus is how it is proven.
//
// The fixtures are captured by scripts/capture-pricing-fixtures.mjs from the
// UNMODIFIED engine and committed in their own commit BEFORE pricing.ts is
// touched. That ordering is not ceremony: a corpus captured from code you have
// already edited characterises the edit, not the baseline. The provenance
// subtest below asserts the ordering mechanically against git history.
//
// AC-49c PROCEDURE (for the tester — no inspection of SQL required):
//   wrangler d1 execute <db> --file scripts/db/price-checksums.sql --json > before.json
//   wrangler d1 migrations apply <db>                # applies 0051
//   wrangler d1 execute <db> --file scripts/db/price-checksums.sql --json > after.json
//   diff before.json after.json                      # must be empty
// Run against a copy of production data. The script is read-only by
// construction and this suite asserts that it stays that way.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const execFileAsync = promisify(execFile);
const p = (rel) => JSON.stringify(join(projectRoot, rel));

const FIXTURE_REL = "scripts/tests/fixtures/pricing-golden/cases.json";
const FIXTURE_PATH = join(projectRoot, FIXTURE_REL);
const PRICING_REL = "worker/lib/estimator/pricing.ts";
const CHECKSUM_REL = "scripts/db/price-checksums.sql";

// Every bullet AC-49a enumerates, as a tag each case declares. Asserting the
// union means a case deleted from the corpus fails the suite instead of quietly
// shrinking the proof.
const REQUIRED_COVERAGE = [
  "anonymous",          // no owner_user_id ⇒ 0%
  "registered-default", // the 0032 default of 5%
  "staff",              // internal account ⇒ 0%
  "min-charge",         // price driven by min_charge, not the rate
  "modifier-fired",
  "modifier-not-fired",
  "composite",          // parent total authoritative, segments display-only
  "rounding-boundary",  // the discount lands immediately before round10()
  "rounding-mid-band",  // …and a band interior, where an order-of-operations slip hides
  "qty-gt-1",           // × qty happens after rounding
];

// The two snapshot keys T2 adds. They are emitted ONLY when a referral discount
// actually applied, which is what keeps every non-referred snapshot
// byte-identical (design §5.2). No fixture case is referred, so neither key may
// ever appear in this suite's output.
const REFERRAL_SNAPSHOT_KEYS = ["accountDiscountPercent", "referralDiscountPercent"];

const git = async (args) => {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot });
  return stdout.trim();
};

test("AC-49a — golden pricing corpus replays unchanged", { timeout: 120_000 }, async (t) => {
  const runDir = await makeRunDir("pricing-golden");
  t.after(async () => { await removeRunDir(runDir); });

  const outfile = join(runDir, "pricing-golden-bundle.mjs");
  await build({
    stdin: {
      contents: `export { computePrice, round10 } from ${p(PRICING_REL)};`,
      resolveDir: projectRoot,
      sourcefile: "pricing-golden-entry.ts",
      loader: "ts",
    },
    bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  });
  const { computePrice } = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);

  let corpus;
  try {
    corpus = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
  } catch (error) {
    assert.fail(
      `${FIXTURE_REL} is missing or unreadable (${error?.code ?? error}).\n` +
      "Capture it from the UNMODIFIED engine with:  node scripts/capture-pricing-fixtures.mjs",
    );
  }
  const cases = corpus.cases ?? [];
  assert.ok(cases.length >= REQUIRED_COVERAGE.length, "the corpus has at least one case per AC-49a bullet");

  await t.test("the corpus covers every account state and arithmetic path AC-49a names", () => {
    const covered = new Set(cases.flatMap((c) => c.covers ?? []));
    const missing = REQUIRED_COVERAGE.filter((tag) => !covered.has(tag));
    assert.deepEqual(missing, [], `AC-49a bullets with no fixture case: ${missing.join(", ")}`);
  });

  for (const testCase of cases) {
    await t.test(`case ${testCase.id} — ${testCase.why}`, () => {
      let compositeTotal = 0;
      for (const part of testCase.parts) {
        const snapshot = computePrice(part.rate, part.policy, part.input);
        // computedAt is a wall clock, the one field that cannot be golden.
        // Everything else is compared whole, so a NEW key appearing in the
        // snapshot fails here rather than slipping past a field allowlist.
        const { computedAt, ...comparable } = snapshot;
        assert.ok(typeof computedAt === "string" && computedAt.length > 0, "computedAt is stamped");
        assert.deepStrictEqual(
          JSON.parse(JSON.stringify(comparable)),
          part.expected,
          `${testCase.id} / ${part.label}: pricing changed for a non-referred line`,
        );
        compositeTotal += snapshot.total;
      }
      if (testCase.expectedCompositeTotal != null) {
        // Invariant 4 of worker/lib/composite.ts: the parent is never priced
        // directly — its line_total IS the sum of its segments.
        assert.equal(
          compositeTotal, testCase.expectedCompositeTotal,
          `${testCase.id}: composite parent total drifted from Σ(segments)`,
        );
      }
    });
  }

  await t.test("AC-49 — no non-referred snapshot carries a referral composition key", () => {
    for (const testCase of cases) {
      for (const part of testCase.parts) {
        const snapshot = computePrice(part.rate, part.policy, part.input);
        for (const key of REFERRAL_SNAPSHOT_KEYS) {
          assert.equal(
            Object.hasOwn(snapshot, key), false,
            `${testCase.id} / ${part.label}: snapshot gained ${key} without a referral`,
          );
          assert.equal(Object.hasOwn(part.expected, key), false, `${testCase.id}: fixture carries ${key}`);
        }
      }
    }
  });

  await t.test("AC-49a provenance — the fixtures were committed before pricing.ts was touched", async () => {
    let addCommit = "";
    try {
      // --diff-filter=A, oldest last: the commit that introduced the corpus.
      const log = await git(["log", "--diff-filter=A", "--format=%H", "--", FIXTURE_REL]);
      addCommit = log.split("\n").filter(Boolean).pop() ?? "";
    } catch (error) {
      t.diagnostic(`git unavailable, provenance not checked: ${error?.message ?? error}`);
      return;
    }
    if (!addCommit) {
      // Only reachable while T0 itself is being written. Once the corpus is
      // committed this branch is dead and the assertions below are live.
      t.diagnostic(`${FIXTURE_REL} is not committed yet — provenance becomes assertable at the T0 commit`);
      return;
    }
    await git(["merge-base", "--is-ancestor", addCommit, "HEAD"]);
    const touched = (await git(["show", "--name-only", "--format=", addCommit])).split("\n").filter(Boolean);
    assert.equal(
      touched.includes(PRICING_REL), false,
      `the fixture commit ${addCommit.slice(0, 8)} also modified ${PRICING_REL}: ` +
      "the corpus characterises the change instead of the baseline",
    );
  });

  await t.test("AC-49c — the checksum script is committed and cannot write", async () => {
    const sql = await readFile(join(projectRoot, CHECKSUM_REL), "utf8");
    const stripped = sql.replace(/--[^\n]*/g, "");
    const mutating = stripped.match(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|ATTACH|VACUUM)\b/i);
    assert.equal(mutating, null, `${CHECKSUM_REL} must be read-only; found ${mutating?.[0]}`);
    // The five stored money columns AC-49c names, each of which 0051 must leave
    // bitwise unchanged.
    for (const needle of ["quote_line", "order_line", "delivery_total", "payment", "line_total"]) {
      assert.ok(stripped.includes(needle), `${CHECKSUM_REL} does not cover ${needle}`);
    }
  });
});
