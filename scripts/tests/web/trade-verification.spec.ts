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

/** Sign an API context in, creating the account if it is new. Setup only —
 *  journeys that are ABOUT the sign-in drive it through the browser instead. */
async function apiSignIn(ctx: import("@playwright/test").APIRequestContext, email: string): Promise<void> {
  const challenge = await ctx.post("/api/auth/challenge", {
    data: { email }, headers: { "X-Forwarded-For": nextIp() },
  });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  const verified = await ctx.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verified.ok(), `verify ${email}`).toBeTruthy();
}

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
  await expect(card.getByText(/we're checking the details you sent/i)).toBeVisible({ timeout: 15_000 });

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
// AC-P2-7 + §18.2.3. Two claims, and only the browser can make either.
//
// FIRST: the checksum is a CLIENT gate, so a transposed digit costs the register
// nothing — proved from the stub's hit counter, not inferred from a body.
//
// SECOND: it BLOCKS the step rather than being advisory. This assertion was
// originally written the other way round, against what the code did rather than
// what the owner approved at the mock gate, and the review caught it. Clearing
// the field is the documented escape — the group is optional and stays optional.
test("a checksum-invalid ABN is refused in the browser, costing the register nothing", async ({ page }) => {
  const bad = "12345678901";           // checksum-invalid by construction
  const before = await abrCallsFor(bad);
  const email = freshEmail("badsum");

  await page.goto("/trade-account");
  const card = page.getByTestId("trade-application-card");
  await card.getByLabel("Business name").fill("Nowhere Joinery");
  await card.getByLabel("ABN").fill(bad);

  // Refused before any network call, and the step will not be left.
  await expect(card.getByText(/that abn doesn't look right/i)).toBeVisible();
  await expect(card.getByRole("button", { name: /email me a code/i })).toBeDisabled();

  // "…or clear the field to continue without it."
  await card.getByLabel("ABN").fill("");
  await otpSignIn(page, email);
  await expect(card.getByRole("button", { name: /apply for trade pricing/i }))
    .toBeVisible({ timeout: 15_000 });

  expect(await abrCallsFor(bad) - before,
    "a failed checksum costs the register nothing (AC-P2-7)").toBe(0);

  // Signed in, with NO application: the ABN was never sent. An ordinary private
  // account, exactly as Phase 1 shipped it.
  const body = await (await page.request.get("/api/auth/me")).json();
  expect(body.authenticated, "the sign-in still succeeds once the field is cleared").toBe(true);
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
  await expect(page.getByTestId("trade-application-card").getByRole("button", { name: /apply for trade pricing/i }))
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
  await card.getByRole("button", { name: /apply for trade pricing/i }).click();

  await expect(card.getByText(/trade pricing applies to your account/i)).toBeVisible({ timeout: 15_000 });
  await expectNoPercentage(page, "/account when verified");

  // Verified: the ABN is DISPLAYED, never offered as a free-text profile field.
  await page.reload();
  const verifiedCard = page.getByTestId("trade-application-card");
  await expect(verifiedCard.getByText(/trade pricing applies to your account/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("textbox", { name: "ABN" }),
    "a verified account is not given a free-text ABN box on the profile (AC-P2-11)").toHaveCount(0);
});

// ─── 5. AC-P2-8 — the business name is prefilled from the account ─────────────
// F-1 from the tester's FAIL verdict. The card's `useState` initializer reads
// `user.company`, but on `/trade-account` it runs while App is still resolving
// the session, so `user` is null and the initial value is "" forever. Door (b)
// hid it: the account page only renders once `user` exists.
//
// The fix must NOT fight typing — a cold visitor who types a business name
// before signing in keeps what they typed.
test("the business name prefills from the account on the trade page (AC-P2-8)", async ({ page }) => {
  const business = SPARE(3);
  const email = emailAt(business.domain);
  await apiSignIn(page.request, email);

  // `company` left the profile PATCH in the UI, but the server still accepts it
  // (account.ts allowlist) — this is setup, not the behaviour under test.
  const saved = await page.request.post("/api/auth/profile", {
    data: { name: "Sam Taylor", company: business.businessName },
  });
  expect(saved.ok(), `seed company: ${await saved.text()}`).toBeTruthy();

  await page.goto("/trade-account");
  const card = page.getByTestId("trade-application-card");
  await expect(card.getByRole("button", { name: /apply for trade pricing/i })).toBeVisible({ timeout: 15_000 });

  await expect(card.getByLabel("Business name"),
    "AC-P2-8: the account's business name is already there").toHaveValue(business.businessName);
});

// ─── 6. AC-P2-48 — the owner's words, verbatim, on the surfaces that carry them ─
// F-2 and F-3/F-5 from the review round. Spec §7.2 records five strings as the
// OWNER'S WORDS, which the ux/ui stage may place but not rewrite. Three of them
// belong to this slice's surfaces and none of them shipped: the trade page kept
// its Phase-1 hero and benefit list, and the account card's invitation was
// paraphrased away.
//
// "You may qualify" is the load-bearing part of the account-card string and is
// asserted verbatim: the reader may be a private customer who holds an ABN and
// does not know they qualify, and NOTHING may promise an outcome before
// verification (AC-P2-9). A rewrite that promises trade pricing is the failure
// this assertion exists to catch, not a stylistic nitpick.
const APPROVED = {
  hero: "Trade accounts get trade pricing, priority review, saved details, and a name to call.",
  benefitTitle: "Trade pricing, everywhere",
  benefitBody: "It applies while you configure — not just on the quote we send back.",
  accountCard: "Have an ABN? You may qualify for trade pricing. Add it and we'll check it against the Australian Business Register.",
};

test("the owner-approved trade strings appear verbatim on their surfaces (AC-P2-48)", async ({ page }) => {
  await page.goto("/trade-account");
  // Wait for the app to render — `goto` resolves on load, before React paints,
  // and body.innerText is "" until then.
  await expect(page.getByTestId("trade-application-card")).toBeVisible({ timeout: 15_000 });
  const marketing = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  expect(marketing, "spec §7.2 trade-page hero").toContain(APPROVED.hero);
  expect(marketing, "spec §7.2 trade-page benefit title").toContain(APPROVED.benefitTitle);
  expect(marketing, "spec §7.2 trade-page benefit body").toContain(APPROVED.benefitBody);

  // The account card, to a PRIVATE user — no grant, no pending application.
  const email = freshEmail("approved-copy");
  await apiSignIn(page.request, email);
  const named = await page.request.post("/api/auth/profile", { data: { name: "Sam Taylor" } });
  expect(named.ok(), await named.text()).toBeTruthy();

  await page.goto("/account");
  const card = page.getByTestId("trade-application-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  expect((await card.innerText()).replace(/\s+/g, " "), "spec §7.2 account-card invitation")
    .toContain(APPROVED.accountCard);
});

// ─── 7. §18.2.3 — a malformed ABN blocks the step it is on ────────────────────
// Architect F1. Journey 3 above asserts what the code DID: sign-in proceeded and
// the bad ABN was silently skipped. The owner approved the opposite at the mock
// gate — the field blocks the step, exactly as it blocks Submit at the gate, and
// clearing it always releases it.
//
// The difference matters because the failure is silent: values are held, so
// nothing is lost, but a person who does not scroll past the button believes
// they applied and finds out only when no email arrives.
test("a malformed ABN blocks the sign-in step until it is fixed or cleared", async ({ page }) => {
  await page.goto("/trade-account");
  const card = page.getByTestId("trade-application-card");
  const send = card.getByRole("button", { name: /email me a code/i });

  await page.getByLabel("Email").fill(freshEmail("blocked"));
  await expect(send, "a valid email alone is enough to send").toBeEnabled();

  await card.getByLabel("ABN").fill("12345678901");           // checksum-invalid
  await expect(send, "§18.2.3: a malformed ABN blocks this step").toBeDisabled();
  await expect(card.getByText(
    "That ABN doesn't look right. Check the 11 digits, or clear the field to continue without it.",
  )).toBeVisible();

  // Clearing ALWAYS releases it — the group is optional and stays optional.
  await card.getByLabel("ABN").fill("");
  await expect(send, "clearing the field releases the step").toBeEnabled();
});
