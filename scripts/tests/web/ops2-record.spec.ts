import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ops2's project record — the surface the console is being rebuilt to reach.
//
// WHY A BROWSER SUITE. The node suite (scripts/tests/ops2-record.test.mjs)
// proves the arithmetic and the vocabulary; it cannot see whether a blocked
// primary is on the screen, whether a composite's units are inside their parent
// or loose beside them, or whether the Project tab says it is not built. The
// HTML the Worker serves is byte-identical in every one of those states.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const RECORD_URL = "**/api/ops/projects/p_rec";
const RECORD = `${OPS_HOST}/ops2/projects/p_rec`;

// u_staff3 — ITS OWN IDENTITY, and the reason is a suite-level fact rather than
// a preference. Code issuance refuses a second challenge to one address inside
// RESEND_COOLDOWN_MS (60s, worker/lib/auth.ts) and this battery runs several
// files at once, so sharing a mailbox makes whichever signs in second fail at
// its OTP — reported as "staff sign-in", which reads like broken auth rather
// than like a rate limit doing its job. ops.spec.ts takes u_staff1,
// ops2-projects.spec.ts takes u_staff2, and scripts/db/seed.sql records the
// allocation beside the rows.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff3'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff3");
  return email;
})();

let staffCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/ops/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/ops/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, STAFF_EMAIL);
  if (ok) throw new Error(String(ok));
  staffCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => { await context.addCookies(staffCookies); });

/** The body `GET /api/ops/projects/:id` returns, in its own shape. */
const line = (over: Record<string, unknown> = {}) => ({
  id: "l1", code: "W01", room: "Kitchen", productName: "Awning 600",
  width: "1200", height: "900", qty: 1, lineTotal: 1000, status: "ready",
  options: {}, review: null, lineKind: "simple", segments: [], ...over,
});

const record = (over: Record<string, unknown> = {}) => ({
  project: {
    id: "p_rec", title: "Wattle Grove - Lot 14", publicRef: "OF-Q-10482",
    statusInternalLabel: "Technical review", customerName: "Ana Bianchi",
    org: "Marchetti Constructions", unresolvedLineCount: 0,
  },
  lifecycle: { stateLabel: "Technical review", waitingOn: "Us", phase: "Pricing" },
  daysInStage: 3,
  lines: [line()],
  delivery: { amount: 420, settled: true, estimate: 400 },
  actions: [],
  order: null,
  ...over,
});

