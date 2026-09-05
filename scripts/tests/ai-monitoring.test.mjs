// AI parse monitoring — pure core (src/data/monitoring.ts).
//
// Design: docs/runs/ai-parse-monitoring/02-design.md §3.1-3.3. Bundles the
// pure module in isolation the way ops2-attention.test.mjs bundles
// attention.ts — no Worker types, no IO.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
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
      export { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart, capBreached, evaluateRedFlags } from ${p("src/data/monitoring.ts")};
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
const { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart, capBreached, evaluateRedFlags } = M;

// worker/lib/monitoring.ts — IO shell (D1 counts, CF money fetch, KV
// snapshot, notification sources). Design §3.2, §5, §6.
const libOutfile = join(runDir, "ai-monitoring-lib-bundle.mjs");
await build({
  stdin: {
    contents: `
      export {
        writeMonitoringSnapshot,
        readMonitoringSnapshot,
        fetchMoneyNumbers,
        NOTIFICATION_SOURCES,
        notificationCount,
        monitoringPayload,
        __testingSources,
      } from ${p("worker/lib/monitoring.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ai-monitoring-lib-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: libOutfile,
  logLevel: "silent",
});
const Lib = await import(`${pathToFileURL(libOutfile).href}?run=${Date.now()}`);
const {
  writeMonitoringSnapshot,
  readMonitoringSnapshot,
  fetchMoneyNumbers,
  NOTIFICATION_SOURCES,
  notificationCount,
  monitoringPayload,
  __testingSources,
} = Lib;

test.after(async () => {
  await removeRunDir(runDir);
});

const money = (balance, budget) => ({ balance, budget });
const BALANCE_OK = { available: true, creditBalanceUsd: 12.34 };
const BUDGET_OK = {
  available: true,
  billedSpendUsd: 8,
  capUsd: 20,
  capSource: "gateway",
  windowDays: 30,
};

const VALID_SNAPSHOT = {
  takenAt: "2026-09-01T00:00:00.000Z",
  money: money(BALANCE_OK, BUDGET_OK),
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
  // Either half missing is a malformed snapshot: the page renders both.
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: { balance: BALANCE_OK } }), null);
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: { budget: BUDGET_OK } }), null);
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
      money: money({ ...BALANCE_OK, creditBalanceUsd: undefined }, BUDGET_OK),
    }),
    null,
  );
  // money.available=true missing billedSpendUsd
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: money(BALANCE_OK, { ...BUDGET_OK, billedSpendUsd: undefined }),
    }),
    null,
  );
  // money.available=true missing capUsd
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: money(BALANCE_OK, { ...BUDGET_OK, capUsd: undefined }),
    }),
    null,
  );
  // money.available=true missing capSource
  assert.equal(
    parseMonitoringSnapshot({
      ...VALID_SNAPSHOT,
      money: money(BALANCE_OK, { ...BUDGET_OK, capSource: undefined }),
    }),
    null,
  );
  // money.available=false missing reason
  assert.equal(
    parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: money({ available: false }, BUDGET_OK) }),
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
  const snapshot = { ...VALID_SNAPSHOT, money: money({ available: false, reason: "no key" }, { available: false, reason: "no key" }) };
  assert.equal(evaluateRed(snapshot, 5, 90), false);
});

test("evaluateRed: true when creditBalanceUsd is below the dollar floor", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: money({ available: true, creditBalanceUsd: 4 }, { available: true, billedSpendUsd: 1, capUsd: 20, capSource: "gateway", windowDays: 30 }),
  };
  assert.equal(evaluateRed(snapshot, 5, 90), true);
});

test("evaluateRed: true when billedSpend/cap exceeds the percent ceiling", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: money({ available: true, creditBalanceUsd: 100 }, { available: true, billedSpendUsd: 19, capUsd: 20, capSource: "gateway", windowDays: 30 }),
  };
  assert.equal(evaluateRed(snapshot, 5, 90), true);
});

test("evaluateRed: a single boolean true when both the floor and ceiling trip", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: money({ available: true, creditBalanceUsd: 4 }, { available: true, billedSpendUsd: 19, capUsd: 20, capSource: "gateway", windowDays: 30 }),
  };
  const result = evaluateRed(snapshot, 5, 90);
  assert.equal(typeof result, "boolean");
  assert.equal(result, true);
});

test("evaluateRed: false when neither the floor nor the ceiling trips", () => {
  const snapshot = {
    ...VALID_SNAPSHOT,
    money: money({ available: true, creditBalanceUsd: 12.34 }, { available: true, billedSpendUsd: 8, capUsd: 20, capSource: "gateway", windowDays: 30 }),
  };
  assert.equal(evaluateRed(snapshot, 5, 90), false);
});

test("capOutstanding: cap minus billedSpend", () => {
  const money = { available: true, creditBalanceUsd: 12.34, billedSpendUsd: 8, capUsd: 20, capSource: "gateway" };
  assert.equal(capOutstanding(money), 12);
});

test("writeMonitoringSnapshot: D1 count query matches design §3.2 verbatim", async () => {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            calls.push({ sql, args });
            return { all: async () => ({ results: [] }) };
          },
        };
      },
    },
    KV: { put: async () => {} },
  };
  await writeMonitoringSnapshot(env);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /triggered_by = 'upload'/);
  assert.match(
    calls[0].sql,
    /status = 'processing' AND updated_at < datetime\(\?, '-30 minutes'\)/,
  );
  // Was `datetime(?, '-7 days')` with `now` bound twice. That rolling window
  // reached back further than the seven Melbourne calendar buckets, so the
  // query returned rows no bucket could hold and the cards disagreed with the
  // chart beside them (V-F2). The lower bound is now the earliest bucket's own
  // midnight, so the two arguments are deliberately DIFFERENT instants.
  assert.match(calls[0].sql, /updated_at >= datetime\(\?\)/);
  assert.match(calls[0].sql, /status = 'completed'\s+OR status = 'failed'/);
  assert.equal(calls[0].args.length, 2);
  assert.equal(calls[0].args[0], parseWindowStart(new Date(calls[0].args[1])).toISOString());
});

test("fetchMoneyNumbers: CF_MONITORING_TOKEN unset yields token_missing with zero fetch calls", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    throw new Error("should not be called");
  };
  const result = await fetchMoneyNumbers({ CF_ACCOUNT_ID: "acct1" }, fetchImpl);
  assert.deepEqual(result.balance, { available: false, reason: "token_missing" });
  assert.deepEqual(result.budget, { available: false, reason: "token_missing" });
  assert.equal(fetchCalls, 0);
});

test("fetchMoneyNumbers: CF_ACCOUNT_ID unset or left at the wrangler.jsonc placeholder yields account_id_missing with zero fetch calls", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    throw new Error("should not be called");
  };
  const missing = await fetchMoneyNumbers({ CF_MONITORING_TOKEN: "tok" }, fetchImpl);
  assert.deepEqual(missing.balance, { available: false, reason: "account_id_missing" });
  const placeholder = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "paste-real-cf-account-id-before-deploying" },
    fetchImpl,
  );
  assert.deepEqual(placeholder.budget, { available: false, reason: "account_id_missing" });
  assert.equal(fetchCalls, 0);
});

test("writeMonitoringSnapshot: CF failure still writes fresh D1 counts with money unavailable, and logs no secret", async () => {
  const calls = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            calls.push({ sql, args });
            return {
              all: async () => ({
                results: [{ updated_at: new Date().toISOString(), outcome: "success" }],
              }),
            };
          },
        };
      },
    },
    KV: {
      put: async (key, value) => {
        calls.push({ key, value });
      },
    },
    CF_MONITORING_TOKEN: "super-secret-token",
    CF_ACCOUNT_ID: "acct1",
  };
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    throw new Error("network down");
  };
  const lines = [];
  const realLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await writeMonitoringSnapshot(env, fetchImpl);
  } finally {
    console.log = realLog;
  }
  assert.ok(fetchCalls > 0, "fetchImpl must actually be called");
  const put = calls.find((c) => c.key === "monitoring:snapshot");
  const snapshot = JSON.parse(put.value);
  assert.equal(snapshot.money.balance.available, false, 'both halves failed, so both say so');
  assert.equal(snapshot.money.budget.available, false);
  assert.equal(snapshot.success7d, 1);
  assert.ok(lines.length > 0, "a failure log line must be written");
  const logged = lines.join("\n");
  assert.doesNotMatch(logged, /super-secret-token/);
  assert.doesNotMatch(logged, /Bearer/);
});

test("fetchMoneyNumbers: gateway cap failure falls back to spending-limit with capSource 'account'", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) {
      return { ok: true, json: async () => ({ result: { balance: 12.34 } }) };
    }
    // Cloudflare's documented shapes, not the ones this fixture first assumed:
    // usage is history[].aggregated_value, and the account cap is
    // config.amount in CENTS.
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 8 }] } }) };
    }
    if (url.includes(`/ai-gateway/gateways/`)) {
      return { ok: false, status: 404 };
    }
    if (url.includes("/billing/spending-limit")) {
      return { ok: true, json: async () => ({ result: { enabled: true, config: { amount: 2000, duration: "monthly" } } }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result.balance, { available: true, creditBalanceUsd: 12.34 });
  assert.equal(result.budget.available, true);
  assert.equal(result.budget.billedSpendUsd, 8);
  assert.equal(result.budget.capUsd, 20);
  assert.equal(result.budget.capSource, "account");
});

test("readMonitoringSnapshot: round-trips a snapshot written via writeMonitoringSnapshot", async () => {
  let stored;
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }) }),
      }),
    },
    KV: {
      put: async (key, value) => {
        stored = value;
      },
      get: async () => stored,
    },
  };
  await writeMonitoringSnapshot(env);
  const result = await readMonitoringSnapshot(env);
  assert.deepEqual(result, JSON.parse(stored));
});

test("notificationCount: one source, sums to 1 when the stored snapshot is red", async () => {
  let getCalls = 0;
  const redSnapshot = {
    takenAt: new Date().toISOString(),
    money: money(
      { available: true, creditBalanceUsd: 1 },
      { available: true, billedSpendUsd: 2, capUsd: 100, capSource: "account", windowDays: 30 },
    ),
    days: Array.from({ length: 7 }, () => ({ day: "2026-09-05", success: 0, error: 0 })),
    success7d: 0,
    error7d: 0,
  };
  const env = {
    KV: {
      get: async () => {
        getCalls++;
        return JSON.stringify(redSnapshot);
      },
    },
  };
  assert.equal(NOTIFICATION_SOURCES.length, 1);
  const count = await notificationCount(env);
  assert.ok(getCalls > 0, "the notification source must actually read the snapshot");
  assert.equal(count, 1);
});

test("monitoringPayload: ships a red flag PER CONDITION and the floor, from ONE KV read (F3/F11, UX 6.2)", async () => {
  let getCalls = 0;
  const redSnapshot = {
    takenAt: new Date().toISOString(),
    money: money({ available: true, creditBalanceUsd: 1 }, { available: true, billedSpendUsd: 19, capUsd: 20, capSource: "gateway", windowDays: 30 }),
    days: Array.from({ length: 7 }, () => ({ day: "2026-09-05", success: 0, error: 0 })),
    success7d: 0,
    error7d: 0,
  };
  const env = {
    AI_CREDIT_FLOOR_USD: "5",
    AI_CAP_CEILING_PCT: "80",
    KV: {
      get: async () => {
        getCalls++;
        return JSON.stringify(redSnapshot);
      },
    },
  };
  const payload = await monitoringPayload(env);
  assert.equal(getCalls, 1, "one KV read must serve both the snapshot and the notification count");
  // Balance $1 is under the $5 floor; spend 19/20 is 95%, over the 80% ceiling.
  // Both conditions trip here, so both cards redden — and the bell still counts
  // the pair as ONE notification.
  assert.equal(payload.snapshot.redBalance, true);
  assert.equal(payload.snapshot.redCap, true);
  assert.equal(payload.snapshot.floorUsd, 5);
  assert.equal(payload.snapshot.ceilingPct, undefined, "the ceiling is never displayed, so it is never shipped");
  assert.equal(payload.notificationCount, 1);
});

test("monitoringPayload: no snapshot yet — null snapshot, zero notifications, no KV read wasted", async () => {
  const env = {
    KV: { get: async () => null },
  };
  const payload = await monitoringPayload(env);
  assert.deepEqual(payload, { snapshot: null, notificationCount: 0 });
});

// --- Verify round 2 (docs/runs/ai-parse-monitoring/06-verify.md) ---------------
// These three tests pin defects found by the tester. They are expected to FAIL
// until a developer fixes the implementation; do not delete them to go green.

test("V-F2 assembleParseCounts: rows inside the rolling 7x24h SQL window are never dropped by calendar bucketing", () => {
  // now = 2026-09-05 14:00 Melbourne. PARSE_OUTCOME_SQL selects updated_at >= now-7d,
  // i.e. back to 2026-08-29 14:00 Melbourne. The buckets only start at 2026-08-30
  // 00:00 Melbourne, so ~10h of rows the query returned fall through `if (!bucket)`.
  const now = new Date("2026-09-05T04:00:00.000Z");
  const rows = [
    { updatedAt: "2026-09-05T02:00:00.000Z", outcome: "success" }, // in bucket range
    { updatedAt: "2026-08-29T06:00:00.000Z", outcome: "success" }, // 2026-08-29 16:00 Melb — inside SQL window
    { updatedAt: "2026-08-29T10:00:00.000Z", outcome: "error" }, // 2026-08-29 20:00 Melb — inside SQL window
  ];
  const result = assembleParseCounts(rows, now);
  assert.equal(result.success7d, 2, "every success the SQL window returned must be counted");
  assert.equal(result.error7d, 1, "every error the SQL window returned must be counted");
});

test("V-F3 evaluateRed: a zero spend cap is red whenever there is spend, and never NaN-quiet", () => {
  const zeroCap = (billedSpendUsd) => ({
    money: money(
      { available: true, creditBalanceUsd: 100 },
      { available: true, billedSpendUsd, capUsd: 0, capSource: "gateway", windowDays: 30 },
    ),
  });
  // 0/0 = NaN, and NaN > ceiling is false: a cap of zero with zero spend silently
  // reports "not red" instead of being treated as an unusable cap.
  assert.equal(
    evaluateRed(zeroCap(0), 5, 80),
    true,
    "cap of 0 means no headroom at all — that is a red, not a quiet false",
  );
  assert.equal(evaluateRed(zeroCap(1), 5, 80), true);
});

test("V-F4 parseMonitoringSnapshot: returns only whitelisted fields and rejects a non-boolean money.available", () => {
  const injected = parseMonitoringSnapshot({
    ...VALID_SNAPSHOT,
    money: money({ ...BALANCE_OK, cfToken: "SECRET-TOKEN" }, { ...BUDGET_OK, accountId: "acct-123" }),
    internalDebug: "leak-me",
  });
  assert.ok(injected, "the snapshot itself is well-formed");
  assert.equal(injected.internalDebug, undefined, "unknown top-level fields must not pass through");
  assert.equal(injected.money.cfToken, undefined, "a token field must never reach the client payload");
  assert.equal(injected.money.accountId, undefined, "an account id must never reach the client payload");

  // available is checked with === true / === false, so any other value skips every
  // money field check and a garbage money object is returned as valid.
  assert.equal(
    parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: money({ available: "yes", anything: 1 }, BUDGET_OK) }),
    null,
    "a non-boolean money.available is malformed and must be rejected",
  );
});

test("V-F1 GET /api/ops/monitoring uses the shared ops staff guard (criterion 28: no new auth path)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../../worker/routes/ops.ts", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('ops.get("/monitoring"'));
  const body = route.slice(0, route.indexOf("\n});"));
  // resolveUser reads the session cookie only. In production ACCESS_TEAM_DOMAIN /
  // ACCESS_AUD are set, so staff identity arrives as a Cf-Access-Jwt-Assertion header
  // and there is no session cookie to read: every real staff request 401s.
  assert.ok(
    /resolveStaff\(/.test(body),
    "the monitoring route must resolve identity through resolveStaff like every other ops route",
  );
  assert.ok(
    !/resolveUser\(/.test(body),
    "resolveUser is session-cookie-only and is bypassed by Cloudflare Access in production",
  );
});

// --- Review round (docs/runs/ai-parse-monitoring/07-review-*.md) --------------

test("assembleParseCounts: the seven buckets are consecutive Melbourne calendar dates across the DST switch", () => {
  // 2026-10-04 02:00 is when Melbourne springs forward. At 00:30 on the 5th,
  // stepping back in 24h jumps emits Oct 3 then Oct 5 and never Oct 4, so rows
  // from the missing date counted toward the cards with no bucket to hold them.
  const now = new Date("2026-10-04T13:30:00.000Z"); // 2026-10-05 00:30 Melbourne
  const result = assembleParseCounts([], now);
  assert.deepEqual(
    result.days.map((d) => d.day),
    ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"],
  );
  assert.equal(new Set(result.days.map((d) => d.day)).size, 7, "no date may repeat");
});

test("assembleParseCounts: bucket sums equal the totals on the DST day", () => {
  const now = new Date("2026-10-04T13:30:00.000Z"); // 2026-10-05 00:30 Melbourne
  const rows = [
    { updatedAt: "2026-10-03T20:00:00.000Z", outcome: "success" }, // Oct 4 Melbourne
    { updatedAt: "2026-10-04T13:00:00.000Z", outcome: "error" }, // Oct 5 Melbourne
  ];
  const result = assembleParseCounts(rows, now);
  const sum = result.days.reduce(
    (acc, d) => ({ success: acc.success + d.success, error: acc.error + d.error }),
    { success: 0, error: 0 },
  );
  assert.equal(sum.success, result.success7d);
  assert.equal(sum.error, result.error7d);
  assert.equal(result.success7d, 1);
  assert.equal(result.error7d, 1);
});

test("parseWindowStart: is midnight Melbourne of the oldest bucket, not now-minus-168h", () => {
  const now = new Date("2026-09-05T04:00:00.000Z"); // 2026-09-05 14:00 Melbourne
  const start = parseWindowStart(now);
  // 2026-08-30 00:00 AEST (UTC+10) === 2026-08-29T14:00Z
  assert.equal(start.toISOString(), "2026-08-29T14:00:00.000Z");
  assert.equal(assembleParseCounts([], now).days[0].day, "2026-08-30");
});

test("fetchMoneyNumbers: a stalled Cloudflare endpoint is bounded, not waited on forever", async () => {
  // A hang here used to block writeMonitoringSnapshot before its KV write, so a
  // Cloudflare stall also cost the D1 counts, which Cloudflare has no part in.
  // Bounded on the test side too: without an abort signal this would hang the
  // suite rather than fail it, and a test that hangs reports nothing.
  let sawSignal = false;
  const fetchImpl = (_url, init) => {
    sawSignal = !!init?.signal;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
  const call = fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1", CF_TIMEOUT_MS: 50 },
    fetchImpl,
  );
  const outcome = await Promise.race([
    call,
    new Promise((resolve) => setTimeout(() => resolve("never-returned"), 5000)),
  ]);
  assert.equal(sawSignal, true, "every Cloudflare request must carry an abort signal");
  assert.equal(outcome.budget.available, false, "a stalled call ends, it does not hang");
});

test("fetchMoneyNumbers: decodes the documented Cloudflare response shapes", async () => {
  // The shapes below are Cloudflare's, from the generated SDK types: usage is
  // history[].aggregated_value (summed), the gateway cap is rules[].limit, and
  // the account fallback is config.amount IN CENTS. Reading undefined here does
  // not throw — it produced available:true with undefined figures, which the
  // snapshot parser then rejected whole, hiding the D1 counts too.
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("/billing/credit-balance")) {
      return { ok: true, json: async () => ({ result: { balance: 12.34, has_default_payment_method: true } }) };
    }
    if (url.includes("/billing/usage-history")) {
      return {
        ok: true,
        json: async () => ({
          result: {
            history: [
              { id: "a", aggregated_value: 5, start_time: 1, end_time: 2 },
              { id: "b", aggregated_value: 3, start_time: 2, end_time: 3 },
            ],
          },
        }),
      };
    }
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({
          result: { spend_limits: { enabled: true, rules: [{ id: "r1", limit: 20, limitType: "cost", window: 2592000 }] } },
        }),
      };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result.balance, { available: true, creditBalanceUsd: 12.34 });
  assert.equal(result.budget.billedSpendUsd, 8, "5 + 3, summed across the history entries");
  assert.equal(result.budget.capUsd, 20);
  assert.equal(result.budget.capSource, "gateway");
  // value_grouping_window is a REQUIRED query parameter; without it the usage
  // call is a 400 and the money half of the feature never works at all.
  assert.ok(
    seen.some((u) => u.includes("/billing/usage-history") && /value_grouping_window=(day|hour)/.test(u)),
    "usage-history must carry the required value_grouping_window parameter",
  );
});

test("fetchMoneyNumbers: a 200 that does not carry the documented fields is unavailable, never a half-filled snapshot", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: {} }) };
    if (url.includes("/billing/usage-history")) return { ok: true, json: async () => ({ result: { history: [] } }) };
    if (url.includes("/ai-gateway/gateways/")) {
      return { ok: true, json: async () => ({ result: { spend_limits: { rules: [] } } }) };
    }
    if (url.includes("/billing/spending-limit")) {
      return { ok: true, json: async () => ({ result: { enabled: false, config: { amount: null, duration: null } } }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.budget.available, false);
});

test("fetchMoneyNumbers: the gateway cap is the unscoped cost rule, not simply the first one", async () => {
  // A gateway carries up to 20 rules, each independently scoped to a model,
  // provider or metadata key. A scoped rule is a cap on part of the traffic,
  // so reporting it as THE cap understates the budget the console claims.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 50 } }) };
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 1 }] } }) };
    }
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({
          result: {
            spend_limits: {
              enabled: true,
              rules: [
                { id: "scoped", limit: 5, limitType: "cost", window: 86400, model: { mode: "filter", values: ["gemini"] } },
                { id: "whole-gateway", limit: 20, limitType: "cost", window: 2592000 },
              ],
            },
          },
        }),
      };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.budget.capUsd, 20);
  assert.equal(result.budget.capSource, "gateway");
});

test("fetchMoneyNumbers: the account fallback converts cents to dollars", async () => {
  // config.amount is the one money field Cloudflare documents a unit for, and
  // that unit is CENTS (the paired POST says so). Reported raw it was a 100x
  // overstatement of the cap.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 12.34 } }) };
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 8 }] } }) };
    }
    if (url.includes("/ai-gateway/gateways/")) return { ok: false, status: 404 };
    if (url.includes("/billing/spending-limit")) {
      return { ok: true, json: async () => ({ result: { enabled: true, config: { amount: 2000, duration: "monthly" } } }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.budget.capUsd, 20, "2000 cents is twenty dollars");
  assert.equal(result.budget.capSource, "account");
});

test("capBreached: the page's warning and the server's red flag agree at the rounding edge", () => {
  // The card rounded 79.6% to 80 and warned on >=, while evaluateRed compared
  // the raw 79.6 on >: the tile carried a cap warning that the bell and the
  // red flag both denied. One predicate, both surfaces, no rounding in it.
  const budget = { available: true, billedSpendUsd: 79.6, capUsd: 100, capSource: "gateway", windowDays: 30 };
  const bal = { available: true, creditBalanceUsd: 100 };
  assert.equal(capBreached(budget, 80), false, "79.6% is not above an 80% ceiling");
  assert.equal(evaluateRed({ money: money(bal, budget) }, 5, 80), capBreached(budget, 80));
  const over = { ...budget, billedSpendUsd: 80.4 };
  assert.equal(capBreached(over, 80), true);
  assert.equal(evaluateRed({ money: money(bal, over) }, 5, 80), capBreached(over, 80));
  // No headroom at all is a breach however it is phrased.
  assert.equal(capBreached({ ...budget, capUsd: 0 }, 80), true);
});

test("fetchMoneyNumbers: an empty usage history is zero spend, not a broken snapshot", async () => {
  // A billing window with no billable requests legitimately returns history:[].
  // Treating that as malformed hid the balance and the cap as well — and with
  // them the low-credit warning, in exactly the quiet month where the console
  // has least else to say.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 3 } }) };
    if (url.includes("/billing/usage-history")) return { ok: true, json: async () => ({ result: { history: [] } }) };
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({ result: { spend_limits: { enabled: true, rules: [{ limit: 20, limitType: "cost", window: 2592000 }] } } }),
      };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result.balance, { available: true, creditBalanceUsd: 3 });
  assert.equal(result.budget.available, true);
  assert.equal(result.budget.billedSpendUsd, 0);
  assert.equal(result.budget.capUsd, 20);
  // And the balance still drives the floor warning it is there to drive.
  assert.equal(evaluateRed({ money: result }, 5, 80), true);
});

test("fetchMoneyNumbers: a usage response with no history array at all is still malformed", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 3 } }) };
    if (url.includes("/billing/usage-history")) return { ok: true, json: async () => ({ result: {} }) };
    if (url.includes("/ai-gateway/gateways/")) return { ok: false, status: 404 };
    if (url.includes("/billing/spending-limit")) return { ok: false, status: 404 };
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.budget.available, false);
});

test("fetchMoneyNumbers: a switched-off spend limit is not a cap", async () => {
  // Saved rules survive switching the limit off. Reading them anyway reports a
  // cap nothing is enforcing, and can raise a red over a budget that is not
  // actually capped.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 50 } }) };
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 19 }] } }) };
    }
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({ result: { spend_limits: { enabled: false, rules: [{ limit: 20, limitType: "cost", window: 2592000 }] } } }),
      };
    }
    if (url.includes("/billing/spending-limit")) {
      return { ok: true, json: async () => ({ result: { enabled: false, config: { amount: 5000, duration: "monthly" } } }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  // Neither source has an enabled cap, so the money numbers are not claimed.
  assert.equal(result.budget.available, false);
});

test("readMonitoringSnapshot: unreadable stored JSON is no snapshot, not a thrown request", async () => {
  // JSON.parse sat outside the strict parser, so a truncated or corrupted KV
  // value threw straight out of the route as a 500 — the one shape the client's
  // "snapshot could not be trusted" path was written for and never saw.
  const env = { KV: { get: async () => "{not json at all" } };
  assert.equal(await readMonitoringSnapshot(env), null);
});

test("monitoringPayload: unreadable stored JSON answers empty rather than failing the request", async () => {
  const env = { KV: { get: async () => "{not json at all" } };
  assert.deepEqual(await monitoringPayload(env), { snapshot: null, notificationCount: 0 });
});


test("monitoringPayload: one breached condition reddens only its own card", async () => {
  // A low balance used to redden the cap card too, and a high cap the balance
  // card — each pointing the reader at a number that was perfectly healthy.
  const snapshot = {
    takenAt: new Date().toISOString(),
    money: money({ available: true, creditBalanceUsd: 1 }, { available: true, billedSpendUsd: 1, capUsd: 20, capSource: "gateway", windowDays: 30 }),
    days: Array.from({ length: 7 }, () => ({ day: "2026-09-05", success: 0, error: 0 })),
    success7d: 0,
    error7d: 0,
  };
  const env = {
    AI_CREDIT_FLOOR_USD: "5",
    AI_CAP_CEILING_PCT: "80",
    KV: { get: async () => JSON.stringify(snapshot) },
  };
  const payload = await monitoringPayload(env);
  assert.equal(payload.snapshot.redBalance, true, "$1 is below the $5 floor");
  assert.equal(payload.snapshot.redCap, false, "5% of the cap is not a cap problem");
  assert.equal(payload.notificationCount, 1, "still one notification, not two");
});

// --- Review round 3 (docs/runs/ai-parse-monitoring/07-review-*.md) ------------

test("parseMonitoringSnapshot: a takenAt that is not a real instant is malformed", () => {
  // A string passed the old check and then reached Intl.DateTimeFormat.format,
  // which throws on an invalid Date — blanking the whole Attention page instead
  // of showing the error state written for exactly this.
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, takenAt: "invalid" }), null);
  assert.equal(parseMonitoringSnapshot({ ...VALID_SNAPSHOT, takenAt: "" }), null);
  assert.ok(parseMonitoringSnapshot(VALID_SNAPSHOT));
});

test("fetchMoneyNumbers: usage is asked for over the cap's OWN window, not all time", async () => {
  // The cap is a per-gateway rule with its own window; usage-history defaults to
  // the account's whole history. Dividing one by the other described no budget
  // that Cloudflare actually enforces, and the percentage only ever grew.
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 50 } }) };
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 4 }] } }) };
    }
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({
          result: { spend_limits: { enabled: true, rules: [{ limit: 20, limitType: "cost", window: 2592000 }] } },
        }),
      };
    }
    if (url.includes("/ai-gateway/gateways")) {
      return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  const usage = seen.find((u) => u.includes("/billing/usage-history"));
  const start = Number(new URL(usage).searchParams.get("start_time"));
  const end = Number(new URL(usage).searchParams.get("end_time"));
  assert.ok(start > 0 && end > 0, "usage-history must be bounded to the cap's window");
  const spanDays = Math.round((end - start) / 86400000);
  assert.equal(spanDays, 30, "a 2592000s rule window is thirty days of usage");
  assert.equal(result.budget.available, true);
  assert.equal(result.budget.billedSpendUsd, 4);
  assert.equal(result.budget.capUsd, 20);
});

test("fetchMoneyNumbers: a second gateway makes the cap percentage unattributable, not wrong", async () => {
  // usage-history is ACCOUNT-scoped and cannot be filtered by gateway. With one
  // gateway the account's spend is that gateway's spend; with two it is not,
  // and dividing it by one gateway's cap overstates the percentage.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 3 } }) };
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { history: [{ aggregated_value: 4 }] } }) };
    }
    if (url.includes("/ai-gateway/gateways/")) {
      return {
        ok: true,
        json: async () => ({
          result: { spend_limits: { enabled: true, rules: [{ limit: 20, limitType: "cost", window: 2592000 }] } },
        }),
      };
    }
    if (url.includes("/ai-gateway/gateways")) {
      return { ok: true, json: async () => ({ result: [{ id: "gw1" }, { id: "gw2" }] }) };
    }
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.budget.available, false);
  assert.equal(result.budget.reason, "spend_not_attributable");
  // The balance is untouched by any of that, and still raises its own alarm.
  assert.equal(result.balance.available, true);
  assert.equal(result.balance.creditBalanceUsd, 3);
  assert.equal(evaluateRedFlags({ money: result }, 5, 80).balance, true);
});

test("fetchMoneyNumbers: a failed cap lookup never silences a real low-credit alarm", async () => {
  // One catch around all three requests threw away a perfectly good balance
  // because the cap endpoint blipped — suppressing the outage warning this
  // feature exists to give.
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 2 } }) };
    if (url.includes("/billing/usage-history")) return { ok: false, status: 500 };
    if (url.includes("/ai-gateway/gateways")) return { ok: false, status: 500 };
    if (url.includes("/billing/spending-limit")) return { ok: false, status: 500 };
    // The scope check: one gateway on the account, so its spend is the account's.
    if (url.endsWith("/ai-gateway/gateways")) return { ok: true, json: async () => ({ result: [{ id: "gw1" }] }) };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.balance.available, true, "the balance answered, so it is reported");
  assert.equal(result.balance.creditBalanceUsd, 2);
  assert.equal(result.budget.available, false);
  assert.equal(evaluateRedFlags({ money: result }, 5, 80).balance, true, "$2 is still below the $5 floor");
  assert.equal(evaluateRedFlags({ money: result }, 5, 80).cap, false, "an unknown cap is never a cap alarm");
});

test("notificationCount: one failing source cannot hide every other notification", async () => {
  // Promise.all rejects the whole payload on the first rejection, so a future
  // orders or messages source throwing would blank the AI cards too.
  const boom = async () => { throw new Error("source down"); };
  const two = async () => 2;
  const count = await __testingSources.countFrom([boom, two], { env: {}, snapshot: null });
  assert.equal(count, 2, "a source that throws contributes nothing and stops nothing");
});

// --- V2 regression: criterion 8, "one document == one parse" -----------------
// Spec 01-spec.md:95 — a document retried three times before succeeding counts
// as exactly one success and zero errors. PARSE_OUTCOME_SQL selects one row per
// ai_job_claim generation and never mentions project_id, so the three
// generations of one upload land in the counts as three parses.
//
// D1 is shimmed over node:sqlite so the module's own SQL really executes: a
// hand-fed row array could only assert what the test author already believed
// the query returned.
function sqliteD1(rows) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ai_job_claim (
    project_id TEXT NOT NULL,
    source_generation INTEGER NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    triggered_by TEXT NOT NULL DEFAULT 'upload',
    PRIMARY KEY (project_id, source_generation)
  )`);
  const insert = db.prepare(
    `INSERT INTO ai_job_claim (project_id, source_generation, status, updated_at, triggered_by)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    insert.run(r.projectId, r.generation, r.status, r.updatedAt, r.triggeredBy ?? "upload");
  }
  return {
    prepare(sql) {
      return {
        bind: (...args) => ({ all: async () => ({ results: db.prepare(sql).all(...args) }) }),
      };
    },
  };
}

function utcStamp(msAgo) {
  return new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace("T", " ");
}

// A RETRY REUSES ITS ROW. `retryCurrentAiExtraction` reclaims in place -
// `UPDATE ai_job_claim ... WHERE project_id=? AND source_generation=?`
// (worker/lib/ai/jobs.ts) - and the automatic retry path only bumps `attempts`
// on the same row. So the criterion-8 scenario, "one document whose parse was
// retried three times", is ONE claim row whose final status is what counts.
//
// Separate generations are not retries of one parse: `source_generation` moves
// when the project's document set changes (upload, delete), so each is its own
// parse job. Under the owner's Q1 ruling - one parse event = one claim
// lifecycle, superseding "one document == one parse" - they count separately.
test("writeMonitoringSnapshot: a parse retried until it succeeds is ONE success (criterion 8)", async () => {
  let stored = null;
  const env = {
    DB: sqliteD1([
      // The row a real retry leaves behind: same generation, reset in place,
      // finally completed. Three attempts happened; one claim lifecycle exists.
      { projectId: "proj_retried", generation: 0, status: "completed", updatedAt: utcStamp(3600_000) },
    ]),
    KV: { put: async (_k, v) => { stored = JSON.parse(v); } },
  };
  await writeMonitoringSnapshot(env, async () => { throw new Error("no money fetch"); });
  assert.equal(stored.success7d, 1, "the document succeeded once");
  assert.equal(stored.error7d, 0, "its earlier attempts were the same claim, not separate failures");
  const totals = stored.days.reduce((a, d) => ({ s: a.s + d.success, e: a.e + d.error }), { s: 0, e: 0 });
  assert.equal(totals.s, 1);
  assert.equal(totals.e, 0);
});

test("writeMonitoringSnapshot: separate generations are separate parse jobs, not one retried parse", async () => {
  let stored = null;
  const env = {
    DB: sqliteD1([
      { projectId: "proj_regen", generation: 0, status: "failed", updatedAt: utcStamp(3 * 3600_000) },
      { projectId: "proj_regen", generation: 1, status: "failed", updatedAt: utcStamp(2 * 3600_000) },
      { projectId: "proj_regen", generation: 2, status: "completed", updatedAt: utcStamp(3600_000) },
    ]),
    KV: { put: async (_k, v) => { stored = JSON.parse(v); } },
  };
  await writeMonitoringSnapshot(env, async () => { throw new Error("no money fetch"); });
  // Three generations means the document set changed twice and was parsed three
  // times. Collapsing them would hide two real failures from the error card -
  // the card this feature exists to make someone act on.
  assert.equal(stored.success7d, 1);
  assert.equal(stored.error7d, 2, "each generation is its own claim lifecycle");
});

test("writeMonitoringSnapshot: a failed parse counts as one error", async () => {
  let stored = null;
  const env = {
    DB: sqliteD1([
      { projectId: "proj_lost", generation: 0, status: "failed", updatedAt: utcStamp(3600_000) },
      { projectId: "proj_ok", generation: 0, status: "completed", updatedAt: utcStamp(3600_000) },
    ]),
    KV: { put: async (_k, v) => { stored = JSON.parse(v); } },
  };
  await writeMonitoringSnapshot(env, async () => { throw new Error("no money fetch"); });
  assert.equal(stored.error7d, 1);
  assert.equal(stored.success7d, 1);
});

// --- TESTER round 4: the day a parse lands on must not depend on the host clock -
//
// D1 writes `updated_at` with `datetime('now')`, which is UTC in the format
// "YYYY-MM-DD HH:MM:SS" — a space separator and NO timezone designator.
// `assembleParseCounts` reads it back with `new Date(row.updatedAt)`, and for
// that shape V8 falls back to its implementation-defined parser, which treats
// the string as LOCAL time. The stamp is UTC, so every bucket decision is
// silently offset by the host's UTC offset.
//
// Reproduced end to end through `wrangler dev` on a UTC+10 host: a claim
// completed at 2026-09-05 17:07:35 UTC — Melbourne 2026-09-06 — was drawn on
// 2026-09-05. Worse, near the oldest bucket's edge the row lands in no bucket
// at all while still counting toward the card total, so criterion 13's
// "the sum of the buckets equals the two count cards" breaks outright.
//
// This test pins the stamp's meaning instead of the machine's: the assertion
// is computed from the SAME instant the row records, so it is true in every
// timezone and fails only if the parse is wrong. Fix is one line in
// src/data/monitoring.ts: read the D1 stamp as UTC
// (`new Date(row.updatedAt.replace(" ", "T") + "Z")`).
test("TESTER-F1 assembleParseCounts: a D1 stamp is UTC, whatever the host clock says", () => {
  const melbourne = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" });
  // 15:30 UTC is 01:30 the NEXT Melbourne day — the window where a local-time
  // reading of the stamp moves the row back a calendar day.
  const instant = new Date("2026-09-05T15:30:00.000Z");
  const d1Stamp = instant.toISOString().slice(0, 19).replace("T", " ");
  const expectedDay = melbourne.format(instant);

  const result = assembleParseCounts([{ updatedAt: d1Stamp, outcome: "success" }], new Date("2026-09-06T02:00:00.000Z"));
  const bucket = result.days.find((d) => d.success === 1);
  assert.ok(bucket, `no bucket held the row; buckets=${JSON.stringify(result.days.map((d) => d.day))}`);
  assert.equal(bucket.day, expectedDay, "the row belongs on the Melbourne day of its UTC stamp");
});

// The same defect, stated as the invariant the spec actually asks for
// (criterion 13). A row inside the SQL window that no bucket can hold is
// counted on the card and missing from the chart beside it, so the two
// disagree — which is the failure a reader would notice first.
test("TESTER-F2 assembleParseCounts: every row inside the window lands in a bucket (criterion 13)", () => {
  const now = new Date("2026-09-06T02:00:00.000Z");
  const windowStart = parseWindowStart(now);
  // One minute after the oldest bucket's midnight: unambiguously inside the
  // window the SQL selects, so a bucket must hold it.
  const instant = new Date(windowStart.getTime() + 60_000);
  const d1Stamp = instant.toISOString().slice(0, 19).replace("T", " ");

  const result = assembleParseCounts([{ updatedAt: d1Stamp, outcome: "success" }], now);
  const bucketed = result.days.reduce((total, d) => total + d.success, 0);
  assert.equal(
    bucketed, result.success7d,
    `bucket sums must equal the card total; buckets=${JSON.stringify(result.days)} card=${result.success7d} stamp=${d1Stamp}`,
  );
});

// --- TESTER round 4: criterion 27, and the scope check that fails open -------
//
// Criterion 27: "Given a Cloudflare API failure, when it is logged, then the
// log line contains no token and no Authorization header value."
//
// `pathSuffix` is the sanitiser written for exactly that, but it only ever runs
// on the `status N for <suffix>` Error that `cfGet` builds itself. A TRANSPORT
// failure — the connection refused, DNS, TLS, abort — arrives as an Error whose
// message the fetch implementation wrote, and `logFailure` prints that message
// verbatim. Nothing in this module bounds what a log line can contain on the
// one path criterion 27 names.
//
// The fix is to log the suffix of the URL that was ATTEMPTED rather than
// whatever the transport put in `err.message`.
test("TESTER-F3 fetchMoneyNumbers: a transport failure logs a bounded path, never the error's own text (criterion 27)", async () => {
  const TOKEN = "cf-tok-SUPERSECRET-9f3a";
  const env = { CF_MONITORING_TOKEN: TOKEN, CF_ACCOUNT_ID: "acct-1234", AI_GATEWAY_ID: "openframe-estimator" };
  const lines = [];
  const realLog = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    // The transport controls this string, so the module must not trust it.
    await fetchMoneyNumbers(env, async (url, init) => {
      throw new Error(`connect ECONNREFUSED for ${url} headers=${JSON.stringify(init.headers)}`);
    });
  } finally {
    console.log = realLog;
  }
  assert.ok(lines.length > 0, "a Cloudflare failure must be logged at all");
  for (const line of lines) {
    assert.ok(!line.includes(TOKEN), `log line carries the API token: ${line}`);
    assert.ok(!/authorization|bearer/i.test(line), `log line carries the Authorization header: ${line}`);
  }
});

// Round 3 fixed "the cap percentage compared incompatible scope" by refusing to
// publish a percentage when more than one gateway shares the account, on the
// stated principle that "unknown beats confidently wrong on a number that
// raises alarms". The check is `Array.isArray(gateways) && gateways.length > 1`,
// so an answer that is NOT an array — a paginated object, or `result: null` on
// a soft 200 failure — skips the guard entirely and the percentage is published
// from account-wide spend it could not attribute. Account spend is always >= one
// gateway's, so the error is always toward a FALSE RED: the alarm this feature
// exists to make trustworthy.
test("TESTER-F4 fetchMoneyNumbers: a gateway list that is not an array is unknown scope, not one gateway", async () => {
  const env = { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct", AI_GATEWAY_ID: "openframe-estimator" };
  const reply = (result) => ({ ok: true, status: 200, json: async () => ({ result }) });
  const answer = async (url) => {
    if (url.includes("credit-balance")) return reply({ balance: 30 });
    if (url.includes("/gateways/")) return reply({ spend_limits: { enabled: true, rules: [{ limitType: "cost", limit: 20, window: 2592000 }] } });
    // Cloudflare answers 200 but the shape is not the bare array this expects.
    if (url.endsWith("/ai-gateway/gateways")) return reply({ gateways: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    if (url.includes("usage-history")) return reply({ history: [{ aggregated_value: 19 }] });
    throw new Error(`unexpected ${url}`);
  };
  const { budget } = await fetchMoneyNumbers(env, answer);
  assert.equal(
    budget.available, false,
    "an unreadable gateway list means the spend cannot be attributed; publishing 95% of the cap raises a red nobody can act on",
  );
  assert.equal(budget.reason, "spend_not_attributable");
});
