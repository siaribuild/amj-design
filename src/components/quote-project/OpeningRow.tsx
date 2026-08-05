// ═══════════════════════════════════════════════════════════════════════════════
// OPENING ROW — layer 1 of 3: scan and triage
//
// Plan §7.1 and §8. One collapsed row per top-level opening. The parent owns its
// schedule reference, overall dimensions, quantity and total even when it is
// composite — the customer submitted ONE line and must keep seeing one.
//
// D1 (owner): the row body is NOT clickable. A row already contains an expander,
// an Edit action, a More menu and selectable text; making the whole thing a
// button breaks text selection (tradespeople copy codes and dimensions), nests
// interactive elements, and turns a mis-tap into an accidental edit plus a
// discard prompt. Chevron inspects; the labelled Edit button changes.
//
// ─── Responsive shape ─────────────────────────────────────────────────────────
// ONE DOM order (mobile-first), reflowed with flex-wrap + order utilities, so
// the reading order a screen reader and keyboard follow never changes:
//
//   <768px       compact card  band 1 identity + state + actions
//                              band 2 product
//                              band 3 dimensions … price
//   768–1023px   two-band row  band 1 identity + product
//                              band 2 dimensions, price, state, actions
//   ≥1024px      single row    icon, code, product, dims, price, state, actions
//
// Never horizontal scrolling: the product name is the only elastic element and
// it truncates.
// ═══════════════════════════════════════════════════════════════════════════════
import { ChevronRight, AlertCircle, MoreHorizontal, Pencil } from "lucide-react";
import { type QItem, fmt, sizePhrase, productLabel, compositeLabel, linePriceTotal } from "../../data/configurator";
// gstSuffix is deliberately not imported: the mode still ADJUSTS every line's
// figure, it is simply no longer spelled out on each one.
import { useGstMode, gstAdjust } from "../../data/gst";
import { Elevation } from "./Elevation";
import { type RowState } from "./rowState";
import { type RowKey, editControlId, panelId, rowId } from "./identity";

