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
  await page.getByRole("button", { name: /email me a code|send code/i }).click();
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

// A schedule, an energy report and a set of plans do different jobs in the same
// project, so which is which is the one fact the file rail owes the customer.
// The card builder showed it; /quote replaced that page and the chip did not
// survive the move — silently, because nothing asserted it. This does.
test("the file rail says what each document was detected as", async ({ page }) => {
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      authenticated: true, anonymous: false,
      user: { id: "doc-user", email: "doc@example.com", name: "Doc User", phone: null, company: null, abn: null, priceGstMode: "inc", type: "customer", createdAt: new Date().toISOString() },
    }),
  }));
  await page.route("**/api/projects/current", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      project: { id: "doc-project", ref: "OF-Q-DOC", title: "Doc project", status: "draft", createdAt: new Date().toISOString() },
      items: [],
      files: [
        { id: "f-sched", filename: "schedule.pdf", kind: "upload", size: 100, doc_type: "schedule" },
        { id: "f-energy", filename: "energy-report.pdf", kind: "upload", size: 100, doc_type: "energy_report" },
        { id: "f-plans", filename: "plans.pdf", kind: "upload", size: 100, doc_type: "plans" },
        // Null is the ANONYMOUS/pre-run state and is permanent for some uploads:
        // it must render the file with no type, never an unresolvable "SORTING…".
        { id: "f-unknown", filename: "mystery.pdf", kind: "upload", size: 100, doc_type: null },
      ],
    }),
  }));

  await page.goto("/quote");
  await expect(page.getByText("schedule.pdf")).toBeVisible();
  for (const label of ["SCHEDULE", "ENERGY REPORT", "PLANS"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  // The unclassified file is listed, and carries no type chip of any kind.
  await expect(page.getByText("mystery.pdf")).toBeVisible();
  await expect(page.getByText("SORTING", { exact: false })).toHaveCount(0);
  await expect(page.getByText("SUPPORTING", { exact: true })).toHaveCount(0);
});

// The footer's "Sign in" was the only sign-in control on the site that survived
// signing in: the header hides it and the drawer turns it into Sign out. It sent
// a signed-in customer to an OTP form, which reads as an expired session rather
// than as a link they did not need.
test("the footer stops offering sign-in to someone already signed in", async ({ page }) => {
  // Auto-waiting assertions, not allInnerTexts(): the footer is rendered by React
  // after hydration, and a bare read returns an empty list before it exists.
  const inFooter = (name: string) => page.locator("footer").getByRole("button", { name, exact: true });

  await page.goto("/");
  await expect(inFooter("Sign in")).toBeVisible();
  await expect(inFooter("My Projects")).toHaveCount(0);

  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      authenticated: true, anonymous: false,
      user: { id: "footer-user", email: "footer@example.com", name: "Footer User", phone: null, company: null, abn: null, priceGstMode: "inc", type: "customer", createdAt: new Date().toISOString() },
    }),
  }));
  await page.reload();

  await expect(inFooter("My Projects")).toBeVisible();
  await expect(inFooter("Sign in")).toHaveCount(0);
  // Everything else in the footer stays put — a utility list that rearranges
  // itself is harder to learn than one that repeats itself. Track order in
  // particular is redundant when signed in, not broken, so it stays.
  for (const stays of ["Track order", "Resources", "Contact", "Trade account", "Get a quote", "Windows", "Doors"]) {
    await expect(inFooter(stays)).toBeVisible();
  }
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
        issued_at: null, issued_total: null, issued_deposit: null,
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

  // No Status column, at either width. Every line on a submitted job carries the
  // same state, so the column states nothing — and it costs 10rem doing it, which
  // is width the product name and the size want. The track is dropped, not merely
  // emptied: the remaining cells shift left onto it.
  await expect(page.locator(".quote-table[data-record='true']")).toBeVisible();
  await expect(page.locator(".quote-table-head").getByText("Status")).toHaveCount(0);
  await expect(page.locator(".quote-row .quote-chip")).toHaveCount(0);

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