test("the header carries the project's NAME, then its ids, then the customer", async ({ page }) => {
  // THE OWNER'S CORRECTION. The surface shipped with the reference as the page's
  // name and the project's own title, customer and state pushed into the content
  // below the band — "all that within white header, not part in the header and
  // part in the list area!" (grill R3).
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line(), line({ id: "l2", code: "W02", productName: "Sliding door", lineTotal: 2000 })],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  // The NAME is the page's name. Not the id.
  await expect(page.getByRole("heading", { name: "Wattle Grove - Lot 14", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OF-Q-10482", level: 1 })).toHaveCount(0);

  // Then the reference, then the customer — one block, inside the band.
  const ident = page.getByTestId("record-identity");
  await expect(ident).toContainText("OF-Q-10482");
  await expect(ident).toContainText("Marchetti Constructions");
  // ONE BLOCK, INSIDE THE BAND — identity and the state row both. Who owes the
  // next move is the first thing read on arrival; below the tabs it scrolled
  // away with the list.
  const band = page.locator(".ops2-page__band");
  await expect(band.getByTestId("record-identity")).toHaveCount(1);
  await expect(band.getByTestId("record-state")).toHaveCount(1);
  await expect(band.getByTestId("record-state")).toContainText("Waiting on us");

  const tabs = page.getByTestId("record-tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveText(/Lines/);
  await expect(tabs.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("record-line")).toHaveCount(2);

  // BACK NAMES ITS DESTINATION — the settled rule — and it goes there.
  await page.locator(".ops2-page__back").click();
  await expect(page).toHaveURL(/\/ops2\/projects$/);
});

test("every row carries the opening DRAWN, and it adds nothing a screen reader loses", async ({ page }) => {
  // The single largest gap in the rejected build: the mock puts `<Elevation>` in
  // the row's leading slot (pieces.tsx:270-273) and it was simply absent. It is
  // the opening drawn to true proportion, not a category glyph.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ productSlug: "awning-600" }),
      line({ id: "l2", code: "W02", productName: "Sliding door", productSlug: "slider-2400", lineTotal: 2000 }),
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const rows = page.getByTestId("record-line");
  await expect(rows).toHaveCount(2);
  // A DRAWING PER ROW, and a real one — an <svg> with geometry in it, not an
  // empty slot that happens to occupy the space.
  for (const i of [0, 1]) {
    const svg = rows.nth(i).locator("svg");
    await expect(svg).toHaveCount(1);
    expect(await svg.locator("path, rect, line, polyline").count(),
      `row ${i} drew nothing`).toBeGreaterThan(0);
  }
  // DECORATIVE TO ASSISTIVE TECHNOLOGY. The row's own text still carries the
  // code, the product and the size, so the drawing adds and never replaces.
  await expect(rows.nth(0).locator("svg")).toHaveAttribute("aria-hidden", "true");
  await expect(rows.nth(0)).toContainText("W01");
  await expect(rows.nth(0)).toContainText("Awning 600");
});

test("a line states its money, and an absent rate is never a zero", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ lineTotal: 3480 }),
      line({ id: "l2", code: "W02", productName: "Sliding door", lineTotal: null, status: "draft",
        review: { glazing: "glazing option out of range" } }),
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const rows = page.getByTestId("record-line");
  await expect(rows.nth(0)).toContainText("$3,480");
  // NOT $0. Unpriced work is what this console exists to hunt for, and turning
  // it into a plausible-looking number is the worst available failure.
  await expect(rows.nth(1)).toContainText("No rate");
  await expect(rows.nth(1)).not.toContainText("$0");

  // ONE BADGE, NOT A LIST OF REASONS (grill R5). The parser's own words belong
  // on the line's own page; a row that recites them stops being scannable.
  await expect(rows.nth(1)).not.toContainText("glazing option out of range");
  await expect(rows.nth(0)).toHaveAttribute("data-flagged", "false");
  await expect(rows.nth(1)).toHaveAttribute("data-flagged", "true");

  // AND NO ACCORDION, AT ANY WIDTH (grill R6). Nothing in a row expands.
  await expect(page.getByTestId("record-line-toggle")).toHaveCount(0);
  await expect(page.getByTestId("record-line-body")).toHaveCount(0);
});

test("the attention row names what is blocking, and filters to it", async ({ page }) => {
  // The mock's BlockerRow (pieces.tsx:200-229), absent from the rejected build:
  // a list of 18 openings with 2 unpriced is a scanning problem, and the answer
  // is a filter rather than noise on every row.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ id: "l1", code: "W01", lineTotal: 1000 }),
      line({ id: "l2", code: "W02", lineTotal: null, status: "draft" }),
      line({ id: "l3", code: "W03", lineTotal: null, status: "draft" }),
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const attention = page.getByTestId("record-attention");
  await expect(attention).toContainText("2");
  await expect(page.getByTestId("record-line")).toHaveCount(3);

  await attention.click();
  // It filters to exactly the lines it counted — the number and the list it
  // predicts cannot be computed down two different paths.
  await expect(page.getByTestId("record-line")).toHaveCount(2);
  await expect(attention).toContainText("Showing");
  await attention.click();
  await expect(page.getByTestId("record-line")).toHaveCount(3);
});

test("the totals name the absence rather than captioning a number", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", code: "W02", lineTotal: null, status: "draft" })],
    delivery: { amount: null, settled: false, estimate: 640 },
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const totals = page.getByTestId("record-totals");
  await expect(totals).toContainText("$1,000");
  await expect(totals).toContainText("1 with no rate");
  // AND THE CORNER DOES NOT REPEAT IT. `$1,000 · 1 no rate` beside the total
  // said what the attention row says two lines below, with the control.
  await expect(page.getByTestId("record-identity")).not.toContainText("no rate");
  // The project total is the ABSENCE, named — not a figure under a caption
  // saying it is not really the figure, which is how a reviewer quotes $18,000
  // for a $30,000 job.
  await expect(totals).toContainText("Project total");
  await expect(totals).toContainText("has no rate");
  // "so far" was invented by the console and deleted by the owner. No GST
  // anywhere on this console, ever.
  await expect(page.locator("body")).not.toContainText("so far");
  await expect(page.locator("body")).not.toContainText("GST");
});

