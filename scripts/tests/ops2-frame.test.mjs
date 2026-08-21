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
import { join } from "node:path";
import { projectRoot } from "./helpers.mjs";

const read = (file) => readFileSync(join(projectRoot, file), "utf8");

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
      assert.ok(expression.includes("browserHref(") || isTabButtonKey,
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
