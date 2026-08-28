import type { ReactNode } from "react";

/**
 * THE ROW, AND THE LIST IT SITS IN — one of each, for every list in ops2.
 *
 * The owner's ask, verbatim: *"to me - the component is the same, the content
 * within it differ. I'd expect that other areas of Ops2 will have the same
 * component, as per my definition of 'component', used as well. Same logic for
 * displaying the list of components, not just individual ones."*
 *
 * It arrived as a question attached to a bug — *"onHover on project detail list
 * removed left highlighted border. Same issue existed in project list
 * previously - are we reusing components here at all???"* — and the answer was
 * no. Four row surfaces existed and shared nothing: the queue's phone card, the
 * queue's desk table, the record's line list and the line page's unit rows. The
 * queue hit the hover bug first, fixed it, and wrote down why
 * (`projects.css:376-384`); the record was written later and did not inherit the
 * fix, because there was nothing to inherit it through.
 *
 * ── THE STRUCTURAL RULE THIS FILE EXISTS FOR ────────────────────────────────
 *
 *   The leading edge, the selection tint and the hover wash are all computed on
 *   `.ops2-row__open`, and on nothing else.
 *
 * An inset `box-shadow` paints above its own element's background, so once every
 * state is on one element no state can erase another. The defect was the edge on
 * the `<li>` and the wash on the `<button>` filling it: a child's background over
 * a parent's inset shadow. Held as a convention it travelled to one surface and
 * not the next; held as a component it cannot fail to travel, which is the whole
 * of the owner's point.
 *
 * ── IT IS A PLAIN BUTTON, NOT AN `IonItem` (ADR 0014) ───────────────────────
 * `IonItem` satisfies the rule above only by suppressing its own hover overlay
 * and repainting through `::part(native)` — which IS the queue's arrangement
 * today, and the arrangement that failed to travel. On a plain button there is
 * one element and the rule is true by construction. The cost is named rather
 * than hidden: the queue's card loses Ionic's ripple, kept as touch feedback by
 * one `:active` declaration in `rows.css`.
 *
 * ── TWO GRAMMAR PROPS, AND WHY THERE ARE NOT THREE ──────────────────────────
 * `edge` and `selected` each name a real difference in what a row MEANS — what
 * its leading mark is a mark of, and whether a rail beside it is showing this
 * one. Neither is a styling switch. A third would be the first mode flag, and
 * at that point this stops being one component and becomes three wearing a
 * costume; if a surface needs one, reopen the decision rather than adding it.
 *
 * `chevron` WAS one and is gone: the queue passed it bare, always true, never
 * conditionally, which is a flag with a story attached. It renders the arrow as
 * its own child now, against the `.ops2-row__chev` class this file's stylesheet
 * still owns so the next navigating surface reuses it.
 *
 * `onActivate`, `pressTestId` and the rest-spread are plumbing, not grammar.
 * `pressTestId` lands on the BUTTON deliberately — `ops2-drawing-viewer.spec.ts`
 * asserts a unit row contains no other control and has the opener's accessible
 * name, and neither holds on the `<li>`.
 *
 * The desk `<table>` in `../projects/rows.tsx` is deliberately NOT built from
 * this. Column headers and row/column association are a different thing that a
 * card row cannot express.
 */

/** The list container. Card chrome is COMPOSED, not owned — the queue and the
 *  record pass `ds-surface-card`; the unit list passes nothing, because it
 *  already sits inside a panel and a card inside a card is a card too many. */
export function RowList({ className = "", testId, children }: {
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <ul className={`ops2-rows ${className}`.trim()} data-testid={testId}>
      {children}
    </ul>
  );
}

export function Row({
  edge, selected, onActivate, pressTestId, children, ...rest
}: {
  /** What the leading edge paints, or nothing. WHICH FACT it means stays the
   *  caller's: the queue maps `waitingOn`, the record maps `needsReview`, the
   *  unit list passes nothing. The row draws a mark; it does not know why. */
  edge?: "warning" | "info" | null;
  /** The row the desk rail's canvas is showing. */
  selected?: boolean;
  onActivate: () => void;
  /** Lands on the button, not the row — existing suites press it by name. */
  pressTestId?: string;
  children: ReactNode;
} & Record<string, unknown>) {
  return (
    <li
      className="ops2-row"
      data-edge={edge ?? undefined}
      data-selected={selected || undefined}
      // CURRENT, SAID RATHER THAN SHADED. A tint is the whole signal otherwise,
      // and a rail of eighteen rows where one is a few per cent lighter is not a
      // signal at all for a reader who cannot see it.
      aria-current={selected ? "true" : undefined}
      {...rest}
    >
      <button
        type="button"
        className="ops2-row__open"
        data-testid={pressTestId}
        onClick={onActivate}
      >
        {children}
      </button>
    </li>
  );
}
