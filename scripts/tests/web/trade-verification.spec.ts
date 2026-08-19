// ═══════════════════════════════════════════════════════════════════════════════
// USER REGISTRATION — Phase 2: trade verification, the browser half.
//
// WHY THIS FILE IS NOT OPTIONAL. `scripts/tests/trade-verification.test.mjs`
// proves the ENGINE: the triple, the queue, the grant arithmetic, the ops
// authorization matrix. It cannot see one thing a person looks at. Phase 1's
// handover records two MAJOR referral findings that 104 green node tests missed
// because the server-served HTML was byte-identical in both states — a
// program-Off switch that replaced the whole landing page, and payment holds the
// API served and nothing rendered. Everything below is a claim about what a
// person SEES.
//
// Design §11.2 (journeys 1-7). Spec AC-P2-1…19, 47-49, 54; AB-P2-16.
//
// THE ABR IS NEVER REACHED. `scripts/tests/web-server.mjs` boots
// `scripts/tests/abr-stub.mjs` and points the Worker at it through ABR_BASE_URL.
// The stub's /__hits endpoint is an ASSERTION SURFACE, not a debugging aid:
// "this journey made no ABR call" is an acceptance criterion in two places
// (AC-P2-7 a bad checksum, AC-P2-17 the submit critical path), and reading the
// counter is the difference between proving it and inferring it from a body.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page } from "@playwright/test";

/** Checksum-VALID ABNs the stub answers for. Mirrors abr-stub.mjs's fixtures —
 *  duplicated as literals rather than imported because this file is compiled by
 *  Playwright's TS pipeline and the stub is a plain .mjs harness module. */
/** A whole CONSISTENT business: the ABN, the name the register holds for it, and
 *  a domain that satisfies criterion 3. Mirrors `spareBusiness(n)` in
 *  abr-stub.mjs — duplicated as literals rather than imported because this file
 *  goes through Playwright's TS pipeline and the stub is a plain .mjs harness.
 *
 *  ALL THREE PARTS MATTER. The auto-pass triple is ABN active AND name matched
 *  AND email domain plausible, so a journey that wants a verified outcome has to
 *  sign in as somebody at that business — an @example.com applicant queues, and
 *  correctly so. An auto-pass also CONSUMES its ABN for the rest of the run (the
 *  next applicant on that number is a duplicate), so each journey takes its own. */
const SPARE = (index: number) => ({
  abn: ["81000008768", "81000020276", "81000043566", "81000045073", "81000066856"][index],
  businessName: `Spare ${index} Joinery Pty Ltd`,
  domain: `spare${index}joinery.com.au`,
});

const stamp = Date.now().toString(36);
let seq = 0;
const freshEmail = (label: string) => `trade-web-${label}-${stamp}-${seq++}@example.com`;
/** Somebody AT the business — the only way criterion 3 can pass. */
const emailAt = (domain: string) => `sam-${stamp}-${seq++}@${domain}`;

// Code issuance is capped per SOURCE as well as per recipient. Without a fresh
// address per sign-in the whole file shares one bucket and starts tripping the
// throttle partway through — a failure that reads like a broken auth flow rather
// than a working control (handover §4.2).
let ip = 0;
const nextIp = () => `198.51.${(ip >> 8) & 255}.${ip++ & 255}`;

/** Drive an OTP panel in the browser, from email through to the code. Shared by
 *  the trade page and the gate because it IS the same component (§18.2.1). */
async function otpSignIn(page: Page, email: string): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /email me a code/i }).click();
  const devText = await page.getByText(/Dev mode/i).textContent();
  const code = devText?.match(/\d{6}/)?.[0] ?? "";
  expect(code, "the dev OTP is shown on the code step").toMatch(/^\d{6}$/);
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: /verify & continue/i }).click();
}

/** The percentage sweep (AC-P2-47). A TRADE surface may never carry a `%`, a
 *  spelled-out rate, or the comparative framing the owner retired: "trade
 *  pricing" is the NAME of the thing, never a deduction (§18.0 rule 1).
 *
 *  SCOPED TO THE TRADE SURFACE ON PURPOSE, and this is the subtle part. A
 *  page-wide sweep looks stricter and is actually wrong: `/trade-account` also
 *  carries the REFERRAL placement, whose "2.5% off / 1% by bank transfer" is a
 *  different programme's own approved copy, governed by the referral spec
 *  (AC-70/AC-75) and asserted in referral.spec.ts. Sweeping the whole body would
 *  make this file fail on copy it does not own, and the obvious "fix" — deleting
 *  the referral figures — would break the surface that is allowed to state them.
 *  AC-P2-47 is about the TRADE rate never being derivable, so the trade card is
 *  the surface it governs. */