test("a row opens the line's own page on the phone", async ({ page }) => {
  // Grill R6, the owner verbatim: "tapping on the line will lead to a new view
  // details screen with composite details. Edit, 'Why this product?' will then
  // be accessible from here."
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "l1", code: "W01", productSlug: "awning-600",
      options: { Colour: "Monument", Glazing: "Double clear" },
      review: { glazing: "glazing option out of range" }, status: "technical_review" })],
  }) }));

  // PHONE ONLY. Phase 2 supersedes this at desk width by design (P2-AC-2): the
  // canvas beside the rail is already showing a line, so selecting one there is
  // not navigation. That half is covered by "the desk reviews a line beside the
  // list", which asserts the history does NOT move.
  for (const [width, height] of [[390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(RECORD);
    await page.getByTestId("record-line").first().click();
    await expect(page).toHaveURL(/\/ops2\/projects\/p_rec\/line\/l1$/);

    // The drawing is the subject here, not a slot.
    await expect(page.getByTestId("line-plate")).toBeVisible();
    await expect(page.getByTestId("line-size")).toContainText("1200");
    // The parser's reasons live HERE — the row carried only a badge.
    await expect(page.getByTestId("line-review-reasons")).toContainText("glazing option out of range");

    // Back returns to the record it came from rather than stacking another.
    // SCOPED TO THE PAGE ON SCREEN: Ionic keeps the record MOUNTED in its view
    // stack behind the line page, so both back controls exist in the DOM and a
    // bare selector matches two. `ion-page-hidden` is what Ionic puts on the
    // one you are not looking at.
    // BY ITS NAME, not by position or visibility. Ionic keeps the record
    // MOUNTED and rendered behind the line page, so both back controls are in
    // the DOM and both report as visible — `:visible` and `ion-page-hidden`
    // both matched two. The two controls name different destinations, which is
    // the settled rule for this control and therefore the durable way to say
    // which one is meant.
    await page.getByRole("button", { name: "OF-Q-10482" }).click();
    await expect(page).toHaveURL(/\/ops2\/projects\/p_rec$/);
  }
});

test("a blocked action is shown, refused, and says why beside itself", async ({ page }) => {
  // The owner's correction, and the server already models it: decision
  // authority is about overriding a recommendation or a guardrail — it was
  // never a licence to issue a quote with a missing price.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: null, status: "draft" })],
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
        blockedReason: "1 line is unpriced or unresolved",
        confirm: "Freezes this quote and emails it." },
      { id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" },
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const cta = page.getByTestId("record-primary");
  await expect(cta).toBeVisible();
  await expect(cta).toContainText("Issue reviewed quote");
  // ASSERTED AS A REFUSAL, not as a DOM attribute. `ion-button` is a custom
  // element with no native disabled state — Playwright's `toBeDisabled` cannot
  // see it, and a test written against the attribute would pass on a control
  // that still fires. Ionic's own class, and then the behaviour: pressing it
  // opens nothing.
  await expect(cta).toHaveClass(/button-disabled/);
  await cta.click({ force: true });
  await expect(page.getByTestId("record-confirm")).toHaveCount(0);
  // ADJACENT TO THE CONTROL IT REFUSES, and said ONCE. The attention row is
  // what carries it here: it derives from the same fact the gate refuses on, so
  // a second strip repeating the sentence is the same information twice rather
  // than emphasis. A blocked primary in the header and its reason at the foot
  // of the page would be two facts a reader has to join up; both live in the
  // band, one under the other.
  await expect(page.getByTestId("record-attention")).toContainText("no rate");
  await expect(page.getByTestId("record-blocked")).toHaveCount(0);
  const bandBox = (await page.locator(".ops2-page__band").boundingBox())!;
  const rowBox = (await page.getByTestId("record-attention").boundingBox())!;
  expect(rowBox.y, "the reason sits inside the band with the control it refuses")
    .toBeLessThan(bandBox.y + bandBox.height);
});

