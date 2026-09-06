import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const ATTENTION = `${OPS2}/attention`;

const seedSql = readFileSync(join(process.cwd(), "scripts", "db", "seed.sql"), "utf8");
const STAFF_EMAIL = (() => {
  const row = seedSql.split("\n").find((l) => l.includes("'u_staff7'") && l.includes("@"));
  const email = row?.match(/'([^']+@[^']+)'/)?.[1];
  if (!email) throw new Error("seed.sql: no email for u_staff7");
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
  expect(ok, "staff sign-in").toBeNull();
  staffCookies = await context.cookies();
  await context.close();
});

test.beforeEach(async ({ context }) => {
  await context.addCookies(staffCookies);
});

// The seed can't produce this shape (fixed lifecycle counts across every
// bucket) — stubbed per design §1's endpoint contract: all 8 keys, numbers,
// no `degraded`. Only 6 are consumed (attention.ts), but the stub matches the
// real endpoint's shape regardless.
const SUMMARY_URL = (url: URL) => url.pathname === "/api/ops/summary";
const SUMMARY_STUB = {
  submissions: 4,
  inReview: 2,
  activeOrders: 0,
  awaitingPayment: 3,
  customers: 0,
  readyToIssue: 1,
  newEnquiries: 2,
  tradeApplications: 1,
};

// /api/ops/projects — the queue endpoint AttentionPage now also reads (via
// useProjectQueue) to derive the four project counts and, downstream, the
// exact set each row's press opens. PA-PF is the shared fixture from
// docs/runs/ops2-attention-prefilter/02-design.md §5 (mirrored in
// scripts/tests/ops2-attention.test.mjs's `row()`/PA_PF): counts 1/2/1/2,
// non-empty, pairwise non-identical, PF matches no predicate at all.
const QUEUE_URL = (url: URL) => url.pathname === "/api/ops/projects";

const fixtureRow = (over: Record<string, unknown>) => ({
  id: "p_x", ref: "OF-Q-19999", title: "A project", customerName: "A customer",
  org: null, lineCount: 4, value: 1000, valueBasis: "est.", unresolved: 0, issuable: false,
  waitingOn: "Us", daysInStage: 1, phase: "Pricing", stateLabel: "Pricing", orderNo: null,
  statusCustomer: "", orderStage: null, updatedAt: "2026-08-20 00:00:00", ...over,
});

const PA_PF = [
  fixtureRow({ id: "p_pa", ref: "PA", title: "PA", statusCustomer: "submitted" }),
  fixtureRow({ id: "p_pb", ref: "PB", title: "PB", statusCustomer: "under_review" }),
  fixtureRow({ id: "p_pc", ref: "PC", title: "PC", statusCustomer: "under_review", issuable: true }),
  fixtureRow({ id: "p_pd", ref: "PD", title: "PD", statusCustomer: "accepted", orderStage: "deposit_invoiced" }),
  fixtureRow({ id: "p_pe", ref: "PE", title: "PE", statusCustomer: "accepted", orderStage: "balance_invoiced" }),
  fixtureRow({ id: "p_pf", ref: "PF", title: "PF", statusCustomer: "accepted", orderStage: "manufacturing" }),
];
const ALL_REFS = PA_PF.map((r) => r.ref);

test("groups render with the endpoint's numbers and expose no mutating control", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();

  const projects = page.getByTestId("attention-projects");
  const enquiries = page.getByTestId("attention-enquiries");
  const customers = page.getByTestId("attention-customers");

  // Counts come from PA-PF via selectProjects(rows, attentionQuery(key)) —
  // 1/2/1/2 — not SUMMARY_STUB's stale legacy fields above (4/2/1/3).
  await expect(projects.getByTestId("attention-row-submissions")).toHaveText("1 new submission");
  await expect(projects.getByTestId("attention-row-inReview")).toHaveText("2 being priced");
  await expect(projects.getByTestId("attention-row-readyToIssue")).toHaveText("1 ready to issue");
  await expect(projects.getByTestId("attention-row-awaitingPayment")).toHaveText("2 awaiting payment");
  await expect(enquiries.getByTestId("attention-row-newEnquiries")).toHaveText("2 waiting for a reply");
  await expect(customers.getByTestId("attention-row-tradeApplications")).toHaveText(
    "1 trade application waiting on a decision",
  );

  // Every row is exactly one control, and it is a LINK — RowList/Row's press
  // element is the only control a row carries, and every attention row
  // navigates. No checkbox, no secondary action, and no button either.
  await expect(projects.getByRole("link")).toHaveCount(4);
  await expect(enquiries.getByRole("link")).toHaveCount(1);
  await expect(customers.getByRole("link")).toHaveCount(1);
  await expect(projects.getByRole("button")).toHaveCount(0);
});

