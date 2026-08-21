import { useState } from "react";
import { IonContent, IonIcon, IonList, IonItem, IonLabel, IonPopover } from "@ionic/react";
import { chevronDown, logOutOutline, settingsOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { destination } from "./destinations";
import { closeNavDrawer } from "./drawer";
import { initialsOf, ops2SignOut, roleLabel, type Ops2Account } from "./account";

/**
 * The signed-in person, and the way out.
 *
 * It renders in TWO places because the owner's screenshots put it in two: the
 * foot of the rail (avatar, name, role, chevron) and the trailing end of the
 * content top bar (name, chevron). Same component, same menu, one `variant` —
 * two implementations of one control is how the two of them end up offering
 * different things.
 *
 * The chevron is a real chevron: it opens a popover, and every item in the
 * popover does something. `docs/ops2/UX-HANDOVER.md` §5 records file controls
 * shipped as `href="#"` with no handler while the report claimed the behaviour
 * was carried; a decorative chevron is the same defect wearing a different hat.
 */
export function AccountButton({
  account, variant, id,
}: {
  account: Ops2Account | null;
  variant: "rail" | "topbar";
  id: string;
}) {
  const history = useHistory();
  // CONTROLLED, not `trigger="…"`. Measured in the dev server: with the trigger
  // prop Ionic logged "[ion-popover] - A trigger element with the ID
  // 'ops2-account-rail' was not found in the DOM" on every load — the popover's
  // custom element upgrades and reads its trigger before React has committed
  // the sibling button — and the menu then never opened. A decorative chevron
  // is exactly the defect UX-HANDOVER §5 records as shipped-and-reported-as-
  // working, so it is opened from the click that is already in hand.
  const [openAt, setOpenAt] = useState<MouseEvent | undefined>(undefined);
  const role = roleLabel(account);
  // Never "Loading…" and never an invented name. Behind Cloudflare Access the
  // person IS signed in whether or not /api/ops/me answered, so the unknown
  // state says the true thing and stays out of the way.
  const name = account?.name ?? account?.email ?? "Signed in";

  return (
    <>
      <button
        id={id}
        type="button"
        className={`ops2-account ops2-account--${variant}`}
        aria-haspopup="menu"
        aria-expanded={openAt !== undefined}
        aria-label={`Account: ${name}`}
        onClick={(event) => setOpenAt(event.nativeEvent)}
      >
        {variant === "rail" && (
          <span className="ops2-account__avatar" aria-hidden="true">{initialsOf(account)}</span>
        )}
        <span className="ops2-account__who">
          <span className="ops2-account__name">{name}</span>
          {/* R-167: the staffer's own role, which governs real gates and is
              shown nowhere in today's console. Absent rather than guessed when
              the server has not said. */}
          {variant === "rail" && role && <span className="ops2-account__role ds-type-caption">{role}</span>}
        </span>
        <IonIcon className="ops2-account__chevron" icon={chevronDown} aria-hidden="true" />
      </button>

      <IonPopover
        isOpen={openAt !== undefined}
        event={openAt}
        onDidDismiss={() => setOpenAt(undefined)}
        dismissOnSelect
        side="top"
        alignment="start"
        className="ops2-account-menu"
      >
        <IonContent>
          <IonList lines="none">
            {account?.email && (
              <IonItem className="ops2-account-menu__who" lines="full">
                <IonLabel>
                  <p className="ds-type-caption">{account.email}</p>
                  {role && <p className="ds-type-caption">Role · {role}</p>}
                </IonLabel>
              </IonItem>
            )}
            <IonItem
              button
              detail={false}
              onClick={() => { closeNavDrawer(); history.push(destination("settings").path); }}
            >
              <IonIcon slot="start" icon={settingsOutline} aria-hidden="true" />
              <IonLabel>Settings</IonLabel>
            </IonItem>
            {/* Register row 14. See ops2SignOut() for why this is a full
                navigation and not a state reset. */}
            <IonItem button detail={false} onClick={() => { void ops2SignOut(); }}>
              <IonIcon slot="start" icon={logOutOutline} aria-hidden="true" />
              <IonLabel>Sign out</IonLabel>
            </IonItem>
          </IonList>
        </IonContent>
      </IonPopover>
    </>
  );
}
