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

function sameLine(a: PageWord, b: PageWord): boolean {
  const ah = Math.max(a.bottom - a.top, 1);
  const bh = Math.max(b.bottom - b.top, 1);
  return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= Math.max(ah, bh);
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
    const candidates = [ordered[i + 1], ordered[i - 1]].filter((candidate): candidate is PageWord => !!candidate && sameLine(word, candidate));
    const identifier = candidates.find((candidate) => IDENTIFIER.test(candidate.text.trim().replace(/[:\-]/g, "")));
    if (!identifier) continue;
    const label = identifier.text.trim().replace(/[:\-]/g, "").toUpperCase();
    if (labels.some((item) => item.label === label)) continue;
    labels.push({ label, x: (identifier.x0 + identifier.x1) / 2, y: (identifier.top + identifier.bottom) / 2 });
  }
  if (!labels.length) return [];
  if (labels.length === 1) return [{ label: labels[0].label, region: [0, 0, widthPt, heightPt] }];

  const xs = labels.map((label) => label.x);
  const ys = labels.map((label) => label.y);
  const verticalSplit = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const sorted = [...labels].sort((a, b) => verticalSplit ? a.x - b.x : a.y - b.y);
  return sorted.map((label, index) => {
    const before = index === 0 ? 0 : verticalSplit
      ? (sorted[index - 1].x + label.x) / 2
      : (sorted[index - 1].y + label.y) / 2;
    const after = index === sorted.length - 1 ? (verticalSplit ? widthPt : heightPt) : verticalSplit
      ? (label.x + sorted[index + 1].x) / 2
      : (label.y + sorted[index + 1].y) / 2;
    return {
      label: label.label,
      region: verticalSplit ? [before, 0, after, heightPt] : [0, before, widthPt, after],
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
