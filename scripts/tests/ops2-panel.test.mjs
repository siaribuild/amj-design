// ops2's openable panel — the chrome component that owns the door.
//
// WHY A NODE SUITE. Four things have to agree for a panel to be a door: a
// stretched button, a chevron, a focus ring around the card, and an accessible
// name that says where it goes. The browser proves where they are DRAWN; only
// markup can prove the shape they are drawn from — that the button is a sibling
// of the content rather than its parent, that a panel without a destination
// grows no affordances at all, and that the chevron precedes the button so the
// button paints above it.
//
// Those are exactly the properties a convention loses when it is copied to a
// second surface, which is why this component exists.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-panel");
const outfile = join(runDir, "ops2-panel-bundle.mjs");
await build({
  stdin: {
    contents: `export { OpenablePanel } from ${p("src/ops2/chrome/OpenablePanel.tsx")};`,
    resolveDir: projectRoot,
    sourcefile: "ops2-panel-entry.tsx",
    loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
});
const { OpenablePanel } = await import(pathToFileURL(outfile).href);

/** The Why panel's own children shape: a dl of term/value pairs. */
const lines = () => h("dl", { className: "lp-panel__lines" },
  h("div", { className: "lp-panel__line", key: "a" }, h("dt", null, "Chosen"), h("dd", null, "the cheapest that met the caps")),
  h("div", { className: "lp-panel__line", key: "b" }, h("dt", null, "Uw"), h("dd", null, "2.94")),
);

const openable = (over = {}) => renderToStaticMarkup(h(OpenablePanel, {
  title: "Why this product",
  testId: "line-why",
  open: { label: "Open what was recorded for this line", onOpen: () => {} },
  ...over,
}, lines()));

const plain = (over = {}) => renderToStaticMarkup(h(OpenablePanel, {
  title: "Why this product",
  testId: "line-why",
  ...over,
}, lines()));

test("openable: one button, typed, named for its destination, and the card wears the door class", () => {
  const html = openable();
  assert.equal(html.match(/<button/g).length, 1, "exactly one tab stop for the door");
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /aria-label="Open what was recorded for this line"/);
  assert.match(html, /data-testid="line-why-open"/);
  assert.match(html, /class="lp-panel lp-panel--door"/);
  assert.equal(html.match(/<svg/g).length, 1);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
});

test("openable: the button is EMPTY and the content is its sibling — a dl inside it would flatten every pair into one name", () => {
  const html = openable();
  assert.match(html, /<button[^>]*><\/button>/, "the door has no children");
  const buttonEnd = html.indexOf("</button>");
  assert.ok(html.indexOf("<dl") > buttonEnd, "the dl sits after the button, not inside it");
  assert.match(html, /<dt>Chosen<\/dt>/);
  assert.match(html, /<dd>2.94<\/dd>/);
});

test("openable: the chevron precedes the button, so the stretched button paints above it", () => {
  const html = openable();
  assert.ok(html.indexOf("<svg") < html.indexOf("<button"), "svg before button in DOM order");
});

test("not openable: no door, no chevron, no tab stop, no busy state — openability is never defaulted on", () => {
  const html = plain();
  assert.equal(html.includes("<button"), false);
  assert.equal(html.includes("<svg"), false);
  assert.equal(html.includes("lp-panel--door"), false);
  assert.equal(html.includes("aria-busy"), false);
  assert.match(html, /class="lp-panel"/);
});

test("title is the heading AND the section's accessible name; busy is the loading state", () => {
  const html = plain({ busy: true });
  assert.match(html, /<h2 class="lp-panel__title">Why this product<\/h2>/);
  assert.match(html, /aria-label="Why this product"/);
  assert.match(html, /aria-busy="true"/);
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });
