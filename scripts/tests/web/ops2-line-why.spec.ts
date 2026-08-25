import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "Why this product" — the panel and its routed detail, in a browser.
//
// WHY A BROWSER SUITE AT ALL, given the heavy node suite already walks the DTO
// state by state. Because every assertion below is about something only the
// CLIENT decides, and the Worker serves byte-identical responses either way:
//
//   • that opening the detail pushes EXACTLY ONE history entry and the address
//     becomes `/why` — the whole difference between a routed screen and a
//     back-shaped control on an overlay, which R29 rejected by name,
//   • that a cold `/why` link lands with the detail open and its back REPLACES,
//   • that a line with NO detail refuses that address instead of opening empty,
//   • that the panel has no control at all in those states (WHY-AC-41) and the
//     detail has exactly one (WHY-AC-39),
//   • that the network trace carries only GETs (WHY-AC-20),
//   • and that no money, no excluded candidate and no certification word
//     reaches the rendered page.
//
// Two referral defects — a program-Off switch that replaced a landing page, and
// payment holds the API served and nothing rendered — were invisible to 104
// green node tests because the server-served HTML was byte-identical in both
// states. This file exists for that class.
//
// THE RECORD AND THE RATIONALE ARE BOTH MOCKED, the way ops2-drawing-viewer.
// spec.ts mocks the record: what the server sends is `why-rationale-api.test.
// mjs`'s subject, executed against a real Worker and a real D1. Mixing the two
// would make every client assertion depend on a fixture round trip and prove
// neither half more firmly.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const RECORD_URL = "**/api/ops/projects/p_rec";
const RATIONALE_URL = "**/api/ops/projects/p_rec/lines/*/rationale";
const LINE = (id: string) => `${OPS2}/projects/p_rec/line/${id}`;

// u_staff4 — its own identity, per the allocation recorded in scripts/db/seed.sql.
// Code issuance refuses a second challenge to one address inside
// RESEND_COOLDOWN_MS (60s) and this battery runs several files at once, so a
// shared mailbox makes whichever suite signs in second fail at its OTP and
// report it as broken auth rather than as a rate limit doing its job.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff4'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff4");
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

// ── The record: five lines, one per panel state ─────────────────────────────
const line = (id: string, code: string, extra: Record<string, unknown> = {}) => ({
  id, code, room: "Bed 2", productName: "AMJ80 Series Awning Window",
  productSlug: "amj80-series-awning-window", compositeAxis: null,
  width: "1200", height: "900", qty: 1, lineTotal: 640, status: "ready",
  options: { colour: "Dover White" }, review: null, lineKind: "simple", segments: [],
  ...extra,
});

const record = {
  project: {
    id: "p_rec", title: "Wattle Grove - Lot 14", publicRef: "OF-Q-10482",
    statusInternalLabel: "Technical review", customerName: "Ana Bianchi",
    org: "Marchetti Constructions", unresolvedLineCount: 0,
  },
  lifecycle: { stateLabel: "Technical review", waitingOn: "Us", phase: "Pricing" },
  daysInStage: 3,
  lines: [
    line("l1", "W03"),                       // recommendation, unchanged
    line("l2", "W09"),                       // recommendation, a person changed it
    line("l3", "W14"),                       // no run — a person picked it
    line("l4", "W16"),                       // no run, figures never captured
    line("l5", "W18"),                       // a run from an earlier model
  ],
  delivery: { amount: 420, settled: true, estimate: 400 },
  actions: [],
  order: null,
};

const candidate = (o: Record<string, unknown>) => ({
  productSlug: "p", productName: "AMJ100L Series Awning Window", variantId: null,
  form: "single", tier: "meets", rank: 2,
  figures: { uValue: 3.8, shgc: 0.4 }, fits: true, units: null, ...o,
});

const REQUIREMENT = {
  maxUValue: 3.9, minShgc: null, maxShgc: 0.44,
  basis: "explicit_energy_report", absent: false,
};

/** The chosen product plus FOUR runners-up — five rows, which is D18's ruling
 *  and the one number this ladder may show. */
