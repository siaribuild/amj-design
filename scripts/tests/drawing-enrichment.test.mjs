// Plan-parse enrichment (02-design-v2.md). Grown slice by slice (S1→S7);
// this file starts with S1 — contracts, migration, crop lifecycle core.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("drawing-enrichment");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { cropKey, purgeProjectCrops } from ${p("worker/lib/drawing/crops.ts")};
      export { MAX_PDF_BYTES, MAX_PAGES, MAX_CROPS_PER_PAGE, MAX_DPI } from ${p("worker/lib/drawing/contract.ts")};
      export { inspectPdf, renderPage, ContainerClientError, INSPECT_TIMEOUT_MS, RENDER_TIMEOUT_MS } from ${p("worker/lib/drawing/containerClient.ts")};
      export { chooseStrategy, selectPages } from ${p("worker/lib/drawing/selectPages.ts")};
      export { elevationRegions, boxesByRegion } from ${p("worker/lib/drawing/elevationRegions.ts")};
      export { elevationOrderKey, locateFloorplanPage, orientationsFromNorth, resolveNorth } from ${p("worker/lib/drawing/locate.ts")};
      export { mapPool } from ${p("worker/lib/drawing/pool.ts")};
      export { validateAgentTurn, runDrawingAgent, makeDrawingAgentSkill, DRAWING_AGENT_LIMITS } from ${p("worker/lib/drawing/agent.ts")};
      export { measureSplit, composeMeasuredSplit } from ${p("worker/lib/drawing/measure.ts")};
      export { parseCompositionComment } from ${p("worker/lib/drawing/comments.ts")};
      export { compositionFromSchedule, reconcileReading } from ${p("worker/lib/drawing/reconcile.ts")};
      export { elevationInventorySkill, validateFloorplanRead, northArrowSkill, openingReadSkill } from ${p("worker/lib/drawing/skills.ts")};
      export { assignOpenings } from ${p("worker/lib/drawing/assign.ts")};
      export { applyDrawingOrientation, applyDrawingRoom, applyKnownRooms, conflictReason, persistReadings } from ${p("worker/lib/drawing/readings.ts")};
      export { enrichOpenings, runDrawingEnrichmentStage } from ${p("worker/lib/drawing/enrich.ts")};
      export { runGate } from ${p("scripts/drawing-gate.mjs")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  external: ["cloudflare:workers"],
});
const { validateAgentTurn, runDrawingAgent, makeDrawingAgentSkill, DRAWING_AGENT_LIMITS } = await import(pathToFileURL(outfile).href);
const { cropKey, purgeProjectCrops, MAX_PDF_BYTES, MAX_PAGES, MAX_CROPS_PER_PAGE, MAX_DPI, inspectPdf, renderPage, ContainerClientError, INSPECT_TIMEOUT_MS, RENDER_TIMEOUT_MS, chooseStrategy, selectPages, elevationRegions, boxesByRegion, elevationOrderKey, locateFloorplanPage, orientationsFromNorth, resolveNorth, mapPool, measureSplit, composeMeasuredSplit, parseCompositionComment, compositionFromSchedule, reconcileReading, elevationInventorySkill, validateFloorplanRead, northArrowSkill, openingReadSkill, assignOpenings, applyDrawingOrientation, applyDrawingRoom, applyKnownRooms, conflictReason, persistReadings, enrichOpenings, runDrawingEnrichmentStage, runGate } = await import(pathToFileURL(outfile).href);

// ── Step 2 — strategy (AC-13) ──────────────────────────────────────────────
function inv(pages) {
  return { pageCount: pages.length, producer: "test", fonts: pages.some((p) => p.textChars > 0) ? ["Helvetica"] : [], hasAttachments: false, pages };
}
function pageFacts(over) {
  return { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 500, imageCount: 0, imageAreaFraction: 0, ...over };
}

test("chooseStrategy: no fonts and no text on any page is scanned — stops, never guessed", () => {
  const strategy = chooseStrategy(inv([pageFacts({ textChars: 0 }), pageFacts({ pageNo: 2, textChars: 0 })]));
  assert.equal(strategy, "scanned");
});

test("chooseStrategy: a page mostly covered by images, despite a text layer, is text_raster", () => {
  assert.equal(chooseStrategy(inv([pageFacts({ imageAreaFraction: 0.9 })])), "text_raster");
});

// ── Step 4 — selectPages (AC-12, AC-20, AC-21) ─────────────────────────────
function pt(pageNo, text) { return { pageNo, text, words: [] }; }

test("selectPages: tags each page's tier from its title-block text, with a stated reason", () => {
  const pages = [pt(1, "ELEVATION A"), pt(2, "GROUND FLOOR PLAN"), pt(3, "WINDOW SCHEDULE"), pt(4, "SITE PLAN")];
  const { selected } = selectPages(inv(pages.map((p) => pageFacts({ pageNo: p.pageNo }))), pages);
  const tiers = Object.fromEntries(selected.map((s) => [s.pageNo, s.tier]));
  assert.deepEqual(tiers, { 1: "elevation", 2: "floorplan", 3: "schedule", 4: "siteplan" });
  assert.ok(selected.every((s) => s.reason.length > 0));
});

test("selectPages: returns classification only; authoritative schedule rows own vocabulary", () => {
  const result = selectPages(inv([pageFacts({ pageNo: 1 })]), [pt(1, "WINDOW SCHEDULE\nW1")]);
  assert.deepEqual(Object.keys(result), ["selected"]);
});

test("selectPages: a page matching no tier is not selected — nobody asked to read it", () => {
  const pages = [pt(1, "COVER SHEET — Project Overview")];
  const { selected } = selectPages(inv(pages.map((p) => pageFacts({ pageNo: p.pageNo }))), pages);
  assert.deepEqual(selected, []);
});

test("selectPages: a shared schedule/elevation page emits both tiers", () => {
  const pages = [pt(1, "WINDOW SCHEDULE\nELEVATION A")];
  const { selected } = selectPages(inv([pageFacts({ pageNo: 1 })]), pages);
  assert.deepEqual(selected.map((s) => s.tier), ["schedule", "elevation"]);
});

test("selectPages: a floor-plan legend mentioning an elevation marker is not an elevation sheet", () => {
  const pages = [pt(1, "GROUND FLOOR PLAN\nA denotes elevation marker")];
  const { selected } = selectPages(inv([pageFacts({ pageNo: 1 })]), pages);
  assert.deepEqual(selected.map((s) => s.tier), ["floorplan"]);
});

test("selectPages: FRONT ELEVATION MATERIALS TABLE is not an elevation callout", () => {
  const pages = [pt(6, "FRONT ELEVATION MATERIALS TABLE")];
  const { selected } = selectPages(inv([pageFacts({ pageNo: 6 })]), pages);
  assert.deepEqual(selected, []);
});

test("elevationRegions: multiple printed labels partition a shared sheet without inventing labels", () => {
  const words = [
    { text: "ELEVATION", x0: 100, x1: 180, top: 700, bottom: 715 },
    { text: "A", x0: 185, x1: 195, top: 700, bottom: 715 },
    { text: "ELEVATION", x0: 600, x1: 680, top: 700, bottom: 715 },
    { text: "B", x0: 685, x1: 695, top: 700, bottom: 715 },
  ];
  const regions = elevationRegions(words, 1000, 800);
  assert.deepEqual(regions, [
    { label: "A", region: [0, 0, 440, 800] },
    { label: "B", region: [440, 0, 1000, 800] },
  ]);
  const grouped = boxesByRegion([
    { box: [0.1, 0.1, 0.2, 0.2], unitProportions: [1] },
    { box: [0.7, 0.1, 0.8, 0.2], unitProportions: [1] },
  ], regions, 1000, 800);
  assert.equal(grouped.A.length, 1);
  assert.equal(grouped.B.length, 1);
  assert.ok(Math.abs(grouped.B[0].box[0] - ((700 - 440) / 560)) < 1e-9);
  assert.ok(Math.abs(grouped.B[0].box[2] - ((800 - 440) / 560)) < 1e-9);
});

test("elevationRegions: REF-style stacked titles survive intervening tokens and content-stream order", () => {
  const words = [
    { text: "A", x0: 265, x1: 275, top: 300, bottom: 320 },
    { text: "ELEVATION", x0: 150, x1: 230, top: 301, bottom: 319 },
    { text: "SCALE", x0: 235, x1: 260, top: 301, bottom: 319 },
    { text: "ELEVATION", x0: 180, x1: 260, top: 650, bottom: 670 },
    { text: "1:100", x0: 265, x1: 300, top: 650, bottom: 670 },
    { text: "B", x0: 305, x1: 315, top: 651, bottom: 669 },
  ];
  const regions = elevationRegions(words, 1000, 800);
  assert.deepEqual(regions, [
    { label: "A", region: [0, 0, 1000, 310] },
    { label: "B", region: [0, 310, 1000, 660] },
  ]);
  const grouped = boxesByRegion([
    { box: [0.2, 0.2, 0.3, 0.3], unitProportions: [1] },
    { box: [0.2, 0.6, 0.3, 0.7], unitProportions: [1] },
  ], regions, 1000, 800);
  assert.equal(grouped.A.length, 1);
  assert.equal(grouped.B.length, 1);
});

test("elevationRegions: no printed label returns no region — draw order is never treated as evidence", () => {
  assert.deepEqual(elevationRegions([], 1000, 800), []);
});

