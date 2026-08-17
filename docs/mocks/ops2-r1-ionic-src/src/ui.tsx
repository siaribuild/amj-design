// Two small primitives that carry functional rules rather than styling.
import { RECORD } from "./data";

/** RULE A3 — every money figure carries its GST basis, on the figure, in the
 *  account's ex/inc setting, at a legible size. Not a column heading, not a
 *  footnote. There is exactly one component that renders money in ops2 so the
 *  basis cannot be forgotten at one call site.
 *
 *  RULE A1 — absence is a fact and reads as one. "not priced" is set at the same
 *  size as a figure and at the legibility floor, because an operator who can see
 *  that something is unavailable but not read why has been told nothing. */
export function Money({ cents, absent, inline }: {
  cents: number | null;
  /** Why there is no figure. Shown in place of the amount, never instead of a
   *  reason. */
  absent?: string;
  inline?: boolean;
}) {
  const cls = "money" + (inline ? " money-inline" : "") + (cents === null ? " absent" : "");
  if (cents === null) {
    return (
      <span className={cls}>
        <span className="amt">{absent ?? "not priced"}</span>
      </span>
    );
  }
  return (
    <span className={cls}>
      <span className="amt">
        ${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className="basis">{RECORD.gstMode}</span>
    </span>
  );
}

export const mm = (v: number) => v.toLocaleString("en-AU");
