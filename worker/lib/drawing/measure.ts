import type { DarknessProfile, OpeningOperation, SplitAxis, SplitReading, SplitUnit } from "./contract";

export interface MeasuredSplit {
  ratios: number[];
  axis: SplitAxis;
  derivedWidthsMm: number[];
}

const round5 = (value: number) => Math.round(value / 5) * 5;

function normalise(values: number[]): number[] | null {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= 0) return null;
  return values.map((value) => value / sum);
}

function ratiosFromPeaks(peaks: number[]): number[] | null {
  const sorted = [...new Set(peaks.filter((peak) => peak > 0.04 && peak < 0.96))].sort((a, b) => a - b);
  const boundaries = [0, ...sorted, 1];
  return normalise(boundaries.slice(1).map((boundary, index) => boundary - boundaries[index]));
}

export function measureSplit(
  profile: DarknessProfile | undefined,
  overviewProportions: number[] | undefined,
  scheduleWidthMm: number,
): MeasuredSplit | null {
  const mullions = ratiosFromPeaks(profile?.mullionXs ?? []);
  const transoms = ratiosFromPeaks(profile?.transomYs ?? []);
  // A grid needs two-dimensional cells, not a flattened guess. Leave it
  // unread until the contract explicitly supports grid coordinates.
  if (mullions && mullions.length > 1 && transoms && transoms.length > 1) return null;
  const ratios = (mullions && mullions.length > 1 ? mullions : null)
    ?? (transoms && transoms.length > 1 ? transoms : null)
    ?? normalise(overviewProportions ?? [1]);
  if (!ratios) return null;
  const axis: SplitAxis = transoms && transoms.length > 1 ? "horizontal" : "vertical";
  return { ratios, axis, derivedWidthsMm: ratios.map((ratio) => round5(ratio * scheduleWidthMm)) };
}

const passive = new Set<OpeningOperation>(["fixed", "sidelight"]);

export function composeMeasuredSplit(operations: OpeningOperation[], measured: MeasuredSplit): SplitReading | null {
  if (operations.length !== measured.ratios.length) return null;
  const units: SplitUnit[] = operations.map((operation, index) => ({
    role: passive.has(operation) ? "passive" : "operable",
    operation,
    ratio: measured.ratios[index],
    derivedWidthMm: measured.derivedWidthsMm[index],
  }));
  return { units, axis: measured.axis };
}
