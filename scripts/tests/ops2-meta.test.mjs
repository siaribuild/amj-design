// ops2's Metadata tab — the client hook and the composition it feeds.
//
// `useLineMeta` has no renderer precedent in this repo (neither does
// `useLineRationale`, which it is a structural copy of): node:test here never
// spins up jsdom, so the hook's three state-transition rules are pulled out
// as pure functions and tested directly rather than through a fake fetch and
// a fake router. The wiring that calls them is trusted the way every other
// `useX` hook in ops2 is (`ops2-frame.test.mjs`'s source-text checks on
// `useProjectRecord`/`useProjectQueue`).
//
// `MetaTab` composes two chrome pieces: `OpenablePanel`, which is plain
// markup, and `SidePanel`, which wraps its children in an Ionic `IonModal` —
// a Stencil web component whose light-DOM children `renderToStaticMarkup`
// cannot see (proved empirically: it prints only the `<ion-modal>` host tag).
// So the expansion bodies are exported as their own components and rendered
// directly, the same reason `ops2-panel.test.mjs` renders `OpenablePanel` on
// its own rather than through a page.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeRunDir, projectRoot, removeRunDir } from "./helpers.mjs";

const p = (rel) => JSON.stringify(join(projectRoot, rel));
const runDir = await makeRunDir("ops2-meta");
const outfile = join(runDir, "ops2-meta-bundle.mjs");
await build({
  stdin: {
    contents: [
      `export { classifyMetaFetch, isLineMetaDto, effectiveMetaLoad } from ${p("src/ops2/projects/useLineMeta.ts")};`,
      `export {
        MetaTab, imagePanelView, MetaReadingDetail, MetaRunDetail,
        NO_READING, NO_RUN, RUN_OPENING_NOT_COVERED,
      } from ${p("src/ops2/projects/MetaTab.tsx")};`,
    ].join("\n"),
    resolveDir: projectRoot,
    sourcefile: "ops2-meta-entry.tsx",
    loader: "tsx",
  },
  bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent",
  jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "react-router-dom"],
  loader: { ".css": "empty" },
});
const M = await import(pathToFileURL(outfile).href);
test.after(async () => { await removeRunDir(runDir); });

const metaTabSource = readFileSync(join(projectRoot, "src/ops2/projects/MetaTab.tsx"), "utf8");

const readingValue = {
  heading: { state: "value", value: "north" },
  elevation: { state: "not_stated", value: null },
  room: { state: "not_read", value: "kitchen" },
  split: {
    state: "value", axis: "vertical",
    units: [{ role: "left", ratio: 0.6, operation: "fixed", derivedWidthMm: 900 }],
  },
  confidence: "high",
  flags: ["ambiguous_room", "low_confidence_split"],
  source: { fileId: "file-1", filename: "plan-a.pdf", pageNo: 3, sheetRef: "A-101", region: "0.1,0.2,0.3,0.4" },
};

const runValue = {
  startedAt: "2026-08-30T12:00:00.000Z",
  outcome: "read",
  document: {
    fileId: "file-1",
    steps: {
      inventory: { pages: 12, fonts: 2, images: 4, attachments: 0 },
      strategy: "text_vector",
      text: { pagesRead: 10 },
      selectPages: { selected: [{ pageNo: 3, tier: "primary", reason: "elevation match" }], of: 12 },
      elevationRegions: [{ pageNo: 3, labels: ["north", "east"] }],
      renderCrop: { pagesRendered: 1, cropsMade: 3 },
      read: { attempted: 5, returned: 4, declined: 1, retriedWithThreshold: 1, targetedReviews: 2 },
      placements: { fromText: 3, fromModelFallback: 1, unplaced: 0 },
      northAssumed: false,
    },
    failedPhase: null,
    wallMs: 4200,
    modelCalls: 6,
    telemetry: { cachedTurns: 6, repairedTurns: 2, inputTokens: 486000, outputTokens: 31000 },
    providerFailure: null,
  },
};

