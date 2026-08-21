import type { ReactNode } from "react";
import {
  IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonToolbar, useIonRouter,
} from "@ionic/react";
import { chevronBack, notificationsOutline } from "ionicons/icons";
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
 *
 * ── THE HEAD ROW, AND WHY IT HAS A FLOOR ─────────────────────────────────────
 * `eyebrow`, `lede`, `headActions` and `headOverlay` exist for the Projects
 * queue and are optional everywhere else. `headOverlay` is the owner's rule
 * about search, stated by him and built structurally rather than tuned:
 *
 *   "Keep within one line, search entry field shall not add another line."
 *
 * So the overlay is ABSOLUTELY POSITIONED over the heading block and the
 * heading block is hidden with `visibility`, not unmounted — a hidden box still
 * occupies its space, so the row cannot change height when the two swap, and
 * nothing below it can reflow. The row also carries a floor (`--ops2-head-row`)
 * big enough for a control, because a one-line `<h1>` is shorter than an input
 * and the taller of the two has to set the height in BOTH states or the
 * guarantee is only true in one direction.
 */
export function OpsPage({
  destination, title, backTo, eyebrow, lede, headActions, headOverlay,
  width = "measure", children,
}: {
  destination: Destination;
  /** Overrides the destination's own name in the `<h1>`. For pages BELOW a
   *  destination, which keep its route (and so keep its tab lit) but are not it. */
  title?: string;
  /** Back names its DESTINATION, never where you are — the settled rule. */
  backTo?: { label: string; href: string };
  eyebrow?: { text: string; icon?: string };
  lede?: string;
  /** The trailing edge of the head row: the surface's own controls. */
  headActions?: ReactNode;
  /** Replaces the heading IN PLACE, at the same height. See the note above. */
  headOverlay?: ReactNode;
  /** `measure` caps the body at a reading measure; `full` releases it for a
   *  surface whose value is columns across the available width. */
  width?: "measure" | "full";
  children?: ReactNode;
}) {
  const wide = useRailWidth();
  const account = useOps2Account();
  const history = useHistory();
  const router = useIonRouter();

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
        <div className={`ops2-page__body ops2-page__body--${width}`}>
          {/* A plain <button>, not IonBackButton: `ion-back-button` ignores
              `text=""` and ignores `text` changing after hydration (the
              handover's table), and this one names its destination — which is
              the settled rule and the thing that component makes hardest.

              IT POPS WHEN THERE IS SOMETHING TO POP. Pushing the destination
              instead read as queue → record → queue in the history, so browser
              Back from the queue re-opened the record just left, and every trip
              through a record grew the stack by two. On a phone that is the
              hardware Back button — the one control a person presses without
              looking. The push survives as the COLD-LINK fallback, which is the
              case the label exists for: arrive at a record from an email and
              there is no queue behind you to return to. */}
          {backTo && (
            <button
              type="button"
              className="ops2-page__back ds-type-caption"
              onClick={() => {
                if (router.canGoBack()) router.goBack();
                else router.push(backTo.href, "back");
              }}
            >
              <IonIcon icon={chevronBack} aria-hidden="true" />
              {backTo.label}
            </button>
          )}
          <div className="ops2-page__head">
            <div className="ops2-page__heading" data-quiet={headOverlay ? "true" : undefined}>
              {eyebrow && (
                <p className="ops2-page__eyebrow ds-type-label-md">
                  {eyebrow.icon && <IonIcon icon={eyebrow.icon} aria-hidden="true" />}
                  {eyebrow.text}
                </p>
              )}
              <h1 className="ops2-page__title ds-type-heading-lg">{title ?? destination.label}</h1>
              {lede && <p className="ops2-page__lede ds-type-body-md">{lede}</p>}
            </div>
            {headOverlay
              ? <div className="ops2-page__head-overlay">{headOverlay}</div>
              : headActions && <div className="ops2-page__head-actions">{headActions}</div>}
          </div>
          {children}
        </div>
      </IonContent>
    </IonPage>
  );
}
