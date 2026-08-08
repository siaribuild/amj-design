// ═══════════════════════════════════════════════════════════════════════════════
// /quote — the customer project builder
//
// Written as the A/B arm at /quote-project; it won that comparison and is now
// simply /quote, so every case here drives the standard route. Plan §12. These
// prove the things the presentation could plausibly break: the read-only
// expansion boundary, UI identity surviving a rehydrate, draft safety, and that
// the state mapping never moves a submit gate.
//
// Seeding follows the established pattern in customer.spec.ts: route-mock the
// current-project GET (letting writes through) for exact hydrated shapes, and
// use the real API for anything that must actually persist.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page } from "@playwright/test";

const SLIDING = "amj80-series-sliding-window";

/** A unit IS an item — a real frame that is made and delivered, sharing an
 *  opening with its siblings instead of having one to itself (owner). So a mock
 *  unit with no options is a unit that would genuinely block on its missing
 *  colour, which is not what these fixtures are testing. Production agrees:
 *  splitLine inherits the opening's options, and all 23 live units carry them. */
const SEGMENT_OPTIONS = { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" };


type MockItem = Record<string, unknown>;

/** Serve one exact hydrated project, leaving writes to the real backend. */
async function mockProject(page: Page, items: MockItem[], files: unknown[] = []) {
  await page.route("**/api/projects/current", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        project: {
          id: "project-qp", ref: "OF-Q-QP", title: "Quote project regression",
          status: "draft", createdAt: new Date().toISOString(),
        },
        files,
        items,
      }),
    });
  });
}

/** A priced, composite parent carrying a TECHNICAL-only review flag. Priced and
 *  submittable — the case that must stay visually neutral. */
const compositeItem: MockItem = {
  id: "line-w2", code: "W2", productSlug: SLIDING, location: "Kitchen",
  width: "3500", height: "700", options: {}, qty: 1, status: "Ready", lineTotal: 1000,
  origin: "ai", aiPriced: true, review: { fit: "Composite layout requires technical confirmation." },
  compositeAxis: "vertical",
  segments: [
    { id: "segment-w2-a", productSlug: SLIDING, width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: SEGMENT_OPTIONS, status: "Ready" },
    { id: "segment-w2-b", productSlug: SLIDING, width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: SEGMENT_OPTIONS, status: "Ready" },
  ],
};

/** A plain priced line — no badge, no action. */
const plainItem: MockItem = {
  id: "line-w1", code: "W1", productSlug: SLIDING, location: "Living",
  width: "1200", height: "900", qty: 2, status: "Ready", lineTotal: 800,
  options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
};

/** A line the CUSTOMER must fix: an error-severity reason and no price. */
const blockedItem: MockItem = {
  id: "line-w3", code: "W3", productSlug: SLIDING, location: "Bed 1",
  width: "", height: "", qty: 1, status: "Needs review", lineTotal: null,
  options: {}, origin: "schedule", review: { dims: "We couldn't read the size for this opening." },
};

// ─── 1. Route isolation ────────────────────────────────────────────────────────

test("/quote IS this builder, and the retired path still lands on it", async ({ page }) => {
  await mockProject(page, [plainItem]);

  await page.goto("/quote");
  await expect(page.locator(".quote-page")).toHaveClass(/ground-bone/);
  await expect(page.getByRole("heading", { name: "Quote project regression" })).toBeVisible();
  await expect(page.getByText("AMJ80 Series Sliding Window").first()).toBeVisible();
  // The card builder that used to answer here is gone, not hidden.
  await expect(page.locator(".quote-item-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Build your quote" })).toHaveCount(0);

  // /quote-project was linked internally for months and sits in bookmarks and
  // briefs. It resolves to the same page rather than falling through to the
  // home page, which is what an unknown path does here.
  await page.goto("/quote-project");
  await expect(page.locator(".quote-page")).toHaveClass(/ground-bone/);
  await expect(page.getByRole("heading", { name: "Quote project regression" })).toBeVisible();
});

// ─── 2. Compact row ────────────────────────────────────────────────────────────

test("the compact row renders identity, size, price and its direct actions", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");

  await expect(page.getByText("W1", { exact: true })).toBeVisible();
  await expect(page.getByText("AMJ80 Series Sliding Window").first()).toBeVisible();
  // Size, and ONLY size. Quantity is not listed on this route at all (owner):
  // the model is one opening per reference, so a "×1" on every line is a column
  // of noise. It had a column of its own from 1024 up and rode in the size cell
  // below that — two homes for a figure that now has none.
  // HEIGHT FIRST (trade convention), and one trailing unit: "900 × 1,200 mm",
  // not "900 mm × 1,200 mm" (owner).
  await expect(page.locator(".quote-row").getByText("900 × 1,200 mm", { exact: true })).toBeVisible();
  await expect(page.locator(".quote-row").getByText(/×\s*2/)).toHaveCount(0);
  // Scoped to the row: the line now shows the number ALONE, so an unscoped
  // "$800" also matches the summary bar's identical total.
  await expect(page.locator(".quote-row").getByText("$800", { exact: true })).toBeVisible();
  // Guests always see GST-inclusive pricing — stated once, on the summary,
  // rather than repeated on every line.
  // .first(): the bar states it visibly AND in its polite live region.
  const summary = page.getByRole("region", { name: "Project summary and actions" });
  await expect(summary.getByText("inc GST").first()).toBeVisible();
  await expect(page.locator(".quote-row").getByText(/GST/)).toHaveCount(0);

  // Every action names its opening — 20 identical "Edit" buttons are unusable
  // with a screen reader even though they each technically have a name.
  await expect(page.getByRole("button", { name: "Edit W1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions for W1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show details for W1", exact: true })).toBeVisible();
});

