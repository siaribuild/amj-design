// ═══════════════════════════════════════════════════════════════════════════════
// UNIT ROW — a composite's child, in the list rather than buried in a panel
//
// A composite opening is one line the customer submitted and several frames we
// make. It used to render as a single row whose units were only visible after
// opening it, which hid the thing most worth checking: that the parts add up to
// the opening. Units are rows now, indented under their parent, ALWAYS shown —
// there is no collapsed state for the stack itself.
//
// It shares .quote-row and the same grid tracks as OpeningRow, so Status,
// Product and Size land in one column down the whole table. That is the reason
// the REF track is wider than a parent alone would need: it has to hold the
// indent, the connector and W1A without pushing Status out of line.
//
// What a unit does NOT get, and why:
//  • no PRICE. The parent owns the total; per-unit figures do not sum to it and
//    would read as separate charges (owner, 2026-08-04).
//  • no MORE menu. Duplicate and Delete were the only entries, and both are
//    gone: the unit COUNT is the split decision and the customer does not make
//    it. An empty menu button is worse than none.
//  • no state chip of its own unless it has something to say — a row of Ready
//    chips under a Ready parent is noise.
// ═══════════════════════════════════════════════════════════════════════════════
import { ChevronDown, Pencil } from "lucide-react";
import { type QSegment, mm, productLabel } from "../../data/configurator";
import { Elevation } from "./Elevation";

export function UnitRow({
  segment, parentCode, label, expanded, onToggleExpanded, onEdit, panelId, controlId,
}: {
  segment: QSegment;
  parentCode: string;
  /** W1A, W1B … derived by the caller from the parent's code and this index. */
  label: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onEdit: () => void;
  panelId: string;
  controlId: string;
}) {
  const needsReview = segment.status !== "Ready";

  return (
    <div data-unit="" data-state={needsReview ? "attention" : "ready"}
      className="quote-row quote-unitrow flex md:grid flex-wrap items-center
        gap-x-2 md:gap-x-3 gap-y-1.5 px-3 sm:px-4 py-3 md:px-2.5 md:py-1.5 md:min-h-[44px]">

      {/* Identity: indent, connector, drawing, reference. One cell, so it
          occupies one track — the connector is drawn by the cell rather than
          added as a sibling, which would have cost a column. */}
      <span className="order-1 md:col-start-1 md:row-start-1 flex items-center gap-x-2 min-w-0">
        <span className="quote-unit-tree" aria-hidden="true" />
        <Elevation productSlug={segment.productSlug} widthMm={segment.width} heightMm={segment.height}
          square className="w-7 h-7 flex-shrink-0 text-body" />
        <span className="font-semibold text-ink truncate font-data t-data-sm">{label}</span>
        {needsReview && (
          <span className="lg:hidden quote-chip quote-chip--attention t-cap">Needs review</span>
        )}
      </span>

      {needsReview && (
        <span className="hidden lg:block lg:col-start-2 lg:row-start-1 min-w-0">
          <span className="quote-chip quote-chip--attention t-cap">Needs review</span>
        </span>
      )}

      <div className="order-4 md:order-none md:col-start-5 lg:col-start-6 md:row-start-1 ml-auto md:ml-0
        flex items-center gap-0.5 flex-shrink-0 md:justify-end">
        <button type="button" onClick={onToggleExpanded}
          aria-expanded={expanded} aria-controls={panelId}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${label}`}
          className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center text-body hover:text-ink icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <button type="button" id={controlId} onClick={onEdit}
          aria-label={`Edit ${label}`} title={`Edit ${label}`}
          className="w-11 h-11 lg:w-9 lg:h-9 inline-flex items-center justify-center text-sage hover:text-sage-hover icon-btn cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </button>
        {/* The third slot a parent fills with More is left EMPTY rather than
            collapsed, so the chevron and pencil stay under their parent's. */}
        <span className="w-11 lg:w-9" aria-hidden="true" />
      </div>

      <span className="order-5 md:order-none md:col-start-2 lg:col-start-3 md:row-start-1
        basis-full md:basis-auto min-w-0 truncate text-body t-bd-sm">
        {productLabel(segment.productSlug)}
        {segment.qtyPerParent > 1 && (
          <span className="text-quiet"> · ×{segment.qtyPerParent} per opening</span>
        )}
      </span>

      <span className="order-6 md:order-none md:col-start-3 lg:col-start-4 md:row-start-1 md:text-right
        text-body flex-shrink-0 tabular-nums font-data t-data-sm">
        {mm(segment.width)} × {mm(segment.height)}
      </span>

      {/* Price column, deliberately empty — see the header note. The cell still
          exists so the parent's figure keeps a column to itself rather than
          having units' text slide under it. */}
      <span className="hidden md:block md:col-start-4 lg:col-start-5 md:row-start-1" aria-hidden="true" />
      <span className="sr-only">Included in {parentCode || "the opening"}</span>
    </div>
  );
}
