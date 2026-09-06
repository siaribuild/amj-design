// Attention model (pure) — scripts/tests/ops2-attention.test.mjs
//
// Bundles src/ops2/attention/attention.ts together with the modules it is
// specified to route through — src/ops2/projects/queue.ts (ATTENTION_FILTERS,
// attentionQuery, selectProjects — the counting selector itself) and
// src/ops2/nav/destinations.ts (DESTINATIONS, the registered-route source of
// truth) — exactly the way ops2-navigation.test.mjs bundles destinations.ts
// with lineRoute.ts. This keeps the model's compile-time types (AttentionKey,
// DestinationId) honest against the runtime data it is required to build
// hrefs from and count against, rather than letting the test assert against
// string literals that could drift from the real registries.
//
// Design: docs/runs/ops2-attention-prefilter/02-design.md §3.2, §5.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const read = (rel) => readFileSync(join(projectRoot, rel), "utf8");

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-attention");
const outfile = join(runDir, "ops2-attention-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { parseSummary, attentionGroups, combineLoads } from ${p("src/ops2/attention/attention.ts")};
      export { ATTENTION_FILTERS, attentionQuery, selectProjects } from ${p("src/ops2/projects/queue.ts")};
      export { DESTINATIONS } from ${p("src/ops2/nav/destinations.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ops2-attention-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
const { parseSummary, attentionGroups, combineLoads, ATTENTION_FILTERS, attentionQuery, selectProjects, DESTINATIONS } = M;

test.after(async () => {
  await removeRunDir(runDir);
});

// A registered pathname for every destination, per criterion 7.
const REGISTERED_PATHS = new Set(DESTINATIONS.map((d) => d.path));
const ATTENTION_KEYS = new Set(ATTENTION_FILTERS.map((f) => f.key));

/** A row in the shape `GET /api/ops/projects` actually returns — the fields
 *  ATTENTION_FILTERS reads, and nothing invented. Mirrors the `row()` helper
 *  in ops2-projects.test.mjs. */
const row = (over = {}) => ({
  id: "p_" + (over.ref ?? "x"), ref: over.ref ?? "OF-Q-10000", title: "A project",
  customerName: "A customer", org: null, lineCount: 1, value: 1000,
  valueBasis: "est.", unresolved: 0, issuable: false, waitingOn: "Us", daysInStage: 1,
  phase: "Pricing", stateLabel: "Pricing", orderNo: null,
  statusCustomer: "", orderStage: null,
  ...over,
});

// PA–PF from docs/runs/ops2-attention-prefilter/02-design.md §5. Counts
// 1 / 2 / 1 / 2 — non-empty, pairwise non-identical, and PF proves narrowing.
const PA_PF = [
  row({ ref: "PA", statusCustomer: "submitted", issuable: false, orderStage: null }),
  row({ ref: "PB", statusCustomer: "under_review", issuable: false, orderStage: null }),
  row({ ref: "PC", statusCustomer: "under_review", issuable: true, orderStage: null }),
  row({ ref: "PD", statusCustomer: "accepted", issuable: false, orderStage: "deposit_invoiced" }),
  row({ ref: "PE", statusCustomer: "accepted", issuable: false, orderStage: "balance_invoiced" }),
  row({ ref: "PF", statusCustomer: "accepted", issuable: false, orderStage: "manufacturing" }),
];

const SUMMARY_COUNTS = { newEnquiries: 2, tradeApplications: 1 };

function projectRow(groups, key) {
  const projects = groups.find((g) => g.id === "projects");
  return projects?.rows.find((r) => r.key === key) ?? null;
}

// Every row's href must resolve to a registered destination pathname (7); a
// project row's query string must be exactly `attn=<AttentionKey>`, an
// enquiries/customers row must carry no query string at all (13, unchanged).
function assertRowHref(row, expectAttn) {
  const url = new URL(row.href, "http://ops2.local");
  assert.ok(
    REGISTERED_PATHS.has(url.pathname),
    `${row.key} href pathname "${url.pathname}" is not a registered destination`,
  );
  if (expectAttn === undefined) {
    assert.equal(url.search, "", `${row.key} href must carry no query string`);
    return;
  }
  assert.equal(url.search, `?attn=${expectAttn}`, `${row.key} href must be exactly ?attn=${expectAttn}`);
}

test("attentionGroups: each project row's count is selectProjects(rows, attentionQuery(key)).length over PA-PF (criteria 1-4)", () => {
  const groups = attentionGroups(SUMMARY_COUNTS, PA_PF);
  for (const filter of ATTENTION_FILTERS) {
    const expected = selectProjects(PA_PF, attentionQuery(filter.key)).length;
    const row = projectRow(groups, filter.key);
    if (expected === 0) {
      assert.equal(row, null, `${filter.key} expected zero-suppressed`);
    } else {
      assert.equal(row.count, expected, `${filter.key} count must equal the filtered list length`);
    }
  }
  // The fixture's own known counts (design §5): 1 / 2 / 1 / 2.
  assert.equal(projectRow(groups, "submissions").count, 1);
  assert.equal(projectRow(groups, "inReview").count, 2);
  assert.equal(projectRow(groups, "readyToIssue").count, 1);
  assert.equal(projectRow(groups, "awaitingPayment").count, 2);
});

test("attentionGroups: Projects lifecycle row order is submissions, inReview, readyToIssue, awaitingPayment (criterion 1)", () => {
  const groups = attentionGroups(SUMMARY_COUNTS, PA_PF);
  const projects = groups.find((g) => g.id === "projects");
  assert.deepEqual(
    projects.rows.map((r) => r.key),
    ["submissions", "inReview", "readyToIssue", "awaitingPayment"],
  );
});

test("attentionGroups: PF matches no predicate, proving narrowing (criterion 5)", () => {
  const groups = attentionGroups(SUMMARY_COUNTS, PA_PF);
  const projects = groups.find((g) => g.id === "projects");
  for (const row of projects.rows) {
    assert.notEqual(row.count, 0);
  }
  // Every set omits at least one row another predicate matches — PB/PD/PE
  // are absent from submissions, PA/PD/PE absent from inReview, etc. Spot
  // check the two that hold every non-matching row.
  assert.equal(selectProjects(PA_PF, attentionQuery("submissions")).length, 1);
  assert.equal(selectProjects(PA_PF, attentionQuery("readyToIssue")).length, 1);
});

test("attentionGroups: a state move flips counts and swaps list membership (criterion 6)", () => {
  const before = attentionGroups(SUMMARY_COUNTS, PA_PF);
  assert.equal(projectRow(before, "submissions").count, 1);
  assert.equal(projectRow(before, "inReview").count, 2);

  const moved = PA_PF.map((r) => (r.ref === "PA" ? { ...r, statusCustomer: "under_review" } : r));
  const after = attentionGroups(SUMMARY_COUNTS, moved);
  assert.equal(projectRow(after, "submissions"), null); // 1 -> 0, suppressed
  assert.equal(projectRow(after, "inReview").count, 3); // 2 -> 3

  const inReviewRefs = selectProjects(moved, attentionQuery("inReview")).map((r) => r.ref);
  assert.deepEqual(inReviewRefs.sort(), ["PA", "PB", "PC"]);
});

test("attentionGroups: readyToIssue is exactly rows.filter(r => r.issuable) whatever else a row claims (criteria 7-8)", () => {
  const rows = [
    ...PA_PF,
    row({ ref: "PG", statusCustomer: "submitted", issuable: true, orderStage: "deposit_invoiced" }),
  ];
  const groups = attentionGroups(SUMMARY_COUNTS, rows);
  const readyRefs = projectRow(groups, "readyToIssue")
    ? selectProjects(rows, attentionQuery("readyToIssue")).map((r) => r.ref)
    : [];
  assert.deepEqual(readyRefs.sort(), rows.filter((r) => r.issuable).map((r) => r.ref).sort());
});

test("attentionGroups: a zero project count emits no row for it (criterion 14)", () => {
  const noSubmissions = PA_PF.filter((r) => r.ref !== "PA");
  const groups = attentionGroups(SUMMARY_COUNTS, noSubmissions);
  assert.equal(projectRow(groups, "submissions"), null);
});

test("attentionGroups: a group whose rows are all zero is absent entirely, remaining groups keep order", () => {
  const groups = attentionGroups({ newEnquiries: 0, tradeApplications: 1 }, PA_PF);
  assert.deepEqual(groups.map((g) => g.id), ["projects", "customers"]);
});

test("attentionGroups: all counts zero (no summary work, no project work) yields an empty array", () => {
  const groups = attentionGroups({ newEnquiries: 0, tradeApplications: 0 }, []);
  assert.deepEqual(groups, []);
});

test("attentionGroups: enquiries and trade rows pass straight through from the summary counts, unchanged from today (P4/13)", () => {
  const groups = attentionGroups(SUMMARY_COUNTS, PA_PF);
  const enquiries = groups.find((g) => g.id === "enquiries");
  const customers = groups.find((g) => g.id === "customers");
  assert.equal(enquiries.rows[0].key, "newEnquiries");
  assert.equal(enquiries.rows[0].count, SUMMARY_COUNTS.newEnquiries);
  assert.equal(customers.rows[0].key, "tradeApplications");
  assert.equal(customers.rows[0].count, SUMMARY_COUNTS.tradeApplications);
});

test("parseSummary: strict on newEnquiries/tradeApplications only — degraded:true, a missing key, and a non-number value all parse to \"degraded\", never a zero count (criterion 18, model side)", () => {
  assert.deepEqual(parseSummary(SUMMARY_COUNTS), SUMMARY_COUNTS);
  assert.equal(parseSummary({ ...SUMMARY_COUNTS, degraded: true }), "degraded");
  const { newEnquiries, ...missing } = SUMMARY_COUNTS;
  assert.equal(parseSummary(missing), "degraded");
  assert.equal(parseSummary({ ...SUMMARY_COUNTS, tradeApplications: "1" }), "degraded");
});

test("parseSummary: no longer accepts project counts — the weak summary SQL for them goes simply unread (criterion 7-8 note)", () => {
  const withProjectFields = {
    ...SUMMARY_COUNTS,
    submissions: 4, inReview: 2, readyToIssue: 1, awaitingPayment: 3,
  };
  assert.deepEqual(parseSummary(withProjectFields), SUMMARY_COUNTS);
});

test("attentionGroups: every row href names a registered destination path; project rows carry exactly ?attn=<key>, enquiries/customers rows carry no query (criteria 7, 11-13)", () => {
  const groups = attentionGroups(SUMMARY_COUNTS, PA_PF);
  for (const group of groups) {
    for (const r of group.rows) {
      const expectAttn = ATTENTION_KEYS.has(r.key) ? r.key : undefined;
      assertRowHref(r, expectAttn);
    }
  }
});

test("combineLoads: unauthorised beats everything, even a ready queue", () => {
  const unauthorised = { status: "unauthorised", headline: "h", detail: "d" };
  assert.deepEqual(combineLoads(unauthorised, { status: "ready", rows: PA_PF }), unauthorised);
  assert.deepEqual(combineLoads(unauthorised, { status: "loading" }), unauthorised);
  assert.deepEqual(combineLoads(unauthorised, { status: "error", headline: "q", detail: "q" }), unauthorised);
});

test("combineLoads: error beats loading and ready when there is no unauthorised (criterion 15)", () => {
  const summaryError = { status: "error", headline: "sh", detail: "sd" };
  const queueError = { status: "error", headline: "qh", detail: "qd" };
  assert.deepEqual(combineLoads(summaryError, { status: "ready", rows: PA_PF }), summaryError);
  assert.deepEqual(combineLoads({ status: "ready", counts: SUMMARY_COUNTS }, queueError), queueError);
  assert.deepEqual(combineLoads(summaryError, { status: "loading" }), summaryError);
});

test("combineLoads: loading beats ready when the other side has not answered yet", () => {
  assert.deepEqual(
    combineLoads({ status: "loading" }, { status: "ready", rows: PA_PF }),
    { status: "loading" },
  );
  assert.deepEqual(
    combineLoads({ status: "ready", counts: SUMMARY_COUNTS }, { status: "loading" }),
    { status: "loading" },
  );
});

test("combineLoads: ready only when both sources answered — carries summary's counts and queue's rows", () => {
  const result = combineLoads(
    { status: "ready", counts: SUMMARY_COUNTS },
    { status: "ready", rows: PA_PF },
  );
  assert.deepEqual(result, { status: "ready", counts: SUMMARY_COUNTS, rows: PA_PF });
});

// AttentionPage.tsx — source-regex assertions, same convention as
// ops2-navigation.test.mjs (no suite renders/mounts React; the .tsx files are
// read as text). Design §3.2/§5: OpsPage frame, per-group section.att-group,
// RowList/Row with edge={null}, useSummary + useProjectQueue combined via
// combineLoads, .pq-error with testid attention-error and no counts rendered
// there, activeOrders and the raw customers field never read from the response.
test("AttentionPage: consumes useSummary + useProjectQueue via combineLoads; per-group section.att-group, RowList/Row wired to history, and the three non-ready states (criteria 3, 5, 6, 15, 18-20, G3)", () => {
  const page = read("src/ops2/attention/AttentionPage.tsx");
  const bare = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(bare, /import\s*\{\s*RowList,\s*Row\s*\}\s*from\s*"\.\.\/chrome\/RowList"/,
    "must import RowList and Row from ../chrome/RowList");
  assert.match(bare, /useSummary\s*\(\s*\)/, "must call useSummary()");
  assert.match(bare, /useProjectQueue\s*\(\s*\)/, "must call useProjectQueue()");
  assert.match(bare, /import\s*\{\s*useProjectQueue\s*\}\s*from\s*"\.\.\/projects\/useProjectQueue"/,
    "must import useProjectQueue from ../projects/useProjectQueue — same skin, no new hook");
  assert.match(bare, /combineLoads\s*\(/, "must combine both loads through combineLoads");
  assert.match(bare, /attentionGroups\s*\(\s*load\.counts\s*,\s*load\.rows\s*\)/,
    "the ready branch must call attentionGroups(load.counts, load.rows)");
  assert.match(bare, /<section className="att-group"/,
    "each group must render inside a section.att-group");
  assert.match(bare, /edge=\{null\}/,
    "a row leads, never acts — edge must be explicitly null (G1c)");
  assert.match(bare, /onActivate=\{?\(\)\s*=>\s*history\.push\(row\.href\)\}?/,
    "a row's onActivate must push row.href onto history");
  assert.match(bare, /pressTestId/, "rows must carry pressTestId so existing suites can press them by name");

  assert.match(bare, /className="pq-skeleton"/, "loading state must use the shared .pq-skeleton class");
  assert.match(bare, /className="pq-empty"/, "an empty attentionGroups() result must use the shared .pq-empty class");
  assert.match(bare, /className="pq-error ds-surface-card"/, "the error panel must use the shared .pq-error ds-surface-card treatment");
  assert.match(bare, /data-testid="attention-error"/, "the error panel's testid must be attention-error");
  assert.match(bare, /onClick=\{reload\}/, "the error panel's Try again must be wired to reload");

  // No counts in the error branch: nothing between the error panel's opening
  // tag and its closing tag may read `.counts` off the load result.
  const errorBlockMatch = bare.match(/status === "error"[\s\S]*?<\/div>\s*\)\s*\}/);
  assert.ok(errorBlockMatch, "could not isolate the error-state JSX block");
  assert.ok(!/load\.counts/.test(errorBlockMatch[0]), "the error state must render no counts");

  // activeOrders/customers are raw-response-only fields parseSummary already
  // excludes; the page must never name them even so (criterion 8, design §5).
  assert.ok(!/activeOrders/.test(bare), "AttentionPage must never read activeOrders");
  assert.ok(!/\bcustomers\b/.test(bare), "AttentionPage must never read the raw customers field");
});

test("rows that carry no statusCustomer are a payload failure, not an empty day", () => {
  // CODEX, MEDIUM. `parseProjectQueue` under-claims a missing `statusCustomer`
  // to "" so the row matches no predicate — deliberate for ONE odd row. But if
  // the field is absent from the whole payload (the endpoint stops sending it,
  // exactly as it did before this feature added it), every project predicate
  // counts zero, and a zero count draws no row at all. The gate then shows
  // silence, which reads as "nothing is waiting".
  //
  // That is the failure this whole surface exists to prevent — the same shape
  // as F1, which shipped invisibly for precisely this reason — so rows present
  // but universally status-less must be reported as a failure to tell, never as
  // a clear day.
  const stripped = PA_PF.map(({ statusCustomer, ...rest }) => rest);
  assert.throws(
    () => attentionGroups(SUMMARY_COUNTS, stripped),
    /statusCustomer/,
    "a payload with no statusCustomer anywhere must be refused, not counted as zero",
  );
});

// AttentionPage.tsx — monitoring section (T5). Design: docs/runs/ai-parse-monitoring/02-design.md.
// Same source-regex convention as the summary block above: read the .tsx as
// text, strip comments, assert markers. The monitoring markup must sit AFTER
// the summary's error block in source order so the existing non-global
// errorBlockMatch regex above keeps isolating only the summary's error JSX.
test("AttentionPage: monitoring section — useMonitoring wired, five load states, unavailable money, zero/empty chart (T5)", () => {
  const page = read("src/ops2/attention/AttentionPage.tsx");
  const bare = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.match(bare, /from\s*"\.\/useMonitoring"/, "must import useMonitoring");
  assert.match(bare, /data-testid="monitoring-skeleton"/);
  assert.match(bare, /data-testid="monitoring-error"/);
  assert.match(bare, /data-testid="monitoring-empty"/);
  assert.match(bare, /data-testid="monitoring-credit-balance"/);
  assert.match(bare, /data-testid="monitoring-cap-outstanding"/);
  assert.match(bare, /data-testid="monitoring-success-count"/);
  assert.match(bare, /data-testid="monitoring-error-count"/);
  assert.match(bare, /data-testid="monitoring-chart"/);
  assert.match(bare, /"unavailable"/, "money cards must render an unavailable state, not zero");
  assert.match(bare, /data-zero/, "zero-day bars must be marked so they render as flat columns");
  assert.match(bare, /att-chart__empty/, "an all-zero window must render an explicit empty state");
  assert.match(bare, /As at /, "every card states 'as at HH:MM'");
  assert.match(bare, /snapshot\.days\.map/, "the chart must iterate the 7-day array");

  const summaryErrorIndex = bare.indexOf('data-testid="attention-error"');
  const monitoringErrorIndex = bare.indexOf('data-testid="monitoring-error"');
  assert.ok(summaryErrorIndex !== -1 && monitoringErrorIndex !== -1 && summaryErrorIndex < monitoringErrorIndex,
    "monitoring markup must come after the summary's error block so the errorBlockMatch regex above stays isolated");

  assert.ok(!/activeOrders/.test(bare), "AttentionPage must never read activeOrders");
  assert.ok(!/\bcustomers\b/.test(bare), "AttentionPage must never read the raw customers field");
});

// F3 (docs/runs/ai-parse-monitoring/06-verify.md): the red card must render
// from the server-evaluated snapshot.red flag, never a client-side
// recomputation of the raw money numbers against a threshold (UX §4/§6.2).
test("AttentionPage: each AI-budget card reddens from its OWN precomputed flag, never from raw numbers (F3, UX 6.2)", () => {
  const page = read("src/ops2/attention/AttentionPage.tsx");
  const bare = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const dataStateExprs = [...bare.matchAll(/data-state=\{([^}]*)\}/g)].map((m) => m[1]);
  // Two cards, two conditions, two server-evaluated flags. One shared boolean
  // reddened a healthy balance because the cap was high (Codex review), which
  // UX 6.2 rules out: two conditions red at once render two red cards, so one
  // condition red must render one.
  const redExprs = dataStateExprs.filter((expr) => /balanceLow|capOver/.test(expr));
  assert.ok(
    redExprs.length >= 2,
    "each AI-budget card's data-state must be driven by its own red flag",
  );
  const bareSource = bare.replace(/\s+/g, " ");
  assert.match(bareSource, /const balanceLow = snapshot\.redBalance/);
  assert.match(bareSource, /const capOver = snapshot\.redCap/);
  for (const expr of redExprs) {
    assert.ok(
      !/[<>]/.test(expr),
      `data-state expression "${expr}" must not compare raw numbers to a threshold — use the server's flag`,
    );
  }

  assert.match(bare, /snapshot\.floorUsd/, "the floor shown in red copy must come from the server snapshot");
  assert.match(bare, /Below the/, "credit-balance red note must state the floor was breached");
  assert.match(bare, /cap used/, "cap-outstanding red note must keep stating the cap usage");
});
