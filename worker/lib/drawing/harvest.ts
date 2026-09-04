import { normalizeOpeningRef } from "../ai/energyMap";
import type { CropBoxPt, InspectResponse, Orientation, PageWord } from "./contract";
import type { EnrichScheduleRow } from "./enrich";
import { selectPages } from "./selectPages";
import { elevationRegions, horizontalGap, sameLine } from "./elevationRegions";
import { locateFloorplanPage, openingTagWords, orientationsFromNorth, resolveNorth, type Edge } from "./locate";

export const MAX_TAG_CANDIDATES_PER_TAG = 4;
export const MAX_HARVEST_TEXT_CHARS = 48_000;
const MAX_NEARBY_TEXT_CHARS = 400;

export interface FullDocumentHarvest {
  version: 1;
  schedule: {
    tag: string;
    widthMm: number;
    heightMm: number;
    typeText: string | null;
    commentText: string | null;
    priorRoomCandidate: string | null;
    priorStoreyCandidate: "ground" | "first" | null;
  }[];
  pages: {
    pageNo: number;
    sourceFileId?: string;
    sourcePageNo?: number;
    widthPt: number;
    heightPt: number;
    sheetId: string | null;
    tiers: string[];
    textExcerpt: string;
  }[];
  tagCandidates: {
    id: string;
    tag: string;
    pageNo: number;
    boxPt: CropBoxPt;
    nearbyText: string;
    ambiguous: boolean;
    identityEvidence: "sheet_reference" | "visual_required";
  }[];
  elevationMarkers: { pageNo: number; label: string; boxPt: CropBoxPt; edge: Edge }[];
  roomLabelCandidates: { pageNo: number; text: string; boxPt: CropBoxPt }[];
  rlDatums: { pageNo: number; text: string; yPt: number }[];
  northEvidence: {
    labels: { pageNo: number; text: string; boxPt: CropBoxPt }[];
    bearings: { pageNo: number; text: string; boxPt: CropBoxPt }[];
    resolution: { northArrowDegrees: number; source: string } | null;
    requiresVisualRead: boolean;
    visualEvidence: { pageNo: number; boxNorm: CropBoxPt; source: "arrow" | "compass" | "survey_bearings" } | null;
  };
  placements: {
    tag: string;
    pageNo: number;
    elevation: string;
    orderOnWall: number;
    roomLabelCandidate: string | null;
    storey: "ground" | "first" | null;
    orientation: Orientation | null;
  }[];
}

export interface DrawingScaleCandidate {
  pageNo: number;
  ratio: number;
  text: string;
  evidenceBoxPt: CropBoxPt;
  viewRegionPt: CropBoxPt | null;
  source: "printed" | "inferred";
}

const SCALE_RATIO = /^1\s*[:/]\s*(\d{1,5})$/;
const SCALE_LABEL = /^SCALE:?$/i;
const MAX_SCALE_RATIO = 20_000;
const MAX_SCALE_WORDS = 3;

const adjacent = (a: PageWord, b: PageWord): boolean =>
  sameLine(a, b) && horizontalGap(a, b) <= Math.max(a.bottom - a.top, b.bottom - b.top, 1) * 1.5;

/** Printed view scales, one candidate per printed ratio. A sheet often carries
 * several views at different scales, so nothing here collapses to a single page
 * answer — the caller decides whether the candidates covering a view agree. */
