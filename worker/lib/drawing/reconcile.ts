import type { DrawingConfidence, DrawingFlag, OpeningOperation, SplitReading } from "./contract";
import { parseCompositionComment } from "./comments";
import { sizesFromRatios } from "../estimator/split";

const passive = new Set<OpeningOperation>(["fixed", "sidelight"]);

export function operationFromSchedule(text: string | null | undefined): OpeningOperation | null {
  if (/AWNING/i.test(text ?? "")) return "awning";
  if (/CASEMENT/i.test(text ?? "")) return "casement";
  if (/SLID/i.test(text ?? "")) return "sliding";
  if (/LOUVRE/i.test(text ?? "")) return "louvre";
  if (/HING|DOOR/i.test(text ?? "")) return "hinged";
  if (/FIXED/i.test(text ?? "")) return "fixed";
  return null;
}

export function scheduleDrawingMismatch(
  split: SplitReading,
  scheduleType: string | null | undefined,
): { drawing: string; schedule: string } | null {
  const scheduled = operationFromSchedule(scheduleType);
  const matches = scheduled === "awning" && split.units.length > 1
    ? split.units.some((unit) => unit.operation === "awning" || (!unit.operation && unit.role === "operable"))
      && split.units.some((unit) => unit.operation ? unit.operation !== "awning" : unit.role === "passive")
    : scheduled === "fixed"
    ? split.units.every((unit) => unit.operation ? passive.has(unit.operation) : unit.role === "passive")
    : split.units.some((unit) => unit.operation === scheduled || (!unit.operation && unit.role === "operable"));
  if (!scheduled || matches) return null;
  const operations = split.units.map((unit) => unit.operation).filter((operation): operation is OpeningOperation => !!operation);
  const drawn = operations.length
    ? operations.map((operation) => operation.toUpperCase()).join(" + ")
    : split.units.some((unit) => unit.role === "operable") ? "operating unit" : "passive unit";
  return { drawing: `drawing shows ${drawn}`, schedule: `schedule types ${scheduled.toUpperCase()}` };
}

function withOperation(unit: SplitReading["units"][number], operation: OpeningOperation) {
  return { ...unit, operation, role: passive.has(operation) ? "passive" as const : "operable" as const };
}

/** Printed component widths are facts. Keep the drawing's order/operations,
 * then let the final unstated components absorb the exact remainder. */
export function applyStatedWidths(
  split: SplitReading,
  widthMm: number,
  commentText?: string | null,
): SplitReading {
  const parsed = parseCompositionComment(commentText);
  if (!Number.isFinite(widthMm) || widthMm <= 0 || !parsed?.unitWidthMm || !parsed.operation || parsed.unitWidthMm >= widthMm) return split;
  const count = parsed.count ?? 1;
  const stated = split.units
    .map((unit, index) => ({ unit, index }))
    .filter(({ unit }) => unit.operation === parsed.operation)
    .slice(0, count)
    .map(({ index }) => index);
  if (stated.length !== count) return split;
  const remainderIndexes = split.units.map((_, index) => index).filter((index) => !stated.includes(index));
  const remainder = widthMm - parsed.unitWidthMm * stated.length;
  if (remainder <= 0 || !remainderIndexes.length) return split;
  const weightTotal = remainderIndexes.reduce((sum, index) => sum + Math.max(0, split.units[index].ratio), 0) || remainderIndexes.length;
  const remainderWidths = sizesFromRatios(
    remainderIndexes.map((index) => Math.max(0, split.units[index].ratio) / weightTotal || 1 / remainderIndexes.length),
    remainder,
    5,
  );
  const widths = split.units.map((_, index) => stated.includes(index) ? parsed.unitWidthMm : remainderWidths[remainderIndexes.indexOf(index)]);
  const sidelightIndex = parsed.sidelight && remainderIndexes.length === 1 ? remainderIndexes[0] : -1;
  return {
    ...split,
    units: split.units.map((unit, index) => ({
      ...(index === sidelightIndex ? withOperation(unit, "sidelight") : unit),
      ratio: widths[index] / widthMm,
      derivedWidthMm: widths[index],
    })),
  };
}

