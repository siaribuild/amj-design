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

/**
 * VIEW-AC-1's size rule, revision 18: "the whole drawing and its caption are
 * visible together, and within that the drawing is as large as the viewport
 * permits."
 *
 * ONE DIMENSION PER SWEEP, and this replaces rather than joins the round-1 test.
 * That one moved width and height together across (1280,900), (1920,1080),
 * (2560,1440) and asserted the drawing grew — which passes whichever dimension
 * is doing the work, so it proved nothing about which one was. A
 * height-governed implementation sailed through it and an ultrawide 2560×1080
 * got exactly what a 1280×1080 window got. Leaving the weaker test beside these
 * would give a future reader something to trust that cannot fail (§12 note 12).
 */
async function drawingAt(
  page: import("@playwright/test").Page, width: number, height: number, lineId = "l1",
) {
  await page.setViewportSize({ width, height });
  await page.goto(LINE(lineId));
  await expect(page.getByTestId("line-review")).toBeVisible();
  await page.getByTestId("line-plate-open").click();
  const svg = page.getByTestId("drawing-viewer").locator("svg[data-elevation]");
  await expect(svg).toBeVisible();
  const box = await svg.boundingBox();
  if (!box) throw new Error(`no box for the drawing at ${width}×${height}`);
  return box;
}

test("the drawing grows with the viewport's WIDTH when width is what binds", async ({ page }) => {
  // Tall and narrow: the height budget is generous, so the available width is
  // the constraint. Only the width moves.
  await serveRecord(page);
  const narrow = await drawingAt(page, 1100, 1440);
  const wide = await drawingAt(page, 1500, 1440);
  expect(wide.width, `1500×1440 drew ${wide.width}, 1100×1440 drew ${narrow.width}`)
    .toBeGreaterThan(narrow.width);
  // The box stays the drawing rather than a letterboxed container: same shape,
  // both times. A container-shaped box would track the viewport's proportion.
  expect(Math.abs(wide.width / wide.height - narrow.width / narrow.height)).toBeLessThan(0.05);
});

test("the drawing grows with the viewport's HEIGHT when height is what binds", async ({ page }) => {
  // Short and wide — the ultrawide the round-1 test could not see. Only the
  // height moves, and 2560×1080 against 2560×1440 is the exact pair the tester
  // measured as identical.
  await serveRecord(page);
  const short = await drawingAt(page, 2560, 1080);
  const tall = await drawingAt(page, 2560, 1440);
  expect(tall.height, `2560×1440 drew ${tall.height} tall, 2560×1080 drew ${short.height}`)
    .toBeGreaterThan(short.height);
  expect(Math.abs(tall.width / tall.height - short.width / short.height)).toBeLessThan(0.05);
});

/** The drawing, the caption and the viewport, in one read. */
const readFence = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const svg = document.querySelector('[data-testid="drawing-viewer"] svg[data-elevation]');
  const cap = document.querySelector('[data-testid="drawing-viewer-caption"]');
  const r = (el: Element | null) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  };
  return { svg: r(svg), cap: r(cap), vw: window.innerWidth, vh: window.innerHeight };
});

/**
 * A GEOMETRY READ ONCE IT HAS STOPPED MOVING — two consecutive identical reads,
 * or the poll gives up and says so.
 *
 * WHY A POLL AND NOT A BIGGER TOLERANCE, which is what the fence's `+1` looks
 * like it wants. Measured under a parallel battery, the caption's bottom at
 * 1920×1080 came back 1081.1214752197266, then 1098.6176757812, then
 * 1098.4442138671875, and on other runs it was the DRAWING that overshot rather
 * than the caption. Sub-pixel float is the same number every time; this moves by
 * up to 17px and changes which element it lands on, because the read was taken
 * the instant the modal became visible and the viewer's layout was still
 * settling behind its enter animation. Serially it always passed, which is why
 * it survived: the machine was fast enough to finish before anyone looked.
 *
 * A tolerance that hid 17px would hide the regression this fence exists to
 * catch — a drawing grown to claim an ultrawide's width standing ~1790px tall
 * on a 1080px screen. So the `+1` stays exactly as it was, for real sub-pixel
 * float, and the instability is removed instead of tolerated.
 */
