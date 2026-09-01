import type { DrawingConfidence, DrawingFlag, OpeningOperation, SplitReading } from "./contract";
import { parseCompositionComment } from "./comments";
import { sizesFromRatios } from "../estimator/split";

const passive = new Set<OpeningOperation>(["fixed", "sidelight"]);

function operationFromSchedule(text: string | null | undefined): OpeningOperation | null {
  if (/AWNING/i.test(text ?? "")) return "awning";
  if (/CASEMENT/i.test(text ?? "")) return "casement";
  if (/SLID/i.test(text ?? "")) return "sliding";
  if (/LOUVRE/i.test(text ?? "")) return "louvre";
  if (/HING|DOOR/i.test(text ?? "")) return "hinged";
  if (/FIXED/i.test(text ?? "")) return "fixed";
  return null;
}

function withOperation(unit: SplitReading["units"][number], operation: OpeningOperation) {
  return { ...unit, operation, role: passive.has(operation) ? "passive" as const : "operable" as const };
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
  scheduleType: string | null;
  commentText?: string | null;
  modelConfidence: DrawingConfidence;
  northAssumed: boolean;
  visible?: boolean;
}): { composition: SplitReading; confidence: DrawingConfidence; flags: DrawingFlag[] } {
  const flags: DrawingFlag[] = [];
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
  const scheduleOperation = operationFromSchedule(args.scheduleType);
  if (scheduleOperation && !composition.units.some((unit) => unit.operation === scheduleOperation)) {
    flags.push("scheduleDrawingMismatch");
  }
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