test("project row counts come from the rows fixture, never the summary's stale project fields", async ({ page }) => {
  // Same PA-PF fixture (1/2/1/2), but the summary's legacy project-count
  // fields are set to a value PA-PF cannot produce — 999 — so a rendered 999
  // anywhere would prove the page fell back to reading the summary instead of
  // selectProjects(rows, attentionQuery(key)).
  await page.route(SUMMARY_URL, (route) => route.fulfill({
    json: { ...SUMMARY_STUB, submissions: 999, inReview: 999, readyToIssue: 999, awaitingPayment: 999 },
  }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("attention-row-submissions")).toHaveText("1 new submission");
  await expect(page.getByTestId("attention-row-inReview")).toHaveText("2 being priced");
  await expect(page.getByTestId("attention-row-readyToIssue")).toHaveText("1 ready to issue");
  await expect(page.getByTestId("attention-row-awaitingPayment")).toHaveText("2 awaiting payment");
  await expect(page.getByText("999", { exact: true })).toHaveCount(0);
});

// Criterion: pressing each of the four project rows lands on /ops2/projects
// listing EXACTLY that predicate's PA-PF refs — the other rows' exclusive
// projects absent. Asserted on the listed row text, never chip state: chips
// are an unrelated control the queue still owns (t4), and asserting them here
// would pass even if the Attention→Projects wiring were deleted.
const NARROWING_CASES: { key: string; expected: string[] }[] = [
  { key: "submissions", expected: ["PA"] },
  { key: "inReview", expected: ["PB", "PC"] },
  { key: "readyToIssue", expected: ["PC"] },
  { key: "awaitingPayment", expected: ["PD", "PE"] },
];

for (const { key, expected } of NARROWING_CASES) {
  test(`the ${key} row lands on /projects listing exactly its predicate's fixture refs`, async ({ page }) => {
    await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
    await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
    await page.goto(ATTENTION);

    await page.getByTestId(`attention-row-${key}`).click();
    await expect(page).toHaveURL(`${OPS2}/projects`); // ?attn= consumed and stripped (t4)
    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();

    const rows = page.getByTestId("queue-row");
    await expect(rows).toHaveCount(expected.length);
    for (const ref of expected) {
      await expect(rows.filter({ hasText: ref })).toBeVisible();
    }
    for (const ref of ALL_REFS.filter((r) => !expected.includes(r))) {
      await expect(rows.filter({ hasText: ref })).toHaveCount(0);
    }
  });
}

// Criterion 11, on the path a reader actually takes. `ops2-projects.spec.ts`
// covers the reset after a page.goto arrival — a full document load, a
// different lifecycle — and that one passes. The prefilter applied by CLICKING
// an Attention row survives a later rail navigation instead: the one-shot
// `justAppliedAttnRef` set when the param is consumed is only cleared by the
// NEXT `ionViewWillEnter`, and on a fast hop the arrival's own lifecycle event
// does not arrive before the reader leaves, so the flag is still set when the
// re-entry reads it and the reset it was meant to skip once is skipped for
// good. Written red by the tester (06-verify.md F4).
test("a prefilter applied by pressing a row is reset by later rail navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-submissions").click();
  await expect(page.getByTestId("queue-row")).toHaveCount(1);
  await expect(page.getByTestId("queue-active-filters")).toContainText("New submissions");

  await page.locator('.ops2-nav__item[href$="/products"]').click();
  await page.locator('.ops2-nav__item[href$="/projects"]').click();
  await expect(page.getByTestId("queue-active-filters")).toHaveCount(0);
  await expect(page.getByTestId("queue-row")).toHaveCount(ALL_REFS.length);
});

