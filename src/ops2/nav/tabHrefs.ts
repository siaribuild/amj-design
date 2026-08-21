import { useEffect } from "react";
import { browserHref } from "../shellBase";

/**
 * Give the tab bar's anchors the basename, without taking it from Ionic.
 *
 * ── WHY THIS IS NOT JUST `href={browserHref(d.path)}` ────────────────────────
 * `IonTabButton`'s `href` is NOT a browser-facing href. It is Ionic's routing
 * key, and it is used three ways:
 *
 *   1. SELECTION — `matchesTab(routeInfo.pathname, originalHref)`
 *      (node_modules/@ionic/react/dist/index.js). `routeInfo.pathname` comes
 *      from React Router's location, which is basename-STRIPPED, so it is
 *      `/projects`. A prefixed href stops matching and the bar lights nothing.
 *   2. NAVIGATION — the click handler calls the router's `navigate(originalHref)`,
 *      which goes through a history that APPLIES the basename. A prefixed href
 *      pushes `/ops2/ops2/projects`.
 *   3. THE ANCHOR — `ion-tab-button` renders `<a part="native" href>` in its
 *      shadow root, and that anchor is the only one of the three the browser
 *      resolves.
 *
 * Measured, by doing it the obvious way first: with `href={browserHref(...)}`
 * clicking Projects did not reach Projects at all — it pushed the doubled path,
 * hit the not-found route and redirected to Attention — and the bar went dark.
 * So (1) and (2) need the router path and (3) needs the browser path, and the
 * component offers one prop for all three.
 *
 * ── WHAT THIS DOES ───────────────────────────────────────────────────────────
 * Leaves the prop alone and corrects the anchor. Ionic re-renders that anchor
 * whenever the selected tab changes (the active button is given the current
 * href), so a one-shot fix would be undone on the first navigation — hence the
 * observer rather than a single pass. Rewriting is guarded on the value already
 * being prefixed, so the observer cannot trigger itself.
 *
 * `a.button-native` is `part="native"`, which is the component's own public
 * handle on that element. This is still reaching into a shadow root and it is
 * the one place in ops2 that does; it is here rather than at the call site so
 * there is one thing to delete if Ionic ever separates the two meanings.
 *
 * A no-op after switch-over, when BASENAME is "/" and browserHref() is the
 * identity — the same property that lets one bundle serve every rollout state.
 */
export function useBasenameCorrectedTabHrefs(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const correct = (button: Element) => {
      const anchor = button.shadowRoot?.querySelector<HTMLAnchorElement>("a.button-native");
      const routerPath = anchor?.getAttribute("href");
      // `More` has no href — it is a verb, and there is nothing to open in a
      // new tab. Leave it without one rather than inventing a destination.
      if (!anchor || routerPath === null || routerPath === undefined) return;
      const wanted = browserHref(routerPath);
      if (routerPath !== wanted) anchor.setAttribute("href", wanted);
    };

    const buttons = [...document.querySelectorAll("ion-tab-button")];
    const observers = buttons.map((button) => {
      correct(button);
      if (!button.shadowRoot) return null;
      const observer = new MutationObserver(() => correct(button));
      observer.observe(button.shadowRoot, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["href"],
      });
      return observer;
    });

    return () => observers.forEach((observer) => observer?.disconnect());
  }, [enabled]);
}
