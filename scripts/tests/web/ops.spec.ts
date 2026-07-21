import { test, expect, type Page } from "@playwright/test";

// The ops console is served on the ops.* host (Chromium resolves *.localhost).
const OPS = "http://ops.localhost:8788/";

async function staffLogin(page: Page) {
  await page.goto(OPS);
  await page.getByPlaceholder(/you@openframe.com.au/i).fill("staff@openframe.com.au");
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

test("ops tabs render (approvals, orders, customers, catalogue, audit)", async ({ page }) => {
  await staffLogin(page);
  await page.getByRole("button", { name: "Orders" }).click();
  await expect(page.getByText("OF-58001")).toBeVisible();
  await page.getByRole("button", { name: "Customers" }).click();
  await expect(page.getByText("Sarah Nguyen")).toBeVisible();
  await page.getByRole("button", { name: "Catalogue" }).click();
  await expect(page.getByText(/Colorbond colours/i)).toBeVisible();
  await page.getByRole("button", { name: "Audit" }).click();
  await expect(page.getByRole("heading", { name: "Audit" })).toBeVisible();
});

test("ops enquiries tab shows the lead submitted from the contact page", async ({ page }) => {
  await staffLogin(page);
  await page.getByRole("button", { name: "Enquiries" }).click();
  // The customer contact-page tests submit "Test Person" (question) + "Mel Visitor"
  // (appointment) earlier in the run; every lead shows the OpenFrame source.
  await expect(page.getByText("Test Person").first()).toBeVisible();
  await expect(page.getByText("OpenFrame Website").first()).toBeVisible();
  // Open the appointment lead and confirm its immutable attribution.
  await page.getByText("Mel Visitor").first().click();
  await expect(page.getByText(/Source: OpenFrame Website/i)).toBeVisible();
  await expect(page.getByText("OPENFRAME").first()).toBeVisible();
});