const recommendation = (o: Record<string, unknown> = {}) => ({
  kind: "recommendation",
  requirement: REQUIREMENT,
  tolerance: 0.08,
  competingTier: "meets",
  recommended: candidate({ productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", rank: 1, figures: { uValue: 3.72, shgc: 0.41 } }),
  alternatives: [
    candidate({ productSlug: "a2", productName: "AMJ100L Series Awning Window", rank: 2 }),
    candidate({ productSlug: "a3", productName: "AMJ100T Awning Window", rank: 3, tier: "within_tolerance", figures: { uValue: 4.05, shgc: 0.42 } }),
    candidate({ productSlug: "a4", productName: "amj-discontinued-awning", rank: 4, tier: "misses", figures: { uValue: 4.6, shgc: 0.44 } }),
    candidate({ productSlug: "a5", productName: "AMJ150 Series Awning Window", rank: 5, tier: "thermal_unknown", figures: { uValue: null, shgc: null } }),
  ],
  selectionChanged: null,
  current: { productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", figures: { uValue: 3.72, shgc: 0.41 } },
  composite: null,
  unsuppliedSplitNote: null,
  ...o,
});

const humanPick = (figures: unknown) => ({
  kind: "human",
  current: { productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", figures },
  units: null,
});

const RATIONALE: Record<string, unknown> = {
  l1: recommendation(),
  l2: recommendation({
    selectionChanged: { product: false, glazing: true },
    current: { productSlug: "amj100l-series-awning-window", productName: "AMJ100L Series Awning Window", figures: { uValue: 4.1, shgc: 0.52 } },
  }),
  l3: humanPick({ uValue: 4.35, shgc: 0.58 }),
  l4: humanPick(null),
  l5: { kind: "unrecorded", current: { productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", figures: { uValue: 3.72, shgc: 0.41 } } },
};

/** Every request the page makes, so "no request wrote anything" and "the record
 *  was not re-fetched" are measurements rather than impressions. */
async function serve(page: Page, overrides: Record<string, unknown> = {}, project = record) {
  const calls = { record: 0, rationale: 0, methods: [] as string[] };
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.methods.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.route(RECORD_URL, (route) => {
    calls.record += 1;
    return route.fulfill({ json: project });
  });
  await page.route(RATIONALE_URL, (route) => {
    calls.rationale += 1;
    const id = new URL(route.request().url()).pathname.split("/lines/")[1].split("/")[0];
    const dto = { ...RATIONALE, ...overrides }[id];
    return dto
      ? route.fulfill({ json: dto })
      : route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  return calls;
}

const historyLength = (page: Page) => page.evaluate(() => window.history.length);

/** The presented panel's own geometry. `.modal-wrapper` is Ionic's, inside the
 *  modal's shadow root, so it is asked for explicitly rather than through a
 *  selector that would quietly resolve to nothing. */
const handleCount = (page: Page, testId = "line-why-detail") =>
  page.getByTestId(testId).evaluate((el) => (el as HTMLElement & { shadowRoot: ShadowRoot | null })
    .shadowRoot?.querySelectorAll(".modal-handle").length ?? 0);

async function wrapperBox(page: Page, testId = "line-why-detail") {
  const box = await page.getByTestId(testId).evaluate((el) => {
    const wrapper = (el as HTMLElement & { shadowRoot: ShadowRoot | null })
      .shadowRoot?.querySelector(".modal-wrapper");
    if (!wrapper) return null;
    const r = wrapper.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) throw new Error(`no .modal-wrapper inside ${testId}`);
  return box;
}

const openLine = async (page: Page, id: string) => {
  await page.goto(LINE(id));
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page.getByTestId("line-why")).toBeVisible();
};

// ── The panel ───────────────────────────────────────────────────────────────

test("WHY-AC-1 the panel carries exactly three lines, between the specification and the price", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");

  const panel = page.getByTestId("line-why");
  await expect(panel.locator("dt")).toHaveText(["Had to meet", "This one", "Chosen"]);
  await expect(panel.locator("dd").nth(0)).toContainText("Uw ≤ 3.90 · SHGC ≤ 0.44");
  await expect(panel.locator("dd").nth(0)).toContainText("parsed from an energy report");
  await expect(panel.locator("dd").nth(1)).toContainText("Uw 3.72 · SHGC 0.41");
  await expect(panel.locator("dd").nth(2)).toContainText("the cheapest of those that met the caps");

  // WHERE IT SITS. Between the specification (or units) and the price, which is
  // a fact about the rendered order and not about the component tree.
  // A LABEL SITS BESIDE ITS VALUE, on both panels.
  //
  // `Panel`'s accessibility repair wrapped each row in a div, which became a
  // grid ITEM in a two-column grid and put every second row in the value
  // column. The approved mock carries the `display: contents` rule that spans
  // the row; the stylesheet had not caught up, and the Specification panel
  // beside this one was wearing the same defect — which is why the shipped
  // panel is measured here too rather than only the new one.
  for (const panel of ["line-spec", "line-why"]) {
    const rows = await page.getByTestId(panel).evaluate((el) =>
      [...el.querySelectorAll("dt")].map((dt) => {
        const dd = dt.nextElementSibling as HTMLElement | null;
        const a = dt.getBoundingClientRect();
        const b = dd?.getBoundingClientRect();
        return b ? { sameRow: Math.abs(a.top - b.top) < 4, rightOf: b.left > a.left } : null;
      }));
    expect(rows.length, `${panel} has rows to measure`).toBeGreaterThan(0);
    for (const row of rows) expect(row, panel).toMatchObject({ sameRow: true, rightOf: true });
  }

  const order = await page.getByTestId("line-review").evaluate((el) => {
    const ids = [...el.querySelectorAll("[data-testid]")].map((n) => n.getAttribute("data-testid"));
    return ids.filter((id) => id === "line-spec" || id === "line-why" || id === "line-price");
  });
  expect(order).toEqual(["line-spec", "line-why", "line-price"]);
});

test("WHY-AC-8/9 §9.0 the three states of an absence, told apart on the screen", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A person picked it, and its figures WERE captured.
  await openLine(page, "l3");
  await expect(page.getByTestId("line-why").locator("dt")).toHaveText(["This one", "Chosen"]);
  await expect(page.getByTestId("line-why")).toContainText("Uw 4.35 · SHGC 0.58");
  await expect(page.getByTestId("line-why")).toContainText("a person chose this product");
  await expect(page.getByTestId("line-why-foot")).toHaveCount(0);
  await expect(page.getByTestId("line-why-open")).toHaveCount(0);

  // Saved before the capture existed: the column is NULL. Never a zero, never a
  // dash — and the foot sentence is the ONLY thing on screen that tells this
  // apart from a captured absence, because the figures read identically.
  await openLine(page, "l4");
  await expect(page.getByTestId("line-why")).toContainText("not recorded");
  await expect(page.getByTestId("line-why-foot"))
    .toHaveText("This line was saved before performance figures were kept on a line.");
  const values = await page.getByTestId("line-why").locator("dd").allInnerTexts();
  expect(values.join(" ")).not.toMatch(/\b0\.00\b|—|--/);

  // Captured, and there was no figure: same words, NO foot sentence.
  await serve(page, { l4: humanPick({ uValue: null, shgc: null }) });
  await openLine(page, "l4");
  await expect(page.getByTestId("line-why")).toContainText("not recorded");
  await expect(page.getByTestId("line-why-foot")).toHaveCount(0);
});

test("WHY-AC-10/41 a run from an earlier model says so, and offers no door", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l5");
  await expect(page.getByTestId("line-why"))
    .toContainText("recorded by an earlier model, whose reasoning was not kept");
  // WHY-AC-41: not a disabled control, not a chevron — no control at all.
  // `ion-button` IS in the selector, because the one control this panel can
  // legitimately grow — WHY-AC-42's retry — is an `ion-button`, and a negative
  // that could not see it would pass with a control on screen.
  await expect(page.getByTestId("line-why-open")).toHaveCount(0);
  expect(await page.getByTestId("line-why")
    .locator("ion-button, button, a, [role=button]").count()).toBe(0);
});

test("WHY-AC-42 a failed read, a refusal and a recorded absence are THREE different sentences", async ({ page }) => {
  // THE WHOLE DEFECT IS THE COLLAPSE. A reviewer told "not recorded" stops
  // looking — they conclude the platform never had a reason and move on,
  // possibly confirming a recommendation they could have audited. A reviewer
  // told "could not be read" tries again. So the three are gathered here and
  // asserted to be mutually distinct, rather than each checked alone where any
  // two of them could quietly become one string.
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const said: Record<string, string> = {};

  // 1. FAILED — a 5xx. The panel remains, offers a retry, and never states an
  //    absence it did not establish: a false absence generated at display time
  //    is exactly what the capture rules forbid the writers from producing.
  const fail = async (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 500, json: { error: "boom" } });
  await page.route(RATIONALE_URL, fail);
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  const panel = page.getByTestId("line-why");
  await expect(panel).toBeVisible();
  said.failed = await panel.innerText();
  expect(said.failed).toContain("The reasoning for this line could not be read just now.");
  expect(said.failed).not.toMatch(/not recorded/i);
  await expect(page.getByTestId("line-why-retry")).toBeVisible();
  // THE REST OF THE PAGE IS UNAFFECTED — the two reads are independent, so a
  // rationale that cannot be read must not take the line's own facts with it.
  await expect(page.getByTestId("line-spec")).toBeVisible();
  await expect(page.getByTestId("line-price")).toBeVisible();

  // …and the retry actually recovers, which is the only thing that makes
  // offering it honest.
  await page.unroute(RATIONALE_URL, fail);
  await page.getByTestId("line-why-retry").click();
  await expect(panel).toContainText("the cheapest of those that met the caps");
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);

  // 2. REFUSED — a 404, which is what "this line has no rationale" and "not a
  //    parent of this project" both are. NOT a failure: no panel, and no retry
  //    for something that will refuse identically next time.
  const refuse = async (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } });
  await page.route(RATIONALE_URL, refuse);
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page.getByTestId("line-why")).toHaveCount(0);
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);
  said.refused = await page.getByTestId("line-review").innerText();
  expect(said.refused).not.toMatch(/could not be read|not recorded/i);
  await page.unroute(RATIONALE_URL, refuse);

  // 3. RECORDED ABSENCE — the read succeeded and the answer was "nothing was
  //    kept". Says so, and offers no retry: there is nothing to try again for.
  await serve(page, { l4: humanPick(null) });
  await openLine(page, "l4");
  said.absent = await page.getByTestId("line-why").innerText();
  expect(said.absent).toMatch(/not recorded/);
  expect(said.absent).not.toMatch(/could not be read/i);
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);

  // THE THREE ARE THREE. Any two of them collapsing into one string is the
  // defect this criterion exists for, and it would survive every assertion
  // above taken separately.
  expect(new Set([said.failed, said.refused, said.absent]).size).toBe(3);
});

