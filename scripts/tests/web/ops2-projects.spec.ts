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
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
  await expect(page.getByText("Northcote extension")).toBeVisible();
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
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
  expect((await head.boundingBox())!.height).toBe(before!.height);
});

test("the attention strip is the desk's, and the phone goes straight to the work", async ({ page }) => {
  // THE OWNER'S DRAWING, and its absence on the phone is the specification
  // rather than an omission: his phone drawing goes title → chips → cards with
  // nothing between them, and the strip had been carried over from the DESKTOP
  // drawing by assumption. At 390 it is the first two hundred pixels of a
  // screen whose entire value is how much of the LIST you can see before
  // scrolling.
  //
  // Both halves are asserted. A `wide &&` written without its else is how both
  // the status row and the totals panel came to render nowhere at desktop
  // width (`OPEN-DEFECTS.md` D5), and a test that only checks the phone would
  // pass just as happily if the strip had been deleted outright.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(PROJECTS);
  await expect(page.getByTestId("queue-row").first()).toBeVisible();
  await expect(page.getByTestId("queue-attention")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("queue-attention")).toHaveCount(0);

  // And nothing of the strip's is lost with it — every number it carried is
  // still reachable, three through the chips and `Ready to issue` through the
  // funnel. The chips are what sits under the title now.
  await expect(page.getByTestId("queue-chip")).toHaveCount(3);
  const title = await page.locator(".ops2-page__head").boundingBox();
  const chips = await page.locator(".pq-chips").boundingBox();
  expect(chips!.y - (title!.y + title!.height), "the gap the strip used to fill")
    .toBeLessThan(40);
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
  await expect(refinements).toHaveCount(3);
  await expect(sheet.getByText("Ready to issue")).toBeVisible();
  await expect(sheet.getByText("Unresolved lines")).toBeVisible();
  // The fourth quick filter the mock argued for, demoted rather than deleted —
  // "what you hunt for when a customer rings about work already underway".
  await expect(sheet.getByText("In production")).toBeVisible();

  // Each states its effect BEFORE it is chosen: one of the two is in
  // production, so nothing here is ticked blind.
  await expect(sheet.getByTestId("queue-refinement-count").nth(2)).toHaveText("1");

  await refinements.nth(2).click();
  await page.getByRole("button", { name: "Done" }).click();

  // The bubble now says how many are on, and the strip above the list says WHICH
  // — a count alone still leaves a reader guessing which row went missing.
  await expect(page.getByTestId("queue-funnel-count")).toHaveText("1");
  await expect(page.getByTestId("queue-active-filters")).toContainText("In production");
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByText("Underway")).toBeVisible();

  // And one way to clear the lot.
  await page.getByTestId("queue-active-filters").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByTestId("queue-funnel-count")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
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

  // The edge is a real rendered edge, per row, and it distinguishes. Read from
  // inside the shadow root because that is where `ion-item` puts the element
  // `::part(native)` names, and `getComputedStyle` on the host would report the
  // host's own (absent) shadow instead.
  const shadows = await rows.evaluateAll((els) => els.map((el) => {
    const native = (el as HTMLElement).shadowRoot?.querySelector(".item-native");
    return native ? getComputedStyle(native).boxShadow : "";
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

  // 5. AND A FAILURE OFFERS THE RETRY, which really refetches.
  await page.unroute(QUEUE_URL);
  await page.route(QUEUE_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.reload();
  await expect(page.getByTestId("queue-error")).toContainText("The queue did not load.");
  await page.unroute(QUEUE_URL);
  await page.getByTestId("queue-error").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("queue-error")).toHaveCount(0);
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Project record", level: 1 })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/ops2/projects/p_submitted");
  await expect(rail).toHaveAttribute("aria-current", "page");

  // Back NAMES ITS DESTINATION — the settled rule — and the destination from a
  // record is the list. Identified, not counted: the battery shares one D1.
  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();

  // And the address survives a cold load, which is the property path routing
  // buys and hash routing does not.
  const deep = await page.goto(`${OPS2}/projects/p_submitted`);
  expect(deep?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Project record", level: 1 })).toBeVisible();
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
  await expect(second.getByRole("heading", { name: "Project record", level: 1 })).toBeVisible();
  await second.close();

  // And the tab it was opened FROM did not move.
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Project record", level: 1 })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Project record", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/ops2/projects");

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Project record", level: 1 })).toHaveCount(0);
  expect(new URL(page.url()).pathname, "back re-entered the record it had just left").not.toBe("/ops2/projects/p_submitted");

  // AND A COLD DEEP LINK STILL HAS A WAY OUT. There is nothing to pop into when
  // the record is the first page of the session, so the control falls back to
  // naming its destination — which is the whole reason it says "Projects".
  await page.goto(`${OPS2}/projects/p_submitted`);
  await page.getByRole("button", { name: "Projects" }).click();
  await expect(page.getByText("Fitzroy townhouses")).toBeVisible();
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
