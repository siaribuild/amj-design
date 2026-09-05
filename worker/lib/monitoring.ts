// AI parse monitoring — IO shell: D1 counts, CF money fetch, KV snapshot,
// notification sources. Design: docs/runs/ai-parse-monitoring/02-design.md §3.2, §5, §6.
import type { Env } from "../types";
import { assembleParseCounts, evaluateRed, parseMonitoringSnapshot, parseWindowStart } from "../../src/data/monitoring";

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

type MoneySnapshot =
  | { available: true; creditBalanceUsd: number; billedSpendUsd: number; capUsd: number; capSource: "gateway" | "account" }
  | { available: false; reason: string };

// Logs only the endpoint path suffix + status — never the token, never the
// Authorization header, never the account id in a full URL (design §8).
function pathSuffix(url: string): string {
  const i = url.indexOf("/ai-gateway/");
  return i === -1 ? "?" : url.slice(i);
}

async function cfGet(env: Env, fetchImpl: typeof fetch, path: string): Promise<any> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}${path}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.CF_MONITORING_TOKEN}` } });
  if (!res.ok) throw new Error(`status ${res.status} for ${pathSuffix(url)}`);
  const body = await res.json();
  return body.result;
}

// Kept as a real string (not imported from wrangler.jsonc) so this check
// stays valid even if the comment above the placeholder in wrangler.jsonc changes.
const PLACEHOLDER_ACCOUNT_ID = "paste-real-cf-account-id-before-deploying";

export async function fetchMoneyNumbers(env: Env, fetchImpl: typeof fetch = fetch): Promise<MoneySnapshot> {
  if (!env.CF_MONITORING_TOKEN) return { available: false, reason: "token_missing" };
  if (!env.CF_ACCOUNT_ID || env.CF_ACCOUNT_ID === PLACEHOLDER_ACCOUNT_ID) {
    return { available: false, reason: "account_id_missing" };
  }
  try {
    const [balance, usage] = await Promise.all([
      cfGet(env, fetchImpl, "/ai-gateway/billing/credit-balance"),
      cfGet(env, fetchImpl, "/ai-gateway/billing/usage-history"),
    ]);
    let capUsd: number;
    let capSource: "gateway" | "account";
    try {
      const gateway = await cfGet(env, fetchImpl, `/ai-gateway/gateways/${env.AI_GATEWAY_ID}`);
      capUsd = gateway.spend_limits.rules[0].amount;
      capSource = "gateway";
    } catch {
      const account = await cfGet(env, fetchImpl, "/ai-gateway/billing/spending-limit");
      capUsd = account.limit;
      capSource = "account";
    }
    return { available: true, creditBalanceUsd: balance.balance, billedSpendUsd: usage.totalUsd, capUsd, capSource };
  } catch (err) {
    const path = err instanceof Error ? err.message.replace(/^status \d+ for /, "") : "?";
    console.log(`ai-parse monitoring: CF fetch failed for ${path}`);
    return { available: false, reason: "fetch_failed" };
  }
}

export async function readMonitoringSnapshot(env: Env): Promise<ReturnType<typeof parseMonitoringSnapshot>> {
  const raw = await env.KV.get("monitoring:snapshot");
  if (!raw) return null;
  return parseMonitoringSnapshot(JSON.parse(raw));
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
  const red = evaluateRed(snapshot as any, floor, ceiling);
  return {
    snapshot: { ...(snapshot as Record<string, unknown>), red, floorUsd: floor, ceilingPct: ceiling },
    notificationCount: await notificationCount(env, snapshot),
  };
}
