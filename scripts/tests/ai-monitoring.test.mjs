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
      export { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart, capBreached } from ${p("src/data/monitoring.ts")};
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
const { parseMonitoringSnapshot, assembleParseCounts, evaluateRed, capOutstanding, parseWindowStart, capBreached } = M;

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
  assert.deepEqual(outcome, { available: false, reason: "fetch_failed" });
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result, {
    available: true,
    creditBalanceUsd: 12.34,
    billedSpendUsd: 8, // 5 + 3, summed across the history entries
    capUsd: 20,
    capSource: "gateway",
  });
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result, { available: false, reason: "fetch_failed" });
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.capUsd, 20);
  assert.equal(result.capSource, "gateway");
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.equal(result.capUsd, 20, "2000 cents is twenty dollars");
  assert.equal(result.capSource, "account");
});

test("capBreached: the page's warning and the server's red flag agree at the rounding edge", () => {
  // The card rounded 79.6% to 80 and warned on >=, while evaluateRed compared
  // the raw 79.6 on >: the tile carried a cap warning that the bell and the
  // red flag both denied. One predicate, both surfaces, no rounding in it.
  const money = { available: true, creditBalanceUsd: 100, billedSpendUsd: 79.6, capUsd: 100 };
  assert.equal(capBreached(money, 80), false, "79.6% is not above an 80% ceiling");
  assert.equal(evaluateRed({ money }, 5, 80), capBreached(money, 80));
  const over = { ...money, billedSpendUsd: 80.4 };
  assert.equal(capBreached(over, 80), true);
  assert.equal(evaluateRed({ money: over }, 5, 80), capBreached(over, 80));
  // No headroom at all is a breach however it is phrased.
  assert.equal(capBreached({ ...money, capUsd: 0 }, 80), true);
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result, {
    available: true,
    creditBalanceUsd: 3,
    billedSpendUsd: 0,
    capUsd: 20,
    capSource: "gateway",
  });
  // And the balance still drives the floor warning it is there to drive.
  assert.equal(evaluateRed({ money: result }, 5, 80), true);
});

test("fetchMoneyNumbers: a usage response with no history array at all is still malformed", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/billing/credit-balance")) return { ok: true, json: async () => ({ result: { balance: 3 } }) };
    if (url.includes("/billing/usage-history")) return { ok: true, json: async () => ({ result: {} }) };
    if (url.includes("/ai-gateway/gateways/")) return { ok: false, status: 404 };
    if (url.includes("/billing/spending-limit")) return { ok: false, status: 404 };
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  assert.deepEqual(result, { available: false, reason: "fetch_failed" });
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
    throw new Error(`unexpected url ${url}`);
  };
  const result = await fetchMoneyNumbers(
    { CF_MONITORING_TOKEN: "tok", CF_ACCOUNT_ID: "acct1", AI_GATEWAY_ID: "gw1" },
    fetchImpl,
  );
  // Neither source has an enabled cap, so the money numbers are not claimed.
  assert.deepEqual(result, { available: false, reason: "fetch_failed" });
});
