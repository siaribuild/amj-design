// AI parse monitoring — IO shell: D1 counts, CF money fetch, KV snapshot,
// notification sources. Design: docs/runs/ai-parse-monitoring/02-design.md §3.2, §5, §6.
import type { Env } from "../types";
import { assembleParseCounts, evaluateRed, parseMonitoringSnapshot } from "../../src/data/monitoring";

const PARSE_OUTCOME_SQL = `SELECT updated_at,
       CASE WHEN status = 'completed' THEN 'success' ELSE 'error' END AS outcome
FROM ai_job_claim
WHERE triggered_by = 'upload'
  AND updated_at >= datetime(?, '-7 days')
  AND (status = 'completed'
       OR status = 'failed'
       OR (status = 'processing' AND updated_at < datetime(?, '-30 minutes')))`;

export async function writeMonitoringSnapshot(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  const now = new Date();
  const { results } = await env.DB.prepare(PARSE_OUTCOME_SQL).bind(now.toISOString(), now.toISOString()).all();
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

export async function fetchMoneyNumbers(env: Env, fetchImpl: typeof fetch = fetch): Promise<MoneySnapshot> {
  if (!env.CF_MONITORING_TOKEN) return { available: false, reason: "token_missing" };
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

export type NotificationSource = (env: Env) => Promise<number>;

async function aiBudgetRed(env: Env): Promise<number> {
  const snapshot = await readMonitoringSnapshot(env);
  if (!snapshot) return 0;
  const floor = Number(env.AI_CREDIT_FLOOR_USD ?? 5);
  const ceiling = Number(env.AI_CAP_CEILING_PCT ?? 80);
  return evaluateRed(snapshot as any, floor, ceiling) ? 1 : 0;
}

export const NOTIFICATION_SOURCES: readonly NotificationSource[] = [aiBudgetRed];

export async function notificationCount(env: Env): Promise<number> {
  const counts = await Promise.all(NOTIFICATION_SOURCES.map((source) => source(env)));
  return counts.reduce((total, n) => total + n, 0);
}
