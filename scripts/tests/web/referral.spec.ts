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
  return { ctx, email };
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
  return { ctx, email };
}

/** Build a real job for `who` and take it as far as `stop`.
 *
 *  Priced by the real estimator, issued by real ops, accepted by the customer,
 *  paid through the real stage machine. `qty` is what puts the order over the
 *  qualifying minimum — under it there is no earning at all (AC-18), which is a
 *  different fixture and a different test. */
async function orderFor(who: Identity, title: string, stop: "accepted" | "paid"): Promise<{ projectId: string; orderId: string }> {
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
    data: { contact: { name: title, email: who.email, postcode: "3072" } },
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
    const onFooterLinks = await page.getByRole("link", { name: /refer a mate/i }).count();
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

      expect(
        await page.getByRole("link", { name: /refer a mate/i }).count(),
        "AC-36: the footer link is untouched by the switch",
      ).toBe(onFooterLinks);

      // The framing the owner removed when he cut the third state: a paused
      // program is coming back, and must never claim otherwise.
      await expect(page.getByText(/has ended/i)).toHaveCount(0);
    });
  });
});
