import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonItem, IonList,
  IonModal, IonNote, IonTitle, IonToolbar, createAnimation,
} from "@ionic/react";
import type { QueueControl, QueueQuery } from "./queue";
import { useRailWidth } from "../nav/useRailWidth";

/**
 * The funnel's panel — taken from the mock, not reinvented.
 *
 * The owner's instruction was explicit: "Filter panel at the bottom is to be
 * taken from the mock." So it is the mock's bottom sheet, at the mock's
 * breakpoint, with the mock's own hard-won properties intact:
 *
 *  - EVERY refinement listed, each INDEPENDENTLY settable. Its predecessor was
 *    a funnel that toggled one filter while wearing a badge that counted a set
 *    — "the same defect as a Download button wired to nothing" (`02623bae`).
 *  - Each one states its effect as a COUNT, so nothing is chosen blind. The
 *    count comes from the control itself (`QueueControl` carries both the number
 *    and the query that produces it), so the number and the outcome cannot be
 *    computed down two different paths and disagree.
 *  - ONE way to clear the lot.
 *
/**
 * THE SITE'S OWN SLIDE-OUT, in Ionic's vocabulary.
 *
 * The customer site already has this panel — `src/components/quote-project/
 * OpeningDrawer.tsx` and `src/styles/theme.css` — and its values are settled:
 * in from the right over 300ms ease-out, back out over 200ms ease-in, width
 * `min(88vw, 520px)`, over a scrim of the ink at 80% with a 3px blur. They are
 * REUSED HERE AS VALUES, not imported: ops2 is a separate Vite graph on React
 * Router 5 and importing a customer component would tie the two together for a
 * panel. The numbers are the contract; the implementation is Ionic's.
 *
 * Ionic's default modal animation slides UP, which is what a bottom sheet does
 * — so a side panel using it arrived from the wrong edge and read as a sheet
 * that had been dragged sideways. `enterAnimation` / `leaveAnimation` replace
 * it rather than dress it.
 */
const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * The panel's own motion, built over Ionic's two shadow parts.
 *
 * BOTH DIRECTIONS ARE WRITTEN OUT; the exit is not the entrance reversed.
 * `direction: "reverse"` reverses the EASING as well as the keyframes, so an
 * ease-in played backwards leaves as an ease-out — the panel drifting away
 * instead of accelerating off. The two curves are the point of having two.
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
    // replacing that animation without carrying this over left the panel
    // correctly positioned, correctly sized, and invisible: 520px of ghost text
    // over the scrim. It is 1 to 1 rather than a fade, because the drawer this
    // borrows from slides without fading.
    .fromTo("opacity", "1", "1");
  return createAnimation()
    .addElement(baseEl)
    .addAnimation([backdrop, wrapper]);
}

// Honoured here rather than left to the stylesheet: these are JS animations, so
// a `prefers-reduced-motion` media query never sees them. The panel still
// arrives and leaves — it simply stops travelling, which is the same ruling the
// customer drawer's own reduced-motion block makes.
const reduced = () =>
  typeof window !== "undefined"
  && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const slideIn = (baseEl: HTMLElement) =>
  sideAnimation(baseEl, false).easing(EASE_OUT).duration(reduced() ? 0 : 300);
const slideOut = (baseEl: HTMLElement) =>
  sideAnimation(baseEl, true).easing(EASE_IN).duration(reduced() ? 0 : 200);

/**
 * TWO FORMS, ONE PANEL. On the phone it is the mock's bottom sheet, at the
 * mock's breakpoint. At the desk it is a RIGHT-HAND SLIDE-OUT — the owner's
 * instruction, and the reason is that a sheet rising from the bottom edge of a
 * 1440px window is a phone gesture performed on a desk: it starts a long way
 * from the funnel that opened it and covers the bottom of the list rather than
 * its side. The contents are identical; only the edge it comes from changes.
 *
 * THE CUSTOMER DRAWER'S NUMBERS, NOT ITS FINISH. It predates FrameFlow, so it
 * has square corners and no elevation — the owner's own note. What is reused is
 * what was settled by use: the edge, the travel, the timings, the width and the
 * scrim. The corners and the shadow are this console's.
 *
 * Either way it is a panel and not a full-screen modal, because the list behind
 * it is the thing being refined and a reviewer who cannot see what is changing
 * is guessing.
 */
export function FilterSheet({
  open, onClose, controls, onApply, onClear, activeCount,
}: {
  open: boolean;
  onClose: () => void;
  controls: QueueControl[];
  onApply: (query: QueueQuery) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const wide = useRailWidth();
  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      // The breakpoints ARE the bottom sheet — passing them at the desk is what
      // would make a side panel try to drag itself up from the bottom edge.
      initialBreakpoint={wide ? undefined : 0.5}
      breakpoints={wide ? undefined : [0, 0.5]}
      // Ionic's default enter slides UP, which is what a bottom sheet does — so
      // the side panel arrived from the wrong edge and read as a sheet dragged
      // sideways. Replaced rather than dressed.
      enterAnimation={wide ? slideIn : undefined}
      leaveAnimation={wide ? slideOut : undefined}
      className={wide ? "pq-sheet pq-sheet--side" : "pq-sheet"}
      data-testid="queue-filter-sheet"
      // REMOUNT WHEN THE FORM CHANGES. Ionic settles `isSheetModal`, its
      // gesture and its breakpoint during `present()`, so a window crossing the
      // change point while the panel is open kept whichever mode it opened in —
      // a half-translated sheet wearing side-panel styling, or a full-screen
      // modal where the bottom sheet should be. The key makes it a new modal.
      key={wide ? "side" : "sheet"}
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>Filters</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Done</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList lines="full">
          {controls.map((control) => (
            <IonItem key={control.key}>
              <IonCheckbox
                checked={control.active}
                justify="space-between"
                data-testid="queue-refinement"
                data-refinement={control.key}
                onIonChange={() => onApply(control.query)}
              >
                {control.label}
                <span className="pq-count" data-testid="queue-refinement-count">{control.count}</span>
              </IonCheckbox>
            </IonItem>
          ))}
        </IonList>
        <div className="pq-sheet__foot">
          <IonButton
            fill="clear"
            size="small"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            Clear all filters
          </IonButton>
          {/* Said once, here, rather than as a tooltip on the badge: the number
              on the funnel is how many refinements are on, and the strip above
              the list names WHICH. A count alone still leaves a reader guessing
              which row went missing and why. */}
          <IonNote className="ds-type-caption">
            Refinements narrow whichever quick filter is selected.
          </IonNote>
        </div>
      </IonContent>
    </IonModal>
  );
}