test("submissions row goes to /projects", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-submissions").click();
  await expect(page).toHaveURL(`${OPS2}/projects`);
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
});

test("a fixture change between visits moves both the count and the list it opens", async ({ page }) => {
  // Call 1 (initial mount) answers with only PA (submissions: 1). Leaving and
  // returning re-fetches the queue (design §4.2) — call 2 onward answers with
  // a different pair of refs, proving the number on Attention and the list
  // Projects opens both track the SAME re-fetched fixture, not a cached one.
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  let calls = 0;
  await page.route(QUEUE_URL, (route) => {
    calls += 1;
    const projects = calls === 1
      ? [fixtureRow({ id: "p_pa", ref: "PA", title: "PA", statusCustomer: "submitted" })]
      : [
          fixtureRow({ id: "p_pg", ref: "PG", title: "PG", statusCustomer: "submitted" }),
          fixtureRow({ id: "p_ph", ref: "PH", title: "PH", statusCustomer: "submitted" }),
        ];
    return route.fulfill({ json: { projects } });
  });

  await page.goto(ATTENTION);
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("1 new submission");

  await page.getByRole("link", { name: "Products" }).click();
  await expect(page).toHaveURL(`${OPS2}/products`);
  await page.getByRole("link", { name: "Attention" }).click();
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("2 new submissions");

  await page.getByTestId("attention-row-submissions").click();
  await expect(page).toHaveURL(`${OPS2}/projects`);
  const rows = page.getByTestId("queue-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "PG" })).toBeVisible();
  await expect(rows.filter({ hasText: "PH" })).toBeVisible();
  await expect(rows.filter({ hasText: "PA" })).toHaveCount(0);
});

test("a fixture with no row matching a predicate draws no row for it", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({
    json: { projects: [fixtureRow({ id: "p_pa", ref: "PA", title: "PA", statusCustomer: "submitted" })] },
  }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("attention-row-submissions")).toHaveText("1 new submission");
  await expect(page.getByTestId("attention-row-inReview")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-readyToIssue")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-awaitingPayment")).toHaveCount(0);
});

test("enquiries row goes to the /enquiries placeholder root", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-newEnquiries").click();
  await expect(page).toHaveURL(`${OPS2}/enquiries`);
  await expect(page.getByRole("heading", { name: "Enquiries", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing is built here yet.")).toBeVisible();
});

test("an attention row is a link, and a modified click opens the destination beside, not instead", async ({ page, context }) => {
  // A row that GOES somewhere is a link. Rendered as a bare <button> it kept
  // its look and lost middle-click, Ctrl/Cmd-click, "copy link address" and the
  // link role — the same affordance the Projects queue's wide row carries, and
  // for the same desk reason: two things open at once.
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  const link = page.getByTestId("attention-row-awaitingPayment");
  await expect(link).toHaveAttribute("href", "/ops2/projects?attn=awaitingPayment");

  const opened = context.waitForEvent("page");
  await link.click({ modifiers: ["ControlOrMeta"] });
  const second = await opened;
  await second.waitForLoadState();
  expect(new URL(second.url()).pathname).toBe("/ops2/projects");
  await expect(second.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await second.close();

  // And the tab it was opened FROM did not move.
  expect(new URL(page.url()).pathname).toBe("/ops2/attention");
  await expect(page.getByTestId("attention-row-awaitingPayment")).toBeVisible();
});

test("summary ok but the queue 500s draws attention-error, not a half-ready page", async ({ page }) => {
  // combineLoads precedence: only `summary` can be "unauthorised"; a queue
  // failure with a healthy summary still folds into "error" (criterion 15) —
  // the whole page fails rather than rendering enquiries/customers alone.
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(ATTENTION);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
});

test("trade applications row goes to /customers", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  await page.getByTestId("attention-row-tradeApplications").click();
  await expect(page).toHaveURL(`${OPS2}/customers`);
  await expect(page.getByRole("heading", { name: "Customers", level: 1 })).toBeVisible();
});

test("a degraded summary renders the error panel with a retry, not zero rows disguised as ready", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: { degraded: true } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("Can't tell you what's waiting.");
  await expect(error).toContainText(
    "The counts didn't load, so none are shown. This is not an empty console",
  );
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  // ZERO counts: no row, no group, no empty-state — the error panel is the
  // only thing on the page, so a degraded read can't be mistaken for a quiet day.
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
  await expect(page.getByTestId("attention-empty")).toHaveCount(0);
});

test("a 500 renders the same error panel and copy — no raw HTTP status leaked, and zero rows", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveAttribute("role", "alert");
  await expect(error).toContainText("Can't tell you what's waiting.");
  await expect(error).toContainText(
    "The counts didn't load, so none are shown. This is not an empty console",
  );
  await expect(error).not.toContainText("500");
  await expect(error.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
});

test("retry after unrouting a failed summary recovers to ready", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));
  await page.goto(ATTENTION);
  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();

  // Unroute BEFORE retrying so the click's fetch hits the real, working stub.
  await page.unroute(SUMMARY_URL);
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await error.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByTestId("attention-error")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("1 new submission");
});

