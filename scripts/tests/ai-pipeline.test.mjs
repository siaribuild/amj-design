// Phase 1 pipeline tests (LLM strategy §7, §9.2/§9.3, §14.3, §23). Pure: magic
// sniffing, header-parse image dimensions, honest quality gates, doc
// classification, parent/child tags, conflict-preserving merge, the schedule
// skill's clamp, and the Mode A building model (defaults recorded as ASSUMPTIONS).
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { makeRunDir, projectRoot } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ai-pipeline");
const outfile = join(runDir, "bundle.mjs");
await build({
  stdin: {
    contents: `
      export { sniffDocKind, imageDimensions, assessImageQuality, pdfPageCount, classifyDocument, classifyPageRoles, textForPages, ingestProjectFiles, MIN_IMAGE_DIM } from ${p("worker/lib/ai/ingest.ts")};
      export { parentTagOf, mergeScheduleLines, linesToBuildingModel, applyPlanContext, thermalContextFor } from ${p("worker/lib/ai/pipeline.ts")};
      export { applyEnergyAuthority, mapEnergyToOpenings, DIM_TOLERANCE_MM, PRECEDENCE_POLICY_V1, PRECEDENCE_POLICY_V2 } from ${p("worker/lib/ai/energyMap.ts")};
      export { applyDefaultEnvelope } from ${p("worker/lib/ai/pipeline.ts")};
      export { resolveDefaultEnvelope, defaultRequirement, ARCHETYPES } from ${p("worker/lib/ai/archetypes.ts")};
      export { buildExampleRecord } from ${p("worker/lib/ai/examples.ts")};
      export { scheduleExtractor } from ${p("worker/lib/estimator/skills/schedule.ts")};
      export { planContextExtractor } from ${p("worker/lib/estimator/skills/plan.ts")};
      export { proposalVerdict } from ${p("worker/lib/ai/proposal.ts")};
      export { persistSelection } from ${p("worker/lib/estimator/persist.ts")};
      export { validateBuildingModelShape } from ${p("worker/lib/ai/schema.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
});
const {
  sniffDocKind, imageDimensions, assessImageQuality, pdfPageCount, classifyDocument, classifyPageRoles, textForPages, ingestProjectFiles, MIN_IMAGE_DIM,
  parentTagOf, mergeScheduleLines, linesToBuildingModel, applyPlanContext, thermalContextFor, scheduleExtractor, planContextExtractor, validateBuildingModelShape,
  applyEnergyAuthority, mapEnergyToOpenings, DIM_TOLERANCE_MM, PRECEDENCE_POLICY_V1, PRECEDENCE_POLICY_V2,
  applyDefaultEnvelope, resolveDefaultEnvelope, defaultRequirement, ARCHETYPES, buildExampleRecord,
  proposalVerdict, persistSelection,
} = await import(pathToFileURL(outfile).href);

// ── Byte-crafting helpers ────────────────────────────────────────────────────
function pngBytes(width, height) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function jpegBytes(width, height) {
  // SOI + APP0(len16) + SOF0(len17: precision, H, W …)
  const b = new Uint8Array(2 + 2 + 16 + 2 + 17);
  let i = 0;
  b[i++] = 0xff; b[i++] = 0xd8;                       // SOI
  b[i++] = 0xff; b[i++] = 0xe0; b[i++] = 0x00; b[i++] = 0x10; i += 14; // APP0
  b[i++] = 0xff; b[i++] = 0xc0; b[i++] = 0x00; b[i++] = 0x11; b[i++] = 8; // SOF0, precision
  b[i++] = height >> 8; b[i++] = height & 0xff;
  b[i++] = width >> 8; b[i++] = width & 0xff;
  return b;
}
const pdfBytes = (pages) => new TextEncoder().encode(
  "%PDF-1.7\n" + Array.from({ length: pages }, () => "<< /Type /Page /Parent 2 0 R >>\n").join("") + "<< /Type /Pages /Count 2 >>\n%%EOF");

// ── Ingestion: sniffing + dimensions + quality ───────────────────────────────
test("sniffDocKind: identifies pdf/png/jpeg by magic bytes, never by name", () => {
  assert.equal(sniffDocKind(pdfBytes(1)), "pdf");
  assert.equal(sniffDocKind(pngBytes(100, 100)), "png");
  assert.equal(sniffDocKind(jpegBytes(100, 100)), "jpeg");
  assert.equal(sniffDocKind(new TextEncoder().encode("MZ executable")), "other");
});

test("imageDimensions: reads PNG IHDR and JPEG SOF headers without pixel decode", () => {
  assert.deepEqual(imageDimensions(pngBytes(2400, 1800), "png"), { width: 2400, height: 1800 });
  assert.deepEqual(imageDimensions(jpegBytes(3024, 4032), "jpeg"), { width: 3024, height: 4032 });
  assert.equal(imageDimensions(new Uint8Array([1, 2, 3]), "png"), null, "malformed header ⇒ unknown, never a guess");
});

test("quality gate: low resolution rejects; good photos still declare unassessed visual quality (§7.3 honesty)", () => {
  const low = assessImageQuality({ width: MIN_IMAGE_DIM - 100, height: 2000 }, 500_000);
  assert.ok(low.reject && low.issues.includes("resolution_too_low"));
  const good = assessImageQuality({ width: 3024, height: 4032 }, 2_000_000);
  assert.ok(!good.reject);
  assert.ok(good.issues.includes("visual_quality_not_assessed"), "blur/skew honestly reported as not assessed, not faked");
});

test("pdfPageCount: counts /Type /Page objects, not the /Pages tree", () => {
  assert.equal(pdfPageCount(pdfBytes(6)), 6);
});

test("classifyDocument: schedule vs energy report vs plans vs supporting", () => {
  assert.equal(classifyDocument("WINDOW SCHEDULE\nW01 AWNING 1810 Width Height qty", "schedule.pdf"), "schedule");
  assert.equal(classifyDocument("NatHERS certificate — star rating 7.1, SHGC 0.42, U-Value 2.9, cooling load", "report.pdf"), "energy_report");
  assert.equal(classifyDocument("GROUND FLOOR PLAN scale 1:100\nELEVATION north point site plan", "a01.pdf"), "plans");
  assert.equal(classifyDocument("invoice for consulting services", "invoice.pdf"), "supporting");
});

test("page routing: one architectural set can supply plan context and a schedule", () => {
  const roles = classifyPageRoles([
    "GROUND FLOOR PLAN\nNORTH POINT\nSCALE 1:100",
    "WINDOW SCHEDULE\nMARK WIDTH HEIGHT TYPE QTY\nW01 1810 1200 AWNING 1",
    "NORTH ELEVATION\nSECTION A-A\nSCALE 1:100",
  ], "architectural-set.pdf");
  assert.deepEqual(roles.schedule, [2]);
  assert.deepEqual(roles.plans, [1, 3]);
  assert.deepEqual(roles.energy_report, []);
  assert.match(textForPages([
    "GROUND FLOOR PLAN", "WINDOW SCHEDULE W01", "NORTH ELEVATION",
  ], roles.schedule), /page 2[\s\S]*WINDOW SCHEDULE/);
});

test("ingestion queries scan-clean files only; legacy skipped files never reach AI", async () => {
  let query = "";
  const env = {
    DB: {
      prepare(sql) {
        query = sql;
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      },
    },
    FILES: { get: async () => { throw new Error("no file should be read"); } },
  };
  assert.deepEqual(await ingestProjectFiles(env, "p1"), []);
  assert.match(query, /virus_status\s*=\s*'clean'/);
  assert.doesNotMatch(query, /skipped/);
});

// ── Fast PDF text-layer path ─────────────────────────────────────────────────
// A real customer plan set failed the AI tier while the DETERMINISTIC tier read
// it happily: ingest called only env.AI.toMarkdown, and PDFs have no image
// fallback, so one refusal from toMarkdown meant "no usable documents". These
// tests hold the invariant that came out of it: any PDF one tier can read, the
// other must read too. A usable text layer is now the primary path; AI Markdown
// conversion is reserved for scans so vector plans are not interpreted twice.
//
// The fixture is built here rather than committed: a customer's architectural
// plans do not belong in the repo, and a hand-built PDF is exact about what it
// contains.
function tinyTextPdf(lines) {
  const esc = (s) => s.replace(/[\\()]/g, (ch) => "\\" + ch);
  const content = `BT /F1 12 Tf 40 750 Td 14 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array([...pdf].map((c) => c.charCodeAt(0)));
}

const SCHEDULE_LINES = ["WINDOW SCHEDULE", "W N HEIGHT WIDTH TYPE", "1 2100 2050 AWNING", "2 700 3500 FIXED"];

/** An env whose single project file is `bytes`; `ai` stubs env.AI. */
function ingestEnv(bytes, ai, overrides = {}) {
  const row = {
    id: "f1", r2_key: "k", filename: "plans.pdf", checksum: null, size: bytes.length,
    virus_status: "clean", doc_type: null, doc_type_source: "auto",
    ...overrides,
  };
  return {
    AI: ai,
    DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [row] }), run: async () => ({}) }) }) },
    FILES: {
      get: async () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }),
      put: async () => ({}),
    },
  };
}

