import { useEffect, useState } from "react";
import { RAIL_MEDIA_QUERY } from "./destinations";

/**
 * True when the console is wide enough for the persistent rail.
 *
 * The initial value is read SYNCHRONOUSLY, in the useState initialiser, not in
 * an effect. An effect runs after the first paint, so a desktop reload would
 * paint the tab bar for one frame and then swap it for the rail — a flash of
 * the wrong navigation surface, on the widest screen, every load.
 *
 * `change` rather than the deprecated `addListener`: this is the only place in
 * ops2 that listens to a media query, so there is nothing to be consistent with
 * except the platform.
 *
 * ONE query, from `destinations.ts`. ion-split-pane takes a boolean here rather
 * than its own `when="lg"` string on purpose — Ionic's `lg` is 992px and the
 * console's change point is `--cp-shell-rail` at 1024px, and a split pane that
 * turned on 32px before the tab bar turned off would show both surfaces at
 * once (C6's forbidden second navigation band, arrived at by arithmetic).
 */
export function useRailWidth(): boolean {
  const [wide, setWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(RAIL_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(RAIL_MEDIA_QUERY);
    const read = (event: MediaQueryListEvent) => setWide(event.matches);
    query.addEventListener("change", read);
    // Re-read on mount: between the initialiser and this effect the window may
    // already have been resized (React 18 can defer commit), and a stale value
    // here is the whole navigation surface being wrong.
    setWide(query.matches);
    return () => query.removeEventListener("change", read);
  }, []);
  return wide;
}
