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
    // WHY-AC-37's overflow case: an OPS-decided split of FOUR units, one past
    // the budget of three, so the panel has a remainder to place.
    line("lc", "W20", {
      lineKind: "composite_parent", compositeAxis: "vertical", width: "2400", height: "1500",
      segments: [1, 2, 3, 4].map((i) => ({
        id: `sc${i}`, productSlug: "amj80-series-fixed-window", productName: "AMJ80 Series Fixed Window",
        width: "600", height: "1500", qtyPerParent: 1, qty: 1, lineTotal: 300, status: "ready",
        options: {}, note: "",
      })),
    }),
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

/** A lite of the ops split above, as the rationale records it. */
const opsUnit = (i: number) => ({
  code: `W20${String.fromCharCode(64 + i)}`,
  productSlug: "amj80-series-fixed-window", productName: "AMJ80 Series Fixed Window",
  figures: { uValue: 3.9, shgc: 0.42 }, band: null, basis: null, reviewFlag: false,
});

const RATIONALE: Record<string, unknown> = {
  l1: recommendation(),
  // R17/WHY-AC-37 — a person decided this split, so there is no ladder to open.
  lc: {
    kind: "human",
    current: { productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", figures: null },
    units: [1, 2, 3, 4].map(opsUnit),
  },
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
  await expect(page.getByTestId("line-why-open")).toHaveCount(1);
  // SUPERSEDED by FB-AC-38: every kind has a door now, and a detail behind it
  // that names what was not recorded. What this test still owns is the panel's
  // own words, which did not change.

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
  // SUPERSEDED by FB-AC-38. WHY-AC-41 asked for no control at all on this kind;
  // the owner reversed it ("for consistency and less 'what-if' scenarios in the
  // code"), and the detail behind the door names what was not recorded rather
  // than opening empty.
  //
  // What survives is the SHAPE of the negative: exactly ONE control, and it is
  // the door. `ion-button` stays in the selector because the one other control
  // this panel can legitimately grow — WHY-AC-42's retry — is an `ion-button`,
  // and a count that could not see it would pass with a second control on
  // screen.
  await expect(page.getByTestId("line-why-open")).toHaveCount(1);
  expect(await page.getByTestId("line-why")
    .locator("ion-button, button, a, [role=button]").count()).toBe(1);
});

/**
 * THE ONE THING A REVIEWER IS TOLD about this line's reasoning, taken from
 * whichever element the state puts it in.
 *
 * DELIBERATELY THE SENTENCE, NOT THE BLOCK IT SITS IN. The first version of the
 * test below gathered the panel's text for two states and the whole line body
 * for the third, then asserted the three were distinct — which they were, and
 * would have been however identical their sentences got, because a page dump
 * and two panel dumps are not the same kind of thing. The set was real and its
 * members were not commensurable. Caught by the Codex stop-gate.
 *
 * `""` is a state of its own and the worst one: nothing said anywhere, which is
 * a reviewer concluding there was no reasoning because the screen never told
 * them otherwise.
 */
const REASONING_SENTENCE = [
  "[data-testid=line-why] .lp-why__error",     // the read failed
  "[data-testid=line-why] .lp-panel__more",    // an absence, explained
  "[data-testid=line-why] dd",                 // whatever else the panel states
  "[data-testid=line-not-found] strong",       // the page's own refusal
];
const reasoningSentence = (page: Page) =>
  page.evaluate((selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return (el.textContent ?? "").trim();
    }
    return "";
  }, REASONING_SENTENCE);

