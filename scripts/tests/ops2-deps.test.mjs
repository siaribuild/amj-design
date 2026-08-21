// The import-boundary guard for ops2's router split.
//
// ops2 rides React Router 5 (via `@ionic/react-router@8.8.18`) while the
// customer site stays on React Router 7 — two router majors in one repo, never
// in one bundle. That is the owner's accepted interim, recorded in
// `docs/adr/0005-ops2-ionic-adopted.md` and designed in
// `docs/design/ops2-ionic-boundary.md` §2 (both on the `design/ops2-planning`
// branch — see docs/adr/0009 on this branch for the citation map).
//
// It is safe only while three things hold, and none of them is visible in a
// diff: exactly one v5 module instance exists at runtime (two would mean two
// React contexts and silently broken routing), the customer graph never sees
// Ionic or v5, and the ops2 graph never sees v7. This file is what holds them.
// It is cheap, static, and needs no build — deliberately, because a guard that
// costs a build is a guard people stop running.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { projectRoot } from "./helpers.mjs";

const read = (file) => readFileSync(join(projectRoot, file), "utf8");
const rel = (file) => relative(projectRoot, file).split(sep).join("/");

const SOURCE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
function sourceFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (SOURCE.test(entry)) out.push(full);
  }
  return out;
}

// An import of the bare specifier, not of anything that merely starts with it —
// "react-router" must not match "react-router-dom", which is the whole point.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const importsExactly = (body, specifier) =>
  new RegExp(`(?:from|import|require\\()\\s*\\(?["']${escape(specifier)}["']`).test(body);
// …and an import of anything under a prefix, for "@ionic/" and friends.
const importsUnder = (body, prefix) =>
  new RegExp(`(?:from|import|require\\()\\s*\\(?["']${escape(prefix)}`).test(body);

test("the manifest pins both router majors, exactly", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = pkg.dependencies ?? {};
  assert.equal(deps["react-router"], "7.13.0", "customer site: v7, exact");
  assert.equal(deps["react-router-dom"], "5.3.4", "ops2 + Ionic peer: v5's terminal release, exact");
  assert.equal(deps["react-router-5"], "npm:react-router@5.3.4", "the single v5 core copy, at a stable path");
  assert.match(deps["@ionic/react"] ?? "", /^8\.\d+\.\d+$/, "@ionic/react pinned exact on 8.x");
  assert.match(deps["@ionic/react-router"] ?? "", /^8\.\d+\.\d+$/, "@ionic/react-router pinned exact on 8.x");
  assert.match(deps["ionicons"] ?? "", /^8\.\d+\.\d+$/, "ionicons pinned exact on 8.x");

  // Without these, npm resolves @ionic/react-router's `react-router@^5` peer
  // against a root slot holding v7 and the install argues; worse, a nested v5
  // could drift to a different patch than the aliased copy.
  assert.deepEqual(pkg.overrides?.["@ionic/react-router"], { "react-router": "5.3.4" });
  assert.deepEqual(pkg.overrides?.["react-router-dom"], { "react-router": "5.3.4" });
});

