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
import { globSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-record");
const outfile = join(runDir, "ops2-record-bundle.mjs");
const panelOut = join(runDir, "ops2-line-review-bundle.mjs");
const elevOut = join(runDir, "elevation-bundle.mjs");
await build({
  stdin: {
    contents: `
      export * from ${p("src/ops2/projects/record.ts")};
      export { drawingSubject, viewerUnitCount } from ${p("src/ops2/projects/drawingSubject.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ops2-record-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
await build({
  stdin: {
    contents: `export { Panel } from ${p("src/ops2/projects/LineReview.tsx")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-line-review-entry.tsx",
    loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", outfile: panelOut, logLevel: "silent",
  jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
});
await build({
  stdin: {
    contents: `export { Elevation } from ${p("src/components/quote-project/Elevation.tsx")};`,
    resolveDir: projectRoot,
    sourcefile: "elevation-entry.tsx",
    loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", outfile: elevOut, logLevel: "silent",
  jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
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

  // AND A REFERENCE IS NOT ALWAYS `OF-Q-10482` SHAPED. `public_ref` is a
  // NULLABLE column (migrations/0011_project_ref.sql adds it without NOT NULL)
  // and `worker/routes/ops.ts` serves `p.public_ref ?? null`, so the parser's
  // `?? id` fallback is a live path — and a project id is `crypto.randomUUID()`
  // (worker/lib/util.ts), which is 36 characters.
  //
  // Pinned because something downstream DEPENDS on it: the viewer's back control
  // names the record by this string (VIEW-AC-15) and truncates it, and the cap
  // is only worth having while a reference can be longer than a label. A future
  // parser that dropped the fallback would make that truncation dead code, and
  // the next reader would delete it without knowing what it was for.
  const withRef = (publicRef) => {
    const b = body({ lines: [line()] });
    if (publicRef === undefined) delete b.project.publicRef;
    else b.project.publicRef = publicRef;
    return M.parseProjectRecord(b).ref;
  };
  assert.equal(withRef(undefined), "p_1", "no publicRef falls back to the id");
  // AND SO DOES A REF THAT IS ONLY SPACE. `str()` trims before it decides, so an
  // empty or whitespace-only value is an ABSENT one — which is the half of this
  // guarantee that rests on the trim rather than on the `??`, and the half no
  // test exercised. Two decisions lean on it: the viewer's back control has no
  // `Project` fallback of its own (drawingSubject), and the label's truncation
  // is kept on the ground that a reference can be long. If `str` were ever
  // simplified to a plain truthiness check, a whitespace ref would render an
  // unnameable control and nothing here would have said so.
  assert.equal(withRef(""), "p_1", "an empty ref is an absent one");
  assert.equal(withRef("   "), "p_1", "and so is one that is only spaces");
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


test("FB-AC-21 — the filter means everything requiring attention, not just no rate", () => {
  // OWNER, Q4: "everything requiring attention". The filter narrowed to lines
  // with no rate, so a line the list had already marked `needs review` — its
  // leading edge painted, its badge printed — could not be reached by the one
  // control that exists to reach it. Three such lines sat in the reproduction
  // project, unreachable.
  //
  // The predicate is now the SAME ONE the row draws itself from. That is the
  // point: one meaning of "attention" per surface, so the filter can never
  // disagree with the marks it filters on.
  const mixed = M.parseProjectRecord(body({ lines: [
    line({ code: "W01" }),
    line({ code: "W02", lineTotal: null, status: "incomplete" }),
    line({ code: "W03", status: "technical_review", review: { size: "size outside the product range" } }),
    line({ code: "W04" }),
  ] }));

  assert.deepEqual(M.visibleLines(mixed, true).map((l) => l.code), ["W02", "W03"]);
  assert.equal(M.visibleLines(mixed, false).length, 4);

  // AND IT IS EXACTLY THE ROWS THAT CARRY A MARK. Asserted as an identity
  // rather than as a list, so the two cannot drift apart later.
  assert.deepEqual(
    M.visibleLines(mixed, true).map((l) => l.code),
    mixed.lines.filter((l) => M.needsReview(l) || l.lineTotal == null).map((l) => l.code),
  );
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
  // `technical_review` IS a flag on its own, because the server sets it from the
  // review map and a record can arrive with the status and an empty map.
  assert.equal(M.needsReview(M.parseProjectRecord(body({ lines: [line({ status: "technical_review" })] })).lines[0]), true);
  // AND `needs_review` IS NOT A QUOTE LINE STATUS. It belongs to
  // `schedule_parse_job` (migrations/0012), and this file's flag test asserted
  // it for two revisions — which is how a distinction between "needs attention"
  // and "blocks the quote" got invented and defended, when on every writer the
  // two are the same set. Every path derives `no total -> incomplete`,
  // `reasons left -> technical_review`, else `ready`; nothing writes this.
  assert.equal(M.needsReview(M.parseProjectRecord(body({ lines: [line({ status: "needs_review" })] })).lines[0]), false);

  // P1-AC-31 — WHAT KIND OF FIGURE IT IS. An unpriced line is `no_rate` and
  // never a zero; a figure a human set is not the rate card's.
  const state = (over) => M.priceState(M.parseProjectRecord(body({ lines: [line(over)] })).lines[0]);
  assert.equal(state({ lineTotal: null }), "no_rate");
  // A GENUINE ZERO IS A PRICE, NOT AN ABSENCE — the property this line has
  // always been about. Which KIND of price it is depends on what evidence the
  // row carries, so the assertion is that it is not the absence.
  assert.notEqual(state({ lineTotal: 0 }), "no_rate", "a genuine zero is a price");
  assert.equal(state({ lineTotal: 900, priceOverrideAt: "2026-08-20T01:00:00Z" }), "override");
  // `list` is CLAIMED ONLY WITH EVIDENCE. `priceCalculated` is the rate card's
  // own figure; without it, a figure with no override stamp is a figure whose
  // provenance this record does not know — accepted order lines discard the
  // metadata outright, and a composite parent can hold overridden segments
  // while carrying no timestamp of its own.
  assert.equal(state({ lineTotal: 900, priceCalculated: 900 }), "list");
  assert.equal(state({ lineTotal: 900 }), "unknown");

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

test("no ops2 source can render 'so far' or a word about GST", () => {
  // P1-AC-36 / AC-N4 / AC-N5, the grep half — a negative that has to be
  // GREPPABLE as well as walkable, because it is an ABSENCE and a browser test
  // can only check the states someone remembered to render.
  //
  // "so far" was invented by an earlier session as a caption for a sum
  // containing unpriced lines. It came from neither the mock nor the owner, and
  // he deleted it (R9). GST is his standing ruling on this console: "not a
  // customer preference-driven site, an ops system default approach that
  // matters" — ex/inc is a CUSTOMER ACCOUNT's display preference and this
  // console has no account to read it from.
  //
  // COMMENTS ARE STRIPPED BEFORE SCANNING, deliberately: the reasoning above is
  // recorded in the source precisely so a future session does not "fix" the
  // absence back, and a scan that punished the explanation would teach people
  // to delete it.
  const dir = join(projectRoot, "src", "ops2");
  const offenders = [];
  for (const file of globSync("**/*.{ts,tsx,css}", { cwd: dir })) {
    const code = readFileSync(join(dir, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    if (/so far/i.test(code)) offenders.push(`${file}: "so far"`);
    if (/\bgst\b/i.test(code)) offenders.push(`${file}: GST`);
  }
  assert.deepEqual(offenders, [], "ops2 says nothing about tax, and never calls a partial sum 'so far'");
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

test("a symmetric composite is ONE segment row carrying two units", () => {
  // migrations/0028_composite_lines.sql:33-36, verbatim: "A symmetric 2x1800
  // split is one segment row with qty_per_parent = 2, not two identical rows —
  // fewer rows, and it states 'these are the same frame'."
  //
  // So counting segment ROWS to decide whether an opening is a composite draws
  // a supported storage shape as a single frame: the drawing loses its mullion
  // and the review body treats a joined opening as a simple one. It is the
  // UNITS that make a composite, not the rows they are stored in.
  const sym = M.parseProjectRecord(body({
    lines: [line({
      lineKind: "composite_parent", compositeAxis: "vertical",
      segments: [{ id: "s1", productName: "Awning 1800", productSlug: "awning-1800",
        width: "1800", height: "1500", qtyPerParent: 2, qty: 2, lineTotal: 4000, status: "ready" }],
    })],
  })).lines[0];

  assert.equal(M.joinedUnitCount(sym), 2, "two frames go into this opening");
  assert.equal(M.unitsOf(sym).length, 2, "and there are two units to review");
  const parts = M.elevationPartsFor(sym);
  assert.ok(parts, "a symmetric composite still has parts to draw");
  assert.equal(parts.reduce((n, p) => n + p.qty, 0), 2);

  // One frame is not a composite however it is stored — handing the generator a
  // one-unit `parts` draws a join that does not exist.
  const single = M.parseProjectRecord(body({
    lines: [line({ segments: [{ id: "s1", productName: "X", width: "1", height: "1", qtyPerParent: 1, qty: 1, lineTotal: 1, status: "ready" }] })],
  })).lines[0];
  assert.equal(M.elevationPartsFor(single), undefined);
});



test("a price with no provenance says so rather than claiming the rate card", () => {
  // `priceOverrideAt` is discarded on accepted order lines, and a composite
  // parent can hold overridden SEGMENTS while carrying no parent timestamp of
  // its own. Reading "no timestamp" as "list price" states a provenance the
  // record does not have.
  assert.equal(M.priceState(line({ lineTotal: null })), "no_rate");
  assert.equal(M.priceState(line({ lineTotal: 1000, priceOverrideAt: "2026-08-01" })), "override");
  assert.equal(M.priceState(line({ lineTotal: 1000, priceCalculated: 900 })), "list",
    "the rate card's own figure is on the row, so the comparison is real");
  assert.equal(M.priceState(line({ lineTotal: 1000 })), "unknown",
    "no timestamp and no calculated figure is not evidence of a list price");
});

// ── The Price panel's markup ─────────────────────────────────────
//
// `Panel` wraps every row in a <dl>, and a row without a key rendered as a
// <div><dd>…</dd></div>: a definition with no term. The Price panel is two such
// rows, so assistive technology was handed the number and the pricing state as
// definitions of nothing. Accessibility is binding in this repo, so the shape
// is asserted rather than eyeballed — both panels, because the keyed one must
// keep being a description list.
test("a panel row without a key is not a definition without a term", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Panel } = await import(pathToFileURL(panelOut).href);

  const priced = renderToStaticMarkup(createElement(Panel, {
    title: "Price", budget: 2,
    lines: [{ v: "$1,240.00" }, { v: "Priced", quiet: true }],
  }));
  assert.match(priced, /\$1,240\.00/, "the figures still render");
  assert.match(priced, /Priced/);
  assert.ok(!/<dd>/.test(priced), `a keyless panel emits no <dd>:
${priced}`);
  assert.ok(!/<dl/.test(priced), "and no <dl>, because it defines nothing");

  const spec = renderToStaticMarkup(createElement(Panel, {
    title: "Specification", budget: 4,
    lines: [{ k: "Product", v: "AMJ80 Awning" }, { k: "Glazing", v: "Double Low-E" }],
  }));
  assert.match(spec, /<dl/, "a keyed panel is still a description list");
  const terms = (spec.match(/<dt>/g) ?? []).length;
  const defs = (spec.match(/<dd>/g) ?? []).length;
  assert.equal(terms, 2);
  assert.equal(defs, terms, "every definition has its term");
});

// ── What the drawing viewer is handed ────────────────────────────────────────
//
// The viewer itself is presentation-only — a subject in, a back closure out —
// so everything it SAYS is decided here, where node can read it. The browser
// suite (scripts/tests/web/ops2-drawing-viewer.spec.ts) proves it reaches the
// screen; this proves it is the right sentence before it gets there.

const composite = (over = {}) => line({
  code: "W07", lineKind: "composite_parent", compositeAxis: "vertical",
  width: "2400", height: "1500", productName: "Composite opening",
  segments: [
    { id: "s1", productSlug: "amj67t-awning-window", productName: "AMJ67T Awning",
      width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 500, status: "ready" },
    { id: "s2", productSlug: "amj67-fixed-window", productName: "AMJ67 Fixed",
      width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 400, status: "ready" },
  ],
  ...over,
});
const parse = (l) => M.parseProjectRecord(body({ lines: [l] })).lines[0];

test("only a composite offers units to enlarge, so an ordinal cannot address a frame that is not on screen", () => {
  // The count the URL grammar is answered against. A simple opening displays no
  // units list, so `…/drawing/u1` on one names nothing — and a line with a
  // single segment is a single frame, not a split (`elevationPartsFor`'s own
  // rule: fewer than two units is not a composite).
  assert.equal(M.viewerUnitCount(parse(line())), 0, "a simple opening");
  assert.equal(M.viewerUnitCount(parse(composite())), 2);
  // Units, not rows: a symmetric split is ONE segment carrying qty 2.
  assert.equal(M.viewerUnitCount(parse(composite({
    segments: [{ id: "s1", productSlug: "amj67t-awning-window", productName: "AMJ67T Awning",
      width: "1200", height: "1500", qtyPerParent: 2, qty: 2, lineTotal: 900, status: "ready" }],
  }))), 2);
  assert.equal(M.viewerUnitCount(parse(line({
    lineKind: "composite_parent",
    segments: [{ id: "s1", productSlug: "x", productName: "One frame",
      width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 500, status: "ready" }],
  }))), 0, "one frame is not a split");
});

test("the line's own drawing is titled `Drawing`, and back names the line", () => {
  // VIEW-AC-1a, the owner's ruling: the back control already names the line, so
  // a title repeating the code says it twice. The size lives in the caption.
  const s = M.drawingSubject(parse(line({ code: "W03", width: "1800", height: "1200",
    productSlug: "amj80-series-awning-window" })), { view: "drawing", unitIndex: null }, null);
  assert.equal(s.title, "Drawing");
  assert.equal(s.backLabel, "W03");
  assert.equal(s.code, "W03", "the accessible name still carries the subject's identity");
  assert.equal(s.productSlug, "amj80-series-awning-window");
  assert.equal(s.width, "1800");
  assert.equal(s.height, "1200");
  assert.equal(s.caption, "1200 × 1800 mm · height × width");
  assert.equal(s.parts, undefined, "a simple opening is not drawn from units");
  assert.deepEqual(s.units, [], "and has none to list");
  assert.equal(s.basis, null, "no arrangement caveat where there is no arrangement");

  // The line page never asks the viewer for a subject it is not showing — and
  // "not showing" is EVERY view that is not a drawing, not just the line's own.
  //
  // OBSERVED before this was widened: with `view: "why"` this returned a whole
  // subject, `title: "Drawing"`, `backLabel: "W03"` — so the rationale screen
  // opened a drawing viewer behind itself, a screen the reviewer never asked
  // for carrying its own back control. The guard was a deny-list on `"line"`,
  // exhaustive when written; `LineView` grew `"why"` and it silently was not.
  // The grammar was right the whole time (`lineRoute.ts`: one suffix, so the
  // two are siblings by construction); its consumer was not.
  for (const view of ["line", "why"]) {
    assert.equal(M.drawingSubject(parse(line()), { view, unitIndex: null }, null), null,
      `view "${view}" is not a drawing and must not build one`);
  }
});

test("a composite's caption reads its overall and what it is drawn from, and its units are listed", () => {
  const s = M.drawingSubject(parse(composite()), { view: "drawing", unitIndex: null }, null);
  assert.equal(s.title, "Drawing");
  assert.equal(s.backLabel, "W07");
  assert.equal(s.caption,
    "1500 × 2400 mm overall · height × width · drawn from its 2 units of 1500 × 1200 mm");
  assert.equal(s.axis, "vertical");
  assert.equal(s.parts.length, 2, "the drawing is built from the units, not guessed from a family");
  assert.deepEqual(s.units, [
    { code: "W07A", productName: "AMJ67T Awning", size: "1500 × 1200 mm" },
    { code: "W07B", productName: "AMJ67 Fixed", size: "1500 × 1200 mm" },
  ]);

  // THE CAVEAT STAYS; the sentence teaching that panel widths are proportional
  // does NOT (R25 — that one explains how to read the drawing, this one states
  // what the drawing is worth).
  assert.equal(s.basis,
    "Indicative arrangement — the mullion positions are confirmed on technical review.");
  assert.ok(!/proportion/i.test(JSON.stringify(s)), "no sentence teaches the notation");

  // Units of different sizes have no single size to claim, so the caption stops
  // where the truth does rather than picking the first one.
  const mixed = M.drawingSubject(parse(composite({
    segments: [
      { id: "s1", productSlug: "a", productName: "Awning 1200", width: "1200", height: "1500",
        qtyPerParent: 1, qty: 1, lineTotal: 500, status: "ready" },
      { id: "s2", productSlug: "b", productName: "Fixed 600", width: "600", height: "1500",
        qtyPerParent: 1, qty: 1, lineTotal: 300, status: "ready" },
    ],
  })), { view: "drawing", unitIndex: null }, null);
  assert.equal(mixed.caption, "1500 × 2400 mm overall · height × width · drawn from its 2 units");
});

test("a unit is titled with its own code and captioned with its place in the opening", () => {
  // VIEW-AC-4. 1-based, and the ordinal is the one the labels already imply.
  const first = M.drawingSubject(parse(composite()), { view: "unit", unitIndex: 1 }, null);
  assert.equal(first.title, "W07A");
  assert.equal(first.code, "W07A");
  assert.equal(first.backLabel, "W07", "back still returns to the line, not to the parent drawing");
  assert.equal(first.productSlug, "amj67t-awning-window");
  assert.equal(first.width, "1200");
  assert.equal(first.height, "1500");
  assert.equal(first.caption,
    "W07A · 1500 × 1200 mm · unit 1 of 2 in W07, which is 1500 × 2400 mm overall");
  assert.equal(first.parts, undefined, "a unit is one frame — handing it parts draws a join that is not there");
  assert.deepEqual(first.units, [], "and it does not list the assembly it came from");

  const second = M.drawingSubject(parse(composite()), { view: "unit", unitIndex: 2 }, null);
  assert.equal(second.title, "W07B");
  assert.equal(second.productSlug, "amj67-fixed-window");
  assert.match(second.caption, /unit 2 of 2 in W07/);

  // An ordinal the line cannot answer is never a subject. The route grammar
  // normalises this away first; the model refuses it too, because a viewer
  // rendering `undefined` as a drawing is worse than one that does not open.
  assert.equal(M.drawingSubject(parse(composite()), { view: "unit", unitIndex: 3 }, null), null);
  assert.equal(M.drawingSubject(parse(line()), { view: "unit", unitIndex: 1 }, null), null);
});

test("no size read is said in the existing sentence, and nothing pretends to be a measurement", () => {
  // VIEW-AC-8. The stand-in square keeps the caption it has always had — that
  // is a statement about the drawing's AUTHORITY, which R25 leaves alone.
  const s = M.drawingSubject(parse(line({ code: "W11", width: "", height: "" })),
    { view: "drawing", unitIndex: null }, null);
  assert.equal(s.caption, "No size read for this opening — drawn as a square stand-in");
  assert.equal(s.title, "Drawing");
  assert.equal(s.backLabel, "W11");

  // Half a size is not a size. `1200 ×` reads as a complete fact with a
  // rendering bug, which is the one line a reviewer must not skim past.
  const half = M.drawingSubject(parse(line({ width: "1200", height: "" })),
    { view: "drawing", unitIndex: null }, null);
  assert.equal(half.caption, "No size read for this opening — drawn as a square stand-in");

  // A unit of an opening whose own size was never read still states its place.
  // The overall clause stops where the fact stops — "which is size not read
  // overall" is a sentence that reads as a rendering fault.
  const unit = M.drawingSubject(parse(composite({ width: "", height: "" })),
    { view: "unit", unitIndex: 1 }, null);
  assert.equal(unit.caption, "W07A · 1500 × 1200 mm · unit 1 of 2 in W07");
});

// ── The enlarged composite, dimensioned unit by unit ────────────────────────
//
// Owner, at the mock gate: "for splits, showing dimensions of the units, as
// well as overall dimensions, would be nice." So the viewer's composite carries
// TWO leader rows — each unit's own size ticked at the mullions, and the overall
// below it — and the relationship is read off the drawing in one look instead of
// being assembled from a caption and a list.

const renderElevation = async (props) => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createElement } = await import("react");
  const { Elevation } = await import(pathToFileURL(elevOut).href);
  return renderToStaticMarkup(createElement(Elevation, props));
};
/** Every number the drawing prints on a leader, in document order. */
const leaders = (svg) => [...svg.matchAll(/class="elev-dim"[^>]*>([^<]*)</g)].map((m) => m[1]);

test("the viewer's composite states each unit's size AND the overall, on the drawing", async () => {
  const svg = await renderElevation({
    productSlug: "", widthMm: "2400", heightMm: "1500", size: "lg", axis: "vertical",
    parts: [
      { productSlug: "amj67t-awning-window", alongMm: "1200", qty: 1 },
      { productSlug: "amj67-fixed-window", alongMm: "1200", qty: 1 },
    ],
    unitDims: true,
  });
  // Two unit widths, then the overall width, then the height up the side.
  assert.deepEqual(leaders(svg), ["1200", "1200", "2400", "1500"]);

  // Proportion is a property of the DRAWING, and nothing on this surface
  // explains it in words (R25, VIEW-AC-10) — which is exactly why the numbers
  // have to be on the drawing itself.
  assert.ok(!/proportion/i.test(svg), "no sentence teaches the notation");

  // An uneven split prints what each unit really is, not two halves.
  const uneven = await renderElevation({
    productSlug: "", widthMm: "3000", heightMm: "1500", size: "lg", axis: "vertical",
    parts: [
      { productSlug: "a", alongMm: "2400", qty: 1 },
      { productSlug: "b", alongMm: "600", qty: 1 },
    ],
    unitDims: true,
  });
  assert.deepEqual(leaders(uneven), ["2400", "600", "3000", "1500"]);

  // A horizontal split divides the HEIGHT, so its units are dimensioned up the
  // side beside the overall height and the width row stays one number. Getting
  // this backwards draws unit widths that add up to the wrong dimension —
  // arithmetic a reviewer would report as a data fault.
  const stacked = await renderElevation({
    productSlug: "", widthMm: "1200", heightMm: "2400", size: "lg", axis: "horizontal",
    parts: [
      { productSlug: "a", alongMm: "1200", qty: 1 },
      { productSlug: "b", alongMm: "1200", qty: 1 },
    ],
    unitDims: true,
  });
  assert.equal(leaders(stacked).length, 4, "two unit heights, the overall height, one width");
  assert.equal(leaders(stacked).filter((n) => n === "2400").length, 1, "one overall height");
  assert.equal(leaders(stacked).filter((n) => n === "1200").length, 3, "two units and the width");
});

test("unit leaders are opt-in, so the customer site's drawings are untouched", async () => {
  // THE HALF THAT IS NOT NEW BEHAVIOUR, and the reason it is written down.
  // `Elevation` is the CUSTOMER SITE's component: a quote's composite drawings
  // render through this same function, and this feature has no business
  // changing them. So the default is asserted byte-for-byte rather than trusted
  // to a default value that a later edit could quietly move.
  const base = {
    productSlug: "", widthMm: "2400", heightMm: "1500", size: "lg", axis: "vertical",
    parts: [
      { productSlug: "amj67t-awning-window", alongMm: "1200", qty: 1 },
      { productSlug: "amj67-fixed-window", alongMm: "1200", qty: 1 },
    ],
  };
  const plain = await renderElevation(base);
  assert.deepEqual(leaders(plain), ["2400", "1500"], "the default is one width and one height");
  assert.equal(plain, await renderElevation({ ...base, unitDims: false }),
    "and the flag off is the same drawing, to the byte");

  // INERT WHERE THERE IS NOTHING TO DIMENSION. The viewer passes the flag on
  // every drawing it opens, so a simple opening has to be drawn identically
  // with it and without it — otherwise three quarters of ops2's lines would be
  // re-laid-out by a flag that has no units to answer.
  const simple = { productSlug: "amj80-series-awning-window", widthMm: "1800",
    heightMm: "1200", size: "lg" };
  assert.equal(await renderElevation({ ...simple, unitDims: true }),
    await renderElevation(simple), "a single frame is drawn the same either way");

  // And an unsized opening still draws NO leaders at all (VIEW-AC-8): the
  // stand-in square must not start printing numbers because a flag was set.
  const unsized = await renderElevation({ ...base, widthMm: "", heightMm: "", unitDims: true });
  assert.deepEqual(leaders(unsized), []);
});

test("FB-AC-34 — the break symbol is painted BEFORE the width figure, never over it", async () => {
  // THE DEFECT, REDUCED TO DOCUMENT ORDER. A wide opening gets a "not to scale"
  // break symbol, and the symbol erases the leader it interrupts with a rect
  // filled in the paper colour. That rect was emitted AFTER the number sharing
  // the same centre, so it painted out the lower half of every digit — measured
  // on a 3500 x 700 opening: glyphs at y 78.6-87.2, rect covering 83.2-97.2.
  //
  // The number already knows how to survive a leader crossing it: `paint-order:
  // stroke` haloes it against `--paper`, which is the same colour the rect is
  // filled with. So the fix is ordering, not geometry — put the symbol under
  // the figure and the halo does the rest, on both consoles.
  const svg = await renderElevation({
    productSlug: "", widthMm: "3500", heightMm: "700", size: "hero",
  });
  assert.match(svg, /elev-break/, "3500 x 700 is 5:1, well past the 2.4 the symbol appears at");

  const breakAt = svg.indexOf("elev-break");
  const widthFigure = svg.indexOf(">3500<");
  assert.ok(widthFigure > 0, "the width is drawn as a figure");
  assert.ok(breakAt < widthFigure,
    "the break symbol precedes the figure it interrupts, so the figure paints last");

  // AND IT IS ONLY THE WIDTH'S. The height leader runs up the other side and is
  // never interrupted — an ordering fix that swept the whole group would put the
  // height's own figure under something too.
  assert.ok(svg.indexOf(">700<") > breakAt, "the height figure is unaffected by the reorder");

  // A drawing that is not wide has no symbol to order at all, which is the case
  // every other test in this file renders.
  const square = await renderElevation({
    productSlug: "", widthMm: "1200", heightMm: "1200", size: "hero",
  });
  assert.doesNotMatch(square, /elev-break/, "no symbol below the ratio, so nothing to paint over");
});

test("a line with no code still has a back control that says where it goes", () => {
  // The record keeps a line whose code the parser could not read, so the viewer
  // has to open on one. A back control labelled with an empty string is a
  // control nobody can name aloud.
  const s = M.drawingSubject(parse(line({ code: "" })), { view: "drawing", unitIndex: null }, null);
  assert.equal(s.backLabel, "the line");
  assert.equal(s.code, "this opening", "and the accessible name still says what it is");
});

test("a UNIT of a line with no code names itself by its place, never by a code that is not there", () => {
  // The same state one level down, and the level that was left interpolating
  // the missing code raw: `unit 1 of 2 in ` is a sentence that stops mid-air,
  // and `unitLabel("", 0)` titles the viewer with a bare `A`.
  const s = M.drawingSubject(parse(composite({ code: "" })), { view: "unit", unitIndex: 1 }, null);
  assert.equal(s.backLabel, "the line");
  assert.equal(s.title, "Unit 1", "a title is never a letter on its own");
  assert.equal(s.code, "Unit 1");
  // The opening is named the way the parent path already names it, and the
  // ordinal carries the identity the code cannot — so the caption does not lead
  // with `Unit 1` and then say `unit 1 of 2` again.
  assert.equal(s.caption,
    "1500 × 1200 mm · unit 1 of 2 in this opening, which is 1500 × 2400 mm overall");

  // A coded line is untouched by any of it.
  const coded = M.drawingSubject(parse(composite()), { view: "unit", unitIndex: 2 }, null);
  assert.equal(coded.title, "W07B");
  assert.equal(coded.caption,
    "W07B · 1500 × 1200 mm · unit 2 of 2 in W07, which is 1500 × 2400 mm overall");
});

test("the units list of a code-less assembly names its rows the way the viewer titles them", () => {
  // The same missing code, one surface further out. Each row of this list OPENS
  // the viewer above, so a row reading `A` under a viewer titled `Unit 1` is two
  // names for one frame.
  const whole = M.drawingSubject(parse(composite({ code: "" })), { view: "drawing", unitIndex: null }, null);
  assert.deepEqual(whole.units.map((u) => u.code), ["Unit 1", "Unit 2"]);
  // The coded assembly still reads `W07A`, `W07B`.
  const coded = M.drawingSubject(parse(composite()), { view: "drawing", unitIndex: null }, null);
  assert.deepEqual(coded.units.map((u) => u.code), ["W07A", "W07B"]);
});

// ── Where back goes, and therefore what it is allowed to say ────────────────

test("the back control names WHERE IT GOES, and the two ways in answer differently", () => {
  // VIEW-AC-15. There are exactly two ways into the viewer. From the line's own
  // page back returns to the line and names it, as it always has. From the
  // record's desk canvas back returns to the RECORD — so naming the line there
  // promises a page the journey never visits, which is the defect this replaces.
  const l = parse(line({ code: "W03" }));
  const at = (route, backTo) => M.drawingSubject(l, route, backTo);
  const drawing = { view: "drawing", unitIndex: null };
  assert.equal(at(drawing, null).backLabel, "W03", "from the line page, the line");
  // The record's REFERENCE, which is the vocabulary the line page's own back
  // control already uses for this same destination. The spec first assumed the
  // project's title; the owner vetoed it (§13.17) because one destination must
  // not carry two names in one console. WHICH string appears is the whole of the
  // ruling, so the browser suite asserts the reference against the title.
  assert.equal(at(drawing, "OF-Q-10482").backLabel, "OF-Q-10482");
  // AND NOTHING IS INVENTED ON THE WAY THROUGH. This used to assert that an
  // empty string became `Project` — the console's pre-load word. That branch is
  // gone, because this function cannot reach the state the criterion describes:
  // a subject only exists once the record has resolved a line, and `record.ref`
  // is `str(publicRef) ?? id` on a parse that returns `null` without a non-empty
  // id. The console's `Project` is on LinePage's page-level control, where the
  // pre-load state is real. The guarantee that makes the branch unnecessary is
  // pinned above, in the parser's own test.

  // ONE CONTROL, so the unit path answers the same way.
  const c = parse(composite());
  const unit = { view: "unit", unitIndex: 1 };
  assert.equal(M.drawingSubject(c, unit, null).backLabel, "W07");
  assert.equal(M.drawingSubject(c, unit, "OF-Q-10482").backLabel, "OF-Q-10482");

  // AND VIEW-AC-1a IS UNTOUCHED. Only the destination's name moves; the title
  // still carries the SUBJECT, by whichever door the reviewer came in.
  assert.equal(M.drawingSubject(c, unit, "OF-Q-10482").title, "W07A");
  assert.equal(at(drawing, "OF-Q-10482").title, "Drawing");
  assert.equal(at(drawing, "OF-Q-10482").code, "W03");
});
