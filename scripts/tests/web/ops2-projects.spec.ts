import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ops2's Projects list — the first real destination, and the only place that can
// prove it.
//
// WHY A BROWSER SUITE IS NOT OPTIONAL HERE. The node suites exercise the Worker
// and the queue model; they cannot see anything the client decides, and the
// HTML the Worker serves is byte-identical whether this list renders a row, an
// empty state, or nothing at all. Two MAJOR findings on the referral program
// were invisible to 104 green node tests for exactly that reason.
//
// The list mounts inside the shell built in `feat/ops2-navigation`: a 224px rail
// at 1024+ and a four-tab bar below it.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const PROJECTS = `${OPS2}/projects`;
const PRODUCTS = `${OPS2}/products`;

// Sign in as a SEEDED admin, read from seed.sql — the same reasoning as
// scripts/tests/web/ops.spec.ts, whose comment records why a literal
// "staff@openframe.com.au" stopped working: the Worker creates such a staffer
// with role = null and only promotes them when NO admin exists.
//
// ops2 itself has no sign-in — authentication is Cloudflare Access on the HOST,
// which is off in local dev — but `/api/ops/projects` is staff-gated all the
// same, so the queue needs a session before it has anything to show. Done
// through the API rather than the legacy console's form: this is an ops2 spec,
// and driving another console's sign-in screen would make its layout a
// dependency of this one.
//
// u_staff2, NOT u_staff1, and the difference is a suite-level fact rather than a
// preference: scripts/tests/web/ops.spec.ts signs the legacy console in as
// u_staff1, and code issuance refuses a second challenge to the same address
// inside `RESEND_COOLDOWN_MS` (60s, worker/lib/auth.ts). Both files run in the
// same battery against one Worker, so sharing a mailbox made whichever ran
// second fail at its OTP — reported as "Dev mode text not found", which reads
// like broken auth rather than like a rate limit doing its job. The seed carries
// both founders; the two consoles' specs take one each.
const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff2'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff2");
  return email;
})();

// ONE SIGN-IN FOR THE FILE, and both halves of that are forced rather than
// tidy:
//
//  - The code issuer refuses to re-issue while a code is outstanding
//    (`RESEND_COOLDOWN_MS`, 60s, worker/lib/auth.ts) and caps five per address
//    per fifteen minutes. A sign-in per test runs into the first limit on test
//    two and the second by test six — as a suite failure that looks like broken
//    auth rather than like a rate limit doing its job.
//  - It has to happen INSIDE THE PAGE. Node's DNS does not resolve `*.localhost`
//    on Windows, so `page.request` cannot reach the ops host at all
//    (ENOTFOUND); only Chromium resolves it. `fetch` from the page also puts
//    the session cookie on the host that will actually be read.
//
// The cookies are then handed to each test's own context, which keeps the tests
// independent of each other while sharing the one challenge.
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
  expect(ok, "staff sign-in").toBeNull();
  staffCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(staffCookies);
});

test("the queue arrives on what needs us, behind exactly three quick filters", async ({ page }) => {
  await page.goto(PROJECTS);

  // The destination's own heading — where R-164's focus manager lands, and the
  // proof the list replaced the placeholder root rather than sitting beside it.
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing is built here yet.")).toHaveCount(0);
  // Named first, because every later assertion fails the same way when the
  // session is wrong and the page is honestly telling you so.
  await expect(page.getByTestId("queue-error")).toHaveCount(0);

  // THE OWNER'S CAP, VERBATIM: "3 quick filters max + filter icon with bubble."
  // Asserted as a maximum on what is RENDERED, not on the model's array — a
  // fourth chip added to the markup would slip past a model-only check.
  const chips = page.getByTestId("queue-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText(/All/);
  await expect(chips.nth(1)).toHaveText(/Needs us/);
  await expect(chips.nth(2)).toHaveText(/Customer/);

  // Arrival is the queue's reason for existing, not a menu: the seed's two
  // non-draft projects are both ours, and both are on screen without a tap.
  //
  // ASSERTED BY IDENTITY, NEVER BY TOTAL. Every spec file in this battery shares
  // one Worker and one D1, and several of them submit projects — so the number
  // of rows here depends on which files happen to be running alongside. The
  // first version counted, passed alone, and failed in the full battery with
  // three rows. Anything that needs a controlled row SET intercepts the
  // endpoint instead; anything reading the real one names what it expects.
  await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();
  await expect(page.getByText("Northcote extension")).toBeVisible();
});

test("a sibling route's own ?attn= is ignored by a Projects page kept mounted behind it", async ({ page }) => {
  // Ionic keeps ProjectsPage mounted once visited, so its `?attn=` effect
  // watches the GLOBAL location — unguarded, it would fire for a search string
  // that belongs to a different route entirely. Reproduced with real browser
  // history rather than a page.goto for the second hop: goto reloads the
  // document and never mounts Projects at all, which is not this bug.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${PRODUCTS}?attn=submissions`);
  await page.locator('.ops2-nav__item[href$="/projects"]').click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

  // Back to the first entry: pathname /products, search ?attn=submissions, with
  // Projects still mounted (hidden) behind it. A pathname-unguarded effect
  // reads this search, applies the Attention prefilter and calls
  // `history.replace(PROJECTS.path)` — yanking the reader off /products.
  await page.goBack();
  await expect(page).toHaveURL(`${PRODUCTS}?attn=submissions`);
});

test("rail navigation and back from a record both reset the attention prefilter", async ({ page }) => {
  // Design §3.3, contract point 3: re-entering the view without an `attn`
  // instruction while the prefilter is on resets to `EMPTY_QUERY`.
  //
  // STUBBED, like the other tests in "the states the seed cannot produce"
  // below QUEUE_URL's own declaration (referenced here by closure — the
  // module finishes loading, defining it, before any test body runs): the
  // real seed's projects predate `statusCustomer` reaching this endpoint, so
  // no live row can be relied on to match an Attention predicate.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [fixtureRow({ id: "p_att1", ref: "OF-Q-90", title: "A submission", statusCustomer: "submitted" })] },
  }));

  await page.goto(`${PROJECTS}?attn=submissions`);
  await expect(page).toHaveURL(PROJECTS);
  await expect(page.getByTestId("queue-active-filters")).toContainText("New submissions");

  // Rail away, then rail back — a re-entry that carries no `attn` param.
  await page.locator('.ops2-nav__item[href$="/products"]').click();
  await page.locator('.ops2-nav__item[href$="/projects"]').click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");

  // Re-apply, then leave and return via a record instead of the rail — a
  // client-side hop, so the page stays mounted (hidden) behind the record,
  // exactly like the existing "back from a record" tests further down. The
  // record's own fetch is not stubbed here, so only the URL is asserted —
  // same reasoning as "coming back to the queue re-reads it" below.
  await page.goto(`${PROJECTS}?attn=submissions`);
  await expect(page.getByTestId("queue-active-filters")).toContainText("New submissions");
  await page.getByTestId("queue-row").filter({ hasText: "A submission" }).click();
  await expect(page).toHaveURL(/\/ops2\/projects\/p_att1$/);
  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("a valid ?attn= narrows to its set, and the strip's Clear returns to Needs us", async ({ page }) => {
  // Design §3.3, contract points 1 and 4. `readyToIssue` reads the server's
  // own `issuable` verdict — one row true, one false — so the narrowing is
  // real rather than incidental.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [
      fixtureRow({ id: "p_ready", ref: "OF-Q-91", title: "Ready one", issuable: true }),
      fixtureRow({ id: "p_notready", ref: "OF-Q-92", title: "Not ready one", issuable: false }),
    ] },
  }));

  await page.goto(`${PROJECTS}?attn=readyToIssue`);
  // The param is stripped — a one-shot instruction, not a bookmarkable state.
  await expect(page).toHaveURL(PROJECTS);
  await expect(page.getByTestId("queue-active-filters")).toContainText("Ready to issue");
  const rows = page.getByTestId("queue-row");
  await expect(rows).toHaveCount(1);
  await expect(page.getByText("Ready one")).toBeVisible();
  await expect(page.getByText("Not ready one")).toHaveCount(0);

  // Clear restores `EMPTY_QUERY` — `Needs us` lit, bare URL — not merely the
  // refinements-only clear the same button does with no prefilter on: both
  // fixture rows default `waitingOn: "Us"`, so both are back.
  await page.getByTestId("queue-active-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(page).toHaveURL(PROJECTS);
});

