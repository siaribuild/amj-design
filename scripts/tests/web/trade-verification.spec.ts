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
  abn: ["81000008768", "81000020276", "81000043566", "81000045073", "81000066856",
        "81000068363", "81000120149", "81000122752"][index],
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

// ── shared: build a draft and open the review screen ──────────────────────────
const A_LINE = {
  code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
  width: "1200", height: "900", qty: 1,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
};

async function openReview(page: Page): Promise<void> {
  const saved = await page.request.put("/api/projects/current/lines", {
    data: { title: `Trade gate ${stamp}-${seq++}`, items: [A_LINE] },
  });
  expect(saved.ok(), `save lines: ${await saved.text()}`).toBeTruthy();

  await page.goto("/quote");
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await bar.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
}

/** The gate's details stage, with every required field filled. */
async function fillDetails(page: Page): Promise<void> {
  await page.getByLabel("Full name").fill("Sam Taylor");
  await page.getByLabel("Phone").fill("0412 345 678");
  await page.getByLabel("Street address").fill("12 Bridge Street");
  await page.getByLabel("Suburb", { exact: true }).fill("Preston");
  await page.getByLabel("State").selectOption("VIC");
  await page.getByLabel("Postcode", { exact: true }).fill("3072");
  await page.getByLabel(/delivery postcode/i).first().fill("3000");
}

// ─── 8. Door (c) — the optional ABN at the submit gate ────────────────────────
// AC-P2-14/15/16 and the owner's mock-gate ruling P2-UX-2: the group sits LAST,
// after delivery, because everything above it is required and putting the only
// optional thing on the screen between two demands reads as a third demand.
//
// The load-bearing asymmetry: an EMPTY ABN must contribute NOTHING. Phase 1's
// "one field, one press" promise is that a disabled Submit always names what is
// outstanding, and an optional field that silently blocked it would break that
// promise for every customer who never wanted trade pricing at all.
test("the gate offers an optional ABN last, and only an entered one can hold Submit back", async ({ page }) => {
  const email = freshEmail("gate");
  await apiSignIn(page.request, email);
  await openReview(page);
  await fillDetails(page);

  const abn = page.getByLabel("ABN (optional)");
  await expect(abn, "the gate offers the optional ABN group").toBeVisible();

  // §7.2 verbatim — the fourth AC-P2-48 advertising surface.
  expect((await page.locator("body").innerText()).replace(/\s+/g, " "))
    .toContain("Got an ABN? Add it and we'll check whether you qualify for trade pricing. It won't hold up this submission.");

  // The group sits AFTER delivery in the DOM (P2-UX-2).
  const order = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? "");
    return {
      abn: labels.findIndex((t) => /^ABN \(optional\)/.test(t.trim())),
      delivery: labels.findIndex((t) => /delivery postcode/i.test(t)),
    };
  });
  expect(order.abn, "the ABN field is in the details stage").toBeGreaterThanOrEqual(0);
  expect(order.abn, "the optional business group sits after delivery (P2-UX-2)")
    .toBeGreaterThan(order.delivery);

  // EMPTY contributes nothing — Phase 1 behaviour untouched (AC-P2-14).
  const submit = page.getByRole("button", { name: /^Submit/ });
  await expect(submit, "an empty optional field never blocks Submit").toBeEnabled();

  // Malformed disables Submit and names itself in the caption (AC-P2-16).
  await abn.fill("12345678901");
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/still needed/i)).toContainText("ABN");
  await expect(page.getByText(
    "That ABN doesn't look right. Check the 11 digits, or clear the field to submit without it.",
  )).toBeVisible();

  // A valid ABN with no business name names THAT instead (AC-P2-15).
  await abn.fill("51000000680");
  await expect(page.getByLabel("Business name"), "the paired field appears with an ABN").toBeVisible();
  await expect(submit).toBeDisabled();
  await expect(page.getByText(/still needed/i)).toContainText("business name");

  // Clearing restores Phase-1 behaviour instantly, with no round trip.
  await abn.fill("");
  await expect(submit, "clearing the field releases Submit").toBeEnabled();
  await expect(page.getByLabel("Business name"), "and the paired field goes away").toHaveCount(0);
});

