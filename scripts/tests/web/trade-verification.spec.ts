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

/** The percentage sweep (AC-P2-47). A customer surface may never carry a `%`, a
 *  spelled-out rate, or the comparative framing the owner retired: "trade
 *  pricing" is the NAME of the thing, never a deduction (§18.0 rule 1). */
async function expectNoPercentage(page: Page, where: string): Promise<void> {
  const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
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
