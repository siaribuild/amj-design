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
    if (!devCode) return "no dev code — is the Worker in dev mode?";
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

test.beforeEach(async ({ context }) => {
  await context.addCookies(staffCookies);
});

// The seed can't produce this shape (fixed lifecycle counts across every
// bucket) — stubbed per design §1's endpoint contract: all 8 keys, numbers,
// no `degraded`. Only 6 are consumed (attention.ts), but the stub matches the
// real endpoint's shape regardless.
const SUMMARY_URL = (url: URL) => url.pathname === "/api/ops/summary";
const SUMMARY_STUB = {
  submissions: 4,
  inReview: 2,
  activeOrders: 0,
  awaitingPayment: 3,
  customers: 0,
  readyToIssue: 1,
  newEnquiries: 2,
  tradeApplications: 1,
};

test("groups render with the endpoint's numbers and expose no mutating control", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(ATTENTION);

  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  const projects = page.getByTestId("attention-projects");
  const enquiries = page.getByTestId("attention-enquiries");
  const customers = page.getByTestId("attention-customers");

  await expect(projects.getByTestId("attention-row-submissions")).toHaveText("4 new submissions");
  await expect(projects.getByTestId("attention-row-inReview")).toHaveText("2 being priced");
  await expect(projects.getByTestId("attention-row-readyToIssue")).toHaveText("1 ready to issue");
  await expect(projects.getByTestId("attention-row-awaitingPayment")).toHaveText("3 awaiting payment");
  await expect(enquiries.getByTestId("attention-row-newEnquiries")).toHaveText("2 nobody has replied to");
  await expect(customers.getByTestId("attention-row-tradeApplications")).toHaveText(
    "1 trade application waiting on a decision",
  );

  // Every row is exactly one button (RowList/Row: the press button is the
  // only control a row carries) — no checkbox, no secondary action.
  await expect(projects.getByRole("button")).toHaveCount(4);
  await expect(enquiries.getByRole("button")).toHaveCount(1);
  await expect(customers.getByRole("button")).toHaveCount(1);
});

test("submissions row goes to /projects with Needs-us lit, All clears it", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-submissions").click();
  await expect(page).toHaveURL(`${OPS2}/projects`);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

  const chips = page.getByTestId("queue-chip");
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");

  await chips.nth(0).click(); // All
  await expect(chips.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "false");
});

test("enquiries row goes to the /enquiries placeholder root", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-newEnquiries").click();
  await expect(page).toHaveURL(`${OPS2}/enquiries`);
  await expect(page.getByRole("heading", { name: "Enquiries", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing is built here yet.")).toBeVisible();
});

test("trade applications row goes to /customers", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-tradeApplications").click();
  await expect(page).toHaveURL(`${OPS2}/customers`);
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
});

test("a degraded summary renders the error panel with a retry, not zero rows disguised as ready", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: { degraded: true } }));
  await page.goto(ATTENTION);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  // ZERO counts: no row, no group, no empty-state — the error panel is the
  // only thing on the page, so a degraded read can't be mistaken for a quiet day.
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
  await expect(page.getByTestId("attention-empty")).toHaveCount(0);
});

test("a 500 renders the same error panel, and zero rows", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(ATTENTION);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
});

test("retry after unrouting a failed summary recovers to ready", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(ATTENTION);
  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();

  // Unroute BEFORE retrying so the click's fetch hits the real, working stub.
  await page.unroute(SUMMARY_URL);
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await error.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("attention-error")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("4 new submissions");
});