test("the panel offers only what this build can actually run", async ({ page }) => {
  // `worker/lib/ops-actions.ts` returns more than the panel shows: `Add a note`
  // and `Request clarification` both need something typed, and neither has a
  // screen yet. They are OMITTED rather than listed and inert.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary" },
      { id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" },
      { id: "note", label: "Add a note", tier: "secondary" },
      { id: "request-clarification", label: "Request clarification", tier: "secondary" },
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await page.getByTestId("record-more").click();
  const panel = page.getByTestId("record-actions-panel");
  await expect(panel).toBeVisible();
  const actions = page.getByTestId("record-action");
  await expect(actions).toHaveCount(1);
  await expect(actions.nth(0)).toContainText("Back to pricing");
  await expect(panel).not.toContainText("Add a note");
  await expect(panel).not.toContainText("Request clarification");
});

test("an action that emails the customer confirms first, in the server's words", async ({ page }) => {
  let issued = 0;
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
        confirm: "Freezes this quote as a new revision and emails it to ana@example.com." },
    ],
  }) }));
  await page.route("**/api/ops/projects/p_rec/issue-quote", (route) => {
    issued += 1;
    return route.fulfill({ json: { ok: true } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await page.getByTestId("record-primary").click();
  // NOT ISSUED YET. `confirm` is present exactly when the action moves money or
  // emails the customer, so the step is the server's call rather than taste.
  expect(issued).toBe(0);
  const confirm = page.getByTestId("record-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("emails it to ana@example.com");

  await page.getByTestId("record-confirm-go").click();
  await expect.poll(() => issued).toBe(1);
});

test("the Project tab says it is not built, rather than showing an empty frame", async ({ page }) => {
  // The owner fenced its contents out of this step by name. The tab exists
  // because two tabs are the structure he asked for and one arriving later
  // moves everything beside it.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record() }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await page.getByTestId("record-tab").nth(1).click();
  await expect(page.getByTestId("record-project-tab")).toContainText("not built yet");
  await expect(page.getByTestId("record-lines")).toHaveCount(0);
  await expect(page.getByTestId("record-totals")).toHaveCount(0);
});

test("a project that is not there says so, and offers the way back", async ({ page }) => {
  // A DIFFERENT SENTENCE AND A DIFFERENT WAY OUT from a failure. "Try again"
  // would send someone retrying a URL that will never resolve.
  await page.route(RECORD_URL, (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await expect(page.getByTestId("record-missing")).toContainText("not here");
  await expect(page.getByTestId("record-missing")).not.toContainText("Try again");
  await expect(page.getByTestId("record-error")).toHaveCount(0);
  // And nothing is still shimmering beside it.
  await expect(page.locator("ion-skeleton-text")).toHaveCount(0);
});

test("the CTA is on the screen at the desk as well as on the phone", async ({ page }) => {
  // It was not. `headActions` was wired into the phone's head row only, so a
  // record at 1440 had no primary action and no overflow at all — the same
  // shape of defect as `{!wide && …}` in `OPEN-DEFECTS.md` D5, in the other
  // direction. Both widths, so neither half can go missing silently.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary" },
      { id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" },
    ],
  }) }));
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(RECORD);
    await expect(page.getByTestId("record-line").first()).toBeVisible();
    await expect(page.getByTestId("record-primary"), `no CTA at ${width}px`).toBeVisible();
    await expect(page.getByTestId("record-more"), `no overflow at ${width}px`).toBeVisible();
  }
});