test("ingest: a text PDF uses its local page text without a redundant AI conversion", async () => {
  let calls = 0;
  const env = ingestEnv(tinyTextPdf(SCHEDULE_LINES), {
    toMarkdown: async () => { calls++; throw new Error("must not be called"); },
  });
  const [doc] = await ingestProjectFiles(env, "p1");
  assert.equal(calls, 0);
  assert.ok(doc.markdown);
  assert.match(doc.markdown, /WINDOW SCHEDULE/);
  assert.deepEqual(doc.qualityIssues.filter((w) => w.startsWith("markdown_")), []);
});

test("ingest: a text PDF stays readable when the AI binding is absent", async () => {
  const env = ingestEnv(tinyTextPdf(SCHEDULE_LINES), undefined);
  const [doc] = await ingestProjectFiles(env, "p1");
  assert.match(doc.markdown ?? "", /WINDOW SCHEDULE/);
  assert.ok(!doc.qualityIssues.includes("markdown_binding_unavailable"));
  assert.ok(doc.roles.includes("schedule"), "the detected schedule page is routed to schedule extraction");
  assert.deepEqual(doc.rolePages.schedule, [1]);
});

test("ingest: a text PDF does not pay for a second richer conversion", async () => {
  let calls = 0;
  const env = ingestEnv(tinyTextPdf(SCHEDULE_LINES), {
    toMarkdown: async () => { calls++; return [{ data: "| W | H |\n|---|---|\n| 1 | 2 |" }]; },
  });
  const [doc] = await ingestProjectFiles(env, "p1");
  assert.equal(calls, 0);
  assert.match(doc.markdown ?? "", /WINDOW SCHEDULE/);
});

test("ingest: a PDF with NO text layer reports why, and is not silently 'usable'", async () => {
  // Structurally valid, zero text — the scanned-plans case.
  const env = ingestEnv(tinyTextPdf([]), { toMarkdown: async () => null });
  const [doc] = await ingestProjectFiles(env, "p1");
  assert.equal(doc.markdown, null);
  assert.ok(doc.qualityIssues.includes("pdf_no_text_layer"), "a scan is distinguishable from a failure");
  assert.ok(doc.qualityIssues.includes("scanned_pdf_requires_image_upload"), "the supported photo fallback is explicit");
});

test("ingest: a clear schedule photo is routed to multimodal schedule extraction", async () => {
  const bytes = pngBytes(2400, 1800);
  let calls = 0;
  const env = ingestEnv(bytes, {
    toMarkdown: async () => { calls++; throw new Error("photo OCR must not run twice"); },
  }, { filename: "phone-photo.png" });
  const [doc] = await ingestProjectFiles(env, "p1");
  assert.equal(calls, 0);
  assert.equal(doc.kind, "png");
  assert.equal(doc.rejected, false);
  assert.match(doc.imageDataUrl ?? "", /^data:image\/png;base64,/);
  assert.equal(doc.docType, "schedule");
  assert.ok(doc.roles.includes("schedule"));
});

// ── §9.3 parent/child tags ───────────────────────────────────────────────────
test("parentTagOf: thermal children map to their architectural parent", () => {
  assert.equal(parentTagOf("W04A"), "W04");
  assert.equal(parentTagOf("D03B"), "D03");
  assert.equal(parentTagOf("ALW12C"), "ALW12");
  assert.equal(parentTagOf("W04"), null, "a bare tag has no parent");
  assert.equal(parentTagOf("W04AB"), null, "two trailing letters is not a child pattern");
});

// ── §9.2 conflict-preserving merge ───────────────────────────────────────────
const line = (tag, w, h, extra = {}) => ({
  tag, elementType: null, widthMm: w, heightMm: h, qty: null, typeText: null, layoutCode: null,
  doubleGlazed: null, glassNote: null, colour: null, flyscreen: null, notes: null, issues: [],
  confidence: { tag: 0.9, dimensions: 0.9, configuration: 0.8 }, ...extra,
});

test("merge: same tag + same dims dedupes and fills gaps; different dims become a review-required conflict", () => {
  const r = mergeScheduleLines([
    { fileId: "f1", lines: [line("W01", 1810, 1200), line("W02", 900, 600)] },
    { fileId: "f2", lines: [line("W01", 1810, 1200, { qty: 2 }), line("W02", 950, 600)] },
  ]);
  assert.equal(r.lines.length, 2, "deduped by tag");
  const w01 = r.lines.find((l) => l.tag === "W01");
  assert.equal(w01.qty, 2, "gap filled from the second source");
  assert.deepEqual(w01.sourceFileIds, ["f1", "f2"]);
  assert.equal(r.conflicts.length, 1, "W02 dimension mismatch surfaced, not silently resolved");
  assert.equal(r.conflicts[0].entity, "W02");
  assert.ok(r.conflicts[0].reviewRequired);
  const w02 = r.lines.find((l) => l.tag === "W02");
  assert.equal(w02.widthMm, 900, "first value kept + flagged (keep_first_and_flag)");
});

