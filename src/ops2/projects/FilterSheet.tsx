import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonItem, IonList,
  IonModal, IonNote, IonTitle, IonToolbar,
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
 * TWO FORMS, ONE PANEL. On the phone it is the mock's bottom sheet, at the
 * mock's breakpoint. At the desk it is a RIGHT-HAND SLIDE-OUT — the owner's
 * instruction, and the reason is that a sheet rising from the bottom edge of a
 * 1440px window is a phone gesture performed on a desk: it starts a long way
 * from the funnel that opened it and covers the bottom of the list rather than
 * its side. The contents are identical; only the edge it comes from changes.
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
      className={wide ? "pq-sheet pq-sheet--side" : "pq-sheet"}
      data-testid="queue-filter-sheet"
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
