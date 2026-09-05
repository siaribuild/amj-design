// AI parse monitoring — pure core: snapshot types, bucketing, red evaluation.
// No IO, no Worker types. Design: docs/runs/ai-parse-monitoring/02-design.md §3.1-3.3.

/** The money half of a snapshot. Declared HERE, once: the Worker's IO shell and
 *  the console's hook both used to carry their own copy of this union, which is
 *  two places for one fact and the way they come to disagree. */
export type MoneySnapshot =
  | { available: true; creditBalanceUsd: number; billedSpendUsd: number; capUsd: number; capSource: "gateway" | "account" }
  | { available: false; reason: string };

/** What the cron stores and this module vouches for. The route adds the
 *  evaluated `red` and its thresholds on the way out (MonitoringPayload). */
export type StoredSnapshot = {
  takenAt: string;
  money: MoneySnapshot;
  days: { day: string; success: number; error: number }[];
  success7d: number;
  error7d: number;
};

// REBUILDS the snapshot field by field rather than validating in place. This is
// the boundary between stored JSON and a staff-visible payload: returning the
// caller's own object would carry anything else the value happened to hold —
// a token, an account id, a debug field — straight through to the client. Only
// the fields below ever cross.
//
// The declared return type is the point: as `unknown` it forced an `as any` at
// every call site, so the one module that actually knows the shape was the only
// one that could not say it.
export function parseMonitoringSnapshot(body: unknown): StoredSnapshot | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.money !== "object" || record.money === null) return null;
  const source = record.money as Record<string, unknown>;
  // === true / === false only: anything else (a string "yes") would match
  // neither branch, skip every field check below, and pass as a valid snapshot.
  let money: MoneySnapshot;
  if (source.available === true) {
    if (typeof source.creditBalanceUsd !== "number") return null;
    if (typeof source.billedSpendUsd !== "number") return null;
    if (typeof source.capUsd !== "number") return null;
    if (typeof source.capSource !== "string") return null;
    money = {
      available: true,
      creditBalanceUsd: source.creditBalanceUsd,
      billedSpendUsd: source.billedSpendUsd,
      capUsd: source.capUsd,
      capSource: source.capSource as "gateway" | "account",
    };
  } else if (source.available === false) {
    if (typeof source.reason !== "string") return null;
    money = { available: false, reason: source.reason };
  } else return null;
  if (!Array.isArray(record.days) || record.days.length !== 7) return null;
  const days = [];
  for (const d of record.days) {
    if (typeof d !== "object" || d === null) return null;
    const bucket = d as Record<string, unknown>;
    if (typeof bucket.day !== "string") return null;
    if (typeof bucket.success !== "number") return null;
    if (typeof bucket.error !== "number") return null;
    days.push({ day: bucket.day, success: bucket.success, error: bucket.error });
  }
  if (typeof record.success7d !== "number") return null;
  if (typeof record.error7d !== "number") return null;
  if (typeof record.takenAt !== "string") return null;
  return { takenAt: record.takenAt, money, days, success7d: record.success7d, error7d: record.error7d };
}

const MELBOURNE_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" });

function melbourneDayKey(date: Date): string {
  return MELBOURNE_DAY.format(date);
}

const MELBOURNE_WALL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Melbourne", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Melbourne's UTC offset at `instant`, in ms. Read the wall clock there, parse
 *  it back as if it were UTC, and the difference IS the offset — which is how
 *  this stays right across the DST switch without a timezone library. */
function melbourneOffsetMs(instant: Date): number {
  const p = Object.fromEntries(MELBOURNE_WALL.formatToParts(instant).map((x) => [x.type, x.value]));
  const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  return wall - instant.getTime();
}

/** The seven Melbourne calendar dates the chart covers, oldest first, ending on
 *  the Melbourne date of `now`.
 *
 *  Stepping back in 24-hour jumps and formatting each instant is what this used
 *  to do, and it is wrong twice a year: on the day Melbourne springs forward,
 *  `now − 24h` lands on the same calendar date it started from, so one date is
 *  emitted twice and another is skipped entirely — rows for the missing date
 *  then count toward the cards with no bucket to sit in. Calendar dates are
 *  counted in dates. UTC has no DST, so a UTC-anchored date does that exactly. */