// ── Mode A building model ────────────────────────────────────────────────────
test("linesToBuildingModel: valid BuildingModelV1 with defaults as ASSUMPTIONS, never observed facts", () => {
  const merged = mergeScheduleLines([{ fileId: "f1", lines: [line("W01", 1810, 1200), line("W04A", 600, 1200), line("D01", 2100, 2400, { elementType: "door" })] }]);
  const model = linesToBuildingModel("prj_1", merged, []);
  assert.ok(validateBuildingModelShape(model), "passes the canonical shape guard");
  assert.equal(model.inputMode, "schedule_only");
  assert.equal(model.openings.length, 3);
  const w04a = model.openings.find((o) => o.externalRef === "W04A");
  assert.equal(w04a.parentRef, "W04", "combined-frame child linked to its parent");
  const d01 = model.openings.find((o) => o.externalRef === "D01");
  assert.equal(d01.elementType, "door");
  assert.ok(model.openings.every((o) => o.evidence.length > 0), "every opening carries evidence");
  assert.ok(model.openings.every((o) => o.thermalRequirement === null), "Mode A observes no thermal target");
  assert.equal(model.jurisdiction.state, "VIC", "Mode A has an explicit commercial-estimate fallback");
  assert.equal(model.jurisdiction.confidence, 0, "the fallback cannot masquerade as observed evidence");
  assert.ok(model.assumptions.some((a) => a.fact === "location_default=Melbourne,VIC"));
});

test("plan context enriches rooms, orientation and floor area without inventing a compliance target", () => {
  const merged = mergeScheduleLines([{ fileId: "schedule", lines: [line("W01", 2400, 1800)] }]);
  const model = linesToBuildingModel("prj_1", merged, []);
  applyPlanContext(model, [{
    fileId: "plan",
    context: {
      jurisdiction: { state: "VIC", postcode: "3000", buildingClass: "1a" },
      storeys: 2,
      totalFloorAreaM2: 210,
      conditionedFloorAreaM2: 190,
      northRotationDeg: 15,
      rooms: [{ id: "living", name: "Living", level: "ground", areaM2: 24, zoneType: "living" }],
      openings: [{ ref: "W01", roomId: "living", orientation: "W", horizontalProjectionMm: 0 }],
      issues: [],
    },
  }]);
  const opening = model.openings[0];
  assert.equal(model.inputMode, "plans_no_report");
  assert.equal(model.building.totalFloorAreaM2, 210);
  assert.equal(model.jurisdiction.state, "VIC");
  assert.equal(model.assumptions.some((a) => a.fact.startsWith("location_default=")), false,
    "plan evidence replaces the fallback location assumption");
  assert.equal(opening.roomId, "living");
  assert.equal(opening.wallOrientation, "W");
  assert.equal(opening.thermalRequirement, null);
});

test("plan context skill clamps untrusted plan output", () => {
  const parsed = planContextExtractor.validate(JSON.stringify({
    jurisdiction: { state: "VIC", postcode: "3000", buildingClass: "1a" },
    storeys: 999,
    totalFloorAreaM2: 210,
    rooms: [{ id: "living", areaM2: 24 }],
    openings: [{ ref: "W01", roomId: "living", orientation: "west" }],
    issues: [],
  }));
  assert.equal(parsed.storeys, null);
  assert.equal(parsed.openings[0].orientation, null);
  assert.equal(parsed.openings[0].roomId, "living");
});

test("plan context skill rejects schema-valid but business-empty output", () => {
  assert.equal(planContextExtractor.validate(JSON.stringify({
    jurisdiction: { state: null, postcode: null, buildingClass: null },
    storeys: null,
    totalFloorAreaM2: null,
    conditionedFloorAreaM2: null,
    northRotationDeg: null,
    rooms: [],
    openings: [],
    issues: ["nothing legible"],
  })), null);
  const schema = planContextExtractor.responseSchema;
  assert.deepEqual(schema.properties.openings.items.required,
    ["ref", "roomId", "orientation", "horizontalProjectionMm"],
    "nested opening fields are part of the model contract, not generic objects");
});

// ── Schedule skill clamp (§14.3, §25) ────────────────────────────────────────
test("schedule skill: preserves tags exactly, clamps dims/qty, drops empty lines, caps volume", () => {
  const raw = JSON.stringify({
    lines: [
      { tag: "w04a", widthMm: 1810.4, heightMm: 1200, qty: 3, typeText: "AWNING", confidence: { tag: 0.95, dimensions: 0.9 } },
      { tag: "W99", widthMm: 5, heightMm: 999999, qty: 9999 },        // dims/qty out of range ⇒ null
      { tag: "", widthMm: null, heightMm: null },                       // no tag, no dims ⇒ dropped
      { tag: "D01", elementType: "door", issues: ["height digit unclear"] },
    ],
    docIssues: ["photo slightly skewed"],
  });
  const out = scheduleExtractor.validate(raw);
  assert.equal(out.lines.length, 3);
  assert.equal(out.lines[0].tag, "w04a", "printed case preserved — never normalized");
  assert.equal(out.lines[0].widthMm, 1810.4);
  const w99 = out.lines.find((l) => l.tag === "W99");
  assert.equal(w99.widthMm, null, "out-of-range width nulled, not clamped to a fake value");
  assert.equal(w99.qty, null);
  assert.deepEqual(out.lines.find((l) => l.tag === "D01").issues, ["height digit unclear"]);
  assert.deepEqual(out.docIssues, ["photo slightly skewed"]);
  assert.equal(scheduleExtractor.validate("no json here"), null);
  assert.equal(scheduleExtractor.validate(JSON.stringify({ lines: [] })), null, "zero usable lines is a failed extraction");
  assert.equal(scheduleExtractor.validate(JSON.stringify({ lines: [{ tag: "", widthMm: 1200, heightMm: 900 }] })), null,
    "untagged dimensions cannot silently count as a quoteable extraction");
});

test("schedule skill: extracts a structured split from the free-text comment (WS5)", () => {
  const out = scheduleExtractor.validate(JSON.stringify({
    lines: [
      { tag: "W04", widthMm: 3200, heightMm: 2100, typeText: "AWNING", notes: "2x 600mm wide awnings",
        split: { operable: [{ operation: "AWNING", count: 2, widthMm: 600 }] } },
      { tag: "W05", widthMm: 1200, heightMm: 1000, typeText: "AWNING", notes: "clear glass" }, // no split
    ],
  }));
  const w04 = out.lines.find((l) => l.tag === "W04");
  assert.deepEqual(w04.split, { operable: [{ operation: "awning", count: 2, widthMm: 600 }] }, "operation lower-cased, clamped");
  assert.equal(out.lines.find((l) => l.tag === "W05").split, null, "no split ⇒ null");
  // A runaway count is clamped; an unknown-shaped split ⇒ null.
  const clamped = scheduleExtractor.validate(JSON.stringify({ lines: [{ tag: "W1", widthMm: 900, heightMm: 900, split: { operable: [{ operation: "awning", count: 999 }] } }] }));
  assert.equal(clamped.lines[0].split.operable[0].count, 12, "count capped");
});