async function expectNoPercentage(page: Page, where: string): Promise<void> {
  const card = page.getByTestId("trade-application-card");
  await expect(card, `${where}: the trade card is on screen to be swept`).toBeVisible();
  const body = (await card.innerText()).replace(/\s+/g, " ");
  expect(body, `${where}: no % symbol on a customer surface`).not.toMatch(/\d\s*%/);
  expect(body, `${where}: no spelled-out percentage`).not.toMatch(/\d+(\.\d+)?\s*per\s?cent/i);
  expect(body, `${where}: no comparative framing`).not.toMatch(/\b(better|cheaper|lower|you save|save on)\b/i);
}

/** No builder/tradie control exists on ANY surface (P2-D5, §18.0 rule 4). */
async function expectNoTradeLabelControl(page: Page, where: string): Promise<void> {
  const body = await page.locator("body").innerText();
  expect(body, `${where}: the builder/tradie question is not asked`)
    .not.toMatch(/\bbuilder\b\s*\/?\s*\btradie\b|are you a builder/i);
  await expect(page.getByLabel(/builder|tradie/i), `${where}: no label control`).toHaveCount(0);
}

// ─── 1. Cold /trade-account → auto-pass → Active ──────────────────────────────
// AC-P2-1/2/4/5. The load-bearing claims: the page hosts the ORDINARY signup
// (one flow, §18.2.1), the optional group is already revealed here and only here
// (P2-UX-10), no field discards input the way the Phase-1 mock form did, and the
// outcome panel says Active without naming a percentage.
test("a cold visitor signs up on /trade-account with an ABN and lands verified", async ({ page }) => {
  const business = SPARE(0);
  const email = emailAt(business.domain);
  await page.goto("/trade-account");

  await expect(page.getByLabel("Business name")).toBeVisible();
  await expect(page.getByLabel("ABN")).toBeVisible();
  await expectNoTradeLabelControl(page, "/trade-account");

  await page.getByLabel("Business name").fill(business.businessName);
  await page.getByLabel("ABN").fill(business.abn);
  await otpSignIn(page, email);

  // The fork happens AFTER the flow: the values were held in browser state and
  // posted once the session existed (AC-P2-3 — no unauthenticated endpoint ever
  // accepted an ABN).
  await expect(page.getByText(/trade pricing applies to your account/i)).toBeVisible({ timeout: 15_000 });
  await expectNoPercentage(page, "/trade-account after auto-pass");
});

