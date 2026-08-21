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
    `,
    resolveDir: projectRoot,
    sourcefile: "ops2-nav-entry.ts",
    loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const M = await import(`${pathToFileURL(outfile).href}?run=${Date.now()}`);
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
