// ═══════════════════════════════════════════════════════════════════════════════
// /how-it-works — the buying process
//
// These guard the things the rebuild could plausibly break, not the copy:
//
//  • the hero's promise and its two actions;
//  • the three phase anchors, which the rest of the site links to;
//  • ownership expressed structurally (a numeral and an announced step number on
//    your moments, neither on ours) rather than by colour alone;
//  • THE LINE being a change of ground rather than a second copy of the closing
//    banner, which is the mistake the rebuild set out to correct;
//  • the phase-01 clock reading as a duration, with the review step keeping its
//    own two business days.
//
// The drawn ProcessRail and the jump tiles it sat with are gone, along with the
// summary section that held them, so their specs went too.
//
// Copy itself is deliberately not asserted beyond the load-bearing headline: it
// is CMS-adjacent marketing text and pinning every sentence makes the suite an
// obstacle to editing rather than a safety net.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page } from "@playwright/test";

const PHASES = ["phase-quote", "phase-order", "phase-delivery"];

test("the hero states the promise and both actions", async ({ page }) => {
  await page.goto("/how-it-works");

  await expect(page.getByRole("heading", { name: /Nothing gets made until you sign it off/i })).toBeVisible();

  // One filled action and one text link — never two competing fills on a hero.
  const hero = page.locator("section").first();
  await expect(hero.getByRole("button", { name: /^Get a quote/ })).toBeVisible();
  await expect(hero.getByRole("button", { name: /Ask a question/ })).toBeVisible();
});

test("each phase is a real anchor on the page", async ({ page }) => {
  await page.goto("/how-it-works");

  // The summary section that linked to these is gone, but the anchors are still
  // the page structure and are still linked to from elsewhere on the site.
  for (const id of PHASES) await expect(page.locator(`#${id}`)).toHaveCount(1);
  // Three phases, three headings — no fourth invented anywhere.
  await expect(page.locator("section[id^=phase-]")).toHaveCount(3);
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

test("the phase-01 clock reads as a duration, and the review step keeps its own", async ({ page }) => {
  await page.goto("/how-it-works");

  // "takes" — without the verb the two halves read as one list of facts and the
  // duration looked like a second payment note.
  await expect(page.locator("#phase-quote")).toContainText("nothing charged · takes about 1 minute");

  // The two business days belong to the review STEP inside the phase, and are
  // still stated there — the phase clock is what it costs YOU in waiting.
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