test("elevationRegions: ignores named facades until floor-plan placement can join them", () => {
  const regions = elevationRegions([
    { text: "FRONT", x0: 100, x1: 150, top: 20, bottom: 40 },
    { text: "ELEVATION", x0: 160, x1: 240, top: 20, bottom: 40 },
  ], 1000, 800);
  assert.deepEqual(regions, []);
});

test("locateFloorplanPage: word footprint + printed marker place tags without vision", () => {
  const page = {
    pageNo: 2,
    text: "GROUND FLOOR PLAN",
    words: [
      { text: "A", x0: 150, x1: 160, top: 390, bottom: 410 },
      { text: "W1", x0: 210, x1: 230, top: 290, bottom: 310 },
      { text: "W2", x0: 210, x1: 230, top: 490, bottom: 510 },
      { text: "BEDROOM", x0: 260, x1: 340, top: 300, bottom: 320 },
      { text: "STUDY", x0: 260, x1: 320, top: 500, bottom: 520 },
      { text: "KITCHEN", x0: 650, x1: 720, top: 250, bottom: 270 },
      { text: "LIVING", x0: 650, x1: 720, top: 550, bottom: 570 },
    ],
  };
  const result = locateFloorplanPage(page, { widthPt: 1000, heightPt: 800 }, ["W1", "W2"]);
  assert.deepEqual(result.placements.W1, { elevation: "A", orderOnWall: 1, roomLabel: "BEDROOM", storey: "ground" });
  assert.deepEqual(result.placements.W2, { elevation: "A", orderOnWall: 2, roomLabel: "STUDY", storey: "ground" });
  assert.equal(result.unplaced.length, 0);
});

test("locateFloorplanPage: the S08 tag beats a nearby W1/S7 legend decoy", () => {
  const words = [
    { text: "A", x0: 150, x1: 160, top: 390, bottom: 410 },
    { text: "W1", x0: 210, x1: 230, top: 290, bottom: 310 },
    { text: "S08", x0: 210, x1: 230, top: 312, bottom: 332 },
    { text: "W1", x0: 210, x1: 230, top: 440, bottom: 460 },
    { text: "S7", x0: 210, x1: 230, top: 462, bottom: 482 },
    { text: "BEDROOM", x0: 260, x1: 340, top: 300, bottom: 320 },
    { text: "STUDY", x0: 260, x1: 320, top: 500, bottom: 520 },
    { text: "KITCHEN", x0: 650, x1: 720, top: 250, bottom: 270 },
    { text: "LIVING", x0: 650, x1: 720, top: 550, bottom: 570 },
  ];
  const result = locateFloorplanPage({ pageNo: 2, text: "GROUND FLOOR PLAN", words }, { widthPt: 1000, heightPt: 800 }, ["W1"]);
  assert.equal(result.placements.W1.orderOnWall, 1);
  assert.equal(result.placements.W1.roomLabel, "BEDROOM");
});

test("locateFloorplanPage: missing word geometry returns an attributable fallback set", () => {
  const result = locateFloorplanPage({ pageNo: 2, text: "GROUND FLOOR PLAN", words: [] }, { widthPt: 1000, heightPt: 800 }, ["W1"]);
  assert.deepEqual(result.placements, {});
  assert.deepEqual(result.markerEdges, {});
  assert.deepEqual(result.unplaced, ["W1"]);
});

test("orientationsFromNorth: marker edges become eight-point compass faces by one rule", () => {
  assert.deepEqual(orientationsFromNorth({ A: "left", B: "top", C: "right", D: "bottom" }, 0), {
    A: { facing: "W" }, B: { facing: "N" }, C: { facing: "E" }, D: { facing: "S" },
  });
  assert.equal(orientationsFromNorth({ A: "right" }, 45).A.facing, "NE");
});

test("elevationOrderKey: outside-view mirroring is explicit for all cardinal faces", () => {
  assert.ok(elevationOrderKey("E", 10, 100) > elevationOrderKey("E", 90, 100));
  assert.ok(elevationOrderKey("W", 10, 100) < elevationOrderKey("W", 90, 100));
  assert.ok(elevationOrderKey("S", 90, 100) < elevationOrderKey("S", 10, 100));
  assert.ok(elevationOrderKey("N", 90, 100) > elevationOrderKey("N", 10, 100));
});

test("resolveNorth: explicit site-plan text resolves before vision; absence stays null", () => {
  assert.deepEqual(resolveNorth([{
    pageNo: 3, text: "SITE PLAN", words: [
      { text: "NORTH", x0: 45, x1: 55, top: 10, bottom: 20 },
      { text: "COMPASS", x0: 40, x1: 60, top: 50, bottom: 60 },
    ],
  }]), { northArrowDegrees: 0, source: "page 3 compass label" });
  assert.equal(resolveNorth([{ pageNo: 4, text: "GROUND FLOOR PLAN", words: [] }]), null);
});

test("northArrowSkill: normalises supported bearings and refuses unsupported output", () => {
  assert.deepEqual(northArrowSkill.validate({ northArrowDegrees: 450, source: "arrow" }), { northArrowDegrees: 90, source: "arrow" });
  assert.equal(northArrowSkill.validate({ northArrowDegrees: "right", source: "arrow" }), null);
});

test("mapPool: caps concurrency and preserves input order", async () => {
  let inFlight = 0;
  let highWater = 0;
  const result = await mapPool([...Array(12).keys()], 5, async (value) => {
    inFlight++;
    highWater = Math.max(highWater, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight--;
    return value * 2;
  });
  assert.equal(highWater, 5);
  assert.deepEqual(result, [...Array(12).keys()].map((value) => value * 2));
});

// ── Skills (§3.2) — validators refuse, never repair (AB-7) ────────────────
test("elevationInventorySkill.validate: accepts in-range boxes, drops an out-of-range or inverted box rather than clamping it", () => {
  const out = elevationInventorySkill.validate({
    boxes: [
      { box: [0.1, 0.2, 0.3, 0.4], unitProportions: [1] },
      { box: [0.5, 0.5, 0.4, 0.9], unitProportions: [1] }, // x0 > x1 — inverted
      { box: [0.1, -0.1, 0.3, 0.4], unitProportions: [1] }, // out of [0,1]
    ],
  });
  assert.equal(out.boxes.length, 1);
  assert.deepEqual(out.boxes[0].box, [0.1, 0.2, 0.3, 0.4]);
});

test("validateFloorplanRead: tag and elevation joins both use closed vocabularies", () => {
  const out = validateFloorplanRead({
    placements: {
      W1: { elevation: "A", orderOnWall: 1, roomLabel: "BEDROOM 1" },
      W99: { elevation: "A", orderOnWall: 2, roomLabel: "BEDROOM 2" }, // not in vocabulary
      D1: { elevation: "FRONT", orderOnWall: 1, roomLabel: "ENTRY" }, // not a detected elevation key
    },
    facings: { A: { facing: "N" }, B: { facing: "sideways" } }, // "sideways" not in the 8-point vocab
    issues: [],
  }, ["W1", "D1"], ["A", "B"]);
  assert.deepEqual(Object.keys(out.placements), ["W1", "D1"]);
  assert.deepEqual(out.discardedTags, ["W99"]);
  assert.equal(out.placements.D1.elevation, null);
  assert.equal(out.facings.A.facing, "N");
  assert.equal(out.facings.B.facing, null);
});

test("openingReadSkill.validate: a decline is a first-class answer, not a failure (AC-G6, R4)", () => {
  const out = openingReadSkill.validate({ decline: { reason: "crop too dark to read the division" } });
  assert.deepEqual(out, { decline: { reason: "crop too dark to read the division" } });
});

test("openingReadSkill.validate: accepts classifications but no model-measured ratios", () => {
  const out = openingReadSkill.validate({
    units: [{ operation: "awning", marksObserved: true }, { operation: "fixed", marksObserved: false }],
    confidence: "high",
  });
  assert.equal(out.units.length, 2);
  assert.equal(out.units[0].operation, "awning");
});

test("openingReadSkill.validate: invalid operation, missing evidence flag, or ratio field is refused", () => {
  assert.equal(openingReadSkill.validate({ units: [{ operation: "hopper", marksObserved: true }], confidence: "high" }), null);
  assert.equal(openingReadSkill.validate({ units: [{ operation: "awning" }], confidence: "high" }), null);
  assert.equal(openingReadSkill.validate({ units: [{ operation: "awning", marksObserved: true, ratio: 1 }], confidence: "high" }), null);
});

test("measureSplit: deterministic mullion position produces ratios and derived widths", () => {
  const measured = measureSplit({ mullionXs: [0.33], transomYs: [] }, [0.5, 0.5], 2050);
  assert.deepEqual(measured.derivedWidthsMm, [675, 1375]);
  const split = composeMeasuredSplit(["awning", "fixed"], measured);
  assert.equal(split.units[0].operation, "awning");
  assert.equal(split.units[0].role, "operable");
  assert.equal(split.units[1].role, "passive");
});

test("parseCompositionComment and reconcileReading preserve contradictions as flags", () => {
  assert.deepEqual(parseCompositionComment("2x 600mm WIDE AWNINGS RIGHT TO LEFT"), {
    count: 2, unitWidthMm: 600, operation: "awning", direction: "rtl",
  });
  const result = reconcileReading({
    split: { units: [{ role: "operable", operation: "awning", ratio: 1, derivedWidthMm: 1500 }], axis: "vertical" },
    scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS", modelConfidence: "high", northAssumed: true,
  });
  assert.equal(result.confidence, "low");
  assert.deepEqual(result.flags, ["scheduleDrawingMismatch", "manufacturability", "northAssumed"]);
});

test("parseCompositionComment: cited door, direction, and garbage patterns stay explicit", () => {
  assert.deepEqual(parseCompositionComment("920 DOOR & 1N° SIDELIGHT"), {
    unitWidthMm: 920, operation: "hinged", sidelight: true,
  });
  assert.deepEqual(parseCompositionComment("RIGHT TO LEFT"), { direction: "rtl" });
  assert.equal(parseCompositionComment("refer to architect"), null);
});

test("reconcileReading: agreement stays high and preserves measured geometry", () => {
  const split = { units: [{ role: "operable", operation: "awning", ratio: 1, derivedWidthMm: 900 }], axis: "vertical" };
  const result = reconcileReading({
    split, scheduleType: "AWNING", modelConfidence: "high", northAssumed: false,
  });
  assert.equal(result.confidence, "high");
  assert.deepEqual(result.flags, []);
  assert.deepEqual(result.composition, split);
});

test("reconcileReading: comment operation count wins while drawing ratios stay fixed", () => {
  const result = reconcileReading({
    split: { units: [
      { role: "passive", operation: "fixed", ratio: 0.2 },
      { role: "passive", operation: "fixed", ratio: 0.6 },
      { role: "passive", operation: "fixed", ratio: 0.2 },
    ], axis: "vertical" },
    scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS",
    modelConfidence: "high", northAssumed: false,
  });
  assert.deepEqual(result.composition.units.map((unit) => unit.operation), ["awning", "fixed", "awning"]);
  assert.deepEqual(result.composition.units.map((unit) => unit.ratio), [0.2, 0.6, 0.2]);
  assert.deepEqual(result.flags, ["scheduleDrawingMismatch"]);
});

test("compositionFromSchedule: an elevation-hidden opening uses comments, never drawing guesses", () => {
  const split = compositionFromSchedule({
    widthMm: 3200, scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS",
  });
  assert.deepEqual(split.units.map((unit) => [unit.operation, unit.derivedWidthMm]), [
    ["awning", 600], ["fixed", 2000], ["awning", 600],
  ]);
  const result = reconcileReading({
    split, scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS",
    modelConfidence: "low", northAssumed: false, visible: false,
  });
  assert.equal(result.confidence, "low");
  assert.ok(result.flags.includes("notVisibleOnElevations"));
});

// ── assign (§3.3) — pure ───────────────────────────────────────────────────
test("assignOpenings: an unplaced tag is not_read('unplaced') — never matched set-wide (spec §10.4)", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }],
    {}, // no placement for W1 at all
    {}, {},
  );
  assert.deepEqual(out, [{ tag: "W1", outcome: "not_read", gapCode: "unplaced" }]);
});

