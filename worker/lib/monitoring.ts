// AI parse monitoring — IO shell: D1 counts, CF money fetch, KV snapshot,
// notification sources. Design: docs/runs/ai-parse-monitoring/02-design.md §3.2, §5, §6.
import type { Env } from "../types";
import {
  assembleParseCounts, evaluateRed, evaluateRedFlags, parseMonitoringSnapshot, parseWindowStart,
  type BalanceSnapshot, type BudgetSnapshot, type MoneySnapshot,
} from "../../src/data/monitoring";

const PARSE_OUTCOME_SQL = `SELECT updated_at,
       CASE WHEN status = 'completed' THEN 'success' ELSE 'error' END AS outcome
FROM ai_job_claim
WHERE triggered_by = 'upload'
  AND updated_at >= datetime(?)
  AND (status = 'completed'
       OR status = 'failed'
       OR (status = 'processing' AND updated_at < datetime(?, '-30 minutes')))`;

export async function writeMonitoringSnapshot(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const now = new Date();
  const { results } = await env.DB.prepare(PARSE_OUTCOME_SQL)
    .bind(parseWindowStart(now).toISOString(), now.toISOString()).all();
  const rows = (results ?? []).map((r: any) => ({ updatedAt: r.updated_at, outcome: r.outcome }));
  const counts = assembleParseCounts(rows, now);
  const money = await fetchMoneyNumbers(env, fetchImpl);
  const snapshot = { takenAt: now.toISOString(), money, ...counts };
  await env.KV.put("monitoring:snapshot", JSON.stringify(snapshot));
}

// Logs only the endpoint path suffix + status — never the token, never the
// Authorization header, never the account id in a full URL (design §8).
/** A Cloudflare call that failed, carrying ONLY the endpoint path it failed on.
 *
 *  The sanitised path travels as a field rather than inside a message that the
 *  logger has to parse back out — the two functions no longer share a string
 *  protocol, and a message this module did not compose cannot be mistaken for
 *  one it did. */
class CfFailure extends Error {
  constructor(readonly pathSuffix: string, readonly status?: number) {
    super(status ? `status ${status} for ${pathSuffix}` : `request failed for ${pathSuffix}`);
  }
}

function pathSuffix(url: string): string {
  const i = url.indexOf("/ai-gateway/");
  return i === -1 ? "?" : url.slice(i);
}

// A stalled billing endpoint must not cost us the D1 counts: without a bound,
// writeMonitoringSnapshot waits on the fetch forever and never reaches its KV
// write, losing the half of the snapshot Cloudflare has no part in. Overridable
// so the test can prove the abort rather than wait ten seconds for it.
const CF_TIMEOUT_MS = 10_000;

