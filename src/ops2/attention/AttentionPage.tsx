import { IonButton, IonIcon, IonNote, IonSkeletonText } from "@ionic/react";
import { warningOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { OpsPage } from "../chrome/OpsPage";
import { RowList, Row } from "../chrome/RowList";
import { destination } from "../nav/destinations";
import { attentionGroups } from "./attention";
import { useSummary } from "./useSummary";

/**
 * The console's front door (design.md §5). One request (useSummary), grouped
 * by attentionGroups() into Projects/Enquiries/Customers, zero-suppressed at
 * both levels — so what renders is exactly what needs a decision today.
 *
 * A row leads, never acts (G3): `edge={null}` because no leading-edge fact
 * applies here, and onActivate is the only control a row carries.
 *
 * The error/empty/skeleton JSX below is COPIED from ProjectsPage's private
 * ErrorPanel/EmptyPanel/QueueSkeleton (design §5) rather than exported and
 * shared — the shared unit is the CSS class, not the component.
 */
export function AttentionPage() {
  const { load, reload } = useSummary();
  const history = useHistory();

  return (
    <OpsPage destination={destination("attention")}>
      {load.status === "loading" && (
        <div className="pq-skeleton" data-testid="attention-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "24px", width: "40%" }} />
          <IonSkeletonText animated style={{ height: "96px" }} />
        </div>
      )}

      {load.status === "error" && (
        <div className="pq-error ds-surface-card" data-testid="attention-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {load.status === "ready" && (() => {
        const groups = attentionGroups(load.counts);
        if (groups.length === 0) {
          return (
            <div className="pq-empty" data-testid="attention-empty">
              <strong>Nothing is waiting.</strong>
              <IonNote className="ds-type-caption">Every queue is clear.</IonNote>
            </div>
          );
        }
        return groups.map((group) => (
          <section className="att-group" key={group.id}>
            <h2>{group.label}</h2>
            <RowList testId={`attention-${group.id}`}>
              {group.rows.map((row) => (
                <Row
                  key={row.key}
                  edge={null}
                  pressTestId={`attention-row-${row.key}`}
                  onActivate={() => history.push(row.href)}
                >
                  {row.label}
                </Row>
              ))}
            </RowList>
          </section>
        ));
      })()}
    </OpsPage>
  );
}
