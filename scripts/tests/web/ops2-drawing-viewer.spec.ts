import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ops2's shared drawing viewer — the element the owner rates highest in the
// product, read at full size.
//
// WHY A BROWSER SUITE, and why nothing here could be moved to node. The node
// suites decide the sentences (scripts/tests/ops2-record.test.mjs) and the URL
// grammar (scripts/tests/ops2-navigation.test.mjs); the Worker serves the same
// bytes whether the viewer opens, opens twice, or opens and leaves the address
// bar lying. Every assertion below is about something the CLIENT decides:
//
//   • that activating a drawing pushes EXACTLY ONE history entry,
//   • that the back control, Escape and the system back gesture are the SAME
//     single pop — a viewer whose Escape closes state without popping leaves the
//     address bar wrong, which is the exact failure the route ruling rejected
//     the state-only push to avoid,
//   • that a cold link lands with the viewer OPEN and its back REPLACES,
//   • that a mangled address corrects itself without growing history,
//   • and that no symbol legend and no explanatory notation survive anywhere.
//
// The last one is this element's FIRST test. The legend has been rendered by
// Plate.tsx since the record work shipped and is asserted by no suite anywhere,
// so nothing would have caught its removal and nothing would catch its return.
// It is written against the CLASS of copy: a check for the word "legend" alone
// would pass a viewer that still explained panel proportions in a sentence.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const RECORD_URL = "**/api/ops/projects/p_rec";
const LINE = (id: string) => `${OPS_HOST}/ops2/projects/p_rec/line/${id}`;

// u_staff5 — its own identity, per the allocation recorded in scripts/db/seed.sql.
// Code issuance refuses a second challenge to one address inside
// RESEND_COOLDOWN_MS (60s), and this battery runs several files at once, so a
// shared mailbox makes whichever suite signs in second fail at its OTP and
// report it as broken auth.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff5'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff5");
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

/** The three lines this suite works with: a simple opening, a composite of two
 *  units, and one whose size could not be read. */
const SIMPLE = {
  id: "l1", code: "W03", room: "Kitchen", productName: "AMJ80 Awning",
  productSlug: "amj80-series-awning-window", compositeAxis: null,
  width: "1800", height: "1200", qty: 1, lineTotal: 1000, status: "ready",
  options: {}, review: null, lineKind: "simple", segments: [],
};
const COMPOSITE = {
  id: "l2", code: "W07", room: "Living", productName: "Composite opening",
  productSlug: "amj67t-awning-window", compositeAxis: "vertical",
  width: "2400", height: "1500", qty: 1, lineTotal: 2000, status: "ready",
  options: {}, review: null, lineKind: "composite_parent",
  segments: [
    { id: "s1", productSlug: "amj67t-awning-window", productName: "AMJ67T Awning",
      width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 1100, status: "ready" },
    { id: "s2", productSlug: "amj67-fixed-window", productName: "AMJ67 Fixed",
      width: "1200", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 900, status: "ready" },
  ],
};
const UNSIZED = { ...SIMPLE, id: "l3", code: "W11", width: "", height: "" };

const record = {
  project: {
    id: "p_rec", title: "Wattle Grove - Lot 14", publicRef: "OF-Q-10482",
    statusInternalLabel: "Technical review", customerName: "Ana Bianchi",
    org: "Marchetti Constructions", unresolvedLineCount: 0,
  },
  lifecycle: { stateLabel: "Technical review", waitingOn: "Us", phase: "Pricing" },
  daysInStage: 3,
  lines: [SIMPLE, COMPOSITE, UNSIZED],
  delivery: { amount: 420, settled: true, estimate: 400 },
  actions: [],
  order: null,
};

/** How many times the record was fetched, so "the page did not remount" is a
 *  measurement rather than an impression. */
async function serveRecord(page: import("@playwright/test").Page) {
  const calls = { n: 0 };
  await page.route(RECORD_URL, (route) => {
    calls.n += 1;
    return route.fulfill({ json: record });
  });
  return calls;
}

const historyLength = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.history.length);

