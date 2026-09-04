import { useEffect } from "react";
import {
  IonApp, IonIcon, IonLabel, IonMenu, IonRouterOutlet, IonSplitPane, IonTabBar,
  IonTabButton, IonTabs, setupIonicReact,
} from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Redirect, Route } from "react-router-dom";
import { ellipsisHorizontal } from "ionicons/icons";
import { BASENAME } from "./shellBase";
import {
  DESTINATIONS, HOME_PATH, TAB_DESTINATIONS, destinationRootFor, type DestinationId,
} from "./nav/destinations";
import { DESTINATION_ICON } from "./nav/icons";
import { NAV_DRAWER_ID, SHELL_CONTENT_ID, openNavDrawer } from "./nav/drawer";
import { NavPanel } from "./nav/NavPanel";
import { useRailWidth } from "./nav/useRailWidth";
import { useBasenameCorrectedTabHrefs } from "./nav/tabHrefs";
import { DestinationRoot } from "./pages/DestinationRoot";
import { ProjectsPage } from "./projects/ProjectsPage";
import { ProjectRecordPage } from "./projects/ProjectRecordPage";
import { LinePage } from "./projects/LinePage";
import { AttentionPage } from "./attention/AttentionPage";

// `react-router-dom` is v5 here, and that is deliberate: Ionic 8's router peers
// on React Router 5 while the customer site stays on 7. Never import the bare
// `react-router` specifier in this directory — it resolves to v7, type-checks,
// runs in dev, and produces a second router context in the built bundle, which
// looks like links that quietly do nothing. `scripts/tests/ops2-deps.test.mjs`
// is the guard; `docs/design/ops2-ionic-boundary.md` §2 (on the
// `design/ops2-planning` branch) is the design.

// TWO decisions live in this one argument list, and they pull in opposite
// directions. The first version of this file stated the case for the default
// and then passed nothing at all — which silently took the default for the
// other one too, and that one is a requirement.
//
//   focusManagerPriority — EXPLICIT, and must stay so. R-164 requires focus to
//   move on navigation; Ionic leaves this UNSET by default, which means focus
//   does not move at all. The rule is satisfied by configuration rather than by
//   anything the shell implements, so a bare call turns an accessibility
//   guarantee off with nothing to show for it — no error, no visual difference,
//   nothing a screenshot could catch. The order is the behaviour: the incoming
//   view's heading first, its content as the fallback. Specified at
//   `docs/design/ops2-ionic-boundary.md` line 92 (on `design/ops2-planning`),
//   and among the behavioural rules ADR 0005 says Ionic hosts rather than
//   replaces. Pinned by scripts/tests/ops2-frame.test.mjs.
//
//   Now that there are eight destinations to move between, it has something to
//   do: OpsPage puts an <h1> at the head of every page for it to land on.
//
//   mode — DEFAULT, and must stay so. Ionic picks the iOS idiom on an iPhone
//   and Material elsewhere, and that dual idiom is what the owner judged on his
//   own phone when he ruled for adoption (ADR 0005 keeps it as an explicit
//   ASSUMED). Pinning a mode here would overturn a decision he made on a
//   device, from a config file.
setupIonicReact({ focusManagerPriority: ["heading", "content"] });

/**
 * Destinations that own routes BELOW their own path, and so must not match them.
 *
 * A destination route is non-exact by default so a deep link that survives
 * Cloudflare Access lands on the destination rather than on nothing. The moment
 * a destination gains a child route that rule inverts: a non-exact parent
 * already sitting in Ionic's view stack matches its own children first and the
 * outlet re-uses it, so the child never renders. See the note at the Route.
 *
 * `scripts/tests/ops2-navigation.test.mjs` holds this set against the routes
 * that actually exist, so a record surface added without its parent being
 * listed here fails in node rather than as a page that quietly does not change.
 */
const NESTS_BELOW = new Set<DestinationId>(["projects"]);