test("WHY-AC-42 the panel is present while the read is in flight, in the shape it is about to be", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // HELD OPEN deliberately: the loading state is the one this suite cannot see
  // by accident, because a local Worker answers faster than a frame.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(RATIONALE_URL, async (route) => {
    await held;
    return route.fulfill({ json: RATIONALE.l1 });
  });

  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  const panel = page.getByTestId("line-why");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("aria-busy", "true");
  // THREE BARS, one per line the panel is about to have — the shape is the
  // point, not the animation.
  await expect(panel.locator("ion-skeleton-text")).toHaveCount(3);
  // AND IT STATES NOTHING WHILE IT IS STILL ASKING. "Not recorded" shown for a
  // read still in flight is the same false absence one beat earlier.
  expect(await panel.innerText()).not.toMatch(/not recorded|could not be read/i);
  const loading = (await panel.boundingBox())!.height;

  release();
  await expect(panel).toContainText("the cheapest of those that met the caps");
  const settled = (await panel.boundingBox())!.height;

  // SO THE PAGE DOES NOT JUMP. A skeleton that reserves the wrong shape moves
  // the price panel under the reader's cursor as the answer lands.
  expect(Math.abs(settled - loading), `panel jumped ${loading} -> ${settled}`).toBeLessThan(24);
});

