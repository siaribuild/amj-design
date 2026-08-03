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
import { ChevronDown, AlertCircle, MoreHorizontal, Pencil } from "lucide-react";
import { type QItem, fmt, mm, productLabel, linePriceTotal } from "../../data/configurator";
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

  // Every accessible name carries the opening reference. Twenty identical
  // "Edit"/"More" buttons pass a shallow a11y scan and are unusable with a
  // screen reader (plan §11).
  return (
    <div id={rowId(rowKey)} data-state={rowStateAttr(state)}
      // Padding follows the wireframe's two treatments, not one compromise
      // between them: below 768 this is a stacked CARD and keeps card padding;
      // from 768 it is a table row and takes the quote editor's own cell rhythm
      // — 6px 10px against a 44px minimum row height.
      className="quote-row flex md:grid flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1.5
        px-3 sm:px-4 py-3 md:px-2.5 md:py-1.5 md:min-h-[44px]">
        {/* Identity is ONE cell. The pictogram and the code were siblings, which
            is invisible in a flex row but would have consumed two grid tracks. */}
        <span className="order-1 md:col-start-1 md:row-start-1 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
          {/* 40×28, the wireframe's own box for this cell. It was a 22×22
              square glyph — too small to read, and square regardless of whether
              the opening is a long slot or a tall panel. */}
          <Elevation productSlug={item.productSlug} widthMm={item.width} heightMm={item.height}
            className="max-w-10 max-h-7 w-auto h-auto flex-shrink-0 text-body" />
          <span className="font-semibold text-ink truncate font-data t-data-sm">{ref}</span>
          {/* Below 1024 the status belongs to the identity, beside the reference
              it describes — the same place a phone puts it. It rides INSIDE this
              cell rather than as a grid sibling because at these widths it has
              no column of its own to sit in. */}
          <span className="lg:hidden"><RowStateBadge state={state} /></span>
        </span>

        {/* From 1024 the status is a real column under a real header. This is a
            SECOND render of the same chip, not a moved one: the copy above is a
            child of the identity cell and a grid item cannot be both. Whichever
            is not shown is display:none, so it is out of the accessibility tree
            too and nothing is announced twice. */}
        {state.kind !== "none" && (
          <span className="hidden lg:block lg:col-start-6 lg:row-start-1 min-w-0">
            <RowStateBadge state={state} />
          </span>
        )}

        <div className="order-4 md:order-none md:col-start-5 lg:col-start-7 md:row-start-1 ml-auto md:ml-0 flex items-center gap-0.5 flex-shrink-0 md:justify-end">
          {/* 44px touch targets: these three sit adjacent, and under-sizing them
              is the classic mis-tap generator on this exact pattern. */}
          <button type="button" onClick={onToggleExpanded}
            aria-expanded={expanded} aria-controls={panelId(rowKey)}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${ref}`}
            className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center text-body hover:text-ink icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {/* A pictogram, matched to the chevron and More either side of it:
              three controls in one cluster read as one kind of thing, and a lone
              text label among two glyphs reads as something else. The accessible
              name still carries the opening reference. */}
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
        <span className="order-5 md:order-none md:col-start-2 md:row-start-1 basis-full md:basis-auto min-w-0 truncate text-ink t-bd-sm">
          {item.productSlug ? productLabel(item.productSlug) : "Choose a product"}
          {item.location && <span className="text-quiet"> · {item.location}</span>}
        </span>

        {/* Size and quantity were one string. They are two columns now, because
            "is anything the wrong size" and "how many of these" are two
            different scans and a combined cell answers neither cleanly. Quantity
            folds back into the flow between 768 and 1023, where its column is
            the cheapest one to give up. */}
        <span className="order-6 md:order-none md:col-start-3 md:row-start-1 md:text-right text-body flex-shrink-0 tabular-nums font-data t-data-sm">
          {mm(item.width)} × {mm(item.height)}
          <span className="lg:hidden"> · ×{item.qty}</span>
        </span>

        <span className="hidden lg:block lg:col-start-4 lg:row-start-1 lg:text-right text-body flex-shrink-0 tabular-nums font-data t-data-sm">
          ×{item.qty}
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
  if (state.kind === "composite") {
    return (
      <span className="quote-chip quote-chip--neutral t-cap">
        Composite · {state.units} units
      </span>
    );
  }
  if (state.kind === "confirm-layout") {
    return <span className="quote-chip quote-chip--review t-cap">Confirm layout</span>;
  }
  return (
    <span className="quote-chip quote-chip--attention t-cap">
      <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />Needs your input
    </span>
  );
}

const rowStateAttr = (state: RowState): string =>
  state.kind === "needs-input" ? "attention"
    : state.kind === "confirm-layout" ? "review"
      : "ready";
