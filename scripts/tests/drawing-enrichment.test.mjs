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
      export { buildFullDocumentHarvest as buildHarvest, applyVisualNorthToHarvest as applyVisualNorth, viewScaleCandidates, pageScales } from ${p("worker/lib/drawing/harvest.ts")};
      export { documentFaceSheets } from ${p("worker/lib/drawing/sheetFaces.ts")};
      export { placeOpeningsOnPlan } from ${p("worker/lib/drawing/faceMapped/planFaces.ts")};
      export { runFaceMappedParser } from ${p("worker/lib/drawing/faceMapped/run.ts")};
      export { faceMappedReadings, faceMappedProgress } from ${p("worker/lib/drawing/faceMapped/report.ts")};
      export { compositionBatches, makeCompositionSkill, runCompositions } from ${p("worker/lib/drawing/faceMapped/compositions.ts")};
      export { openingCropTasks } from ${p("worker/lib/drawing/faceMapped/crops.ts")};
      export { elevationFaceTasks, validateElevationFrames, makeElevationInventorySkill } from ${p("worker/lib/drawing/faceMapped/elevationFrames.ts")};
      export { matchFacePlacements, faceReconciliationTasks, makeFaceReconcileSkill, FACE_RECONCILE_LIMITS } from ${p("worker/lib/drawing/faceMapped/matchFrames.ts")};
      export { planFaceRecoveryRequest, validatePlanFaceAnswer, makePlanFaceSkill, PLAN_FACE_LIMITS } from ${p("worker/lib/drawing/faceMapped/planFacesSkill.ts")};
      export { recoverPageScales, validateStatedScale, recoverSheetFacts } from ${p("worker/lib/drawing/pageScaleRecovery.ts")};
      export { expectedWidthPt } from ${p("worker/lib/drawing/faceMapped/contract.ts")};
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
const { buildHarvest, applyVisualNorth, viewScaleCandidates, pageScales, recoverPageScales, validateStatedScale, recoverSheetFacts, documentFaceSheets, placeOpeningsOnPlan, planFaceRecoveryRequest, validatePlanFaceAnswer, makePlanFaceSkill, PLAN_FACE_LIMITS, matchFacePlacements, faceReconciliationTasks, makeFaceReconcileSkill, FACE_RECONCILE_LIMITS, elevationFaceTasks, validateElevationFrames, makeElevationInventorySkill, openingCropTasks, compositionBatches, makeCompositionSkill, runCompositions, faceMappedReadings, faceMappedProgress, runFaceMappedParser, expectedWidthPt, applyVisualNorthToHarvest, buildFullDocumentHarvest, validateFullDocumentTurn, runFullDocumentAgent, makeFullDocumentAgentSkill, FULL_DOCUMENT_AGENT_LIMITS, StageCallError, applyDrawingConsistencyFlags, drawingFaceKey, drawingParserMode, cropKey, purgeProjectCrops, MAX_PDF_BYTES, MAX_PAGES, MAX_CROPS_PER_PAGE, MAX_DPI, inspectPdf, renderPage, ContainerClientError, INSPECT_TIMEOUT_MS, RENDER_TIMEOUT_MS, chooseStrategy, selectPages, elevationRegions, boxesByRegion, elevationOrderKey, locateFloorplanPage, orientationsFromNorth, resolveNorth, mapPool, measureSplit, composeMeasuredSplit, parseCompositionComment, compositionFromSchedule, reconcileReading, elevationInventorySkill, validateFloorplanRead, northArrowSkill, openingReadSkill, assignOpenings, applyDrawingOrientation, conflictReason, persistReadings, readings, enrichOpenings, runDrawingEnrichmentStage, runGate } = await import(pathToFileURL(outfile).href);

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

test("the model-facing harvest contract is byte-compatible with the agent it moved out of", async () => {
  const golden = JSON.parse(await readFile(join(projectRoot, "scripts/tests/fixtures/full-document-harvest.json"), "utf8"));
  assert.equal(
    JSON.stringify(buildHarvest(golden.input.inspected, golden.input.schedule)),
    JSON.stringify(golden.expected),
    "FullDocumentHarvest is agentic_full's prompt payload and its replay key. This golden was captured "
    + "before the move to harvest.ts; changing it needs an explicit prompt and pipeline version bump.");
});

test("harvest.ts holds the one Stage A implementation both drawing engines share", () => {
  assert.equal(buildHarvest, buildFullDocumentHarvest, "fullDocumentAgent must re-export the shared harvest, never copy it");
  assert.equal(applyVisualNorth, applyVisualNorthToHarvest, "visual north application must have one implementation");
});

const scaleSheet = (words) => ({
  inventory: { pageCount: 1, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
    pages: [{ pageNo: 1, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 60, imageCount: 0, imageAreaFraction: 0 }] },
  pages: [{ pageNo: 1, text: words.map((word) => word.text).join(" "), words }],
});
const line = (top, entries) => entries.map(([text, x0, width]) => ({ text, x0, top, x1: x0 + width, bottom: top + 15 }));

// Page scale — one test per acceptance criterion in 01-acceptance-criteria.md.
// The sheets below are 1000x800pt, so the footer band starts at y=680.

test("page scale: only the footer says what the sheet is drawn at (AC8)", () => {
  const sheet = scaleSheet([
    ...line(100, [["DRIVEWAY", 100, 65], ["1:10", 170, 35]]),
    ...line(300, [["SITE", 100, 35], ["BUILT", 140, 40], ["RAMP", 185, 40], ["AT", 230, 20], ["1:8", 255, 30]]),
    ...line(500, [["SCALE", 100, 40], ["1:20", 145, 35]]),
    ...line(760, [["SCALE", 800, 40], ["1:100", 845, 40]]),
  ]);
  assert.deepEqual(viewScaleCandidates(sheet).map(({ ratio, text }) => ({ ratio, text })), [
    { ratio: 100, text: "SCALE 1:100" },
  ], "a driveway, a ramp and a detail's own label are all outside the footer, so none of them is the sheet's scale");
  assert.deepEqual([...pageScales(sheet).entries()], [[1, 100]]);
});

test("page scale: high on the sheet is not the footer, however far right (AC8)", () => {
  // Measured on a real set: the sheet scale sits at 91% down, and a driveway
  // gradient at 95% across but 73% down. Admitting the right-hand edge as
  // footer reads that gradient as the drawing's scale.
  const sheet = scaleSheet([
    ...line(611, [["GRADIENT", 1_000, 60], ["IS", 1_065, 15], ["1:47", 1_085, 35]]),
    ...line(768, [["1:200", 1_020, 40]]),
  ]);
  assert.deepEqual(viewScaleCandidates(sheet).map(({ ratio }) => ratio), [200]);
  assert.deepEqual([...pageScales(sheet).entries()], [[1, 200]]);
});

test("page scale: the document map says what each page is drawn at, and stays silent where it cannot (AC9)", () => {
  const sheet = (pageNo, words) => ({
    geometry: { pageNo, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 60, imageCount: 0, imageAreaFraction: 0 },
    page: { pageNo, text: "", words },
  });
  const sheets = [
    // One footer scale: the ordinary case.
    sheet(1, line(760, [["SCALE", 800, 40], ["1:100", 845, 40]])),
    // Stated twice in the footer, agreeing: still one answer.
    sheet(2, [...line(700, [["SCALE", 100, 40], ["1:200", 145, 40]]),
      ...line(760, [["SCALE", 800, 40], ["1:200", 845, 40]])]),
    // Two footer ratios that disagree: a conflict for ops, not a vote to settle.
    sheet(3, [...line(700, [["SCALE", 100, 40], ["1:100", 145, 40]]),
      ...line(760, [["SCALE", 800, 40], ["1:50", 845, 35]])]),
    // Nothing printed in the footer: the map says nothing rather than guessing.
    sheet(4, line(300, [["GROUND", 100, 60], ["FLOOR", 165, 50], ["PLAN", 220, 40]])),
  ];
  const scales = pageScales({
    inventory: { pageCount: sheets.length, producer: "test", fonts: ["Helvetica"], hasAttachments: false,
      pages: sheets.map((item) => item.geometry) },
    pages: sheets.map((item) => item.page),
  });
  assert.deepEqual([...scales.entries()], [[1, 100], [2, 200], [3, null]]);
  assert.equal(scales.get(3), null, "a page whose footer disagrees with itself is a conflict ops must be able to see");
  assert.equal(scales.has(4), false, "a page printing no scale is absent, which is not the same as a conflict");
});

test("page scale: every printed form is read (AC4)", () => {
  const forms = [
    [["SCALE", 100, 40], ["1:100", 145, 40]],
    [["Scale", 300, 40], ["1", 345, 8], [":", 356, 4], ["100", 363, 24]],
    [["1:100", 500, 40]],
    [["1", 600, 8], ["/", 611, 6], ["100", 620, 24]],
  ];
  const candidates = viewScaleCandidates(scaleSheet(forms.flatMap((entries, index) => line(700 + index * 20, entries))));
  assert.deepEqual(candidates.map(({ ratio, source }) => ({ ratio, source })),
    [100, 100, 100, 100].map((ratio) => ({ ratio, source: "printed" })));
  assert.deepEqual(candidates.map(({ text }) => text), ["SCALE 1:100", "Scale 1 : 100", "1:100", "1 / 100"]);
  assert.deepEqual(candidates[0].evidenceBoxPt, [100, 700, 185, 715]);
});

test("page scale: a label and its ratio in one word are still a scale (AC4)", () => {
  // Poppler emits a whole phrase as one word when the PDF draws it as one run.
  const candidates = viewScaleCandidates(scaleSheet([
    { text: "SCALE 1:100", x0: 800, top: 760, x1: 885, bottom: 775 },
  ]));
  assert.deepEqual(candidates.map(({ ratio, text }) => ({ ratio, text })), [{ ratio: 100, text: "SCALE 1:100" }],
    "how the PDF grouped the label with its ratio cannot decide whether the scale is read");
});

test("page scale: an unusable ratio is refused (AC5)", () => {
  const candidates = viewScaleCandidates(scaleSheet([
    ...line(700, [["SCALE", 100, 40], ["1:0", 145, 24]]),
    ...line(730, [["SCALE", 100, 40], ["1:abc", 145, 40]]),
    ...line(760, [["SCALE", 100, 40], ["1:200", 145, 40]]),
  ]));
  assert.deepEqual(candidates.map(({ ratio }) => ratio), [200],
    "1:0 cannot scale anything and 1:abc is not a ratio");
  assert.equal(candidates[0].pageNo, 1);
});

test("page scale: a split ratio is read from what sits beside it, not from token order (AC6)", () => {
  const candidates = viewScaleCandidates(scaleSheet([
    // Poppler emits words in content-stream order, and a split ratio rarely
    // shares one baseline to the point: another column's word sorts between.
    { text: "1", x0: 255, top: 700, x1: 263, bottom: 715 },
    { text: "NOTE", x0: 600, top: 701, x1: 640, bottom: 716 },
    { text: ":", x0: 266, top: 702, x1: 270, bottom: 717 },
    { text: "100", x0: 274, top: 700, x1: 298, bottom: 715 },
  ]));
  assert.deepEqual(candidates.map(({ ratio, text }) => ({ ratio, text })), [{ ratio: 100, text: "1 : 100" }]);
});

test("page scale: tight line spacing does not fold two rows into one (AC7)", () => {
  const candidates = viewScaleCandidates(scaleSheet([
    // A title block sets its rows about one text height apart. Folding them
    // together sorts a word from the row above between the ratio's tokens.
    { text: "TITLE", x0: 260, top: 700, x1: 300, bottom: 715 },
    { text: "1", x0: 255, top: 716, x1: 263, bottom: 731 },
    { text: ":", x0: 266, top: 716, x1: 270, bottom: 731 },
    { text: "100", x0: 274, top: 716, x1: 298, bottom: 731 },
  ]));
  assert.deepEqual(candidates.map(({ ratio, text }) => ({ ratio, text })), [{ ratio: 100, text: "1 : 100" }]);
});

test("page scale: a rotated label cannot bridge two rows (AC7)", () => {
  // Geometry from the ground floor plan of a real set: a 36.9pt rotated label
  // overlaps three 7.8pt rows. Grouping rows against the shorter word lets it
  // merge them, and a word from the row below then sorts between the tokens.
  const row = (top, entries) => entries.map(([text, x0, x1]) => ({ text, x0, x1, top, bottom: top + 7.8 }));
  const candidates = viewScaleCandidates(scaleSheet([
    { text: "2400mm(H)", x0: 340.3, top: 702.0, x1: 348.0, bottom: 738.9 },
    ...row(700.9, [["SCALE", 368.8, 388.4], ["1", 390.4, 396.4], [":", 398.5, 401.3], ["100", 403.3, 417.0]]),
    ...row(708.9, [["GARAGE", 368.8, 398.7], ["INTERNAL", 400.7, 435.0]]),
  ]));
  assert.deepEqual(candidates.map(({ ratio }) => ratio), [100]);
});