/**
 * ops2's shell — ONE navigation surface, mounted two ways, and never absent.
 *
 * ── THE COMPOSITION, AND THE TRAP IN IT ──────────────────────────────────────
 * `ion-split-pane` finds its main node among its DIRECT children, in
 * `connectedCallback`, ONCE (node_modules/@ionic/core/components/ion-split-pane.js
 * — `styleMainElement()` walks `this.el.children` and never runs again). So the
 * element carrying `contentId` has to be a direct child at first mount.
 *
 * Putting the id on IonRouterOutlet is the obvious thing and it is wrong here,
 * because IonTabs sits between them. The planning thread hit this exactly
 * (`7f8e6e4d fix(ops2 R1i): the split pane lost its content when IonTabs
 * wrapped the outlet`) and measured the result: at 1440 the rail OVERLAID the
 * record instead of offsetting it — outlet at left:0 width:1440, no
 * `split-pane-main` class anywhere. IonTabs takes no `id` prop, so the id goes
 * on a plain host element wrapped around it.
 *
 * There are three symptoms of getting it wrong and all three are checked in
 * scripts/tests/web/ops2-navigation.spec.ts, because two of them are silent:
 * the missing `split-pane-main` class, the content not being offset by the
 * rail's width, and the console warning Ionic emits
 * ("[ion-split-pane] - Does not have a specified main node").
 *
 * ── WHY THE TAB BAR IS UNMOUNTED ABOVE THE CHANGE POINT, NOT HIDDEN ──────────
 * `ion-tab-bar` carries `contain: strict` and cannot be moved or resized from
 * outside — three techniques were measured and all three failed
 * (`docs/mocks/ops2-r1-ionic-src/src/ops2-tabs.css`). Unmounting is what the
 * component allows. It also makes C6 — exactly one navigation surface — a fact
 * about the DOM rather than about paint: above 1024 there is no bar to reveal
 * by accident, and below it there is no rail.
 *
 * ── WHY `IonTabs` AT ALL ─────────────────────────────────────────────────────
 * The ban in `docs/design/ops2-ionic-boundary.md` was on tabs INSIDE a record —
 * Lines and Job are two views of one thing and dressing them as tabs would
 * claim otherwise. THAT BAN STANDS. These four are different in kind: three
 * genuine top-level destinations with nothing in common but the account, plus
 * the control that reveals the rest. Hand-building that bar would mean
 * reimplementing the active state, the stack-per-tab behaviour and the
 * safe-area inset IonTabBar already has.
 */
