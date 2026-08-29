// The orchestrator — the six SKILL.md steps in order, per file
// (02-design-v2.md §2). Failure containment (R6, AC-28, AC-G5) is the one
// property that must hold above all others: ANY failure anywhere in a
// file's six steps — container unreachable, model down, malformed file —
// degrades to "zero readings for this file, gap noted in the report", and
// the loop moves to the next file. The unit of failure below that is the
// opening (spec §10.5): a per-opening error becomes a not_read row, not a
// thrown error. Enrichment can add nothing to the estimate's failure
// surface, because nothing in here is allowed to throw past this file's
// own try/catch.
import type { Env } from "../../types";
import type { DrawingFileReport, DrawingReading, DrawingReport, GapCode, Orientation } from "./contract";
import { inspectPdf, renderPage } from "./containerClient";
import { cropKey } from "./crops";
import { chooseStrategy, selectPages } from "./selectPages";
import { assignOpenings, type Placement } from "./assign";
import { elevationInventorySkill, makeFloorplanReadSkill, openingReadSkill, type ElevationInventoryOutput, type FloorplanReadOutput, type OpeningReadResult } from "./skills";
import { runStage } from "../ai/stage";
import { normalizeOpeningRef } from "../ai/energyMap";

export interface EnrichFile {
  fileId: string;
  r2Key: string;
}
export interface EnrichScheduleRow {
  tag: string;
  widthMm: number;
  heightMm: number;
  typeText: string | null;
}

/** The effectful boundary, injectable so tests never need a real container
 *  or a real model call. pipeline.ts's enrichment stage builds the real
 *  one, over containerClient.ts and runStage — the one caller, so it is
 *  built there rather than as a second, only-ever-called-once factory. */
export interface EnrichDeps {
  inspect(namespace: DurableObjectNamespace, projectId: string, pdfBytes: Uint8Array): ReturnType<typeof inspectPdf>;
  render: typeof renderPage;
  runElevation(imageDataUrl: string): Promise<ElevationInventoryOutput | null>;
  runFloorplan(imageDataUrl: string, tagVocabulary: string[]): Promise<FloorplanReadOutput | null>;
  runOpening(imageDataUrl: string, row: EnrichScheduleRow): Promise<OpeningReadResult | null>;
}

function emptyFileReport(fileId: string): DrawingFileReport {
  return {
    fileId,
    steps: {
      inventory: { pages: 0, fonts: 0, images: 0, attachments: 0 },
      strategy: "scanned",
      text: { pagesRead: 0 },
      selectPages: { selected: [], of: 0 },
      renderCrop: { pagesRendered: 0, cropsMade: 0 },
      read: { attempted: 0, returned: 0, declined: 0 },
    },
    perOpening: [],
    wallMs: 0,
    modelCalls: 0,
    containerCalls: 0,
  };
}

function notReadRow(row: EnrichScheduleRow, gapCode: GapCode, gapNote: string | null): DrawingReading {
  return {
    id: "", projectId: "", aiRunId: "", sourceFileId: null, externalRef: row.tag,
    splitState: "not_read", split: null, orientationState: "not_read", orientation: null,
    elevationState: "not_read", elevation: null, roomState: "not_read", roomLabel: null,
    gapCode, gapNote, cropKey: null, pageNo: null, sheetRef: null, regionJson: null,
  };
}