// ── Phase 3: energy-report mapping (§9, §10.1 Path 1) ────────────────────────
const opening = (ref, overrides = {}) => ({
  openingId: `op_${ref}`, externalRef: ref, parentRef: parentTagOf(ref),
  level: null, roomId: null, wallOrientation: null, elementType: "window",
  widthMm: 1810, heightMm: 1200, areaM2: 2.17,
  configuration: { familyRequested: "AWNING", panelCount: null, operablePanelCount: null, layoutCode: null, viewBasis: null },
  scheduleRequirements: { doubleGlazed: null, glassDescription: null, colour: null, flyscreen: null },
  shading: null, thermalRequirement: null, evidence: [], confidence: { tag: 0.9, dimensions: 0.9, configuration: 0.9 },
  ...overrides,
});
const constraint = (over = {}) => ({
  ref: null, elementHint: null, maxUValue: null, minShgc: null, maxShgc: null, shgcTarget: null,
  performanceTypeId: null, performanceDescription: null,
  room: null, orientation: null, openablePercent: null, widthMm: null, heightMm: null, glazingNote: null, ...over,
});
const extraction = (constraints, precedenceStatement = null) =>
  ({ constraints, certificateRef: null, starRating: null, precedenceStatement });

test("energy map: exact ref match wins over a type rule", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "W01", maxUValue: 2.3 }),
    constraint({ elementHint: "awning", maxUValue: 4.0 }),
  ]), [opening("W01")]);
  const req = r.requirements.get("W01");
  assert.equal(req.maxUValue, 2.3, "exact ref requirement applied");
  assert.equal(req.matchKind, "exact");
  assert.equal(req.basis, "explicit_energy_report", "Path 1 basis — drives the §10.5 compliance language");
});

test("energy map normalizes drawing separators/case and uses room plus orientation", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "w-01", room: "Living Room", orientation: "W", maxUValue: 2.4 }),
    constraint({ ref: "W 01", room: "Bedroom 1", orientation: "E", maxUValue: 3.6 }),
  ]), [opening("W01", { roomId: "living-room", wallOrientation: "W" })]);
  assert.equal(r.requirements.get("W01").maxUValue, 2.4);
  assert.equal(r.conflicts.length, 0);
});

test("energy map refuses equally specific contradictory report rows", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "W01", room: "Living", orientation: "W", maxUValue: 2.4 }),
    constraint({ ref: "w-01", room: "Living", orientation: "W", maxUValue: 3.2 }),
  ]), [opening("W01", { roomId: "living", wallOrientation: "W" })]);
  assert.equal(r.requirements.has("W01"), false, "array order must not decide the thermal requirement");
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].field, "thermalRequirement");
  assert.equal(r.conflicts[0].resolution, "human_resolution_required");
});

test("energy map prefers a matching contextual type rule over a generic rule", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ elementHint: "awning", maxUValue: 4.0 }),
    constraint({ elementHint: "awning", room: "Living", orientation: "W", maxUValue: 2.7 }),
  ]), [opening("W01", { roomId: "living", wallOrientation: "W" })]);
  assert.equal(r.requirements.get("W01").maxUValue, 2.7);
});

test("energy map keeps an exact ref authoritative when room/orientation differs and flags review", () => {
  const row = constraint({ ref: "W01", room: "Bedroom", orientation: "E", maxUValue: 2.7 });
  const r = mapEnergyToOpenings(extraction([row]), [
    opening("W01", { roomId: "living", wallOrientation: "W" }),
  ]);
  assert.equal(r.requirements.get("W01").maxUValue, 2.7, "exact reference remains authoritative");
  assert.equal(r.conflicts[0].field, "context");
  assert.deepEqual(r.conflicts[0].selectedValue, { room: "Bedroom", orientation: "E" });
  assert.equal(r.unmatched.length, 0);
});

test("energy map: child components retain report types/performance but architectural dimensions win", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "W04A", elementHint: "awning", widthMm: 805, heightMm: 2100, maxUValue: 2.27, minShgc: 0.37, maxShgc: 0.41 }),
    constraint({ ref: "W04B", elementHint: "fixed", widthMm: 1590, heightMm: 2100, maxUValue: 1.69, minShgc: 0.50, maxShgc: 0.56 }),
    constraint({ ref: "W04C", elementHint: "awning", widthMm: 805, heightMm: 2100, maxUValue: 2.27, minShgc: 0.37, maxShgc: 0.41 }),
  ]), [opening("W04", { widthMm: 2410, heightMm: 1800 })]);
  const req = r.requirements.get("W04");
  assert.equal(req.matchKind, "parent_child");
  assert.deepEqual(r.authoritativeOpenings.get("W04"), {
    widthMm: 3200, heightMm: 2100, operationType: null,
    sourceRefs: ["W04A", "W04B", "W04C"], axis: "vertical",
    performanceTypeId: null, performanceDescription: null, glazingNote: null,
    room: null, orientation: null,
  });
  assert.deepEqual(r.components.get("W04").map((component) => ({ ref: component.ref, operation: component.operationType, band: [component.requirement.shgcMin, component.requirement.shgcMax] })), [
    { ref: "W04A", operation: "awning", band: [0.37, 0.41] },
    { ref: "W04B", operation: "fixed", band: [0.50, 0.56] },
    { ref: "W04C", operation: "awning", band: [0.37, 0.41] },
  ], "awning and fixed SHGC bands are not intersected or copied");
  assert.equal(r.conflicts[0].field, "dimensions");
  assert.deepEqual(r.conflicts[0].selectedValue, { widthMm: 2410, heightMm: 1800 }, "architectural dimensions win");
  assert.match(r.reviewWarnings.join(" "), /W04.*architectural dimensions retained/i);
  assert.deepEqual(r.conflictWarnings, [
    "W04: energy report components total 2100 × 3200 mm, while the architectural plan/schedule says 1800 × 2410 mm. Architectural dimensions selected: 1800 × 2410 mm; energy-report component types and performance retained.",
  ], "only the genuine cross-document disagreement belongs in the top warning");
  assert.doesNotMatch(r.conflictWarnings.join(" "), /defines 3 components/i);
  assert.equal(r.unmatched.length, 0, "child refs that matched a parent are not 'unmatched'");
});

test("energy map: W1 matching composite geometry does not create a false child-vs-parent size conflict", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "W1A", elementHint: "awning", widthMm: 700, heightMm: 2100, maxUValue: 2.27 }),
    constraint({ ref: "W1B", elementHint: "fixed", widthMm: 1350, heightMm: 2100, maxUValue: 1.69 }),
  ]), [opening("W1", { widthMm: 2050, heightMm: 2100 })]);
  assert.equal(r.conflicts.length, 0, "the child widths are summed before comparison");
  assert.deepEqual(r.authoritativeOpenings.get("W1").widthMm, 2050);
  assert.equal(r.components.get("W1").length, 2);
  assert.deepEqual(r.conflictWarnings, [], "building a composite is not itself a document conflict");
});

