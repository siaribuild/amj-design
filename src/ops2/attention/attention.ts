// The Attention model — pure functions, no React. Bundled by
// scripts/tests/ops2-attention.test.mjs exactly the way
// ops2-navigation.test.mjs bundles destinations.ts.
//
// Design: docs/runs/ops2-attention-prefilter/02-design.md §3.2.

import { destination, type DestinationId } from "../nav/destinations";
import {
  ATTENTION_ARRIVALS,
  arrivalQuery,
  selectProjects,
  type AttentionKey,
  type ProjectQueueRow,
} from "../projects/queue";
import type { SummaryLoad } from "./useSummary";
import type { QueueLoad } from "../projects/useProjectQueue";

/** Only what Attention still reads from /api/ops/summary (P4) — the four
 *  project counts moved to the queue selector below. */
export type SummaryCounts = {
  newEnquiries: number;
  tradeApplications: number;
};

const SUMMARY_KEYS: readonly (keyof SummaryCounts)[] = ["newEnquiries", "tradeApplications"];

/**
 * Strict on purpose (G4): a body that cannot be counted is DEGRADED, never
 * zero. `degraded: true` → "degraded". Either key missing or not a finite
 * number → "degraded" too — an under-claiming parse here is exactly the
 * reassuring lie the legacy dashboard told. Project-count fields (the old
 * weak summary SQL) are simply unread.
 */
export function parseSummary(body: unknown): SummaryCounts | "degraded" {
  if (typeof body !== "object" || body === null) return "degraded";
  const record = body as Record<string, unknown>;
  if (record.degraded === true) return "degraded";
  const counts: Partial<SummaryCounts> = {};
  for (const key of SUMMARY_KEYS) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return "degraded";
    counts[key] = value;
  }
  return counts as SummaryCounts;
}

export type AttentionLoad =
  | { status: "loading" }
  | { status: "ready"; counts: SummaryCounts; rows: readonly ProjectQueueRow[] }
  | { status: "error"; headline: string; detail: string }
  | { status: "unauthorised"; headline: string; detail: string };

/**
 * Ready only when BOTH sources answered; any failure is the whole page's
 * failure (criterion 15: a count that cannot be derived is drawn as failure,
 * never zero). Precedence: unauthorised > error > loading > ready. Only
 * `summary` can carry "unauthorised" — `useProjectQueue` folds its own
 * 401/403 into "error".
 */
export function combineLoads(summary: SummaryLoad, queue: QueueLoad): AttentionLoad {
  if (summary.status === "unauthorised") return summary;
  if (summary.status === "error") return summary;
  if (queue.status === "error") return queue;
  if (summary.status === "loading" || queue.status === "loading") return { status: "loading" };
  return { status: "ready", counts: summary.counts, rows: queue.rows };
}

export type AttentionRow = {
  key: AttentionKey | keyof SummaryCounts;
  count: number;
  /** The work, without its number ("new submissions"). The page renders it in
   *  its own slot beside the count so the number can be tabular and leading
   *  (mock §2). */
  noun: string;
  href: string; // path from nav/destinations + optional ?attn=
};

export type AttentionGroup = {
  id: DestinationId; // "projects" | "enquiries" | "customers"
  label: string;
  rows: AttentionRow[];
};

const PROJECT_NOUNS: Record<AttentionKey, (count: number) => string> = {
  submissions: (n) => `new submission${n === 1 ? "" : "s"}`,
  inReview: () => "being priced",
  ready: () => "ready to issue",
  awaitingPayment: () => "awaiting payment",
};

/**
 * Projects rows: count = selectProjects(rows, arrivalQuery(key)).length,
 * the same selector the queue itself counts and lists through — the number
 * on this page and the list it opens can never disagree. Zero-suppressed
 * (criterion 14), lifecycle order fixed by ATTENTION_ARRIVALS.
 */
function projectRows(rows: readonly ProjectQueueRow[]): AttentionRow[] {
  const rowsOut: AttentionRow[] = [];
  for (const key of ATTENTION_ARRIVALS) {
    const count = selectProjects(rows, arrivalQuery(key)).length;
    if (count === 0) continue;
    rowsOut.push({
      key,
      count,
      noun: PROJECT_NOUNS[key](count),
      href: `${destination("projects").path}?attn=${key}`,
    });
  }
  return rowsOut;
}

/**
 * Zero-suppressed at both levels (G2): a zero count emits no row; a group
 * whose rows are all suppressed is absent entirely. Group order fixed:
 * Projects, Enquiries, Customers. Enquiries/Customers rows pass straight
 * through from the summary counts, unchanged from before (P4/13).
 */
export function attentionGroups(
  counts: SummaryCounts,
  rows: readonly ProjectQueueRow[],
): AttentionGroup[] {
  const groups: AttentionGroup[] = [];

  // A PAYLOAD THAT LOST THE FIELD IS A FAILURE TO TELL, NOT A CLEAR DAY.
  //
  // `parseProjectQueue` under-claims a missing `statusCustomer` to "" so one odd
  // row matches no predicate — right for one row, and dangerous for all of them.
  // If the endpoint stops sending the field (exactly what it did before this
  // feature added it), every project predicate counts zero, a zero count draws
  // no row, and the gate shows silence. Silence on this screen reads as "nothing
  // is waiting", which is the one wrong answer it must never give — and is
  // precisely how F1 shipped invisibly.
  //
  // Rows present and NOT ONE carrying a status is not a state the API can
  // legitimately produce: a real project always has a `status_customer`. So it
  // is a broken payload, and it is thrown rather than counted. `useSummary`'s
  // caller renders the error panel, which says the counts could not be read.
  if (rows.length > 0 && rows.every((r) => !r.statusCustomer)) {
    throw new Error(
      "attention: no row carried a statusCustomer — the projects payload is missing the field, " +
      "so no count can be trusted (drawing zero here would read as an empty console)",
    );
  }

  const projects = projectRows(rows);
  if (projects.length > 0) {
    groups.push({ id: "projects", label: destination("projects").label, rows: projects });
  }

  if (counts.newEnquiries > 0) {
    groups.push({
      id: "enquiries",
      label: destination("enquiries").label,
      rows: [{
        key: "newEnquiries",
        count: counts.newEnquiries,
        noun: "waiting for a reply",
        href: destination("enquiries").path,
      }],
    });
  }

  if (counts.tradeApplications > 0) {
    groups.push({
      id: "customers",
      label: destination("customers").label,
      rows: [{
        key: "tradeApplications",
        count: counts.tradeApplications,
        noun: `trade application${counts.tradeApplications === 1 ? "" : "s"} waiting on a decision`,
        href: destination("customers").path,
      }],
    });
  }

  return groups;
}
