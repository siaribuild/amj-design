/** The id ion-menu is mounted under, and the id the split pane's main node
 *  carries. Both are referenced from three places, so neither is a literal. */
export const NAV_DRAWER_ID = "ops2-nav-drawer";
export const SHELL_CONTENT_ID = "ops2-main";

const drawer = () => document.getElementById(NAV_DRAWER_ID) as HTMLIonMenuElement | null;

/**
 * Open the destination drawer — what `More` does below 1024px.
 *
 * THE ELEMENT'S OWN `open()`, NOT `menuController.open()`. Measured in the mock
 * and recorded in `docs/mocks/ops2-r1-ionic-src/src/App.tsx`: "the controller
 * call left the menu's classes untouched — with a split-pane-side menu it does
 * not resolve to this one — so the drawer never opened and the twice-recorded
 * 'drawer with no trigger' regression would have shipped again."
 *
 * That is the whole reason this is a module rather than an inline call: the
 * obvious API is the wrong one here, and the next person to reach for it should
 * find this note instead.
 */
export function openNavDrawer(): void {
  void drawer()?.open();
}

/**
 * Close it — called when a destination is chosen.
 *
 * A no-op at rail width: a menu that ion-split-pane has turned into a pane is
 * not open, so closing it changes nothing. That is why every destination row
 * can call this unconditionally instead of asking how wide the window is.
 *
 * IonMenuToggle would be the idiomatic wrapper and is deliberately NOT used.
 * Its `autoHide` (on by default) hides its children whenever the menu is not
 * an openable overlay — which is exactly what a split-pane rail is. It would
 * have hidden every destination in the rail: navigation absent at the widest
 * width, by way of a convenience prop.
 */
export function closeNavDrawer(): void {
  void drawer()?.close();
}
