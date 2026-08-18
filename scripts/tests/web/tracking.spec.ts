import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Guest tracking, end to end in a real browser.
//
// WHY THIS FILE EXISTS: this flow has produced two production defects that the
// request-level suite could not catch, because that suite never runs the SPA.
//
//   1. `setRec` shipped as an undeclared identifier. /track/verify returned 200
//      and set the cookie; the next line threw a ReferenceError straight into
//      the catch that renders "That code didn't match" — for a CORRECT code.
//      Worse, verify deletes the code before that point, so every retry then
//      failed for real and it presented as a code-matching bug.
//   2. Navigating away and back re-mounted the page at "lookup" and demanded the
//      reference, email and code again, while the httpOnly session cookie sat
//      there, still valid.
//
// Assertions are written against what the CUSTOMER sees, not internals, so they
// survive refactors of the state that broke twice.
//
// SHARED SESSION, deliberately: /track/request is rate-limited to one code per
// email+reference per 60s. Asking per test would either trip that limiter or add
// a minute of sleeping, so the happy path signs in ONCE and the tests that
// depend on it run in order against the same context — which also mirrors how a
// customer actually moves around.

// The identity comes from the SEED, never a literal here: the owner edits
// seed.sql, and a hardcoded address rots silently — which it already did once,
// when u_demo's address changed and this suite kept asking for the old one.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
function seedEmail(userId: string): string {
  const row = seedSql.split("\n").find((l) => l.includes(`'${userId}'`) && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error(`seed.sql: no email for ${userId}`);
  return email;
}

const REF = "OF-58001";                              // seeded order (project p_order)
const EMAIL = seedEmail("u_demo");                   // its owner

const refField = /OF-Q-10001/i;
const emailField = /email used on the quote/i;

test.describe.configure({ mode: "serial" });

test.describe("a verified guest session", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/track-order");
    await page.getByPlaceholder(refField).fill(REF);
    await page.getByPlaceholder(emailField).fill(EMAIL);
    await page.getByRole("button", { name: /send code/i }).click();

    const devText = await page.getByText(/Dev mode/i).textContent();
    const code = devText?.match(/\d{6}/)?.[0] ?? "";
    expect(code, "the Worker surfaces a dev code in non-production").toMatch(/^\d{6}$/);

    await page.getByPlaceholder("••••••").fill(code);
    await page.getByRole("button", { name: /view status/i }).click();
  });

  test.afterAll(async () => { await page.close(); });

  test("a correct code opens the record — never 'that code didn't match'", async () => {
    // The exact regression: a valid code must not produce the failure message…
    await expect(page.getByText(/didn't match/i)).toHaveCount(0);
    // …and the record must actually render, not merely fail to error.
    await expect(page.getByText(REF).first()).toBeVisible();
  });

  test("the record carries the journey and documents, not just a status line", async () => {
    await expect(page.getByText(/Quote → order journey/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Documents$/ })).toBeVisible();
    // The lookup instruction belongs to the lookup step and must be gone by now.
    await expect(page.getByText(/Enter the reference from your confirmation email/i)).toHaveCount(0);
  });

  test("navigating away and back resumes the session without re-verifying", async () => {
    await page.goto("/contact");
    await expect(page).toHaveURL(/\/contact/);

    // The credential is an httpOnly cookie that lives until the browser closes,
    // so returning must land on the RECORD, not the lookup form.
    await page.goto("/track-order");
    await expect(page.getByText(REF).first()).toBeVisible();
    await expect(page.getByPlaceholder(refField)).toHaveCount(0);
  });

  test("'New search' ends the session and a reload cannot resume it", async () => {
    await page.getByRole("button", { name: /new search/i }).click();
    await expect(page.getByPlaceholder(refField)).toBeVisible();

    // Signing out is deliberate and must survive a page load — otherwise a
    // shared machine hands the next person the previous customer's record.
    await page.goto("/track-order");
    await expect(page.getByPlaceholder(refField)).toBeVisible();
    await expect(page.getByText(REF).first()).toHaveCount(0);
  });
});

