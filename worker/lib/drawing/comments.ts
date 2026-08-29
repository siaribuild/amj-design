import type { OpeningOperation } from "./contract";

export interface ParsedCompositionComment {
  count?: number;
  unitWidthMm?: number;
  operation?: OpeningOperation;
  direction?: "rtl" | "ltr";
  sidelight?: boolean;
}

const operationOf = (text: string): OpeningOperation | undefined => {
  if (/AWNING/i.test(text)) return "awning";
  if (/CASEMENT/i.test(text)) return "casement";
  if (/SLID/i.test(text)) return "sliding";
  if (/LOUVRE/i.test(text)) return "louvre";
  if (/HING|DOOR/i.test(text)) return "hinged";
  if (/FIXED/i.test(text)) return "fixed";
  return undefined;
};

export function parseCompositionComment(text: string | null | undefined): ParsedCompositionComment | null {
  const value = text?.trim();
  if (!value) return null;
  const result: ParsedCompositionComment = {};
  const counted = /\b(\d+)\s*[x×]\s*(\d{2,4})\s*mm\b/i.exec(value);
  if (counted) {
    result.count = Number(counted[1]);
    result.unitWidthMm = Number(counted[2]);
  }
  const doorWidth = /\b(\d{2,4})\s*(?:mm\s*)?DOOR\b/i.exec(value);
  if (!result.unitWidthMm && doorWidth) result.unitWidthMm = Number(doorWidth[1]);
  const operation = operationOf(value);
  if (operation) result.operation = operation;
  if (/RIGHT\s+TO\s+LEFT|\bRTL\b/i.test(value)) result.direction = "rtl";
  else if (/LEFT\s+TO\s+RIGHT|\bLTR\b/i.test(value)) result.direction = "ltr";
  if (/SIDELIGHT/i.test(value)) result.sidelight = true;
  if (!Object.keys(result).length) return null;
  return result;
}
