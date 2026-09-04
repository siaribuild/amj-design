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
      export { buildFullDocumentHarvest, applyVisualNorthToHarvest, validateFullDocumentTurn, runFullDocumentAgent, makeFullDocumentAgentSkill, FULL_DOCUMENT_AGENT_LIMITS } from ${p("worker/lib/drawing/fullDocumentAgent.ts")};
      export { buildFullDocumentHarvest as buildHarvest, applyVisualNorthToHarvest as applyVisualNorth } from ${p("worker/lib/drawing/harvest.ts")};
      export { StageCallError } from ${p("worker/lib/ai/stage.ts")};
      export { applyDrawingConsistencyFlags, drawingFaceKey } from ${p("worker/lib/drawing/consistency.ts")};
      export { measureSplit, composeMeasuredSplit } from ${p("worker/lib/drawing/measure.ts")};
      export { parseCompositionComment } from ${p("worker/lib/drawing/comments.ts")};
      export { compositionFromSchedule, reconcileReading } from ${p("worker/lib/drawing/reconcile.ts")};
      export { elevationInventorySkill, validateFloorplanRead, northArrowSkill, openingReadSkill } from ${p("worker/lib/drawing/skills.ts")};
      export { assignOpenings } from ${p("worker/lib/drawing/assign.ts")};
      export * as readings from ${p("worker/lib/drawing/readings.ts")};
      export { applyDrawingOrientation, conflictReason, persistReadings } from ${p("worker/lib/drawing/readings.ts")};
      export { enrichOpenings, runDrawingEnrichmentStage, drawingParserMode } from ${p("worker/lib/drawing/enrich.ts")};
      export { runGate } from ${p("scripts/drawing-gate.mjs")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  external: ["cloudflare:workers"],
});
const { validateAgentTurn, runDrawingAgent, makeDrawingAgentSkill, DRAWING_AGENT_LIMITS } = await import(pathToFileURL(outfile).href);
const { buildHarvest, applyVisualNorth, applyVisualNorthToHarvest, buildFullDocumentHarvest, validateFullDocumentTurn, runFullDocumentAgent, makeFullDocumentAgentSkill, FULL_DOCUMENT_AGENT_LIMITS, StageCallError, applyDrawingConsistencyFlags, drawingFaceKey, drawingParserMode, cropKey, purgeProjectCrops, MAX_PDF_BYTES, MAX_PAGES, MAX_CROPS_PER_PAGE, MAX_DPI, inspectPdf, renderPage, ContainerClientError, INSPECT_TIMEOUT_MS, RENDER_TIMEOUT_MS, chooseStrategy, selectPages, elevationRegions, boxesByRegion, elevationOrderKey, locateFloorplanPage, orientationsFromNorth, resolveNorth, mapPool, measureSplit, composeMeasuredSplit, parseCompositionComment, compositionFromSchedule, reconcileReading, elevationInventorySkill, validateFloorplanRead, northArrowSkill, openingReadSkill, assignOpenings, applyDrawingOrientation, conflictReason, persistReadings, readings, enrichOpenings, runDrawingEnrichmentStage, runGate } = await import(pathToFileURL(outfile).href);

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

test("selectPages: incidental page text cannot turn an elevation or index into a floor plan", () => {
  const pages = [
    { pageNo: 1, text: "INDEX A1 SITE PLAN A3 GROUND FLOOR PLAN A5 ELEVATIONS", words: [
      { text: "A0", x0: 900, top: 760, x1: 920, bottom: 775 },
    ] },
    { pageNo: 2, text: "BOUNDARY NOTES SITE PLAN", words: [
      { text: "SITE", x0: 500, top: 740, x1: 535, bottom: 755 },
      { text: "PLAN", x0: 540, top: 740, x1: 575, bottom: 755 },
    ] },
    { pageNo: 6, text: "FIRST FLOOR CEILING RL 5.650 ELEVATION A", words: [
      { text: "ELEVATIONS", x0: 500, top: 740, x1: 590, bottom: 755 },
    ] },
  ];
  const { selected } = selectPages(inv(pages.map((page) => pageFacts({ pageNo: page.pageNo, widthPt: 1_000, heightPt: 800 }))), pages);
  assert.deepEqual(selected.map(({ pageNo, tier }) => ({ pageNo, tier })), [
    { pageNo: 2, tier: "siteplan" },
    { pageNo: 6, tier: "elevation" },
  ]);
});

