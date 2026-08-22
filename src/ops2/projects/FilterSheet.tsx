import { IonCheckbox, IonItem, IonList, IonNote, IonButton } from "@ionic/react";
import { SidePanel } from "../chrome/SidePanel";
import type { QueueControl, QueueQuery } from "./queue";

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
 * The panel ITSELF — the two forms, the motion, the width, the scrim — is
 * `../chrome/SidePanel`, shared with the record's actions panel. Two panels
 * that behave almost identically is how a console ends up with two.
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
  return (
    <SidePanel open={open} onClose={onClose} title="Filters" testId="queue-filter-sheet"
      footer={
        <>
          <IonButton fill="clear" size="small" disabled={activeCount === 0} onClick={onClear}>
            Clear all filters
          </IonButton>
          {/* Said once, here, rather than as a tooltip on the badge: the number
              on the funnel is how many refinements are on, and the strip above
              the list names WHICH. A count alone still leaves a reader guessing
              which row went missing and why. */}
          <IonNote className="ds-type-caption">
            Refinements narrow whichever quick filter is selected.
          </IonNote>
        </>
      }
    >
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
    </SidePanel>
  );
}
