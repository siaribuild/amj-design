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

test("contact page: question enquiry issues an OpenFrame reference", async ({ page }) => {
  // Distinct source IP so the per-IP submit throttle doesn't collide with the
  // appointment test's submission.
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.41" });
  await page.goto("/contact");
  await expect(page.getByRole("heading", { name: /contact openframe/i })).toBeVisible();
  // Opens on the two-card chooser — no form until a branch is picked.
  await expect(page.getByPlaceholder("Your name")).toHaveCount(0);
  await page.getByRole("radio", { name: /ask a question/i }).click();
  // Appointment-only fields stay hidden on the question branch.
  await expect(page.getByText("Preferred showroom")).toHaveCount(0);
  await page.getByPlaceholder("Your name").fill("Test Person");
  await page.getByPlaceholder("you@email.com").fill("test.person@example.com");
  await page.getByPlaceholder(/describe your project/i).fill("Hi, do you deliver to Bendigo?");
  await page.getByRole("button", { name: /send question/i }).click();
  await expect(page.getByRole("heading", { name: /question received/i })).toBeVisible();
  await expect(page.getByText(/OF-ENQ-\d{4}-\d{6}/).first()).toBeVisible();
});

test("contact page: appointment branch + list↔form location sync", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "203.0.113.42" });
  await page.goto("/contact");
  // Progressive disclosure: switch to the appointment branch.
  await page.getByRole("radio", { name: /request a showroom appointment/i }).click();
  await expect(page.getByText("Preferred showroom")).toBeVisible();

  // Selecting a suburb in the locations list fills the form's showroom select.
  await page.getByRole("button", { name: "Rowville", exact: true }).click();
  await expect(page.locator("select").filter({ hasText: "Rowville, VIC" })).toHaveValue("loc_vic_rowville");

  await page.getByPlaceholder("Your name").fill("Mel Visitor");
  await page.getByPlaceholder("you@email.com").fill("mel.visitor@example.com");
  await page.getByPlaceholder("(03) 9000 0000").fill("0431 234 567");
  await page.getByRole("button", { name: "Afternoon", exact: true }).click();
  await page.getByRole("button", { name: /request appointment/i }).click();

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