const REASONING = ["room label unclear from the drawing", "confirmed from the schedule instead"];
// Two shapes at source: a main rejection carries no stage and no outcome; an
// escalation is always turn 1. Normalised to four keys by the DTO builder.
const CORRECTIONS = [
  { turn: 1, reasons: ["identity_tag_not_on_plan_page"], stage: null, outcome: null },
  { turn: 2, reasons: ["evidence_render_or_frame_invalid", "basis_required"], stage: null, outcome: null },
  { turn: 1, reasons: ["close_up_verified"], stage: "escalation", outcome: "replaced" },
];
const dtoFull = {
  hasCrop: true, gapCode: null, reasoningParts: REASONING,
  attempts: 4, acceptedTurn: 3, corrections: CORRECTIONS,
  reading: readingValue, run: runValue,
};
const dtoEmpty = {
  hasCrop: false, gapCode: null, reasoningParts: [],
  attempts: null, acceptedTurn: null, corrections: [],
  reading: null, run: null,
};

const renderTab = (dto, view = "meta") => renderToStaticMarkup(h(M.MetaTab, {
  dto, view, cropSrc: "/api/ops/projects/p1/lines/l1/meta/crop",
  onOpenReading: () => {}, onOpenRun: () => {}, onClose: () => {},
}));
// gapCode and reasoningParts are the DTO's, not the reading's: a declined
// opening has no reading to carry them and that is when they matter most.
const readingDetail = (reading = readingValue, reasoningParts = REASONING, trail = {}) =>
  renderToStaticMarkup(h(M.MetaReadingDetail, {
    reading, reasoningParts,
    attempts: trail.attempts ?? 4, acceptedTurn: trail.acceptedTurn ?? 3,
    corrections: trail.corrections ?? CORRECTIONS,
  }));
const runDetail = () => renderToStaticMarkup(h(M.MetaRunDetail, { run: runValue }));

// ── useLineMeta's state-transition rules ─────────────────────────────────────