function melbourneDayKeys(now: Date): string[] {
  const anchor = Date.parse(`${melbourneDayKey(now)}T00:00:00Z`);
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(new Date(anchor - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  }
  return keys;
}

/** The instant the earliest chart bucket begins: 00:00 Melbourne on the oldest
 *  of those seven dates.
 *
 *  The SQL window MUST start here and not at `now − 7×24h`. A rolling window
 *  reaches further back than the buckets do, so the query returns rows no
 *  bucket can hold, and the card totals then disagree with the chart they sit
 *  beside (criterion 13). One window, one boundary, both surfaces. */
export function parseWindowStart(now: Date): Date {
  const naive = Date.parse(`${melbourneDayKeys(now)[0]}T00:00:00Z`);
  // Second pass: the first offset is read at the wrong instant when midnight
  // sits on the far side of a DST change, and re-reading it at the corrected
  // instant lands on the right side of the switch.
  const first = naive - melbourneOffsetMs(new Date(naive));
  return new Date(naive - melbourneOffsetMs(new Date(first)));
}

export function assembleParseCounts(
  rows: { updatedAt: string; outcome: "success" | "error" }[],
  now: Date,
): { success7d: number; error7d: number; days: { day: string; success: number; error: number }[] } {
  const days = melbourneDayKeys(now).map((day) => ({ day, success: 0, error: 0 }));
  const byDay = new Map(days.map((d) => [d.day, d]));
  let success7d = 0;
  let error7d = 0;
  for (const row of rows) {
    // The totals count EVERY row handed in, whether or not a bucket holds it.
    // The query is bounded at the earliest bucket's midnight (parseWindowStart),
    // so in production there is nothing outside — and if a caller ever passes
    // something older, the cards under-report rather than silently discard it.
    const bucket = byDay.get(melbourneDayKey(new Date(row.updatedAt)));
    if (row.outcome === "success") {
      success7d++;
      if (bucket) bucket.success++;
    } else {
      error7d++;
      if (bucket) bucket.error++;
    }
  }
  return { success7d, error7d, days };
}

/** Is spend past the cap's ceiling? The ONE place that question is answered.
 *
 *  The page used to ask it a second way — round the percentage for display,
 *  then compare the rounded number on `>=` — which disagreed with this one
 *  across a whole percent: at 79.6% of an 80% ceiling the card carried a
 *  warning while the red flag and the notification bubble both said fine.
 *  Round for the eye, never for the decision. */
export function capBreached(
  money: { billedSpendUsd: number; capUsd: number },
  ceilingPct: number,
): boolean {
  // A cap of zero is no headroom at all — the very state this card exists to
  // warn about. Left to the division it reads as NaN (quietly "not breached")
  // with no spend and Infinity with a single cent, so one account would flip
  // on its first request of the month.
  if (money.capUsd <= 0) return true;
  return (money.billedSpendUsd / money.capUsd) * 100 > ceilingPct;
}

/** The two conditions, answered separately.
 *
 *  UX §6.2 asks for precomputed red *flags* and says two conditions red at once
 *  render as two red cards — so one condition red must redden one card. A
 *  single boolean could not express that: painting both cards from it reddened
 *  a healthy balance because the cap was high, telling the reader to act on the
 *  wrong number. The bell still counts the pair as ONE notification. */
export function evaluateRedFlags(
  snapshot: { money: MoneySnapshot },
  floorUsd: number,
  ceilingPct: number,
): { balance: boolean; cap: boolean } {
  const money = snapshot.money;
  if (money.available === false) return { balance: false, cap: false };
  return {
    balance: money.creditBalanceUsd < floorUsd,
    cap: capBreached(money, ceilingPct),
  };
}

export function evaluateRed(
  snapshot: { money: MoneySnapshot },
  floorUsd: number,
  ceilingPct: number,
): boolean {
  const flags = evaluateRedFlags(snapshot, floorUsd, ceilingPct);
  return flags.balance || flags.cap;
}

export function capOutstanding(money: { capUsd: number; billedSpendUsd: number }): number {
  return money.capUsd - money.billedSpendUsd;
}
