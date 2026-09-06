// ops2's shell frame — the assertions about how the shell is configured.
//
// The design names this file (`docs/design/ops2-ionic-boundary.md` §6, on
// `design/ops2-planning`) for a larger job than it does here: the frame's
// static purity check and the width-matrix work belong to the shell-hosts step,
// which waits on the mock gate. This is its seed, holding the one shell
// configuration that exists today. Behavioural focus assertions belong in
// scripts/tests/web/ops2.spec.ts once there is more than one route to move
// between — with a single catch-all route a focus manager has nothing to do.
import test from "node:test";
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const read = (file) => readFileSync(join(projectRoot, file), "utf8");

// useNotificationCount's module cache/inflight logic is real branching code
// (cache-hit, inflight-reuse, fetch-error fallback), not markup — it gets its
// own executed check rather than only the source-regex assertions below.
const notifRunDir = await makeRunDir("ops2-notification-count");
const notifOutfile = join(notifRunDir, "notification-count-bundle.mjs");
await build({
  stdin: {
    contents: `export { __testing } from ${JSON.stringify(join(projectRoot, "src/ops2/chrome/useNotificationCount.ts"))};`,
    resolveDir: projectRoot,
    sourcefile: "notification-count-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: notifOutfile,
  logLevel: "silent",
});
const { __testing: notifTesting } = await import(`${pathToFileURL(notifOutfile).href}?run=${Date.now()}`);

test.after(async () => {
  await removeRunDir(notifRunDir);
});

test("setupIonicReact carries R-164's focus priority, and nothing else", () => {
  // Both facts about ops2's Ionic setup live in ONE argument list, and that is
  // precisely how the first version got this wrong: the comment above the call
  // reasoned carefully about leaving the platform mode at its default, and the
  // same bare call silently left focus management off too. Ionic leaves
  // `focusManagerPriority` UNSET by default — focus does not move on
  // navigation — so a value that has to be present is a value worth pinning.
  // It is invisible in every screenshot; nothing else will catch it.
  const call = read("src/ops2/Ops2App.tsx").match(/setupIonicReact\(([\s\S]*?)\);/);
  assert.ok(call, "Ops2App must call setupIonicReact");
  const args = call[1];

  assert.match(args, /focusManagerPriority/, "R-164 is configuration, not something the shell implements");
  const priority = args.match(/focusManagerPriority\s*:\s*\[([^\]]*)\]/);
  assert.ok(priority, "focusManagerPriority must be an array literal, readable from here");
  const order = [...priority[1].matchAll(/["']([a-z-]+)["']/g)].map((m) => m[1]);
  assert.deepEqual(order, ["heading", "content"], "the ORDER is the behaviour: heading first, content as the fallback");

  // The other half of the same argument list. ADR 0005 keeps Ionic's dual
  // platform idiom as an explicit ASSUMED — iOS on the iPhone, Material on the
  // Fold — because that is what the owner judged when he ruled for adoption.
  // Pinning a mode here would quietly overturn a decision he made on a device.
  assert.doesNotMatch(args, /\bmode\s*:/, "the platform mode stays Ionic's, per ADR 0005's ASSUMED");
});

test("the catalogue starts at boot, and only the record waits for it", () => {
  // R2 / P1-AC-5. `Elevation` resolves an opening family through
  // `getProductBySlug(productSlug)`, so the catalogue stopped being incidental
  // to ops2 the moment the record grew drawings: without it every row draws the
  // fallback frame, and a row that draws the fallback and then flips after
  // paint is worse than one that waits.
  //
  // THE FIRST VERSION AWAITED IT BEFORE MOUNTING, and that was measured at ~2.9
  // seconds before anything rendered at all: `hydrateFromSanity()` races a
  // 2500ms timeout, and an environment that cannot reach Sanity pays the whole
  // cap on every page load. Attention, Products, Pricing and the queue were all
  // waiting on a dependency only the RECORD has, and a console that shows
  // nothing for three seconds because a CMS is slow is a worse failure than the
  // flicker it was preventing.
  //
  // So the request starts at boot and the console mounts immediately; the
  // record awaits the same promise before it leaves its loading state. Nothing
  // flips after paint, because the surface that would flip has not painted.
  //
  // A STATIC PIN because both halves are invisible at runtime: mounting behind
  // hydration type-checks and runs, and so does dropping the record wait — one
  // costs three seconds on every screen, the other draws eighteen identical
  // windows for a job that has none. Comments are stripped: this file names the
  // calls in prose and so do the modules, and a scan that reads prose proves
  // nothing about the code.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const boot = strip(read("src/ops2/main.tsx"));
  const catalogue = strip(read("src/ops2/catalogue.ts"));
  const record = strip(read("src/ops2/projects/useProjectRecord.ts"));

  assert.match(catalogue, /hydrateFromSanity\(\)/, "something must hydrate the catalogue");
  assert.match(boot, /catalogueReady/, "and the boot must start it");
  assert.doesNotMatch(
    boot,
    /(hydrateFromSanity|catalogueReady)\s*\.\s*(then|finally)\s*\(/,
    "the mount must not sit inside a hydration continuation",
  );
  assert.match(record, /await catalogueReady/,
    "the record waits for it, so no row flips its drawing after paint");
  // It must never reject: a waiter is a delay, never a broken screen.
  assert.match(catalogue, /\.catch\(/, "hydration failure must not reject the promise");

  // AC-X5 — EXACTLY ONE REQUEST, and it is the public catalogue query the
  // customer site already sends. Site settings are the customer branding and
  // the offerability check is the customer picker filter; fetching either would
  // widen this console outbound surface for something it never reads.
  assert.doesNotMatch(boot + catalogue, /hydrateSiteSettings|hydrateOfferabilityFromApi/,
    "ops2 boots on the catalogue alone");
});

test("the tab bar belongs to the shell, and no region can render or delete one", () => {
  // THE TWICE-RECORDED REGRESSION, AND WHY THIS IS A TEST RATHER THAN A HABIT.
  // `docs/ops-redesign/LEARNINGS.md` §3.10 records the drawer losing its only
  // opener when the header that hosted it was deleted — no navigation and no
  // sign-out below 768px — and the same defect was then repeated in the
  // rejected pass. Both times the cause was the same shape: a REGION owned the
  // navigation control, so deleting the region deleted navigation.
  //
  // The structural fix is ownership. Exactly one file may render an IonTabBar,
  // and it is the shell. A destination root cannot remove the bar because it
  // never had one, and cannot add a second because this fails if it does.
  const shell = "src/ops2/Ops2App.tsx";
  const sources = [...new Set([
    ...globSync("src/ops2/**/*.tsx", { cwd: projectRoot }),
    ...globSync("src/ops2/**/*.ts", { cwd: projectRoot }),
  ])].map((file) => file.split("\\").join("/"));

  const renderers = sources.filter((file) => /<IonTabBar[\s>]/.test(read(file)));
  assert.deepEqual(renderers, [shell],
    "IonTabBar is the shell's alone — a region that can render one can also lose one");

  // And the shell renders exactly one. Two bars is C6's forbidden second
  // navigation band, arrived at by accident rather than by decision.
  const shellSource = read(shell);
  assert.equal((shellSource.match(/<IonTabBar[\s>]/g) ?? []).length, 1);
});

test("T6: desk bell and phone attention tab share useNotificationCount and badge only when count > 0", () => {
  // Design (docs/runs/ai-parse-monitoring/02-design.md): one shared hook,
  // no badge markup at all when the count is zero (never a badge showing "0").
  const bell = read("src/ops2/chrome/OpsPage.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(bell, /from\s*"\.\.\/chrome\/useNotificationCount"|from\s*"\.\/useNotificationCount"/,
    "OpsPage must import useNotificationCount");
  assert.match(bell, /useNotificationCount\(\)/, "OpsPage must call the hook");
  assert.match(bell, /notificationCount\s*>\s*0/,
    "the bell's badge must be conditional on count > 0");
  assert.match(bell, /ops2-bell__badge/, "the bell's badge must use the ops2-bell__badge class");

  const shell = read("src/ops2/Ops2App.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(shell, /from\s*"\.\/chrome\/useNotificationCount"/, "Ops2App must import useNotificationCount");
  assert.match(shell, /useNotificationCount\(\)/, "Ops2App must call the hook");
  assert.match(shell, /d\.id\s*===\s*"attention"\s*&&\s*notificationCount\s*>\s*0/,
    "the phone tab's badge must be conditional on the attention tab AND count > 0");
  assert.match(shell, /ops2-tab-badge/, "the tab's badge must use the ops2-tab-badge class");
});

test("T6: useNotificationCount coalesces concurrent calls, caches within TTL, and falls back to 0 on fetch failure", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ notificationCount: 3 }) };
  };

  notifTesting.resetCache();
  const [a, b] = await Promise.all([
    notifTesting.fetchNotificationCount(),
    notifTesting.fetchNotificationCount(),
  ]);
  assert.equal(calls, 1, "two concurrent callers must share one in-flight request");
  assert.equal(a, 3);
  assert.equal(b, 3);

  const cached = await notifTesting.fetchNotificationCount();
  assert.equal(calls, 1, "a call within the TTL must not fetch again");
  assert.equal(cached, 3);

  notifTesting.resetCache();
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("network down");
  };
  const onError = await notifTesting.fetchNotificationCount();
  assert.equal(onError, 0, "a fetch failure with no prior cache must fall back to 0, never throw");

  globalThis.fetch = realFetch;
});

