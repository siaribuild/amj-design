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

test("the dashboard points at work rather than counting it", async ({ page }) => {
  await staffLogin(page);
  // Rows that link, never buttons that act — the dashboard is a pointer to the
  // tab that owns the work, not a second inbox competing with the sidebar.
  await expect(page.getByText("Needs us")).toBeVisible();
  await expect(page.getByText("The shop")).toBeVisible();
});

test("the projects list opens one record covering the whole job", async ({ page }) => {
  // Quotes and Orders merged into Projects: a project, the revisions issued from
  // it and the order it becomes are one job, and staff no longer cross a boundary
  // that existed only in storage.
  await staffLogin(page);
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const fitzroy = page.getByText("Fitzroy townhouses").locator("visible=true");
  await expect(fitzroy.first()).toBeVisible();
  // The two derived columns that replaced the assignee.
  await expect(page.getByText("Waiting on")).toBeVisible();
  await expect(page.getByText("Days in stage")).toBeVisible();

  await fitzroy.first().click();
  // The record: the precise state, and one primary action. Owners are gone.
  await expect(page.getByText(/^Now ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Start pricing|Issue reviewed quote/ })).toBeVisible();
  await expect(page.getByText(/Assign to me/i)).toHaveCount(0);
});

test("ops tabs render (customers, pricing, audit); the retired ones are gone", async ({ page }) => {
  await staffLogin(page);
  // Quotes, Orders, Approvals and Rules were removed — a reappearing tab is the
  // regression this guards.
  for (const gone of ["Quotes", "Orders", "Approvals", "Rules"]) {
    await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Customers", exact: true }).click();
  // Desktop table and mobile cards coexist responsively; target the table copy.
  await expect(page.getByRole("cell", { name: /Sarah Nguyen/ })).toBeVisible();
  // Catalogue became Pricing: the tab now EDITS the D1 commercial layer rather
  // than listing a build-time product artefact nobody could change.
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rate cards" })).toBeVisible();
  await expect(page.getByText("awning-window").first()).toBeVisible();
  await page.getByRole("button", { name: "Audit", exact: true }).click();
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
  await page.getByRole("button", { name: "Enquiries", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText("OpenFrame Website").first()).toBeVisible();
  // Open it and confirm the attribution staff cannot edit.
  await page.getByText(name).first().click();
  await expect(page.getByText(/Source: OpenFrame Website/i)).toBeVisible();
  await expect(page.getByText("OPENFRAME").first()).toBeVisible();
});
