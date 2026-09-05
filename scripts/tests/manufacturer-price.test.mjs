// Pure arithmetic for the manufacturer's-price uplift path. See CONTEXT.md and
// docs/runs/manufacturer-price-uplift/02-design.md — panel preview and Worker
// commit share these two functions so the two figures cannot diverge.
//
// THE NUMBERS ARE THE SPEC'S OWN, verified against the approved mock: 1,240 at
// 30% is 1,612.00; at 22% it is 1,512.80; declared inc-GST it is 1,127.27 ex
// before any uplift.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("manufacturer-price");
const outfile = join(runDir, "manufacturer-price-bundle.mjs");
await build({
  stdin: {
    contents: `export * from ${p("src/data/manufacturerPrice.ts")};
      export { PricePanel } from ${p("src/ops2/projects/PricePanel.tsx")};`,
    resolveDir: projectRoot, sourcefile: "manufacturer-price-entry.tsx", loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime"],
  loader: { ".css": "empty" },
});
const { DEFAULT_UPLIFT_PCT, manufacturerExGst, upliftedLineTotal, PricePanel } =
  await import(pathToFileURL(outfile).href);

const line = { id: "l1", code: "W01", lineTotal: 2140 };
const panel = (over = {}) => renderToStaticMarkup(
  h(PricePanel, { line, reload: () => {}, editable: true, ...over }));

test("DEFAULT_UPLIFT_PCT is 30", () => {
  assert.equal(DEFAULT_UPLIFT_PCT, 30);
});

test("an ex-GST figure is taken as typed", () => {
  assert.equal(manufacturerExGst(1240, "ex"), 1240);
});

test("an inc-GST figure is divided by 1.1 and rounded to cents BEFORE any uplift", () => {
  // The spec's worked example: 1240 / 1.1 = 1127.2727…
  assert.equal(manufacturerExGst(1240, "inc"), 1127.27);
});

test("the uplift is a percentage of the ex-GST figure, rounded to cents", () => {
  assert.equal(upliftedLineTotal(1240, 30), 1612);
});

test("22% is the mock's other worked figure", () => {
  assert.equal(upliftedLineTotal(1240, 22), 1512.8);
});

test("the two compose: 1,240 declared inc-GST at 30% is 1,465.45", () => {
  assert.equal(upliftedLineTotal(manufacturerExGst(1240, "inc"), 30), 1465.45);
});

test("zero uplift passes the manufacturer's figure through unchanged", () => {
  assert.equal(upliftedLineTotal(1240, 0), 1240);
});

test("no $10 rounding: an awkward figure keeps its cents", () => {
  // 1237.13 + 30% = 1608.269 → 1608.27, never 1610. `round10` is the engine's
  // customer-facing grid and is deliberately not imported on this path (D2).
  assert.equal(upliftedLineTotal(1237.13, 30), 1608.27);
});

test("the Price panel is a door: the chevron component, named for where it goes", () => {
  const html = panel();
  assert.match(html, /data-testid="line-price"/);
  assert.match(html, /data-testid="line-price-open"/, "the door id derives from the panel's");
  assert.match(html, /lp-panel--door/, "it wears the door class OpenablePanel gives it");
  assert.match(html, /\$2,140/, "and still shows the price it is a door to");
});

test("closed, the calculator is not in the page at all — no fields, no confirm, no tab stops", () => {
  // The form lives inside SidePanel, which renders nothing until it is opened.
  // Asserted deliberately: a closed panel that still rendered its inputs would
  // put four hidden tab stops on the line page. What the calculator DOES once
  // open is a browser question and is tested there.
  const html = panel();
  for (const id of ["line-price-figure", "line-price-uplift", "line-price-confirm", "line-price-work"]) {
    assert.equal(html.includes(id), false, `${id} is absent while closed`);
  }
  assert.equal(html.includes("<s>"), false, "and nothing is struck through");
});

test("a line the endpoint cannot reprice gets no door at all", () => {
  // An issued quote's lines are not found by the endpoint. `editable` is no
  // longer about the LINE'S OWN KIND — the endpoint now accepts a composite
  // parent's price outright (t2) and LinePage follows the project's own
  // `linesEditable` gate instead (t3) — so this panel is handed the answer as
  // a prop rather than re-deriving it. A chevron onto a Confirm that can never
  // succeed is worse than no chevron, and OpenablePanel takes openability as
  // the presence of `open`.
  const html = panel({ editable: false });
  assert.equal(html.includes("lp-panel--door"), false, "no door class");
  assert.equal(html.includes("line-price-open"), false, "no control, no tab stop");
  assert.equal(html.includes("<svg"), false, "and no chevron");
  assert.match(html, /\$2,140/, "but the price is still shown");
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });
