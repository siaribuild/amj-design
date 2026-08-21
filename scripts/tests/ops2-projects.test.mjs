// ops2's Projects queue — the model behind the list, tested where no screenshot
// can reach it.
//
// WHY A NODE SUITE. The browser suite (scripts/tests/web/ops2-projects.spec.ts)
// proves what is on the screen; it cannot cheaply prove that the number on a
// chip is the length of the list that chip produces. That agreement is the one
// property the mock got wrong and had to fix in the open
// (`9e5f11b6 fix(ops2): a count that predicts the result, not one that counts
// the world`, on `design/ops2-planning`): a count computed by a different path
// from the result it predicts will eventually disagree with it, and nothing on
// screen tells the reader which of the two is lying. So there is ONE selector
// and everything counts through it — and this is what holds that.
//
// TS is bundled once with esbuild, the same approach as ops2-navigation.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-projects");
const outfile = join(runDir, "ops2-projects-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/ops2/projects/queue.ts")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-projects-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { await removeRunDir(runDir); });

/** A row in the shape `GET /api/ops/projects` actually returns — the fields the
 *  queue reads, and nothing invented. Defaults are the boring case; every test
 *  overrides only what it is about. */
const row = (over = {}) => ({
  id: "p_" + (over.ref ?? "x"), ref: "OF-Q-10000", title: "A project",
  customerName: "A customer", org: null, lineCount: 1, value: 1000,
  valueBasis: "est.", unresolved: 0, issuable: false, waitingOn: "Us", daysInStage: 1,
  phase: "Pricing", phaseIndex: 1, stateLabel: "Pricing", orderNo: null,
  updatedAt: "2026-08-20 00:00:00", ...over,
});

test("the queue's order is the server's: ours first, then longest neglected", () => {
  // Not `updatedAt`. worker/routes/ops.ts:414 already sorts this way and states
  // why: updated_at moves when the CUSTOMER replies, which buries the thing we
  // have to do underneath the thing that just happened. The client re-sorts
  // rather than trusting arrival order because it filters, and a filtered list
  // that changed its own order would make the queue unreadable.
  const rows = [
    row({ ref: "nobody-9", waitingOn: "Nobody", daysInStage: 9 }),
    row({ ref: "us-2", waitingOn: "Us", daysInStage: 2 }),
    row({ ref: "customer-30", waitingOn: "Customer", daysInStage: 30 }),
    row({ ref: "us-11", waitingOn: "Us", daysInStage: 11 }),
  ];
  assert.deepEqual(
    M.selectProjects(rows, { ...M.EMPTY_QUERY, chip: "all" }).map((r) => r.ref),
    ["us-11", "us-2", "customer-30", "nobody-9"],
  );

  // Arrival is `Needs us`, not `All`: the eyebrow calls this an OPERATIONS
  // QUEUE, and the governing constraint is that a delayed glance costs a working
  // day. Tagged ASSUMED in the module — his two drawings disagree about it.
  assert.equal(M.EMPTY_QUERY.chip, "us");
  assert.deepEqual(M.EMPTY_QUERY.refinements, []);
});