// ─── 9. Enter obeys the same gate the button does ────────────────────────────
// Found by the Codex stop-gate review, not by a person or a suite.
//
// §16.9 gives this screen a second way to submit: Enter submits when the form is
// valid, and otherwise moves to the first thing still outstanding. Door (c)
// added a new way for the form to be invalid and taught only the BUTTON about
// it, so Enter sailed past a malformed ABN and submitted — the exact input the
// button was refusing an inch away.
//
// A keyboard user would have hit this every time, and the quote would have
// submitted with an ABN that never got checked.
test("Enter cannot submit past a malformed ABN either", async ({ page }) => {
  const email = freshEmail("enter");
  await apiSignIn(page.request, email);
  await openReview(page);
  await fillDetails(page);

  const abn = page.getByLabel("ABN (optional)");
  await abn.fill("12345678901");                 // checksum-invalid
  await expect(page.getByRole("button", { name: /^Submit/ })).toBeDisabled();

  // Enter from a required field, with everything else complete.
  await page.getByLabel("Full name").press("Enter");

  // Still on the review screen — nothing was submitted.
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /thanks|submitted/i })).toHaveCount(0);

  // §16.9's other half: Enter moves to the first thing outstanding, and with
  // everything else filled that is the ABN.
  await expect(abn, "Enter puts the cursor on the gap it refused to skip").toBeFocused();

  // And once the offending value is cleared, Enter works again.
  await abn.fill("");
  await expect(page.getByRole("button", { name: /^Submit/ })).toBeEnabled();
});