test("assignOpenings: a single row on an elevation with a single box maps its fraction box to exact PDF points", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "A", orderOnWall: 1 } },
    { A: [{ box: [0.1, 0.2, 0.3, 0.4] }] },
    { A: { widthPt: 842, heightPt: 1191 } },
  );
  assert.deepEqual(out, [{ tag: "W1", outcome: "matched", boxPt: [84.2, 238.2, 252.6, 476.4] }]);
});

test("assignOpenings: two rows tied for the same order-on-wall both refuse — neither takes the other's box (spec §13, twin openings)", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }, { tag: "W2", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "A", orderOnWall: 1 }, W2: { elevation: "A", orderOnWall: 1 } }, // both claim position 1
    { A: [{ box: [0.1, 0.2, 0.3, 0.4] }, { box: [0.4, 0.2, 0.6, 0.4] }] },
    { A: { widthPt: 842, heightPt: 1191 } },
  );
  assert.deepEqual(out, [
    { tag: "W1", outcome: "not_read", gapCode: "frame_ambiguous" },
    { tag: "W2", outcome: "not_read", gapCode: "frame_ambiguous" },
  ]);
});

test("assignOpenings: a row is matched only against boxes on ITS elevation, never another (ADR 0015 point 4)", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "B", orderOnWall: 1 } }, // placed on B — only A has any boxes
    { A: [{ box: [0.1, 0.2, 0.3, 0.4] }] },
    { A: { widthPt: 842, heightPt: 1191 }, B: { widthPt: 842, heightPt: 1191 } },
  );
  assert.deepEqual(out, [{ tag: "W1", outcome: "not_read", gapCode: "frame_ambiguous" }]);
});

// ── containerClient (AB-6) — caps enforced Worker-side BEFORE any container
// call. A namespace whose get()/fetch() throws proves the refusal never
// dispatches. ──
function explodingNamespace() {
  return {
    idFromName() { throw new Error("must not be called — caps refuse first"); },
    get() { throw new Error("must not be called — caps refuse first"); },
  };
}

test("containerClient.inspectPdf: refuses an oversized PDF before any DO call", async () => {
  const oversized = new Uint8Array(MAX_PDF_BYTES + 1);
  await assert.rejects(
    () => inspectPdf(explodingNamespace(), "proj_1", oversized),
    (err) => err instanceof ContainerClientError && err.code === "too_large",
  );
});

test("containerClient.renderPage: refuses a DPI above the cap before any DO call", async () => {
  await assert.rejects(
    () => renderPage(explodingNamespace(), "proj_1", new Uint8Array([1]), { pageNo: 1, dpi: MAX_DPI + 1 }),
    (err) => err instanceof ContainerClientError && err.code === "bad_request",
  );
});

test("containerClient.renderPage: refuses too many crop boxes for one page before any DO call", async () => {
  const crops = Array.from({ length: MAX_CROPS_PER_PAGE + 1 }, () => [0, 0, 10, 10]);
  await assert.rejects(
    () => renderPage(explodingNamespace(), "proj_1", new Uint8Array([1]), { pageNo: 1, dpi: 150, crops }),
    (err) => err instanceof ContainerClientError && err.code === "bad_request",
  );
});

// ── Below the caps: the actual DO round trip. A fake stub records what it
// was sent and hands back a canned response, so the framing (one JSON line,
// \n, raw bytes) and the idFromName(projectId) construction rule are both
// under test. ──
function recordingNamespace(responseBody) {
  const calls = { idFromName: [], fetch: [] };
  return {
    calls,
    idFromName(name) { calls.idFromName.push(name); return { toString: () => name }; },
    get(id) {
      return {
        async fetch(url, init) {
          calls.fetch.push({ url, body: init.body });
          return new Response(JSON.stringify(responseBody), { status: 200 });
        },
      };
    },
  };
}

test("containerClient.inspectPdf: builds the DO id from projectId and frames the request as one JSON line + bytes", async () => {
  const inv = { inventory: { pageCount: 1, producer: null, fonts: [], hasAttachments: false, pages: [] }, pages: [] };
  const ns = recordingNamespace(inv);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
  const result = await inspectPdf(ns, "proj_42", pdfBytes);
  assert.deepEqual(ns.calls.idFromName, ["proj_42"]);
  assert.equal(ns.calls.fetch.length, 1);
  const sent = new Uint8Array(ns.calls.fetch[0].body);
  const newline = sent.indexOf(10);
  const header = JSON.parse(new TextDecoder().decode(sent.slice(0, newline)));
  assert.deepEqual(header, { maxPages: MAX_PAGES });
  assert.deepEqual([...sent.slice(newline + 1)], [...pdfBytes]);
  assert.deepEqual(result, inv);
});

test("containerClient.renderPage: sends pageNo/dpi/crops and returns the parsed images", async () => {
  const rendered = { images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: 150 };
  const ns = recordingNamespace(rendered);
  const result = await renderPage(ns, "proj_7", new Uint8Array([0x25, 0x50, 0x44, 0x46]), { pageNo: 3, dpi: 150, crops: [[0, 0, 10, 10]] });
  const sent = new Uint8Array(ns.calls.fetch[0].body);
  const header = JSON.parse(new TextDecoder().decode(sent.slice(0, sent.indexOf(10))));
  assert.deepEqual(header, { pageNo: 3, dpi: 150, crops: [[0, 0, 10, 10]] });
  assert.deepEqual(result, rendered);
});
// A container call that never answers must not hang the job for the whole
// lease (the 2026-08-29 production incident: a stalled fetch silently burned
// the entire 240s deadline with nothing persisted). Overriding timeoutMs
// keeps this test fast; production leaves it at CONTAINER_CALL_TIMEOUT_MS.
function hangingNamespace() {
  return { idFromName: (name) => ({ toString: () => name }), get: () => ({ fetch: () => new Promise(() => {}) }) };
}

test("containerClient.renderPage: a stalled DO call times out instead of hanging the job", { timeout: 2000 }, async () => {
  await assert.rejects(
    () => renderPage(hangingNamespace(), "proj_1", new Uint8Array([1]), { pageNo: 1, dpi: 150 }, 5),
    (err) => err instanceof ContainerClientError && err.code === "timeout",
  );
});