test("scale recovery: what a model returns is bounded like any other input (AC21)", () => {
  assert.equal(validateStatedScale({ pageNo: 4, ratio: 100 }, 4), 100);
  assert.equal(validateStatedScale({ pageNo: 4, ratio: "1:100" }, 4), 100, "the printed form is accepted, not just the number");
  assert.equal(validateStatedScale({ pageNo: 5, ratio: 100 }, 4), null, "a scale for a sheet nobody asked about is refused");
  assert.equal(validateStatedScale({ ratio: 100 }, 4), null, "a response that never says which sheet it read is not evidence about any sheet");
  assert.equal(validateStatedScale({ pageNo: 4, ratio: 0 }, 4), null);
  assert.equal(validateStatedScale({ pageNo: 4, ratio: 47.5 }, 4), null, "a drawing scale is a whole ratio");
  assert.equal(validateStatedScale({ pageNo: 4, ratio: 99_999 }, 4), null);
  assert.equal(validateStatedScale({ pageNo: 4, ratio: null }, 4), null, "no stated scale is an answer, and it is not a scale");
  assert.equal(validateStatedScale("SCALE 1:100", 4), null, "prose is not a result");
});

// ── Phase C — plan placement (02-acceptance-criteria.md) ───────────────────
const planSheet = (words, text = "GROUND FLOOR PLAN") => ({
  page: { pageNo: 4, text, words },
  geometry: { pageNo: 4, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 200, imageCount: 0, imageAreaFraction: 0 },
});
const tagWord = (text, x, y) => ({ text, x0: x, top: y, x1: x + 26, bottom: y + 14 });

test("plan placement: openings on one wall get plan-side ordinals and a position along it (P2-AC2, AC3, AC4)", () => {
  const sheet = planSheet([
    // Four openings along the top wall, deliberately out of reading order.
    tagWord("W3", 517, 250), tagWord("W1", 297, 250), tagWord("W4", 627, 250), tagWord("W2", 407, 250),
    // Openings on the other three walls.
    tagWord("W5", 457, 540), tagWord("W6", 217, 400), tagWord("W7", 727, 400),
    // Room labels: what gives a plan its footprint.
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
    // The document's own names for its walls.
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "A", x0: 230, top: 395, x1: 240, bottom: 409 },
    { text: "C", x0: 740, top: 395, x1: 750, bottom: 409 },
  ]);
  const outcomes = placeOpeningsOnPlan({
    pages: [sheet],
    roster: ["W1", "W2", "W3", "W4", "W5", "W6", "W7"],
  });
  assert.equal(outcomes.length, 7, "every scheduled opening gets exactly one outcome");
  const onD = outcomes.filter((o) => o.state === "resolved" && o.placement.elevation === "D")
    .map((o) => o.placement).sort((a, b) => a.wallOrder - b.wallOrder);
  assert.deepEqual(onD.map((p) => p.tag), ["W1", "W2", "W3", "W4"],
    "ordinals run along the wall in plan order, whatever order the tags were printed in");
  assert.deepEqual(onD.map((p) => p.wallOrder), [1, 2, 3, 4]);
  assert.deepEqual(onD.map((p) => p.faceOpeningCount), [4, 4, 4, 4]);
  assert.equal(onD.every((p) => p.storey === "GROUND FLOOR"), true);
  const fractions = onD.map((p) => p.alongWallFraction);
  assert.equal(fractions.every((f) => f !== null && f >= 0 && f <= 1), true, `fractions within the wall: ${fractions}`);
  assert.deepEqual([...fractions].sort((a, b) => a - b), fractions, "position along the wall rises with the ordinal");
});

test("plan placement: a wall keeps its name when a section mark is printed nearby (P2-AC5, AC6)", () => {
  // Measured on a real ground floor plan: section marks share the sheet with
  // the elevation markers, so two different letters sit near the same edge and
  // no edge is decidable alone. Each letter still names exactly one wall, so
  // the assignment as a whole is decidable — and refusing it loses two thirds
  // of the openings on that sheet.
  const sheet = planSheet([
    tagWord("W3", 517, 250), tagWord("W1", 297, 250), tagWord("W4", 627, 250), tagWord("W2", 407, 250),
    tagWord("W5", 457, 540), tagWord("W6", 217, 400), tagWord("W7", 727, 400),
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "A", x0: 230, top: 395, x1: 240, bottom: 409 },
    { text: "C", x0: 740, top: 395, x1: 750, bottom: 409 },
    // A section mark: the same letter as the right wall, printed near the top.
    { text: "C", x0: 330, top: 268, x1: 340, bottom: 282 },
    // And another letter crowding the left wall.
    { text: "B", x0: 250, top: 330, x1: 260, bottom: 344 },
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2", "W3", "W4", "W5", "W6", "W7"] });
  assert.equal(outcomes.filter((o) => o.state === "resolved").length, 7,
    "every opening still lands: " + JSON.stringify(outcomes.filter((o) => o.state !== "resolved")));
  const faces = Object.fromEntries(outcomes
    .filter((o) => o.state === "resolved")
    .map((o) => [o.placement.tag, o.placement.elevation]));
  assert.equal(faces.W1, "D", "the top wall is still D, though a C is printed against it");
  assert.equal(faces.W5, "B");
  assert.equal(faces.W6, "A", "the left wall is still A, though a B is printed against it");
  assert.equal(faces.W7, "C");
});

const planRooms = [
  { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
  { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
  { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
  { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
  { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
];

// ── Phase D — matching plan order to elevation frames (§7.3) ───────────────
const frameAt = (orderLeftToRight, x0, x1) => ({
  frameId: `f${orderLeftToRight}`,
  orderLeftToRight,
  outerFrameBoxPt: [x0, 200, x1, 400],
  storeyBandPt: [0, 150, 1_000, 450],
});
const placedAt = (tag, wallOrder, alongWallFraction, count) => ({
  tag, planPageNo: 4, planCandidateId: `${tag}_p4_1`, storey: "GROUND FLOOR", elevation: "A",
  planEvidenceBoxPt: [0, 0, 1, 1], wallOrder, faceOpeningCount: count, alongWallFraction,
  distanceFromStartPt: alongWallFraction * 100, confidence: "verified", basis: [],
});

test("elevation inventory: one task per face and storey, saying what the schedule expects there (§7.2)", () => {
  // The plan has already said which wall each opening is in and in what order.
  // A face task is that answer turned into a question for the elevation: this
  // many openings, these widths, on this sheet.
  const built = elevationFaceTasks({
    placements: [
      { ...placedAt("W1", 1, 0.1, 2), elevation: "A", storey: "GROUND FLOOR" },
      { ...placedAt("W2", 2, 0.8, 2), elevation: "A", storey: "GROUND FLOOR" },
      { ...placedAt("W5", 1, 0.5, 1), elevation: "A", storey: "FIRST FLOOR" },
      { ...placedAt("W3", 1, 0.4, 1), elevation: "B", storey: "GROUND FLOOR" },
      { ...placedAt("W4", 1, 0.4, 1), elevation: "C", storey: "GROUND FLOOR" },
    ],
    faceSheets: new Map([["A", [7]], ["B", [7]]]),
    widthByTag: new Map([["W1", 1800], ["W2", 900], ["W3", 600], ["W4", 600], ["W5", 1200]]),
    sheets: new Map([[7, { overviewRenderId: "r7", overviewBoxPt: [0, 0, 1000, 700], scaleCandidates: [] }]]),
  });

  assert.deepEqual(built.tasks.map((t) => [t.elevation, t.storey, t.expectedOpeningCount]),
    [["A", "GROUND FLOOR", 2], ["A", "FIRST FLOOR", 1], ["B", "GROUND FLOOR", 1]]);
  assert.deepEqual(built.tasks[0].scheduledWidthsMm, [1800, 900],
    "widths run in the plan's own wall order, so the elevation can be compared against them");
  assert.equal(built.tasks[0].pageNo, 7);
  assert.equal(built.tasks[0].overviewRenderId, "r7");
  assert.equal(new Set(built.tasks.map((t) => t.faceKey)).size, 3, "face and storey together key a task");

  // A wall the plan named but no elevation sheet draws is a lost opening, not a
  // quiet omission: nothing downstream can crop what was never asked for.
  assert.deepEqual(built.skipped.map((s) => s.elevation), ["C"]);
  assert.match(built.skipped[0].reason, /no elevation sheet|C/i);
});

const faceTask = (expectedOpeningCount, scheduledWidthsMm = []) => ({
  faceKey: JSON.stringify([7, "A", "GROUND FLOOR"]),
  pageNo: 7, elevation: "A", storey: "GROUND FLOOR",
  expectedOpeningCount, scheduledWidthsMm,
  overviewRenderId: "r7", overviewBoxPt: [0, 0, 1000, 700], scaleCandidates: [],
});

test("elevation inventory: a frame list is checked against the face it was asked about (§7.2)", () => {
  const storeyBand = [0.05, 0.2, 0.95, 0.7];
  const clean = validateElevationFrames(
    {
      storeyBand,
      frames: [{ box: [0.6, 0.3, 0.7, 0.6] }, { box: [0.1, 0.3, 0.2, 0.6] }, { box: [0.35, 0.3, 0.45, 0.6] }],
    },
    faceTask(3),
  );
  assert.equal(clean.state, "resolved");
  assert.deepEqual(clean.frames.map((f) => f.orderLeftToRight), [1, 2, 3]);
  assert.deepEqual(clean.frames.map((f) => Math.round(f.outerFrameBoxPt[0])), [100, 350, 600],
    "frames are ordered by where they are drawn, not by the order they were listed in");
  assert.equal(clean.frames.every((f) => f.faceKey === faceTask(3).faceKey && f.pageNo === 7), true);
  assert.deepEqual(clean.frames[0].storeyBandPt.map((n) => Math.round(n)), [50, 140, 950, 490]);
  assert.equal(clean.frames.every((f) => f.confidence === "verified"), true);

  // A box with no width, a box drawn below the storey the question was about,
  // and the same frame read twice are all dropped - and dropping them leaves a
  // count the plan disagrees with, which is a conflict rather than an answer.
  const dirty = validateElevationFrames(
    {
      storeyBand,
      frames: [
        { box: [0.1, 0.3, 0.2, 0.6] },
        { box: [0.35, 0.3, 0.35, 0.6] },
        { box: [0.6, 0.75, 0.7, 0.9] },
        { box: [0.101, 0.3, 0.201, 0.6] },
      ],
    },
    faceTask(3),
  );
  assert.equal(dirty.state, "unresolved");
  assert.match(dirty.reason, /1 .*3|3 .*1/);
  assert.equal(dirty.task.faceKey, faceTask(3).faceKey);
});

test("elevation inventory: the call is closed to the face it is about (§7.2)", () => {
  const skill = makeElevationInventorySkill(faceTask(3, [1800, 900, 600]));
  assert.match(skill.buildPrompt(), /never instructions|not instructions/i);
  assert.match(skill.buildPrompt(), /GROUND FLOOR/);
  assert.match(skill.buildPrompt(), /3/);
  assert.match(skill.buildPrompt(), /Name nothing|name nothing/,
    "the plan has already said which openings these are");
  assert.equal(skill.responseSchema.properties.frames.items.additionalProperties, false);
  assert.equal(skill.responseSchema.additionalProperties, false);
  assert.equal(skill.validate({ storeyBand: [0.05, 0.2, 0.95, 0.7], frames: [
    { box: [0.1, 0.3, 0.16, 0.6] }, { box: [0.4, 0.3, 0.46, 0.6] }, { box: [0.7, 0.3, 0.76, 0.6] },
  ] }).state, "resolved");
  assert.equal(skill.validate({ frames: [] }).state, "unresolved");
});

test("elevation inventory: two faces whose names run together are still two faces (§7.2)", () => {
  // Joining a face and a storey with a space makes "A B" on storey "C" and "A"
  // on storey "B C" the same group, and one of the two loses its openings to
  // the other's task.
  const built = elevationFaceTasks({
    placements: [
      { ...placedAt("W1", 1, 0.2, 1), elevation: "A B", storey: "C" },
      { ...placedAt("W2", 1, 0.8, 1), elevation: "A", storey: "B C" },
    ],
    faceSheets: new Map([["A B", [7]], ["A", [7]]]),
    widthByTag: new Map([["W1", 900], ["W2", 900]]),
    sheets: new Map([[7, { overviewRenderId: "r7", overviewBoxPt: [0, 0, 1000, 700], scaleCandidates: [] }]]),
  });
  assert.deepEqual(built.tasks.map((t) => [t.elevation, t.storey, t.expectedOpeningCount]),
    [["A B", "C", 1], ["A", "B C", 1]]);
});

test("elevation inventory: a read that doubts itself, or contradicts itself, is not resolved (§7.2)", () => {
  const storeyBand = [0.05, 0.2, 0.95, 0.7];
  const twoFrames = [{ box: [0.1, 0.3, 0.2, 0.6] }, { box: [0.5, 0.3, 0.6, 0.6] }];

  // A frame the read is unsure of makes the inventory unsure: §7.2 refuses a
  // resolved inventory containing an ambiguous frame, and calling it verified
  // here is the engine inventing a confidence nobody claimed.
  const doubted = validateElevationFrames(
    { storeyBand, frames: [twoFrames[0], { ...twoFrames[1], confidence: "ambiguous" }] },
    faceTask(2));
  assert.equal(doubted.state, "unresolved");
  assert.match(doubted.reason, /ambiguous|unsure/i);

  // Two frames the read numbered the same are a read that contradicted itself.
  const repeated = validateElevationFrames(
    { storeyBand, frames: [{ ...twoFrames[0], order: 1 }, { ...twoFrames[1], order: 1 }] },
    faceTask(2));
  assert.equal(repeated.state, "unresolved");
  assert.match(repeated.reason, /order|numbered/i);

  // Frames that overlap are not two complete frames, however they are numbered.
  const overlapping = validateElevationFrames(
    { storeyBand, frames: [{ box: [0.10, 0.3, 0.30, 0.6] }, { box: [0.22, 0.3, 0.42, 0.6] }] },
    faceTask(2));
  assert.equal(overlapping.state, "unresolved");
  assert.match(overlapping.reason, /overlap/i);

  // The same frame listed twice is still one frame, and dropping the repeat is
  // not the same as two openings drawn on top of each other.
  const twice = validateElevationFrames(
    { storeyBand, frames: [twoFrames[0], { box: [0.101, 0.3, 0.201, 0.6] }, twoFrames[1]] },
    faceTask(2));
  assert.equal(twice.state, "resolved");
  assert.deepEqual(twice.frames.map((f) => f.orderLeftToRight), [1, 2]);
});

test("frame matching: an elevation read the other way round is matched the other way round (§7.3)", () => {
  // The plan is drawn looking down, the elevation looking at the wall, so one
  // face reads with the plan and the opposite against it. Getting this wrong is
  // invisible: every opening still matches something.
  //
  // wallOrder always ascends with position along the wall, so the two lists are
  // never in disagreeing order and the order alone settles nothing. The spacing
  // does: openings crowded at one end of the plan wall are crowded at the far
  // end of an elevation that looks at the wall from the other side.
  const frames = [frameAt(1, 100, 200), frameAt(2, 700, 800), frameAt(3, 800, 900)];
  const withPlan = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.06, 3), placedAt("W2", 2, 0.81, 3), placedAt("W3", 3, 0.94, 3)],
    frames,
  });
  assert.equal(withPlan.direction, "with_plan");
  assert.deepEqual(withPlan.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f1"], ["W2", "f2"], ["W3", "f3"]]);

  const mirrored = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.06, 3), placedAt("W2", 2, 0.19, 3), placedAt("W3", 3, 0.94, 3)],
    frames,
  });
  assert.equal(mirrored.direction, "against_plan");
  assert.deepEqual(mirrored.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f3"], ["W2", "f2"], ["W3", "f1"]]);
});

