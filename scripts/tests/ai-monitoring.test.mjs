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
      export { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart } from ${p("src/data/monitoring.ts")};
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
const { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart } = M;

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
} = Lib;

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
  assert.deepEqual(result, { available: false, reason: "token_missing" });
  assert.equal(fetchCalls, 0);
});

test("fetchMoneyNumbers: CF_ACCOUNT_ID unset or left at the wrangler.jsonc placeholder yields account_id_missing with zero fetch calls", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    throw new Error("should not be called");
  };
  const missing = await fetchMoneyNumbers({ CF_MONITORING_TOKEN: "tok" }, fetchImpl);
  assert.deepEqual(missing, { available: false, reason: "account_id_missing" });
  const placeholder = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "paste-real-cf-account-id-before-deploying" },
    fetchImpl,
  );
  assert.deepEqual(placeholder, { available: false, reason: "account_id_missing" });
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
  assert.equal(snapshot.money.available, false);
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
    if (url.includes("/billing/usage-history")) {
      return { ok: true, json: async () => ({ result: { totalUsd: 8 } }) };
    }
    if (url.includes(`/ai-gateway/gateways/`)) {
      return { ok: false, status: 404 };
    }
    if (url.includes("/billing/spending-limit")) {
      return { ok: true, json: async () => ({ result: { limit: 20 } }) };
    }
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result, {
    available: true,
    creditBalanceUsd: 12.34,
    billedSpendUsd: 8,
    capUsd: 20,
    capSource: "account",
  });
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
    money: { available: true, creditBalanceUsd: 1, billedSpendUsd: 2, capUsd: 100, capSource: "account" },
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

test("monitoringPayload: ships the server-evaluated red flag and floor/ceiling, from ONE KV read (F3/F11)", async () => {
  let getCalls = 0;
  const redSnapshot = {
    takenAt: new Date().toISOString(),
    money: { available: true, creditBalanceUsd: 1, billedSpendUsd: 19, capUsd: 20, capSource: "gateway" },
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
  assert.equal(payload.snapshot.red, true);
  assert.equal(payload.snapshot.floorUsd, 5);
  assert.equal(payload.snapshot.ceilingPct, 80);
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
    money: { available: true, creditBalanceUsd: 100, billedSpendUsd, capUsd: 0 },
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
    money: { ...VALID_SNAPSHOT.money, cfToken: "SECRET-TOKEN", accountId: "acct-123" },
    internalDebug: "leak-me",
  });
  assert.ok(injected, "the snapshot itself is well-formed");
  assert.equal(injected.internalDebug, undefined, "unknown top-level fields must not pass through");
  assert.equal(injected.money.cfToken, undefined, "a token field must never reach the client payload");
  assert.equal(injected.money.accountId, undefined, "an account id must never reach the client payload");

  // available is checked with === true / === false, so any other value skips every
  // money field check and a garbage money object is returned as valid.
  assert.equal(
    parseMonitoringSnapshot({ ...VALID_SNAPSHOT, money: { available: "yes", anything: 1 } }),
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