test("assignOpenings: region-local fractions convert back to page-space crop points", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "B", orderOnWall: 1 } },
    { B: [{ box: [0, 0.1, 0.25, 0.3] }] },
    { B: { widthPt: 400, heightPt: 800, originXPt: 600, originYPt: 0 } },
  );
  assert.deepEqual(out, [{ tag: "W1", outcome: "matched", boxPt: [600, 80, 700, 240] }]);
});

test("assignOpenings: a unique proportion fingerprint resolves a tied pair", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 1800, heightMm: 1200 }, { tag: "W2", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "A", orderOnWall: 1 }, W2: { elevation: "A", orderOnWall: 1 } },
    { A: [{ box: [0.1, 0.2, 0.4, 0.4] }, { box: [0.6, 0.2, 0.7, 0.4] }] },
    { A: { widthPt: 1000, heightPt: 800 } },
  );
  assert.deepEqual(out, [
    { tag: "W1", outcome: "matched", boxPt: [100, 160, 400, 320] },
    { tag: "W2", outcome: "matched", boxPt: [600, 160, 700, 320] },
  ]);
});

test("assignOpenings: duplicate order numbers on different storeys map to different boxes", () => {
  const out = assignOpenings(
    [{ tag: "W1", widthMm: 600, heightMm: 1200 }, { tag: "W2", widthMm: 600, heightMm: 1200 }],
    { W1: { elevation: "A", orderOnWall: 1, storey: "ground" }, W2: { elevation: "A", orderOnWall: 1, storey: "first" } },
    { A: [
      { box: [0.1, 0.6, 0.2, 0.8], storey: "ground" },
      { box: [0.1, 0.2, 0.2, 0.4], storey: "first" },
    ] },
    { A: { widthPt: 1000, heightPt: 800 } },
  );
  assert.equal(out[0].outcome, "matched");
  assert.deepEqual(out[0].boxPt, [100, 480, 200, 640]);
  assert.equal(out[1].outcome, "matched");
  assert.deepEqual(out[1].boxPt, [100, 160, 200, 320]);
});

test("assignOpenings: a set-wide proportion mismatch refuses the group instead of swapping identities", () => {
  const out = assignOpenings(
    [{ tag: "W9", widthMm: 1810, heightMm: 2100 }, { tag: "W10", widthMm: 1450, heightMm: 2250 }],
    { W9: { elevation: "A", orderOnWall: 1 }, W10: { elevation: "A", orderOnWall: 2 } },
    { A: [{ box: [0.1, 0.2, 0.2, 0.5] }, { box: [0.3, 0.2, 0.7, 0.5] }] },
    { A: { widthPt: 1000, heightPt: 800 } },
  );
  assert.deepEqual(out, [
    { tag: "W9", outcome: "not_read", gapCode: "frame_ambiguous" },
    { tag: "W10", outcome: "not_read", gapCode: "frame_ambiguous" },
  ]);
});

test("containerClient: inspect and render budgets are named and finish before the 600s job lease", () => {
  assert.equal(INSPECT_TIMEOUT_MS, 120_000);
  assert.equal(RENDER_TIMEOUT_MS, 60_000);
  assert.ok(INSPECT_TIMEOUT_MS < 600_000);
  assert.ok(RENDER_TIMEOUT_MS < 600_000);
});

test.after(async () => { if (!process.env.NODE_V8_COVERAGE) await removeRunDir(runDir); });

// ── A minimal fake R2Bucket — list/delete only, the subset purgeR2Prefix
// uses. No fake existed anywhere in this test suite before this file. ──
function fakeBucket(keys) {
  const store = new Map(keys.map((k) => [k, true]));
  // Fixed at construction, like R2's own stable listing order — a page
  // computed from this never shifts under an in-flight delete-as-you-go walk
  // the way a re-sort of the live (shrinking) store would.
  const order = [...store.keys()].sort();
  return {
    store,
    async list({ prefix, cursor, limit }) {
      const all = order.filter((k) => k.startsWith(prefix));
      const start = cursor ? Number(cursor) : 0;
      const page = all.slice(start, start + limit).filter((k) => store.has(k));
      const truncated = start + limit < all.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + limit) : undefined };
    },
    async delete(key) { store.delete(key); },
  };
}

// ── §7 — cropKey ──────────────────────────────────────────────────────────
test("cropKey: dedicated prefix, not runs/", () => {
  const key = cropKey("proj_1", "run_1", "W1");
  assert.equal(key, "projects/proj_1/crops/run_1/W1.png");
  assert.doesNotMatch(key, /\/runs\//);
});

test("cropKey: sanitizes project id, run id and tag", () => {
  const key = cropKey("proj/../1", "run 1", "W-1 (A)");
  assert.equal(key, "projects/proj____1/crops/run_1/W-1__A_.png");
});

// ── §7 — purgeProjectCrops ────────────────────────────────────────────────
test("purgeProjectCrops: deletes every crop across every run for the project", async () => {
  const bucket = fakeBucket([
    "projects/proj_1/crops/run_1/W1.png",
    "projects/proj_1/crops/run_2/W1.png",
    "projects/proj_2/crops/run_1/W1.png", // a different project — must survive
    "projects/proj_1/runs/2026/stage.json", // a different lifecycle — must survive
  ]);
  await purgeProjectCrops({ FILES: bucket }, "proj_1");
  assert.deepEqual([...bucket.store.keys()].sort(), [
    "projects/proj_1/runs/2026/stage.json",
    "projects/proj_2/crops/run_1/W1.png",
  ]);
});

test("purgeProjectCrops: pages past the first 500 keys (list truncation)", async () => {
  const keys = Array.from({ length: 5 }, (_, i) => `projects/proj_1/crops/run_1/W${i}.png`);
  const bucket = fakeBucket(keys);
  const realList = bucket.list.bind(bucket);
  bucket.list = (opts) => realList({ ...opts, limit: 2 }); // force pagination with a small page
  await purgeProjectCrops({ FILES: bucket }, "proj_1");
  assert.equal(bucket.store.size, 0);
});

test("purgeProjectCrops: a project with no crops is a no-op", async () => {
  const bucket = fakeBucket(["projects/proj_2/crops/run_1/W1.png"]);
  await purgeProjectCrops({ FILES: bucket }, "proj_1");
  assert.equal(bucket.store.size, 1);
});

// ── Caps (AB-6) ───────────────────────────────────────────────────────────
test("caps: sane, positive bounds", () => {
  assert.ok(MAX_PDF_BYTES > 0);
  assert.ok(MAX_PAGES > 0);
  assert.ok(MAX_CROPS_PER_PAGE > 0);
  assert.ok(MAX_DPI > 0 && MAX_DPI <= 600);
});

// ── AB-9 — repo hygiene. No customer drawing bytes ever enter git — the
// crops rule already burned this repo once (0f63fe6a, #26). ──
async function walk(dir) {
  let out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(await walk(full));
    else out.push(full);
  }
  return out;
}
const FORBIDDEN_BYTES = /\.(png|jpe?g|pdf)$/i;

// ── readings.ts (§3.5) — model application, pure ───────────────────────────
test("applyDrawingOrientation: writes wallOrientation + source 'plan', replacing the plan-context fallback", () => {
  const model = { openings: [{ externalRef: "W1", wallOrientation: null, wallOrientationSource: null }] };
  applyDrawingOrientation(model, [{ externalRef: "W1", orientationState: "value", orientation: "N" }]);
  assert.equal(model.openings[0].wallOrientation, "N");
  assert.equal(model.openings[0].wallOrientationSource, "plan");
});

test("applyDrawingRoom: writes room_label only where the line's is currently empty — a human's label is never overwritten", async () => {
  const calls = [];
  const fakeDb = { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { calls.push({ sql, args }); } }) }) };
  await applyDrawingRoom({ DB: fakeDb }, "proj_1", [{ externalRef: "W1", roomState: "value", roomLabel: "BEDROOM 1" }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /room_label IS NULL OR room_label=''/);
  assert.deepEqual(calls[0].args, ["BEDROOM 1", "proj_1", "W1"]);
});

test("conflictReason: names both sides — a general channel for AC-9 and AC-15 alike (§14a open loop resolved by generalising, not two channels)", () => {
  assert.equal(conflictReason("drawing shows operating unit", "schedule types FIXED"), "drawing shows operating unit | schedule types FIXED");
  assert.equal(conflictReason("plans show 2 units", "energy report shows 3 units"), "plans show 2 units | energy report shows 3 units");
});

// ── enrich.ts — the orchestrator. Failure containment (R6, AC-28, AC-G5) is
// the one property tested here that MUST hold: any failure anywhere in the
// six steps degrades to zero readings + a report note, never a thrown error
// that could take the estimate down with it. ──
test("enrichOpenings: a failing container call degrades to zero readings and a noted gap — never throws (AC-28)", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const deps = {
    inspect: async () => { throw new Error("container unreachable"); },
    render: async () => { throw new Error("unreachable"); },
    runElevation: async () => null,
    runFloorplan: async () => null,
    runOpening: async () => null,
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(result.readings.length, 0);
  assert.equal(result.report.files.length, 1);
  assert.ok(result.report.files[0].steps.read.attempted === 0);
  assert.equal(result.report.files[0].steps.failedPhase, "inventory");
});