test("selectPages: elevation title remains visible inside a multi-column title-block row", () => {
  const page = { pageNo: 6, text: "FIRST FLOOR CEILING RL 5.650 ELEVATION A", words: [
    { text: "PROPOSED", x0: 300, top: 740, x1: 370, bottom: 755 },
    { text: "RESIDENCE", x0: 375, top: 740, x1: 450, bottom: 755 },
    { text: "ELEVATIONS", x0: 500, top: 740, x1: 590, bottom: 755 },
    { text: "DRAWN", x0: 650, top: 740, x1: 700, bottom: 755 },
    { text: "BY", x0: 705, top: 740, x1: 725, bottom: 755 },
  ] };
  const { selected } = selectPages(inv([pageFacts({ pageNo: 6, widthPt: 1_000, heightPt: 800 })]), [page]);
  assert.deepEqual(selected.map(({ tier }) => tier), ["elevation"]);
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

test("selectPages: named facade title lines are elevation sheets", () => {
  const pages = [
    "NORTH ELEVATION", "SOUTH ELEVATION", "EAST ELEVATION", "WEST ELEVATION",
    "FRONT ELEVATION", "REAR ELEVATION", "LHS ELEVATION", "RHS ELEVATION",
  ].map((text, index) => pt(index + 1, text));
  const { selected } = selectPages(inv(pages.map((page) => pageFacts({ pageNo: page.pageNo }))), pages);
  assert.deepEqual(selected.map(({ pageNo, tier }) => [pageNo, tier]), [
    [1, "elevation"], [2, "elevation"], [3, "elevation"], [4, "elevation"],
    [5, "elevation"], [6, "elevation"], [7, "elevation"], [8, "elevation"],
  ]);
});

test("selectPages: side facade names and title-block metadata remain elevation sheets", () => {
  const pages = [
    "SIDE ELEVATION", "LEFT ELEVATION", "RIGHT ELEVATION",
    "LEFT SIDE ELEVATION", "RIGHT SIDE ELEVATION",
    "EAST ELEVATION SCALE 1:100", "EAST ELEVATION 1:100", "RIGHT SIDE ELEVATION 1 / 100 A2",
    "SOUTH ELEVATION A2", "SIDE ELEVATION REV B",
  ].map((text, index) => pt(index + 1, text));
  const { selected } = selectPages(inv(pages.map((page) => pageFacts({ pageNo: page.pageNo }))), pages);
  assert.deepEqual(selected.map(({ pageNo, tier }) => [pageNo, tier]), pages.map((page) => [page.pageNo, "elevation"]));
});

test("selectPages: level plan title forms are floor plans but section levels are not", () => {
  const pages = [
    pt(1, "LEVEL 1 PLAN"),
    pt(2, "PLAN - LEVEL 2"),
    pt(3, "GROUND LEVEL PLAN A2"),
    pt(4, "SECTION A\nLEVEL 1 10.000"),
  ];
  const { selected } = selectPages(inv(pages.map((page) => pageFacts({ pageNo: page.pageNo }))), pages);
  assert.deepEqual(selected.map(({ pageNo, tier }) => [pageNo, tier]), [
    [1, "floorplan"], [2, "floorplan"], [3, "floorplan"],
  ]);
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

test("locateFloorplanPage: sheet-referenced tag envelope ignores page notes and finds all four faces", () => {
  const words = [
    ["W1", 250, 350], ["W2", 500, 600], ["W3", 750, 350], ["D1", 500, 200],
  ].flatMap(([text, x0, top]) => [
    { text, x0, top, x1: x0 + 24, bottom: top + 15 },
    { text: "S08", x0, top: top + 16, x1: x0 + 26, bottom: top + 31 },
  ]);
  words.push(
    { text: "A", x0: 205, top: 350, x1: 215, bottom: 365 },
    { text: "B", x0: 500, top: 635, x1: 510, bottom: 650 },
    { text: "C", x0: 890, top: 350, x1: 900, bottom: 365 },
    { text: "D", x0: 500, top: 160, x1: 510, bottom: 175 },
    { text: "STUDY", x0: 300, top: 340, x1: 350, bottom: 355 },
    { text: "KITCHEN", x0: 480, top: 540, x1: 550, bottom: 555 },
    { text: "MEALS", x0: 650, top: 340, x1: 700, bottom: 355 },
    { text: "ENTRY", x0: 480, top: 250, x1: 530, bottom: 265 },
    { text: "CONSTRUCTION", x0: 30, top: 40, x1: 130, bottom: 55 },
    { text: "SPECIFICATION", x0: 850, top: 700, x1: 970, bottom: 715 },
  );
  const result = locateFloorplanPage({ pageNo: 4, text: "GROUND FLOOR PLAN", words }, { widthPt: 1_000, heightPt: 800 }, ["W1", "W2", "W3", "D1"]);
  assert.deepEqual(result.markerEdges, { A: "left", B: "bottom", C: "right", D: "top" });
  assert.deepEqual(Object.fromEntries(Object.entries(result.placements).map(([tag, value]) => [tag, value.elevation])), {
    W1: "A", W2: "B", W3: "C", D1: "D",
  });
});

test("locateFloorplanPage: title block owns storey over incidental schedule text", () => {
  const words = [
    ["W1", 250, 350], ["W2", 500, 600], ["W3", 750, 350], ["D1", 500, 200],
  ].flatMap(([text, x0, top]) => [
    { text, x0, top, x1: x0 + 24, bottom: top + 15 },
    { text: "S08", x0, top: top + 16, x1: x0 + 26, bottom: top + 31 },
  ]);
  words.push(
    { text: "A", x0: 205, top: 350, x1: 215, bottom: 365 },
    { text: "B", x0: 500, top: 635, x1: 510, bottom: 650 },
    { text: "C", x0: 790, top: 350, x1: 800, bottom: 365 },
    { text: "D", x0: 500, top: 160, x1: 510, bottom: 175 },
    { text: "GROUND", x0: 500, top: 740, x1: 560, bottom: 755 },
    { text: "FLOOR", x0: 565, top: 740, x1: 610, bottom: 755 },
    { text: "PLAN", x0: 615, top: 740, x1: 650, bottom: 755 },
  );
  const result = locateFloorplanPage({ pageNo: 4, text: "FIRST FLOOR DOOR SCHEDULE GROUND FLOOR PLAN", words }, { widthPt: 1_000, heightPt: 800 }, ["W1", "W2", "W3", "D1"]);
  assert.ok(Object.values(result.placements).every(({ storey }) => storey === "ground"));
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
  assert.deepEqual(northArrowSkill.validate({
    northArrowDegrees: 450, source: "arrow", evidenceBoxNorm: [0.8, 0.1, 0.9, 0.3],
  }), {
    northArrowDegrees: 90, source: "arrow", evidenceBoxNorm: [0.8, 0.1, 0.9, 0.3],
  });
  assert.deepEqual(northArrowSkill.validate({
    northArrowDegrees: 2, source: "survey_bearings", evidenceBoxNorm: [0.3, 0.2, 0.7, 0.8],
  }), {
    northArrowDegrees: 2, source: "survey_bearings", evidenceBoxNorm: [0.3, 0.2, 0.7, 0.8],
  });
  assert.equal(northArrowSkill.validate({ northArrowDegrees: "right", source: "arrow" }), null);
  assert.equal(northArrowSkill.validate({ northArrowDegrees: 0, source: "arrow", evidenceBoxNorm: [0.9, 0.1, 0.8, 0.3] }), null);
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
  const offset = measureSplit(undefined, [0.35, 0.65], 2050);
  assert.deepEqual(offset.derivedWidthsMm, [720, 1330]);
  assert.equal(offset.derivedWidthsMm.reduce((sum, width) => sum + width, 0), 2050);
  const split = composeMeasuredSplit(["awning", "fixed"], measured);
  assert.equal(split.units[0].operation, "awning");
  assert.equal(split.units[0].role, "operable");
  assert.equal(split.units[1].role, "passive");
});

test("measureSplit: a double-stroke mullion is one physical divider", () => {
  const measured = measureSplit({ mullionXs: [0.49, 0.51], transomYs: [] }, undefined, 1_800);
  assert.deepEqual(measured?.derivedWidthsMm, [900, 900]);
});

test("parseCompositionComment and reconcileReading preserve contradictions as flags", () => {
  assert.deepEqual(parseCompositionComment("2x 600mm WIDE AWNINGS RIGHT TO LEFT"), {
    count: 2, unitWidthMm: 600, operation: "awning", direction: "rtl",
  });
  const result = reconcileReading({
    split: { units: [{ role: "operable", operation: "awning", ratio: 1, derivedWidthMm: 1500 }], axis: "vertical" },
    widthMm: 1500,
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

test("reconcileReading: D1 keeps the stated door width and gives the last panel the exact remainder", () => {
  const result = reconcileReading({
    split: { units: [
      { role: "operable", operation: "hinged", ratio: 0.67 },
      { role: "passive", operation: "fixed", ratio: 0.33 },
    ], axis: "vertical" },
    widthMm: 1380, scheduleType: "HINGED", commentText: "920 DOOR & 1N° SIDELIGHT",
    modelConfidence: "high", northAssumed: false,
  });
  assert.deepEqual(result.composition.units.map((unit) => unit.operation), ["hinged", "sidelight"]);
  assert.deepEqual(result.composition.units.map((unit) => unit.derivedWidthMm), [920, 460]);
  assert.equal(result.composition.units.reduce((sum, unit) => sum + unit.derivedWidthMm, 0), 1380);
});

test("reconcileReading: agreement stays high and preserves measured geometry", () => {
  const split = { units: [{ role: "operable", operation: "awning", ratio: 1, derivedWidthMm: 900 }], axis: "vertical" };
  const result = reconcileReading({
    split, widthMm: 900, scheduleType: "AWNING", modelConfidence: "high", northAssumed: false,
  });
  assert.equal(result.confidence, "high");
  assert.deepEqual(result.flags, []);
  assert.deepEqual(result.composition, split);
});

test("reconcileReading: stated component widths win and the unstated panel takes the exact remainder", () => {
  const result = reconcileReading({
    split: { units: [
      { role: "passive", operation: "fixed", ratio: 0.2 },
      { role: "passive", operation: "fixed", ratio: 0.6 },
      { role: "passive", operation: "fixed", ratio: 0.2 },
    ], axis: "vertical" },
    widthMm: 3200,
    scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS",
    modelConfidence: "high", northAssumed: false,
  });
  assert.deepEqual(result.composition.units.map((unit) => unit.operation), ["awning", "fixed", "awning"]);
  assert.deepEqual(result.composition.units.map((unit) => unit.ratio), [0.1875, 0.625, 0.1875]);
  assert.deepEqual(result.composition.units.map((unit) => unit.derivedWidthMm), [600, 2000, 600]);
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
    split, widthMm: 3200, scheduleType: "AWNING", commentText: "2x 600mm WIDE AWNINGS",
    modelConfidence: "low", northAssumed: false, visible: false,
  });
  assert.equal(result.confidence, "low");
  assert.ok(result.flags.includes("notVisibleOnElevations"));
  assert.ok(result.flags.includes("agentEvidenceWeak"), "model confidence stays distinguishable from field-specific warnings");
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

test("purgeProjectCrops: the harvest cache dies with the crops - same evidence, same window", async () => {
  // The harvest is not metadata. It holds pages[].textExcerpt,
  // tagCandidates[].nearbyText, roomLabelCandidates[].text and the schedule's
  // commentText - verbatim text lifted from the customer's drawings, across the
  // whole document. A crop is one opening; this is the drawing set. The owner's
  // retention ruling (2026-08-29, CONTEXT.md "Crop evidence") ends the review
  // window at draft-cleared, quote-issued or quote-voided, and this is the same
  // class of evidence, so it ends there too.
  //
  // ONLY `runs/harvest/`, never all of `runs/`: the test above pins that
  // `runs/<year>/stage.json` has a different lifecycle and survives.
  const bucket = fakeBucket([
    "projects/proj_1/crops/run_1/W1.png",
    "projects/proj_1/runs/harvest/fa_1.harvest-v1.json",
    "projects/proj_1/runs/2026/stage.json",              // different lifecycle - survives
    "projects/proj_2/runs/harvest/fa_9.harvest-v1.json", // different project - survives
  ]);
  await purgeProjectCrops({ FILES: bucket }, "proj_1");
  assert.deepEqual([...bucket.store.keys()].sort(), [
    "projects/proj_1/runs/2026/stage.json",
    "projects/proj_2/runs/harvest/fa_9.harvest-v1.json",
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

test("applyDrawingOrientation: a composition consistency warning cannot suppress Stage A heading", () => {
  const model = { openings: [{ externalRef: "W1", wallOrientation: null, wallOrientationSource: null }] };
  applyDrawingOrientation(model, [{
    externalRef: "W1", orientationState: "value", orientation: "E",
    confidence: "low", flags: ["drawingInconsistency"],
  }]);
  assert.equal(model.openings[0].wallOrientation, "E");
  assert.equal(model.openings[0].wallOrientationSource, "plan");
});

test("runGate: labels must contain only known fields and assert something scoreable", () => {
  const reading = {
    external_ref: "W1",
    orientation_state: "value",
    orientation: "N",
  };

  for (const label of [undefined, {}, { orientaton: "N" }, { orientation: "N", orientaton: "N" }, { drawn: true }]) {
    const result = runGate([reading], { W1: label });
    assert.equal(result.perOpening[0].verdict, "mismatch");
    assert.equal(result.summary.matched, 0);
    assert.match(result.perOpening[0].note, /invalid label/i);
  }

  assert.equal(runGate([reading], { W1: { orientation: "N" } }).summary.matched, 1);
  assert.equal(runGate([reading], { W1: { drawn: false } }).summary.matched, 1);
});

test("AC-6: semantic gate scores ordered operations and only asserted widths and rooms", async () => {
  const labels = JSON.parse(await readFile(join(projectRoot, "scripts/tests/fixtures/plan-parse-labels.json"), "utf8"));
  const readings = [
    { external_ref: "W8", split_state: "value", split_json: JSON.stringify({ axis: "vertical", units: [{ role: "passive", operation: "fixed", ratio: 1, derivedWidthMm: 1450 }] }), room_state: "value", room_label: "BED 2" },
    { external_ref: "W10", split_state: "value", split_json: JSON.stringify({ axis: "vertical", units: [{ role: "operable", operation: "awning", ratio: 0.5, derivedWidthMm: 725 }, { role: "passive", operation: "fixed", ratio: 0.5, derivedWidthMm: 725 }] }), room_state: "not_read", room_label: null },
    { external_ref: "D1", split_state: "value", split_json: JSON.stringify({ axis: "vertical", units: [{ role: "operable", operation: "hinged", ratio: 920 / 1380, derivedWidthMm: 920 }, { role: "passive", operation: "sidelight", ratio: 460 / 1380, derivedWidthMm: 460 }] }), room_state: "not_read", room_label: null },
  ];
  const result = runGate(readings, { W8: labels.W8, W10: labels.W10, D1: labels.D1 });
  assert.deepEqual(result.perOpening.map(({ externalRef, verdict }) => [externalRef, verdict]), [
    ["D1", "match"], ["W10", "match"], ["W8", "match"],
  ]);
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

test("schedule comments populate the quote note without overwriting a user note", async () => {
  assert.equal(typeof readings.applyScheduleNotes, "function");
  const statements = [];
  const fakeDb = {
    prepare: (sql) => ({ bind: (...args) => ({ sql, args }) }),
    batch: async (items) => { statements.push(...items); },
  };
  await readings.applyScheduleNotes({ DB: fakeDb }, "proj_1", [
    { externalRef: "W1", note: "DOUBLE GLAZED; 2X 600MM AWNING" },
    { externalRef: "W2", note: null },
  ]);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /room_label IS NULL OR room_label=''/);
  assert.deepEqual(statements[0].args, ["DOUBLE GLAZED; 2X 600MM AWNING", "proj_1", "W1"]);
});

test("schedule comments respect the quote note's 500-character boundary", async () => {
  const statements = [];
  const fakeDb = {
    prepare: (sql) => ({ bind: (...args) => ({ sql, args }) }),
    batch: async (items) => { statements.push(...items); },
  };
  await readings.applyScheduleNotes({ DB: fakeDb }, "proj_1", [
    { externalRef: "W1", note: "x".repeat(501) },
  ]);
  assert.equal(statements[0].args[0], "x".repeat(500));
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

test("flagged agent orientation remains review-only", () => {
  const model = { openings: [{ externalRef: "W1", wallOrientation: null, wallOrientationSource: null }] };
  const reading = {
    externalRef: "W1", orientationState: "value", orientation: "N",
    roomState: "value", roomLabel: "BED 1", confidence: "low", flags: ["agentEvidenceWeak"],
  };
  applyDrawingOrientation(model, [reading]);
  assert.equal(model.openings[0].wallOrientation, null);
});

test("AC-3: field-specific warnings block only orientation when they concern orientation", () => {
  const model = { openings: [
    { externalRef: "W1", wallOrientation: null, wallOrientationSource: null },
    { externalRef: "W2", wallOrientation: null, wallOrientationSource: null },
  ] };
  const readings = [
    {
      externalRef: "W1", orientationState: "value", orientation: "N",
      roomState: "value", roomLabel: "STUDY", confidence: "low", flags: ["northAssumed"],
    },
    {
      externalRef: "W2", orientationState: "value", orientation: "E",
      roomState: "value", roomLabel: "MEDIA", confidence: "low", flags: ["manufacturability"],
    },
  ];
  applyDrawingOrientation(model, readings);
  assert.equal(model.openings[0].wallOrientation, null, "unresolved north blocks orientation");
  assert.equal(model.openings[1].wallOrientation, "E", "manufacturability does not concern orientation");
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
        if (input.escalationRecords) return verifyCloseUpParents(input);
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

test("full-document harvest exposes free coordinate evidence without deciding the room", () => {
  const inspected = {
    inventory: {
      pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ],
    },
    pages: [
      { pageNo: 1, text: "GROUND FLOOR PLAN STUDY ENTRY W1", words: [
        { text: "STUDY", x0: 80, top: 90, x1: 130, bottom: 105 },
        { text: "W1", x0: 145, top: 100, x1: 165, bottom: 115 },
        { text: "ENTRY", x0: 180, top: 90, x1: 230, bottom: 105 },
      ] },
      { pageNo: 2, text: "NORTH ELEVATION", words: [] },
    ],
  };
  const harvest = buildFullDocumentHarvest(inspected, [{
    tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "OFFSET AWNING",
    roomLabel: "ENTRY", storey: "ground",
  }]);
  assert.equal(harvest.schedule[0].priorRoomCandidate, "ENTRY");
  assert.equal(harvest.tagCandidates[0].tag, "W1");
  assert.equal(harvest.tagCandidates[0].id, "W1_p1_1", "a sole tag without a sheet reference remains usable");
  assert.equal(harvest.tagCandidates[0].identityEvidence, "visual_required");
  assert.match(harvest.tagCandidates[0].nearbyText, /STUDY/);
  assert.match(harvest.tagCandidates[0].nearbyText, /ENTRY/);
  assert.equal("roomLabel" in harvest.tagCandidates[0], false, "the free harvest must not choose a room");
});

test("harvest.ts holds the one Stage A implementation both drawing engines share", () => {
  assert.equal(buildHarvest, buildFullDocumentHarvest, "fullDocumentAgent must re-export the shared harvest, never copy it");
  assert.equal(applyVisualNorth, applyVisualNorthToHarvest, "visual north application must have one implementation");
  const inspected = {
    inventory: {
      pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ],
    },
    pages: [
      { pageNo: 1, text: "GROUND FLOOR PLAN STUDY W1", words: [
        { text: "STUDY", x0: 80, top: 90, x1: 130, bottom: 105 },
        { text: "W1", x0: 145, top: 100, x1: 165, bottom: 115 },
        { text: "A", x0: 20, top: 300, x1: 30, bottom: 315 },
      ] },
      { pageNo: 2, text: "NORTH ELEVATION", words: [] },
    ],
  };
  const schedule = [{ tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "OFFSET AWNING", storey: "ground" }];
  const harvest = buildHarvest(inspected, schedule);
  assert.equal(JSON.stringify(harvest), JSON.stringify(buildFullDocumentHarvest(inspected, schedule)),
    "the moved harvest must stay byte-for-byte identical to the pre-move output");
  assert.equal(harvest.version, 1);
  assert.equal(harvest.tagCandidates[0].tag, "W1");
  const oriented = applyVisualNorth(harvest, 1, { northArrowDegrees: 90, source: "arrow", evidenceBoxNorm: [0.1, 0.1, 0.2, 0.2] });
  assert.equal(oriented.northEvidence.requiresVisualRead, false);
  assert.equal(oriented.northEvidence.visualEvidence.pageNo, 1);
});

test("full-document harvest publishes the complete free Stage A metadata contract", () => {
  const tagged = [
    ["W1", 250, 350], ["W2", 500, 600], ["W3", 750, 350], ["D1", 500, 200],
  ].flatMap(([text, x0, top]) => [
    { text, x0, top, x1: x0 + 24, bottom: top + 15 },
    { text: "S08", x0, top: top + 16, x1: x0 + 26, bottom: top + 31 },
  ]);
  const inspected = {
    inventory: { pageCount: 3, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
      { pageNo: 2, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 4, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 80, imageCount: 0, imageAreaFraction: 0 },
      { pageNo: 6, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 },
    ] },
    pages: [
      { pageNo: 2, text: "SITE PLAN NORTH COMPASS 268°22'10\"", words: [
        { text: "NORTH", x0: 45, top: 10, x1: 55, bottom: 20 },
        { text: "COMPASS", x0: 40, top: 50, x1: 60, bottom: 60 },
        { text: "268°22'10\"", x0: 300, top: 300, x1: 370, bottom: 315 },
        { text: "SITE", x0: 500, top: 740, x1: 535, bottom: 755 },
        { text: "PLAN", x0: 540, top: 740, x1: 575, bottom: 755 },
        { text: "A1", x0: 900, top: 760, x1: 920, bottom: 775 },
      ] },
      { pageNo: 4, text: "GROUND FLOOR PLAN", words: [
        ...tagged,
        { text: "A", x0: 205, top: 350, x1: 215, bottom: 365 },
        { text: "B", x0: 500, top: 635, x1: 510, bottom: 650 },
        { text: "C", x0: 790, top: 350, x1: 800, bottom: 365 },
        { text: "D", x0: 500, top: 160, x1: 510, bottom: 175 },
        { text: "STUDY", x0: 300, top: 340, x1: 350, bottom: 355 },
        { text: "GROUND", x0: 500, top: 740, x1: 560, bottom: 755 },
        { text: "FLOOR", x0: 565, top: 740, x1: 610, bottom: 755 },
        { text: "PLAN", x0: 615, top: 740, x1: 650, bottom: 755 },
        { text: "A3", x0: 900, top: 760, x1: 920, bottom: 775 },
      ] },
      { pageNo: 6, text: "ELEVATIONS FIRST FLOOR RL 5.650", words: [
        { text: "RL", x0: 300, top: 200, x1: 320, bottom: 215 },
        { text: "5.650", x0: 325, top: 200, x1: 365, bottom: 215 },
        { text: "ELEVATIONS", x0: 500, top: 740, x1: 590, bottom: 755 },
        { text: "A5", x0: 900, top: 760, x1: 920, bottom: 775 },
      ] },
    ],
  };
  const schedule = ["W1", "W2", "W3", "D1"].map((tag) => ({ tag, widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }));
  const harvest = buildFullDocumentHarvest(inspected, schedule);
  assert.equal(harvest.version, 1);
  assert.deepEqual(harvest.pages.map(({ pageNo, sheetId, tiers }) => ({ pageNo, sheetId, tiers })), [
    { pageNo: 2, sheetId: "A1", tiers: ["siteplan"] },
    { pageNo: 4, sheetId: "A3", tiers: ["floorplan"] },
    { pageNo: 6, sheetId: "A5", tiers: ["elevation"] },
  ]);
  assert.deepEqual(harvest.elevationMarkers.map(({ label, edge }) => ({ label, edge })), [
    { label: "A", edge: "left" }, { label: "B", edge: "bottom" },
    { label: "C", edge: "right" }, { label: "D", edge: "top" },
  ]);
  assert.deepEqual(Object.fromEntries(harvest.placements.map(({ tag, elevation, orientation }) => [tag, { elevation, orientation }])), {
    W1: { elevation: "A", orientation: "W" }, W2: { elevation: "B", orientation: "S" },
    W3: { elevation: "C", orientation: "E" }, D1: { elevation: "D", orientation: "N" },
  });
  assert.equal(harvest.roomLabelCandidates.some(({ text }) => text === "STUDY"), true);
  assert.deepEqual(harvest.rlDatums, [{ pageNo: 6, text: "RL 5.650", yPt: 207.5 }]);
  assert.equal(harvest.northEvidence.resolution.northArrowDegrees, 0);
  assert.equal(harvest.northEvidence.requiresVisualRead, false);
  assert.deepEqual(harvest.northEvidence.bearings.map(({ text }) => text), ["268°22'10\""]);
});

test("full-document harvest drops a legend decoy when the plan tag has an adjacent sheet reference", () => {
  const inspected = {
    inventory: {
      pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 1_000, heightPt: 700, rotation: 0, textChars: 60, imageCount: 0, imageAreaFraction: 0 }],
    },
    pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN W1 S08 W1 DENOTES WINDOW TYPE", words: [
      { text: "W1", x0: 120, top: 200, x1: 140, bottom: 215 },
      { text: "S08", x0: 120, top: 216, x1: 145, bottom: 231 },
      { text: "W1", x0: 920, top: 500, x1: 940, bottom: 515 },
      { text: "DENOTES", x0: 945, top: 500, x1: 990, bottom: 515 },
    ] }],
  };
  const harvest = buildFullDocumentHarvest(inspected, [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }]);
  assert.deepEqual(harvest.tagCandidates.map(({ id, boxPt, identityEvidence }) => ({ id, boxPt, identityEvidence })), [
    { id: "W1_p1_1", boxPt: [120, 200, 140, 215], identityEvidence: "sheet_reference" },
  ]);
});

test("full-document harvest keeps a sheet-referenced plan tag beside its scheduled width", () => {
  const inspected = {
    inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 1_000, heightPt: 700, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN 2050 W14 S08", words: [
      { text: "2050", x0: 100, top: 200, x1: 130, bottom: 215 },
      { text: "W14", x0: 134, top: 200, x1: 160, bottom: 215 },
      { text: "S08", x0: 134, top: 216, x1: 160, bottom: 231 },
    ] }],
  };
  const harvest = buildFullDocumentHarvest(inspected, [{ tag: "W14", widthMm: 2_050, heightMm: 1_200, typeText: "FIXED" }]);
  assert.deepEqual(harvest.tagCandidates.map(({ tag, identityEvidence }) => ({ tag, identityEvidence })), [
    { tag: "W14", identityEvidence: "sheet_reference" },
  ]);
});

test("full-document harvest drops a no-reference legend decoy outside the plan footprint", () => {
  const planWords = [
    ["LIVING", 180, 120], ["KITCHEN", 420, 120], ["BEDROOM", 650, 120],
    ["HALL", 180, 350], ["BATH", 420, 350], ["GARAGE", 650, 350],
    ["ENTRY", 180, 540], ["LAUNDRY", 420, 540], ["STORE", 650, 540],
  ].map(([text, x0, top]) => ({ text, x0, top, x1: x0 + 55, bottom: top + 15 }));
  const inspected = {
    inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 1_000, heightPt: 700, rotation: 0, textChars: 80, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN", words: [
      ...planWords,
      { text: "W1", x0: 100, top: 250, x1: 120, bottom: 265 },
      { text: "W1", x0: 930, top: 500, x1: 950, bottom: 515 },
      { text: "DENOTES", x0: 955, top: 500, x1: 995, bottom: 515 },
    ] }],
  };
  const harvest = buildFullDocumentHarvest(inspected, [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }]);
  assert.deepEqual(harvest.tagCandidates.map(({ boxPt, ambiguous }) => ({ boxPt, ambiguous })), [
    { boxPt: [100, 250, 120, 265], ambiguous: false },
  ]);
});

test("full-document harvest marks two plausible no-reference tag occurrences ambiguous", () => {
  const words = [
    ["LIVING", 180, 120], ["KITCHEN", 420, 120], ["BEDROOM", 650, 120],
    ["HALL", 180, 350], ["BATH", 420, 350], ["GARAGE", 650, 350],
    ["ENTRY", 180, 540], ["LAUNDRY", 420, 540], ["STORE", 650, 540],
  ].map(([text, x0, top]) => ({ text, x0, top, x1: x0 + 55, bottom: top + 15 }));
  words.push(
    { text: "W1", x0: 100, top: 250, x1: 120, bottom: 265 },
    { text: "W1", x0: 819, top: 250, x1: 839, bottom: 265 },
  );
  const inspected = {
    inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: [{ pageNo: 1, widthPt: 1_000, heightPt: 700, rotation: 0, textChars: 80, imageCount: 0, imageAreaFraction: 0 }] },
    pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN", words }],
  };
  const harvest = buildFullDocumentHarvest(inspected, [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }]);
  assert.equal(harvest.tagCandidates.length, 2);
  assert.ok(harvest.tagCandidates.every((candidate) => candidate.ambiguous));
  assert.ok(harvest.tagCandidates.every((candidate) => candidate.identityEvidence === "visual_required"));
});

