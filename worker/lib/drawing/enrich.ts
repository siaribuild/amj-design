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
import type { DarknessProfile, DrawingFileReport, DrawingProgressPhase, DrawingReading, DrawingReport, GapCode, InspectResponse, Orientation, SplitReading } from "./contract";
import { ContainerClientError, inspectPdf, renderPage } from "./containerClient";
import { cropKey } from "./crops";
import { chooseStrategy, selectPages } from "./selectPages";
import { assignOpenings, type ElevationPageGeometry, type Placement } from "./assign";
import { elevationInventorySkill, makeFloorplanReadSkill, northArrowSkill, openingReadSkill, type ElevationInventoryOutput, type FloorplanReadOutput, type NorthArrowOutput, type OpeningReadResult } from "./skills";
import { makeDrawingAgentSkill, runDrawingAgent, type DrawingAgentInput, type DrawingAgentTurn } from "./agent";
import { makeFullDocumentAgentSkill, runFullDocumentAgent, type FullAgentTurnResult, type FullDocumentAgentInput, type FullDocumentTurn } from "./fullDocumentAgent";
import { runStage } from "../ai/stage";
import { normalizeOpeningRef } from "../ai/energyMap";
import { boxesByRegion, elevationRegions, type ElevationRegion } from "./elevationRegions";
import { locateFloorplanPage, orientationsFromNorth, resolveNorth, type Edge, type Storey } from "./locate";
import { mapPool } from "./pool";
import { composeMeasuredSplit, measureSplit } from "./measure";
import { compositionFromSchedule, reconcileReading } from "./reconcile";

export interface EnrichFile {
  fileId: string;
  r2Key: string;
}
export interface EnrichScheduleRow {
  tag: string;
  widthMm: number;
  heightMm: number;
  typeText: string | null;
  commentText?: string | null;
  roomLabel?: string | null;
  storey?: "ground" | "first" | null;
}

/** The effectful boundary, injectable so tests never need a real container
 *  or a real model call. pipeline.ts's enrichment stage builds the real
 *  one, over containerClient.ts and runStage — the one caller, so it is
 *  built there rather than as a second, only-ever-called-once factory. */
export interface EnrichDeps {
  inspect(namespace: DurableObjectNamespace, projectId: string, pdfBytes: Uint8Array): ReturnType<typeof inspectPdf>;
  render: typeof renderPage;
  runElevation(imageDataUrl: string): Promise<ElevationInventoryOutput | null>;
  runFloorplan(imageDataUrl: string, tagVocabulary: string[], elevationVocabulary: string[]): Promise<FloorplanReadOutput | null>;
  runNorth?(imageDataUrl: string): Promise<NorthArrowOutput | null>;
  runOpening(imageDataUrl: string, row: EnrichScheduleRow, context: { unitCount: number }): Promise<OpeningReadResult | null>;
  runAgentTurn?(input: DrawingAgentInput): Promise<DrawingAgentTurn | null>;
  runFullAgentTurn?(input: FullDocumentAgentInput): Promise<FullDocumentTurn | FullAgentTurnResult | null>;
}

function emptyFileReport(fileId: string): DrawingFileReport {
  return {
    fileId,
    steps: {
      inventory: { pages: 0, fonts: 0, images: 0, attachments: 0 },
      strategy: "scanned",
      text: { pagesRead: 0 },
      selectPages: { selected: [], of: 0 },
      elevationRegions: [],
      renderCrop: { pagesRendered: 0, cropsMade: 0 },
      read: { attempted: 0, returned: 0, declined: 0, retriedWithThreshold: 0, targetedReviews: 0 },
      placements: { fromText: 0, fromModelFallback: 0, unplaced: 0 },
      northAssumed: false,
    },
    perOpening: [],
    wallMs: 0,
    modelCalls: 0,
    containerCalls: 0,
  };
}