test("frame matching: seven openings, boxes read a little off, one frame each (§7.3)", () => {
  // A frame read off a drawing is a box a model drew round something, so its
  // edges are approximate and the odd one lands late. What must survive that is
  // the pairing: every opening gets one frame, every frame gets one opening,
  // and no frame is used twice to make the numbers meet.
  const frames = [
    frameAt(1, 100, 160), frameAt(2, 210, 250), frameAt(3, 300, 420),
    // Read late and narrow, overlapping where its neighbour was expected.
    frameAt(4, 470, 500), frameAt(5, 505, 585), frameAt(6, 700, 760), frameAt(7, 820, 900),
  ];
  const placements = [
    placedAt("W1", 1, 0.02, 7), placedAt("W2", 2, 0.15, 7), placedAt("W3", 3, 0.28, 7),
    placedAt("W4", 4, 0.45, 7), placedAt("W5", 5, 0.62, 7), placedAt("W6", 6, 0.78, 7),
    placedAt("W7", 7, 0.96, 7),
  ];
  const result = matchFacePlacements({ placements, frames });
  assert.equal(result.direction, "with_plan");
  assert.deepEqual(result.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f1"], ["W2", "f2"], ["W3", "f3"], ["W4", "f4"], ["W5", "f5"], ["W6", "f6"], ["W7", "f7"]]);
  assert.equal(new Set(result.matches.map((m) => m.frame.frameId)).size, 7,
    "no frame stands in for two openings");
  assert.equal(new Set(result.matches.map((m) => m.tag)).size, 7);
});

test("frame matching: two openings tell their directions apart by their widths (§7.3)", () => {
  // Two frames sit at the two ends of their own extent whichever way round the
  // elevation runs, so position alone can never settle a pair. What can is how
  // wide each is: 1800mm and 900mm at 1:100 are 51pt and 26pt, and only one
  // pairing puts the wide opening against the wide frame.
  const frames = [frameAt(1, 100, 125.5), frameAt(2, 500, 551)];
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.2, 2), placedAt("W2", 2, 0.8, 2)],
    frames,
    widthByTag: new Map([["W1", 1800], ["W2", 900]]),
    pageScaleRatio: 100,
  });
  assert.equal(result.direction, "against_plan");
  assert.deepEqual(result.matches.map((m) => [m.tag, m.frame.frameId]), [["W1", "f2"], ["W2", "f1"]]);
  assert.deepEqual(result.matches.map((m) => m.widthAgreement), ["within_tolerance", "within_tolerance"]);

  // With nothing to tell them apart - same width, same spacing - it stays a
  // pair of openings nobody can order, not a coin toss.
  assert.equal(matchFacePlacements({
    placements: [placedAt("W1", 1, 0.2, 2), placedAt("W2", 2, 0.8, 2)],
    frames: [frameAt(1, 100, 151), frameAt(2, 500, 551)],
    widthByTag: new Map([["W1", 1800], ["W2", 1800]]),
    pageScaleRatio: 100,
  }).direction, "unresolved");
});

test("frame matching: openings crowded in the middle of a wall are not read backwards (§7.3)", () => {
  // Openings that sit between a fifth and half way along a wall span a fifth of
  // it, while the frames drawn for them span the whole of their own extent.
  // Measuring one against the other compares a fraction of a wall with a
  // fraction of four frames, and the two do not mean the same thing: read that
  // way this face comes out reversed, with every opening matched to the wrong
  // frame and nothing anywhere saying so.
  const frames = [
    { ...frameAt(1, 150, 250) }, { ...frameAt(2, 375, 425) },
    { ...frameAt(3, 440, 460) }, { ...frameAt(4, 510, 590) },
  ];
  const result = matchFacePlacements({
    placements: [
      placedAt("W1", 1, 0.20, 4), placedAt("W2", 2, 0.40, 4),
      placedAt("W3", 3, 0.45, 4), placedAt("W4", 4, 0.55, 4),
    ],
    frames,
  });
  assert.equal(result.direction, "with_plan");
  assert.deepEqual(result.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f1"], ["W2", "f2"], ["W3", "f3"], ["W4", "f4"]]);
});

test("frame matching: a tag printed on the elevation settles what spacing cannot (§7.3)", () => {
  // Some sets label their elevations too. A tag printed inside a frame says
  // which opening that frame is outright, and it outranks any argument from
  // where things sit.
  const frames = [frameAt(1, 100, 200), frameAt(2, 400, 500), frameAt(3, 800, 900)];
  const evenly = [placedAt("W1", 1, 0.0625, 3), placedAt("W2", 2, 0.5, 3), placedAt("W3", 3, 0.9375, 3)];
  assert.equal(matchFacePlacements({ placements: evenly, frames }).direction, "unresolved");

  const labelled = matchFacePlacements({
    placements: evenly,
    frames,
    // W3 is drawn at the left-hand end, so this face is read against the plan.
    tagWordsPt: [{ tag: "W3", boxPt: [140, 330, 166, 344] }],
  });
  assert.equal(labelled.direction, "against_plan");
  assert.deepEqual(labelled.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f3"], ["W2", "f2"], ["W3", "f1"]]);

  // A label that agrees with neither reading is a contradiction, not a casting
  // vote: it belongs to a frame that the plan says holds a different opening
  // whichever way round the wall is read.
  assert.equal(matchFacePlacements({
    placements: evenly,
    frames,
    tagWordsPt: [{ tag: "W1", boxPt: [440, 330, 466, 344] }],
  }).direction, "unresolved");
});

test("frame matching: without a scale, the widths still say which is which (§7.3)", () => {
  // A page that states no scale cannot turn 1800mm into points, but 1800 beside
  // 900 is still twice as wide, and so is the frame drawn for it.
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.2, 2), placedAt("W2", 2, 0.8, 2)],
    frames: [frameAt(1, 100, 126), frameAt(2, 500, 551)],
    widthByTag: new Map([["W1", 1800], ["W2", 900]]),
    pageScaleRatio: null,
  });
  assert.equal(result.direction, "against_plan");
  assert.deepEqual(result.matches.map((m) => [m.tag, m.frame.frameId]), [["W1", "f2"], ["W2", "f1"]]);
  assert.deepEqual(result.matches.map((m) => m.widthAgreement), ["unknown", "unknown"],
    "a shape that fits is not a measurement that agrees");
});

test("frame matching: a face that reads the same both ways round is not matched (§7.3)", () => {
  // Evenly spaced openings look identical from either side. Picking one way
  // anyway pairs every opening with a frame and is wrong about half of them.
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.0625, 3), placedAt("W2", 2, 0.5, 3), placedAt("W3", 3, 0.9375, 3)],
    frames: [frameAt(1, 100, 200), frameAt(2, 400, 500), frameAt(3, 800, 900)],
  });
  assert.equal(result.direction, "unresolved");
  assert.equal(result.matches.length, 0);
  assert.match(result.reason, /both ways|either way|guess/i);
});

test("frame matching: one opening and one frame is the same pairing either way (§7.3)", () => {
  // Direction is a fact about the wall, and one opening does not carry it: the
  // scores are equal because there is nothing to be equal about. Refusing here
  // would lose every face that has a single opening, which is most of them.
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.3, 1)],
    frames: [frameAt(1, 400, 500)],
  });
  assert.equal(result.matches.map((m) => [m.tag, m.frame.frameId]).length, 1);
  assert.deepEqual(result.matches.map((m) => [m.tag, m.frame.frameId]), [["W1", "f1"]]);
  assert.notEqual(result.direction, "unresolved");
});

test("frame matching: a count that does not agree is not matched (§7.3)", () => {
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.1, 2), placedAt("W2", 2, 0.9, 2)],
    frames: [frameAt(1, 100, 200), frameAt(2, 400, 500), frameAt(3, 800, 900)],
  });
  assert.equal(result.direction, "unresolved");
  assert.equal(result.matches.length, 0);
  assert.match(result.reason, /2 openings.*3 frames|count/i);
});

test("frame matching: a frame too narrow for its scheduled width is matched but not verified (§7.3)", () => {
  // The scale says how wide 1800mm is on this page, so a frame drawn a third of
  // that is either the wrong frame or a badly read box. Either way the crop it
  // would produce is not one to trust silently.
  const result = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.03, 3), placedAt("W2", 2, 0.83, 3), placedAt("W3", 3, 0.97, 3)],
    frames: [frameAt(1, 100, 151), frameAt(2, 700, 751), frameAt(3, 800, 815)],
    widthByTag: new Map([["W1", 1800], ["W2", 1800], ["W3", 1800]]),
    pageScaleRatio: 100,
  });
  assert.equal(result.direction, "with_plan");
  assert.deepEqual(result.matches.map((m) => [m.tag, m.widthAgreement]),
    [["W1", "within_tolerance"], ["W2", "within_tolerance"], ["W3", "conflict"]]);
  assert.deepEqual(result.matches.map((m) => m.confidence), ["verified", "verified", "ambiguous"]);
  assert.match(result.matches[2].warnings.join(" "), /width/i);
  assert.equal(result.matches[0].warnings.length, 0);
  assert.equal(Math.round(result.matches[0].expectedWidthPt), 51);

  // A page whose scale nothing states cannot contradict a width, and an
  // unmeasured frame is not a suspicious one.
  const unscaled = matchFacePlacements({
    placements: [placedAt("W1", 1, 0.03, 3), placedAt("W2", 2, 0.83, 3), placedAt("W3", 3, 0.97, 3)],
    frames: [frameAt(1, 100, 151), frameAt(2, 700, 751), frameAt(3, 800, 815)],
    widthByTag: new Map([["W1", 1800], ["W2", 1800], ["W3", 1800]]),
    pageScaleRatio: null,
  });
  assert.deepEqual(unscaled.matches.map((m) => m.widthAgreement), ["unknown", "unknown", "unknown"]);
  assert.deepEqual(unscaled.matches.map((m) => m.expectedWidthPt), [null, null, null]);
  assert.deepEqual(unscaled.matches.map((m) => m.confidence), ["verified", "verified", "verified"]);
});

test("face reconciliation: one look at a face nothing settled, at only what it was given (§7.3)", () => {
  // Evenly spaced openings read the same from either side, so the drawing
  // cannot say which end the elevation counts from. That is the one question a
  // look at the face is asked - not which frame is which opening, which the
  // plan already decided.
  const frames = [frameAt(1, 100, 200), frameAt(2, 400, 500), frameAt(3, 800, 900)];
  const placements = [placedAt("W1", 1, 0.0625, 3), placedAt("W2", 2, 0.5, 3), placedAt("W3", 3, 0.9375, 3)];
  const unsettled = matchFacePlacements({ placements, frames });
  assert.equal(unsettled.direction, "unresolved");

  const faces = Array.from({ length: FACE_RECONCILE_LIMITS.maxFaces + 3 }, (_unused, at) => ({
    faceKey: JSON.stringify([7, "A", `STOREY ${at}`]),
    placements, frames, reason: unsettled.reason,
  }));
  assert.equal(faceReconciliationTasks(faces).length, FACE_RECONCILE_LIMITS.maxFaces,
    "a run cannot buy itself unlimited looks by having unlimited unsettled faces");

  const skill = makeFaceReconcileSkill(faceReconciliationTasks(faces)[0]);
  assert.deepEqual(skill.responseSchema.properties.pairs.items.properties.tag.enum, ["W1", "W2", "W3"]);
  assert.deepEqual(skill.responseSchema.properties.pairs.items.properties.frameId.enum, ["f1", "f2", "f3"]);
  assert.match(skill.buildPrompt(), /never instructions|not instructions/i);
  assert.match(skill.buildPrompt(), /W1/, "the plan's evidence goes with the elevation's");
  assert.match(skill.buildPrompt(), /f3/);

  const settled = skill.validate({ pairs: [
    { tag: "W1", frameId: "f3" }, { tag: "W2", frameId: "f2" }, { tag: "W3", frameId: "f1" },
  ] });
  assert.deepEqual(settled.matches.map((m) => [m.tag, m.frame.frameId]),
    [["W1", "f3"], ["W2", "f2"], ["W3", "f1"]]);
  assert.equal(settled.direction, "against_plan");
  assert.equal(settled.matches.every((m) => m.confidence === "ambiguous"), true,
    "a direction nothing on the page settled is not a verified one");
  assert.equal(settled.matches[0].placement.tag, "W1",
    "the plan evidence a pairing was made on travels with it");

  // A frame the face does not have, a frame standing in for two openings, and
  // an answer that leaves an opening out are all refusals - and so is a pairing
  // that is neither reading of the wall, because a third one is an invention.
  for (const pairs of [
    [{ tag: "W1", frameId: "f9" }, { tag: "W2", frameId: "f2" }, { tag: "W3", frameId: "f1" }],
    [{ tag: "W1", frameId: "f1" }, { tag: "W2", frameId: "f1" }, { tag: "W3", frameId: "f3" }],
    [{ tag: "W1", frameId: "f1" }],
    [{ tag: "W1", frameId: "f2" }, { tag: "W2", frameId: "f1" }, { tag: "W3", frameId: "f3" }],
  ]) {
    assert.equal(skill.validate({ pairs }), null, JSON.stringify(pairs));
  }
});

