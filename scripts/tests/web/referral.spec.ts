// ═══════════════════════════════════════════════════════════════════════════════
// REFERRAL PROGRAM — the browser half (design §13.1, the row that names this file).
//
// ⚠️ WHY A BROWSER SUITE EXISTS FOR A FEATURE WITH 112 GREEN NODE TESTS.
//
// `/refer` is a client-rendered route. The Worker serves the SAME shell for the
// program On and Off — the substitution happens after hydration, from
// `GET /api/referral/program`. So the whole of the owner's Off decision ("the
// same page, plus one banner") is invisible to every server-side assertion by
// construction, and it regressed once already: On was 3,234 characters, Off was
// 608, and the footer link had gone. The same blind spot hid AC-28, where the API
// had always returned both payment holds and nothing on any screen drew either.
//
// `referral-screens.test.mjs` closes part of that gap by rendering the components
// through `renderToStaticMarkup`. It cannot close the rest: it hands the
// components props it wrote itself, so a field renamed on the wire, a page that
// stops mounting a block, or a fetch that never fires all stay green there. This
// file drives the real Worker, the real API shapes and the real routes.
//
// ── HOUSE RULES FOR THIS FILE ────────────────────────────────────────────────
//
// 1. NO PROGRAM FIGURE IS TYPED INTO AN EXPECTATION. Every number is read from
//    `GET /api/referral/program` and formatted through the same rules as
//    `src/components/referral/format.ts`. A test that hard-codes "2.5%" is a
//    second place the figure lives, which is the exact defect class AC-76 is
//    about — and it would go red the day the owner changes the rate, teaching
//    whoever is on call that this suite lies.
// 2. FIXTURES ARE BUILT THROUGH THE REAL API, never by writing to D1. Every gate
//    a customer path runs then applies to the fixture too, so a fixture that
//    cannot be built is a finding rather than a reason to reach around.
// 3. THE PROGRAM CONFIG IS GLOBAL STATE. Playwright runs this repo's E2E with a
//    single worker against one Worker instance, so anything that changes the
//    config restores it in a `finally`. A leaked `active = 0` would silently
//    disable placements for every later test in the run.
// 4. ROLE AND TEXT LOCATORS, NOT CSS. The ops console is due a redesign; a
//    selector tied to today's markup there would rot before it caught anything.
// 5. SANITY IS BLOCKED AT THE BROWSER, ON PURPOSE — see `beforeEach`.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, request as apiRequest, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://127.0.0.1:8788";
// The ops console is served on the ops.* host (Chromium resolves *.localhost).
const OPS_ORIGIN = "http://ops.localhost:8788";
const OPS_HOST = "ops.localhost:8788";

// Identities come from the SEED, never a literal — same reason customer.spec.ts
// gives: a hard-coded address rots the moment the seed's owner edits it.
//
// u_staff2 rather than u_staff1 DELIBERATELY. One address may be issued five
// sign-in codes per fifteen minutes (`MAX_CHALLENGES_PER_WINDOW`, worker/lib/
// auth.ts), and that budget is shared across the whole `test:web` run —
// ops.spec.ts already signs in as u_staff1 six times. Borrowing it here would
// make the two files fight over a counter, and the loser fails with an empty
// "Dev mode" code and no clue why.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
function seedEmail(userId: string): string {
  const row = seedSql.split("\n").find((l) => l.includes(`'${userId}'`) && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error(`seed.sql: no email for ${userId}`);
  return email;
}
const ADMIN_EMAIL = seedEmail("u_staff2");

// ── The program, as the site advertises it ───────────────────────────────────
interface PublicProgram {
  active: boolean;
  discountPercent: number;
  ratePercent: number;
  minOrderAmount: number;
  windowMonths: number;
  capAmount: number | null;
  minPayoutBalance: number;
  payoutTimeframeDays: number;
}

// The four formatters the copy uses, restated here rather than imported: this is
// a .ts test compiled by Playwright's own loader with no path into src/, and the
// rules are three lines each. Keep them identical to
// src/components/referral/format.ts.
const pct = (v: number) => `${Number(v.toFixed(2))}%`;
const moneyRound = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
// `money`, from `src/pages/accountModel.tsx` — cents, for amounts of actual
// money rather than figures quoted in prose. The two are NOT interchangeable:
// `$2,000` is the qualifying minimum, `$34.18` is somebody's commission.
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money = (v: number) => aud.format(v);
const plural = (n: number, unit: string) => `${n} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
const months = (n: number) => plural(Math.round(n), "month");
const days = (n: number) => plural(Math.round(n), "day");

async function publicProgram(ctx: APIRequestContext): Promise<PublicProgram> {
  const response = await ctx.get(`${BASE}/api/referral/program`);
  expect(response.ok(), "GET /api/referral/program").toBeTruthy();
  return (await response.json()).program as PublicProgram;
}

// ── Identities ───────────────────────────────────────────────────────────────
// Fresh addresses every run: an account is permanently attributable to at most
// one referral, so a reused identity would pass once and then fail for the rest
// of the state directory's life.
let seq = 0;
const freshEmail = (label: string) => `refer-${label}-${Date.now().toString(36)}-${seq++}@example.com`;

// The per-source OTP cap (`MAX_CHALLENGES_PER_IP` = 60/hour) counts by
// CF-Connecting-IP / X-Forwarded-For, and every spec file in the run shares
// 127.0.0.1. Giving each identity its own source address keeps this file's
// account-making off everyone else's budget — and off its own.
let ipSeq = 0;
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`;

/** One signed-in account, held as its own API context so several can exist at
 *  once — a referral needs two people, and a browser context has room for one.
 *
 *  ⚠️ NOT `page.request`. A context with a `route` handler registered before its
 *  first navigation deadlocks `page.request` in the test runner (the call never
 *  resolves and the test dies on its own timeout). The standalone contexts here
 *  are independent of browser routing, and `adopt()` is what carries a session
 *  into the browser when a test needs to look at a screen. */
interface Identity {
  ctx: APIRequestContext;
  email: string;
}

async function newAccount(label: string): Promise<Identity> {
  const ctx = await apiRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { "X-Forwarded-For": nextIp() },
  });
  const email = freshEmail(label);
  const challenge = await ctx.post("/api/auth/challenge", { data: { email } });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  const verified = await ctx.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verified.ok(), `verify ${email}`).toBeTruthy();
  await completeDetails(ctx, label);
  return { ctx, email };
}

/** The submission gate refuses an account with no name, phone or address —
 *  server-side, so a detail-less fixture cannot submit anything. This is the ONLY
 *  change these fixtures needed; no referral assertion moved. */
async function completeDetails(ctx: APIRequestContext, label: string): Promise<void> {
  const saved = await ctx.post("/api/auth/profile", {
    data: {
      name: `Referral ${label}`, phone: "0412 345 678",
      addressLine1: "12 Bridge Street", addressSuburb: "Preston",
      addressState: "VIC", addressPostcode: "3072",
    },
  });
  expect(saved.ok(), `complete details for ${label}`).toBeTruthy();
}

