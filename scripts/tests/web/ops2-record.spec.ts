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

test("the record opens on its lines, under the same band the queue uses", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line(), line({ id: "l2", code: "W02", productName: "Sliding door", lineTotal: 2000 })],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  // The reference is the page's name; the project's own title leads the content.
  await expect(page.getByRole("heading", { name: "OF-Q-10482", level: 1 })).toBeVisible();
  await expect(page.getByTestId("record-identity")).toContainText("Wattle Grove - Lot 14");
  await expect(page.getByTestId("record-identity")).toContainText("Marchetti Constructions");
  await expect(page.getByTestId("record-identity")).toContainText("Waiting on us");

  // Two tabs, the queue's own component, and the count is on the one that has one.
  const tabs = page.getByTestId("record-tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveText(/Lines/);
  await expect(tabs.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(tabs.nth(1)).toHaveText("Project");
  await expect(page.getByTestId("record-line")).toHaveCount(2);

  // BACK NAMES ITS DESTINATION — the settled rule — and it goes there.
  await page.locator(".ops2-page__back").click();
  await expect(page).toHaveURL(/\/ops2\/projects$/);
});

test("a line states its own money, and an absent rate is never a zero", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line({ lineTotal: 3480, qty: 2 }),
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
  // The parser's own reason, in its words.
  await expect(rows.nth(1)).toContainText("glazing option out of range");
  // The leading edge marks the line still to be finished, and only that one.
  await expect(rows.nth(0)).toHaveAttribute("data-unresolved", "false");
  await expect(rows.nth(1)).toHaveAttribute("data-unresolved", "true");
});

test("a composite keeps its units inside it, and only rows with a body expand", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      // Nothing to open: no options, no segments.
      line({ id: "l1", code: "W01", options: {} }),
      line({ id: "l2", code: "W02", productName: "Composite opening", lineKind: "composite_parent",
        segments: [
          { id: "s1", productName: "Awning 1200", width: "1200", height: "1500", qty: 1, lineTotal: 2100, note: "left", status: "ready" },
          { id: "s2", productName: "Fixed 2400", width: "2400", height: "1500", qty: 1, lineTotal: 4020, note: "right", status: "ready" },
        ] }),
    ],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  // A TWISTY ON A ROW THAT OPENS TO NOTHING is a control that cannot do
  // anything — the defect this effort has recorded four times. One row here has
  // a body and one does not, so there is exactly one toggle.
  await expect(page.getByTestId("record-line")).toHaveCount(2);
  await expect(page.getByTestId("record-line-toggle")).toHaveCount(1);

  // The units are INSIDE the parent, never loose beside it: still two rows.
  await expect(page.getByTestId("record-line-body")).toHaveCount(0);
  await page.getByTestId("record-line-toggle").click();
  await expect(page.getByTestId("record-line-body")).toContainText("Awning 1200");
  await expect(page.getByTestId("record-line-body")).toContainText("Fixed 2400");
  await expect(page.getByTestId("record-line")).toHaveCount(2);
});

test("the foot refuses to call a partial sum a total", async ({ page }) => {
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: 1000 }), line({ id: "l2", code: "W02", lineTotal: null, status: "draft" })],
    delivery: { amount: null, settled: false, estimate: 640 },
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  const totals = page.getByTestId("record-totals");
  await expect(totals).toContainText("$1,000");
  // Delivery is a row even when unset, because unset is the state that blocks
  // the quote — and its live estimate is shown AS an estimate.
  await expect(totals).toContainText("Not set");
  await expect(totals).toContainText("about $640");
  // The word that makes the figure honest.
  // NO GST ANYWHERE ON THIS CONSOLE — the owner's ruling. The only caption left
  // is the one qualifying the NUMBER: a sum still missing rates is a floor.
  await expect(totals).toContainText("So far");
  await expect(page.locator("body")).not.toContainText("GST");
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
  // ADJACENT TO THE CONTROL IT REFUSES. A blocked primary in the header and its
  // reason at the foot of the page are two facts a reader has to join up.
  await expect(page.getByTestId("record-blocked")).toContainText("1 line is unpriced or unresolved");
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
  await page.route("**/api/ops/projects/p_rec/issue-quote", (route) =>
    route.fulfill({ status: 409, json: { error: "delivery is not set" } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);

  await page.getByTestId("record-primary").click();
  await expect(page.getByTestId("record-confirm")).toBeVisible();
  await page.getByTestId("record-confirm-go").click();

  // The panel gets out of the way, and the server's own words are on screen.
  await expect(page.getByTestId("record-confirm")).toBeHidden();
  await expect(page.getByTestId("record-failure")).toContainText("delivery is not set");
});
