import type { CropBoxPt, DrawingFlag } from "./contract";

interface ComparableReading {
  proposal: {
    frameBoxPt: CropBoxPt;
    evidenceView: "elevation" | "detail";
    elevation: string | null;
    storey: string | null;
    flags: DrawingFlag[];
    confidence: "high" | "low";
  };
  row: { widthMm: number };
  render: { pageNo: number };
}

const iou = (a: CropBoxPt, b: CropBoxPt): number => {
  const width = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const intersection = width * height;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return intersection / Math.max(1, areaA + areaB - intersection);
};

const flag = (items: ComparableReading[], value: DrawingFlag): void => {
  for (const item of items) {
    if (!item.proposal.flags.includes(value)) item.proposal.flags.push(value);
    item.proposal.confidence = "low";
  }
};

export function applyDrawingConsistencyFlags(readings: ComparableReading[]): void {
  for (let left = 0; left < readings.length; left++) {
    for (let right = left + 1; right < readings.length; right++) {
      const a = readings[left], b = readings[right];
      if (a.render.pageNo === b.render.pageNo && iou(a.proposal.frameBoxPt, b.proposal.frameBoxPt) > 0.85) {
        flag([a, b], "duplicateFrame");
      }
      if (
        a.proposal.evidenceView !== "elevation"
        || b.proposal.evidenceView !== "elevation"
        || a.render.pageNo !== b.render.pageNo
        || a.proposal.elevation !== b.proposal.elevation
        || a.proposal.storey !== b.proposal.storey
      ) continue;
      const scheduleRatio = a.row.widthMm / b.row.widthMm;
      const drawnRatio = (a.proposal.frameBoxPt[2] - a.proposal.frameBoxPt[0])
        / (b.proposal.frameBoxPt[2] - b.proposal.frameBoxPt[0]);
      if ((scheduleRatio > 1.25 && drawnRatio < 0.9) || (scheduleRatio < 0.8 && drawnRatio > 1.1)) {
        flag([a, b], "drawingInconsistency");
      }
    }
  }
}