test("the skeleton shows before the summary response resolves", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route(SUMMARY_URL, async (route) => {
    await held;
    await route.fulfill({ json: SUMMARY_STUB });
  });

  const loading = page.goto(ATTENTION);
  await expect(page.getByTestId("attention-skeleton")).toBeVisible();
  await expect(page.getByTestId("attention-row-submissions")).toHaveCount(0);

  release();
  await loading;
  await expect(page.getByTestId("attention-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("4 new submissions");
});

test("leaving and returning re-fetches, and a slow reply to a superseded request never overwrites a newer one", async ({ page }) => {
  // Call 1: initial mount, held open — it becomes the stale request. Call 2:
  // one leave-and-return (the re-fetch this test also proves), resolves at
  // once with a different count. If useSummary's `live` guard is broken,
  // releasing call 1 below — after call 2 has already rendered — stomps
  // call 2's count back to the stale value.
  let release1 = () => {};
  const held1 = new Promise<void>((r) => { release1 = r; });
  let calls = 0;
  await page.route(SUMMARY_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      await held1;
      return route.fulfill({ json: { ...SUMMARY_STUB, submissions: 999 } });
    }
    return route.fulfill({ json: { ...SUMMARY_STUB, submissions: 7 } });
  });

  const loading = page.goto(ATTENTION);
  await expect(page.getByTestId("attention-skeleton")).toBeVisible(); // call 1, held

  const attentionLink = page.getByRole("link", { name: "Attention" });
  const productsLink = page.getByRole("link", { name: "Products" });

  await productsLink.click();
  await expect(page).toHaveURL(`${OPS2}/products`);
  await attentionLink.click();
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("7 new submissions"); // call 2

  release1();
  await loading;
  await page.waitForTimeout(200); // give the stale call 1 reply a chance to land, if it's going to
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("7 new submissions");
});

test("a signed-in customer (non-staff) loading /attention gets the unauthorised treatment, not zero counts", async ({ browser }) => {
  // Real /api/ops/summary, no stub — proves the actual server-side role check
  // (401/403), not a fabricated one. Own context, goto(OPS2) BEFORE logging
  // in: the session cookie is host-only (no Domain attribute — worker/lib/
  // auth.ts's sessionCookie), so the login fetch must be same-origin with
  // ops.localhost or the cookie never reaches the later goto(ATTENTION).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const email = `attn-customer-${Date.now().toString(36)}@example.com`;
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, email);
  expect(ok, "customer sign-in").toBeNull();

  const summaryResponse = page.waitForResponse((res) => res.url().includes("/api/ops/summary"));
  await page.goto(ATTENTION);
  expect((await summaryResponse).status(), "summary response status — 403 forbidden, not 401 anonymous").toBe(403);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/This account can't see what's waiting\./);
  await expect(error).toHaveText(/staff-only/);
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
  await context.close();
});

// Monitoring (T5) — second, independent request. SUMMARY_URL stubbed too so
// the page's primary section resolves and stays out of the way.
const MONITORING_URL = (url: URL) => url.pathname === "/api/ops/monitoring";
// Relative to test-run time, not hard-pinned (F2, 06-verify.md): a fixed past
// timestamp eventually crosses the 30-minute stale threshold on its own and
// fails on a clock, not on a real regression.
const FRESH_TAKEN_AT = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const READY_SNAPSHOT = {
  takenAt: FRESH_TAKEN_AT,
  money: { available: true, creditBalanceUsd: 12.34, billedSpendUsd: 40, capUsd: 50, capSource: "gateway" },
  success7d: 20,
  error7d: 3,
  // red/floorUsd/ceilingPct: server merges these into the snapshot itself
  // (worker/lib/monitoring.ts monitoringPayload, commit 5d07807a) — useMonitoring.ts
  // requires all three on the snapshot object or it falls into "error" status.
  red: false,
  floorUsd: 5,
  ceilingPct: 80,
  days: [
    { day: "2026-08-30", success: 2, error: 0 },
    { day: "2026-08-31", success: 3, error: 1 },
    { day: "2026-09-01", success: 0, error: 0 },
    { day: "2026-09-02", success: 4, error: 0 },
    { day: "2026-09-03", success: 3, error: 1 },
    { day: "2026-09-04", success: 5, error: 0 },
    { day: "2026-09-05", success: 3, error: 1 },
  ],
};

