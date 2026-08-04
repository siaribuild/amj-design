// ═══════════════════════════════════════════════════════════════════════════════
// UNIT ROW — a composite's child, in the list rather than buried in a panel
//
// A composite opening is one line the customer submitted and several frames we
// make. Units are rows, not a nested panel, and they live in a box inset under
// their parent — the parent's disclosure is what opens it (owner), so a
// composite opens into its children the way any other opening opens into its
// detail.
//
// It shares .quote-row and the same grid tracks as OpeningRow. The block's
// tracks give up the inset on the left and the right and leave the middle ones
// alone, so Status, Product, Size and Price land on exactly the same x as the
// parent's and the header's — one eye-line reads down the whole table.
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
import { ChevronRight } from "lucide-react";
import { type QSegment, sizePhrase, productLabel, acrossMismatch } from "../../data/configurator";
import { Elevation } from "./Elevation";

export function UnitRow({
  segment, parentCode, label, expanded, onToggleExpanded, panelId, acrossMm, axis,
}: {
  segment: QSegment;
  parentCode: string;
  /** The opening dimension ACROSS the split — every unit must match it exactly. */
  acrossMm?: string | null;
  axis?: "vertical" | "horizontal" | null;
  /** W1A, W1B … derived by the caller from the parent's code and this index. */
  label: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  panelId: string;
}) {
  // "Needs review" told the customer nothing (owner). The segment DTO collapses
  // D1's `incomplete` and `technical_review` into one "Needs review", and those
  // are opposites here: unpriceable is THEIRS to fix, flagged-for-review is
  // OURS to resolve — the same category ruled out of the sticky bar.
  //
  // lineTotal separates them without a server change: no price ⇒ incomplete ⇒
  // actionable. A priced-but-flagged unit shows nothing, and the parent's price
  // still carries the caveat where it belongs.
  const incomplete = !(typeof segment.lineTotal === "number" && Number.isFinite(segment.lineTotal));

  // A size fault this unit can be BLAMED for (owner) — the ACROSS-axis one. The
  // rule and its reasoning now live in ONE place, unitAcrossMismatch, shared
  // with the opening's own row state and with the submission gate: three
  // readings of the same geometry had drifted into disagreeing about the same
  // pair of numbers.
  const wrongSize = !incomplete
    && acrossMismatch(acrossMm, axis === "horizontal" ? segment.width : segment.height);

  return (
    <div data-unit="" data-state={incomplete || wrongSize ? "attention" : "ready"}
      className="quote-row flex md:grid flex-wrap items-center gap-x-2 md:gap-x-3 gap-y-1.5">

      {/* Identity: disclosure, drawing, reference. One cell, so it occupies one
          track. No connector: the block this row sits in is inset and bordered
          along its whole height, which states the same relationship — an elbow
          inside it would point at an edge two pixels away. */}
      <span className="order-1 md:col-start-1 md:row-start-1 flex items-center gap-x-2 min-w-0">
        <button type="button" onClick={onToggleExpanded}
          aria-expanded={expanded} aria-controls={panelId}
          aria-label={`${expanded ? "Hide" : "Show"} details for ${label}`}
          className="quote-twisty icon-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <Elevation productSlug={segment.productSlug} widthMm={segment.width} heightMm={segment.height}
          square className="w-7 h-7 flex-shrink-0 text-body" />
        <span className="font-semibold text-ink truncate font-data t-data">{label}</span>
        <span className="lg:hidden"><UnitChip incomplete={incomplete} wrongSize={wrongSize} /></span>
      </span>

      {(incomplete || wrongSize) && (
        <span className="hidden lg:block lg:col-start-2 lg:row-start-1 min-w-0">
          <UnitChip incomplete={incomplete} wrongSize={wrongSize} />
        </span>
      )}

      {/* NO EDIT CONTROL (owner). A unit is reached through its opening: the
          parent's pencil opens the drawer, which lists the units and offers
          "Edit unit" on each. Two routes to the same editor put the same action
          in two places and made the child row's cluster a lone pencil under a
          parent's pair — the one place in the list where a column staggered for
          a reason nobody could see. The unit keeps its own DISCLOSURE, which
          inspects rather than changes. */}

      <span className="order-5 md:order-none md:col-start-2 lg:col-start-3 md:row-start-1
        basis-full md:basis-auto min-w-0 truncate text-body t-bd-sm">
        {productLabel(segment.productSlug)}
        {segment.qtyPerParent > 1 && (
          <span className="text-quiet"> · ×{segment.qtyPerParent} per opening</span>
        )}
      </span>

      <span className="order-6 md:order-none md:col-start-3 lg:col-start-4 md:row-start-1 md:text-right
        text-body flex-shrink-0 tabular-nums font-data t-data">
        {sizePhrase(segment.width, segment.height)}
      </span>

      {/* Price column, deliberately empty — see the header note. The cell still
          exists so the parent's figure keeps a column to itself rather than
          having units' text slide under it. */}
      <span className="hidden md:block md:col-start-4 lg:col-start-5 md:row-start-1" aria-hidden="true" />
      <span className="sr-only">Included in {parentCode || "the opening"}</span>
    </div>
  );
}

/** Incomplete outranks a size fault: a unit with no price cannot be judged for
 *  fit either, and two chips on one row is the noise this route removes. */
function UnitChip({ incomplete, wrongSize }: { incomplete: boolean; wrongSize: boolean }) {
  if (incomplete) {
    return <span className="quote-chip quote-chip--attention t-cap">Incomplete</span>;
  }
  if (wrongSize) {
    return <span className="quote-chip quote-chip--attention t-cap">Check size</span>;
  }
  return null;
}
