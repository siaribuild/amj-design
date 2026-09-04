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

/** A view region plus the centre of the title that names it, so evidence can
 * be bound to the title it sits under rather than to the band it lands in. */
export type DrawingViewRegion = ElevationRegion & { titlePt: [number, number] };

const VIEW_TITLE = /^(?:ELEVATIONS?|SECTIONS?|PLANS?)$/;
const TITLE_QUALIFIER = /^[A-Z][A-Z'-]*$/;
const TITLE_IDENTIFIER = /^[A-Z0-9](?:-[A-Z0-9])?$/;
const MAX_TITLE_QUALIFIERS = 2;
/** `SEE SECTION A-A` points at a drawing; it is not one. A cross-reference
 * accepted as a title invents a view and mis-tiles the sheet around it. */
const CROSS_REFERENCE = /^(?:SEE|REFER|REFERENCE|PER|NOTE|NOTES|TYPICAL|TYP|SIMILAR|SIM)$/;
const REFERENCE_REACH = 6;

/** Drawing titles as the document writes them — `ELEVATION A`, `NORTH
 * ELEVATION`, `GROUND FLOOR PLAN`. Unlike elevationRegions, the label is not
 * held to a vocabulary the placement path can consume: these regions exist to
 * bind evidence printed beside a view (a scale) to that view, and a sheet that
 * names its faces must not lose that binding. */
export function drawingViewRegions(words: PageWord[], widthPt: number, heightPt: number): DrawingViewRegion[] {
  const ordered = [...words].sort((a, b) => a.top - b.top || a.x0 - b.x0);
  const clean = (word: PageWord): string => word.text.trim().replace(/[:\-]$/, "").toUpperCase();
  const labels: LabelPoint[] = [];
  for (const word of ordered) {
    if (!VIEW_TITLE.test(clean(word))) continue;
    const onLine = ordered.filter((candidate) => sameLine(word, candidate)).sort((a, b) => a.x0 - b.x0);
    const index = onLine.indexOf(word);
    const near = (a: PageWord, b: PageWord): boolean =>
      horizontalGap(a, b) <= Math.max(a.bottom - a.top, b.bottom - b.top, 1) * 2;
    const height = Math.max(word.bottom - word.top, 1);
    if (onLine.some((candidate) => candidate.x1 <= word.x0
      && word.x0 - candidate.x1 <= height * REFERENCE_REACH
      && CROSS_REFERENCE.test(clean(candidate)))) continue;
    const parts = [word];
    for (let at = index - 1; at >= 0 && parts.length <= MAX_TITLE_QUALIFIERS; at--) {
      if (!TITLE_QUALIFIER.test(clean(onLine[at])) || !near(onLine[at], parts[0])) break;
      parts.unshift(onLine[at]);
    }
    // Only a short identifier may follow the title — `A`, `2`, `A-A`. Anything
    // wider swallows the neighbouring SCALE or sheet number into the view's name.
    if (index + 1 < onLine.length && TITLE_IDENTIFIER.test(clean(onLine[index + 1]))
      && near(parts[parts.length - 1], onLine[index + 1])) parts.push(onLine[index + 1]);
    const printed = parts.map(clean).join(" ");
    // Two views can carry the same printed title. They are still two drawings,
    // so keep both anchors and make the key unique rather than dropping one.
    const seen = labels.filter((item) => item.label === printed || item.label.startsWith(printed + " #")).length;
    labels.push({
      label: seen ? `${printed} #${seen + 1}` : printed,
      x: (Math.min(...parts.map((part) => part.x0)) + Math.max(...parts.map((part) => part.x1))) / 2,
      y: (Math.min(...parts.map((part) => part.top)) + Math.max(...parts.map((part) => part.bottom))) / 2,
    });
  }
  const withTitle = (region: ElevationRegion, point: [number, number]): DrawingViewRegion =>
    ({ ...region, titlePt: point });
  const columnTolerance = widthPt * CLUSTER_FRACTION;
  const rowTolerance = heightPt * CLUSTER_FRACTION;
  const columns = cluster(labels.map((label) => label.x), columnTolerance);
  const rows = cluster(labels.map((label) => label.y), rowTolerance);
  // A grid is titles sharing columns AND sharing rows. Two titles at different
  // heights are a stagger: treating that as a grid hands the lower view a thin
  // band between the two baselines, cutting off the drawing above its title.
  const shared = (values: number[], centres: number[], tolerance: number): boolean =>
    centres.some((centre) => values.filter((value) => Math.abs(value - centre) <= tolerance).length > 1);
  if (columns.length > 1 && rows.length > 1
    && shared(labels.map((label) => label.x), columns, columnTolerance)
    && shared(labels.map((label) => label.y), rows, rowTolerance)) {
    return labels.map((label) => {
      const [x0, x1] = span(columns, label.x, widthPt, true);
      const [y0, y1] = span(rows, label.y, heightPt, false);
      return withTitle({ label: label.label, region: [x0, y0, x1, y1] }, [label.x, label.y]);
    });
  }
  const titles = new Map(labels.map((label) => [label.label, [label.x, label.y] as [number, number]]));
  return tileRegions(labels, widthPt, heightPt)
    .map((region) => withTitle(region, titles.get(region.label) ?? [
      (region.region[0] + region.region[2]) / 2, (region.region[1] + region.region[3]) / 2,
    ]));
}

const CLUSTER_FRACTION = 0.05;

/** Anchor coordinates that sit within `tolerance` of each other are one row or
 * one column of the sheet; the cluster's mean stands for it. */
function cluster(values: number[], tolerance: number): number[] {
  const groups: number[][] = [];
  for (const value of [...values].sort((a, b) => a - b)) {
    const last = groups[groups.length - 1];
    if (last && value - last[last.length - 1] <= tolerance) last.push(value);
    else groups.push([value]);
  }
  return groups.map((group) => group.reduce((sum, value) => sum + value, 0) / group.length);
}

/** One cell's extent along an axis. Columns meet halfway between titles, as
 * side-by-side drawings do; rows end at their own title line, because a title
 * is printed under its drawing — the same two conventions tileRegions uses. */
function span(centres: number[], value: number, limit: number, halfway: boolean): [number, number] {
  const at = centres.reduce((best, centre, index) =>
    Math.abs(centre - value) < Math.abs(centres[best] - value) ? index : best, 0);
  return [
    at === 0 ? 0 : halfway ? (centres[at - 1] + centres[at]) / 2 : centres[at - 1],
    at === centres.length - 1 && halfway ? limit
      : halfway ? (centres[at] + centres[at + 1]) / 2 : centres[at],
  ];
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