/** Hand an identity's session to the browser. */
async function adopt(page: Page, who: Identity): Promise<void> {
  const { cookies } = await who.ctx.storageState();
  await page.context().addCookies(cookies);
}

/** Cut the browser off from the CMS.
 *
 *  ⚠️ THIS IS A HARNESS FIX, NOT A TEST SHORTCUT. The E2E Worker runs with
 *  `SANITY_PROJECT_ID:` empty, but `.env.production` bakes the real project id
 *  into the CLIENT bundle, so the SPA still calls `*.apicdn.sanity.io` from the
 *  browser — where it is CORS-refused, retried, and left to time out. Measured on
 *  `/refer`: the `load` event lands about 90 seconds after navigation with those
 *  requests in flight, and under 5 seconds with them aborted. That is the whole
 *  difference between this file being usable and it timing out.
 *
 *  Nothing here asserts on CMS-sourced content — not the FAQ article, not the
 *  rules post, not the hero image, not the `<head>` (AC-33's server-rendered head
 *  is `docs.test.mjs` / `seo.test.mjs` territory) — so aborting the calls removes
 *  latency and nothing else. Every figure and every line this file reads comes
 *  from D1 through `/api/referral/*`. */
test.beforeEach(async ({ context }) => {
  await context.route(/sanity\.io/, (route) => route.abort());
});

/** Load a customer route and wait for the SPA to have rendered it.
 *
 *  `waitUntil: "domcontentloaded"` because every figure on these pages arrives
 *  after hydration from `/api/referral/*` anyway — waiting for `load` buys
 *  nothing and, with a slow asset, costs everything. */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

// ── Ops, signed in ONCE for the whole file ───────────────────────────────────
// One address gets five codes per fifteen minutes and this file needs the ops
// side in several tests, so the session is built in `beforeAll` and shared.
// Signing in per test would exhaust the budget mid-run and fail with an empty
// code rather than anything that reads like a cause.
let staff: APIRequestContext;

test.beforeAll(async () => {
  staff = await apiRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "X-Forwarded-For": nextIp() } });
  const challenge = await staff.post("/api/ops/auth/challenge", {
    headers: { Host: OPS_HOST }, data: { email: ADMIN_EMAIL },
  });
  const { devCode } = await challenge.json();
  expect(devCode, `ops dev OTP for ${ADMIN_EMAIL}`).toBeTruthy();
  const verified = await staff.post("/api/ops/auth/verify", {
    headers: { Host: OPS_HOST }, data: { email: ADMIN_EMAIL, code: devCode },
  });
  expect(verified.ok(), "ops sign-in").toBeTruthy();
});

test.afterAll(async () => { await staff.dispose(); });

const opsHeaders = { Host: OPS_HOST };

async function readProgram(): Promise<{ program: Record<string, unknown>; version: string }> {
  const response = await staff.get(`${BASE}/api/ops/referrals/program`, { headers: opsHeaders });
  expect(response.ok(), "GET ops referral program").toBeTruthy();
  return response.json();
}

async function writeProgram(program: Record<string, unknown>, expectedVersion: string): Promise<void> {
  const response = await staff.put(`${BASE}/api/ops/referrals/program`, {
    headers: opsHeaders, data: { ...program, expectedVersion },
  });
  expect(response.ok(), `PUT ops referral program: ${await response.text()}`).toBeTruthy();
}

/** Run `body` with the program changed, and put it back whatever happens.
 *
 *  ⚠️ THE WHOLE ROW GOES OVER THE WIRE, MERGED OVER THE CURRENT ONE. `PUT
 *  /program` reads `capAmount` as "null unless present", so a patch that named
 *  only `active` would silently delete a configured cap on its way past — the
 *  test would pass and take AC-35's subject with it. And the restore is in a
 *  `finally` because this is process-wide state: a leaked `active = 0` turns off
 *  every placement for every test that runs after it. */
async function withProgram(patch: Record<string, unknown>, body: () => Promise<void>): Promise<void> {
  const before = await readProgram();
  await writeProgram({ ...before.program, ...patch }, before.version);
  try {
    await body();
  } finally {
    const now = await readProgram();
    await writeProgram(before.program, now.version);
  }
}

// ── Fixtures: two people and, when a test needs money, an order between them ──

// The ATO's own published test ABN. It passes the modulus check in
// `abnValid`, which is what opens the payout gate.
const ABN = "51824753556";

/** Join by doing what joining IS — an ABN on the profile and an account to pay
 *  into. There is no membership record to write instead (§18.1 A5). */
async function joinProgram(who: Identity, business: string): Promise<string> {
  const profile = await who.ctx.post("/api/auth/profile", { data: { abn: ABN, company: business } });
  expect(profile.ok(), "save ABN").toBeTruthy();
  const saved = await who.ctx.put("/api/account/payout-details", {
    data: { bsb: "063000", accountNumber: "12345678", accountName: business },
  });
  expect((await saved.json()).referrerGate?.complete, "the payout gate opens on save").toBeTruthy();
  const screen = await referrerScreen(who);
  expect(screen.code, "a code is issued once the gate is open").toBeTruthy();
  return screen.code as string;
}

async function referrerScreen(who: Identity): Promise<Record<string, any>> {
  const response = await who.ctx.get("/api/account/referrals");
  expect(response.ok(), "GET /api/account/referrals").toBeTruthy();
  return response.json();
}

async function referralOffer(who: Identity): Promise<Record<string, any> | null> {
  const response = await who.ctx.get("/api/account/referral-offer");
  expect(response.ok(), "GET /api/account/referral-offer").toBeTruthy();
  return (await response.json()).offer;
}

/** A new account that arrived on someone's link.
 *
 *  The `/r/<CODE>` hop is not decoration: attribution happens at account
 *  creation, from the cookie that hop sets, and it is one of only two paths that
 *  can record a referral at all (the other is the ops link action). Signing up
 *  first and attaching afterwards is a thing this product deliberately cannot
 *  do — there is no client helper and the route answers 404 (AC-107). */
async function newReferredAccount(label: string, code: string, business: string): Promise<Identity> {
  const ctx = await apiRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "X-Forwarded-For": nextIp() } });
  const landed = await ctx.get(`/r/${code}`);
  expect(landed.ok(), `/r/${code} is reachable`).toBeTruthy();
  const email = freshEmail(label);
  const challenge = await ctx.post("/api/auth/challenge", { data: { email } });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  const verified = await ctx.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verified.ok(), `verify ${email}`).toBeTruthy();
  await ctx.post("/api/auth/profile", { data: { company: business } });
  await completeDetails(ctx, label);
  return { ctx, email };
}

/** Build a real job for `who` and take it as far as `stop`.
 *
 *  Priced by the real estimator, issued by real ops, accepted by the customer,
 *  paid through the real stage machine. `qty` is what puts the order over the
 *  qualifying minimum — under it there is no earning at all (AC-18), which is a
 *  different fixture and a different test. */
