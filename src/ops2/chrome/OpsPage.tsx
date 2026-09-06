import type { ReactNode } from "react";
import {
  IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonToolbar, useIonRouter,
} from "@ionic/react";
import { chevronBack, notificationsOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import type { Destination } from "../nav/destinations";
import { HOME_PATH } from "../nav/destinations";
import { AccountButton } from "../nav/AccountButton";
import { useOps2Account } from "../nav/account";
import { useRailWidth } from "../nav/useRailWidth";
import { useNotificationCount } from "./useNotificationCount";

/**
 * Every destination's page frame: one place that says where you are, and the
 * heading the focus manager lands on.
 *
 * ── THE NAME IS SAID ONCE, AND WHERE IT IS SAID DEPENDS ON THE WIDTH ─────────
 * At the DESK it is the toolbar's `<h1>`. On the PHONE there is no toolbar and
 * it is the first line of the page. It used to be both: a white band carrying a
 * wordmark and a bell, above a page that then announced its own name again
 * underneath. The owner called that band redundant, and on a phone it was the
 * top of a screen whose entire value is how much of the list you can see.
 *
 * IT IS ALWAYS AN `<h1>`, NEVER AN `ion-title`, wherever it sits. R-164's focus
 * manager (`focusManagerPriority: ["heading", "content"]`, set in Ops2App) lands
 * on it after every navigation, so the first thing a screen reader says on
 * arrival is the name of the place — and `ion-title` renders into shadow DOM,
 * where the manager cannot find it and where it is not a heading at all.
 *
 * The bar carries no destinations — the rail and the tab bar carry all of them,
 * and a top bar that also offered places would be C6's forbidden second
 * navigation band.
 *
 * IonPage is not dressing: IonRouterOutlet's page stack expects each route to
 * render exactly one, and this is the only place ops2 renders it.
 *
 * ── THE HEAD ROW, AND WHY IT HAS A FLOOR ─────────────────────────────────────
 * `headActions` and `headOverlay` are the PHONE's head row, where the Projects
 * queue puts its search. `headOverlay` is the owner's rule about search, stated
 * by him and built structurally rather than tuned:
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
  destination, title, backTo, headActions, headOverlay, controls, identity,
  bandPinned, width = "measure", children,
}: {
  destination: Destination;
  /** Overrides the destination's own name in the `<h1>`. For pages BELOW a
   *  destination, which keep its route (and so keep its tab lit) but are not it. */
  title?: string;
  /** Back names its DESTINATION, never where you are — the settled rule. */
  backTo?: { label: string; href: string };
  /** The surface's own controls: the phone's head row, the desk's top bar. */
  headActions?: ReactNode;
  /** Replaces the heading IN PLACE, at the same height. See the note above. */
  headOverlay?: ReactNode;
  /** The surface's own control row — tabs, search, filters. It shares the white
   *  band with the title rather than sitting on the page below it. */
  controls?: ReactNode;
  /**
   * A LINE OF IDENTITY UNDER THE TITLE, inside the band at both widths.
   *
   * The record needs it and the queue does not: a project's reference, its
   * customer and its total have to be readable together and none of them may be
   * split into the page body. On the phone it is the band's own second line; at
   * the desk it is a third `IonToolbar` in the header, which is Ionic's own way
   * of carrying more than one line and is fixed by construction — so the money
   * is on screen at every scroll position without anything being pinned.
   */
  identity?: ReactNode;
  /**
   * Keep the phone's band on screen while the body scrolls.
   *
   * OPT-IN, because the queue's band must NOT do this: there the whole value of
   * the screen is how much of the list is visible. A record's band carries the
   * total, the tabs and the attention row, and all three have to survive a
   * scroll down eighteen openings. At the desk it is already true — the header
   * is a header — so this changes nothing there.
   */
  bandPinned?: boolean;
  /** `measure` caps the body at a reading measure; `full` releases it for a
   *  surface whose value is columns across the available width. */
  width?: "measure" | "full";
  children?: ReactNode;
}) {
  const wide = useRailWidth();
  const account = useOps2Account();
  const history = useHistory();
  const router = useIonRouter();
  const notificationCount = useNotificationCount();

  /* A plain <button>, not IonBackButton: `ion-back-button` ignores `text=""`
     and ignores `text` changing after hydration (the handover's table), and
     this one names its destination — which is the settled rule and the thing
     that component makes hardest.

     IT POPS WHEN THERE IS SOMETHING TO POP. Pushing the destination instead
     read as queue -> record -> queue in the history, so browser Back from the
     queue re-opened the record just left, and every trip through a record grew
     the stack by two. On a phone that is the hardware Back button — the one
     control a person presses without looking. The push survives as the
     COLD-LINK fallback, which is the case the label exists for: arrive at a
     record from an email and there is no queue behind you to return to. */
  const backControl = backTo && (
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
  );

  return (
    <IonPage>
      {/* ── THE BAR IS THE DESK'S, AND IT CARRIES THE VIEW'S NAME ──────────
          It used to run at both widths carrying nothing but a wordmark and a
          bell, above a page that then said its own name again underneath — a
          white band whose whole content was a repetition. On the phone that
          band is the top of a screen whose value is how much of the LIST you
          can see, so it is gone entirely; the owner's drawing starts at
          "Projects".

          The <h1> IS IN THE BAR at this width, not an `ion-title`. Two reasons,
          both structural: `ion-title` renders into shadow DOM, where R-164's
          focus manager (`focusManagerPriority: ["heading", "content"]`, set in
          Ops2App) cannot find it, so every navigation would drop a screen
          reader at the top of the document instead of on the name of the place
          it arrived at. And it would not be a heading at all — the console
          would have no <h1> on any desk-width page. Slotted content stays in
          the light DOM, so an <h1> here is the same element it was below,
          moved. */}
      {wide && (
        <IonHeader className="ion-no-border">
          <IonToolbar className="ops2-topbar">
            <h1 className="ops2-topbar__title ds-type-heading-md">
              {title ?? destination.label}
            </h1>
            <IonButtons slot="end">
              {/* THE SURFACE'S OWN CONTROLS COME FIRST, then the console's. A
                  record's `Issue reviewed quote` and the bell are different
                  kinds of thing — one acts on what you are looking at, the
                  other leaves for somewhere else — and the reading order says
                  so. This slot was the phone's only until a record wanted a CTA
                  at the desk, and `headActions` rendered nowhere at 1440. */}
              {headActions}
              {/* The bell is a shortcut to Attention, which IS this console's
                  notification surface — a link to a real place rather than a
                  control that opens a list nothing populates.

                  DESK ONLY. On the phone Attention is a TAB, permanently on
                  screen one tap away, so a bell in a band above the work was a
                  second door to a room already visible from where you stand.
                  Its unread count is the same notificationCount the phone tab
                  badges — one shared hook, one shared fetch — and it draws
                  nothing at zero: a dot that is always on teaches the eye to
                  stop looking. */}
              <button
                type="button"
                className="ops2-bell"
                aria-label={notificationCount > 0
                  ? `Attention — ${notificationCount} item${notificationCount === 1 ? "" : "s"}`
                  : "Attention"}
                onClick={() => history.push(HOME_PATH)}
              >
                <IonIcon icon={notificationsOutline} aria-hidden="true" />
                {/* THE COUNT, not a dot: "1" says how much is waiting, and the
                    button's own label says it in words for a screen reader. */}
                {notificationCount > 0 && (
                  <span className="ops2-bell__badge" aria-hidden="true">{notificationCount}</span>
                )}
              </button>
              <AccountButton account={account} variant="topbar" id="ops2-account-topbar" />
            </IonButtons>
          </IonToolbar>
          {/* THE CONTROL ROW IS THE BAND'S SECOND LINE, not a card on the page
              below it. Two toolbars in one `IonHeader` so the tabs stay put
              when the list scrolls under them — a tab strip that scrolls away
              is a tab strip you have to hunt back up for to change what you are
              looking at. The white runs through both; only the last one carries
              the edge. */}
          {/* THE IDENTITY IS ITS OWN TOOLBAR, not extra content squeezed into
              the title's. Ionic's convention — iOS HIG's and Material's alike —
              is that a toolbar is one line; a second one in the same header is
              the sanctioned way to carry more. It also puts the total in a
              region that is fixed by construction at this width. */}
          {identity && (
            <IonToolbar className="ops2-topbar ops2-topbar--identity">
              {identity}
            </IonToolbar>
          )}
          {controls && (
            <IonToolbar className="ops2-topbar ops2-topbar--controls">
              {controls}
            </IonToolbar>
          )}
        </IonHeader>
      )}
      <IonContent className="ops2-page">
        {/* `data-bare` = THIS PAGE HAS NO HEADER, so it owes the status bar the
            room the header used to take. Ionic's top safe-area inset is applied
            by `ion-header`/`ion-toolbar`; with the bar gone on the phone,
            nothing consumed it and the heading would sit under the notch on a
            device — or on the console installed to a home screen, which is how
            a phone actually uses it. Carried as an attribute rather than
            re-tested in a media query: `useRailWidth` is the console's one
            change point and two of them a pixel apart is how a width ends up
            with both treatments or neither. */}
        <div
          className={`ops2-page__body ops2-page__body--${width}`}
          data-bare={wide ? undefined : "true"}
        >
          {/* THE PHONE'S HEAD ROW, and the only place the name appears at this
              width — the bar above it does not exist here. It is also what the
              search field replaces in place, which is why the swap mechanism
              lives on this row and not in the bar. */}
          {wide && backControl}
          {/* THE PHONE'S HEAD ROW, and the only place the name appears at this
              width — the bar above it does not exist here. It is also what the
              search field replaces in place, which is why the swap mechanism
              lives on this row and not in the bar.

              THE BACK CONTROL IS INSIDE THE BAND, not above it. The band is
              pulled up by its own top inset so the white runs under the status
              bar, and anything rendered before it is therefore dragged
              underneath — the back button was not merely hidden, it stopped
              receiving the press, on the one control a person on a phone
              reaches for without looking. It belongs with the title anyway. */}
          {!wide && (
            <div
              className={`ops2-page__band${bandPinned ? " ops2-page__band--pinned" : ""}`}
            >
              {backControl}
              <div className="ops2-page__head">
                <div className="ops2-page__heading" data-quiet={headOverlay ? "true" : undefined}>
                  <h1 className="ops2-page__title ds-type-heading-lg">{title ?? destination.label}</h1>
                </div>
                {headOverlay
                  ? <div className="ops2-page__head-overlay">{headOverlay}</div>
                  : headActions && <div className="ops2-page__head-actions">{headActions}</div>}
              </div>
              {/* Under the title, above the controls — the same reading order
                  the desk's three toolbars give, so the two widths are one
                  layout at two sizes rather than two designs. */}
              {identity}
              {controls}
            </div>
          )}
          {children}
        </div>
      </IonContent>
    </IonPage>
  );
}