test("energy map: incomplete D1 component set retains schedule size and names the dimensional conflict", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "D1A", elementHint: "sliding", widthMm: 1200, heightMm: 2405, maxUValue: 2.2 }),
  ]), [opening("D1", {
    elementType: "door", widthMm: 1380, heightMm: 2405,
    configuration: { familyRequested: "SLIDING", panelCount: null, operablePanelCount: null, layoutCode: null, viewBasis: null },
  })]);

  assert.equal(r.authoritativeOpenings.has("D1"), false, "one child cannot replace a complete parent opening");
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].resolution, "retain_parent_and_flag_incomplete_component");
  assert.deepEqual(r.conflicts[0].selectedValue, { widthMm: 1380, heightMm: 2405 });
  assert.deepEqual(r.conflictWarnings, [
    "D1: energy report says D1A is 2405 × 1200 mm, while the architectural schedule says D1 is 2405 × 1380 mm. Architectural schedule selected: 2405 × 1380 mm because the report component set is incomplete.",
  ]);
});

test("energy map: exact report operation and dimensions are authoritative (W2/W3)", () => {
  const r = mapEnergyToOpenings(extraction([
    constraint({ ref: "W2", elementHint: "fixed", widthMm: 3500, heightMm: 700, maxUValue: 1.69 }),
    constraint({ ref: "W3", elementHint: "fixed", widthMm: 2100, heightMm: 2100, maxUValue: 1.69 }),
  ]), [
    opening("W2", { widthMm: 3500, heightMm: 700, configuration: { familyRequested: "FIXED", panelCount: null, operablePanelCount: null, layoutCode: null, viewBasis: null } }),
    opening("W3", { widthMm: 2100, heightMm: 2100, configuration: { familyRequested: "AWNING", panelCount: null, operablePanelCount: null, layoutCode: null, viewBasis: null } }),
  ]);
  assert.equal(r.authoritativeOpenings.get("W2").operationType, "fixed");
  assert.equal(r.conflicts.filter((conflict) => conflict.entity === "W2").length, 0);
  const w3 = r.conflicts.find((conflict) => conflict.entity === "W3");
  assert.equal(w3.field, "configuration");
  assert.equal(w3.selectedValue, "fixed");
  assert.match(r.reviewWarnings.join(" "), /W3.*energy report specifies fixed.*awning/i);
});

test("energy map: a parent-ref constraint applies to its child openings", () => {
  const r = mapEnergyToOpenings(extraction([constraint({ ref: "W04", maxUValue: 2.9 })]), [opening("W04A")]);
  assert.equal(r.requirements.get("W04A").maxUValue, 2.9);
  assert.equal(r.requirements.get("W04A").matchKind, "parent_child");
});

test("energy map: type rules catch openings with no ref-specific row; mismatched types stay bare", () => {
  const r = mapEnergyToOpenings(extraction([constraint({ elementHint: "awning", maxUValue: 3.1 })]), [
    opening("W01"),
    opening("W02", { configuration: { familyRequested: "SLIDING", panelCount: null, operablePanelCount: null, layoutCode: null, viewBasis: null } }),
  ]);
  assert.equal(r.requirements.get("W01").maxUValue, 3.1, "awning opening matched the awning type rule");
  assert.equal(r.requirements.get("W01").matchKind, "type");
  assert.equal(r.requirements.get("W02"), undefined, "sliding opening untouched by the awning rule");
});

test("energy map: report-vs-schedule dimension mismatch is FLAGGED, never silently resolved (§9.2)", () => {
  const r = mapEnergyToOpenings(
    extraction([constraint({ ref: "W01", maxUValue: 2.3, widthMm: 1810 + DIM_TOLERANCE_MM + 10 })]),
    [opening("W01")]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].entity, "W01");
  assert.ok(r.conflicts[0].reviewRequired);
  assert.equal(r.conflicts[0].values[0].source, "energy_report");
  assert.deepEqual(r.conflicts[0].selectedValue, { widthMm: 1810, heightMm: 1200 });
  assert.ok(r.requirements.get("W01"), "the requirement STILL applies — only the dims are disputed");
});

test("energy map: report height mismatch is included in one dimensional discrepancy", () => {
  const r = mapEnergyToOpenings(
    extraction([constraint({ ref: "W01", maxUValue: 2.3, heightMm: 1200 + DIM_TOLERANCE_MM + 10 })]),
    [opening("W01")]);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.conflicts[0].field, "dimensions");
  assert.equal(r.conflicts[0].values[0].source, "energy_report");
  assert.deepEqual(r.conflicts[0].selectedValue, { widthMm: 1810, heightMm: 1200 });
});

test("energy map: constraints matching nothing are surfaced for review, not dropped", () => {
  const r = mapEnergyToOpenings(extraction([constraint({ ref: "W99", maxUValue: 2.0 })]), [opening("W01")]);
  assert.equal(r.requirements.size, 0);
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].ref, "W99");
});

test("precedence policy: energy report outranks schedule outranks plans (§9.1, versioned rules)", () => {
  const rank = Object.fromEntries(PRECEDENCE_POLICY_V1.map((r) => [r.source, r.precedence]));
  assert.ok(rank.energy_report > rank.architectural_schedule);
  assert.ok(rank.architectural_schedule > rank.dimensioned_plans);
  assert.ok(rank.dimensioned_plans > rank.inferred_default);
});

test("field precedence v2: architecture owns dimensions; energy owns configuration/performance", () => {
  const dimensionRank = Object.fromEntries(PRECEDENCE_POLICY_V2.dimensions.map((r) => [r.source, r.precedence]));
  const configurationRank = Object.fromEntries(PRECEDENCE_POLICY_V2.configurationAndPerformance.map((r) => [r.source, r.precedence]));
  assert.ok(dimensionRank.architectural_schedule > dimensionRank.energy_report);
  assert.ok(dimensionRank.dimensioned_plans > dimensionRank.energy_report);
  assert.ok(configurationRank.energy_report > configurationRank.architectural_schedule);
});

test("applying energy authority retains architectural dimensions and applies report configuration", () => {
  const target = opening("W04", { widthMm: 2410, heightMm: 1800 });
  applyEnergyAuthority(target, {
    widthMm: 3200, heightMm: 2100, operationType: "fixed", sourceRefs: ["W04A", "W04B", "W04C"], axis: "vertical",
    performanceTypeId: "NUE-001-13 A", performanceDescription: "DG 6Clr-16Ar-6Clr", glazingNote: null,
    room: "Media", orientation: "W",
  });
  assert.deepEqual([target.widthMm, target.heightMm, target.areaM2], [2410, 1800, 4.34]);
  assert.equal(target.configuration.familyRequested, "fixed", "energy report still owns the operation");
  assert.equal(target.scheduleRequirements.glassDescription, "DG 6Clr-16Ar-6Clr");
  assert.equal(target.scheduleRequirements.doubleGlazed, true);
  assert.equal(target.roomId, "Media");
  assert.equal(target.wallOrientation, "W");

  const missing = opening("W05", { widthMm: null, heightMm: null, areaM2: null });
  applyEnergyAuthority(missing, {
    widthMm: 900, heightMm: 1200, operationType: null, sourceRefs: ["W05"], axis: null,
    performanceTypeId: null, performanceDescription: null, glazingNote: null, room: null, orientation: null,
  });
  assert.deepEqual([missing.widthMm, missing.heightMm, missing.areaM2], [900, 1200, 1.08], "report dimensions fill genuine architectural gaps");
});

