import type { CropBoxPt, PageInventory, PageText, PageWord } from "./contract";
import { printedStorey } from "./locate";

/**
 * Phase A, document vocabulary: what this set calls its faces, and which sheet
 * draws each of them.
 *
 * A set writes `ELEVATION A` or `WEST ELEVATION` or `FRONT ELEVATION`, and
 * whichever it writes is the vocabulary its plan will mark its walls with.
 * Reading it from the document is what lets placement work on a set nobody
 * anticipated, instead of on the sets whose conventions happen to be in a regex.
 *
 * It lives here rather than beside placement because it is a fact about the
 * document, read once: Phase C's job is the plan, and a phase that reads
 * elevation sheets to do it has two sources of truth about the same thing.
 */
export interface SheetPage {
  page: PageText;
  geometry: Pick<PageInventory, "pageNo" | "widthPt" | "heightPt">;
}

// A section cuts through the building; an elevation looks at one of its walls.
// Only the second names a face, and reading one off the first lets a
// cut-through be inventoried as though it were the wall. A drawing's title is
// singular - NORTH ELEVATION - and a sheet's is plural - GROUND FLOOR
// ELEVATIONS; the plural names the storey a sheet draws, never a face.
const VIEW_TITLE = /^ELEVATION$/;
// No word of a storey is itself ELEVATION: NORTH ELEVATION GROUND FLOOR
// ELEVATIONS holds one face title and one sheet title, not a storey called
// ELEVATION GROUND FLOOR. The plural is a sheet's title and always names a
// storey; the singular names one only when the plans name it too.
const SHEET_TITLE = /\b((?:(?!ELEVATIONS?\b)[A-Z][A-Z0-9]*)(?:\s+(?!ELEVATIONS?\b)[A-Z0-9]+){0,2})\s+(ELEVATIONS?)\b/g;
/** Titles whose baselines differ by less than this many title heights are one
 * row of drawings. */
const ROW_TOLERANCE = 1.5;
const FACE_NAME = /^[A-Z][A-Z0-9-]{0,11}$/;

/** Every face title printed in a set, with where it is printed. */
function faceTitles(pages: SheetPage[], storeyNames: Set<string> = new Set(), planText?: string): { label: string; pageNo: number; x: number; y: number; height: number }[] {
  const found: { label: string; pageNo: number; x: number; y: number; height: number }[] = [];
  const printed = planText == null ? null : ` ${planText.toUpperCase().replace(/\s+/g, " ").trim()} `;
  const storeys = [...storeyNames].map((storey) => ` ${storey} `);
  // FIRST FLOOR NORTH ELEVATION names the wall NORTH, and a title-block heading
  // run into a title - DRAWING TITLE NORTH ELEVATION - names it too. The plan
  // marks its walls in its own words, so the face is the longest end of the
  // run, nearest ELEVATION, that the plan prints and no storey name contains:
  // longest, so SOUTH WEST is not collapsed into the WEST inside it. The words
  // it was read from go with it, because they are where the face's title is.
  const faceOf = (parts: string[], words: PageWord[], nearestLast: boolean) => {
    if (printed) {
      for (let take = parts.length; take >= 1; take -= 1) {
        const end = (nearestLast ? parts.slice(parts.length - take) : parts.slice(0, take)).join(" ");
        // `words` run outward from ELEVATION, so the nearest `take` are the first.
        if (printed.includes(` ${end} `) && !storeys.some((storey) => storey.includes(` ${end} `))) return { label: end, words: words.slice(0, take) };
      }
    }
    return { label: parts.join(" "), words };
  };
  for (const { page, geometry } of pages) {
    const rows = new Map<number, PageWord[]>();
    for (const word of page.words) {
      const line = Math.round((word.top + word.bottom) / 2 / 6);
      rows.set(line, [...(rows.get(line) ?? []), word]);
    }
    for (const row of rows.values()) {
      const ordered = [...row].sort((a, b) => a.x0 - b.x0);
      ordered.forEach((word, at) => {
        if (!VIEW_TITLE.test(word.text.trim().toUpperCase())) return;
        const spacing = Math.max(word.bottom - word.top, 1) * 2;
        // A name can be more than one word. Taking only the word touching
        // ELEVATION files SOUTH WEST ELEVATION under WEST - a face the document
        // does not have, and one its plan will never mark.
        const run = (step: number) => {
          const parts: string[] = [];
          const words: PageWord[] = [];
          let previous = word;
          for (let index = at + step; index >= 0 && index < ordered.length; index += step) {
            const next = ordered[index];
            const label = next.text.trim().toUpperCase().replace(/[.,:]$/, "");
            if (!FACE_NAME.test(label) || VIEW_TITLE.test(label)) break;
            const gap = next.x0 > previous.x1 ? next.x0 - previous.x1 : previous.x0 - next.x1;
            if (gap > spacing) break;
            parts.push(label);
            words.push(next);
            previous = next;
          }
          return { parts: step < 0 ? parts.reverse() : parts, words, nearestLast: step < 0 };
        };
        for (const title of [run(-1), run(1)]) {
          if (!title.parts.length) continue;
          const { label, words } = faceOf(title.parts, title.words, title.nearestLast);
          // GROUND FLOOR ELEVATION reads like a drawing's title until the plans
          // are consulted: a storey the plans name is a sheet's title, not a face.
          if (storeyNames.has(label)) continue;
          // The title's own place on the sheet is where its name is printed,
          // which is what separates one elevation's region from the next.
          const neighbour = {
            x0: Math.min(...words.map((item) => item.x0)),
            x1: Math.max(...words.map((item) => item.x1)),
            top: Math.min(...words.map((item) => item.top)),
            bottom: Math.max(...words.map((item) => item.bottom)),
          };
          if (found.some((item) => item.label === label && item.pageNo === geometry.pageNo)) continue;
          found.push({
            label,
            pageNo: geometry.pageNo,
            x: (neighbour.x0 + neighbour.x1) / 2,
            y: (neighbour.top + neighbour.bottom) / 2,
            height: Math.max(neighbour.bottom - neighbour.top, 1),
          });
        }
      });
    }
  }
  return found;
}

