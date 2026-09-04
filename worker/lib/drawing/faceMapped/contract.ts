/** Face-mapped engine phase types and pure geometry shared across its phases. */

/** Points a scheduled width occupies on a page printed at 1:`scaleRatio`. */
export function expectedWidthPt(widthMm: number, scaleRatio: number): number {
  return widthMm / (scaleRatio * 25.4 / 72);
}