export function OpeningRow({
  item, rowKey, state, expanded, onToggleExpanded, onEdit, onOpenMenu,
}: {
  item: QItem;
  rowKey: RowKey;
  state: RowState;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onOpenMenu: (anchor: HTMLElement) => void;
}) {
  const gstMode = useGstMode();
  const ref = item.code || "—";
  const priced = typeof item.lineTotal === "number" && Number.isFinite(item.lineTotal);
  const segments = item.segments ?? [];
  const composite = segments.length > 0;

  // WHICH state chip a composite parent shows, and why it usually shows none
  // (owner). Its name already says it is built as units, so the "composite"
  // chip restates the product cell. And when the blocker belongs to a UNIT, the
  // unit carries it — the offending row sits directly beneath with its own chip,
  // so repeating it on the parent marks the same fault twice.
  //
  // Two things survive, because no child can express either: a fault that is the
  // parent's own (nothing beneath it is flagged), and Check sizes, which is
  // precisely the statement that the units do NOT add up to this opening.
  const childFlagged = segments.some(
    (s) => !(typeof s.lineTotal === "number" && Number.isFinite(s.lineTotal)));
  const showBadge = !composite
    || state.kind === "confirm-layout"
    || (state.kind === "needs-input" && !childFlagged);

  // Every accessible name carries the opening reference. Twenty identical
  // "Edit"/"More" buttons pass a shallow a11y scan and are unusable with a
  // screen reader (plan §11).
  return (
    <div id={rowId(rowKey)} data-state={rowStateAttr(state)}
      // Padding and row height live in .quote-row: --qp-inset is computed from
      // that padding, so it cannot be stated twice.
      className="quote-row flex md:grid flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1.5">
        {/* Identity is ONE cell. The pictogram and the code were siblings, which
            is invisible in a flex row but would have consumed two grid tracks. */}
        <span className="order-1 md:col-start-1 md:row-start-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {/* The disclosure LEADS the row (owner). It is the first thing on the
              line, left of the drawing, so every openable thing in the list
              begins with the same control and the column of them reads as one
              rail. A composite's children step in by exactly this control's
              width, which is what makes the rail state the nesting. */}
          <button type="button" onClick={onToggleExpanded}
            aria-expanded={expanded} aria-controls={panelId(rowKey)}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${ref}`}
            className="quote-twisty icon-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
          {/* Square and uniform, 28×28. The list is scanned down a column, and a
              per-line proportion gives that column no edge to read against —
              it also shrinks a 3500×700 line to a sliver at this size. The true
              proportion is drawn in the expansion, where it is the subject. */}
          {/* A composite is drawn from its UNITS — proportional panels, each
              with its own family's symbol, joins where the frames really meet.
              Anything else draws a picture of a product this line is not. */}
          <Elevation productSlug={item.productSlug} widthMm={item.width} heightMm={item.height}
            parts={composite ? segments.map((s) => ({
              productSlug: s.productSlug,
              alongMm: item.compositeAxis === "horizontal" ? s.height : s.width,
              qty: s.qtyPerParent,
            })) : undefined}
            axis={item.compositeAxis}
            square className="w-7 h-7 flex-shrink-0 text-body" />
          {/* 14px too (owner): once Size rose, a 12px reference became the
              smallest cell in the row. The whole row now sits at 14px and
              WEIGHT alone carries the hierarchy — 400 product, 500 size, 600
              reference and price. */}
          <span className="font-semibold text-ink truncate font-data t-data">{ref}</span>
          {/* Below 1024 the status belongs to the identity, beside the reference
              it describes — the same place a phone puts it. It rides INSIDE this
              cell rather than as a grid sibling because at these widths it has
              no column of its own to sit in. */}
          <span className="lg:hidden">{showBadge && <RowStateBadge state={state} />}</span>
        </span>

        {/* From 1024 the status is a real column under a real header. This is a
            SECOND render of the same chip, not a moved one: the copy above is a
            child of the identity cell and a grid item cannot be both. Whichever
            is not shown is display:none, so it is out of the accessibility tree
            too and nothing is announced twice. */}
        {state.kind !== "none" && showBadge && (
          <span className="hidden lg:block lg:col-start-2 lg:row-start-1 min-w-0">
            <RowStateBadge state={state} />
          </span>
        )}

        <div className="order-4 md:order-none md:col-start-5 lg:col-start-6 md:row-start-1 ml-auto md:ml-0 flex items-center gap-0.5 flex-shrink-0 md:justify-end">
          {/* 44px touch targets: these sit adjacent, and under-sizing them is
              the classic mis-tap generator on this exact pattern. */}
          {/* A pictogram, matched to the More beside it: controls in one cluster
              read as one kind of thing, and a lone text label among glyphs reads
              as something else. The accessible name still carries the opening
              reference. */}
          <button type="button" id={editControlId(rowKey)} onClick={onEdit}
            aria-label={`Edit ${ref}`} title={`Edit ${ref}`}
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center text-sage hover:text-sage-hover icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={(e) => onOpenMenu(e.currentTarget)}
            aria-label={`Actions for ${ref}`} aria-haspopup="menu"
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center text-body hover:text-ink icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
            <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* The only elastic element — it truncates so the row can never scroll. */}
        <span className="order-5 md:order-none md:col-start-2 lg:col-start-3 md:row-start-1 basis-full md:basis-auto min-w-0 truncate text-ink t-bd-sm">
          {/* A composite parent does not name a product (owner). It is the
              schedule line, not a frame, and its units may be different
              products from each other — printing one of their names asserts
              the line IS that product. The noun is derived from the children,
              so a door line is never called a window. */}
          {composite ? compositeLabel(segments)
            : item.productSlug ? productLabel(item.productSlug) : "Choose a product"}
          {item.location && <span className="text-quiet"> · {item.location}</span>}
        </span>

        {/* Size only. Quantity is not shown at all on this route (owner): the
            model here is one opening per reference, so a "×1" on every line is
            a column of noise, and any line that genuinely needs two identical
            openings gets a second reference. The FIELD is untouched — it is
            still stored, still editable in the drawer, and still priced. */}
        {/* 14px/600 — the SAME treatment as price (owner). Size was the smallest
            and lightest cell in the row at 12px/500, below both the product name
            and the price, which is backwards for a schedule: an opening is
            identified by its size as much as by its code.
            Parents only. A unit's size stays 500, so a child never outweighs the
            opening it belongs to, and the indent is not the only thing telling
            the two apart when scanning down the column. */}
        <span className="order-6 md:order-none md:col-start-3 lg:col-start-4 md:row-start-1 md:text-right font-semibold text-ink flex-shrink-0 tabular-nums font-data t-data">
          {sizePhrase(item.width, item.height)}
        </span>

        <span className="order-7 md:order-none md:col-start-4 lg:col-start-5 md:row-start-1 md:text-right ml-auto md:ml-0 font-semibold text-ink flex-shrink-0 tabular-nums font-data t-data">
          {/* The number only. Repeating "inc GST" on every line states the tax
              basis twenty times to say one thing — it is a property of the
              whole quote, and the sticky summary carries it there once. */}
          {priced ? fmt(gstAdjust(linePriceTotal(item), gstMode)) : "$-,--"}
        </span>
    </div>
  );
}

/** Status is text + icon + colour, never colour alone (plan §10).
 *
 *  The LABEL ONLY. The reason and its Fix-details action used to sit beside the
 *  chip, which is what made a blocked row two or three lines tall and left the
 *  column ragged — the one thing a table is for. Both moved into the expansion,
 *  and a row in this state opens by default so nothing is hidden by the move. */
function RowStateBadge({ state }: { state: RowState }) {
  if (state.kind === "none") return null;
  // "Composite · N units" (124px) never renders now — the product cell says
  // "Composite Window" — but the state still exists, so it keeps a label rather
  // than returning null and hiding a fact if the row ever shows it again.
  if (state.kind === "composite") {
    return (
      <span className="quote-chip quote-chip--neutral t-cap">{state.units} units</span>
    );
  }
  // "Check sizes", not "Confirm layout" (99px, and on the knife-edge of the
  // identity cell). It also names the actual fault: the units do not sum to the
  // opening. "Confirm layout" says something is wrong without saying what.
  if (state.kind === "confirm-layout") {
    return <span className="quote-chip quote-chip--review t-cap">Check sizes</span>;
  }
  // The label comes FROM the state, so an opening and its unit say the same
  // word about the same fault. It was hardcoded "Incomplete", which is right
  // for a missing size or an unchosen option and wrong for a unit that is the
  // wrong height: the opening is not incomplete, it is inconsistent — and its
  // child was already saying "Check size" one row below.
  //
  // "Incomplete", not "Needs your input" (127px — the label that wrapped under
  // the reference between 768 and 1023). "your" does no work on the customer's
  // own quote, and the sticky bar already phrases the instruction.
  return (
    <span className="quote-chip quote-chip--attention t-cap">
      <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />{state.label}
    </span>
  );
}

const rowStateAttr = (state: RowState): string =>
  state.kind === "needs-input" ? "attention"
    : state.kind === "confirm-layout" ? "review"
      : "ready";
