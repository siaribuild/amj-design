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

/** Give the page's request context a signed-in customer with a complete account.
 *
 *  The submission gate refuses anything less, server-side, so a fixture that
 *  submits a quote for ops to look at has to satisfy it. Done through the API
 *  rather than the UI: these are ops tests, and driving the customer sign-in
 *  screen here would burn an OTP challenge on something none of them assert. */
let opsFixtureSource = 0;
async function signInAndComplete(page: Page, email: string, name: string) {
  // Its own source address. Code issuance is capped per SOURCE as well as per
  // recipient, and browser traffic all lands in one bucket — a fixture that
  // borrows it makes the whole suite fail as though auth were broken.
  const headers = { "X-Forwarded-For": `198.21.0.${opsFixtureSource++ % 250}` };
  const challenge = await page.request.post("/api/auth/challenge", { data: { email }, headers });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  const verified = await page.request.post("/api/auth/verify", { data: { email, code: devCode }, headers });
  expect(verified.ok(), `verify ${email}`).toBeTruthy();
  const profile = await page.request.post("/api/auth/profile", {
    data: {
      name, phone: "0412 345 678", addressLine1: "12 Bridge Street",
      addressSuburb: "Preston", addressState: "VIC", addressPostcode: "3072",
    },
  });
  expect(profile.ok(), `complete account for ${email}`).toBeTruthy();
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
  await signInAndComplete(page, "tc6-delivery-check@example.com", "T-C6 Customer");
  const submitted = await page.request.post(`/api/projects/${(await saved.json()).project.id}/submit`, {
    data: { delivery: { postcode: "3072" } },
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
  await signInAndComplete(page, "tc7-gate-check@example.com", "T-C7 Customer");
  const submitted = await page.request.post(`/api/projects/${projectId}/submit`, {
    data: { delivery: { postcode: "3072" } },
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
  // Not a bare /delivery/i — that also matches the header's "delivery not
  // set" caption and the DeliveryBlock panel's own "Delivery" title, both
  // legitimately on the page at the same time. This is the blockedReason
  // beside the disabled button specifically (worker/lib/ops-actions.ts),
  // which is the thing the test's name is actually asserting.
  await expect(page.getByText(/delivery has not been set on this project/i)).toBeVisible();
});

// T-C8 — a staff override settles delivery, unblocks issuing, and the issued
// total carries it (design doc §7.1/§7.2, C8). Same single-login pattern as
// T-C6/T-C7.
test("T-C8: a staff override settles delivery, unblocks issuing, and the issued total carries it", async ({ page, request }) => {
  const OPS_HOST = "ops.localhost:8788";
  const title = `T-C8 flip check ${Date.now().toString().slice(-6)}`;
  const rawEmail = `tc8-ops-${Date.now().toString().slice(-8)}@openframe.com.au`;

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

  // Price vic-metro if this is the first spec in the run to need it.
  const zones = await (await request.get("http://127.0.0.1:8788/api/ops/pricing/delivery-zones", { headers: { Host: OPS_HOST } })).json();
  const vicMetro = zones.zones.find((z: { id: string; version: string; minCharge: number | null }) => z.id === "vic-metro");
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
  const savedBody = await saved.json();
  const projectId = savedBody.project.id;
  const goods = savedBody.items[0].lineTotal;
  await signInAndComplete(page, "tc8-flip-check@example.com", "T-C8 Customer");
  const submitted = await page.request.post(`/api/projects/${projectId}/submit`, {
    data: { delivery: { postcode: "3072" } },
  });
  expect(submitted.ok()).toBeTruthy();

  await page.goto(OPS);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  const row = page.getByText(title).locator("visible=true");
  await expect(row.first()).toBeVisible();
  await row.first().click();
  await page.getByRole("button", { name: "Start pricing" }).click();

  // The panel's own save is the control — no separate action button.
  const deliveryBlock = page.locator(".card").filter({ hasText: "Machine estimate" });
  await expect(deliveryBlock).toBeVisible();
  const amountInput = deliveryBlock.locator('input[inputmode="decimal"]');
  await amountInput.fill("640");
  await deliveryBlock.getByRole("button", { name: "Save" }).click();

  // D19 as a layout rule: the estimate never disappears when the confirmed
  // number arrives.
  await expect(deliveryBlock.getByText("Machine estimate")).toBeVisible();
  await expect(deliveryBlock.getByText("Confirmed")).toBeVisible();

  const issueButton = page.getByRole("button", { name: "Issue reviewed quote" });
  await expect(issueButton).toBeEnabled();
  await issueButton.click();
  // Confirms in place (ProjectRecord.tsx) — a second, explicit click, since
  // issuing moves money and emails the customer.
  await page.getByRole("button", { name: "Confirm", exact: true }).click();

  const total = goods + 640;
  await expect(page.getByText(new RegExp(`\\$${total.toLocaleString("en-AU")}`)).first()).toBeVisible();
});

// T-C9 — a delivery zone can be created, priced, saved and deleted from the
// console (design doc §10.3, C9). NULL -> 1200 on a zone's own first edit is
// the same SHAPE as the 0 -> 1200 edit that armed the now-removed rate-card
// tripwire (ops-pricing.ts's header comment, corrected this same commit) —
// E2 seeds every new zone's rates at NULL rather than 0 (§6.2), so the
// relative jump here is if anything more extreme, and the zones screen was
// built without that gate from the start rather than inheriting it.
// Creates its own zone and destroys it, so it cannot move a price another
// spec prices against — this file shares a Worker and a database with the
// rest of the run.
test("T-C9: a delivery zone can be created, priced, saved and deleted from the console", async ({ page, request }) => {
  const OPS_HOST = "ops.localhost:8788";
  const rawEmail = `tc9-ops-${Date.now().toString().slice(-8)}@openframe.com.au`;
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

  const slug = `e2e-zone-${Date.now()}`;

  await page.goto(OPS);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await page.getByRole("button", { name: "Delivery zones", exact: true }).click();

  await page.getByRole("button", { name: /New zone/i }).click();
  await page.getByPlaceholder("zone-id").fill(slug);
  await page.getByPlaceholder("Label shown to staff and customers").fill("E2E Test Zone");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const row = page.getByRole("row").filter({ hasText: slug });
  await expect(row).toBeVisible();

  // $/m², Min, Max — Min is the one the removed rate-card tripwire fired on.
  const inputs = row.locator('input[inputmode="decimal"]');
  await inputs.nth(1).fill("1200");

  // THE ASSERTION THIS TEST EXISTS FOR: the save button is not blocked.
  const saveButton = row.locator('button[title="Save"]');
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  // Rate and max are still unset, so the worked-example column stays "not
  // priced" — the input's own value is what proves the save landed.
  await expect(inputs.nth(1)).toHaveValue("1200");

  // And it persists a round trip through the API, not just local state.
  await page.reload();
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await page.getByRole("button", { name: "Delivery zones", exact: true }).click();
  const reloadedRow = page.getByRole("row").filter({ hasText: slug });
  await expect(reloadedRow.locator('input[inputmode="decimal"]').nth(1)).toHaveValue("1200");

  page.on("dialog", (d) => d.accept()); // the delete confirm
  await reloadedRow.locator('button[title="Delete"]').click();
  await expect(page.getByRole("row").filter({ hasText: slug })).toHaveCount(0);
});