export function viewScaleCandidates(inspected: InspectResponse): DrawingScaleCandidate[] {
  const geometryByPage = new Map(inspected.inventory.pages.map((page) => [page.pageNo, page]));
  return inspected.pages.flatMap((page) => {
    const geometry = geometryByPage.get(page.pageNo);
    if (!geometry) return [];
    const regions = elevationRegions(page.words, geometry.widthPt, geometry.heightPt);
    const words = [...page.words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
    const found: DrawingScaleCandidate[] = [];
    let at = 0;
    while (at < words.length) {
      let consumed = 0;
      for (let size = 1; size <= MAX_SCALE_WORDS && at + size <= words.length; size++) {
        const window = words.slice(at, at + size);
        if (size > 1 && !adjacent(window[size - 2], window[size - 1])) break;
        const match = SCALE_RATIO.exec(window.map((word) => word.text.trim()).join(""));
        if (!match) continue;
        consumed = size;
        const ratio = Number(match[1]);
        // 1:0 parses but cannot scale anything, and no drawing is printed
        // smaller than 1:20000 — both are text that merely looks like a scale.
        if (ratio >= 1 && ratio <= MAX_SCALE_RATIO) {
          const prior = at > 0 ? words[at - 1] : null;
          const evidence = prior && SCALE_LABEL.test(prior.text.trim()) && adjacent(prior, window[0])
            ? [prior, ...window] : window;
          const box: CropBoxPt = [
            Math.min(...evidence.map((word) => word.x0)), Math.min(...evidence.map((word) => word.top)),
            Math.max(...evidence.map((word) => word.x1)), Math.max(...evidence.map((word) => word.bottom)),
          ];
          const centreX = (box[0] + box[2]) / 2;
          const centreY = (box[1] + box[3]) / 2;
          const view = regions.find(({ region: [x0, y0, x1, y1] }) =>
            centreX >= x0 && centreX <= x1 && centreY >= y0 && centreY <= y1);
          found.push({
            pageNo: page.pageNo,
            ratio,
            text: evidence.map((word) => word.text.trim()).join(" "),
            evidenceBoxPt: box,
            viewRegionPt: view ? [...view.region] : null,
            source: "printed",
          });
        }
        break;
      }
      at += Math.max(consumed, 1);
    }
    return found;
  });
}

const compactText = (value: string, limit: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, limit);

const centre = (word: { x0: number; top: number; x1: number; bottom: number }): [number, number] =>
  [(word.x0 + word.x1) / 2, (word.top + word.bottom) / 2];

/** Free Stage A: mechanical PDF facts only. Prior room/storey values are named
 * candidates so the visual agent may correct them instead of inheriting them. */
export function buildFullDocumentHarvest(
  inspected: InspectResponse,
  scheduleRows: EnrichScheduleRow[],
  pageSources: Map<number, { fileId: string; pageNo: number }> = new Map(),
): FullDocumentHarvest {
  const selected = selectPages(inspected.inventory, inspected.pages).selected;
  const tiersByPage = new Map<number, string[]>();
  for (const item of selected) {
    const tiers = tiersByPage.get(item.pageNo) ?? [];
    if (!tiers.includes(item.tier)) tiers.push(item.tier);
    tiersByPage.set(item.pageNo, tiers);
  }
  const tags = new Set(scheduleRows.map((row) => normalizeOpeningRef(row.tag)).filter((tag): tag is string => !!tag));
  const inventoryByPage = new Map(inspected.inventory.pages.map((page) => [page.pageNo, page]));
  const floorplanPageNos = new Set(selected.filter(({ tier }) => tier === "floorplan").map(({ pageNo }) => pageNo));
  const elevationPageNos = new Set(selected.filter(({ tier }) => tier === "elevation").map(({ pageNo }) => pageNo));
  const northPageNos = new Set(selected.filter(({ tier }) => tier === "siteplan" || tier === "floorplan").map(({ pageNo }) => pageNo));
  const located = inspected.pages.filter((page) => floorplanPageNos.has(page.pageNo)).map((page) => {
    const geo = inventoryByPage.get(page.pageNo);
    return geo ? { page, result: locateFloorplanPage(page, geo, [...tags]) } : null;
  }).filter((item): item is NonNullable<typeof item> => !!item);
  const northPages = inspected.pages.filter((page) => northPageNos.has(page.pageNo));
  const northResolution = resolveNorth(northPages);
  const facingByPage = new Map(located.map(({ page, result }) => [
    page.pageNo,
    northResolution ? orientationsFromNorth(result.markerEdges, northResolution.northArrowDegrees) : {},
  ]));
  const wordBox = (word: InspectResponse["pages"][number]["words"][number]): CropBoxPt => [word.x0, word.top, word.x1, word.bottom];
  const elevationMarkers = located.flatMap(({ page, result }) => Object.entries(result.markerEdges).map(([label, edge]) => {
    const matching = page.words.filter((word) => word.text.trim().toUpperCase() === label);
    const marker = [...matching].sort((a, b) => {
      const edgeValue = (word: typeof a): number => edge === "left" ? word.x0 : edge === "right" ? -word.x1 : edge === "top" ? word.top : -word.bottom;
      return edgeValue(a) - edgeValue(b);
    })[0];
    return marker ? { pageNo: page.pageNo, label, boxPt: wordBox(marker), edge } : null;
  })).filter((item): item is NonNullable<typeof item> => !!item)
    .sort((a, b) => a.pageNo - b.pageNo || a.label.localeCompare(b.label));
  const placements = located.flatMap(({ page, result }) => Object.entries(result.placements).map(([tag, placement]) => ({
    tag, pageNo: page.pageNo, elevation: placement.elevation, orderOnWall: placement.orderOnWall,
    roomLabelCandidate: placement.roomLabel, storey: placement.storey ?? null,
    orientation: facingByPage.get(page.pageNo)?.[placement.elevation]?.facing ?? null,
  }))).sort((a, b) => a.pageNo - b.pageNo || a.tag.localeCompare(b.tag, undefined, { numeric: true }));
  const roomLabelCandidates = inspected.pages.filter((page) => floorplanPageNos.has(page.pageNo)).flatMap((page) => page.words
    .filter((word) => /^[A-Z][A-Z'-]{1,}$/.test(word.text.trim()) && !tags.has(normalizeOpeningRef(word.text) ?? "") && !/^S\d+$/i.test(word.text.trim()))
    .slice(0, 200)
    .map((word) => ({ pageNo: page.pageNo, text: word.text.trim().toUpperCase(), boxPt: wordBox(word) })));
  const rlDatums = inspected.pages.filter((page) => elevationPageNos.has(page.pageNo)).flatMap((page) => page.words.flatMap((word) => {
    if (word.text.trim().toUpperCase() !== "RL") return [];
    const value = page.words.filter((candidate) => /^-?\d+(?:\.\d+)?$/.test(candidate.text.trim())
      && Math.abs((candidate.top + candidate.bottom - word.top - word.bottom) / 2) <= Math.max(candidate.bottom - candidate.top, word.bottom - word.top, 1))
      .sort((a, b) => Math.abs(a.x0 - word.x1) - Math.abs(b.x0 - word.x1))[0];
    return value ? [{ pageNo: page.pageNo, text: `RL ${value.text.trim()}`, yPt: (value.top + value.bottom) / 2 }] : [];
  }));
  const northEvidenceWords = northPages.flatMap((page) => page.words.map((word) => ({ pageNo: page.pageNo, word })));
  const hitsByTag = new Map<string, { tag: string; page: InspectResponse["pages"][number]; word: InspectResponse["pages"][number]["words"][number]; rank: number; ambiguous: boolean; identityEvidence: "sheet_reference" | "visual_required" }[]>();
  for (const page of inspected.pages) {
    const geo = inventoryByPage.get(page.pageNo);
    for (const { tag, word, ambiguous, identityEvidence } of openingTagWords(page.words, tags, geo)) {
      const tiers = tiersByPage.get(page.pageNo) ?? [];
      const rank = tiers.includes("floorplan") ? 0 : tiers.includes("elevation") ? 1 : tiers.includes("siteplan") ? 2 : 3;
      const hits = hitsByTag.get(tag) ?? [];
      if (hits.filter((hit) => hit.page.pageNo === page.pageNo).length >= 2) continue;
      hits.push({ tag, page, word, rank, ambiguous, identityEvidence });
      hits.sort((a, b) => a.rank - b.rank || a.page.pageNo - b.page.pageNo || a.word.top - b.word.top || a.word.x0 - b.word.x0);
      hitsByTag.set(tag, hits.slice(0, MAX_TAG_CANDIDATES_PER_TAG));
    }
  }
  const tagCandidates: FullDocumentHarvest["tagCandidates"] = [];
  for (const hits of hitsByTag.values()) {
    for (const [index, { tag, page, word, ambiguous, identityEvidence }] of hits.entries()) {
      const [cx, cy] = centre(word);
      const nearbyText = page.words
        .filter((candidate) => {
          const [x, y] = centre(candidate);
          return Math.abs(x - cx) <= 180 && Math.abs(y - cy) <= 110;
        })
        .sort((a, b) => a.top - b.top || a.x0 - b.x0)
        .slice(0, 50)
        .map((candidate) => candidate.text)
        .join(" ");
      tagCandidates.push({
        id: `${tag}_p${page.pageNo}_${index + 1}`,
        tag, pageNo: page.pageNo, boxPt: [word.x0, word.top, word.x1, word.bottom],
        nearbyText: compactText(nearbyText, MAX_NEARBY_TEXT_CHARS),
        ambiguous,
        identityEvidence,
      });
    }
  }
  const excerpts = new Map<number, string>();
  let excerptChars = MAX_HARVEST_TEXT_CHARS;
  for (const page of [...inspected.pages].sort((a, b) => {
    const selectedA = (tiersByPage.get(a.pageNo)?.length ?? 0) > 0 ? 0 : 1;
    const selectedB = (tiersByPage.get(b.pageNo)?.length ?? 0) > 0 ? 0 : 1;
    return selectedA - selectedB || a.pageNo - b.pageNo;
  })) {
    const limit = Math.min(excerptChars, (tiersByPage.get(page.pageNo)?.length ?? 0) > 0 ? 2_000 : 600);
    const excerpt = compactText(page.text, limit);
    excerpts.set(page.pageNo, excerpt);
    excerptChars -= excerpt.length;
  }
  return {
    version: 1,
    schedule: scheduleRows.map((row) => ({
      tag: normalizeOpeningRef(row.tag) ?? row.tag,
      widthMm: row.widthMm,
      heightMm: row.heightMm,
      typeText: row.typeText,
      commentText: row.commentText ?? null,
      priorRoomCandidate: row.roomLabel ?? null,
      priorStoreyCandidate: row.storey ?? null,
    })),
    pages: inspected.pages.map((page) => {
      const inventory = inventoryByPage.get(page.pageNo);
      const tiers = tiersByPage.get(page.pageNo) ?? [];
      return {
        pageNo: page.pageNo,
        ...(pageSources.get(page.pageNo) ? {
          sourceFileId: pageSources.get(page.pageNo)!.fileId,
          sourcePageNo: pageSources.get(page.pageNo)!.pageNo,
        } : {}),
        widthPt: inventory?.widthPt ?? 0,
        heightPt: inventory?.heightPt ?? 0,
        sheetId: page.words.filter((word) => word.top >= (inventory?.heightPt ?? 0) * 0.85 && /^[A-Z]{1,3}-?\d{1,3}$/i.test(word.text.trim()))
          .sort((a, b) => b.x1 - a.x1)[0]?.text.trim().toUpperCase() ?? null,
        tiers,
        textExcerpt: excerpts.get(page.pageNo) ?? "",
      };
    }),
    tagCandidates,
    elevationMarkers,
    roomLabelCandidates,
    rlDatums,
    northEvidence: {
      labels: northEvidenceWords.filter(({ word }) => /^(?:N|NORTH)$/i.test(word.text.trim()))
        .map(({ pageNo, word }) => ({ pageNo, text: word.text.trim().toUpperCase(), boxPt: wordBox(word) })),
      bearings: northEvidenceWords.filter(({ word }) => /^\d{1,3}°\d{1,2}['’]\d{1,2}["”]$/.test(word.text.trim()))
        .map(({ pageNo, word }) => ({ pageNo, text: word.text.trim(), boxPt: wordBox(word) })),
      resolution: northResolution,
      requiresVisualRead: !northResolution,
      visualEvidence: null,
    },
    placements,
  };
}

export function applyVisualNorthToHarvest(
  harvest: FullDocumentHarvest,
  pageNo: number,
  north: { northArrowDegrees: number; source: "arrow" | "compass" | "survey_bearings"; evidenceBoxNorm: CropBoxPt },
): FullDocumentHarvest {
  const [x0, y0, x1, y1] = north.evidenceBoxNorm;
  if (!Number.isFinite(north.northArrowDegrees)
    || !north.evidenceBoxNorm.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    || x0 >= x1 || y0 >= y1) return harvest;
  const degrees = ((north.northArrowDegrees % 360) + 360) % 360;
  const markersByPage = new Map<number, Record<string, Edge>>();
  for (const marker of harvest.elevationMarkers) {
    const markers = markersByPage.get(marker.pageNo) ?? {};
    markers[marker.label] = marker.edge;
    markersByPage.set(marker.pageNo, markers);
  }
  return {
    ...harvest,
    northEvidence: {
      ...harvest.northEvidence,
      resolution: { northArrowDegrees: degrees, source: `page ${pageNo} ${north.source}` },
      requiresVisualRead: false,
      visualEvidence: { pageNo, boxNorm: north.evidenceBoxNorm, source: north.source },
    },
    placements: harvest.placements.map((placement) => ({
      ...placement,
      orientation: orientationsFromNorth(markersByPage.get(placement.pageNo) ?? {}, degrees)[placement.elevation]?.facing ?? null,
    })),
  };
}