test("full-document agent fails closed after one invalid plan-page recovery", async () => {
  let modelCalls = 0;
  const progress = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "LEVEL 1", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        modelCalls++;
        return { action: "identify_page_roles", floorplanPages: [1], elevationPages: [], detailPages: [], memory: "Page 1 may be a plan." };
      },
      render: async () => { throw new Error("no render without a validated plan page"); },
      store: async () => null,
      onProgress: async (done, total, phase) => progress.push({ done, total, phase }),
    },
  });
  assert.equal(modelCalls, 1);
  assert.equal(result.report.steps.failedPhase, "floorplan_location");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].confidence, "low");
  assert.match(result.readings[0].gapNote, /floor-plan page/i);
  assert.deepEqual(progress.at(-1), { done: 1, total: 1, phase: "opening_read" });
});

test("full-document agent recovers one missed plan page before reading", async () => {
  let modelCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "LEVEL 1", words: [
          { text: "BEDROOM", x0: 100, top: 100, x1: 170, bottom: 115 },
          { text: "KITCHEN", x0: 500, top: 100, x1: 565, bottom: 115 },
          { text: "HALL", x0: 100, top: 400, x1: 140, bottom: 415 },
          { text: "LIVING", x0: 500, top: 400, x1: 555, bottom: 415 },
          { text: "W1", x0: 90, top: 250, x1: 110, bottom: 265 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        modelCalls++;
        if (modelCalls === 1) return {
          action: "identify_page_roles", floorplanPages: [1], elevationPages: [], detailPages: [],
          memory: "Page 1 is the plan.",
        };
        if (modelCalls === 2) return {
          action: "render",
          requests: [{ pageNo: 1, dpi: 150 }, { pageNo: 2, dpi: 200 }],
          memory: "Verify the recovered plan and read Elevation A.",
        };
        return {
          action: "emit", memory: "W1 resolved.", declines: [],
          records: [hybridRecord({
            planCandidateId: "W1_p1_1", planEvidenceRenderId: "fd_t002_01", planPageNo: 1,
            wallOrder: 1, facePageNo: 2, evidenceRenderId: "fd_t002_02",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(modelCalls, 3);
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.ok(result.report.steps.selectPages.selected.some((page) => page.pageNo === 1 && page.tier === "floorplan"));
});

test("full-document plan recovery refuses a schedule table that merely contains every opening tag", async () => {
  let modelCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 100, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "WINDOW SCHEDULE", words: [
          { text: "WINDOW", x0: 50, top: 50, x1: 110, bottom: 65 },
          { text: "SCHEDULE", x0: 300, top: 50, x1: 370, bottom: 65 },
          { text: "TYPE", x0: 600, top: 50, x1: 640, bottom: 65 },
          { text: "W1", x0: 80, top: 180, x1: 100, bottom: 195 },
          { text: "FIXED", x0: 300, top: 180, x1: 350, bottom: 195 },
          { text: "1000", x0: 600, top: 180, x1: 640, bottom: 195 },
          { text: "GLAZING", x0: 50, top: 350, x1: 120, bottom: 365 },
          { text: "CLEAR", x0: 600, top: 350, x1: 650, bottom: 365 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async () => {
        modelCalls++;
        if (modelCalls === 1) return {
          action: "identify_page_roles", floorplanPages: [1], elevationPages: [], detailPages: [],
          memory: "Page 1 lists W1.",
        };
        if (modelCalls === 2) return { action: "render", requests: [{ pageNo: 2, dpi: 200 }], memory: "Read elevation A." };
        return {
          action: "emit", memory: "W1 resolved.", declines: [],
          records: [hybridRecord({
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            facePageNo: 2, evidenceRenderId: "fd_t002_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(modelCalls, 1);
  assert.equal(result.report.steps.failedPhase, "floorplan_location");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
});

test("full-document page-role recovery admits a rendered EXTERNAL VIEWS sheet as elevation evidence", async () => {
  let modelCalls = 0;
  const inputs = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [
          { text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 },
          { text: "S08", x0: 100, top: 116, x1: 125, bottom: 131 },
        ] },
        { pageNo: 2, text: "EXTERNAL VIEWS", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        inputs.push(input);
        modelCalls++;
        if (modelCalls === 1) return {
          action: "identify_page_roles",
          floorplanPages: [], elevationPages: [2], detailPages: [],
          memory: "Page 2 contains the external elevations.",
        };
        if (modelCalls === 2) return {
          action: "render", requests: [{ pageNo: 2, dpi: 200 }],
          memory: "Read the external views.",
        };
        return {
          action: "emit", memory: "W1 resolved.", declines: [],
          records: [hybridRecord({
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            facePageNo: 2, evidenceRenderId: "fd_t002_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(modelCalls, 3);
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.deepEqual(inputs[1].harvest.pages.find((page) => page.pageNo === 2).tiers, [],
    "recovered roles must not be laundered into deterministic page tiers");
  assert.ok(result.report.steps.selectPages.selected.some((page) =>
    page.pageNo === 2 && page.tier === "elevation" && page.reason.includes("agent recovery")));
});

test("full-document page-role recovery cannot promote a schedule-only sheet to elevation evidence", async () => {
  let modelCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 60, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [
          { text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 },
          { text: "S08", x0: 100, top: 116, x1: 125, bottom: 131 },
        ] },
        { pageNo: 2, text: "WINDOW SCHEDULE W1 1000 1200", words: [] },
      ],
    },
    deps: {
      runTurn: async () => {
        modelCalls++;
        if (modelCalls === 1) return {
          action: "identify_page_roles", floorplanPages: [], elevationPages: [2], detailPages: [],
          memory: "Page 2 is claimed as an elevation.",
        };
        if (modelCalls === 2) return { action: "render", requests: [{ pageNo: 2, dpi: 200 }], memory: "Read page 2." };
        return {
          action: "emit", memory: "W1 resolved from page 2.", declines: [],
          records: [hybridRecord({
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            facePageNo: 2, evidenceRenderId: "fd_t002_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(modelCalls, 1);
  assert.equal(result.report.steps.failedPhase, "elevation_inventory");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
});

test("full-document recovered elevation needs a stored whole-page overview before a crop can authorize composition", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [
          { text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 },
          { text: "S08", x0: 100, top: 116, x1: 125, bottom: 131 },
        ] },
        { pageNo: 2, text: "EXTERNAL VIEWS", words: [] },
      ],
    },
    deps: {
      runTurn: async () => {
        turn++;
        if (turn === 1) return {
          action: "identify_page_roles", floorplanPages: [], elevationPages: [2], detailPages: [],
          memory: "Page 2 may contain elevations.",
        };
        if (turn === 2) return {
          action: "render", requests: [{ pageNo: 2, dpi: 220, bboxPt: [100, 100, 500, 500] }],
          memory: "Read one crop from page 2.",
        };
        if (turn === 3) return {
          action: "emit", memory: "W1 resolved.", declines: [], records: [hybridRecord({
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            facePageNo: 2, evidenceRenderId: "fd_t002_01",
          })],
        };
        return {
          action: "emit", records: [], memory: "W1 cannot be verified.",
          declines: [{ tag: "W1", reason: "Recovered page lacks a whole-page overview.", facePageNo: 2, elevation: "A", storey: "ground" }],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 3, reasons: ["recovered_page_overview_required"] },
  ]);
  assert.equal(result.report.perOpening[0].outcome, "not_read");
});

test("full-document unclassified page evidence remains rejected without page-role recovery", async () => {
  let modelCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 3, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 3, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [{ text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 }] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
        { pageNo: 3, text: "EXTERNAL VIEWS", words: [] },
      ],
    },
    deps: {
      runTurn: async () => {
        modelCalls++;
        if (modelCalls === 1) return {
          action: "render", requests: [{ pageNo: 3, dpi: 200 }],
          memory: "Read page 3 without classifying it.",
        };
        return {
          action: "emit", memory: "W1 resolved.", declines: [],
          records: [hybridRecord({
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            facePageNo: 3, evidenceRenderId: "fd_t001_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.ok(result.report.perOpening[0].corrections[0].reasons.includes("evidence_page_not_elevation_or_detail"));
});

test("full-document page-role recovery can be used only once", async () => {
  const inputs = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [{ text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 }] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        inputs.push(input);
        if (inputs.length <= 2) return {
          action: "identify_page_roles",
          floorplanPages: [], elevationPages: [2], detailPages: [],
          memory: "Classify page 2.",
        };
        return {
          action: "emit", records: [], memory: "W1 cannot be read.",
          declines: [{ tag: "W1", reason: "Not visible." }],
        };
      },
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
    },
  });
  assert.equal(result.report.modelCalls, 3);
  assert.deepEqual(inputs[2].observations, [{ tool: "identify_page_roles", error: "recovery_already_used" }]);
});

test("full-document harvest bounds repeated tag context and total page text", () => {
  const repeatedWords = Array.from({ length: 20 }, (_, index) => ({
    text: "W1", x0: index * 10, top: 20, x1: index * 10 + 8, bottom: 30,
  }));
  const pages = Array.from({ length: 60 }, (_, index) => ({
    pageNo: index + 1,
    text: `GROUND FLOOR PLAN ${"ROOM ".repeat(1_000)}`,
    words: repeatedWords,
  }));
  const inspected = {
    inventory: {
      pageCount: pages.length, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({ pageNo: page.pageNo, widthPt: 800, heightPt: 600, rotation: 0, textChars: page.text.length, imageCount: 0, imageAreaFraction: 0 })),
    },
    pages,
  };
  const harvest = buildFullDocumentHarvest(inspected, [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }]);
  assert.ok(harvest.tagCandidates.length <= FULL_DOCUMENT_AGENT_LIMITS.maxTagCandidatesPerTag);
  assert.ok(harvest.pages.reduce((sum, page) => sum + page.textExcerpt.length, 0) <= FULL_DOCUMENT_AGENT_LIMITS.maxHarvestTextChars);
});

const hybridRecord = (overrides = {}) => ({
  tag: "W1", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
  orientation: "N", elevation: "A", roomLabel: null, storey: "ground", faceOpeningCount: 1,
  planCandidateId: null, planEvidenceRenderId: null, planPageNo: null, wallOrder: null, facePageNo: null,
  evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
  confidence: "high", flags: [], basis: ["Visible opening on elevation A."], note: null,
  ...overrides,
});

const verifyCloseUpParents = (input) => ({
  action: "emit",
  memory: "Close-ups confirm the parent readings.",
  declines: [],
  records: input.escalationRecords.map((parent, index) => ({
    ...parent,
    evidenceRenderId: input.imageDataUrls[index].renderId,
    frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
    confidence: "high",
    flags: parent.flags.filter((flag) => !["agentEvidenceWeak", "notVisibleOnElevations", "duplicateFrame"].includes(flag)),
  })),
});

test("mandatory close-up prompt does not reveal the overview composition", () => {
  const parent = hybridRecord({
    tag: "W14",
    operations: ["fixed", "awning"],
    unitRatios: [0.65, 0.35],
    basis: ["The overview appears to show a fixed pane before an awning pane."],
  });
  const input = {
    turn: 1,
    harvest: { pages: [], schedule: [], tagCandidates: [], placements: [], elevationMarkers: [], northEvidence: {} },
    pendingTags: ["W14"], acceptedTags: [], declinedTags: [], workingMemory: "Review W14 independently.",
    observations: [{ tool: "render", renderId: "fd_review_W14", pageNo: 6, bboxPt: [10, 10, 50, 50], parentRecord: parent, parentFlags: [] }],
    renderCatalog: [{ renderId: "fd_review_W14", pageNo: 6, bboxPt: [10, 10, 50, 50], dpi: 300, widthPx: 500, heightPx: 500 }],
    imageDataUrls: [{ renderId: "fd_review_W14", dataUrl: "data:image/png;base64,aGVsbG8=" }],
    turnsRemaining: 1,
    escalationRecords: [parent],
  };

  const prompt = makeFullDocumentAgentSkill(["W14"], [6]).buildPrompt(input);
  const state = prompt.slice(prompt.lastIndexOf("\nSTATE\n"));
  assert.match(state, /\"tag\":\"W14\"/);
  assert.match(state, /\"elevation\":\"A\"/);
  assert.doesNotMatch(state, /\"operations\"/);
  assert.doesNotMatch(state, /\"unitRatios\"/);
  assert.doesNotMatch(state, /overview appears/i);
});

test("full-document contract accepts render-relative evidence boxes and rejects page-space model boxes", () => {
  const accepted = validateFullDocumentTurn({
    action: "emit", memory: "W1 resolved.", records: [hybridRecord()], declines: [],
  }, ["W1"], [1, 2]);
  assert.deepEqual(accepted.records[0].frameBoxNorm, [0.1, 0.1, 0.9, 0.9]);
  assert.equal(validateFullDocumentTurn({
    action: "emit", memory: "Old coordinate contract.",
    records: [{ ...hybridRecord(), frameBoxNorm: undefined, frameBoxPt: [20, 20, 120, 160] }], declines: [],
  }, ["W1"], [1, 2]).records.length, 0);
});

test("full-document agent binds a plan tag to wall order and maps crop-relative evidence back to page space", async () => {
  const inputs = [];
  const progress = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 2_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 24, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 11, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN W1 S08", words: [
          { text: "W1", x0: 100, top: 200, x1: 120, bottom: 215 },
          { text: "S08", x0: 100, top: 216, x1: 125, bottom: 231 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        inputs.push(input);
        if (input.turn === 1) return {
          action: "get_text_tokens", pages: [1], memory: "Map W1 to its plan wall.",
        };
        if (input.turn === 2) return {
          action: "render", memory: "Inspect elevation A.",
          requests: [{ pageNo: 2, dpi: 220, bboxPt: [200, 100, 600, 500] }],
        };
        if (input.turn === 3) return {
          action: "emit", memory: "Identity points at an unknown candidate.", declines: [],
          records: [hybridRecord({ planCandidateId: "W1_p1_99", planPageNo: 1, wallOrder: 1, evidenceRenderId: "fd_t002_01", frameBoxPt: [0.25, 0.25, 0.75, 0.75], frameBoxNorm: [0.25, 0.25, 0.75, 0.75] })],
        };
        return {
          action: "emit", memory: "W1 is first on its plan wall.", declines: [],
          records: [hybridRecord({ planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1, evidenceRenderId: "fd_t002_01", frameBoxPt: [0.25, 0.25, 0.75, 0.75], frameBoxNorm: [0.25, 0.25, 0.75, 0.75] })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 1_200, heightPx: 1_200 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      onProgress: async (done, total, phase) => progress.push({ done, total, phase }),
    },
  });
  assert.deepEqual(inputs[3].observations[0].rejected, [{ tag: "W1", reasons: ["identity_candidate_invalid"] }]);
  assert.deepEqual(result.readings[0].regionJson, [0.264, 0.205, 0.536, 0.545]);
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 3, reasons: ["identity_candidate_invalid"] },
    { turn: 1, stage: "escalation", outcome: "replaced", reasons: ["close_up_verified"] },
  ]);
  assert.equal(result.report.perOpening[0].acceptedTurn, 4);
  assert.deepEqual([...new Set(progress.map((item) => item.phase))], [
    "elevation_inventory", "floorplan_location", "render_crops", "opening_read",
  ]);
});

test("full-document agent lets plan-image wall binding correct a coarse footprint-edge placement", async () => {
  const elevationWords = (label) => [
    { text: "ELEVATION", x0: 20, top: 80, x1: 60, bottom: 90 },
    { text: label, x0: 65, top: 80, x1: 72, bottom: 90 },
  ];
  const pages = [
    { pageNo: 1, text: "GROUND FLOOR PLAN", words: [] },
    { pageNo: 2, text: "ELEVATION B", words: elevationWords("B") },
    { pageNo: 3, text: "ELEVATION A", words: elevationWords("A") },
  ];
  const inspected = {
    inventory: {
      pageCount: 3, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({
        pageNo: page.pageNo, widthPt: 100, heightPt: 100, rotation: 0,
        textChars: page.text.length, imageCount: 0, imageAreaFraction: 0,
      })),
    },
    pages,
  };
  const scheduleRows = [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }];
  const harvest = buildFullDocumentHarvest(inspected, scheduleRows);
  harvest.placements = [{
    tag: "W1", pageNo: 1, elevation: "A", orderOnWall: 1,
    roomLabelCandidate: null, storey: "ground", orientation: "W",
  }];
  harvest.elevationMarkers = [
    { pageNo: 1, label: "A", boxPt: [0, 40, 5, 45], edge: "left" },
    { pageNo: 1, label: "B", boxPt: [95, 40, 100, 45], edge: "right" },
  ];
  harvest.northEvidence.resolution = { northArrowDegrees: 0, source: "test north" };
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows, inspected, harvest,
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", memory: "Try B.", requests: [{ pageNo: 2, dpi: 200 }] };
        if (turn === 2) return {
          action: "emit", memory: "W1 appears on B.", declines: [],
          records: [hybridRecord({ elevation: "B", facePageNo: 2, evidenceRenderId: "fd_t001_01" })],
        };
        if (turn === 3) return { action: "render", memory: "Try A.", requests: [{ pageNo: 3, dpi: 200 }] };
        return {
          action: "emit", memory: "W1 confirmed on A.", declines: [],
          records: [hybridRecord({ facePageNo: 3, evidenceRenderId: "fd_t003_01" })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 500, heightPx: 500 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(turn, 2, "the visually established face should be accepted without correction");
  assert.equal(result.readings[0].pageNo, 2);
  assert.equal(result.readings[0].elevation, "B");
  assert.equal(result.readings[0].orientation, "E");
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 1, stage: "escalation", outcome: "replaced", reasons: ["close_up_verified"] },
  ]);
});

test("full-document fallback keeps a visually placed face when its opening is obscured", async () => {
  const pages = [
    { pageNo: 1, text: "GROUND FLOOR PLAN", words: [] },
    { pageNo: 2, text: "ELEVATION B", words: [] },
  ];
  const inspected = {
    inventory: {
      pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({
        pageNo: page.pageNo, widthPt: 100, heightPt: 100, rotation: 0,
        textChars: page.text.length, imageCount: 0, imageAreaFraction: 0,
      })),
    },
    pages,
  };
  const scheduleRows = [{ tag: "D1", widthMm: 820, heightMm: 2_040, typeText: "HINGED" }];
  const harvest = buildFullDocumentHarvest(inspected, scheduleRows);
  harvest.placements = [{
    tag: "D1", pageNo: 1, elevation: "A", orderOnWall: 1,
    roomLabelCandidate: null, storey: "ground", orientation: "W",
  }];
  harvest.elevationMarkers = [
    { pageNo: 1, label: "A", boxPt: [0, 40, 5, 45], edge: "left" },
    { pageNo: 1, label: "B", boxPt: [95, 40, 100, 45], edge: "right" },
  ];
  harvest.northEvidence.resolution = { northArrowDegrees: 0, source: "test north" };
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows, inspected, harvest,
    deps: {
      runTurn: async () => ++turn === 1
        ? { action: "render", memory: "Trace the door callout to its local wall.", requests: [{ pageNo: 1, dpi: 180 }] }
        : {
            action: "emit", memory: "Door placed on B but obscured there.", records: [],
            declines: [{ tag: "D1", reason: "Partly obscured by equipment.", facePageNo: 2, elevation: "B", storey: "ground" }],
          },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].elevation, "B");
  assert.equal(result.readings[0].orientation, "E");
  assert.match(result.readings[0].gapNote, /Partly obscured by equipment/);
});

test("full-document ambiguous plan candidate requires a stored plan render", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 800, heightPt: 600, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN", words: [
          { text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 },
          { text: "W1", x0: 600, top: 400, x1: 620, bottom: 415 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", requests: [{ pageNo: 2, dpi: 200 }], memory: "Read Elevation A." };
        if (turn === 3) return { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "Disambiguate the two W1 occurrences." };
        return {
          action: "emit", memory: "W1 resolved.", declines: [], records: [hybridRecord({
            planCandidateId: "W1_p1_1", planEvidenceRenderId: turn === 4 ? "fd_t003_01" : null,
            planPageNo: 1, wallOrder: 1, facePageNo: 2, evidenceRenderId: "fd_t001_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 2, reasons: ["identity_visual_evidence_required"] },
    { turn: 1, stage: "escalation", outcome: "replaced", reasons: ["close_up_verified"] },
  ]);
  assert.equal(result.report.perOpening[0].acceptedTurn, 4);
});

test("full-document no-reference plan candidate requires visual verification even when unique", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 40, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN W1", words: [
          { text: "LIVING", x0: 200, top: 100, x1: 260, bottom: 115 },
          { text: "KITCHEN", x0: 600, top: 100, x1: 670, bottom: 115 },
          { text: "BEDROOM", x0: 200, top: 450, x1: 275, bottom: 465 },
          { text: "GARAGE", x0: 600, top: 450, x1: 660, bottom: 465 },
          { text: "W1", x0: 180, top: 280, x1: 200, bottom: 295 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", requests: [{ pageNo: 2, dpi: 200 }], memory: "Read Elevation A." };
        if (turn === 3) return { action: "render", requests: [{ pageNo: 1, dpi: 150 }], memory: "Verify W1 is a plan callout." };
        return {
          action: "emit", memory: "W1 resolved.", declines: [], records: [hybridRecord({
            planCandidateId: "W1_p1_1", planEvidenceRenderId: turn === 4 ? "fd_t003_01" : null,
            planPageNo: 1, wallOrder: 1, facePageNo: 2, evidenceRenderId: "fd_t001_01",
          })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 1_000, heightPx: 800 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 2, reasons: ["identity_visual_evidence_required"] },
    { turn: 1, stage: "escalation", outcome: "replaced", reasons: ["close_up_verified"] },
  ]);
  assert.equal(result.report.perOpening[0].acceptedTurn, 4);
});

test("full-document parsing preserves visually read geometry regardless of downstream product limits", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 4_000, heightMm: 1_200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 11, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        return ++turn === 1
          ? { action: "render", memory: "Inspect elevation A.", requests: [{ pageNo: 1, dpi: 110 }] }
          : { action: "emit", memory: "One awning sash is drawn.", declines: [], records: [hybridRecord({ operations: ["awning"] })] };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.equal(result.readings[0].split.units[0].derivedWidthMm, 4_000);
  assert.equal(result.readings[0].flags.includes("manufacturability"), false);
});

test("full-document agent stops correcting one opening after two rejected attempts and records both", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 100, heightPt: 100, rotation: 0, textChars: 11, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN W1", words: [{ text: "W1", x0: 20, top: 20, x1: 30, bottom: 30 }] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
    },
    deps: {
      runTurn: async () => ++turn === 1
        ? { action: "render", memory: "Inspect elevation A.", requests: [{ pageNo: 2, dpi: 110 }] }
        : { action: "emit", memory: "Missing plan binding.", declines: [], records: [hybridRecord()] },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(turn, 3, "one initial investigation plus two rejected emits is the hard stop");
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.deepEqual(result.report.perOpening[0].corrections, [
    { turn: 2, reasons: ["identity_evidence_required"] },
    { turn: 3, reasons: ["identity_evidence_required"] },
  ]);
});

test("full-document report counts provider calls, repairs, tokens, and replayed turns truthfully", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 11, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        return ++turn === 1 ? {
            data: { action: "render", memory: "Replay the face render.", requests: [{ pageNo: 1, dpi: 110 }] },
            cached: true, modelCalls: 0, repaired: false, inputTokens: 0, outputTokens: 0,
          }
        : {
            data: { action: "emit", memory: "W1 resolved.", declines: [], records: [hybridRecord()] },
            cached: false, modelCalls: 2, repaired: true, inputTokens: 1_200, outputTokens: 180,
          };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.modelCalls, 3);
  assert.equal(result.report.cachedTurns, 1);
  assert.equal(result.report.repairedTurns, 1);
  assert.equal(result.report.inputTokens, 1_200);
  assert.equal(result.report.outputTokens, 180);
});

test("full-document provider-call budget reserves capacity for mandatory close-ups", async () => {
  let turns = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 11, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => {
        turns++;
        return { data: null, cached: false, modelCalls: 2, repaired: false, inputTokens: 100, outputTokens: 10 };
      },
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
    },
  });
  assert.equal(turns, 7, "main-loop repairs must leave provider capacity for close-up verification");
  assert.equal(result.report.modelCalls, 14);
});

test("full-document turn contract exposes bounded adaptive tools and rejects vocabulary escape", () => {
  const record = {
      tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.35, 0.65], divisionAxis: "vertical",
      orientation: "N", elevation: "03", storey: "ground", faceOpeningCount: 1,
      planCandidateId: "W1_p1_1", planEvidenceRenderId: null, planPageNo: 1, wallOrder: 1, facePageNo: 2,
      evidenceView: "elevation", evidenceRenderId: "fd_overview_02", frameBoxNorm: [0.1, 0.1, 0.6, 0.8],
      confidence: "high", flags: [], basis: ["North face order and visible offset mullion."], note: null,
  };
  assert.deepEqual(validateFullDocumentTurn({ action: "list_pages", memory: "Map the set." }, ["W1"], [1, 2]).action, "list_pages");
  assert.deepEqual(validateFullDocumentTurn({ action: "get_page_text", pages: [2], memory: "Read the title." }, ["W1"], [1, 2]).pages, [2]);
  assert.deepEqual(validateFullDocumentTurn({ action: "get_text_tokens", pages: [1], memory: "Locate W1." }, ["W1"], [1, 2]).pages, [1]);
  assert.deepEqual(
    validateFullDocumentTurn({
      action: "identify_page_roles", floorplanPages: [1], elevationPages: [2], detailPages: [],
      memory: "Recover missing roles.",
    }, ["W1"], [1, 2]).elevationPages,
    [2],
  );
  assert.equal(validateFullDocumentTurn({
    action: "render", requests: [{ pageNo: 2, dpi: 220, bboxPt: [0, 0, 400, 300] }], memory: "Read the face.",
  }, ["W1"], [1, 2]).requests[0].dpi, 220);
  assert.equal(validateFullDocumentTurn({
    action: "measure_lines", requests: [{ renderId: "r_face", axis: "vertical" }], memory: "Measure the mullion.",
  }, ["W1"], [1, 2]).action, "measure_lines");
  const emitted = validateFullDocumentTurn({ action: "emit", records: [record], memory: "W1 resolved." }, ["W1"], [1, 2]);
  assert.equal("roomLabel" in emitted.records[0], false);
  assert.deepEqual(
    validateFullDocumentTurn({
      action: "emit", records: [], memory: "W1 declined on face A.",
      declines: [{ tag: "W1", reason: "Illegible.", facePageNo: 2, elevation: "A", storey: "ground" }],
    }, ["W1"], [1, 2]).declines[0],
    { tag: "W1", reason: "Illegible.", facePageNo: 2, elevation: "A", storey: "ground" },
  );
  assert.deepEqual(
    validateFullDocumentTurn({ action: "emit", records: [{ ...record, tag: "W99" }], memory: "Invalid." }, ["W1"], [1, 2]).contractRejections,
    [{ tag: "W99", reasons: ["unknown_tag"] }],
  );
  assert.equal(validateFullDocumentTurn({ action: "finish", memory: "Coverage complete." }, ["W1"], [1, 2]).action, "finish");
  const skill = makeFullDocumentAgentSkill(["W1"], [1, 2]);
  assert.ok(skill.responseSchema.properties.action);
  assert.equal("roomLabel" in skill.responseSchema.properties.records.items.properties, false);
  assert.equal(skill.responseSchema.properties.records.items.required.includes("roomLabel"), false);
  assert.match(skill.buildPrompt({ imageDataUrls: [] }), /recovered.*planEvidenceRenderId/i);
  assert.equal(skill.promptVersion, "v19", "the full-document output contract excludes discarded room labels");
});

test("full-document emit rejection returns to the same agent and finish cannot hide missing coverage", async () => {
  const inputs = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        inputs.push(input);
        if (input.turn === 1) return { action: "finish", memory: "Too early." };
        if (input.turn === 2) return { action: "render", requests: [{ pageNo: 1, dpi: 200 }], memory: "Render A." };
        const evidenceRenderId = input.turn === 3 ? "missing" : "fd_t002_01";
        return {
          action: "emit", memory: "Emit W1.", records: [{
            tag: "W1", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
            orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
            evidenceView: "elevation", evidenceRenderId, frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
            confidence: "high", flags: [], basis: ["Visible fixed frame on Elevation A."], note: null,
          }],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(inputs[1].observations[0].reason, "finish_not_allowed_with_pending_openings");
  assert.deepEqual(inputs[3].observations[0].rejected, [{ tag: "W1", reasons: ["evidence_render_or_frame_invalid"] }]);
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.equal(result.readings[0].split.units[0].operation, "fixed");
});

test("full-document agent pre-attaches elevation overviews and can emit without a render-request turn", async () => {
  const inputs = [];
  const progress = [];
  const renderRequests = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{
      tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "OFFSET AWNING",
      roomLabel: "ENTRY", storey: "ground",
    }],
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "GROUND FLOOR PLAN W1 S08 STUDY ENTRY", words: [
          { text: "W1", x0: 20, top: 20, x1: 30, bottom: 30 },
          { text: "S08", x0: 20, top: 31, x1: 35, bottom: 41 },
        ] },
        { pageNo: 2, text: "ELEVATION A", words: [] },
      ],
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        inputs.push(input);
        return {
          action: "emit", memory: "All scheduled openings resolved.", declines: [],
          records: [{
            tag: "W1", operations: ["awning", "fixed"], unitRatios: [0.3, 0.7], divisionAxis: "vertical",
            orientation: "N", elevation: "A", roomLabel: "STUDY", storey: "ground",
            planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1,
            evidenceView: "elevation", evidenceRenderId: input.imageDataUrls[0]?.renderId ?? "missing", frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
            confidence: "high", flags: [], basis: ["W1 tag is beside STUDY; close elevation shows an offset mullion."], note: null,
          }],
        };
      },
      render: async (request) => {
        renderRequests.push(request);
        return { images: (request.crops ?? [null]).map(() => ({
          pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600,
          profile: { mullionXs: [1 / 3], transomYs: [] },
        })), dpi: request.dpi };
      },
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      onProgress: async (done, total, phase) => progress.push({ done, total, phase }),
    },
  });
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].harvest.schedule[0].priorRoomCandidate, "ENTRY");
  assert.equal(inputs[0].imageDataUrls.length, 1);
  assert.equal(inputs[0].imageDataUrls[0].renderId, "fd_overview_2");
  assert.ok(inputs[0].renderCatalog.some((item) => item.renderId === "fd_overview_2" && item.dpi === 180));
  assert.equal(renderRequests.length, 2, "the face overview is followed by mandatory close-up verification");
  assert.equal(result.report.steps.renderCrop.pagesRendered, 2);
  assert.equal(result.report.steps.renderCrop.cropsMade, 1);
  assert.equal(result.report.modelCalls, 2);
  assert.equal(result.readings[0].roomState, "not_stated");
  assert.equal(result.readings[0].roomLabel, null, "geometry evidence must not overwrite deterministic room context");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.derivedWidthMm), [615, 1435]);
  assert.deepEqual(progress.at(-1), { done: 1, total: 1, phase: "opening_read" });
});