test("an accepted order shows the contract lines and no dead primary", async ({ page }) => {
  // TWO FINDINGS, ONE STATE — the record of a job that has been accepted, which
  // nothing had opened until Codex went looking.
  //
  // The endpoint returns both line lists and says why: "Once the quote is
  // accepted the draft lines are no longer what anyone is building —
  // order_line is." And `actionsFor` hands over the ORDER stage machine's
  // moves, none of which has a route in this build, so the primary CTA was a
  // button that did nothing when pressed.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "draft", code: "OLD", productName: "Superseded draft", lineTotal: 999 })],
    order: { orderNo: "OF-O-2201", total: 7000 },
    orderLines: [
      { id: "o1", code: "W01", room: "Kitchen", productName: "Awning 600",
        width: "1200", height: "900", qty: 2, lineTotal: 3480, segments: [] },
      { id: "o2", code: "W02", room: "Bed 1", productName: "Composite opening",
        width: "3600", height: "1500", qty: 1, lineTotal: 3520, segments: [
          { id: "os1", productName: "Awning 1200", width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 1200 },
        ] },
    ],
    actions: [
      { id: "advance:deposit_paid", label: "Record the deposit", tier: "primary" },
      { id: "note", label: "Add a note", tier: "secondary" },
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  // What is being built, not what was quoted.
  const rows = page.getByTestId("record-line");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("W01");
  await expect(page.getByTestId("record-lines")).not.toContainText("Superseded draft");
  // The order's own total, freight included — never a re-sum of the draft lines.
  await expect(page.getByTestId("record-totals")).toContainText("$7,000");
  await expect(page.getByTestId("record-identity")).toContainText("OF-O-2201");

  // NO CONTROL THAT CANNOT ACT. The next move is still stated, as a sentence.
  await expect(page.getByTestId("record-primary")).toHaveCount(0);
  await expect(page.getByTestId("record-more")).toHaveCount(0);
  await expect(page.getByTestId("record-pending")).toContainText("Record the deposit");
  await expect(page.getByTestId("record-pending")).toContainText("legacy console");
});

test("an order with no contract lines says so, rather than showing the quote", async ({ page }) => {
  // The first fix fell back to the draft list when `orderLines` came back
  // empty — reasoning that an empty table is a worse answer than a stale one.
  // It is not. An empty list is a fact this screen can state; a superseded
  // quote rendered as the record is a lie, and it sits directly beside the
  // order's own total, which is the number it contradicts.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ code: "OLD", productName: "Superseded draft", lineTotal: 999 })],
    order: { orderNo: "OF-O-2201", total: 7000 },
    orderLines: [],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await expect(page.getByTestId("record-lines")).toHaveCount(0);
  await expect(page.getByTestId("record-lines-empty")).toContainText("OF-O-2201 has no contract lines");
  await expect(page.getByTestId("record-lines-empty")).not.toContainText("Superseded draft");
  // And the tab's own count agrees with the list beside it.
  await expect(page.getByTestId("record-tab").nth(0)).toHaveText(/Lines.*0/);
});

test("a refused action explains itself where the reader is looking", async ({ page }) => {
  // The failure banner renders on the PAGE. A confirm panel is over that page
  // and holds the focus, so a refused `issue-quote` explained itself to a
  // screen nobody could see and left the reader retrying blind.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    actions: [
      { id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
        confirm: "Freezes this quote and emails it." },
    ],
  }) }));
  // A REAL CODE, not prose. The endpoints answer with identifiers, and this
  // test used to mock a sentence — which is how it passed while the banner was
  // printing `delivery_unset` at a reviewer.
  await page.route("**/api/ops/projects/p_rec/issue-quote", (route) =>
    route.fulfill({ status: 409, json: { error: "delivery_unset" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await page.getByTestId("record-primary").click();
  await expect(page.getByTestId("record-confirm")).toBeVisible();
  await page.getByTestId("record-confirm-go").click();

  // The panel gets out of the way, and the server's own words are on screen.
  await expect(page.getByTestId("record-confirm")).toBeHidden();
  await expect(page.getByTestId("record-failure")).toContainText("Delivery has not been set");
  await expect(page.getByTestId("record-failure")).not.toContainText("delivery_unset");
});

test("a conflict re-reads the record, so the stale action goes away", async ({ page }) => {
  // Someone else moved the job between this page loading and the press. The
  // actions on screen are the ones that WERE available, so reporting the 409
  // and leaving them there lets the same invalid request be retried for as long
  // as the tab stays open.
  let reads = 0;
  await page.route(RECORD_URL, (route) => {
    reads += 1;
    return route.fulfill({ json: record({
      actions: reads === 1
        ? [{ id: "issue-quote", label: "Issue reviewed quote", tier: "primary" }]
        : [{ id: "status:estimator_assigned", label: "Back to pricing", tier: "secondary" }],
    }) });
  });
  await page.route("**/api/ops/projects/p_rec/issue-quote", (route) =>
    route.fulfill({ status: 409, json: { error: "workflow_changed_retry" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await expect(page.getByTestId("record-primary")).toBeVisible();
  await page.getByTestId("record-primary").click();

  // The reason survives the reload; the control that could no longer work does not.
  await expect(page.getByTestId("record-failure")).toContainText("moved to another state");
  await expect(page.getByTestId("record-primary")).toHaveCount(0);
  expect(reads).toBeGreaterThan(1);
});

test("the blocker is stated once, not twice in two colours", async ({ page }) => {
  // The attention row derives its blockers from the same two facts the issue
  // gate refuses on — lines with no rate, and unsettled delivery — so when the
  // CTA is blocked for one of those, a separate refusal strip beneath it says
  // the same thing again in a louder colour. The mock has ONE row, and its own
  // comment says why: it "is the reason the header's CTA is disabled, so it may
  // not disappear when the CTA is still on screen".
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", code: "W02", lineTotal: null, status: "draft" })],
    actions: [{ id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
      blockedReason: "1 line is unpriced or in technical review" }],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  // The attention row is saying it, and it is the one carrying the weight.
  await expect(page.getByTestId("record-attention")).toContainText("no rate");
  await expect(page.getByTestId("record-blocked")).toHaveCount(0);

  // A refusal the attention row CANNOT express still gets said — it is not the
  // strip that was wrong, it was saying what was already on screen.
  await page.unroute(RECORD_URL);
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: 1000 })],
    actions: [{ id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
      blockedReason: "This quote cannot be issued from its current state." }],
  }) }));
  await page.reload();
  await expect(page.getByTestId("record-blocked")).toContainText("current state");
});

