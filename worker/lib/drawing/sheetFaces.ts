import type { CropBoxPt, PageInventory, PageText, PageWord } from "./contract";

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
// cut-through be inventoried as though it were the wall.
const VIEW_TITLE = /^ELEVATIONS?$/;
const FACE_NAME = /^[A-Z][A-Z0-9-]{0,11}$/;

/** Every face title printed in a set, with where it is printed. */
function faceTitles(pages: SheetPage[]): { label: string; pageNo: number; x: number; y: number }[] {
  const found: { label: string; pageNo: number; x: number; y: number }[] = [];
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
          return { parts: step < 0 ? parts.reverse() : parts, words };
        };
        for (const { parts, words } of [run(-1), run(1)]) {
          if (!parts.length) continue;
          const label = parts.join(" ");
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
          });
        }
      });
    }
  }
  return found;
}

/** Face name to the sheets that draw it, in page order. */
export function documentFaceSheets(pages: SheetPage[]): Map<string, number[]> {
  const sheets = new Map<string, number[]>();
  for (const { label, pageNo } of faceTitles(pages)) {
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
export function documentFaceRegions(pages: SheetPage[]): Map<string, { pageNo: number; regionPt: CropBoxPt }> {
  const regions = new Map<string, { pageNo: number; regionPt: CropBoxPt }>();
  for (const { geometry } of pages) {
    const onSheet = faceTitles(pages).filter((title) => title.pageNo === geometry.pageNo);
    if (!onSheet.length) continue;
    if (onSheet.length === 1) {
      regions.set(onSheet[0].label, { pageNo: geometry.pageNo, regionPt: [0, 0, geometry.widthPt, geometry.heightPt] });
      continue;
    }
    const xs = onSheet.map((title) => title.x);
    const ys = onSheet.map((title) => title.y);
    const sideBySide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const sorted = [...onSheet].sort((a, b) => sideBySide ? a.x - b.x : a.y - b.y);
    sorted.forEach((title, at) => {
      const before = at === 0 ? 0 : sideBySide ? (sorted[at - 1].x + title.x) / 2 : sorted[at - 1].y;
      const after = sideBySide
        ? (at === sorted.length - 1 ? geometry.widthPt : (title.x + sorted[at + 1].x) / 2)
        : title.y;
      regions.set(title.label, {
        pageNo: geometry.pageNo,
        regionPt: sideBySide
          ? [before, 0, after, geometry.heightPt]
          : [0, before, geometry.widthPt, after],
      });
    });
  }
  return regions;
}
