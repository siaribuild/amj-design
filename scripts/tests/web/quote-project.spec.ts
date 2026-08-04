// ═══════════════════════════════════════════════════════════════════════════════
// /quote-project — the internal A/B arm of the customer quote builder
//
// Plan §12. These prove the things the presentation change could plausibly break:
// route isolation, the read-only expansion boundary, UI identity surviving a
// rehydrate, draft safety, and that the state mapping never moves a submit gate.
//
// Seeding follows the established pattern in customer.spec.ts: route-mock the
// current-project GET (letting writes through) for exact hydrated shapes, and
// use the real API for anything that must actually persist.
// ═══════════════════════════════════════════════════════════════════════════════
import { test, expect, type Page } from "@playwright/test";

const SLIDING = "amj80-series-sliding-window";

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
    { id: "segment-w2-a", productSlug: SLIDING, width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: {}, status: "Ready" },
    { id: "segment-w2-b", productSlug: SLIDING, width: "1750", height: "700", qtyPerParent: 1, qty: 1, lineTotal: 500, options: {}, status: "Ready" },
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

test("/quote-project loads the same current project, and /quote is unchanged", async ({ page }) => {
  await mockProject(page, [plainItem]);

  await page.goto("/quote-project");
  await expect(page.locator(".quote-page")).toHaveClass(/ground-bone/);
  await expect(page.getByRole("heading", { name: "Quote project regression" })).toBeVisible();
  await expect(page.getByText("AMJ80 Series Sliding Window").first()).toBeVisible();

  // The control arm still renders its own hero/composer surface from the SAME
  // project — the A/B compares presentation, not data.
  await page.goto("/quote");
  await expect(page.getByRole("heading", { name: "Build your quote" })).toBeVisible();
  // The A arm keeps its own card class — only /quote-project became a table.
  await expect(page.locator(".quote-item-card")).toHaveCount(1);
  await expect(page.locator(".quote-sticky")).toBeVisible();
});

// ─── 2. Compact row ────────────────────────────────────────────────────────────

test("the compact row renders identity, size, price and its direct actions", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote-project");

  await expect(page.getByText("W1", { exact: true })).toBeVisible();
  await expect(page.getByText("AMJ80 Series Sliding Window").first()).toBeVisible();
  // Size, and ONLY size. Quantity is not listed on this route at all (owner):
  // the model is one opening per reference, so a "×1" on every line is a column
  // of noise. It had a column of its own from 1024 up and rode in the size cell
  // below that — two homes for a figure that now has none.
  await expect(page.locator(".quote-row").getByText("1,200 mm × 900 mm", { exact: true })).toBeVisible();
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
  await page.goto("/quote-project");

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

  await page.goto("/quote-project");
  await page.getByRole("button", { name: /details for W01$/ }).click();
  await expect(page.getByRole("button", { name: /details for W01$/ })).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Edit W01", exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();

  await page.getByRole("button", { name: /Quantity & note/i }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /Save changes/i }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Still the same opening, still open, and focus is back on its Edit control —
  // the row is keyed on the server id, not the regenerated local one.
  await expect(page.getByRole("button", { name: /details for W01$/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Edit W01", exact: true })).toBeFocused();
  // The saved quantity survived the round-trip — asserted where it is now
  // VISIBLE, which is the editor rather than the row. This route shows no
  // quantity at all (owner): its model is one opening per reference, so the
  // field is stored, edited and priced but never listed.
  await expect(page.locator(".quote-row").getByText(/×\s*2/)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit W01", exact: true }).click();
  await page.getByRole("button", { name: /Quantity & note/i }).click();
  await expect(page.getByRole("dialog").getByText("2", { exact: true })).toBeVisible();
});

// ─── 5. Draft safety ───────────────────────────────────────────────────────────

test("Add opening creates nothing until an explicit save", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote-project");
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
  await page.goto("/quote-project");

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
});

// ─── 6. Duplicate is deliberate, and undoable ──────────────────────────────────

test("duplicate is an intentional copy and Undo restores the previous list", async ({ page }) => {
  await mockProject(page, [plainItem]);
  await page.goto("/quote-project");
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
  await page.goto("/quote-project");

  // Asserted through innerText rather than element matching: the status chip is
  // rendered twice — beside the reference below 1024px, as its own column above
  // — and only one is ever displayed. innerText excludes the display:none copy,
  // so this counts what a person actually sees rather than what is in the DOM.
  const shown = async () => (await page.locator(".quote-table").innerText());
  const occurrences = (haystack: string, needle: string) =>
    haystack.split(needle).length - 1;

  // TECHNICAL-only (`fit`): priced, submittable, and NOT dressed as a problem.
  // A neutral composite attribute is all the customer sees.
  expect(occurrences(await shown(), "Composite · 2 units")).toBe(1);
  await expect(page.getByText("Needs review", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ready", { exact: true })).toHaveCount(0);

  // ERROR-severity (`dims`): the one case the customer can act on. The row
  // carries the LABEL only; the reason and the action moved into the panel,
  // which opens itself for exactly this state so nothing is hidden by the move.
  expect(occurrences(await shown(), "Needs your input")).toBe(1);
  // Anchored to the disclosure specifically: "Fix details for W3" now also ends
  // in "details for W3", and a loose regex resolves to both.
  await expect(page.getByRole("button", { name: /^(Show|Hide) details for W3$/ }))
    .toHaveAttribute("aria-expanded", "true");
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
  await page.goto("/quote-project");
  const bar = page.getByRole("region", { name: "Project summary and actions" });
  await expect(bar).toHaveAttribute("data-state", "review");
  await expect(bar.getByRole("button", { name: /Submit for technical review/ })).toBeVisible();

  await bar.getByRole("button", { name: /Submit for technical review/ }).click();
  await expect(page.getByRole("heading", { name: "Review and submit" })).toBeVisible();
});

// ─── 8. Responsive ─────────────────────────────────────────────────────────────

test("desktop gets a side drawer, mobile a full-screen editor, neither scrolls sideways", async ({ page }) => {
  await mockProject(page, [plainItem, compositeItem]);

  for (const [w, h] of [[1440, 900], [1024, 800], [768, 1024], [375, 812]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/quote-project");
    await expect(page.locator(".quote-row").first()).toBeVisible();
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
  }

  // Below 768 the editor is full-screen — a side panel there is unusable for a
  // real quote form. From 768 up it is a slide-out panel like the main menu, so
  // the project context the drawer exists to preserve stays on screen.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/quote-project");
  await page.getByRole("button", { name: "Edit W1", exact: true }).click();
  const mobileBox = await page.getByRole("dialog").boundingBox();
  expect(mobileBox!.width).toBeGreaterThan(360);

  for (const [w, h] of [[768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/quote-project");
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
  await page.goto("/quote-project");

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
  await page.goto("/quote-project");

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
  await page.goto("/quote-project");
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

  await page.goto("/quote-project");
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
