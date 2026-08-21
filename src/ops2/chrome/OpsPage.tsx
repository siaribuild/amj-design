import type { ReactNode } from "react";
import {
  IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonToolbar,
} from "@ionic/react";
import { notificationsOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import type { Destination } from "../nav/destinations";
import { HOME_PATH } from "../nav/destinations";
import { Wordmark } from "../nav/Wordmark";
import { AccountButton } from "../nav/AccountButton";
import { useOps2Account } from "../nav/account";
import { useRailWidth } from "../nav/useRailWidth";

/**
 * Every destination's page frame: the content area's own top bar, and the
 * heading the focus manager lands on.
 *
 * WHAT IS AND IS NOT IN THIS BAR. It carries no destinations — the rail and the
 * tab bar carry all of them, and a top bar that also offered places would be
 * C6's forbidden second navigation band. What it carries is the console's
 * identity where the rail is not there to carry it, and the two controls the
 * owner's screenshots put at the trailing edge.
 *
 * The DESTINATION NAME is not in the toolbar. It is the `<h1>` at the top of
 * the content, which is where R-164's focus manager (`focusManagerPriority:
 * ["heading", "content"]`, set in Ops2App) puts focus on every navigation — so
 * the first thing a screen reader says after a tab change is the name of the
 * place you arrived at. Putting it in the toolbar instead would give the
 * manager an ion-title in shadow DOM to find and would print the name twice on
 * a desktop that already has the rail lit.
 *
 * IonPage is not dressing: IonRouterOutlet's page stack expects each route to
 * render exactly one, and this is the only place ops2 renders it.
 */
export function OpsPage({
  destination, children,
}: {
  destination: Destination;
  children?: ReactNode;
}) {
  const wide = useRailWidth();
  const account = useOps2Account();
  const history = useHistory();

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar className="ops2-topbar">
          {/* Below the rail's change point the console has no other place to
              say what it is. Above it, the rail's own wordmark is on screen and
              a second one would be repetition, not reassurance. */}
          {!wide && (
            <IonButtons slot="start">
              <Wordmark className="ops2-wordmark--bar" />
            </IonButtons>
          )}
          <IonButtons slot="end">
            {/* The bell is a shortcut to Attention, which IS this console's
                notification surface — so it is a link to a real place rather
                than a control that opens a list nothing populates.
                NO UNREAD DOT, deliberately. What counts as unread is the
                Attention destination's own definition and that destination is
                not built yet; a dot invented here would eventually contradict
                the page it points at, and a dot that is always on teaches the
                eye to stop looking at it. It goes on the day Attention has a
                count to lend it. */}
            <button
              type="button"
              className="ops2-bell"
              aria-label="Attention"
              onClick={() => history.push(HOME_PATH)}
            >
              <IonIcon icon={notificationsOutline} aria-hidden="true" />
            </button>
            {wide && <AccountButton account={account} variant="topbar" id="ops2-account-topbar" />}
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ops2-page">
        <div className="ops2-page__body">
          <h1 className="ops2-page__title ds-type-heading-lg">{destination.label}</h1>
          {children}
        </div>
      </IonContent>
    </IonPage>
  );
}
