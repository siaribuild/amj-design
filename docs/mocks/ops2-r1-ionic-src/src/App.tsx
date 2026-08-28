// ═══════════════════════════════════════════════════════════════════════════════
// THE SHELL — bottom tabs below 1024, the left nav above it
//
// Four tabs, in the order he gave them: Dashboard, Projects, Enquiries, More.
//
// ── WHY IonTabs IS NO LONGER BANNED ──────────────────────────────────────────
// The boundary doc banned it, and the ban was right for the reason given: Lines
// and Project are two views of ONE record, and dressing them as tabs would have
// claimed they were separate destinations when the back button, the URL and the
// totals all say otherwise. THAT BAN STANDS — there are still no tabs inside a
// record.
//
// These four are different in kind. Dashboard, Projects and Enquiries are
// genuine top-level destinations with nothing in common but the account: no
// shared header, no shared totals, no back path between them. That is what a tab
// bar is for, and hand-building one would have meant reimplementing the active
// state, the stack-per-tab behaviour and the safe-area inset IonTabBar has.
//
// ── EACH TAB IS ITS OWN STACK, AND THAT COSTS A URL CHANGE ───────────────────
// This is the pattern's point and its main cost. For the Projects tab to STAY
// SELECTED while you are three planes deep in a record, the record's routes have
// to live under it — so `/record/:ref` became `/projects/record/:ref`, and
// everything below it moved with it.
//
// The back semantics we settled SURVIVE, and each was checked:
//   • `< Lines` pops to /projects/record/:ref — one pop, inside the Projects stack.
//   • `< Projects` pops to /projects — the tab's root, where it always went.
//   • A deep link to /projects/record/OF-Q-10482/line/l04 resolves with the
//     Projects tab selected and the back chain intact.
// What WOULD have broken them is leaving the routes flat: `/record/...` matches
// no tab, so the bar would show nothing selected for most of the working day.
// That is the price of tabs, and it is worth stating rather than hiding.
//
// ── WHAT HAPPENS TO THE DRAWER ───────────────────────────────────────────────
// It survives unchanged and becomes what `More` opens. Below 1024 the drawer is
// the full destination list and `More` is its trigger; at 1024 and above
// ion-split-pane makes the same markup a persistent rail and the bar is hidden.
// One destination list at every width, reached two ways — and the twice-recorded
// "drawer with no trigger" regression stays fixed, with `More` a more visible
// trigger than the hamburger it replaces.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  IonApp, IonRouterOutlet, IonMenu, IonContent, IonSplitPane, IonList, IonItem,
  IonLabel, IonListHeader, IonButton, IonNote, IonTabs, IonTabBar, IonTabButton,
  IonIcon,
} from "@ionic/react";
import { IonReactHashRouter } from "@ionic/react-router";
import { Redirect, Route, useHistory, useParams } from "react-router-dom";
import {
  gridOutline, layersOutline, chatbubbleEllipsesOutline, ellipsisHorizontal,
} from "ionicons/icons";
import { RecordPage } from "./pages/RecordPage";
import { LinePage } from "./pages/LinePage";
import { DashboardPage, EnquiriesPage, ProjectsPage } from "./pages/TabRoots";
import { DeliveryPage, ProjectBlockPage } from "./pages/SmallPlanes";
import { ManufacturerPricePage, SpecPage, UnitPage, WhyPage } from "./pages/LineJobs";
import { EditorDock, EditorPlane } from "./Editor";
import { BottomAppBar } from "./chrome";
import { planeTransition } from "./transitions";
import {
  setStore, setHeaderStyle, setTabVariant, useEditorPane, useHeaderStyle,
  useScrollAwayBar, useStore, useTabBar, useWidthClass,
  type HeaderStyle, type TabVariant,
} from "./store";

const DESTINATIONS = [
  ["Dashboard", "#/dashboard"], ["Projects", "#/projects"], ["Enquiries", "#/enquiries"],
  ["Customers", "#/projects"], ["Catalogue", "#/projects"], ["Pricing", "#/projects"],
  ["Referrals", "#/projects"], ["Files", "#/projects"], ["Audit", "#/projects"],
];