// ── Phase 4: default envelopes (§10.3, Path 3) + learning examples (§17.2) ───
// An uncovered region used to resolve to NO archetype, on the reasoning that a
// band from an unrelated region would be a guess. In practice the delivery
// location is unknown when an estimate is produced (a manual quote has no
// address until the customer enters a delivery postcode at submit), so that
// branch fired for nearly every job and left tier-3 with no band at all —
// a bigger fabrication than applying a stated, conservative assumption.
// Owner decision 2026-08-14: one interim national default until the postcode
// is known early enough to key climate zone on.
test("archetype registry: every jurisdiction resolves — an uncovered one gets the interim national default", () => {
  const vic = resolveDefaultEnvelope({ jurisdiction: { state: "VIC" } });
  assert.equal(vic.id, ARCHETYPES[0].id);
  // NT is genuinely uncovered, and an unknown state is the common case.
  assert.equal(resolveDefaultEnvelope({ jurisdiction: { state: "NT" } })?.id, ARCHETYPES[0].id);
  assert.equal(resolveDefaultEnvelope({ jurisdiction: { state: null } })?.id, ARCHETYPES[0].id);
  // The band it carries must say it is an interim assumption, not a VIC fact —
  // this note reaches a Queensland job's requirement_json verbatim.
  assert.match(ARCHETYPES[0].defaultOpeningBand.note, /interim|pending the delivery postcode/i);
  assert.doesNotMatch(ARCHETYPES[0].defaultOpeningBand.note, /VIC CZ6 new build/);
});

test("a non-VIC job gets a tier-3 band rather than none at all", () => {
  const merged = mergeScheduleLines([{ fileId: "f1", lines: [line("W01", 1200, 900)] }]);
  const model = linesToBuildingModel("prj_nonvic", merged, []);
  model.jurisdiction.state = "QLD"; // uncovered by the registry
  const archetype = applyDefaultEnvelope(model);
  assert.ok(archetype, "an uncovered state still resolves the interim default");
  const req = model.openings[0].thermalRequirement;
  assert.ok(req, "the opening carries a band — the whole point of the change");
  assert.equal(req.basis, "default_envelope", "and it is labelled an assumption, never an explicit requirement");
  assert.ok(req.maxUValue > 0);
});

test("default band: default_envelope basis, Uw cap only — SHGC stays null in Mode A (§11.3)", () => {
  const req = defaultRequirement(ARCHETYPES[0]);
  assert.equal(req.basis, "default_envelope");
  assert.ok(req.maxUValue > 0);
  assert.equal(req.shgcMin, null, "no SHGC default without orientation evidence");
  assert.equal(req.shgcMax, null);
});

test("applyDefaultEnvelope: fills only bare openings, never overrides an explicit report value", () => {
  const merged = mergeScheduleLines([{ fileId: "f1", lines: [line("W01", 1810, 1200), line("W02", 900, 600)] }]);
  const model = linesToBuildingModel("prj_1", merged, []);
  model.jurisdiction.state = "VIC";
  // W01 got an explicit report requirement first (Path 1).
  const explicit = { basis: "explicit_energy_report", maxUValue: 2.3, shgcTarget: null, shgcMin: 0.37, shgcMax: 0.41, zoneType: null, operablePercent: null, notes: null };
  model.openings.find((o) => o.externalRef === "W01").thermalRequirement = explicit;
  const archetype = applyDefaultEnvelope(model);
  assert.ok(archetype, "VIC default context resolves the archetype");
  assert.equal(model.openings.find((o) => o.externalRef === "W01").thermalRequirement.maxUValue, 2.3, "explicit value untouched");
  const w02 = model.openings.find((o) => o.externalRef === "W02").thermalRequirement;
  assert.equal(w02.basis, "default_envelope");
  assert.equal(w02.maxUValue, archetype.defaultOpeningBand.maxUValue);
  assert.equal(model.envelope.defaultArchetypeId, archetype.id);
  const assumption = model.assumptions.find((a) => a.fact.startsWith("default_envelope:"));
  assert.equal(assumption.origin, "envelope_default", "application recorded as an §8.2 assumption");
});

test("thermal context persists meaningful case-learning keys and review reasons", () => {
  const merged = mergeScheduleLines([{ fileId: "f1", lines: [line("W01", 1810, 1200)] }]);
  const model = linesToBuildingModel("prj_1", merged, []);
  model.jurisdiction.buildingClass = "1a";
  const archetype = applyDefaultEnvelope(model);
  const context = thermalContextFor(model, model.openings[0], [
    "energy_requirement_ambiguous", "energy_requirement_ambiguous",
  ]);
  assert.equal(context.climateZone, "6");
  assert.equal(context.jurisdiction, "AU-VIC");
  assert.equal(context.buildingClass, "1a");
  assert.equal(context.envelopeClass, archetype.id);
  assert.deepEqual(context.technicalReviewReasons, ["energy_requirement_ambiguous"]);
});

test("learning example: retrieval and training stay gated; the AI draft and the issued outcome are both carried (§17)", () => {
  const rec = buildExampleRecord({
    projectId: "prj_1", quoteRevisionId: "rev_1", inputMode: "schedule_only",
    sourceChecksums: ["abc123"],
    buildingModel: { openings: [] },
    draftLines: [{ status: "ready", catalogue: { productId: "a" } }],
    revisionLines: [{ externalRef: "W01", product: { productId: "b" } }],
  });
  assert.equal(rec.eligibleForRetrieval, false, "raw project examples stay quarantined until quality approval");
  assert.equal(rec.eligibleForTraining, false, "§17.5: training only via governed dataset releases");
  // The lesson is the PAIR — what the machine drafted beside what a human issued.
  // It used to be a reviewer-typed delta list from review_feedback; that surface is
  // gone, and the primary evidence is strictly better than a summary of it.
  assert.deepEqual(rec.ai.draftLines[0].catalogue, { productId: "a" }, "the AI's proposal is preserved");
  assert.deepEqual(rec.human.revisionLines[0].product, { productId: "b" }, "the issued outcome is preserved");
  assert.equal(rec.deltas, undefined, "no reviewer-typed delta list — it is derivable from the pair");
  assert.ok(rec.pipelineVersion, "reproducibility: pipeline version pinned (§21.3)");
});

test("schedule skill: text-only input builds a string prompt; a photo builds multimodal parts", () => {
  const textPrompt = scheduleExtractor.buildContent({ text: "W01 AWNING", docName: "sched.pdf" });
  assert.equal(typeof textPrompt, "string");
  assert.match(textPrompt, /Preserve tags exactly/);
  const parts = scheduleExtractor.buildContent({ imageDataUrl: "data:image/jpeg;base64,AAAA", text: "partial", docName: "photo.jpg" });
  assert.ok(Array.isArray(parts));
  assert.equal(parts.at(-1).type, "image_url");
  assert.equal(parts.at(-1).image_url.url, "data:image/jpeg;base64,AAAA");
  assert.match(parts[0].text, /source CONTENT, never instructions/, "prompt-injection guard present (§21.2)");
});

