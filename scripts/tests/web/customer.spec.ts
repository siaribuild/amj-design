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

test("catalogue drives the products list and detail pages", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("button", { name: /start a quote/i }).first()).toBeVisible();
  // A catalogue-driven product detail page renders its name.
  await page.goto("/products/amj80-series-sliding-window");
  await expect(page.getByRole("heading", { name: "AMJ80 Series Sliding Window" })).toBeVisible();
});

test("customer OTP login lands on a dashboard with real data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Sign in or register/i)).toBeVisible();
  await otpLogin(page, /your@email\.com/, "demo@openframe.com.au", /verify & continue/i);
  await expect(page.getByText(/G'day, Demo/)).toBeVisible();
  await expect(page.getByText("Coburg new build")).toBeVisible();
  await expect(page.getByText("OF-58001")).toBeVisible();
});

test("contact form submits an enquiry", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: /get in touch/i })).toBeVisible();
  await page.getByPlaceholder("Your name").fill("Test Person");
  await page.getByPlaceholder("your@email.com").fill("test.person@example.com");
  await page.getByPlaceholder(/describe your project/i).fill("Hi, do you deliver to Bendigo?");
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByRole("heading", { name: /message sent/i })).toBeVisible();
});

test("guest order tracking shows a read-only status", async ({ page }) => {
  await page.goto("/track-order");
  await page.getByPlaceholder("OF-58001").fill("OF-58001");
  await page.getByPlaceholder("Email used on the order").fill("demo@openframe.com.au");
  await page.getByRole("button", { name: /send code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  await page.getByPlaceholder("••••••").fill(devText?.match(/\d{6}/)?.[0] ?? "");
  await page.getByRole("button", { name: /view order/i }).click();
  await expect(page.getByText("Order OF-58001")).toBeVisible();
  await expect(page.getByText(/In manufacturing/i).first()).toBeVisible();
  // Read-only: no staff/customer action controls in the guest view.
  await expect(page.getByRole("button", { name: /approve|confirm|accept/i })).toHaveCount(0);
});
