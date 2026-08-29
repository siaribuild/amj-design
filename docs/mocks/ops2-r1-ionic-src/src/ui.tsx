// Two small primitives that carry functional rules rather than styling.
import { RECORD } from "./data";

/** RULE A3, as amended by the owner's review.
 *
 *  The rule exists so nobody misreads a number. Printing "ex GST" against
 *  eighteen line prices does not serve it — it is how a caption becomes
 *  invisible, which defeats the rule rather than enforcing it. His words:
 *  "it's everywhere and polluting rather than providing value."
 *
 *  So the basis is stated ONCE PER PLACE IT GOVERNS, prominently, and never
 *  repeated inside a list:
 *    • under the project total in the top-right of the header, which is on
 *      screen at all times;
 *    • under the totals panel at the foot of the list, where the money is read.
 *  A reader can answer "ex or inc?" without hunting, and is not told eighteen
 *  times. Rows pass `basis={false}`.
 *
 *  RULE A1 is unchanged: absence is a fact and reads as one, at the same size as
 *  a figure and at the legibility floor. An operator who can see that something
 *  is unavailable but cannot read why has been told nothing. */
export function Money({ cents, absent, basis = false, size = "md" }: {
  cents: number | null;
  /** Why there is no figure. Shown in place of the amount, never a bare dash. */
  absent?: string;
  /** Show the GST basis under the figure. True only where the basis GOVERNS. */
  basis?: boolean;
  size?: "md" | "lg";
}) {
  const cls = `money money-${size}` + (cents === null ? " absent" : "");
  if (cents === null) {
    return <span className={cls}><span className="amt">{absent ?? "not priced"}</span></span>;
  }
  return (
    <span className={cls}>
      <span className="amt">
        ${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {basis && <span className="basis">{RECORD.gstMode}</span>}
    </span>
  );
}

export const mm = (v: number) => v.toLocaleString("en-AU");