async function enrichFile(
  env: Env,
  args: {
    projectId: string; aiRunId: string; file: EnrichFile; scheduleRows: EnrichScheduleRow[];
    onProgress?: (done: number, total: number) => Promise<void>;
  },
  deps: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingFileReport }> {
  const startedAt = Date.now();
  const report = emptyFileReport(args.file.fileId);
  try {
    const obj = await env.FILES.get(args.file.r2Key);
    if (!obj) return { readings: [], report };
    const pdfBytes = new Uint8Array(await obj.arrayBuffer());

    const inspected = await deps.inspect(env.PLAN_PARSE, args.projectId, pdfBytes);
    report.containerCalls++;
    report.steps.inventory = {
      pages: inspected.inventory.pageCount,
      fonts: inspected.inventory.fonts.length,
      images: inspected.inventory.pages.reduce((s, p) => s + p.imageCount, 0),
      attachments: inspected.inventory.hasAttachments ? 1 : 0,
    };
    report.steps.text.pagesRead = inspected.pages.length;

    const strategy = chooseStrategy(inspected.inventory);
    report.steps.strategy = strategy;
    if (strategy === "scanned") {
      // Stops here, named — every opening this file might have covered is
      // simply absent from `readings`; resolveMakeUp falls through to the
      // comment/energy/default rungs for them, exactly as if the file were
      // never uploaded (AC-13).
      return { readings: [], report };
    }

    const { selected, tagVocabulary } = selectPages(inspected.inventory, inspected.pages);
    report.steps.selectPages = { selected, of: inspected.inventory.pageCount };

    const elevationPages = selected.filter((s) => s.tier === "elevation");
    const floorplanPages = selected.filter((s) => s.tier === "floorplan");

    const boxesByElevation: Record<string, { box: [number, number, number, number] }[]> = {};
    const geometryByElevation: Record<string, { widthPt: number; heightPt: number }> = {};
    // The letter must be the one PRINTED on the sheet, not the page's draw
    // order — floorplan_read's placements/facings are keyed by the letter it
    // read off the floor plan, which has no notion of PDF page order. A set
    // with sheet B before sheet A silently cross-wired every opening on it
    // (Codex review finding). Falls back to draw-order lettering only when
    // no letter is printed on the sheet — a defensible last resort, not the
    // common case.
    const ELEVATION_LETTER = /\bELEVATION\s*[-:]?\s*([A-Z])\b/i;
    const elevationLetters = elevationPages.map((p, i) => {
      const text = inspected.pages.find((pg) => pg.pageNo === p.pageNo)?.text ?? "";
      return ELEVATION_LETTER.exec(text)?.[1]?.toUpperCase() ?? String.fromCharCode(65 + i);
    });

    for (let i = 0; i < elevationPages.length; i++) {
      const page = elevationPages[i];
      const letter = elevationLetters[i];
      const geo = inspected.inventory.pages.find((p) => p.pageNo === page.pageNo);
      if (geo) geometryByElevation[letter] = { widthPt: geo.widthPt, heightPt: geo.heightPt };
      const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 150 });
      report.containerCalls++;
      report.steps.renderCrop.pagesRendered++;
      const full = rendered.images[0];
      if (!full) continue;
      const boxes = await deps.runElevation(`data:image/png;base64,${full.pngB64}`);
      report.modelCalls++;
      if (boxes) boxesByElevation[letter] = boxes.boxes;
    }

    const placements: Record<string, Placement & { roomLabel: string | null }> = {};
    let facingByElevation: Record<string, { facing: Orientation | null }> = {};
    for (const page of floorplanPages) {
      const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 150 });
      report.containerCalls++;
      report.steps.renderCrop.pagesRendered++;
      const full = rendered.images[0];
      if (!full) continue;
      const read = await deps.runFloorplan(`data:image/png;base64,${full.pngB64}`, tagVocabulary);
      report.modelCalls++;
      if (!read) continue;
      for (const [tag, p] of Object.entries(read.placements)) {
        placements[normalizeOpeningRef(tag) ?? tag] = { elevation: p.elevation, orderOnWall: p.orderOnWall, roomLabel: p.roomLabel };
      }
      facingByElevation = { ...facingByElevation, ...read.facings };
    }

    const assigned = assignOpenings(args.scheduleRows, placements, boxesByElevation, geometryByElevation);
    const readings: DrawingReading[] = [];
    // Denominator is the located-openings count, set once — it never
    // shortens, and a not_read still advances the numerator (§5): a
    // customer watching this must not see it stall on what it could not
    // read, or lie by shrinking to reach 100%.
    let doneCount = 0;
    const tick = async () => { doneCount++; if (args.onProgress) await args.onProgress(doneCount, assigned.length); };
    for (const outcome of assigned) {
      const row = args.scheduleRows.find((r) => r.tag === outcome.tag)!;
      report.steps.read.attempted++;
      if (outcome.outcome === "not_read") {
        readings.push(notReadRow(row, outcome.gapCode, null));
        report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: null });
        await tick();
        continue;
      }
      const [x0, y0, x1, y1] = outcome.boxPt;
      // The elevation this box came from — needed to render the right page.
      const elevationLetter = placements[normalizeOpeningRef(outcome.tag) ?? outcome.tag]?.elevation;
      const page = elevationPages[elevationLetters.indexOf(elevationLetter ?? "")];
      if (!page) { readings.push(notReadRow(row, "render_failed", "elevation page lost between assign and render")); await tick(); continue; }
      const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 150, crops: [[x0, y0, x1, y1]] });
      report.containerCalls++;
      const crop = rendered.images[0];
      if (!crop) { readings.push(notReadRow(row, "render_failed", null)); await tick(); continue; }
      const read = await deps.runOpening(`data:image/png;base64,${crop.pngB64}`, row);
      report.modelCalls++;
      if (!read || "decline" in read) {
        readings.push(notReadRow(row, "model_declined", read && "decline" in read ? read.decline.reason : null));
        report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page.pageNo });
        await tick();
        continue;
      }
      report.steps.read.returned++;
      const facing = elevationLetter ? (facingByElevation[elevationLetter]?.facing ?? null) : null;
      const roomLabel = placements[normalizeOpeningRef(outcome.tag) ?? outcome.tag]?.roomLabel ?? null;
      // The crop evidence itself (§7): the gate walk checks a reading
      // against its own pixels via this key, and it must exist for that to
      // be possible at all. Best-effort — a write failure here degrades to
      // a dangling key (§7's own documented, acceptable failure mode), never
      // to losing the reading.
      const key = cropKey(args.projectId, args.aiRunId, row.tag);
      const stored = await env.FILES.put(key, Uint8Array.from(atob(crop.pngB64), (c) => c.charCodeAt(0)))
        .then(() => true).catch(() => false);
      if (stored) report.steps.renderCrop.cropsMade++;
      readings.push({
        id: "", projectId: "", aiRunId: "", sourceFileId: args.file.fileId, externalRef: row.tag,
        splitState: "value", split: { units: read.units, axis: read.axis },
        orientationState: facing ? "value" : "not_stated", orientation: facing,
        elevationState: "value", elevation: elevationLetter ?? null,
        roomState: roomLabel ? "value" : "not_stated", roomLabel,
        gapCode: null, gapNote: null, cropKey: stored ? key : null, pageNo: page.pageNo, sheetRef: null,
        regionJson: [x0, y0, x1, y1],
      });
      report.perOpening.push({ tag: outcome.tag, outcome: "read", cropKey: stored ? key : null, pageNo: page.pageNo });
      await tick();
    }
    report.steps.read.declined = report.steps.read.attempted - report.steps.read.returned - assigned.filter((a) => a.outcome === "not_read").length;
    report.wallMs = Date.now() - startedAt;
    return { readings, report };
  } catch {
    // AC-28: any failure anywhere above degrades to zero readings for this
    // file. The report already reflects whatever steps completed before
    // the failure; nothing here re-throws.
    report.wallMs = Date.now() - startedAt;
    return { readings: [], report };
  }
}

