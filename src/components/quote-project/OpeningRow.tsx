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
import { useGstMode, gstAdjust, gstSuffix } from "../../data/gst";
import { FamilyPictogram } from "./FamilyPictogram";
import { type RowState } from "./rowState";
import { type RowKey, editControlId, panelId, rowId } from "./identity";

export function OpeningRow({
  item, rowKey, state, expanded, onToggleExpanded, onEdit, onFixDetails, onOpenMenu,
}: {
  item: QItem;
  rowKey: RowKey;
  state: RowState;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  onFixDetails: () => void;
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
      className="quote-row flex md:grid flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1.5 px-3 sm:px-4 py-3">
        {/* Identity is ONE cell. The pictogram and the code were siblings, which
            is invisible in a flex row but would have consumed two grid tracks. */}
        <span className="order-1 md:col-start-1 md:row-start-1 flex items-center gap-2 min-w-0">
          <FamilyPictogram productSlug={item.productSlug} size={22} />
          <span className="text-xs font-semibold text-ink truncate"
            style={{ fontFamily: "'DM Mono', monospace" }}>{ref}</span>
        </span>

        {/* Status. Its own column once there is room for one (>=1024); between
            768 and 1023 it becomes a full-width strip on a second grid row,
            because six fixed columns at 768 leave the product name unreadable.
            Rendered only when there IS a state — an always-present wrapper would
            open an empty second row under every clean line. */}
        {state.kind !== "none" && (
          <span className="order-3 md:order-none min-w-0
            md:col-span-full md:row-start-2
            lg:col-span-1 lg:col-start-6 lg:row-start-1">
            <RowStateBadge state={state} onFixDetails={onFixDetails} openingRef={ref} />
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
        <span className="order-5 md:order-none md:col-start-2 md:row-start-1 basis-full md:basis-auto min-w-0 truncate text-sm text-ink">
          {item.productSlug ? productLabel(item.productSlug) : "Choose a product"}
          {item.location && <span className="text-quiet"> · {item.location}</span>}
        </span>

        {/* Size and quantity were one string. They are two columns now, because
            "is anything the wrong size" and "how many of these" are two
            different scans and a combined cell answers neither cleanly. Quantity
            folds back into the flow between 768 and 1023, where its column is
            the cheapest one to give up. */}
        <span className="order-6 md:order-none md:col-start-3 md:row-start-1 md:text-right text-xs text-body flex-shrink-0 tabular-nums"
          style={{ fontFamily: "'DM Mono', monospace" }}>
          {mm(item.width)} × {mm(item.height)}
          <span className="lg:hidden"> · ×{item.qty}</span>
        </span>

        <span className="hidden lg:block lg:col-start-4 lg:row-start-1 lg:text-right text-xs text-body flex-shrink-0 tabular-nums"
          style={{ fontFamily: "'DM Mono', monospace" }}>
          ×{item.qty}
        </span>

        <span className="order-7 md:order-none md:col-start-4 lg:col-start-5 md:row-start-1 md:text-right ml-auto md:ml-0 text-sm font-semibold text-ink flex-shrink-0 tabular-nums"
          style={{ fontFamily: "'DM Mono', monospace" }}>
          {priced ? fmt(gstAdjust(linePriceTotal(item), gstMode)) : "$-,--"}
          <span className="text-[10px] font-normal text-body"> {gstSuffix(gstMode)}</span>
        </span>
    </div>
  );
}

/** Status is text + icon + colour, never colour alone (plan §10). */
function RowStateBadge({ state, onFixDetails, openingRef }: {
  state: RowState; onFixDetails: () => void; openingRef: string;
}) {
  if (state.kind === "none") return null;
  if (state.kind === "composite") {
    return (
      <span className="quote-chip quote-chip--neutral text-[10px]">
        Composite · {state.units} units
      </span>
    );
  }
  if (state.kind === "confirm-layout") {
    return (
      <span className="quote-chip quote-chip--review text-[10px]">
        Confirm layout
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
      <span className="quote-chip quote-chip--attention text-[10px]">
        <AlertCircle className="w-2.5 h-2.5" aria-hidden="true" />Needs your input
      </span>
      {/* The reason is VISIBLE text, not a title attribute: a tooltip cannot be
          hovered on a phone and is not part of the accessible name, so the badge
          would otherwise say something is wrong without saying what. */}
      <span className="text-[11px] text-warning-ink min-w-0 truncate">{state.reason}</span>
      {/* A direct action, not merely an expand: it opens the drawer AT the field. */}
      {/* Sized for a thumb where touch is expected; an inline link at desktop.
          This is the customer's primary action on a blocked line, so it is the
          last control that should be hard to hit. */}
      <button type="button" onClick={onFixDetails} aria-label={`Fix details for ${openingRef}`}
        className="inline-flex items-center min-h-[44px] lg:min-h-0 text-[11px] font-medium text-sage underline underline-offset-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
        Fix details
      </button>
    </span>
  );
}

const rowStateAttr = (state: RowState): string =>
  state.kind === "needs-input" ? "attention"
    : state.kind === "confirm-layout" ? "review"
      : "ready";