export function Ops2App() {
  const wide = useRailWidth();

  // The tab bar's anchors carry the basename; its `href` PROP must not. Both
  // halves of that sentence are load-bearing and the reason is in tabHrefs.ts.
  useBasenameCorrectedTabHrefs(!wide);

  // WHO OWNS THE HOME-INDICATOR INSET, published document-wide.
  //
  // Carried forward from the mock's `ops2-tabs.css`, where it was measured:
  // "when a TAB BAR is below [an action panel], the bar is bottom-most and the
  // bar owns the inset — the panel must drop its own or the two of them pad for
  // the same 34px twice, which is 34px of nothing between the primary action
  // and the tabs. Measured with the inset simulated at 34px: the double-pad
  // cost 34px on every action screen before this rule existed."
  //
  // Nothing in THIS task has a bottom-edge action panel, so nothing reads it
  // yet. It is published now because the rule is about the bar's presence and
  // the bar is what this task adds — the next surface with a footer inherits a
  // stated answer instead of rediscovering a 34px gap.
  //
  // On <html> rather than on the console container, which is where the width
  // class belongs (interaction spec §10.6). The distinction is real: the width
  // class is "how much room does this zone have", and a 380px pane must read
  // its own. Inset ownership is "who is bottom-most on the SCREEN" — a fact
  // about the viewport, read by overlays (ion-modal, action sheets) that Ionic
  // portals to <body>, outside the console container entirely.
  useEffect(() => {
    document.documentElement.dataset.ops2Tabbar = wide ? "off" : "on";
  }, [wide]);

  return (
    <IonApp>
      <IonReactRouter basename={BASENAME}>
        <IonSplitPane contentId={SHELL_CONTENT_ID} when={wide} className="ops2-splitpane">
          {/* The rail above the change point, the drawer below it — one
              ion-menu, and ion-split-pane decides which. `type="overlay"` fixes
              the drawer's presentation: an overlay, never a route (register row
              19). */}
          <IonMenu
            contentId={SHELL_CONTENT_ID}
            // BOTH, and they are not the same thing. `menuId` sets the
            // `menu-id` ATTRIBUTE that Ionic's own menuController indexes by;
            // `id` is the DOM id. openNavDrawer() looks the element up by DOM
            // id, and with only `menuId` set the lookup returned null and
            // `More` silently did nothing — measured in the dev server, and the
            // same twice-recorded "drawer with no trigger" outcome arrived at
            // from a third direction. The id is also what the opener's
            // aria-controls will point at.
            id={NAV_DRAWER_ID}
            menuId={NAV_DRAWER_ID}
            side="start"
            type="overlay"
            className="ops2-nav-menu"
          >
            <NavPanel />
          </IonMenu>

          {/* This div exists ONLY to carry the id, and it must stay a direct
              child of the split pane. See the note above before moving it. */}
          <div id={SHELL_CONTENT_ID} className="ops2-shell-main">
            <IonTabs>
              <IonRouterOutlet>
                {/* One route per destination, non-exact, so everything that
                    lands below a destination keeps that destination lit —
                    Ionic's own `matchesTab` is a segment-prefix match and
                    isDestinationActive() mirrors it. The record routes the
                    Projects list will add nest under /projects for exactly this
                    reason; flat `/record/...` routes would match no tab and
                    leave the bar dark for most of the working day. */}
                {DESTINATIONS.map((d) => (
                  <Route
                    key={d.id}
                    path={d.path}
                    // EXACT ONLY WHERE SOMETHING NESTS BELOW, and the reason is
                    // a behaviour of Ionic's view stack rather than of React
                    // Router. `matchRoute` does keep the LAST matching child,
                    // so writing `/projects/:id` after this one is enough to
                    // win THAT lookup — but `findViewItemByPathname` searches
                    // the already-created view items with `.some()` and takes
                    // the FIRST match (node_modules/@ionic/react-router/dist/
                    // index.js, `matchView`). A non-exact `/projects` view item
                    // is already on the stack the moment the list has rendered,
                    // so it matched `/projects/p_submitted` first and the outlet
                    // reused it. Measured: the URL changed, the rail stayed lit,
                    // and the page kept rendering the list it was opened from —
                    // three of the four things you would check, all correct.
                    exact={NESTS_BELOW.has(d.id)}
                    render={() => (
                      d.id === "projects" ? <ProjectsPage /> :
                      d.id === "attention" ? <AttentionPage /> :
                      <DestinationRoot id={d.id} />
                    )}
                  />
                ))}
                {/* The record, nested under its destination exactly as the note
                    above anticipated — which is what keeps Projects lit while
                    one is open. */}
                <Route exact path="/projects/:id" render={() => <ProjectRecordPage />} />
                {/* One opening's own page — and NOT exact, which is the exact
                    opposite of its parent for a reason worth writing down.

                    The rule above ("exact only where something nests below")
                    is about DESTINATIONS whose children are DIFFERENT PAGES:
                    `/projects` must not swallow `/projects/:id`, because the
                    record is its own screen and needs its own view item.

                    This route's children are not different pages. The drawing
                    viewer is a node in the tree with its own address
                    (`…/drawing`, `…/drawing/u:N` — `./projects/lineRoute.ts`),
                    but it is a surface OVER the line page: the page behind it
                    must not remount and must not re-fetch the record. So the
                    line path and every suffix below it match ONE Route entry —
                    the outlet re-uses the mounted LinePage, exactly the stack
                    behaviour the note above describes, here used deliberately
                    instead of avoided. Registering `…/drawing` as a second
                    Route would create the second view item this needs not to
                    have.

                    `NESTS_BELOW` is untouched by any of it: the children hang
                    off this route, not off a destination.

                    It still nests under /projects, so `isDestinationActive`'s
                    segment-prefix match keeps Projects lit at every width. */}
                <Route path="/projects/:id/line/:lineId" render={() => <LinePage />} />
                <Route exact path="/"><Redirect to={HOME_PATH} /></Route>
                {/* The not-found route, replacing the scaffold's catch-all
                    rather than dropping it. Its reason is carried forward
                    verbatim: "any address under the base renders [something],
                    so a deep link that survives Cloudflare Access lands on
                    something rather than a blank page." An unmatched route
                    inside an IonRouterOutlet renders NOTHING — not an error, a
                    blank console — and behind Access that is indistinguishable
                    from an outage.

                    NO `path` PROP, and that is the whole trick. Ionic's
                    `matchRoute` (node_modules/@ionic/react-router/dist/index.js)
                    keeps the LAST child that matches, not the first — it is not
                    a Switch — and only falls back to a child with neither
                    `path` nor `from` when nothing matched at all. Written as
                    `path="*"` it matched every address, won by being last, and
                    every destination rendered blank while the tab bar carried
                    on lighting correctly. Measured: h1 absent, four tab buttons
                    present, on every route. */}
                {/* IT GOES BACK TO THE DESTINATION THE ADDRESS NAMED, and only
                    to Attention when no destination claims it. That distinction
                    arrived with `exact` above: `/projects/anything/deeper` used
                    to render Projects because the route was non-exact, and
                    would otherwise now land on the console's front door —
                    throwing away the only information the URL carried, and
                    behind Access looking exactly like being bounced by auth. */}
                <Route render={({ location }) => (
                  <Redirect to={destinationRootFor(location.pathname) ?? HOME_PATH} />
                )} />
              </IonRouterOutlet>

              {/* Below the change point only. Mounted by the SHELL and by
                  nothing else: a region that could render a bar could also lose
                  one, which is how navigation vanished at narrow width twice
                  (LEARNINGS.md §3.10, then again in the rejected pass).
                  scripts/tests/ops2-frame.test.mjs holds that ownership. */}
              {!wide && (
                <IonTabBar slot="bottom" className="ops2-tabbar">
                  {TAB_DESTINATIONS.map((d) => (
                    <IonTabButton key={d.id} tab={d.id} href={d.path}>
                      <IonIcon icon={DESTINATION_ICON[d.id]} aria-hidden="true" />
                      <IonLabel>{d.label}</IonLabel>
                    </IonTabButton>
                  ))}
                  {/* `More` opens the drawer — the SAME list the rail shows,
                      reached the other way. It carries no `href` and so never
                      lights, which is correct rather than a limitation: the bar
                      says where you are, and `More` does not move you. The
                      defence, and what is unverified about it, is in the report
                      and in docs/ops2/UX-HANDOVER.md §5. */}
                  <IonTabButton tab="more" onClick={openNavDrawer}>
                    <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
                    <IonLabel>More</IonLabel>
                  </IonTabButton>
                </IonTabBar>
              )}
            </IonTabs>
          </div>
        </IonSplitPane>
      </IonReactRouter>
    </IonApp>
  );
}
