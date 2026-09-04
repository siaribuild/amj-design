import type { PageWord } from "./contract";
import type { ElevationBox } from "./skills";

export type ElevationRegion = {
  label: string;
  /** [x0, y0, x1, y1] in original PDF points. */
  region: [number, number, number, number];
};

type LabelPoint = { label: string; x: number; y: number };

// Floor-plan placement currently joins elevations by printed A-D markers.
// Named facades must not create region keys that no placement can consume.
const IDENTIFIER = /^[A-D]$/i;

export function sameLine(a: PageWord, b: PageWord): boolean {
  const ah = Math.max(a.bottom - a.top, 1);
  const bh = Math.max(b.bottom - b.top, 1);
  return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= Math.max(ah, bh) * 1.5;
}

export function horizontalGap(a: PageWord, b: PageWord): number {
  if (a.x1 < b.x0) return b.x0 - a.x1;
  if (b.x1 < a.x0) return a.x0 - b.x1;
  return 0;
}

/** Locate only explicit elevation titles. No labels means no regions: page
 * draw order is not evidence and must never silently become A/B/C/D. */
export function elevationRegions(words: PageWord[], widthPt: number, heightPt: number): ElevationRegion[] {
  const ordered = [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const labels: LabelPoint[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const word = ordered[i];
    const text = word.text.trim().replace(/[:\-]$/, "").toUpperCase();
    if (!/^ELEVATIONS?$/.test(text)) continue;
    // Poppler orders words by the PDF content stream, not necessarily visual
    // adjacency. REF contains scale/title tokens between the two printed title
    // words, so searching only i±1 loses one elevation on each shared sheet.
    const titleHeight = Math.max(word.bottom - word.top, 1);
    const identifier = ordered
      .filter((candidate) =>
        candidate !== word
        && sameLine(word, candidate)
        && IDENTIFIER.test(candidate.text.trim().replace(/[:\-]/g, ""))
        && horizontalGap(word, candidate) <= titleHeight * 12)
      .sort((a, b) => horizontalGap(word, a) - horizontalGap(word, b))[0];
    if (!identifier) continue;
    const label = identifier.text.trim().replace(/[:\-]/g, "").toUpperCase();
    if (labels.some((item) => item.label === label)) continue;
    labels.push({ label, x: (identifier.x0 + identifier.x1) / 2, y: (identifier.top + identifier.bottom) / 2 });
  }
  return tileRegions(labels, widthPt, heightPt);
}

const VIEW_TITLE = /^(?:ELEVATIONS?|SECTIONS?|PLANS?)$/;
const TITLE_QUALIFIER = /^[A-Z][A-Z'-]*$/;
const TITLE_IDENTIFIER = /^[A-Z]$/;
const MAX_TITLE_QUALIFIERS = 2;

/** Drawing titles as the document writes them — `ELEVATION A`, `NORTH
 * ELEVATION`, `GROUND FLOOR PLAN`. Unlike elevationRegions, the label is not
 * held to a vocabulary the placement path can consume: these regions exist to
 * bind evidence printed beside a view (a scale) to that view, and a sheet that
 * names its faces must not lose that binding. */
export function drawingViewRegions(words: PageWord[], widthPt: number, heightPt: number): ElevationRegion[] {
  const ordered = [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const clean = (word: PageWord): string => word.text.trim().replace(/[:\-]$/, "").toUpperCase();
  const labels: LabelPoint[] = [];
  for (const word of ordered) {
    if (!VIEW_TITLE.test(clean(word))) continue;
    const onLine = ordered.filter((candidate) => sameLine(word, candidate)).sort((a, b) => a.x0 - b.x0);
    const index = onLine.indexOf(word);
    const near = (a: PageWord, b: PageWord): boolean =>
      horizontalGap(a, b) <= Math.max(a.bottom - a.top, b.bottom - b.top, 1) * 2;
    const parts = [word];
    for (let at = index - 1; at >= 0 && parts.length <= MAX_TITLE_QUALIFIERS; at--) {
      if (!TITLE_QUALIFIER.test(clean(onLine[at])) || !near(onLine[at], parts[0])) break;
      parts.unshift(onLine[at]);
    }
    // Only a single-letter identifier may follow the title. Anything wider
    // swallows the neighbouring SCALE or sheet number into the view's name.
    if (index + 1 < onLine.length && TITLE_IDENTIFIER.test(clean(onLine[index + 1]))
      && near(parts[parts.length - 1], onLine[index + 1])) parts.push(onLine[index + 1]);
    const label = parts.map(clean).join(" ");
    if (labels.some((item) => item.label === label)) continue;
    labels.push({
      label,
      x: (Math.min(...parts.map((part) => part.x0)) + Math.max(...parts.map((part) => part.x1))) / 2,
      y: (Math.min(...parts.map((part) => part.top)) + Math.max(...parts.map((part) => part.bottom))) / 2,
    });
  }
  return tileRegions(labels, widthPt, heightPt);
}

function tileRegions(labels: LabelPoint[], widthPt: number, heightPt: number): ElevationRegion[] {
  if (!labels.length) return [];
  if (labels.length === 1) return [{ label: labels[0].label, region: [0, 0, widthPt, heightPt] }];

  const xs = labels.map((label) => label.x);
  const ys = labels.map((label) => label.y);
  const sideBySide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const sorted = [...labels].sort((a, b) => sideBySide ? a.x - b.x : a.y - b.y);
  return sorted.map((label, index) => {
    // Side-by-side drawings meet halfway between titles. Stacked elevation
    // titles are printed below their drawings: each region reaches from the
    // preceding title boundary down to its own title, never to the midpoint.
    const before = index === 0 ? 0 : sideBySide
      ? (sorted[index - 1].x + label.x) / 2
      : sorted[index - 1].y;
    const after = sideBySide
      ? (index === sorted.length - 1 ? widthPt : (label.x + sorted[index + 1].x) / 2)
      : label.y;
    return {
      label: label.label,
      region: sideBySide ? [before, 0, after, heightPt] : [0, before, widthPt, after],
    };
  });
}

/** Classify by page-space centre, then re-base each box to its elevation
 * region. Assignment restores page coordinates using the region origin. */
export function boxesByRegion(
  boxes: ElevationBox[],
  regions: ElevationRegion[],
  widthPt: number,
  heightPt: number,
): Record<string, ElevationBox[]> {
  const grouped: Record<string, ElevationBox[]> = Object.fromEntries(regions.map((region) => [region.label, []]));
  for (const box of boxes) {
    const x = ((box.box[0] + box.box[2]) / 2) * widthPt;
    const y = ((box.box[1] + box.box[3]) / 2) * heightPt;
    const region = regions.find(({ region: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
    if (region) {
      const [rx0, ry0, rx1, ry1] = region.region;
      const regionWidth = rx1 - rx0;
      const regionHeight = ry1 - ry0;
      const [bx0, by0, bx1, by1] = box.box;
      grouped[region.label].push({
        ...box,
        box: [
          (bx0 * widthPt - rx0) / regionWidth,
          (by0 * heightPt - ry0) / regionHeight,
          (bx1 * widthPt - rx0) / regionWidth,
          (by1 * heightPt - ry0) / regionHeight,
        ],
      });
    }
  }
  return grouped;
}