test("full-document agent rounds visual ratios and never lets a line profile erase or leak between openings", async () => {
  let turn = 0;
  const renderRequests = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W20", widthMm: 1_800, heightMm: 1_200, typeText: "AWNING", commentText: "1x 600mm WIDE AWNING" },
      { tag: "W21", widthMm: 1_800, heightMm: 1_200, typeText: "AWNING" },
      { tag: "W22", widthMm: 1_800, heightMm: 1_200, typeText: "AWNING" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        return turn === 1
          ? { action: "render", memory: "Render the face.", requests: [{ pageNo: 1, dpi: 110 }] }
          : {
              action: "emit", memory: "Both frames appear 30/70.", declines: [],
              records: ["W20", "W21", "W22"].map((tag, index) => ({
                tag, operations: ["awning", "fixed"], unitRatios: [1 / 3, 2 / 3], divisionAxis: "vertical",
                orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
                evidenceView: "elevation", evidenceRenderId: "fd_t001_01",
                frameBoxNorm: [0.05 + index * 0.31, 0.1, 0.3 + index * 0.31, 0.9],
                confidence: "high", flags: [], basis: ["Two apparent panes."], note: null,
              })),
            };
      },
      render: async (request) => {
        renderRequests.push(request);
        return {
          images: (request.crops ?? [null]).map((_, index) => ({
            pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600,
            profile: { mullionXs: request.crops ? [[0.4], [0.5], []][index] : [], transomYs: [] },
          })),
          dpi: request.dpi,
        };
      },
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(renderRequests.length, 5, "one pre-attached overview plus one close-up per frame");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.derivedWidthMm), [600, 1_200]);
  assert.deepEqual(result.readings[1].split.units.map((unit) => unit.derivedWidthMm), [630, 1_170]);
  assert.deepEqual(result.readings[2].split.units.map((unit) => unit.derivedWidthMm), [630, 1_170]);
  assert.deepEqual(result.readings[2].split.units.map((unit) => unit.ratio), [0.35, 0.65]);
  assert.equal(result.readings[2].split.units.reduce((sum, unit) => sum + unit.derivedWidthMm, 0), 1_800);
});

