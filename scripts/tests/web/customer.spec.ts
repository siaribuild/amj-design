import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Identities come from the SEED, never a literal here. A hardcoded address rots
// silently the moment the owner edits seed.sql — which is exactly what happened
// to this file: it kept asking for demo@openframe.com.au long after u_demo's
// address changed, and the login test had been failing ever since.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
function seedEmail(userId: string): string {
  const row = seedSql.split("\n").find((l) => l.includes(`'${userId}'`) && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error(`seed.sql: no email for ${userId}`);
  return email;
}
const DEMO_EMAIL = seedEmail("u_demo");

/** A unit IS an item — a real frame that is made and delivered, sharing an
 *  opening with its siblings instead of having one to itself (owner). So a mock
 *  unit with no options is a unit that would genuinely block on its missing
 *  colour, which is not what these fixtures are testing. Production agrees:
 *  splitLine inherits the opening's options, and all 23 live units carry them. */
const SEGMENT_OPTIONS = { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" };


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
  // The catalogue hero deliberately uses the specific document workflow.
  await expect(page.getByRole("button", { name: /upload a schedule/i }).first()).toBeVisible();
  // A catalogue-driven product detail page renders its name.
  await page.goto("/products/amj80-series-sliding-window");
  await expect(page.getByRole("heading", { name: "AMJ80 Series Sliding Window" })).toBeVisible();
});

test("clear all removes uploaded documents durably across a browser refresh", async ({ page }) => {
  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
    },
  });
  expect(saved.ok()).toBeTruthy();
  const uploaded = await page.request.post("/api/files/upload", {
    multipart: {
      file: { name: "refresh-regression.txt", mimeType: "text/plain", buffer: Buffer.from("energy report") },
      kind: "upload",
    },
  });
  expect(uploaded.ok()).toBeTruthy();

  await page.goto("/quote");
  await expect(page.getByText("refresh-regression.txt")).toBeVisible();
  await page.getByRole("button", { name: "Clear all items and uploaded documents" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear everything" });
  await dialog.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("refresh-regression.txt")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("refresh-regression.txt")).toHaveCount(0);
  const current = await page.request.get("/api/projects/current");
  const body = await current.json();
  expect(body.items).toEqual([]);
  expect(body.files).toEqual([]);
});

test("a persisted composite survives current-project hydration and renders its units", async ({ page }) => {
  await page.route("**/api/projects/current", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: { id: "project-composite", ref: "OF-Q-COMPOSITE", title: "Composite regression", status: "draft", createdAt: new Date().toISOString() },
        files: [],
        items: [{
          id: "line-w2", code: "W2", productSlug: "amj80-series-sliding-window", location: "Kitchen / Meals / Family",
          width: "3500", height: "700", options: {}, qty: 1, status: "Ready", lineTotal: 1000,
          origin: "ai", aiPriced: true, review: { fit: "Composite layout requires technical confirmation." }, compositeAxis: "vertical",
          segments: [
            { id: "segment-w2-a", productSlug: "amj80-series-sliding-window", width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: SEGMENT_OPTIONS, status: "Ready" },
            { id: "segment-w2-b", productSlug: "amj80-series-sliding-window", width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: SEGMENT_OPTIONS, status: "Ready" },
          ],
        }],
      }),
    });
  });

  await page.goto("/quote");
  await expect(page.locator(".quote-page")).toHaveClass(/ground-bone/);
  await expect(page.locator(".quote-item-card")).toHaveAttribute("data-state", "review");
  await expect(page.locator(".quote-sticky")).toHaveAttribute("data-state", "review");

  const collapsedSurfaces = await page.evaluate(() => {
    const background = (selector: string) => getComputedStyle(document.querySelector(selector)!).backgroundColor;
    return {
      page: background(".quote-page"),
      card: background(".quote-item-card"),
      header: background(".quote-item-head"),
      body: background(".quote-item-body"),
      sticky: background(".quote-sticky"),
    };
  });
  expect(collapsedSurfaces.page).not.toBe(collapsedSurfaces.card);
  expect(collapsedSurfaces.header).not.toBe(collapsedSurfaces.body);
  expect(collapsedSurfaces.sticky).toBe(collapsedSurfaces.card);

  await expect(page.getByText("W2", { exact: true })).toBeVisible();
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
  await expect(page.getByText("Composite · 2 windows", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Expand item" }).click();
  await expect(page.getByText("Built as 2 units", { exact: true })).toBeVisible();
  await expect(page.getByText("Unit 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Unit 2", { exact: true })).toBeVisible();

  // The unit COUNT is not the customer's to change (owner, 2026-08-04): they can
  // neither create a composite nor merge one back, so adding and removing units
  // was the same power by another route. Both controls are gone from BOTH arms,
  // and the server routes behind them with them.
  await expect(page.getByRole("button", { name: /Add window|Add door|Add unit/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Save unit 1" })).toBeVisible();
  await expect(page.locator(".quote-composite-panel")).toBeVisible();
  await expect(page.locator(".quote-composite-editor .quote-panel")).toBeVisible();
  // BOTH dimensions are editable (owner). The across-axis one used to be locked
  // to the opening's, which reads as a safety rail and behaves as a trap: correct
  // an opening's parsed height and every unit is left at the old figure with its
  // only repair field greyed out. A mismatch is reported now — on the unit and on
  // the opening — rather than prevented.
  const unitEditor = page.getByText("Edit composite unit", { exact: true }).locator("..").locator("..");
  await expect(unitEditor.locator('input[type="number"]').nth(0)).toBeEnabled();
  await expect(unitEditor.locator('input[type="number"]').nth(1)).toBeEnabled();
});

test("resolved document dimension conflicts do not create a quote-level warning", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      authenticated: true, anonymous: false,
      user: { id: "warning-user", email: "warning@example.com", name: "Warning User", phone: null, company: null, abn: null, priceGstMode: "inc", type: "customer", createdAt: new Date().toISOString() },
    }) });
  });
  await page.route("**/api/projects/current", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      project: { id: "warning-project", ref: "OF-Q-WARNING", title: "Warning project", status: "draft", createdAt: new Date().toISOString() },
      items: [{ id: "warning-line", code: "W4", productSlug: "amj100t-fixed-window", location: "Media", width: "2410", height: "1800", options: {}, qty: 1, status: "Needs review", lineTotal: 1000, origin: "ai", aiPriced: true, review: null }],
      files: [{ id: "warning-file", filename: "energy-report.pdf", kind: "upload", size: 100, doc_type: "energy_report" }],
    }),
  }));
  await page.route("**/api/projects/current/extraction-status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      run: { id: "warning-run", status: "completed", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), summary: { extractedLines: 1, conflicts: 1, energyApplied: 1, cartApplied: 1, documents: 1, discrepancyWarnings: ["W4: energy report says 3200 × 2100 mm, while the architectural plan/schedule says 2410 × 1800 mm. Architectural dimensions selected: 2410 × 1800 mm."] }, progressStage: "complete" },
      basis: {},
    }),
  }));
  await page.goto("/quote");
  await expect(page.getByText("Document differences need human review")).toHaveCount(0);
  await expect(page.getByText(/energy report says 3200/i)).toHaveCount(0);
});