// ── Phase D — crops (§7.5) ─────────────────────────────────────────────────
const cropFrame = (frameId, order, x0, x1) => ({
  frameId, faceKey: JSON.stringify([7, "A", "GROUND FLOOR"]), pageNo: 7,
  elevation: "A", storey: "GROUND FLOOR", orderLeftToRight: order,
  outerFrameBoxPt: [x0, 300, x1, 420], storeyBandPt: [40, 240, 960, 480],
  confidence: "verified", basis: [],
});

test("opening crops: the drawing gives the centre, the schedule and the scale give the width (§7.5)", () => {
  // 1800mm at 1:100 is 51pt. The frame drawn round it is narrower than that,
  // and the scale wins: a crop is sized by measurement, not by how well a box
  // was drawn.
  const crops = openingCropTasks({
    matches: [
      { tag: "W1", frame: cropFrame("f1", 1, 180, 220), expectedWidthPt: expectedWidthPt(1800, 100) },
      { tag: "W2", frame: cropFrame("f2", 2, 600, 660), expectedWidthPt: expectedWidthPt(1800, 100) },
    ],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.equal(crops.length, 2);
  const [first] = crops;
  assert.equal(first.dpi, 300);
  assert.equal(first.threshold, null);
  assert.equal(first.tag, "W1");
  assert.equal(first.basis, "scaled");

  // Centre 200, width 51 -> 174.5 to 225.5, plus 15% margin (7.7pt, under the
  // 8pt floor, so 8pt each side).
  assert.deepEqual(first.bboxPt.map((n) => Math.round(n)), [166, 228, 234, 492]);

  // The full storey band vertically, plus 5%, clamped to the page.
  assert.equal(Math.round(first.bboxPt[1]), 228);
  assert.equal(Math.round(first.bboxPt[3]), 492);
});

test("opening crops: a frame wider than the scale says is never cropped into (§7.5)", () => {
  const [wide] = openingCropTasks({
    matches: [{ tag: "W1", frame: cropFrame("f1", 1, 150, 400), expectedWidthPt: expectedWidthPt(1800, 100) }],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.equal(wide.basis, "wider_frame");
  assert.equal(wide.bboxPt[0] < 150, true, "the drawn frame is inside the crop, margin and all");
  assert.equal(wide.bboxPt[2] > 400, true);
  assert.match(wide.warnings.join(" "), /wider/i);
});

test("opening crops: no scale means a wider crop that says so (§7.5)", () => {
  const [unscaled] = openingCropTasks({
    matches: [{ tag: "W1", frame: cropFrame("f1", 1, 180, 220), expectedWidthPt: null }],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.equal(unscaled.basis, "wide_unscaled",
    "a crop sized by fallback is never mistaken for one sized by measurement");
  assert.equal(unscaled.bboxPt[2] - unscaled.bboxPt[0] > 40 * 1.3, true, "and it is wider than the frame");
});

test("opening crops: a crop holding the neighbour's centre is refused (§7.5)", () => {
  // A frame read too wide, or a centre read off the wrong opening, produces a
  // crop with two openings in it. Phase E would then read the neighbour and
  // file it under this tag, which is worse than reading nothing.
  const crops = openingCropTasks({
    matches: [
      { tag: "W1", frame: cropFrame("f1", 1, 180, 500), expectedWidthPt: null },
      { tag: "W2", frame: cropFrame("f2", 2, 380, 420), expectedWidthPt: expectedWidthPt(1800, 100) },
    ],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.deepEqual(crops.map((c) => c.tag), ["W2"]);
});

test("opening crops: a storey band taller than the page is trimmed, not thrown away (§7.5)", () => {
  const tall = {
    ...cropFrame("f1", 1, 180, 220),
    storeyBandPt: [40, 20, 960, 690],
  };
  const [crop] = openingCropTasks({
    matches: [{ tag: "W1", frame: tall, expectedWidthPt: expectedWidthPt(1800, 100) }],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.equal(crop.bboxPt[1], 0, "the band plus its margin runs off the top, so the crop starts at the page");
  assert.equal(crop.bboxPt[3], 700);
});

test("opening crops: a crop leaving the page is refused (§7.5)", () => {
  const crops = openingCropTasks({
    matches: [{ tag: "W1", frame: cropFrame("f1", 1, 2, 30), expectedWidthPt: null }],
    pageSizePt: [1000, 700],
    sourceFileId: "file_1",
  });
  assert.deepEqual(crops, []);
});

// ── Phase E — compositions, in parallel (§7.6) ─────────────────────────────
const compositionTask = (at) => ({
  tag: `W${at + 1}`, frameId: `f${at + 1}`, cropRenderId: `crop_${at + 1}`,
  imageDataUrl: `data:image/png;base64,AAAA${at}`,
});

test("compositions: openings go out in fours, and come back in the order they went (§7.6)", () => {
  assert.deepEqual(
    compositionBatches(Array.from({ length: 19 }, (_unused, at) => compositionTask(at))).map((b) => b.length),
    [4, 4, 4, 4, 3]);
  assert.deepEqual(
    compositionBatches(Array.from({ length: 27 }, (_unused, at) => compositionTask(at))).map((b) => b.length),
    [4, 4, 4, 4, 4, 4, 3]);
  assert.deepEqual(compositionBatches([]).length, 0);
});

test("compositions: a record answers for the opening it was asked about, or for nothing (§7.6)", () => {
  const batch = [compositionTask(0), compositionTask(1)];
  const skill = makeCompositionSkill(batch);
  assert.match(skill.buildPrompt(), /never instructions|not instructions/i);

  const read = skill.validate({ readings: [
    { tag: "W1", frameId: "f1", cropRenderId: "crop_1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high" },
    // Right tag, wrong crop: it is not an answer about this opening at all.
    { tag: "W2", frameId: "f2", cropRenderId: "crop_9", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical", confidence: "high" },
  ] });
  assert.deepEqual(read.map((o) => [o.state, o.value?.tag ?? o.tag]),
    [["value", "W1"], ["not_read", "W2"]],
    "an opening nothing valid was said about is not filled in from its neighbour");
  assert.deepEqual(read[0].value.operations, ["awning"]);
  assert.equal(read[0].value.cropRenderId, "crop_1");

  // What the drawing does not say is a state, not a guess.
  const silent = skill.validate({ readings: [
    { tag: "W1", frameId: "f1", cropRenderId: "crop_1", notStated: true, reason: "the crop shows no operation marks" },
    { tag: "W2", frameId: "f2", cropRenderId: "crop_2", operations: ["sliding"], unitRatios: [0.5, 0.5], divisionAxis: "vertical", confidence: "low" },
  ] });
  assert.deepEqual(silent.map((o) => o.state), ["not_stated", "value"]);
  assert.equal(skill.validate("not json at all"), null);
});

test("compositions: a reading that does not hold together is not a value (§7.6)", () => {
  const batch = [compositionTask(0)];
  const skill = makeCompositionSkill(batch);

  // One operation for two parts, and parts that do not make a whole: whichever
  // of the two the reader got wrong, this is not a description of the opening.
  assert.equal(skill.validate({ readings: [{
    tag: "W1", frameId: "f1", cropRenderId: "crop_1",
    operations: ["fixed"], unitRatios: [0.8, 0.8], divisionAxis: "vertical", confidence: "high",
  }] })[0].state, "not_read");

  // Two answers about the same opening that disagree are not evidence of
  // either: taking whichever came first is picking at random.
  assert.equal(skill.validate({ readings: [
    { tag: "W1", frameId: "f1", cropRenderId: "crop_1", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical", confidence: "high" },
    { tag: "W1", frameId: "f1", cropRenderId: "crop_1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high" },
  ] })[0].state, "not_read");

  // Parts that do make a whole, one operation each.
  assert.equal(skill.validate({ readings: [{
    tag: "W1", frameId: "f1", cropRenderId: "crop_1",
    operations: ["fixed", "awning"], unitRatios: [0.6, 0.4], divisionAxis: "vertical", confidence: "high",
  }] })[0].state, "value");
});

test("compositions: an answer nobody can use is asked again, once, within the run's ceiling (§7.6)", async () => {
  const attempts = [];
  const answered = await runCompositions({
    tasks: [compositionTask(0), compositionTask(1)],
    ask: async (batch, attempt) => {
      attempts.push(attempt);
      // First time back: schema-shaped, and useless.
      if (attempt === 1) return { readings: [{ tag: "W1", frameId: "f9", cropRenderId: "crop_9" }] };
      return { readings: batch.map((task) => ({
        tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
        operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
      })) };
    },
  });
  assert.deepEqual(attempts, [1, 2], "a batch that came back unusable is asked again");
  assert.deepEqual(answered.map((o) => o.state), ["value", "value"]);

  // And a run cannot spend its way out: past the ceiling, batches are not asked.
  const asked = [];
  const capped = await runCompositions({
    tasks: Array.from({ length: 12 }, (_unused, at) => compositionTask(at)),
    callCeiling: 2,
    ask: async (batch) => { asked.push(batch[0].tag); return { readings: [] }; },
  });
  assert.equal(asked.length, 2);
  assert.equal(capped.length, 12);
  assert.equal(capped.every((o) => o.state !== "value"), true);
});

test("compositions: a batch that fails takes only itself down (§7.6)", async () => {
  const tasks = Array.from({ length: 9 }, (_unused, at) => compositionTask(at));
  const asked = [];
  const answered = await runCompositions({
    tasks,
    concurrency: 4,
    ask: async (batch, attempt) => {
      asked.push({ tags: batch.map((t) => t.tag), attempt });
      // The middle batch fails once and answers on the retry; the last one
      // never answers at all.
      if (batch[0].tag === "W5" && attempt === 1) throw new Error("provider said no");
      if (batch[0].tag === "W9") return { readings: [] };
      return { readings: batch.map((task) => ({
        tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
        operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
      })) };
    },
  });

  assert.deepEqual(answered.map((o) => o.state),
    ["value", "value", "value", "value", "value", "value", "value", "value", "not_read"]);
  assert.deepEqual(answered.map((o) => o.value?.tag ?? o.tag), tasks.map((t) => t.tag),
    "the order openings came back in is the order they went out in");
  assert.deepEqual(asked.filter((a) => a.tags[0] === "W5").map((a) => a.attempt), [1, 2],
    "one corrective retry, and only for the batch that needed it");
  assert.equal(tasks.every((task) => task.imageDataUrl === null), true,
    "the images are let go once their batch has settled");
});

// ── Report — one row per scheduled opening (§7.7, Task 10) ─────────────────
test("report: every scheduled opening gets exactly one row, read or not (Task 10)", () => {
  const report = faceMappedReadings({
    fileId: "file_1",
    sourceFileId: "src_1",
    roster: ["W1", "W2", "W3", "W4"],
    placements: new Map([
      ["W1", { tag: "W1", elevation: "NORTH", storey: "GROUND FLOOR", planPageNo: 3, wallOrder: 1, confidence: "verified" }],
      ["W2", { tag: "W2", elevation: "NORTH", storey: "GROUND FLOOR", planPageNo: 3, wallOrder: 2, confidence: "ambiguous" }],
      ["W3", { tag: "W3", elevation: "EAST", storey: "GROUND FLOOR", planPageNo: 3, wallOrder: 1, confidence: "verified" }],
    ]),
    unplaced: new Map([["W4", "not tagged on any plan page"]]),
    crops: new Map([
      ["W1", { cropRenderId: "crop_1", cropKey: "k1", pageNo: 7, bboxPt: [10, 20, 60, 200] }],
      ["W2", { cropRenderId: "crop_2", cropKey: "k2", pageNo: 7, bboxPt: [70, 20, 120, 200] }],
    ]),
    compositions: [
      { state: "value", value: { tag: "W1", frameId: "f1", cropRenderId: "crop_1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high", flags: [], basis: ["crop crop_1"] } },
      { state: "not_stated", tag: "W2", cropRenderId: "crop_2", reason: "the crop shows no operation marks" },
    ],
  });

  assert.deepEqual(report.map((r) => r.externalRef), ["W1", "W2", "W3", "W4"],
    "the schedule is the roster, and every row on it is accounted for");
  const byTag = Object.fromEntries(report.map((r) => [r.externalRef, r]));

  assert.equal(byTag.W1.splitState, "value");
  assert.deepEqual(byTag.W1.split.units.map((u) => [u.operation, u.ratio]), [["awning", 1]]);
  assert.equal(byTag.W1.elevation, "NORTH");
  assert.equal(byTag.W1.cropKey, "k1", "the crop a reading was made from travels with it");
  assert.deepEqual(byTag.W1.regionJson, [10, 20, 60, 200]);
  assert.equal(byTag.W1.pageNo, 7);
  assert.equal(byTag.W1.confidence, "high");
  assert.equal(byTag.W1.gapCode, null);

  // Placed, cropped, looked at, and the drawing still did not say.
  assert.equal(byTag.W2.splitState, "not_stated");
  assert.equal(byTag.W2.gapCode, "division_unreadable");
  assert.equal(byTag.W2.elevation, "NORTH", "what the plan settled survives what the crop could not");
  assert.equal(byTag.W2.cropKey, "k2");

  // Placed but never cropped: the gap names the phase that stopped, not the last one.
  assert.equal(byTag.W3.splitState, "not_read");
  assert.equal(byTag.W3.gapCode, "frame_ambiguous");
  assert.equal(byTag.W3.elevation, "EAST");
  assert.equal(byTag.W3.cropKey, null);

  // Never placed at all.
  assert.equal(byTag.W4.gapCode, "unplaced");
  assert.equal(byTag.W4.elevationState, "not_read");
  assert.equal(byTag.W4.elevation, null);
  assert.match(byTag.W4.gapNote, /not tagged/);
});

test("report: progress is appended, never rewritten, and each step owns its own time (§9)", async () => {
  const seen = [];
  const progress = faceMappedProgress(async (event) => { seen.push(event); });
  progress.at(1_000);
  await progress.step("plan_faces", "Mapping floor plans", 1, 3);
  progress.at(1_400);
  await progress.step("plan_faces", "Mapping floor plans", 3, 3);
  progress.at(2_900);
  await progress.step("composition_reads", "Reading opening compositions", 4, 27);

  assert.deepEqual(seen.map((e) => [e.phase, e.done, e.total]),
    [["plan_faces", 1, 3], ["plan_faces", 3, 3], ["composition_reads", 4, 27]]);
  assert.deepEqual(seen.map((e) => e.ms), [0, 400, 1_500],
    "a step is charged the interval it ran in, and no later step inherits it");
  assert.equal(seen.every((e, at) => at === 0 || e.done >= 0), true);

  // Going backwards inside a phase is not appended: progress that can go down
  // is progress nobody can read.
  await progress.step("composition_reads", "Reading opening compositions", 2, 27);
  assert.equal(seen.length, 3);
});

// ── Orchestration (§8) ─────────────────────────────────────────────────────
const facePage = (pageNo, text, words) => ({
  page: { pageNo, text, words },
  geometry: { pageNo, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: text.length, imageCount: 0, imageAreaFraction: 0 },
});

test("run: a document with no plan pages still reports every opening the schedule has (§10)", async () => {
  const progress = [];
  const run = await runFaceMappedParser({
    fileId: "file_1",
    sourceFileId: "src_1",
    scheduleRows: [
      { tag: "W1", widthMm: 1800, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 900, heightMm: 1200, typeText: "FIXED" },
    ],
    planPages: [],
    elevationPages: [],
    pageScales: new Map(),
    sheetTitles: new Map(),
    deps: {
      render: async () => { throw new Error("nothing should be rendered"); },
      storeCrop: async () => null,
      readPlanPage: async () => null,
      inventoryElevation: async () => null,
      reconcileFace: async () => null,
      readComposition: async () => null,
      onProgress: async (event) => { progress.push(event); },
    },
  });

  assert.deepEqual(run.readings.map((r) => [r.externalRef, r.gapCode]), [["W1", "unplaced"], ["W2", "unplaced"]],
    "a document nobody could map is a report of what was not read, never a shorter schedule");
  assert.equal(run.report.perOpening.length, 2);
  assert.equal(run.report.steps.placements.unplaced, 2);
  assert.deepEqual(progress.map((e) => e.phase).slice(-1), ["drawing_complete"]);
});

test("run: the phases hand on to each other, and what is read comes back against the schedule (§8)", async () => {
  const plan = facePage(3, "GROUND FLOOR PLAN", [
    { text: "W1", x0: 297, top: 250, x1: 323, bottom: 264 },
    { text: "W2", x0: 457, top: 250, x1: 483, bottom: 264 },
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
    { text: "NORTH", x0: 480, top: 250, x1: 530, bottom: 264 },
  ]);
  const elevations = facePage(5, "NORTH ELEVATION", [
    { text: "NORTH", x0: 100, top: 700, x1: 150, bottom: 714 },
    { text: "ELEVATION", x0: 155, top: 700, x1: 230, bottom: 714 },
  ]);

  const asked = [];
  const run = await runFaceMappedParser({
    fileId: "file_1",
    sourceFileId: "src_1",
    scheduleRows: [
      { tag: "W1", widthMm: 1800, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 900, heightMm: 1200, typeText: "FIXED" },
    ],
    planPages: [plan],
    elevationPages: [elevations],
    pageScales: new Map([[5, 100]]),
    sheetTitles: new Map([[3, "GROUND FLOOR PLAN"], [5, "NORTH ELEVATION"]]),
    deps: {
      render: async ({ pageNo }) => ({ images: [{ pngB64: `page${pageNo}`, widthPx: 1_000, heightPx: 800 }], dpi: 100 }),
      storeCrop: async (id) => `key_${id}`,
      readPlanPage: async () => null,
      inventoryElevation: async (input) => {
        asked.push(["inventory", input.task.elevation, input.task.expectedOpeningCount]);
        return { storeyBand: [0.05, 0.2, 0.95, 0.7], frames: [
          { box: [0.1, 0.3, 0.151, 0.6] }, { box: [0.5, 0.3, 0.5255, 0.6] },
        ] };
      },
      reconcileFace: async () => null,
      readComposition: async (input) => {
        asked.push(["composition", input.batch.map((t) => t.tag)]);
        return { readings: input.batch.map((task) => ({
          tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
          operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
        })) };
      },
    },
  });

  assert.deepEqual(asked[0], ["inventory", "NORTH", 2]);
  assert.deepEqual(run.readings.map((r) => [r.externalRef, r.splitState, r.elevation]),
    [["W1", "value", "NORTH"], ["W2", "value", "NORTH"]]);
  assert.equal(run.readings.every((r) => r.cropKey && r.regionJson), true,
    "a reading names the crop it was made from");
  assert.equal(run.report.steps.placements.fromText, 2);
  assert.equal(run.report.modelCalls > 0, true);
});

test("run: a face the drawing could not settle gets one look, and stays unsettled without one (§7.3, §10)", async () => {
  const plan = facePage(3, "GROUND FLOOR PLAN", [
    { text: "W1", x0: 297, top: 250, x1: 323, bottom: 264 },
    { text: "W2", x0: 457, top: 250, x1: 483, bottom: 264 },
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
    { text: "NORTH", x0: 480, top: 250, x1: 530, bottom: 264 },
  ]);
  const elevations = facePage(5, "NORTH ELEVATION", [
    { text: "NORTH", x0: 100, top: 700, x1: 150, bottom: 714 },
    { text: "ELEVATION", x0: 155, top: 700, x1: 230, bottom: 714 },
  ]);
  // Two openings of one width, two frames of one width: nothing tells the
  // directions apart, so the face goes to one look at it.
  const evenly = {
    fileId: "file_1",
    sourceFileId: "src_1",
    scheduleRows: [
      { tag: "W1", widthMm: 1800, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 1800, heightMm: 1200, typeText: "FIXED" },
    ],
    planPages: [plan],
    elevationPages: [elevations],
    pageScales: new Map([[5, 100]]),
    sheetTitles: new Map([[3, "GROUND FLOOR PLAN"], [5, "NORTH ELEVATION"]]),
  };
  const frames = { storeyBand: [0.05, 0.2, 0.95, 0.7], frames: [
    { box: [0.1, 0.3, 0.151, 0.6] }, { box: [0.5, 0.3, 0.551, 0.6] },
  ] };
  const readsEverything = async (input) => ({ readings: input.batch.map((task) => ({
    tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
    operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
  })) });

  const looked = [];
  const settled = await runFaceMappedParser({
    ...evenly,
    deps: {
      render: async ({ pageNo }) => ({ images: [{ pngB64: `page${pageNo}`, widthPx: 1_000, heightPx: 800 }], dpi: 100 }),
      storeCrop: async (id) => `key_${id}`,
      readPlanPage: async () => null,
      inventoryElevation: async () => frames,
      reconcileFace: async (input) => {
        looked.push(input.faceKey);
        return { pairs: [{ tag: "W1", frameId: input.frameIds[1] }, { tag: "W2", frameId: input.frameIds[0] }] };
      },
      readComposition: readsEverything,
    },
  });
  assert.equal(looked.length, 1, "one look at the one face that needed it");
  assert.deepEqual(settled.readings.map((r) => r.splitState), ["value", "value"]);
  assert.equal(settled.readings.every((r) => r.flags.includes("agentEvidenceWeak")), true,
    "a direction nothing on the page settled is not a verified one");

  // The same face, with nothing coming back from the look at it.
  const unsettled = await runFaceMappedParser({
    ...evenly,
    deps: {
      render: async ({ pageNo }) => ({ images: [{ pngB64: `page${pageNo}`, widthPx: 1_000, heightPx: 800 }], dpi: 100 }),
      storeCrop: async (id) => `key_${id}`,
      readPlanPage: async () => null,
      inventoryElevation: async () => frames,
      reconcileFace: async () => null,
      readComposition: readsEverything,
    },
  });
  assert.deepEqual(unsettled.readings.map((r) => r.gapCode), ["frame_ambiguous", "frame_ambiguous"]);
  assert.deepEqual(unsettled.readings.map((r) => r.elevation), ["NORTH", "NORTH"],
    "what the plan settled survives what the elevation could not");
});

test("report: a drawing that disagrees with the schedule says so (§7.6)", () => {
  const rows = faceMappedReadings({
    fileId: "file_1",
    sourceFileId: "src_1",
    roster: ["W1", "W2"],
    scheduleTypeByTag: new Map([["W1", "AWNING WINDOW"], ["W2", "SLIDING WINDOW"]]),
    placements: new Map([
      ["W1", { tag: "W1", elevation: "NORTH", storey: "GROUND FLOOR", planPageNo: 3, wallOrder: 1, confidence: "verified" }],
      ["W2", { tag: "W2", elevation: "NORTH", storey: "GROUND FLOOR", planPageNo: 3, wallOrder: 2, confidence: "verified" }],
    ]),
    unplaced: new Map(),
    crops: new Map([
      ["W1", { cropRenderId: "crop_1", cropKey: "k1", pageNo: 7, bboxPt: [10, 20, 60, 200] }],
      ["W2", { cropRenderId: "crop_2", cropKey: "k2", pageNo: 7, bboxPt: [70, 20, 120, 200] }],
    ]),
    compositions: [
      { state: "value", value: { tag: "W1", frameId: "f1", cropRenderId: "crop_1", operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high", flags: [], basis: [] } },
      { state: "value", value: { tag: "W2", frameId: "f2", cropRenderId: "crop_2", operations: ["fixed"], unitRatios: [1], divisionAxis: "vertical", confidence: "high", flags: [], basis: [] } },
    ],
  });
  const byTag = Object.fromEntries(rows.map((r) => [r.externalRef, r]));
  assert.equal(byTag.W1.flags.includes("scheduleDrawingMismatch"), false);
  assert.equal(byTag.W2.flags.includes("scheduleDrawingMismatch"), true,
    "the schedule calls it sliding and the drawing shows it fixed - both are reported, neither is corrected");
  assert.equal(byTag.W2.splitState, "value", "and the reading still stands: the mismatch is news, not a rejection");
});

test("run: a tag printed on the elevation reaches the matcher (§7.3)", async () => {
  const plan = facePage(3, "GROUND FLOOR PLAN", [
    { text: "W1", x0: 297, top: 250, x1: 323, bottom: 264 },
    { text: "W2", x0: 457, top: 250, x1: 483, bottom: 264 },
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
    { text: "NORTH", x0: 480, top: 250, x1: 530, bottom: 264 },
  ]);
  // The sheet labels its first frame W2, which the plan says is the second
  // opening along the wall - so this face is read against the plan, and one
  // printed tag settles what two equal widths never could.
  const elevations = facePage(5, "NORTH ELEVATION", [
    { text: "NORTH", x0: 100, top: 700, x1: 150, bottom: 714 },
    { text: "ELEVATION", x0: 155, top: 700, x1: 230, bottom: 714 },
    { text: "W2", x0: 110, top: 330, x1: 136, bottom: 344 },
  ]);
  const looked = [];
  const run = await runFaceMappedParser({
    fileId: "file_1",
    sourceFileId: "src_1",
    scheduleRows: [
      { tag: "W1", widthMm: 1800, heightMm: 1200, typeText: "AWNING" },
      { tag: "W2", widthMm: 1800, heightMm: 1200, typeText: "AWNING" },
    ],
    planPages: [plan],
    elevationPages: [elevations],
    pageScales: new Map([[5, 100]]),
    sheetTitles: new Map([[3, "GROUND FLOOR PLAN"], [5, "NORTH ELEVATION"]]),
    deps: {
      render: async ({ pageNo }) => ({ images: [{ pngB64: `page${pageNo}`, widthPx: 1_000, heightPx: 800 }], dpi: 100 }),
      storeCrop: async (id) => `key_${id}`,
      readPlanPage: async () => null,
      inventoryElevation: async () => ({ storeyBand: [0.05, 0.2, 0.95, 0.7], frames: [
        { box: [0.1, 0.3, 0.151, 0.6] }, { box: [0.5, 0.3, 0.551, 0.6] },
      ] }),
      reconcileFace: async (input) => { looked.push(input.faceKey); return null; },
      readComposition: async (input) => ({ readings: input.batch.map((task) => ({
        tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
        operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
      })) }),
    },
  });
  assert.deepEqual(looked, [], "nothing needed a second look");
  assert.deepEqual(run.readings.map((r) => r.splitState), ["value", "value"]);
});

test("plan recovery: only the unplaced are asked about, in the document's own words (P2-AC9, AC11, AC12)", () => {
  const plan = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540), tagWord("W3", 217, 400),
    ...planRooms,
    // Only the top wall is named, so W2 and W3 cannot be placed from text.
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
  ]);
  const first = placeOpeningsOnPlan({ pages: [plan], roster: ["W1", "W2", "W3"] });
  const asked = planFaceRecoveryRequest({ outcomes: first, pages: [plan], roster: ["W1", "W2", "W3"] });
  assert.deepEqual(asked.map((page) => page.pageNo), [4]);
  assert.deepEqual(asked[0].pageCandidateIds.sort(), ["W1_p4_1", "W2_p4_1", "W3_p4_1"],
    "every opening the page has, so an answer about one of them can be told from an invention");
  assert.deepEqual(asked[0].candidates.map((c) => c.tag).sort(), ["W2", "W3"],
    "an opening the plan already placed is not sent to a model");
  assert.equal(asked[0].candidates.every((c) => /^W[23]_p4_1$/.test(c.planCandidateId)), true);

  const answered = validatePlanFaceAnswer(
    [
      { planCandidateId: asked[0].candidates.find((c) => c.tag === "W2").planCandidateId, elevation: "B" },
      { planCandidateId: asked[0].candidates.find((c) => c.tag === "W3").planCandidateId, elevation: "A" },
    ],
    new Set(asked[0].candidates.map((c) => c.planCandidateId)),
    new Set(["A", "B", "C", "D"]),
  );
  assert.equal(answered.size, 2);

  // P2-AC13: a response that fails validation in part fails in whole. A reader
  // that named a candidate nobody asked about, or a wall this document does not
  // have, was not reading this page, and its other rows are not evidence of
  // anything either - the openings it would have fixed stay unresolved.
  for (const poison of [
    { planCandidateId: "W9_p4_1", elevation: "A" },
    { planCandidateId: asked[0].candidates[0].planCandidateId, elevation: "SOUTH" },
    { planCandidateId: asked[0].candidates[0].planCandidateId, elevation: "B", alongWallFraction: 4 },
    "not a row at all",
  ]) {
    const spoiled = validatePlanFaceAnswer(
      [
        { planCandidateId: asked[0].candidates.find((c) => c.tag === "W2").planCandidateId, elevation: "B" },
        poison,
      ],
      new Set(asked[0].candidates.map((c) => c.planCandidateId)),
      new Set(["A", "B", "C", "D"]),
    );
    assert.equal(spoiled.size, 0, `one bad row costs the page: ${JSON.stringify(poison)}`);
  }

  // Where a tag is printed is not where its opening is: a set that carries its
  // tags on leader lines stacks them in a column, and ordering those by their
  // own geometry puts several openings at the same point on the wall. What
  // named the wall saw the opening, so it says where along it too.
  const positioned = validatePlanFaceAnswer(
    [
      { planCandidateId: asked[0].candidates.find((c) => c.tag === "W2").planCandidateId, elevation: "B", alongWallFraction: 0.8 },
      { planCandidateId: asked[0].candidates.find((c) => c.tag === "W3").planCandidateId, elevation: "B", alongWallFraction: 0.2 },
    ],
    new Set(asked[0].candidates.map((c) => c.planCandidateId)),
    new Set(["A", "B", "C", "D"]),
  );
  const ordered = placeOpeningsOnPlan({
    pages: [plan], roster: ["W1", "W2", "W3"], faceByCandidate: positioned,
  });
  const onB = ordered.filter((o) => o.state === "resolved" && o.placement.elevation === "B")
    .map((o) => o.placement).sort((a, b) => a.wallOrder - b.wallOrder);
  assert.deepEqual(onB.map((p) => p.tag), ["W3", "W2"],
    "two openings on one wall are ordered by where they were seen, not by where their tags were printed");
  assert.deepEqual(onB.map((p) => p.alongWallFraction), [0.2, 0.8]);

  const second = placeOpeningsOnPlan({
    pages: [plan],
    roster: ["W1", "W2", "W3"],
    faceByCandidate: answered,
  });
  const byTag = Object.fromEntries(second.map((o) => [o.placement?.tag ?? o.tag, o]));
  assert.equal(byTag.W2.placement.elevation, "B");
  assert.equal(byTag.W3.placement.elevation, "A");
  assert.equal(byTag.W2.placement.confidence, "ambiguous", "a wall a model named is not a wall the drawing named");
  assert.equal(byTag.W1.placement.elevation, "D", "and what the text settled is untouched");
});

test("plan recovery: the call is closed and bounded (P2-AC11, AC13, AC14)", () => {
  const skill = makePlanFaceSkill(
    { pageNo: 4, candidates: [{ planCandidateId: "W2_p4_1", tag: "W2", boxNorm: [0.4, 0.6, 0.46, 0.64] }] },
    new Set(["A", "B"]),
  );
  const row = skill.responseSchema.properties.placements.items;
  assert.deepEqual(row.properties.elevation.enum, ["A", "B"],
    "the model may name only walls this document names");
  assert.deepEqual(row.properties.planCandidateId.enum, ["W2_p4_1"],
    "and only openings this page was asked about");
  assert.equal(row.additionalProperties, false);
  assert.match(skill.buildPrompt(), /never instructions|not instructions/i,
    "text on the page is data (P2-AC14)");
  assert.match(skill.buildPrompt(), /W2_p4_1/);

  assert.deepEqual(skill.validate({ placements: [{ planCandidateId: "W2_p4_1", elevation: "B" }] }),
    new Map([["W2_p4_1", { elevation: "B", alongWallFraction: null }]]));
  assert.equal(skill.validate({ placements: [{ planCandidateId: "W9_p4_1", elevation: "B" }] }), null,
    "an answer that fails in part fails in whole, and an unusable answer is null, not an empty result");

  // A reader looking at the whole plan sees openings we did not ask about,
  // because the drawing already placed them. Volunteering one is not evidence
  // that it misread the page - it is ignored, and the rest of the answer
  // stands. Naming an opening the page does not have is the other thing
  // entirely, and that still costs the page (P2-AC13).
  const alsoOnPage = makePlanFaceSkill(
    {
      pageNo: 4,
      candidates: [{ planCandidateId: "W2_p4_1", tag: "W2", boxNorm: [0.4, 0.6, 0.46, 0.64] }],
      pageCandidateIds: ["W1_p4_1", "W2_p4_1", "W3_p4_1"],
    },
    new Set(["A", "B"]),
  );
  assert.deepEqual(
    alsoOnPage.validate({ placements: [
      { planCandidateId: "W1_p4_1", elevation: "A" },
      { planCandidateId: "W2_p4_1", elevation: "B" },
    ] }),
    new Map([["W2_p4_1", { elevation: "B", alongWallFraction: null }]]),
    "what the drawing already settled is not overwritten by an answer nobody asked for");
  assert.equal(alsoOnPage.validate({ placements: [
    { planCandidateId: "W2_p4_1", elevation: "B" },
    { planCandidateId: "W9_p4_1", elevation: "A" },
  ] }), null);

  // One call per plan page, and a document cannot buy itself unlimited calls by
  // having unlimited pages.
  const many = Array.from({ length: PLAN_FACE_LIMITS.maxPages + 4 }, (_unused, at) => {
    const sheet = planSheet([tagWord("W1", 297, 250), ...planRooms]);
    return { page: { ...sheet.page, pageNo: at + 1 }, geometry: { ...sheet.geometry, pageNo: at + 1 } };
  });
  const asked = planFaceRecoveryRequest({
    outcomes: [{ state: "unresolved", tag: "W1", reason: "the plan does not name this wall" }],
    pages: many,
    roster: ["W1"],
  });
  assert.equal(asked.length, PLAN_FACE_LIMITS.maxPages);
  assert.equal(new Set(asked.map((page) => page.pageNo)).size, PLAN_FACE_LIMITS.maxPages);
});

test("plan placement: ordinals follow the position along the wall, not the tag's own edge (P2-AC3)", () => {
  // Where a tag is printed and where its opening is are two different places.
  // A recovered opening's position is a fraction of the wall it was seen on,
  // but the tag may sit nearest a different edge - a shorter one - and turning
  // that fraction back into points against the wrong wall's length puts the
  // openings on a wall in an order that contradicts their own positions.
  const plan = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 217, 400), tagWord("W3", 727, 400),
    ...planRooms,
  ]);
  const faceByCandidate = new Map([
    ["W1_p4_1", { elevation: "B", alongWallFraction: 0.5 }],
    ["W2_p4_1", { elevation: "B", alongWallFraction: 0.9 }],
    ["W3_p4_1", { elevation: "B", alongWallFraction: 0.1 }],
  ]);
  const placed = placeOpeningsOnPlan({
    pages: [plan], roster: ["W1", "W2", "W3"], faceNames: new Set(["A", "B"]), faceByCandidate,
  }).filter((o) => o.state === "resolved").map((o) => o.placement)
    .sort((a, b) => a.wallOrder - b.wallOrder);

  assert.deepEqual(placed.map((p) => p.tag), ["W3", "W1", "W2"]);
  assert.deepEqual(placed.map((p) => p.alongWallFraction), [0.1, 0.5, 0.9],
    "the ordinals a face hands to an elevation must agree with the positions it hands over with them");
});

test("plan placement: a schedule that writes W1 and a plan that writes W01 are one opening (P2-AC1)", () => {
  // Measured on a real set: its window schedule prints W1, W2, W3 and its floor
  // plans print W01, W02, W03. Matching those as different strings places
  // nothing at all - every opening reads as "not tagged on any plan page" while
  // its tag is printed right there on the drawing.
  const plan = planSheet([
    tagWord("W01", 297, 250), tagWord("W02", 457, 540),
    ...planRooms,
    { text: "A", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  const placed = placeOpeningsOnPlan({ pages: [plan], roster: ["W1", "W2"], faceNames: new Set(["A", "B"]) });
  assert.deepEqual(placed.map((o) => o.state), ["resolved", "resolved"]);
  assert.deepEqual(placed.map((o) => o.placement.tag), ["W1", "W2"],
    "an opening answers to the name its schedule gave it, whatever the plan prints");
  assert.deepEqual(placed.map((o) => o.placement.elevation), ["A", "B"]);

  // And the other way round, because which of the two is padded is the
  // draughtsman's habit, not a rule.
  const padded = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540),
    ...planRooms,
    { text: "A", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  assert.deepEqual(
    placeOpeningsOnPlan({ pages: [padded], roster: ["W01", "W02"], faceNames: new Set(["A", "B"]) })
      .map((o) => o.placement?.tag),
    ["W01", "W02"]);
});

test("plan placement: a schedule holding both W1 and W01 keeps them apart (P2-AC1)", () => {
  // Reading a padded spelling as its unpadded twin is only safe while the
  // schedule has one of them. A schedule with both is naming two openings, and
  // handing one of them the other's drawn tag loses a real row without saying
  // so.
  const plan = planSheet([
    tagWord("W01", 297, 250),
    ...planRooms,
    { text: "A", x0: 495, top: 250, x1: 505, bottom: 264 },
  ]);
  const placed = placeOpeningsOnPlan({ pages: [plan], roster: ["W1", "W01"], faceNames: new Set(["A"]) });
  const byTag = Object.fromEntries(placed.map((o) => [o.placement?.tag ?? o.tag, o]));
  assert.equal(byTag.W01.state, "resolved", "the spelling the plan prints goes to the row that spells it that way");
  assert.equal(byTag.W1.state, "unresolved");
});

test("plan placement: the copyright strip is not a storey (P2-AC5)", () => {
  // Measured on a real sheet whose title block is graphics: the only text low
  // on the page is "THIS PLAN, DESIGN OR IDEAS MAY NOT BE COPIED", and reading
  // a storey out of it gives every opening a storey called THIS.
  const plan = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540),
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "THIS", x0: 60, top: 700, x1: 100, bottom: 714 },
    { text: "PLAN,", x0: 105, top: 700, x1: 150, bottom: 714 },
    { text: "DESIGN", x0: 155, top: 700, x1: 210, bottom: 714 },
    { text: "MAY", x0: 215, top: 700, x1: 250, bottom: 714 },
    { text: "NOT", x0: 255, top: 700, x1: 285, bottom: 714 },
    { text: "BE", x0: 290, top: 700, x1: 310, bottom: 714 },
    { text: "COPIED", x0: 315, top: 700, x1: 370, bottom: 714 },
  ], "THIS PLAN, DESIGN OR IDEAS MAY NOT BE COPIED");
  const bare = placeOpeningsOnPlan({ pages: [plan], roster: ["W1", "W2"] });
  assert.equal(bare.every((o) => o.state === "unresolved"), true,
    "a sheet that never says which storey it is does not get one invented: "
    + JSON.stringify(bare.map((o) => o.placement?.storey)));

  // Told what the sheet is titled, it places them on that storey.
  const titled = placeOpeningsOnPlan({
    pages: [plan],
    roster: ["W1", "W2"],
    sheetTitles: new Map([[4, "GROUND FLOOR PLAN"]]),
  });
  assert.equal(titled.every((o) => o.state === "resolved"), true, JSON.stringify(titled));
  assert.equal(titled[0].placement.storey, "GROUND FLOOR");
});

test("plan placement: the document's own face names are the vocabulary (P2-AC5, AC17)", () => {
  // Names this code has never heard of, on a storey it has never heard of.
  const plan = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540),
    ...planRooms,
    { text: "FRONT", x0: 470, top: 250, x1: 520, bottom: 264 },
    { text: "REAR", x0: 475, top: 540, x1: 515, bottom: 554 },
  ], "LEVEL 2 PLAN");
  const elevations = {
    page: {
      pageNo: 9,
      text: "FRONT ELEVATION REAR ELEVATION",
      words: [
        { text: "FRONT", x0: 100, top: 700, x1: 150, bottom: 714 },
        { text: "ELEVATION", x0: 155, top: 700, x1: 230, bottom: 714 },
        { text: "REAR", x0: 500, top: 700, x1: 540, bottom: 714 },
        { text: "ELEVATION", x0: 545, top: 700, x1: 620, bottom: 714 },
      ],
    },
    geometry: { pageNo: 9, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 60, imageCount: 0, imageAreaFraction: 0 },
  };
  // The names, and which sheet draws each, are read once as a document fact and
  // handed to placement. Phase C never looks at an elevation sheet itself
  // (P2-AC15): its whole job is the plan.
  const sheets = documentFaceSheets([elevations]);
  assert.deepEqual([...sheets.entries()], [["FRONT", [9]], ["REAR", [9]]]);
  assert.deepEqual([...sheets.keys()], ["FRONT", "REAR"]);

  const outcomes = placeOpeningsOnPlan({ pages: [plan], faceNames: new Set(sheets.keys()), roster: ["W1", "W2"] });
  const byTag = Object.fromEntries(outcomes.map((o) => [o.placement?.tag ?? o.tag, o]));
  assert.equal(byTag.W1.state, "resolved", JSON.stringify(byTag.W1));
  assert.equal(byTag.W1.placement.elevation, "FRONT");
  assert.equal(byTag.W2.placement.elevation, "REAR");
  assert.equal(byTag.W1.placement.storey, "LEVEL 2",
    "the storey is what the sheet calls itself, not a word from a list of ours");
});

test("sheet faces: a section is not an elevation (P2-AC15)", () => {
  // A section cuts through the building; an elevation looks at one of its
  // walls. Reading a face name off a section title lets Phase D inventory a
  // cut-through as though it were the wall.
  const sheet = {
    page: { pageNo: 9, text: "A SECTION", words: [
      { text: "A", x0: 100, top: 700, x1: 110, bottom: 714 },
      { text: "SECTION", x0: 115, top: 700, x1: 175, bottom: 714 },
      { text: "B", x0: 400, top: 700, x1: 410, bottom: 714 },
      { text: "ELEVATION", x0: 415, top: 700, x1: 490, bottom: 714 },
    ] },
    geometry: { pageNo: 9, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 20, imageCount: 0, imageAreaFraction: 0 },
  };
  assert.deepEqual([...documentFaceSheets([sheet]).keys()], ["B"]);
});

test("plan placement: a plan that names no walls places nothing (P2-AC5, AC8)", () => {
  // Naming the walls by compass instead would look like progress and join
  // nothing: a document titling its elevations FRONT and REAR has no use for
  // a placement filed under N. Unnamed is the honest answer until the face
  // names the document itself prints are read.
  const sheet = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540), tagWord("W3", 217, 400), tagWord("W4", 727, 400),
    ...planRooms,
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2", "W3", "W4"] });
  assert.equal(outcomes.every((o) => o.state === "unresolved"), true);
  assert.equal(outcomes.every((o) => /does not name this wall/.test(o.reason)), true,
    JSON.stringify(outcomes.map((o) => o.reason)));
});

test("plan placement: a placement says how good its evidence was (P2-AC6)", () => {
  // openingTagWords tells us whether a tag carried a sheet reference or would
  // need looking at. A sole candidate still resolves - refusing it would lose
  // openings on every set that does not print sheet references - but it must
  // not claim the confidence of one the drawing vouched for.
  const referenced = planSheet([
    tagWord("W1", 297, 250), { text: "S08", x0: 297, top: 266, x1: 323, bottom: 280 },
    tagWord("W2", 457, 540), { text: "S08", x0: 457, top: 556, x1: 483, bottom: 570 },
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  const bare = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540),
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  const withRef = placeOpeningsOnPlan({ pages: [referenced], roster: ["W1", "W2"] });
  const withoutRef = placeOpeningsOnPlan({ pages: [bare], roster: ["W1", "W2"] });
  assert.equal(withRef.every((o) => o.state === "resolved"), true);
  assert.equal(withoutRef.every((o) => o.state === "resolved"), true);
  assert.equal(withRef[0].placement.confidence, "verified", "a tag beside its sheet reference is vouched for");
  assert.equal(withoutRef[0].placement.confidence, "ambiguous",
    "a bare tag is still placed, but nothing in the drawing confirmed it is that opening");
});

test("plan placement: a legend entry is not a placement (P2-AC7)", () => {
  const sheet = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540), tagWord("W3", 217, 400), tagWord("W4", 727, 400),
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "A", x0: 230, top: 395, x1: 240, bottom: 409 },
    { text: "C", x0: 740, top: 395, x1: 750, bottom: 409 },
    // A window schedule printed clear of the building: the same tags, listed.
    { text: "WINDOW", x0: 880, top: 200, x1: 940, bottom: 214 },
    { text: "SCHEDULE", x0: 880, top: 220, x1: 950, bottom: 234 },
    tagWord("W1", 880, 250), tagWord("W2", 880, 280), tagWord("W3", 880, 310),
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2", "W3", "W4"] });
  assert.equal(outcomes.filter((o) => o.state === "resolved").length, 4,
    "the listed copies are not rival occurrences: " + JSON.stringify(outcomes.filter((o) => o.state !== "resolved")));
  const w1 = outcomes.find((o) => (o.placement?.tag ?? o.tag) === "W1");
  assert.equal(w1.placement.elevation, "D", "W1 is placed from the tag against the building, not the one in the list");
  assert.equal(w1.placement.planEvidenceBoxPt[1], 250);
});

test("plan placement: two sheets drawing one wall of one storey publish no ordinals (P2-AC2, AC3)", () => {
  const markers = [
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "A", x0: 230, top: 395, x1: 240, bottom: 409 },
    { text: "C", x0: 740, top: 395, x1: 750, bottom: 409 },
  ];
  const left = planSheet([tagWord("W1", 297, 250), tagWord("W2", 407, 250), ...planRooms, ...markers]);
  const right = planSheet([tagWord("W3", 517, 250), tagWord("W4", 627, 250), ...planRooms, ...markers]);
  right.page.pageNo = 5;
  right.geometry.pageNo = 5;
  const outcomes = placeOpeningsOnPlan({ pages: [left, right], roster: ["W1", "W2", "W3", "W4"] });
  assert.equal(outcomes.filter((o) => o.state === "resolved").length, 0,
    "two halves of one wall would each call their first opening number one");
  assert.equal(outcomes.every((o) => /same wall of the same storey/.test(o.reason ?? "")), true,
    JSON.stringify(outcomes.map((o) => o.reason)));
});

test("plan placement: an unplaced neighbour makes a wall's count unknown (P2-AC2, AC3)", () => {
  // W2 is tagged twice on the same wall, so nobody knows where it is. Numbering
  // its neighbours around it would make W3 "2 of 2" on a wall that holds three,
  // and Phase D would match it to the wrong frame with full confidence.
  const sheet = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 407, 250), tagWord("W2", 460, 250), tagWord("W3", 627, 250),
    tagWord("W9", 457, 540),
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2", "W3", "W9"] });
  const byTag = Object.fromEntries(outcomes.map((o) => [o.placement?.tag ?? o.tag, o]));
  assert.equal(byTag.W1.state, "unresolved", "the wall W2 belongs to cannot be numbered around it");
  assert.equal(byTag.W3.state, "unresolved");
  assert.match(byTag.W3.reason, /count is unknown/);
  assert.equal(byTag.W9.state, "resolved", "and a wall with nothing in doubt is unaffected");
  assert.equal(byTag.W9.placement.faceOpeningCount, 1);
});

