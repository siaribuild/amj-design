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

// ── Rate card create → edit → save → delete ──────────────────────────────────
// The save button did not work, and the cause was not the save at all: the
// confirm dialog armed a typed-slug tripwire on "> 20% change", and its pct()
// returns 100 whenever the previous value was 0. min_charge seeds at 0 on every
// card (migration 0015), so setting a minimum charge for the FIRST time — the
// most ordinary edit there is — always demanded the operator type the exact
// rate-card slug plus a reason before Save would enable.
//
// This drives the real button rather than the endpoint underneath it, because
// the endpoint was never broken. It works on a card it creates and then deletes,
// so it cannot move a price another spec prices against: this file shares a
// Worker and a database with the rest of the run.
test("a rate card can be created, edited, saved and deleted from the console", async ({ page }) => {
  const slug = `e2e-save-check-${Date.now().toString().slice(-6)}`;
  page.on("dialog", (d) => d.accept()); // the delete confirm

  await staffLogin(page);
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rate cards" })).toBeVisible();

  await page.getByRole("button", { name: /New rate card/i }).click();
  await page.getByPlaceholder("product-slug").fill(slug);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  // Create drops straight into the detail view — no intermediate screen.
  await expect(page.getByRole("heading", { name: slug })).toBeVisible();

  // 0 -> 250 is exactly the change that used to arm the tripwire.
  const minField = page.locator("label").filter({ hasText: "Minimum charge" }).locator("input");
  await expect(minField).toHaveValue("0");
  await minField.fill("250");

  await page.getByRole("button", { name: /Review change/i }).click();

  // Neither gate exists any more; a reason field that nothing records is worse
  // than no field, and the tripwire fired on an ordinary edit.
  await expect(page.getByText(/Type the family slug/i)).toHaveCount(0);
  await expect(page.getByPlaceholder(/Why \(required\)/i)).toHaveCount(0);

  // THE ASSERTION THIS TEST EXISTS FOR: the button is enabled and it saves.
  const saveButton = page.getByRole("button", { name: /Save new rates/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  // Saving returns to the list; the new minimum is on the row.
  await expect(page.getByRole("button", { name: /New rate card/i })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: slug });
  await expect(row).toContainText("250.00");

  // And it persists a round trip through the API, not just in local state.
  await row.click();
  await expect(page.locator("label").filter({ hasText: "Minimum charge" }).locator("input")).toHaveValue("250");

  await page.getByRole("button", { name: /Delete/i }).click();
  await expect(page.getByRole("button", { name: /New rate card/i })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: slug })).toHaveCount(0);
});

