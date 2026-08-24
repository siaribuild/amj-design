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

test("the drawing takes the size the VIEWPORT allows, at every viewport", async ({ page }) => {
  // VIEW-AC-1, and the half of it a single-width test cannot see. The rule was
  // headed "the largest size the viewport allows" and capped the drawing at a
  // fixed 720px column, so 1280, 1600, 1920 and 2560 all drew the same 720×503
  // — 28% of a desk monitor. THREE widths, because one proves nothing about a
  // constant and two could still be a step.
  await serveRecord(page);
  const drawn: { width: number; height: number; viewport: number }[] = [];
  for (const [width, height] of [[1280, 900], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    await page.goto(LINE("l1"));
    await expect(page.getByTestId("line-review")).toBeVisible();
    await page.getByTestId("line-plate-open").click();
    const svg = page.getByTestId("drawing-viewer").locator("svg[data-elevation]");
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    if (!box) throw new Error(`no box for the drawing at ${width}×${height}`);
    drawn.push({ width: box.width, height: box.height, viewport: width });
    // And it never runs past the edge it was fitted to.
    expect(box.width).toBeLessThanOrEqual(width);
  }

  // AND THE BOX IS THE DRAWING. `width: 100%` with a height cap passes every
  // assertion below while the drawing sits letterboxed inside an element twice
  // its width — the measurement would be of the container, not the ink. The
  // drawing's own proportion is the tell: it is constant when the box is tight
  // and tracks the viewport when it is not.
  const ratio = drawn.map((d) => d.width / d.height);
  for (const r of ratio) expect(Math.abs(r - ratio[0])).toBeLessThan(0.05);

  // Strictly larger every time — a constant fails on the first comparison, and
  // a cap that binds from the second viewport up fails on the second.
  for (let i = 1; i < drawn.length; i += 1) {
    expect(drawn[i].height,
      `${drawn[i].viewport}px must draw taller than ${drawn[i - 1].viewport}px`)
      .toBeGreaterThan(drawn[i - 1].height + 50);
    expect(drawn[i].width).toBeGreaterThan(drawn[i - 1].width + 50);
  }
  // A desk monitor gets a drawing worth the name, not a column out of a mock.
  expect(drawn[drawn.length - 1].width).toBeGreaterThan(900);
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

test("a cold drawing link lands with the viewer open, and its back REPLACES to the line", async ({ page }) => {
  // VIEW-AC-2b. The pasted link, the emailed link, the refresh. Back must land
  // the reviewer on the line page rather than throwing them out of the console
  // — and it must REPLACE rather than push, or back from the line would return
  // to the drawing it just left.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${LINE("l1")}/drawing`);

  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page.getByTestId("drawing-viewer-caption"))
    .toHaveText("1200 × 1800 mm · height × width");
  const before = await historyLength(page);

  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await expect(page.getByTestId("line-review")).toBeVisible();
  // REPLACED, not pushed: the stack did not grow.
  expect(await historyLength(page)).toBe(before);
});

test("a malformed or out-of-range unit suffix normalises by replace, growing no history", async ({ page }) => {
  // VIEW-AC-2c. Each case lands somewhere real; none of them leaves an entry
  // behind, or back would return to the address that was just corrected.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Out of range on a composite of two → the opening's own drawing, because
  // that is still a drawing address and the reviewer asked for a drawing.
  await page.goto(`${LINE("l2")}/drawing/u9`);
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page.getByTestId("drawing-viewer-units")).toBeVisible();

  // Malformed under /drawing → still a drawing address.
  await page.goto(`${LINE("l2")}/drawing/uX`);
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);

  // A unit ordinal on a SIMPLE opening names nothing on that line.
  await page.goto(`${LINE("l1")}/drawing/u1`);
  await expect(page).toHaveURL(/\/line\/l1\/drawing$/);

  // Outside the grammar entirely → the line page, and no viewer. `/why` is
  // phase 3b's segment and is deliberately in this list: until it is served it
  // must land somewhere real rather than on a blank child.
  for (const stray of ["nonsense", "why"]) {
    await page.goto(`${LINE("l1")}/${stray}`);
    await expect(page).toHaveURL(/\/line\/l1$/);
    await expect(page.getByTestId("line-review")).toBeVisible();
    await expect(page.getByTestId("drawing-viewer")).toBeHidden();
  }

  // AND THE CORRECTION PUSHED NOTHING. One entry for the visit, not two — back
  // from a corrected address must leave, never bounce off the correction.
  const before = await historyLength(page);
  await page.goto(`${LINE("l2")}/drawing/u9`);
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
  expect(await historyLength(page)).toBe(before + 1);
});