function notReadRow(
  row: EnrichScheduleRow,
  gapCode: GapCode,
  gapNote: string | null,
  known: {
    sourceFileId?: string;
    elevation?: string | null;
    orientation?: Orientation | null;
    roomLabel?: string | null;
    pageNo?: number | null;
  } = {},
): DrawingReading {
  const placed = !!known.elevation;
  const flags = [
    ...(gapCode === "unplaced" ? ["notVisibleOnElevations" as const] : []),
    ...(placed && !known.orientation ? ["northAssumed" as const] : []),
  ];
  const scheduleComposition = gapCode === "unplaced"
    ? compositionFromSchedule({ widthMm: row.widthMm, scheduleType: row.typeText, commentText: row.commentText })
    : null;
  return {
    id: "", projectId: "", aiRunId: "", sourceFileId: known.sourceFileId ?? null, externalRef: row.tag,
    splitState: scheduleComposition ? "value" : "not_read", split: scheduleComposition,
    orientationState: placed ? (known.orientation ? "value" : "not_stated") : "not_read",
    orientation: known.orientation ?? null,
    elevationState: placed ? "value" : "not_read", elevation: known.elevation ?? null,
    roomState: placed ? (known.roomLabel ? "value" : "not_stated") : "not_read", roomLabel: known.roomLabel ?? null,
    gapCode, gapNote, cropKey: null, pageNo: known.pageNo ?? null, sheetRef: null, regionJson: null,
    confidence: "low", flags,
  };
}

