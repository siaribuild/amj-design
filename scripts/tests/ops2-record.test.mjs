// ops2's project record — the model behind the detail surface.
//
// WHY A NODE SUITE, beside the browser one. The browser proves what is drawn;
// it cannot cheaply prove that a total refuses to be a total while a line is
// unpriced, or that `0` delivery is settled and `null` is not. Those are
// arithmetic and vocabulary, and both have already caused real defects in this
// product: a contract understated by its freight, and a truthiness check that
// read a trade's waived delivery as "not set".
//
// TS is bundled once with esbuild — same approach as ops2-projects.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-record");
const outfile = join(runDir, "ops2-record-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/ops2/projects/record.ts")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-record-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
test.after(async () => { await removeRunDir(runDir); });

/** A body in the shape `GET /api/ops/projects/:id` actually returns. */
const body = (over = {}) => ({
  project: {
    id: "p_1", title: "Wattle Grove - Lot 14", publicRef: "OF-Q-10482",
    statusInternalLabel: "Technical review", customerName: "Ana Bianchi",
    org: "Marchetti Constructions", unresolvedLineCount: 0,
  },
  lifecycle: { stateLabel: "Technical review", waitingOn: "Us", phase: "Pricing" },
  daysInStage: 3,
  lines: [],
  delivery: { amount: 420, settled: true, estimate: 400, suburb: "Northcote", postcode: "3070", zoneLabel: "Metro North" },
  actions: [],
  order: null,
  ...over,
});

const line = (over = {}) => ({
  id: "l_1", code: "W01", room: "Kitchen", productName: "Awning 600",
  width: "1200", height: "900", qty: 1, lineTotal: 1000, status: "ready",
  options: {}, review: null, lineKind: "simple", segments: [], ...over,
});

test("the record reads the endpoint's own vocabulary, and absence stays absent", () => {
  const r = M.parseProjectRecord(body({ lines: [line()] }));
  assert.equal(r.ref, "OF-Q-10482");
  assert.equal(r.stateLabel, "Technical review");
  assert.equal(r.waitingOn, "Us");
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].code, "W01");

  // A row with no id has nothing to key a list on and nothing to open.
  assert.equal(M.parseProjectRecord(body({ lines: [line(), { code: "W02" }] })).lines.length, 1);

  // AN UNKNOWN WAIT IS NOBODY'S, never ours. Defaulting the other way would put
  // a job into the queue's own attention bucket and invent work.
  assert.equal(M.parseProjectRecord(body({ lifecycle: {} })).waitingOn, "Nobody");
  // A missing figure is missing, not zero — the one absence this console hunts.
  assert.equal(M.parseProjectRecord(body({ lines: [line({ lineTotal: undefined })] })).lines[0].lineTotal, null);
  // And a body with no project at all is not a record.
  assert.equal(M.parseProjectRecord({}), null);
  assert.equal(M.parseProjectRecord({ project: { title: "x" } }), null);
});

test("an unpriced line makes the sum a floor, and it says so", () => {
  // A SUM OVER UNPRICED LINES IS NOT A TOTAL. Adding up the lines that happen
  // to carry figures and labelling it the total is how a reviewer reads $1,000
  // for a job that will be $3,000: the arithmetic is right and the label lies.
  const r = M.parseProjectRecord(body({
    lines: [line(), line({ id: "l_2", code: "W02", lineTotal: null, status: "draft" })],
  }));
  const t = M.totalsFor(r);
  assert.equal(t.lines, 1000, "the priced lines still add up");
  assert.equal(t.unpriced, 1);
  assert.equal(t.partial, true);
  assert.equal(t.total, null, "there is no total while a line has no figure");

  // Priced throughout, delivery settled ⇒ a real total.
  const whole = M.totalsFor(M.parseProjectRecord(body({ lines: [line(), line({ id: "l_2" })] })));
  assert.equal(whole.partial, false);
  assert.equal(whole.total, 2000 + 420);
});

