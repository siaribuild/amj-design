/**
 * THE LINE PAGE'S OWN URL GRAMMAR — one function, one address, one page.
 *
 * The drawing viewer is a NODE IN THE TREE, not an overlay (owner ruling R31):
 * enlarging a drawing is a navigation, so it has an address, and back is a real
 * history pop rather than a `setState(false)`. A state-only push was rejected by
 * name — back would have popped honestly, but the address bar would carry two
 * entries for one URL, a reload or a shared link would silently lose the viewer,
 * and the route table would show nothing for a test to find.
 *
 * ── ONE ROUTE, NOT THREE ────────────────────────────────────────────────────
 * `Ops2App.tsx` registers the line at `/projects/:id/line/:lineId` WITHOUT
 * `exact`, so the line path and every suffix below it match one Route entry and
 * one mounted `LinePage`. Ionic's outlet re-uses per Route, not per suffix
 * (`findViewItemByPathname`, node_modules/@ionic/react-router/dist/index.js), so
 * the viewer opens over a page that does not remount and does not re-fetch the
 * record. Registering `…/drawing` as its own Route would create a second view
 * item and undo exactly that.
 *
 * That is also what makes the suffixes SIBLINGS: this grammar admits one suffix,
 * so `drawing` and (in phase 3b) `why` cannot stack by construction.
 *
 * ── AND IT IS PURE ──────────────────────────────────────────────────────────
 * No router import, no component. `LinePage` reads `useLocation()` and hands the
 * pathname here; everything about which addresses are legal, which normalise and
 * where they normalise TO is decided in a function node can call.
 * `scripts/tests/ops2-navigation.test.mjs` holds it.
 */

export type LineView = "line" | "drawing" | "unit";

export interface LineRoute {
  view: LineView;
  /** 1-BASED position of the unit on show — `W07A` is `u1`, the ordinal the
   *  unit labels already imply. `null` unless `view` is `"unit"`. */
  unitIndex: number | null;
  /** The suffix this address SHOULD carry, appended to the line path. */
  canonical: string;
  /**
   * The address is not canonical, so the host replaces it rather than pushing.
   *
   * REPLACE, never push: a mangled or stale link must land on something real
   * without growing the history, or back from the correction would return to the
   * broken address it was just corrected from.
   */
  normalise: boolean;
}

/**
 * What follows the line's own segment in an address.
 *
 * Read off the pathname rather than by stripping a path built with
 * `encodeURIComponent`: react-router's `pathname` is the raw address and its
 * `useParams` values are decoded, so the two disagree the moment an id contains
 * anything that encodes. One segment for the id is all this needs to know.
 */
export function lineSuffixOf(pathname: string): string {
  const match = /\/line\/[^/]+(\/.*)?$/.exec(pathname);
  return match?.[1] ?? "";
}

/** The address an opener sends the reviewer to. The parser accepts what this
 *  builds, untouched — the round trip is asserted, so the two cannot drift. */
export function drawingSuffix(unitIndex?: number | null): string {
  return unitIndex == null ? "/drawing" : `/drawing/u${unitIndex}`;
}

const at = (view: LineView, unitIndex: number | null, canonical: string, given: string): LineRoute =>
  ({ view, unitIndex, canonical, normalise: canonical !== given });

/**
 * One address in, one view out — and where to replace to when the address is
 * not one this page serves.
 *
 * `unitCount` is how many units this line actually DISPLAYS (a simple opening
 * shows none), so an out-of-range ordinal is answered by the line rather than by
 * the URL alone.
 *
 * The normalisations, and each one's destination:
 *   • a malformed or out-of-range unit → the OPENING's drawing. It is still a
 *     drawing address; the reviewer keeps the drawing they asked for.
 *   • anything else outside the grammar → the line page.
 */
export function parseLineRoute(suffix: string, unitCount: number): LineRoute {
  if (suffix === "") return at("line", null, "", suffix);

  const drawing = /^\/drawing(\/.*)?$/.exec(suffix);
  if (!drawing) return at("line", null, "", suffix);

  const rest = drawing[1];
  if (rest === undefined) return at("drawing", null, "/drawing", suffix);

  // ONE SPELLING PER UNIT. `u01` is refused rather than accepted as `u1`: two
  // addresses for one place is two entries in a reviewer's history that look
  // identical, and it is the address bar that has to stay honest here.
  const unit = /^\/u([1-9][0-9]*)$/.exec(rest);
  const index = unit ? Number(unit[1]) : 0;
  if (index >= 1 && index <= unitCount) {
    return at("unit", index, drawingSuffix(index), suffix);
  }
  return at("drawing", null, "/drawing", suffix);
}
