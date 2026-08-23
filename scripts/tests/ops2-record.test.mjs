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

test("the parser carries what the drawing needs, and a line with no slug is still a line", () => {
  // P1-AC-7. The endpoint has always sent all of these — `productSlug` and
  // `compositeAxis` on the line (worker/routes/ops.ts), `productSlug` and
  // `qtyPerParent` on each segment — and this parser dropped them, which is why
  // the record shipped with no drawings at all. `origin`, `priceCalculated` and
  // `priceOverrideAt` come with them because the line's own page states where a
  // size came from and what kind of figure a price is.
  const r = M.parseProjectRecord(body({
    lines: [line({
      productSlug: "amj80-series-sliding-door", compositeAxis: "vertical",
      origin: "schedule", priceCalculated: 900, priceOverrideAt: "2026-08-20T01:00:00Z",
      lineKind: "composite_parent",
      segments: [
        { id: "s1", productSlug: "amj80-series-sliding-window", productName: "Sliding 2400",
          width: "2400", height: "1500", qtyPerParent: 2, qty: 2, lineTotal: 500, status: "ready" },
      ],
    })],
  }));
  const l = r.lines[0];
  assert.equal(l.productSlug, "amj80-series-sliding-door");
  assert.equal(l.compositeAxis, "vertical");
  assert.equal(l.origin, "schedule");
  assert.equal(l.priceCalculated, 900);
  assert.equal(l.priceOverrideAt, "2026-08-20T01:00:00Z");
  assert.equal(l.segments[0].productSlug, "amj80-series-sliding-window");
  assert.equal(l.segments[0].qty, 2, "qtyPerParent is what is in ONE opening");

  // A LINE WITH NO SLUG IS KEPT. The drawing falls back to a fixed frame, which
  // is an honest picture of an opening nobody has chosen a product for; dropping
  // the row would hide the line that most needs a reviewer.
  const bare = M.parseProjectRecord(body({ lines: [line()] })).lines[0];
  assert.equal(bare.productSlug, null);
  assert.equal(bare.compositeAxis, null);
  assert.equal(bare.origin, null);
  assert.equal(bare.priceOverrideAt, null);
  assert.equal(M.parseProjectRecord(body({ lines: [line()] })).lines.length, 1);

  // An axis the endpoint never sends is absent, not guessed into "vertical".
  assert.equal(M.parseProjectRecord(body({ lines: [line({ compositeAxis: "sideways" })] })).lines[0].compositeAxis, null);

  // P1-AC-8, the model half: a CONTRACT line reads the same keys, and the
  // fields order lines do not carry stay absent rather than being invented.
  const order = M.parseProjectRecord(body({
    order: { orderNo: "OF-O-2201", total: 7000 },
    orderLines: [{ id: "o1", code: "W01", productName: "Composite opening",
      productSlug: "amj80-series-sliding-door", compositeAxis: "horizontal",
      width: "3600", height: "1500", qty: 1, lineTotal: 7000,
      segments: [{ id: "os1", productSlug: "amj100t-fixed-window", productName: "Fixed",
        width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 3000 }] }],
  }));
  assert.equal(order.lines[0].productSlug, "amj80-series-sliding-door");
  assert.equal(order.lines[0].compositeAxis, "horizontal");
  assert.equal(order.lines[0].segments[0].productSlug, "amj100t-fixed-window");
  assert.equal(order.lines[0].origin, null, "an order line has no parse provenance");
  assert.equal(order.lines[0].priceCalculated, null);
});