test("the skeleton shows before the summary response resolves", async ({ page }) => {
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route(SUMMARY_URL, async (route) => {
    await held;
    await route.fulfill({ json: SUMMARY_STUB });
  });
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));

  const loading = page.goto(ATTENTION);
  await expect(page.getByTestId("attention-skeleton")).toBeVisible();
  await expect(page.getByTestId("attention-row-submissions")).toHaveCount(0);

  release();
  await loading;
  await expect(page.getByTestId("attention-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-submissions")).toHaveText("1 new submission");
});

test("leaving and returning re-fetches, and a slow reply to a superseded request never overwrites a newer one", async ({ page }) => {
  // Call 1: initial mount, held open — it becomes the stale request. Call 2:
  // one leave-and-return (the re-fetch this test also proves), resolves at
  // once with a different count. If useSummary's `live` guard is broken,
  // releasing call 1 below — after call 2 has already rendered — stomps
  // call 2's count back to the stale value.
  //
  // Raced on `newEnquiries`, not `submissions`: project counts moved to the
  // queue selector (t3) and `submissions` is no longer read off the summary
  // body at all, so racing it here would prove nothing.
  let release1 = () => {};
  const held1 = new Promise<void>((r) => { release1 = r; });
  let calls = 0;
  await page.route(SUMMARY_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      await held1;
      return route.fulfill({ json: { ...SUMMARY_STUB, newEnquiries: 999 } });
    }
    return route.fulfill({ json: { ...SUMMARY_STUB, newEnquiries: 7 } });
  });
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));

  const loading = page.goto(ATTENTION);
  await expect(page.getByTestId("attention-skeleton")).toBeVisible(); // call 1, held

  const attentionLink = page.getByRole("link", { name: "Attention" });
  const productsLink = page.getByRole("link", { name: "Products" });

  await productsLink.click();
  await expect(page).toHaveURL(`${OPS2}/products`);
  await attentionLink.click();
  await expect(page.getByTestId("attention-row-newEnquiries")).toHaveText("7 waiting for a reply"); // call 2

  release1();
  await loading;
  await page.waitForTimeout(200); // give the stale call 1 reply a chance to land, if it's going to
  await expect(page.getByTestId("attention-row-newEnquiries")).toHaveText("7 waiting for a reply");
});

test("re-entering an already-loaded page never shows the skeleton (design §4.2)", async ({ page }) => {
  // Call 1 resolves immediately (first load). Call 2 (the re-fetch on
  // return) is held open, so the assertion below happens while it is still
  // in flight — the previous answer must stay on screen, not the skeleton.
  // Raced on `newEnquiries` for the same reason as above.
  let release2 = () => {};
  const held2 = new Promise<void>((r) => { release2 = r; });
  let calls = 0;
  await page.route(SUMMARY_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({ json: SUMMARY_STUB });
    }
    await held2;
    return route.fulfill({ json: { ...SUMMARY_STUB, newEnquiries: 9 } });
  });
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: PA_PF } }));

  await page.goto(ATTENTION);
  await expect(page.getByTestId("attention-row-newEnquiries")).toHaveText("2 waiting for a reply");

  const attentionLink = page.getByRole("link", { name: "Attention" });
  const productsLink = page.getByRole("link", { name: "Products" });

  await productsLink.click();
  await expect(page).toHaveURL(`${OPS2}/products`);
  await attentionLink.click();

  await expect(page.getByTestId("attention-skeleton")).toHaveCount(0);
  await expect(page.getByTestId("attention-row-newEnquiries")).toHaveText("2 waiting for a reply");

  release2();
  await expect(page.getByTestId("attention-row-newEnquiries")).toHaveText("9 waiting for a reply");
});

