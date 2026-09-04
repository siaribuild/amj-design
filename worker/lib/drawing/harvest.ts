import { normalizeOpeningRef } from "../ai/energyMap";
import type { CropBoxPt, InspectResponse, Orientation, PageWord } from "./contract";
import type { EnrichScheduleRow } from "./enrich";
import { selectPages } from "./selectPages";
import { drawingViewRegions, horizontalGap, sameLine, type DrawingViewRegion } from "./elevationRegions";
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
/** A drainage fall, a ramp grade and a roof pitch all print `1:100`. Only the
 * words beside it say which one the drawing means, and they are printed with
 * whatever punctuation and connectors the drafter liked: `FALL: 1:100`,
 * `FALL TO 1:100`, `RAMP @ 1:20`. Read the phrase around the ratio, not the
 * one token touching it. */
const NOT_A_SCALE = /^(?:FALL|FALLS|GRADE|GRADIENT|PITCH|SLOPE|RAMP|CROSSFALL)$/i;
const PHRASE_REACH = 4;
const MAX_SCALE_RATIO = 20_000;
const MAX_SCALE_WORDS = 3;
/** Words sort by baseline, so only the last few lines can still take one. */
const MAX_OPEN_LINES = 3;

/** Two words are on one printed row when their glyph boxes actually overlap
 * vertically. `sameLine`'s 1.5-height tolerance is right for finding a title's
 * neighbours, but at ordinary title-block line spacing it merges two rows —
 * and a merged row sorts a word from above between `1` and `100`. */
const sharesRow = (a: PageWord, b: PageWord): boolean =>
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    > Math.max(Math.min(a.bottom - a.top, b.bottom - b.top), 1) * 0.5;

const adjacent = (a: PageWord, b: PageWord): boolean =>
  sharesRow(a, b) && horizontalGap(a, b) <= Math.max(a.bottom - a.top, b.bottom - b.top, 1) * 1.5;

/** A scale belongs to the title it is printed under, which is not always the
 * band it lands in: stacked views end at their own title line, so a ratio one
 * line below its title falls inside the next view. Bind to the nearest title,
 * and only when it is clearly nearest — a ratio equidistant from two views
 * names neither, and that is the ambiguity the caller must see.
 *
 * Distance to the title is the whole rule. Excluding the bottom of the sheet
 * as "title block" would throw away the commonest layout there is: a title
 * printed under its own view, near the foot of the page. */
const VIEW_BIND_MARGIN = 0.5;

function boundView(regions: DrawingViewRegion[], centreX: number, centreY: number): CropBoxPt | null {
  if (!regions.length) return null;
  const away = (region: DrawingViewRegion): number =>
    Math.hypot(region.titlePt[0] - centreX, region.titlePt[1] - centreY);
  const ranked = [...regions].sort((a, b) => away(a) - away(b));
  if (ranked.length === 1) return [...ranked[0].region];
  return away(ranked[0]) <= away(ranked[1]) * VIEW_BIND_MARGIN ? [...ranked[0].region] : null;
}

/** Printed view scales, one candidate per printed ratio. A sheet often carries
 * several views at different scales, so nothing here collapses to a single page
 * answer — the caller decides whether the candidates covering a view agree.
 *
 * ponytail: `1:100 @ A3` keeps the ratio and drops the paper size, and
 * `1:1,000` is not read at all. Both fail towards fewer candidates, which the
 * scale-conflict rule already handles; widen only if a real set needs it. */
export function viewScaleCandidates(inspected: InspectResponse): DrawingScaleCandidate[] {
  const geometryByPage = new Map(inspected.inventory.pages.map((page) => [page.pageNo, page]));
  return inspected.pages.flatMap((page) => {
    const geometry = geometryByPage.get(page.pageNo);
    if (!geometry) return [];
    const regions = drawingViewRegions(page.words, geometry.widthPt, geometry.heightPt);
    const found: DrawingScaleCandidate[] = [];
    // A ratio is read from the words printed beside it. Scanning the page in
    // content-stream order instead lets another column's word fall between
    // `1` and `100`, and the split forms vanish.
    for (const words of textLines(page.words)) {
      let at = 0;
      while (at < words.length) {
        let consumed = 0;
        for (let size = 1; size <= MAX_SCALE_WORDS && at + size <= words.length; size++) {
          const window = words.slice(at, at + size);
          if (size > 1 && !adjacent(window[size - 2], window[size - 1])) break;
          // Title blocks print `SCALES 1:100, 1:50`, so a trailing separator is
          // part of the sentence, not of the ratio.
          const match = SCALE_RATIO.exec(window.map((word) => word.text.trim()).join("").replace(/[.,;]+$/, ""));
          if (!match) continue;
          consumed = size;
          const ratio = Number(match[1]);
          const prior = at > 0 ? words[at - 1] : null;
          const qualifier = subject(words, at, -1) === "not_a_scale"
            || (subject(words, at, -1) === null && subject(words, at + size - 1, 1) === "not_a_scale");
          // 1:0 parses but cannot scale anything, and no drawing is printed
          // smaller than 1:20000 — both are text that merely looks like a scale.
          if (ratio >= 1 && ratio <= MAX_SCALE_RATIO && !qualifier) {
            const evidence = prior && SCALE_LABEL.test(prior.text.trim()) && adjacent(prior, window[0])
              ? [prior, ...window] : window;
            const box: CropBoxPt = [
              Math.min(...evidence.map((word) => word.x0)), Math.min(...evidence.map((word) => word.top)),
              Math.max(...evidence.map((word) => word.x1)), Math.max(...evidence.map((word) => word.bottom)),
            ];
            found.push({
              pageNo: page.pageNo,
              ratio,
              text: evidence.map((word) => word.text.trim()).join(" "),
              evidenceBoxPt: box,
              viewRegionPt: boundView(regions, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2),
              source: "printed",
            });
          }
          break;
        }
        at += Math.max(consumed, 1);
      }
    }
    return found;
  });
}

/** What the ratio at `from` is a ratio *of*, read by walking one direction
 * through the phrase it is printed in and stopping at the first word that
 * says: `SCALE` makes it a drawing scale, `FALL` or `RAMP` makes it neither.
 * The walk ends at a gap too wide to be one phrase, so a ratio cannot inherit
 * a subject from the next column of the title block. */
function subject(words: PageWord[], from: number, step: -1 | 1): "scale" | "not_a_scale" | null {
  for (let at = from + step, walked = 0; at >= 0 && at < words.length && walked < PHRASE_REACH; at += step, walked++) {
    if (!adjacent(words[at], words[at - step])) return null;
    const text = words[at].text.trim().replace(/[^A-Za-z]/g, "");
    if (SCALE_LABEL.test(text)) return "scale";
    if (NOT_A_SCALE.test(text)) return "not_a_scale";
  }
  return null;
}

/** Page words grouped into printed lines, each ordered left to right. Words
 * arrive in content-stream order; a line is built from the ones that share a
 * baseline with what is already on it. */
function textLines(words: PageWord[]): PageWord[][] {
  const lines: PageWord[][] = [];
  for (const word of [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0)) {
    let placed = false;
    for (let line = lines.length - 1; line >= 0 && line >= lines.length - MAX_OPEN_LINES; line--) {
      if (!sharesRow(lines[line][lines[line].length - 1], word)) continue;
      lines[line].push(word);
      placed = true;
      break;
    }
    if (!placed) lines.push([word]);
  }
  return lines.map((line) => [...line].sort((a, b) => a.x0 - b.x0));
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
