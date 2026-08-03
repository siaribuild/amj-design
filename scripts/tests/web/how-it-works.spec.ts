// ═══════════════════════════════════════════════════════════════════════════════
// /how-it-works — the buying process
//
// These guard the things the rebuild could plausibly break, not the copy:
//
//  • the four commercial facts and the two hero actions;
//  • the drawn ProcessRail — that it carries the whole process in TEXT as well
//    as geometry, and that exactly one orientation is ever displayed;
//  • ownership expressed structurally (a numeral and an announced step number on
//    your moments, neither on ours) rather than by colour alone;
//  • THE LINE being a change of ground rather than a second copy of the closing
//    banner, which is the mistake the rebuild set out to correct;
//  • the phase-01 clock agreeing between the page and the rail, which two source
//    files each declare and a comment in both says to keep in step.
//
// Copy itself is deliberately not asserted beyond the load-bearing headline: it
// is CMS-adjacent marketing text and pinning every sentence makes the suite an
// obstacle to editing rather than a safety net.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page } from "@playwright/test";

const STEPS = ["Upload", "Submit", "Accept", "Sign off", "Pay", "Confirm"];
const PHASES = ["phase-quote", "phase-order", "phase-delivery"];

/** Which rail orientations are actually displayed, in viewBox terms. */
const shownRails = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll(".process-rail svg")]
      .filter((s) => s.getBoundingClientRect().width > 0)
      .map((s) => s.getAttribute("viewBox")),
  );

test("the hero states the promise, the four facts and both actions", async ({ page }) => {
  await page.goto("/how-it-works");

  await expect(page.getByRole("heading", { name: /Nothing gets made until you sign it off/i })).toBeVisible();

  // The facts are a definition list — value as the term, what it counts as the
  // definition. Scoped, because "50%" also appears in a phase header and on the
  // line marker further down.
  const stats = page.locator("dl").first();
  for (const value of ["$0", "~1 minute", "50%", "Supply only"]) {
    await expect(stats.getByText(value, { exact: true })).toBeVisible();
  }

  // One filled action and one text link — never two competing fills on a hero.
  const hero = page.locator("section").first();
  await expect(hero.getByRole("button", { name: /^Get a quote/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /Ask a question/ })).toBeVisible();
});

test("the rail carries the whole process in text, and shows one orientation at a time", async ({ page }) => {
  await page.goto("/how-it-works");

  const rail = page.locator(".process-rail");
  await expect(rail).toBeVisible();

  // The diagram is never the only telling: its accessible name is a sentence.
  const name = await rail.locator("svg").first().getAttribute("aria-labelledby");
  expect(name).toBeTruthy();
  const described = await rail.locator("title").first().textContent();
  expect(described).toContain("Three phases");
  for (const s of STEPS) expect(described).toContain(s);
  expect(described).toContain("Nothing is charged before you accept a reviewed quote");

  // Six verbs and three percentages, drawn as real text. Compared as SETS: both
  // orientations are in the DOM, so every label legitimately appears twice, and
  // asserting on positions would be pinning draw order rather than content.
  expect([...new Set(await rail.locator(".rail-step").allTextContents())]).toEqual(STEPS);
  expect([...new Set(await rail.locator(".rail-pct").allTextContents())]).toEqual(["0%", "50%", "100%"]);

  // The threshold is labelled on both sides.
  const dim = await rail.locator(".rail-dim").allTextContents();
  expect(dim).toContain("NOTHING CHARGED");
  expect(dim).toContain("INVOICE EXISTS");

  // Exactly one orientation is displayed at each width — both are in the DOM.
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await shownRails(page)).toEqual(["0 0 800 186"]);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await shownRails(page)).toEqual(["0 0 320 546"]);
});

test("each phase is an anchor the jump tiles actually reach", async ({ page }) => {
  await page.goto("/how-it-works");

  for (const id of PHASES) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
    await expect(page.locator(`a[href="#${id}"]`)).toHaveCount(1);
  }
  // Three phases, three jump tiles, three headings — no fourth invented anywhere.
  await expect(page.locator('a[href^="#phase-"]')).toHaveCount(3);
});

test("ownership is structural: your steps are numbered and announced, ours are not", async ({ page }) => {
  await page.goto("/how-it-works");

  // Six customer moments, each announcing its own step number so the numeral is
  // never carried by sight alone. The count is the page's own self-check: it
  // states no total anywhere precisely so this cannot drift.
  const announced = page.locator("ol li span.sr-only");
  await expect(announced).toHaveCount(6);
  for (let i = 1; i <= 6; i++) {
    await expect(page.getByText(`step 0${i}`, { exact: true })).toHaveCount(1);
  }

  // Our work is indented onto a recessive ground and carries NO numeral — four
  // cues, none of them colour. Eleven rows in total across the three phases.
  await expect(page.locator("ol li")).toHaveCount(11);
  const ours = page.locator("ol li.bg-recessive");
  await expect(ours).toHaveCount(5);
  await expect(ours.locator("span.sr-only")).toHaveCount(0);
});

test("the line is a change of ground, not a second closing banner", async ({ page }) => {
  await page.goto("/how-it-works");

  const line = page.locator("#the-line");
  await expect(line.getByRole("heading", { name: /Everything above this line is free/i })).toBeVisible();

  // The whole point of the rework: the page's central promise must not wear the
  // closing CTA's clothes. One is the dark ground, the other is the sage panel.
  const grounds = await page.evaluate(() => {
    const el = document.getElementById("the-line")!;
    const cta = document.querySelector(".bg-sage")!;
    return { line: getComputedStyle(el).backgroundColor, cta: getComputedStyle(cta).backgroundColor };
  });
  expect(grounds.line).toBe("rgb(12, 12, 10)");
  expect(grounds.cta).not.toBe(grounds.line);

  // The money marker spans the band: 0% before, 50% after.
  await expect(line.getByText("0%", { exact: true })).toBeVisible();
  await expect(line.getByText("50%", { exact: true })).toBeVisible();
});

test("phase 01 offers the quote in the brand action colour", async ({ page }) => {
  await page.goto("/how-it-works");

  const cta = page.locator("#phase-quote").getByRole("button", { name: /Get a quote/ });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveCSS("background-color", "rgb(90, 122, 106)");
});

test("the phase-01 clock is stated once and the rail agrees with it", async ({ page }) => {
  await page.goto("/how-it-works");

  // HowItWorksPage and ProcessRail each declare this number and each carries a
  // comment saying to keep the two in step. This is that comment, enforced.
  await expect(page.locator("#phase-quote")).toContainText("about 1 minute");
  const railText = await page.locator(".process-rail .rail-sub").allTextContents();
  expect(railText).toContain("about 1 minute");

  // The two business days belong to the review STEP inside the phase, and are
  // still stated there — the phase clock is what it costs you in waiting.
  await expect(page.locator("#phase-quote")).toContainText("about 2 business days");
});

test("the removed homeowner panel stays removed", async ({ page }) => {
  await page.goto("/how-it-works");
  await expect(page.getByText(/Renovating your own home/i)).toHaveCount(0);
  // It was a route state; the query must not resurrect it either.
  await page.goto("/how-it-works?path=homeowner");
  await expect(page.getByText(/Renovating your own home/i)).toHaveCount(0);
  await expect(page.locator("#homeowner")).toHaveCount(0);
});

test("neither a phone nor a desktop scrolls sideways", async ({ page }) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/how-it-works");
    const overflow = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      inner: window.innerWidth,
    }));
    expect(overflow.scrollW, `no sideways scroll at ${width}px`).toBeLessThanOrEqual(overflow.inner);
  }
});