test("the desk reviews a line beside the list, and choosing one is not navigation", async ({ page }) => {
  // P2-AC-1/2. The canvas beside the rail is already showing a line, so pushing
  // a page would replace the very pairing the layout exists for — and would put
  // a history entry behind every glance down a list of eighteen.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ id: "l1", code: "W01", productName: "Awning 600" }),
      line({ id: "l2", code: "W02", productName: "Sliding door 2400", lineTotal: 2000 }),
    ],
  }) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(RECORD);

  // A canvas, and it opens on the first line rather than on an invitation the
  // reader has to answer before seeing anything.
  const canvas = page.getByTestId("record-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toContainText("W01");
  await expect(page.getByTestId("record-line").nth(0)).toHaveAttribute("aria-current", "true");

  const before = page.url();
  await page.getByTestId("record-line").nth(1).click();
  await expect(canvas).toContainText("Sliding door 2400");
  // THE HISTORY DID NOT MOVE. That is the whole difference from the phone.
  expect(page.url(), "selecting at the desk navigated").toBe(before);
  await expect(page.getByTestId("record-line").nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("record-line").nth(0)).not.toHaveAttribute("aria-current", "true");

  // And the phone still pushes, because there is nowhere else to put a review.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);
  await expect(page.getByTestId("record-canvas")).toHaveCount(0);
  await page.getByTestId("record-line").nth(0).click();
  await expect(page).toHaveURL(/\/line\/l1$/);
});

test("the rail is the phone column, and the canvas is the line page body", async ({ page }) => {
  // P2-AC-3. Not a desktop variant of the list — the same list and the same
  // totals in the same order, with the same body the line page shows beside it.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "l1", code: "W01", productSlug: "awning-600",
      options: { Colour: "Monument" }, review: { glazing: "glazing option out of range" },
      status: "technical_review", lineTotal: null })],
  }) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(RECORD);

  const rail = page.locator(".rec-zones__rail");
  await expect(rail.getByTestId("record-lines")).toHaveCount(1);
  await expect(rail.getByTestId("record-totals")).toHaveCount(1);

  // The canvas carries the review body — the drawing, the size, the reasons.
  const canvas = page.getByTestId("record-canvas");
  await expect(canvas.getByTestId("line-review")).toHaveCount(1);
  await expect(canvas.getByTestId("line-plate")).toBeVisible();
  await expect(canvas.getByTestId("line-review-reasons")).toContainText("glazing option out of range");
  // The row beside it still carries only the badge.
  await expect(rail.getByTestId("record-line").first()).not.toContainText("glazing option out of range");
});