test("a composite is drawn from its units, along its own axis", () => {
  // P1-AC-3 / P1-AC-33, the data half. `Elevation` takes `parts` as
  // `{ productSlug, alongMm, qty }` and divides the frame along `axis`, so
  // `alongMm` is the size ALONG the split: a vertical split (units side by
  // side) divides the width, a horizontal one divides the height. Getting this
  // backwards draws a real opening the wrong way round — the mapping is lifted
  // out of src/components/quote-project/OpeningRow.tsx:103-110 so the two
  // consoles cannot disagree about the same opening.
  const composite = (over = {}) => M.parseProjectRecord(body({
    lines: [line({
      lineKind: "composite_parent", width: "3000", height: "1500",
      segments: [
        { id: "s1", productSlug: "amj80-series-sliding-window", productName: "Sliding",
          width: "2400", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 500, status: "ready" },
        { id: "s2", productSlug: "amj100t-fixed-window", productName: "Fixed",
          width: "600", height: "1500", qtyPerParent: 2, qty: 2, lineTotal: 400, status: "ready" },
      ],
      ...over,
    })],
  })).lines[0];

  assert.deepEqual(M.elevationPartsFor(composite({ compositeAxis: "vertical" })), [
    { productSlug: "amj80-series-sliding-window", alongMm: "2400", qty: 1 },
    { productSlug: "amj100t-fixed-window", alongMm: "600", qty: 2 },
  ], "a vertical split divides the WIDTH — 2400 + 600 must not look like two halves");
  assert.deepEqual(
    M.elevationPartsFor(composite({ compositeAxis: "horizontal" })).map((p) => p.alongMm),
    ["1500", "1500"], "a horizontal split divides the HEIGHT");

  // FEWER THAN TWO UNITS IS NOT A COMPOSITE. One unit is a single frame and the
  // ordinary path draws it correctly; passing a one-element `parts` would make
  // the generator draw a join that does not exist.
  const simple = M.parseProjectRecord(body({ lines: [line()] })).lines[0];
  assert.equal(M.elevationPartsFor(simple), undefined);
  const one = M.parseProjectRecord(body({
    lines: [line({ lineKind: "composite_parent", segments: [
      { id: "s1", productSlug: "amj100t-fixed-window", productName: "Fixed",
        width: "600", height: "900", qtyPerParent: 1, qty: 1, lineTotal: 1, status: "ready" }] })],
  })).lines[0];
  assert.equal(M.elevationPartsFor(one), undefined);
  assert.equal(M.joinedUnitCount(one), 1);

  // The joined-unit COUNT is qtyPerParent summed — a different fact from the
  // retired quantity, which is why the row may print it while `qty` is gone.
  assert.equal(M.joinedUnitCount(composite({})), 3);
  assert.equal(M.joinedUnitCount(simple), 0, "a simple opening is not made of joined units");

  // The units, flattened, and labelled the way every other artefact labels them.
  assert.deepEqual(M.unitsOf(composite({})).map((u) => u.productName),
    ["Sliding", "Fixed", "Fixed"], "a qtyPerParent of 2 is two units, not one row saying 2");
  assert.equal(M.unitLabel("W04", 0), "W04A");
  assert.equal(M.unitLabel("W04", 2), "W04C");
});

test("the attention row is a queue, and every empty case says a different thing", () => {
  // P1-AC-15 … P1-AC-21. A list of eighteen openings with two unpriced is a
  // SCANNING problem, and the answer is a filter rather than a flag on every
  // row. Blockers are a QUEUE: the row states the leading one with the control
  // that clears it and counts the rest, so it stays one line and the next
  // surfaces as each clears.
  const unpriced = M.parseProjectRecord(body({
    lines: [line(), line({ id: "l2", code: "W02", lineTotal: null, status: "draft" }),
      line({ id: "l3", code: "W03", lineTotal: null, status: "draft" })],
    delivery: { amount: 420, settled: true, estimate: 400 },
  }));
  const lead = M.attentionFor(unpriced);
  assert.equal(lead.kind, "blockers");
  assert.equal(lead.lead.key, "unpriced");
  assert.equal(lead.lead.count, 2);
  assert.equal(lead.lead.text, "2 lines have no rate");
  assert.equal(lead.lead.action, "show only these");
  assert.equal(lead.more, 0);

  // LINES LEAD OVER DELIVERY, for the reason worker/lib/ops-actions.ts already
  // gives about the gate: surfacing the trivial blocker while hiding the
  // substantial one trains people to distrust it.
  const both = M.parseProjectRecord(body({
    lines: [line(), line({ id: "l2", lineTotal: null, status: "draft" })],
    delivery: { amount: null, settled: false, estimate: 400 },
  }));
  const queue = M.attentionFor(both);
  assert.equal(queue.lead.key, "unpriced");
  assert.equal(queue.lead.text, "1 line has no rate");
  assert.equal(queue.more, 1, "the rest are counted, not listed");

  // A BLOCKER THIS BUILD CANNOT ACT ON CARRIES NO CONTROL. There is no delivery
  // screen in ops2 to send anyone to, and a control wired to nothing is the
  // defect this effort has recorded four times.
  const deliveryOnly = M.attentionFor(M.parseProjectRecord(body({
    lines: [line()], delivery: { amount: null, settled: false, estimate: 400 },
  })));
  assert.equal(deliveryOnly.lead.key, "delivery");
  assert.equal(deliveryOnly.lead.text, "Delivery has not been set");
  assert.equal(deliveryOnly.lead.action, null);
  assert.equal(deliveryOnly.more, 0);

  // Nothing blocking says so…
  assert.deepEqual(M.attentionFor(M.parseProjectRecord(body({ lines: [line()] }))),
    { kind: "clear", text: "Nothing is blocking this quote" });

  // …and a record with NO LINES does not claim nothing blocks it, which would
  // be false: a quote with no lines cannot be issued (worker/lib/issue.ts).
  assert.deepEqual(M.attentionFor(M.parseProjectRecord(body({ lines: [] }))),
    { kind: "no-lines", text: "No lines on this project yet" });

  // The filter itself, and the empty it can produce — which is a sentence with
  // the way back, never a blank list.
  assert.deepEqual(M.visibleLines(unpriced, true).map((l) => l.code), ["W02", "W03"]);
  assert.equal(M.visibleLines(unpriced, false).length, 3);
  assert.deepEqual(M.visibleLines(M.parseProjectRecord(body({ lines: [line()] })), true), []);
});

