// Probe: the guard the developer added covers "rows present, none carrying a
// statusCustomer". It does NOT cover "the body is not the shape we asked for"
// — parseProjectQueue returns [] for a missing/renamed `projects` array, and a
// zero-length rows array short-circuits the guard before it can refuse.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;

const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = seedSql.split("\n").find((l) => l.includes("'u_staff7'") && l.includes("@"))!
  .match(/'([^']+@[^']+)'/)![1];

let staffCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> = [];
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  await page.evaluate(async (email) => {
    const c = await fetch("/api/ops/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
    });
    const { devCode } = await c.json();
    await fetch("/api/ops/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
  }, STAFF_EMAIL);
  staffCookies = await context.cookies();
  await context.close();
});
test.beforeEach(async ({ context }) => { await context.addCookies(staffCookies); });

const SUMMARY_STUB = {
  submissions: 4, inReview: 2, activeOrders: 0, awaitingPayment: 3,
  customers: 0, readyToIssue: 1, newEnquiries: 2, tradeApplications: 1,
};

test("PROBE: a 200 whose body renamed `projects` draws a clear day, not a failure", async ({ page }) => {
  await page.route((url) => url.pathname === "/api/ops/summary", (r) => r.fulfill({ json: SUMMARY_STUB }));
  // Same rows, wrong envelope key — the shape a contract break produces.
  await page.route((url) => url.pathname === "/api/ops/projects", (r) => r.fulfill({
    json: { rows: [{ id: "p_pa", ref: "PA", title: "PA", statusCustomer: "submitted", issuable: true }] },
  }));
  await page.goto(`${OPS2}/attention`);
  await page.getByRole("heading", { name: "Attention", level: 1 }).waitFor();

  // What we WANT: the same refusal panel the missing-statusCustomer case gets.
  await expect(page.getByTestId("attention-error")).toBeVisible();
  // What actually happens today: no project rows at all, silently.
  await expect(page.getByTestId("attention-row-submissions")).toHaveCount(0);
});