test("a composite opens as the whole assembly, and each unit opens alone at its own address", async ({ page }) => {
  // VIEW-AC-3 and VIEW-AC-4.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l2"));
  await expect(page.getByTestId("line-units")).toBeVisible();

  await page.getByTestId("line-plate-open").click();
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
  const viewer = page.getByTestId("drawing-viewer");
  await expect(page.getByTestId("drawing-viewer-caption")).toHaveText(
    "1500 × 2400 mm overall · height × width · drawn from its 2 units of 1500 × 1200 mm");
  // The units list moves here from the old side-panel enlargement: it belongs
  // with the enlarged drawing rather than beside a summary.
  const units = page.getByTestId("drawing-viewer-units");
  await expect(units).toContainText("W07A");
  await expect(units).toContainText("W07B");
  // EACH UNIT'S OWN SIZE IS ON THE DRAWING, beside the overall — the owner
  // asked for both, and it is what makes the proportion legible without a
  // sentence explaining it.
  const numbers = await viewer.locator("svg[data-elevation] text.elev-dim").allTextContents();
  expect(numbers).toEqual(["1200", "1200", "2400", "1500"]);

  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l2$/);

  // The whole unit row is the opener — one target, not a control inside it.
  await page.getByTestId("line-unit-open").nth(1).click();
  await expect(page).toHaveURL(/\/line\/l2\/drawing\/u2$/);
  await expect(viewer.getByRole("heading", { name: "W07B" })).toBeVisible();
  await expect(page.getByTestId("drawing-viewer-caption")).toHaveText(
    "W07B · 1500 × 1200 mm · unit 2 of 2 in W07, which is 1500 × 2400 mm overall");
  // A unit is one frame: it lists no assembly of its own.
  await expect(page.getByTestId("drawing-viewer-units")).toHaveCount(0);
  // And back still returns to the LINE, not to the parent drawing — one pop out
  // of the tree, from wherever in it you are standing.
  await expect(page.getByTestId("drawing-viewer-back")).toHaveText(/W07/);
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l2$/);
});

test("leaving a line from an enlarged drawing takes two backs, and that is correct", async ({ page }) => {
  // VIEW-AC-2d. The agreed cost of the tree ruling, named to the owner in the
  // question he answered and accepted. It is asserted so that nobody "fixes"
  // it: a viewer that collapsed the two steps would pass every other test here.
  await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${OPS_HOST}/ops2/projects/p_rec`);
  await expect(page.getByTestId("record-line").first()).toBeVisible();
  await page.getByTestId("record-line").first().click();
  await expect(page).toHaveURL(/\/line\/l1$/);

  await page.getByTestId("line-plate-open").click();
  await expect(page).toHaveURL(/\/line\/l1\/drawing$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec$/);
});

test("an opening with no size is drawn as a stand-in, with no leaders and the sentence that says so", async ({ page }) => {
  // VIEW-AC-8. A drawing may be indicative; a dimension may not. The sentence
  // stays under R25 because it states what the drawing is WORTH rather than
  // how to read it.
  await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${LINE("l3")}/drawing`);

  const viewer = page.getByTestId("drawing-viewer");
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId("drawing-viewer-caption"))
    .toHaveText("No size read for this opening — drawn as a square stand-in");
  await expect(viewer.locator("svg[data-elevation] text.elev-dim")).toHaveCount(0);
  await expect(viewer.locator("svg[data-elevation]")).toHaveAttribute("data-unsized", "");
});