async function settled<T>(read: () => Promise<T>): Promise<T> {
  let previous = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await read());
      const same = now === previous;
      previous = now;
      return same;
    }, { timeout: 5_000, message: "the layout never stopped moving" })
    .toBe(true);
  return read();
}

test("the whole drawing and its whole caption fit the viewport, at every shape",
  async ({ page }) => {
    // THE FENCE. "As large as the viewport permits" is bounded by this and not
    // the other way round: a drawing grown to claim an ultrawide's 2560px stands
    // ~1790px tall on a 1080px screen, which puts the caption below the fold and
    // a third of the drawing with it.
    await serveRecord(page);
    // `l2` is the composite: it carries a units list UNDER the caption, so it is
    // the shape most able to push the caption out of the fence.
    for (const [w, h, line] of [
      [2560, 1080, "l1"], [1920, 1080, "l1"], [1280, 900, "l1"], [375, 667, "l1"],
      [2560, 1080, "l2"], [1280, 900, "l2"], [375, 667, "l2"],
    ] as [number, number, string][]) {
      await drawingAt(page, w, h, line);
      const seen = await settled(() => readFence(page));
      if (!seen.svg || !seen.cap) throw new Error(`nothing measured at ${w}×${h} (${line})`);
      // A pixel of tolerance for sub-pixel layout, and no more.
      for (const [what, box] of [["drawing", seen.svg], ["caption", seen.cap]] as const) {
        const at = `${line} at ${w}×${h}`;
        expect(box.top, `${what} starts above the viewport, ${at}`).toBeGreaterThanOrEqual(-1);
        expect(box.bottom, `${what} runs past the fold, ${at}`).toBeLessThanOrEqual(seen.vh + 1);
        expect(box.left, `${what} starts left of the viewport, ${at}`).toBeGreaterThanOrEqual(-1);
        expect(box.right, `${what} runs past the right edge, ${at}`).toBeLessThanOrEqual(seen.vw + 1);
      }
      // The caption is BELOW the drawing, and NEAR it. "Visible together" is not
      // the same as "both on the screen somewhere": a first cut of this layout
      // gave the drawing's row all the height it was offered and pinned the
      // caption to the bottom of the figure — 648px of blank between a drawing
      // and the sentence stating its size, at 1100×1440. Every assertion above
      // passed on it, which is the whole reason this line exists.
      expect(seen.cap.top).toBeGreaterThanOrEqual(seen.svg.bottom - 1);
      expect(seen.cap.top - seen.svg.bottom,
        `the caption is adrift from its drawing, ${line} at ${w}×${h}`).toBeLessThan(80);
    }
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
  // DELIBERATELY REDUNDANT, and kept on purpose — flagged once as subsumed by
  // "a real visit to the line page still refreshes the record on the way back",
  // which walks this same departure and adds a drawing round-trip on top. It is
  // the only version with NO drawing anywhere in the journey, and the guard it
  // fences was narrowed once already today to stop a drawing arming it. Three
  // seconds to keep the plain case proved on its own terms.
  //
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
  }
  // THE ELEVEN PATTERNS ARE THE COVERAGE, and they are now all of it.
  //
  // This loop also carried `expect(page.locator(".elev-legend")).toHaveCount(0)`.
  // With `ElevationLegend` deleted (VIEW-AC-12, D12) nothing in the repository
  // can emit that class, so the locator can never match and the assertion can
  // never fail — a line that reads as coverage of VIEW-AC-10 while standing
  // behind nothing. It is removed rather than kept, because the danger is not
  // the wasted millisecond, it is a reviewer counting it. The scan above runs
  // over rendered text on six addresses and still fails if a key comes back in
  // any markup at all, or if a sentence teaches the notation in prose.

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
/** WHICH OF TWO CORRECT-LOOKING STRINGS. The record carries both a title and a
 *  reference, and the whole of the owner's ruling is which one this control
 *  shows — so the fixture keeps both and the assertions name both. */
const PROJECT_REF = record.project.publicRef;
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

      // THE VISIBLE LABEL and THE ACCESSIBLE NAME. Both are the record's
      // REFERENCE — the vocabulary the line page's own back control already uses
      // for this same destination (LinePage.tsx, `label: record.ref`), so one
      // place does not end up with two names in one console. Asserted against
      // the title as well as the line, because a control showing the title would
      // pass every "names the record" check while breaking the ruling.
      const back = page.getByTestId("drawing-viewer-back");
      await expect(back).toHaveText(PROJECT_REF);
      await expect(back).not.toHaveText(/W07/);
      await expect(back).not.toHaveText(new RegExp(PROJECT_TITLE));
      await expect(page.getByTestId("drawing-viewer")
        .getByRole("button", { name: PROJECT_REF })).toBeVisible();
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

test("a long reference is shortened to fit the bar, and read out whole", async ({ page }) => {
  // THE CAP HAS REACHABLE INPUT, which is the only reason it exists. A record
  // served without a `public_ref` is labelled with its project id — a 36-char
  // UUID (see scripts/tests/ops2-record.test.mjs for the parser half) — so this
  // is what the control gets, not the tidy `OF-Q-10482` everyone pictures.
  const LONG_REF = "0f6d5b2e-9c14-4a7b-8f30-1e2d3c4b5a69";
  await page.route(RECORD_URL, (route) => route.fulfill({
    json: { ...record, project: { ...record.project, publicRef: LONG_REF } },
  }));
  await canvasWithComposite(page);
  await canvasPlate(page).click();
  const back = page.getByTestId("drawing-viewer-back");
  await expect(back).toBeVisible();

  // THE ACCESSIBLE NAME IS WHOLE. Truncation is a drawing decision; a screen
  // reader must still hear which record it is going back to.
  await expect(page.getByTestId("drawing-viewer")
    .getByRole("button", { name: LONG_REF })).toBeVisible();

  const label = page.locator(".ops2-viewer__back-label");
  const measure = () => label.evaluate((el) => ({
    clipped: el.scrollWidth > el.clientWidth,
    width: Math.round(el.getBoundingClientRect().width),
  }));
  const desk = await measure();
  expect(desk.clipped, "a 36-character reference is not shortened at the desk").toBe(true);

  // AND THE BOUND IS PROPORTIONAL WHERE THE BAR IS TIGHT. A `ch` measure alone
  // resolves against the label's own font-size, so it is the same ~200px at
  // every width — wider on a phone than the viewport share it replaced. The two
  // numbers being DIFFERENT is the assertion: a flat cap gives one number twice.
  await page.setViewportSize({ width: 375, height: 812 });
  const phone = await measure();
  expect(phone.clipped).toBe(true);
  expect(phone.width, "the cap does not tighten when the bar does").toBeLessThan(desk.width);
  // It must also leave room for the heading beside it rather than filling the bar.
  expect(phone.width).toBeLessThan(375 * 0.5);

  // THE OTHER UNBOUNDED INPUT, on the same element and the same rule. A line
  // code is `quote_line.external_ref` — plain TEXT parsed out of a builder's
  // schedule, so a mis-mapped import column arrives whole — and it reaches this
  // control through the LINE door, at every width. One more string rather than
  // one more test: the cap is a single CSS rule, and which door supplied the
  // label is pinned in four other places.
  const LONG_CODE = "W07-KITCHEN-NORTH-ELEVATION-AWNING-OVER-BENCH";
  await page.route(RECORD_URL, (route) => route.fulfill({
    json: { ...record, lines: record.lines.map((l) => (l.id === "l2" ? { ...l, code: LONG_CODE } : l)) },
  }));
  // Through the LINE door, and reached by opening the plate rather than by
  // navigating to the drawing address: `page.goto` to the address we are already
  // on is a RELOAD, and a reload deliberately keeps its door — so it would have
  // measured the reference again under a different name.
  await page.goto(LINE("l2"));
  await page.getByTestId("line-plate-open").first().click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page.getByTestId("drawing-viewer")
    .getByRole("button", { name: LONG_CODE })).toBeVisible();
  const code = await measure();
  expect(code.clipped, "a 45-character line code is not shortened on a phone").toBe(true);
  expect(code.width).toBeLessThan(375 * 0.5);
});

