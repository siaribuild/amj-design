import { test, expect, type Page } from "@playwright/test";

// Read the dev-mode OTP the Worker surfaces in non-prod, and complete a two-step
// email login form.
async function otpLogin(page: Page, emailPlaceholder: RegExp, email: string, verifyName: RegExp) {
  await page.getByPlaceholder(emailPlaceholder).first().fill(email);
  await page.getByRole("button", { name: /send code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  const code = devText?.match(/\d{6}/)?.[0] ?? "";
  await page.getByPlaceholder("••••••").fill(code);
  await page.getByRole("button", { name: verifyName }).click();
}

test("home page renders and offers a quote", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /get a quote/i }).first()).toBeVisible();
});

test("products page renders the real catalogue", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByText("Windows", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sliding Window/i).first()).toBeVisible();
});

test("customer OTP login lands on a dashboard with real data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Sign in or register/i)).toBeVisible();
  await otpLogin(page, /your@email\.com/, "demo@amjtradedirect.com.au", /verify & continue/i);
  await expect(page.getByText(/G'day, Demo/)).toBeVisible();
  await expect(page.getByText("Coburg new build")).toBeVisible();
  await expect(page.getByText("AMJ-58001")).toBeVisible();
});

test("guest order tracking shows a read-only status", async ({ page }) => {
  await page.goto("/track-order");
  await page.getByPlaceholder("AMJ-58001").fill("AMJ-58001");
  await page.getByPlaceholder("Email used on the order").fill("demo@amjtradedirect.com.au");
  await page.getByRole("button", { name: /send code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  await page.getByPlaceholder("••••••").fill(devText?.match(/\d{6}/)?.[0] ?? "");
  await page.getByRole("button", { name: /view order/i }).click();
  await expect(page.getByText("Order AMJ-58001")).toBeVisible();
  await expect(page.getByText(/In manufacturing/i)).toBeVisible();
  // Read-only: no staff/customer action controls in the guest view.
  await expect(page.getByRole("button", { name: /approve|confirm|accept/i })).toHaveCount(0);
});