test("WHY-AC-11 an order record has no panel, and its /why address refuses", async ({ page }) => {
  // An order record serves `orderLines`, not `lines` (record.ts:338) — the
  // contract's own rows, which is what makes this D2's case rather than a
  // dressed-up quote.
  const order = {
    ...record,
    orderLines: [{ id: "l1", code: "W03", room: "Bed 2", productName: "AMJ80 Series Awning Window",
      productSlug: "amj80-series-awning-window", width: "1200", height: "900", qty: 1,
      lineTotal: 640, options: {}, segments: [] }],
    order: { id: "o1", orderNo: "SO-1188", stage: "manufacturing", stageLabel: "In manufacturing",
      paymentStatus: "paid", createdAt: "2026-01-01", total: 5400, deliveryTotal: 0 },
  };
  const calls = await serve(page, {}, order);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();

  // D2: NO PANEL AT ALL, and no sentence in its place.
  await expect(page.getByTestId("line-why")).toHaveCount(0);
  await expect(page.getByTestId("line-review")).not.toContainText("Why this product");
  // And the endpoint is never called — not called and hidden.
  expect(calls.rationale).toBe(0);

  // The `/why` URL renders the same line page, with no detail over it.
  await page.goto(`${LINE("l1")}/why`);
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  await expect(page).toHaveURL(/\/line\/l1$/);
});