// ─── 10. The confirmation denies the SLA it sits under (AC-P2-18) ────────────
// Placement here is load-bearing, not cosmetic. Phase 1's confirmation carries
// "Expect a response within 1-2 business days" — the QUOTE-REVIEW turnaround. An
// acknowledgement of the ABN check sitting near it would let a fast reader
// attach that number to the ABN check: a timeframe promised by adjacency, which
// the owner's ruling forbids as absolutely as one promised in words.
//
// Two defences, both required, and this test asserts both: the block sits after
// the actions behind a rule, AND its copy explicitly denies the number rather
// than merely avoiding it. It must also never promise a repricing (P2-D4).
test("the submit-gate acknowledgement denies the quote SLA and promises no timeframe", async ({ page }) => {
  const business = SPARE(4);
  const email = emailAt(business.domain);
  await apiSignIn(page.request, email);
  await openReview(page);
  await fillDetails(page);

  await page.getByLabel("ABN (optional)").fill(business.abn);
  await page.getByLabel("Business name").fill(business.businessName);
  await page.getByRole("button", { name: /^Submit/ }).click();

  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible({ timeout: 30_000 });

  const ack = page.getByTestId("trade-ack");
  await expect(ack, "an application was created, so the block renders").toBeVisible();
  const said = (await ack.innerText()).replace(/\s+/g, " ");

  expect(said, "it DENIES the response time above rather than avoiding it")
    .toContain("The response time above is for your quote review");
  expect(said, "no timeframe of its own").toMatch(/no timeframe attached/i);
  expect(said, "and the quote is not waiting on it").toMatch(/isn't waiting on it/i);

  // P2-D4: no repricing is ever promised.
  expect(said, "no repricing promise").not.toMatch(/update your quote|reprice|re-price|adjust your quote/i);
  // AC-P2-47 holds here too.
  expect(said, "no percentage").not.toMatch(/\d\s*%|\d+\s*per\s?cent/i);

  // The block sits BELOW the actions — a fast reader must reach the buttons
  // before the ABN copy, never the other way round.
  const order = await page.evaluate(() => {
    const ack = document.querySelector('[data-testid="trade-ack"]');
    const buttons = Array.from(document.querySelectorAll("button"));
    const back = buttons.find((b) => /back to home/i.test(b.textContent ?? ""));
    if (!ack || !back) return null;
    // 2 === DOCUMENT_POSITION_PRECEDING: the button precedes the block.
    return (ack.compareDocumentPosition(back) & 2) !== 0;
  });
  expect(order, "the acknowledgement sits after the action buttons").toBe(true);
});

// ─── 11. AC-P2-19 — a verified account is never asked again, by ANY route ────
// Tester finding N-1 (MAJOR), and the control case is what makes it damning:
// the same account, in the same state, asserting the same thing, passes when it
// arrives already signed in and fails when it signs in AT the gate.
//
// The client derives "offer the group?" from App's `trade`, and the gate's
// sign-in set the user without refreshing it. `/api/auth/verify` deliberately
// carries no trade state (AC-P2-56 keeps that response byte-identical to Phase
// 1), so the server knew and the client did not — and a verified tradie was
// asked for an ABN the system had already checked and granted on.
test("a verified account sees no ABN field at the gate, however it signed in", async ({ page }) => {
  // Its OWN spare: an auto-pass consumes its ABN for the rest of the run, so a
  // journey reusing one that already granted would queue as a duplicate — and
  // would then be asserting the wrong thing for the wrong reason.
  const business = SPARE(5);
  const email = emailAt(business.domain);

  // Verified BEFORE the gate ever sees them, and signed out again so the gate
  // has to do the sign-in itself.
  await apiSignIn(page.request, email);
  const applied = await page.request.post("/api/trade/application", {
    data: { abn: business.abn, businessName: business.businessName, source: "profile" },
  });
  expect((await applied.json()).status, "fixture must auto-pass").toBe("verified");
  await page.request.post("/api/auth/logout");

  // Sign in AT THE GATE — the path the control case does not take.
  await openReview(page);
  // Signed out, so the gate starts at stage 0: the delivery postcode, then the
  // press that opens the sign-in step.
  await page.getByLabel("Delivery postcode").fill("3072");
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await otpSignIn(page, email);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible({ timeout: 15_000 });

  const me = await (await page.request.get("/api/auth/me")).json();
  expect(me.trade.verified, "the server knows this account is verified").toBe(true);

  await expect(page.getByLabel("ABN (optional)"),
    "AC-P2-19: a verified account is not asked for an ABN, whichever door it came through")
    .toHaveCount(0);
});

// ─── 12. One account's trade status never lands on another's session ─────────
// Codex stop-gate finding. `fetchMe()` is in flight for a while, and whoever it
// was started for may not be who is signed in when it lands: a response begun
// for account A and resolving after A signed out — or after B signed in on the
// same machine — wrote A's trade state onto B's session.
//
// On a shared trade counter that is somebody else's commercial standing on
// screen, and the person looking at it has no way to tell.
//
// The race itself cannot be timed reliably from a browser test. What CAN be
// asserted is the property the guard exists to protect: after a sign-out and a
// second sign-in, the screen shows the SECOND account's trade state and nothing
// of the first's.
test("a second account never inherits the first account's trade status", async ({ page }) => {
  const business = SPARE(6);
  const verified = emailAt(business.domain);
  const other = freshEmail("second-account");

  // Account A: verified.
  await apiSignIn(page.request, verified);
  const applied = await page.request.post("/api/trade/application", {
    data: { abn: business.abn, businessName: business.businessName, source: "profile" },
  });
  expect((await applied.json()).status, "fixture must auto-pass").toBe("verified");
  const named = await page.request.post("/api/auth/profile", { data: { name: "Ada Verified" } });
  expect(named.ok()).toBeTruthy();

  await page.goto("/account");
  await expect(page.getByTestId("trade-application-card").getByText(/trade pricing applies to your account/i))
    .toBeVisible({ timeout: 15_000 });

  // Account B: a fresh private account on the same browser.
  await page.request.post("/api/auth/logout");
  await apiSignIn(page.request, other);
  const namedB = await page.request.post("/api/auth/profile", { data: { name: "Bo Private" } });
  expect(namedB.ok()).toBeTruthy();

  await page.goto("/account");
  const card = page.getByTestId("trade-application-card");
  await expect(card).toBeVisible({ timeout: 15_000 });

  // B is private, and must be offered the invitation rather than A's status.
  await expect(card.getByRole("button", { name: /apply for trade pricing/i }),
    "the second account is offered the application form").toBeVisible();
  const said = (await card.innerText()).replace(/\s+/g, " ");
  expect(said, "and is NOT shown the first account's trade pricing")
    .not.toMatch(/trade pricing applies to your account/i);
  expect(said, "nor the first account's ABN").not.toContain(business.abn);
});