test("monitoring: ready snapshot renders cards, as-at, and 7 chart columns", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: READY_SNAPSHOT, notificationCount: 0 } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("monitoring-credit-balance")).toContainText("$12.34");
  await expect(page.getByTestId("monitoring-cap-outstanding")).toContainText("$10.00");
  await expect(page.getByTestId("monitoring-success-count")).toContainText("20");
  await expect(page.getByTestId("monitoring-error-count")).toContainText("3");
  await expect(page.getByTestId("monitoring-chart").locator(".att-col")).toHaveCount(7);
  await expect(page.getByText(/As at \d{2}:\d{2}/)).toBeVisible();
});

test("monitoring: money unavailable shows an unavailable state, not zero, while counts/chart still show D1 numbers", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, money: { available: false, reason: "token_missing" } }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  const credit = page.getByTestId("monitoring-credit-balance");
  await expect(credit).toContainText("Unavailable. No Cloudflare token configured");
  await expect(credit).not.toContainText("$0.00");
  await expect(page.getByTestId("monitoring-success-count")).toContainText("20");
});

test("monitoring: money unavailable with a missing/placeholder CF_ACCOUNT_ID says so distinctly from a missing token", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, money: { available: false, reason: "account_id_missing" } }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  const credit = page.getByTestId("monitoring-credit-balance");
  await expect(credit).toContainText("Unavailable. No Cloudflare account configured");
  await expect(credit).not.toContainText("No Cloudflare token configured");
  await expect(credit).not.toContainText("$0.00");
});

test("monitoring: an all-zero window renders an explicit empty chart state", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  const zeroDays = READY_SNAPSHOT.days.map((d) => ({ ...d, success: 0, error: 0 }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, success7d: 0, error7d: 0, days: zeroDays }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  // The approved mock (docs/mocks/ai-parse-monitoring.html §3, UX §5) keeps the
  // seven day labels under the sentence — the window being described stays on
  // screen — and draws no bars at all. A zero week is an answer, not a gap.
  await expect(page.getByTestId("monitoring-chart")).toContainText("Nothing parsed in the last 7 days");
  await expect(page.getByTestId("monitoring-chart").locator(".att-col")).toHaveCount(7);
  await expect(page.getByTestId("monitoring-chart").locator(".att-bar")).toHaveCount(0);
});

test("monitoring: no snapshot yet renders the empty state", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 0 } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("monitoring-empty")).toBeVisible();
  await expect(page.getByTestId("monitoring-credit-balance")).toHaveCount(0);
});

test("monitoring: a 500 shows the error panel with a retry button", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(ATTENTION);

  const errorPanel = page.getByTestId("monitoring-error");
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("monitoring: stale snapshot renders the stale sentence and per-card as-at stamps", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  const staleTakenAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, takenAt: staleTakenAt }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  await expect(page.locator(".att-asat")).toContainText("The 10-minute job may have stopped.");
  await expect(page.getByTestId("monitoring-credit-balance").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-success-count").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-error-count").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-cap-outstanding").locator(".att-card__stamp")).toBeVisible();
});

const PROJECTS = `${OPS2}/projects`;
const QUEUE_URL = (url: URL) => url.pathname === "/api/ops/projects";

test("bell: no badge when notificationCount is 0", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 0 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.goto(PROJECTS);

  const bell = page.locator(".ops2-bell");
  await expect(bell).toBeVisible();
  await expect(bell.locator(".ops2-bell__badge")).toHaveCount(0);
});

test("bell: badge reads 1 when notificationCount is 1", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 1 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.goto(PROJECTS);

  await expect(page.locator(".ops2-bell__badge")).toHaveText("1");
});

test("bell: clicking it lands on /attention", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 1 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(PROJECTS);

  await page.locator(".ops2-bell").click();
  await expect(page).toHaveURL(ATTENTION);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();
});

test("the unauthorised panel has no retry — pressing it would fail the same way (mock §3.5)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const email = `attn-customer-noretry-${Date.now().toString(36)}@example.com`;
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, email);
  expect(ok, "customer sign-in").toBeNull();

  await page.goto(ATTENTION);
  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await context.close();
});