// ── The routed detail ───────────────────────────────────────────────────────

test("WHY-AC-7 opening the detail is a NAVIGATION — one entry, and back is a pop", async ({ page }) => {
  const calls = await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  const before = await historyLength(page);
  const fetches = calls.record;

  await page.getByTestId("line-why-open").click();

  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec\/line\/l1\/why$/);
  expect(await historyLength(page) - before).toBe(1);
  // The page beneath never remounted, so the record was not read again.
  expect(calls.record).toBe(fetches);

  // WHY-AC-7a: back GOES somewhere, and it is the line — not the record.
  await page.getByTestId("line-why-detail-back").click();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_rec\/line\/l1$/);
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  await expect(page.getByTestId("line-review")).toBeVisible();

  // THREE ROUND TRIPS LEAVE ONE ENTRY TO POP, not six. A close that pushed
  // forward instead of popping would make browser-back walk back through every
  // open — and the address bar would be right the whole time.
  const base = await historyLength(page);
  for (let i = 0; i < 3; i += 1) {
    await page.getByTestId("line-why-open").click();
    await expect(page.getByTestId("line-why-detail")).toBeVisible();
    await page.getByTestId("line-why-detail-back").click();
    await expect(page.getByTestId("line-why-detail")).toBeHidden();
  }
  expect(await historyLength(page)).toBe(base);
});

test("WHY-AC-7a the browser's own back and Escape are the SAME single pop", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");

  await page.getByTestId("line-why-open").click();
  await expect(page).toHaveURL(/\/line\/l1\/why$/);
  await page.goBack();
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  await expect(page).toHaveURL(/\/line\/l1$/);

  // A FRESH ARRIVAL FOR THE SECOND HALF, deliberately. A real browser
  // navigation leaves `IonRouterOutlet` holding the outgoing view as well as
  // the live one, and a test that guessed which node was which would be
  // asserting about Ionic's stack rather than about Escape.
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  await expect(page).toHaveURL(/\/line\/l1\/why$/);

  // FOCUS MOVES INTO THE SCREEN, and this assertion is why Escape below means
  // anything. Measured before it was written: focus stayed on the door button
  // in the page BEHIND, so Ionic's Escape handler — which dismisses the topmost
  // overlay from a keydown on the document — never ran, and Escape did nothing
  // at all. A keyboard reader was stranded outside a screen they had just
  // navigated to.
  //
  // POLLED, not read once: the panel animates in over 300ms and its content
  // mounts during that, so a single immediate read measures the frame before
  // the screen exists.
  await expect(page.getByTestId("line-why-detail-back")).toBeFocused();

  // Escape is a keyboard convenience, not a second navigation model: it
  // performs the same pop. A detail whose Escape closed state without popping
  // would leave the address bar saying `/why` over a line page — the exact
  // failure the state-only push was rejected to avoid.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  await expect(page).toHaveURL(/\/line\/l1$/);

  // AND IT COMES BACK to the control that opened it, so a keyboard reader
  // resumes where they were rather than at the top of the page.
  await expect(page.getByTestId("line-why-open")).toBeFocused();
});

