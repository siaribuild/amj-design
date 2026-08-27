import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ops2's project record — the defects reported from owner testing.
//
// WHY A BROWSER SUITE, AND WHY IT COULD ONLY EVER BE ONE. Every criterion in
// `docs/specs/ops2-record-feedback.md` is geometry, paint order or a computed
// colour: a band's rest position, a tint against its neighbours, a figure that
// is not painted over, a leading edge that survives a hover. The Worker serves
// byte-identical HTML in every one of those states, so the node suites cannot
// see any of it — which is exactly how the eight got to the owner.
//
// The measurements are numbers, not screenshots. A screenshot diff would fail
// on a font hint and pass on a 16px offset; these assert the fact each
// criterion actually states.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const RECORD_URL = "**/api/ops/projects/p_rec";
const RECORD = `${OPS_HOST}/ops2/projects/p_rec`;
const QUEUE = `${OPS_HOST}/ops2/projects`;

// u_staff6 — ITS OWN IDENTITY, for the reason ops2-record.spec.ts records at
// length: code issuance refuses a second challenge to one address inside
// RESEND_COOLDOWN_MS (60s) and this battery runs several files at once, so a
// shared mailbox makes whichever file signs in second fail at its OTP and
// report it as broken auth. seed.sql records the allocation beside the rows.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff6'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff6");
  return email;
})();

let staffCookies: Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>> = [];

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/ops/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/ops/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, STAFF_EMAIL);
  if (ok) throw new Error(String(ok));
  staffCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => { await context.addCookies(staffCookies); });

/** The body `GET /api/ops/projects/:id` returns, in its own shape. */
const line = (over: Record<string, unknown> = {}) => ({
  id: "l1", code: "W01", room: "Kitchen", productName: "Awning 600",
  width: "1200", height: "900", qty: 1, lineTotal: 1000, status: "ready",
  options: {}, review: null, lineKind: "simple", segments: [], ...over,
});

const record = (over: Record<string, unknown> = {}) => ({
  project: {
    id: "p_rec", title: "Wattle Grove - Lot 14", publicRef: "OF-Q-10482",
    statusInternalLabel: "Technical review", customerName: "Ana Bianchi",
    org: "Marchetti Constructions", unresolvedLineCount: 0,
  },
  lifecycle: { stateLabel: "Technical review", waitingOn: "Us", phase: "Pricing" },
  daysInStage: 3,
  lines: [line()],
  delivery: { amount: 420, settled: true, estimate: 400 },
  actions: [],
  order: null,
  ...over,
});

/** The band's resting position, measured the way the criteria state it: the top
 *  of its box at scroll 0. Everything inside the band moves with it, so this one
 *  number is what "the header sits lower" reduces to. */
const bandTop = (page: import("@playwright/test").Page) =>
  page.locator(".ops2-page__band").evaluate((el) => el.getBoundingClientRect().top);

test("FB-AC-10 — the record's band rests where every other surface's band rests", async ({ page }) => {
  // THE DEFECT. The band is pulled up by its own negative margin so the white
  // bleeds under the status bar. The record is the only surface that pins it,
  // and `position: sticky; top: 0` clamps that bleed away — so the record's
  // header, and everything in it, sat 16px lower than the queue's and the line
  // page's. Measured at 900px before the fix: queue -16, record 0.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record() }));
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(QUEUE);
  await expect(page.locator(".ops2-page__band")).toBeVisible();
  const queue = await bandTop(page);

  await page.goto(RECORD);
  // Wait for the record itself: `bandPinned` is gated on it, so measuring
  // during the skeleton would measure the unpinned band and pass on a surface
  // that still jumps.
  await expect(page.getByTestId("record-identity")).toBeVisible();
  const recordTop = await bandTop(page);

  expect(recordTop).toBeCloseTo(queue, 0);

  // AND IT IS THE NEGATED INSET, not merely equal to a number that happens to
  // match. Two surfaces agreeing on the wrong value is the failure this pins.
  //
  // MEASURED OFF `margin-top`, NOT off `--ops2-band-top`. A custom property's
  // computed value is its token text — `calc(16px + 0px)` — and `parseFloat` of
  // that is NaN, which compares false against everything and would have made
  // this assertion unfailable in the other direction. The margin is the same
  // quantity as a used value in pixels, and it is the pull itself rather than
  // the variable the pull is written from.
  const pull = await page.locator(".ops2-page__band").evaluate((el) =>
    parseFloat(getComputedStyle(el).marginTop));
  expect(pull).toBeLessThan(0);
  expect(recordTop).toBeCloseTo(pull, 0);
});

test("FB-AC-11 — the band does not move when the record lands", async ({ page }) => {
  // THE SECOND SYMPTOM OF THE SAME LINE. `bandPinned={!!record}` is false while
  // loading, so the pin — and its clamp — arrived with the data and the whole
  // header jumped down 16px in front of the reader.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(RECORD_URL, async (route) => {
    await held;
    await route.fulfill({ json: record() });
  });
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(RECORD);
  await expect(page.getByTestId("record-skeleton")).toBeVisible();
  const loading = await bandTop(page);

  release();
  await expect(page.getByTestId("record-identity")).toBeVisible();
  const loaded = await bandTop(page);

  expect(loaded).toBeCloseTo(loading, 0);
});

test("FB-AC-12 — and it still sticks", async ({ page }) => {
  // The pin is not being removed — it is the reason a reviewer twelve lines
  // down still has the total, the tabs and the attention row. A fix that made
  // the rest position right by unpinning would pass FB-AC-10 and destroy the
  // thing the band exists for.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: Array.from({ length: 18 }, (_, i) =>
      line({ id: `l${i}`, code: `W${String(i).padStart(2, "0")}` })),
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(RECORD);
  await expect(page.getByTestId("record-identity")).toBeVisible();

  await page.locator("ion-content.ops2-page").evaluate(async (el) => {
    const scroller = await (el as HTMLIonContentElement).getScrollElement();
    scroller.scrollTop = 400;
  });
  await expect.poll(async () =>
    page.locator(".ops2-page__band").evaluate((el) => el.getBoundingClientRect().bottom),
  ).toBeGreaterThan(0);

  await expect(page.getByTestId("record-identity")).toBeVisible();
  await expect(page.getByTestId("record-tab").first()).toBeVisible();
});