test("?attn=bogus and injection payloads render the default set, nothing echoed", async ({ page }) => {
  // Design §3.3 point 2 / test plan criteria 12 and 22: an unrecognised value
  // is `null` before it reaches anything — `EMPTY_QUERY`, no error, no strip,
  // param stripped the same as a valid one, and the raw string appears nowhere
  // in the document.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [
      fixtureRow({ id: "p_one", ref: "OF-Q-93", title: "One" }),
      fixtureRow({ id: "p_two", ref: "OF-Q-94", title: "Two" }),
    ] },
  }));

  const payloads = [
    "bogus",
    "'; DROP TABLE project; --",
    "<script>window.__pwned = 1</script>",
    "x".repeat(10_000),
  ];
  for (const payload of payloads) {
    await page.goto(`${PROJECTS}?attn=${encodeURIComponent(payload)}`);
    await expect(page).toHaveURL(PROJECTS);
    await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
    await expect(page.getByTestId("queue-error")).toHaveCount(0);
    await expect(page.getByTestId("queue-row")).toHaveCount(2);
    if (payload.length < 200) {
      await expect(page.locator("body")).not.toContainText(payload);
    }
  }
});

test("signed out, ?attn=readyToIssue hits the same wall as every other visit and shows no rows", async ({ browser }) => {
  // Test plan criterion 18. A fresh context, none of the file's `beforeEach`
  // cookies: `GET /api/ops/projects` refuses with 403 regardless of the query
  // string — the parameter is consumed client-side over rows already fetched,
  // never sent to the server (design §6) — so the reader lands on the same
  // refusal surface as an authenticated non-staff account, not a filtered list.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${PROJECTS}?attn=readyToIssue`);
  await expect(page.getByTestId("queue-error")).toBeVisible();
  await expect(page.getByTestId("queue-row")).toHaveCount(0);
  await context.close();
});

test("search replaces the title row in place, and the header does not grow", async ({ page }) => {
  // THE OWNER'S RULE, VERBATIM: "Keep within one line, search entry field shall
  // not add another line." Measured rather than asserted structurally, because
  // the failure mode is a number: a taller control silently pushing the list
  // down by a row on the surface whose whole value is how much of the list you
  // can see at a glance.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PROJECTS);
  await expect(page.getByTestId("queue-row").first()).toBeVisible();

  const head = page.locator(".ops2-page__head");
  const before = await head.boundingBox();
  // THE FIRST THING BELOW THE HEAD ROW, whatever that is — on the phone it is
  // the filter row, because the attention strip is the desk's and the owner's
  // phone drawing goes title → chips → cards. Measuring the strip here pinned
  // the guarantee to a element that is not rendered at this width.
  const belowBefore = await page.locator(".pq-controls").boundingBox();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

  await page.getByTestId("queue-search-toggle").click();
  const field = page.getByTestId("queue-search");
  await expect(field).toBeVisible();
  // The field REPLACED the title rather than joining it: the two never share
  // the row, which is what would make the row grow on a longer destination name.
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeHidden();
  // The owner's Cancel, at the field's right — OUR word, not Ionic's. Its own
  // cancel honours `cancelButtonText` in the iOS idiom only; on Material it
  // renders a leading back arrow instead, which is a navigation control on the
  // one row where a navigation control would be a trapdoor.
  await expect(page.getByTestId("queue-search-cancel")).toBeVisible();
  await expect(page.getByTestId("queue-search-cancel")).toHaveText("Cancel");

  const after = await head.boundingBox();
  const belowAfter = await page.locator(".pq-controls").boundingBox();
  expect(after!.height, "the head row's height").toBe(before!.height);
  expect(belowAfter!.y, "nothing below the head row moved").toBe(belowBefore!.y);

  // And it searches — across the quick filter, because whoever is on the phone
  // does not know which chip happens to be selected.
  await field.locator("input").fill("Northcote");
  // NARROWING SHOWN BY IDENTITY: the match is there and the other seeded row is
  // gone. Counting the whole list would depend on which other spec files in the
  // battery have submitted projects into the shared database.
  await expect(page.getByText("Northcote extension")).toBeVisible();
  await expect(page.getByText("Fitzroy townhouses")).toHaveCount(0);

  // Cancel puts the title back, still in one row.
  await page.getByTestId("queue-search-cancel").click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();
  expect((await head.boundingBox())!.height).toBe(before!.height);
});