// ── runDrawingEnrichmentStage — the pipeline.ts call site's own unit, so the
// wiring itself (mode gate, R2-key lookup, deps construction) is under test
// without needing a full runAiExtraction/D1 harness (AC-27). ──
test("runDrawingEnrichmentStage: mode 'auto' touches nothing — no DB call, empty result (AC-27)", async () => {
  const env = { AI_EXTRACTION_MODE: "auto", DB: { prepare() { throw new Error("must not be called in auto mode"); } } };
  const result = await runDrawingEnrichmentStage(env, {
    projectId: "proj_1", aiRunId: "run_1",
    planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  });
  assert.deepEqual(result.readings, []);
  assert.equal(result.report, null);
});

test("runDrawingEnrichmentStage: mode 'auto_drawings' looks up R2 keys and runs the real enrichment", async () => {
  const fakeDb = {
    prepare: (sql) => ({
      bind: () => ({ all: async () => ({ results: [{ id: "f1", r2_key: "projects/proj_1/runs/f1.pdf" }] }) }),
    }),
  };
  const env = {
    AI_EXTRACTION_MODE: "auto_drawings", DB: fakeDb,
    FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} },
  };
  const deps = {
    inspect: async () => ({ inventory: { pageCount: 0, producer: null, fonts: [], hasAttachments: false, pages: [] }, pages: [] }),
    render: async () => ({ images: [], dpi: 150 }),
    runElevation: async () => null, runFloorplan: async () => null, runOpening: async () => null,
  };
  const result = await runDrawingEnrichmentStage(env, {
    projectId: "proj_1", aiRunId: "run_1",
    planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.ok(result.report);
  assert.equal(result.report.files.length, 1);
});

test("runDrawingEnrichmentStage: progress names page-wide work before opening reads", async () => {
  const fakeDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: "f1", r2_key: "projects/proj_1/runs/f1.pdf" }] }) }) }) };
  const env = { AI_EXTRACTION_MODE: "auto_drawings", DB: fakeDb, FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 1, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [{ pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "some text, no title-block keyword", words: [] }],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [], dpi: 150 }),
    runElevation: async () => null, runFloorplan: async () => null, runOpening: async () => null,
  };
  const calls = [];
  await runDrawingEnrichmentStage(env, {
    projectId: "proj_1", aiRunId: "run_1",
    planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
    onProgress: async (done, total, phase) => { calls.push([done, total, phase]); },
  }, deps);
  assert.deepEqual(calls.map((call) => call[2]), [
    "inventory", "elevation_inventory", "floorplan_location",
    "render_crops", "opening_read", "opening_read",
  ]);
  assert.deepEqual(calls.at(-1), [1, 1, "opening_read"]);
});

test("enrichOpenings: a full happy path produces a value reading for a matched, read opening", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inventory = {
    pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false,
    pages: [
      { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ],
  };
  const inspected = {
    inventory,
    pages: [
      { pageNo: 1, text: "ELEVATION A", words: [] },
      { pageNo: 2, text: "GROUND FLOOR PLAN", words: [] },
    ],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: 150 }),
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }),
    runFloorplan: async () => ({ placements: { W1: { elevation: "A", orderOnWall: 1, roomLabel: "BEDROOM 1" } }, facings: { A: { facing: "N" } }, issues: [], discardedTags: [] }),
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(result.readings.length, 1);
  assert.equal(result.readings[0].splitState, "value");
  assert.equal(result.readings[0].elevation, "A");
  assert.equal(result.report.files[0].steps.read.returned, 1);
});

test("enrichOpenings: no operable marks triggers one thresholded retry, then preserves drawn fixed evidence", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }, { pageNo: 2, text: "GROUND FLOOR PLAN", words: [] }],
  };
  const renderRequests = [];
  let reads = 0;
  const deps = {
    inspect: async () => inspected,
    render: async (_ns, _project, _bytes, request) => {
      renderRequests.push(request);
      return { images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: request.dpi };
    },
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }),
    runFloorplan: async () => ({ placements: { W1: { elevation: "A", orderOnWall: 1, roomLabel: null } }, facings: { A: { facing: "N" } }, issues: [], discardedTags: [] }),
    runOpening: async () => {
      reads++;
      return { units: [{ operation: "awning", marksObserved: false }], confidence: "high" };
    },
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1", files: [{ fileId: "f1", r2Key: "p.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 900, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(reads, 2);
  assert.equal(renderRequests.filter((request) => request.threshold === 250).length, 1);
  assert.equal(result.report.files[0].steps.read.retriedWithThreshold, 1);
  assert.equal(result.readings[0].split.units[0].operation, "fixed");
  assert.ok(result.readings[0].flags.includes("scheduleDrawingMismatch"));
});

test("enrichOpenings: the elevation letter comes from the sheet's own printed text, not page draw order (Codex P1)", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  // Sheet B is drawn FIRST (page 1); sheet A is drawn second (page 2).
  // Draw-order lettering would call page 1 "A" and page 2 "B" — backwards.
  const inspected = {
    inventory: {
      pageCount: 3, producer: "t", fonts: ["Helvetica"], hasAttachments: false,
      pages: [
        { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 3, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      ],
    },
    pages: [
      { pageNo: 1, text: "ELEVATION B", words: [] },
      { pageNo: 2, text: "ELEVATION A", words: [] },
      { pageNo: 3, text: "GROUND FLOOR PLAN", words: [] },
    ],
  };
  const deps = {
    inspect: async () => inspected,
    render: async (namespace, projectId, bytes, req) => ({
      images: [{ pngB64: Buffer.from(`page${req.pageNo}`).toString("base64"), widthPx: 10, heightPx: 10 }], dpi: 150,
    }),
    // Sheet A (page 2) has the box; sheet B (page 1) has none.
    runElevation: async (imageDataUrl) => imageDataUrl.endsWith(Buffer.from("page2").toString("base64"))
      ? { boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }
      : { boxes: [] },
    runFloorplan: async () => ({ placements: { W1: { elevation: "A", orderOnWall: 1, roomLabel: null } }, facings: { A: { facing: "N" }, B: { facing: "S" } }, issues: [], discardedTags: [] }),
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }, { role: "passive", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(result.readings[0].splitState, "value", "W1 was placed on sheet A (page 2), which has the box");
  assert.equal(result.readings[0].elevation, "A");
  assert.equal(result.readings[0].pageNo, 2, "the render call must target page 2 — the sheet actually labelled A");
  assert.deepEqual(result.report.files[0].steps.elevationRegions, [
    { pageNo: 1, labels: ["B"] },
    { pageNo: 2, labels: ["A"] },
  ]);
});

test("enrichOpenings: a matched, read opening carries the floor plan's orientation and room label (Codex P1)", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }, { pageNo: 2, text: "GROUND FLOOR PLAN", words: [] }],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: 150 }),
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }),
    runFloorplan: async () => ({ placements: { W1: { elevation: "A", orderOnWall: 1, roomLabel: "BEDROOM 1" } }, facings: { A: { facing: "SE" } }, issues: [], discardedTags: [] }),
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }, { role: "passive", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(result.readings[0].orientationState, "value");
  assert.equal(result.readings[0].orientation, "SE");
  assert.equal(result.readings[0].roomState, "value");
  assert.equal(result.readings[0].roomLabel, "BEDROOM 1");
});

test("enrichOpenings: a matched, read opening's crop is written to R2 and its key persisted (Codex P1 — the gate walk needs it)", async () => {
  const puts = [];
  const env = {
    FILES: {
      get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
      put: async (key, bytes) => { puts.push({ key, bytes }); },
    },
  };
  const inspected = {
    inventory: { pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }, { pageNo: 2, text: "GROUND FLOOR PLAN", words: [] }],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: 150 }),
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }),
    runFloorplan: async () => ({ placements: { W1: { elevation: "A", orderOnWall: 1, roomLabel: null } }, facings: {}, issues: [], discardedTags: [] }),
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }, { role: "passive", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, cropKey("proj_1", "run_1", "W1"));
  assert.equal(result.readings[0].cropKey, cropKey("proj_1", "run_1", "W1"));
  assert.equal(result.report.files[0].steps.renderCrop.cropsMade, 1);
});

test("enrichOpenings: a schedule tag and a differently-punctuated drawn tag still match (Codex P1 — case/hyphen presentation is not identity)", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 3, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 3, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [
      { pageNo: 1, text: "ELEVATION A", words: [] },
      { pageNo: 2, text: "WINDOW SCHEDULE\nW04 600x1200 AWNING", words: [] },
      { pageNo: 3, text: "GROUND FLOOR PLAN", words: [] },
    ],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: 150 }),
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.3, 0.3], unitProportions: [1] }] }),
    // The model answers with the tag AS PRINTED ON THE FLOOR PLAN, which may
    // differ in case/punctuation from the schedule's own spelling.
    runFloorplan: async () => ({ placements: { "w-04": { elevation: "A", orderOnWall: 1, roomLabel: null } }, facings: {}, issues: [], discardedTags: [] }),
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }, { role: "passive", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W-04", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(result.readings[0].splitState, "value", "W-04 (schedule) and w-04 (floor plan) are the same opening");
});

test("enrichOpenings: onProgress advances the numerator per opening, against a denominator that never shortens", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 1, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [{ pageNo: 1, widthPt: 842, heightPt: 1191, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
  };
  const deps = {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: 150 }),
    runElevation: async () => ({ boxes: [] }), // no boxes located — both rows resolve not_read (unplaced)
    runFloorplan: async () => null,
    runOpening: async () => null,
  };
  const calls = [];
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [
      { tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 600, heightMm: 1200, typeText: "AWNING" },
    ],
    onProgress: async (done, total, phase) => { calls.push([done, total, phase]); },
  }, deps);
  assert.equal(result.readings.length, 2);
  assert.deepEqual(
    calls.filter((call) => call[2] === "opening_read").map((call) => call.slice(0, 2)),
    [[0, 2], [1, 2], [2, 2]],
  );
});

