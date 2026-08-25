import type { ViewerSubject } from "../chrome/DrawingViewer";
import type { LineRoute } from "./lineRoute";
import {
  elevationPartsFor, joinedUnitCount, sizeText, unitLabel, unitsOf, type RecordLine,
} from "./record";

/**
 * WHAT THE VIEWER IS HANDED — every sentence on the enlarged drawing, decided
 * where node can read it.
 *
 * The viewer itself is presentation-only, so if the copy lived in the component
 * the only way to check a caption would be to open a browser. Here it is a pure
 * function of the line and the address, and `scripts/tests/ops2-record.test.mjs`
 * holds it.
 *
 * ── THE CAPTION CARRIES THE SIZE; THE TITLE CARRIES THE SUBJECT ─────────────
 * The owner's ruling (VIEW-AC-1a): a unit shows its own code, the line's own
 * drawing is titled simply `Drawing`, and the size lives under the drawing. The
 * reason given was that the back control already names the line, so a title
 * repeating the code would say it twice — which is now true only of the door
 * from the line page; from the record's canvas that control names the record
 * (VIEW-AC-15). The ruling is unchanged either way, and deliberately so: the
 * title is a property of the SUBJECT, not of how the reviewer arrived, and a
 * bar whose heading depended on the door would be a worse thing than a
 * repetition.
 */

/** The arrangement caveat. It states what the drawing is WORTH — not how to
 *  read it — so R25's ban on explanatory notation leaves it alone. */
const BASIS = "Indicative arrangement — the mullion positions are confirmed on technical review.";

/** R-49's honest absence, verbatim as the plate has always said it: no leaders
 *  are drawn either, and the square is a stand-in rather than a measurement. */
const NO_SIZE = "No size read for this opening — drawn as a square stand-in";

const sized = (o: { width: string; height: string }) =>
  Number(o.width) > 0 && Number(o.height) > 0;

/** What one frame of an opening is CALLED — `W07A` under a coded line. The
 *  parser keeps a line whose code it could not read, and there is no letter to
 *  append to nothing, so the ordinal names it instead. One helper because the
 *  units list and the unit's own viewer must agree: a row reading `A` under a
 *  viewer titled `Unit 1` is two names for one frame. */
const unitName = (code: string, index: number) =>
  (code ? unitLabel(code, index) : `Unit ${index + 1}`);

/**
 * How many units this line actually OFFERS to enlarge.
 *
 * The URL grammar answers an out-of-range ordinal against this, so it has to be
 * the count the units list displays and not the segment count: a simple opening
 * lists none, and fewer than two units is a single frame rather than a split
 * (`elevationPartsFor`'s own rule). Units, not rows — a symmetric split is one
 * segment carrying qty 2.
 */
export function viewerUnitCount(line: RecordLine): number {
  return joinedUnitCount(line) >= 2 ? unitsOf(line).length : 0;
}

/** `1500 × 1200 mm` when every unit is the same size, and nothing when they are
 *  not — a caption that names one size for units of two sizes is a claim the
 *  drawing above it contradicts. */
function sharedUnitSize(line: RecordLine): string | null {
  const sizes = new Set(unitsOf(line).map((u) => sizeText(u)));
  return sizes.size === 1 ? [...sizes][0] : null;
}

export function drawingSubject(
  line: RecordLine,
  route: Pick<LineRoute, "view" | "unitIndex">,
  /**
   * WHERE BACK GOES, and therefore what it is allowed to say (VIEW-AC-15).
   *
   * There are exactly two ways into this viewer, and they return to different
   * places. `null` is the line's own page — back names the line, as it always
   * has. A string is the RECORD'S REFERENCE, which is what the record's desk
   * canvas passes: from there back returns to the record, and a control naming
   * the line would promise a page that journey never visits.
   *
   * The reference rather than the project's name because `LinePage`'s own back
   * control has always named this destination that way, and one destination may
   * not carry two vocabularies in one console (owner ruling, §13.17 VETOED).
   * Empty falls back to `Project` — the same precedent's word, and the same rule
   * `line.code` follows in falling back to `the line`: a control nobody can name
   * aloud is not a control. `LinePage` owns the pair; if one changes, both do.
   */
  backTo: string | null,
): ViewerSubject | null {
  if (route.view === "line") return null;

  const backLabel = backTo === null ? (line.code || "the line") : (backTo || "Project");
  // THE OPENING, NAMED AS BEST WE CAN — one fallback, both paths. The parser
  // keeps a line whose code it could not read, so every sentence built here has
  // to survive an empty one; interpolating it raw ends a caption mid-air ("unit
  // 1 of 2 in ") and titles the viewer with a bare letter.
  const opening = line.code || "this opening";
  const units = viewerUnitCount(line);

  if (route.view === "unit") {
    const index = route.unitIndex ?? 0;
    // A viewer rendering `undefined` as a drawing is worse than one that does
    // not open. The route grammar normalises this away first; refusing it here
    // too means a second caller cannot reintroduce it.
    if (index < 1 || index > units) return null;
    const unit = unitsOf(line)[index - 1];
    // The caption drops its leading code where there is none to lead with: the
    // place clause already says "unit 1 of 2", and saying it twice is worse
    // than a caption that starts with the size.
    const code = unitName(line.code, index - 1);
    const lead = line.code ? `${code} · ` : "";
    const place = `unit ${index} of ${units} in ${opening}`;
    return {
      code,
      title: code,
      backLabel,
      productSlug: unit.productSlug ?? "",
      width: unit.width,
      height: unit.height,
      // ONE FRAME. Handing the generator a one-element `parts` draws a join
      // that does not exist.
      parts: undefined,
      axis: null,
      caption: !sized(unit)
        ? NO_SIZE
        // The overall clause stops where the fact stops: "which is size not
        // read overall" reads as a rendering fault rather than as an absence.
        : sized(line)
          ? `${lead}${sizeText(unit)} · ${place}, which is ${sizeText(line)} overall`
          : `${lead}${sizeText(unit)} · ${place}`,
      units: [],
      basis: null,
    };
  }

  const parts = elevationPartsFor(line);
  const shared = units > 0 ? sharedUnitSize(line) : null;
  return {
    code: opening,
    title: "Drawing",
    backLabel,
    productSlug: line.productSlug ?? "",
    width: line.width,
    height: line.height,
    parts,
    axis: line.compositeAxis,
    caption: !sized(line)
      ? NO_SIZE
      : units > 0
        ? `${sizeText(line)} overall · height × width · drawn from its ${units} units`
          + (shared ? ` of ${shared}` : "")
        : `${sizeText(line)} · height × width`,
    units: units > 0
      ? unitsOf(line).map((u, i) => ({
        code: unitName(line.code, i),
        productName: u.productName,
        size: sizeText(u),
      }))
      : [],
    basis: units > 0 ? BASIS : null,
  };
}
