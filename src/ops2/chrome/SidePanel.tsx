import type { ReactNode } from "react";
import {
  IonButton, IonButtons, IonContent, IonHeader, IonModal, IonTitle, IonToolbar,
  createAnimation,
} from "@ionic/react";
import { useRailWidth } from "../nav/useRailWidth";

/**
 * ONE PANEL, wherever this console needs to put something beside the work.
 *
 * Lifted out of the Projects filter sheet the moment a second surface wanted
 * the same object. Two panels that behave almost identically is how a console
 * ends up with two — the filter's own history in this repo is exactly that
 * (`OPEN-DEFECTS.md`: a list that "looked like" the other list and differed in
 * six ways nobody chose).
 *
 * ── TWO FORMS, ONE COMPONENT ────────────────────────────────────────────────
 * On the phone it is the mock's BOTTOM SHEET at the mock's breakpoint. At the
 * desk it is a RIGHT-HAND SLIDE-OUT — the owner's instruction, because a sheet
 * rising from the bottom edge of a 1440px window is a phone gesture performed
 * on a desk: it starts a long way from the control that opened it and covers
 * the bottom of the list rather than its side.
 *
 * THE SITE'S OWN NUMBERS. `src/components/quote-project/OpeningDrawer.tsx` and
 * `src/styles/theme.css` settled this panel for the customer: `min(88vw,
 * 520px)`, in from the right over 300ms ease-out, back over 200ms ease-in,
 * above a scrim of the ink at 80% behind a 3px blur. Reused as VALUES, not
 * imported — ops2 is a separate Vite graph on React Router 5 and tying the two
 * together for a drawer is not a trade worth making. The FINISH is this
 * console's: that panel predates FrameFlow, so it has square corners and no
 * elevation.
 */
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * BOTH DIRECTIONS ARE WRITTEN OUT; the exit is not the entrance reversed.
 * `direction: "reverse"` reverses the EASING as well as the keyframes, so an
 * ease-in played backwards leaves as an ease-out — the panel drifting away
 * instead of accelerating off.
 */
function sideAnimation(baseEl: HTMLElement, out: boolean) {
  const root = baseEl.shadowRoot;
  const [dim, lit] = ["0.01", "var(--backdrop-opacity)"];
  const [here, away] = ["translateX(0)", "translateX(100%)"];
  const backdrop = createAnimation()
    .addElement(root!.querySelector("ion-backdrop")!)
    .fromTo("opacity", out ? lit : dim, out ? dim : lit);
  const wrapper = createAnimation()
    .addElement(root!.querySelector(".modal-wrapper")!)
    .fromTo("transform", out ? here : away, out ? away : here)
    // OPACITY IS NOT DECORATION HERE. Ionic's stylesheet parks `.modal-wrapper`
    // at `opacity: 0.01` and relies on its OWN enter animation to raise it — so
    // replacing that animation without carrying this over leaves the panel
    // correctly positioned, correctly sized, and invisible.
    .fromTo("opacity", "1", "1");
  return createAnimation().addElement(baseEl).addAnimation([backdrop, wrapper]);
}

// Honoured here rather than in the stylesheet: these are JS animations, so a
// `prefers-reduced-motion` media query never sees them. The panel still arrives
// and leaves — it simply stops travelling.
const reduced = () =>
  typeof window !== "undefined"
  && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const slideIn = (baseEl: HTMLElement) =>
  sideAnimation(baseEl, false).easing(EASE_OUT).duration(reduced() ? 0 : 300);
const slideOut = (baseEl: HTMLElement) =>
  sideAnimation(baseEl, true).easing(EASE_IN).duration(reduced() ? 0 : 200);

export function SidePanel({
  open, onClose, title, testId, footer, children,
  phoneForm = "sheet", dismiss = "done",
}: {
  open: boolean;
  /**
   * THE ONE DISMISS PATH. The backdrop, Escape, the control and the platform's
   * back gesture all funnel here, and the CALLER decides what closing means —
   * the filter sets state, the rationale pops history. That is the whole seam:
   * this component stays a presentation adapter and never imports a router.
   */
  onClose: () => void;
  title: string;
  /** The surface's own handle for its panel, so tests name the panel they mean. */
  testId: string;
  /** Below the scrolling content: the panel's own closing note or controls. */
  footer?: ReactNode;
  /**
   * The PHONE form. `"sheet"` is today's half-height bottom sheet with Ionic's
   * drag handle; `"screen"` is full screen with no breakpoints, which is what
   * R26 asked for and what an `IonModal` does when given neither. The handle
   * disappears on its own, because Ionic renders it only for sheet modals — it
   * is not hidden with CSS.
   *
   * DEFAULTED, and the default is today's behaviour byte-for-byte. The Projects
   * filter is the other caller and its phone form is approved and shipped;
   * changing the default would move a surface outside this feature, which is
   * why `FilterSheet.tsx` appears nowhere in this diff.
   */
  phoneForm?: "sheet" | "screen";
  /**
   * The dismiss control. `"done"` is today's trailing Done button.
   * `{ back }` is a LEADING back control naming where it returns to — R29's
   * shape for a routed caller, and the label travels with the choice rather
   * than beside it so a back control cannot exist without a destination. A
   * back-shaped control that does not name where it goes is VIEW-AC-15's
   * defect one surface over.
   */
  dismiss?: "done" | { back: string };
  children: ReactNode;
}) {
  const wide = useRailWidth();
  // The resolved form, which is what the remount guard has to key on: a window
  // crossing the change point while a FULL-SCREEN panel is open must not be
  // told it is still whatever it opened as.
  const form = wide ? "side" : phoneForm === "screen" ? "screen" : "sheet";
  const sheet = form === "sheet";
  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      // The breakpoints ARE the bottom sheet — passing them at the desk, or on a
      // phone form that is meant to be full screen, is what would make a panel
      // try to drag itself up from the bottom edge.
      initialBreakpoint={sheet ? 0.5 : undefined}
      breakpoints={sheet ? [0, 0.5] : undefined}
      enterAnimation={wide ? slideIn : undefined}
      leaveAnimation={wide ? slideOut : undefined}
      className={wide ? "pq-sheet pq-sheet--side" : "pq-sheet"}
      data-testid={testId}
      // REMOUNT WHEN THE FORM CHANGES. Ionic settles `isSheetModal`, its gesture
      // and its breakpoint during `present()`, so a window crossing the change
      // point while the panel is open keeps whichever mode it opened in — a
      // half-translated sheet wearing side-panel styling, or a full-screen
      // modal where the bottom sheet should be.
      key={form}
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          {/* LEADING, and that is the point of it. A back-shaped control parked
              where an X was still reads as a dismiss; the leading position is
              what makes the promise legible before anyone presses anything. */}
          {dismiss !== "done" && (
            <IonButtons slot="start">
              <IonButton onClick={onClose} data-testid={`${testId}-back`} className="pq-sheet__back">
                <span aria-hidden="true" className="pq-sheet__chev">‹</span>
                {dismiss.back}
              </IonButton>
            </IonButtons>
          )}
          <IonTitle>{title}</IonTitle>
          {dismiss === "done" && (
            <IonButtons slot="end">
              <IonButton onClick={onClose}>Done</IonButton>
            </IonButtons>
          )}
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {children}
        {footer && <div className="pq-sheet__foot">{footer}</div>}
      </IonContent>
    </IonModal>
  );
}