test("WHY-AC-42 a failed read, a refusal and a recorded absence are THREE different sentences", async ({ page }) => {
  // THE WHOLE DEFECT IS THE COLLAPSE. A reviewer told "not recorded" stops
  // looking — they conclude the platform never had a reason and move on,
  // possibly confirming a recommendation they could have audited. A reviewer
  // told "could not be read" tries again.
  //
  // So each state is WALKED for its live-DOM facts, its sentence is gathered,
  // and the cross-state claims are made afterwards — distinctness FIRST, so a
  // collapse trips the assertion that exists for it rather than a per-state
  // negative that happens to sit earlier in the file.
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const said: Record<string, string> = {};

  // 1. FAILED — a 5xx. The panel remains and offers a retry.
  const fail = async (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 500, json: { error: "boom" } });
  await page.route(RATIONALE_URL, fail);
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  const panel = page.getByTestId("line-why");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("line-why-retry")).toBeVisible();
  // THE REST OF THE PAGE IS UNAFFECTED — the two reads are independent, so a
  // rationale that cannot be read must not take the line's own facts with it.
  await expect(page.getByTestId("line-spec")).toBeVisible();
  await expect(page.getByTestId("line-price")).toBeVisible();
  said.failed = await reasoningSentence(page);

  // …and the retry actually recovers, which is the only thing that makes
  // offering it honest.
  await page.unroute(RATIONALE_URL, fail);
  await page.getByTestId("line-why-retry").click();
  await expect(panel).toContainText("the cheapest of those that met the caps");
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);

  // 2. REFUSED — and this is the refusal PRODUCTION can serve. A 404 from this
  //    endpoint means the line is not a parent line of this project; a line
  //    with no rationale gets a `human` DTO and a panel, not a refusal. So the
  //    panel is silent BECAUSE THE PAGE ALREADY SAYS IT, which is the claim
  //    this branch previously assumed and never checked.
  await page.goto(`${LINE("l99")}/why`);
  await expect(page.getByTestId("line-not-found")).toBeVisible();
  // UNCHANGED by FB-AC-38. The door became unconditional across the four
  // rationale KINDS; a refusal is not a kind. There is no line here to have a
  // rationale about, and the page already says so.
  await expect(page.getByTestId("line-why")).toHaveCount(0);
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);
  said.refused = await reasoningSentence(page);

  // …and the race that is not a design state: the record still has the line and
  // the rationale 404s underneath it. No panel, no retry, no crash — and the
  // line's own facts still render.
  const refuse = async (route: import("@playwright/test").Route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } });
  await page.route(RATIONALE_URL, refuse);
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-spec")).toBeVisible();
  // UNCHANGED by FB-AC-38, and this is the third of the three sentences the
  // test is named for. A 404 is not a rationale KIND — it is the absence of a
  // rationale altogether — so there is no panel, no retry and no door. The
  // door became unconditional across the four kinds; it did not become
  // unconditional across the failures.
  await expect(page.getByTestId("line-why")).toHaveCount(0);
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);
  await page.unroute(RATIONALE_URL, refuse);

  // 3. RECORDED ABSENCE — the read succeeded and the answer was "nothing was
  //    kept". No retry: there is nothing to try again for.
  await serve(page, { l4: humanPick(null) });
  await openLine(page, "l4");
  await expect(page.getByTestId("line-why")).toContainText("not recorded");
  await expect(page.getByTestId("line-why-retry")).toHaveCount(0);
  said.absent = await reasoningSentence(page);

  // ── The cross-state claims, over three values of the same kind ───────────
  //
  // DISTINCTNESS FIRST. Every negative below would also catch a collapse, and
  // each of them would catch it as "the wrong words appeared" rather than as
  // "two states say one thing" — so the assertion that names the defect gets
  // to be the one that fires.
  expect(new Set([said.failed, said.refused, said.absent]).size,
    `two states say the same thing: ${JSON.stringify(said)}`).toBe(3);

  // AND NONE OF THEM IS SILENCE. A state that says nothing at all is the one
  // WHY-AC-42 exists to prevent, and it would satisfy every "must not say X"
  // assertion ever written.
  for (const [state, sentence] of Object.entries(said)) {
    expect(sentence, `the ${state} state says nothing at all`).not.toBe("");
  }

  expect(said.failed).toBe("The reasoning for this line could not be read just now.");
  expect(said.failed).not.toMatch(/not recorded/i);
  // THE POSITIVE ASSERTION THE REFUSAL BRANCH WAS MISSING: the panel is silent
  // because the page owns the sentence, so the sentence has to be there.
  expect(said.refused).toBe("This line is not on this project.");
  expect(said.refused).not.toMatch(/could not be read|not recorded/i);
  expect(said.absent).toMatch(/not recorded|saved before performance figures were kept/);
  expect(said.absent).not.toMatch(/could not be read/i);
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