/** Honest fallback for an opening absent from every elevation: it uses only
 * schedule type/comments and is always reconciled as low-confidence. */
export function compositionFromSchedule(args: {
  widthMm: number;
  scheduleType: string | null;
  commentText?: string | null;
}): SplitReading | null {
  const parsed = parseCompositionComment(args.commentText);
  const operation = parsed?.operation ?? operationFromSchedule(args.scheduleType);
  if (!operation) return null;
  if (parsed?.sidelight) {
    const doorRatio = parsed.unitWidthMm && parsed.unitWidthMm < args.widthMm
      ? parsed.unitWidthMm / args.widthMm : 0.75;
    const widths = sizesFromRatios([doorRatio, 1 - doorRatio], args.widthMm, 5);
    return { axis: "vertical", units: [
      { role: "operable", operation: "hinged", ratio: doorRatio, derivedWidthMm: widths[0] },
      { role: "passive", operation: "sidelight", ratio: 1 - doorRatio, derivedWidthMm: widths[1] },
    ] };
  }
  const count = Math.max(1, parsed?.count ?? 1);
  if (parsed?.unitWidthMm && count === 2 && parsed.unitWidthMm * 2 < args.widthMm) {
    const sideRatio = parsed.unitWidthMm / args.widthMm;
    return { axis: "vertical", units: [
      { role: passive.has(operation) ? "passive" : "operable", operation, ratio: sideRatio, derivedWidthMm: parsed.unitWidthMm },
      { role: "passive", operation: "fixed", ratio: 1 - sideRatio * 2, derivedWidthMm: args.widthMm - parsed.unitWidthMm * 2 },
      { role: passive.has(operation) ? "passive" : "operable", operation, ratio: sideRatio, derivedWidthMm: parsed.unitWidthMm },
    ] };
  }
  const ratios = Array.from({ length: count }, () => 1 / count);
  const widths = sizesFromRatios(ratios, args.widthMm, 5);
  return { axis: "vertical", units: ratios.map((ratio, index) => ({
    role: passive.has(operation) ? "passive" as const : "operable" as const,
    operation, ratio, derivedWidthMm: widths[index],
  })) };
}

export function reconcileReading(args: {
  split: SplitReading;
  widthMm: number;
  scheduleType: string | null;
  commentText?: string | null;
  modelConfidence: DrawingConfidence;
  northAssumed: boolean;
  visible?: boolean;
}): { composition: SplitReading; confidence: DrawingConfidence; flags: DrawingFlag[] } {
  const flags: DrawingFlag[] = [];
  if (args.modelConfidence === "low") flags.push("agentEvidenceWeak");
  const parsed = parseCompositionComment(args.commentText);
  let composition: SplitReading = { ...args.split, units: args.split.units.map((unit) => ({ ...unit })) };
  if (parsed?.count != null && parsed.count !== composition.units.length) flags.push("scheduleDrawingMismatch");
  if (parsed?.operation) {
    const count = Math.min(parsed.count ?? 1, composition.units.length);
    const indexes = parsed.direction === "rtl"
      ? composition.units.map((_, index) => index).reverse().slice(0, count)
      : count === 2 && composition.units.length > 2
        ? [0, composition.units.length - 1]
        : composition.units.map((_, index) => index).slice(0, count);
    composition = {
      ...composition,
      units: composition.units.map((unit, index) =>
        indexes.includes(index) ? withOperation(unit, parsed.operation!) : withOperation(unit, "fixed")),
    };
  }
  composition = applyStatedWidths(composition, args.widthMm, args.commentText);
  if (scheduleDrawingMismatch(composition, args.scheduleType)) flags.push("scheduleDrawingMismatch");
  const operable = /AWNING|CASEMENT|SLID|LOUVRE|HINGED/i.test(args.scheduleType ?? "");
  if (operable && composition.units.some((unit) => unit.role === "operable" && (unit.derivedWidthMm ?? 0) > 1200)) {
    flags.push("manufacturability");
  }
  if (args.visible === false) flags.push("notVisibleOnElevations");
  if (args.northAssumed) flags.push("northAssumed");
  return {
    composition,
    confidence: args.modelConfidence === "low" || flags.length ? "low" : "high",
    flags: [...new Set(flags)],
  };
}
