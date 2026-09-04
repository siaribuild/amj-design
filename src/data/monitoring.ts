// AI parse monitoring — pure core: snapshot types, bucketing, red evaluation.
// No IO, no Worker types. Design: docs/runs/ai-parse-monitoring/02-design.md §3.1-3.3.

export function parseMonitoringSnapshot(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.money !== "object" || record.money === null) return null;
  const money = record.money as Record<string, unknown>;
  if (money.available === true && typeof money.creditBalanceUsd !== "number") return null;
  if (money.available === true && typeof money.billedSpendUsd !== "number") return null;
  if (money.available === true && typeof money.capUsd !== "number") return null;
  if (money.available === true && typeof money.capSource !== "string") return null;
  if (money.available === false && typeof money.reason !== "string") return null;
  if (!Array.isArray(record.days) || record.days.length !== 7) return null;
  for (const d of record.days) {
    if (typeof d !== "object" || d === null) return null;
    const bucket = d as Record<string, unknown>;
    if (typeof bucket.day !== "string") return null;
    if (typeof bucket.success !== "number") return null;
    if (typeof bucket.error !== "number") return null;
  }
  if (typeof record.success7d !== "number") return null;
  if (typeof record.error7d !== "number") return null;
  return record;
}

const MELBOURNE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" });

function melbourneDayKey(date: Date): string {
  return MELBOURNE_DAY.format(date);
}

export function assembleParseCounts(
  rows: { updatedAt: string; outcome: "success" | "error" }[],
  now: Date,
): { success7d: number; error7d: number; days: { day: string; success: number; error: number }[] } {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push({ day: melbourneDayKey(d), success: 0, error: 0 });
  }
  const byDay = new Map(days.map((d) => [d.day, d]));
  let success7d = 0;
  let error7d = 0;
  for (const row of rows) {
    const bucket = byDay.get(melbourneDayKey(new Date(row.updatedAt)));
    if (!bucket) continue;
    if (row.outcome === "success") {
      bucket.success++;
      success7d++;
    } else {
      bucket.error++;
      error7d++;
    }
  }
  return { success7d, error7d, days };
}

export function evaluateRed(
  snapshot: {
    money:
      | { available: true; creditBalanceUsd: number; billedSpendUsd: number; capUsd: number }
      | { available: false };
  },
  floorUsd: number,
  ceilingPct: number,
): boolean {
  const money = snapshot.money;
  if (money.available === false) return false;
  if (money.creditBalanceUsd < floorUsd) return true;
  if ((money.billedSpendUsd / money.capUsd) * 100 > ceilingPct) return true;
  return false;
}

export function capOutstanding(money: { capUsd: number; billedSpendUsd: number }): number {
  return money.capUsd - money.billedSpendUsd;
}