test("every browser-facing URL in ops2 carries the basename, and the one exception is paired with its fix", () => {
  // THE COEXISTENCE CLASS, kept shut. While ops2 is served under /ops2 the
  // router's paths are basename-relative and React Router adds the base back
  // on — but an `href` is resolved by the BROWSER, so a raw one requests
  // /projects on the ops host, where opsShellFor() answers with the legacy
  // console. Primary click was fine; middle-click, "open link in new tab" and
  // "copy link address" left ops2 without saying so.
  //
  // scripts/tests/web/ops2-navigation.spec.ts proves the links that exist today
  // are right. This is what stops the NEXT one being added raw, which a browser
  // test cannot do because it can only check what someone remembered to render.
  const sources = [...new Set([
    ...globSync("src/ops2/**/*.tsx", { cwd: projectRoot }),
    ...globSync("src/ops2/**/*.ts", { cwd: projectRoot }),
  ])].map((file) => file.split("\\").join("/"));

  for (const file of sources) {
    const code = read(file);
    // Strip comments: this file's own prose discusses `href="/projects"` at
    // length, and so does tabHrefs.ts.
    const bare = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    assert.doesNotMatch(bare, /href="\//,
      `${file}: a literal href — it must go through browserHref(), or the browser will resolve it outside /ops2`);

    for (const [, expression] of bare.matchAll(/href=\{([^}]*)\}/g)) {
      // ONE exception, and it is a real one: IonTabButton's `href` is Ionic's
      // ROUTING key — matched against a basename-stripped pathname and pushed
      // through a history that re-applies the base — so prefixing it breaks
      // selection AND doubles the path. Its anchor is corrected after render
      // instead.
      const isTabButtonKey = expression.trim() === "d.path" && /IonTabButton/.test(bare);
      // A SECOND exception, as narrow as the first: a component that FORWARDS
      // an href its caller passed in. `href={href}` in a file that declares
      // `href?: string` as a prop builds no URL of its own — and the caller's
      // `href={browserHref(...)}` is checked by this same loop, so the base is
      // still applied exactly once, by the file that knows the router path.
      // chrome/RowList cannot apply it itself: `../shellBase` reads
      // `window.location` at module scope and node suites bundle chrome
      // components (ops2-record.test.mjs imports LineReview outside a browser).
      const isForwardedProp = expression.trim() === "href" && /\bhref\?: string;/.test(bare);
      assert.ok(expression.includes("browserHref(") || isTabButtonKey || isForwardedProp,
        `${file}: href={${expression}} is neither browserHref() nor IonTabButton's routing key`);
    }
  }

  // And the exception is never left on its own. If the tab bar keeps the raw
  // routing key, the shell must also be running the thing that fixes the anchor.
  const shell = read("src/ops2/Ops2App.tsx");
  if (/<IonTabButton[^>]*href=\{d\.path\}/.test(shell)) {
    assert.match(shell, /useBasenameCorrectedTabHrefs\(/,
      "the tab bar keeps Ionic's routing key as its href but nothing corrects the anchor");
  }
});

