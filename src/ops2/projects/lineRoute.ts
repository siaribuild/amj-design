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

export type LineView = "line" | "drawing" | "unit" | "why";

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

/**
 * WHICH DOOR THE VIEWER WAS OPENED THROUGH — carried on the history entry.
 *
 * There are exactly two ways in, and they return to different places: the
 * line's own page, and the record's desk canvas. The ADDRESS is the same either
 * way (D9 — one grammar), so it cannot answer this, and the back control's
 * label depends on it (VIEW-AC-15).
 *
 * ── AND WHETHER THERE WAS A DOOR AT ALL ─────────────────────────────────────
 * EVERY open is marked, not only the canvas's, because the mark answers two
 * separate questions and only one of them is about the door:
 *
 *   • its VALUE says which page to return to, and what the control may say;
 *   • its PRESENCE says this viewer was opened from a page in this session — so
 *     that page is the entry behind this one, and back is a real pop.
 *
 * Marking only the canvas made presence and door the same fact, and the record
 * door then answered the second question by accident while the line door could
 * not answer it at all. A reloaded line drawing took the cold path and REPLACED
 * itself onto the line page it had been opened from, leaving two identical
 * entries and a back control that appeared to do nothing.
 *
 * Per-entry state is the only thing that can answer the second question, and
 * that is worth saying because three cheaper-looking sources cannot:
 * `history.length` counts a tab's entries, not ours, so a URL typed over an
 * existing page reads as warm; `document.referrer` is empty on a reload; and the
 * Navigation Timing type says how THIS DOCUMENT was loaded, not what is behind
 * it. State is attached to the entry a pop would return to, which is precisely
 * the thing being asked about.
 *
 * A genuinely cold arrival — pasted, emailed, a new tab — carries no state,
 * reads as the line, and replaces (VIEW-AC-2b).
 */
export const VIEWER_FROM_LINE = { viewerFrom: "line" } as const;
export const VIEWER_FROM_RECORD = { viewerFrom: "record" } as const;

/** The rationale screen's own mark, and it is a SEPARATE key from the viewer's.
 *
 *  Same second question — was this opened from a page in this session, so is
 *  back a real pop? — and no first question, because the rationale has exactly
 *  one door: the panel on the line page. Only presence is asked.
 *
 *  Separate rather than shared, because the two surfaces have different exits.
 *  One key read by both would make a drawing entry and a rationale entry
 *  indistinguishable, and each one's back would then be decided by the other's
 *  rule. */
export const WHY_FROM_LINE = { whyFrom: "line" } as const;

type ViewerDoor = "line" | "record";

/** The door this viewer was opened through, or `null` for a cold arrival that
 *  used no door at all. One reader, because it is one fact. */
export function viewerDoor(state: unknown): ViewerDoor | null {
  const from = (state as { viewerFrom?: unknown } | null | undefined)?.viewerFrom;
  return from === "record" || from === "line" ? from : null;
}

/** Was this rationale entry opened from the panel, or arrived at cold? */
export function whyDoor(state: unknown): boolean {
  return (state as { whyFrom?: unknown } | null | undefined)?.whyFrom === "line";
}

/** The address an opener sends the reviewer to. The parser accepts what this
 *  builds, untouched — the round trip is asserted, so the two cannot drift. */
export function drawingSuffix(unitIndex: number | null): string {
  return unitIndex == null ? "/drawing" : `/drawing/u${unitIndex}`;
}

/** The rationale screen's address — one suffix, no ordinals. A unit has no
 *  `why` of its own: its facts arrive inside its parent's rationale, because
 *  the estimator recommends a product per OPENING. */
export const WHY_SUFFIX = "/why";

const at = (view: LineView, unitIndex: number | null, canonical: string, given: string): LineRoute =>
  ({ view, unitIndex, canonical, normalise: canonical !== given });

/**
 * One address in, one view out — and where to replace to when the address is
 * not one this page serves.
 *
 * `unitCount` is how many units this line actually DISPLAYS (a simple opening
 * shows none), so an out-of-range ordinal is answered by the line rather than by
 * the URL alone. `hasWhy` is its twin, and is here for the same reason: whether
 * `/why` is an address THIS line serves is a fact about the line — a rationale
 * that was never recorded has no screen behind it — and answering it anywhere
 * else would put one rule in two places.
 *
 * The normalisations, and each one's destination:
 *   • a malformed or out-of-range unit → the OPENING's drawing. It is still a
 *     drawing address; the reviewer keeps the drawing they asked for.
 *   • `/why` on a line with no detail → the line page.
 *   • anything else outside the grammar → the line page.
 */
export function parseLineRoute(suffix: string, unitCount: number, hasWhy: boolean): LineRoute {
  if (suffix === "") return at("line", null, "", suffix);

  if (suffix === WHY_SUFFIX) {
    return hasWhy ? at("why", null, WHY_SUFFIX, suffix) : at("line", null, "", suffix);
  }

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