test("plan placement: an opening nobody drew is still in the roster (P2-AC1, AC8)", () => {
  const sheet = planSheet([
    tagWord("W1", 297, 250), tagWord("W2", 457, 540),
    ...planRooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2", "D9"] });
  assert.deepEqual(outcomes.map((o) => o.placement?.tag ?? o.tag), ["W1", "W2", "D9"], "the roster keeps its shape");
  const d9 = outcomes.find((o) => (o.placement?.tag ?? o.tag) === "D9");
  assert.equal(d9.state, "unresolved");
  assert.match(d9.reason, /not tagged on any plan page/);
  assert.equal(outcomes.filter((o) => o.state === "resolved").length, 2,
    "and an opening nobody drew does not cost the ones that were");
});

test("plan placement: an opening tagged more than once is not placed by whichever came last (P2-AC6, AC7)", () => {
  const rooms = [
    { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
    { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
    { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
    { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
    { text: "STUDY", x0: 480, top: 400, x1: 540, bottom: 414 },
  ];
  const sheet = planSheet([
    // W1 is printed three times against the plan: once top, twice left.
    tagWord("W1", 297, 250), tagWord("W1", 217, 380), tagWord("W1", 217, 430),
    tagWord("W2", 457, 540),
    ...rooms,
    { text: "D", x0: 495, top: 250, x1: 505, bottom: 264 },
    { text: "B", x0: 495, top: 540, x1: 505, bottom: 554 },
    { text: "A", x0: 230, top: 395, x1: 240, bottom: 409 },
    { text: "C", x0: 740, top: 395, x1: 750, bottom: 409 },
  ]);
  const outcomes = placeOpeningsOnPlan({ pages: [sheet], roster: ["W1", "W2"] });
  const w1 = outcomes.find((o) => (o.placement?.tag ?? o.tag) === "W1");
  assert.equal(w1.state, "unresolved", "three occurrences is an ambiguity, not a race the last one wins");
  assert.match(w1.reason, /more than one/);
  assert.equal(outcomes.find((o) => (o.placement?.tag ?? o.tag) === "W2").state, "resolved",
    "and one opening's ambiguity does not cost its neighbours");
});

test("plan placement: the roster's rows are the outcomes, duplicates included (P2-AC1)", () => {
  const outcomes = placeOpeningsOnPlan({
    pages: [],
    roster: ["W1", "W2", "W1"],
  });
  assert.equal(outcomes.length, 3, "three rows in, three outcomes out");
  assert.deepEqual(outcomes.map((o) => o.placement?.tag ?? o.tag), ["W1", "W2", "W1"]);
  assert.equal(outcomes.filter((o) => /names this opening more than once/.test(o.reason ?? "")).length, 2,
    "a roster naming one opening twice is told so, rather than quietly counted once");
});

test("scale recovery: one sheet's failure costs that sheet, not the run (AC19)", async () => {
  const inspected = {
    inventory: { pageCount: 4, producer: "test", fonts: [], hasAttachments: false,
      pages: [1, 2, 3, 4].map((pageNo) => ({ pageNo, widthPt: 842, heightPt: 595, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 })) },
    pages: [1, 2, 3, 4].map((pageNo) => ({ pageNo, text: "", words: [] })),
  };
  const recovered = await recoverPageScales({
    inspected,
    pageNos: [1, 2, 3, 4],
    stated: new Map(),
    deps: {
      render: async ({ pageNo, dpi }) => {
        if (pageNo === 2) throw new Error("container render failed");
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi };
      },
      readStatedScale: async ({ pageNo }) => {
        if (pageNo === 3) throw new Error("provider rejected the call");
        return { pageNo, ratio: 100 };
      },
    },
  });
  assert.deepEqual([...recovered.entries()], [[1, 100], [4, 100]],
    "a render that throws and a provider that rejects cost their own sheets and nothing else");
});

test("sheet recovery: a sheet whose title is drawn, not written, still gets a role (AC25)", async () => {
  const inspected = {
    inventory: { pageCount: 3, producer: "test", fonts: [], hasAttachments: false,
      pages: [1, 2, 3].map((pageNo) => ({ pageNo, widthPt: 1_684, heightPt: 1_191, rotation: 0, textChars: 900, imageCount: 0, imageAreaFraction: 0 })) },
    pages: [1, 2, 3].map((pageNo) => ({ pageNo, text: "", words: [] })),
  };
  const recovered = await recoverSheetFacts({
    inspected,
    pageNos: [1, 2, 3],
    stated: new Map(),
    deps: {
      render: async ({ dpi }) => ({ images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi }),
      readSheet: async ({ pageNo }) => ({
        pageNo,
        ratio: pageNo === 1 ? null : 100,
        title: pageNo === 1 ? "TITLE / GENERAL NOTES" : pageNo === 2 ? "FIRST FLOOR PLAN" : "ELEVATIONS",
      }),
    },
  });
  assert.deepEqual([...recovered.entries()].map(([pageNo, facts]) => [pageNo, facts.role, facts.ratio]), [
    [1, null, null],
    [2, "floorplan", 100],
    [3, "elevation", 100],
  ], "one look at a sheet answers what it is and what it is drawn at");
  assert.equal(recovered.get(2).title, "FIRST FLOOR PLAN",
    "the title is kept as printed, for the storey to be read from");
});

test("scale recovery: text first is enforced here, not trusted to the caller (AC18)", async () => {
  const asked = [];
  const inspected = {
    inventory: { pageCount: 3, producer: "test", fonts: [], hasAttachments: false,
      pages: [1, 2, 3].map((pageNo) => ({ pageNo, widthPt: 842, heightPt: 595, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0 })) },
    pages: [1, 2, 3].map((pageNo) => ({ pageNo, text: "", words: [] })),
  };
  const recovered = await recoverPageScales({
    inspected,
    pageNos: [1, 2, 3],
    // Page 1 was read from text; page 2's footer disagreed with itself.
    stated: new Map([[1, 100], [2, null]]),
    deps: {
      render: async (request) => {
        asked.push(request.pageNo);
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: request.dpi };
      },
      readStatedScale: async ({ pageNo }) => ({ pageNo, ratio: 50 }),
    },
  });
  assert.deepEqual(asked, [3], "a page the text settled, or called a conflict, is never re-read");
  assert.deepEqual([...recovered.entries()], [[3, 50]]);
});

test("scale recovery: a document cannot ask for unbounded work (AC24)", async () => {
  const asked = [];
  const pageCount = 60;
  const inspected = {
    inventory: { pageCount, producer: "test", fonts: [], hasAttachments: false,
      pages: Array.from({ length: pageCount }, (_, at) => ({
        pageNo: at + 1, widthPt: 842, heightPt: 595, rotation: 0, textChars: 10, imageCount: 0, imageAreaFraction: 0,
      })) },
    pages: Array.from({ length: pageCount }, (_, at) => ({ pageNo: at + 1, text: "", words: [] })),
  };
  const recovered = await recoverPageScales({
    inspected,
    // Every page, and the same page asked for twice.
    pageNos: [...Array.from({ length: pageCount }, (_, at) => at + 1), 1, 1],
    stated: new Map(),
    deps: {
      render: async (request) => {
        asked.push(request.pageNo);
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 10, heightPx: 10 }], dpi: request.dpi };
      },
      readStatedScale: async ({ pageNo }) => ({ pageNo, ratio: 100 }),
    },
  });
  assert.equal(new Set(asked).size, asked.length, "a page is never rendered twice for the same run");
  assert.equal(asked.length <= 20, true, `a scanned set must not turn into one call per page: asked ${asked.length}`);
  assert.equal(recovered.size, asked.length);
});

test("scale recovery: a sheet that states its scale only in graphics still gets one (AC19)", async () => {
  const asked = [];
  const recovered = await recoverPageScales({
    pageNos: [4, 5],
    stated: new Map(),
    inspected: {
      inventory: { pageCount: 2, producer: "test", fonts: [], hasAttachments: false, pages: [
        { pageNo: 4, widthPt: 1_684, heightPt: 1_191, rotation: 0, textChars: 900, imageCount: 0, imageAreaFraction: 0 },
        { pageNo: 5, widthPt: 1_684, heightPt: 1_191, rotation: 0, textChars: 900, imageCount: 0, imageAreaFraction: 0 },
      ] },
      pages: [{ pageNo: 4, text: "", words: [] }, { pageNo: 5, text: "", words: [] }],
    },
    deps: {
      render: async (request) => {
        asked.push(request);
        return { images: [{ pngB64: "aGVsbG8=", widthPx: 800, heightPx: 560 }], dpi: request.dpi };
      },
      readStatedScale: async (input) => ({ pageNo: input.pageNo, ratio: input.pageNo === 4 ? 100 : null }),
    },
  });
  assert.deepEqual([...recovered.entries()], [[4, 100]],
    "page 5 states no scale, so it gets none — absence is an answer, not a guess");
  assert.deepEqual(asked.map((r) => r.pageNo), [4, 5]);
  assert.equal(asked.every((r) => !r.crops), true,
    "the whole sheet is rendered: where a title block sits is a convention, and a convention that failed is why this ran");
});

test("expectedWidthPt turns a scheduled width into the points that width occupies (AC10)", () => {
  assert.equal(Math.round(expectedWidthPt(3_000, 100) * 100) / 100, 85.04);
  assert.equal(Math.round(expectedWidthPt(900, 100) * 100) / 100, 25.51);
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

test("switch wiring: the face-mapped engine is a mode, and only when it is asked for (Task 11)", async () => {
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "face_mapped" }), "face_mapped");
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "agentic_full" }), "full_document");
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "auto_drawings" }), "legacy");
  assert.equal(drawingParserMode({ AI_EXTRACTION_MODE: "off" }), "disabled");
  assert.equal(drawingParserMode({}), "disabled",
    "an unset mode runs nothing, so a deployment cannot acquire a parser by forgetting");

  // A mode that is off makes no database call at all.
  let touched = false;
  const env = {
    AI_EXTRACTION_MODE: "off",
    DB: { prepare() { touched = true; throw new Error("no query should be made"); } },
  };
  assert.deepEqual(
    await runDrawingEnrichmentStage(env, { projectId: "p", aiRunId: "r", planPdfDocs: [{ fileId: "f" }], scheduleRows: [{ tag: "W1", widthMm: 1, heightMm: 1, typeText: null }] }),
    { readings: [], report: null });
  assert.equal(touched, false);
});