async function orderFor(who: Identity, title: string, stop: "issued" | "accepted" | "paid"): Promise<{ projectId: string; orderId: string | null }> {
  const saved = await who.ctx.put("/api/projects/current/lines", {
    data: {
      title,
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 8,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
    },
  });
  expect(saved.ok(), "save lines").toBeTruthy();
  const body = await saved.json();
  const projectId = body.project.id as string;
  expect(body.items[0].lineTotal, "the line prices — a null total means the estimator, not the referral").toBeTruthy();

  const submitted = await who.ctx.post(`/api/projects/${projectId}/submit`, {
    data: { delivery: { postcode: "3072" } },
  });
  expect(submitted.ok(), `submit: ${await submitted.text()}`).toBeTruthy();

  // Delivery is settled by hand: no seeded zone carries a rate, so the estimate
  // is `unpriced_table` and a quote cannot be issued without a figure.
  const delivery = await staff.put(`${BASE}/api/ops/projects/${projectId}/delivery`, {
    headers: opsHeaders, data: { amount: 640 },
  });
  expect(delivery.ok(), "settle delivery").toBeTruthy();
  const issued = await staff.post(`${BASE}/api/ops/projects/${projectId}/issue-quote`, {
    headers: opsHeaders, data: {},
  });
  expect(issued.ok(), `issue quote: ${await issued.text()}`).toBeTruthy();
  // ISSUE IS THE FREEZE MOMENT — the referral component is stamped here and
  // never re-derived, so a quote is the earliest surface that can carry the
  // badge and the last state before ordering ends the eligibility.
  if (stop === "issued") return { projectId, orderId: null };

  const accepted = await who.ctx.post(`/api/projects/${projectId}/accept`, { data: {} });
  expect(accepted.ok(), `accept: ${await accepted.text()}`).toBeTruthy();
  const orderId = (await accepted.json()).order.id as string;
  if (stop === "accepted") return { projectId, orderId };

  // Paid in full is a place in the fulfilment machine, not a payment field: the
  // balance cannot be recorded until the job has been drawn, made, QA'd and
  // invoiced. Walking it is the only honest way to reach a CONFIRMED earning.
  const pay = async (kind: "deposit" | "balance") => {
    const response = await staff.post(`${BASE}/api/ops/orders/${orderId}/pay`, {
      headers: opsHeaders, data: { kind, reference: `E2E-${kind}` },
    });
    expect(response.ok(), `record ${kind}: ${await response.text()}`).toBeTruthy();
  };
  await pay("deposit");
  for (const action of ["issue-drawings", "confirm-drawings", "start-manufacturing", "share-qa", "invoice-balance"]) {
    const response = await staff.post(`${BASE}/api/ops/orders/${orderId}/advance`, {
      headers: opsHeaders, data: { action },
    });
    expect(response.ok(), `advance ${action}: ${await response.text()}`).toBeTruthy();
  }
  await pay("balance");
  return { projectId, orderId };
}

/** Flip the account's price-display preference through the screen that owns it.
 *
 *  ⚠️ THE RADIO IS OPTIMISTIC AND `aria-checked` PROVES NOTHING. `setGst`
 *  updates the client's user object before the save is sent and reconciles from
 *  the server's echo afterwards, so the control reports the new mode instantly
 *  whether or not the write ever lands — and a test that navigates away on the
 *  strength of it can abandon the request in flight. This passed in isolation
 *  and failed in the full run for exactly that reason. The poll against
 *  `/api/auth/me` is what turns the flip into a stored fact worth building an
 *  assertion on. */
async function setGstMode(page: Page, who: Identity, mode: "inc" | "ex"): Promise<void> {
  await open(page, "/account");
  await page.getByRole("radio", { name: mode === "ex" ? /excluding gst/i : /including gst/i }).click();
  await expect
    .poll(async () => (await (await who.ctx.get("/api/auth/me")).json()).user.priceGstMode,
      { message: `the price-display preference is stored as ${mode}` })
    .toBe(mode);
}

/** Every h1/h2/h3 on the page, in document order — the page's skeleton.
 *
 *  AC-62's claim is structural ("the same page, plus one banner"), so the
 *  assertion has to be structural too. Comparing LENGTHS would not do it: the
 *  regression this guards replaced 3,234 characters with 608, and a length
 *  comparison passes the moment two rewrites happen to balance. */
const skeleton = (page: Page) => page.locator("h1, h2, h3").allInnerTexts();

