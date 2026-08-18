// ═══════════════════════════════════════════════════════════════════════════════
// TESTER FINDING — registration Phase 1, the disabled Submit with no stated cause.
//
// RED ON PURPOSE. Written by the tester against commit 5fa5f0a6 and handed to the
// developer with the finding; it is not a passing regression guard yet.
//
// WHAT IT CATCHES. A returning customer whose account is complete — name, phone,
// street address, suburb, state, postcode all stored — reaches the review screen
// and finds Submit **disabled**, because `submitDisabled` includes
// `postcode.length !== 4` (src/components/QuoteReviewSubmit.tsx:392-394) and the
// per-project delivery postcode starts empty for a signed-in visitor: stage 0,
// the only surface that captures a pre-gate postcode, renders only when
// `user == null` (design §16.1), so `carriedPostcode` is never set for them, and
// a draft never carries a stored `delivery_postcode` (it is written once, by the
// submit statement that also leaves draft — worker/routes/quote.ts:267-269).
//
// The "Still needed:" caption is driven by `submitMissing`, which covers ACCOUNT
// fields only (QuoteReviewSubmit.tsx:756-760), so it renders nothing here. The
// customer is left with a dead button and no sentence anywhere saying why.
//
// WHY THIS ASSERTION AND NOT "SUBMIT MUST BE ENABLED". AC-14 ("Submit is
// reachable with no further typing") and the approved mock's Surface 6
// ("one-action submit") say the button should be live on arrival; AC-42 / MG-2
// says the delivery postcode must never be guessed. Which of those gives way is
// an owner decision, not a tester's. This test asserts only the part that is
// wrong under EITHER resolution, and that the spec already requires of the
// screen (AC-17, design §16.5.4): when Submit is disabled, the outstanding work
// is named in a caption above it.
//
// RESOLVED (owner, 2026-08-19): delivery gives way to nothing — it starts blank
// every project, because a business customer is expected never to deliver to the
// same address twice. AC-14 becomes ONE FIELD, ONE PRESS: the customer types the
// site, and the caption must name delivery while it is the gap. The conditional
// above is therefore now unconditional in practice, and the second half of this
// file pins the resolution rather than the ambiguity.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const stamp = Date.now().toString(36);
let seq = 0;
const freshEmail = () => `gatecap-${stamp}-${seq++}@example.com`;
// Its own source address: code issuance is capped per source as well as per
// recipient, and the whole browser suite otherwise shares one bucket.
let ip = 0;
const nextIp = () => `198.24.0.${ip++ % 250}`;

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

async function signedInWithCompleteAccount(ctx: APIRequestContext): Promise<void> {
  const email = freshEmail();
  const challenge = await ctx.post("/api/auth/challenge", { data: { email }, headers: { "X-Forwarded-For": nextIp() } });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  expect((await ctx.post("/api/auth/verify", { data: { email, code: devCode } })).ok()).toBeTruthy();
  expect((await ctx.post("/api/auth/profile", { data: COMPLETE })).ok(), "the account is complete").toBeTruthy();
}

async function openReview(page: Page): Promise<void> {
  await page.goto("/quote");
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toBeVisible({ timeout: 30_000 });
  const go = bar.getByRole("button", { name: /Submit for technical review/ });
  await expect(go).toBeEnabled({ timeout: 30_000 });
  await go.click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
}

test("a disabled Submit always names what is outstanding", async ({ page }) => {
  await signedInWithCompleteAccount(page.request);
  const saved = await page.request.put("/api/projects/current/lines", {
    data: { title: `Gate caption ${stamp}`, items: [A_LINE] },
  });
  expect(saved.ok(), `save lines: ${await saved.text()}`).toBeTruthy();

  await openReview(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();

  const submit = page.getByRole("button", { name: /Submit for technical review/ });
  // Nothing about the ACCOUNT is outstanding — every stored value arrived.
  await expect(page.getByLabel("Full name")).toHaveValue(COMPLETE.name);
  await expect(page.getByLabel("Postcode", { exact: true })).toHaveValue(COMPLETE.addressPostcode);
  // …and the delivery postcode is blank, correctly (AC-42 / MG-2).
  await expect(page.getByLabel("Delivery postcode")).toHaveValue("");

  if (await submit.isDisabled()) {
    await expect(
      page.getByText(/^Still needed:/),
      "Submit is disabled and no caption above it says why — AC-17 / design §16.5.4 require the outstanding work to be named",
    ).toBeVisible();
  }

  // The owner's resolution, pinned: the ONE outstanding thing is the delivery
  // destination, the caption says so by name, and nothing about the account is
  // listed beside it — every stored value arrived.
  const caption = page.getByText(/^Still needed:/);
  await expect(caption).toHaveText("Still needed: delivery postcode.");

  // One field, one press.
  await page.getByLabel("Delivery postcode").fill("3072");
  await expect(caption).toHaveCount(0);
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();
});

// The account half of the same caption still works — a gap there is named with
// the delivery gap, in form order, so the customer sees one list and not two.
test("account gaps and the delivery gap are named together, in form order", async ({ page }) => {
  const email = `gatecap-partial-${stamp}-${seq++}@example.com`;
  const challenge = await page.request.post("/api/auth/challenge", { data: { email }, headers: { "X-Forwarded-For": nextIp() } });
  const { devCode } = await challenge.json();
  expect(devCode, `dev OTP for ${email}`).toBeTruthy();
  expect((await page.request.post("/api/auth/verify", { data: { email, code: devCode } })).ok()).toBeTruthy();
  // Everything but the phone, so exactly one account field is outstanding.
  expect((await page.request.post("/api/auth/profile", {
    data: {
      name: COMPLETE.name, addressLine1: COMPLETE.addressLine1,
      addressSuburb: COMPLETE.addressSuburb, addressState: COMPLETE.addressState,
      addressPostcode: COMPLETE.addressPostcode,
    },
  })).ok()).toBeTruthy();

  const saved = await page.request.put("/api/projects/current/lines", {
    data: { title: `Gate caption partial ${stamp}`, items: [A_LINE] },
  });
  expect(saved.ok(), `save lines: ${await saved.text()}`).toBeTruthy();

  await openReview(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText(/^Still needed:/)).toHaveText("Still needed: phone, delivery postcode.");
});
