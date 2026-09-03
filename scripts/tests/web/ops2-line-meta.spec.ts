import { test, expect, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Metadata tab, in a browser — ops2-line-why.spec.ts's sibling and same
// rationale: `ops2-meta.test.mjs` proves the DTO/component logic at the node
// level, but the tab STRIP, the ROUTE, and the FLASH-FREE deep link are all
// client-only facts the Worker cannot distinguish (tester finding F1,
// docs/runs/ops2-parse-metadata/06-verify.md). Eight ACs rested only on
// source-text regexes against LinePage.tsx before this file existed — they
// would have passed even if MetaTab threw at runtime.
//
// THE RECORD, RATIONALE AND META ARE ALL MOCKED, same convention as
// ops2-line-why.spec.ts. The rationale route is 404'd uniformly: irrelevant
// to this feature, but `useLineRationale` fires unconditionally per line.
const OPS_HOST = "http://ops.localhost:8788";
const OPS2 = `${OPS_HOST}/ops2`;
const RECORD_URL = "**/api/ops/projects/p_rec";
const RATIONALE_URL = "**/api/ops/projects/p_rec/lines/*/rationale";
const META_URL = "**/api/ops/projects/p_rec/lines/*/meta";
const CROP_URL = "**/api/ops/projects/p_rec/lines/*/meta/crop";
const LINE = (id: string) => `${OPS2}/projects/p_rec/line/${id}`;

// Same identity and same reason as ops2-line-why.spec.ts: a shared mailbox
// across parallel spec files means whichever suite signs in second must not
// collide with RESEND_COOLDOWN_MS.
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
  lines: [line("l1", "W03")],
  delivery: { amount: 420, settled: true, estimate: 400 },
  actions: [],
  order: null,
};

// A populated DTO — non-empty Reading and Run summaries, so the crop-failure
// test (added later) can tell "the image panel failed" from "everything failed".
const META_DTO = {
  hasCrop: true,
  reading: {
    heading: { state: "value", value: "North" },
    elevation: { state: "value", value: "East" },
    room: { state: "value", value: "Bed 2" },
    split: { state: "not_stated", axis: null, units: [] },
    confidence: "high",
    flags: [],
    gapCode: null,
    reasoningParts: [],
    source: { fileId: "f1", filename: "plan.pdf", pageNo: 2, sheetRef: "A1", region: "10,10,50,50" },
  },
  run: { startedAt: "2026-08-01T00:00:00Z", outcome: "read", document: null },
};

// A 1x1 GIF — enough for the `<img>` to actually load in the happy-path tests.
const TINY_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

type ServeOpts = {
  metaDto?: unknown;
  metaHandler?: (route: Route) => Promise<void> | void;
  cropHandler?: (route: Route) => Promise<void> | void;
};

async function serve(page: Page, opts: ServeOpts = {}) {
  const calls = { record: 0, meta: 0, crop: 0, methods: [] as string[] };
  page.on("request", (r) => {
    if (r.url().includes("/api/")) calls.methods.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  await page.route(RECORD_URL, (route) => {
    calls.record += 1;
    return route.fulfill({ json: record });
  });
  await page.route(RATIONALE_URL, (route) => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.route(META_URL, async (route) => {
    calls.meta += 1;
    if (opts.metaHandler) { await opts.metaHandler(route); return; }
    await route.fulfill({ json: opts.metaDto ?? META_DTO });
  });
  await page.route(CROP_URL, async (route) => {
    calls.crop += 1;
    if (opts.cropHandler) { await opts.cropHandler(route); return; }
    await route.fulfill({ status: 200, contentType: "image/gif", body: TINY_GIF });
  });
  return calls;
}

test("MetaAC-9 the metadata tab renders three panels, image first, and the opening body is gone", async ({ page }) => {
  await serve(page);
  await page.goto(LINE("l1"));
  await expect(page.getByTestId("line-review")).toBeVisible();

  await page.locator('[data-testid="line-tab"][data-tab="meta"]').click();
  await expect(page).toHaveURL(/\/line\/l1\/meta$/);

  const tab = page.getByTestId("meta-tab");
  await expect(tab).toBeVisible();
  const order = await tab.evaluate((el) => Array.from(el.children).map((c) => c.getAttribute("data-testid")));
  expect(order.slice(0, 3)).toEqual(["meta-image", "meta-reading", "meta-run"]);

  await expect(page.getByTestId("line-review")).toHaveCount(0);
});

test("MetaAC the Metadata tab carries no count or dot", async ({ page }) => {
  await serve(page);
  await page.goto(LINE("l1"));
  await expect(page.locator('[data-testid="line-tab"][data-tab="meta"]')).toHaveText("Metadata");
});

test("MetaAC a cold /meta link never shows the Opening body first", async ({ page }) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await serve(page, {
    metaHandler: async (route) => { await gate; await route.fulfill({ json: META_DTO }); },
  });

  await page.goto(`${LINE("l1")}/meta`);
  await expect(page.getByTestId("line-skeleton")).toBeVisible();
  await expect(page.getByTestId("line-review")).toHaveCount(0);

  release();
  await expect(page.getByTestId("meta-tab")).toBeVisible();
  await expect(page.getByTestId("line-review")).toHaveCount(0);
});

test("MetaAC both expansion doors open and dismiss back to /meta", async ({ page }) => {
  await serve(page);
  await page.goto(`${LINE("l1")}/meta`);
  await expect(page.getByTestId("meta-tab")).toBeVisible();

  await page.getByTestId("meta-reading-open").click();
  await expect(page).toHaveURL(/\/line\/l1\/meta\/reading$/);
  await expect(page.getByTestId("meta-reading-panel")).toBeVisible();
  await page.getByTestId("meta-reading-panel-back").click();
  await expect(page).toHaveURL(/\/line\/l1\/meta$/);
  await expect(page.getByTestId("meta-reading-panel")).toBeHidden();

  await page.getByTestId("meta-run-open").click();
  await expect(page).toHaveURL(/\/line\/l1\/meta\/run$/);
  await expect(page.getByTestId("meta-run-panel")).toBeVisible();
  await page.getByTestId("meta-run-panel-back").click();
  await expect(page).toHaveURL(/\/line\/l1\/meta$/);
});

test("MetaAC-11 a crop that fails to load names the failure without breaking the rest of the tab", async ({ page }) => {
  await serve(page, { cropHandler: (route) => route.fulfill({ status: 404 }) });
  await page.goto(`${LINE("l1")}/meta`);

  await expect(page.getByTestId("meta-image-reason"))
    .toHaveText("The image for this line could not be loaded.");
  await expect(page.getByTestId("meta-reading-summary")).toBeVisible();
  await expect(page.getByTestId("meta-run-summary")).toBeVisible();
});