/** pipeline.ts's whole enrichment stage, as one testable unit: the mode
 *  gate, the R2-key lookup and the real EnrichDeps construction, so the
 *  integration itself is under test without a full runAiExtraction/D1
 *  harness. Off (anything but 'auto_drawings'): no DB call, empty result —
 *  the AC-27 property. */
export async function runDrawingEnrichmentStage(
  env: Env,
  args: {
    projectId: string; aiRunId: string; planPdfDocs: { fileId: string }[]; scheduleRows: EnrichScheduleRow[];
    onProgress?: (done: number, total: number) => Promise<void>;
  },
  /** Test-only: overrides the real container/runStage deps. Production
   *  never passes this — see the default branch below. */
  depsOverride?: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingReport | null }> {
  if ((env.AI_EXTRACTION_MODE ?? "").trim().toLowerCase() !== "auto_drawings") {
    return { readings: [], report: null };
  }
  if (!args.planPdfDocs.length || !args.scheduleRows.length) return { readings: [], report: null };

  const placeholders = args.planPdfDocs.map(() => "?").join(",");
  const keys = await env.DB.prepare(
    `SELECT id, r2_key FROM file_asset WHERE project_id=? AND id IN (${placeholders})`,
  ).bind(args.projectId, ...args.planPdfDocs.map((d) => d.fileId)).all<{ id: string; r2_key: string }>();
  const r2KeyByFileId = new Map((keys.results ?? []).map((r) => [r.id, r.r2_key]));
  const files = args.planPdfDocs
    .map((d) => ({ fileId: d.fileId, r2Key: r2KeyByFileId.get(d.fileId) ?? "" }))
    .filter((f) => f.r2Key);
  if (!files.length) return { readings: [], report: null };

  const deps = depsOverride ?? {
    inspect: inspectPdf,
    render: renderPage,
    async runElevation(imageDataUrl: string) {
      const res = await runStage(env, { aiRunId: args.aiRunId, projectId: args.projectId, skill: elevationInventorySkill, input: { imageDataUrl } });
      return res.data;
    },
    async runFloorplan(imageDataUrl: string, tagVocabulary: string[]) {
      const res = await runStage(env, { aiRunId: args.aiRunId, projectId: args.projectId, skill: makeFloorplanReadSkill(tagVocabulary), input: { imageDataUrl, tagVocabulary } });
      return res.data;
    },
    async runOpening(imageDataUrl: string, row: EnrichScheduleRow) {
      const res = await runStage(env, {
        aiRunId: args.aiRunId, projectId: args.projectId, skill: openingReadSkill,
        input: { imageDataUrl, tag: row.tag, widthMm: row.widthMm, heightMm: row.heightMm, typeText: row.typeText },
      });
      return res.data;
    },
  };

  const result = await enrichOpenings(env, { projectId: args.projectId, aiRunId: args.aiRunId, files, scheduleRows: args.scheduleRows, onProgress: args.onProgress }, deps);
  return result;
}

export async function enrichOpenings(
  env: Env,
  args: {
    projectId: string; aiRunId: string; files: EnrichFile[]; scheduleRows: EnrichScheduleRow[];
    onProgress?: (done: number, total: number) => Promise<void>;
  },
  deps: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingReport }> {
  const readings: DrawingReading[] = [];
  const files: DrawingFileReport[] = [];
  for (const file of args.files) {
    const result = await enrichFile(env, { ...args, file }, deps);
    readings.push(...result.readings);
    files.push(result.report);
  }
  return { readings, report: { files } };
}
