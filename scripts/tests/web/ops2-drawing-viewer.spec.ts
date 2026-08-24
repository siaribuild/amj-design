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