test("no status panel at either width, and nothing it counted is unreachable", async ({ page }) => {
  // THE OWNER REMOVED IT, from the phone drawing first and then from the desk.
  // Both widths are asserted rather than one: the previous version of this test
  // checked the phone only, which would have passed just as happily with the
  // panel still sitting at 1440 — and it was, which is how it survived a round.
  //
  // The second half is the point of removing it. Every number the panel carried
  // is still a control on this screen, so what went is a band of page above the
  // work rather than a way of reaching the work.
  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(PROJECTS);
    await expect(page.getByTestId("queue-row").first()).toBeVisible();
    await expect(page.getByTestId("queue-attention")).toHaveCount(0);
    await expect(page.getByTestId("queue-stat")).toHaveCount(0);

    // Three of the four are the chips. `Needs us` is the panel's headline.
    const chips = page.getByTestId("queue-chip");
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(1)).toHaveText(/Needs us/);
    // And the fourth is in the funnel, which is where the phone always reached
    // it — the desk now reaches it the same way rather than by its own path.
    await page.getByTestId("queue-funnel").click();
    await expect(page.getByTestId("queue-filter-sheet").getByText("Ready to issue")).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("the tab strip never clips a label, and the bubble is part of the button", async ({ page }) => {
  // TWO WAYS A GROUPED CONTROL GOES WRONG, both found in review.
  //
  // 1. Counts are unbounded — the queue is not paginated — so the strip has to
  //    survive three-digit counts on a small phone without cutting a label off
  //    or carrying the funnel past the right edge. It clipped silently when the
  //    filters were a bordered group: `overflow: hidden` makes a flex item's
  //    automatic minimum size ZERO whatever its contents. As tabs there is no
  //    group box to clip against, and the strip is narrower — but the counts
  //    are the same, so the assertion is still the one that matters.
  //
  // 400 projects split evenly, so ALL THREE counts are three digits —
  // 400 / 200 / 200. The first version of this test served 120 and got
  // 120 / 60 / 60, which is two digits on the two widest labels and therefore
  // 16px narrower than the state it was meant to describe. The queue is
  // unpaginated, so this is a size it will reach.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: Array.from({ length: 400 }, (_, i) => fixtureRow({
      id: `p_${i}`, ref: `OF-Q-${i}`, title: `Project ${i}`,
      waitingOn: i % 2 ? "Us" : "Customer", phase: "Pricing",
    })) },
  }));
  // 320px is the narrowest this console claims to serve.
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(PROJECTS);
  await expect(page.getByTestId("queue-row").first()).toBeVisible();

  const chips = page.getByTestId("queue-chip");
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toContainText("400");
  for (const chip of await chips.all()) {
    const clipped = await chip.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(clipped, `"${await chip.textContent()}" is cut off`).toBeLessThanOrEqual(1);
  }
  // Nor does it solve the problem by pushing the funnel off the edge: a
  // destination must never require horizontal scrolling.
  //
  // MEASURED ON THE ROW, NOT ON THE DOCUMENT. `document.scrollingElement` never
  // moves in an Ionic app — `ion-content` scrolls inside its own shadow root
  // and clips the rest — so the first version of this assertion read 320/320
  // and passed while the filter row was overflowing by 70px with the funnel
  // hanging off the screen. The container that actually overflows is the one to
  // ask.
  for (const selector of [".pq-chips", ".pq-controls", ".ops2-page__body"]) {
    const over = await page.locator(selector)
      .evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(over, `${selector} overflows sideways`).toBeLessThanOrEqual(1);
  }
  // And the funnel is still on screen and pressable, which is the consequence.
  const funnel = (await page.getByTestId("queue-funnel").boundingBox())!;
  expect(funnel.x + funnel.width, "the funnel is off the right edge")
    .toBeLessThanOrEqual(320);

  // 2. The bubble protrudes past the button's corner, and it is decorative —
  //    so without care the part sticking out is dead area on a touch screen,
  //    sitting exactly where a thumb aims for the corner of a control.
  const sheet = page.getByTestId("queue-filter-sheet");
  await page.getByTestId("queue-funnel").click();
  await expect(sheet).toBeVisible();
  // Addressed by key, not position — six refinements now (t1's merge), and
  // this test only needs any one of them ticked.
  await page.locator('[data-testid="queue-refinement"][data-refinement="production"]').click();
  await page.keyboard.press("Escape");
  // WAIT FOR IT TO ACTUALLY BE GONE. The first version of this test asserted
  // the sheet was open again straight after the tap, and passed — because
  // `IonModal`'s dismiss is animated and the old sheet was still on screen. It
  // proved the animation's duration, not the hit target.
  await expect(sheet).toBeHidden();

  const bubble = page.getByTestId("queue-funnel-count");
  await expect(bubble).toBeVisible();
  const box = (await bubble.boundingBox())!;
  // Tapped where it OVERHANGS — outside the button's own box, top-right — the
  // sheet opens. That corner is exactly where a thumb aims for a control.
  await page.mouse.click(box.x + box.width - 3, box.y + 3);
  await expect(sheet).toBeVisible();
  await page.unroute(QUEUE_URL);
});

