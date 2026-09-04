import type { PageInventory, PageText, PageWord } from "./contract";

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

/** Face name to the sheets that draw it, in page order. */
export function documentFaceSheets(pages: SheetPage[]): Map<string, number[]> {
  const sheets = new Map<string, number[]>();
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
        for (const neighbour of [ordered[at - 1], ordered[at + 1]]) {
          if (!neighbour) continue;
          const label = neighbour.text.trim().toUpperCase().replace(/[.,:]$/, "");
          if (!FACE_NAME.test(label) || VIEW_TITLE.test(label)) continue;
          const gap = neighbour.x0 > word.x1 ? neighbour.x0 - word.x1 : word.x0 - neighbour.x1;
          if (gap > Math.max(word.bottom - word.top, 1) * 2) continue;
          const seen = sheets.get(label) ?? [];
          if (!seen.includes(geometry.pageNo)) sheets.set(label, [...seen, geometry.pageNo]);
        }
      });
    }
  }
  return sheets;
}