test.describe("the referral landing page", () => {
  // AC-34, logged out. The pitch has to carry the offer itself — a signed-out
  // visitor is the only reader who has nothing else to go on — and it must not
  // show a code, because there is no account for one to belong to.
  test("AC-34: signed out, the offer states every configured figure and asks for a sign-in, not a code", async ({ page, request }) => {
    const program = await publicProgram(request);
    expect(program.active, "the seeded program ships On").toBeTruthy();

    await open(page, "/refer");
    await expect(page.getByRole("heading", { name: "Refer a mate. You both win.", level: 1 })).toBeVisible();

    // Every figure, from config. §4.4's disclosure rule is that these sit in
    // body type beside the claim, so each one is asserted where it is READ.
    const hero = page.locator("section").filter({ hasText: "Refer a mate. You both win." }).first();
    await expect(hero).toContainText(`${pct(program.discountPercent)} off their first order`);
    await expect(hero).toContainText(`${pct(program.ratePercent)} of it`);
    await expect(hero).toContainText(days(program.payoutTimeframeDays));
    await expect(page.getByText(months(program.windowMonths)).first()).toBeVisible();
    await expect(page.getByText(moneyRound(program.minOrderAmount)).first()).toBeVisible();

    // s 49: the reward is never coupled to the reader's own buying.
    await expect(page.getByText(/you don't need to have ordered/i).first()).toBeVisible();

    // The CTA is a sign-in, and there is no code anywhere on the page.
    await expect(page.getByRole("button", { name: /sign in to join/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /join the program/i })).toHaveCount(0);
    await expect(page.getByText(/\b[A-Z2-9]{3}-[A-Z2-9]{3}\b/)).toHaveCount(0);
  });

  // AC-62 / AC-36 — THE REGRESSION THIS FILE EXISTS FOR.
  //
  // Switching the program off replaced the entire landing page: 3,234 characters
  // became 608, the hero, the steps, the conditions and the FAQ all went, and the
  // footer link disappeared with them. 104 green node tests could not see any of
  // it, because the server-served HTML is byte-identical in both states — the
  // substitution happens in the client. This is the layer that sees it.
  //
  // Asserted STRUCTURALLY. A length comparison would pass the moment two rewrites
  // happened to balance, and §4.7's claim is not about size: Off is the same page,
  // plus one banner, and that is the entire behavioural difference.
  test("AC-62/AC-36: Off is the same page plus one banner, and the footer link survives", async ({ page }) => {
    // `allInnerTexts()` does NOT auto-wait. Read the skeleton before React has
    // rendered and a slow hydration looks exactly like a missing section — the
    // test would "catch" a regression that is really its own impatience. Waiting
    // on the LAST section's heading is what makes the read safe.
    const settled = async () => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: /questions tradies actually ask/i })).toBeVisible();
    };

    await open(page, "/refer");
    await settled();
    const onSkeleton = await skeleton(page);
    // ⚠️ BUTTON, NOT LINK. The site routes in the client, so every footer entry
    // is a `<button>`; asked for as a link this returned 0 in both states and
    // the comparison below asserted nothing at all. The count is pinned to 1
    // rather than compared to itself for the same reason.
    const footerEntry = () => page.getByRole("button", { name: "Refer a mate", exact: true });
    await expect(footerEntry(), "the footer carries the link while On").toHaveCount(1);
    expect(onSkeleton.length, "the On page has a skeleton worth comparing against").toBeGreaterThan(4);

    await withProgram({ active: false }, async () => {
      await open(page, "/refer");
      await settled();

      // The one addition, and the only one.
      await expect(page.getByRole("status")).toBeVisible();

      expect(
        await skeleton(page),
        "every heading survives the switch — Off is the same page, not a variant",
      ).toEqual(onSkeleton);

      await expect(
        footerEntry(),
        "AC-36: the footer link is untouched by the switch",
      ).toHaveCount(1);

      // The framing the owner removed when he cut the third state: a paused
      // program is coming back, and must never claim otherwise.
      await expect(page.getByText(/has ended/i)).toHaveCount(0);
    });
  });

  // AC-34's third limb, and D18 made visible.
  //
  // Signed in with nothing on file, the page's whole job changes: the CTA stops
  // asking for a sign-in and starts asking for the four details, and there is
  // still NO CODE — because under D18 the code is withheld until ABN, BSB,
  // account number and account name are stored. There is no issued-but-inactive
  // code and no half-joined state, so a screen that showed one here would be
  // advertising a thing the model cannot produce.
  //
  // The two facts stay on different steps, which is the ACL s 49 shape (§4.9.4):
  // "any account can join, you don't need to have ordered" is part 1, and
  // "we need somewhere to send the money" is part 2. Adjacent they read as
  // "you have to be a customer to refer", which is the whole thing the design
  // exists to avoid — so this asserts the SEQUENCE, not merely the presence.
  test("D18/AC-34: signed in with no payout details, the page asks for the details and issues no code", async ({ page, request }) => {
    const program = await publicProgram(request);
    const newcomer = await newAccount("no-details");
    // Deliberately no ABN and no payout details — a brand-new account is
    // already exactly the state under test, so nothing is set up for it.
    expect((await referrerScreen(newcomer)).referrerGate.complete, "the gate starts shut").toBeFalsy();

    await adopt(page, newcomer);
    await open(page, "/refer");
    await expect(page.getByRole("heading", { name: "Refer a mate. You both win.", level: 1 })).toBeVisible();

    // The CTA has changed hands: no sign-in is being asked for any more.
    await expect(page.getByRole("button", { name: /join the program/i })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /sign in to join/i })).toHaveCount(0);

    // Part 1 — the conditions, every figure from config, and the reward never
    // coupled to the reader's own buying.
    await expect(page.getByRole("heading", { name: /join the referral program/i })).toBeVisible();
    const conditions = page.getByText(/what you're agreeing to/i).locator("..");
    await expect(conditions).toContainText(pct(program.discountPercent));
    await expect(conditions).toContainText(pct(program.ratePercent));
    await expect(conditions).toContainText(moneyRound(program.minOrderAmount));
    await expect(conditions).toContainText(months(program.windowMonths));
    await expect(conditions).toContainText(days(program.payoutTimeframeDays));
    await expect(page.getByText(/you don't need to have ordered anything/i)).toBeVisible();

    // No code, anywhere, in any shape. AC-34's "logged in without: no code".
    await expect(page.getByText(/\b[A-Z2-9]{3}-[A-Z2-9]{3}\b/)).toHaveCount(0);

    // Nothing is saved until the details are, so the door is shut until the
    // terms are ticked — and what is behind it is the bank details, not a code.
    const cont = page.getByRole("button", { name: /continue/i });
    await expect(cont).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(cont).toBeEnabled();
    await cont.click();

    await expect(page.getByRole("heading", { name: /where do we send the money/i })).toBeVisible();
    for (const field of ["ABN", "BSB", "Account number", "Account name"]) {
      await expect(page.getByLabel(field, { exact: true })).toBeVisible();
    }
    // Still no code on the far side of the door either: the details are what
    // issues one, and they have not been given yet.
    await expect(page.getByText(/\b[A-Z2-9]{3}-[A-Z2-9]{3}\b/)).toHaveCount(0);
  });
});