test("useLineMeta's pure rules: classify the fetch outcome, validate the DTO shape, and disabled answers missing synchronously", () => {
  // 404 is missing, any other non-ok is error, ok proceeds to parse the body.
  assert.equal(M.classifyMetaFetch(404, false), "missing");
  assert.equal(M.classifyMetaFetch(500, false), "error");
  assert.equal(M.classifyMetaFetch(403, false), "error");
  assert.equal(M.classifyMetaFetch(200, true), "ready");

  // EVERY FIELD THE TAB DEREFERENCES, not one representative field. Checking
  // `hasCrop` alone held until the DTO grew `reasoningParts`, which MetaTab
  // reads `.length` on directly: a body missing it validated, became `ready`,
  // and threw at render - a validator turning a retryable fault into a crash.
  assert.equal(M.isLineMetaDto(dtoEmpty), true);
  assert.equal(M.isLineMetaDto(dtoFull), true);
  assert.equal(M.isLineMetaDto({ hasCrop: true, reading: null, run: null }), false,
    "a body missing reasoningParts is malformed, not ready");
  assert.equal(M.isLineMetaDto({ ...dtoEmpty, reasoningParts: "not an array" }), false);
  assert.equal(M.isLineMetaDto({ ...dtoEmpty, gapCode: 7 }), false);
  // AND TO THE DEPTH THE TAB WALKS. `typeof reading === "object"` admits `{}`,
  // which throws on `reading.flags.length` exactly as hard as a missing field.
  assert.equal(M.isLineMetaDto({ ...dtoEmpty, reading: {} }), false,
    "an empty reading object is malformed, not a reading");
  assert.equal(M.isLineMetaDto({ ...dtoFull, reading: { ...readingValue, flags: null } }), false);
  assert.equal(M.isLineMetaDto({ ...dtoFull, reading: { ...readingValue, heading: "north" } }), false,
    "a fact is {state, value}, not a bare string");
  assert.equal(M.isLineMetaDto({ ...dtoEmpty, run: {} }), false);
  assert.equal(M.isLineMetaDto({ ...dtoFull, run: { ...runValue, document: {} } }), false,
    "a document present must carry the steps tree the detail indexes into");
  // TWO LEVELS DOWN, because the detail reads steps.inventory.pages and
  // steps.read.declined. `steps: {}` passed a shallow object check and threw.
  assert.equal(
    M.isLineMetaDto({ ...dtoFull, run: { ...runValue, document: { ...runValue.document, steps: {} } } }),
    false, "an empty steps object is not a steps tree");
  assert.equal(
    M.isLineMetaDto({ ...dtoFull, run: { ...runValue,
      document: { ...runValue.document, steps: { ...runValue.document.steps, selectPages: { of: 3 } } } } }),
    false, "selectPages.selected is mapped, so it must be an array");
  // AND ITS ELEMENTS. `[null]` passes Array.isArray and throws on s.pageNo.
  assert.equal(
    M.isLineMetaDto({ ...dtoFull, run: { ...runValue,
      document: { ...runValue.document,
        steps: { ...runValue.document.steps, elevationRegions: [null] } } } }),
    false, "a mapped array's elements are dereferenced too");
  assert.equal(
    M.isLineMetaDto({ ...dtoFull,
      reading: { ...readingValue, split: { ...readingValue.split, units: ["not an object"] } } }),
    false, "split units are dereferenced for role and ratio");
  // THE FIELDS THE RESTRUCTURE ADDED, checked to the depth the renderer reads
  // them. `CorrectionTrail` maps corrections and then maps each row's reasons;
  // `MetaRunDetail` reads document.telemetry.inputTokens and joins
  // providerFailure.warnings. Each of these threw before it was checked, which
  // turns a retryable error into a crash - the same defect, three layers on.
  assert.equal(M.isLineMetaDto({ ...dtoFull, corrections: undefined }), false,
    "corrections is mapped, so it must be an array, not merely absent");
  assert.equal(M.isLineMetaDto({ ...dtoFull, corrections: [null] }), false,
    "a mapped array's elements are dereferenced too");
  assert.equal(M.isLineMetaDto({ ...dtoFull, corrections: [{ turn: 1 }] }), false,
    "each row's reasons are mapped, so reasons must be an array");
  assert.equal(M.isLineMetaDto({ ...dtoFull, run: { ...runValue,
    document: { ...runValue.document, telemetry: undefined } } }), false,
    "a document present must carry the telemetry the Cost and health group reads");
  assert.equal(M.isLineMetaDto({ ...dtoFull, run: { ...runValue,
    document: { ...runValue.document, providerFailure: { failureKind: "x", warnings: "not an array" } } } }), false,
    "providerFailure warnings are joined, so they must be an array when it is present");

  assert.equal(M.isLineMetaDto({}), false);
  assert.equal(M.isLineMetaDto(null), false);
  assert.equal(M.isLineMetaDto(undefined), false);

  // D2: disabled answers `missing` SYNCHRONOUSLY, whatever the underlying
  // load is — enabled passes the underlying load through untouched.
  assert.deepEqual(M.effectiveMetaLoad(false, { status: "loading" }), { status: "missing" });
  assert.deepEqual(M.effectiveMetaLoad(false, { status: "error" }), { status: "missing" });
  const ready = { status: "ready", dto: dtoEmpty };
  assert.deepEqual(M.effectiveMetaLoad(false, ready), { status: "missing" });
  assert.deepEqual(M.effectiveMetaLoad(true, ready), ready);
  assert.deepEqual(M.effectiveMetaLoad(true, { status: "loading" }), { status: "loading" });
});

// ── AC-9/10/11: the Image panel's decision, as a pure function ──────────────

test("imagePanelView: hasCrop shows the image (AC-9); !hasCrop names the recorded gap_code verbatim, or the absence, never a broken image (AC-10); a failed load overrides both and states so (AC-11)", () => {
  assert.deepEqual(M.imagePanelView(true, null, false, true), { img: true });
  assert.deepEqual(M.imagePanelView(false, "not_visible_on_elevations", false, true), {
    img: false, reason: "not_visible_on_elevations",
  });
  const noReading = M.imagePanelView(false, null, false, false);
  assert.equal(noReading.img, false);
  assert.match(noReading.reason, /no reading exists for this opening/);
  const failed = M.imagePanelView(true, null, true, true);
  assert.equal(failed.img, false);
  assert.match(failed.reason, /could not be loaded/);
});