test("enrichOpenings: one opening model failure preserves the other reading and already-known fields", async () => {
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 1000, heightPt: 800, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 1000, heightPt: 800, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }, { pageNo: 2, text: "GROUND FLOOR PLAN", words: [] }],
  };
  const deps = {
    inspect: async () => inspected,
    render: async (_ns, _project, _bytes, req) => ({
      images: (req.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 })), dpi: req.dpi,
    }),
    runElevation: async () => ({ boxes: [
      { box: [0.1, 0.1, 0.2, 0.2], unitProportions: [1] },
      { box: [0.5, 0.1, 0.6, 0.2], unitProportions: [1] },
    ] }),
    runFloorplan: async () => ({ placements: {
      W1: { elevation: "A", orderOnWall: 1, roomLabel: "BED 1" },
      W2: { elevation: "A", orderOnWall: 2, roomLabel: "BED 2" },
    }, facings: { A: { facing: "E" } }, issues: [], discardedTags: [] }),
    runOpening: async (_image, row) => {
      if (row.tag === "W1") throw new Error("provider unavailable");
      return { units: [{ role: "operable", ratio: 1 }], axis: "vertical", confidence: "high" };
    },
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1", files: [{ fileId: "f1", r2Key: "p.pdf" }],
    scheduleRows: [
      { tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 600, heightMm: 1200, typeText: "AWNING" },
    ],
  }, deps);
  assert.equal(result.readings.length, 2);
  const failed = result.readings.find((reading) => reading.externalRef === "W1");
  const succeeded = result.readings.find((reading) => reading.externalRef === "W2");
  assert.equal(failed.splitState, "not_read");
  assert.equal(failed.gapCode, "model_declined");
  assert.equal(failed.elevation, "A");
  assert.equal(failed.orientation, "E");
  assert.equal(failed.roomLabel, "BED 1");
  assert.equal(succeeded.splitState, "value");
});

test("enrichOpenings: vector/text placement avoids the full-floorplan model call", async () => {
  let floorplanCalls = 0;
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: { pageCount: 2, producer: "t", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 1, widthPt: 1000, heightPt: 800, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 2, widthPt: 1000, heightPt: 800, rotation: 0, textChars: 50, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [
      { pageNo: 1, text: "ELEVATION A", words: [] },
      { pageNo: 2, text: "GROUND FLOOR PLAN", words: [
        { text: "A", x0: 150, x1: 160, top: 390, bottom: 410 },
        { text: "W1", x0: 210, x1: 230, top: 290, bottom: 310 },
        { text: "BEDROOM", x0: 260, x1: 340, top: 300, bottom: 320 },
        { text: "STUDY", x0: 260, x1: 320, top: 500, bottom: 520 },
        { text: "KITCHEN", x0: 650, x1: 720, top: 250, bottom: 270 },
        { text: "LIVING", x0: 650, x1: 720, top: 550, bottom: 570 },
      ] },
    ],
  };
  const deps = {
    inspect: async () => inspected,
    render: async (_ns, _project, _bytes, req) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: req.dpi }),
    runElevation: async () => ({ boxes: [{ box: [0.1, 0.1, 0.2, 0.2], unitProportions: [1] }] }),
    runFloorplan: async () => { floorplanCalls++; return null; },
    runOpening: async () => ({ units: [{ role: "operable", ratio: 1 }], axis: "vertical", confidence: "high" }),
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1", files: [{ fileId: "f1", r2Key: "p.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(floorplanCalls, 0);
  assert.equal(result.readings[0].roomLabel, "BEDROOM");
  assert.deepEqual(result.report.files[0].steps.placements, { fromText: 1, fromModelFallback: 0, unplaced: 0 });
  assert.equal(result.report.files[0].steps.northAssumed, true);
});

// ── scripts/drawing-gate.mjs — the release-gate comparator (AC-G1…G4) ─────
test("runGate: scores every opening and every stated field, even when split is not drawn", () => {
  const readings = [
    { external_ref: "W1", split_state: "value", split_json: JSON.stringify({ units: [{ role: "operable", ratio: 0.5 }, { role: "passive", ratio: 0.5 }], axis: "vertical" }), orientation_state: "value", orientation: "N", elevation_state: "value", elevation: "A", room_state: "value", room_label: "BEDROOM 1", gap_code: null },
    { external_ref: "W2", split_state: "not_stated", split_json: null, orientation_state: "value", orientation: "S", elevation_state: "value", elevation: "B", room_state: "not_stated", room_label: null, gap_code: null, page_no: 4 },
  ];
  const labels = {
    W1: { split: { units: [{ role: "operable", ratio: 0.5 }, { role: "passive", ratio: 0.5 }], axis: "vertical" }, orientation: "N", elevation: "A", room: "BEDROOM 1", drawn: true },
    W2: { drawn: false, orientation: "S", elevation: "B", room: null, pageNo: 4 },
    W3: { drawn: true, split: null, orientation: "S", elevation: "B", room: null }, // in the label set, absent from readings
  };
  const { perOpening, summary } = runGate(readings, labels);
  const w1 = perOpening.find((o) => o.externalRef === "W1");
  const w2 = perOpening.find((o) => o.externalRef === "W2");
  const w3 = perOpening.find((o) => o.externalRef === "W3");
  assert.equal(w1.verdict, "match");
  assert.equal(w2.verdict, "match");
  assert.equal(w2.note, "split not drawn on any elevation");
  assert.equal(w3.verdict, "not_read");
  assert.equal(summary.matched, 2);
  assert.equal(summary.of, 3);
});

test("persistReadings: one INSERT per reading, batched, including migration 0061 diagnostics", async () => {
  const batched = [];
  const fakeDb = {
    prepare: (sql) => ({ bind: (...args) => ({ sql, args }) }),
    batch: async (stmts) => { batched.push(...stmts); },
  };
  await persistReadings({ DB: fakeDb }, "proj_1", "run_1", [
    { externalRef: "W1", splitState: "not_read", split: null, orientationState: "not_stated", orientation: null,
      elevationState: "value", elevation: "A", roomState: "not_stated", roomLabel: null,
      gapCode: "unplaced", gapNote: null, cropKey: null, pageNo: null, sheetRef: null, regionJson: null, sourceFileId: "f1",
      confidence: "low", flags: ["notVisibleOnElevations"] },
  ]);
  assert.equal(batched.length, 1);
  assert.match(batched[0].sql, /INSERT INTO drawing_reading/);
  assert.match(batched[0].sql, /confidence, flags_json/);
  assert.equal(batched[0].args[1], "proj_1");
  assert.equal(batched[0].args[2], "run_1");
  assert.equal(batched[0].args.at(-2), "low");
  assert.equal(batched[0].args.at(-1), '["notVisibleOnElevations"]');
});

test("AB-9: no image/pdf bytes under scripts/tests/fixtures/drawing or containers/", async () => {
  const files = [
    ...(await walk(join(projectRoot, "scripts/tests/fixtures/drawing"))),
    ...(await walk(join(projectRoot, "containers"))),
  ];
  const offenders = files.filter((f) => FORBIDDEN_BYTES.test(f));
  assert.deepEqual(offenders, []);
});

test("AB-9: root .gitignore carries the crops rule", async () => {
  const gi = await readFile(join(projectRoot, ".gitignore"), "utf8");
  assert.match(gi, /plan-parse\/out\//);
});

test("AB-5: containers/plan-parse/requirements.txt holds no credential-bearing client", async () => {
  const reqPath = join(projectRoot, "containers/plan-parse/requirements.txt");
  assert.ok(existsSync(reqPath), "requirements.txt must exist");
  const deps = (await readFile(reqPath, "utf8")).split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).join("\n");
  assert.doesNotMatch(deps, /\bboto3\b/i);
  assert.doesNotMatch(deps, /\banthropic\b/i);
});

// ── v3 agentic loop — bounded tools, evidence and customer progress ────────
test("validateAgentTurn: accepts bounded tool batches and refuses vocabulary or batch escape", () => {
  assert.deepEqual(validateAgentTurn(
    { action: "render", requests: [{ pageNo: 2, dpi: 200, bboxPt: [0, 0, 100, 120], threshold: 180 }] },
    ["W1"],
    [1, 2],
  ), { action: "render", requests: [{ pageNo: 2, dpi: 200, bboxPt: [0, 0, 100, 120], threshold: 180 }] });

  const record = {
    tag: "W1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical",
    orientation: "N", elevation: "A", roomLabel: "BED 1", storey: "ground",
    evidenceView: "elevation",
    evidenceRenderId: "r_001_01", frameBoxPt: [10, 10, 40, 50],
    confidence: "high", flags: [], basis: ["Visible W1 frame on elevation A."], note: null,
  };
  assert.equal(validateAgentTurn({ action: "emit", records: Array(19).fill(record) }, ["W1"], [1]).records.length, 19);
  assert.equal(validateAgentTurn({ action: "emit", records: Array(21).fill(record) }, ["W1"], [1]), null);
  assert.equal(validateAgentTurn({ action: "emit", records: [{ ...record, tag: "W99" }] }, ["W1"], [1]), null);
  assert.equal(
    validateAgentTurn({ action: "emit", records: [{ ...record, divisionAxis: null }] }, ["W1"], [1]).records[0].divisionAxis,
    "vertical",
  );
  assert.equal(validateAgentTurn({ action: "emit", records: [{ ...record, evidenceView: "floorplan" }] }, ["W1"], [1]), null);
  assert.equal(DRAWING_AGENT_LIMITS.maxEmitBatch, 20);
});

