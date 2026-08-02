// ═══════════════════════════════════════════════════════════════════════════════
// OPENING EXPANSION — layer 2 of 3: inspect, READ-ONLY
//
// Plan §7.2. The most fragile point of the whole route. /quote today expands a
// card INTO an editor; here expanding must only ever reveal reading matter. If
// this panel looks editable — or the Edit control reads as a pencil implying
// in-place editing — we reproduce the old model and the A/B measures nothing.
//
// Discipline that keeps the boundary intact:
//  • values render as TEXT, never inside input-like chrome;
//  • included children are flat pills with NO affordance and NO price;
//  • the one Edit control is styled as a launcher that visibly opens an editor.
//
// Universal disclosure: every row gets a chevron and this panel always carries
// something to read. The brief allows omitting the chevron for rows without
// secondary content, but that produces a ragged control column, makes expansion
// unpredictable and leaks item type.
//
// Expanding performs NO network write and does NOT open the drawer.
// ═══════════════════════════════════════════════════════════════════════════════
import { Pencil } from "lucide-react";
import { type QItem, type QSegment, mm, productLabel } from "../../data/configurator";
import { getProductBySlug } from "../../data/catalogue";
import { optionSummaryPairs } from "../ItemComposer";
import { type RowKey, panelId } from "./identity";
import { unitLabel } from "./rowState";

/** Options as labelled lines. A run-on "5Clear · White · Standard · None" can
 *  only be decoded by someone who already knows the option order. */
function OptionList({ pairs, dense = false }: {
  pairs: { label: string; value: string }[]; dense?: boolean;
}) {
  if (!pairs.length) return null;
  return (
    <dl className={`grid gap-x-4 gap-y-1 ${dense ? "text-[11px]" : "text-xs"} sm:grid-cols-2`}>
      {pairs.map((p) => (
        <div key={p.label} className="flex gap-1.5 min-w-0">
          <dt className="text-quiet flex-shrink-0">{p.label}:</dt>
          <dd className="text-ink min-w-0 truncate">{p.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OpeningExpansion({ item, rowKey, onEdit }: {
  item: QItem;
  rowKey: RowKey;
  onEdit: () => void;
}) {
  const product = getProductBySlug(item.productSlug);
  const segments = item.segments ?? [];
  const composite = segments.length > 0;
  const ref = item.code || "this opening";
  const pairs = optionSummaryPairs(product, item.options);

  return (
    <div id={panelId(rowKey)} className="quote-item-body border-t border-line px-3 sm:px-4 py-3">
      {/* A composite PARENT carries no options of its own — it is the schedule
          line, not a product. The glazing and hardware belong to the units, and
          showing the parent's stored option row here would assert a
          specification the customer never chose at this level. */}
      {!composite && (
        pairs.length > 0
          ? <OptionList pairs={pairs} />
          : <p className="text-xs text-quiet">No options selected</p>
      )}

      {composite && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-quiet mb-2">
            Included units
          </p>
          <ul className="space-y-2.5">
            {segments.map((s, i) => (
              // No price and no affordance, deliberately. The parent owns the
              // total; separate numbers here would read as separate charges. The
              // drawer's child list is the one that gets an Edit affordance —
              // the same data must not look interactive in both places.
              <li key={s.id} className="border-l-2 border-line pl-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-semibold text-ink" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {unitLabel(item.code, i)}
                  </span>
                  {s.qtyPerParent > 1 && <span className="text-quiet">×{s.qtyPerParent}</span>}
                  <span className="text-body min-w-0 truncate">{productLabel(s.productSlug)}</span>
                  <span className="text-body tabular-nums" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {mm(s.width)} × {mm(s.height)}
                  </span>
                  <span className="quote-chip quote-chip--neutral text-[10px]">Included</span>
                </div>
                <SegmentOptions segment={s} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A launcher, not the row's inline pencil: this one is a framed control
          with a word on it, so the two Edit affordances on screen at once are
          visibly different things. It opens the drawer; it never turns this
          panel into a form. */}
      <div className="mt-3">
        <button type="button" onClick={onEdit} aria-label={`Edit opening ${ref}`}
          className="card inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage">
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />Edit opening
        </button>
      </div>

      {/* Deliberately absent (brief, "content boundary"): price breakdown,
          source/provenance narrative, technical-review rationale, editable
          fields, and any alternative child editor. */}
    </div>
  );
}

/** A unit's own options — for a composite this is where the specification
 *  actually lives, so it is the only place worth reading it. */
function SegmentOptions({ segment }: { segment: QSegment }) {
  const product = getProductBySlug(segment.productSlug);
  const pairs = optionSummaryPairs(product, segment.options ?? {});
  if (!pairs.length) return null;
  return <div className="mt-1"><OptionList pairs={pairs} dense /></div>;
}