test.describe("the placements", () => {
  // AC-36 and register A10.
  //
  // Two properties that are easy to lose one at a time: each page carries
  // EXACTLY ONE placement, and every one of them renders NOTHING while the
  // program is Off — approved at the mock gate, and the reverse of what §7.5
  // originally specified. A placement still pitching a rate in the present
  // tense while nobody can join is the ACL s 18 / s 32(1) exposure the landing
  // banner exists to close, and a banner on `/refer` cannot repair a pitch the
  // visitor read on the home page.
  //
  // ⚠️ THE OFF ASSERTION IS A COUNT OF ZERO, which is what an unloaded page
  // looks like too. So the Off pass waits for the `/api/referral/program`
  // response that decides it, and then asserts the FOOTER LINK is still there —
  // AC-36's other half, and the proof that the page rendered at all.
  test("AC-36/A10: one placement per page, every figure from config, and none of them while Off", async ({ page, request }) => {
    const program = await publicProgram(request);
    const HOME = "Know another tradie?";
    const TRADE = "Bring another trade account with you.";
    // The footer entry is a BUTTON — the site routes in the client, so nothing
    // in the footer is an `<a>`. Asked for by the wrong role it is never found,
    // and an assertion that it is unchanged by the switch compares zero to zero.
    const footerLink = () => page.getByRole("button", { name: "Refer a mate", exact: true });

    // ── Home, signed out ───────────────────────────────────────────────────
    await open(page, "/");
    await expect(page.getByRole("heading", { name: HOME })).toHaveCount(1);
    const home = page.locator("section").filter({ hasText: HOME }).first();
    await expect(home).toContainText(`${pct(program.discountPercent)} off their first order`);
    await expect(home).toContainText(`${pct(program.ratePercent)} of it`);
    await expect(home).toContainText(days(program.payoutTimeframeDays));
    // s 49 — never coupled to the reader's own buying, on the surface read by
    // people who are not customers yet.
    await expect(home).toContainText(/you don't need to have ordered/i);

    // ── Trade account, signed out ──────────────────────────────────────────
    await open(page, "/trade-account");
    await expect(page.getByRole("heading", { name: TRADE })).toHaveCount(1);
    const trade = page.locator("section").filter({ hasText: TRADE }).first();
    await expect(trade).toContainText(`${pct(program.discountPercent)} off their first order`);
    await expect(trade).toContainText(`${pct(program.ratePercent)} of it`);
    await expect(trade).toContainText(moneyRound(program.minOrderAmount));
    await expect(trade).toContainText(/ordering isn't part of it/i);

    // ── The member variant: a code, and no rate anywhere near an amount ─────
    const member = await newAccount("placement-member");
    const code = await joinProgram(member, `Placement Member ${Date.now().toString(36)}`);
    await adopt(page, member);
    await open(page, "/");
    const mine = page.locator("section").filter({ hasText: "Your referral code" }).first();
    await expect(mine).toContainText(code);
    // ⚠️ INVERTIBLE OTHERWISE. A rate printed beside an earned figure tells the
    // referrer what their mate spent, which is that third party's business —
    // so the member card is given the earned total and never the rate.
    await expect(mine).toContainText(`${pct(program.discountPercent)} off their first order`);
    await expect(mine, "the rate may not appear beside an earned amount").not.toContainText(`${pct(program.ratePercent)} of it`);
    // One placement still, not the member card plus the pitch.
    await expect(page.getByRole("heading", { name: HOME })).toHaveCount(0);

    // ── Off: silently absent, everywhere, for everyone ─────────────────────
    await page.context().clearCookies();
    await withProgram({ active: false }, async () => {
      for (const [path, heading] of [["/", HOME], ["/trade-account", TRADE]] as const) {
        const decided = page.waitForResponse((r) => r.url().includes("/api/referral/program"));
        await open(page, path);
        await decided;
        await expect(footerLink().first(), "the page rendered — the footer link is untouched by the switch").toBeVisible();
        await expect(page.getByRole("heading", { name: heading }), `${path} carries no pitch while Off`).toHaveCount(0);
      }
    });
  });
});

test.describe("the referred tradie's discount", () => {
  // AC-69 / AC-71 — the offer panel's three states, in the home revision 14
  // gave it.
  //
  // ⚠️ THE PANEL MOVED. Revision 13 put it on the Account page beside the
  // price-display preference; the mock gate moved it to `/referrals` under an
  // `h2` "Your discount", above the referrer block, and the register governs
  // (AC-69). So this asserts BOTH halves of that decision — that it is here,
  // and that the Account page does not have one.
  //
  // The three states are DERIVED on every read, from the referral, its expiry
  // and whether the account has ordered. There is no status column, which is
  // why all three are reachable by doing ordinary things: sign up on a code,
  // place an order, or let the window run out.
  test("AC-69/AC-71: available, used and expired each render under Your discount", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const referrer = await newAccount("offer-referrer");
    const code = await joinProgram(referrer, `Offer Referrer ${stamp}`);

    const available = await newReferredAccount("offer-available", code, `Offer Available ${stamp}`);
    const used = await newReferredAccount("offer-used", code, `Offer Used ${stamp}`);
    await orderFor(used, `AC-71 used ${stamp}`, "accepted");

    // Expired is made by the WINDOW, not by waiting: a referral recorded while
    // the window is zero months expires the moment it is written, and the
    // referral keeps its own terms afterwards (AC-23) — so the program goes
    // straight back and the assertions below read the restored figures.
    let expired!: Identity;
    await withProgram({ windowMonths: 0 }, async () => {
      expired = await newReferredAccount("offer-expired", code, `Offer Expired ${stamp}`);
    });

    const heading = () => page.getByRole("heading", { name: "Your discount", level: 2 });
    const openReferrals = async (who: Identity) => {
      await page.context().clearCookies();
      await adopt(page, who);
      await open(page, "/referrals");
      await expect(page.getByRole("heading", { name: "Referrals", level: 1 })).toBeVisible();
    };

    // ── available ──────────────────────────────────────────────────────────
    const liveOffer = await referralOffer(available);
    expect(liveOffer?.state, "a referred account that has not ordered").toBe("available");
    await openReferrals(available);
    await expect(heading()).toBeVisible();
    await expect(page.getByRole("heading", { name: `${pct(liveOffer!.referralPercent)} off your first order` })).toBeVisible();
    // Who it came from — the one thing the card says about the referrer.
    await expect(page.getByText(liveOffer!.referrerName as string).first()).toBeVisible();

    // AC-69's ordering claim: the discount comes BEFORE the referrer block, so
    // a person who is both never has to work out which half they are reading.
    const headings = await skeleton(page);
    expect(headings.indexOf("Your discount"), "the discount card sits above Refer a mate")
      .toBeLessThan(headings.indexOf("Refer a mate"));

    // ── used ───────────────────────────────────────────────────────────────
    const usedOffer = await referralOffer(used);
    expect(usedOffer?.state, "placing the first order is what ends it").toBe("used");
    await openReferrals(used);
    await expect(heading()).toBeVisible();
    await expect(page.getByRole("heading", { name: new RegExp(`referral discount was applied to order ${usedOffer!.usedOrderNo}`, "i") })).toBeVisible();

    // ── expired ────────────────────────────────────────────────────────────
    const lapsed = await referralOffer(expired);
    expect(lapsed?.state, "a window of zero months lapses on the way in").toBe("expired");
    await openReferrals(expired);
    await expect(heading()).toBeVisible();
    await expect(page.getByRole("heading", { name: /referral discount expired on/i })).toBeVisible();
    // No apology and no way back — the card states the fact and stops.
    await expect(page.getByText(/your prices are unchanged from here/i)).toBeVisible();

    // ── no offer: no heading, no placeholder, no greyed card ───────────────
    expect(await referralOffer(referrer), "the referrer was referred by nobody").toBeNull();
    await openReferrals(referrer);
    await expect(page.getByRole("heading", { name: "Refer a mate", level: 2 })).toBeVisible();
    await expect(heading(), "AC-69: no placeholder for a discount that isn't theirs").toHaveCount(0);

    // And the placement revision 4 gave it is gone from the Account page.
    await open(page, "/account");
    await expect(page.getByRole("heading", { name: /price display/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your discount" })).toHaveCount(0);
  });
});

test.describe("the quote", () => {
  // AC-51 (pricing half) / AC-53 / AC-56 — the badge on an ISSUED quote, in
  // both GST modes.
  //
  // ⚠️ THE ISSUED QUOTE ONLY. The draft-side indicator is STRUCK: AC-57,
  // AC-51's display half, §8.5's draft requirement and §1's "sees the discount
  // while they are quoting" outcome went together at the owner's decision —
  // the discount is an acquisition incentive, not a basket one, and it has
  // done its persuading before the quote is built. `GET /api/projects/current`
  // and the price-preview response deliberately carry no `referral` field, and
  // that is spec §6, out of scope, not a gap to be helpfully closed.
  //
  // ⚠️ ONE PERCENTAGE, NEVER A TOTAL, IN EITHER MODE. Every registered account
  // also carries a standing discount the business has decided never to show,
  // so a dollar saving beside the referral figure would disclose it by
  // subtraction (AC-75). The badge moves with nothing when the toggle flips —
  // a percentage is unit-free, and that is arithmetic rather than a carve-out.
  test("AC-51/AC-56: the issued quote names the referral component, and the GST toggle moves it not at all", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const referrer = await newAccount("badge-referrer");
    const code = await joinProgram(referrer, `Badge Referrer ${stamp}`);
    const mate = await newReferredAccount("badge-mate", code, `Badge Mate ${stamp}`);
    const title = `AC-51 issued ${stamp}`;
    const { projectId } = await orderFor(mate, title, "issued");

    // The ISSUED quote is its own document — `/quote`, not the project — and it
    // is the one that carries the stamp. The project endpoint is the draft view
    // and deliberately carries no `referral` field at all (§6, out of scope).
    const quote = await (await mate.ctx.get(`/api/projects/${projectId}/quote`)).json();
    const badge = quote.referral as { percent: number; referrerName: string } | null;
    expect(badge?.percent, "the issued quote carries the stamp taken at issue").toBeTruthy();

    await adopt(page, mate);
    const openQuote = async () => {
      await open(page, "/projects");
      await page.getByText(title).locator("visible=true").first().click();
      await expect(page.getByRole("heading", { name: "Quoted lines", level: 2 })).toBeVisible();
    };
    const badgeRow = () => page.getByText(/Referral discount/);

    // The goods line is labelled in words wherever it appears, and it appears
    // more than once — so the mode is asserted as "this basis and not the
    // other" rather than by picking one of the two panels, which would tie the
    // test to which panel happened to be first in the DOM.
    // `visible=true` because the record draws the same figures twice, once for
    // each breakpoint, and the copy that is off-screen at this viewport is
    // still in the DOM.
    const basis = (mode: "inc" | "ex") => page.getByText(`Windows and doors (${mode} GST)`);
    const shownBasis = (mode: "inc" | "ex") => basis(mode).locator("visible=true").first();

    // ── inc GST, the default ───────────────────────────────────────────────
    await openQuote();
    await expect(shownBasis("inc")).toBeVisible();
    await expect(basis("ex")).toHaveCount(0);
    await expect(badgeRow()).toBeVisible();
    await expect(badgeRow()).toContainText(`${badge!.percent}% off`);
    await expect(badgeRow()).toContainText(badge!.referrerName);
    // Past tense, and no redemption step: it is a statement ABOUT the prices.
    await expect(page.getByText(/already in the prices above/i)).toBeVisible();

    // ── ex GST ─────────────────────────────────────────────────────────────
    await setGstMode(page, mate, "ex");

    await openQuote();
    await expect(shownBasis("ex"), "the money panel did move").toBeVisible();
    await expect(basis("inc")).toHaveCount(0);
    await expect(badgeRow(), "the referral component did not").toContainText(`${badge!.percent}% off`);
    await expect(badgeRow()).toContainText(badge!.referrerName);
    await expect(page.getByText(/already in the prices above/i)).toBeVisible();
  });
});

test.describe("the figures are configuration", () => {
  // AC-76 — THE ONE THAT PROVES NOTHING IS HARD-CODED.
  //
  // The owner kept these numbers editable from the ops console precisely so the
  // rate could move without a deploy. The failure mode is not that a figure is
  // wrong, it is that a figure is TYPED: the page then advertises one number
  // while the engine applies another, and the day the owner raises the discount
  // is the day the site starts lying — quietly, and to the people being asked
  // to act on it. Six figures move here at once, and every one of them has to
  // move on the page.
  //
  // ⚠️ THE NEW VALUES ARE INPUTS, NOT EXPECTATIONS. House rule 1 forbids typing
  // a program figure into an assertion about the product's configuration; this
  // test asserts only that what it SET is what renders, which is the opposite
  // failure and the whole subject of the criterion.
  //
  // ⚠️ DRIVEN THROUGH THE OPS API, NOT THE OPS SCREEN. The design's test-plan
  // row says "change config in ops UI"; the ops program form's number inputs
  // carry no label association at all — no `htmlFor`, no `aria-label`, only a
  // sibling `<span>` — so reaching them means a positional or CSS selector,
  // which house rule 4 forbids and the coming ops redesign would break. This
  // calls the same `PUT /api/ops/referrals/program` the screen calls, as the
  // same staff session, so the claim being tested is unchanged. The missing
  // labels are reported as a defect rather than worked around silently.
  test("AC-76: raising a figure in the program is a config change and nothing else", async ({ page, request }) => {
    const before = await publicProgram(request);
    const bodyText = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
    const settled = async () => {
      await expect(page.getByRole("heading", { level: 1, name: "Refer a mate. You both win." })).toBeVisible();
      await expect(page.getByRole("heading", { name: /questions tradies actually ask/i })).toBeVisible();
    };

    await open(page, "/refer");
    await settled();
    expect(await bodyText(), "the page is advertising the configured figures to begin with")
      .toContain(`${pct(before.discountPercent)} off their first order`);

    // Every number moved at once, and the cap goes from unset to set — which
    // also exercises AC-35 from the other side: the clause the page does not
    // render when there is no cap is the clause it must render when there is.
    const next = {
      discountPercent: before.discountPercent + 5,
      ratePercent: before.ratePercent + 2.25,
      minOrderAmount: before.minOrderAmount + 1500,
      windowMonths: before.windowMonths - 3,
      payoutTimeframeDays: before.payoutTimeframeDays + 7,
      capAmount: 750,
    };

    await withProgram(next, async () => {
      await open(page, "/refer");
      await settled();
      const text = await bodyText();

      expect(text).toContain(`${pct(next.discountPercent)} off their first order`);
      expect(text).toContain(`${pct(next.ratePercent)} of it`);
      expect(text).toContain(days(next.payoutTimeframeDays));
      expect(text).toContain(moneyRound(next.minOrderAmount));
      expect(text).toContain(months(next.windowMonths));
      // AC-35's converse: with a cap configured, the clause exists.
      expect(text).toContain(`Capped at ${moneyRound(next.capAmount)}`);

      // And the old figures are GONE — a page that renders both is a page with
      // one figure from config and one from a string.
      for (const stale of [
        pct(before.discountPercent), pct(before.ratePercent),
        moneyRound(before.minOrderAmount), months(before.windowMonths), days(before.payoutTimeframeDays),
      ]) {
        expect(text.includes(stale), `a stale figure survived the config change: ${stale}`).toBe(false);
      }
    });

    // The restore is load-bearing for every test that runs after this one, so
    // it is asserted rather than assumed.
    expect(await publicProgram(request), "the program went back exactly as it was").toEqual(before);
    await open(page, "/refer");
    await settled();
    expect(await bodyText()).toContain(`${pct(before.discountPercent)} off their first order`);
  });
});

test.describe("the GST preference and the referral figures", () => {
  // AC-31 / AC-74 — flipping ex/inc changes NOTHING in the Referrals section.
  //
  // Two different reasons, and the section is the one screen where both are on
  // display at once, which is why this fixture goes to the trouble of building
  // a person who is both halves of the program:
  //
  //   · the DISCOUNT is a percentage, and a percentage is unit-free. Nothing to
  //     toggle between, so nothing moves. Arithmetic, not a carve-out — and it
  //     must not be implemented as one.
  //   · the EARNINGS are cash arriving in a bank account, not a price of goods.
  //     There is no ex/inc pair to show, and the strip says so out loud rather
  //     than leaving a referrer to wonder why the toggle did nothing.
  //
  // Asserted as EVERY money and percentage token on the page, in order, rather
  // than as a handful of chosen figures: the criterion is "no figure", and a
  // test that names three of them is only as good as the choosing.
  test("AC-31/AC-74: not one figure in the Referrals section moves with the GST toggle", async ({ page }) => {
    const stamp = Date.now().toString(36);
    // A person on both sides: referred by someone, and referring someone else.
    const upstream = await newAccount("gst-upstream");
    const upstreamCode = await joinProgram(upstream, `GST Upstream ${stamp}`);
    const both = await newReferredAccount("gst-both", upstreamCode, `GST Both ${stamp}`);
    const ownCode = await joinProgram(both, `GST Both ${stamp}`);
    const downstream = await newReferredAccount("gst-downstream", ownCode, `GST Downstream ${stamp}`);
    await orderFor(downstream, `AC-31 earning ${stamp}`, "accepted");

    const screen = await referrerScreen(both);
    expect(screen.earnings.pending, "money on screen for the toggle to fail to move").toBeGreaterThan(0);
    expect(await referralOffer(both), "and a discount card above it").toBeTruthy();

    await adopt(page, both);
    const figuresOnReferrals = async () => {
      await open(page, "/referrals");
      await expect(page.getByRole("heading", { name: "Your discount", level: 2 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Refer a mate", level: 2 })).toBeVisible();
      const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
      return [...text.matchAll(/\$[\d,]+(?:\.\d{2})?|\d+(?:\.\d+)?%/g)].map((m) => m[0]);
    };

    const inc = await figuresOnReferrals();
    expect(inc.length, "there are figures here to hold still").toBeGreaterThan(2);

    // A stored fact, not a piece of local state — if the save had not landed,
    // the comparison below would be two reads of one mode agreeing with itself.
    await setGstMode(page, both, "ex");

    expect(await figuresOnReferrals(), "AC-31: the section is the same in both modes").toEqual(inc);
  });
});

test.describe("what the discount card is allowed to say", () => {
  // AC-70 / AC-73 / AC-74 / AC-75, against RENDERED copy rather than a prop.
  //
  // Since revision 14 struck the draft-side badge, this card is the ONLY
  // customer-facing explanation of the discount — the only place a referred
  // tradie is told the percentage, who it came from, when it runs out and
  // which of the three states they are in. That is what raises the stakes on
  // these four rules from house style to the thing the descope rests on.
  //
  // ⚠️ THE PROHIBITED VOCABULARY IS NOT PRUDERY. "Redeem", "claim", "voucher",
  // "credit", "at checkout" all describe an instrument the customer holds and
  // spends. This discount is not one — it is already inside every price they
  // are shown — and redemption language would re-open the gift-card analysis
  // the design deliberately closed, on top of promising a step that does not
  // exist and cannot be performed.
  //
  // ⚠️ ONE PERCENTAGE, AND NO DOLLARS. Every registered account also carries a
  // standing discount the business has decided never to show; a second
  // percentage or a worked saving would disclose it by subtraction (AC-75), so
  // this counts every percentage on the card rather than merely checking the
  // right one is present.
  test("AC-70/AC-75: the card says the discount is already in the price, and names one percentage and no dollars", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const referrer = await newAccount("copy-referrer");
    const code = await joinProgram(referrer, `Copy Referrer ${stamp}`);
    const mate = await newReferredAccount("copy-mate", code, `Copy Mate ${stamp}`);

    const offer = await referralOffer(mate);
    expect(offer?.state, "the fixture is the live state, where the copy has work to do").toBe("available");

    await adopt(page, mate);
    await open(page, "/referrals");
    await expect(page.getByRole("heading", { name: "Your discount", level: 2 })).toBeVisible();

    const card = page.locator("section").filter({ hasText: "Your discount" }).first();
    await expect(card).toContainText("It's already in every price you see — there's nothing to apply.");

    const text = (await card.innerText()).replace(/\s+/g, " ");

    // No instrument, no step, nothing to hold or spend.
    for (const forbidden of [/redeem/i, /\bclaim/i, /voucher/i, /coupon/i, /\bcredit\b/i, /\bwallet\b/i, /at checkout/i, /activate/i, /enter (your |the )?code/i]) {
      expect(forbidden.test(text), `redemption language on the discount card: ${forbidden}`).toBe(false);
    }

    // Every percentage on the card is THE percentage, and it came from the
    // server — the browser is never given the parts to compute one from.
    const percentages = [...text.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => m[1]);
    expect(percentages.length, "the card states a percentage").toBeGreaterThan(0);
    expect([...new Set(percentages)], "AC-75: one percentage on the card, ever")
      .toEqual([String(offer!.referralPercent)]);

    // AC-74 — no worked dollar figure in v1. A saving in dollars is the other
    // way to disclose the standing discount, and it is arithmetic away.
    expect(/\$/.test(text), "no worked dollar saving on the card").toBe(false);
  });
});

test.describe("the referrer's money", () => {
  // AC-28 — THE SECOND OF THE TWO FINDINGS THIS FILE EXISTS FOR.
  //
  // `heldPendingDetails` and `heldUnderThreshold` were computed by the server in
  // every state and drawn by nothing at all, so a referrer whose money had
  // stopped moving saw a figure that would not change and no account of why.
  // 112 green node tests could not see it: they asserted the API fields, which
  // were correct, and the component that ignores them lives in the browser.
  //
  // ⚠️ THE TWO HOLDS CANNOT COEXIST, so this walks them as two fixtures rather
  // than looking for both on one screen. `heldPendingDetails` needs an
  // UNPAYABLE referrer; `heldUnderThreshold` needs CONFIRMED money — and money
  // only confirms for a payable referrer (AC-20), while `clearBlocked` refuses
  // to un-pay someone who is holding confirmed money (§4.9.2). Each half is
  // therefore reachable only with the other absent, and a test looking for both
  // at once would be asserting a state the product deliberately cannot enter.
  test("AC-28: both holds render, each naming its own amount and its own release", async ({ page }) => {
    const stamp = Date.now().toString(36);

    // ── Hold 1 · pending, because the details were taken away ──────────────
    // Leaving is allowed while money is only PENDING, so this is a state a real
    // referrer reaches by pressing a button the screen offers them.
    const leaver = await newAccount("hold-leaver");
    const leaverCode = await joinProgram(leaver, `Hold Leaver ${stamp}`);
    const leaverMate = await newReferredAccount("hold-leaver-mate", leaverCode, `Hold Leaver Mate ${stamp}`);
    await orderFor(leaverMate, `AC-28 pending ${stamp}`, "accepted");
    const left = await leaver.ctx.delete("/api/account/payout-details");
    expect(left.ok(), `leave the program: ${await left.text()}`).toBeTruthy();

    const pending = (await referrerScreen(leaver)).payout.heldPendingDetails;
    expect(pending?.amount, "the API holds the earning at pending once the details are gone").toBeGreaterThan(0);

    await adopt(page, leaver);
    await open(page, "/referrals");
    await expect(page.getByRole("heading", { name: "Referrals", level: 1 })).toBeVisible();

    const detailsHold = page.getByText(/waiting on your payout details/i);
    await expect(detailsHold, "the hold is on the screen, not only in the response").toBeVisible();
    // Its own amount, and its own release — a minute of the referrer's own work.
    await expect(detailsHold).toContainText(money(pending!.amount));
    await expect(detailsHold).toContainText(/add your details back/i);

    // ── Hold 2 · confirmed, but under a threshold the owner has set ────────
    await page.context().clearCookies();
    const accruer = await newAccount("hold-accruer");
    const accruerCode = await joinProgram(accruer, `Hold Accruer ${stamp}`);
    const accruerMate = await newReferredAccount("hold-accruer-mate", accruerCode, `Hold Accruer Mate ${stamp}`);
    await orderFor(accruerMate, `AC-28 confirmed ${stamp}`, "paid");

    const confirmed = (await referrerScreen(accruer)).earnings.confirmed;
    expect(confirmed, "paid in full confirms the earning for a payable referrer").toBeGreaterThan(0);

    // The threshold is a FIXTURE INPUT, not an expectation: it is chosen above
    // the balance so the state exists at all, and both figures are then read
    // back off the API rather than typed into the assertion.
    await withProgram({ minPayoutBalance: Math.ceil(confirmed) + 100 }, async () => {
      const under = (await referrerScreen(accruer)).payout.heldUnderThreshold;
      expect(under, "a balance below the threshold is held").toBeTruthy();

      await adopt(page, accruer);
      await open(page, "/referrals");
      await expect(page.getByRole("heading", { name: "Referrals", level: 1 })).toBeVisible();

      const thresholdHold = page.getByText(/We send payments once that reaches/i);
      await expect(thresholdHold).toBeVisible();
      await expect(thresholdHold).toContainText(money(under!.balance));
      await expect(thresholdHold).toContainText(money(under!.threshold));

      // The two releases are nothing alike, and the copy must not borrow the
      // other one's: there is no action here, so nothing may ask for one.
      await expect(thresholdHold).not.toContainText(/payout details/i);
    });
  });
});

test.describe("voiding, from the console", () => {
  // AC-67 — THE SENTENCE THAT WOULD HAVE EXPOSED THE MISSING FIX.
  //
  // The criterion asks the confirmation to state what leaves the payable queue
  // AND what happens to quotes. The screen asked for a reason and offered a red
  // button, and said neither. That is not only a copy gap: nobody could write
  // the quotes half of the sentence truthfully, because voiding stripped nothing
  // from the drafts it was voiding — which is exactly why the sentence was
  // specified.
  //
  // ⚠️ THE BROWSER IS THE ONLY PLACE THIS IS VISIBLE. The confirmation exists
  // entirely in `src/ops/Referrals.tsx`; no API response contains a word of it,
  // so every node suite in the repo is blind to whether it says anything at all.
  //
  // The amount is READ from the ops list, never typed — and it is asserted with
  // the CENTS formatter, because this figure is somebody's commission arriving
  // in a bank account rather than an advertised threshold. Rounding it in a
  // sentence about money leaving a queue misstates the money.
  test("AC-67: the void confirmation names the amount leaving the queue and what happens to quotes", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const referrer = await newAccount("void-copy-referrer");
    const code = await joinProgram(referrer, `Void Copy Referrer ${stamp}`);
    const mate = await newReferredAccount("void-copy-mate", code, `Void Copy Mate ${stamp}`);
    await orderFor(mate, `AC-67 void copy ${stamp}`, "accepted");

    const list = await staff.get(`${BASE}/api/ops/referrals?q=${code}`, { headers: opsHeaders });
    expect(list.ok(), "GET /api/ops/referrals").toBeTruthy();
    const row = ((await list.json()).referrals as Record<string, any>[]).find((r) => r.code === code);
    expect(row?.earning?.amount, "the fixture only means something with money on the row").toBeGreaterThan(0);

    // The shared ops session, carried into the browser by hand: it was issued
    // against 127.0.0.1 with a Host header, and the console is served on the
    // ops.* name. Same trick as ops.spec.ts, and it spends no OTP budget.
    const { cookies } = await staff.storageState();
    const token = cookies.find((c) => c.name === "apertly_session")?.value;
    expect(token, "the ops session cookie").toBeTruthy();
    await page.context().addCookies([
      { name: "apertly_session", value: token as string, domain: "ops.localhost", path: "/" },
    ]);

    await page.goto(OPS_ORIGIN, { waitUntil: "domcontentloaded" });
    // Two buttons carry this name once the tab is open — the sidebar's and the
    // section's own sub-tab. Role and text, per house rule 4.
    await page.getByRole("button", { name: "Referrals", exact: true }).first().click();
    await page.getByRole("button", { name: "Referrals", exact: true }).last().click();
    await page.getByPlaceholder("Code, referrer or referred name").fill(code);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    // ⚠️ WAIT FOR THE LIST TO NARROW, not for the code to appear. The unfiltered
    // first load already contains this row, so asserting the code is visible
    // passes instantly and races the search's own fetch — which is how the first
    // run of this test ended up clicking into a list of eleven rows.
    await expect(page.getByRole("button", { name: "Void…" }), "the search narrowed to the one referral")
      .toHaveCount(1);
    await expect(page.getByText(code, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Void…" }).click();
    // The lead-in is emphasised, so text-matching it resolves to that element
    // alone; the sentence the criterion is about is its parent. Asserting on the
    // parent rather than on a regex that already contains the answer keeps the
    // assertions below from grading their own locator.
    const confirmation = page.getByText("Void this referral?", { exact: true }).locator("xpath=..");
    await expect(confirmation, "the destructive action confirms in words").toBeVisible();
    await expect(confirmation).toContainText(money(row!.earning.amount));
    await expect(confirmation).toContainText(/payable queue/i);
    // The second limb, and the one AC-67 names explicitly.
    await expect(confirmation).toContainText(/re-priced without the discount/i);
    await expect(confirmation).toContainText(/issued quote keeps its price/i);
  });
});
