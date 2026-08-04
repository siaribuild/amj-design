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
import { type QItem, mm } from "../../data/configurator";
import { getProductBySlug } from "../../data/catalogue";
import { optionFullPairs } from "../ItemComposer";
import { Elevation } from "./Elevation";
import { type RowKey, panelId } from "./identity";
import { type RowState } from "./rowState";

/** The same mapping OpeningRow uses, so the stripe cannot disagree with the row
 *  it hangs beneath. */
const stripeFor = (state: RowState): string =>
  state.kind === "needs-input" ? "attention"
    : state.kind === "confirm-layout" ? "review"
      : "ready";

/** The full specification, one option per LINE — every option the product
 *  offers, chosen or not.
 *
 *  Not the auto-fit grid above it: this set is complete rather than selective,
 *  so it is read as a checklist ("did I say anything about flyscreens?") and a
 *  checklist reflowed into four columns cannot be run down. Labels share a fixed
 *  column so the values line up in one edge; an unchosen line keeps the quiet
 *  tone AND says None, so the distinction is never carried by colour alone. */
function OptionLines({ pairs }: { pairs: { label: string; value: string; chosen: boolean; hex?: string }[] }) {
  return (
    <dl className="border-t border-line">
      {pairs.map((p) => (
        <div key={p.label} className="flex items-baseline gap-3 border-b border-line py-1.5">
          <dt className="text-quiet w-24 sm:w-28 flex-shrink-0 font-data t-label">{p.label}</dt>
          <dd className={`min-w-0 flex items-center gap-2 t-cap ${p.chosen ? "text-ink" : "text-quiet"}`}>
            {/* A swatch of the ACTUAL colour, never instead of the name: half
                the Colorbond range is a near-neutral grey and several pairs are
                indistinguishable at this size, so the chip locates the colour
                and the name identifies it. Bordered because Dover White on a
                near-white ground is otherwise an invisible chip. */}
            {p.hex && (
              <span aria-hidden="true"
                className="w-3.5 h-3.5 rounded-full border border-line flex-shrink-0"
                style={{ backgroundColor: p.hex }} />
            )}
            <span className="min-w-0">{p.value}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Drawing left, specification right — the Edit Line form's arrangement, shared
 *  by an opening's panel and a unit's.
 *
 *  The column is a fixed 180 square rather than shrink-to-fit or a percentage.
 *  At `sm` the generator's viewBox units are ≈ screen pixels, which is what
 *  keeps the leader numbers at a legible 9px, and an auto column is as wide as
 *  whichever opening it happens to hold — so the specification beside it started
 *  at a different x on every row and the panel could not be read down.
 *
 *  `pairs: null` means this thing has no options OF ITS OWN to state, which is
 *  different from having none chosen. */
export function SpecPanel({ productSlug, widthMm, heightMm, pairs }: {
  productSlug: string;
  widthMm?: string | null;
  heightMm?: string | null;
  pairs: { label: string; value: string; chosen: boolean; hex?: string }[] | null;
}) {
  return (
    <div className="grid gap-4 sm:gap-6 sm:grid-cols-[auto_minmax(0,1fr)] items-start">
      <div className="w-[180px] max-w-full">
        {/* The drawing FILLS this square and preserveAspectRatio centres it —
            which is also what scales it up: the generator's intrinsic size is
            ~152 units, and letting it fit 180 grows the leader text with it
            rather than shrinking it, the failure the size table exists to
            prevent. Here the proportion IS the point, and it carries its own
            dimensions: this is the one view where the customer checks the shape
            and size of what they ordered against the hole in the wall, so the
            numbers belong ON the drawing rather than in a caption. */}
        <Elevation productSlug={productSlug} widthMm={widthMm} heightMm={heightMm}
          size="sm" className="w-[180px] h-[180px] max-w-full text-body" />
        <p className="text-quiet mt-1 text-center t-label">Viewed from outside</p>
      </div>
      <div className="min-w-0">
        {pairs === null
          ? (
            <p className="text-quiet t-cap">
              This opening is built as separate units. Each one carries its own
              glazing, colour and hardware — open a unit below to see them.
            </p>
          )
          : (
            <>
              <PanelLabel>Specification</PanelLabel>
              {pairs.length > 0
                ? <OptionLines pairs={pairs} />
                : <p className="text-quiet t-cap">This product has no options to choose.</p>}
            </>
          )}
      </div>
    </div>
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
  // The complete set for a single opening; the composite branch below still uses
  // the selective summary, because a unit list is scanned for what DIFFERS
  // between units, not audited option by option.
  const fullPairs = optionFullPairs(product, item.options);

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
      {/* Drawing left, specification right — the Edit Line form's arrangement.
          The column is sized to the drawing rather than to a percentage: at
          `sm` the generator's viewBox units are ≈ screen pixels, which is what
          keeps the leader numbers at a legible 9px, so stretching the column
          would either shrink the text or leave the drawing marooned in it. */}
      {/* The units no longer appear in here. They are ROWS in the list now, one
          per unit, indented under their parent — so repeating them inside the
          parent's own panel would state the same stack twice, in two different
          shapes, on one screen. */}
      {state.kind === "confirm-layout" && typeof state.deltaMm === "number" && state.deltaMm !== 0 && (
        <div className="mb-4">
          <PanelLabel>Check the layout</PanelLabel>
          <p className="text-info-ink t-cap">
            {/* The number, not just the fact. "Doesn't add up" sends someone
                hunting; "160 mm short" tells them which unit to look at. */}
            The units add up to {Math.abs(state.deltaMm)} mm
            {state.deltaMm > 0 ? " more" : " less"} than this opening
            {" "}({mm(item.width)} × {mm(item.height)}). Check each unit's size.
          </p>
        </div>
      )}

      <SpecPanel
        productSlug={item.productSlug} widthMm={item.width} heightMm={item.height}
        // A composite PARENT carries no options of its own — it is the schedule
        // line, not a product. The glazing and hardware belong to the units, so
        // showing the parent's stored option row would assert a specification
        // the customer never chose at this level.
        pairs={composite ? null : fullPairs} />

      {/* A launcher, not the row's inline pencil: this one is a framed control
          with a word on it, so the two Edit affordances on screen at once are
          visibly different things. It opens the drawer; it never turns this
          panel into a form. */}
      {/* The SAME tracks as the drawing/specification grid above, so the note
          starts exactly where the option values do and the panel has one left
          edge rather than two. On a phone the grid collapses to one column and
          order puts the note ABOVE the button: the note is reading matter and
          the button is the way out, so the button belongs last. */}
      <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[180px_minmax(0,1fr)] items-center">
        <button type="button" onClick={onEdit} aria-label={`Edit opening ${ref}`}
          className="order-2 sm:order-1 justify-self-start card inline-flex items-center gap-1.5 px-3 py-2 font-medium text-sage hover:border-sage cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sage t-cap">
          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />Edit opening
        </button>
        {/* The line's own note — the editor's "Note (optional)". It reads here
            rather than in the specification list above because it is free text
            the customer wrote, not a choice they made from a set, and a
            sentence in a column of one-word values makes the column ragged.
            Beside the Edit control is also where it is most useful: it is the
            thing most likely to be WHY you are about to open the editor.
            Read-only, like everything else in this panel. */}
        <p className="order-1 sm:order-2 flex items-baseline gap-3 min-w-0">
          {/* The same label column as OptionLines, so Note reads as the last
              entry in that list rather than as a caption on the button. */}
          <span className="text-quiet w-24 sm:w-28 flex-shrink-0 font-data t-label">Note</span>
          <span className={`min-w-0 t-cap ${item.location ? "text-ink" : "text-quiet"}`}>
            {item.location || "None"}
          </span>
        </p>
      </div>

      {/* Deliberately absent (brief, "content boundary"): price breakdown,
          source/provenance narrative, technical-review rationale, editable
          fields, and any alternative child editor. */}
    </div>
  );
}