test("every number on screen IS the length of the list its own control produces", () => {
  // The property the mock had to fix in the open, made structural. Each control
  // hands back BOTH the count and the query that produces it, so a component
  // physically cannot render one number and apply a different filter — there is
  // no second path to disagree down. `Needs us` cannot read 2 and show none.
  const rows = [
    row({ ref: "a", waitingOn: "Us", phase: "Pricing", unresolved: 0, issuable: true }),
    row({ ref: "b", waitingOn: "Us", phase: "Pricing", unresolved: 2 }),
    row({ ref: "c", waitingOn: "Customer", phase: "Issued", unresolved: 0 }),
    row({ ref: "d", waitingOn: "Customer", phase: "Issued", unresolved: 1 }),
    row({ ref: "e", waitingOn: "Nobody", phase: "Production", unresolved: 0 }),
  ];

  // Exercised from states that are NOT the default, because a count is only
  // ever wrong relative to something already on: the mock's defect appeared
  // exactly when a refinement or a search was live.
  for (const query of [
    M.EMPTY_QUERY,
    { chip: "all", refinements: [], search: "" },
    { chip: "us", refinements: ["unresolved"], search: "" },
    { chip: "customer", refinements: ["ready", "unresolved"], search: "" },
    { chip: "us", refinements: [], search: "OF-Q-10000" },
    { chip: "all", refinements: ["production"], search: "zzz" },
  ]) {
    const controls = [
      ...M.chipStates(rows, query),
      ...M.refinementStates(rows, query),
      ...M.headlineStats(rows, query),
    ];
    assert.ok(controls.length >= 3 + 3 + 4, "every control on screen must report itself");
    for (const control of controls) {
      assert.equal(
        control.count,
        M.selectProjects(rows, control.query).length,
        `${control.key}: the number promised is not the list it would give`,
      );
    }
  }
});

// GUARD OVER CODE THAT WAS ALREADY RIGHT, and worth saying rather than
// implying: the property test above forced the shape, so this one passed the
// moment it was written. What it adds is the owner's own words and his order —
// which the property test cannot see, and which a rename would otherwise carry
// away silently.
test("the headline stats are the four the owner drew, in his order", () => {
  // The attention strip: a bold "N need us" with its reason beneath, and three
  // stat columns to its right — Waiting on customer, Ready to issue, All active.
  const rows = [
    row({ ref: "a", waitingOn: "Us", phase: "Pricing", unresolved: 0, issuable: true }),
    row({ ref: "b", waitingOn: "Us", phase: "Pricing", unresolved: 3 }),
    row({ ref: "c", waitingOn: "Customer" }),
    row({ ref: "d", waitingOn: "Nobody", phase: "Production" }),
  ];
  const stats = M.headlineStats(rows, M.EMPTY_QUERY);
  assert.deepEqual(stats.map((s) => [s.key, s.label, s.count]), [
    ["needUs", "Need us", 2],
    ["waitingCustomer", "Waiting on customer", 1],
    ["readyToIssue", "Ready to issue", 1],
    ["allActive", "All", 4],
  ]);
  // "Ready to issue" is THE GATE'S ANSWER, carried on the row as `issuable`
  // (worker/lib/issue.ts `issuableNow`) rather than re-derived here. It was
  // re-derived at first — ours, in pricing, nothing unresolved — and that
  // agreed with `issueQuote` on two of its four guards: it counted projects
  // with no lines at all, and every project whose delivery was still unsettled,
  // both of which the gate refuses. A stat that sends a reviewer to work the
  // button will not accept is worse than no stat.
  assert.deepEqual(M.selectProjects(rows, stats[2].query).map((r) => r.ref), ["a"]);
  assert.equal(
    M.REFINEMENTS.find((r) => r.key === "ready").test(row({ issuable: false, unresolved: 0, phase: "Pricing" })),
    false,
    "nothing but the server's verdict decides this",
  );
});