test("imagePanelView: a reading with no crop and no gap_code (crop_key NULL does not imply gap_code NOT NULL) never claims the reading is absent (AC-10 finding)", () => {
  const view = M.imagePanelView(false, null, false, true);
  assert.equal(view.img, false);
  assert.doesNotMatch(
    String(view.reason ?? ""),
    /no reading exists for this opening/i,
    "the Image panel must not contradict the Reading panel showing this same reading",
  );
});

test("ImagePanel: a stale image-load failure clears on a later successful load (codex P2) — the failed flag is scoped to cropSrc, not a one-way latch", () => {
  assert.match(metaTabSource, /useEffect\(\(\) => setFailed\(false\), \[cropSrc\]\)/);
});

// ── MetaTab composition: order, doors always present, summaries, no router ──

test("MetaTab: Image panel first (AC-9), Reading summary shows facts/confidence/flags with state words verbatim (AC-4/12/13), Run summary shows startedAt + outcome (AC-17), both doors always present with empty states named (AC-7/20), no router import", () => {
  const html = renderTab(dtoFull);
  const image = html.indexOf('data-testid="meta-image"');
  const reading = html.indexOf('data-testid="meta-reading"');
  const run = html.indexOf('data-testid="meta-run"');
  assert.ok(image >= 0 && image < reading && reading < run, "image, then reading, then run");
  assert.match(html, /<img[^>]*src="\/api\/ops\/projects\/p1\/lines\/l1\/meta\/crop"/);

  assert.match(html, />north</);
  assert.match(html, />not_stated</);
  assert.match(html, />not_read</);
  assert.match(html, />high</);
  // FLAGS ARE LISTED, NEVER COUNTED (owner, 2026-09-04). Seven values exist;
  // a count only hides which one fired, on the one surface built to show it.
  assert.match(html, /ambiguous_room/);
  assert.match(html, /low_confidence_split/);
  assert.doesNotMatch(html, /flags: \d+ present/, "a count is what this replaced");
  assert.match(html, /2026-08-30T12:00:00\.000Z/);
  assert.match(html, />read</);

  const empty = renderTab(dtoEmpty);
  assert.match(empty, /data-testid="meta-reading-open"/);
  assert.match(empty, /data-testid="meta-run-open"/);
  assert.match(empty, /data-testid="meta-reading-empty"/);
  assert.match(empty, /No reading exists for this opening\./);
  assert.match(empty, /data-testid="meta-run-empty"/);
  assert.match(empty, /No drawing run has been reported for this project\./);
  assert.match(metaTabSource, /decision 12/, "the AC-20 override is cited in a comment, not just done silently");

  assert.doesNotMatch(metaTabSource, /react-router-dom/);
});

test("MetaReadingDetail: the correction trail — one row per turn, raw codes, escalation named not numbered, and absent entirely when the opening read first time", () => {
  const html = readingDetail();
  // The heading carries the attempt count; the surface does not (owner Q14).
  assert.match(html, /accepted on attempt 3 of 4/i);
  // Raw codes, exactly as stored — the same rule the state words follow.
  assert.match(html, /identity_tag_not_on_plan_page/);
  assert.match(html, /evidence_render_or_frame_invalid/);
  assert.match(html, /basis_required/);
  // A main rejection has no outcome to show, because the parser writes none.
  const main = html.slice(html.indexOf("identity_tag_not_on_plan_page"), html.indexOf("close_up_verified"));
  assert.doesNotMatch(main, /rejected|replaced|kept/, "no outcome is invented for a main-path row");
  // The escalation row is LABELLED, not numbered: its turn is always 1, so
  // printing "Turn 1" beside a "Turn 2" above it reads as going backwards.
  assert.match(html, /Escalation/);
  // LAST, per the approved mock: the trail explains how the reading above was
  // arrived at, so it must not interrupt the reading to say so.
  assert.ok(html.indexOf('data-testid="meta-reading-source"') <
            html.indexOf('data-testid="meta-reading-trail"'),
            "the trail follows the evidence, it does not sit between the facts and their source");
  assert.match(html, /replaced/);

  // ABSENCE IS THE SIGNAL. An opening read first time shows no trail at all,
  // not an empty section announcing that nothing went wrong.
  const clean = readingDetail(readingValue, REASONING, { attempts: 1, acceptedTurn: 1, corrections: [] });
  assert.doesNotMatch(clean, /accepted on attempt/i);
  assert.doesNotMatch(clean, /data-testid="meta-reading-trail"/);
});

