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
import type { ReactNode } from "react";
import { AlertCircle, Pencil } from "lucide-react";
import { type QItem, type QSegment, mm, productLabel } from "../../data/configurator";
import { getProductBySlug } from "../../data/catalogue";
import { optionSummaryPairs } from "../ItemComposer";
import { type RowKey, panelId } from "./identity";
import { type RowState, unitLabel } from "./rowState";

/** The same mapping OpeningRow uses, so the stripe cannot disagree with the row
 *  it hangs beneath. */
const stripeFor = (state: RowState): string =>
  state.kind === "needs-input" ? "attention"
    : state.kind === "confirm-layout" ? "review"
      : "ready";

/** Options as labelled lines. A run-on "5Clear · White · Standard · None" can
 *  only be decoded by someone who already knows the option order.
 *
 *  The label sits ABOVE its value rather than inline before it. Inline pairs
 *  gave every row a different indent — the value started wherever the label
 *  happened to end — so the specification could not be read down the column it
 *  was already laid out in. auto-fit tracks let the set reflow from four across
 *  to one without a breakpoint per width. */
function OptionList({ pairs, dense = false }: {
  pairs: { label: string; value: string }[]; dense?: boolean;
}) {
  if (!pairs.length) return null;
  return (
    <dl className="grid gap-x-6 gap-y-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {pairs.map((p) => (
        <div key={p.label} className="min-w-0">
          <dt className="text-quiet mb-0.5 font-data t-label">{p.label}</dt>
          <dd className={`${dense ? "t-cap" : "t-cap"} text-ink min-w-0 truncate`}>{p.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A micro-heading inside the panel. The expansion carried no structure at all —
 *  options, units and the Edit launcher ran together as three unlabelled blocks. */
function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-quiet mb-2 font-data t-label">{children}</p>
  );
}

export function OpeningExpansion({ item, rowKey, state, onEdit, onFixDetails }: {
  item: QItem;
  rowKey: RowKey;
  /** Drives the inherited state stripe and the reason block. */
  state: RowState;
  onEdit: () => void;
  onFixDetails: () => void;
}) {
  const product = getProductBySlug(item.productSlug);
  const segments = item.segments ?? [];
  const composite = segments.length > 0;
  const ref = item.code || "this opening";
  const pairs = optionSummaryPairs(product, item.options);

  return (
    // Recessive, not paper. The panel sat on the same surface as the row above
    // it with only a hairline between, so an opened row read as two rows rather
    // than as one row showing its inside. Dropping the ground is what makes the
    // disclosure legible as nesting.
    // data-state carries the row's stripe down the panel. An opened blocked row
    // otherwise lost its marker at exactly the point the customer is reading why
    // it is blocked — the coloured edge stopped at the row and the panel below
    // looked like an unrelated block.
    <div id={panelId(rowKey)} data-state={stripeFor(state)}
      className="quote-rowexp bg-recessive border-t border-line px-3 sm:px-4 py-4">
      {/* The reason, and the action that resolves it. Both used to sit inline in
          the row beside the chip, where they made a blocked line two or three
          lines tall. Here they have room to be a sentence rather than a truncated
          fragment, and Fix details still opens the drawer AT the offending
          field rather than merely expanding something. */}
      {state.kind === "needs-input" && (
        <div className="mb-4">
          {/* Not "Needs your input" — that is the row's chip, and repeating it
              two lines below says the same thing twice while answering nothing. */}
          <PanelLabel>What's missing</PanelLabel>
          <p className="text-warning-ink mb-2.5 t-cap">{state.reason}</p>
          <button type="button" onClick={onFixDetails} aria-label={`Fix details for ${ref}`}
            className="card inline-flex items-center gap-1.5 px-3 py-2 font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />Fix details
          </button>
        </div>
      )}
      {/* A composite PARENT carries no options of its own — it is the schedule
          line, not a product. The glazing and hardware belong to the units, and
          showing the parent's stored option row here would assert a
          specification the customer never chose at this level. */}
      {!composite && (
        <>
          <PanelLabel>Specification</PanelLabel>
          {pairs.length > 0
            ? <OptionList pairs={pairs} />
            : <p className="text-quiet t-cap">No options selected</p>}
        </>
      )}

      {composite && (
        <div>
          <PanelLabel>Included units</PanelLabel>
          {/* Each unit is its own object on paper, against the panel's recessive
              ground. As flat bordered-left lines they were indistinguishable
              from the option rows directly above them. */}
          <ul className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {segments.map((s, i) => (
              // No price and no affordance, deliberately. The parent owns the
              // total; separate numbers here would read as separate charges. The
              // drawer's child list is the one that gets an Edit affordance —
              // the same data must not look interactive in both places.
              <li key={s.id} className="border border-line bg-paper px-3 py-2.5 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1">
                  <span className="font-semibold text-ink font-data t-data-sm">
                    {unitLabel(item.code, i)}
                  </span>
                  {s.qtyPerParent > 1 && <span className="text-quiet t-cap">×{s.qtyPerParent}</span>}
                  <span className="text-body tabular-nums ml-auto font-data t-data-sm">
                    {mm(s.width)} × {mm(s.height)}
                  </span>
                </div>
                <p className="text-body min-w-0 truncate mb-1.5 t-cap">{productLabel(s.productSlug)}</p>
                <span className="quote-chip quote-chip--neutral t-cap">Included</span>
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
          className="card inline-flex items-center gap-1.5 px-3 py-2 font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
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