/** Face name to the sheets that draw it, in page order. */
export function documentFaceSheets(pages: SheetPage[], storeyNames: Set<string> = new Set(), planText?: string): Map<string, number[]> {
  const sheets = new Map<string, number[]>();
  for (const { label, pageNo } of faceTitles(pages, storeyNames, planText)) {
    const seen = sheets.get(label) ?? [];
    if (!seen.includes(pageNo)) sheets.set(label, [...seen, pageNo]);
  }
  return sheets;
}

/**
 * Where on its sheet each face is drawn.
 *
 * Every set to hand draws all four faces on one sheet. Asking a reader to look
 * at one of them while showing it all four is asking it to guess which, and it
 * answers with the frames of whichever it happened to look at. The titles say
 * where each drawing is: side by side, they meet halfway between their titles;
 * stacked, each reaches from the title above down to its own.
 */
export function documentFaceRegions(pages: SheetPage[], storeyNames: Set<string> = new Set(), planText?: string): Map<string, { pageNo: number; regionPt: CropBoxPt }> {
  // Keyed by sheet and face: a face drawn once per storey sheet has a region on
  // each, and the second must not overwrite the first.
  const keyOf = (pageNo: number, label: string) => `${pageNo}|${label}`;
  const regions = new Map<string, { pageNo: number; regionPt: CropBoxPt }>();
  const titles = faceTitles(pages, storeyNames, planText);
  for (const { geometry } of pages) {
    const onSheet = titles.filter((title) => title.pageNo === geometry.pageNo);
    if (!onSheet.length) continue;
    if (onSheet.length === 1) {
      regions.set(keyOf(geometry.pageNo, onSheet[0].label), { pageNo: geometry.pageNo, regionPt: [0, 0, geometry.widthPt, geometry.heightPt] });
      continue;
    }
    // Rows first, then columns within a row: a sheet of four elevations is as
    // often a two-by-two as a strip, and a strip cut one way across a grid
    // hands each reader two drawings. Titles sit under their drawings, so a
    // row reaches from the title above down to its own; columns meet halfway
    // between titles.
    const rows: { y: number; titles: typeof onSheet }[] = [];
    for (const title of [...onSheet].sort((a, b) => a.y - b.y)) {
      // Titles in one row share a baseline to within their own height; a fixed
      // fraction of the page merges two stacked drawings on a tall sheet.
      const row = rows.find((item) => Math.abs(item.y - title.y) <= title.height * ROW_TOLERANCE);
      if (row) row.titles.push(title);
      else rows.push({ y: title.y, titles: [title] });
    }
    rows.forEach((row, rowAt) => {
      const top = rowAt === 0 ? 0 : rows[rowAt - 1].y;
      const bottom = rows.length === 1 ? geometry.heightPt : row.y;
      const across = [...row.titles].sort((a, b) => a.x - b.x);
      across.forEach((title, at) => {
        const left = at === 0 ? 0 : (across[at - 1].x + title.x) / 2;
        const right = at === across.length - 1 ? geometry.widthPt : (title.x + across[at + 1].x) / 2;
        regions.set(keyOf(geometry.pageNo, title.label), { pageNo: geometry.pageNo, regionPt: [left, top, right, bottom] });
      });
    });
  }
  return regions;
}