test("no symbol legend and no explanation of the notation survives anywhere in ops2", async ({ page }) => {
  // VIEW-AC-10, and this element's FIRST test. The legend had been rendered by
  // the line plate since the record work shipped and was asserted by no suite
  // anywhere — so nothing would have caught its removal, and nothing would
  // catch its return.
  //
  // Written against the CLASS of copy, because a check for the word "legend"
  // alone would pass a viewer that still explained panel proportions in a
  // sentence. Statements about the drawing's AUTHORITY are a different thing
  // and must remain — they say what the drawing is worth, not how to read it.
  const NOTATION = [
    /solid V/i, /dashed V/i, /apex/i, /opens towards you/i, /opens away from you/i,
    /direction of travel/i, /unmarked/i, /hinge edge/i,
    /in proportion/i, /proportional/i, /panel widths/i,
  ];
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const url of [
    `${OPS_HOST}/ops2/projects/p_rec`,
    LINE("l1"), `${LINE("l1")}/drawing`,
    LINE("l2"), `${LINE("l2")}/drawing`, `${LINE("l2")}/drawing/u1`,
  ]) {
    await page.goto(url);
    await expect(page.locator("ion-app")).toBeVisible();
    const text = await page.evaluate(() => document.body.innerText);
    for (const pattern of NOTATION) {
      expect(text, `${url} still teaches the notation: ${pattern}`).not.toMatch(pattern);
    }
    // And the legend's own markup is gone, not merely hidden.
    await expect(page.locator(".elev-legend")).toHaveCount(0);
  }

  // THE AUTHORITY STATEMENT STAYS. A scan that deleted the sentence along with
  // the key would be removing the one thing the drawing owes the reviewer.
  await page.goto(`${LINE("l2")}/drawing`);
  await expect(page.getByTestId("drawing-viewer-units"))
    .toContainText("Indicative arrangement — the mullion positions are confirmed on technical review.");
});

test("a keyboard-only reviewer opens the viewer, lands on back, and returns to the drawing they left", async ({ page }) => {
  // VIEW-AC-7. The opener is a real button with a real name, so Enter works and
  // focus has somewhere to return to — the page never remounts, so the control
  // that opened the viewer is still there to receive it.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();

  const opener = page.getByTestId("line-plate-open");
  await expect(opener).toHaveAttribute("aria-label", "Enlarge the drawing of W03");
  await opener.focus();
  await page.keyboard.press("Enter");

  const viewer = page.getByTestId("drawing-viewer");
  await expect(viewer).toBeVisible();
  // The accessible name carries WHICH drawing this is — "a dialog" would tell a
  // screen reader that something opened and nothing about what.
  await expect(viewer).toHaveAttribute("aria-label", "Drawing of W03");
  // Focus is inside the viewer, and the back control is the first stop.
  await expect(page.getByTestId("drawing-viewer-back")).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/line\/l1$/);
  // The outlet keeps the leaving page in the DOM until its transition finishes,
  // so the line body is briefly there twice. Settle before asking about focus —
  // the alternative is an assertion that races Ionic's animation.
  await expect(page.getByTestId("line-review")).toHaveCount(1);
  await expect(opener).toBeFocused();
  // AND STILL ONE READ. A second mounted page would have fetched the record
  // again; this is the measurement that tells a transient DOM duplicate apart
  // from a page that really remounted.
  expect(calls.n).toBe(1);
});

test("the unit row is ONE target, at least 44px tall, and contains no other control", async ({ page }) => {
  // The interaction spec's constraint on the opener, asserted rather than
  // remembered: a button inside a button is invalid markup and the inner one is
  // unreachable, so the row is checked for a second control rather than trusted
  // not to grow one.
  await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(LINE("l2"));

  const rows = page.getByTestId("line-unit-open");
  await expect(rows).toHaveCount(2);
  for (const i of [0, 1]) {
    const row = rows.nth(i);
    const box = await row.boundingBox();
    expect(box!.height, "a unit row is a hit target").toBeGreaterThanOrEqual(44);
    expect(await row.locator("button, a, input, select, [tabindex]").count(),
      "a control inside the opener would be unreachable").toBe(0);
  }
  // The purpose is named AND the row's own words survive — the unit's spec, its
  // size and the customer's note exist nowhere else in ops2, so an aria-label
  // replacing them with four words would be a loss rather than a label.
  await expect(rows.nth(0)).toHaveAccessibleName(/Enlarge the drawing of W07A/);
  await expect(rows.nth(0)).toHaveAccessibleName(/AMJ67T Awning/);
});