async function enrichFile(
  env: Env,
  args: {
    projectId: string; aiRunId: string; file: EnrichFile; scheduleRows: EnrichScheduleRow[];
    onProgress?: (done: number, total: number, phase: DrawingProgressPhase) => Promise<void>;
  },
  deps: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingFileReport }> {
  const startedAt = Date.now();
  const report = emptyFileReport(args.file.fileId);
  let currentPhase = "r2_lookup";
  try {
    const obj = await env.FILES.get(args.file.r2Key);
    if (!obj) return { readings: [], report };
    const pdfBytes = new Uint8Array(await obj.arrayBuffer());

    if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "inventory");
    currentPhase = "inventory";
    let inspected: InspectResponse;
    report.containerCalls++;
    try {
      inspected = await deps.inspect(env.PLAN_PARSE, args.projectId, pdfBytes);
    } catch (error) {
      if (!(error instanceof ContainerClientError) || error.code !== "timeout") throw error;
      // A cold container can consume the whole request timeout while starting.
      // Retry once: the first request has usually left the instance ready.
      report.containerCalls++;
      inspected = await deps.inspect(env.PLAN_PARSE, args.projectId, pdfBytes);
    }
    report.inspectTimings = inspected.timings;
    report.steps.inventory = {
      pages: inspected.inventory.pageCount,
      fonts: inspected.inventory.fonts.length,
      images: inspected.inventory.pages.reduce((s, p) => s + p.imageCount, 0),
      attachments: inspected.inventory.hasAttachments ? 1 : 0,
    };
    report.steps.text.pagesRead = inspected.pages.length;

    const strategy = chooseStrategy(inspected.inventory);
    report.steps.strategy = strategy;
    if (strategy === "scanned" && !deps.runAgentTurn && !deps.runFullAgentTurn) {
      // Stops here, named — every opening this file might have covered is
      // simply absent from `readings`; resolveMakeUp falls through to the
      // comment/energy/default rungs for them, exactly as if the file were
      // never uploaded (AC-13).
      return { readings: [], report };
    }

    if (deps.runFullAgentTurn) {
      currentPhase = "full_document_agent";
      const agentResult = await runFullDocumentAgent({
        fileId: args.file.fileId,
        scheduleRows: args.scheduleRows,
        inspected,
        deps: {
          runTurn: deps.runFullAgentTurn,
          render: (request) => deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, request),
          async store(renderId, pngB64) {
            const key = cropKey(args.projectId, args.aiRunId, `full-agent-${renderId}`);
            try {
              const bytes = Uint8Array.from(atob(pngB64), (char) => char.charCodeAt(0));
              await env.FILES.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
              return key;
            } catch {
              return null;
            }
          },
          onProgress: args.onProgress,
        },
      });
      agentResult.report.steps.strategy = strategy;
      agentResult.report.containerCalls++;
      return agentResult;
    }

    if (deps.runAgentTurn) {
      currentPhase = "drawing_agent";
      const agentResult = await runDrawingAgent({
        fileId: args.file.fileId,
        scheduleRows: args.scheduleRows,
        inspected,
        deps: {
          runTurn: deps.runAgentTurn,
          render: (request) => deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, request),
          async store(renderId, pngB64) {
            const key = cropKey(args.projectId, args.aiRunId, `agent-${renderId}`);
            try {
              const bytes = Uint8Array.from(atob(pngB64), (char) => char.charCodeAt(0));
              await env.FILES.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
              return key;
            } catch {
              return null;
            }
          },
          onProgress: args.onProgress,
        },
      });
      agentResult.report.steps.strategy = strategy;
      agentResult.report.containerCalls++;
      return agentResult;
    }

    currentPhase = "select_pages";
    const { selected } = selectPages(inspected.inventory, inspected.pages);
    const tagVocabulary = [...new Set(args.scheduleRows
      .map((row) => normalizeOpeningRef(row.tag))
      .filter((tag): tag is string => !!tag))];
    report.steps.selectPages = { selected, of: inspected.inventory.pageCount };

    const elevationPages = selected.filter((s) => s.tier === "elevation");
    const floorplanPages = selected.filter((s) => s.tier === "floorplan");

    const boxesByElevation: Record<string, { box: [number, number, number, number] }[]> = {};
    const geometryByElevation: Record<string, ElevationPageGeometry> = {};
    const pageByElevation: Record<string, number> = {};

    const regionsFromText = (text: string, widthPt: number, heightPt: number): ElevationRegion[] => {
      // `text` and `words` come from independent PDF extractors. Retain a
      // single-sheet identity when pdftotext succeeds but pdfplumber does not.
      const labels = [...text.matchAll(/\bELEVATION\s*[-:]?\s*([A-D])\b/gi)]
        .map((match) => match[1].toUpperCase());
      const unique = [...new Set(labels)];
      return unique.length === 1 ? [{ label: unique[0], region: [0, 0, widthPt, heightPt] }] : [];
    };

    currentPhase = "elevation_inventory";
    if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "elevation_inventory");
    for (let elevationIndex = 0; elevationIndex < elevationPages.length; elevationIndex++) {
      const page = elevationPages[elevationIndex];
      const geo = inspected.inventory.pages.find((p) => p.pageNo === page.pageNo);
      const pageText = inspected.pages.find((candidate) => candidate.pageNo === page.pageNo);
      if (!geo || !pageText) continue;
      const regions = elevationRegions(pageText.words, geo.widthPt, geo.heightPt);
      const textRegions = regions.length ? regions : regionsFromText(pageText.text, geo.widthPt, geo.heightPt);
      // Page draw order is not elevation identity. If neither positioned words
      // nor the single-title text fallback can name the region, do not ask the
      // model to inventory a page under an invented A/B/C/D key.
      if (!textRegions.length) {
        report.steps.elevationRegions.push({ pageNo: page.pageNo, labels: [] });
        continue;
      }
      const explicitRegions = textRegions;
      report.steps.elevationRegions.push({
        pageNo: page.pageNo,
        labels: explicitRegions.map((region) => region.label),
      });
      const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 150 });
      report.containerCalls++;
      report.steps.renderCrop.pagesRendered++;
      const full = rendered.images[0];
      if (!full) continue;
      const boxes = await deps.runElevation(`data:image/png;base64,${full.pngB64}`);
      report.modelCalls++;
      if (!boxes) continue;
      const grouped = boxesByRegion(boxes.boxes, explicitRegions, geo.widthPt, geo.heightPt);
      for (const region of explicitRegions) {
        const [originXPt, originYPt, regionX1, regionY1] = region.region;
        const regionWidthPt = regionX1 - originXPt;
        const regionHeightPt = regionY1 - originYPt;
        const datum = pageText.words.find((word) => /^(?:FFL|FIRST)$/i.test(word.text.trim()));
        const withStoreys = (grouped[region.label] ?? []).map((box) => ({
          ...box,
          ...(datum ? { storey: originYPt + ((box.box[1] + box.box[3]) / 2) * regionHeightPt < (datum.top + datum.bottom) / 2 ? "first" as const : "ground" as const } : {}),
        }));
        boxesByElevation[region.label] = [...(boxesByElevation[region.label] ?? []), ...withStoreys];
        geometryByElevation[region.label] = { widthPt: regionWidthPt, heightPt: regionHeightPt, originXPt, originYPt };
        pageByElevation[region.label] = page.pageNo;
      }
    }

    currentPhase = "floorplan_location";
    if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "floorplan_location");
    const elevationVocabulary = Object.keys(boxesByElevation).sort();
    const placements: Record<string, Placement & { roomLabel: string | null; storey?: Storey | null }> = {};
    const markerEdges: Record<string, Edge> = {};
    let facingByElevation: Record<string, { facing: Orientation | null }> = {};
    for (const page of floorplanPages) {
      const pageText = inspected.pages.find((candidate) => candidate.pageNo === page.pageNo);
      const geo = inspected.inventory.pages.find((candidate) => candidate.pageNo === page.pageNo);
      if (!pageText || !geo) continue;
      const located = locateFloorplanPage(pageText, geo, tagVocabulary);
      Object.assign(markerEdges, located.markerEdges);
      for (const [tag, placement] of Object.entries(located.placements)) {
        placements[tag] = placement;
        report.steps.placements.fromText++;
      }

      const missing = tagVocabulary.filter((tag) => !placements[tag]);
      if (!missing.length) continue;
      const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 150 });
      report.containerCalls++;
      report.steps.renderCrop.pagesRendered++;
      const full = rendered.images[0];
      if (!full) continue;
      const read = await deps.runFloorplan(`data:image/png;base64,${full.pngB64}`, missing, elevationVocabulary);
      report.modelCalls++;
      if (!read) continue;
      const missingSet = new Set(missing);
      for (const [tag, p] of Object.entries(read.placements)) {
        const normalized = normalizeOpeningRef(tag) ?? tag;
        if (!missingSet.has(normalized) || placements[normalized]) continue;
        placements[normalized] = { elevation: p.elevation, orderOnWall: p.orderOnWall, roomLabel: p.roomLabel };
        report.steps.placements.fromModelFallback++;
      }
      facingByElevation = { ...facingByElevation, ...read.facings };
    }
    for (const label of Object.keys(boxesByElevation)) {
      if (["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(label)) {
        facingByElevation[label] = { facing: label as Orientation };
      }
    }
    const northPages = selected
      .filter((candidate) => candidate.tier === "siteplan" || candidate.tier === "floorplan")
      .map((candidate) => inspected.pages.find((page) => page.pageNo === candidate.pageNo))
      .filter((page): page is NonNullable<typeof page> => !!page);
    const textNorth = resolveNorth(northPages);
    if (Object.keys(markerEdges).length && textNorth) {
      facingByElevation = { ...facingByElevation, ...orientationsFromNorth(markerEdges, textNorth.northArrowDegrees) };
    }
    if (Object.keys(markerEdges).length && deps.runNorth && !Object.values(facingByElevation).some((value) => !!value.facing)) {
      const northPage = selected.find((candidate) => candidate.tier === "siteplan") ?? floorplanPages[0];
      if (northPage) {
        if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "orientation");
        report.containerCalls++;
        const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: northPage.pageNo, dpi: 100 });
        const image = rendered.images[0];
        if (image) {
          const north = await deps.runNorth(`data:image/png;base64,${image.pngB64}`);
          report.modelCalls++;
          if (north) facingByElevation = { ...facingByElevation, ...orientationsFromNorth(markerEdges, north.northArrowDegrees) };
        }
      }
    }
    report.steps.placements.unplaced = tagVocabulary.filter((tag) => !placements[tag]).length;
    report.steps.northAssumed = Object.keys(placements).length > 0 && !Object.values(facingByElevation).some((value) => !!value.facing);

    currentPhase = "assignment";
    const assigned = assignOpenings(args.scheduleRows, placements, boxesByElevation, geometryByElevation);
    type PreparedCrop = { pngB64?: string; profile?: DarknessProfile; boxPt: [number, number, number, number]; gapCode?: GapCode; gapNote?: string };
    const prepared = new Map<string, PreparedCrop>();
    const matchedByPage = new Map<number, { tag: string; boxPt: [number, number, number, number] }[]>();
    const widen = (box: [number, number, number, number], widthPt: number, heightPt: number): [number, number, number, number] => {
      const [x0, y0, x1, y1] = box;
      const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
      const halfW = (x1 - x0) * 0.75; const halfH = (y1 - y0) * 0.75;
      return [Math.max(0, cx - halfW), Math.max(0, cy - halfH), Math.min(widthPt, cx + halfW), Math.min(heightPt, cy + halfH)];
    };
    for (const outcome of assigned) {
      if (outcome.outcome !== "matched") continue;
      const placement = placements[normalizeOpeningRef(outcome.tag) ?? outcome.tag];
      const pageNo = placement?.elevation ? pageByElevation[placement.elevation] : undefined;
      const geo = pageNo ? inspected.inventory.pages.find((page) => page.pageNo === pageNo) : undefined;
      if (!pageNo || !geo) {
        prepared.set(outcome.tag, { boxPt: outcome.boxPt, gapCode: "render_failed", gapNote: "elevation_page_missing" });
        continue;
      }
      const boxPt = widen(outcome.boxPt, geo.widthPt, geo.heightPt);
      const rows = matchedByPage.get(pageNo) ?? [];
      rows.push({ tag: outcome.tag, boxPt });
      matchedByPage.set(pageNo, rows);
    }
    currentPhase = "render_crops";
    if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "render_crops");
    for (const [pageNo, rows] of matchedByPage) {
      for (let offset = 0; offset < rows.length; offset += 12) {
        const batch = rows.slice(offset, offset + 12);
        try {
          report.containerCalls++;
          const rendered = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo, dpi: 300, crops: batch.map((row) => row.boxPt) });
          batch.forEach((row, index) => {
            const image = rendered.images[index];
            prepared.set(row.tag, image ? { pngB64: image.pngB64, profile: image.profile, boxPt: row.boxPt } : { boxPt: row.boxPt, gapCode: "render_failed" });
          });
        } catch (error) {
          const gapCode: GapCode = error instanceof ContainerClientError && error.code === "timeout" ? "timeout" : "render_failed";
          batch.forEach((row) => prepared.set(row.tag, { boxPt: row.boxPt, gapCode, gapNote: error instanceof Error ? error.name : "Error" }));
        }
      }
      report.steps.renderCrop.pagesRendered++;
    }

    // Denominator is the schedule-opening count, set once — it never
    // shortens, and a not_read still advances the numerator (§5): a
    // customer watching this must not see it stall on what it could not
    // read, or lie by shrinking to reach 100%.
    let doneCount = 0;
    let progressChain = Promise.resolve();
    const tick = async () => {
      const done = ++doneCount;
      if (args.onProgress) progressChain = progressChain.then(() => args.onProgress!(done, args.scheduleRows.length, "opening_read"));
      await progressChain;
    };
    currentPhase = "opening_read";
    if (args.onProgress) await args.onProgress(0, args.scheduleRows.length, "opening_read");
    const readings = await mapPool(assigned, 5, async (outcome): Promise<DrawingReading> => {
      const row = args.scheduleRows.find((r) => r.tag === outcome.tag)!;
      const placement = placements[normalizeOpeningRef(outcome.tag) ?? outcome.tag];
      const elevationLetter = placement?.elevation;
      const elevationPageNo = elevationLetter ? pageByElevation[elevationLetter] : undefined;
      const page = elevationPages.find((candidate) => candidate.pageNo === elevationPageNo);
      const facing = elevationLetter ? (facingByElevation[elevationLetter]?.facing ?? null) : null;
      const roomLabel = placement?.roomLabel ?? null;
      const known = {
        sourceFileId: args.file.fileId,
        elevation: elevationLetter,
        orientation: facing,
        roomLabel,
        pageNo: page?.pageNo ?? null,
      };
      report.steps.read.attempted++;
      if (outcome.outcome === "not_read") {
        report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: null });
        await tick();
        return notReadRow(row, outcome.gapCode, null, known);
      }
      const crop = prepared.get(outcome.tag);
      if (!crop?.pngB64) {
        report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page?.pageNo ?? null });
        await tick();
        return notReadRow(row, crop?.gapCode ?? "render_failed", crop?.gapNote ?? null, known);
      }
      try {
        const [x0, y0, x1, y1] = crop.boxPt;
        let measured = measureSplit(crop.profile, outcome.unitProportions, row.widthMm);
        if (!measured) {
          report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page?.pageNo ?? null });
          await tick();
          return notReadRow(row, "division_unreadable", "grid_or_profile_ambiguous", known);
        }
        let activeCrop = crop;
        let read = await deps.runOpening(`data:image/png;base64,${activeCrop.pngB64}`, row, { unitCount: measured.ratios.length });
        report.modelCalls++;
        const scheduleOperable = /AWNING|CASEMENT|SLID|LOUVRE|HINGED/i.test(`${row.typeText ?? ""} ${row.commentText ?? ""}`);
        const classifiedWithoutMarks = read && "units" in read && read.units.every((unit) => "marksObserved" in unit && !unit.marksObserved);
        if (page && scheduleOperable && (!read || "decline" in read || classifiedWithoutMarks)) {
          report.steps.read.retriedWithThreshold++;
          report.containerCalls++;
          const retry = await deps.render(env.PLAN_PARSE, args.projectId, pdfBytes, { pageNo: page.pageNo, dpi: 300, crops: [crop.boxPt], threshold: 250 });
          const retryImage = retry.images[0];
          if (retryImage) {
            activeCrop = { pngB64: retryImage.pngB64, profile: retryImage.profile, boxPt: crop.boxPt };
            measured = measureSplit(activeCrop.profile, outcome.unitProportions, row.widthMm) ?? measured;
            read = await deps.runOpening(`data:image/png;base64,${activeCrop.pngB64}`, row, { unitCount: measured.ratios.length });
            report.modelCalls++;
          }
        }
        if (!read || "decline" in read) {
          report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page.pageNo });
          await tick();
          return notReadRow(row, "model_declined", read && "decline" in read ? "model_declined" : null, known);
        }
        const stillNoMarks = read.units.every((unit) => "marksObserved" in unit && !unit.marksObserved);
        if (scheduleOperable && stillNoMarks) {
          read = { units: read.units.map(() => ({ operation: "fixed", marksObserved: false })), confidence: "low" };
        }
        const legacy = read.units.every((unit) => "role" in unit && "ratio" in unit)
          ? { units: read.units, axis: "axis" in read ? read.axis : "vertical" } as SplitReading
          : null;
        const split = legacy ?? composeMeasuredSplit(read.units.map((unit) => unit.operation), measured);
        if (!split) {
          report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page?.pageNo ?? null });
          await tick();
          return notReadRow(row, "refused_contract", "classification_count_mismatch", known);
        }
        const reconciled = reconcileReading({
          split,
          widthMm: row.widthMm,
          scheduleType: row.typeText,
          commentText: row.commentText,
          modelConfidence: read.confidence,
          northAssumed: !facing,
        });
        report.steps.read.returned++;
      // The crop evidence itself (§7): the gate walk checks a reading
      // against its own pixels via this key, and it must exist for that to
      // be possible at all. Best-effort — a write failure here degrades to
      // a dangling key (§7's own documented, acceptable failure mode), never
      // to losing the reading.
      const key = cropKey(args.projectId, args.aiRunId, row.tag);
      const stored = await env.FILES.put(key, Uint8Array.from(atob(activeCrop.pngB64), (c) => c.charCodeAt(0)))
        .then(() => true).catch(() => false);
      if (stored) report.steps.renderCrop.cropsMade++;
        const reading: DrawingReading = {
        id: "", projectId: "", aiRunId: "", sourceFileId: args.file.fileId, externalRef: row.tag,
        splitState: "value", split: reconciled.composition,
        orientationState: facing ? "value" : "not_stated", orientation: facing,
        elevationState: "value", elevation: elevationLetter ?? null,
        roomState: roomLabel ? "value" : "not_stated", roomLabel,
        gapCode: null, gapNote: null, cropKey: stored ? key : null, pageNo: page.pageNo, sheetRef: null,
        regionJson: [x0, y0, x1, y1],
        confidence: reconciled.confidence, flags: reconciled.flags,
        };
        report.perOpening.push({ tag: outcome.tag, outcome: "read", cropKey: stored ? key : null, pageNo: page.pageNo, confidence: reconciled.confidence, flags: reconciled.flags });
        await tick();
        return reading;
      } catch (error) {
        const gapCode: GapCode = error instanceof ContainerClientError
          ? (error.code === "timeout" ? "timeout" : "render_failed")
          : "model_declined";
        report.perOpening.push({ tag: outcome.tag, outcome: "not_read", cropKey: null, pageNo: page?.pageNo ?? null });
        await tick();
        return notReadRow(row, gapCode, error instanceof Error ? error.name : "Error", known);
      }
    });
    // Model calls finish out of order under the bounded pool. Keep the
    // diagnostic artifact in authoritative schedule order so identical
    // inputs produce byte-for-byte stable reports.
    const scheduleOrder = new Map(args.scheduleRows.map((row, index) => [row.tag, index]));
    report.perOpening.sort((left, right) =>
      (scheduleOrder.get(left.tag) ?? Number.MAX_SAFE_INTEGER)
      - (scheduleOrder.get(right.tag) ?? Number.MAX_SAFE_INTEGER));
    report.steps.read.declined = report.steps.read.attempted - report.steps.read.returned;
    report.wallMs = Date.now() - startedAt;
    return { readings, report };
  } catch {
    // AC-28: any failure anywhere above degrades to zero readings for this
    // file. The report already reflects whatever steps completed before
    // the failure; nothing here re-throws.
    report.steps.failedPhase = currentPhase;
    report.wallMs = Date.now() - startedAt;
    return { readings: [], report };
  }
}