test("AC-2: full-document rails flag a composition that omits the scheduled operation", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W10", widthMm: 1_450, heightMm: 1_200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        return turn === 1
          ? { action: "render", memory: "Render the face.", requests: [{ pageNo: 1, dpi: 110 }] }
          : {
              action: "emit", memory: "Two fixed panes are visible.", declines: [],
              records: [{
                tag: "W10", operations: ["fixed", "fixed"], unitRatios: [0.5, 0.5], divisionAxis: "vertical",
                orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
                evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
                confidence: "high", flags: [], basis: ["Two plain panes are visible."], note: null,
              }],
            };
      },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({
          pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600,
          profile: { mullionXs: [0.5], transomYs: [] },
        })),
        dpi: request.dpi,
      }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.operation), ["fixed", "fixed"]);
  assert.ok(result.readings[0].flags.includes("scheduleDrawingMismatch"));
  assert.equal(result.readings[0].confidence, "low");
});

test("AC-2: an awning schedule does not accept an all-awning multi-unit drawing", () => {
  const result = reconcileReading({
    split: {
      axis: "vertical",
      units: [
        { role: "operable", operation: "awning", ratio: 0.5, derivedWidthMm: 700 },
        { role: "operable", operation: "awning", ratio: 0.5, derivedWidthMm: 700 },
      ],
    },
    widthMm: 1_400,
    scheduleType: "AWNING",
    modelConfidence: "high",
    northAssumed: false,
  });
  assert.ok(result.flags.includes("scheduleDrawingMismatch"));
});

test("AC-8: one bounded batch review preserves close-up drawing conflicts as warnings", async () => {
  let turn = 0;
  const inputs = [];
  const renderRequests = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W2", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W3", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W10", widthMm: 1_450, heightMm: 1_200, typeText: "AWNING" },
      { tag: "W8", widthMm: 1_450, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION C AND D", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        inputs.push(input);
        turn++;
        if (turn === 1) return { action: "render", memory: "Render both faces.", requests: [{ pageNo: 1, dpi: 110 }] };
        if (input.escalationRecords) {
          return {
            action: "emit", memory: "Targeted records checked.", declines: [],
            records: input.escalationRecords.map((parent) => ({
              ...parent,
              operations: parent.tag === "W10" ? ["awning", "fixed"] : parent.operations,
              evidenceRenderId: input.imageDataUrls.find((image) => image.renderId.includes(parent.tag)).renderId,
              frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
              confidence: "high", flags: [],
            })),
          };
        }
        const record = (tag, operations, frameBoxNorm, confidence = "high", flags = []) => ({
          tag, operations, unitRatios: operations.map(() => 1 / operations.length), divisionAxis: "vertical",
          orientation: "N", elevation: tag === "W10" ? "C" : "D", roomLabel: null, storey: "first", planPageNo: null, wallOrder: null,
          evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm,
          confidence, flags, basis: ["Opening visible."], note: null,
        });
        return {
          action: "emit", memory: "Both openings read.", declines: [],
          records: [
            record("W1", ["fixed"], [0, 0.5, 0.2, 0.8], "low", ["agentEvidenceWeak"]),
            record("W2", ["fixed"], [0, 0.5, 0.2, 0.8], "low", ["agentEvidenceWeak"]),
            record("W3", ["fixed"], [0.6, 0.5, 0.8, 0.8], "low", ["agentEvidenceWeak"]),
            record("W10", ["fixed", "fixed"], [0, 0, 0.3, 0.3]),
            record("W8", ["awning", "fixed"], [0.6, 0, 0.9, 0.3]),
          ],
        };
      },
      render: async (request) => {
        renderRequests.push(request);
        return { images: (request.crops ?? [null]).map(() => ({
          pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600,
          profile: { mullionXs: [0.5], transomYs: [] },
        })), dpi: request.dpi };
      },
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  const escalations = inputs.filter((input) => input.escalationRecords);
  assert.equal(escalations.length, 1, "all close-ups share one provider call");
  assert.deepEqual(escalations[0].escalationRecords.map((record) => record.tag), ["W10", "W8", "W3"], "schedule conflicts outrank generic weak reads and duplicate identities do not consume close-up slots");
  assert.equal(renderRequests.filter((request) => request.threshold === 250).length, 3);
  const w10 = result.readings.find((reading) => reading.externalRef === "W10");
  const w8 = result.readings.find((reading) => reading.externalRef === "W8");
  assert.deepEqual(w10.split.units.map((unit) => unit.operation), ["awning", "fixed"]);
  assert.ok(!w10.flags.includes("scheduleDrawingMismatch"));
  assert.deepEqual(w8.split.units.map((unit) => unit.operation), ["awning", "fixed"]);
  assert.ok(w8.flags.includes("scheduleDrawingMismatch"), "a contradictory review cannot replace the original");
  assert.equal(result.report.steps.read.retriedWithThreshold, 0);
  assert.equal(result.report.steps.read.targetedReviews, 3);
  assert.ok(result.report.perOpening.find((item) => item.tag === "W10").corrections.some((item) =>
    item.stage === "escalation" && item.outcome === "replaced"));
  assert.ok(result.report.perOpening.find((item) => item.tag === "W8").corrections.some((item) =>
    item.stage === "escalation" && item.outcome === "replaced"));
});

