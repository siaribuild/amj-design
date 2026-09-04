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