export type DrawingParserMode = "disabled" | "legacy" | "full_document";

export function drawingParserMode(env: Pick<Env, "AI_EXTRACTION_MODE">): DrawingParserMode {
  const mode = (env.AI_EXTRACTION_MODE ?? "").trim().toLowerCase();
  return mode === "agentic_full" ? "full_document" : mode === "auto_drawings" ? "legacy" : "disabled";
}

/** pipeline.ts's whole enrichment stage, as one testable unit: the mode
 *  gate, the R2-key lookup and the real EnrichDeps construction, so the
 *  integration itself is under test without a full runAiExtraction/D1
 *  harness. Disabled modes make no DB call and return an empty result — the
 *  AC-27 property. */
export async function runDrawingEnrichmentStage(
  env: Env,
  args: {
    projectId: string; aiRunId: string; planPdfDocs: { fileId: string }[]; scheduleRows: EnrichScheduleRow[];
    onProgress?: (done: number, total: number, phase: DrawingProgressPhase) => Promise<void>;
  },
  /** Test-only: overrides the real container/runStage deps. Production
   *  never passes this — see the default branch below. */
  depsOverride?: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingReport | null }> {
  const parserMode = drawingParserMode(env);
  if (parserMode === "disabled") {
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

  const baseDeps: EnrichDeps = {
    inspect: inspectPdf,
    render: renderPage,
    async runElevation(imageDataUrl: string) {
      const res = await runStage(env, { aiRunId: args.aiRunId, projectId: args.projectId, skill: elevationInventorySkill, input: { imageDataUrl } });
      return res.data;
    },
    async runFloorplan(imageDataUrl: string, tagVocabulary: string[], elevationVocabulary: string[]) {
      const res = await runStage(env, {
        aiRunId: args.aiRunId,
        projectId: args.projectId,
        skill: makeFloorplanReadSkill(tagVocabulary, elevationVocabulary),
        input: { imageDataUrl, tagVocabulary, elevationVocabulary },
      });
      return res.data;
    },
    async runNorth(imageDataUrl: string) {
      const res = await runStage(env, { aiRunId: args.aiRunId, projectId: args.projectId, skill: northArrowSkill, input: { imageDataUrl } });
      return res.data;
    },
    async runOpening(imageDataUrl: string, row: EnrichScheduleRow, context: { unitCount: number }) {
      const res = await runStage(env, {
        aiRunId: args.aiRunId, projectId: args.projectId, skill: openingReadSkill,
        input: { imageDataUrl, tag: row.tag, widthMm: row.widthMm, heightMm: row.heightMm, typeText: row.typeText, unitCount: context.unitCount, commentText: row.commentText ?? null },
      });
      return res.data;
    },
  };
  const deps: EnrichDeps = depsOverride
    ? parserMode === "full_document"
      ? { ...depsOverride, runAgentTurn: undefined }
      : { ...depsOverride, runFullAgentTurn: undefined }
    : parserMode === "full_document"
    ? {
        ...baseDeps,
        runFullAgentTurn: async (input: FullDocumentAgentInput) => {
          const res = await runStage(env, {
            aiRunId: args.aiRunId,
            projectId: args.projectId,
            skill: makeFullDocumentAgentSkill(args.scheduleRows.map((row) => row.tag), input.harvest.pages.map((page) => page.pageNo)),
            input,
          });
          if (!res.ok && res.failureKind !== "invalid_output") throw new Error("full_document_agent_provider_failure");
          return {
            data: res.data,
            cached: res.cached,
            modelCalls: res.modelCalls,
            repaired: res.repaired,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
          };
        },
      }
    : {
        ...baseDeps,
        runAgentTurn: async (input: DrawingAgentInput) => {
          const res = await runStage(env, {
            aiRunId: args.aiRunId,
            projectId: args.projectId,
            skill: makeDrawingAgentSkill(args.scheduleRows.map((row) => row.tag), input.pages.map((page) => page.pageNo)),
            input,
          });
          if (!res.ok && res.failureKind !== "invalid_output") throw new Error("drawing_agent_provider_failure");
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
    onProgress?: (done: number, total: number, phase: DrawingProgressPhase) => Promise<void>;
  },
  deps: EnrichDeps,
): Promise<{ readings: DrawingReading[]; report: DrawingReport }> {
  if (deps.runFullAgentTurn && args.files.length > 1) {
    const files = args.files.map((file) => {
      const report = emptyFileReport(file.fileId);
      report.steps.failedPhase = "multiple_plan_pdfs";
      return report;
    });
    return { readings: [], report: { files } };
  }

  const readings: DrawingReading[] = [];
  const files: DrawingFileReport[] = [];
  for (const file of args.files) {
    const result = await enrichFile(env, { ...args, file }, deps);
    readings.push(...result.readings);
    files.push(result.report);
  }
  return { readings, report: { files } };
}