test("one badge whatever the reason count, and every figure states its kind", () => {
  // P1-AC-22 — THREE REASONS ARE STILL ONE BOOLEAN. The parser's individual
  // reasons pollute a scannable list ("Highlight is enough"); they are read on
  // the line's own page, where the fix is.
  const flagged = M.parseProjectRecord(body({
    lines: [line({ status: "technical_review", review: {
      glazing: "glazing option out of range",
      material: "material substituted",
      size: "size outside the product range",
    } })],
  })).lines[0];
  assert.equal(M.needsReview(flagged), true);
  assert.equal(Object.keys(flagged.review).length, 3, "the reasons are kept, for the line's page");
  assert.equal(M.needsReview(M.parseProjectRecord(body({ lines: [line()] })).lines[0]), false);
  // An empty review map is not a flag, and a status the server flags is one
  // even when the parser raised nothing.
  assert.equal(M.needsReview(M.parseProjectRecord(body({ lines: [line({ review: {} })] })).lines[0]), false);
  assert.equal(M.needsReview(M.parseProjectRecord(body({ lines: [line({ status: "needs_review" })] })).lines[0]), true);

  // P1-AC-31 — WHAT KIND OF FIGURE IT IS. An unpriced line is `no_rate` and
  // never a zero; a figure a human set is not the rate card's.
  const state = (over) => M.priceState(M.parseProjectRecord(body({ lines: [line(over)] })).lines[0]);
  assert.equal(state({ lineTotal: null }), "no_rate");
  assert.equal(state({ lineTotal: 0 }), "list", "a genuine zero is a price, not an absence");
  assert.equal(state({ lineTotal: 900, priceOverrideAt: "2026-08-20T01:00:00Z" }), "override");
  assert.equal(state({ lineTotal: 900 }), "list");

  // P1-AC-28 — one word of provenance, and nothing when there is none to give.
  const word = (over) => M.provenanceWord(M.parseProjectRecord(body({ lines: [line(over)] })).lines[0]);
  assert.equal(word({ origin: "schedule" }), "from the schedule");
  assert.equal(word({ origin: "manual" }), "entered by hand");
  assert.equal(word({}), null);

  // P1-AC-4 / P1-AC-32 — the row's size is HEIGHT × WIDTH, the way every
  // drawing in this business is dimensioned, and half a size is named as the
  // absence it is rather than printed as a complete-looking fact.
  const size = (over) => M.sizeText(M.parseProjectRecord(body({ lines: [line(over)] })).lines[0]);
  assert.equal(size({ width: "1200", height: "900" }), "900 × 1200 mm");
  assert.equal(size({ width: "1200", height: "" }), "size not read");
  assert.equal(size({ width: "", height: "" }), "size not read");
});

test("the header's corner keeps a figure and names what is missing", () => {
  // P1-AC-37, the owner's own shape: `$48,802 · 2 no rate`. The corner exists
  // because he missed the money there, so it never goes blank — and a bare
  // number implying completeness is exactly what it may not print. "so far" was
  // invented for this job and is deleted (R9).
  const corner = (over) => M.cornerFigure(M.totalsFor(M.parseProjectRecord(body(over))));

  assert.deepEqual(corner({ lines: [line({ lineTotal: 1000 })] }),
    { amount: 1420, caveat: null }, "everything known ⇒ the figure, unqualified");

  assert.deepEqual(corner({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", lineTotal: null, status: "draft" }),
      line({ id: "l3", lineTotal: null, status: "draft" })],
  }), { amount: 1420, caveat: "2 no rate" });

  assert.deepEqual(corner({
    lines: [line({ lineTotal: 1000 })],
    delivery: { amount: null, settled: false, estimate: 400 },
  }), { amount: 1000, caveat: "delivery not set" },
  "the second way a total can be unknowable, in the same shape");

  // An accepted contract's total is knowable by definition — the customer
  // agreed to it, freight included.
  assert.deepEqual(corner({
    order: { orderNo: "OF-O-2201", total: 7000, deliveryTotal: 250 },
    orderLines: [{ id: "o1", code: "W01", productName: "Awning", width: "1", height: "1",
      qty: 1, lineTotal: 6750, segments: [] }],
    delivery: { amount: null, settled: false, estimate: 999 },
  }), { amount: 7000, caveat: null });
});