test("the record list's row glyph still opens the line, and never the viewer", async ({ page }) => {
  // VIEW-AC-9, a negative. The row is already ONE navigation target; a second
  // target inside it would undo an approved criterion of the record spec — and
  // the drawing in a 46px glyph is not the drawing as a subject.
  await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${OPS_HOST}/ops2/projects/p_rec`);

  const row = page.getByTestId("record-line").first();
  await row.locator("svg").first().click();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await expect(page.getByTestId("drawing-viewer")).toBeHidden();
});

test("a drawing URL for a line this project does not have refuses exactly as a missing one does", async ({ page }) => {
  // X-AC-4, for the addresses this phase adds. The new URLs must not become the
  // cheap way to ask whether a line exists: they resolve their line through the
  // record fetch the page already made, so "belongs to another project" and
  // "does not exist" are the SAME code path and say the same sentence.
  //
  // Asserted as a byte comparison of what the reader is shown, because a probe
  // learns from a DIFFERENCE — two refusals that merely both refuse would still
  // leak if one of them were phrased more specifically than the other.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  const refusals: string[] = [];
  // `l_other` stands for a line on a different project; `l_nope` for one that
  // exists nowhere. The record for p_rec contains neither, which is the whole
  // mechanism: absence from this project's record is indistinguishable from
  // absence from the database.
  for (const lineId of ["l_other", "l_nope"]) {
    for (const suffix of ["/drawing", "/drawing/u1"]) {
      await page.goto(`${LINE(lineId)}${suffix}`);
      // The suffix normalises away rather than opening a viewer over nothing.
      await expect(page).toHaveURL(new RegExp(`/line/${lineId}$`));
      await expect(page.getByTestId("drawing-viewer")).toBeHidden();
      const refusal = page.getByTestId("line-not-found");
      await expect(refusal).toBeVisible();
      refusals.push((await refusal.innerText()).trim());
    }
  }
  expect(new Set(refusals).size, "the refusals differ, so a probe can tell them apart").toBe(1);
});

// ── §8.1 — the project record's desk canvas as an opener surface ─────────────
//
// VIEW-AC-13…17, added at revision 16 after the tester found this journey
// shipped with no criterion and no test. It is the SECOND of exactly two ways
// into the viewer, and the one whose back control goes somewhere else: from the
// canvas the reviewer returns to the RECORD, never to a line page they never
// visited. Everything here is a client decision — which surface pushed, what the
// label says, what the canvas shows on the way back — so the Worker serves the
// same bytes whether it works or not (VIEW-AC-17).

const RECORD_PAGE = `${OPS_HOST}/ops2/projects/p_rec`;
const PROJECT_TITLE = record.project.title;

/** The canvas's own copy of a control. A popped LinePage stays in Ionic's view
 *  stack with its body hidden, so the bare test id matches twice after a round
 *  trip; the canvas is the one the reviewer is looking at. */
const canvasPlate = (page: import("@playwright/test").Page) =>
  page.getByTestId("record-canvas").getByTestId("line-plate-open");
const canvasUnit = (page: import("@playwright/test").Page, i: number) =>
  page.getByTestId("record-canvas").getByTestId("line-unit-open").nth(i);

/** The record at desk width with the composite selected in the canvas. */
async function canvasWithComposite(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RECORD_PAGE);
  await expect(page.getByTestId("record-canvas")).toBeVisible();
  await page.getByTestId("record-line").nth(1).click();
  await expect(page.getByTestId("record-line").nth(1)).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("line-review")).toBeVisible();
}

test("the desk canvas opens the ONE viewer at the line's own address", async ({ page }) => {
  // VIEW-AC-13. The canvas renders the same LineReview body, so its plate and
  // its unit rows are enlargeable there too — and they reach the SAME viewer at
  // the SAME grammar (D9), not a second unrouted copy over the record.
  await serveRecord(page);
  await canvasWithComposite(page);
  const before = await historyLength(page);

  await canvasPlate(page).click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec\/line\/l2\/drawing$/);
  expect(await historyLength(page) - before, "one entry, not two").toBe(1);
  // ONE viewer in the document, whichever surface opened it (VIEW-AC-5).
  expect(await page.getByTestId("drawing-viewer").count()).toBe(1);

  // And a unit row of the same composite opens that unit's own address.
  //
  // "Exactly one entry" is asserted here as ONE POP GETS HOME rather than as a
  // `history.length` delta, because the delta stops meaning that once a back has
  // happened in this page session: the forward entry survives, and a push over
  // it leaves the length unchanged. The property that matters is the one a
  // reviewer feels, and it is the same claim.
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/projects\/p_rec$/);
  await canvasUnit(page, 1).click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l2\/drawing\/u2$/);
  await expect(page.getByTestId("drawing-viewer").getByRole("heading", { name: "W07B" }))
    .toBeVisible();
  await page.goBack();
  await expect(page, "one pop returns to the record, so exactly one was pushed")
    .toHaveURL(/\/projects\/p_rec$/);
});

test("the line page left behind by a canvas enlargement is hidden, controls and all",
  async ({ page }) => {
    // FOUND BY THE SUITE ABOVE, and worth its own assertion. The canvas journey
    // mounts a LinePage over the record and pops it again, and Ionic keeps the
    // popped page in its view stack — so the document ends up holding TWO
    // controls named "Enlarge the drawing of W07". Duplicated accessible names
    // on one screen are a real defect if the leftover is reachable; Ionic's
    // `ion-page-hidden` (display: none) is what keeps it out of the tree, and
    // nothing else asserts that it is applied.
    await serveRecord(page);
    await canvasWithComposite(page);
    await canvasPlate(page).click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await page.getByTestId("drawing-viewer-back").click();
    await expect(page).toHaveURL(/\/projects\/p_rec$/);

    // However many copies the stack holds, exactly one may be REACHABLE — which
    // is the same thing as saying exactly one is in the accessibility tree.
    //
    // POLLED, because during the dismiss both pages are genuinely laid out:
    // measured mid-transition, both plates carried real boxes and neither page
    // was `aria-hidden`, `inert` or `ion-page-hidden`. That is the animation,
    // not the resting state, and a single-shot read of it fails on a build that
    // is perfectly correct a frame later. What must be true is that it SETTLES.
    const plates = page.getByTestId("line-plate-open");
    await expect.poll(() => plates.evaluateAll(
      (els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length),
    { message: "two enlargeable plates stay reachable at once" }).toBe(1);
    await expect(canvasPlate(page)).toBeVisible();
  });

test("from the canvas the control names the RECORD, and all three exits land there",
  async ({ page }) => {
    // VIEW-AC-14 and VIEW-AC-15 together, in one test, because they are the two
    // halves of one trap: a control that goes to the right place while naming
    // the wrong one passes every navigation assertion, and a correctly labelled
    // control that lands elsewhere passes every label assertion (spec §12.7).
    await serveRecord(page);
    await canvasWithComposite(page);

    for (const exit of ["control", "escape", "gesture"] as const) {
      await canvasPlate(page).click();
      await expect(page.getByTestId("drawing-viewer")).toBeVisible();
      await expect(page).toHaveURL(/\/line\/l2\/drawing$/);

      // THE VISIBLE LABEL and THE ACCESSIBLE NAME, and neither names the line.
      const back = page.getByTestId("drawing-viewer-back");
      await expect(back).toHaveText(PROJECT_TITLE);
      await expect(back).not.toHaveText(/W07/);
      await expect(page.getByTestId("drawing-viewer")
        .getByRole("button", { name: PROJECT_TITLE })).toBeVisible();
      // VIEW-AC-1a is untouched: the bar still titles the SUBJECT.
      await expect(page.getByTestId("drawing-viewer")
        .getByRole("heading", { name: "Drawing" })).toBeVisible();
      // The viewer's only control still receives focus on the way in (VIEW-AC-7).
      await expect(back).toBeFocused();

      if (exit === "control") await back.click();
      else if (exit === "escape") await page.keyboard.press("Escape");
      else await page.goBack();

      await expect(page, `${exit} did not land on the record`).toHaveURL(/\/projects\/p_rec$/);
      await expect(page.getByTestId("drawing-viewer")).toBeHidden();
      await expect(page.getByTestId("record-canvas")).toBeVisible();
    }
  });

test("back from a canvas-opened drawing does not blank the canvas", async ({ page }) => {
  // VIEW-AC-16, proved by the tester's own two measurements — `selected row
  // index` and the canvas's leading text — read in ONE evaluate immediately
  // after the pop, with no waiting. A retrying locator would pass on a canvas
  // that was empty for a beat and recovered, which is precisely the defect.
  const calls = await serveRecord(page);
  await canvasWithComposite(page);

  await canvasPlate(page).click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  // COUNTED FROM HERE. The canvas pushes the line's own address, so a second
  // page really does mount and reads the record for itself on the way in; the
  // criterion is about the RETURN, which must add nothing.
  const fetches = calls.n;
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/projects\/p_rec$/);

  const state = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="record-line"]')];
    const canvas = document.querySelector('[data-testid="record-canvas"]');
    return {
      selected: rows.findIndex((r) => r.getAttribute("aria-current") === "true"),
      canvas: (canvas?.textContent ?? "").slice(0, 60),
    };
  });
  expect(state.selected, "the line that was selected is still selected").toBe(1);
  expect(state.canvas, "the canvas already carries that line, from the first frame")
    .toContain("W07");

  // NOT REMOUNTED AND NOT RE-FETCHED — the same discipline VIEW-AC-2a requires
  // of the line page. A refetch is what emptied the canvas: the record goes back
  // to `loading`, and everything derived from it goes with it.
  expect(calls.n, "the record was re-read on the way back").toBe(fetches);
});

