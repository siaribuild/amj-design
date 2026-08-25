import { Elevation } from "../../components/quote-project/Elevation";
import { elevationPartsFor, type RecordLine } from "./record";

/**
 * THE DRAWING PLATE — the line page's hero.
 *
 * The element the owner rates highest in the product, given a surface of its
 * own rather than hung off the side of a list. The row's `xs` glyph says which
 * opening this is; the plate is where the opening is the SUBJECT, so it is
 * drawn at `hero` (its own SIZES row, added for exactly these pixels — R-49:
 * the generator is called at the size closest to the intended size, never
 * scaled, because scaling takes the leader text out of its designed 9–13px).
 *
 * TAPPING THE HERO IS THE ENLARGE CONTROL, so no action row is spent on it —
 * and it is a real button with a real accessible name, because a click handler
 * on a figure leaves pointer and gesture as the only routes in.
 *
 * ── WHERE THE ENLARGEMENT WENT ──────────────────────────────────────────────
 * It used to be a `SidePanel` this component owned, with its own `useState`,
 * its units list and the shared `ElevationLegend`. All of that is gone. The
 * enlargement is now `../chrome/DrawingViewer` — a node in the navigation tree
 * with its own address, hosted by the page rather than by this figure — and the
 * symbol legend is gone entirely from ops2 (R25: ops staff read elevations for
 * a living). The shared `ElevationLegend` export is gone too, as of the owner's
 * ruling D12 — this note said for two revisions that the export survived because
 * removing it was "a separate decision nobody has taken", and the decision has
 * now been taken on evidence that arrived after: zero callers repo-wide, and no
 * `.elev-legend` rule in any stylesheet, so its markup had been unstyled since
 * this plate stopped rendering it.
 *
 * So this file no longer knows what enlarging MEANS. It reports that the
 * drawing was activated and the page decides — the same seam the viewer keeps.
 */
export function Plate({ line, onOpen }: { line: RecordLine; onOpen: () => void }) {
  const parts = elevationPartsFor(line);

  return (
    <figure className="lp-plate" data-testid="line-plate">
      <button
        type="button"
        className="lp-plate__face"
        data-testid="line-plate-open"
        aria-label={`Enlarge the drawing of ${line.code || "this opening"}`}
        onClick={onOpen}
      >
        <Elevation
          productSlug={line.productSlug ?? ""}
          widthMm={line.width}
          heightMm={line.height}
          parts={parts}
          axis={line.compositeAxis}
          size="hero"
          className="lp-plate__svg"
        />
      </button>
    </figure>
  );
}