test("MetaRunDetail: the 22 fields in named groups, with telemetry and provider health last (owner: behind a door must be readable, not a text area)", () => {
  const html = runDetail();
  for (const heading of ["This run", "The document", "What it looked at", "What it read", "Where it placed them", "Cost and health"]) {
    assert.ok(html.includes(heading), `the Run door names its "${heading}" group`);
  }
  // Ordered as the run happened, so the groups read as a sequence.
  const order = ["The document", "What it looked at", "What it read", "Where it placed them", "Cost and health"]
    .map((hd) => html.indexOf(hd));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "groups follow the order of the run");
});

// ── AC-14/15/16/7/20: the Reading expansion's full contents ─────────────────

test("MetaReadingDetail: all four facts, split units, every flag, reasoningParts as separate lines, and source — nothing truncated (AC-14/15/16); reading null names what is missing (AC-7/20)", () => {
  const html = readingDetail();
  assert.match(html, /Heading: north/);
  assert.match(html, /Elevation: not_stated/);
  assert.match(html, /Room: not_read/);
  assert.match(html, /vertical/);

  assert.match(html, /left/);
  assert.match(html, /0\.6/);
  assert.match(html, /fixed/);
  assert.match(html, /900mm/);

  assert.match(html, /ambiguous_room/);
  assert.match(html, /low_confidence_split/);
  assert.doesNotMatch(html, /\+\d+ more/);

  const lines = [...html.matchAll(/data-testid="meta-reasoning-line"[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(lines, [
    "room label unclear from the drawing",
    "confirmed from the schedule instead",
  ]);

  assert.match(html, /plan-a\.pdf/);
  assert.match(html, /Page 3/);
  assert.match(html, /A-101/);
  assert.match(html, /0\.1,0\.2,0\.3,0\.4/);

  // A DECLINE KEEPS ITS REASON. `reading` null is the declined case, and the
  // recorded explanation must survive it - the Image panel names what stopped
  // the parser, these lines say why.
  const emptyHtml = renderToStaticMarkup(
    h(M.MetaReadingDetail, { reading: null, reasoningParts: REASONING }));
  assert.match(emptyHtml, /room label unclear from the drawing/,
    "a declined opening still shows the recorded reasoning");
  assert.match(emptyHtml, /data-testid="meta-reading-detail-empty"/);
  assert.equal(emptyHtml.includes(M.NO_READING), true);
});

// ── AC-17/18/20: the Run expansion's full contents ───────────────────────────

test("MetaRunDetail: the single containing document's step counts, failedPhase, wallMs, modelCalls, selected pages and elevation regions in full (AC-16/18); no run and run-without-document are distinct named states (AC-20)", () => {
  const html = runDetail();
  assert.match(html, /file-1/);
  assert.match(html, /text_vector/);
  assert.match(html, /data-testid="meta-run-failed-phase"[^>]*>none</);
  assert.match(html, /4200ms/);
  assert.match(html, />6</);
  assert.match(html, /elevation match/);
  assert.match(html, /north, east/);
  assert.doesNotMatch(html, /\+\d+ more/);

  const noRun = renderToStaticMarkup(h(M.MetaRunDetail, { run: null }));
  assert.match(noRun, /data-testid="meta-run-detail-empty"/);
  assert.equal(noRun.includes(M.NO_RUN), true);

  const notCovered = renderToStaticMarkup(h(M.MetaRunDetail, {
    run: { startedAt: "2026-08-30T12:00:00.000Z", outcome: null, document: null },
  }));
  assert.match(notCovered, /data-testid="meta-run-detail-empty"/);
  assert.equal(notCovered.includes(M.RUN_OPENING_NOT_COVERED), true);
  assert.notEqual(M.RUN_OPENING_NOT_COVERED, M.NO_RUN);
});
