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

test("the product page editor says nothing until the visitor touches it", async ({ page }) => {
  // A blank form is not a form with mistakes in it (owner). This editor is the
  // first thing a visitor meets, with no size entered because they have not
  // entered one — and it opened flagging Dimensions and Options in red and
  // listing two faults above the button.
  await page.goto("/products/amj80-series-sliding-window");
  const form = page.locator(".quote-panel").first();
  await expect(form).toBeVisible();
  // No section is flagged, and the footer lists no faults. ("Enter the opening
  // size" still appears as the Dimensions SUMMARY — that is the section saying
  // what it is for, not an accusation.)
  await expect(form.locator('[data-attention="true"]')).toHaveCount(0);
  await expect(form.locator(".quote-panel-footer").getByText(/Enter the opening size/)).toHaveCount(0);
  // The fault is REAL from the first render and still holds the button.
  await expect(form.getByRole("button", { name: /Add to MyProject/ })).toBeDisabled();

  // One keystroke and it starts talking.
  await form.getByPlaceholder("e.g. 1810").fill("1200");
  await expect(form.locator('[data-attention="true"]')).not.toHaveCount(0);
});

test("the size fields never accuse a tall opening of being reversed", async ({ page }) => {
  // A tall sliding window is an ordinary building. The notice called it a
  // problem on no evidence beyond an aspect ratio, and offered a button that
  // rewrote two measurements the customer had just read off a wall (owner).
  await page.goto("/products/amj80-series-sliding-window");
  const form = page.locator(".quote-panel").first();
  await form.getByPlaceholder("e.g. 1810").fill("1000");
  await form.getByPlaceholder("e.g. 1210").fill("2000");
  await expect(page.getByText(/these look reversed/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Swap" })).toHaveCount(0);
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

// RETIRED WITH THE PAGE IT TESTED. "a persisted composite survives
// current-project hydration and renders its units" drove /quote when /quote was
// the card builder, and asserted that builder's internals: .quote-item-card,
// .quote-sticky, "Expand item", the composite editor panel. None of those exist
// now. What it actually PROVED — a composite arrives from the API with its
// segments and is drawn from them, and a unit is editable on both axes — is
// covered against the current UI by quote-project.spec.ts: "a composite is
// named and drawn from its units" and "the customer may change what a unit IS,
// but not how many there are".

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

test("the record draws a composite as the builder does, with nothing to press", async ({ page }) => {
  // The account showed a flat table with no way to express a composite: an
  // opening built as an awning and a lite appeared as one product and one size,
  // which is not what is made. It now reuses the builder's own row, which names a
  // composite from its UNITS and draws the join at the real split.
  const COMPOSITE = {
    id: "line-x1", code: "X1", productSlug: "amj80-series-awning-window",
    location: "Living", width: "2050", height: "2100", qty: 1, status: "Ready",
    lineTotal: 900, options: {}, compositeAxis: "vertical",
    segments: [
      { id: "x1a", productSlug: "amj80-series-awning-window", width: "1025", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 500, options: {}, status: "Ready" },
      { id: "x1b", productSlug: "amj80-series-sliding-window", width: "1025", height: "2100", qtyPerParent: 1, qty: 1, lineTotal: 400, options: {}, status: "Ready" },
    ],
  };
  // Records open from the dashboard, not a URL, so the list must offer one.
  await page.route("**/api/projects", (route) =>
    route.request().method() !== "GET" ? route.continue() : route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ projects: [{
        id: "p_composite", public_ref: "OF-Q-19900", title: "Composite record",
        status_customer: "submitted", updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(), item_count: 1, draft_total: 900,
        issued_revision_id: null, issued_revision_no: null,
      }] }),
    }));
  await page.route("**/api/projects/p_composite*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      project: { id: "p_composite", ref: "OF-Q-19900", title: "Composite record", status: "submitted", createdAt: new Date().toISOString() },
      items: [COMPOSITE], files: [],
    }) }));

  await page.goto("/login");
  await otpLogin(page, /your@email.com/, DEMO_EMAIL, /verify & continue/i);
  await page.getByRole("button", { name: /OF-Q-19900/ }).click();

  const row = page.locator(".quote-row").first();
  await expect(row).toBeVisible();
  // Named from the units, exactly as the builder does — never the parent's own
  // frame, which is the pre-split product and is not what gets built.
  await expect(row.getByText("Composite Window")).toBeVisible();
  // A record is not a thing to change.
  await expect(page.getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Actions for / })).toHaveCount(0);
  // …but it still opens, and the drawing shows the real make-up.
  await row.getByRole("button", { name: /details for X1/ }).click();

  // A composite expands into its UNITS, exactly as the builder does — lettered
  // off the parent, each with its own drawing and specification. The record is
  // the same list, so this is not a second behaviour to keep in step.
  await expect(page.getByText("X1A", { exact: true })).toBeVisible();
  await expect(page.getByText("X1B", { exact: true })).toBeVisible();
  await expect(page.locator("svg[data-elevation]").first()).toBeVisible();

  // Machine fields stay out. options carries performanceVariantId,
  // frameTechnology, glassBuildUp and glazing beside the customer's real
  // choices; the specification is derived from the PRODUCT's option types, so
  // those never reach the screen. A hand-rolled panel that mapped options
  // straight to rows printed them verbatim.
  for (const machineField of ["performanceVariantId", "frameTechnology", "glassBuildUp"]) {
    await expect(page.getByText(machineField, { exact: false })).toHaveCount(0);
  }
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

  await page.goto("/quote");
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
