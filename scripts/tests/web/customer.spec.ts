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

test("customer OTP login lands on the attention-first dashboard with real data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Sign in or register/i)).toBeVisible();
  await otpLogin(page, /your@email\.com/, "demo@openframe.com.au", /verify & continue/i);
  // Greeting + attention summary
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs your attention" })).toBeVisible();
  // The draft gate + the unified list (draft appears in both — gate and row)
  await expect(page.getByText("Coburg new build").first()).toBeVisible();
  await expect(page.getByText("Finish & submit for a full quote").first()).toBeVisible();
  await expect(page.getByText("OF-58001").first()).toBeVisible();

  // Open the order → the deep workspace with the live lifecycle timeline.
  await page.getByRole("button", { name: /OF-58001/ }).click();
  await expect(page.getByText("Quote → order journey")).toBeVisible();
  await expect(page.getByText("On track — nothing needed from you")).toBeVisible();
  await expect(page.getByText("Order lines")).toBeVisible();
});

test("contact page: question enquiry issues an OpenFrame reference", async ({ page }) => {
  // Distinct source IP so the per-IP submit throttle doesn't collide with the
  // appointment test's submission.
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.41" });
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: /tell us what you need/i })).toBeVisible();
  // The router band surfaces every intent; the Ask tab is open by default.
  await expect(page.getByRole("tab", { name: /ask a question/i })).toHaveAttribute("aria-selected", "true");
  await page.getByPlaceholder("Your name").fill("Test Person");
  await page.getByPlaceholder("you@email.com").fill("test.person@example.com");
  await page.getByPlaceholder(/rough sizes/i).fill("Hi, do you deliver to Bendigo?");
  await page.getByRole("button", { name: /send message/i }).click();
  await expect(page.getByRole("heading", { name: /message received/i })).toBeVisible();
  await expect(page.getByText(/OF-ENQ-\d{4}-\d{6}/).first()).toBeVisible();
});

test("contact page: showroom visit tab + chip↔form location sync", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.42" });
  await page.goto("/contact");
  // Switch to the on-page Visit tab.
  await page.getByRole("tab", { name: /book a showroom visit/i }).click();
  await expect(page.getByText(/Pick the showroom nearest you/i)).toBeVisible();

  // Clicking a location chip fills the form's showroom select (Sanity-driven).
  await page.getByRole("button", { name: "Rowville VIC" }).click();
  await expect(page.locator("select").filter({ hasText: "Pick a showroom above" })).toHaveValue("loc_vic_rowville");

  // Phone-first: no email needed.
  await page.getByPlaceholder("Your name").fill("Mel Visitor");
  await page.getByPlaceholder("Best number to call").fill("0431 234 567");
  await page.getByRole("button", { name: /request a call to book/i }).click();

  await expect(page.getByRole("heading", { name: /appointment request received/i })).toBeVisible();
  await expect(page.getByText(/No appointment is confirmed yet/i)).toBeVisible();
  await expect(page.getByText(/OF-ENQ-\d{4}-\d{6}/).first()).toBeVisible();
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