test("delivery: 0 is settled, null is not, and the estimate never joins the total", () => {
  // NOT A TRUTHINESS CHECK, EVER. A trade waiver is a settled zero, and reading
  // it as unset re-arms the issue gate against a figure someone has just set.
  const waived = M.parseProjectRecord(body({
    lines: [line()],
    delivery: { amount: 0, settled: true, estimate: 400 },
  }));
  assert.equal(waived.delivery.settled, true);
  assert.equal(M.totalsFor(waived).total, 1000, "a waived delivery adds nothing and blocks nothing");

  // Unsettled: there is a live estimate, and it is NOT the total. It moves with
  // the rate table, and a total that changes because someone edited a zone is
  // not a total.
  const unset = M.parseProjectRecord(body({
    lines: [line()],
    delivery: { amount: null, settled: false, estimate: 400 },
  }));
  assert.equal(unset.delivery.estimate, 400);
  assert.equal(M.totalsFor(unset).delivery, null);
  assert.equal(M.totalsFor(unset).total, null, "no total until the figure is settled");
});

test("once an order exists its total is the authority, freight included", () => {
  // The draft lines are no longer what anyone is building. Re-summing them
  // understates every contract by the delivery — a defect this endpoint's own
  // comments record having shipped once.
  const r = M.parseProjectRecord(body({
    lines: [line()],
    order: { orderNo: "OF-O-2201", total: 3300 },
  }));
  assert.equal(r.orderNo, "OF-O-2201");
  assert.equal(M.totalsFor(r).total, 3300);
});

test("actions are the server's, and a blocked one is shown rather than hidden", () => {
  // `worker/lib/ops-actions.ts` states the contract: inapplicable actions are
  // omitted, BLOCKED ones come back with a reason. This is also where the
  // owner's correction lives — "a human can and must be blocked in certain
  // scenarios": decision authority is about overriding a recommendation or a
  // guardrail, never about issuing a quote with a missing price or dimension.
  const r = M.parseProjectRecord(body({
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
        blockedReason: "2 lines are unpriced or unresolved",
        confirm: "Freezes this quote and emails it." },
      { id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" },
      { id: "note", label: "Add a note", tier: "secondary" },
    ],
  }));
  const primary = M.primaryAction(r);
  assert.equal(primary.id, "issue-quote");
  assert.equal(primary.blockedReason, "2 lines are unpriced or unresolved");
  assert.equal(primary.confirm, "Freezes this quote and emails it.");
  // ONLY WHAT THIS BUILD CAN RUN. `note` needs something typed and has no
  // screen yet, so it is not offered — while staying in the parsed model, so
  // nothing is lost when its screen arrives.
  assert.deepEqual(M.otherActions(r).map((a) => a.id), ["status:estimator_assigned"]);
  assert.deepEqual(r.actions.map((a) => a.id).includes("note"), true);

  // An action of unknown tier is OVERFLOW. Erring towards primary would promote
  // something the server never meant to lead with onto the one prominent control.
  const odd = M.parseProjectRecord(body({ actions: [{ id: "x", label: "X", tier: "wat" }] }));
  assert.equal(odd.actions[0].tier, "overflow");
  assert.equal(M.primaryAction(odd), null);
  // And an action with no label is not an action.
  assert.equal(M.parseProjectRecord(body({ actions: [{ id: "x" }] })).actions.length, 0);
});

test("a line reports its own state in the server's words", () => {
  assert.equal(M.lineUnresolved(line()), false);
  assert.equal(M.lineUnresolved(line({ status: "draft" })), true);
  assert.equal(M.lineUnresolved(line({ lineTotal: null })), true);

  // Half a size is worse than none: it reads as a complete fact.
  assert.equal(M.sizeLabel({ width: "1200", height: "900" }), "1200 × 900");
  assert.equal(M.sizeLabel({ width: "1200", height: "" }), null);

  // NULL renders as absence, never as "today" — the most reassuring possible
  // lie about the one number this console exists to surface.
  assert.equal(M.ageLabel({ daysInStage: null }), null);
  assert.equal(M.ageLabel({ daysInStage: 0 }), "today");
  assert.equal(M.ageLabel({ daysInStage: 1 }), "1 day");
  assert.equal(M.ageLabel({ daysInStage: 9 }), "9 days");

  assert.equal(M.waitingSentence({ waitingOn: "Customer" }), "Waiting on the customer");
  assert.equal(M.money(48802.4), "$48,802");
});

test("a composite opening keeps its units inside it, never loose beside it", () => {
  // One opening built from several joined frames is ONE row on screen — the
  // same convention the customer's list follows and the endpoint's own query
  // enforces (parents only, segments nested).
  const r = M.parseProjectRecord(body({
    lines: [line({
      lineKind: "composite_parent",
      segments: [
        { id: "s1", productName: "Awning 600", width: "600", height: "900", qty: 1, lineTotal: 500, status: "ready" },
        { id: "s2", productName: "Fixed 600", width: "600", height: "900", qty: 1, lineTotal: null, status: "draft" },
        { productName: "no id" },
      ],
    })],
  }));
  assert.equal(r.lines.length, 1);
  assert.deepEqual(r.lines[0].segments.map((s) => s.id), ["s1", "s2"]);
  assert.equal(r.lines[0].segments[1].lineTotal, null);
});