test("switch wiring: each phase of the face-mapped engine calls under its own skill id (Task 11)", () => {
  const ids = [
    makePlanFaceSkill({ pageNo: 4, candidates: [{ planCandidateId: "W1_p4_1", tag: "W1", boxNorm: [0, 0, 1, 1] }] }, new Set(["A"])),
    makeElevationInventorySkill(faceTask(1, [900])),
    makeFaceReconcileSkill({
      faceKey: "k", reason: "r",
      placements: [placedAt("W1", 1, 0.2, 2), placedAt("W2", 2, 0.8, 2)],
      frames: [frameAt(1, 100, 200), frameAt(2, 400, 500)],
    }),
    makeCompositionSkill([{ tag: "W1", frameId: "f1", cropRenderId: "c1", imageDataUrl: "data:," }]),
  ].map((skill) => `${skill.id}@${skill.promptVersion}`);
  assert.equal(new Set(ids).size, 4, "a shared id would let one phase serve another phase's cached answer");
  assert.equal(ids.every((id) => /^[a-z_]+@v\d+$/.test(id)), true, ids.join(" "));
});

test("switch wiring: face-mapped mode reads the file, and the other engines stay out of it (Task 11)", async () => {
  const used = [];
  const inspected = {
    inventory: {
      pageCount: 2, producer: "poppler", fonts: ["x"], hasAttachments: false,
      pages: [3, 5].map((pageNo) => ({ pageNo, widthPt: 1_000, heightPt: 800, rotation: 0, textChars: 200, imageCount: 0, imageAreaFraction: 0 })),
    },
    pages: [
      { pageNo: 3, text: "GROUND FLOOR PLAN", words: [
        { text: "W1", x0: 297, top: 250, x1: 323, bottom: 264 },
        { text: "LIVING", x0: 400, top: 320, x1: 460, bottom: 334 },
        { text: "KITCHEN", x0: 560, top: 320, x1: 620, bottom: 334 },
        { text: "BED", x0: 300, top: 470, x1: 360, bottom: 484 },
        { text: "ENTRY", x0: 620, top: 470, x1: 680, bottom: 484 },
        { text: "NORTH", x0: 480, top: 250, x1: 530, bottom: 264 },
      ] },
      { pageNo: 5, text: "NORTH ELEVATION SCALE 1 : 100", words: [
        { text: "NORTH", x0: 100, top: 700, x1: 150, bottom: 714 },
        { text: "ELEVATION", x0: 155, top: 700, x1: 230, bottom: 714 },
        { text: "SCALE", x0: 700, top: 760, x1: 740, bottom: 774 },
        { text: "1", x0: 745, top: 760, x1: 752, bottom: 774 },
        { text: ":", x0: 754, top: 760, x1: 758, bottom: 774 },
        { text: "100", x0: 760, top: 760, x1: 785, bottom: 774 },
      ] },
    ],
  };
  const env = {
    FILES: { get: async () => ({ arrayBuffer: async () => new ArrayBuffer(3) }), put: async () => {} },
    PLAN_PARSE: {},
  };

  const result = await enrichOpenings(env, {
    projectId: "p", aiRunId: "r",
    files: [{ fileId: "f", r2Key: "k", checksum: "abc" }],
    scheduleRows: [{ tag: "W1", widthMm: 1800, heightMm: 1200, typeText: "AWNING" }],
  }, {
    inspect: async () => inspected,
    render: async () => ({ images: [{ pngB64: "AAA", widthPx: 1_000, heightPx: 800 }], dpi: 100 }),
    runElevation: async () => { used.push("legacy elevation"); return null; },
    runFloorplan: async () => { used.push("legacy floorplan"); return null; },
    runOpening: async () => { used.push("legacy opening"); return null; },
    runFaceMapped: {
      readPlanPage: async () => { used.push("face plan"); return null; },
      inventoryElevation: async () => {
        used.push("face inventory");
        return { storeyBand: [0.05, 0.2, 0.95, 0.7], frames: [{ box: [0.1, 0.3, 0.151, 0.6] }] };
      },
      reconcileFace: async () => { used.push("face reconcile"); return null; },
      readComposition: async (input) => {
        used.push("face composition");
        return { readings: input.batch.map((task) => ({
          tag: task.tag, frameId: task.frameId, cropRenderId: task.cropRenderId,
          operations: ["awning"], unitRatios: [1], divisionAxis: "vertical", confidence: "high",
        })) };
      },
    },
  });

  assert.deepEqual(result.readings.map((r) => [r.externalRef, r.splitState, r.elevation]),
    [["W1", "value", "NORTH"]]);
  assert.equal(used.includes("face composition"), true);
  assert.equal(used.some((step) => step.startsWith("legacy")), false,
    "one engine reads a file, and the others are not consulted behind it");
  assert.equal(result.readings[0].cropKey?.startsWith("projects/p/crops/r/"), true,
    "and its crop is stored where every other engine's crops are");
});