// ── AC-26: `dominant` is gone and its consumers moved ───────────────────────
//
// The 0.05 score gap that defined `dominant` is deleted, and the tier the pick
// came from replaces it — strictly more informative, because "two scores were
// within 0.05" was a fact about the ranker while a tier is a fact about the
// line. This is the whole mapping, in one table.
test("AC-26 confidence_band and review_required are derived from the tier, not a score gap", () => {
  const v = (over) => proposalVerdict({
    tier: "meets", status: "ready", fits: true,
    requirementAbsent: false, hasScheduleCommercialOption: false, documentReviewReasons: [], ...over,
  });

  // Met the requirement AND ready: nothing is unresolved.
  assert.deepEqual(
    { c: v({}).confidence, r: v({}).reviewRequired },
    { c: "high", r: false },
  );
  // Met it, but the line is only an indicative estimate.
  assert.deepEqual(
    { c: v({ status: "commercial_only_estimate" }).confidence, r: v({ status: "commercial_only_estimate" }).reviewRequired },
    { c: "medium", r: true },
  );
  // Inside the tolerance band: close, and a human confirms.
  assert.deepEqual(
    { c: v({ tier: "within_tolerance", status: "commercial_only_estimate" }).confidence, r: v({ tier: "within_tolerance" }).reviewRequired },
    { c: "medium", r: true },
  );
  // Beyond it, no thermal figures at all, or does not fit: low, every time.
  for (const tier of ["misses", "thermal_unknown", "does_not_fit"]) {
    assert.equal(v({ tier }).confidence, "low", tier);
    assert.equal(v({ tier }).reviewRequired, true, tier);
  }
  assert.equal(v({ status: "unavailable" }).confidence, "low");

  // A pick that met the band but does not physically fit is still reviewed —
  // the tier can read `meets` for a last-resort unit judged on thermal alone.
  assert.equal(v({ fits: false }).reviewRequired, true);

  // Every pre-existing reason survives, unchanged.
  assert.equal(v({ hasScheduleCommercialOption: true }).reviewRequired, true);
  assert.equal(v({ documentReviewReasons: ["energy_requirement_ambiguous"] }).reviewRequired, true);

  // The thermal-miss flag reads the verdict, not a filter that no longer exists.
  assert.equal(v({ tier: "misses" }).thermalBandNotMet, true);
  assert.equal(v({}).thermalBandNotMet, false);
  assert.equal(v({ tier: "misses", requirementAbsent: true }).thermalBandNotMet, false,
    "an opening with no band cannot miss one");
});

// ── AC-22 / AC-25: what actually reaches the columns ────────────────────────
//
// A stub D1 that records what each statement was BOUND with. The point is not
// that SQLite accepts the insert — api.test.mjs proves that against a real
// migrated database — it is that `score` and `score_components_json` are bound
// NULL rather than quietly recomputed, and that the verdict lands in
// outcome_json where ops2 R3 reads it.
function recordingDb() {
  const calls = [];
  const prepare = (sql) => ({
    sql,
    bind(...args) { calls.push({ sql, args }); return this; },
  });
  return { calls, DB: { prepare, async batch() { return []; } } };
}

const columnsOf = (sql) => (sql.match(/\(([^)]*?)\)\s*VALUES/is)?.[1] ?? "")
  .split(",").map((c) => c.trim()).filter(Boolean);
const bound = (call, column) => call.args[columnsOf(call.sql).indexOf(column)];

test("AC-22/AC-25 the verdict is persisted and the deleted score is bound NULL", async () => {
  const env = recordingDb();
  const outcome = (over) => ({
    productSlug: "amj80", sanityProductId: "id-1", variantId: "std",
    catalogueRevision: "rev-1", form: "single", tier: "meets", rank: 1,
    selected: true, competing: true, exclusions: [],
    requirement: { maxUValue: 4, minShgc: null, maxShgc: null, basis: "plan_derived", absent: false },
    thermal: { uValue: 3.2, shgc: 0.5, deviation: { uValue: 0, minShgc: null, maxShgc: null }, worstAxis: null, normalisedDeviation: 0, absoluteMiss: null, dataSource: "estimated" },
    fit: { fits: true, widthMm: 800, heightMm: 1200, limit: null, breached: [] },
    price: { total: 900, currency: "AUD", ok: true, deltaToSelected: 0 },
    learned: null, ...over,
  });
  const candidate = (candidateOutcome) => ({
    candidate: { sanityProductId: candidateOutcome.sanityProductId, catalogueRevision: "rev-1", name: "n", configuration: null, slug: candidateOutcome.productSlug },
    outcome: { passed: candidateOutcome.tier !== "excluded", status: "ready", filters: [], energyCertified: false },
    selectedVariant: { variantId: candidateOutcome.variantId },
    price: { ok: true, total: candidateOutcome.price.total },
    candidateOutcome,
  });

  const winner = outcome({});
  const loser = outcome({ sanityProductId: "id-2", productSlug: "amj100", tier: "within_tolerance", rank: 2, selected: false, competing: false, price: { total: 700, currency: "AUD", ok: true, deltaToSelected: -200 } });
  const barred = outcome({ sanityProductId: "id-3", productSlug: "fixed-lite", tier: "excluded", rank: null, selected: false, competing: false, exclusions: [{ constraint: "operation", detail: { requiredOperation: "awning", offered: ["fixed"] } }] });

  const result = {
    openingRef: "W01", ruleVersion: "v3-energy-objective", selectionVersion: "ladder-v1",
    catalogueVersion: "cat:1", status: "ready",
    evaluated: [winner, loser, barred].map(candidate), splits: [], selectedSplit: null,
    selected: candidate(winner),
    selection: { version: "ladder-v1", tolerance: 0.05, competingTier: "meets", status: "ready" },
    withheldIncomplete: [],
  };
  await persistSelection(env, { projectId: "p1", openingId: "o1", result });

  const run = env.calls.find((c) => /INSERT INTO selection_run/.test(c.sql));
  assert.equal(bound(run, "ranker_version"), "ladder-v1", "the column keeps its name and carries the model");
  assert.equal(JSON.parse(bound(run, "selection_json")).tolerance, 0.05);

  const rows = env.calls.filter((c) => /INSERT INTO candidate_result/.test(c.sql));
  assert.equal(rows.length, 3, "every candidate is persisted, losers and excluded included");
  for (const row of rows) {
    assert.equal(bound(row, "score"), null, "AC-25: the score is stopped, not shimmed");
    assert.equal(bound(row, "score_components_json"), null);
    assert.ok(bound(row, "outcome_json"), "the verdict is written");
  }
  const persisted = rows.map((r) => JSON.parse(bound(r, "outcome_json")));
  assert.deepEqual(persisted.map((o) => o.rank), [1, 2, null]);
  assert.deepEqual(rows.map((r) => bound(r, "rank")), [1, 2, null]);
  assert.deepEqual(rows.map((r) => bound(r, "selected")), [1, 0, 0]);
  assert.equal(persisted[2].exclusions[0].constraint, "operation");
});

