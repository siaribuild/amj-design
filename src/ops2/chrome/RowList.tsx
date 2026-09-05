import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

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
 * ── IT IS A PLAIN BUTTON (OR ANCHOR), NOT AN `IonItem` (ADR 0014) ───────────
 * `IonItem` satisfies the rule above only by suppressing its own hover overlay
 * and repainting through `::part(native)` — which IS the queue's arrangement
 * today, and the arrangement that failed to travel. On a plain button there is
 * one element and the rule is true by construction. The cost is named rather
 * than hidden: the queue's card loses Ionic's ripple, kept as touch feedback by
 * one `:active` declaration in `rows.css`.
 *
 * A row that NAVIGATES renders an `<a>` in that same one element's place,
 * carrying the same class (see `href`) — so the invariant is untouched and the
 * browser keeps the affordances a button silently drops.
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
 * `onActivate`, `href`, `pressTestId` and the rest-spread are plumbing, not
 * grammar. `pressTestId` lands on the PRESSABLE deliberately —
 * `ops2-drawing-viewer.spec.ts` asserts a unit row contains no other control and
 * has the opener's accessible name, and neither holds on the `<li>`.
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

/**
 * Was this an ordinary left click, or an instruction to the browser?
 *
 * Ctrl/Cmd/Shift/Alt-click and middle-click mean "open it somewhere else", and
 * an anchor already knows how. Swallowing them takes away the very affordance
 * the anchor exists for — two things open side by side at a desk — while
 * leaving it looking present.
 *
 * Lives here rather than in `../projects/rows.tsx`, where it was written: the
 * row IS the thing that navigates, so the rule about how a navigation is
 * clicked belongs beside it. The desk table imports it back.
 */
export const isPlainClick = (event: ReactMouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export function Row({
  edge, selected, onActivate, href, pressTestId, children, ...rest
}: {
  /** What the leading edge paints, or nothing. WHICH FACT it means stays the
   *  caller's: the queue maps `waitingOn`, the record maps `needsReview`, the
   *  unit list passes nothing. The row draws a mark; it does not know why. */
  edge?: "warning" | "info" | null;
  /** The row the desk rail's canvas is showing. */
  selected?: boolean;
  onActivate: () => void;
  /**
   * Where this row leads, if it leads anywhere — a BROWSER href, i.e. already
   * through `browserHref()`. Present → the pressable is an `<a>` and the
   * browser keeps what an anchor is for: middle-click, Ctrl/Cmd-click, "copy
   * link address", and the link role. The plain click is still the router's
   * (`onActivate`), so navigating inside the SPA does not reload the shell.
   *
   * THE CALLER BASES IT, not this file: `../shellBase` reads
   * `window.location` at module scope, and this module is imported by node
   * suites (`ops2-record.test.mjs` bundles `LineReview` and runs it outside a
   * browser). One import here turned that whole suite into
   * `ReferenceError: window is not defined`.
   *
   * NOT a third grammar prop in the sense this file warns about: it does not
   * change what a row MEANS or how it is drawn — the anchor carries the same
   * `.ops2-row__open` class, so the leading edge, the selection tint and the
   * hover wash are still computed on one element. It says whether the row has
   * a destination a browser can be handed.
   */
  href?: string;
  /** Lands on the pressable, not the row — existing suites press it by name. */
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
      {href ? (
        <a
          className="ops2-row__open"
          href={href}
          data-testid={pressTestId}
          onClick={(event) => {
            if (!isPlainClick(event)) return; // the browser's; it already knows
            event.preventDefault();
            onActivate();
          }}
        >
          {children}
        </a>
      ) : (
        <button
          type="button"
          className="ops2-row__open"
          data-testid={pressTestId}
          onClick={onActivate}
        >
          {children}
        </button>
      )}
    </li>
  );
}
