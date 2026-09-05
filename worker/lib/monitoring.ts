// AI parse monitoring — IO shell: D1 counts, CF money fetch, KV snapshot,
// notification sources. Design: docs/runs/ai-parse-monitoring/02-design.md §3.2, §5, §6.
import type { Env } from "../types";
import {
  assembleParseCounts, evaluateRed, evaluateRedFlags, parseMonitoringSnapshot, parseWindowStart,
  type MoneySnapshot,
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
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${env.CF_MONITORING_TOKEN}` },
    signal: AbortSignal.timeout(Number(env.CF_TIMEOUT_MS ?? CF_TIMEOUT_MS)),
  });
  if (!res.ok) throw new Error(`status ${res.status} for ${pathSuffix(url)}`);
  const body = await res.json<{ result?: unknown }>();
  return body.result;
}

// Reading a field Cloudflare does not send yields undefined rather than
// throwing, and an undefined that reaches the snapshot is dropped by
// JSON.stringify — which made the parser reject the WHOLE snapshot and hid the
// D1 counts as well. Every number crossing this boundary is checked here.
function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing ${field} for /ai-gateway/`);
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
 *  failing to the account fallback. */
function gatewayCapUsd(gateway: any): number | undefined {
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
  return whole?.limit;
}

export async function fetchMoneyNumbers(env: Env, fetchImpl: typeof fetch = fetch): Promise<MoneySnapshot> {
  if (!env.CF_MONITORING_TOKEN) return { available: false, reason: "token_missing" };
  if (!env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID === PLACEHOLDER_ACCOUNT_ID) {
    return { available: false, reason: "account_id_missing" };
  }
  try {
    const [balance, usage] = await Promise.all([
      cfGet(env, fetchImpl, "/ai-gateway/billing/credit-balance"),
      // value_grouping_window is REQUIRED; without it this is a 400 and the
      // money half of the console never works at all. 'day' because the cards
      // report a month to date, not an hourly curve.
      cfGet(env, fetchImpl, "/ai-gateway/billing/usage-history?value_grouping_window=day"),
    ]);
    // history[] is a series of windows, so the spend is their sum — there is no
    // single total field on this response. An EMPTY array is a real answer: a
    // billing window with nothing billable in it. Only a missing or non-array
    // history is malformed; treating [] as broken hid the balance and the cap
    // too, in the quiet month where they are the only news there is.
    const history = usage?.history;
    if (!Array.isArray(history)) throw new Error("missing usage history for /ai-gateway/");
    const billedSpendUsd = history.reduce(
      (total: number, entry: any) => total + requireNumber(entry?.aggregated_value, "aggregated_value"),
      0,
    );
    let capUsd: number;
    let capSource: "gateway" | "account";
    try {
      const gateway = await cfGet(env, fetchImpl, `/ai-gateway/gateways/${env.AI_GATEWAY_ID}`);
      capUsd = requireNumber(gatewayCapUsd(gateway), "spend_limits.rules[].limit");
      capSource = "gateway";
    } catch {
      // Deprecated by Cloudflare (its POST sibling always 403s now) and every
      // config field is nullable, so this is a fallback that frequently has
      // nothing to give — which is a cap we do not know, not a cap of zero.
      const account = await cfGet(env, fetchImpl, "/ai-gateway/billing/spending-limit");
      // Same rule as the gateway's: a stored amount under a disabled limit is
      // not a cap. Every field of this config is nullable, and Cloudflare has
      // deprecated the endpoint that sets it, so "nothing to give" is the
      // normal answer here rather than the exceptional one.
      if (account?.enabled === false) throw new Error("cap disabled for /ai-gateway/");
      // The ONE money field on this surface whose unit Cloudflare documents,
      // and it is cents. Reported raw it overstated the cap a hundredfold.
      capUsd = requireNumber(account?.config?.amount, "config.amount") / 100;
      capSource = "account";
    }
    return {
      available: true,
      creditBalanceUsd: requireNumber(balance?.balance, "balance"),
      billedSpendUsd,
      capUsd,
      capSource,
    };
  } catch (err) {
    const path = err instanceof Error ? err.message.replace(/^status \d+ for /, "") : "?";
    console.log(`ai-parse monitoring: CF fetch failed for ${path}`);
    return { available: false, reason: "fetch_failed" };
  }
}

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

function aiBudgetRed(ctx: NotificationContext): Promise<number> {
  if (!ctx.snapshot) return Promise.resolve(0);
  const floor = Number(ctx.env.AI_CREDIT_FLOOR_USD ?? 5);
  const ceiling = Number(ctx.env.AI_CAP_CEILING_PCT ?? 80);
  return Promise.resolve(evaluateRed(ctx.snapshot as any, floor, ceiling) ? 1 : 0);
}

export const NOTIFICATION_SOURCES: readonly NotificationSource[] = [aiBudgetRed];

// snapshot is optional so existing single-argument callers (and tests) keep
// their own KV read; monitoringPayload passes the one it already made.
export async function notificationCount(
  env: Env,
  snapshot?: ReturnType<typeof parseMonitoringSnapshot> | null,
): Promise<number> {
  const resolved = snapshot !== undefined ? snapshot : await readMonitoringSnapshot(env);
  const counts = await Promise.all(NOTIFICATION_SOURCES.map((source) => source({ env, snapshot: resolved })));
  return counts.reduce((total, n) => total + n, 0);
}

// The one read the route needs: snapshot (enriched with the server-evaluated
// red flag + configured floor/ceiling, UX §6.2) and notificationCount, both
// derived from a SINGLE KV get (F3 + F11, docs/runs/ai-parse-monitoring/06-verify.md).
export async function monitoringPayload(env: Env): Promise<{ snapshot: unknown; notificationCount: number }> {
  const snapshot = await readMonitoringSnapshot(env);
  if (!snapshot) return { snapshot: null, notificationCount: await notificationCount(env, null) };
  const floor = Number(env.AI_CREDIT_FLOOR_USD ?? 5);
  const ceiling = Number(env.AI_CAP_CEILING_PCT ?? 80);
  const red = evaluateRedFlags(snapshot, floor, ceiling);
  return {
    // floorUsd travels because the balance card prints it ("Below the $5.00
    // floor"). The ceiling does not: the cap card shows the percentage USED,
    // never the threshold, so shipping it would be a field nothing reads.
    snapshot: { ...snapshot, redBalance: red.balance, redCap: red.cap, floorUsd: floor },
    notificationCount: await notificationCount(env, snapshot),
  };
}
