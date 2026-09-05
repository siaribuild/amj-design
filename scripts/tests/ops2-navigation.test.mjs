// ops2's navigation model — the destinations, and the facts about them that no
// screenshot can check.
//
// WHY THIS IS A NODE SUITE AND NOT ONLY A BROWSER ONE. The width matrix in
// scripts/tests/web/ops2-navigation.spec.ts is what proves navigation is on the
// screen; it cannot cheaply prove that the rail, the drawer and the tab bar are
// reading the SAME list. A second list is how a destination gets added to the
// rail and quietly never appears in the drawer — and the drawer is the only way
// to reach five of the eight below 1024px. So the list is one exported model,
// and this is what holds it to the owner's own order and sections.
//
// TS is bundled once with esbuild, the same approach as unit.test.mjs and
// catalogue.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-nav");
const outfile = join(runDir, "ops2-nav-bundle.mjs");
await build({
  stdin: {
    contents: `
      export { DESTINATIONS, TAB_DESTINATION_IDS, SECTIONS, HOME_PATH, RAIL_MEDIA_QUERY, destinationByPath, destinationRootFor, isDestinationActive } from ${p("src/ops2/nav/destinations.ts")};
      export { lineSuffixOf, parseLineRoute, drawingSuffix, WHY_SUFFIX, viewerDoor, whyDoor, VIEWER_FROM_LINE, VIEWER_FROM_RECORD, WHY_FROM_LINE, WHY_FROM_RECORD, META_SUFFIX, META_READING_SUFFIX, META_RUN_SUFFIX, metaDoor, META_EXP_FROM_TAB } from ${p("src/ops2/projects/lineRoute.ts")};
    `,
    resolveDir: projectRoot,
    sourcefile: "ops2-nav-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
const read = (rel) => readFileSync(join(projectRoot, rel), "utf8");
test.after(async () => { await removeRunDir(runDir); });

test("the destination list is the owner's, in his order and his two sections", () => {
  // Verbatim from the owner's screenshots: WORKSPACE carries Attention,
  // Projects, Products, Pricing, Customers; SYSTEM carries Files, Audit,
  // Settings. Order is his too — Attention is first because the first two
  // seconds on a phone have to answer "is there anything for me", which is the
  // whole reason the console is opened between other tasks.
  assert.deepEqual(
    M.DESTINATIONS.map((d) => [d.section, d.label, d.path]),
    [
      ["workspace", "Attention", "/attention"],
      ["workspace", "Projects", "/projects"],
      ["workspace", "Products", "/products"],
      ["workspace", "Pricing", "/pricing"],
      ["workspace", "Customers", "/customers"],
      ["workspace", "Enquiries", "/enquiries"],
      ["system", "Files", "/files"],
      ["system", "Audit", "/audit"],
      ["system", "Settings", "/settings"],
    ],
  );

  // Section labels are data, not markup, so the rail and the drawer cannot
  // disagree about what the groups are called.
  assert.deepEqual(M.SECTIONS.map((s) => [s.id, s.label]), [
    ["workspace", "WORKSPACE"],
    ["system", "SYSTEM"],
  ]);

  // The three tabs the owner's screenshots agree on. `More` is deliberately NOT
  // here: it is not a destination, it is the control that reveals the other
  // five, and a list of destinations that contained it would be lying about
  // what it is. (The older Dashboard/Enquiries mock is superseded.)
  assert.deepEqual(M.TAB_DESTINATION_IDS, ["attention", "projects", "products"]);
  const ids = new Set(M.DESTINATIONS.map((d) => d.id));
  for (const id of M.TAB_DESTINATION_IDS) {
    assert.ok(ids.has(id), `tab "${id}" must be a registered destination`);
  }

  // Paths are distinct and absolute — the router mounts them under a detected
  // basename, so a relative one would resolve against wherever you happened to
  // be standing.
  const paths = M.DESTINATIONS.map((d) => d.path);
  assert.equal(new Set(paths).size, paths.length, "two destinations share a path");
  for (const path of paths) assert.match(path, /^\/[a-z]+$/);

  // Landing goes to a real destination. `/` redirecting to a path nothing
  // serves is a blank screen behind Cloudflare Access, which reads as an
  // outage rather than a typo.
  assert.ok(M.destinationByPath(M.HOME_PATH), "HOME_PATH must be a registered destination");
  assert.equal(M.HOME_PATH, "/attention");

  // The change point, in ONE place. It is `--cp-shell-rail` (1024px) in
  // docs/design/ops2-r1-interaction.md, and it decides three things at once:
  // whether the split pane shows the rail, whether the tab bar is mounted, and
  // who owns the home-indicator inset. Written twice, those drift by a pixel
  // and produce a width with two navigation surfaces or none.
  assert.equal(M.RAIL_MEDIA_QUERY, "(min-width: 1024px)");
});

test("a destination stays lit for everything below it, not only for its own root", () => {
  // THE DEFECT THE MOCK RECORDED, AND WHY IT IS PINNED HERE.
  //
  // `docs/mocks/ops2-r1-ionic-src/src/App.tsx` records: "IonTabs computes the
  // selected tab from the MATCHED ROUTE, and `/projects/record/:ref` is a
  // different Route from `/projects`, so it matches no tab and the bar lights
  // NOTHING once you open a record — measured, all four buttons unselected."
  // The mock painted the active tab from the route as a stand-in and said the
  // real fix had to land before tabs shipped.
  //
  // At @ionic/react 8.8.18 the bar itself does NOT have that defect: `matchesTab`
  // (node_modules/@ionic/react/dist/index.js) is a prefix match —
  // `pathname === href || pathname.startsWith(href + '/')`. That is a fact
  // about a dependency, so it is pinned where it can be OBSERVED rather than
  // read: scripts/tests/web/ops2-navigation.spec.ts deep-links below a
  // destination and asserts the bar stays lit. A regex over node_modules would
  // have been cheaper and would prove less.
  //
  // What IS ours is the rail and the drawer, which light their own active item
  // and share none of Ionic's logic. If they matched exactly while the bar
  // matched by prefix, then three planes into a record the phone would show
  // Projects lit and the desktop would show nothing lit — the same destination,
  // two answers, on one router.
  assert.equal(M.isDestinationActive("/projects", "/projects"), true, "its own root");
  assert.equal(M.isDestinationActive("/projects/record/OF-Q-10482", "/projects"), true,
    "a record is inside Projects; Projects stays lit");
  assert.equal(M.isDestinationActive("/projects/record/OF-Q-10482/line/l04", "/projects"), true,
    "and so is everything below it");

  // Segment boundary, not substring — the same rule ops2Routing.ts states for
  // the router base. "/projectsomething" is not under "/projects".
  assert.equal(M.isDestinationActive("/projectsomething", "/projects"), false);
  assert.equal(M.isDestinationActive("/products", "/projects"), false);

  // Exactly one destination is ever lit, at any address the console serves.
  for (const path of ["/attention", "/projects", "/projects/record/x", "/settings", "/files/2024"]) {
    const lit = M.DESTINATIONS.filter((d) => M.isDestinationActive(path, d.path));
    assert.equal(lit.length, 1, `${path} lit ${lit.length} destinations`);
  }
});

test("an address nobody claims goes back to its own destination, not to the front door", () => {
  // WHY THIS EXISTS. Destination routes used to be non-exact, so anything below
  // one rendered that destination. `/projects` had to become exact the moment it
  // grew a record route beneath it — Ionic's outlet re-uses a non-exact parent
  // view item and the child never renders — and that quietly changed what
  // happens to `/projects/anything/deeper`: it stopped matching any route and
  // fell to the catch-all, which sent it to Attention.
  //
  // Landing on SOMETHING was the original requirement and it is still met. But
  // the something should be the place the address named. A stale or mistyped
  // link under Projects is a link to Projects; answering it with the console's
  // front door throws away the only information the URL carried, and behind
  // Cloudflare Access "I clicked a project link and ended up on Attention" is
  // indistinguishable from being signed out and bounced.
  assert.equal(M.destinationRootFor("/projects/anything/deeper"), "/projects");
  assert.equal(M.destinationRootFor("/projects/p_1"), "/projects");
  assert.equal(M.destinationRootFor("/projects"), "/projects");

  // Segment-prefix, exactly as isDestinationActive() and Ionic's own matchesTab
  // do it — never a substring, or `/projectsomething` would answer as Projects.
  assert.equal(M.destinationRootFor("/projectsomething"), null);
  assert.equal(M.destinationRootFor("/nowhere"), null);
  assert.equal(M.destinationRootFor("/"), null);
});

// ─── The line route's own grammar (Phase 2: the drawing viewer) ──────────────
//
// The viewer is a NODE IN THE TREE, not an overlay (owner ruling R31), so an
// enlargement is an address and back is a real pop. Everything below is the
// half of that no browser test can reach cheaply: which addresses are legal,
// which are normalised, and — the half that keeps failing closed — which are
// left ALONE.

test("the line route is not exact, so its children mount the page it already has", () => {
  // WHY `exact` HAS TO GO, and why this is asserted in source rather than
  // trusted. Ionic's outlet finds a page among the view items it has already
  // created and takes the first match (`findViewItemByPathname`/`matchView`,
  // node_modules/@ionic/react-router/dist/index.js). With `exact` on the line
  // route, `/projects/:id/line/:lineId/drawing` matches NO route, falls to the
  // catch-all and redirects to /projects — a deep link to a drawing would land
  // on the queue. Without it, the line path and its children match ONE route
  // entry and one mounted LinePage, so the viewer opens over a page that never
  // remounts and never re-fetches (VIEW-AC-2a).
  const shell = read("src/ops2/Ops2App.tsx");
  const bare = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const routes = [...bare.matchAll(/<Route([^>]*)\spath="([^"]+)"/g)]
    .map(([, attrs, path]) => [path, /\sexact\b/.test(attrs)]);
  const line = routes.find(([path]) => path === "/projects/:id/line/:lineId");
  assert.ok(line, "the line route must still exist at its own path");
  assert.equal(line[1], false,
    "the line route must NOT be exact — its children (drawing, drawing/u:N) match it, "
    + "and an exact parent sends every one of them to the catch-all redirect");

  // And the record above it keeps its own `exact`, for the reason the shell's
  // comment gives: a non-exact `/projects/:id` view item on the stack would
  // swallow the line page itself.
  const record = routes.find(([path]) => path === "/projects/:id");
  assert.ok(record, "the record route must still exist");
  assert.equal(record[1], true, "the record route keeps `exact` — the line nests under it");

  // The children are NOT separate Routes. Two Route entries would be two view
  // items, which is a second mounted page and a re-fetch on every enlargement.
  for (const [path] of routes) {
    assert.ok(!path.includes("/drawing"),
      `"${path}" registers the drawing as its own Route — the grammar is one route, one page`);
  }
});

test("the attention destination renders its own page, not the destination placeholder", () => {
  const shell = read("src/ops2/Ops2App.tsx");
  const bare = shell.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    bare,
    /import\s*\{\s*AttentionPage\s*\}\s*from\s*"\.\/attention\/AttentionPage"/,
    "Ops2App must import AttentionPage from ./attention/AttentionPage",
  );
  assert.match(
    bare,
    /d\.id === "attention" \? <AttentionPage \/> :/,
    "the attention destination must render AttentionPage instead of falling through to DestinationRoot",
  );
});

test("the suffix is read off the address, whatever the ids are made of", () => {
  const base = "/projects/p_rec/line/l4";
  assert.equal(M.lineSuffixOf(base), "");
  assert.equal(M.lineSuffixOf(`${base}/drawing`), "/drawing");
  assert.equal(M.lineSuffixOf(`${base}/drawing/u2`), "/drawing/u2");
  // An id carrying an encoded character still has ONE segment, and the suffix
  // is what follows it. Reading this by stripping a path built with
  // encodeURIComponent would disagree with react-router's own pathname.
  assert.equal(M.lineSuffixOf("/projects/p%20rec/line/l%2F4x/drawing"), "/drawing");
  // Nothing below /line at all — the caller is not on a line page.
  assert.equal(M.lineSuffixOf("/projects/p_rec"), "");
});

test("the drawing grammar accepts its own addresses UNTOUCHED", () => {
  // THE HALF THAT MATTERS MOST. Three fail-closed defects in phase 1 came from
  // guards tested only against what they must refuse, so every legal address
  // here is asserted to pass through with `normalise` false: a viewer that
  // normalised its own URL would replace on arrival, and the enlargement would
  // flicker back to the line page for reasons nothing reports.
  assert.deepEqual(M.parseLineRoute("", 0),
    { view: "line", unitIndex: null, canonical: "", normalise: false });

  assert.deepEqual(M.parseLineRoute("/drawing", 0),
    { view: "drawing", unitIndex: null, canonical: "/drawing", normalise: false });

  // 1-BASED, matching the ordinal the unit labels already imply — W07A is u1.
  assert.deepEqual(M.parseLineRoute("/drawing/u1", 2),
    { view: "unit", unitIndex: 1, canonical: "/drawing/u1", normalise: false });
  assert.deepEqual(M.parseLineRoute("/drawing/u2", 2),
    { view: "unit", unitIndex: 2, canonical: "/drawing/u2", normalise: false });
  // The last unit of a longer split is not an edge case to the parser.
  assert.equal(M.parseLineRoute("/drawing/u4", 4).normalise, false);
});

test("a malformed or out-of-range suffix normalises by REPLACE, and grows no history", () => {
  // VIEW-AC-2c. Each case states where it lands, because "normalises" without a
  // destination is how a mangled link ends up on a half state.
  const cases = [
    // Out of range: the unit does not exist on this line, but the OPENING's
    // drawing does — so the reviewer keeps the drawing they asked for.
    ["/drawing/u3", 2, "drawing", "/drawing"],
    ["/drawing/u1", 0, "drawing", "/drawing"],   // a simple opening has no units
    // Malformed, under /drawing: still a drawing address.
    ["/drawing/u0", 2, "drawing", "/drawing"],
    ["/drawing/u-1", 2, "drawing", "/drawing"],
    ["/drawing/uX", 2, "drawing", "/drawing"],
    ["/drawing/u1x", 2, "drawing", "/drawing"],
    ["/drawing/u01", 2, "drawing", "/drawing"],  // one spelling per unit, or two URLs are one place
    ["/drawing/2", 2, "drawing", "/drawing"],
    ["/drawing/u2/more", 2, "drawing", "/drawing"],
    ["/drawing/", 2, "drawing", "/drawing"],
    // A LINE WITH NO DETAIL TO OPEN. `/why` is in the grammar from phase 3b,
    // but a line whose rationale is `human`, `unrecorded` or `unresolved` has
    // nothing behind that address — so it lands on the line page rather than on
    // an empty screen, and by replace, so back does not return to it.
    ["/why", 2, "line", "", false],
    ["/edit", 2, "line", ""],
    ["/drawings", 2, "line", ""],
    ["/why/more", 2, "line", "", true],
    ["/why/", 2, "line", "", true],
  ];
  for (const [suffix, units, view, canonical, hasWhy] of cases) {
    const route = M.parseLineRoute(suffix, units, hasWhy);
    assert.equal(route.view, view, `${suffix} (${units} units) → view`);
    assert.equal(route.canonical, canonical, `${suffix} (${units} units) → canonical`);
    assert.equal(route.normalise, true, `${suffix} must be replaced, never pushed`);
    assert.equal(route.unitIndex, null, `${suffix} names no unit`);
  }
});

// ─── The `why` child (Phase 3b: the rationale screen) ───────────────────────

test("WHY-AC-44 the why screen is a sibling of the drawing, and cannot stack with it", () => {
  // ONE SUFFIX, so the two children are siblings by construction rather than by
  // a rule somebody has to keep obeying (design §4.8). There is no address on
  // which a rationale opens over an enlarged drawing.
  assert.deepEqual(M.parseLineRoute("/why", 0, true),
    { view: "why", unitIndex: null, canonical: "/why", normalise: false });
  assert.deepEqual(M.parseLineRoute("/why", 3, true),
    { view: "why", unitIndex: null, canonical: "/why", normalise: false });

  // A composite's rationale is still ONE screen — units have no `why` of their
  // own, because a unit's facts arrive inside its parent's rationale.
  for (const suffix of ["/why/u1", "/why/drawing"]) {
    const route = M.parseLineRoute(suffix, 3, true);
    assert.equal(route.view, "line", `${suffix} is not an address this page serves`);
    assert.equal(route.normalise, true);
  }
  // And a `why` hung off a drawing keeps the SHIPPED answer for everything
  // under `/drawing`: the reviewer asked for a drawing, so they get the
  // opening's. The two never stack either way.
  assert.deepEqual(M.parseLineRoute("/drawing/u1/why", 3, true),
    { view: "drawing", unitIndex: null, canonical: "/drawing", normalise: true });

  // And the drawing grammar is untouched by the new sibling — asserted with
  // `hasWhy` BOTH ways, because a capability flag that leaked into the drawing
  // branch would show up on exactly one of them.
  for (const hasWhy of [false, true]) {
    assert.equal(M.parseLineRoute("/drawing", 2, hasWhy).view, "drawing");
    assert.equal(M.parseLineRoute("/drawing/u2", 2, hasWhy).unitIndex, 2);
    assert.equal(M.parseLineRoute("/drawing/u9", 2, hasWhy).canonical, "/drawing");
  }

  // WHY THE CAPABILITY GOES IN RATHER THAN THE ANSWER COMING OUT. `unitCount`
  // is already this parameter's twin: an ordinal is judged against what the
  // line displays, not against the URL alone. Deciding `/why` anywhere else
  // would put one rule — which addresses this line serves — in two places,
  // which is the defect phase 3a produced four times.
  assert.equal(M.parseLineRoute("/why", 2, false).normalise, true, "no detail behind it");
  assert.equal(M.parseLineRoute("/why", 2, false).canonical, "", "so it lands on the line page");
  assert.equal(M.parseLineRoute("/why", 2, false).view, "line");
});

// ─── The `meta` view and its two children (parse metadata) ─────────────────

test("the meta grammar: /meta and its two children, judged exactly like why", () => {
  // Same shape as `/why`: all three suffixes are valid whenever `hasMeta`,
  // regardless of whether the metadata behind them has any content — an empty
  // expansion is still a served address (AC-20). `unitCount`/`hasWhy` are
  // irrelevant to this branch, same as `/why` is irrelevant to drawing.
  assert.deepEqual(M.parseLineRoute(M.META_SUFFIX, 0, false, true),
    { view: "meta", unitIndex: null, canonical: M.META_SUFFIX, normalise: false });
  assert.deepEqual(M.parseLineRoute(M.META_READING_SUFFIX, 0, false, true),
    { view: "metaReading", unitIndex: null, canonical: M.META_READING_SUFFIX, normalise: false });
  assert.deepEqual(M.parseLineRoute(M.META_RUN_SUFFIX, 0, false, true),
    { view: "metaRun", unitIndex: null, canonical: M.META_RUN_SUFFIX, normalise: false });

  // `hasMeta` false normalises every one of the three, by replace, to the line
  // page — a line with no metadata behind it has nothing to show (AC-5/6).
  for (const suffix of [M.META_SUFFIX, M.META_READING_SUFFIX, M.META_RUN_SUFFIX]) {
    const route = M.parseLineRoute(suffix, 0, false, false);
    assert.equal(route.view, "line", `${suffix} with hasMeta false lands on the line page`);
    assert.equal(route.canonical, "");
    assert.equal(route.normalise, true);
    assert.equal(route.unitIndex, null);
  }

  // The drawing and why grammars are untouched by the new sibling.
  for (const hasMeta of [false, true]) {
    assert.equal(M.parseLineRoute("/drawing", 2, false, hasMeta).view, "drawing");
    assert.equal(M.parseLineRoute("/why", 2, true, hasMeta).view, "why");
  }
});

test("the meta expansion's history mark — presence only, like why's single-door case", () => {
  // One mark, one question: was this expansion opened from the tab in this
  // session? No second question — there is exactly one door, the tab strip on
  // the line page — so presence alone is read, not a value.
  assert.equal(M.metaDoor(M.META_EXP_FROM_TAB), true);
  assert.equal(M.metaDoor(null), false, "pasted, emailed or reloaded — nothing of ours behind it");
  assert.equal(M.metaDoor(undefined), false);
  assert.equal(M.metaDoor({}), false);
  assert.equal(M.metaDoor({ metaExpFromTab: false }), false);
  assert.equal(M.metaDoor("tab"), false, "a bare string is not the state");
  // A DIFFERENT SURFACE'S MARK IS NOT THIS ONE. The why screen's own mark must
  // not be read as this one, or an expansion opened cold from a `why` entry
  // would misread as a warm tab open.
  assert.equal(M.metaDoor(M.WHY_FROM_LINE), false);
  assert.equal(M.metaDoor(M.WHY_FROM_RECORD), false);
  assert.equal(M.whyDoor(M.META_EXP_FROM_TAB), null);
});

test("WHY-AC-7c / FB-AC-45 the why screen's history mark names WHICH door it came through", () => {
  // The viewer has two doors and its mark's VALUE names which. The rationale has
  // exactly one — the panel on the line page — so only PRESENCE is asked: was
  // this opened from a page in this session, or pasted cold? A cold arrival
  // replaces onto the line page; a warm one pops.
  // IT ANSWERS WHICH DOOR NOW, not merely whether there was one. The record's
  // desk canvas grew a second panel, and back names a different place through
  // each — so a boolean could no longer carry the answer. Every caller that
  // asks the ORIGINAL question ("was this opened from a page in this session,
  // so is back a real pop?") still reads it for truthiness, which is why the
  // widening did not have to reach them.
  assert.equal(M.whyDoor(M.WHY_FROM_LINE), "line");
  assert.equal(M.whyDoor(M.WHY_FROM_RECORD), "record");
  assert.equal(M.whyDoor(null), null, "pasted, emailed or reloaded — nothing of ours behind it");
  assert.equal(M.whyDoor(undefined), null);
  assert.equal(M.whyDoor({}), null);
  assert.equal(M.whyDoor({ whyFrom: "canvas" }), null, "a door nobody has built is no door");
  assert.equal(M.whyDoor("line"), null, "a bare string is not the state");
  assert.equal(M.whyDoor({ whyFrom: "line", other: 1 }), "line",
    "but a state carrying someone else's keys too is still ours");
  // AND THE TWO DOORS ARE DISTINGUISHABLE, which is the whole reason for the
  // widening: back named the line for a reader who arrived from the record.
  assert.notEqual(M.whyDoor(M.WHY_FROM_LINE), M.whyDoor(M.WHY_FROM_RECORD));

  // THE TWO MARKS ARE NOT ONE. A drawing entry must not read as a rationale
  // entry, or a back out of an enlargement would be decided by the wrong rule —
  // and the round trip is asserted in BOTH directions, because a renamed key on
  // either end would silently turn every marked screen into a cold one.
  assert.equal(M.whyDoor(M.VIEWER_FROM_LINE), null);
  assert.equal(M.whyDoor(M.VIEWER_FROM_RECORD), null);
  assert.equal(M.viewerDoor(M.WHY_FROM_LINE), null);
});

test("which door the viewer was opened through — and whether there was one at all", () => {
  // ONE FACT, TWO QUESTIONS, and separating them is the point. The VALUE says
  // where back goes and what the control may say; the PRESENCE says the viewer
  // was opened from a page in THIS SESSION, so that page is the entry behind it
  // and back is a real pop.
  //
  // Marking only the canvas made those the same fact: the record door answered
  // the second question by accident, and the line door — unmarked — could not
  // answer it at all, so a reloaded line drawing replaced itself onto the page
  // it came from and left two identical history entries.
  //
  // The round trip in both directions, because a renamed key on either end would
  // silently turn every marked viewer into a cold one.
  assert.equal(M.viewerDoor(M.VIEWER_FROM_RECORD), "record");
  assert.equal(M.viewerDoor(M.VIEWER_FROM_LINE), "line");

  // NULL IS "NO DOOR", and it is a different answer from "the line door" even
  // though both name the line page: a cold arrival REPLACES, a line-door
  // arrival POPS. Reading an unrecognised state as the line door is exactly the
  // defect above, one level down.
  assert.equal(M.viewerDoor(null), null, "a cold arrival carries no state");
  assert.equal(M.viewerDoor(undefined), null);
  assert.equal(M.viewerDoor({}), null);
  assert.equal(M.viewerDoor({ viewerFrom: null }), null);
  // Foreign shapes — another surface's state on the same entry, a value that is
  // not an object, a door nobody has built. None may be read as a door.
  assert.equal(M.viewerDoor("record"), null, "a bare string is not the state");
  assert.equal(M.viewerDoor({ from: "record" }), null, "nor a different key");
  assert.equal(M.viewerDoor({ viewerFrom: "canvas" }), null, "nor a door that does not exist");
  assert.equal(M.viewerDoor({ viewerFrom: { toString: () => "record" } }), null);
  assert.equal(M.viewerDoor({ viewerFrom: "record", other: 1 }), "record",
    "but a state carrying someone else's keys too is still ours");
});

test("a navigation that keeps the viewer open carries the door with it", () => {
  // THE MARK HAS NOW GONE MISSING THREE WAYS: never pushed on the line door,
  // misread through `canGoBack()`, and dropped by a `replace` called with a path
  // and no state — history v4 assigns `undefined` when the second argument is
  // omitted, so canonicalising a stale unit ordinal silently made a
  // canvas-opened viewer read as cold.
  //
  // There is no structural fix available: per-entry state is the ONLY store a
  // `replace` can carry, and every alternative that would survive a reload
  // (`history.length`, the referrer, the navigation type) answers a different
  // question — see the note in lineRoute.ts. So the invariant is pinned here
  // instead, where a fourth site fails the node suite the moment it is written
  // rather than waiting for someone to walk the journey in a browser.
  //
  // THE RULE: a `push` or `replace` whose destination is a DRAWING address is
  // the same viewer continuing, and must carry the entry's door. One that lands
  // on the line page is a different entry beginning and must not.
  const DOOR = /,\s*(VIEWER_FROM_LINE|VIEWER_FROM_RECORD|history\.location\.state)\s*$/;
  const CARRIES_VIEWER = /drawingSuffix\(|route\.canonical/;
  let checked = 0;
  for (const file of ["src/ops2/projects/LinePage.tsx", "src/ops2/projects/ProjectRecordPage.tsx"]) {
    const code = read(file)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const [, , args] of code.matchAll(/history\.(push|replace)\(([^\n]*)\)\s*;/g)) {
      if (!CARRIES_VIEWER.test(args)) continue;
      checked += 1;
      assert.ok(DOOR.test(args),
        `${file}: this navigation keeps the viewer open but drops its door — `
        + `\`history.…(${args})\`. Pass the door, or the entry it lands on reads as a `
        + `cold arrival: the control names the line and back leaves the record behind.`);
    }
  }
  // AND THE SCAN ITSELF MUST HAVE FOUND SOMETHING. A regex that silently matches
  // nothing is the shape of assertion this feature has now shipped four of.
  assert.ok(checked >= 3, `only ${checked} viewer-bearing navigations found — the scan has drifted`);
});

test("the opener builds the address the parser accepts, and the two cannot drift", () => {
  // `null` is the opening's own drawing, and it is SAID: every caller has a
  // unit index to hand over — `null` when the subject is the whole opening — so
  // the parameter is required rather than defaulting a meaning nobody asked for.
  assert.equal(M.drawingSuffix(null), "/drawing");
  assert.equal(M.drawingSuffix(1), "/drawing/u1");
  // Round trip: whatever the opener builds, the parser takes without a replace.
  for (const i of [1, 2, 3]) {
    const route = M.parseLineRoute(M.drawingSuffix(i), 3);
    assert.equal(route.normalise, false, `u${i} round trip`);
    assert.equal(route.unitIndex, i);
  }
});

// ─── LinePage wiring (T5): tabs, readiness gate, closeChild, body switch ───

test("LinePage: the meta tabs render only once the read has resolved, so a manual line or a purged crop shows none (AC-1/5/6/8)", () => {
  // No renderer precedent for LinePage (react-router + IonRouter hooks, no
  // jsdom here) — the same reason ops2-frame.test.mjs trusts `useProjectRecord`
  // wiring by reading the source rather than mounting it. `hasMeta` admits
  // `ready` OR `error`, and withholds ONLY on `missing`. A 404 (manual line,
  // never parsed; purged crop) is `missing` and means this line serves no
  // `/meta`. A 500 or a dropped connection is `error` and says nothing about
  // whether the address exists - codex P2: collapsing the two made a transient
  // failure indistinguishable from a manual line, vanishing the tabs and
  // rewriting a pasted `/meta` link to Opening with no retry.
  //
  // Asserted as the SHAPE OF THE RULE, not one verbatim line. The previous
  // version pinned `meta.status === "ready"` exactly and so failed the moment
  // the rule was corrected - a test defending the defect it was written beside.
  // Rendered behaviour is covered for real in ops2-line-meta.spec.ts.
  const linePage = read("src/ops2/projects/LinePage.tsx");
  const hasMetaRule = linePage.match(/const hasMeta = ([^;]+);/);
  assert.ok(hasMetaRule, "hasMeta must be a single derived rule");
  assert.match(hasMetaRule[1], /"ready"/, "a resolved read shows the tabs");
  assert.match(hasMetaRule[1], /"error"/,
    "a failed read keeps the address - only a 404 (missing) withholds the tabs");
  assert.doesNotMatch(hasMetaRule[1], /"missing"/,
    "missing is the one state that withholds, by omission from the rule");
  assert.match(linePage, /controls=\{hasMeta \?/,
    "the controls slot must be gated on hasMeta, not always rendered");
  assert.match(linePage, /data-testid="line-tab"/);
  assert.match(linePage, /data-tab="opening"/);
  assert.match(linePage, /data-tab="meta"/);
  // AC-8: no count, no dot — the record page's tabs carry a `pq-count` span,
  // the line's must not borrow it.
  assert.doesNotMatch(linePage, /data-tab="meta"[\s\S]{0,200}pq-count/);
});

test("LinePage: a deep `/meta*` link renders the existing skeleton, never the Opening body, while the meta read is still loading (AC-3)", () => {
  const linePage = read("src/ops2/projects/LinePage.tsx");
  assert.match(linePage, /metaPending/, "the pending flag must exist");
  assert.match(linePage, /meta\.status === "loading"[\s\S]{0,80}startsWith\(META_SUFFIX\)/,
    "pending is true only while meta is loading AND the live suffix is a meta address");
  assert.match(linePage, /load\.status === "loading" \|\| metaPending/,
    "the existing skeleton block must also fire on a pending meta suffix");
  assert.match(linePage, /record && line && !metaPending/,
    "the Opening/Metadata body must not render at all while pending");
  // The readiness gate that drives the normalise effect waits on meta too —
  // the same wait-before-normalise reasoning already applied to rationale.
  assert.match(linePage, /rationale\.status !== "loading" && meta\.status !== "loading"/);
});

test("LinePage: tab press replaces (grows no history); an expansion pushes through the tab's own door; closeChild lands a cold meta-expansion close on /meta (AC-21)", () => {
  const linePage = read("src/ops2/projects/LinePage.tsx");
  // The two tabs are one page wearing two faces — flipping them is a replace,
  // exactly like normalise-by-replace above it, never a push.
  assert.match(linePage, /history\.replace\(linePath\)/);
  assert.match(linePage, /history\.replace\(linePath \+ META_SUFFIX\)/);
  // Expansions push, carrying the tab's own presence-only door mark — reusing
  // the opener-ref focus-return pattern the drawing/why doors already use.
  assert.match(linePage, /history\.push\(linePath \+ META_READING_SUFFIX, META_EXP_FROM_TAB\)/);
  assert.match(linePage, /history\.push\(linePath \+ META_RUN_SUFFIX, META_EXP_FROM_TAB\)/);
  // closeChild: the cold-replace target is `/meta`, not the bare line path,
  // when the entry being left is one of the two expansions — and the mark
  // check that decides warm-vs-cold now reads all three doors, not two.
  assert.match(linePage, /startsWith\("\/meta\/"\)[\s\S]{0,40}META_SUFFIX/);
  assert.match(linePage,
    /viewerDoor\(history\.location\.state\) \|\| whyDoor\(history\.location\.state\) \|\| metaDoor\(history\.location\.state\)/);
});