test("the phone keeps the top safe-area inset it used to get from the header", async ({ page }) => {
  // IONIC'S TOP INSET COMES FROM `ion-header`. Removing the bar on the phone
  // removed the thing that was consuming `safe-area-inset-top`, so on a notched
  // device — or the console installed to a home screen, which is how a phone
  // actually uses it — "Projects" would sit under the status bar. Invisible in
  // this browser, where the inset is 0.
  //
  // So the wiring is tested rather than the pixels: the body reads the inset
  // through a named variable, and setting that variable has to move the page.
  // `env()` cannot be forced from a test, and asserting `padding-top: 0` here
  // would pass just as happily with the declaration deleted.
  for (const [width, height, shouldInset] of [[390, 844, true], [1440, 900, false]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(PROJECTS);
    await expect(page.getByTestId("queue-row").first()).toBeVisible();

    const body = page.locator(".ops2-page__body");
    const applied = await body.evaluate((el) => {
      el.style.setProperty("--ops2-safe-top", "44px");
      const px = parseFloat(getComputedStyle(el).paddingTop);
      el.style.removeProperty("--ops2-safe-top");
      return px - parseFloat(getComputedStyle(el).paddingTop);
    });
    expect(applied, `${width}px: the inset ${shouldInset ? "is not" : "is"} honoured`)
      .toBe(shouldInset ? 44 : 0);
  }
});

/**
 * A MEASUREMENT READ ONCE IT HAS STOPPED MOVING — two consecutive identical
 * reads, or the poll gives up and says so.
 *
 * Duplicated from `ops2-drawing-viewer.spec.ts` rather than shared: these specs
 * are deliberately self-contained — each re-derives its own staff identity and
 * its own helpers — and one shared module for two callers would be the first of
 * its kind in this directory. Eight lines is the cheaper debt.
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

test("the skeleton is the shape that actually arrives, at both widths", async ({ page }) => {
  // A SKELETON IS A PROMISE ABOUT THE COMING LAYOUT, so it is wrong in a way a
  // spinner cannot be: it can promise a block that never lands, or a block the
  // wrong size. Both were shipped here. The narrow layout dropped the attention
  // strip and the skeleton went on reserving its height; then the `Needs review`
  // chip added a row to every arrival card and the placeholder stayed at 96.
  //
  // FOUR ROWS, WHICH IS WHAT THE SKELETON DRAWS. Against the seeded pair the
  // desk's table is half the height its placeholder claims, so there is no
  // honest comparison to make; with four the promise and the arrival are the
  // same shape and every edge can be checked. They are pre-issue and ours,
  // which is the arrival view the placeholder was measured against — and the
  // tall card, the one that carries a chip.
  const queue = { projects: [0, 1, 2, 3].map((i) => fixtureRow({
    id: `p_${i}`, ref: `OF-Q-${i}`, title: `Project ${i}`,
    waitingOn: "Us", phase: "Pricing", stateLabel: "Technical review", daysInStage: i,
  })) };

  for (const [width, height] of [[390, 844], [1440, 900]] as const) {
    await page.setViewportSize({ width, height });

    // ONE handler, held open deliberately so the state is seen rather than
    // raced for. Not a fixture route with a holding route layered over it:
    // `fallback()` hands on to the NETWORK, not to the other handler, so the
    // seeded pair arrived and the four-row comparison had nothing to compare.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(QUEUE_URL, async (route) => { await held; await route.fulfill({ json: queue }); });
    const loading = page.goto(PROJECTS);

    const skeleton = page.getByTestId("queue-skeleton");
    await expect(skeleton).toBeVisible();
    await expect(page.locator("ion-spinner")).toHaveCount(0);
    // TWO PROMISES, IN TWO PLACES. The control row is not part of the skeleton
    // any more — it lives in the white band, which holds its own space with a
    // placeholder — so the band is measured directly and the skeleton stands in
    // for the list alone.
    // READ ONCE THE PROMISE HAS STOPPED MOVING. Under a parallel battery this
    // pair was taken the instant the skeleton became visible, before Ionic had
    // finished hydrating `ion-skeleton-text` — so "the promised height" was
    // measured against a bar that had not reached its own size yet, and the
    // comparison below came back 17px out against a 4px bound. Intermittent,
    // and it always passed serially, because the machine was fast enough to
    // finish before anyone looked.
    //
    // The bounds are untouched: 2px and 4px are the sizes of the layout
    // differences this test exists to catch, and a bound wide enough to absorb
    // 17px would absorb the defect it was written for — the band growing by a
    // row when the data lands, which is exactly the jump the skeleton prevents.
    const during = await settled(async () => ({
      row: (await page.locator(".pq-controls").boundingBox())!,
      list: (await skeleton.locator("ion-skeleton-text").first().boundingBox())!,
    }));
    const rowDuring = during.row;
    const listDuring = during.list;

    release();
    await loading;
    await expect(page.getByTestId("queue-row")).toHaveCount(4);

    // 1. THE BAND DOES NOT CHANGE SHAPE when the data lands. Rendering the real
    //    row only once the queue arrived grew the band by a row at that moment
    //    and shoved the whole list down — the jump the skeleton exists to
    //    prevent, reintroduced one level above it.
    const rowSettled = (await page.locator(".pq-controls").boundingBox())!;
    expect(Math.abs(rowSettled.y - rowDuring.y), `the control row moves at ${width}px`)
      .toBeLessThanOrEqual(2);
    expect(Math.abs(rowSettled.height - rowDuring.height), `the band changes height at ${width}px`)
      .toBeLessThanOrEqual(2);

    // 2. AND THE LIST LANDS WHERE IT WAS PROMISED, both edges. The top alone is
    //    set by the band above it and says nothing about whether the block is
    //    the right size.
    const list = (await page.locator(width >= 1024 ? ".pq-table-wrap" : ".pq-cards")
      .boundingBox())!;
    expect(Math.abs(list.y - listDuring.y), `the list starts elsewhere at ${width}px`)
      .toBeLessThanOrEqual(2);
    expect(Math.abs(list.height - listDuring.height), `the list is not the promised height at ${width}px`)
      .toBeLessThanOrEqual(4);
    await page.unroute(QUEUE_URL);
  }
});

test("the funnel opens the mock's panel, and its bubble counts what is on", async ({ page }) => {
  // The owner: "3 quick filters max + filter icon with bubble. Filter panel at
  // the bottom is to be taken from the mock." So the funnel opens the mock's
  // bottom sheet — every refinement listed, each independently settable, each
  // stating what it would leave — and never toggles one filter while wearing a
  // badge that implies a set. That was its predecessor's defect, and the mock
  // fixed it in the open (`02623bae` on `design/ops2-planning`).
  //
  // AGAINST AN INTERCEPTED SET, because this test is about numbers and the
  // battery shares one database: other spec files submit projects, so the count
  // beside a refinement depends on which of them happen to be running. What is
  // under test is the panel's own behaviour, and that is the client's alone.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [
      fixtureRow({ id: "p_us", ref: "OF-Q-1", title: "Ours", waitingOn: "Us" }),
      fixtureRow({ id: "p_prod", ref: "OF-Q-2", title: "Underway", waitingOn: "Nobody", phase: "Production" }),
    ] },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PROJECTS);
  await page.getByTestId("queue-chip").first().click();      // All
  await expect(page.getByTestId("queue-row")).toHaveCount(2);

  // Nothing on, nothing claimed.
  await expect(page.getByTestId("queue-funnel-count")).toHaveCount(0);

  await page.getByTestId("queue-funnel").click();
  // ASSERT STATE, NOT PRESENTED GEOMETRY: `ion-modal.present()` is rAF-driven
  // and the handover records it never resolving in a hidden tab. What is being
  // proved here is that the panel's content is on screen and usable.
  const sheet = page.getByTestId("queue-filter-sheet");
  await expect(sheet.getByText("Filters", { exact: true })).toBeVisible();

  const refinements = page.getByTestId("queue-refinement");
  // Six now — the Attention gate's four merged in alongside the original two
  // (queue.ts REFINEMENTS, t1).
  await expect(refinements).toHaveCount(6);
  await expect(sheet.getByText("Ready to issue")).toBeVisible();
  await expect(sheet.getByText("Unresolved lines")).toBeVisible();
  // The fourth quick filter the mock argued for, demoted rather than deleted —
  // "what you hunt for when a customer rings about work already underway".
  await expect(sheet.getByText("In production")).toBeVisible();

  // Each states its effect BEFORE it is chosen: one of the two is in
  // production, so nothing here is ticked blind. `production` is addressed by
  // its own key now that the merge changed its position in the list, rather
  // than by an index that six entries could shift under.
  const production = page.locator('[data-testid="queue-refinement"][data-refinement="production"]');
  await expect(production.getByTestId("queue-refinement-count")).toHaveText("1");

  await production.click();
  await page.getByRole("button", { name: "Done" }).click();

  // The bubble now says how many are on, and the strip above the list says WHICH
  // — a count alone still leaves a reader guessing which row went missing.
  await expect(page.getByTestId("queue-funnel-count")).toHaveText("1");
  await expect(page.getByTestId("queue-active-filters")).toContainText("In production");
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByText("Underway")).toBeVisible();

  // And one way to clear the lot — the strip's Clear is a full reset back to
  // `Needs us` now, refinements-only or not: one row (`p_us`, waiting on Us).
  await page.getByTestId("queue-active-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("queue-funnel-count")).toHaveCount(0);
  await expect(page.getByTestId("queue-chip").nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
});

// ── The states the seed cannot produce ───────────────────────────────────────
// Everything above runs against the real endpoint and the real seed, and that
// is where the value is. The three tests below intercept `/api/ops/projects`,
// and it is worth saying plainly why rather than leaving it to be discovered:
//
//  - The seed holds two non-draft projects and BOTH are waiting on us, so the
//    other two wait states have no row to render. Driving a real transition
//    (`POST /api/ops/projects/:id/status`) would work, but every spec file in
//    this suite shares one Worker and one D1, so it would leak into whatever
//    else is reading `p_submitted` in a parallel worker.
//  - An empty queue, a 403 and a hung request cannot be produced from the
//    database at all.
//
// So these assert what the CLIENT does with a given payload, which is the half
// no node suite can see, and they say so rather than implying end-to-end cover.
const QUEUE_URL = (url: URL) => url.pathname === "/api/ops/projects";

const fixtureRow = (over: Record<string, unknown>) => ({
  id: "p_x", ref: "OF-Q-19999", title: "A project", customerName: "A customer",
  org: null, lineCount: 4, value: 1000, valueBasis: "est.", unresolved: 0, issuable: false,
  waitingOn: "Us", daysInStage: 1, phase: "Pricing", phaseIndex: 1,
  stateLabel: "Pricing", orderNo: null, updatedAt: "2026-08-20 00:00:00", ...over,
});

test("a row says who it waits on, in words and at its leading edge", async ({ page }) => {
  // The status is a WORD first and a colour second — it has to read identically
  // in greyscale, which is what makes it survive a phone in sunlight AND a
  // reader who cannot separate amber from blue-grey. The edge marks the row's
  // headline status and not `flagged`: the chips already say what is wrong, and
  // an edge that repeats a chip earns nothing.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [
      fixtureRow({ id: "p_us", ref: "OF-Q-1", title: "Ours", waitingOn: "Us", daysInStage: 3, unresolved: 2, stateLabel: "Technical review" }),
      fixtureRow({ id: "p_cust", ref: "OF-Q-2", title: "Theirs", waitingOn: "Customer", daysInStage: 7, phase: "Issued", stateLabel: "Quote issued" }),
      fixtureRow({ id: "p_none", ref: "OF-Q-3", title: "Nobody's", waitingOn: "Nobody", daysInStage: 4, phase: "Production", stateLabel: "In manufacturing", value: null }),
    ] },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PROJECTS);

  await page.getByTestId("queue-chip").first().click();      // All
  const rows = page.getByTestId("queue-row");
  await expect(rows).toHaveCount(3);

  // Ours first, then longest neglected — the server's own order, kept after
  // filtering. Not `updatedAt`, which moves when the CUSTOMER replies and so
  // buries the thing we have to do under the thing that just happened.
  await expect(rows.nth(0)).toContainText("Waiting on us · 3d");
  await expect(rows.nth(1)).toContainText("Waiting on the customer · 7d");
  await expect(rows.nth(2)).toContainText("Waiting on nobody · 4d");

  // The edge is a real rendered edge, per row, and it distinguishes. Read off
  // `.ops2-row__open` — the row's single pressable, which is where the shared
  // component paints the edge, the wash and the selection tint TOGETHER so that
  // no state can erase another. It used to be read from inside `ion-item`'s
  // shadow root; the queue left IonItem when these three list surfaces became
  // one component (ADR 0014), and reaching through a shadow boundary for this
  // is the thing that stopped being necessary.
  const shadows = await rows.evaluateAll((els) => els.map((el) => {
    const press = (el as HTMLElement).querySelector(".ops2-row__open");
    return press ? getComputedStyle(press).boxShadow : "";
  }));
  expect(shadows[0], "ours carries an edge").toContain("inset");
  expect(shadows[1], "theirs carries a different edge").toContain("inset");
  expect(shadows[0]).not.toBe(shadows[1]);
  expect(shadows[2], "nobody's carries none — that is not a problem and must not look like one").not.toContain("inset");

  // The exception is shown and the default suppressed: only the row with
  // unfinished lines carries a chip — and it says UNRESOLVED, the server's own
  // word. "Unpriced" was the first wording and it overstated the data: the
  // endpoint counts `status <> 'ready' OR line_total IS NULL`, so a fully priced
  // line awaiting technical review is unresolved and is not unpriced.
  await expect(rows.nth(0)).toContainText("Unresolved 2");
  await expect(rows.nth(1)).not.toContainText("Unresolved");
  // The owner drew TWO chips on his `Waiting on us` cards and one shipped. The
  // second names the row's own claim on a human; a card waiting on the customer
  // carries neither, which is what keeps a chip meaning something.
  await expect(rows.nth(0)).toContainText("Needs review");
  await expect(rows.nth(1)).not.toContainText("Needs review");
  await expect(rows.nth(2)).not.toContainText("Needs review");
  // A figure nobody has costed is NOT $0 — the absence this queue exists to hunt.
  await expect(rows.nth(2)).toContainText("Not priced");
});

test("empty, loading and error are three different screens", async ({ page }) => {
  // They look identical once a spinner stops, and they mean opposite things:
  // one says the day is clear, one says it is still arriving, and one says the
  // work exists and you cannot see it. A queue that cannot tell them apart is
  // how a project sits for a day, which is the cost this console exists to
  // avoid. Each one is proved separately.

  // 1. FILTERED EMPTY — a chip with nothing in it, which is the best news of
  //    the day and must not look like the worst.
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [fixtureRow({ id: "p_us", ref: "OF-Q-1", title: "Ours", waitingOn: "Us" })] },
  }));
  await page.goto(PROJECTS);
  await page.getByTestId("queue-chip").nth(2).click();
  const empty = page.getByTestId("queue-empty");
  await expect(empty).toContainText("Nothing is waiting on the customer.");
  await expect(empty.getByRole("button", { name: "Show all" })).toBeVisible();
  await empty.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await page.unroute(QUEUE_URL);

  // 2. NOTHING AT ALL blames nothing — with no rows the filters are not why the
  //    list is empty, and offering "Show all" would send a reader hunting
  //    through filters for work that does not exist.
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.reload();
  await expect(page.getByTestId("queue-empty")).toContainText("No projects yet.");
  await expect(page.getByTestId("queue-empty").getByRole("button")).toHaveCount(0);
  await page.unroute(QUEUE_URL);

  // 3. LOADING is a SKELETON OF THE COMING SHAPE, never a spinner (R-161, and
  //    the boundary document's ruling on IonLoading). Held open deliberately so
  //    the state can be seen rather than inferred from a race.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(QUEUE_URL, async (route) => { await held; await route.continue(); });
  const loading = page.goto(PROJECTS);
  await expect(page.getByTestId("queue-skeleton")).toBeVisible();
  await expect(page.locator("ion-spinner")).toHaveCount(0);
  release();
  await loading;
  await expect(page.getByTestId("queue-row").first()).toBeVisible();
  await page.unroute(QUEUE_URL);

  // 4. A REFUSAL SAYS WHAT FAILED. Behind Cloudflare Access the person IS
  //    signed in, so "please sign in" would send them looking for a screen that
  //    does not exist; what has failed is the staff role, not the identity.
  await page.route(QUEUE_URL, (route) => route.fulfill({ status: 403, json: { error: "forbidden" } }));
  await page.reload();
  await expect(page.getByTestId("queue-error")).toContainText("This account cannot see the queue.");
  await expect(page.getByTestId("queue-error")).not.toContainText("sign in");
  // AND NOTHING ON THE PAGE IS STILL SHIMMERING. A skeleton is a promise that
  // something is on its way; beside a message saying it is not coming, it is
  // the screen contradicting itself — and the animation is the half that
  // catches the eye. The band's control row placeholder was rendered for every
  // state that was not `ready`, which included this one.
  await expect(page.locator("ion-skeleton-text")).toHaveCount(0);
  await expect(page.getByTestId("queue-skeleton")).toHaveCount(0);
  // There is also nothing to filter, so the row itself is gone rather than
  // sitting there offering counts of a list that failed to arrive.
  await expect(page.getByTestId("queue-chip")).toHaveCount(0);
  // NOR ANYTHING TO SEARCH. Every control on this surface narrows a list, so
  // when the list did not arrive none of them can do anything — and a control
  // that cannot do anything is the defect this effort has recorded three times.
  // The phone's magnifier outlived the tabs because it lives in the title row
  // rather than in the band.
  await page.setViewportSize({ width: 390, height: 844 });
  // WAIT FOR THE WIDTH TO HAVE LANDED. `useRailWidth` re-renders on a resize
  // event, and `toHaveCount(0)` is satisfied instantly by a page that is still
  // rendering the desk — so this assertion passed against the broken version
  // until the tab bar was made to prove the narrow layout is on screen.
  await expect(page.locator("ion-tab-bar")).toBeVisible();
  await expect(page.getByTestId("queue-error")).toBeVisible();
  await expect(page.getByTestId("queue-search-toggle")).toHaveCount(0);
  await expect(page.getByTestId("queue-search")).toHaveCount(0);
  // The one control that IS still live is the way out.
  await expect(page.getByTestId("queue-error").getByRole("button", { name: "Try again" }))
    .toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });

  // 5. AND A FAILURE OFFERS THE RETRY, which really refetches.
  await page.unroute(QUEUE_URL);
  await page.route(QUEUE_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.reload();
  await expect(page.getByTestId("queue-error")).toContainText("The queue did not load.");
  await page.unroute(QUEUE_URL);
  await page.getByTestId("queue-error").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("queue-error")).toHaveCount(0);
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();
});

test("a row opens its project, and the destination stays lit", async ({ page }) => {
  // The record routes nest UNDER `/projects` for exactly this: Ionic computes
  // the selected tab by segment-prefix match and `isDestinationActive()` mirrors
  // it, so a flat `/record/...` would leave the bar and the rail dark for most
  // of the working day.
  await page.goto(PROJECTS);
  const rail = page.getByRole("link", { name: "Projects" });
  await expect(rail).toHaveAttribute("aria-current", "page");

  await page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" }).click();
  await expect(page.getByTestId("record-identity")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/ops2/projects/p_submitted");
  await expect(rail).toHaveAttribute("aria-current", "page");

  // Back NAMES ITS DESTINATION — the settled rule — and the destination from a
  // record is the list. Identified, not counted: the battery shares one D1.
  await page.getByRole("button", { name: "Projects" }).click();
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();

  // And the address survives a cold load, which is the property path routing
  // buys and hash routing does not.
  const deep = await page.goto(`${OPS2}/projects/p_submitted`);
  expect(deep?.status()).toBe(200);
  await expect(page.getByTestId("record-identity")).toBeVisible();
});

test("no rendered corner on this surface exceeds the owner's 5px cap, in either mode", async ({ page }) => {
  // The same backstop scripts/tests/web/ops2.spec.ts applies to the shell,
  // pointed at the surface that adds the components: ion-searchbar, ion-badge,
  // ion-checkbox, ion-skeleton-text and — the widest of them — ion-modal, which
  // is why the filter sheet is OPEN while this measures.
  //
  // BOTH MODES, because Ionic ships radii per platform and picks at runtime.
  // Chromium gets Material, so a Material-only check would pass while the
  // iPhone — the device the owner actually judged this on — rendered wider.
  for (const mode of ["md", "ios"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PROJECTS}?ionic:mode=${mode}`);
    await expect(page.getByTestId("queue-row").first()).toBeVisible();
    await page.getByTestId("queue-funnel").click();
    await expect(page.getByTestId("queue-filter-sheet").getByText("Filters", { exact: true })).toBeVisible();
    // WITH A REFINEMENT ON, so the funnel's count bubble is one of the corners
    // measured. It was not, and the gap was invisible: the bubble only exists
    // while a filter is active, so a sweep that ran before activating one was
    // reporting on a page the badge had never been part of. `../../theme/
    // ionic.css` records the decision it broke — the bubble is deliberately NOT
    // exempted as a pill, because the exemption is for a shape that is
    // genuinely a dot and this one reads perfectly well as a rounded square.
    await page.getByTestId("queue-refinement").nth(2).click();
    await expect(page.getByTestId("queue-funnel-count")).toBeVisible();

    const worst = await page.evaluate(() =>
      [...document.querySelectorAll("*")]
        .flatMap((el) => {
          const s = getComputedStyle(el);
          return [
            s.borderTopLeftRadius, s.borderTopRightRadius,
            s.borderBottomLeftRadius, s.borderBottomRightRadius,
          ].map((value) => ({ tag: el.tagName.toLowerCase(), px: parseFloat(value) }));
        })
        .filter(({ px }) => Number.isFinite(px))
        .sort((a, b) => b.px - a.px)[0]);
    expect(worst.px, `${mode}: widest corner is on <${worst.tag}>`).toBeLessThanOrEqual(5);
  }
});

test("the record's back control is not under the band that follows it", async ({ page }) => {
  // THE BAND IS PULLED UP BY ITS OWN TOP INSET so the white runs under the
  // status bar — and on a record page the back control is rendered BEFORE it,
  // so the later-painted band was dragged over the top of it. Not merely
  // hidden: it intercepts the press as well, on the one control a person on a
  // phone reaches for without looking.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PROJECTS);
  await expect(page.locator("ion-tab-bar")).toBeVisible();
  await page.getByTestId("queue-row").first().click();
  await expect(page).toHaveURL(/\/ops2\/projects\/.+/);

  // The tab bar also has a "Projects" button; this one is the page's.
  // Wait for the page transition to SETTLE. Ionic animates the record in, and a
  // box measured mid-slide is a box the page is not at yet — which reads as the
  // control being covered when it is only still moving.
  await expect(page.getByTestId("record-identity")).toBeVisible();
  const back = page.locator(".ops2-page__back");
  await expect(back).toBeVisible();
  await page.waitForTimeout(600);
  // WHAT IS ACTUALLY ON TOP AT ITS CENTRE. `toBeVisible` is satisfied by an
  // element another element is painted over, which is the whole failure.
  const box = (await back.boundingBox())!;
  const covering = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName.toLowerCase()}.${el.className}` : "nothing";
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(covering, "something is painted over the back control").toContain("ops2-page__back");

  // And it works: the press reaches it and returns to the queue.
  await back.click();
  await expect(page).toHaveURL(/\/ops2\/projects$/);
});

test("a modified click on a project opens it beside, not instead", async ({ page, context }) => {
  // The wide row carries a REAL anchor precisely so two projects can be open at
  // once at a desk. The first build then called `preventDefault()` on every
  // click, including Ctrl/Cmd/Shift ones, which took the affordance away again
  // while leaving it looking present — a control that is there and does not do
  // the thing it is there for.
  await page.goto(PROJECTS);
  const link = page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" }).locator("a.pq-open");
  await expect(link).toHaveAttribute("href", "/ops2/projects/p_submitted");

  const opened = context.waitForEvent("page");
  await link.click({ modifiers: ["ControlOrMeta"] });
  const second = await opened;
  await second.waitForLoadState();
  expect(new URL(second.url()).pathname).toBe("/ops2/projects/p_submitted");
  await expect(second.getByTestId("record-identity")).toBeVisible();
  await second.close();

  // And the tab it was opened FROM did not move.
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();

  // ANYWHERE THE ROW SAYS IT IS CLICKABLE. The whole row carries a pointer
  // cursor and an ordinary click on any cell opens the record, so a modified
  // click on the Stage or Total cell has to mean the same thing there. It used
  // to mean nothing at all — the guard returned, and the affordance the cursor
  // advertised silently failed everywhere except inside the first cell.
  const stage = page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" }).locator("td.pq-stage");
  const alsoOpened = context.waitForEvent("page");
  await stage.click({ modifiers: ["ControlOrMeta"] });
  const third = await alsoOpened;
  await third.waitForLoadState();
  expect(new URL(third.url()).pathname).toBe("/ops2/projects/p_submitted");
  await third.close();
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");
});

test("a search survives the change point instead of hiding behind an icon", async ({ page }) => {
  // At the desk the field is permanent; on the phone it is revealed. A search
  // typed at one width and carried across the change point was left filtering
  // the list from behind a search ICON — rows missing, no field, no clear, and
  // nothing on screen saying why. A Fold is opened and closed mid-task, so this
  // is a real width transition and not a resize-handle curiosity.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PROJECTS);
  await page.getByTestId("queue-search").locator("input").fill("Northcote");
  await expect(page.getByText("Northcote extension")).toBeVisible();
  await expect(page.getByText("Fitzroy townhouses")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("queue-search")).toBeVisible();
  await expect(page.getByTestId("queue-search").locator("input")).toHaveValue("Northcote");
  await expect(page.getByTestId("queue-search-cancel")).toBeVisible();
  await expect(page.getByText("Northcote extension")).toBeVisible();
  await expect(page.getByText("Fitzroy townhouses")).toHaveCount(0);
});

test("coming back to the queue re-reads it, rather than showing what was there", async ({ page }) => {
  // Ionic's router outlet KEEPS a page mounted in its view stack, so a mount
  // effect runs once per session and never again. The queue would then be as
  // old as the last time the console was reloaded — on the one surface whose
  // entire purpose is telling you what changed while you were not looking, and
  // whose governing constraint is that a delayed glance costs a working day.
  let served = 0;
  await page.route(QUEUE_URL, (route) => {
    served += 1;
    return route.fulfill({ json: { projects: [
      fixtureRow({ id: "p_first", ref: "OF-Q-1", title: served === 1 ? "Before" : "After" }),
    ] } });
  });

  await page.goto(PROJECTS);
  await expect(page.getByText("Before")).toBeVisible();

  await page.getByTestId("queue-row").first().click();
  // THE URL, not the record's content: this project's own fetch is not stubbed
  // here, so the record legitimately reports it cannot find it. What the test is
  // about is leaving the queue and coming back, and the address is the honest
  // proof of that. The old assertion matched the record's LOADING title, so it
  // passed on a 404 without anyone noticing what it was really watching.
  await expect(page).toHaveURL(/\/ops2\/projects\/p_first$/);

  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByText("After")).toBeVisible();
  expect(served, "the queue was read again on the way back in").toBeGreaterThan(1);
});

test("back from a record pops the queue rather than stacking another copy of it", async ({ page }) => {
  // `< Projects` used to PUSH `/projects`, so the history read
  // queue → record → queue. Browser Back from the queue then reopened the record
  // you had just left, and every trip through a record grew the stack by two.
  // On a phone that is the hardware Back button, which is the one control a
  // person presses without looking.
  await page.goto(PROJECTS);
  await expect(page.getByTestId("queue-row").first()).toBeVisible();

  await page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" }).click();
  await expect(page.getByTestId("record-identity")).toBeVisible();

  await page.getByRole("button", { name: "Projects" }).click();
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");

  await page.goBack();
  await expect(page.getByTestId("record-identity")).toHaveCount(0);
  expect(new URL(page.url()).pathname, "back re-entered the record it had just left").not.toBe("/ops2/projects/p_submitted");

  // AND A COLD DEEP LINK STILL HAS A WAY OUT. There is nothing to pop into when
  // the record is the first page of the session, so the control falls back to
  // naming its destination — which is the whole reason it says "Projects".
  await page.goto(`${OPS2}/projects/p_submitted`);
  await page.getByRole("button", { name: "Projects" }).click();
  // SCOPED TO A ROW. Ionic keeps the queue page mounted in its view stack and
  // the record shows the project's title too, so a bare text match finds both.
  await expect(page.getByTestId("queue-row").filter({ hasText: "Fitzroy townhouses" })).toBeVisible();
});

test("revealing search takes the focus with it, and cancelling gives it back", async ({ page }) => {
  // Tapping Search unmounts the control that was focused and mounts a field in
  // its place. Without moving focus, a keyboard user is dropped at the top of
  // the document and a phone gets no keyboard after a deliberate tap on a
  // search icon — which reads as the control not working.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PROJECTS);
  await expect(page.getByTestId("queue-row").first()).toBeVisible();

  await page.getByTestId("queue-search-toggle").click();
  await expect(page.getByTestId("queue-search")).toBeVisible();
  await expect(page.locator("ion-searchbar input")).toBeFocused();

  // Typed straight in, with no second tap — which is the point of the focus.
  await page.keyboard.type("Northcote");
  await expect(page.getByText("Northcote extension")).toBeVisible();
  await expect(page.getByText("Fitzroy townhouses")).toHaveCount(0);

  await page.getByTestId("queue-search-cancel").click();
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  // Focus comes back to the control it left from, rather than to the document.
  await expect(page.getByTestId("queue-search-toggle")).toBeFocused();
});
