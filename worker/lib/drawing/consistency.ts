import type { CropBoxPt, DrawingFlag } from "./contract";

interface ComparableReading {
  frameBoxPt?: CropBoxPt;
  proposal: {
    frameBoxPt?: CropBoxPt;
    flags: DrawingFlag[];
    confidence: "high" | "low";
    elevation?: string | null;
    storey?: string | null;
    evidenceView?: "elevation" | "detail";
    faceOpeningCount?: number | null;
    wallOrder?: number | null;
  };
  row: { widthMm: number };
  render: { pageNo: number };
}

const frameBox = (reading: ComparableReading): CropBoxPt =>
  reading.frameBoxPt ?? reading.proposal.frameBoxPt!;

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

export function applyDrawingConsistencyFlags(
  readings: ComparableReading[],
  { coverageComplete = true }: { coverageComplete?: boolean } = {},
): void {
  for (let left = 0; left < readings.length; left++) {
    for (let right = left + 1; right < readings.length; right++) {
      const a = readings[left], b = readings[right];
      const sameScale = a.render.pageNo === b.render.pageNo
        && a.proposal.evidenceView === b.proposal.evidenceView
        && a.proposal.elevation === b.proposal.elevation
        && a.proposal.storey === b.proposal.storey;
      if (sameScale && iou(frameBox(a), frameBox(b)) > 0.85) {
        flag([a, b], "duplicateFrame");
      }
      if (!sameScale) continue;
      const scheduleOrder = a.row.widthMm - b.row.widthMm;
      const boxA = frameBox(a), boxB = frameBox(b);
      const frameWidthA = boxA[2] - boxA[0];
      const frameWidthB = boxB[2] - boxB[0];
      const frameOrder = frameWidthA - frameWidthB;
      const scheduleDistinct = Math.abs(scheduleOrder) / Math.max(a.row.widthMm, b.row.widthMm) > 0.05;
      const framesDistinct = Math.abs(frameOrder) / Math.max(frameWidthA, frameWidthB) > 0.05;
      if (scheduleDistinct && framesDistinct && scheduleOrder * frameOrder < 0) {
        flag([a, b], "drawingInconsistency");
      }
    }
  }
  const faces = new Map<string, ComparableReading[]>();
  for (const reading of readings) {
    if (!reading.proposal.elevation || !reading.proposal.storey) continue;
    const key = JSON.stringify([reading.proposal.elevation, reading.proposal.storey]);
    const face = faces.get(key) ?? [];
    face.push(reading);
    faces.set(key, face);
  }
  for (const face of faces.values()) {
    const counts = face.flatMap((reading) => reading.proposal.faceOpeningCount ?? []);
    if (new Set(counts).size > 1
      || counts.some((count) => count < face.length)
      || (coverageComplete && counts.some((count) => count > face.length))
    ) {
      flag(face, "drawingInconsistency");
    }
    const ordered = face.filter((reading) => reading.proposal.wallOrder != null);
    if (new Set(ordered.map((reading) => reading.proposal.wallOrder)).size !== ordered.length) {
      flag(ordered, "drawingInconsistency");
    }
  }
}
