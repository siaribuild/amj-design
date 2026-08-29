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
      export { inspectPdf, renderPage, ContainerClientError } from ${p("worker/lib/drawing/containerClient.ts")};
      export { chooseStrategy, selectPages } from ${p("worker/lib/drawing/selectPages.ts")};
      export { elevationInventorySkill, validateFloorplanRead, openingReadSkill } from ${p("worker/lib/drawing/skills.ts")};
      export { assignOpenings } from ${p("worker/lib/drawing/assign.ts")};
    `,
    resolveDir: projectRoot, sourcefile: "entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  external: ["cloudflare:workers"],
});
const { cropKey, purgeProjectCrops, MAX_PDF_BYTES, MAX_PAGES, MAX_CROPS_PER_PAGE, MAX_DPI, inspectPdf, renderPage, ContainerClientError, chooseStrategy, selectPages, elevationInventorySkill, validateFloorplanRead, openingReadSkill, assignOpenings } = await import(pathToFileURL(outfile).href);

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

test("selectPages: tagVocabulary is the closed set of W/D tags on schedule pages only, not floor plan chatter", () => {
  const pages = [
    pt(1, "WINDOW SCHEDULE\nW1 600x1200 AWNING\nW2 900x1200 FIXED\nD1 820x2040 HINGED"),
    pt(2, "GROUND FLOOR PLAN\nBEDROOM 1 W1\nLOT 42"), // "LOT" and room labels must not become tags
  ];
  const { tagVocabulary } = selectPages(inv(pages.map((p) => pageFacts({ pageNo: p.pageNo }))), pages);
  assert.deepEqual([...tagVocabulary].sort(), ["D1", "W1", "W2"]);
});

test("selectPages: a page matching no tier is not selected — nobody asked to read it", () => {
  const pages = [pt(1, "COVER SHEET — Project Overview")];
  const { selected } = selectPages(inv(pages.map((p) => pageFacts({ pageNo: p.pageNo }))), pages);
  assert.deepEqual(selected, []);
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

test("validateFloorplanRead: a tag outside the closed vocabulary is discarded and counted, never placed (ADR 0015 point 2 / D-4)", () => {
  const out = validateFloorplanRead({
    placements: {
      W1: { elevation: "A", orderOnWall: 1, roomLabel: "BEDROOM 1" },
      W99: { elevation: "A", orderOnWall: 2, roomLabel: "BEDROOM 2" }, // not in vocabulary
    },
    facings: { A: { facing: "N" }, B: { facing: "sideways" } }, // "sideways" not in the 8-point vocab
    issues: [],
  }, ["W1", "D1"]);
  assert.deepEqual(Object.keys(out.placements), ["W1"]);
  assert.deepEqual(out.discardedTags, ["W99"]);
  assert.equal(out.facings.A.facing, "N");
  assert.equal(out.facings.B.facing, null);
});

test("openingReadSkill.validate: a decline is a first-class answer, not a failure (AC-G6, R4)", () => {
  const out = openingReadSkill.validate({ decline: { reason: "crop too dark to read the division" } });
  assert.deepEqual(out, { decline: { reason: "crop too dark to read the division" } });
});

test("openingReadSkill.validate: a well-formed division is accepted, and near-1 ratios are renormalised to exactly 1", () => {
  const out = openingReadSkill.validate({
    units: [{ role: "operable", ratio: 0.49 }, { role: "passive", ratio: 0.5 }], // sums to 0.99 — within tolerance
    axis: "vertical", confidence: "high",
  });
  assert.equal(out.units.length, 2);
  const sum = out.units.reduce((s, u) => s + u.ratio, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(out.axis, "vertical");
});

test("openingReadSkill.validate: an invalid role, an out-of-range ratio, or a sum far from 1 is refused — never repaired (AB-7)", () => {
  const base = { axis: "vertical", confidence: "high" };
  assert.equal(openingReadSkill.validate({ ...base, units: [{ role: "hopper", ratio: 1 }] }), null);
  assert.equal(openingReadSkill.validate({ ...base, units: [{ role: "operable", ratio: 1.5 }] }), null);
  assert.equal(openingReadSkill.validate({ ...base, units: [{ role: "operable", ratio: 0.3 }, { role: "passive", ratio: 0.3 }] }), null); // sums to 0.6
});

test("openingReadSkill.validate: printedWidthMm survives only paired with the printed text it claims to quote", () => {
  const withText = openingReadSkill.validate({
    axis: "vertical", confidence: "high",
    units: [
      { role: "operable", ratio: 0.5, printedWidthMm: 600, printedText: "600" },
      { role: "passive", ratio: 0.5, printedWidthMm: 900 }, // no printedText — must be dropped
    ],
  });
  assert.equal(withText.units[0].printedWidthMm, 600);
  assert.equal(withText.units[1].printedWidthMm, undefined);
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
