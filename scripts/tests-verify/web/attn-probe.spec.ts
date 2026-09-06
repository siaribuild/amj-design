// TESTER PROBES - adversarial, outside the developer's suites on purpose.
// Everything here targets a criterion the shipped specs assert only partially.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const ATTENTION = `${OPS2}/attention`;
const PROJECTS = `${OPS2}/projects`;

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
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
};

// C22 - the shipped test asserts the payload is not ECHOED. It does not assert
// the payload never EXECUTED. An injected handler that fires and then removes
// itself would pass that assertion and fail this one.
test("PROBE C22: an injected ?attn= payload never executes", async ({ page }) => {
  await stub(page);
  const payloads = [
    "<script>window.__pwned=1</script>",
    "\"><img src=x onerror=window.__pwned=1>",
    "javascript:window.__pwned=1",
    "'; DROP TABLE project; --",
  ];
  for (const payload of payloads) {
    await page.goto(`${PROJECTS}?attn=${encodeURIComponent(payload)}`);
    await expect(page.getByTestId("queue-row")).toHaveCount(6);
    await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
    await expect(page.getByTestId("queue-error")).toHaveCount(0);
    const pwned = await page.evaluate(() => (window as unknown as Record<string, unknown>).__pwned);
    expect(pwned, payload).toBeUndefined();
  }
});

// C11 - the shipped tests cover rail-away/back and back-from-record. Neither
// covers the browser's own Back then Forward across the history entry the
// strip minted, which is where an entry-key identity test can resurrect a
// prefilter the reader has left.
test("PROBE C11: Back then Forward does not resurrect the prefilter", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-inReview").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(2);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(PROJECTS);
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
});

// C1-4 - the shipped narrowing cases each start from a fresh document. This
// presses two DIFFERENT rows in one session, which is the ordinary way a
// reader works the gate.
test("PROBE C1-4: two different rows pressed in one session each open their own set", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stub(page);
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-submissions").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByTestId("queue-row").filter({ hasText: "PA" })).toBeVisible();

  await page.locator('.ops2-nav__item[href$="/attention"]').click();
  await expect(page.getByTestId("attention-row-awaitingPayment")).toHaveText("2 awaiting payment");
  await page.getByTestId("attention-row-awaitingPayment").click();
  await expect(page.getByTestId("queue-active-filters")).toContainText("Awaiting payment");
  const rows = page.getByTestId("queue-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "PD" })).toBeVisible();
  await expect(rows.filter({ hasText: "PE" })).toBeVisible();
  await expect(rows.filter({ hasText: "PA" })).toHaveCount(0);
});

// C11 - a full reload of the stripped address must not restore anything.
test("PROBE C11: reloading the stripped address opens Needs us", async ({ page }) => {
  await stub(page);
  await page.goto(`${PROJECTS}?attn=readyToIssue`);
  await expect(page.getByTestId("queue-active-filters")).toContainText("Ready to issue");
  await page.reload();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
});

// C12 - a repeated parameter and a case variant are both "unknown values" the
// shipped test does not cover.
test("PROBE C12: repeated and case-variant attn parameters", async ({ page }) => {
  await stub(page);
  // First value wins, and it is a real key: the set narrows to that one.
  await page.goto(`${PROJECTS}?attn=submissions&attn=readyToIssue`);
  await expect(page.getByTestId("queue-active-filters")).toContainText("New submissions");
  await expect(page.getByTestId("queue-row")).toHaveCount(1);

  // Case variant is not a key. Default set, no strip, no error.
  await page.goto(`${PROJECTS}?attn=Submissions`);
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-error")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(6);
});

// C10 - the address must not carry the filter after the control is turned off.
test("PROBE C10: Clear leaves Needs us and a bare address", async ({ page }) => {
  await stub(page);
  await page.goto(ATTENTION);
  await page.getByTestId("attention-row-readyToIssue").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await page.getByTestId("queue-active-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(PROJECTS);
  expect(new URL(page.url()).search, "no filter left in the address").toBe("");
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("queue-row")).toHaveCount(6);
});
