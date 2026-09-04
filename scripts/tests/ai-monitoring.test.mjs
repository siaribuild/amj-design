// AI parse monitoring — pure core (src/data/monitoring.ts).
//
// Design: docs/runs/ai-parse-monitoring/02-design.md §3.1-3.3. Bundles the
// pure module in isolation the way ops2-attention.test.mjs bundles
// attention.ts — no Worker types, no IO.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ai-monitoring");
const outfile = join(runDir, "ai-monitoring-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding } from ${p("src/data/monitoring.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ai-monitoring-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
const { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding } = M;

test.after(async () => {
  await removeRunDir(runDir);
});

const VALID_SNAPSHOT = {
  takenAt: "2026-09-01T00:00:00.000Z",
  money: {
    available: true,
    creditBalanceUsd: 12.34,
    billedSpendUsd: 8,
    capUsd: 20,
    capSource: "gateway",
  },
  success7d: 3,
  error7d: 1,
  days: Array.from({ length: 7 }, (_, i) => ({
    day: `2026-08-2${i}`,
    success: 0,
    error: 0,
  })),
};

test("parseMonitoringSnapshot: accepts a well-formed snapshot", () => {
  const result = parseMonitoringSnapshot(VALID_SNAPSHOT);
  assert.deepEqual(result, VALID_SNAPSHOT);
});

test("parseMonitoringSnapshot: rejects malformed shapes as null, never partial", () => {
  assert.equal(parseMonitoringSnapshot(null), null);
  assert.equal(parseMonitoringSnapshot(undefined), null);
  assert.equal(parseMonitoringSnapshot("not an object"), null);
  assert.equal(parseMonitoringSnapshot({}), null);
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: undefined }), null);
  // days wrong length
  assert.equal(
    parseMonitoringSnapshot({ ...VALID_SNAPSHOT, days: VALID_SNAPSHOT.days.slice(0, 6) }),
    null,
  );
  // success7d not a number
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, success7d: "3" }), null);
  // error7d not a number
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, error7d: "1" }), null);
  // money.available=true missing a required numeric field
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: { ...VALID_SNAPSHOT.money, creditBalanceUsd: undefined },
    }),
    null,
  );
  // money.available=true missing billedSpendUsd
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: { ...VALID_SNAPSHOT.money, billedSpendUsd: undefined },
    }),
    null,
  );
  // money.available=true missing capUsd
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: { ...VALID_SNAPSHOT.money, capUsd: undefined },
    }),
    null,
  );
  // money.available=true missing capSource
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: { ...VALID_SNAPSHOT.money, capSource: undefined },
    }),
    null,
  );
  // money.available=false missing reason
  assert.equal(
    parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: { available: false } }),
    null,
  );
  // a day bucket with a non-string day
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      days: [{ ...VALID_SNAPSHOT.days[0], day: 20260820 }, ...VALID_SNAPSHOT.days.slice(1)],
    }),
    null,
  );
  // a day bucket with a non-number success
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      days: [{ ...VALID_SNAPSHOT.days[0], success: "0" }, ...VALID_SNAPSHOT.days.slice(1)],
    }),
    null,
  );
  // a day bucket with a non-number error
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      days: [{ ...VALID_SNAPSHOT.days[0], error: "0" }, ...VALID_SNAPSHOT.days.slice(1)],
    }),
    null,
  );
});

test("assembleParseCounts: zero rows produce exactly 7 Melbourne-day buckets, oldest-first, all zero", () => {
  const now = new Date("2026-09-05T04:00:00.000Z"); // 2026-09-05 14:00 Melbourne
  const result = assembleParseCounts([], now);
  assert.equal(result.success7d, 0);
  assert.equal(result.error7d, 0);
  assert.deepEqual(
    result.days.map((d) => d.day),
    ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"],
  );
  for (const d of result.days) {
    assert.equal(d.success, 0);
    assert.equal(d.error, 0);
  }
});

test("assembleParseCounts: bucket sums equal the two totals for sample rows", () => {
  const now = new Date("2026-09-05T04:00:00.000Z"); // 2026-09-05 14:00 Melbourne
  const rows = [
    { updatedAt: "2026-09-05T02:00:00.000Z", outcome: "success" }, // 2026-09-05 Melbourne
    { updatedAt: "2026-09-04T22:00:00.000Z", outcome: "error" }, // 2026-09-05 08:00 Melbourne
    { updatedAt: "2026-09-01T00:00:00.000Z", outcome: "success" }, // 2026-09-01 10:00 Melbourne
  ];
  const result = assembleParseCounts(rows, now);
  assert.equal(result.success7d, 2);
  assert.equal(result.error7d, 1);
  const bucketSum = result.days.reduce(
    (acc, d) => ({ success: acc.success + d.success, error: acc.error + d.error }),
    { success: 0, error: 0 },
  );
  assert.equal(bucketSum.success, result.success7d);
  assert.equal(bucketSum.error, result.error7d);
});

test("evaluateRed: false when money unavailable", () => {
  const snapshot = { ...VALID_SNAPSHOT, money: { available: false, reason: "no key" } };
  assert.equal(evaluateRed(snapshot, 5, 90), false);
});

test("evaluateRed: true when creditBalanceUsd is below the dollar floor", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: { available: true, creditBalanceUsd: 4, billedSpendUsd: 1, capUsd: 20, capSource: "gateway" },
  };
  assert.equal(evaluateRed(snapshot, 5, 90), true);
});

test("evaluateRed: true when billedSpend/cap exceeds the percent ceiling", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: { available: true, creditBalanceUsd: 100, billedSpendUsd: 19, capUsd: 20, capSource: "gateway" },
  };
  assert.equal(evaluateRed(snapshot, 5, 90), true);
});

test("evaluateRed: a single boolean true when both the floor and ceiling trip", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: { available: true, creditBalanceUsd: 4, billedSpendUsd: 19, capUsd: 20, capSource: "gateway" },
  };
  const result = evaluateRed(snapshot, 5, 90);
  assert.equal(typeof result, "boolean");
  assert.equal(result, true);
});

test("evaluateRed: false when neither the floor nor the ceiling trips", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: { available: true, creditBalanceUsd: 12.34, billedSpendUsd: 8, capUsd: 20, capSource: "gateway" },
  };
  assert.equal(evaluateRed(snapshot, 5, 90), false);
});

test("capOutstanding: cap minus billedSpend", () => {
  const money = { available: true, creditBalanceUsd: 12.34, billedSpendUsd: 8, capUsd: 20, capSource: "gateway" };
  assert.equal(capOutstanding(money), 12);
});