// ── Folded in from the tester's probe file ──────────────────────────────────
//
// Written as probes against the shipped build, and kept because each covers a
// criterion this suite did not execute. They live here rather than in a second
// spec on purpose: both files sign in as the same staff identity, and code
// issuance refuses a second challenge to one address inside RESEND_COOLDOWN_MS,
// so two specs sharing this mailbox cannot run in the same battery.

test("a cold deep link onto a composite UNIT lands with that unit open", async ({ page }) => {
  // VIEW-AC-2b on the unit branch — the one that has to resolve an ordinal
  // against a record that has not arrived yet. The cold-link test above uses
  // `/drawing` on a simple opening only.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${LINE("l2")}/drawing/u2`);

  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l2\/drawing\/u2$/);
  await expect(page.getByTestId("drawing-viewer").getByRole("heading", { name: "W07B" }))
    .toBeVisible();
  await expect(page.getByTestId("drawing-viewer-caption")).toHaveText(
    "W07B · 1500 × 1200 mm · unit 2 of 2 in W07, which is 1500 × 2400 mm overall");
  // A cold arrival has no record behind it, so it REPLACES to the line path and
  // the control names the line — the destination follows how the viewer was
  // entered, and this door is the line's.
  await expect(page.getByTestId("drawing-viewer-back")).toHaveText("W07");
  const before = await historyLength(page);
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l2$/);
  await expect(page.getByTestId("line-review")).toBeVisible();
  expect(await historyLength(page), "a cold link REPLACES, it does not push").toBe(before);
});