test("a RELOADED canvas drawing still returns to the record, by all three exits",
  async ({ page }) => {
    // F5, a restored session, a recovered crash. The door lives on the history
    // entry's state, which survives a reload — but Ionic's route stack does not,
    // and `closeViewer` used to read that stack as "is there anywhere to go back
    // to". After a reload it answered no, so the control replaced to the line
    // path while its label still said the record and the browser's own gesture
    // still went to the record: three exits, two destinations, and a label that
    // agreed with neither reliably.
    //
    // Measured before the fix — the label was identical in all three rows, so
    // asserting the label alone would have passed:
    //   control OF-Q-10482 → /line/l2 · escape OF-Q-10482 → /line/l2
    //   gesture OF-Q-10482 → /projects/p_rec
    await serveRecord(page);

    for (const exit of ["control", "escape", "gesture"] as const) {
      await canvasWithComposite(page);
      await canvasPlate(page).click();
      await expect(page).toHaveURL(/\/line\/l2\/drawing$/);

      await page.reload();
      await expect(page.getByTestId("drawing-viewer")).toBeVisible();
      const back = page.getByTestId("drawing-viewer-back");
      await expect(back).toHaveText(PROJECT_REF);

      if (exit === "control") await back.click();
      else if (exit === "escape") await page.keyboard.press("Escape");
      else await page.goBack();

      // LABEL AND DESTINATION IN ONE ASSERTION. Either alone passes the build
      // this test was written against.
      await expect(page, `${exit} after a reload did not land on the record`)
        .toHaveURL(/\/projects\/p_rec$/);
      await expect(page.getByTestId("drawing-viewer")).toBeHidden();
      await expect(page.getByTestId("record-canvas")).toBeVisible();

      // AND IT IS A REAL RECORD, not a husk left by an over-eager pop. A visible
      // canvas is not the same as a canvas with a line in it.
      //
      // NOT "the row you had selected is still selected" — a reload wipes the
      // SPA and the record's address carries no selection, so the canvas
      // correctly falls back to the first line. Demanding the old selection here
      // would be a test asking for the impossible; what VIEW-AC-16 forbids is
      // showing NONE.
      const canvas = await page.evaluate(() => ({
        selected: [...document.querySelectorAll('[data-testid="record-line"]')]
          .findIndex((r) => r.getAttribute("aria-current") === "true"),
        hasReview: !!document.querySelector('[data-testid="line-review"]'),
        hasEmpty: !!document.querySelector('[data-testid="record-canvas-empty"]'),
      }));
      expect(canvas.hasEmpty, `${exit}: the canvas came back empty`).toBe(false);
      expect(canvas.hasReview, `${exit}: the canvas came back with no line body`).toBe(true);
      expect(canvas.selected, `${exit}: no row is marked current`).toBeGreaterThanOrEqual(0);
    }
  });

