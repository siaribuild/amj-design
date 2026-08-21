import { IonContent, IonIcon } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { browserHref } from "../shellBase";
import { DESTINATIONS, SECTIONS, isDestinationActive } from "./destinations";
import { DESTINATION_ICON } from "./icons";
import { closeNavDrawer } from "./drawer";
import { Wordmark } from "./Wordmark";
import { AccountButton } from "./AccountButton";
import { useOps2Account } from "./account";

/**
 * THE destination list — one function, two mount states.
 *
 * ion-split-pane renders this same ion-menu as a persistent 224px rail at
 * `--cp-shell-rail` and above, and as an overlay drawer below it. Nothing here
 * knows which: the two presentations differ in chrome, not in content, which is
 * what makes C6 ("exactly one navigation surface") true in the code rather than
 * merely stated in the spec.
 *
 * `docs/design/ops2-r1-interaction-plane-shell.md` §2.1 fixes the order: brand,
 * the destinations, then the account block.
 */
export function NavPanel() {
  const { pathname } = useLocation();
  const history = useHistory();
  const account = useOps2Account();

  return (
    <IonContent className="ops2-nav__content">
      <nav className="ops2-nav" aria-label="Console sections">
        <div className="ops2-nav__brand">
          <Wordmark />
        </div>

        <div className="ops2-nav__sections">
          {SECTIONS.map((section) => (
            <div className="ops2-nav__section" key={section.id}>
              <h2 className="ops2-nav__section-label ds-type-label-md">{section.label}</h2>
              <ul className="ops2-nav__list">
                {DESTINATIONS.filter((d) => d.section === section.id).map((d) => {
                  const active = isDestinationActive(pathname, d.path);
                  return (
                    <li key={d.id}>
                      <a
                        className="ops2-nav__item"
                        // BROWSER-facing, so it carries the basename; the
                        // click handler below navigates with the ROUTER path,
                        // which must not. See browserHref() for what went wrong
                        // when these were the same string.
                        href={browserHref(d.path)}
                        aria-current={active ? "page" : undefined}
                        onClick={(event) => {
                          // A real href so the row is a link — middle-click,
                          // copy-link and "open in new tab" all work, and the
                          // address is visible on hover. The click is
                          // intercepted so navigation stays inside the router
                          // and does not reload the bundle.
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                          event.preventDefault();
                          closeNavDrawer();
                          // `push`, and the reason is the tab bar. Ionic's tab
                          // buttons push, so a rail that replaced would make
                          // Back return you to the previous destination on a
                          // phone and take you out of the console entirely on a
                          // desktop — one gesture, two answers, decided by how
                          // wide the window happened to be. Measured as a red
                          // test before this line said `push`.
                          //
                          // (The stepper's replace-don't-push rule, interaction
                          // spec §10.3, is about lateral movement WITHIN a
                          // zone. Moving between top-level destinations is not
                          // that, and the surfaces agreeing matters more.)
                          if (!active) history.push(d.path);
                        }}
                      >
                        <IonIcon className="ops2-nav__icon" icon={DESTINATION_ICON[d.id]} aria-hidden="true" />
                        <span className="ops2-nav__label">{d.label}</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="ops2-nav__foot">
          <AccountButton account={account} variant="rail" id="ops2-account-rail" />
        </div>
      </nav>
    </IonContent>
  );
}