test("a label says what it actually counts, or it is the wrong label", () => {
  // TWO LABELS THAT OVERSTATED THEIR OWN DATA, both caught in review.
  //
  // 1. "Unpriced" was reading the server's `unresolved`, which counts lines with
  //    `status <> 'ready' OR line_total IS NULL` (worker/routes/ops.ts). A line
  //    that is fully priced and waiting on technical review is unresolved and is
  //    NOT unpriced, and calling it unpriced sends a reviewer to fix a price
  //    that is already there. The server's own word is `unresolved`; the screen
  //    uses the same word rather than a friendlier one that is false.
  const priced = row({ unresolved: 2, value: 5000, phase: "Pricing" });
  const refinement = M.REFINEMENTS.find((r) => r.key === "unresolved");
  assert.ok(refinement, "the refinement is keyed on what it counts");
  assert.equal(refinement.label, "Unresolved lines");
  assert.equal(refinement.test(priced), true, "a priced line can still be unresolved");
  assert.equal(M.unresolvedBadge(priced), "Unresolved 2");
  assert.equal(M.unresolvedBadge(row({ unresolved: 0 })), null, "no chip on a row with nothing wrong");

  // 1b. `Needs review` IS NOT `waitingOn === "Us"`, and the difference is a
  //     false statement on a card. `lifecycleOf` returns "Us" for every state
  //     the customer is not holding — which includes manufacturing, dispatch
  //     and delivery, where nobody is reviewing anything and the card's own
  //     state line says so. Read as "still on our desk BEFORE the quote goes
  //     out": the two pre-issue phases, and nothing after them.
  const keys = (r) => M.rowFlags(r).map((f) => f.key);
  assert.deepEqual(keys(row({ waitingOn: "Us", phase: "Pricing", unresolved: 2 })),
    ["unresolved", "review"], "both chips, the owner's own card");
  assert.deepEqual(keys(row({ waitingOn: "Us", phase: "Intake", unresolved: 0 })), ["review"]);
  for (const phase of ["Issued", "Accepted", "Production", "Delivered"]) {
    assert.deepEqual(keys(row({ waitingOn: "Us", phase, unresolved: 0 })), [],
      `nothing is being reviewed in ${phase}`);
  }
  assert.deepEqual(keys(row({ waitingOn: "Us", phase: "Production", unresolved: 3 })),
    ["unresolved"], "an unfinished line still shows, wherever the job is");
  assert.deepEqual(keys(row({ waitingOn: "Customer", phase: "Pricing" })), [],
    "a card we are not holding carries neither");

  // 2. "All active" was the SAME query as All, and the endpoint returns every
  //    non-draft job including completed ones (`after_sales`). Nothing in this
  //    codebase says which stage ends a job — the dashboard's `active_orders`
  //    excludes after_sales and cancelled, the list excludes neither — so the
  //    honest fix is the label, not an invented cut-off. It is `All`, it equals
  //    the All chip, and what "active" should mean is a question for the owner.
  const stats = M.headlineStats([row({})], M.EMPTY_QUERY);
  assert.equal(stats[3].label, "All");
  assert.deepEqual(stats[3].query, { chip: "all", refinements: [], search: "" });
});

test("a row says who it waits on in WORDS, and the age only qualifies it", () => {
  // Status is a word first and a colour second — it has to read identically in
  // greyscale, which is also what makes it survive a phone in sunlight. The age
  // is deliberately quiet: it qualifies the status, it is not the status.
  //
  // The state's words are the SERVER'S (`worker/lib/lifecycle.ts` stateLabel),
  // not a second vocabulary invented here. One place per fact: a status renamed
  // there must not keep reading the old way on this screen.
  const us = row({ waitingOn: "Us", stateLabel: "Technical review", daysInStage: 2 });
  assert.equal(M.nextActionOf(us), "Us · Technical review");
  assert.equal(M.waitingSentence(us), "Waiting on us");
  assert.equal(M.ageLabel(us), "2 days");
  assert.equal(M.ageLabel(us, { short: true }), "2d");

  const customer = row({ waitingOn: "Customer", stateLabel: "Quote issued", daysInStage: 7 });
  assert.equal(M.nextActionOf(customer), "Customer · Quote issued");
  // "the customer", not "customer" — the owner's own wording on the card.
  assert.equal(M.waitingSentence(customer), "Waiting on the customer");

  const nobody = row({ waitingOn: "Nobody", stateLabel: "Manufacturing", daysInStage: 0 });
  assert.equal(M.waitingSentence(nobody), "Waiting on nobody");
  assert.equal(M.ageLabel(nobody), "today", "a day-zero job has not been waiting a day");

  // AN AGE THE SERVER COULD NOT COMPUTE IS ABSENT, NOT ZERO. `daysSince()`
  // returns null on an unparseable timestamp, and rendering that as "0 days"
  // would say the job moved today — the most reassuring possible lie about the
  // one number this queue exists to surface.
  assert.equal(M.ageLabel(row({ daysInStage: null })), null);
});