test("a RELOADED line drawing returns to the line without eating the entry behind it",
  async ({ page }) => {
    // THE OTHER HALF OF THE SAME CONFLATION. Two questions were being answered by
    // one fact: WHICH DOOR the viewer was opened through, and WHETHER IT WAS
    // OPENED IN THIS SESSION at all. The record door answered the second one by
    // accident — its door-marker happens to be per-entry state, which survives a
    // reload — and the line door, which pushes no marker, could not answer it.
    //
    // So a reloaded line-door viewer took the cold path and REPLACED: the drawing
    // entry became a second copy of the line page, and the reviewer's next back
    // landed on a page identical to the one they were already looking at. Back
    // appeared to do nothing.
    //
    // The assertion that sees it is the SECOND back, not the first: a replace and
    // a pop both leave you on `/line/l2`, and `history.length` does not separate
    // them either — the forward entry survives a pop, so the count is the same
    // both ways. Only what is BEHIND the line page differs.
    await serveRecord(page);

    for (const exit of ["control", "escape", "gesture"] as const) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(RECORD_PAGE);
      await expect(page.getByTestId("record-line").first()).toBeVisible();
      await page.getByTestId("record-line").nth(1).click();
      await expect(page).toHaveURL(/\/line\/l2$/);
      await page.getByTestId("line-plate-open").first().click();
      await expect(page).toHaveURL(/\/line\/l2\/drawing$/);

      await page.reload();
      await expect(page.getByTestId("drawing-viewer")).toBeVisible();
      // The door still decides the label, and this door is the line's.
      await expect(page.getByTestId("drawing-viewer-back")).toHaveText("W07");

      if (exit === "control") await page.getByTestId("drawing-viewer-back").click();
      else if (exit === "escape") await page.keyboard.press("Escape");
      else await page.goBack();

      await expect(page, `${exit} after a reload did not land on the line`)
        .toHaveURL(/\/line\/l2$/);
      // POLLED FOR THE SETTLED STATE, not read mid-dismiss. Both pages are
      // genuinely laid out during Ionic's leave animation — the test above at
      // "the line page left behind by a canvas enlargement" measures exactly
      // that and pins that it settles — so a strict locator here resolves to two
      // line bodies for a few frames and fails on a build that is correct. This
      // asserts what must be true when it stops moving, which is also stronger:
      // one body VISIBLE, not merely one present.
      await expect.poll(() => page.getByTestId("line-review").evaluateAll(
        (els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).length),
      { message: `${exit}: the line body did not settle to exactly one` }).toBe(1);

      // AND THE RECORD IS STILL BEHIND IT. On the build this was written against,
      // the control and Escape left `[… , line page, line page]` here, so this
      // back landed on the line page again.
      await page.goBack();
      await expect(page, `${exit} left an orphan entry: back stayed on the line`)
        .toHaveURL(/\/projects\/p_rec$/);
    }
  });