test("an accepted project shows the CONTRACT lines, not the draft ones", () => {
  // The endpoint's own comment says why it returns both: "Once the quote is
  // accepted the draft lines are no longer what anyone is building — order_line
  // is. Without these an accepted project renders an empty table, which is how
  // a staffer concludes the record is broken."
  //
  // So the draft list is deliberately stale here, and reading it would show a
  // reviewer prices and quantities nobody is manufacturing to.
  const r = M.parseProjectRecord(body({
    lines: [line({ id: "draft", code: "OLD", productName: "Superseded", lineTotal: 999 })],
    order: { orderNo: "OF-O-2201", total: 7000 },
    orderLines: [
      { id: "o1", code: "W01", room: "Kitchen", productName: "Awning 600",
        width: "1200", height: "900", qty: 2, lineTotal: 3480, segments: [] },
      { id: "o2", code: "W02", room: "Bed 1", productName: "Composite opening",
        width: "3600", height: "1500", qty: 1, lineTotal: 3520, segments: [
          { id: "os1", productName: "Awning 1200", width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 1200 },
          { id: "os2", productName: "Fixed 2400", width: "2400", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 2320 },
        ] },
    ],
  }));
  assert.deepEqual(r.lines.map((l) => l.code), ["W01", "W02"]);
  assert.equal(r.lines.find((l) => l.code === "OLD"), undefined, "the draft list is not what is built");
  // A contract line's units still nest inside their parent.
  assert.deepEqual(r.lines[1].segments.map((s) => s.productName), ["Awning 1200", "Fixed 2400"]);
  assert.equal(r.lines[1].lineKind, "composite_parent");

  // No order ⇒ the draft lines ARE the record, unchanged.
  const quote = M.parseProjectRecord(body({ lines: [line({ code: "W09" })] }));
  assert.deepEqual(quote.lines.map((l) => l.code), ["W09"]);

  // AND AN EMPTY CONTRACT IS STILL THE CONTRACT. The first fix fell back to the
  // draft list when `orderLines` was absent or empty, reasoning that an empty
  // table is a worse answer. It is not: an empty list is a FACT, and a stale
  // quote presented as the record is a lie — with the order's own total sitting
  // beside it, which is where the two visibly disagree.
  for (const over of [{ orderLines: [] }, {}]) {
    const bare = M.parseProjectRecord(body({
      lines: [line({ code: "OLD" })],
      order: { orderNo: "OF-O-2201", total: 7000 },
      ...over,
    }));
    assert.deepEqual(bare.lines, [], "an accepted job never shows its quote lines");
    assert.equal(bare.orderNo, "OF-O-2201");
  }
});

test("a primary action this build cannot run is not offered as a control", () => {
  // `actionsFor` returns the order stage machine's own moves once a quote is
  // accepted — `advance:*` and `pay:*` — and none of them has a route in this
  // build. Rendered as the primary CTA they were a button that did nothing when
  // pressed: the defect this effort has recorded four times, arrived by a path
  // nobody looked down.
  //
  // The NEXT MOVE is still real information, so it is not simply dropped — the
  // screen says what it is and that it is not here yet. That is a sentence, not
  // a control.
  const accepted = M.parseProjectRecord(body({
    order: { orderNo: "OF-O-2201", total: 7000 },
    actions: [
      { id: "advance:deposit_paid", label: "Record the deposit", tier: "primary" },
      { id: "note", label: "Add a note", tier: "secondary" },
    ],
  }));
  assert.equal(M.runnableAction(accepted.actions[0]), false);
  assert.equal(M.primaryAction(accepted), null, "nothing pressable leads this screen");
  assert.equal(M.pendingPrimary(accepted).label, "Record the deposit");

  // And where the primary IS runnable it leads exactly as before.
  const pricing = M.parseProjectRecord(body({
    actions: [{ id: "issue-quote", label: "Issue reviewed quote", tier: "primary" }],
  }));
  assert.equal(M.primaryAction(pricing).id, "issue-quote");
  assert.equal(M.pendingPrimary(pricing), null);
});