test("applyKnownRooms: plan rooms survive a declined drawing read without overwriting a user label", async () => {
  const statements = [];
  const fakeDb = {
    prepare: (sql) => ({ bind: (...args) => ({ sql, args }) }),
    batch: async (items) => { statements.push(...items); },
  };
  await applyKnownRooms({ DB: fakeDb }, "proj_1", [
    { externalRef: "W1", roomLabel: "STUDY" },
    { externalRef: "W2", roomLabel: null },
  ]);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /room_label IS NULL OR room_label=''/);
  assert.deepEqual(statements[0].args, ["STUDY", "proj_1", "W1"]);
});

test("drawing-agent prompt treats unlabelled elevations as an order-matching problem, not an automatic decline", () => {
  const skill = makeDrawingAgentSkill(["W1"], [1]);
  const prompt = skill.buildPrompt({ imageDataUrls: [] });
  assert.equal(skill.promptVersion, "v8");
  assert.match(prompt, /Elevation drawings commonly omit opening tags/i);
  assert.match(prompt, /left-to-right order/i);
  assert.match(prompt, /limited to two turns/i);
  assert.match(prompt, /research, render, emit or decline action/i);
  assert.match(prompt, /"action":"decline"/);
});

test("runDrawingAgent: pending openings cannot finish and explicit declines advance visible progress", async () => {
  const inputs = [];
  const progress = [];
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "Elevation stored." },
    { action: "get_page_text", pages: [1], memory: "Research complete." },
    { action: "finish", memory: "Nothing can be read." },
    {
      action: "decline",
      records: [
        { tag: "W1", reason: "W1 remains ambiguous after plan-to-elevation order matching." },
        { tag: "W2", reason: "W2 remains ambiguous after plan-to-elevation order matching." },
      ],
      memory: "Both openings explicitly reviewed.",
    },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "AWNING" },
      { tag: "W2", widthMm: 800, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift(); },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => "projects/p/crops/r/" + renderId + ".png",
      onProgress: async (done, total, phase) => { progress.push({ done, total, phase }); },
    },
  });
  assert.equal(inputs[2].conclusionRequired, true);
  assert.equal(inputs[2].finishAllowed, false);
  assert.equal(inputs[3].observations[0].data.reason, "finish_not_allowed_with_pending_openings");
  assert.equal(inputs.length, 4, "the completed decline batch needs no finish call");
  assert.ok(progress.some((item) => item.phase === "opening_read" && item.done === 2 && item.total === 2));
  assert.equal(result.report.steps.read.declined, 2);
  assert.ok(result.report.perOpening.every((opening) => opening.outcome === "not_read"));
});

test("runDrawingAgent: provider failure quietly completes with schedule fallbacks", async () => {
  const progress = [];
  let turns = 0;
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => { turns++; throw new Error("provider unavailable"); },
      render: async () => { throw new Error("not called"); },
      store: async () => null,
      onProgress: async (done, total, phase) => { progress.push({ done, total, phase }); },
    },
  });
  assert.equal(turns, 1);
  assert.equal(result.report.steps.failedPhase, "drawing_agent");
  assert.equal(result.report.steps.read.attempted, 0);
  assert.equal(result.report.steps.read.declined, 0);
  assert.equal(result.readings[0].splitState, "value");
  assert.deepEqual(progress.at(-1), { done: 1, total: 1, phase: "opening_read" });
});

test("runDrawingAgent: reads the opening set in batches, stores evidence and degrades only missing rows", async () => {
  const progress = [];
  const stored = [];
  const inputs = [];
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 200, bboxPt: [0, 0, 100, 100] }] },
    { action: "emit", records: [
      {
        tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.4, 0.6], divisionAxis: "vertical",
        orientation: "N", elevation: "A", roomLabel: "BED 1", storey: "ground",
        evidenceView: "elevation",
        evidenceRenderId: "r_001_01", frameBoxPt: [5, 5, 45, 45],
        confidence: "high", flags: [], basis: ["W1 tag and two panels visible in render."], note: null,
      },
      {
        tag: "W2", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
        orientation: null, elevation: "A", roomLabel: null, storey: "ground",
        evidenceView: "elevation",
        evidenceRenderId: "r_001_01", frameBoxPt: [55, 5, 95, 45],
        confidence: "low", flags: ["northAssumed"], basis: ["W2 frame visible; north unresolved."], note: null,
      },
    ] },
    { action: "finish" },
  ];
  const inspected = {
    inventory: {
      pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 100, imageCount: 0, imageAreaFraction: 0 }],
    },
    pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN ELEVATION A", words: [] }],
    timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
  };
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1000, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 800, heightMm: 1200, typeText: "FIXED" },
      { tag: "W3", widthMm: 600, heightMm: 1200, typeText: "FIXED" },
    ],
    inspected,
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift() ?? { action: "finish" }; },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => { stored.push(renderId); return `projects/p/crops/r/${renderId}.png`; },
      onProgress: async (done, total, phase) => { progress.push({ done, total, phase }); },
    },
  });

  assert.equal(stored.length, 1);
  assert.equal(inputs[1].imageDataUrls[0].renderId, "r_001_01");
  assert.equal(result.readings.length, 3);
  assert.equal(result.readings[0].confidence, "high");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.derivedWidthMm), [400, 600]);
  assert.equal(result.readings[1].confidence, "low");
  assert.ok(result.readings[1].flags.includes("northAssumed"));
  assert.equal(result.readings[2].confidence, "low");
  assert.ok(result.readings[2].flags.includes("agentEvidenceWeak"));
  assert.equal(result.report.perOpening[2].outcome, "not_read");
  assert.ok(progress.some((item) => item.phase === "opening_read" && item.done === 2 && item.total === 3));
  assert.deepEqual(progress.at(-1), { done: 3, total: 3, phase: "opening_read" });
});

test("runDrawingAgent: hard turn cap finishes the UI and never creates unevidenced drawing facts", async () => {
  let turns = 0;
  const inspected = {
    inventory: {
      pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }],
    },
    pages: [{ pageNo: 1, text: "PLAN", words: [] }],
  };
  const progress = [];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "FIXED" }],
    inspected,
    deps: {
      runTurn: async () => { turns++; return { action: "get_page_text", pages: [1] }; },
      render: async () => { throw new Error("not called"); },
      store: async () => { throw new Error("not called"); },
      onProgress: async (done, total, phase) => { progress.push({ done, total, phase }); },
    },
  });
  assert.equal(turns, DRAWING_AGENT_LIMITS.maxTurns);
  assert.equal(result.readings[0].orientationState, "not_read");
  assert.equal(result.readings[0].confidence, "low");
  assert.match(result.readings[0].gapNote, /turn budget ended/i);
  assert.deepEqual(progress.at(-1), { done: 1, total: 1, phase: "opening_read" });
});

test("flagged agent orientation and room remain review-only", async () => {
  const model = { openings: [{ externalRef: "W1", wallOrientation: null, wallOrientationSource: null }] };
  const reading = {
    externalRef: "W1", orientationState: "value", orientation: "N",
    roomState: "value", roomLabel: "BED 1", confidence: "low", flags: ["agentEvidenceWeak"],
  };
  applyDrawingOrientation(model, [reading]);
  assert.equal(model.openings[0].wallOrientation, null);
  let writes = 0;
  await applyDrawingRoom({ DB: { prepare: () => ({ bind: () => ({ run: async () => { writes++; } }) }) } }, "p1", [reading]);
  assert.equal(writes, 0);
});

test("runDrawingAgent: an unstored render cannot authorize a drawing reading", async () => {
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }] },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical",
      orientation: "N", elevation: "A", roomLabel: null, storey: "ground",
      evidenceView: "elevation",
      evidenceRenderId: "r_001_01", frameBoxPt: [10, 10, 40, 40],
      confidence: "high", flags: [], basis: ["Visible frame."], note: null,
    }] },
    { action: "finish" },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => actions.shift() ?? { action: "finish" },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async () => null,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].confidence, "low");
  assert.equal(result.readings[0].cropKey, null);
});

test("runDrawingAgent: refuses the production failure mode where turn one finishes with every tag pending", async () => {
  const inputs = [];
  const actions = [
    { action: "finish" },
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }] },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical",
      orientation: "N", elevation: "A", roomLabel: null, storey: "ground",
      evidenceView: "elevation",
      evidenceRenderId: "r_002_01", frameBoxPt: [10, 10, 40, 40],
      confidence: "high", flags: [], basis: ["Visible W1 frame."], note: null,
    }] },
    { action: "finish" },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift() ?? { action: "finish" }; },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(inputs.length, 3);
  assert.equal(inputs[0].finishAllowed, false);
  assert.equal(inputs[1].observations[0].data.reason, "finish_not_allowed_with_pending_openings");
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.equal(result.readings[0].confidence, "high");
});