test("no filmstrip, and no full-width action bar", async ({ page }) => {
  // P2-AC-6/7, both excluded by the owner by name. The deck of thumbnails
  // mirrors the rail beside it; a bar across the canvas foot is not how a
  // line's actions are reached.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "l1" }), line({ id: "l2", code: "W02" })],
  }) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(RECORD);

  await expect(page.locator(".rec-zones__canvas")).toBeVisible();
  // Nothing that mirrors the rail.
  await expect(page.locator(".deck, .linescroller, [data-testid=line-scroller]")).toHaveCount(0);

  // The line's actions arrive in the side panel, from a control that is not a
  // bar: it must be narrower than the canvas it sits in.
  const actions = page.getByTestId("line-actions");
  await expect(actions).toBeVisible();
  const btn = (await actions.boundingBox())!;
  const canvasBox = (await page.locator(".rec-zones__canvas").boundingBox())!;
  expect(btn.width, "the line control is a full-width bar").toBeLessThan(canvasBox.width * 0.5);

  await actions.click();
  await expect(page.getByTestId("line-actions-panel")).toBeVisible();
  // It names what does not exist yet rather than offering it.
  await expect(page.getByTestId("line-actions-pending")).toContainText("legacy console");
});

test("the filter emptying the rail empties the canvas honestly", async ({ page }) => {
  // P2-AC-5, and grill §7.3. Leaving the canvas on a line the list beside it
  // says is not there is the one outcome this must not have.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ id: "l1", code: "W01", lineTotal: 1000 }),
      line({ id: "l2", code: "W02", lineTotal: null, status: "draft" }),
    ],
  }) }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(RECORD);

  const canvas = page.getByTestId("record-canvas");
  await expect(canvas).toContainText("W01");

  // Filtering to the unpriced line takes W01 out of the rail; the canvas
  // follows the list rather than holding a stale drawing.
  await page.getByTestId("record-attention").click();
  await expect(page.getByTestId("record-line")).toHaveCount(1);
  await expect(canvas).toContainText("W02");
  await expect(canvas).not.toContainText("W01");
});

test("a panel that labels nothing is not a description list, in the rendered DOM", async ({ page }) => {
  // The Price panel's rows are a figure and a pricing state — neither is the
  // definition of a term — but every row went into a <dl>, so each rendered as
  // <div><dd>…</dd></div>: a definition with no <dt>. Assistive technology was
  // handed the number and the state as definitions of nothing.
  //
  // ASSERTED IN A BROWSER, not only in SSR. The node suite renders `Panel` in
  // isolation with react-dom/server; it cannot see what the client actually
  // mounts, and a markup rule that only holds before hydration is not a rule.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "l1", code: "W01", productSlug: "awning-600", lineTotal: 1240,
      options: { Colour: "Monument", Glazing: "Double clear" } })],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${RECORD}/line/l1`);

  const price = page.getByTestId("line-price");
  await expect(price).toBeVisible();
  // The panel still says its two things — a pass must not mean it stopped
  // rendering.
  await expect(price).toContainText("$1,240");
  expect(await price.locator("dl").count()).toBe(0);
  expect(await price.locator("dd").count()).toBe(0);
  expect(await price.locator("dt").count()).toBe(0);
  expect(await price.locator("ul > li").count()).toBe(2);

  // And the panel that DOES label its facts is still a description list, with
  // one term per definition and no empty term among them.
  const spec = page.getByTestId("line-spec");
  await expect(spec).toBeVisible();
  await expect(spec).toContainText("Monument");
  expect(await spec.locator("dl").count()).toBe(1);
  const terms = await spec.locator("dt").allTextContents();
  expect(terms.length).toBe(await spec.locator("dd").count());
  expect(terms.length).toBeGreaterThan(0);
  expect(terms.every((t) => t.trim().length > 0)).toBe(true);
});