test("the attention queue and the server's gate cannot disagree", () => {
  // A GUARD OVER CODE THAT IS CURRENTLY CORRECT, said plainly rather than
  // implied: there was no red phase for it.
  //
  // Two vocabularies read the same facts. `worker/lib/issue.ts` decides whether
  // the quote CAN ISSUE and `ops-actions.ts` speaks one sentence about it; this
  // file decides WHICH LINES need the reviewer and speaks a queue with a count.
  // They are different shapes, and the danger is that they drift into
  // disagreeing on screen — a record saying "Nothing is blocking this quote"
  // above a disabled primary refusing it for a line with no rate.
  //
  // So: a record the queue calls CLEAR must carry no lines-or-delivery refusal,
  // and one the queue calls blocked must carry the matching refusal.
  const gated = (over, blockedReason) => M.parseProjectRecord(body({
    ...over,
    actions: [{ id: "issue-quote", label: "Issue reviewed quote", tier: "primary", blockedReason }],
  }));
  const mentionsLinesOrDelivery = (reason) => /line|deliver/i.test(reason ?? "");

  const clear = gated({ lines: [line()] }, undefined);
  assert.equal(M.attentionFor(clear).kind, "clear");
  assert.equal(mentionsLinesOrDelivery(M.primaryAction(clear).blockedReason), false);

  const unpriced = gated(
    { lines: [line({ lineTotal: null, status: "draft" })] },
    "1 line is unpriced or in technical review — this quote cannot be issued until it is resolved.",
  );
  assert.equal(M.attentionFor(unpriced).lead.key, "unpriced");
  assert.match(M.primaryAction(unpriced).blockedReason, /line/i);

  const unset = gated(
    { lines: [line()], delivery: { amount: null, settled: false, estimate: 400 } },
    "Delivery has not been set on this project — enter a figure, or 0, in the Delivery panel.",
  );
  assert.equal(M.attentionFor(unset).lead.key, "delivery");
  assert.match(M.primaryAction(unset).blockedReason, /deliver/i);
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
  // AND THE SPEC THE CUSTOMER ACCEPTED, which the endpoint reconstructs from
  // the snapshot. Without it an accepted row is a name and a price, and cannot
  // be opened at all — on the one record where the spec is frozen and therefore
  // most worth reading.
  const accepted = M.parseProjectRecord(body({
    order: { orderNo: "OF-O-2201", total: 7000 },
    orderLines: [{ id: "o1", code: "W01", productName: "Awning 600", width: "1200", height: "900",
      qty: 1, lineTotal: 3480, options: { Colour: "Monument" }, segments: [] }],
  }));
  assert.deepEqual(accepted.lines[0].options, { Colour: "Monument" });

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

test("the model says nothing about GST, because this console does not", () => {
  // The owner's ruling: "no references to GST, anywhere!! It's not a customer
  // preference-driven site, an ops system default approach that matters."
  //
  // Asserted rather than left as an absence: an absence looks like an oversight
  // and invites a future session to add a label back. It replaced "ex GST",
  // which was worse than either option — the stored figures are inclusive, so
  // that caption overstated the ex-GST value of every price by 10%.
  assert.equal(M.GST_BASIS, undefined);
  assert.deepEqual(Object.keys(M).filter((k) => /gst/i.test(k)), []);
});

test("an accepted order's delivery is the FROZEN one, not the project's", () => {
  // The endpoint supplies `order.deliveryTotal` — what the customer accepted —
  // beside the project's live delivery leg. Historical pre-0044 orders
  // legitimately have `project.delivery_amount` unset while their contract
  // delivery is a settled zero, so reading the project's figure made a real
  // accepted order say "Delivery: Not set".
  const r = M.parseProjectRecord(body({
    order: { orderNo: "OF-O-2201", total: 7000, deliveryTotal: 250 },
    orderLines: [{ id: "o1", code: "W01", productName: "Awning", width: "1", height: "1", qty: 1, lineTotal: 6750, segments: [] }],
    delivery: { amount: null, settled: false, estimate: 999 },
  }));
  const t = M.totalsFor(r);
  assert.equal(t.delivery, 250);
  assert.equal(t.deliverySettled, true, "an accepted contract's delivery is settled by definition");
  assert.equal(t.total, 7000, "the order's own total still wins");

  // A frozen ZERO is settled too — the same trap the project-level figure has.
  const waived = M.parseProjectRecord(body({
    order: { orderNo: "OF-O-2202", total: 6750, deliveryTotal: 0 },
    orderLines: [{ id: "o1", code: "W01", productName: "Awning", width: "1", height: "1", qty: 1, lineTotal: 6750, segments: [] }],
    delivery: { amount: null, settled: false, estimate: 999 },
  }));
  assert.equal(M.totalsFor(waived).deliverySettled, true);
  assert.equal(M.totalsFor(waived).delivery, 0);
});

test("a composite unit reports its count PER OPENING, not the aggregate", () => {
  // `worker/lib/composite.ts` defines a segment's `qty` as
  // `parent.qty × qty_per_parent`, and the endpoint sends `qtyPerParent`
  // separately. Reading the aggregate made the contents of ONE opening claim
  // every unit across all of them: a parent of 3 with 2 units each read "×6"
  // inside a single opening.
  const r = M.parseProjectRecord(body({
    lines: [line({
      qty: 3,
      lineKind: "composite_parent",
      segments: [
        { id: "s1", productName: "Awning", width: "600", height: "900", qtyPerParent: 2, qty: 6, lineTotal: 500, status: "ready" },
      ],
    })],
  }));
  assert.equal(r.lines[0].segments[0].qty, 2, "what is in ONE opening");
  assert.equal(r.lines[0].segments[0].qtyTotal, 6, "and what that comes to across them all");

  // A simple line's segment has no parent multiplier; the two agree.
  const flat = M.parseProjectRecord(body({
    lines: [line({ segments: [{ id: "s1", productName: "X", width: "1", height: "1", qty: 2, lineTotal: 1, status: "ready" }] })],
  }));
  assert.equal(flat.lines[0].segments[0].qty, 2);
});

test("a unit carries its own spec — units of one opening differ", () => {
  // The endpoint supplies each segment's `options` deliberately
  // (worker/routes/ops.ts): a composite whose units differ in colour, glazing
  // or hardware is exactly the case a reviewer has to check before issuing, and
  // the customer's own list shows them. Dropping them left the unit rows able
  // to say only product, size and price.
  const r = M.parseProjectRecord(body({
    lines: [line({
      lineKind: "composite_parent",
      segments: [
        { id: "s1", productName: "Awning", width: "600", height: "900", qty: 1, lineTotal: 500,
          status: "ready", options: { Colour: "Monument", Glazing: "Double clear" } },
        { id: "s2", productName: "Fixed", width: "600", height: "900", qty: 1, lineTotal: 400,
          status: "ready", options: { Colour: "Surfmist" } },
      ],
    })],
  }));
  assert.deepEqual(r.lines[0].segments[0].options, { Colour: "Monument", Glazing: "Double clear" });
  assert.deepEqual(r.lines[0].segments[1].options, { Colour: "Surfmist" });
  // A segment with none says none, rather than inheriting its neighbour's.
  const bare = M.parseProjectRecord(body({
    lines: [line({ segments: [{ id: "s1", productName: "X", width: "1", height: "1", qty: 1, lineTotal: 1, status: "ready" }] })],
  }));
  assert.deepEqual(bare.lines[0].segments[0].options, {});
});

test("the partial figure counts the delivery it already knows", () => {
  // A settled delivery is a known figure. Leaving it out of the "so far" sum
  // produced rows that visibly contradicted each other: `Lines $1,000`,
  // `Delivery $250`, `So far $1,000`.
  const r = M.parseProjectRecord(body({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", code: "W02", lineTotal: null, status: "draft" })],
    delivery: { amount: 250, settled: true, estimate: 250 },
  }));
  const t = M.totalsFor(r);
  assert.equal(t.total, null, "still not a total — a line has no rate");
  assert.equal(t.subtotal, 1250, "but everything known so far adds up");

  // Nothing known about delivery ⇒ the subtotal is the lines alone.
  const unset = M.totalsFor(M.parseProjectRecord(body({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", lineTotal: null, status: "draft" })],
    delivery: { amount: null, settled: false, estimate: 250 },
  })));
  assert.equal(unset.subtotal, 1000);

  // And when everything IS known, the two agree.
  const whole = M.totalsFor(M.parseProjectRecord(body({
    lines: [line({ lineTotal: 1000 })],
    delivery: { amount: 250, settled: true, estimate: 250 },
  })));
  assert.equal(whole.total, 1250);
  assert.equal(whole.subtotal, 1250);
});
