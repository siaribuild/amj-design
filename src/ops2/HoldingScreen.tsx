import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle,
  IonContent, IonPage,
} from "@ionic/react";
import { useLocation } from "react-router-dom";
import "./HoldingScreen.css";

// The whole of ops2, for now. It exists to prove five things are wired — the
// route reaches the Worker, Cloudflare Access let the person through, the
// bundle mounted, Ionic is the component vocabulary, and FrameFlow is what
// themes it — and to prove nothing else. Navigation comes next; the project
// tree after that.
//
// It is built from Ionic components rather than divs for the same reason: a
// scaffold that proves the theme drives Ionic has to render an Ionic component
// to prove it on. IonPage is not optional dressing — IonRouterOutlet's page
// stack expects each route to render one.
export function HoldingScreen({ basename }: { basename: string }) {
  const { pathname } = useLocation();
  return (
    <IonPage>
      <IonContent>
        <div className="ops2-holding">
          <IonCard className="ops2-holding__card">
            <IonCardHeader>
              <IonCardSubtitle className="ds-type-label-md">OpenFrame</IonCardSubtitle>
              <IonCardTitle className="ds-type-display-md">ops2</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p className="ops2-holding__body ds-type-body-md">
                The new console is scaffolded and nothing is built on it yet.
                You are signed in, the route resolved, and the design system is
                loaded. Navigation is the next step.
              </p>
              <dl className="ops2-holding__facts ds-type-caption">
                <div className="ops2-holding__fact">
                  <dt>Router base</dt>
                  <dd>{basename}</dd>
                </div>
                <div className="ops2-holding__fact">
                  <dt>Route</dt>
                  <dd>{pathname}</dd>
                </div>
              </dl>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
}