test("release gate: each thing the engine claims is scored on its own (Task 12)", () => {
  const readings = [
    {
      external_ref: "W1", split_state: "value", elevation_state: "value", elevation: "NORTH",
      split_json: JSON.stringify({ axis: "vertical", units: [{ operation: "awning", ratio: 0.5 }, { operation: "fixed", ratio: 0.5 }] }),
      page_no: 5, wall_order: 1, frame_box: [100, 300, 151, 420], gap_code: null,
    },
    {
      external_ref: "W2", split_state: "not_read", elevation_state: "value", elevation: "NORTH",
      split_json: null, page_no: 5, wall_order: 2, frame_box: null, gap_code: "frame_ambiguous",
    },
  ];
  const gate = runGate(readings, {
    W1: {
      elevation: "NORTH", order: 1, frame: [100, 300, 151, 420], ratio: [0.5, 0.5],
      composition: [{ operation: "awning" }, { operation: "fixed" }],
    },
    W2: { elevation: "NORTH", order: 2, composition: [{ operation: "fixed" }] },
  });

  const byRef = Object.fromEntries(gate.perOpening.map((o) => [o.externalRef, o]));
  assert.deepEqual(byRef.W1.fields,
    { composition: "match", elevation: "match", order: "match", frame: "match", ratio: "match" });
  assert.equal(byRef.W1.verdict, "match");
  assert.equal(byRef.W2.fields.composition, "mismatch");
  assert.equal(byRef.W2.fields.elevation, "match",
    "an opening whose frame nobody found still placed on a wall, and the gate says so");

  // Each dimension is counted on its own: one number for the whole run hides
  // which half of the engine is failing.
  assert.deepEqual(gate.summary.byField.elevation, { scored: 2, matched: 2 });
  assert.deepEqual(gate.summary.byField.composition, { scored: 2, matched: 1 });
  assert.deepEqual(gate.summary.byField.frame, { scored: 1, matched: 1 });
  assert.equal(gate.summary.unresolved, 1, "and an opening that came back unread is counted as unread");
});

test("release gate: a label that asserts nothing is refused (Task 12)", () => {
  for (const label of [{}, { drawn: true }, { nonsense: 1 }, { order: 1, nonsense: 1 }, null]) {
    const gate = runGate([{ external_ref: "W1", split_state: "value", split_json: null }], { W1: label });
    assert.equal(gate.perOpening[0].verdict, "mismatch", JSON.stringify(label));
    assert.match(gate.perOpening[0].note, /invalid label/);
  }
});

test("deployment config keeps the full-document drawing parser as the production default", async () => {
  const config = await readFile(join(projectRoot, "wrangler.jsonc"), "utf8");
  assert.match(config, /"AI_EXTRACTION_MODE"\s*:\s*"agentic_full"/);
  assert.match(config, /"AI_PRIMARY_MODEL"\s*:\s*"google\/gemini-3\.6-flash"/);
  assert.match(config, /"AI_VERIFY_MODEL"\s*:\s*"google\/gemini-3\.6-flash"/);
});