test("a destination that owns nested routes is exact, and the shell knows it", () => {
  // A GUARD OVER CODE THAT IS CURRENTLY CORRECT, said plainly rather than
  // implied: there was no red phase available for it, because the bug it
  // watches for was found in the browser and fixed before this was written.
  //
  // What it watches: Ionic's outlet finds a page by searching the view items it
  // has ALREADY CREATED and taking the first match
  // (`findViewItemByPathname`/`matchView`, node_modules/@ionic/react-router/
  // dist/index.js). A non-exact `/projects` view item is on that stack the
  // moment the list has rendered, so it matches `/projects/:id` first and the
  // outlet re-uses it. The record never renders and NOTHING SAYS SO: the URL
  // changes, the rail stays lit, the tab stays lit, and the page keeps showing
  // the list it was opened from. Three of the four things anyone would check
  // are correct, which is why this is a test and not a habit.
  const shell = read("src/ops2/Ops2App.tsx");
  const bare = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const declared = new Set(
    [...(bare.match(/NESTS_BELOW = new Set<DestinationId>\(\[([^\]]*)\]\)/)?.[1] ?? "")
      .matchAll(/["']([a-z]+)["']/g)].map((m) => m[1]),
  );

  // Every route whose path sits BELOW a destination's path, from the source.
  const nested = new Set();
  for (const [, routePath] of bare.matchAll(/<Route[^>]*\spath="(\/[^"]+)"/g)) {
    const owner = routePath.split("/")[1];
    if (routePath !== `/${owner}`) nested.add(owner);
  }

  for (const owner of nested) {
    assert.ok(declared.has(owner),
      `a route nests under /${owner} but "${owner}" is not in NESTS_BELOW — its parent will swallow it, silently`);
  }
  // And the set is not allowed to accumulate entries nothing needs: an
  // unnecessary `exact` turns a deep link under that destination into a
  // redirect to Attention, which is the opposite failure and just as quiet.
  for (const owner of declared) {
    assert.ok(nested.has(owner),
      `"${owner}" is in NESTS_BELOW but nothing nests under it — that makes its own deep links redirect away`);
  }
});

test("ops2 has exactly ONE drawing viewer, and the shared legend survives outside it", () => {
  // VIEW-AC-5, and VIEW-AC-12 with it. Two facts a browser suite cannot reach:
  // it can prove the viewer opens, not that a SECOND enlargement has not been
  // built beside it on a surface nobody thought to open — which is how this
  // console once ended up with two lists that differed in six ways nobody chose.
  const sources = globSync("src/ops2/**/*.{ts,tsx}", { cwd: projectRoot });
  assert.ok(sources.length > 20, "the walk found nothing — a glob that matches nothing proves nothing");

  const viewers = sources.filter((f) => /DrawingViewer\.tsx$/.test(f.replace(/\\/g, "/")));
  assert.equal(viewers.length, 1, "exactly one viewer component in ops2");
  assert.match(viewers[0].replace(/\\/g, "/"), /^src\/ops2\/chrome\/DrawingViewer\.tsx$/,
    "and it lives in chrome, because any surface may open it");

  // AND THE PLATE'S OLD ENLARGEMENT IS GONE, not merely unreachable (VIEW-AC-6).
  // It was a `SidePanel` the plate owned, with its own open-state and a "Done"
  // that dismissed it — a control flow the tree ruling replaces outright. Left
  // in the file behind a dead branch it would be the obvious thing to revive.
  const plate = read("src/ops2/projects/Plate.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/SidePanel/.test(plate), "the plate must not own a panel any more");
  assert.ok(!/useState/.test(plate), "nor an open-state — the address is the open-state now");

  // THE LEGEND IS NOT RENDERED IN ops2, AND NOT IMPORTED EITHER (R25). Ops staff
  // read elevations for a living; that key is customer-facing explanation.
  //
  // Comments are stripped first, deliberately: the files that removed it say so
  // in prose, and a scan that counted those would force the reason out of the
  // one place a future reader looks for it. Nothing in a comment renders.
  for (const file of sources) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/ElevationLegend/.test(code),
      `${file} still reaches for the symbol legend — R25 removed it from this console`);
  }

  // AND THE SHARED EXPORT IS GONE (VIEW-AC-12, reversed by the owner at spec
  // revision 16 — D12).
  //
  // This assertion has been inverted, not deleted. It previously PINNED the
  // export's existence, on a criterion that kept it for a consumer that turned
  // out not to exist. Executed twice independently: `ElevationLegend` had zero
  // callers repo-wide, AND no `.elev-legend` rule existed in any stylesheet — so
  // its markup had been unstyled since the plate stopped rendering it and it
  // could not have rendered correctly for any caller it might have found.
  // `docs/specs/ops2-record-design.md:42,157` records that the export was ADDED
  // by the ops2 record work, for that very plate. ops2 was never one of two
  // consumers; it was the only one.
  //
  // Kept as an assertion rather than dropped, because the value here is stopping
  // it coming BACK. A deletion nothing pins is a deletion the next reader
  // reverses in good faith — and `docs/adr/0010` said ops2 imported it right up
  // until this landed.
  const elevation = read("src/components/quote-project/Elevation.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/ElevationLegend/.test(elevation),
    "the symbol legend is deleted — VIEW-AC-12 (D12), and nothing may reintroduce it");
  // The rest of the module is untouched: the generator itself is what ops2 and
  // the customer site actually share, and it is not what was deleted.
  assert.match(elevation, /export function Elevation\(/);
});

test("SidePanel: the phone sheet scrolls its own content, so a tall panel's last control and footer stay reachable", () => {
  // REVIEW FINDING 1 (P0, 07-review-architecture.md). At 375x667 the filter's
  // six controls exceed the half-height sheet: `In production` is clipped and
  // `Clear all filters` sits below the window with no way to reach either.
  //
  // The cause is Ionic's own default, not this component's markup. A sheet
  // modal renders a FULL-HEIGHT `.ion-page` translated down to its breakpoint,
  // so at 0.5 the content box is twice the visible band — nothing overflows,
  // and content that cannot overflow cannot scroll. `expandToScroll` is the
  // native switch for exactly that (`@ionic/core` 8.8, sheet.js): false caps
  // `.ion-page` at `currentBreakpoint * 100%`, so the content overflows INSIDE
  // the visible band and `ion-content` scrolls there.
  //
  // Asserted here rather than only in the browser because it is a property of
  // the shared component every phone sheet in the console inherits, and the
  // browser suite that proves it (`web/ops2-projects.spec.ts`, "on a short
  // phone…") needs a viewport the node suites cannot open.
  const panel = read("src/ops2/chrome/SidePanel.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(panel, /expandToScroll=\{/,
    "the sheet form must set expandToScroll — Ionic's default translates a full-height content box out of reach");
  const prop = panel.match(/expandToScroll=\{([^}]*)\}/)[1];
  assert.match(prop, /\bfalse\b/, "and it must be false for the sheet, which is what makes the content scroll below the max breakpoint");
  assert.match(prop, /\bsheet\b/,
    "scoped to the sheet form: the side and screen forms are already full height and pass no breakpoints at all");
});