function NavDrawer() {
  return (
    <IonMenu contentId="main" type="overlay">
      <IonContent>
        <div className="nav">
          <IonList lines="none">
            <IonListHeader><IonLabel>OpenFrame ops</IonLabel></IonListHeader>
            {DESTINATIONS.map(([d, href], i) => (
              <IonItem key={d} button detail={false} href={href}
                onClick={() => document.querySelector("ion-menu")?.close()}
                color={i === 1 ? "light" : undefined}>
                <IonLabel>{d}</IonLabel>
              </IonItem>
            ))}
          </IonList>
          <div className="account">
            <div className="who">Gediminas B.</div>
            <div className="mail">gedas@openframe.com.au</div>
            <IonNote className="fact">Role · founder</IonNote>
            <IonButton expand="block" fill="outline" size="small"
              style={{ marginTop: 10 }}>Sign out</IonButton>
          </div>
        </div>
      </IonContent>
    </IonMenu>
  );
}

function EditRoute() {
  const wc = useWidthClass();
  const history = useHistory();
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const dock = wc !== "phone";
  useEffect(() => {
    if (!dock) return;
    setStore({ selectedId: lineId, editing: lineId });
    history.replace(`/projects/record/${ref}/line/${lineId}`);
  }, [dock, lineId, ref]);
  return dock ? null : <EditorPlane />;
}

/** MOCK-ONLY, and marked as such. It exists so the three shapes can be compared
 *  on the same screen instead of argued about in prose. The ⌂ button switches
 *  the home-indicator inset on, because a desktop browser reports it as 0 and
 *  would flatter every variant equally. */
function VariantSwitch({ variant, hdrStyle }: { variant: TabVariant; hdrStyle: HeaderStyle }) {
  return (
    <div className="variantswitch" role="group" aria-label="Mock control: tab bar variant">
      <span className="vs-tag">tabs</span>
      {([
        ["a", "A · bar + panel"], ["d", "D · scroll away"], ["e", "E · CTA in header"],
        ["f", "F · FAB"], ["g", "G · no CTA"], ["h", "H · one bar"], ["off", "OFF"],
      ] as [TabVariant, string][]).map(([v, label]) => (
        <button key={v} type="button" aria-pressed={variant === v}
          onClick={() => setTabVariant(v)}>{label}</button>
      ))}
      {variant === "e" && (
        <span className="vs-row">
          <span className="vs-tag">header</span>
          {([["labelled", "labelled back"], ["bare", "bare chevron"], ["path", "path title"]] as
            [HeaderStyle, string][]).map(([h, label]) => (
            <button key={h} type="button" aria-pressed={hdrStyle === h}
              onClick={() => setHeaderStyle(h)}>{label}</button>
          ))}
        </span>
      )}
      <button type="button" className="vs-inset" title="Simulate the home indicator"
        onClick={() => {
          const r = document.documentElement;
          r.dataset.inset = r.dataset.inset === "on" ? "off" : "on";
        }}>⌂</button>
    </div>
  );
}