// T-C5 — the issued quote asks for half of goods plus delivery (design doc
// §8.4, C8). Fixtures built through page.request against the real API, ops
// side priced/settled/issued through the Host-header trick T-C6/T-C7 (ops.
// spec.ts) already use for the same OTP-cap reason.
test("T-C5: the issued quote asks for half of goods plus delivery", async ({ page, request }) => {
  const stamp = Date.now().toString().slice(-8);
  const email = `tc5-issued-${stamp}@example.com`;
  const title = `T-C5 issued check ${stamp}`;

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

  // The submission gate: a session that owns the project, and an account with a
  // name, phone and address. Created here through the API so the test's own
  // subject — the issued quote's deposit arithmetic — is what it exercises.
  const challenge = await page.request.post("/api/auth/challenge", { data: { email } });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  expect((await page.request.post("/api/auth/verify", { data: { email, code: devCode } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/auth/profile", {
    data: {
      name: "TC5 Customer", phone: "0412 345 678", addressLine1: "12 Bridge Street",
      addressSuburb: "Preston", addressState: "VIC", addressPostcode: "3072",
    },
  })).ok()).toBeTruthy();
  const submitted = await page.request.post(`/api/projects/${projectId}/submit`, {
    data: { delivery: { postcode: "3072" } },
  });
  expect(submitted.ok()).toBeTruthy();
  // …and this device forgets the session, so the UI half below signs in for real.
  await page.request.post("/api/auth/logout", { data: {} });

  const OPS_HOST = "ops.localhost:8788";
  const rawEmail = `tc5-ops-${stamp}@openframe.com.au`;
  const staffChallenge = await request.post("http://127.0.0.1:8788/api/ops/auth/challenge", { headers: { Host: OPS_HOST }, data: { email: rawEmail } });
  const { devCode } = await staffChallenge.json();
  await request.post("http://127.0.0.1:8788/api/ops/auth/verify", { headers: { Host: OPS_HOST }, data: { email: rawEmail, code: devCode } });

  const zones = await (await request.get("http://127.0.0.1:8788/api/ops/pricing/delivery-zones", { headers: { Host: OPS_HOST } })).json();
  const vicMetro = zones.zones.find((z: { id: string; version: string; minCharge: number | null }) => z.id === "vic-metro");
  if (vicMetro.minCharge == null) {
    await request.put("http://127.0.0.1:8788/api/ops/pricing/delivery-zones/vic-metro", {
      headers: { Host: OPS_HOST }, data: { ratePerSqm: 45, minCharge: 180, maxCharge: 900, expectedVersion: vicMetro.version },
    });
  }
  await request.put(`http://127.0.0.1:8788/api/ops/projects/${projectId}/delivery`, { headers: { Host: OPS_HOST }, data: { amount: 640 } });
  await request.post(`http://127.0.0.1:8788/api/ops/projects/${projectId}/issue-quote`, { headers: { Host: OPS_HOST }, data: {} });

  await page.goto("/login");
  await otpLogin(page, /your@email\.com/, email, /verify & continue/i);
  await page.getByText(title).locator("visible=true").first().click();

  await expect(page.getByRole("heading", { name: "Review and submit" })).toHaveCount(0);
  const total = goods + 640;
  await expect(page.getByText(/Delivery to 3072/).first()).toBeVisible();
  await expect(page.getByText(/40%/)).toHaveCount(0);
  await expect(page.getByText(`Total (inc GST)`)).toBeVisible();
  await expect(page.getByText(new RegExp(`\\$${total.toLocaleString("en-AU")}`))).toBeVisible();
  const halfTotal = Math.round(total / 2);
  await expect(page.getByText(new RegExp(`\\$${halfTotal.toLocaleString("en-AU")}`)).first()).toBeVisible();
});