test("full-document agent accepts composition only after a padded close-up verifies the overview", async () => {
  const pages = [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }];
  const captured = [];
  let mainTurn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: pages.length, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: pages.map((page) => ({
        pageNo: page.pageNo, widthPt: 100, heightPt: 100, rotation: 0, textChars: page.text.length, imageCount: 0, imageAreaFraction: 0,
      })) },
      pages,
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          return {
            action: "emit", memory: "Close-up verifies a 30/70 two-pane opening.", declines: [],
            records: [{
              ...input.escalationRecords[0], operations: ["fixed", "fixed"], unitRatios: [0.3, 0.7],
              evidenceRenderId: input.imageDataUrls[0].renderId, frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
              confidence: "high", flags: [], basis: ["Close-up visibly shows two panes."],
            }],
          };
        }
        mainTurn++;
        if (mainTurn === 1) return { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 200 }] };
        return {
          action: "emit", memory: "W1 located provisionally on the face.", declines: [],
          records: [{
            tag: "W1", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
            orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
            evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm: [0.2, 0.2, 0.4, 0.6],
            confidence: "high", flags: [], basis: ["Face view locates the opening."], note: null,
          }],
        };
      },
      render: async (request) => {
        captured.push(request);
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 100, heightPx: 100 }], dpi: request.dpi };
      },
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(captured.length, 3);
  assert.equal(captured[0].dpi, 180);
  assert.equal(captured[1].dpi, 200);
  assert.equal(captured[2].dpi, 300);
  assert.deepEqual(captured[2].crops, [[13, 6, 47, 74]], "the close-up keeps 35% surrounding context");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.operation), ["fixed", "fixed"]);
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.ratio), [0.3, 0.7]);
  assert.match(result.readings[0].cropKey, /fd_review_W1/);
});

test("full-document agent rejects a close-up that claims the whole crop is the opening", async () => {
  let mainTurn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return {
          action: "emit", memory: "The entire crop is the opening.", declines: [],
          records: [{
            ...input.escalationRecords[0], evidenceRenderId: input.imageDataUrls[0].renderId,
            frameBoxNorm: [0, 0, 1, 1], confidence: "high", flags: [],
          }],
        };
        mainTurn++;
        if (mainTurn === 1) return { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] };
        return {
          action: "emit", memory: "W1 located provisionally.", declines: [],
          records: [hybridRecord({ facePageNo: 1, frameBoxNorm: [0.2, 0.2, 0.4, 0.6] })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });

  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].gapCode, "model_declined");
  assert.match(result.readings[0].gapNote, /close-up validation failed/i);
});

test("full-document agent batches mandatory close-up verification beyond the active-image limit", async () => {
  const scheduleRows = Array.from({ length: 9 }, (_, index) => ({
    tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "FIXED",
  }));
  const reviewInputs = [];
  const progress = [];
  let mainTurn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows,
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          reviewInputs.push(input);
          return {
            action: "emit", memory: "Batch verified from close-ups.", declines: [],
            records: input.escalationRecords.map((parent, index) => ({
              ...parent, evidenceRenderId: input.imageDataUrls[index].renderId,
              frameBoxNorm: [0.1, 0.1, 0.9, 0.9], confidence: "high", flags: [],
            })),
          };
        }
        mainTurn++;
        if (mainTurn === 1) return { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] };
        return {
          action: "emit", memory: "All frames located.", declines: [],
          records: scheduleRows.map((row, index) => hybridRecord({
            tag: row.tag, facePageNo: 1,
            frameBoxNorm: [0.02 + index * 0.1, 0.2, 0.08 + index * 0.1, 0.4],
          })),
        };
      },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 })),
        dpi: request.dpi,
      }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      onProgress: async (done, total, phase) => progress.push({ done, total, phase }),
    },
  });
  assert.deepEqual(reviewInputs.map((input) => input.escalationRecords.length), [4, 4, 1]);
  assert.deepEqual(progress.filter(({ phase }) => phase === "opening_read").map(({ done }) => done), [0, 4, 8, 9, 9]);
  assert.equal(result.report.steps.read.targetedReviews, 9);
  assert.ok(result.report.perOpening.every((opening) =>
    opening.corrections.some((item) => item.stage === "escalation" && item.outcome === "replaced")));
});

test("full-document agent starts the next close-up batch as soon as a concurrency slot frees", async () => {
  const scheduleRows = Array.from({ length: 19 }, (_, index) => ({
    tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "AWNING",
  }));
  let active = 0;
  let maximumActive = 0;
  let started = 0;
  let releaseFirst;
  let releaseRest;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const restGate = new Promise((resolve) => { releaseRest = resolve; });
  let fourStarted;
  const ready = new Promise((resolve) => { fourStarted = resolve; });
  let fiveStarted;
  const nextReady = new Promise((resolve) => { fiveStarted = resolve; });
  const run = runFullDocumentAgent({
    fileId: "f1", scheduleRows,
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 1_000, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          active++;
          started++;
          const ordinal = started;
          maximumActive = Math.max(maximumActive, active);
          if (started === 4) fourStarted();
          if (started === 5) fiveStarted();
          await (ordinal === 1 ? firstGate : restGate);
          active--;
          return verifyCloseUpParents(input);
        }
        return {
          action: "emit", memory: "All frames located.", declines: [],
          records: scheduleRows.map((row, index) => {
            const x0 = 10 + (index % 5) * 180;
            const y0 = 10 + Math.floor(index / 5) * 200;
            return hybridRecord({
              tag: row.tag, operations: ["awning", "fixed"], unitRatios: [0.3, 0.7], facePageNo: 1,
              faceOpeningCount: null, evidenceRenderId: input.imageDataUrls[0]?.renderId ?? "missing",
              frameBoxNorm: [x0 / 1_000, y0 / 1_000, (x0 + 100) / 1_000, (y0 + 100) / 1_000],
            });
          }),
        };
      },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 })),
        dpi: request.dpi,
      }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      waitBeforeRetry: async () => {},
    },
  });
  await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 50))]);
  assert.equal(started, 4, "four independent verification batches should be in flight");
  releaseFirst();
  await Promise.race([nextReady, new Promise((resolve) => setTimeout(resolve, 50))]);
  const startedBeforeRest = started;
  releaseRest();
  const result = await run;
  assert.equal(startedBeforeRest, 5, "the fifth batch should not wait for the other three calls");
  assert.equal(maximumActive, 4);
  assert.ok(result.report.perOpening.every((opening) => opening.outcome === "read"));
});

test("full-document agent retries only the close-up batch with a transient provider failure", async () => {
  const scheduleRows = Array.from({ length: 8 }, (_, index) => ({
    tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "FIXED",
  }));
  const callsByBatch = new Map();
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows,
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 1_000, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          const batch = input.escalationRecords[0].tag;
          const calls = (callsByBatch.get(batch) ?? 0) + 1;
          callsByBatch.set(batch, calls);
          if (batch === "W1" && calls === 1) throw new StageCallError("transient_provider", ["test_failure"]);
          return verifyCloseUpParents(input);
        }
        return {
          action: "emit", memory: "All frames located.", declines: [],
          records: scheduleRows.map((row, index) => hybridRecord({
            tag: row.tag, facePageNo: 1,
            faceOpeningCount: scheduleRows.length,
            evidenceRenderId: input.imageDataUrls[0]?.renderId ?? "missing",
            frameBoxNorm: [0.02 + index * 0.11, 0.2, 0.08 + index * 0.11, 0.4],
          })),
        };
      },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 })),
        dpi: request.dpi,
      }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      waitBeforeRetry: async () => {},
    },
  });
  assert.equal(callsByBatch.get("W1"), 2);
  assert.equal(callsByBatch.get("W5"), 1);
  assert.ok(result.report.perOpening.every((opening) => opening.outcome === "read"));
});

test("full-document close-up review retries one non-emit action and then accepts emit", async () => {
  let mainTurn = 0;
  const reviewInputs = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          reviewInputs.push(input);
          return reviewInputs.length === 1
            ? { action: "render", memory: "Requesting an unnecessary second crop.", requests: [{ pageNo: 1, dpi: 300 }] }
            : verifyCloseUpParents(input);
        }
        mainTurn++;
        return mainTurn === 1
          ? { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] }
          : { action: "emit", memory: "W1 located.", declines: [], records: [hybridRecord({ facePageNo: 1 })] };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(reviewInputs.length, 2);
  assert.match(reviewInputs[1].workingMemory, /must emit or decline/i);
  assert.equal(result.report.perOpening[0].outcome, "read");
});

test("full-document close-up review allows one corrective retry per batch", async () => {
  const scheduleRows = Array.from({ length: 8 }, (_, index) => ({
    tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "FIXED",
  }));
  const reviewCallsByBatch = new Map();
  let mainTurn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows,
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          const batch = input.escalationRecords[0].tag;
          const calls = (reviewCallsByBatch.get(batch) ?? 0) + 1;
          reviewCallsByBatch.set(batch, calls);
          return calls === 1
            ? { action: "render", memory: "Requesting an unnecessary second crop.", requests: [{ pageNo: 1, dpi: 300 }] }
            : verifyCloseUpParents(input);
        }
        mainTurn++;
        return mainTurn === 1
          ? { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] }
          : {
              action: "emit", memory: "All frames located.", declines: [],
              records: scheduleRows.map((row, index) => hybridRecord({
                tag: row.tag, facePageNo: 1,
                frameBoxNorm: [0.02 + index * 0.1, 0.2, 0.08 + index * 0.1, 0.4],
              })),
            };
      },
      render: async (request) => ({
        images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 })),
        dpi: request.dpi,
      }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });

  assert.deepEqual([...reviewCallsByBatch.values()], [2, 2]);
  assert.ok(result.report.perOpening.every((opening) => opening.outcome === "read"));
});

test("full-document close-up review records the repeated invalid action", async () => {
  let mainTurn = 0;
  let reviewCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) {
          reviewCalls++;
          return { action: "finish", memory: "Incorrectly finishing the review." };
        }
        mainTurn++;
        return mainTurn === 1
          ? { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] }
          : { action: "emit", memory: "W1 located.", declines: [], records: [hybridRecord({ facePageNo: 1 })] };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(reviewCalls, 2);
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.match(result.readings[0].gapNote, /close_up_invalid_action:finish/);
});

test("full-document agent falls back instead of persisting unverified overview composition", async () => {
  let mainTurn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "AWNING" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 29, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return {
          action: "emit", memory: "Close-up remains unclear.", records: [],
          declines: [{ tag: "W1", reason: "Opening marks remain unreadable in the close-up.", facePageNo: 1, elevation: "A", storey: "ground" }],
        };
        mainTurn++;
        if (mainTurn === 1) return { action: "render", memory: "Get the face.", requests: [{ pageNo: 1, dpi: 180 }] };
        return {
          action: "emit", memory: "Overview guess only.", declines: [],
          records: [hybridRecord({ operations: ["awning", "fixed"], unitRatios: [0.3, 0.7], facePageNo: 1 })],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "not_read");
  assert.equal(result.readings[0].gapCode, "model_declined");
  assert.deepEqual(result.readings[0].split.units.map((unit) => unit.operation), ["awning"]);
  assert.match(result.readings[0].gapNote, /unreadable in the close-up/i);
});

test("accepted low-confidence reads are complete and detail scales are not compared with elevations", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 2_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W2", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A AND WINDOW DETAIL", words: [] }],
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", memory: "Render the mixed sheet.", requests: [{ pageNo: 1, dpi: 110 }] };
        const record = (tag, evidenceView, frameBoxNorm, flags = [], orientation = "N") => ({
          tag, operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
          orientation, elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null, evidenceView,
          evidenceRenderId: "fd_t001_01", frameBoxNorm, confidence: "high", flags,
          basis: ["Distinct visible frame."], note: null,
        });
        return {
          action: "emit", memory: "Both records resolved.", declines: [],
          records: [record("W1", "elevation", [0.1, 0.1, 0.3, 0.4], ["northAssumed"], null), record("W2", "detail", [0.5, 0.1, 0.9, 0.4])],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 1_000, heightPx: 1_000 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.readings[0].gapCode, null, "a flagged but accepted record is not a model decline");
  assert.equal(result.readings[0].confidence, "low");
  assert.equal(result.readings[1].confidence, "high", "detail and elevation widths are at unrelated scales");
  assert.ok(!result.readings[1].flags.includes("drawingInconsistency"));
});

test("full-document consistency does not treat approximate locator-box widths as schedule measurements", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W2", widthMm: 2_000, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", memory: "Render A.", requests: [{ pageNo: 1, dpi: 200 }] };
        const record = (tag, frameBoxNorm) => ({
          tag, operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
          orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
          evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm,
          confidence: "high", flags: [], basis: ["Distinct frame on Elevation A."], note: null,
        });
        return {
          action: "emit", memory: "Both frames identified.", declines: [],
          records: [record("W1", [0.05, 0.1, 0.75, 0.5]), record("W2", [0.76, 0.1, 0.96, 0.5])],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 1_000, heightPx: 1_000 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.ok(result.readings.every((reading) => !reading.flags.includes("drawingInconsistency")));
  assert.deepEqual(result.readings.map((reading) => reading.split.units[0].derivedWidthMm), [1_000, 2_000]);
});

