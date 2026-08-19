import { useEffect } from "react";
import {
  IonApp, IonRouterOutlet, IonMenu, IonContent, IonSplitPane, IonList, IonItem,
  IonLabel, IonListHeader, IonButton, IonNote,
} from "@ionic/react";
import { IonReactHashRouter } from "@ionic/react-router";
import { Redirect, Route, useHistory, useParams } from "react-router-dom";
import { RecordPage } from "./pages/RecordPage";
import { LinePage } from "./pages/LinePage";
import { AlternativesPage, DeliveryPage, LineNotesPage, ProjectBlockPage, ProjectListPage } from "./pages/SmallPlanes";
import { EditorDock, EditorPlane } from "./Editor";
import { planeTransition } from "./transitions";
import { setStore, useEditorPane, useStore, useWidthClass } from "./store";

const DESTINATIONS = ["Projects", "Enquiries", "Customers", "Catalogue",
  "Pricing", "Referrals", "Files", "Audit"];

/* The nav drawer. IonMenu gives the overlay, the scrim, Esc and scrim dismissal,
   the focus trap and the scroll lock; ion-list gives the rows. The destinations
   are a VERTICAL list — eight of them as chips in a strip would be ~700px, which
   is exactly what critique 1 forbids. */
function NavDrawer() {
  return (
    <IonMenu contentId="main" type="overlay">
      <IonContent>
        <div className="nav">
          <IonList lines="none">
            <IonListHeader><IonLabel>OpenFrame ops</IonLabel></IonListHeader>
            {DESTINATIONS.map((d, i) => (
              <IonItem key={d} button detail={false} href="#/projects"
                color={i === 0 ? "light" : undefined}
                aria-current={i === 0 ? "page" : undefined}>
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

/** D11 — the LINE url resolves at every width, and resolves to the right SHAPE.
 *  Below 1024 a line is a pushed plane. At 1024 and above it is a selection in
 *  the record surface's canvas, because there is no plane to push into — pushing
 *  one would replace the rail the reviewer is working from. One route, one IA,
 *  two geometries. */
function LineRoute() {
  const wc = useWidthClass();
  const { lineId } = useParams<{ ref: string; lineId: string }>();
  const wide = wc === "desktop" || wc === "wide";
  useEffect(() => { setStore({ selectedId: lineId }); }, [lineId]);
  return wide ? <RecordPage /> : <LinePage />;
}

/** D11 — the edit URL resolves at every width. Below 768 it is a pushed plane;
 *  at 768 and above it hands the line id to the docked panel and steps the URL
 *  back to the line, so the panel is never a page in the stack. */
function EditRoute() {
  const wc = useWidthClass();
  const history = useHistory();
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const dock = wc !== "phone";

  useEffect(() => {
    if (!dock) return;
    setStore({ selectedId: lineId, editing: lineId });
    history.replace(`/record/${ref}/line/${lineId}`);
  }, [dock, lineId, ref]);

  return dock ? null : <EditorPlane />;
}

export default function App() {
  /* C1: the rail is summoned or persistent by MEASURED width, not a media
     query — ion-split-pane's `when` accepts a boolean, so the same drawer
     becomes a persistent rail at 1024 and the change is drivable. */
  const wc = useWidthClass();
  const { editing } = useStore();
  const wide = wc === "desktop" || wc === "wide";
  const paneBand = useEditorPane();

  return (
    <IonApp>
      <IonReactHashRouter>
        <IonSplitPane contentId="main" when={wide}>
          <NavDrawer />
          <IonRouterOutlet id="main" animation={planeTransition}>
            {/* The record is NEVER the root: it is pushed from Projects, so
                back always has somewhere real to go. */}
            <Route exact path="/projects" component={ProjectListPage} />
            <Route exact path="/record/:ref" component={RecordPage} />
            <Route exact path="/record/:ref/project/:block" component={ProjectBlockPage} />
            <Route exact path="/record/:ref/delivery" component={DeliveryPage} />
            <Route exact path="/record/:ref/line/:lineId" component={LineRoute} />
            <Route exact path="/record/:ref/line/:lineId/edit" component={EditRoute} />
            {/* The line plane's two second steps. Real routes, so both are deep
                linkable and both survive a reload (D11). */}
            <Route exact path="/record/:ref/line/:lineId/alternatives" component={AlternativesPage} />
            <Route exact path="/record/:ref/line/:lineId/notes" component={LineNotesPage} />
            <Route exact path="/">
              <Redirect to="/projects" />
            </Route>
          </IonRouterOutlet>
        </IonSplitPane>
        {/* CRITIQUE 4 — the docked editor lives outside the outlet, so opening
            it never pushes a plane and never covers the line it is editing. */}
        {/* The OVERLAY band only: 768–1279. Below that the editor is a pushed
            plane; at ≥1280 it is a workspace column rendered by the record
            surface, so no modal is involved at either end. */}
        <EditorDock lineId={wc !== "phone" && !paneBand ? editing : null}
          onClose={() => setStore({ editing: null })} />
      </IonReactHashRouter>
    </IonApp>
  );
}