test("a figure that is not a price says so, and a price says what kind it is", () => {
  // THREE different meanings occupy the value column — an estimate, an issued
  // quote, a contract — and worker/routes/ops.ts already says why the basis
  // travels with the number: "a number read down a phone with the wrong basis
  // is worse than no number." So the basis comes through rather than being
  // flattened into a bare dollar sign.
  assert.deepEqual(M.priceOf(row({ value: 18793, valueBasis: "contract" })), {
    text: "$18,793", basis: "contract", priced: true,
  });
  assert.deepEqual(M.priceOf(row({ value: 73488.4, valueBasis: "est." })), {
    text: "$73,488", basis: "est.", priced: true,
  });

  // NOT PRICED IS A STATE, NOT A ZERO. The server COALESCEs the sum to 0, so a
  // job whose lines have no totals arrives looking like a free job. Rendering
  // "$0" would be a priced-at-nothing claim about work nobody has costed —
  // which is the absence this surface is supposed to be hunting for.
  assert.deepEqual(M.priceOf(row({ value: 0, valueBasis: "est.", unresolved: 4 })), {
    text: "Not priced", basis: null, priced: false,
  });
  assert.equal(M.priceOf(row({ value: null })).text, "Not priced");
  assert.equal(M.priceOf(row({ value: 0, lineCount: 0 })).text, "Not priced",
    "nothing to price is not a price either");

  // BUT ZERO IS ALSO A REAL PRICE. Staff can override a line to $0
  // (worker/routes/ops.ts) and issuing only refuses NULL totals
  // (worker/lib/issue.ts) — so a fully resolved job really can be worth nothing,
  // and reading `value <= 0` as absence made the same row say both "ready to
  // issue" and "not priced". Resolved lines and a zero sum is a figure.
  assert.deepEqual(M.priceOf(row({ value: 0, valueBasis: "issued", unresolved: 0, lineCount: 3 })), {
    text: "$0", basis: "issued", priced: true,
  });
});

test("the parser lets a bad row through as an honest row, never as a lie", () => {
  // The endpoint is staff-gated and behind Access, so a body arriving here is
  // normally well-formed. The reason to parse anyway is narrow and specific:
  // every field this queue reads has a MEANING when absent, and JavaScript's
  // defaults for absence are all reassuring. `undefined` days would print as
  // NaN; a missing waitingOn would sort into the "ours" bucket and claim work.
  const parsed = M.parseProjectQueue({
    projects: [
      { id: "p1", ref: "OF-Q-1", title: "T", customerName: "C", lineCount: 3,
        value: 100, valueBasis: "est.", unresolved: 1, waitingOn: "Us",
        daysInStage: 4, phase: "Pricing", stateLabel: "Pricing", orderNo: null },
      // Everything optional, missing.
      { id: "p2" },
      // Not a row at all.
      null,
      // A row with no id: there is nothing to open and nothing to key on.
      { ref: "OF-Q-3" },
    ],
  });

  assert.deepEqual(parsed.map((r) => r.id), ["p1", "p2"], "an unopenable row is dropped");
  const bare = parsed[1];
  assert.equal(bare.daysInStage, null, "an age nobody supplied is absent, not 0");
  assert.equal(bare.value, null, "a value nobody supplied is absent, not $0");
  assert.equal(bare.issuable, false, "a project that did not say it can be issued cannot");
  assert.equal(bare.waitingOn, "Nobody",
    "an unknown wait does NOT claim to be ours — inventing work is worse than missing it");
  assert.equal(bare.title, "Untitled project");
  assert.equal(bare.ref, "p2", "with no reference, the id is the only true handle");

  // A body that is not the shape at all is an empty queue, not a crash: the
  // caller distinguishes "no projects" from "the request failed" by the request,
  // not by guessing from the payload.
  assert.deepEqual(M.parseProjectQueue(null), []);
  assert.deepEqual(M.parseProjectQueue({ projects: "nope" }), []);
});

