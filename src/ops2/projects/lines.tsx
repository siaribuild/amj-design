import { Elevation } from "../../components/quote-project/Elevation";
import { Row, RowList } from "../chrome/RowList";
import {
  elevationPartsFor, joinedUnitCount, money, needsReview, sizeText,
  type RecordLine,
} from "./record";

/**
 * The opening list — the thing this console is being built to work down.
 *
 * ── THE DRAWING LEADS EVERY ROW ─────────────────────────────────────────────
 * `src/components/quote-project/Elevation.tsx` draws the opening to its real
 * arrangement: panel count, mullions and the opening symbol on the real hinge
 * edge, at `xs` and square so the column has an edge to scan down. It is the
 * element the owner rates highest in the product, and the first version of this
 * surface left it out on the reasoning that the customer's components were
 * unusable here — which was never checked file by file. `Elevation` imports one
 * module (`src/data/catalogue`), names no router and no theme sheet, and was
 * importable the whole time. ADR 0010 records it so it is not re-litigated.
 *
 * ── WHAT THE ROW SAYS, AND WHAT IT NO LONGER SAYS ───────────────────────────
 *   elevation · CODE · product · height × width mm · [N joined units]
 *                                        money at the end · [needs review]
 *
 * Gone, each for a stated reason:
 *  • THE CUSTOMER'S NOTE (`quote_line.room_label`). Plain TEXT, labelled "Note
 *    (optional)" to the customer who types it free-form, bounded at 500
 *    characters. Five hundred characters is a paragraph, not a room name —
 *    "Ensuite" is the lucky case, not the contract. It cannot be in a scannable
 *    row at any length. It is read on the line's own page, in their words.
 *  • THE QUANTITY. Retired: nothing creates a multi-quantity line any more. The
 *    unit count below is `qtyPerParent`, a different fact that is not retired.
 *  • EVERY PARSER REASON AS ITS OWN CHIP. "It pollutes the screen. Highlight is
 *    enough." One badge, and the reasons are read where the fix is.
 *
 * ── THE WHOLE ROW IS ONE TARGET ─────────────────────────────────────────────
 * One button filling the row, opening that line's own page. No twisty, no
 * `aria-expanded`, nothing that looks pressable and answers differently — an
 * accordion was what shipped and was rejected, at every width.
 */
function LineRow({ line, selected, onOpen }: {
  line: RecordLine;
  /** Current in the canvas beside this rail. Desk only — see `selectedId`. */
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const flagged = needsReview(line);
  const units = joinedUnitCount(line);
  return (
    <Row
      edge={flagged ? "warning" : null}
      selected={selected}
      onActivate={() => onOpen(line.id)}
      data-testid="record-line"
      // KEPT, and not because anything styles it: `data-flagged` is what the
      // existing browser suites assert a marked row by, and the mark's MEANING
      // is this surface's to state. `data-edge` says a mark is drawn; this says
      // what it is a mark of.
      data-flagged={flagged}
    >
        {/* DECORATIVE TO ASSISTIVE TECHNOLOGY, and the row's own text still
            carries the code, the product, the size and the flag — so the
            drawing adds nothing a non-sighted reviewer loses. `aria-hidden` is
            on the SVG itself, inside Elevation. */}
        <span className="rl-elev">
          <Elevation
            productSlug={line.productSlug ?? ""}
            widthMm={line.width}
            heightMm={line.height}
            parts={elevationPartsFor(line)}
            axis={line.compositeAxis}
            size="xs"
            square
            className="rl-elev__svg"
          />
        </span>
        <span className="rl-main">
          <span className="rl-top">
            {/* The code anchors this line in the schedule, the drawing and the
                factory ticket, so a column of them reads as a column. A line
                with no code prints an em dash: the position is MISSING, not a
                field that happens to be empty. */}
            <span className="rl-code">{line.code || "—"}</span>
            <span className="rl-name">{line.productName}</span>
          </span>
          <span className="rl-sub">
            <span className="rl-size">{sizeText(line)}</span>
            {units > 0 && (
              <span className="rl-units">{units} joined unit{units === 1 ? "" : "s"}</span>
            )}
          </span>
        </span>
        <span className="rl-end">
          {/* NOT PRICED IS A STATE, NOT A ZERO. Unpriced work is precisely what
              this console exists to hunt, and turning it into a
              plausible-looking number is the worst available failure. */}
          <span className="rl-money" data-priced={line.lineTotal != null}>
            {line.lineTotal == null ? "No rate" : money(line.lineTotal)}
          </span>
          {flagged && <span className="rl-badge">needs review</span>}
        </span>
    </Row>
  );
}

export function RecordLines({ lines, total, filterOn, orderNo, selectedId, onOpen, onClearFilter }: {
  /** What to show — already filtered. */
  lines: readonly RecordLine[];
  /** How many the record has in all, for the filtered-empty sentence. */
  total: number;
  filterOn: boolean;
  /** Present ⇒ these are CONTRACT lines, and an empty list means something else. */
  orderNo?: string | null;
  /** THE LINE THE CANVAS IS REVIEWING, at the desk. Null on the phone, where a
   *  row navigates away and there is nothing beside it to be current WITH — a
   *  row that stayed marked after you left it would be describing a screen you
   *  are no longer on. */
  selectedId?: string | null;
  onOpen: (id: string) => void;
  onClearFilter: () => void;
}) {
  if (lines.length === 0) {
    // THE FILTER'S OWN EMPTY IS NOT THE RECORD'S. A list that went blank
    // because of a control the reader pressed has to say so and offer the way
    // back, or it reads as a record that lost its lines.
    if (filterOn) {
      return (
        <div className="rl-empty" data-testid="record-lines-filtered-empty">
          <strong>No lines without a rate.</strong>
          <button type="button" className="rl-empty__back" onClick={onClearFilter}>
            Clear the filter to see all {total}.
          </button>
        </div>
      );
    }
    // TWO EMPTIES, TWO SENTENCES. A quote with no lines yet is waiting on the
    // customer or the estimator; an ORDER with no lines is a conversion that
    // has not finished, or has gone wrong.
    return (
      <div className="rl-empty" data-testid="record-lines-empty">
        {orderNo ? (
          <>
            <strong>{orderNo} has no contract lines.</strong>
            <p className="rl-empty__note">
              The order exists but nothing has been written against it. The quote it
              came from is in the legacy console.
            </p>
          </>
        ) : (
          // NO HEADLINE HERE. The attention row above the list already says
          // "No lines on this project yet", and a screen that says it twice is
          // a screen that has two owners for one sentence.
          <p className="rl-empty__note">
            Lines arrive when the customer submits a schedule, or when the estimator runs.
          </p>
        )}
      </div>
    );
  }
  return (
    <RowList className="rl-list ds-surface-card" testId="record-lines">
      {lines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          selected={line.id === selectedId}
          onOpen={onOpen}
        />
      ))}
    </RowList>
  );
}
