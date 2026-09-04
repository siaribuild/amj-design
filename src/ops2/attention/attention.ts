// The Attention model — pure functions, no React. Bundled by
// scripts/tests/ops2-attention.test.mjs exactly the way
// ops2-navigation.test.mjs bundles destinations.ts.
//
// Design: docs/runs/ops2-attention/02-design.md §3.

import { WAIT_CHIPS, type ChipKey } from "../projects/queue";
import { destination, type DestinationId } from "../nav/destinations";

export type SummaryCounts = {
  submissions: number;
  inReview: number;
  readyToIssue: number;
  awaitingPayment: number;
  newEnquiries: number;
  tradeApplications: number;
};

const SUMMARY_KEYS: readonly (keyof SummaryCounts)[] = [
  "submissions",
  "inReview",
  "readyToIssue",
  "awaitingPayment",
  "newEnquiries",
  "tradeApplications",
];

/**
 * Strict on purpose (G4): a body that cannot be counted is DEGRADED, never
 * zero. `degraded: true` → "degraded". Any of the six keys missing or not a
 * finite number → "degraded" too — an under-claiming parse here is exactly
 * the reassuring lie the legacy dashboard told.
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

export type AttentionRow = {
  key: keyof SummaryCounts;
  count: number;
  label: string; // sentence-style, number leading ("4 new submissions")
  href: string; // path from nav/destinations + optional ?wait=
};

export type AttentionGroup = {
  id: DestinationId; // "projects" | "enquiries" | "customers"
  label: string;
  rows: AttentionRow[];
};

function projectsHref(wait: ChipKey): string {
  const key = WAIT_CHIPS.find((c) => c.key === wait)?.key;
  if (!key) throw new Error(`ops2: no WAIT_CHIPS entry for "${wait}"`);
  return `${destination("projects").path}?wait=${key}`;
}

type RowSpec = {
  key: keyof SummaryCounts;
  label: (count: number) => string;
  href: string;
};

const GROUP_SPECS: readonly { id: DestinationId; rows: readonly RowSpec[] }[] = [
  {
    id: "projects",
    rows: [
      { key: "submissions", label: (n) => `${n} new submission${n === 1 ? "" : "s"}`, href: projectsHref("us") },
      { key: "inReview", label: (n) => `${n} being priced`, href: projectsHref("us") },
      { key: "readyToIssue", label: (n) => `${n} ready to issue`, href: projectsHref("us") },
      { key: "awaitingPayment", label: (n) => `${n} awaiting payment`, href: projectsHref("customer") },
    ],
  },
  {
    id: "enquiries",
    rows: [
      { key: "newEnquiries", label: (n) => `${n} nobody has replied to`, href: destination("enquiries").path },
    ],
  },
  {
    id: "customers",
    rows: [
      {
        key: "tradeApplications",
        label: (n) => `${n} trade application${n === 1 ? "" : "s"} waiting on a decision`,
        href: destination("customers").path,
      },
    ],
  },
];

/**
 * Zero-suppressed at both levels (G2): a zero count emits no row; a group
 * whose rows are all suppressed is absent entirely. All six zero → [].
 * Group order fixed: Projects, Enquiries, Customers. Within Projects,
 * lifecycle order: submissions, inReview, readyToIssue, awaitingPayment.
 */
export function attentionGroups(counts: SummaryCounts): AttentionGroup[] {
  const groups: AttentionGroup[] = [];
  for (const spec of GROUP_SPECS) {
    const rows: AttentionRow[] = [];
    for (const rowSpec of spec.rows) {
      const count = counts[rowSpec.key];
      if (count === 0) continue;
      rows.push({ key: rowSpec.key, count, label: rowSpec.label(count), href: rowSpec.href });
    }
    if (rows.length === 0) continue;
    groups.push({ id: spec.id, label: destination(spec.id).label, rows });
  }
  return groups;
}