// ─── 2. A gmail sole trader queues, and the account still works ───────────────
// AC-P2-6/23 + §18.0 rules 2 and 3. The load-bearing ABSENCES: no timeframe is
// promised anywhere, and the customer is never told WHICH criterion failed. Two
// applications queued for different reasons must produce identical screens, so
// "your email domain didn't match" can never appear — the person would then know
// the ABN and the name were fine, which is exactly the oracle P2-A3 forbids.
test("a gmail applicant is put under review, with no reason and no timeframe", async ({ page }) => {
  const business = SPARE(1);
  // Everything about this application is good EXCEPT criterion 3.
  const email = `sam-${stamp}-${seq++}@gmail.com`;

  await page.goto("/trade-account");
  await page.getByLabel("Business name").fill(business.businessName);
  await page.getByLabel("ABN").fill(business.abn);
  await otpSignIn(page, email);

  const card = page.getByTestId("trade-application-card");
  await expect(card.getByText(/we're checking your abn/i)).toBeVisible({ timeout: 15_000 });

  const said = (await card.innerText()).replace(/\s+/g, " ");
  // No turnaround, in any spelling — "we'll be in touch" is the whole promise (Q2).
  expect(said, "no turnaround is promised")
    .not.toMatch(/business day|within \d|\d+ hours|usually takes|by tomorrow|shortly/i);
  // No criterion is named, and no register verdict is quoted (P2-A3).
  expect(said, "the failing criterion is never named")
    .not.toMatch(/gmail|free (e-?mail|mail)|domain|didn't match|mismatch|not active|cancelled/i);
  await expectNoPercentage(page, "/trade-account under review");

  // The account WORKS meanwhile: a queued application is not a locked account.
  const me = await page.request.get("/api/auth/me");
  const body = await me.json();
  expect(body.authenticated, "a queued applicant is signed in and usable").toBe(true);
  expect(body.trade.pending?.abn, "the pending application holds the submitted ABN").toBe(business.abn);
  expect(body.trade.verified, "queued is not verified").toBe(false);
});

/** The stub the web harness booted, same default the harness uses. Its hit log
 *  is an ASSERTION SURFACE: "this journey made no ABR call" is an acceptance
 *  criterion, and reading the counter proves it rather than inferring it. */
const ABR_BASE = process.env.ABR_BASE_URL ?? "http://127.0.0.1:8789";
async function abrCallsFor(abn: string): Promise<number> {
  const res = await fetch(`${ABR_BASE}/__hits`);
  expect(res.ok, `the ABR stub answers on ${ABR_BASE} — the web harness must boot it`).toBeTruthy();
  return ((await res.json()) as { abn: string }[]).filter((h) => h.abn === abn).length;
}

// ─── 3. A checksum-invalid ABN never reaches the register ─────────────────────
// AC-P2-7. This is the assertion the node suite cannot make about a CLIENT field
// check: the browser refuses a transposed digit with zero round trips, so no
// application row is created and the register is never asked. A field error is
// exactly like a malformed phone — nothing to reject, because nothing was made.
test("a checksum-invalid ABN is refused in the browser, costing the register nothing", async ({ page }) => {
  const bad = "12345678901";           // checksum-invalid by construction
  const before = await abrCallsFor(bad);
  const email = freshEmail("badsum");

  await page.goto("/trade-account");
  await page.getByLabel("Business name").fill("Nowhere Joinery");
  await page.getByLabel("ABN").fill(bad);

  // Refused before any network call — the message is on screen while still anonymous.
  const card = page.getByTestId("trade-application-card");
  await expect(card.getByText(/that abn doesn't look right/i)).toBeVisible();

  await otpSignIn(page, email);
  // Wait for the SIGNED-IN card before reading the session. Without this the
  // assertions below race the verify round trip and read an anonymous /me — a
  // failure that looks like a broken sign-in rather than a slow one.
  await expect(card.getByRole("button", { name: /check my abn/i }))
    .toBeVisible({ timeout: 15_000 });

  expect(await abrCallsFor(bad) - before,
    "a failed checksum costs the register nothing (AC-P2-7)").toBe(0);

  // Signed in, and NO application exists: the ABN was simply never sent. The
  // person has an ordinary private account, exactly as Phase 1 shipped it.
  const body = await (await page.request.get("/api/auth/me")).json();
  expect(body.authenticated, "the sign-in still succeeded — the ABN was optional").toBe(true);
  expect(body.trade.verified, "no grant from a malformed ABN").toBe(false);
  expect(body.trade.pending, "no pending application from a malformed ABN").toBeNull();
  expect(body.trade.history, "and nothing in the ledger at all").toEqual([]);
});

// ─── 4. Door (b) — the account page is ABN's other home ──────────────────────
// AC-P2-9/10/11. Door (b) runs the SAME verification as door (a) because it is
// literally the same component, which is what makes "no behavioural difference
// attributable to the entry point" structural rather than a coincidence.
//
// The load-bearing change: the ABN stops being a free-text profile input once
// the account is verified. That is what closes the payout-path ABN swap at the
// UI (P2-A4) — the server refuses it too, but a field that looks editable and
// then refuses the save is a worse answer than a field that is not offered.
test("the account page applies for trade pricing, and a verified ABN is not free text", async ({ page }) => {
  const business = SPARE(2);
  const email = emailAt(business.domain);

  // Sign in cold through the trade page WITHOUT an ABN — an ordinary private
  // account, exactly as Phase 1 shipped it.
  await page.goto("/trade-account");
  await otpSignIn(page, email);
  // Anchor on a SIGNED-IN affordance. The card itself renders in both states, so
  // waiting for it proves nothing and /account then bounces to /login — a
  // failure that reads like a missing card rather than an unfinished sign-in.
  await expect(page.getByTestId("trade-application-card").getByRole("button", { name: /check my abn/i }))
    .toBeVisible({ timeout: 15_000 });

  // SETUP, not an assertion: a brand-new account has no name, and Phase 1's name
  // interstitial takes over every ACCOUNT route until one is given — so a cold
  // trade signup reaches "What's your name?" before it ever reaches /account.
  // That is correct Phase-1 behaviour (registration.spec.ts owns it) and it does
  // NOT block the trade page, which is why journeys 1-3 render their outcome
  // panels. Naming the account here gets this test to the surface it is about.
  const named = await page.request.post("/api/auth/profile", { data: { name: "Sam Taylor" } });
  expect(named.ok(), `name the account: ${await named.text()}`).toBeTruthy();

  await page.goto("/account");
  const card = page.getByTestId("trade-application-card");
  await expect(card, "the account page carries the trade affordance (AC-P2-9)").toBeVisible();
  await expectNoPercentage(page, "/account before applying");
  await expectNoTradeLabelControl(page, "/account");

  await card.getByLabel("Business name").fill(business.businessName);
  await card.getByLabel("ABN").fill(business.abn);
  await card.getByRole("button", { name: /check my abn/i }).click();

  await expect(card.getByText(/trade pricing applies to your account/i)).toBeVisible({ timeout: 15_000 });
  await expectNoPercentage(page, "/account when verified");

  // Verified: the ABN is DISPLAYED, never offered as a free-text profile field.
  await page.reload();
  const verifiedCard = page.getByTestId("trade-application-card");
  await expect(verifiedCard.getByText(/trade pricing applies to your account/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "ABN" }),
    "a verified account is not given a free-text ABN box on the profile (AC-P2-11)").toHaveCount(0);
});
