import { useState } from "react";
import { Elevation, ElevationLegend } from "../../components/quote-project/Elevation";
import { SidePanel } from "../chrome/SidePanel";
import {
  elevationPartsFor, joinedUnitCount, sizeText, unitLabel, unitsOf,
  type RecordLine,
} from "./record";

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
 * The enlargement is the console's own panel (`../chrome/SidePanel`): a bottom
 * sheet on the phone, a right-hand slide-out at the desk. It carries the
 * drawing at `lg`, the units it was built from, and the SYMBOL LEGEND — which
 * lives with the generator, because a symbol added there without a row added
 * here is a drawing nobody can read. The legend is only ever here: a 46px row
 * glyph and a 320px hero have no room to teach.
 *
 * NO PINNED STRIP in phase 1. It belongs with the desk canvas, where a long
 * scroll past the drawing actually happens.
 */
export function Plate({ line }: { line: RecordLine }) {
  const [expanded, setExpanded] = useState(false);
  const parts = elevationPartsFor(line);
  const units = unitsOf(line);

  return (
    <>
      <figure className="lp-plate" data-testid="line-plate">
        <button
          type="button"
          className="lp-plate__face"
          data-testid="line-plate-open"
          aria-label={`Enlarge the drawing of ${line.code || "this opening"}`}
          onClick={() => setExpanded(true)}
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

      <SidePanel
        open={expanded}
        onClose={() => setExpanded(false)}
        title={line.code || "The drawing"}
        testId="line-plate-panel"
      >
        <div className="lp-plate-big">
          <figure className="lp-plate">
            <div className="lp-plate__face lp-plate__face--static">
              <Elevation
                productSlug={line.productSlug ?? ""}
                widthMm={line.width}
                heightMm={line.height}
                parts={parts}
                axis={line.compositeAxis}
                size="lg"
                className="lp-plate__svg"
              />
            </div>
            <figcaption>
              {/* R-49's honest absence: no leaders were drawn either, and the
                  square is a stand-in rather than a measurement. */}
              {line.width && line.height
                ? `${sizeText(line)} · height × width`
                : "No size read for this opening — drawn as a square stand-in"}
            </figcaption>
          </figure>
          {parts && (
            <div className="lp-plate-parts">
              <h2>Drawn from its {joinedUnitCount(line)} units</h2>
              <ul>
                {units.map((u, i) => (
                  <li key={`${u.id}-${i}`}>
                    <span className="lp-unit__code">{unitLabel(line.code, i)}</span>
                    {u.productName}
                  </li>
                ))}
              </ul>
              <p className="lp-basis">
                Panel widths are in proportion to each unit's real size. Indicative
                arrangement — the mullion positions are confirmed on technical review.
              </p>
            </div>
          )}
          <ElevationLegend />
        </div>
      </SidePanel>
    </>
  );
}