test("an empty list says WHY it is empty, because the reasons are opposites", () => {
  // "a filtered empty list and an empty queue are otherwise the same picture,
  // and they mean opposite things" (`72abbe7b` on `design/ops2-planning`). One
  // is the best news of the day; the other is work you cannot see. The screen
  // must never leave the reader to guess which, and when the cause is something
  // the reader switched on, it hands back the way to switch it off.
  const rows = [row({ ref: "a", waitingOn: "Customer", phase: "Issued" })];

  const nothingAtAll = M.emptyStateFor([], M.EMPTY_QUERY);
  assert.match(nothingAtAll.headline, /no projects/i);
  assert.equal(nothingAtAll.clear, null, "nothing was filtered, so there is nothing to clear");

  const nothingForUs = M.emptyStateFor(rows, { ...M.EMPTY_QUERY, chip: "us" });
  assert.equal(nothingForUs.headline, "Nothing is waiting on us.");
  assert.match(nothingForUs.detail, /submissions/i);
  assert.deepEqual(nothingForUs.clear, { label: "Show all", query: { chip: "all", refinements: [], search: "" } });

  const noMatch = M.emptyStateFor(rows, { ...M.EMPTY_QUERY, search: "zzz" });
  assert.match(noMatch.headline, /zzz/, "the words that found nothing are quoted back");
  assert.equal(noMatch.clear.label, "Clear search");

  // The refinements are NAMED, not counted: a count tells you how many filters
  // are on and still leaves you guessing which row went missing and why.
  const filtered = M.emptyStateFor(rows, { chip: "all", refinements: ["ready", "production"], search: "" });
  assert.match(filtered.detail, /Ready to issue/);
  assert.match(filtered.detail, /In production/);
  assert.equal(filtered.clear.label, "Clear filters");
  assert.deepEqual(filtered.clear.query.refinements, []);
});

test("a search stranded by a REFINEMENT is offered the same way out as one stranded by a chip", () => {
  // The first version of the escape only looked at the chip, so with `All`
  // selected and a refinement on, a search that matched a project the refinement
  // excluded reported "Nothing matches" and offered nothing but Clear search.
  // The term was fine and the queue held the job; a filter the reader had
  // switched on was hiding it, and the screen blamed the search.
  //
  // Any narrowing counts — the chip, the refinements, or both — because the
  // question the reader is asking is "is this job in here at all", and the only
  // useful answer names the true count.
  const rows = [
    row({ ref: "OF-Q-1", title: "Harbourview", waitingOn: "Nobody", phase: "Production" }),
    row({ ref: "OF-Q-2", title: "Fitzroy", waitingOn: "Us", phase: "Pricing" }),
  ];

  const hiddenByRefinement = M.emptyStateFor(rows, {
    chip: "all", refinements: ["production"], search: "fitzroy",
  });
  assert.equal(hiddenByRefinement.clear.label, "Search all 1 project");
  assert.deepEqual(hiddenByRefinement.clear.query, { chip: "all", refinements: [], search: "fitzroy" });

  // And a term nothing in the queue matches is still a dead end, not a
  // widening that would find nothing either.
  const genuinelyAbsent = M.emptyStateFor(rows, {
    chip: "all", refinements: ["production"], search: "zzz",
  });
  assert.equal(genuinelyAbsent.clear.label, "Clear search");
});