test("WHY-AC-37 the remainder is the last entry INSIDE the These-ones value", async ({ page }) => {
  // FOLDED IN FROM THE TESTER'S PROBE, which found this MAJOR: the count
  // rendered below the *Chosen* row, 108px into the label column's gutter, with
  // an unrelated sentence physically between it and the units it counts.
  //
  // The node suite pins the STRING ("+1 more units"); the criterion is about
  // WHERE it renders, which only a browser holds. Both halves are asserted,
  // because a fix satisfying containment while leaving the text adrift, or
  // adjacency without containment, would still break the rule.
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "lc");

  const more = page.getByTestId("line-why-more");
  await expect(more).toHaveText(/\+1 more units/);

  // 1. CONTAINMENT — the criterion's own words: the last entry INSIDE the
  //    "These ones" value.
  const inside = await more.evaluate((el) => {
    const dd = el.closest("dd");
    if (!dd) return { insideValue: false, label: null as string | null };
    const row = dd.closest(".lp-panel__line") ?? dd.parentElement;
    return { insideValue: true, label: row?.querySelector("dt")?.textContent?.trim() ?? null };
  });
  expect(inside.insideValue, "the remainder sits inside a <dd> (the value column)").toBe(true);
  expect(inside.label, "and that value is the units line's").toMatch(/These ones/i);

  // 2. ASSOCIATION — nothing unrelated between the units and their count. This
  //    is the fault the criterion names: a cutoff a reader cannot associate
  //    with its list becomes a floating number.
  const between = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=line-why-more]") as HTMLElement | null;
    const units = [...document.querySelectorAll(".lp-why__unit")]
      .filter((u) => u !== el) as HTMLElement[];
    if (!el || !units.length) return null;
    const last = units[units.length - 1].getBoundingClientRect();
    const mine = el.getBoundingClientRect();
    const rows = [...document.querySelectorAll(".lp-panel__lines dd")] as HTMLElement[];
    return {
      gap: Math.round(mine.top - last.bottom),
      leftDelta: Math.round(mine.left - last.left),
      interposed: rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top >= last.bottom && b.bottom <= mine.top && !r.contains(el);
      }).map((r) => (r.textContent ?? "").trim().slice(0, 40)),
    };
  });
  expect(between, "the units and the remainder both rendered").not.toBeNull();
  expect(between!.interposed,
    `unrelated rows sit between the unit list and its count: ${JSON.stringify(between)}`).toEqual([]);
  // …and it starts in the same column as the units, not out in the label gutter.
  expect(Math.abs(between!.leftDelta),
    `the remainder starts ${between!.leftDelta}px from its list's edge`).toBeLessThanOrEqual(4);
});

test("WHY-AC-44 exactly one routed surface, on every address in the grammar", async ({ page }) => {
  // §12 note 6 — the SET, not one member of it. The MAJOR this criterion was
  // written for was a viewer opening BEHIND the rationale; the two assertions
  // that caught it cover only the `/why` row. The bare address and the drawing
  // address had never been asserted to exclude their sibling, and §2.1's
  // switch panel will be the third surface at that address.
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const surfaces = async () => ({
    detail: (await page.getByTestId("line-why-detail").count())
      ? await page.getByTestId("line-why-detail").first().isVisible() : false,
    viewer: (await page.getByTestId("drawing-viewer").count())
      ? await page.getByTestId("drawing-viewer").first().isVisible() : false,
  });

  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();
  expect(await surfaces(), "…/line/:id shows neither").toEqual({ detail: false, viewer: false });

  await page.goto(`${LINE("l1")}/why`);
  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  expect(await surfaces(), "…/why shows the detail and NO viewer").toEqual({ detail: true, viewer: false });

  await page.goto(`${LINE("l1")}/drawing`);
  await expect(page.getByTestId("drawing-viewer").first()).toBeVisible();
  expect(await surfaces(), "…/drawing shows the viewer and NO detail").toEqual({ detail: false, viewer: true });
});