// T-C6 — the delivery panel on the project record (design doc §7.1, C6).
// ops.spec.ts runs before quote-project.spec.ts alphabetically (playwright.
// config.ts: fullyParallel:false, workers:1, one shared D1 for the whole
// run), so vic-metro is not yet priced when this runs — prices it itself,
// same Host-header trick api-edge-style tests use for the ops.* host (the
// `request` fixture is a plain Node client and does not resolve *.localhost
// the way Chromium does).
test("T-C6: the record shows the machine estimate beside the number staff confirmed", async ({ page, request }) => {
  const OPS_HOST = "ops.localhost:8788";
  const title = `T-C6 delivery check ${Date.now().toString().slice(-6)}`;
  // A UNIQUE staffer, not STAFF_EMAIL — the OTP issuance cap is per source AND
  // per recipient (see the "OTP issuance is capped per SOURCE" test in
  // api-edge.test.mjs), and by the time this test runs the other five in this
  // file have already logged STAFF_EMAIL in via the UI several times.
  // isStaffEmail (worker/lib/staff.ts) allowlists by DOMAIN, and pricing
  // access is flat (worker/routes/ops-pricing.ts: `const isStaffUser = (s) =>
  // !!s`), so any @openframe.com.au address can price a zone even though only
  // the seeded admin can sign in through the ops UI's own role gates.
  const rawEmail = `tc6-ops-${Date.now().toString().slice(-8)}@openframe.com.au`;

  const staffChallenge = await request.post("http://127.0.0.1:8788/api/ops/auth/challenge", {
    headers: { Host: OPS_HOST }, data: { email: rawEmail },
  });
  const { devCode: staffCode } = await staffChallenge.json();
  const verifyRes = await request.post("http://127.0.0.1:8788/api/ops/auth/verify", {
    headers: { Host: OPS_HOST }, data: { email: rawEmail, code: staffCode },
  });
  // Carries the session into the BROWSER context by hand, from the raw
  // response's own Set-Cookie — not a second, UI-driven staffLogin(page) call.
  // A second login for the shared STAFF_EMAIL is exactly what tripped the
  // per-recipient OTP cap in an earlier version of this test (five other
  // tests in this file already log that address in via the UI); this test's
  // one rawEmail login is reused for both the API calls above and the UI
  // below.
  const setCookie = (await verifyRes.headersArray()).find((h) => h.name.toLowerCase() === "set-cookie")?.value ?? "";
  const sessionToken = setCookie.match(/apertly_session=([^;]+)/)?.[1];
  if (!sessionToken) throw new Error("ops dev-mode login did not set a session cookie");
  await page.context().addCookies([{ name: "apertly_session", value: sessionToken, domain: "ops.localhost", path: "/" }]);

  const zones = await (await request.get("http://127.0.0.1:8788/api/ops/pricing/delivery-zones", { headers: { Host: OPS_HOST } })).json();
  const vicMetro = zones.zones.find((z: { id: string; version: string }) => z.id === "vic-metro");
  if (vicMetro.minCharge == null) {
    await request.put("http://127.0.0.1:8788/api/ops/pricing/delivery-zones/vic-metro", {
      headers: { Host: OPS_HOST }, data: { ratePerSqm: 45, minCharge: 180, maxCharge: 900, expectedVersion: vicMetro.version },
    });
  }

  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
      title,
    },
  });
  expect(saved.ok()).toBeTruthy();
  const submitted = await page.request.post(`/api/projects/${(await saved.json()).project.id}/submit`, {
    data: { contact: { name: "T-C6 Customer", email: "tc6-delivery-check@example.com", postcode: "3072" } },
  });
  expect(submitted.ok()).toBeTruthy();

  await page.goto(OPS);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const row = page.getByText(title).locator("visible=true");
  await expect(row.first()).toBeVisible();
  await row.first().click();

  await expect(page.getByText("Delivery", { exact: true })).toBeVisible();
  await expect(page.getByText("3072")).toBeVisible();
  await expect(page.getByText("Melbourne metro")).toBeVisible();
  await expect(page.getByText("Machine estimate")).toBeVisible();
  await expect(page.getByText("Not set", { exact: true })).toBeVisible();
});

// T-C7 — the issue gate on the record (design doc §6.4/§7.2, C7). Same
// single-login pattern as T-C6, for the same OTP-cap reason.
test("T-C7: Issue reviewed quote is blocked, and says delivery is why", async ({ page, request }) => {
  const OPS_HOST = "ops.localhost:8788";
  const title = `T-C7 gate check ${Date.now().toString().slice(-6)}`;
  const rawEmail = `tc7-ops-${Date.now().toString().slice(-8)}@openframe.com.au`;

  const staffChallenge = await request.post("http://127.0.0.1:8788/api/ops/auth/challenge", {
    headers: { Host: OPS_HOST }, data: { email: rawEmail },
  });
  const { devCode: staffCode } = await staffChallenge.json();
  const verifyRes = await request.post("http://127.0.0.1:8788/api/ops/auth/verify", {
    headers: { Host: OPS_HOST }, data: { email: rawEmail, code: staffCode },
  });
  const setCookie = (await verifyRes.headersArray()).find((h) => h.name.toLowerCase() === "set-cookie")?.value ?? "";
  const sessionToken = setCookie.match(/apertly_session=([^;]+)/)?.[1];
  if (!sessionToken) throw new Error("ops dev-mode login did not set a session cookie");
  await page.context().addCookies([{ name: "apertly_session", value: sessionToken, domain: "ops.localhost", path: "/" }]);

  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
      title,
    },
  });
  expect(saved.ok()).toBeTruthy();
  const projectId = (await saved.json()).project.id;
  const submitted = await page.request.post(`/api/projects/${projectId}/submit`, {
    data: { contact: { name: "T-C7 Customer", email: "tc7-gate-check@example.com", postcode: "3072" } },
  });
  expect(submitted.ok()).toBeTruthy();

  await page.goto(OPS);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const row = page.getByText(title).locator("visible=true");
  await expect(row.first()).toBeVisible();
  await row.first().click();

  // 'submitted' offers only "Start pricing" — moves to estimator_assigned,
  // where "Issue reviewed quote" becomes the primary action.
  await page.getByRole("button", { name: "Start pricing" }).click();
  const issueButton = page.getByRole("button", { name: "Issue reviewed quote" });
  await expect(issueButton).toBeVisible();
  await expect(issueButton).toBeDisabled();
  await expect(page.getByText(/delivery/i)).toBeVisible();
});