/**
 * Which storey each elevation sheet draws, where it says: the words before
 * ELEVATION(S) in its title - GROUND FLOOR ELEVATIONS, UPPER FLOOR ELEVATIONS.
 * A set that draws each face once per storey needs this to tell the two NORTH
 * sheets apart; a set that draws all its faces on one sheet has none, and that
 * is an answer too. A face name printed as a drawing's own title is not a
 * storey, so the document's face names are excluded.
 */
export function documentSheetStoreys(
  pages: SheetPage[],
  recoveredTitles: Map<number, string> = new Map(),
  faceNames: Set<string> = new Set(),
  storeyNames: Set<string> = new Set(),
): Map<number, string> {
  const storeys = new Map<number, string>();
  for (const { page, geometry } of pages) {
    const band = page.words.filter((word) => word.top >= geometry.heightPt * 0.85).map((word) => word.text).join(" ");
    for (const text of [recoveredTitles.get(geometry.pageNo), band]) {
      if (!text) continue;
      // A storey the plans know, wherever a title puts it: LOWER GROUND FLOOR
      // NORTH ELEVATION says LOWER GROUND FLOOR, however the title goes on and
      // however many words that is - the longest known name first, so GROUND
      // FLOOR does not win a title that says LOWER GROUND FLOOR.
      const known = [...storeyNames].sort((a, b) => b.length - a.length)
        .find((name) => new RegExp(String.raw`\b${name}\b(?:\s+[A-Z0-9]+){0,2}\s+ELEVATIONS?\b`).test(text.toUpperCase()));
      // Otherwise every sheet title in the band, not the first thing before
      // ELEVATIONS: a face's own title may share the band with the sheet's.
      const storey = known ?? [...text.toUpperCase().matchAll(SHEET_TITLE)]
        .map((match) => ({ label: printedStorey(`${match[1]} PLAN`), plural: match[2] === "ELEVATIONS" }))
        // The plural is a sheet's title and names a storey whatever else its
        // label was taken for; the singular names one only when the plans name
        // it too, and a face name that is not a plan storey is a face.
        .find(({ label, plural }) => label && (plural || storeyNames.has(label)) && (plural || !faceNames.has(label) || storeyNames.has(label)))?.label;
      if (storey) {
        storeys.set(geometry.pageNo, storey);
        break;
      }
    }
  }
  return storeys;
}

/** The storeys a document's plan sheets name, in their own words - the
 * vocabulary that tells GROUND FLOOR ELEVATION, a sheet's title, from NORTH
 * ELEVATION, a drawing's. */
export function documentPlanStoreys(planPages: SheetPage[], recoveredTitles: Map<number, string> = new Map()): Set<string> {
  const storeys = new Set<string>();
  for (const { page, geometry } of planPages) {
    const band = page.words.filter((word) => word.top >= geometry.heightPt * 0.85).map((word) => word.text).join(" ");
    const storey = printedStorey(recoveredTitles.get(geometry.pageNo) ?? "") ?? printedStorey(band);
    if (storey) storeys.add(storey);
  }
  return storeys;
}
