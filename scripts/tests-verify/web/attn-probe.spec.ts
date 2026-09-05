// TESTER PROBE — not part of the shipped suite. Adversarial edge cases around
// the ?attn= consume/reset race that F2 fixed with `justAppliedAttnRef`.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const ATTENTION = `${OPS2}/attention`;

const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff7'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff7");
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
    if (!devCode) return "no dev code";
    const verified = await fetch("/api/ops/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, STAFF_EMAIL);
  expect(ok, "staff sign-in").toBeNull();
  staffCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => { await context.addCookies(staffCookies); });

const SUMMARY_URL = (url: URL) => url.pathname === "/api/ops/summary";
const QUEUE_URL = (url: URL) => url.pathname === "/api/ops/projects";
const SUMMARY_STUB = {
  submissions: 4, inReview: 2, activeOrders: 0, awaitingPayment: 3,
  customers: 0, readyToIssue: 1, newEnquiries: 2, tradeApplications: 1,
};
const fixtureRow = (over: Record<string, unknown>) => ({
  id: "p_x", ref: "OF-Q-19999", title: "A project", customerName: "A customer",
  org: null, lineCount: 4, value: 1000, valueBasis: "est.", unresolved: 0, issuable: false,
  waitingOn: "Us", daysInStage: 1, phase: "Pricing", stateLabel: "Pricing", orderNo: null,
  statusCustomer: "", orderStage: null, updatedAt: "2026-08-20 00:00:00", ...over,
});
const PA_PF = [
  fixtureRow({ id: "p_pa", ref: "PA", title: "PA", statusCustomer: "submitted" }),
  fixtureRow({ id: "p_pb", ref: "PB", title: "PB", statusCustomer: "under_review" }),
  fixtureRow({ id: "p_pc", ref: "PC", title: "PC", statusCustomer: "under_review", issuable: true }),
  fixtureRow({ id: "p_pd", ref: "PD", title: "PD", statusCustomer: "accepted", orderStage: "deposit_invoiced" }),
  fixtureRow({ id: "p_pe", ref: "PE", title: "PE", statusCustomer: "accepted", orderStage: "balance_invoiced" }),
  fixtureRow({ id: "p_pf", ref: "PF", title: "PF", statusCustomer: "accepted", orderStage: "manufacturing" }),
];

const stub = async (page: import("@playwright/test").Page) => {
  await page.route(SUMMARY_URL, (r) => r.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (r) => r.fulfill({ json: { projects: PA_PF } }));
};

const RAIL_PRODUCTS = ".ops2-nav__item[href$=\"/products\"]";
const RAIL_PROJECTS = ".ops2-nav__item[href$=\"/projects\"]";
const RAIL_ATTENTION = ".ops2-nav__item[href$=\"/attention\"]";

// P1 — criterion 11 AFTER a real click arrival. The shipped reset test arrives
// by page.goto (a full document load), which is a different lifecycle path.
test("P1: a click-arrival prefilter is reset by later rail navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-submissions").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByTestId("queue-active-filters")).toContainText("New submissions");

  await page.locator(RAIL_PRODUCTS).click();
  await page.locator(RAIL_PROJECTS).click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(6);
});

// P2 — same, but the arrival is multi-hop (Attention -> Products -> Attention
// -> row): the path where ionViewWillEnter may fire BEFORE the consuming
// effect, and so may leave `justAppliedAttnRef` set for the NEXT entry.
test("P2: a multi-hop click arrival does not leave a stale one-shot flag", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.locator(RAIL_PRODUCTS).click();
  await page.locator(RAIL_ATTENTION).click();
  await page.getByTestId("attention-row-inReview").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(2);

  await page.locator(RAIL_PRODUCTS).click();
  await page.locator(RAIL_PROJECTS).click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(6);
});

// P3 — pressing a second Attention row replaces the first prefilter; it does
// not stack, and it does not stick.
test("P3: a second attention row replaces the first prefilter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-submissions").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);

  await page.locator(RAIL_ATTENTION).click();
  await page.getByTestId("attention-row-awaitingPayment").click();
  await expect(page.getByTestId("queue-active-filters")).toContainText("Awaiting payment");
  const rows = page.getByTestId("queue-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "PD" })).toBeVisible();
  await expect(rows.filter({ hasText: "PE" })).toBeVisible();
  await expect(rows.filter({ hasText: "PA" })).toHaveCount(0);
});

// P4 — browser Back out of the filtered queue: the address was replaced, so
// Back lands on Attention; returning by the rail is criterion 11's plain
// re-entry.
test("P4: browser back after consumption returns to Attention, and the queue resets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-readyToIssue").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);

  await page.goBack();
  await expect(page).toHaveURL(ATTENTION);
  await page.locator(RAIL_PROJECTS).click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(6);
});

// P5 — reloading the filtered queue: the param was stripped, so the reader
// gets the default set and nothing claims a filter is on.
test("P5: reloading the filtered queue returns the default set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-awaitingPayment").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
});

// P6 — the prefilter must survive the on-enter re-fetch (useProjectQueue
// reloads on every entry), holding over the fresh rows.
test("P6: the prefilter holds over the on-enter re-fetch", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(SUMMARY_URL, (r) => r.fulfill({ json: SUMMARY_STUB }));
  let calls = 0;
  await page.route(QUEUE_URL, (r) => { calls += 1; return r.fulfill({ json: { projects: PA_PF } }); });
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-inReview").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
  expect(calls, "the queue was fetched again on entering Projects").toBeGreaterThan(1);
});

// P7 — a 200 whose body carries no usable `projects` array. The summary's own
// parse is strict (degraded, never zero); the queue's is lenient, so the four
// counts silently vanish and the gate reads as a quiet day.
test("P7: a malformed queue payload is not drawn as a quiet day", async ({ page }) => {
  await page.route(SUMMARY_URL, (r) => r.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (r) => r.fulfill({ json: { projects: "not-an-array" } }));
  await page.goto(ATTENTION);
  await expect(page.getByTestId("attention-enquiries")).toBeVisible();
  await expect(page.getByTestId("attention-error")).toBeVisible();
});