test("a cold drawing link REPLACES even in a tab that already has history", async ({ page }) => {
  // VIEW-AC-2b, at the arrival that separates the right mechanism from the
  // tempting wrong one. "Was this viewer opened in this session" cannot be
  // answered by `history.length > 1`, by `document.referrer`, or by the
  // navigation type: a reviewer who types a drawing URL over a page they were
  // already on has entries behind them, none of which are ours. Only per-entry
  // state can answer it, because only per-entry state is attached to the entry
  // a pop would return TO.
  //
  // If this ever starts popping, the fix has begun guessing from the tab's
  // history instead of reading the door.
  await serveRecord(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(OPS2);
  await expect(page.locator("ion-app")).toBeVisible();
  await page.goto(`${LINE("l2")}/drawing`);
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  expect(await historyLength(page), "the tab has history behind the drawing")
    .toBeGreaterThan(1);
  const before = await historyLength(page);

  // No door was used, so the control names the line and replaces to it.
  await expect(page.getByTestId("drawing-viewer-back")).toHaveText("W07");
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l2$/);
  await expect(page.getByTestId("line-review")).toBeVisible();
  expect(await historyLength(page), "a cold arrival replaced, it did not push").toBe(before);

  // The drawing entry is GONE rather than popped past: going back leaves the
  // line page for whatever the reviewer was on before, and never returns to a
  // viewer they already closed.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/drawing$/);
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

test("the door does not leak between journeys in one page session", async ({ page }) => {
  // VIEW-AC-15 both ways, in ONE session. The door rides on `history.push`
  // state, so the risk this creates is a value that outlives its journey: a
  // reviewer who used the canvas once and then reaches a line page properly
  // must get the LINE's name, not the reference left over from before.
  await serveRecord(page);
  await canvasWithComposite(page);

  await canvasPlate(page).click();
  await expect(page.getByTestId("drawing-viewer-back")).toHaveText(PROJECT_REF);
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/projects\/p_rec$/);

  // Now reach the line page as a reviewer actually would at phone width, in the
  // same session, and open the same drawing through the other door.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByTestId("record-line").nth(1).click();
  await expect(page).toHaveURL(/\/line\/l2$/);
  await expect(page.getByTestId("line-review")).toBeVisible();

  await page.getByTestId("line-plate-open").first().click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  const back = page.getByTestId("drawing-viewer-back");
  await expect(back, "the record's reference leaked onto the line's own door").toHaveText("W07");
  await expect(back).not.toHaveText(/OF-Q/);
  await back.click();
  await expect(page).toHaveURL(/\/line\/l2$/);
});

test("a real visit to the line page still refreshes the record on the way back", async ({ page }) => {
  // THE NARROWED DEPARTURE GUARD, at the chain that asks it twice. `departed` is
  // set from WHERE the page went, and the record's departure here is to the LINE
  // PAGE (no suffix), not to a drawing — so the return must still refresh, or
  // the fix for VIEW-AC-16 has disabled the thing the hook exists for.
  const calls = await serveRecord(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(RECORD_PAGE);
  await expect(page.getByTestId("record-line").first()).toBeVisible();
  const afterRecord = calls.n;

  await page.getByTestId("record-line").nth(1).click();
  await expect(page).toHaveURL(/\/line\/l2$/);
  await expect(page.getByTestId("line-review")).toBeVisible();

  await page.getByTestId("line-plate-open").first().click();
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/line\/l2$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec$/);
  await expect(page.getByTestId("record-line").first()).toBeVisible();

  expect(calls.n, "a real visit to the line page no longer refreshes the record")
    .toBeGreaterThan(afterRecord);
});

test("a UNIT opened from the canvas returns to the record by all three exits", async ({ page }) => {
  // VIEW-AC-13 names "the canvas's plate, or a unit row on a composite", and
  // VIEW-AC-14 applies to both. The plate gets all three exits above; without
  // this the unit row gets one.
  await serveRecord(page);
  await canvasWithComposite(page);

  for (const exit of ["control", "escape", "gesture"] as const) {
    await canvasUnit(page, 1).click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await expect(page).toHaveURL(/\/line\/l2\/drawing\/u2$/);
    // The door is the canvas's, so the control names the record even here —
    // while the TITLE still names the subject (VIEW-AC-1a is untouched by D11).
    await expect(page.getByTestId("drawing-viewer-back")).toHaveText(PROJECT_REF);
    await expect(page.getByTestId("drawing-viewer")
      .getByRole("heading", { name: "W07B" })).toBeVisible();

    if (exit === "control") await page.getByTestId("drawing-viewer-back").click();
    else if (exit === "escape") await page.keyboard.press("Escape");
    else await page.goBack();

    await expect(page, `${exit} did not land on the record`).toHaveURL(/\/projects\/p_rec$/);
    await expect(page.getByTestId("drawing-viewer")).toBeHidden();
    // And the selection survived every exit, not only the control (VIEW-AC-16).
    const selected = await page.evaluate(() => [...document.querySelectorAll(
      '[data-testid="record-line"]')].findIndex((r) => r.getAttribute("aria-current") === "true"));
    expect(selected, `${exit} lost the selection`).toBe(1);
  }
});

// ── Folded in from the tester's round-3 probes ──────────────────────────────
//
// Kept because each can still fail. Its diagnostics and its forward-navigation
// reproducer are not here: the first were scaffolding for a hunt that is over,
// and the second asserts behaviour no criterion in §8 or §8.1 describes, which
// is going to its own ticket rather than into a suite as a silent expectation.

test("the drawing is never distorted — the rendered box carries the viewBox's own proportion",
  async ({ page }) => {
    // WHAT A GROWTH SWEEP CANNOT SEE. The sweeps above compare the drawing to
    // ITSELF at another viewport, so they catch a box that changes shape — but a
    // drawing squashed by the SAME factor at every size would satisfy every one
    // of them. This compares the rendered box to the drawing's own declared
    // proportion, which is the only external truth available in the DOM.
    //
    // It is the assertion that was missing when `height: 62vh` plus a binding
    // `max-width` rendered a 1.43 drawing at 1.20 on a tall narrow viewport —
    // found by looking at it, which is not a thing a suite can be relied on to do.
    await serveRecord(page);
    for (const [w, h, line] of [
      [1100, 1440, "l1"], [2560, 1080, "l1"], [375, 667, "l1"],
      [2560, 1080, "l2"], [1280, 900, "l2"], [375, 667, "l2"],
    ] as [number, number, string][]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`${LINE(line)}/drawing`);
      await expect(page.getByTestId("drawing-viewer")).toBeVisible();
      await expect(page.getByTestId("drawing-viewer-caption")).toBeVisible();

      const m = await page.evaluate(() => {
        const svg = document.querySelector(
          '[data-testid="drawing-viewer"] svg[data-elevation]') as SVGSVGElement | null;
        if (!svg) return null;
        const b = svg.getBoundingClientRect();
        const vb = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
        return {
          drawn: +(b.width / b.height).toFixed(3),
          viewBox: +(vb[2] / vb[3]).toFixed(3),
        };
      });
      if (!m) throw new Error(`no drawing at ${line} ${w}×${h}`);
      expect(Math.abs(m.drawn - m.viewBox),
        `distorted at ${line} ${w}×${h}: drawn ${m.drawn} against a viewBox of ${m.viewBox}`)
        .toBeLessThan(0.05);
    }
  });