async function cfGet(env: Env, fetchImpl: typeof fetch, path: string): Promise<any> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}${path}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${env.CF_MONITORING_TOKEN}` },
      signal: AbortSignal.timeout(Number(env.CF_TIMEOUT_MS ?? CF_TIMEOUT_MS)),
    });
  } catch {
    // The transport's OWN message is discarded here, deliberately. A connection
    // failure, a DNS error or the abort arrives as an Error whose text the fetch
    // implementation wrote — it may quote the full request, headers included,
    // and this module has no say in it. Criterion 27 cannot be enforced by
    // sanitising a string someone else composed, so nothing composed elsewhere
    // is ever logged: only the path we attempted, which is in hand right here.
    throw new CfFailure(pathSuffix(url));
  }
  if (!res.ok) throw new CfFailure(pathSuffix(url), res.status);
  const body = await res.json<{ result?: unknown }>();
  return body.result;
}

// Reading a field Cloudflare does not send yields undefined rather than
// throwing, and an undefined that reaches the snapshot is dropped by
// JSON.stringify — which made the parser reject the WHOLE snapshot and hid the
// D1 counts as well. Every number crossing this boundary is checked here.
function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CfFailure(`/ai-gateway/ (missing ${field})`);
  }
  return value;
}

// Kept as a real string (not imported from wrangler.jsonc) so this check
// stays valid even if the comment above the placeholder in wrangler.jsonc changes.
const PLACEHOLDER_ACCOUNT_ID = "paste-real-cf-account-id-before-deploying";

/** The gateway-wide cost cap, in the units Cloudflare reports it in.
 *
 *  A gateway carries up to 20 spend rules and each may be scoped to a model, a
 *  provider or a metadata key. A scoped rule caps PART of the traffic, so
 *  reporting one as "the cap" would understate the budget the console claims to
 *  be measuring against. Only an unscoped, enabled cost rule describes the
 *  whole gateway; if there is none, we do not know the cap and say so by
 *  failing to the account fallback. The RULE is returned rather than just its
 *  limit, because its window decides the period the spend is measured over. */
function gatewayCapRule(gateway: any): any {
  // Rules outlive the switch that enforces them. A saved rule read off a
  // disabled spend limit is a cap nothing applies — reporting it would put a
  // budget bar, and eventually a red alert, over spending that is not capped
  // at all.
  if (gateway?.spend_limits?.enabled === false) return undefined;
  const rules = gateway?.spend_limits?.rules;
  if (!Array.isArray(rules)) return undefined;
  const whole = rules.find(
    (r: any) =>
      r?.limitType === "cost" && r?.enabled !== false && !r?.model && !r?.provider &&
      (!r?.metadata || Object.keys(r.metadata).length === 0),
  );
  return whole;
}

export async function fetchMoneyNumbers(env: Env, fetchImpl: typeof fetch = fetch): Promise<MoneySnapshot> {
  if (!env.CF_MONITORING_TOKEN) return bothUnavailable("token_missing");
  if (!env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID === PLACEHOLDER_ACCOUNT_ID) {
    return bothUnavailable("account_id_missing");
  }
  // Two independent answers, deliberately not one. The balance is a single
  // reading; the budget needs a cap, then usage over that cap's own window.
  // Sharing a try/catch let a cap blip delete a balance that had arrived
  // perfectly well - and with it the low-credit alarm.
  const [balance, budget] = await Promise.all([
    fetchBalance(env, fetchImpl),
    fetchBudget(env, fetchImpl),
  ]);
  return { balance, budget };
}

const bothUnavailable = (reason: string): MoneySnapshot => ({
  balance: { available: false, reason },
  budget: { available: false, reason },
});

function logFailure(err: unknown): "fetch_failed" {
  // Only a CfFailure carries a path this module built, and only that path is
  // ever printed. Anything else — an error from a dependency, a bug in here —
  // logs nothing but "?", so a log line cannot carry a URL, an account id or a
  // header whoever composed it. The guarantee is the TYPE, not a string parse.
  // The status is a NUMBER — it cannot carry a URL, a token or a header — and
  // without it a 403 (scope), a 400 (bad parameter) and a 404 (wrong endpoint)
  // all logged one indistinguishable line. That is what made the live
  // usage-history failure impossible to diagnose from the logs.
  const path = err instanceof CfFailure ? err.pathSuffix : "?";
  const status = err instanceof CfFailure && err.status ? `status ${err.status} ` : "";
  console.log(`ai-parse monitoring: CF fetch failed — ${status}for ${path}`);
  return "fetch_failed";
}

async function fetchBalance(env: Env, fetchImpl: typeof fetch): Promise<BalanceSnapshot> {
  try {
    const balance = await cfGet(env, fetchImpl, "/ai-gateway/billing/credit-balance");
    // CENTS, like config.amount beside it. Confirmed against the Cloudflare
    // dashboard 2026-09-06: a real $4.28 balance was published as $428.07.
    // Cloudflare documents no unit for this field anywhere, and the direction
    // of the error was the dangerous one — it put a balance BELOW the $5 floor
    // far above it, so the low-credit alarm stayed silent on the day it was due.
    return { available: true, creditBalanceUsd: requireNumber(balance?.balance, "balance") / 100 };
  } catch (err) {
    return { available: false, reason: logFailure(err) };
  }
}

/** Spend AND the cap it is measured against - or neither.
 *
 *  A percentage means something only when its numerator and denominator
 *  describe the same traffic over the same period. Cloudflare makes that
 *  awkward: the cap is a per-gateway rule with its own window, while
 *  usage-history is account-scoped and cannot be filtered by gateway. So the
 *  window is matched explicitly here, and the scope is CHECKED rather than
 *  assumed - with one gateway on the account its spend is this gateway's
 *  spend; with two, an account total cannot be attributed to one gateway's cap
 *  and a percentage built from it would overstate. Unknown beats confidently
 *  wrong on a number that raises alarms. */
async function fetchBudget(env: Env, fetchImpl: typeof fetch): Promise<BudgetSnapshot> {
  try {
    const cap = await fetchCap(env, fetchImpl);
    // Scope only has to be proved for a GATEWAY cap. usage-history is
    // account-wide, so an account-level cap is measured against account-level
    // spend whatever the gateway count is — asking the question there blanked a
    // cap card that was perfectly attributable.
    //
    // For a gateway cap it FAILS CLOSED: publish only when the answer
    // positively says this account has exactly one gateway, because only then
    // is the account's spend this gateway's spend. Anything else — a paginated
    // object, a shape change, `result: null` from one of Cloudflare's
    // soft-failure 200s — is an answer we cannot attribute.
    if (cap.capSource === "gateway") {
      const gateways = await cfGet(env, fetchImpl, "/ai-gateway/gateways");
      if (!Array.isArray(gateways) || gateways.length !== 1) {
        return { available: false, reason: "spend_not_attributable" };
      }
    }
    // ALIGNED TO THE HOUR, both ends. This endpoint proxies Stripe's billing
    // meter event summaries API — same parameter names, same day|hour enum,
    // same {id, aggregated_value, start_time, end_time} response — and Stripe
    // requires the bounds to align: minute boundaries always, hour boundaries
    // for hourly granularity. Raw Date.now() instants align with nothing, and
    // production answered HTTP 500 to every tick for a week, a status
    // Cloudflare's own OpenAPI spec does not declare.
    //
    // Hourly rather than daily: daily alignment would force the window to end
    // at last UTC midnight, hiding up to a day of spend from a budget gauge.
    // This gives up only the current partial hour, and never asks for a future
    // instant.
    const HOUR_MS = 60 * 60 * 1000;
    const end = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const start = end - cap.windowDays * 24 * HOUR_MS;
    // value_grouping_window is REQUIRED; without it this is a 400 and the money
    // half of the console never works at all. The bounds are the cap's own
    // window - unbounded, this summed the account's entire history against a
    // thirty-day cap, so the percentage only ever climbed.
    const usage = await cfGet(
      env, fetchImpl,
      `/ai-gateway/billing/usage-history?value_grouping_window=hour&start_time=${start}&end_time=${end}`,
    );
    // history[] is a series of windows, so the spend is their sum - there is no
    // single total field. An EMPTY array is a real answer: a window with
    // nothing billable in it. Only a missing or non-array history is malformed.
    const history = usage?.history;
    if (!Array.isArray(history)) throw new Error("missing usage history for /ai-gateway/");
    const billedSpendUsd = history.reduce(
      (total: number, entry: any) => total + requireNumber(entry?.aggregated_value, "aggregated_value"),
      0,
    );
    return {
      available: true,
      billedSpendUsd,
      capUsd: cap.capUsd,
      capSource: cap.capSource,
      windowDays: cap.windowDays,
    };
  } catch (err) {
    return { available: false, reason: logFailure(err) };
  }
}

async function fetchCap(
  env: Env, fetchImpl: typeof fetch,
): Promise<{ capUsd: number; capSource: "gateway" | "account"; windowDays: number }> {
  try {
    const gateway = await cfGet(env, fetchImpl, `/ai-gateway/gateways/${env.AI_GATEWAY_ID}`);
    const rule = gatewayCapRule(gateway);
    return {
      capUsd: requireNumber(rule?.limit, "spend_limits.rules[].limit"),
      capSource: "gateway",
      windowDays: windowDays(rule?.window),
    };
  } catch {
    // Deprecated by Cloudflare (its POST sibling always 403s now) and every
    // config field is nullable, so this fallback frequently has nothing to give
    // - which is a cap we do not know, not a cap of zero.
    const account = await cfGet(env, fetchImpl, "/ai-gateway/billing/spending-limit");
    // A stored amount under a disabled limit is not a cap.
    if (account?.enabled === false) throw new Error("cap disabled for /ai-gateway/");
    return {
      // The ONE money field on this surface whose unit Cloudflare documents,
      // and it is cents. Reported raw it overstated the cap a hundredfold.
      capUsd: requireNumber(account?.config?.amount, "config.amount") / 100,
      capSource: "account",
      windowDays: DURATION_DAYS[String(account?.config?.duration)] ?? 30,
    };
  }
}

const DURATION_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

// Cloudflare states a rule's window in seconds. A cap with no readable window
// is read as monthly, the only duration the account-level endpoint ever offered
// and the one this product's cap uses.
const windowDays = (seconds: unknown): number =>
  typeof seconds === "number" && seconds > 0 ? Math.round(seconds / 86400) : 30;

export async function readMonitoringSnapshot(env: Env): Promise<ReturnType<typeof parseMonitoringSnapshot>> {
  // JSON.parse belongs INSIDE this seam. Left outside, a truncated or
  // corrupted KV value threw out of the route as a 500 — while the client
  // already had a "the snapshot could not be trusted" state that would never
  // be reached. An unreadable value is no snapshot, which is a thing the page
  // knows how to say.
  const raw = await env.KV.get("monitoring:snapshot");
  if (!raw) return null;
  try {
    return parseMonitoringSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ctx carries the ONE snapshot read the route makes, so a second source never
// re-reads KV for its own answer (F11: was two reads, one per call site).
export type NotificationContext = { env: Env; snapshot: ReturnType<typeof parseMonitoringSnapshot> | null };
export type NotificationSource = (ctx: NotificationContext) => Promise<number>;

/** The red thresholds, read defensively.
 *
 *  `Number(env.X ?? 5)` catches an ABSENT var and nothing else, and two
 *  reachable states walked straight past it. An EMPTY var — this repo's own
 *  idiom, `--var ACCESS_TEAM_DOMAIN:` in the web-server harness — reads as 0,
 *  making a floor no balance can fall below and silently disabling the alarm.
 *  A typo like "80%" reads as NaN: every comparison against it is false, the
 *  red evaluation is off with no signal, and `floorUsd: NaN` serialises to
 *  null, which the client rejects — replacing the WHOLE panel with "the
 *  snapshot could not be trusted", pointing the reader at the snapshot instead
 *  of at the var that broke.
 *
 *  A threshold that cannot be read is the default, not zero and not NaN. */
function threshold(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isFinite(value) ? value : fallback;
}

export function redThresholds(env: Env): { floorUsd: number; ceilingPct: number } {
  return {
    floorUsd: threshold(env.AI_CREDIT_FLOOR_USD, 5),
    ceilingPct: threshold(env.AI_CAP_CEILING_PCT, 80),
  };
}

function aiBudgetRed(ctx: NotificationContext): Promise<number> {
  if (!ctx.snapshot) return Promise.resolve(0);
  const { floorUsd, ceilingPct } = redThresholds(ctx.env);
  return Promise.resolve(evaluateRed(ctx.snapshot, floorUsd, ceilingPct) ? 1 : 0);
}

/** Sum what the sources can answer, and let the rest fail alone.
 *
 *  Promise.all rejects on the first rejection, so one broken source would have
 *  rejected the whole /api/ops/monitoring payload — hiding the AI cards, the
 *  counts and every other notification because an unrelated source threw. A
 *  source that cannot answer contributes nothing and stops nothing. */
export async function countFrom(
  sources: readonly NotificationSource[],
  ctx: NotificationContext,
): Promise<number> {
  const settled = await Promise.allSettled(sources.map((source) => source(ctx)));
  let total = 0;
  for (const result of settled) {
    if (result.status === "fulfilled") total += result.value;
    else console.log(`ai-parse monitoring: a notification source failed: ${String(result.reason)}`);
  }
  return total;
}

export const NOTIFICATION_SOURCES: readonly NotificationSource[] = [aiBudgetRed];

// The snapshot is REQUIRED: both callers already hold the one KV read this
// route makes, and an optional parameter that silently re-reads KV is how the
// two-reads bug got in the first time.
export async function notificationCount(
  env: Env,
  snapshot: ReturnType<typeof parseMonitoringSnapshot> | null,
): Promise<number> {
  return countFrom(NOTIFICATION_SOURCES, { env, snapshot });
}


// The one read the route needs: snapshot (enriched with the server-evaluated
// red flag + configured floor/ceiling, UX §6.2) and notificationCount, both
// derived from a SINGLE KV get (F3 + F11, docs/runs/ai-parse-monitoring/06-verify.md).
export async function monitoringPayload(env: Env): Promise<{ snapshot: unknown; notificationCount: number }> {
  const snapshot = await readMonitoringSnapshot(env);
  if (!snapshot) return { snapshot: null, notificationCount: await notificationCount(env, null) };
  const { floorUsd: floor, ceilingPct: ceiling } = redThresholds(env);
  const red = evaluateRedFlags(snapshot, floor, ceiling);
  return {
    // floorUsd travels because the balance card prints it ("Below the $5.00
    // floor"). The ceiling does not: the cap card shows the percentage USED,
    // never the threshold, so shipping it would be a field nothing reads.
    snapshot: { ...snapshot, redBalance: red.balance, redCap: red.cap, floorUsd: floor },
    notificationCount: await notificationCount(env, snapshot),
  };
}