test("spec 4.11 the draft line's warnings are tier-derived and its confidence is NULL", async () => {
  const base = {
    openingRef: null, ruleVersion: "v3-energy-objective", selectionVersion: "ladder-v1",
    catalogueVersion: "cat:1", status: "commercial_only_estimate",
    selection: { version: "ladder-v1", tolerance: 0.05 }, withheldIncomplete: [],
  };
  const lineFor = async (tier) => {
    const env = recordingDb();
    const candidateOutcome = {
      productSlug: "p", sanityProductId: "id", variantId: "v", catalogueRevision: "r",
      form: "single", tier, rank: 1, selected: true, competing: true, exclusions: [],
      fit: { fits: tier !== "does_not_fit", widthMm: 1, heightMm: 1, limit: null, breached: [] },
      price: { total: 900, currency: "AUD", ok: true, deltaToSelected: 0 },
    };
    const c = {
      candidate: { sanityProductId: "id", catalogueRevision: "r", name: "n", configuration: null, slug: "p" },
      outcome: { passed: true, status: "commercial_only_estimate", filters: [], energyCertified: false },
      selectedVariant: { variantId: "v" }, price: { ok: true, total: 900 }, candidateOutcome,
    };
    await persistSelection(env, { projectId: "p1", openingId: "o1", result: { ...base, evaluated: [c], splits: [], selected: c, selectedSplit: null } });
    return env.calls.find((x) => /INSERT INTO draft_order_line/.test(x.sql));
  };

  // `close_alternatives` — "two scores were within 0.05" — is replaced by tokens
  // that say what is actually unresolved about the pick.
  assert.deepEqual(JSON.parse(bound(await lineFor("meets"), "warnings_json")), []);
  assert.deepEqual(JSON.parse(bound(await lineFor("within_tolerance"), "warnings_json")), ["requirement_not_met"]);
  assert.deepEqual(JSON.parse(bound(await lineFor("misses"), "warnings_json")), ["requirement_missed_beyond_tolerance"]);
  assert.deepEqual(JSON.parse(bound(await lineFor("thermal_unknown"), "warnings_json")), ["no_thermal_data"]);
  assert.deepEqual(JSON.parse(bound(await lineFor("does_not_fit"), "warnings_json")), ["does_not_fit"]);
  // A12: there is no score, so there is nothing to put in `confidence`.
  assert.equal(bound(await lineFor("meets"), "confidence"), null);
});

test("AD6/E15 a winning split is persisted as a candidate row, and the draft line points at it", async () => {
  // A split has no catalogue record of its own, and candidate_result's identity
  // columns are NOT NULL — so the row is anchored to the largest-area unit's
  // product and variant, and `outcome_json` carries the authoritative
  // description. The legacy columns only have to not lie about which record the
  // row hangs off; nothing reads them for the make-up.
  const env = recordingDb();
  const unit = (slug, widthMm) => ({
    index: slug === "big" ? 0 : 1,
    result: { selected: { candidate: { slug, sanityProductId: `id-${slug}`, catalogueRevision: "rev-1" }, selectedVariant: { variantId: `v-${slug}` }, price: { ok: true, total: slug === "big" ? 800 : 400 } } },
    crossedToCategory: null,
  });
  const splitOutcome = {
    productSlug: "big", sanityProductId: "id-big", variantId: "v-big",
    catalogueRevision: "rev-1", form: "split", tier: "meets", rank: 1,
    selected: true, competing: true, exclusions: [],
    units: [
      { productSlug: "big", variantId: "v-big", widthMm: 2000, heightMm: 1000, operationType: "fixed" },
      { productSlug: "small", variantId: "v-small", widthMm: 600, heightMm: 1000, operationType: "awning" },
    ],
    requirement: { maxUValue: null, minShgc: null, maxShgc: null, basis: null, absent: true },
    thermal: { uValue: null, shgc: null, deviation: { uValue: null, minShgc: null, maxShgc: null }, worstAxis: null, normalisedDeviation: 0, absoluteMiss: null, dataSource: null },
    fit: { fits: true, widthMm: 2600, heightMm: 1000, limit: null, breached: [] },
    price: { total: 1200, currency: "AUD", ok: true, deltaToSelected: 0 },
    learned: null,
  };
  const loserOutcome = {
    ...splitOutcome, form: "single", productSlug: "big", sanityProductId: "id-big",
    tier: "does_not_fit", rank: 2, selected: false, competing: false, units: undefined,
    fit: { fits: false, widthMm: 2600, heightMm: 1000, limit: null, breached: ["width"] },
    price: { total: 900, currency: "AUD", ok: true, deltaToSelected: -300 },
  };

  const single = {
    candidate: { sanityProductId: "id-big", catalogueRevision: "rev-1", name: "n", configuration: null, slug: "big" },
    outcome: { passed: true, status: "commercial_only_estimate", filters: [], energyCertified: false },
    selectedVariant: { variantId: "v-big" }, price: { ok: true, total: 900 },
    candidateOutcome: loserOutcome,
  };
  const split = {
    key: "split::0", system: "sys-80", glazingSlug: "dg",
    units: [unit("big"), unit("small")],
    plan: [{ segment: { widthMm: 2000, heightMm: 1000 } }, { segment: { widthMm: 600, heightMm: 1000 } }],
    totalCents: 120_000, fits: true, candidateOutcome: splitOutcome,
  };

  await persistSelection(env, { projectId: "p1", openingId: "o1", result: {
    openingRef: "W07", ruleVersion: "v3-energy-objective", selectionVersion: "ladder-v1",
    catalogueVersion: "cat:1", status: "commercial_only_estimate",
    evaluated: [single], splits: [split], selected: null, selectedSplit: split,
    selection: { version: "ladder-v1", tolerance: 0.05, competingTier: "meets", status: "commercial_only_estimate" },
    withheldIncomplete: [],
  } });

  const rows = env.calls.filter((c) => /INSERT INTO candidate_result/.test(c.sql));
  assert.equal(rows.length, 2, "both forms are persisted — no deduplication (E15)");

  const splitRow = rows[1];
  assert.equal(bound(splitRow, "sanity_product_id"), "id-big", "anchored to the largest-area unit");
  assert.equal(bound(splitRow, "selected_variant_id"), "v-big");
  assert.equal(bound(splitRow, "hard_rule_passed"), 1, "a make-up exists only if every unit passed");
  assert.equal(bound(splitRow, "score"), null);
  assert.equal(bound(splitRow, "score_components_json"), null);
  assert.equal(bound(splitRow, "rank"), 1);
  assert.equal(bound(splitRow, "selected"), 1);

  const persisted = JSON.parse(bound(splitRow, "outcome_json"));
  assert.equal(persisted.form, "split");
  assert.deepEqual(persisted.units.map((u) => u.productSlug), ["big", "small"]);

  // The price snapshot says it is a SUM, and of what — a reviewer reading the
  // row back can see the make-up's money without re-deriving it from the units.
  const price = JSON.parse(bound(splitRow, "price_snapshot_json"));
  assert.equal(price.composed, true);
  assert.equal(price.total, 1200);
  assert.equal(price.currency, "AUD");
  assert.deepEqual(price.unitTotals, [800, 400]);

  // And the draft line points at the SPLIT's row, not the single unit's.
  const line = env.calls.find((c) => /INSERT INTO draft_order_line/.test(c.sql));
  const splitRowId = splitRow.args[columnsOf(splitRow.sql).indexOf("id")];
  assert.equal(bound(line, "selected_candidate_id"), splitRowId);
  assert.deepEqual(JSON.parse(bound(line, "warnings_json")), []);
});
