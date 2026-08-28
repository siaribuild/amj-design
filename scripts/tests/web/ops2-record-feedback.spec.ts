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

/** A design token, resolved to the same `rgb(...)` form `getComputedStyle`
 *  reports — so a criterion naming a token can be asserted against a paint
 *  rather than against the token's text. */
const token = (page: import("@playwright/test").Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${n})`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);

test("FB-AC-1 — hovering a flagged row does not erase its leading edge", async ({ page }) => {
  // THE REPORTED DEFECT, and the reason there is now one row component.
  //
  // "onHover on project detail list removed left highlighted border. Same issue
  // existed in project list previously - are we reusing components here at
  // all???" — the answer was no. The edge was an inset shadow on the `<li>` and
  // the wash was a background on the `<button>` filling it; a child's background
  // paints over a parent's inset shadow, so hovering erased the one mark saying
  // the line needed a person. The queue had already hit this, fixed it in place
  // and written down why, and the fix could not travel because nothing carried
  // it between the two surfaces.
  //
  // Both are computed on `.ops2-row__open` now, so the assertion is that the
  // hovered row has BOTH — not that it looks right, that the two facts survive
  // together on one element.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line(),
      line({ id: "l2", code: "W02", status: "technical_review", review: { size: "size outside the product range" } }),
    ],
  }) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RECORD);

  const flagged = page.getByTestId("record-line").nth(1);
  await expect(flagged).toHaveAttribute("data-edge", "warning");
  const press = flagged.locator(".ops2-row__open");

  const read = () => press.evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, background: s.backgroundColor };
  });

  const rest = await read();
  expect(rest.shadow).not.toBe("none");

  await flagged.hover();
  const hovered = await read();

  // The wash arrived…
  expect(hovered.background).not.toBe(rest.background);
  // …and the edge is still there, unchanged. This is the assertion that failed
  // before the extraction.
  expect(hovered.shadow).toBe(rest.shadow);
  expect(hovered.shadow).not.toBe("none");

  // AND THE TWO ARE ON ONE ELEMENT, which is what makes the above structural
  // rather than a happy accident of paint order.
  const onRow = await flagged.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(onRow).toBe("none");
});

test("FB-AC-13 — the pill is drawn only when something needs a person, and it carries the filter", async ({ page }) => {
  // THE OWNER DELETED THE BAND THIS REPLACES, on sight: "the large pill-like
  // area that says '2 lines have no rate' is the solution — use that design and
  // incorporate quick filter in it. Drop the yellow bar altogether — it
  // duplicates what the pill says. no pill when the filter is cleared."
  //
  // So: one object, in the page rather than in the band, and NOTHING when there
  // is nothing to say. A permanent line reporting the absence of news is a line
  // the eye learns to skip, which is what made the band's "Nothing is blocking
  // this quote" state worth deleting rather than restyling.
  await page.setViewportSize({ width: 390, height: 844 });

  // Nothing wrong ⇒ nothing drawn, and the band carries no attention row at all.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line(), line({ id: "l2", code: "W02", lineTotal: 2000 })],
  }) }));
  await page.goto(RECORD);
  await expect(page.getByTestId("record-identity")).toBeVisible();
  await expect(page.getByTestId("record-attention")).toHaveCount(0);
  await expect(page.locator(".ops2-page__band [data-testid=record-attention]")).toHaveCount(0);
  await page.unroute(RECORD_URL);

  // Something wrong ⇒ one pill, in the body, above the list.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line(),
      line({ id: "l2", code: "W02", lineTotal: null, status: "incomplete" }),
      line({ id: "l3", code: "W03", status: "technical_review", review: { size: "size outside the product range" } }),
    ],
  }) }));
  await page.goto(RECORD);
  const pill = page.getByTestId("record-attention");
  await expect(pill).toBeVisible();
  await expect(pill).toContainText("2 lines need attention");
  await expect(pill).toContainText("Show only these");

  // IT IS IN THE PAGE, NOT IN THE BAND. The band is the header; the owner's
  // ruling was that a strip wedged between the rail and the first card is not a
  // solution, and the pill is a block on the page instead.
  await expect(page.locator(".ops2-page__band [data-testid=record-attention]")).toHaveCount(0);
  const list = (await page.getByTestId("record-lines").boundingBox())!;
  const box = (await pill.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(list.y + 1);

  // AND IT IS THE FILTER. One press narrows the list to exactly the rows the
  // list itself marks; a second restores it.
  await expect(page.getByTestId("record-line")).toHaveCount(3);
  await pill.click();
  await expect(page.getByTestId("record-line")).toHaveCount(2);
  await expect(pill).toContainText("Showing 2 lines that need attention");
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await pill.click();
  await expect(page.getByTestId("record-line")).toHaveCount(3);
});

test("FB-AC-20 — the pill and the refusal never say the same thing twice", async ({ page }) => {
  // THE DUPLICATION THE OWNER DELETED. The gate refuses on things that are not
  // lines — an unsettled delivery, a project state a quote cannot be issued
  // from — and those still need saying, in the SERVER's own words, because
  // nothing else on the page says them. What must not happen is both at once:
  // the count and the prose describing one fact.
  await page.setViewportSize({ width: 390, height: 844 });

  // Lines need attention ⇒ the pill speaks and the refusal stays quiet.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineTotal: null, status: "incomplete" })],
    actions: [{
      id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
      blockedReason: "1 line has no rate. This quote cannot be issued.",
    }],
  }) }));
  await page.goto(RECORD);
  await expect(page.getByTestId("record-attention")).toBeVisible();
  await expect(page.getByTestId("record-blocked")).toHaveCount(0);
  await page.unroute(RECORD_URL);

  // A refusal the pill cannot express ⇒ the server's sentence, and no pill.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line(), line({ id: "l2", code: "W02", lineTotal: 2000 })],
    delivery: { amount: null, settled: false, estimate: null },
    actions: [{
      id: "issue-quote", label: "Issue reviewed quote", tier: "primary",
      blockedReason: "Delivery has not been set. This quote cannot be issued.",
    }],
  }) }));
  await page.goto(RECORD);
  await expect(page.getByTestId("record-blocked")).toContainText("Delivery has not been set");
  await expect(page.getByTestId("record-attention")).toHaveCount(0);
});

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

test("FB-AC-2 — a row that is selected AND flagged keeps one edge, and hover changes neither", async ({ page }) => {
  // THE CONTESTED RULING, PINNED. The ui-designer drew the flag winning; the
  // architect ruled selection wins (design 3.1) because the flag still has
  // words on the row — the `needs review` badge — and at the desk the canvas
  // beside the rail is showing that line's whole reasons panel, while selection
  // has no word a sighted reader can see. Someone will re-litigate it; without
  // this they would re-litigate it silently.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [
      line(),
      line({ id: "l2", code: "W02", status: "technical_review", review: { size: "size outside the product range" } }),
    ],
  }) }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(RECORD);

  const flagged = page.getByTestId("record-line").nth(1);
  await flagged.click();
  await expect(flagged).toHaveAttribute("data-selected", "true");
  await expect(flagged).toHaveAttribute("data-edge", "warning");
  await expect(flagged).toHaveAttribute("aria-current", "true");

  const press = flagged.locator(".ops2-row__open");
  const read = () => press.evaluate((el) => {
    const s = getComputedStyle(el);
    return { shadow: s.boxShadow, background: s.backgroundColor };
  });

  const rest = await read();
  const brand = await token(page, "--ds-color-brand");
  const warning = await token(page, "--ds-color-warning");
  expect(rest.shadow).toContain(brand.replace(/^rgba?\(|\)$/g, "").split(",").slice(0, 3).map((n) => n.trim()).join(", "));
  expect(rest.shadow).not.toContain(warning.replace(/^rgba?\(|\)$/g, "").split(",").slice(0, 3).map((n) => n.trim()).join(", "));

  // ONE ELEMENT, so hover cannot take either of them away — the FB-AC-1
  // invariant, on the row wearing the most state at once.
  await flagged.hover();
  const hovered = await read();
  expect(hovered.shadow).toBe(rest.shadow);
  expect(await flagged.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");

  // And the flag still has its words, which is the whole reason selection may
  // take the edge.
  await expect(flagged).toContainText("needs review");
});

test("FB-AC-5 — the three list surfaces are literally the same component", async ({ page }) => {
  // THE OWNER'S ACTUAL ASK, reduced to one assertion: "to me - the component is
  // the same, the content within it differ. I'd expect that other areas of Ops2
  // will have the same component ... Same logic for displaying the list of
  // components, not just individual ones."
  //
  // Three surfaces, one container class and one row class on every one of them.
  // Without this the extraction is a claim in a commit message; with it, a
  // fourth surface written against the old markup fails here.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ lineKind: "composite_parent", segments: [
      { id: "s1", code: "A", productName: "Awning", productSlug: "amj80-series-awning-window", width: "600", height: "900", qty: 1, lineTotal: 500, options: {} },
      { id: "s2", code: "B", productName: "Fixed", productSlug: "amj80-series-fixed-window", width: "600", height: "900", qty: 1, lineTotal: 500, options: {} },
    ] })],
  }) }));
  await page.setViewportSize({ width: 390, height: 844 });

  // 1 — the queue's phone cards.
  await page.goto(QUEUE);
  await expect(page.locator("ul.ops2-rows").first()).toBeVisible();
  expect(await page.getByTestId("queue-row").first().getAttribute("class")).toContain("ops2-row");

  // 2 — the record's line list.
  await page.goto(RECORD);
  expect(await page.getByTestId("record-lines").getAttribute("class")).toContain("ops2-rows");
  expect(await page.getByTestId("record-line").first().getAttribute("class")).toContain("ops2-row");

  // 3 — the line page's unit rows.
  await page.getByTestId("record-line").first().click();
  await expect(page.getByTestId("line-units")).toBeVisible();
  expect(await page.locator(".lp-units__list").getAttribute("class")).toContain("ops2-rows");
  expect(await page.getByTestId("line-unit-open").first().getAttribute("class")).toContain("ops2-row__open");

  // AND THE DESK TABLE IS NOT ONE — deliberately out of scope, so a later pass
  // does not quietly fold column semantics into a card row.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(QUEUE);
  await expect(page.locator("table.pq-table")).toBeVisible();
  await expect(page.locator("table.pq-table .ops2-row")).toHaveCount(0);
});

test("FB-AC-36 — ops2 shows the break symbol under the same conditions the customer site does", async ({ page }) => {
  // THE HALF WITH NO TEST. The paint-order fix is pinned in node
  // (`ops2-record.test.mjs`, FB-AC-34) but the two CSS rules ported into
  // `record.css` had nothing watching them: delete them and everything stayed
  // green while ops2 drew a symbol the customer site hides. That is the same
  // gap as a named-but-never-created spec file, one layer down.
  await page.route(RECORD_URL, (route) => route.fulfill({ json: record({
    lines: [line({ id: "lw", code: "W02", width: "3500", height: "700" })],
  }) }));

  // A phone: the drawing really has been squeezed, so the symbol is drawn.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${RECORD}/line/lw`);
  const brk = page.locator(".lp-plate__svg .elev-break");
  await expect(brk).toHaveCount(1);
  expect(await brk.evaluate((el) => getComputedStyle(el).display)).toBe("block");

  // A desk: it is not, so it is not — the customer theme's own breakpoint,
  // ported rather than re-decided.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${RECORD}/line/lw`);
  await expect(page.locator(".lp-plate__svg")).toBeVisible();
  expect(await page.locator(".lp-plate__svg .elev-break")
    .evaluate((el) => getComputedStyle(el).display)).toBe("none");

  // AND THE FIGURE IS NEVER UNDER IT, at the width where the symbol shows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${RECORD}/line/lw`);
  const order = await page.locator(".lp-plate__svg").evaluate((svg) => {
    const brk = svg.querySelector(".elev-break")!;
    const text = [...svg.querySelectorAll("text")].find((t) => t.textContent === "3500")!;
    return (brk.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  });
  expect(order, "the width figure paints after the symbol that would erase it").toBe(true);
});