test("enrichOpenings: retries one timed-out cold inspection before degrading", async () => {
  let inspectCalls = 0;
  const env = { FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }), put: async () => {} } };
  const inspected = {
    inventory: {
      pageCount: 1, producer: null, fonts: [], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 0, imageCount: 1, imageAreaFraction: 1 }],
    },
    pages: [{ pageNo: 1, text: "", words: [] }],
    timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
  };
  const deps = {
    inspect: async () => {
      inspectCalls++;
      if (inspectCalls === 1) throw new ContainerClientError("timeout");
      return inspected;
    },
    render: async () => { throw new Error("not called"); },
    runElevation: async () => null,
    runFloorplan: async () => null,
    runOpening: async () => null,
  };
  const result = await enrichOpenings(env, {
    projectId: "proj_1", aiRunId: "run_1",
    files: [{ fileId: "f1", r2Key: "projects/proj_1/runs/f1.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1200, typeText: "AWNING" }],
  }, deps);
  assert.equal(inspectCalls, 2);
  assert.equal(result.readings.length, 0);
  assert.equal(result.report.files[0].containerCalls, 2);
  assert.equal(result.report.files[0].steps.failedPhase, undefined);
});

test("validateAgentTurn: preserves and clamps cross-turn working memory", () => {
  const remembered = validateAgentTurn({ action: "get_page_text", pages: [1], memory: "  found elevation A  " }, ["W1"], [1]);
  assert.equal(remembered.memory, "found elevation A");
  const clamped = validateAgentTurn({ action: "finish", memory: "x".repeat(9_000) }, ["W1"], [1]);
  assert.equal(clamped.memory.length, 8_000);
});

test("runDrawingAgent: carries visual findings and stored renders across stateless turns", async () => {
  const inputs = [];
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "Elevation A; inspect W1 in the new render." },
    { action: "get_text_tokens", pages: [1], memory: "r_001_01 shows W1 as awning plus fixed; preserve it while checking the tag." },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.4, 0.6], divisionAxis: "vertical",
      orientation: "N", elevation: "A", roomLabel: null, storey: "ground",
      evidenceView: "elevation",
      evidenceRenderId: "r_001_01", frameBoxPt: [10, 10, 80, 80],
      confidence: "high", flags: [], basis: ["W1 frame and two panels visible."], note: null,
    }], memory: "W1 emitted." },
    { action: "finish", memory: "All pending evidence resolved." },
  ];
  const inspected = {
    inventory: {
      pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }],
    },
    pages: [{ pageNo: 1, text: "ELEVATION A W1", words: [] }],
  };
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "AWNING" }],
    inspected,
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift(); },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(inputs[1].workingMemory, "Elevation A; inspect W1 in the new render.");
  assert.deepEqual(inputs[1].renderCatalog.map((render) => render.renderId), ["r_001_01"]);
  assert.match(inputs[2].workingMemory, /awning plus fixed/);
  assert.equal(result.report.perOpening[0].outcome, "read");
});

test("runDrawingAgent: conclusion mode resolves all 19 openings in one bounded batch", async () => {
  const inputs = [];
  let renderCalls = 0;
  const scheduleRows = Array.from({ length: 19 }, (_, index) => ({ tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "AWNING" }));
  const inspected = {
    inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "ELEVATIONS", words: [] }],
  };
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows,
    inspected,
    deps: {
      runTurn: async (input) => {
        inputs.push(input);
        if (input.turn === 1) return { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "bootstrap elevation render" };
        if (input.turn === 2) return { action: "get_page_text", pages: [1], memory: "research 2" };
        if (input.turn === 3) return { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "late research must be rejected" };
        if (input.pendingTags.length) {
          return {
            action: "decline",
            records: input.pendingTags.map((tag) => ({ tag, reason: tag + " remains ambiguous after plan-to-elevation matching." })),
            memory: "Every opening explicitly reviewed.",
          };
        }
        return { action: "finish", memory: "Every opening has been explicitly reviewed." };
      },
      render: async () => {
        renderCalls++;
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: 150 };
      },
      store: async () => null,
    },
  });
  assert.equal(inputs.length, 4);
  assert.equal(inputs[2].conclusionRequired, true);
  assert.equal(inputs[2].turnsRemaining, 6);
  assert.equal(inputs[3].observations[0].data.reason, "conclusion_required");
  assert.equal(inputs[3].workingMemory, "late research must be rejected");
  assert.equal(renderCalls, 1);
  assert.equal(result.report.modelCalls, 4);
  assert.equal(result.report.steps.read.declined, 19);
  assert.ok(result.report.perOpening.every((opening) => opening.outcome === "not_read"));
});

test("runDrawingAgent: a tiny floor-plan marker cannot authorize opening composition", async () => {
  const inputs = [];
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }] },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical",
      orientation: "W", elevation: "A", roomLabel: "STUDY", storey: "ground",
      evidenceView: "elevation", evidenceRenderId: "r_001_01", frameBoxPt: [1, 1, 3, 3],
      confidence: "high", flags: [], basis: ["A tiny W1 marker is visible on the floor plan."], note: null,
    }] },
    { action: "finish" },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 2_050, heightMm: 1_435, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN W1 STUDY", words: [] }],
    },
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift() ?? { action: "finish" }; },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(inputs[2].observations[0].data.rejected[0].reason, "composition_evidence_not_close_up");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].confidence, "low");
});

test("runDrawingAgent: an invalid model batch gets feedback and the next turn can recover", async () => {
  const inputs = [];
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }] },
    null,
    { action: "emit", records: [{
      tag: "W1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical",
      orientation: "W", elevation: "A", roomLabel: "STUDY", storey: "ground",
      evidenceView: "elevation", evidenceRenderId: "r_001_01", frameBoxPt: [10, 10, 40, 40],
      confidence: "high", flags: [], basis: ["W1 opening frame is visible on elevation A."], note: null,
    }] },
    { action: "finish" },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 2_050, heightMm: 1_435, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A W1", words: [] }],
    },
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift(); },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(inputs[2].observations[0].data.reason, "invalid_action");
  assert.equal(inputs[2].imageDataUrls[0].renderId, "r_001_01");
  assert.deepEqual(inputs[2].renderCatalog.map((render) => render.renderId), ["r_001_01"]);
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.equal(result.readings[0].split.axis, "vertical");
});

test("runDrawingAgent: a broad W1 locator is automatically cropped and reread without a planning turn", async () => {
  const inputs = [];
  let calls = 0;
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150, bboxPt: [50, 50, 1140, 420] }] },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.5, 0.5], divisionAxis: "vertical",
      orientation: "N", elevation: "A", roomLabel: "BED 1", storey: "first",
      evidenceView: "elevation", evidenceRenderId: "r_001_01", frameBoxPt: [425, 140, 495, 220],
      confidence: "high", flags: [], basis: ["Broad elevation view."], note: null,
    }] },
    { action: "emit", records: [{
      tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.4, 0.6], divisionAxis: "vertical",
      orientation: "N", elevation: "A", roomLabel: "BED 1", storey: "first",
      evidenceView: "elevation", evidenceRenderId: "r_002_repair_01", frameBoxPt: [425, 140, 495, 220],
      confidence: "high", flags: [], basis: ["Close crop shows the offset mullion."], note: null,
    }] },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "OFFSET AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 1200, heightPt: 800, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => { calls++; inputs.push(input); return actions.shift() ?? { action: "finish" }; },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 })),
        dpi: request.dpi,
      }),
      store: async (renderId) => "projects/p/crops/r/" + renderId + ".png",
    },
  });
  assert.equal(inputs[2].observations[0].data.rejected[0].reason, "composition_evidence_not_close_up");
  assert.equal(inputs[2].observations[0].data.repairs[0].renderId, "r_002_repair_01");
  assert.equal(inputs[2].imageDataUrls[0].renderId, "r_002_repair_01");
  assert.equal(calls, 3, "accepted final batch does not spend another model call on finish");
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.derivedWidthMm), [820, 1230]);
});

test("runDrawingAgent: plan context rejects a conflicting room and remains authoritative", async () => {
  const inputs = [];
  const proposal = {
    tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.4, 0.6], divisionAxis: "vertical",
    orientation: "N", elevation: "A", roomLabel: "BED 1", storey: "first",
    evidenceView: "elevation", evidenceRenderId: "r_001_01", frameBoxPt: [10, 10, 80, 80],
    confidence: "high", flags: [], basis: ["Opening composition is visible."], note: null,
  };
  const actions = [
    { action: "render", requests: [{ pageNo: 1, dpi: 150 }] },
    { action: "emit", records: [proposal] },
    { action: "decline", records: [{ tag: "W1", reason: "Rendered frame conflicts with authoritative STUDY context." }] },
  ];
  const result = await runDrawingAgent({
    fileId: "f1",
    scheduleRows: [{
      tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "OFFSET AWNING",
      roomLabel: "STUDY", storey: "ground",
    }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => { inputs.push(input); return actions.shift() ?? { action: "finish" }; },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi }),
      store: async (renderId) => "projects/p/crops/r/" + renderId + ".png",
    },
  });
  assert.equal(inputs[2].observations[0].data.rejected[0].reason, "plan_context_conflict");
  assert.equal(inputs[2].imageDataUrls[0].renderId, "r_001_01");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].roomLabel, "STUDY");
  assert.match(result.readings[0].gapNote, /storey:ground/);
});