test("a composite's units list is never clipped with nothing to scroll", async ({ page }) => {
  // The fence pins the drawing and its caption; the units list sits under both
  // and nothing pinned it. It was clipped mid-row on an ultrawide before the
  // figure's flex basis was corrected — a row cut in half is a defect, a row
  // below a list that CAN scroll is not.
  await serveRecord(page);
  for (const [w, h] of [[2560, 1080], [1280, 900], [375, 667]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${LINE("l2")}/drawing`);
    await expect(page.getByTestId("drawing-viewer-units")).toBeVisible();

    const m = await page.evaluate(() => {
      const list = document.querySelector(
        '[data-testid="drawing-viewer-units"]') as HTMLElement;
      const lb = list.getBoundingClientRect();
      return {
        vh: window.innerHeight,
        bottom: Math.round(lb.bottom),
        rows: [...list.querySelectorAll("li")].map((li) => Math.round(
          li.getBoundingClientRect().bottom)),
        // `overflow-y: auto` means a row past the edge is REACHABLE rather than
        // lost — but only if the list can actually scroll.
        scrollable: list.scrollHeight > list.clientHeight + 1,
      };
    });
    expect(m.rows.length, `no unit rows at ${w}×${h} — the fixture stopped `
      + "producing units and the scroll check below would assert nothing").toBeGreaterThan(0);
    expect(m.bottom, `the units list runs past the fold at ${w}×${h}`)
      .toBeLessThanOrEqual(m.vh + 1);
    const past = m.rows.filter((bottom) => bottom > m.bottom + 1);
    if (past.length) {
      expect(m.scrollable,
        `${past.length} unit row(s) hang past a list that cannot scroll at ${w}×${h}`).toBe(true);
    }
  }
});

test("`fluid` is the viewer's alone — every other drawing keeps its intrinsic size",
  async ({ page }) => {
    // THE BLAST RADIUS OF A SHARED COMPONENT, pinned at the DOM rather than at
    // the call site. `Elevation` has eight callers; seven set no CSS size at all
    // and would collapse without the `width`/`height` attributes. Exactly one
    // asks for `fluid`, and it must, because an intrinsic size is a ceiling.
    await serveRecord(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LINE("l2"));
    await expect(page.getByTestId("line-review")).toBeVisible();

    const onPage = await page.evaluate(() => [...document.querySelectorAll(
      "svg[data-elevation]")].map((s) => ({
      w: s.getAttribute("width"), h: s.getAttribute("height"),
      cls: s.getAttribute("class"),
    })));
    expect(onPage.length, "the line page draws a plate and its unit glyphs").toBeGreaterThan(1);
    for (const s of onPage) {
      expect(s.w, `a non-viewer drawing lost its intrinsic width: ${s.cls}`).not.toBeNull();
      expect(s.h, `a non-viewer drawing lost its intrinsic height: ${s.cls}`).not.toBeNull();
    }

    // And the viewer's carries neither, while keeping the viewBox — without
    // which it would have no aspect ratio for the browser to fit.
    await page.getByTestId("line-plate-open").first().click();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    const inViewer = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="drawing-viewer"] svg[data-elevation]')!;
      return {
        w: s.getAttribute("width"), h: s.getAttribute("height"),
        viewBox: s.getAttribute("viewBox"),
      };
    });
    expect(inViewer.w, "the viewer's drawing carries an intrinsic width — that is a ceiling")
      .toBeNull();
    expect(inViewer.h).toBeNull();
    expect(inViewer.viewBox, "and it must keep its viewBox, or it has no aspect ratio")
      .not.toBeNull();
  });

test("the widest shape did not break the way out", async ({ page }) => {
  // The fit rules changed most at an ultrawide, so the question worth asking
  // there is whether navigation still works — not whether the refusal copy still
  // reads the same, which is a static literal, or whether a cold arrival still
  // replaces, which is router state. Neither of those is viewport-sensitive, and
  // re-running two whole tests at a second width to find out was measuring the
  // same thing twice. One open, one exit, one address.
  await serveRecord(page);
  await page.setViewportSize({ width: 2560, height: 1080 });
  await page.goto(LINE("l2"));
  await page.getByTestId("line-plate-open").first().click();
  await expect(page.getByTestId("drawing-viewer")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
  await page.getByTestId("drawing-viewer-back").click();
  await expect(page).toHaveURL(/\/line\/l2$/);
});

test("a canvas-opened drawing whose ordinal goes stale keeps its door through the correction",
  async ({ page }) => {
    // VIEW-AC-2c says normalisation happens BY REPLACE and grows no history. It
    // says nothing about discarding what the entry was already carrying — and
    // `history.replace(path)` with no second argument assigns `undefined` state,
    // so correcting the address quietly turned a canvas-opened viewer into a
    // cold one. Two criteria break at once: the control then names the LINE
    // (VIEW-AC-15) and, after a reload, back returns to the line instead of the
    // record (VIEW-AC-14).
    //
    // Reached the way it is actually reached: the canvas offers three units, the
    // reviewer opens the third, and the line page's own fetch comes back with a
    // record in which that line now has two. Nothing contrived — the record is
    // re-read on every page, and a line's units change when someone edits it.
    const THREE = {
      ...COMPOSITE,
      segments: [...COMPOSITE.segments, {
        id: "s3", productSlug: "amj67-fixed-window", productName: "AMJ67 Fixed",
        width: "800", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 700, status: "ready",
      }],
    };
    let units = 3;
    await page.route(RECORD_URL, (route) => route.fulfill({
      json: { ...record, lines: record.lines.map((l) => (l.id === "l2" ? (units === 3 ? THREE : l) : l)) },
    }));

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(RECORD_PAGE);
    await expect(page.getByTestId("record-canvas")).toBeVisible();
    await page.getByTestId("record-line").nth(1).click();
    await expect(page.getByTestId("line-review")).toBeVisible();
    await expect(canvasUnit(page, 2)).toBeVisible();

    // The third unit is gone by the time the line page reads the record.
    units = 2;
    const before = await historyLength(page);
    await canvasUnit(page, 2).click();
    await expect(page).toHaveURL(/\/line\/l2\/drawing/);

    // CORRECTED, BY REPLACE, TO THE OPENING'S OWN DRAWING (VIEW-AC-2c).
    await expect(page).toHaveURL(/\/line\/l2\/drawing$/);
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    expect(await historyLength(page), "the correction grew the history").toBe(before + 1);

    // AND THE DOOR SURVIVED IT. Same viewer, same journey, corrected address —
    // so the control still names the record it will return to.
    await expect(page.getByTestId("drawing-viewer-back")).toHaveText(PROJECT_REF);

    // The destination too, and after a reload, which is where a lost door stops
    // being only a labelling defect: with no mark the entry reads as cold and
    // back replaces to the line page instead of returning to the record.
    await page.reload();
    await expect(page.getByTestId("drawing-viewer")).toBeVisible();
    await expect(page.getByTestId("drawing-viewer-back")).toHaveText(PROJECT_REF);
    await page.getByTestId("drawing-viewer-back").click();
    await expect(page, "a corrected canvas drawing lost its way back to the record")
      .toHaveURL(/\/projects\/p_rec$/);
  });