test("search reaches the three things a reviewer has in hand", () => {
  // The placeholder promises "project, customer or reference" and the search
  // must keep that promise exactly — a field that quietly searches fewer things
  // than its own placeholder names is the "control that does not act" defect
  // wearing different clothes.
  //
  // It searches ACROSS the wait axis on purpose: someone rings about a job, and
  // which chip happens to be selected is not something the caller knows. So the
  // chip is neutralised while text is present rather than intersected with it.
  const rows = [
    row({ ref: "OF-Q-10482", title: "Wattle Grove - Lot 14", customerName: "Kerr Constructions", waitingOn: "Us" }),
    row({ ref: "OF-Q-10468", title: "Northcote House", customerName: "Manna Developments", waitingOn: "Customer" }),
  ];
  const found = (search) =>
    M.selectProjects(rows, { ...M.EMPTY_QUERY, search }).map((r) => r.ref);

  const all = (search) =>
    M.selectProjects(rows, { chip: "all", refinements: [], search }).map((r) => r.ref);

  assert.deepEqual(all("10468"), ["OF-Q-10468"], "by reference");
  assert.deepEqual(all("northcote"), ["OF-Q-10468"], "by project, case-insensitively");
  assert.deepEqual(all("Manna"), ["OF-Q-10468"], "by customer");
  assert.deepEqual(all("  wattle  "), ["OF-Q-10482"], "surrounding whitespace is not a term");
  assert.deepEqual(all("zzz"), [], "and no match is an empty list, not everything");

  // SEARCH INTERSECTS THE CHIP — it does not neutralise it. The first version
  // dropped the wait filter whenever a term was present, so that whoever was on
  // the phone would find the job whatever chip happened to be selected. It made
  // every label on the page lie: with a customer-owned project matched, `Needs
  // us` and `Customer` produced identical lists and the strip read "1 need us"
  // about a job we were not holding. The escape is the empty state below, which
  // is honest about where the matches actually are.
  assert.deepEqual(found("northcote"), [], "the customer's job is not ours, whatever was typed");
  assert.deepEqual(found("wattle"), ["OF-Q-10482"]);
  assert.deepEqual(found(""), ["OF-Q-10482"], "empty text is not a filter");

  // And the way out is offered WITH THE TRUE COUNT, so it is worth the tap.
  const stranded = M.emptyStateFor(rows, { ...M.EMPTY_QUERY, search: "northcote" });
  assert.match(stranded.headline, /northcote/);
  assert.equal(stranded.clear.label, "Search all 1 project");
  assert.deepEqual(stranded.clear.query, { chip: "all", refinements: [], search: "northcote" });
});

test("three quick filters, and the fourth the mock had is now a refinement", () => {
  // THE OWNER'S CAP, VERBATIM: "3 quick filters max + filter icon with bubble."
  // It overturns the mock, which had argued its way to four
  // (`72abbe7b design(ops2): the Projects list, from the owner's own drawing`:
  // "Four segments rather than his three... Waiting on nobody is where a project
  // sits once it is in production, which is exactly what you hunt for when a
  // customer rings about work already underway").
  //
  // That REASON is carried forward rather than deleted with the segment: the
  // thing you actually hunt for is work already underway, so it survives as the
  // `In production` refinement — which names the phase instead of a negative
  // wait state, and so does not cross the chips' axis.
  assert.deepEqual(M.WAIT_CHIPS.map((c) => c.key), ["all", "us", "customer"]);
  assert.ok(M.WAIT_CHIPS.length <= 3, "the owner's cap is three; a fourth goes behind the funnel");
  assert.ok(
    M.REFINEMENTS.some((r) => r.key === "production"),
    "the fourth segment's reason survives as a refinement",
  );

  const rows = [
    row({ ref: "us", waitingOn: "Us" }),
    row({ ref: "customer", waitingOn: "Customer" }),
    row({ ref: "nobody", waitingOn: "Nobody", phase: "Production" }),
  ];
  const refs = (query) => M.selectProjects(rows, query).map((r) => r.ref);
  assert.deepEqual(refs({ ...M.EMPTY_QUERY, chip: "all" }), ["us", "customer", "nobody"]);
  assert.deepEqual(refs({ ...M.EMPTY_QUERY, chip: "us" }), ["us"]);
  assert.deepEqual(refs({ ...M.EMPTY_QUERY, chip: "customer" }), ["customer"]);
  // And the demoted state is still reachable — through the funnel, not the chips.
  assert.deepEqual(
    refs({ chip: "all", refinements: ["production"], search: "" }),
    ["nobody"],
  );
});