test("walking the tree repeatedly never re-reads the record", async ({ page }) => {
  // VIEW-AC-2a's no-refetch pushed harder than once. The refresh is armed by an
  // actual departure; a page that keeps changing suffix without leaving must
  // never re-arm it, however many times it is walked.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l2"));
  await expect(page.getByTestId("line-units")).toBeVisible();
  const fetches = calls.n;

  for (let i = 0; i < 3; i += 1) {
    await page.getByTestId("line-plate-open").first().click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
    await page.getByTestId("drawing-viewer-back").click();
    await expect(page).toHaveURL(/\/line\/l2$/);
    await expect(page.getByTestId("drawing-viewer")).toBeHidden();

    // Only one line body may be mounted — a second is a second LinePage, which
    // is the remount VIEW-AC-2a forbids.
    expect(await page.getByTestId("line-review").count(),
      `round ${i}: more than one line body is mounted`).toBe(1);

    await page.getByTestId("line-unit-open").nth(0).click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await expect(page.getByTestId("drawing-viewer-back")).toBeFocused();
    await expect(page).toHaveURL(/\/line\/l2\/drawing\/u1$/);
    await page.keyboard.press("Escape");
    await expect(page, `round ${i}: Escape did not close the UNIT viewer`)
      .toHaveURL(/\/line\/l2$/);
    await expect(page.getByTestId("drawing-viewer")).toBeHidden();
  }
  expect(calls.n, "the record was re-read while the page never left").toBe(fetches);
});

test("an unauthenticated visitor gets nothing from a drawing URL", async ({ browser }) => {
  // Phase 2 adds addressable URLs, so the first thing to attempt is reaching one
  // without a session. NO record route mock here — this must hit the real
  // Worker, or it proves nothing about who is allowed to read a project.
  const context = await browser.newContext();   // no staff cookies
  const page = await context.newPage();

  const answers: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/api/ops/projects/")) answers.push(String(r.status()));
  });

  await page.goto(`${LINE("l2")}/drawing`);
  await expect(page.locator("ion-app")).toBeVisible();
  await expect(page.getByTestId("drawing-viewer")).toBeHidden();

  const text = await page.evaluate(() => document.body.innerText);
  for (const leak of ["W07", "Wattle Grove", "OF-Q-10482", "Ana Bianchi", "AMJ67"]) {
    expect(text, `an anonymous caller was shown ${leak}`).not.toContain(leak);
  }
  for (const status of answers) {
    expect(status, "the record endpoint answered an anonymous caller").toMatch(/^(401|403)$/);
  }
  await context.close();
});