test("full-document close rail flags a reported face-count mismatch without inventing a record", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W2", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        if (turn === 1) return { action: "render", memory: "Render A.", requests: [{ pageNo: 1, dpi: 200 }] };
        const record = (tag, frameBoxNorm) => ({
          tag, operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical",
          orientation: "N", elevation: "A", roomLabel: null, storey: "ground", faceOpeningCount: 3, planPageNo: null, wallOrder: null,
          evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm,
          confidence: "high", flags: [], basis: ["Elevation A visibly contains three scheduled frames."], note: null,
        });
        return {
          action: "emit", memory: "Two of three face records identified.", declines: [],
          records: [record("W1", [0.05, 0.1, 0.35, 0.5]), record("W2", [0.55, 0.1, 0.85, 0.5])],
        };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 1_000, heightPx: 1_000 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.readings.length, 2);
  assert.ok(result.readings.every((reading) => reading.flags.includes("drawingInconsistency")));
});

const comparableWallReading = (wallOrder, frameBoxPt, proposal = {}, pageNo = 1) => ({
  frameBoxPt,
  proposal: {
    flags: [], confidence: "high", elevation: "A", storey: "ground",
    evidenceView: "elevation", facePageNo: 1, faceOpeningCount: null, wallOrder,
    ...proposal,
  },
  row: { widthMm: 1_000 },
  render: { pageNo },
});

test("full-document face count joins detail evidence to its architectural face", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50], { faceOpeningCount: 2 }),
    comparableWallReading(2, [10, 10, 90, 90], { evidenceView: "detail", faceOpeningCount: 2 }, 2),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.deepEqual(readings.map((reading) => reading.proposal.flags), [[], []]);
});

test("full-document face count keeps repeated elevation letters on separate sheets", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50], { facePageNo: 6, faceOpeningCount: 1 }, 6),
    comparableWallReading(1, [10, 10, 30, 50], { facePageNo: 9, faceOpeningCount: 1 }, 9),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.deepEqual(readings.map((reading) => reading.proposal.flags), [[], []]);
});

test("full-document incomplete coverage does not poison successful readings on that face", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50], { faceOpeningCount: 2 }),
  ];
  applyDrawingConsistencyFlags(readings, { incompleteFaces: new Set([drawingFaceKey(readings[0].proposal)]) });
  assert.deepEqual(readings[0].proposal.flags, []);
});

test("full-document decline on another face does not disable this face count", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50], { faceOpeningCount: 2 }),
  ];
  const otherFace = drawingFaceKey({ facePageNo: 9, elevation: "D", storey: "ground" });
  applyDrawingConsistencyFlags(readings, { incompleteFaces: new Set([otherFace]) });
  assert.ok(readings[0].proposal.flags.includes("drawingInconsistency"));
});

test("full-document unlocated decline conservatively suspends under-count checks", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50], { faceOpeningCount: 2 }),
  ];
  applyDrawingConsistencyFlags(readings, { unknownCoverage: true });
  assert.deepEqual(readings[0].proposal.flags, []);
});

test("full-document identity rail allows a mirrored face", () => {
  const readings = [
    comparableWallReading(1, [70, 10, 90, 50]),
    comparableWallReading(2, [10, 10, 30, 50]),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.deepEqual(readings.map((reading) => reading.proposal.flags), [[], []]);
});

test("full-document identity rail rejects a non-monotonic wall-order join", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50]),
    comparableWallReading(2, [70, 10, 90, 50]),
    comparableWallReading(3, [40, 10, 60, 50]),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.ok(readings.every((reading) => reading.proposal.flags.includes("drawingInconsistency")));
});

test("full-document identity rail ignores sub-frame coordinate jitter", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 30]),
    comparableWallReading(2, [9, 35, 29, 55]),
    comparableWallReading(3, [70, 10, 90, 30]),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.deepEqual(readings.map((reading) => reading.proposal.flags), [[], [], []]);
});

test("full-document identity rail still rejects duplicate wall orders", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50]),
    comparableWallReading(1, [70, 10, 90, 50]),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.ok(readings.every((reading) => reading.proposal.flags.includes("drawingInconsistency")));
});

test("deterministic consistency flags do not become model-evidence weakness", () => {
  const readings = [
    comparableWallReading(1, [10, 10, 30, 50]),
    comparableWallReading(1, [70, 10, 90, 50]),
  ];
  applyDrawingConsistencyFlags(readings);
  assert.deepEqual(readings.map((reading) => reading.proposal.confidence), ["high", "high"]);
  assert.ok(readings.every((reading) => reading.proposal.flags.includes("drawingInconsistency")));
});

test("full-document prompt prioritises opening geometry and excludes room labels", () => {
  const prompt = makeFullDocumentAgentSkill(["W1"], [1, 2]).buildPrompt({
    turn: 1,
    harvest: { schedule: [], pages: [], tagCandidates: [] },
    pendingTags: ["W1"], acceptedTags: [], declinedTags: [], workingMemory: "", observations: [],
    renderCatalog: [], imageDataUrls: [], turnsRemaining: 1,
  });
  assert.match(prompt, /faceOpeningCount is the number of openings on that face at the same storey/i);
  assert.match(prompt, /Do not read or return room names/i);
  assert.doesNotMatch(prompt, /roomLabel/i);
});

test("drawing parser mode keeps legacy, full-document, and disabled paths distinct", () => {
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "auto_drawings" }), "legacy");
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "agentic_full" }), "full_document");
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "auto" }), "disabled");
});

test("full-document agent cannot overwrite an opening accepted on an earlier turn", async () => {
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [
      { tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
      { tag: "W2", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" },
    ],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        turn++;
        const record = (tag, operation) => ({
          tag, operations: [operation], unitRatios: [1], divisionAxis: "vertical",
          orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
          evidenceView: "elevation", evidenceRenderId: "fd_t001_01", frameBoxNorm: [0.1, 0.1, 0.9, 0.9],
          confidence: "high", flags: [], basis: ["Visible frame and operation symbol."], note: null,
        });
        if (turn === 1) return { action: "render", memory: "Render A.", requests: [{ pageNo: 1, dpi: 200 }] };
        return turn === 2
          ? { action: "emit", memory: "W1 resolved; W2 pending.", records: [record("W1", "fixed")], declines: [] }
          : { action: "emit", memory: "W2 declined.", records: [record("W1", "awning")], declines: [{ tag: "W2", reason: "Not visible." }] };
      },
      render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: 110 }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.readings[0].split.units[0].operation, "fixed");
  assert.equal(result.readings[1].confidence, "low");
});

test("runDrawingEnrichmentStage: agentic_full routes only to the parallel full-document runner", async () => {
  const fakeDb = {
    prepare: () => ({
      bind: () => ({ all: async () => ({ results: [{ id: "f1", r2_key: "projects/proj_1/runs/f1.pdf" }] }) }),
    }),
  };
  const env = {
    AI_EXTRACTION_MODE: "agentic_full", DB: fakeDb, PLAN_PARSE: {},
    FILES: {
      get: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }),
      put: async () => {},
    },
  };
  let fullCalls = 0;
  let legacyCalls = 0;
  const deps = {
    inspect: async () => ({
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    }),
    render: async () => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 600, heightPx: 600 }], dpi: 110 }),
    runElevation: async () => { throw new Error("legacy elevation runner must stay idle"); },
    runFloorplan: async () => { throw new Error("legacy floor-plan runner must stay idle"); },
    runOpening: async () => { throw new Error("legacy opening runner must stay idle"); },
    runAgentTurn: async () => { legacyCalls++; return null; },
    runFullAgentTurn: async () => {
      fullCalls++;
      return {
        action: "emit", memory: "No drawing evidence for W1.", records: [],
        declines: [{ tag: "W1", reason: "Not visible." }],
      };
    },
  };
  const result = await runDrawingEnrichmentStage(env, {
    projectId: "proj_1", aiRunId: "run_1",
    planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1_200, typeText: "AWNING" }],
  }, deps);
  assert.equal(fullCalls, 1);
  assert.equal(legacyCalls, 0);
  assert.equal(result.report.files[0].modelCalls, 1);
  assert.equal(result.readings.length, 1, "a declined full-agent read degrades to the existing schedule fallback");
});

test("runDrawingEnrichmentStage: Stage A harvest is hash-bound and byte-identical on rerun", async () => {
  const sourceKey = "projects/proj_1/runs/f1.pdf";
  const stored = new Map();
  const fakeDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: "f1", r2_key: sourceKey, checksum: "pdf-sha" }] }) }) }) };
  const env = {
    AI_EXTRACTION_MODE: "agentic_full", DB: fakeDb, PLAN_PARSE: {},
    FILES: {
      get: async (key) => key === sourceKey
        ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
        : stored.has(key) ? { text: async () => stored.get(key) } : null,
      put: async (key, value) => { if (key.endsWith(".harvest-v1.json")) stored.set(key, value); },
    },
  };
  const harvests = [];
  const deps = {
    inspect: async () => ({
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
        pages: [{ pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 }] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN ELEVATION A", words: [] }],
      timings: { inventoryMs: 1, textMs: 0, wordsMs: 1, totalMs: 2 },
    }),
    render: async () => ({ images: [], dpi: 110 }),
    runElevation: async () => null, runFloorplan: async () => null, runOpening: async () => null,
    runFullAgentTurn: async (input) => {
      harvests.push(JSON.stringify(input.harvest));
      return { action: "emit", memory: "W1 not visible.", records: [], declines: [{ tag: "W1", reason: "Not visible." }] };
    },
  };
  const args = {
    projectId: "proj_1", aiRunId: "run_1", planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1_200, typeText: "AWNING" }],
  };
  await runDrawingEnrichmentStage(env, args, deps);
  await runDrawingEnrichmentStage(env, { ...args, aiRunId: "run_2" }, deps);
  assert.equal(stored.size, 1);
  assert.equal(harvests.length, 2);
  assert.equal(harvests[1], harvests[0]);
});

test("runDrawingEnrichmentStage: one cached site-plan north read completes every Stage A heading", async () => {
  const sourceKey = "projects/proj_1/runs/f1.pdf";
  const stored = new Map();
  const fakeDb = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ id: "f1", r2_key: sourceKey, checksum: "pdf-sha" }] }) }) }) };
  const env = {
    AI_EXTRACTION_MODE: "agentic_full", DB: fakeDb, PLAN_PARSE: {},
    FILES: {
      get: async (key) => key === sourceKey
        ? { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
        : stored.has(key) ? { text: async () => stored.get(key) } : null,
      put: async (key, value) => { if (key.endsWith(".harvest-v1.json")) stored.set(key, value); },
    },
  };
  const words = [
    { text: "KITCHEN", x0: 300, top: 250, x1: 360, bottom: 265 },
    { text: "MEALS", x0: 600, top: 250, x1: 650, bottom: 265 },
    { text: "FAMILY", x0: 300, top: 500, x1: 360, bottom: 515 },
    { text: "STUDY", x0: 600, top: 500, x1: 650, bottom: 515 },
    { text: "W1", x0: 285, top: 350, x1: 305, bottom: 365 },
    { text: "S08", x0: 285, top: 366, x1: 310, bottom: 381 },
    { text: "A", x0: 245, top: 350, x1: 255, bottom: 365 },
    { text: "B", x0: 480, top: 550, x1: 490, bottom: 565 },
    { text: "C", x0: 690, top: 350, x1: 700, bottom: 365 },
    { text: "D", x0: 480, top: 200, x1: 490, bottom: 215 },
    { text: "GROUND", x0: 450, top: 740, x1: 510, bottom: 755 },
    { text: "FLOOR", x0: 515, top: 740, x1: 560, bottom: 755 },
    { text: "PLAN", x0: 565, top: 740, x1: 600, bottom: 755 },
  ];
  let northCalls = 0;
  const renderRequests = [];
  const harvests = [];
  const deps = {
    inspect: async () => ({
      inventory: { pageCount: 3, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 2, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 80, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 3, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [
        { pageNo: 1, text: "SITE PLAN", words: [{ text: "SITE", x0: 450, top: 740, x1: 490, bottom: 755 }, { text: "PLAN", x0: 495, top: 740, x1: 535, bottom: 755 }] },
        { pageNo: 2, text: "GROUND FLOOR PLAN", words },
        { pageNo: 3, text: "ELEVATIONS", words: [{ text: "ELEVATIONS", x0: 450, top: 740, x1: 540, bottom: 755 }] },
      ],
      timings: { inventoryMs: 1, textMs: 0, wordsMs: 1, totalMs: 2 },
    }),
    render: async (_namespace, _projectId, _bytes, request) => {
      renderRequests.push(request);
      return { images: [{ pngB64: "aGVsbG8=", widthPx: 500, heightPx: 400 }], dpi: request.dpi };
    },
    runNorth: async () => {
      northCalls++;
      return { northArrowDegrees: 90, source: "arrow", evidenceBoxNorm: [0.8, 0.1, 0.9, 0.3] };
    },
    runElevation: async () => null, runFloorplan: async () => null, runOpening: async () => null,
    runFullAgentTurn: async (input) => {
      if (input.escalationRecords) return verifyCloseUpParents(input);
      if (input.turn === 1) {
        harvests.push(structuredClone(input.harvest));
        return { action: "render", memory: "Read elevation A.", requests: [{ pageNo: 3, dpi: 200 }] };
      }
      return {
        action: "emit", memory: "W1 resolved.", declines: [],
        records: [hybridRecord({
          operations: ["awning"], orientation: "N", elevation: "A", storey: "first", faceOpeningCount: 1,
          planCandidateId: "W1_p2_1", planPageNo: 2, wallOrder: 1,
          facePageNo: 3, evidenceRenderId: "fd_t001_01",
        })],
      };
    },
  };
  const args = {
    projectId: "proj_1", aiRunId: "run_1", planPdfDocs: [{ fileId: "f1" }],
    scheduleRows: [{ tag: "W1", widthMm: 600, heightMm: 1_200, typeText: "AWNING" }],
  };
  const first = await runDrawingEnrichmentStage(env, args, deps);
  const second = await runDrawingEnrichmentStage(env, { ...args, aiRunId: "run_2" }, deps);

  assert.equal(northCalls, 1, "the hash-bound harvest must reuse a successful north read");
  assert.deepEqual(renderRequests, [
    { pageNo: 1, dpi: 100 },
    { pageNo: 3, dpi: 180 },
    { pageNo: 3, dpi: 200 },
    { pageNo: 3, dpi: 300, crops: [[0, 0, 1_000, 800]], threshold: 250 },
    { pageNo: 3, dpi: 180 },
    { pageNo: 3, dpi: 200 },
    { pageNo: 3, dpi: 300, crops: [[0, 0, 1_000, 800]], threshold: 250 },
  ]);
  assert.equal(harvests[0].northEvidence.requiresVisualRead, false);
  assert.deepEqual(harvests[0].northEvidence.visualEvidence, {
    pageNo: 1, boxNorm: [0.8, 0.1, 0.9, 0.3], source: "arrow",
  });
  assert.deepEqual(harvests[0].placements.map(({ tag, orientation }) => [tag, orientation]), [["W1", "S"]]);
  assert.deepEqual(harvests[1], harvests[0]);
  assert.equal(first.readings[0].orientation, "S", "Stage A heading must override a conflicting model proposal");
  assert.equal(second.readings[0].orientation, "S");
  assert.equal(first.readings[0].elevation, "A", "the plan-image elevation must survive Stage A heading derivation");
  assert.match(first.readings[0].gapNote, /storey:ground/, "Stage A placement must override a conflicting model storey");
  assert.ok(!first.readings[0].flags.includes("drawingInconsistency"));
  assert.equal(first.report.files[0].modelCalls, 4, "the report must include north, overview, emit, and close-up calls");
  assert.equal(second.report.files[0].modelCalls, 3, "a cached north read must add no model call");
});

