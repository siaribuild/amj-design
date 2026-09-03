import type { CropBoxPt, DrawingFlag } from "./contract";

interface ComparableReading {
  frameBoxPt?: CropBoxPt;
  proposal: {
    frameBoxPt?: CropBoxPt;
    flags: DrawingFlag[];
    confidence: "high" | "low";
    elevation?: string | null;
    storey?: string | null;
    facePageNo?: number | null;
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
  }
};

export function drawingFaceKey(
  value: Pick<ComparableReading["proposal"], "facePageNo" | "elevation" | "storey">,
): string | null {
  return value.facePageNo != null && value.elevation && value.storey
    ? JSON.stringify([value.facePageNo, value.elevation, value.storey])
    : null;
}

export function applyDrawingConsistencyFlags(
  readings: ComparableReading[],
  {
    incompleteFaces = new Set<string>(),
    unknownCoverage = false,
  }: { incompleteFaces?: ReadonlySet<string>; unknownCoverage?: boolean } = {},
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
    }
  }
  const faces = new Map<string, ComparableReading[]>();
  for (const reading of readings) {
    const key = drawingFaceKey(reading.proposal);
    if (!key) continue;
    const face = faces.get(key) ?? [];
    face.push(reading);
    faces.set(key, face);
  }
  for (const [key, face] of faces) {
    const counts = face.flatMap((reading) => reading.proposal.faceOpeningCount ?? []);
    if (new Set(counts).size > 1
      || counts.some((count) => count < face.length)
      || (!unknownCoverage && !incompleteFaces.has(key) && counts.some((count) => count > face.length))
    ) {
      flag(face, "drawingInconsistency");
    }
    const ordered = face.filter((reading) => reading.proposal.wallOrder != null);
    if (new Set(ordered.map((reading) => reading.proposal.wallOrder)).size !== ordered.length) {
      flag(ordered, "drawingInconsistency");
    }
    const elevationOrder = ordered
      .filter((reading) => reading.proposal.evidenceView === "elevation")
      .sort((a, b) => a.proposal.wallOrder! - b.proposal.wallOrder!);
    if (elevationOrder.length > 2) {
      const directions = new Set<number>();
      for (let index = 1; index < elevationOrder.length; index++) {
        const previous = frameBox(elevationOrder[index - 1]);
        const current = frameBox(elevationOrder[index]);
        const delta = (current[0] + current[2]) - (previous[0] + previous[2]);
        const tolerance = Math.min(previous[2] - previous[0], current[2] - current[0]) * 0.2;
        if (Math.abs(delta) > tolerance) directions.add(Math.sign(delta));
      }
      if (directions.size > 1) flag(elevationOrder, "drawingInconsistency");
    }
  }
}