// These use a DIFFERENT identity so they never consume the rate limiter that the
// happy path above depends on.
test("a wrong code is refused and the record never appears", async ({ page }) => {
  await page.goto("/track-order");
  await page.getByPlaceholder(refField).fill(REF);
  await page.getByPlaceholder(emailField).fill("someone.else@example.com");
  await page.getByRole("button", { name: /send code/i }).click();
  await page.getByPlaceholder("••••••").fill("000000");
  await page.getByRole("button", { name: /view status/i }).click();

  await expect(page.getByText(/didn't match/i)).toBeVisible();
  await expect(page.getByText(/Quote → order journey/i)).toHaveCount(0);
});

test("an unknown reference reveals nothing about whether it exists", async ({ page }) => {
  await page.goto("/track-order");
  await page.getByPlaceholder(refField).fill("OF-00000");
  await page.getByPlaceholder(emailField).fill("nobody@example.com");
  await page.getByRole("button", { name: /send code/i }).click();

  // Anti-enumeration: the response is identical to a real match, so the code
  // step is reached either way and nothing confirms the record exists.
  await expect(page.getByPlaceholder("••••••")).toBeVisible();
  await expect(page.getByText(/Dev mode/i)).toHaveCount(0);
});

// The OF-Q path — a quote that has been submitted but has no order yet. This is
// the reference the confirmation email actually hands a customer, and it is the
// one that broke first: lookup only ever searched order numbers, and matched the
// email against a user row that an anonymous submitter does not have.
//
// Built through the REAL path rather than a seed fixture: an anonymous draft,
// submitted with a contact address, exactly as a customer creates one. That also
// means the test covers the anonymous case specifically, which is where both
// original defects lived.
test("a submitted quote is trackable by its OF-Q reference, anonymously", async ({ page }) => {
  const email = "e2e.quote.tracker@example.com";

  // page.request shares this page's cookie jar, so the claim cookie minted here
  // is the same one the browser holds — an anonymous customer, not a fixture.
  await page.goto("/");
  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      title: "E2E tracked quote",
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
        lineTotal: 1,
      }],
    },
  });
  const project = (await saved.json()).project;
  expect(project.ref, "a submitted quote gets an OF-Q reference").toMatch(/^OF-Q-\d+$/);

  // The submission gate: only a signed-in customer with a complete account can
  // submit. The guest TRACKING flow below is untouched by that, and still works
  // from a reference and an email address on a device with no session.
  const signIn = await page.request.post("/api/auth/challenge", { data: { email } });
  const { devCode: signInCode } = await signIn.json();
  await page.request.post("/api/auth/verify", { data: { email, code: signInCode } });
  await page.request.post("/api/auth/profile", {
    data: {
      name: "E2E Tester", phone: "0400 000 000", addressLine1: "12 Bridge Street",
      addressSuburb: "Preston", addressState: "VIC", addressPostcode: "3072",
    },
  });
  await page.request.post(`/api/projects/${project.id}/submit`, {
    data: { delivery: { suburb: "Rowville", postcode: "3178" } },
  });
  await page.request.post("/api/auth/logout", { data: {} });

  // Now track it the way the confirmation email tells them to.
  await page.goto("/track-order");
  await page.getByPlaceholder(refField).fill(project.ref);
  await page.getByPlaceholder(emailField).fill(email);
  await page.getByRole("button", { name: /send code/i }).click();

  const devText = await page.getByText(/Dev mode/i).textContent();
  const code = devText?.match(/\d{6}/)?.[0] ?? "";
  expect(code, "a quote reference must issue a code, not silently match nothing").toMatch(/^\d{6}$/);

  await page.getByPlaceholder("••••••").fill(code);
  await page.getByRole("button", { name: /view status/i }).click();

  // The pre-order view: their reference, their lines, and the journey — not a
  // bare status word, which is all this used to show.
  await expect(page.getByText(/didn't match/i)).toHaveCount(0);
  await expect(page.getByText(project.ref).first()).toBeVisible();
  await expect(page.getByText(/Quote → order journey/i)).toBeVisible();
  await expect(page.getByText("E2E tracked quote").first()).toBeVisible();
});