test("queued AI work is labelled as document preparation, not file securing", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      authenticated: true, anonymous: false,
      user: { id: "queue-user", email: "queue@example.com", name: "Queue User", phone: null, company: null, abn: null, priceGstMode: "inc", type: "customer", createdAt: new Date().toISOString() },
    }) });
  });
  await page.route("**/api/projects/current", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      project: { id: "queue-project", ref: "OF-Q-QUEUE", title: "Queue project", status: "draft", createdAt: new Date().toISOString() },
      items: [], files: [{ id: "queue-file", filename: "schedule.pdf", kind: "upload", size: 100, doc_type: "schedule" }],
    }),
  }));
  await page.route("**/api/projects/current/extraction-status", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      run: { id: "queue-run", status: "queued", startedAt: new Date().toISOString(), completedAt: null, summary: null, progressStage: "queued" }, basis: {},
    }),
  }));

  await page.goto("/quote");
  await expect(page.getByText("Preparing document review", { exact: true })).toBeVisible();
  await expect(page.getByText(/Securing your files/i)).toHaveCount(0);
});

test("customer OTP login lands on the attention-first dashboard with real data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText(/Sign in or register/i)).toBeVisible();
  await otpLogin(page, /your@email\.com/, DEMO_EMAIL, /verify & continue/i);
  // Greeting + the "Needs you" action tab on the unified list (the successor of
  // the retired "Needs your attention" gate section)
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Needs you/ })).toBeVisible();
  // The cart section (ContinueProject) + the unified list
  await expect(page.getByText("Coburg new build").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume building your quote" })).toBeVisible();
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

// Guest order tracking lives in tracking.spec.ts, which owns the whole flow —
// lookup, code, the record view, session resume and sign-out — and reads its
// identity from the seed. A second copy lived here, had rotted against both the
// seed and the current placeholders, and would have raced the same 60s per
// email+reference rate limiter that the other file deliberately serialises
// around. One flow, one test.

// ─── Hydration is keyed on IDENTITY, not on mount ─────────────────────────────
// The bug: getCurrentProject() ran once with [] deps, so the current project was
// resolved exactly as often as the page was loaded. resolveCurrentProject
// answers differently before and after sign-in — anonymous follows the claim
// cookie, signed-in returns the user's own draft — so a tab that loaded while
// signed out kept showing the anonymous project until a hard refresh, while the
// dashboard (which queries D1 directly) showed the real one. They disagreed on
// screen, and only a full reload reconciled them.
test("signing in re-resolves the current project without a reload", async ({ page }) => {
  const currentCalls: number[] = [];
  page.on("request", (r) => {
    if (r.method() === "GET" && /\/api\/projects\/current(\?|$)/.test(r.url())) {
      currentCalls.push(Date.now());
    }
  });

  await page.goto("/quote-project");
  await expect(page.getByRole("region", { name: "Project summary and actions" })).toBeVisible();
  const beforeLogin = currentCalls.length;
  expect(beforeLogin, "the builder resolves a project on load").toBeGreaterThan(0);

  // Sign in WITHOUT reloading — the SPA stays mounted the whole time.
  await page.goto("/login");
  await otpLogin(page, /your@email\.com/, DEMO_EMAIL, /verify & continue/i);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Demo/ })).toBeVisible();

  await expect
    .poll(() => currentCalls.length, { message: "identity change must re-resolve the current project" })
    .toBeGreaterThan(beforeLogin);

  // And the builder now shows the signed-in customer's seeded draft — the same
  // project the dashboard just listed — with no hard refresh in between.
  // Arm-agnostic: /quote draws cards, /quote-project draws rows, and which one
  // Resume lands on is not what this test is about.
  await page.getByRole("button", { name: "Resume building your quote" }).click();
  await expect(page.locator(".quote-row, .quote-item-card").first()).toBeVisible();
});