test("a signed-in customer (non-staff) loading /attention gets the unauthorised treatment, not zero counts", async ({ browser }) => {
  // Real /api/ops/summary, no stub — proves the actual server-side role check
  // (401/403), not a fabricated one. Own context, goto(OPS2) BEFORE logging
  // in: the session cookie is host-only (no Domain attribute — worker/lib/
  // auth.ts's sessionCookie), so the login fetch must be same-origin with
  // ops.localhost or the cookie never reaches the later goto(ATTENTION).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const email = `attn-customer-${Date.now().toString(36)}@example.com`;
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, email);
  expect(ok, "customer sign-in").toBeNull();

  const summaryResponse = page.waitForResponse((res) => res.url().includes("/api/ops/summary"));
  await page.goto(ATTENTION);
  expect((await summaryResponse).status(), "summary response status — 403 forbidden, not 401 anonymous").toBe(403);

  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/This account can't see what's waiting\./);
  // NAMES WHAT ATTENTION ACTUALLY SPANS, in CONTEXT.md's own actor word.
  // The copy was cribbed from useProjectQueue and still said "Projects" (one
  // of the three destinations this page summarises) and "an administrator",
  // which is not a role this product has — the axis is Staff.
  await expect(error).toHaveText(/Projects, Enquiries and Customers are staff-only\./);
  await expect(error).toHaveText(/Ask OpenFrame Staff/);
  await expect(error).not.toHaveText(/administrator/i);
  await expect(page.locator('[data-testid^="attention-row-"]')).toHaveCount(0);
  await context.close();
});

// Monitoring (T5) — second, independent request. SUMMARY_URL stubbed too so
// the page's primary section resolves and stays out of the way.
const MONITORING_URL = (url: URL) => url.pathname === "/api/ops/monitoring";
// Relative to test-run time, not hard-pinned (F2, 06-verify.md): a fixed past
// timestamp eventually crosses the 30-minute stale threshold on its own and
// fails on a clock, not on a real regression.
const FRESH_TAKEN_AT = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const READY_SNAPSHOT = {
  takenAt: FRESH_TAKEN_AT,
  // Balance and budget are independently available: a cap we cannot read must
  // not blank a credit balance that arrived perfectly well.
  money: {
    balance: { available: true, creditBalanceUsd: 12.34 },
    budget: { available: true, billedSpendUsd: 40, capUsd: 50, capSource: "gateway", windowDays: 30 },
  },
  success7d: 20,
  error7d: 3,
  // red/floorUsd/ceilingPct: server merges these into the snapshot itself
  // (worker/lib/monitoring.ts monitoringPayload, commit 5d07807a) — useMonitoring.ts
  // requires all three on the snapshot object or it falls into "error" status.
  redBalance: false,
  redCap: false,
  floorUsd: 5,
  days: [
    { day: "2026-08-30", success: 2, error: 0 },
    { day: "2026-08-31", success: 3, error: 1 },
    { day: "2026-09-01", success: 0, error: 0 },
    { day: "2026-09-02", success: 4, error: 0 },
    { day: "2026-09-03", success: 3, error: 1 },
    { day: "2026-09-04", success: 5, error: 0 },
    { day: "2026-09-05", success: 3, error: 1 },
  ],
};

test("monitoring: ready snapshot renders cards, as-at, and 7 chart columns", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: READY_SNAPSHOT, notificationCount: 0 } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("monitoring-credit-balance")).toContainText("$12.34");
  await expect(page.getByTestId("monitoring-cap-outstanding")).toContainText("$10.00");
  await expect(page.getByTestId("monitoring-success-count")).toContainText("20");
  await expect(page.getByTestId("monitoring-error-count")).toContainText("3");
  await expect(page.getByTestId("monitoring-chart").locator(".att-col")).toHaveCount(7);
  await expect(page.getByText(/As at \d{2}:\d{2}/)).toBeVisible();
});

