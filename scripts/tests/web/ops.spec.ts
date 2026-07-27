import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The ops console is served on the ops.* host (Chromium resolves *.localhost).
const OPS = "http://ops.localhost:8788/";

// Sign in as a SEEDED admin, read from seed.sql.
//
// This used to sign in as a literal "staff@openframe.com.au", which is not in the
// seed. The Worker creates such a staffer on demand with role = null, and only
// promotes them when NO admin exists — which stopped being true once the seed
// gained real admin rows. Every role-gated tab then 403'd, and the console showed
// its load-failure state instead of the data these tests assert on.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
function seedEmail(userId: string): string {
  const row = seedSql.split("\n").find((l) => l.includes(`'${userId}'`) && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error(`seed.sql: no email for ${userId}`);
  return email;
}
const STAFF_EMAIL = seedEmail("u_staff1");

async function staffLogin(page: Page) {
  await page.goto(OPS);
  await page.getByPlaceholder(/you@openframe.com.au/i).fill(STAFF_EMAIL);
  await page.getByRole("button", { name: /send code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  await page.getByPlaceholder("••••••").fill(devText?.match(/\d{6}/)?.[0] ?? "");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("ops staff login shows the dashboard with real counts", async ({ page }) => {
  await staffLogin(page);
  await expect(page.getByText("New submissions")).toBeVisible();
  await expect(page.getByText("Active orders")).toBeVisible();
});

test("ops quotes queue lists a submission and opens the workspace", async ({ page }) => {
  await staffLogin(page);
  await page.getByRole("button", { name: "Quotes" }).click();
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
  await page.getByRole("button", { name: /open →/i }).first().click();
  // Workspace: summary rail + the estimator actions.
  await expect(page.getByRole("button", { name: /assign to me/i })).toBeVisible();
  await expect(page.getByText(/Technical notes/i)).toBeVisible();
});

test("ops tabs render (orders, customers, pricing, audit)", async ({ page }) => {
  await staffLogin(page);
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByText("OF-58001")).toBeVisible();
  await page.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByText("Sarah Nguyen")).toBeVisible();
  // Catalogue became Pricing: the tab now EDITS the D1 commercial layer rather
  // than listing a build-time product artefact nobody could change.
  await page.getByRole("button", { name: "Pricing" }).click();
  await expect(page.getByRole("button", { name: "Rate cards" })).toBeVisible();
  await expect(page.getByText("awning-window").first()).toBeVisible();
  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
});

test("ops enquiries tab shows a lead with its immutable attribution", async ({ page }) => {
  // Submits its own lead rather than relying on one the customer contact-page
  // test happens to leave behind. Playwright runs spec FILES in parallel workers,
  // so "submitted earlier in the run" was never a guarantee — and this test failed
  // whenever ops.spec won the race.
  const name = `Ops Lead ${Date.now().toString().slice(-6)}`;
  const created = await page.request.post("/api/enquiries", {
    headers: { "X-Forwarded-For": "203.0.113.77" },
    data: {
      intent: "appointment_request", name, phone: "0431 000 111",
      privacyConsent: true, locationId: "loc_vic_rowville", bestTimeToCall: "morning",
    },
  });
  expect(created.ok(), "the public enquiry endpoint accepted the lead").toBeTruthy();

  await staffLogin(page);
  await page.getByRole("button", { name: "Enquiries" }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText("OpenFrame Website").first()).toBeVisible();
  // Open it and confirm the attribution staff cannot edit.
  await page.getByText(name).first().click();
  await expect(page.getByText(/Source: OpenFrame Website/i)).toBeVisible();
  await expect(page.getByText("OPENFRAME").first()).toBeVisible();
});
