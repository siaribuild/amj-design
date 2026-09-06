import { useRef, type ReactNode } from "react";
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
  phoneForm = "sheet", dismiss = "done", panelClass,
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
   * The PHONE form. `"sheet"` is the half-height bottom sheet with Ionic's
   * drag handle; `"screen"` is FULL BLEED at every width below the change
   * point — which is what R26 asked for, and it is true because
   * `projects.css` says so under `pq-sheet--screen`, NOT because an unstyled
   * `IonModal` happens to be. It was not: given neither class nor breakpoints
   * Ionic renders its stock modal, full-bleed on a narrow phone and a centred,
   * rounded, inset card from 768px up — which is the iPad, and which the owner
   * caught on 2026-09-04. `"side"`
   * keeps the desk's 520px right-hand panel below the change point, for a
   * caller whose narrow form is still a screen rather than a phone gesture. The handle
   * disappears on its own, because Ionic renders it only for sheet modals — it
   * is not hidden with CSS.
   *
   * DEFAULTED, and the default is today's behaviour byte-for-byte. The Projects
   * filter is the other caller and its phone form is approved and shipped;
   * changing the default would move a surface outside this feature, which is
   * why `FilterSheet.tsx` appears nowhere in this diff.
   */
  phoneForm?: "sheet" | "screen" | "side";
  /**
   * The dismiss control. `"done"` is today's trailing Done button.
   * `{ back }` is a LEADING back control naming where it returns to — R29's
   * shape for a routed caller, and the label travels with the choice rather
   * than beside it so a back control cannot exist without a destination. A
   * back-shaped control that does not name where it goes is VIEW-AC-15's
   * defect one surface over.
   */
  dismiss?: "done" | { back: string };
  /**
   * The caller's own name for its panel, carried onto the modal alongside the
   * form classes so a stylesheet can reach THIS panel without reaching into
   * this component.
   *
   * It exists because the filter's footer pinning was scoped with
   * `:has(ion-list)` — identifying a caller by which elements it happens to
   * put inside a shared component. That breaks two ways with nobody touching
   * the filter: the next list-backed panel inherits a sticky footer it never
   * asked for, and a markup change in here silently unpins this one. A class
   * the caller declares is the seam; the children are not.
   */
  panelClass?: string;
  children: ReactNode;
}) {
  const wide = useRailWidth();
  // The resolved form, which is what the remount guard has to key on: a window
  // crossing the change point while a FULL-SCREEN panel is open must not be
  // told it is still whatever it opened as.
  const form = wide ? "side" : phoneForm;
  const sheet = form === "sheet";
  // THE DIRECTION FOLLOWS THE FORM, NOT THE WIDTH. A panel you go INTO — a
  // detail, an edit — arrives from the right at every size, because that is
  // where it came from and the animation is the only thing that says so. Only
  // the SHEET rises from the bottom edge, and it is the one caller that is
  // conceptually a phone gesture rather than a screen (owner, 2026-08-31:
  // "why detail should be the same… filter is NOT the same thing
  // conceptually"). Before this the animation was keyed on `wide`, so a
  // full-screen panel below the change point arrived with Ionic's default and
  // no direction at all.
  const fromRight = !sheet;

  /**
   * FOCUS MOVES INTO THE SCREEN, and it has to be asked for.
   *
   * MEASURED, and each measurement moved the mechanism. Opening this panel left
   * focus on the control that opened it — a button in the page BEHIND — so
   * Ionic's Escape handler, which dismisses the topmost overlay from a keydown
   * on the document, never ran and Escape did nothing at all. A keyboard reader
   * was stranded outside a screen they had just navigated to, and for a ROUTED
   * caller that is worse than a dead key: back is the only way out and Escape is
   * how most people reach for it.
   *
   * `onDidPresent` did not fire. Nor did a listener for `ionModalDidPresent` or
   * `didPresent` on the element — instrumented, the host dispatched `ionMount`
   * and nothing else. So the trigger is the CONTROL'S OWN MOUNT, which happens
   * when the modal renders its content and depends on no lifecycle event at all.
   *
   * The SHADOW button is focused rather than the host: `ion-button` wraps a real
   * one, and focusing the host is a no-op unless the browser forwards it —
   * "unless" is not something an exit route may rest on.
   *
   * Only for the back form, so the Projects filter's approved behaviour is
   * byte-identical (WHY-AC-7b): nothing in the queue holds focus the way a
   * stretched door button does.
   */
  const routed = dismiss !== "done";
  const live = useRef(open);
  live.current = open;
  const takeFocus = (el: HTMLIonButtonElement | null) => {
    if (!el || !routed) return;
    requestAnimationFrame(() => {
      if (!live.current) return;
      (el.shadowRoot?.querySelector("button") ?? el).focus();
    });
  };

  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      // The breakpoints ARE the bottom sheet — passing them at the desk, or on a
      // phone form that is meant to be full screen, is what would make a panel
      // try to drag itself up from the bottom edge.
      initialBreakpoint={sheet ? 0.5 : undefined}
      breakpoints={sheet ? [0, 0.5] : undefined}
      // AND THE SHEET SCROLLS WHAT IT CANNOT SHOW.
      //
      // Ionic renders a sheet as a FULL-HEIGHT `.ion-page` translated down to
      // its breakpoint, so at 0.5 the content box is twice the band anyone can
      // see: nothing overflows, and content that cannot overflow cannot scroll.
      // Measured at 375x667 with the filter's six controls (`05-polish.md`) —
      // `In production` clipped, `Clear all filters` at y=704, the handle
      // dragging to nothing because `[0, 0.5]` has no higher stop. Three
      // controls fitted half a phone; six do not, and the next surface to reach
      // seven would have found this again.
      //
      // `expandToScroll={false}` is Ionic's own switch for it (8.5+): it caps
      // the content at `breakpoint * 100%`, so the overflow happens INSIDE the
      // visible band and `ion-content` scrolls there. Chosen over a third
      // breakpoint, which still needs a drag before the last control exists,
      // and over `phoneForm="screen"` for the filter, which would abandon the
      // bottom sheet the owner asked for by name. The sheet stays the mock's
      // sheet; it simply stops hiding its own tail.
      expandToScroll={sheet ? false : undefined}
      enterAnimation={fromRight ? slideIn : undefined}
      leaveAnimation={fromRight ? slideOut : undefined}
      className={`pq-sheet${form === "side" ? " pq-sheet--side" : ""}${form === "screen" ? " pq-sheet--screen" : ""}${panelClass ? ` ${panelClass}` : ""}`}
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
              <IonButton ref={takeFocus} onClick={onClose} data-testid={`${testId}-back`} className="pq-sheet__back">
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