test("FB-AC-44 the record canvas carries the panel and issues its rationale request", async ({ page }) => {
  // SUPERSEDED: WHY-AC-43 / owner ruling D21 said this canvas shows no panel
  // and issues no rationale request, and `ProjectRecordPage` carried a comment
  // saying the null was deliberate and that wiring it was "a real decision
  // about this surface". The owner took it: "not tested yet. but yes."
  //
  // The old test's REASON survives the reversal and is what this now measures.
  // It was written because "no panel visible" is the weaker claim: a canvas
  // that fetched a rationale and rendered nothing would satisfy it while
  // spending a read on every line a reviewer clicks. So the assertion is not
  // "it asks" — it is that it asks ONCE PER LINE and never twice for the same
  // one, which is the same defect the absence was protecting against.
  const calls = await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${OPS2}/projects/p_rec`);
  await page.waitForLoadState("networkidle");
  await page.getByText("W03", { exact: false }).first().click({ timeout: 10_000 })
    .catch(() => { /* the canvas may already have a line selected */ });

  // THE CANVAS REACHED THE STATE UNDER TEST. The click is `.catch()`-swallowed,
  // so without this the empty request list below also holds when no line body
  // ever rendered — and the control that follows runs on a DIFFERENT page, so
  // it proves the counter is live, not that this page was ever in the state D21
  // is about. A control on another page is not a control.
  await expect(page.getByTestId("line-review")).toBeVisible();
  await page.waitForTimeout(1500);

  await expect(page.getByTestId("line-why")).toHaveCount(1);

  const asked = calls.methods.filter((m) => m.includes("/rationale"));
  expect(asked.length, "the canvas asks for the line it is showing").toBeGreaterThan(0);
  // NO LINE ASKED TWICE. A selection that re-fetched on every render would pass
  // a bare "it asked" and is exactly the waste D21 was avoiding.
  expect(new Set(asked).size, `one read per line, got ${asked.join(", ")}`)
    .toBe(asked.length);

  // AND NOT WHEN THE READER COMES BACK TO IT. The version above passed while
  // A -> B -> A read A twice, because it never went back: one hook instance is
  // reused as the selection changes and it keeps only the current result. This
  // is the direction that actually costs a read on a rail a reviewer walks up
  // and down, and it is the invariant the assertion above was written for.
  const rows = page.getByTestId("record-line");
  await rows.nth(0).click();
  await expect(page.getByTestId("line-review")).toBeVisible();
  await rows.nth(1).click();
  await expect(page.getByTestId("line-review")).toBeVisible();
  await rows.nth(0).click();
  await expect(page.getByTestId("line-review")).toBeVisible();
  await page.waitForTimeout(800);

  const revisited = calls.methods.filter((m) => m.includes("/rationale"));
  expect(new Set(revisited).size, `one read per line across a walk, got ${revisited.join(", ")}`)
    .toBe(revisited.length);

  // THE CONTROL. The same counter on the LINE page does record a call, so the
  // empty list above means "no request" rather than "the counter never worked".
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-why")).toBeVisible();
  expect(calls.methods.filter((m) => m.includes("/rationale")).length,
    "the counter is live — the line page issues the read").toBeGreaterThan(0);
});

test("WHY-AC-18 re-entering the line page re-reads the reasoning, not just the record", async ({ page }) => {
  // IONIC KEEPS THE PAGE MOUNTED, so an effect keyed on the line id runs once
  // per document and never again. `useProjectRecord` refreshes on a real
  // departure for exactly this reason — a reviewer leaves, changes the line in
  // the legacy console, and comes back.
  //
  // The rationale read had no such refresh, so the return showed REFRESHED
  // RECORD DATA BESIDE STALE REASONING. Worse than ordinary staleness: this
  // panel's whole claim is "this is what was recorded", and two panels on one
  // screen disagreeing about one line is what D16's condition exists to
  // prevent, arriving from the client side.
  const calls = await serve(page);
  // PHONE WIDTH, because that is where the record shows its LINE LIST — at the
  // desk it shows the canvas, which has no panel by D21. This is the journey
  // the shipped record test walks for the same reason.
  await page.setViewportSize({ width: 390, height: 844 });
  const reads = () => calls.methods.filter((m) => m.includes("/rationale")).length;

  await page.goto(`${OPS2}/projects/p_rec`);
  await expect(page.getByTestId("record-line").first()).toBeVisible();
  await page.getByTestId("record-line").first().click();
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page.getByTestId("line-why")).toBeVisible();
  const afterFirst = reads();
  expect(afterFirst, "the line page read the reasoning once").toBeGreaterThan(0);

  // Leave the line for the record, IN-APP — a reload would refetch by itself
  // and prove nothing about the mounted page.
  await page.goBack();
  await expect(page.getByTestId("record-line").first()).toBeVisible();

  // WHY IT RE-READS TODAY, said out loud because it is not this hook's doing:
  // Ionic re-uses the page you RETURN to, not the one you go to, so the record
  // survives the round trip and the line page is built fresh. `useProjectRecord`
  // needs an explicit refresh for exactly the opposite reason.
  //
  // That makes the invariant below true by an upstream policy rather than by
  // anything this seam decides — so the seam holds it itself, and this asserts
  // the property rather than the mechanism.
  await page.getByTestId("record-line").first().click();
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page.getByTestId("line-why")).toBeVisible();
  await expect.poll(reads, { timeout: 5_000 })
    .toBeGreaterThan(afterFirst);
  const mounted = await page.evaluate(() =>
    document.querySelectorAll("[data-testid=line-review]").length);
  expect(mounted, "one live line body, however Ionic got there").toBeGreaterThan(0);

  // AND OPENING A CHILD IS NOT LEAVING. The same guard that arms the refresh
  // must not fire on `/why` or `/drawing`, or every enlargement re-reads.
  const afterReturn = reads();
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await page.getByTestId("line-why-detail-back").click();
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  expect(reads(), "opening the detail is not leaving the line").toBe(afterReturn);
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

  // D2: NO PANEL AT ALL, and no sentence in its place. UNCHANGED by FB-AC-38 —
  // the door became unconditional across the four rationale KINDS, and an order
  // line has no rationale of any kind: a contract row is not a quote line and
  // was never the subject of a selection run.
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
  // AND NOTHING ELSE OPENED. The line page hosts two children and the grammar
  // admits one suffix, so a rationale must never arrive with a drawing viewer
  // behind it — a screen nobody asked for, carrying its own back control to
  // somewhere unexpected. Asserted on the CLICK path; the cold path is the
  // other half and it is asserted there.
  await expect(page.getByTestId("drawing-viewer")).toBeHidden();
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
  // The cold half of the same claim: a pasted `/why` opens ONE screen.
  await expect(page.getByTestId("drawing-viewer")).toBeHidden();
  const length = await historyLength(page);

  // REPLACE, not pop: there is nothing of ours behind a pasted link, and popping
  // would take the reviewer out of the console entirely.
  await page.getByTestId("line-why-detail-back").click();
  await expect(page).toHaveURL(/\/line\/l1$/);
  await expect(page.getByTestId("line-why-detail")).toBeHidden();
  expect(await historyLength(page)).toBe(length);
});

test("FB-AC-38 a /why address is served on every resolved kind, and grows no history", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  // SUPERSEDED: WHY-AC-7d normalised `/why` back to the line for any kind but
  // `recommendation`. That was the THIRD place one rule lived — the door, the
  // detail's render and the route each withheld it separately — and it is the
  // "what-if scenarios in the code" the owner ruled out. Fixing two of the
  // three would have produced a door that changed the URL and opened nothing.
  //
  // l3 is a person's pick. There is no machine rationale, and the address is
  // served anyway: what opens names what was not recorded.
  await page.goto(`${LINE("l3")}/why`);
  await expect(page.getByTestId("line-review")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/l3\/why$/);
  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await expect(page.getByTestId("why-requirement")).toContainText("Not recorded for this line.");

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
  // PINNED AT 520, NOT CAPPED BY IT, and ±1px because that is the size of the
  // error and no larger.
  //
  // `min(88vw, 520px)` measures 520.0000610351562 here — sub-pixel float in the
  // layout, reproduced on a clean tree, and `toBeLessThanOrEqual(520)` failed on
  // it. The lazy repair is a bigger ceiling; the honest one is a tolerance the
  // size of the defect. ±1 absorbs the float and nothing else: a real 4px
  // regression, or the widening this assertion exists to catch, still fails.
  // A one-sided ceiling was also weaker than it read — it holds at 100px too,
  // which is why the floor was there at all. One two-sided assertion replaces
  // both and says the number out loud.
  expect(Math.abs(desk.width - 520),
    `the desk slide-out is ${desk.width}px, not 520`).toBeLessThan(1);
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


test("FB-AC-38/42 — every kind opens a detail, and it names what was not recorded", async ({ page }) => {
  // WHY-AC-41 gave a panel with no recorded run no control at all. Reported:
  // "Why This product - is not clickable, does not lead to more detailed view,
  // does not have '>' to indicate possible path." Owner ruling: "I think it
  // should, for consistency and less 'what-if' scenarios in the code."
  //
  // The door is only honest if the screen behind it is. These three kinds carry
  // no requirement and no candidates, so the detail keeps the SAME headings and
  // states each absence — a screen whose shape changes has to be read before
  // its content can be, and a missing heading is a fact the reader must infer.
  await serve(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // `l5` is `unrecorded`: a run from before the model kept outcomes.
  await page.goto(LINE("l5"));
  const panel = page.getByTestId("line-why");
  await expect(panel).toBeVisible();

  const door = page.getByTestId("line-why-open");
  await expect(door).toBeVisible();
  await expect(door).toHaveAttribute("aria-label", /open what was recorded/);

  await door.click();
  const detail = page.getByTestId("line-why-detail");
  await expect(detail).toBeVisible();

  // The three headings, all present, each saying what it has.
  await expect(detail.getByTestId("why-requirement")).toContainText("Not recorded for this line.");
  await expect(detail.getByTestId("why-figures")).toBeVisible();
  await expect(detail.getByTestId("why-ladder")).toContainText("No alternatives were recorded for this line.");

  // The `Chosen` sentence is the PANEL'S, verbatim — the two surfaces may not
  // describe one line differently.
  // VERBATIM, which is the criterion — not "says something similar". The two
  // surfaces may not describe one line differently, so the detail's sentence is
  // compared against the panel's own rather than against a word I picked.
  const panelChosen = await panel.locator("dd").last().innerText();
  await expect(detail.getByTestId("why-chosen")).toHaveText(panelChosen.trim());

  // WHY-AC-39/40 still hold, and they are about the BODY: nothing in what the
  // detail SAYS is pressable. The panel's own way out is not part of that — it
  // is the surface, not the content.
  await expect(detail.locator(".wd button, .wd a, .wd [role=button]")).toHaveCount(0);
});

test("FB-AC-42 — `unresolved` says nothing was selected, and never prints an absent figure", async ({ page }) => {
  // The distinction the KIND carries and the figures cannot: a run that
  // established there was nothing to select is not a product with no published
  // figure. Both arrive present-and-null, so a detail that printed `not
  // recorded` here would state the wrong absence.
  await serve(page, {
    l5: { kind: "unresolved", current: { productSlug: "amj80-series-awning-window", productName: "AMJ80 Series Awning Window", figures: null } },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LINE("l5"));

  await page.getByTestId("line-why-open").click();
  const detail = page.getByTestId("line-why-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("why-figures")).toContainText("no selection was made on this line");
  await expect(detail.getByTestId("why-figures")).not.toContainText("not recorded");
});

test("FB-AC-44 — the desk canvas carries the panel, and its door opens the LINE's detail", async ({ page }) => {
  // `ProjectRecordPage` passed `why={null}` with a comment saying the null was
  // deliberate and that wiring it was "a real decision about this surface, not
  // a rider on the line page's". The owner took it — "not tested yet. but yes."
  // — which supersedes WHY-AC-43/D21, the ruling that this canvas shows no
  // panel and issues no rationale request.
  await serve(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${OPS2}/projects/p_rec`);

  await expect(page.getByTestId("record-canvas")).toBeVisible();
  const panel = page.getByTestId("line-why");
  await expect(panel).toBeVisible();

  // ONE DOOR, ONE ADDRESS. The route grammar allows exactly one `/why`, so the
  // canvas opens the LINE's detail rather than a second copy of it — and back
  // returns to the record it was opened from.
  await page.getByTestId("line-why-open").click();
  await expect(page.getByTestId("line-why-detail")).toBeVisible();
  await expect(page).toHaveURL(/\/line\/[^/]+\/why$/);

  // FB-AC-45 — BACK NAMES THE DOOR IT CAME THROUGH. There are two doors now and
  // this reader came through the canvas's, having never seen the line page: a
  // control naming the line would send them somewhere they have not been. The
  // mark carries which door (`WHY_FROM_RECORD`), so the two are distinguishable
  // — the exact indistinguishability `lineRoute.ts` warns one shared key causes.
  await expect(page.getByTestId("line-why-detail-back")).toContainText("OF-Q-10482");

  // AND IT LANDS THERE. The name is only a promise; this is the promise kept —
  // and the two are asserted together because a control that says "OF-Q-10482"
  // and goes to the line page is worse than one that says "Line".
  await page.getByTestId("line-why-detail-back").click();
  await expect(page).toHaveURL(/\/projects\/p_rec$/);
});

// ── OP — the openable panel ─────────────────────────────────────────────────
//
// The door became a component. These prove the four things it owns
// still agree once they are drawn: the chevron's position, the absence of any
// affordance on a panel that opens nothing, one tab stop, and a click that
// lands anywhere on the card.

const centres = async (page: Page, panelId: string) => {
  const panel = await page.getByTestId(panelId).boundingBox();
  const chev = await page.getByTestId(panelId).locator("svg.lp-panel__chev").boundingBox();
  if (!panel || !chev) throw new Error(`no box for ${panelId}`);
  return { panel, chev };
};

test("OP-1 the chevron is centred on the panel's full height, inside its right edge", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  // `lc` is the tall composite: the accepted trade is that the arrow sits well
  // below the heading rather than riding it, so a tall panel is the test.
  await openLine(page, "lc");
  const { panel, chev } = await centres(page, "line-why");
  expect(Math.abs((chev.y + chev.height / 2) - (panel.y + panel.height / 2))).toBeLessThanOrEqual(2);
  expect(chev.x + chev.width).toBeLessThanOrEqual(panel.x + panel.width);
  expect(chev.x).toBeGreaterThan(panel.x + panel.width / 2);
});

test("OP-2 and it stays centred on a phone", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLine(page, "lc");
  const { panel, chev } = await centres(page, "line-why");
  expect(Math.abs((chev.y + chev.height / 2) - (panel.y + panel.height / 2))).toBeLessThanOrEqual(2);
});

test("OP-3 a panel that opens nothing grows no chevron, no control and no gutter", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  // `line-price` used to be one of these. It became a door when the price
  // calculator arrived, which is the component earning its keep — so the
  // panels that still open nothing are Specification and the customer's note.
  for (const id of ["line-spec", "line-note"]) {
    await expect(page.getByTestId(id).locator("svg.lp-panel__chev")).toHaveCount(0);
    await expect(page.getByTestId(id).locator("button.lp-panel__door")).toHaveCount(0);
  }
  const padding = (id: string) => page.getByTestId(id)
    .evaluate((el) => getComputedStyle(el).paddingRight);
  expect(await padding("line-spec")).toBe(await padding("line-note"));
});

test("OP-4 every term and value stays individually exposed — the door's name is only its own", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  const panel = page.getByTestId("line-why");
  const terms = await panel.getByRole("term").count();
  expect(terms).toBeGreaterThanOrEqual(1);
  expect(await panel.getByRole("definition").count()).toBe(terms);
  const name = await page.getByTestId("line-why-open").getAttribute("aria-label");
  for (const term of await panel.getByRole("term").allInnerTexts()) {
    expect(name).not.toContain(term);
  }
});

test("OP-5 one tab stop, and both Enter and Space open the detail", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await expect(page.getByTestId("line-why").locator("button")).toHaveCount(1);

  await page.getByTestId("line-why-open").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/why$/);

  // Re-enter the line page rather than navigating back: the return journey has
  // its own tests (WHY-AC-7a), and borrowing them here would make this one fail
  // for their reasons instead of its own.
  await openLine(page, "l1");
  await page.getByTestId("line-why-open").focus();
  await page.keyboard.press(" ");
  await expect(page).toHaveURL(/\/why$/);
});

test("OP-6 a click on the card's bare padding opens it — the whole block is the door", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  const panel = await page.getByTestId("line-why").boundingBox();
  if (!panel) throw new Error("no panel box");
  // Bottom-left of the card: inside the door, on no text of its own.
  await page.mouse.click(panel.x + 6, panel.y + panel.height - 6);
  await expect(page).toHaveURL(/\/why$/);
});

// ── MP — the price calculator ───────────────────────────────────────────────
//
// Ops gets a price per line from the manufacturer and has to reach a customer
// price from it. The panel exists to save reaching for a calculator, and keeps
// nothing: the working is scaffolding on the way to a number, and the number is
// the fact. These are the states node cannot see, because the form does not
// exist in the page until the door is opened.

test("MP-1 the Price panel is a door, and it opens the calculator", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");

  await expect(page.getByTestId("line-price").locator("svg.lp-panel__chev")).toHaveCount(1);
  await expect(page.getByTestId("line-price-figure")).toHaveCount(0);

  await page.getByTestId("line-price-open").click();
  await expect(page.getByTestId("line-price-figure")).toBeVisible();
  await expect(page.getByTestId("line-price-uplift")).toBeVisible();
});

test("MP-2 the arithmetic appears as it is typed, and the uplift defaults to 30", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-price-open").click();

  // Nothing typed: the space holds its height and Confirm cannot be pressed.
  await expect(page.getByTestId("line-price-work")).toHaveCount(0);
  // `ion-button` is a custom element, so toBeDisabled() cannot read it — the
  // attribute it actually sets is the assertion.
  await expect(page.getByTestId("line-price-confirm")).toHaveAttribute("aria-disabled", "true");

  await page.getByTestId("line-price-figure").locator("input").fill("1240");
  const work = page.getByTestId("line-price-work");
  await expect(work).toContainText("$1,240.00");
  await expect(work).toContainText("30%");
  await expect(work).toContainText("$372.00");
  await expect(work).toContainText("$1,612.00");
  await expect(page.getByTestId("line-price-confirm")).not.toHaveAttribute("aria-disabled", "true");
});

test("MP-3 declaring the figure tax-inclusive converts before the uplift", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-price-open").click();
  await page.getByTestId("line-price-figure").locator("input").fill("1240");
  await page.getByTestId("line-price-basis-inc").click();

  // 1240 / 1.1 = 1127.27, then + 30% = 1465.45.
  await expect(page.getByTestId("line-price-work")).toContainText("$1,127.27");
  await expect(page.getByTestId("line-price-work")).toContainText("$1,465.45");
});

test("MP-4 the read-back shows what the line becomes, beside what it was", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");
  await page.getByTestId("line-price-open").click();
  await page.getByTestId("line-price-figure").locator("input").fill("1240");

  const readback = page.getByTestId("line-price-readback");
  await expect(readback).toContainText("$1,612.00");
  await expect(readback.locator("s")).toHaveCount(1, "the superseded figure is struck through");
  // The project total is NOT here: it is not this decision (owner, 2026-08-31).
  await expect(readback).not.toContainText("Quote total");
});

test("MP-5 re-opening starts clean — nothing was kept", async ({ page }) => {
  await serve(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLine(page, "l1");

  await page.getByTestId("line-price-open").click();
  await page.getByTestId("line-price-figure").locator("input").fill("1240");
  await expect(page.getByTestId("line-price-work")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("line-price-figure")).toHaveCount(0);

  await page.getByTestId("line-price-open").click();
  await expect(page.getByTestId("line-price-figure").locator("input")).toHaveValue("");
  await expect(page.getByTestId("line-price-uplift").locator("input")).toHaveValue("30");
  await expect(page.getByTestId("line-price-work")).toHaveCount(0);
});
