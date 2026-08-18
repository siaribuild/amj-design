// ═══════════════════════════════════════════════════════════════════════════════
// USER REGISTRATION — Phase 1: the browser half.
//
// WHY THIS FILE IS NOT OPTIONAL. The node suites exercise the Worker and the data
// layer; they cannot see anything the client decides. Two MAJOR referral findings
// — a program-Off switch that replaced the whole landing page, and payment holds
// the API served and nothing rendered — were invisible to 104 green node tests
// because the server-served HTML was byte-identical in both states. Everything
// below is a claim about what a person sees.
//
// Spec §11 (nine journeys) and design §10.3.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

// The AC-12 block boots its own server (see the bottom of this file); these are
// the same paths scripts/tests/helpers.mjs uses, resolved from the Playwright cwd.
const projectRoot = process.cwd();
const viteCli = join(projectRoot, "node_modules", "vite", "bin", "vite.js");
const wranglerCli = join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

function runNode(args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot, env: { ...process.env, ...env }, windowsHide: true, stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${args[0]} exited ${code}`))));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      s.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

async function waitFor(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const stamp = Date.now().toString(36);
let seq = 0;
const freshEmail = (label: string) => `reg-web-${label}-${stamp}-${seq++}@example.com`;

// Every sign-in gets its own source address: code issuance is capped per source
// as well as per recipient, and without this the whole file shares one bucket and
// starts tripping the throttle partway through — a failure that reads like a
// broken auth flow rather than a working control.
let ip = 0;
const nextIp = () => `198.20.${(ip >> 8) & 255}.${ip++ & 255}`;

const A_LINE = {
  code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
};

const COMPLETE = {
  name: "Sam Taylor", phone: "0412 345 678",
  addressLine1: "12 Bridge Street", addressSuburb: "Preston",
  addressState: "VIC", addressPostcode: "3072",
};

/** Build a draft through the API on whatever context is given.
 *
 *  `code` matters when two drafts are going to be MERGED: item codes must be
 *  unique across the surviving project, and two W01s block submission exactly as
 *  they should — which is a duplicate-code test, not a merge test. */
async function buildDraft(ctx: APIRequestContext, title: string, code = "W01"): Promise<string> {
  const saved = await ctx.put("/api/projects/current/lines", { data: { title, items: [{ ...A_LINE, code }] } });
  expect(saved.ok(), `save lines: ${await saved.text()}`).toBeTruthy();
  return (await saved.json()).project.id as string;
}

/** Sign an API context in, creating the account if it is new. */
async function apiSignIn(ctx: APIRequestContext, email: string): Promise<void> {
  const challenge = await ctx.post("/api/auth/challenge", {
    data: { email }, headers: { "X-Forwarded-For": nextIp() },
  });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  const verified = await ctx.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verified.ok(), `verify ${email}`).toBeTruthy();
}

/** Drive the gate's OTP panel in the browser, from email through to the code. */
async function gateSignIn(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /email me a code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  const code = devText?.match(/\d{6}/)?.[0] ?? "";
  expect(code, "the dev OTP is shown on the gate's code step").toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /verify & continue/i }).click();
}

/** Fill the account half of the details form. */
async function fillDetails(page: Page): Promise<void> {
  await page.getByLabel("Full name").fill(COMPLETE.name);
  await page.getByLabel("Phone").fill(COMPLETE.phone);
  await page.getByLabel("Street address").fill(COMPLETE.addressLine1);
  await page.getByLabel("Suburb", { exact: true }).fill(COMPLETE.addressSuburb);
  await page.getByLabel("State").selectOption(COMPLETE.addressState);
  await page.getByLabel("Postcode", { exact: true }).fill(COMPLETE.addressPostcode);
}

/** From the builder to the review screen. */
async function openReview(page: Page): Promise<void> {
  await page.goto("/quote");
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await bar.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
}

// ─── 1. Anonymous build → Submit → inline OTP → STRAIGHT TO THE DETAILS FORM ───
// AC-11, AC-13, AC-6b, AC-15. The load-bearing absence: there is NO separate
// name step inside the gate. Asking for the full name on its own screen and then
// for a name in the details form is one question asked twice, and the owner
// removed it — so this asserts the heading never appears.
test("the gate runs sign-in then details, with no name step between them", async ({ page }) => {
  await buildDraft(page.request, `Gate journey ${stamp}`);
  await openReview(page);

  // Stage 0 — the pre-announcement, and no email field in a stranger's face.
  await expect(page.getByText(/Submitting needs an account/i)).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);

  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();

  // Stage 1 — the gate opens IN PLACE, and the project is still a draft.
  await expect(page.getByRole("heading", { name: "Sign in or create your account" })).toBeVisible();
  await expect(page.getByText(/this creates one/i)).toBeVisible();

  const email = freshEmail("gate");
  await gateSignIn(page, email);

  // Stage 3 — DIRECTLY. No "What's your name?" step, ever, inside the gate.
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What's your name?" })).toHaveCount(0);
  // A fresh account: the name field is present, required and empty.
  await expect(page.getByLabel("Full name")).toHaveValue("");
  // …and nothing has been submitted (A-P1-4: submission stays a deliberate act).
  const current = await (await page.request.get("/api/projects/current")).json();
  expect(current.project.status, "the gate does not auto-submit").toBe("draft");

  await fillDetails(page);
  await page.getByLabel("Delivery suburb").fill("Craigieburn VIC");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();
});

// ─── 2. A returning customer: every value in a live input, one action to submit ─
// AC-14, AC-18. The other load-bearing absence: no collapsed summary, and no
// expand-to-edit control anywhere in the panel. Correcting a stale phone number
// costs a cursor, not a click-to-expand and then a cursor.
test("a returning customer's details are live inputs — no sign-in stage, nothing to expand", async ({ page }) => {
  const email = freshEmail("returning");
  await apiSignIn(page.request, email);
  expect((await page.request.post("/api/auth/profile", { data: COMPLETE })).ok()).toBeTruthy();
  await buildDraft(page.request, `Returning journey ${stamp}`);

  await openReview(page);

  // No sign-in stage at all.
  await expect(page.getByRole("heading", { name: "Sign in or create your account" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  // Every stored value is already IN an editable input.
  await expect(page.getByLabel("Full name")).toHaveValue(COMPLETE.name);
  await expect(page.getByLabel("Phone")).toHaveValue(COMPLETE.phone);
  await expect(page.getByLabel("Street address")).toHaveValue(COMPLETE.addressLine1);
  await expect(page.getByLabel("Suburb", { exact: true })).toHaveValue(COMPLETE.addressSuburb);
  await expect(page.getByLabel("State")).toHaveValue(COMPLETE.addressState);
  await expect(page.getByLabel("Postcode", { exact: true })).toHaveValue(COMPLETE.addressPostcode);
  await expect(page.getByLabel("Full name")).toBeEditable();
  await expect(page.getByLabel("Phone")).toBeEditable();

  // NOTHING to expand: no disclosure control, no "edit details" affordance.
  const panel = page.locator(".quote-panel").filter({ hasText: "Your details" });
  await expect(panel.getByRole("button", { name: /edit/i })).toHaveCount(0);
  await expect(panel.locator("[aria-expanded]")).toHaveCount(0);
  await expect(panel.locator("details, summary")).toHaveCount(0);

  // Email is shown, verified, and NOT an input — an accidental edit is a lockout.
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText("Verified")).toBeVisible();

  // One action submits: the delivery postcode is the only thing left to think
  // about, because it is the only fact that genuinely changes per project.
  //
  // AC-19 — and correcting something on the way through persists it: the gate is
  // the account's EDITING surface as well as its collection surface, so a stale
  // phone number is fixed once, here, and is right on the next quote.
  await page.getByLabel("Phone").fill("1300 123 456");
  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();

  const account = await (await page.request.get("/api/auth/me")).json();
  expect(account.user.phone, "an edit made at the gate is persisted to the account").toBe("1300 123 456");
});

// ─── 3. Missing details are named individually, full name among them ───────────
// AC-17. Untouched fields are not painted red before the customer has touched
// them; the outstanding work is named in a caption above the disabled button.
test("Submit is disabled and every outstanding item is named, full name first", async ({ page }) => {
  const email = freshEmail("missing");
  await apiSignIn(page.request, email);   // an account with nothing but an email
  await buildDraft(page.request, `Missing details ${stamp}`);

  await openReview(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  const submit = page.getByRole("button", { name: /Submit for technical review/ });
  await expect(submit).toBeDisabled();
  const caption = page.getByText(/^Still needed:/);
  await expect(caption).toBeVisible();
  await expect(caption, "full name is the first thing outstanding for a fresh account")
    .toHaveText("Still needed: full name, phone, street address, suburb, state, postcode.");

  // No field is marked invalid before it has been touched.
  await expect(page.getByText("Enter your full name.")).toHaveCount(0);

  // The caption empties as the fields are filled.
  await fillDetails(page);
  await expect(caption).toHaveCount(0);

  await page.getByLabel("Delivery postcode").fill("3072");
  await expect(submit).toBeEnabled();
});

// ─── 4. The phone validator, in the browser ───────────────────────────────────
// AC-20, AC-21. A 1300 number IS a valid contact phone (owner ruling Q2).
test("an invalid phone is refused in the browser; a 1300 number is accepted", async ({ page }) => {
  const email = freshEmail("phone");
  await apiSignIn(page.request, email);
  await buildDraft(page.request, `Phone check ${stamp}`);
  await openReview(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  const phone = page.getByLabel("Phone");
  await phone.fill("12345");
  await phone.blur();
  await expect(page.getByText(/doesn't look like an Australian number/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Submit for technical review/ })).toBeDisabled();

  await phone.fill("1300 123 456");
  await phone.blur();
  await expect(page.getByText(/doesn't look like an Australian number/i)).toHaveCount(0);
  await expect(page.getByText(/^Still needed:/)).not.toContainText("phone");
});

// ─── 5. GST flips on the same screen, with no reload ──────────────────────────
// AC-35. Signing in mid-flow changes identity on a screen that is already showing
// prices — exactly where the GST house rule breaks silently.
test("signing in at the gate flips the totals to ex GST without a reload", async ({ page, playwright }) => {
  const email = freshEmail("gst");
  // The account exists, is complete, and displays ex GST — but THIS browser has
  // no session, so the screen opens on the guest default of inc.
  const setup = await playwright.request.newContext({ baseURL: "http://127.0.0.1:8788" });
  await apiSignIn(setup, email);
  expect((await setup.post("/api/auth/profile", { data: { ...COMPLETE, priceGstMode: "ex" } })).ok()).toBeTruthy();
  await setup.dispose();

  await buildDraft(page.request, `GST flip ${stamp}`);

  let navigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });

  await openReview(page);
  await expect(page.getByText(/inc GST/).first()).toBeVisible();
  const navigationsBefore = navigations;

  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await gateSignIn(page, email);

  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText(/ex GST/).first()).toBeVisible();
  await expect(page.getByText(/inc GST/)).toHaveCount(0);
  await expect(page.getByText(/Now showing prices ex GST/)).toBeVisible();
  expect(navigations, "the flip must not cost a page load").toBe(navigationsBefore);
});

// ─── 6. What must NOT appear ─────────────────────────────────────────────────
// AC-32, AC-41. Absence is the half a diff review cannot see, so it is asserted
// rather than assumed: no referral-code input on any gate panel, and no word
// about trade pricing, discounts or applying for anything.
test("no referral-code field and no trade-pricing copy anywhere on the gate", async ({ page }) => {
  await buildDraft(page.request, `Absence check ${stamp}`);
  await openReview(page);

  const forbiddenCopy = /trade pricing|trade account|discount|% off|apply for|coming soon/i;
  const referralField = page.locator(
    'input[name*="referral" i], input[id*="referral" i], input[placeholder*="referral" i], input[aria-label*="referral" i]',
  );
  // Scoped to THE SURFACE THIS PHASE OWNS. The site's global footer still links
  // to the trade-account mock, and that is Phase 3's to replace — AC-41 binds
  // what this phase adds or changes, and the guard is that no NEW surface says
  // anything about trade pricing or links to that page.
  const gate = page.locator(".quote-page");
  const gateText = () => gate.innerText();

  // Stage 0.
  await expect(referralField).toHaveCount(0);
  expect(await gateText()).not.toMatch(forbiddenCopy);
  await expect(gate.getByRole("link", { name: /trade/i })).toHaveCount(0);
  await expect(gate.locator('a[href*="trade"], button:has-text("trade")')).toHaveCount(0);

  // Stage 1.
  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Sign in or create your account" })).toBeVisible();
  await expect(referralField).toHaveCount(0);
  expect(await gateText()).not.toMatch(forbiddenCopy);

  // Stage 3.
  await gateSignIn(page, freshEmail("absence"));
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(referralField).toHaveCount(0);
  const detailsText = await gateText();
  expect(detailsText).not.toMatch(forbiddenCopy);
  expect(detailsText, "no ABN or business-name field is seeded early either").not.toMatch(/\bABN\b/);
});

// ─── 7. The merge moment ─────────────────────────────────────────────────────
// AC-26, AC-27. Signing in runs the claim-merge, which DELETES the anonymous
// project and folds its lines into the account's existing draft. The customer
// submits what they can see, and no request is ever made against the dead id.
test("an existing draft and an anonymous one merge, and the merged list is shown before submit", async ({ page, playwright }) => {
  const email = freshEmail("merge");

  // The account already has a draft, built in its own context.
  const owner = await playwright.request.newContext({ baseURL: "http://127.0.0.1:8788" });
  await apiSignIn(owner, email);
  expect((await owner.post("/api/auth/profile", { data: COMPLETE })).ok()).toBeTruthy();
  const existingId = await buildDraft(owner, `Merge existing ${stamp}`);

  // The browser is anonymous and builds a second draft.
  const anonId = await buildDraft(page.request, `Merge anonymous ${stamp}`, "D01");
  expect(anonId).not.toBe(existingId);

  const deadIdRequests: string[] = [];
  page.on("request", (r) => { if (r.url().includes(anonId)) deadIdRequests.push(r.url()); });

  await openReview(page);
  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  const before = deadIdRequests.length;
  await gateSignIn(page, email);

  // The merged list is redisplayed BEFORE submission is possible.
  await expect(page.getByText("Your quotes have been combined")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText(/Your quote · 2 items/)).toBeVisible();

  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();

  expect(deadIdRequests.length, "no request may be made against the merge-deleted project id").toBe(before);
  const survivor = await (await owner.get(`/api/projects/${existingId}`)).json();
  expect(survivor.items.length, "both drafts' lines are on the surviving project").toBe(2);
  await owner.dispose();
});

// ─── 8. Delivery is never seeded from the account address ─────────────────────
// AC-42. The owner's ruling: a tradie delivers to their customer's site, not to
// their own office, so a prefill that is wrong nearly every time is worse than a
// blank field — it is wrong AND it stops the field being read.
test("delivery starts blank for an account with a complete address, and never copies it", async ({ page }) => {
  const email = freshEmail("delivery");
  await apiSignIn(page.request, email);
  expect((await page.request.post("/api/auth/profile", { data: COMPLETE })).ok()).toBeTruthy();
  const projectId = await buildDraft(page.request, `Delivery blank ${stamp}`);

  await openReview(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  // The account's own postcode is 3072. If the delivery field ever copied it, a
  // blank would be indistinguishable from a copy — so both are asserted.
  await expect(page.getByLabel("Postcode", { exact: true })).toHaveValue("3072");
  await expect(page.getByLabel("Delivery suburb")).toHaveValue("");
  await expect(page.getByLabel("Delivery postcode")).toHaveValue("");
  // …and not as a placeholder-shaped hint of the account address either.
  await expect(page.getByLabel("Delivery suburb")).not.toHaveAttribute("value", COMPLETE.addressSuburb);
  // Browser autofill cannot reintroduce it: neither delivery field opts in.
  await expect(page.getByLabel("Delivery suburb")).not.toHaveAttribute("autocomplete", /.+/);
  await expect(page.getByLabel("Delivery postcode")).not.toHaveAttribute("autocomplete", /.+/);

  // An entered destination persists to the PROJECT, and the account address is
  // untouched — the second half of AC-42, which was correct throughout.
  await page.getByLabel("Delivery suburb").fill("Craigieburn VIC");
  await page.getByLabel("Delivery postcode").fill("3064");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();

  const account = await (await page.request.get("/api/auth/me")).json();
  expect(account.user.addressSuburb, "the account address is not overwritten by a delivery").toBe(COMPLETE.addressSuburb);
  expect(account.user.addressPostcode).toBe(COMPLETE.addressPostcode);
  const project = await (await page.request.get(`/api/projects/${projectId}`)).json();
  expect(project.delivery.postcode, "the project stores the destination the customer entered").toBe("3064");
});

// ─── 9. The surviving NameStep, at /login ────────────────────────────────────
// AC-6a. The gate never renders this component; /login and the account shell are
// the two paths where no details form follows, so the name is asked exactly once
// — here, and mandatorily.
test("signing in at /login with a nameless account demands a name before the dashboard", async ({ page, playwright }) => {
  const email = freshEmail("namestep");
  // The account is created in its own context so this browser arrives signed out.
  const setup = await playwright.request.newContext({ baseURL: "http://127.0.0.1:8788" });
  await apiSignIn(setup, email);   // creates the account with name = NULL
  await setup.dispose();

  await page.goto("/login");
  await page.getByPlaceholder(/your@email\.com/).first().fill(email);
  await page.getByRole("button", { name: /email me a code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  await page.getByPlaceholder("••••••").fill(devText?.match(/\d{6}/)?.[0] ?? "");
  await page.getByRole("button", { name: /verify & continue/i }).click();

  // The name step, not the dashboard.
  await expect(page.getByRole("heading", { name: "What's your name?" })).toBeVisible();
  // The greeting is "Welcome, X" on a first visit and "Good morning, X" once
  // there is work to come back to — the dashboard is unreachable either way.
  const greeting = /^(Welcome|Good (morning|afternoon|evening)), /;
  await expect(page.getByRole("heading", { name: greeting })).toHaveCount(0);
  // Mandatory: no skip, no dismissal, no "later".
  await expect(page.getByRole("button", { name: /skip|later|not now/i })).toHaveCount(0);

  await page.getByLabel("Full name").fill("Sam Taylor");
  await page.getByRole("button", { name: /save and continue/i }).click();
  await expect(page.getByRole("heading", { name: /^(Welcome|Good (morning|afternoon|evening)), Sam/ })).toBeVisible();

  // AC-5/AC-7 in the browser: the email local part was never written as a name.
  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.user.name).toBe("Sam Taylor");
  expect(me.user.name).not.toContain("reg-web-");
});

// ─── AC-12: the Turnstile widget, on its own keyed server ─────────────────────
// DEVIATION D-2, approved. This block boots its OWN wrangler dev, serving an SPA
// built with Cloudflare's always-passes Turnstile test key. It is isolated on
// purpose: baking that key into the shared harness would make every UI sign-in in
// the suite — including the two frozen specs — depend on challenges.cloudflare.com
// being reachable. The network dependency is confined to exactly this block, and
// it is the named residual of the deviation.
test.describe("AC-12 — the Turnstile gate on the sign-in step", () => {
  const TEST_SITE_KEY = "1x00000000000000000000AA";       // Cloudflare: always passes
  const TEST_SECRET = "1x0000000000000000000000000000000AA";
  let server: ChildProcess | undefined;
  let base = "";
  let runDir = "";

  test.beforeAll(async () => {
    // A vite build, a migration run and a seed, before anything is asserted. The
    // suite's 45s default is a per-TEST budget and this is a whole second harness.
    test.setTimeout(600_000);
    runDir = await mkdtemp(join(projectRoot, ".codex-tmp", "web-turnstile-"));
    const assets = join(runDir, "assets");
    const state = join(runDir, "state");
    const env = { WRANGLER_LOG_PATH: join(runDir, "wrangler.log"), XDG_CONFIG_HOME: join(runDir, "config") };
    await runNode([viteCli, "build", "--outDir", assets, "--emptyOutDir"], { ...env, VITE_TURNSTILE_SITE_KEY: TEST_SITE_KEY });
    await runNode([wranglerCli, "d1", "migrations", "apply", "apertly-db", "--local", "--persist-to", state], env);
    await runNode([wranglerCli, "d1", "execute", "apertly-db", "--local", "--persist-to", state, "--file", "scripts/db/seed.sql"], env);

    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [
      wranglerCli, "dev", "--local", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--assets", assets, "--log-level", "warn",
      "--var", "APP_ENV:development", "--var", "ACCESS_TEAM_DOMAIN:", "--var", "ACCESS_AUD:",
      "--var", "SANITY_PROJECT_ID:", "--var", "AI_EXTRACTION_MODE:manual",
      "--var", `TURNSTILE_SECRET:${TEST_SECRET}`,
    ], { cwd: projectRoot, env: { ...process.env, ...env }, stdio: "ignore", windowsHide: true });
    await waitFor(`${base}/api/health`);
  });

  test.afterAll(async () => {
    if (server?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true });
      else server.kill();
    }
    await rm(runDir, { recursive: true, force: true, maxRetries: 3 });
  });

  test("the widget renders in the gate and Send-code waits for its token", async ({ page }) => {
    const saved = await page.request.put(`${base}/api/projects/current/lines`, {
      data: { title: `Turnstile ${stamp}`, items: [A_LINE] },
    });
    expect(saved.ok(), `save lines on the keyed server: ${await saved.text()}`).toBeTruthy();

    await page.goto(`${base}/quote`);
    const bar = page.getByRole("region", { name: "Project summary and actions" });
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await bar.getByRole("button", { name: /Submit for technical review/ }).click();
    await page.getByLabel("Delivery postcode").fill("3072");
    await page.getByRole("button", { name: /Submit for technical review/ }).click();

    await expect(page.getByRole("heading", { name: "Sign in or create your account" })).toBeVisible();
    // The widget SLOT exists — and never an empty bordered box where it would be.
    await expect(page.getByTestId("turnstile-slot")).toBeAttached();

    const send = page.getByRole("button", { name: /email me a code/i });
    await page.getByLabel("Email").fill(freshEmail("turnstile"));
    // Disabled until a token exists, and saying so rather than looking broken.
    await expect(page.getByText("Complete the check above to continue.")).toBeVisible();
    await expect(send).toBeDisabled();

    // The test key passes on its own; the button opens once its callback fires.
    await expect(send).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByText("Complete the check above to continue.")).toHaveCount(0);
  });
});