// ─── 3. Expansion is read-only, and independent per row ────────────────────────

test("expansion inspects only; rows open independently, composite children priced once", async ({ page }) => {
  await mockProject(page, [plainItem, compositeItem]);
  await page.goto("/quote");

  const w1 = page.getByRole("button", { name: /details for W1$/ });
  const w2 = page.getByRole("button", { name: /details for W2$/ });
  await expect(w1).toHaveAttribute("aria-expanded", "false");

  await w1.click();
  await expect(w1).toHaveAttribute("aria-expanded", "true");
  // Options read as labelled lines, not a run-on list: the value alone cannot
  // be decoded without already knowing the option order. The label now sits
  // ABOVE its value as a block, so it no longer carries a trailing colon.
  await expect(page.getByText("Colour", { exact: true })).toBeVisible();
  await expect(page.getByText("Dover White", { exact: true })).toBeVisible();

  // Expansion is no longer one-at-a-time: a row's reason and its Fix-details
  // action now live in the panel, so several blocked lines have to be readable
  // without reopening them one by one. Opening a second leaves the first open.
  await w2.click();
  await expect(w2).toHaveAttribute("aria-expanded", "true");
  await expect(w1).toHaveAttribute("aria-expanded", "true");
  // Closing is still explicit and independent.
  await w1.click();
  await expect(w1).toHaveAttribute("aria-expanded", "false");
  await expect(w2).toHaveAttribute("aria-expanded", "true");

  // The units are ROWS now, not a list inside the parent's panel, and they are
  // ALWAYS shown — a composite has no collapsed state, because the thing most
  // worth checking is that the parts add up to the opening and that cannot be
  // checked from behind a chevron. They are named from the parent.
  await expect(page.locator("[data-unit]")).toHaveCount(2);
  await expect(page.getByText("W2A", { exact: true })).toBeVisible();
  await expect(page.getByText("W2B", { exact: true })).toBeVisible();
  await expect(page.getByText("Included units")).toHaveCount(0);

  // A unit carries NO price of its own: the parent owns the total, and separate
  // numbers would read as separate charges.
  await expect(page.getByText("$500")).toHaveCount(0);
  // Nor a More menu — Duplicate and Delete were its only entries and both are
  // gone with the unit-count decision, so an empty trigger would be left over.
  await expect(page.getByRole("button", { name: /Actions for W2A/ })).toHaveCount(0);
  // A composite parent is not a product: it shows no options of its own.
  await expect(page.getByText("No options selected")).toHaveCount(0);

  // The panel is for reading. No inputs, no selects — editing is the drawer's job.
  const panel = page.locator("[id^='qp-panel-']");
  await expect(panel.locator("input, select, textarea")).toHaveCount(0);

  // Expanding must not open the drawer or write anything.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ─── 4. Identity survives a save (plan §5) ─────────────────────────────────────

test("saving from the drawer keeps the same opening expanded and restores focus", async ({ page }) => {
  // Real backend: the save must actually round-trip through the draft.
  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      items: [{
        code: "W01", location: "Living", productSlug: SLIDING,
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
    },
  });
  expect(saved.ok()).toBeTruthy();

  await page.goto("/quote");
  await page.getByRole("button", { name: /details for W01$/ }).click();
  await expect(page.getByRole("button", { name: /details for W01$/ })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Edit W01", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  // The NOTE is the mutation now: quantity is gone from the editor (owner) —
  // one opening per reference, so the field is stored and priced but has no
  // control. Note lives in the Dimensions group, which opens by default.
  const note = page.getByPlaceholder("e.g. Bedroom 1, north elevation");
  await note.fill("North elevation");
  await page.getByRole("button", { name: /Save changes/i }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Still the same opening, still open, and focus is back on its Edit control —
  // the row is keyed on the server id, not the regenerated local one.
  await expect(page.getByRole("button", { name: /details for W01$/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Edit W01", exact: true })).toBeFocused();
  // The edit survived the round-trip: on the row beside the product name, and
  // back in the editor it was typed into. Quantity is not listed and no longer
  // editable — the model is one opening per reference.
  await expect(page.locator(".quote-row").first().getByText("North elevation")).toBeVisible();
  await page.getByRole("button", { name: "Edit W01", exact: true }).click();
  await expect(page.getByPlaceholder("e.g. Bedroom 1, north elevation")).toHaveValue("North elevation");
  await expect(page.getByRole("dialog").getByRole("button", { name: /Quantity/i })).toHaveCount(0);
});

// ─── 5. Draft safety ───────────────────────────────────────────────────────────

test("Add opening creates nothing until an explicit save", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");
  await expect(page.locator(".quote-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Add opening" }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  // A new opening starts genuinely blank — nothing copied from the existing line.
  await expect(page.getByRole("dialog").getByText("AMJ80 Series Sliding Window")).toHaveCount(0);

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".quote-row")).toHaveCount(1);   // still nothing created
});

test("the customer may change what a unit IS, but not how many there are", async ({ page }) => {
  await mockProject(page, [compositeItem]);
  await page.goto("/quote");

  await page.getByRole("button", { name: "Edit W2", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(page.getByText("Built as 2 units")).toBeVisible();
  // The parent is the schedule line, not a product: no Options group is offered
  // at this level, because glazing and hardware belong to the units.
  await expect(drawer.getByText("Options", { exact: true })).toHaveCount(0);

  // Owner, 2026-08-04. Whether an opening is split is a manufacturing
  // constraint and not the customer's call — there is no route to create a
  // composite and none to merge one back. Add and Remove let them reach the
  // same outcome sideways, turning a two-unit opening into four, so both are
  // gone from the drawer and from the server.
  await expect(drawer.getByRole("button", { name: "Add unit" })).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /^Remove W2/ })).toHaveCount(0);

  // What each unit IS remains editable — the capability that was never in doubt.
  await expect(drawer.getByRole("button", { name: "Edit W2A" })).toBeVisible();
  await drawer.getByRole("button", { name: "Edit W2A" }).click();
  await expect(page.getByRole("button", { name: "Back to W2" })).toBeVisible();

  // A UNIT CARRIES A NOTE (owner): "a child record is carrying exactly the same
  // information as a childless parent, except that it has a linked parent." Same
  // label as an opening's so it reads as the same field; a different placeholder,
  // because a unit sits inside one opening and has already been told the room.
  // It persists in the same column — see the round-trip in api.test.mjs.
  // "(optional)" is gone from the label (owner): optionality is expressed by
  // not being validated as required, not by a word.
  await expect(drawer.getByText("Note", { exact: true })).toBeVisible();
  await expect(drawer.getByPlaceholder("e.g. left leaf, obscure glass here")).toBeVisible();

  // BOTH dimensions are editable. The across-axis one used to be locked to the
  // opening's, which is a trap rather than a rail: correct an opening's parsed
  // height and every unit is left at the old figure with its only repair field
  // greyed out.
  const numbers = drawer.locator('input[type="number"]');
  await expect(numbers.nth(0)).toBeEnabled();
  await expect(numbers.nth(1)).toBeEnabled();
});

// ─── 6. Duplicate is deliberate, and undoable ──────────────────────────────────

test("duplicate is an intentional copy and Undo restores the previous list", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");
  await expect(page.locator(".quote-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Actions for W1" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(page.locator(".quote-row")).toHaveCount(2);

  await expect(page.getByText(/Duplicated from W1/)).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".quote-row")).toHaveCount(1);
});

// ─── 7. State mapping preserves the submit gate (plan §6) ──────────────────────

test("customer blockers are actionable; technical-only review stays neutral", async ({ page }) => {
  await mockProject(page, [compositeItem, blockedItem]);
  await page.goto("/quote");

  // Asserted through innerText rather than element matching: the status chip is
  // rendered twice — beside the reference below 1024px, as its own column above
  // — and only one is ever displayed. innerText excludes the display:none copy,
  // so this counts what a person actually sees rather than what is in the DOM.
  const shown = async () => (await page.locator(".quote-table").innerText());
  const occurrences = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1;

  // TECHNICAL-only (`fit`): priced, submittable, and NOT dressed as a problem.
  // The composite carries NO chip at all now (owner): its product cell says
  // "Composite Window", which states the same fact where the product name would
  // otherwise have claimed the line is a single frame.
  expect(occurrences(await shown(), "Composite Window")).toBe(1);
  await expect(page.getByText(/Composite · \d+ units/)).toHaveCount(0);
  await expect(page.getByText("Needs review", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);

  // ERROR-severity (`dims`): the one case the customer can act on. The row
  // carries the LABEL only; the reason and the action live in the panel.
  // "Incomplete", not "Needs your input" — 127px was what wrapped it under the
  // reference between 768 and 1023 (owner).
  expect(occurrences(await shown(), "Incomplete")).toBe(1);
  // Every record starts COLLAPSED (owner). A blocked row used to open itself,
  // which made the lines needing attention the tallest things on a list whose
  // job is to be scanned. The chip and the stripe say so at rest; the reason is
  // one click away. Anchored to the disclosure specifically: "Fix details for
  // W3" also ends in "details for W3", and a loose regex resolves to both.
  const w3 = page.getByRole("button", { name: /^(Show|Hide) details for W3$/ });
  await expect(w3).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("We couldn't read the size for this opening.")).toHaveCount(0);
  await w3.click();
  await expect(page.getByText("We couldn't read the size for this opening.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fix details for W3" })).toBeVisible();

  // The bar counts only the blocker, and offers the fix rather than submission.
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toHaveAttribute("data-state", "attention");
  await expect(bar.getByRole("button", { name: /Fix 1 detail/ })).toBeVisible();

  // Fix details opens the editor AT the offending field, not merely an expand.
  await page.getByRole("button", { name: "Fix details for W3" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("with no blockers the bar offers submission and never invents a stage", async ({ page }) => {
  await mockProject(page, [compositeItem]);
  await page.goto("/quote");
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  // "ready", not "review". A technical caveat no longer tones the whole bar
  // down (owner): it is priced, submittable and ours to resolve, so nothing the
  // customer can act on distinguishes this from a clean quote. The bar states
  // the openings and offers submission — and states no count they cannot use.
  await expect(bar).toHaveAttribute("data-state", "ready");
  await expect(bar.getByText(/we'll confirm/)).toHaveCount(0);
  await expect(bar.getByText(/pending final price/)).toHaveCount(0);
  await expect(bar.getByRole("button", { name: /Submit for technical review/ })).toBeVisible();

  await bar.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
});

test("a submitted job leaves the builder — it does not linger until a refresh", async ({ page }) => {
  // The draft stops being the customer's the moment it is submitted: the server
  // moves it out of 'draft' and the dashboard already invites a new quote. The
  // builder held its openings in memory regardless, so coming BACK to it showed
  // a job that was under review as though it were still a working cart. Only a
  // reload cleared it, because a fresh mount starts empty and hydrate then
  // declines to populate it.
  //
  // Hydrate cannot fix this on its own: an absent draft clears the builder only
  // when the IDENTITY changed, which protects unsaved work on a first visit and
  // is right to keep. So the reset belongs at submission, and this test walks
  // the round trip rather than asserting on the confirmation screen — which
  // shows no openings either way and would pass with the bug present.
  await mockProject(page, [compositeItem]);
  await page.route("**/api/projects/*/submit", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "project-qp", status: "submitted" }) }));

  await page.goto("/quote");
  await page.getByRole("region", { name: "Project summary and actions" })
    .getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
  await page.getByPlaceholder("Your name").fill("Regression Tester");
  await page.getByPlaceholder("your@email.com").fill("regression@example.com");

  // From here the server has NO draft to hand back — same customer, so the
  // identity has not changed either.
  await page.route("**/api/projects/current", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ project: null, files: [], items: [] }) });
  });
  await page.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Quote submitted" })).toBeVisible();

  // Back to the builder the way a customer would — in-app, never a reload.
  await page.getByRole("button", { name: "Back to home" }).click();
  await page.getByRole("button", { name: "Get a quote" }).first().click();
  await expect(page.getByRole("region", { name: "Project summary and actions" })).toBeVisible();
  await expect(page.getByText(compositeItem.code as string)).toHaveCount(0,
    { timeout: 10_000 });
});