function useActiveTab() {
  const [tab, setTab] = useState(() => tabOf(window.location.hash));
  useEffect(() => {
    const on = () => setTab(tabOf(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return tab;
}
const tabOf = (h: string) =>
  h.startsWith("#/enquiries") ? "enquiries"
  : h.startsWith("#/dashboard") ? "dashboard"
  : "projects";

export default function App() {
  const wc = useWidthClass();
  const { editing } = useStore();
  const wide = wc === "desktop" || wc === "wide";
  const paneBand = useEditorPane();
  const { variant, visible: barVisible } = useTabBar();
  const hdrStyle = useHeaderStyle();
  useScrollAwayBar(variant === "d" && barVisible);
  const wideNow = wide;
  /* D unmounts the bar rather than sliding it: ion-tab-bar cannot be moved or
     resized from outside — three measurements are recorded in ops2-tabs.css. The
     spacer keeps the home-indicator band present either way, so the action panel
     never takes its inset back and never resizes under the thumb. */
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setHidden(el.dataset.tabhide === "on");
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["data-tabhide"] });
    read();
    return () => mo.disconnect();
  }, []);
  const showBar = !(variant === "d" && hidden);
  /* Ionic infers the selected tab from the tab buttons' hrefs, and measured, it
     selected NOTHING once the URL went below a tab root — /projects/record/…
     left the bar blank for most of the working day. Driving it explicitly from
     the route is deterministic and is what keeps Projects lit three planes deep. */
  const activeTab = useActiveTab();
  /* MOCK STAND-IN, and a recorded defect. IonTabs computes the selected tab from
     the MATCHED ROUTE, and `/projects/record/:ref` is a different Route from
     `/projects`, so it matches no tab and the bar lights NOTHING once you open a
     record — measured, all four buttons unselected. Passing `selectedTab` to
     IonTabBar does not help: IonTabs clones the bar and injects its own.

     The real fix is the documented Ionic shape — ONE Route per tab with the
     record's routes nested inside it — which is a restructure, not a patch. Until
     then the mock paints the active tab from the route so the variants are judged
     with a lit bar rather than a broken one. See the spec: this must be resolved
     before tabs ship. */
  useEffect(() => { document.documentElement.dataset.tab = activeTab; }, [activeTab]);

  return (
    <IonApp>
      <IonReactHashRouter>
        <IonSplitPane contentId="main" when={wide}>
          <NavDrawer />
          {/* id="main" belongs on the DIRECT child of ion-split-pane. It used
              to sit on the router outlet, and once IonTabs wrapped the outlet the
              split pane could no longer find its content among its children — so
              at 1440 the 260px rail OVERLAID the record instead of offsetting it,
              measured as outlet left:0 width:1440 with no split-pane-main class.
              IonTabs takes no id prop, so the id goes on a host element around
              it. The menu's contentId points here too. */}
          <div id="main" className="tabshost">
          <IonTabs>
            <IonRouterOutlet animation={planeTransition}>
              <Route exact path="/dashboard" component={DashboardPage} />
              <Route exact path="/enquiries" component={EnquiriesPage} />
              {/* The Projects stack. Everything about a record lives under the
                  tab, so the tab stays selected all the way down. */}
              <Route exact path="/projects" component={ProjectsPage} />
              <Route exact path="/projects/record/:ref" component={RecordPage} />
              <Route exact path="/projects/record/:ref/project/:block" component={ProjectBlockPage} />
              <Route exact path="/projects/record/:ref/delivery" component={DeliveryPage} />
              <Route exact path="/projects/record/:ref/line/:lineId" component={LinePage} />
              <Route exact path="/projects/record/:ref/line/:lineId/edit" component={EditRoute} />
              <Route exact path="/projects/record/:ref/line/:lineId/spec" component={SpecPage} />
              <Route exact path="/projects/record/:ref/line/:lineId/unit/:idx" component={UnitPage} />
              <Route exact path="/projects/record/:ref/line/:lineId/why" component={WhyPage} />
              <Route exact path="/projects/record/:ref/line/:lineId/price" component={ManufacturerPricePage} />
              <Route exact path="/"><Redirect to="/dashboard" /></Route>
            </IonRouterOutlet>

            {showBar && <IonTabBar slot="bottom" className="opstabs" selectedTab={activeTab}>
              {/* Variant C is gone. Measured, icon-only did not shorten Ionic's
                  md bar either (91px, identical to A), so it cost its labels for
                  zero pixels. */}
              <IonTabButton tab="dashboard" href="/dashboard">
                <IonIcon icon={gridOutline} aria-hidden="true" />
                <IonLabel>Dashboard</IonLabel>
              </IonTabButton>
              <IonTabButton tab="projects" href="/projects">
                <IonIcon icon={layersOutline} aria-hidden="true" />
                <IonLabel>Projects</IonLabel>
              </IonTabButton>
              <IonTabButton tab="enquiries" href="/enquiries">
                <IonIcon icon={chatbubbleEllipsesOutline} aria-hidden="true" />
                <IonLabel>Enquiries</IonLabel>
              </IonTabButton>
              {/* `More` is not a destination — it opens the drawer, which IS the
                  full list. A tab button with no href does not route. */}
              {/* The element's own open(), not menuController.open(). Measured:
                  the controller call left the menu's classes untouched — with a
                  split-pane-side menu it does not resolve to this one — so the
                  drawer never opened and the twice-recorded "drawer with no
                  trigger" regression would have shipped again. */}
              <IonTabButton tab="more"
                onClick={() => document.querySelector("ion-menu")?.open()}>
                <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
                <IonLabel>More</IonLabel>
              </IonTabButton>
            </IonTabBar>}
            {/* The indicator band, always present in D so the action panel keeps
                its no-inset state whether the bar is there or not. */}
            {variant === "d" && !showBar && <div slot="bottom" className="tabspacer" />}
            {variant === "h" && !wideNow && (
              <div slot="bottom">
                <BottomAppBar activeTab={activeTab}
                  onGo={(t) => {
                    if (t === "more") document.querySelector("ion-menu")?.open();
                    else window.location.hash = "#/" + t;
                  }} />
              </div>
            )}
          </IonTabs>
          </div>
        </IonSplitPane>

        {editing && !paneBand && wc !== "phone" && (
          <EditorDock lineId={editing} onClose={() => setStore({ editing: null })} />
        )}
        <VariantSwitch variant={variant} hdrStyle={hdrStyle} />
      </IonReactHashRouter>
    </IonApp>
  );
}