test("WHY-AC-7c a cold link lands with the detail OPEN, and its back REPLACES", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${LINE("l1")}/why`);

  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await expect(page.getByTestId("line-review")).toBeVisible();
  const length = await historyLength(page);

  // REPLACE, not pop: there is nothing of ours behind a pasted link, and popping
  // would take the reviewer out of the console entirely.
  await page.getByTestId("line-why-detail-back").click();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  expect(await historyLength(page)).toBe(length);
});

test("a /why address on a line with no detail lands on the line, and grows no history", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  // l3 is a person's pick: there is no rationale to open, so the address is not
  // one this line serves. It corrects by replace rather than opening empty.
  await page.goto(`${LINE("l3")}/why`);
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l3$/);
  await expect(page.getByTestId("line-why-detail")).toBeHidden();

  // And a line this project does not have refuses exactly as a missing one does
  // — one sentence, whether reached by URL or by anything else.
  await page.goto(`${LINE("l99")}/why`);
  await expect(page.getByTestId("line-not-found")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l99$/);
});

test("WHY-AC-39/40 the detail's only control is back, and no editor route exists", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  const detail = page.getByTestId("line-why-detail");
  await expect(detail).toBeVisible();

  // ENUMERATE THE SET, rather than asserting one thing is missing: an absence
  // test that names the control it fears is a test that passes the day somebody
  // adds a differently-named one.
  const controls = await detail
    .locator("ion-button, button, a[href], input, select, textarea, [role=button]").all();
  const names = await Promise.all(controls.map((c) => c.evaluate((el) => (el.textContent ?? "").trim())));
  // AND THE ENUMERATION MUST HAVE SEEN SOMETHING: a selector that silently
  // matches nothing reports "no controls" over every screen, which is exactly
  // the assertion that cannot fail.
  expect(names.length).toBeGreaterThan(0);
  expect(names.filter((n) => n !== "")).toEqual(["‹W03"]);

  // R28/WHY-AC-40: no line-editor address is served. `/edit` is not a route, so
  // it normalises to the line rather than rendering anything.
  await page.goto(`${LINE("l1")}/edit`);
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l1$/);
});

test("WHY-AC-12/13/14/15/16 the ladder shows five rows and nothing it must not", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  const detail = page.getByTestId("line-why-detail");

  await expect(detail.getByTestId("why-ladder-row")).toHaveCount(5);
  await expect(detail.getByTestId("why-ladder-row").first()).toContainText("· chosen");
  // WHY-AC-19: a product that has left the catalogue still renders.
  await expect(detail.getByTestId("why-ladder-row").nth(3)).toContainText("amj-discontinued-awning");
  // A figure that was never recorded is said, never dashed.
  await expect(detail.getByTestId("why-ladder-row").nth(4)).toContainText("not recorded");

  // Rows are not interactive: nothing here prices, switches or selects.
  expect(await detail.getByTestId("why-ladder-row").locator("button, a, [role=button]").count()).toBe(0);

  // D18/R9 ON THE RENDERED PAGE, not on the response. The server is asserted
  // separately; this is the half that would catch a skin inventing a delta.
  const text = await detail.innerText();
  expect(text).not.toMatch(/\$|\bGST\b|\bAUD\b|\bex GST\b/i);
  expect(text).not.toMatch(/excluded|withheld|certifi|WERS/i);
  // R2: no word frames a person's change as an error.
  expect(text).not.toMatch(/\bwrong\b|\bincorrect\b|\bmistake\b|\berror\b|\bcorrection\b/i);
});

test("WHY-AC-22/28 a line a person changed shows BOTH, against the same target", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The panel's own three lines are unmoved; only "Chosen" differs (D20).
  await openLine(page, "l2");
  const panel = page.getByTestId("line-why");
  await expect(panel.locator("dt")).toHaveText(["Had to meet", "This one", "Chosen"]);
  await expect(panel.locator("dd").nth(0)).toContainText("Uw ≤ 3.90 · SHGC ≤ 0.44");
  await expect(panel.locator("dd").nth(1)).toContainText("glazing changed");
  await expect(panel.locator("dd").nth(2))
    .toContainText("a person chose this — the platform had recommended AMJ80 Series Awning Window");

  await page.getByTestId("line-why-open").click();
  const detail = page.getByTestId("line-why-detail");
  await expect(detail.getByTestId("why-comparison")).toBeVisible();
  await expect(detail.getByTestId("why-comparison")).toContainText("Platform recommended");
  await expect(detail.getByTestId("why-comparison")).toContainText("On this line now");
  // The platform's own recommendation, shown unchanged beside it.
  await expect(detail.getByTestId("why-comparison")).toContainText("Uw 3.72 · SHGC 0.41");
  await expect(detail.getByTestId("why-comparison-current")).toContainText("Uw 4.10 · SHGC 0.52");
  // R24: the chosen ladder row no longer claims to describe this line.
  await expect(detail.getByTestId("why-ladder-row").first()).toContainText("· the platform's pick");

  // WHY-AC-24: and it is ABSENT when nothing changed, not rendered empty.
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("why-comparison")).toHaveCount(0);
});

test("WHY-AC-20 the whole journey is GETs, and it writes nothing", async ({ page }) => {
  const calls = await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await page.getByTestId("line-why-detail-back").click();
  await expect(page.getByTestId("line-why-detail")).toBeHidden();

  // THE TRACE ITSELF MUST HAVE SEEN SOMETHING. A method list that stayed empty
  // would satisfy "no writes" over a page that made no requests at all.
  expect(calls.methods.length).toBeGreaterThan(0);
  expect(calls.methods.some((m) => m.includes("/rationale"))).toBe(true);
  expect(calls.methods.filter((m) => !m.startsWith("GET "))).toEqual([]);
});

// ── The two widths, and the panel that must not move ────────────────────────

test("WHY-AC-7 the detail is a right-hand slide-out at the desk and FULL SCREEN on the phone", async ({ page }) => {
  await serve(page);

  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("line-why-body")).toBeVisible();
  const desk = await wrapperBox(page);
  // A FLOOR AS WELL AS A CEILING. A wrapper measured before it is laid out
  // reads 0×0, which satisfies "no wider than 520" and proves nothing.
  expect(desk.width).toBeGreaterThan(300);
  expect(desk.width).toBeLessThanOrEqual(520);
  // IN FROM THE RIGHT: its leading edge is past the middle of the window.
  expect(desk.x).toBeGreaterThan(1280 / 2);

  // R26 — full screen IMMEDIATELY on the phone: not a half-height sheet the
  // reader drags up, which is what `SidePanel` does for its other caller and
  // what reusing it unchanged would have reproduced.
  await page.setViewportSize({ width: 390, height: 844 });
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("line-why-body")).toBeVisible();
  const phone = await wrapperBox(page);
  // ITS TOP EDGE is the discriminator, not its height: Ionic lays a sheet modal
  // out at full height and TRANSLATES it down, so height alone reads the same
  // for both forms and could not tell them apart.
  expect(phone.width).toBeGreaterThan(300);
  expect(phone.y).toBeLessThan(60);
  // Ionic draws the drag handle only for sheet modals, so its absence is the
  // form rather than a CSS override.
  expect(await handleCount(page)).toBe(0);
});

test("WHY-AC-7b the Projects filter panel is exactly as it was", async ({ page }) => {
  // The other `SidePanel` caller. Its phone form is approved and shipped, and
  // the two new props default to reproducing it — so this asserts the DEFAULT
  // rather than the feature, which is the half a props change can break
  // silently. `FilterSheet.tsx` appears nowhere in this feature's diff.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${OPS2}/projects`);
  await page.getByTestId("queue-funnel").click();
  const sheet = page.getByTestId("queue-filter-sheet");
  await expect(sheet).toBeVisible();

  // Still the half-height sheet, still with the handle, still dismissed by Done.
  const box = await wrapperBox(page, "queue-filter-sheet");
  // Half-height, which on a sheet modal means its TOP EDGE sits down the
  // screen — see the note in the phone test above.
  expect(box.y).toBeGreaterThan(844 * 0.25);
  expect(await handleCount(page, "queue-filter-sheet")).toBe(1);
  await expect(sheet.getByRole("button", { name: "Done" })).toBeVisible();
  expect(await sheet.getByTestId("queue-filter-sheet-back").count()).toBe(0);
});