test("the two Vite graphs are actually two", () => {
  const ops2Config = read("vite.ops2.config.ts");
  assert.match(ops2Config, /['"]react-router['"]\s*:/, "the ops2 graph aliases the bare react-router specifier");
  assert.match(ops2Config, /react-router-5/, "…to the single aliased v5 copy");
  assert.match(ops2Config, /ops2\.html/, "the ops2 config owns the ops2 entry");

  // If ops2.html were also an input of the shared config it would be built
  // twice, and the copy without the alias would carry v7 — the failure this
  // whole arrangement exists to prevent, arriving through the back door.
  //
  // The assertion is against the input BLOCK, not the file: that config should
  // say in prose why ops2 is absent, and a check that punishes the explanation
  // teaches people to delete it.
  const input = read("vite.config.ts").match(/input:\s*\{([^}]*)\}/)?.[1];
  assert.ok(input, "could not find the shared config's rollup input block");
  assert.match(input, /ops\.html/, "…and it should still build the legacy console");
  assert.doesNotMatch(input, /ops2/, "the shared config must not build ops2");
});

test("ops2 never imports the v7 specifier", () => {
  // ops2 app code imports `react-router-dom` (the v5 API) and `@ionic/react`.
  // A bare `react-router` import here is the one mistake that type-checks, runs
  // in dev, and still produces a second router context in the built bundle.
  const files = sourceFiles(join(projectRoot, "src", "ops2"));
  assert.ok(files.length > 0, "expected source files under src/ops2");
  const offenders = files
    .filter((f) => importsExactly(readFileSync(f, "utf8"), "react-router"))
    .map(rel);
  assert.deepEqual(offenders, [], "src/ops2 must import react-router-dom (v5), never react-router (v7)");
});

test("the customer graph never sees Ionic or the v5 router", () => {
  // The other direction of the same boundary. This one cannot be caught by a
  // build — both graphs would compile happily; it would just mean the customer
  // site started shipping a second router and a component library it never
  // renders. Added as a guard over code that is currently correct: there was no
  // red phase to run for it, and that is worth saying rather than implying.
  const customerFiles = sourceFiles(join(projectRoot, "src"))
    .filter((f) => !rel(f).startsWith("src/ops2/"));
  const offenders = [];
  for (const file of customerFiles) {
    const body = readFileSync(file, "utf8");
    for (const specifier of ["react-router-dom", "@ionic/", "ionicons"]) {
      const hit = specifier.endsWith("/")
        ? importsUnder(body, specifier)
        : importsExactly(body, specifier);
      if (hit) offenders.push(`${rel(file)}: ${specifier}`);
    }
  }
  assert.deepEqual(offenders, [], "only src/ops2 may import ops2's dependencies");
});

test("the lockfile holds one v7 root and exactly one aliased v5 copy", () => {
  // The invariant the Vite alias depends on. The alias points at ONE path,
  // node_modules/react-router-5; if the tree ever grew a second v5 core at a
  // different version, half the ops2 graph would resolve to the alias and half
  // to a nested copy — two React contexts, and routing that fails silently
  // rather than loudly. Also a guard with no red phase available.
  const lock = JSON.parse(read("package-lock.json"));
  const packages = lock.packages ?? {};
  assert.match(packages["node_modules/react-router"]?.version ?? "", /^7\./, "root react-router is v7");
  assert.equal(packages["node_modules/react-router-5"]?.version, "5.3.4", "the aliased core is v5.3.4");

  // React itself must be a real dependency, not merely a peer. Under the
  // legacy-peer-deps install this repo now needs (see .npmrc), npm installs
  // nothing that is only peered — and the first install under that flag
  // deleted react and react-dom from the tree outright.
  assert.match(packages["node_modules/react"]?.version ?? "", /^18\./, "react is installed, at 18.x");
  assert.match(packages["node_modules/react-dom"]?.version ?? "", /^18\./, "react-dom is installed, at 18.x");

  // Nested v5 copies may exist (npm's own bookkeeping); what must not happen is
  // two DIFFERENT v5 versions in the tree.
  const nestedV5 = Object.entries(packages)
    .filter(([name, meta]) => /(^|\/)node_modules\/react-router$/.test(name) && /^5\./.test(meta.version ?? ""))
    .map(([, meta]) => meta.version);
  assert.ok(new Set(nestedV5).size <= 1, `one v5 version only, found ${[...new Set(nestedV5)].join(", ")}`);
});

test("the components compiled into BOTH graphs are router-free", () => {
  // These files are imported by the customer site and (by design, for the
  // reuse mandates) by ops2, so they compile into two graphs carrying two
  // different router majors. Whichever specifier they named would be wrong in
  // one of them — so they may name neither. src/data is here because the
  // Worker imports it too, which makes it a third consumer with no router at
  // all. Guard only; nothing violates it today.
  const shared = [
    ...sourceFiles(join(projectRoot, "src", "components", "quote-project")),
    ...sourceFiles(join(projectRoot, "src", "data")),
    join(projectRoot, "src", "components", "ItemComposer.tsx"),
  ].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
  assert.ok(shared.length > 0, "expected shared component files");

  const offenders = shared
    .filter((f) => importsUnder(readFileSync(f, "utf8"), "react-router"))
    .map(rel);
  assert.deepEqual(offenders, [], "shared files must import no router at all");
});