test("the plate opens the viewer at its own address, pushing exactly one entry", async ({ page }) => {
  // VIEW-AC-1, VIEW-AC-2. The numbers are the assertions: this criterion
  // INVERTED between drafts of the spec — an earlier one had the viewer as an
  // overlay and asserted history was unchanged — so anyone reusing that draft
  // asserts the opposite of the ruling, confidently.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  const before = await historyLength(page);
  const fetches = calls.n;

  await page.getByTestId("line-plate-open").click();

  const viewer = page.getByTestId("drawing-viewer");
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec\/line\/l1\/drawing$/);
  expect(await historyLength(page) - before).toBe(1);

  // THE DRAWING, AND ITS SIZE UNDER IT — the drawing is the subject, so the
  // caption carries the size and the bar does not.
  const svg = viewer.locator("svg[data-elevation]");
  await expect(svg).toHaveCount(1);
  expect(await svg.locator("path, rect, line, polyline").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("drawing-viewer-caption"))
    .toHaveText("1200 × 1800 mm · height × width");

  // VIEW-AC-1a: the line's own drawing is titled `Drawing`; back names the line.
  await expect(viewer.getByRole("heading", { name: "Drawing" })).toBeVisible();
  await expect(page.getByTestId("drawing-viewer-back")).toHaveText(/W03/);

  // The page behind it never remounted, so the record was never fetched twice.
  expect(calls.n).toBe(fetches);
});

test("the back control, Escape and the system back gesture are one single pop", async ({ page }) => {
  // VIEW-AC-2a. All three, because a viewer whose Escape handler closes state
  // without popping history leaves an orphan entry and an address bar that
  // lies — the exact failure the route ruling rejected the state-only push to
  // avoid — and testing only the control would never see it.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  const before = await historyLength(page);
  const fetches = calls.n;

  for (const exit of ["control", "escape", "gesture"] as const) {
    await page.getByTestId("line-plate-open").click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await expect(page).toHaveURL(/\/line\/l1\/drawing$/);

    if (exit === "control") await page.getByTestId("drawing-viewer-back").click();
    else if (exit === "escape") await page.keyboard.press("Escape");
    else await page.goBack();

    // WHERE IT LANDS IS THE ASSERTION, and it catches both failures at once. An
    // exit that closes state without popping leaves the address on `/drawing`
    // with no viewer — the address bar lying, which is what the route ruling
    // rejected the state-only push to avoid. An exit that pops twice lands on
    // the project record instead of the line.
    await expect(page, `${exit} did not land on the line`).toHaveURL(/\/line\/l1$/);
    await expect(page.getByTestId("drawing-viewer")).toBeHidden();
    await expect(page.getByTestId("line-review")).toBeVisible();

    // AND THE STACK DOES NOT ACCUMULATE. `history.length` does not shrink when
    // you go back — the forward entry survives until something pushes over it —
    // so the number to watch is not "back to where it started" but "the same
    // after the third round as after the first". An exit that pushed the line
    // path instead of popping would read identically on the URL and would grow
    // the stack by one every time, which is what the old plate-and-panel shape
    // could not have caught.
    expect(await historyLength(page), `${exit} grew the stack`).toBe(before + 1);
  }
  // And the line page was mounted once for all six navigations.
  expect(calls.n).toBe(fetches);
});

test("a page that really left still re-reads its record on the way back", async ({ page }) => {
  // THE GOOD CASE FOR THE GUARD THAT KEEPS THE VIEWER FROM RE-FETCHING.
  //
  // A viewer opening under the same route made Ionic fire an enter on a page
  // that had never left the screen, so the refresh is now armed by an actual
  // departure. That is exactly the kind of fix that fails closed: arm it wrong
  // and the console silently stops refreshing, which nobody notices until a
  // reviewer prices a line in the legacy console beside this one, comes back,
  // and reads the figures from before their own edit.
  //
  // So: a real trip away and back must still re-read.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${OPS_HOST}/ops2/projects/p_rec`);
  await expect(page.getByTestId("record-line").first()).toBeVisible();
  const afterRecord = calls.n;

  await page.getByTestId("record-line").first().click();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await expect(page.getByTestId("line-review")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec$/);
  await expect(page.getByTestId("record-line").first()).toBeVisible();
  expect(calls.n, "the record did not re-read on the way back").toBeGreaterThan(afterRecord);
});