// ─── 8. Responsive ─────────────────────────────────────────────────────────────

test("desktop gets a side drawer, mobile a full-screen editor, neither scrolls sideways", async ({ page }) => {
  await mockProject(page, [plainItem, compositeItem]);

  for (const [w, h] of [[1440, 900], [1024, 800], [768, 1024], [375, 812]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/quote");
    await expect(page.locator(".quote-row").first()).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
  }

  // Below 768 the editor is full-screen — a side panel there is unusable for a
  // real quote form. From 768 up it is a slide-out panel like the main menu, so
  // the project context the drawer exists to preserve stays on screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/quote");
  await page.getByRole("button", { name: "Edit W1", exact: true }).click();
  const mobileBox = await page.getByRole("dialog").boundingBox();
  expect(mobileBox!.width).toBeGreaterThan(360);

  for (const [w, h] of [[768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/quote");
    await page.getByRole("button", { name: "Edit W1", exact: true }).click();
    const box = await page.getByRole("dialog").boundingBox();
    // Narrower than the viewport, so the list it dims stays visible beside it.
    expect(box!.width, `drawer is a panel at ${w}px`).toBeLessThan(w - 80);
    expect(box!.width).toBeLessThan(700);
  }
});

// ─── 9. Accessibility ──────────────────────────────────────────────────────────

test("the drawer behaves as a dialog: Escape steps back, then closes, and focus returns", async ({ page }) => {
  await mockProject(page, [compositeItem]);
  await page.goto("/quote");

  await page.getByRole("button", { name: "Edit W2", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Into a child: the drawer swaps context rather than stacking a second dialog.
  await page.getByRole("button", { name: "Edit W2A" }).click();
  await expect(page.getByRole("button", { name: "Back to W2" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  // Escape reverses child → parent FIRST; only a second Escape closes.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Back to W2" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByText("Built as 2 units")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Focus goes back where it came from.
  await expect(page.getByRole("button", { name: "Edit W2", exact: true })).toBeFocused();
});

test("row disclosure exposes accurate state and unique labels", async ({ page }) => {
  await mockProject(page, [plainItem, compositeItem]);
  await page.goto("/quote");

  // Unique per-row names, so a screen-reader list is navigable.
  await expect(page.getByRole("button", { name: "Edit W1", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Edit W2", exact: true })).toHaveCount(1);

  const toggle = page.getByRole("button", { name: "Show details for W2", exact: true });
  const panelId = await toggle.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  await toggle.click();
  // aria-controls must point at a node that actually exists once expanded.
  await expect(page.locator(`#${panelId}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide details for W2", exact: true })).toBeVisible();
});

// ─── 10. Pictogram sanitiser ───────────────────────────────────────────────────
//
// family.icon is editor-authored markup injected with dangerouslySetInnerHTML,
// and the catalogue is fetched by EVERY browser — so a compromised editor
// account must not be able to turn a pictogram into script on a page holding a
// signed-in customer's session.
//
// The payload below is a real breakout, not a strawman: a processing instruction
// survives XML serialisation verbatim, and re-parsing that string as HTML turns
// `<?x >` into a bogus comment ending at the first `>`, after which `<img>` is
// parsed as HTML inside SVG foreign content and its onerror fires. This test
// FAILS against a sanitiser that walks `children` instead of `childNodes`.

const MALICIOUS_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
  + '<?x ><img src=q onerror="window.__xssFired = true">?>'
  + '<path d="M2 2h20v20H2z" stroke="currentColor" fill="none"/></svg>';

// The row draws its own elevation now rather than rendering an authored icon, so
// the injection surface is gone rather than newly unguarded. This still earns its
// place: the catalogue behind it is STILL fetched from Sanity and still consumed
// on this page, and a hostile family record must not execute anything here — the
// day someone reintroduces an authored glyph, this fails before it ships.
test("a hostile catalogue record cannot execute anything in the quote list", async ({ page }) => {
  // The client fetches the catalogue straight from Sanity's CDN, cross-origin —
  // so the stub has to answer the preflight and carry CORS headers, or the
  // browser discards it and the app quietly falls back to the built-in
  // catalogue (which would make this test vacuous).
  await page.route("**/*.sanity.io/**", async (route) => {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,OPTIONS",
    };
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify({
        result: {
          families: [{
            id: "fam-sliding", slug: "sliding-window", categorySlug: "windows",
            name: "Sliding Window", operation: "sliding", icon: MALICIOUS_ICON,
          }],
        },
      }),
    });
  });
  await mockProject(page, [plainItem]);
  await page.goto("/quote");
  await expect(page.locator(".quote-row")).toHaveCount(1);

  // Give any deferred handler a chance to fire before asserting it did not.
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).__xssFired)).toBeFalsy();
  await expect(page.locator('img[src="q"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerHTML.includes("onerror"))).toBe(false);

  // Positive control, asserted LAST, and it has to prove TWO things now:
  //
  //  1. the row rendered its drawing at all — otherwise an empty row would pass
  //     every assertion above vacuously;
  //  2. the drawing is the GENERATED elevation and not the authored payload —
  //     the viewBox is computed from this line's own millimetres, so a hostile
  //     record's own "0 0 24 24" reaching the DOM would fail here.
  const box = page.locator(".quote-row svg[data-elevation]");
  await expect(box).toHaveCount(1);
  await expect(box).not.toHaveAttribute("viewBox", "0 0 24 24");
  await expect(page.locator('.quote-row path[d="M2 2h20v20H2z"]')).toHaveCount(0);
});

// ─── 10. Whole-project reset ───────────────────────────────────────────────────

test("clear all wipes lines and documents durably, and is never a single tap", async ({ page }) => {
  // Against the REAL backend, not a route mock: the contract being proved is
  // that the server forgot them, which a mocked GET would happily fake.
  const saved = await page.request.put("/api/projects/current/lines", {
    data: {
      items: [{
        code: "W01", location: "Living", productSlug: "amj80-series-sliding-window",
        width: "1200", height: "900", qty: 1,
        options: { colour: "Dover White", hardware: "AMJ Standard D Shape Handle", flyscreen: "None", installation: "Sub Sill & Head" },
      }],
    },
  });
  expect(saved.ok()).toBeTruthy();
  const uploaded = await page.request.post("/api/files/upload", {
    multipart: {
      file: { name: "qp-clear-all.txt", mimeType: "text/plain", buffer: Buffer.from("energy report") },
      kind: "upload",
    },
  });
  expect(uploaded.ok()).toBeTruthy();

  await page.goto("/quote");
  await expect(page.getByText("qp-clear-all.txt")).toBeVisible();
  await expect(page.locator(".quote-row")).toHaveCount(1);

  // Destructive actions are confirmed. Dismissing must change nothing.
  await page.getByRole("button", { name: "Clear all items and uploaded documents" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear everything" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".quote-row")).toHaveCount(1);

  await page.getByRole("button", { name: "Clear all items and uploaded documents" }).click();
  await dialog.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("qp-clear-all.txt")).toHaveCount(0);
  await expect(page.locator(".quote-row")).toHaveCount(0);

  // Durable, not just cleared from the view.
  await page.reload();
  await expect(page.getByText("qp-clear-all.txt")).toHaveCount(0);
  const body = await (await page.request.get("/api/projects/current")).json();
  expect(body.items).toEqual([]);
  expect(body.files).toEqual([]);
});

// ─── 11. Renaming the project ─────────────────────────────────────────────────
// Two owner corrections, both about the title behaving unlike the rest of the
// page: it was an input-shaped control at rest sitting beside 44px buttons, and
// it saved on Enter-or-blur when every other edit here needs a button.
test("the project title is a heading at rest and saves only when told to", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");

  // At rest: text, not a field. Exactly one h1, and it holds the NAME — while
  // the editor is open the heading must not become "Save Cancel".
  await expect(page.locator("input[aria-label='Project name']")).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("Quote project regression");

  const saves: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && r.url().includes("/api/projects/current/lines")) saves.push(r.url());
  });

  await page.getByRole("button", { name: /^Rename project/ }).click();
  const field = page.locator("input[aria-label='Project name']");
  await expect(field).toBeFocused();
  await expect(page.locator("h1")).toHaveText("Quote project regression");
  // The editor matches the action buttons it sits beside — the mismatch was the
  // original complaint, so the sizes are asserted rather than eyeballed.
  const [fieldH, addH] = await Promise.all([
    field.evaluate((e) => Math.round(e.getBoundingClientRect().height)),
    page.getByRole("button", { name: /Add opening/ }).evaluate((e) => Math.round(e.getBoundingClientRect().height)),
  ]);
  expect(fieldH).toBe(addH);

  // Clicking away commits NOTHING and closes nothing. Blur-to-save was the
  // inconsistency: it made the title the one field that wrote to the server
  // without being told to.
  await field.fill("Renamed by blur");
  await page.locator(".quote-row").first().click();
  await expect(field).toHaveCount(1);
  expect(saves, "blur must not write").toHaveLength(0);

  // Cancel restores the previous name and writes nothing.
  await page.getByRole("button", { name: "Cancel renaming" }).click();
  await expect(page.locator("h1")).toHaveText("Quote project regression");
  expect(saves, "cancel must not write").toHaveLength(0);

  // Save is the only thing that commits.
  await page.getByRole("button", { name: /^Rename project/ }).click();
  await page.locator("input[aria-label='Project name']").fill("Coburg new build");
  await page.getByRole("button", { name: "Save project name" }).click();
  await expect(page.locator("h1")).toHaveText("Coburg new build");
  await expect(page.getByRole("button", { name: /^Rename project/ })).toBeFocused();
});

// ─── 12. One launcher per panel, in one place ─────────────────────────────────
// A blocked row used to offer THREE routes to the same drawer: the row's pencil,
// "Fix details" in the panel, and "Edit opening" at its foot. The last two are
// openDrawer({mode:"edit"}) either way, differing only in which accordion group
// opens — and for the common blockers (duplicate id, no product, no size)
// sectionFor collapses to "dims", which is what passing nothing already does.
//
// The launcher stays in ONE position and only its LABEL changes (owner). Moving
// it beside the reason when blocked would relocate the control according to what
// is wrong with the line, so the customer would have to find it twice.
test("the expansion offers one launcher, always at the foot, labelled for the state", async ({ page }) => {
  await mockProject(page, [blockedItem, plainItem]);
  await page.goto("/quote");

  // Opened by hand: nothing opens itself any more (owner). The blocked row
  // states its reason — with no button of its own beside it.
  await page.getByRole("button", { name: "Show details for W3", exact: true }).click();
  const blocked = page.locator(".quote-rowexp").first();
  await expect(blocked.getByText("We couldn't read the size for this opening.")).toBeVisible();
  await expect(blocked.getByRole("button", { name: /Fix details/ })).toHaveCount(1);
  await expect(blocked.getByRole("button", { name: /Edit opening/ })).toHaveCount(0);

  // Both labels appear in the SAME place: the panel's last control, below the
  // drawing and specification rather than up beside the reason.
  const y = async (l: ReturnType<typeof page.locator>) => l.evaluate((e) => e.getBoundingClientRect().top);
  const reasonY = await y(blocked.getByText("We couldn't read the size for this opening."));
  const fixY = await y(blocked.getByRole("button", { name: /Fix details/ }));
  const specY = await y(blocked.locator("dl").first());
  expect(fixY, "the launcher sits below the specification, not beside the reason").toBeGreaterThan(specY);
  expect(fixY - reasonY, "and well clear of the reason line").toBeGreaterThan(100);

  await page.getByRole("button", { name: "Show details for W1", exact: true }).click();
  const ready = page.locator(".quote-rowexp").last();
  await expect(ready.getByRole("button", { name: /Edit opening/ })).toHaveCount(1);
  await expect(ready.getByRole("button", { name: /Fix details/ })).toHaveCount(0);
});

// ─── 13. A drawing may be indicative; a dimension may not ─────────────────────
test("an opening with no size is drawn as a shape and carries no measurements", async ({ page }) => {
  await mockProject(page, [blockedItem, plainItem]);
  await page.goto("/quote");

  // blockedItem has width: "" and height: "" — the row says "— × —". The
  // generator falls back to 1200×1200 for the SHAPE, which is honest, but once
  // leaders existed it printed "1200" twice as a measurement on the one line
  // whose problem is that nobody could read its size.
  await page.getByRole("button", { name: "Show details for W3", exact: true }).click();
  const unsized = page.locator(".quote-rowexp").first().locator("svg[data-elevation]");
  await expect(unsized).toHaveAttribute("data-unsized", "");
  await expect(unsized.locator("text")).toHaveCount(0);
  await expect(page.locator(".quote-rowexp").first().getByText(/size not set/i)).toBeVisible();

  // A line that HAS a size is unchanged: leaders, and the caption that asserts
  // the drawing is a real elevation.
  await page.getByRole("button", { name: "Show details for W1", exact: true }).click();
  const sized = page.locator(".quote-rowexp").last().locator("svg[data-elevation]");
  await expect(sized).not.toHaveAttribute("data-unsized", "");
  await expect(sized.locator("text")).toHaveText(["1200", "900"]);
  await expect(page.locator(".quote-rowexp").last().getByText("Viewed from outside")).toBeVisible();
});

// ─── 14. Size carries the weight a schedule gives it ──────────────────────────
// Size used to be the SMALLEST and lightest cell in the row — 12px/500, below
// both the product name (14/400) and the price (14/600). Backwards for a window
// schedule, where an opening is identified by its size as much as by its code.
// The row now sits at one size and WEIGHT alone carries the hierarchy (owner).
test("the row's type hierarchy is carried by weight, not size", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");
  const row = page.locator(".quote-row").first();

  const type = (l: ReturnType<typeof page.locator>) =>
    l.evaluate((e) => { const s = getComputedStyle(e); return `${s.fontSize}/${s.fontWeight}`; });

  expect(await type(row.locator("span.font-semibold.truncate"))).toBe("14px/600");   // reference
  expect(await type(row.getByText("AMJ80 Series Sliding Window"))).toBe("14px/400"); // product
  // Size carries the SAME weight as price on a parent row (owner) — an opening
  // is identified by its size as much as by its code.
  expect(await type(row.getByText(/×.*mm/))).toBe("14px/600");                       // size
  expect(await type(row.getByText("$800", { exact: true }))).toBe("14px/600");       // price

  // ONE trailing unit, not two. Saying "mm" on both figures is what made the
  // column wrap at 12px, and it is what paid for the larger type.
  await expect(row.getByText("900 × 1,200 mm", { exact: true })).toBeVisible();
  await expect(row.getByText(/mm ×/)).toHaveCount(0);
});

test("size never wraps at any realistic opening, on any width", async ({ page }) => {
  const wide = { ...plainItem, id: "line-wide", code: "W9", width: "6000", height: "2700" };
  await mockProject(page, [plainItem, wide]);
  for (const w of [1280, 1024, 900, 768, 375]) {
    await page.setViewportSize({ width: w, height: 950 });
    await page.goto("/quote");
    await expect(page.locator(".quote-row").first()).toBeVisible();
    const worst = await page.evaluate(() => Math.max(...[...document.querySelectorAll<HTMLElement>(".quote-row")]
      .map((r) => [...r.querySelectorAll<HTMLElement>("span")]
        .find((s) => /×/.test(s.textContent ?? "") && s.children.length === 0))
      .map((s) => Math.round(s?.getBoundingClientRect().height ?? 0))));
    expect(worst, `size cell stays one line at ${w}px`).toBeLessThanOrEqual(24);
  }
});

// ─── 15. A composite parent is not a product ──────────────────────────────────
// It is the schedule line: an opening we build out of two or more frames, which
// can be different products from each other. The row used to print one of their
// names, which asserts the line IS that product, and drew a panel count guessed
// from that one family (owner).
test("a composite is named and drawn from its units, and carries no chip", async ({ page }) => {
  const AWN = "amj80-series-awning-window";
  const uneven = {
    id: "line-c", code: "W7", productSlug: AWN, location: "", width: "3500", height: "700",
    qty: 1, status: "Ready", lineTotal: 1000, options: {}, compositeAxis: "vertical",
    segments: [
      { id: "u1", productSlug: SLIDING, width: "2600", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 600, options: SEGMENT_OPTIONS, status: "Ready" },
      { id: "u2", productSlug: AWN, width: "900", height: "700", qtyPerParent: 1, qty: 1, lineTotal: null, options: {}, status: "Needs review" },
    ],
  };
  await mockProject(page, [uneven, plainItem]);
  await page.goto("/quote");
  const parent = page.locator(".quote-row").first();

  // Named from the CHILDREN, so a door line is never called a window.
  await expect(parent.getByText("Composite Window")).toBeVisible();
  await expect(parent.getByText(/AMJ80 Series/)).toHaveCount(0);
  // No chip: the name says it is built as units, and a unit carries its own state.
  await expect(parent.locator(".quote-chip")).toHaveCount(0);

  // The drawing is built from the units: the join sits at the REAL split, not
  // at the midpoint a two-panel default would use. 2600 of 3500 is 74.3%.
  const join = await parent.locator("svg[data-elevation] path[opacity='0.75']").getAttribute("d");
  const at = Number(/M([\d.]+)/.exec(join ?? "")?.[1]);
  const glass = await parent.locator("svg[data-elevation] rect").nth(1)
    .evaluate((r) => ({ x: Number(r.getAttribute("x")), w: Number(r.getAttribute("width")) }));
  const fraction = (at - glass.x) / glass.w;
  expect(fraction, "the join is proportional to the units, not centred").toBeGreaterThan(0.68);
  expect(fraction).toBeLessThan(0.80);

  // Only the unpriced unit is flagged, and it says what it means. A unit that is
  // priced but flagged for OUR technical review shows nothing (owner).
  // The units live behind the parent's own disclosure now: a composite opens
  // into its children, exactly as a childless opening opens into its detail.
  await expect(page.locator("[data-unit]")).toHaveCount(0);
  await page.getByRole("button", { name: "Show details for W7", exact: true }).click();
  const units = page.locator("[data-unit]");
  await expect(units).toHaveCount(2);
  await expect(units.nth(0).locator(".quote-chip")).toHaveCount(0);
  // innerText, not element matching: the chip is rendered twice (beside the
  // reference below 1024, as its own column above) and only one is displayed.
  expect(await units.nth(1).innerText()).toContain("Incomplete");
  await expect(page.getByText("Needs review")).toHaveCount(0);
});

// ─── 16. Two kinds of size fault, and only one has a culprit ──────────────────
// Owner's model, and the server's: ALONG the split axis the units must SUM to
// the opening, and a shortfall belongs to no single unit — so the parent says
// "Check sizes" and no child is accused. ACROSS it, every unit must match the
// opening's other dimension exactly, which IS attributable, so that unit is
// marked as well. validateSplit draws the same line: it errors on
// `s[across] !== opening[across]` and treats the along-axis delta as coverage.
//
// The OPENING is marked for an across fault as well (owner). Marking only the
// culprit is right when you can see the culprit, and every record starts
// collapsed — so the one row on screen was the one row saying nothing was wrong,
// while the sticky bar counted the project ready. Attribution decides WHICH rows
// are marked, not whether the opening is one of them.
const unit = (id: string, w: string, h: string, total: number | null) =>
  ({ id, productSlug: SLIDING, width: w, height: h, qtyPerParent: 1, qty: 1, lineTotal: total, options: SEGMENT_OPTIONS, status: "Ready" });

test("a shortfall accuses the opening; a wrong-across unit accuses itself", async ({ page }) => {
  // ACROSS fault: 900 high in a 700-high opening. Widths sum exactly, so
  // coverage is clean and only the culprit is marked.
  await mockProject(page, [{
    id: "line-c1", code: "W5", productSlug: SLIDING, location: "", width: "3500", height: "700",
    qty: 1, status: "Ready", lineTotal: 1000, options: {}, compositeAxis: "vertical",
    coverageDeltaMm: 0, coverageOutOfTolerance: false,
    segments: [unit("s1", "2600", "700", 600), unit("s2", "900", "900", 400)],
  }]);
  await page.goto("/quote");
  await expect(page.locator(".quote-row").first()).toBeVisible();

  // The opening is flagged BEFORE it is opened — collapsed, it is all there is.
  const parent = page.locator(".quote-row").first();
  await expect(parent).toHaveAttribute("data-state", "attention");
  // "Check sizes", the SAME words its unit uses one row below. The chip was
  // hardcoded "Incomplete", so one fault read as two different words depending
  // on which row you looked at — and an opening whose unit is the wrong height
  // is not incomplete, it is inconsistent.
  expect(await parent.innerText()).toContain("Check sizes");
  // …and the bar stops calling the project ready.
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toHaveAttribute("data-state", "attention");

  await page.getByRole("button", { name: "Show details for W5", exact: true }).click();
  const units = page.locator("[data-unit]");
  await expect(units.nth(0)).toHaveAttribute("data-state", "ready");
  await expect(units.nth(1)).toHaveAttribute("data-state", "attention");
  expect(await units.nth(1).innerText()).toContain("Check size");

  // ALONG fault: the units are short of the opening. Nothing about either unit
  // is wrong on its own, so the OPENING carries it and neither child is accused.
  await mockProject(page, [{
    id: "line-c2", code: "W6", productSlug: SLIDING, location: "", width: "3500", height: "700",
    qty: 1, status: "Ready", lineTotal: 1000, options: {}, compositeAxis: "vertical",
    coverageDeltaMm: -400, coverageOutOfTolerance: true,
    segments: [unit("s3", "1550", "700", 500), unit("s4", "1550", "700", 500)],
  }]);
  await page.goto("/quote");
  await expect(page.locator(".quote-row").first()).toBeVisible();

  expect(await page.locator(".quote-row").first().innerText()).toContain("Check sizes");
  await page.getByRole("button", { name: "Show details for W6", exact: true }).click();
  for (const i of [0, 1]) {
    await expect(page.locator("[data-unit]").nth(i)).toHaveAttribute("data-state", "ready");
    await expect(page.locator("[data-unit]").nth(i).locator(".quote-chip")).toHaveCount(0);
  }
  // And the shortfall is stated in MILLIMETRES rather than merely asserted —
  // "400 mm short" says which unit to go and look at, where "doesn't add up"
  // sends someone hunting. It rides on the composite's coverage notice, which
  // sits with the units the parent opened into.
  await expect(page.getByText(/400 mm less than this opening/)).toBeVisible();
});

// ─── 17. The product picker leads with Windows ────────────────────────────────
// Category order was alphabetical, so "Doors" preceded "Windows" everywhere the
// catalogue is grouped — and the picker is where it cost the most: a builder
// adding a window scrolled past every door first. Sanity now carries a display
// order (category.order) that ops manages; the client sorts by it as well.
test("the product-type picker lists Windows before Doors", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote");
  await page.getByRole("button", { name: "Edit W1", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const groups = await page.getByRole("dialog").locator("select optgroup")
    .evaluateAll((els) => els.map((e) => e.getAttribute("label")));
  expect(groups[0], "Windows leads the picker").toBe("Windows");
  expect(groups).toEqual(["Windows", "Doors"]);
});

test("a unit's size stays lighter than its opening's", async ({ page }) => {
  // Parents bold, children not (owner: "non-child records"). Without that a
  // unit's size would carry the same weight as the opening it belongs to, and
  // the indent would be the only thing separating them down the column.
  await mockProject(page, [compositeItem]);
  await page.goto("/quote");
  await page.getByRole("button", { name: "Show details for W2", exact: true }).click();
  const weight = (l: ReturnType<typeof page.locator>) =>
    l.evaluate((e) => getComputedStyle(e).fontWeight);
  const parentSize = page.locator(".quote-row").first().getByText(/×.*mm/);
  const unitSize = page.locator("[data-unit]").first().getByText(/×.*mm/);
  expect(await weight(parentSize)).toBe("600");
  expect(await weight(unitSize)).toBe("500");
});