test("full-document fallback preserves Stage A heading when the declined face differs only by case", async () => {
  const pages = [
    { pageNo: 1, text: "GROUND FLOOR PLAN", words: [] },
    { pageNo: 2, text: "ELEVATION A", words: [] },
  ];
  const inspected = {
    inventory: {
      pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({
        pageNo: page.pageNo, widthPt: 1_000, heightPt: 800, rotation: 0,
        textChars: page.text.length, imageCount: 0, imageAreaFraction: 0,
      })),
    },
    pages,
  };
  const scheduleRows = [{ tag: "W1", widthMm: 2_050, heightMm: 2_100, typeText: "AWNING" }];
  const harvest = buildFullDocumentHarvest(inspected, scheduleRows);
  harvest.placements = [{
    tag: "W1", pageNo: 1, elevation: "A", orderOnWall: 1,
    roomLabelCandidate: null, storey: "ground", orientation: "E",
  }];

  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows, inspected, harvest,
    deps: {
      runTurn: async () => ({
        action: "emit", memory: "W1 could not be read visually.", records: [],
        declines: [{ tag: "W1", reason: "Elevation image unavailable.", facePageNo: 2, elevation: "a", storey: "ground" }],
      }),
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
    },
  });

  assert.equal(result.readings[0].orientationState, "value");
  assert.equal(result.readings[0].orientation, "E");
  assert.equal(result.readings[0].elevationState, "value");
  assert.equal(result.readings[0].elevation, "a");
  assert.equal(result.readings[0].sheetRef, "a");
  assert.match(result.readings[0].gapNote, /storey:ground/);
  const model = { openings: [{ externalRef: "W1", wallOrientation: null, wallOrientationSource: null }] };
  applyDrawingOrientation(model, result.readings);
  assert.equal(model.openings[0].wallOrientation, "E");
  assert.equal(model.openings[0].wallOrientationSource, "plan");
});

test("full-document reading keeps Stage A orientation when model and placement name the same face", async () => {
  const pages = [
    { pageNo: 1, text: "GROUND FLOOR PLAN", words: [
      { text: "W1", x0: 100, top: 100, x1: 120, bottom: 115 },
      { text: "S08", x0: 100, top: 116, x1: 125, bottom: 131 },
    ] },
    { pageNo: 2, text: "NORTH ELEVATION", words: [] },
  ];
  const inspected = {
    inventory: {
      pageCount: 2, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({ pageNo: page.pageNo, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: page.text.length, imageCount: 0, imageAreaFraction: 0 })),
    },
    pages,
  };
  const scheduleRows = [{ tag: "W1", widthMm: 2_000, heightMm: 1_200, typeText: "AWNING" }];
  const harvest = buildFullDocumentHarvest(inspected, scheduleRows);
  harvest.placements = [{ tag: "W1", pageNo: 1, elevation: "NORTH", orderOnWall: 1, roomLabelCandidate: null, storey: "ground", orientation: "N" }];
  let turn = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows, inspected, harvest,
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        return ++turn === 1
          ? { action: "render", memory: "Read NORTH elevation.", requests: [{ pageNo: 2, dpi: 180 }] }
          : { action: "emit", memory: "W1 read.", declines: [], records: [hybridRecord({ elevation: "NORTH", planCandidateId: "W1_p1_1", planPageNo: 1, wallOrder: 1, facePageNo: 2, evidenceRenderId: "fd_t001_01" })] };
      },
      render: async (request) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 500, heightPx: 400 }], dpi: request.dpi }),
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(result.report.perOpening[0].outcome, "read");
  assert.equal(result.readings[0].orientation, "N");
});

test("full-document decline can derive orientation from a matching face on another plan page", async () => {
  const pages = [
    { pageNo: 1, text: "GROUND FLOOR PLAN", words: [] },
    { pageNo: 2, text: "FIRST FLOOR PLAN", words: [] },
    { pageNo: 3, text: "ELEVATION A", words: [] },
  ];
  const inspected = {
    inventory: {
      pageCount: 3, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: pages.map((page) => ({ pageNo: page.pageNo, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: page.text.length, imageCount: 0, imageAreaFraction: 0 })),
    },
    pages,
  };
  const scheduleRows = [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }];
  const harvest = buildFullDocumentHarvest(inspected, scheduleRows);
  harvest.placements = [{ tag: "W1", pageNo: 2, elevation: "B", orderOnWall: 1, roomLabelCandidate: null, storey: "first", orientation: null }];
  harvest.elevationMarkers = [{ pageNo: 1, label: "A", boxPt: [0, 40, 5, 45], edge: "left" }];
  harvest.northEvidence.resolution = { northArrowDegrees: 0, source: "test north" };
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows, inspected, harvest,
    deps: {
      runTurn: async () => ({ action: "emit", memory: "W1 obscured on A.", records: [], declines: [{ tag: "W1", reason: "Obscured.", facePageNo: 3, elevation: "A", storey: "first" }] }),
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
    },
  });
  assert.equal(result.readings[0].orientation, "W");
});

test("full-document agent retries one provider failure and then stops", async () => {
  let calls = 0;
  const waits = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => { calls++; throw new StageCallError("transient_provider", ["skill_call_error:HTTP 503"]); },
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
      waitBeforeRetry: async (ms) => { waits.push(ms); },
    },
  });

  assert.equal(calls, 2);
  assert.equal(result.report.modelCalls, 2);
  assert.equal(result.report.steps.failedPhase, "full_document_agent");
  assert.deepEqual(waits, [5_000]);
  assert.deepEqual(result.report.providerFailure, {
    failureKind: "transient_provider",
    warnings: ["skill_call_error:HTTP 503"],
  });
});

test("full-document agent gives a rate limit one longer retry", async () => {
  let calls = 0;
  const waits = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => { calls++; throw new StageCallError("transient_rate_limit", ["skill_call_error:HTTP 429"]); },
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
      waitBeforeRetry: async (ms) => { waits.push(ms); },
    },
  });

  assert.equal(calls, 2);
  assert.deepEqual(waits, [30_000]);
  assert.equal(result.report.steps.failedPhase, "full_document_agent");
});

test("full-document agent does not retry a permanent provider failure", async () => {
  let calls = 0;
  const waits = [];
  const result = await runFullDocumentAgent({
    fileId: "f1",
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 30, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN ELEVATION A", words: [] }],
    },
    deps: {
      runTurn: async () => { calls++; throw new StageCallError("permanent_request", ["skill_call_error:HTTP 401"]); },
      render: async () => ({ images: [], dpi: 110 }),
      store: async () => null,
      waitBeforeRetry: async (ms) => { waits.push(ms); },
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
  assert.equal(result.report.steps.failedPhase, "full_document_agent");
});
test("agentic_full refuses a multi-PDF plan set before loading files", async () => {
  let gets = 0;
  let inspections = 0;
  let turns = 0;
  const env = {
    FILES: {
      get: async () => { gets++; return { arrayBuffer: async () => new ArrayBuffer(1) }; },
      put: async () => {},
    },
    PLAN_PARSE: {},
  };
  const result = await enrichOpenings(env, {
    projectId: "p", aiRunId: "r",
    files: [{ fileId: "f1", r2Key: "one.pdf" }, { fileId: "f2", r2Key: "two.pdf" }],
    scheduleRows: [{ tag: "W1", widthMm: 1_000, heightMm: 1_200, typeText: "FIXED" }],
  }, {
    inspect: async () => { inspections++; return ({
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 100, heightPt: 100, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "ELEVATION A W1", words: [] }],
    }); },
    render: async () => { throw new Error("multi-PDF input must not render"); },
    runElevation: async () => null,
    runFloorplan: async () => null,
    runOpening: async () => null,
    runFullAgentTurn: async () => { turns++; throw new Error("multi-PDF input must not call the model"); },
  });
  assert.equal(gets, 0);
  assert.equal(inspections, 0);
  assert.equal(turns, 0);
  assert.deepEqual(result.readings, []);
  assert.deepEqual(result.report.files.map((file) => file.steps.failedPhase), ["multiple_plan_pdfs", "multiple_plan_pdfs"]);
});

test("full-document agent verifies the standard 19-opening set in five bounded close-up batches", async () => {
  const scheduleRows = Array.from({ length: 19 }, (_, index) => ({
    tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "AWNING",
  }));
  let modelCalls = 0;
  let renderCalls = 0;
  const result = await runFullDocumentAgent({
    fileId: "f1", scheduleRows,
    inspected: {
      inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
        { pageNo: 1, widthPt: 1_000, heightPt: 1_000, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
      timings: { inventoryMs: 1, textMs: 1, wordsMs: 1, totalMs: 3 },
    },
    deps: {
      runTurn: async (input) => {
        if (input.escalationRecords) return verifyCloseUpParents(input);
        modelCalls++;
        return {
          action: "emit", memory: "All 19 frames resolved together on Elevation A.", declines: [],
          records: scheduleRows.map((row, index) => {
            const x0 = 10 + (index % 5) * 180;
            const y0 = 10 + Math.floor(index / 5) * 200;
            return {
              tag: row.tag, operations: ["awning", "fixed"], unitRatios: [0.3, 0.7], divisionAxis: "vertical",
              orientation: "N", elevation: "A", roomLabel: null, storey: "ground", planPageNo: null, wallOrder: null,
              evidenceView: "elevation", evidenceRenderId: input.imageDataUrls[0]?.renderId ?? "missing",
              frameBoxNorm: [x0 / 1_000, y0 / 1_000, (x0 + 100) / 1_000, (y0 + 100) / 1_000], confidence: "high", flags: [],
              basis: ["Distinct frame visible in the complete elevation set."], note: null,
            };
          }),
        };
      },
      render: async (request) => {
        renderCalls++;
        return {
          images: (request.crops ?? [null]).map(() => ({
            pngB64: "aGVsbG8=", widthPx: 2_000, heightPx: 2_000,
            profile: { mullionXs: [0.4], transomYs: [] },
          })),
          dpi: request.dpi,
        };
      },
      store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
    },
  });
  assert.equal(modelCalls, 1);
  assert.equal(renderCalls, 20, "one overview plus one mandatory close-up per opening");
  assert.equal(result.report.modelCalls, 6);
  assert.equal(result.report.steps.read.targetedReviews, 19);
  assert.equal(result.readings.length, 19);
  assert.ok(result.readings.every((reading) => reading.confidence === "high"));
  assert.ok(result.readings.every((reading) =>
    reading.split.units[0].derivedWidthMm === 300 && reading.split.units[1].derivedWidthMm === 700));
  assert.equal(FULL_DOCUMENT_AGENT_LIMITS.maxRecords, 60);
});

test("full-document agent preserves discovery turns for 29- and 60-opening sets", async () => {
  for (const openingCount of [29, 60]) {
    const scheduleRows = Array.from({ length: openingCount }, (_, index) => ({
      tag: `W${index + 1}`, widthMm: 1_000, heightMm: 1_200, typeText: "AWNING",
    }));
    let mainCalls = 0;
    const result = await runFullDocumentAgent({
      fileId: "f1", scheduleRows,
      inspected: {
        inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false, pages: [
          { pageNo: 1, widthPt: 1_000, heightPt: 1_000, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
        ] },
        pages: [{ pageNo: 1, text: "GROUND FLOOR PLAN\nELEVATION A", words: [] }],
      },
      deps: {
        runTurn: async (input) => {
          if (input.escalationRecords) return verifyCloseUpParents(input);
          mainCalls++;
          if (mainCalls === 1) {
            return { action: "render", memory: "Inspect the elevation before resolving openings.", requests: [{ pageNo: 1, dpi: 180 }] };
          }
          return {
            action: "emit", memory: `All ${openingCount} frames resolved.`, declines: [],
            records: scheduleRows.map((row, index) => {
              const x0 = 0.02 + (index % 10) * 0.095;
              const y0 = 0.08 + Math.floor(index / 10) * 0.14;
              return hybridRecord({
                tag: row.tag, facePageNo: 1,
                evidenceRenderId: input.imageDataUrls[0]?.renderId ?? "missing",
                frameBoxNorm: [x0, y0, x0 + 0.05, y0 + 0.08],
              });
            }),
          };
        },
        render: async (request) => ({
          images: (request.crops ?? [null]).map(() => ({ pngB64: "aGVsbG8=", widthPx: 2_000, heightPx: 2_000 })),
          dpi: request.dpi,
        }),
        store: async (renderId) => `projects/p/crops/r/${renderId}.png`,
      },
    });
    assert.equal(mainCalls, 2, `${openingCount} openings must retain enough budget for discovery`);
    assert.equal(result.report.modelCalls, 2 + Math.ceil(openingCount / 4));
    assert.equal(result.report.steps.read.targetedReviews, openingCount);
    assert.equal(result.readings.length, openingCount);
    assert.ok(result.report.perOpening.every((opening) => opening.outcome === "read"));
  }
});

test("deployment config keeps the full-document drawing parser as the production default", async () => {
  const config = await readFile(join(projectRoot, "wrangler.jsonc"), "utf8");
  assert.match(config, /"AI_EXTRACTION_MODE"\s*:\s*"agentic_full"/);
  assert.match(config, /"AI_PRIMARY_MODEL"\s*:\s*"google\/gemini-3\.6-flash"/);
  assert.match(config, /"AI_VERIFY_MODEL"\s*:\s*"google\/gemini-3\.6-flash"/);
});
