// Shared arithmetic for the manufacturer's-price uplift path. Panel preview
// and Worker commit both call these so the two figures cannot diverge.
// See docs/runs/manufacturer-price-uplift/02-design.md.
import { GST_RATE, round2 } from "./gst";

export const DEFAULT_UPLIFT_PCT = 30;

export type EntryBasis = "ex" | "inc";

/** The basis converts FIRST (criterion 4): an inc-GST figure is divided by
 *  1.1 and rounded to cents before any uplift touches it. */
export const manufacturerExGst = (typed: number, basis: EntryBasis) =>
  basis === "inc" ? round2(typed / (1 + GST_RATE)) : round2(typed);

/** Then the uplift, rounded to cents. NO $10 rounding on this path: `round10`
 *  is the ENGINE's customer-facing grid and a human-entered price has never
 *  been on it (grill D2). `round10` is deliberately not imported here. */
export const upliftedLineTotal = (exPrice: number, upliftPct: number) =>
  round2(exPrice * (1 + upliftPct / 100));