test("monitoring: money unavailable shows an unavailable state, not zero, while counts/chart still show D1 numbers", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, money: { balance: { available: false, reason: "token_missing" }, budget: { available: false, reason: "token_missing" } } }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  const credit = page.getByTestId("monitoring-credit-balance");
  await expect(credit).toContainText("Unavailable. No Cloudflare token configured");
  await expect(credit).not.toContainText("$0.00");
  await expect(page.getByTestId("monitoring-success-count")).toContainText("20");
});

test("monitoring: money unavailable with a missing/placeholder CF_ACCOUNT_ID says so distinctly from a missing token", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, money: { balance: { available: false, reason: "account_id_missing" }, budget: { available: false, reason: "account_id_missing" } } }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  const credit = page.getByTestId("monitoring-credit-balance");
  await expect(credit).toContainText("Unavailable. No Cloudflare account configured");
  await expect(credit).not.toContainText("No Cloudflare token configured");
  await expect(credit).not.toContainText("$0.00");
});

test("monitoring: an all-zero window renders an explicit empty chart state", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  const zeroDays = READY_SNAPSHOT.days.map((d) => ({ ...d, success: 0, error: 0 }));
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, success7d: 0, error7d: 0, days: zeroDays }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  // The approved mock (docs/mocks/ai-parse-monitoring.html §3, UX §5) keeps the
  // seven day labels under the sentence — the window being described stays on
  // screen — and draws no bars at all. A zero week is an answer, not a gap.
  await expect(page.getByTestId("monitoring-chart")).toContainText("Nothing parsed in the last 7 days");
  await expect(page.getByTestId("monitoring-chart").locator(".att-col")).toHaveCount(7);
  await expect(page.getByTestId("monitoring-chart").locator(".att-bar")).toHaveCount(0);
});

test("monitoring: no snapshot yet renders the empty state", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 0 } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("monitoring-empty")).toBeVisible();
  await expect(page.getByTestId("monitoring-credit-balance")).toHaveCount(0);
});

test("monitoring: a 500 shows the error panel with a retry button", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ status: 500, body: "" }));
  await page.goto(ATTENTION);

  const errorPanel = page.getByTestId("monitoring-error");
  await expect(errorPanel).toBeVisible();
  await expect(errorPanel.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("monitoring: stale snapshot renders the stale sentence and per-card as-at stamps", async ({ page }) => {
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  const staleTakenAt = new Date(Date.now() - 45 * 60 * 1000).toISOString();
  await page.route(MONITORING_URL, (route) => route.fulfill({
    json: { snapshot: { ...READY_SNAPSHOT, takenAt: staleTakenAt }, notificationCount: 0 },
  }));
  await page.goto(ATTENTION);

  await expect(page.locator(".att-asat")).toContainText("The 10-minute job may have stopped.");
  await expect(page.getByTestId("monitoring-credit-balance").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-success-count").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-error-count").locator(".att-card__stamp")).toBeVisible();
  await expect(page.getByTestId("monitoring-cap-outstanding").locator(".att-card__stamp")).toBeVisible();
});

const PROJECTS = `${OPS2}/projects`;
// QUEUE_URL is declared once at the top of this file — the prefilter tests
// needed it before the monitoring tests did, and two `const`s of the same name
// is a parse error rather than a redefinition.

test("bell: no badge when notificationCount is 0", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 0 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.goto(PROJECTS);

  const bell = page.locator(".ops2-bell");
  await expect(bell).toBeVisible();
  await expect(bell.locator(".ops2-bell__badge")).toHaveCount(0);
});

test("bell: badge reads 1 when notificationCount is 1", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 1 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.goto(PROJECTS);

  await expect(page.locator(".ops2-bell__badge")).toHaveText("1");
});

test("bell: clicking it lands on /attention", async ({ page }) => {
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: null, notificationCount: 1 } }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: [] } }));
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.goto(PROJECTS);

  await page.locator(".ops2-bell").click();
  await expect(page).toHaveURL(ATTENTION);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();
});

