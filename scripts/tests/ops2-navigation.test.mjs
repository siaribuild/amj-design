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
      export { lineSuffixOf, parseLineRoute, drawingSuffix, viewerDoor, VIEWER_FROM_LINE, VIEWER_FROM_RECORD } from ${p("src/ops2/projects/lineRoute.ts")};
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
    // Outside the grammar entirely: the line page. `/why` is phase 3b's and is
    // NOT served yet — until it is, it must land somewhere real rather than on
    // a blank child.
    ["/why", 2, "line", ""],
    ["/edit", 2, "line", ""],
    ["/drawings", 2, "line", ""],
  ];
  for (const [suffix, units, view, canonical] of cases) {
    const route = M.parseLineRoute(suffix, units);
    assert.equal(route.view, view, `${suffix} (${units} units) → view`);
    assert.equal(route.canonical, canonical, `${suffix} (${units} units) → canonical`);
    assert.equal(route.normalise, true, `${suffix} must be replaced, never pushed`);
    assert.equal(route.unitIndex, null, `${suffix} names no unit`);
  }
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