test("the unauthorised panel has no retry — pressing it would fail the same way (mock §3.5)", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(OPS2);
  const email = `attn-customer-noretry-${Date.now().toString(36)}@example.com`;
  const ok = await page.evaluate(async (email) => {
    const challenge = await fetch("/api/auth/challenge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const { devCode } = await challenge.json();
    if (!devCode) return "no dev code — is the Worker in dev mode?";
    const verified = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, code: devCode }),
    });
    return verified.ok ? null : `verify answered ${verified.status}`;
  }, email);
  expect(ok, "customer sign-in").toBeNull();

  await page.goto(ATTENTION);
  const error = page.getByTestId("attention-error");
  await expect(error).toBeVisible();
  await expect(error.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await context.close();
});

test("a row pressed from an already-mounted Projects still lists exactly its count", async ({ page }) => {
  // CODEX, HIGH. Every other test in this file starts on Attention, so Projects
  // mounts fresh and holds whatever the press produced. The real path is the
  // other way round: a reader is ON Projects, goes to Attention, and presses a
  // row. Projects is then already mounted holding OLDER rows, and — per the
  // measured behaviour behind F4 — its own refresh hook may not fire at all.
  // The count came from Attention's fetch; the list would come from a stale
  // snapshot, and the two can disagree with no state change in between.
  //
  // The stub answers with ONE submission first and SIX rows afterwards, so a
  // stale snapshot is visibly different from a fresh one: mount Projects on the
  // thin answer, then let Attention and the press see the full set.
  let call = 0;
  await page.route(QUEUE_URL, (route) => {
    call += 1;
    return route.fulfill({ json: { projects: call === 1 ? [PA_PF[0]] : PA_PF } });
  });
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));

  // Mount Projects FIRST — this is the whole point of the case.
  await page.goto(`${OPS2}/projects`);
  await expect(page.getByTestId("queue-row")).toHaveCount(1);

  await page.locator('.ops2-nav__item[href$="/attention"]').click();
  const row = page.getByTestId("attention-row-inReview");
  await expect(row).toContainText("2");

  await row.click();
  await expect(page).toHaveURL(`${OPS2}/projects`);
  // Two under_review rows in the full set (PB, PC). A stale one-row snapshot
  // cannot produce them, so this fails if the queue is not re-read.
  //
  // MEASURED when this was written: three queue fetches happen on this path —
  // the Projects mount, Attention's own, and Projects re-reading on the press.
  // Codex raised the stale-snapshot case as HIGH on the premise that Projects'
  // refresh may not fire here; it does. `ionViewWillEnter` fires on a PUSH
  // entry like this press, and it is the rail-back that does not (F4). The
  // test stays because the path was untested either way, and because it fails
  // the moment that third fetch stops happening.
  await expect(page.getByTestId("queue-row")).toHaveCount(2);
});

test("a projects payload with no statusCustomer shows failure, not an empty console", async ({ page }) => {
  // CODEX, MEDIUM. The endpoint dropping the field must not read as a clear day
  // — and must not white-screen either: `attentionGroups` refuses the payload,
  // so the page has to catch that and say it cannot tell.
  const stripped = PA_PF.map(({ statusCustomer, ...rest }) => rest);
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: { projects: stripped } }));
  await page.goto(ATTENTION);

  await expect(page.getByTestId("attention-error")).toBeVisible();
  await expect(page.getByTestId("attention-empty")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Attention", level: 1 })).toBeVisible();
});

// TESTER-F6 (round 5) — the desk bell earns its accessible name
// (`aria-label="Attention — 1 item"`), the phone tab does not: its badge span
// is aria-hidden, its icon is aria-hidden, and IonLabel carries only
// "Attention". On the phone the bell does not exist at all, so a screen-reader
// user on the surface where Attention is a permanent tab gets no signal that
// anything is waiting.
test("bubble: the phone attention tab announces its count to assistive tech, as the desk bell does", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(SUMMARY_URL, (route) => route.fulfill({ json: SUMMARY_STUB }));
  await page.route(MONITORING_URL, (route) => route.fulfill({ json: { snapshot: READY_SNAPSHOT, notificationCount: 1 } }));
  await page.goto(ATTENTION);

  // The badge is on screen — this is about what is ANNOUNCED, not what is drawn.
  await expect(page.locator(".ops2-tab-badge")).toHaveText("1");
  await expect(
    page.getByRole("tab", { name: /1/ }),
    "the attention tab's accessible name carries the count",
  ).toHaveCount(1);
});
