import { IonButton, IonIcon, IonNote, IonSkeletonText } from "@ionic/react";
import { chevronForwardOutline, warningOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { OpsPage } from "../chrome/OpsPage";
import { RowList, Row } from "../chrome/RowList";
import { destination } from "../nav/destinations";
import { DESTINATION_ICON } from "../nav/icons";
import { browserHref } from "../shellBase";
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
          {/* A CONSTANT SHAPE, close to the common case — a four-row Projects
              group plus one more group. Loading cannot know how many rows are
              coming, so it stands in approximately and stably rather than
              guessing; the alternative is a placeholder that resettles the
              moment the answer lands. Never a spinner (mock §3). */}
          <IonSkeletonText animated style={{ height: "1rem", width: "7rem", marginBottom: "0.25rem" }} />
          <IonSkeletonText animated style={{ height: "134px" }} />
          <IonSkeletonText animated style={{ height: "1rem", width: "7rem", margin: "0.75rem 0 0.25rem" }} />
          <IonSkeletonText animated style={{ height: "45px" }} />
        </div>
      )}

      {(load.status === "error" || load.status === "unauthorised") && (
        <div className="pq-error ds-surface-card" data-testid="attention-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          {/* Unauthorised has no retry (mock §3.5) — pressing again fails the
              same way, and a control that cannot do anything is the defect. */}
          {load.status === "error" && (
            <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
          )}
        </div>
      )}

      {load.status === "ready" && (() => {
        const groups = attentionGroups(load.counts);
        if (groups.length === 0) {
          return (
            <div className="pq-empty" data-testid="attention-empty">
              <strong>Nothing is waiting.</strong>
              <IonNote className="ds-type-caption">
                Every queue is clear. New submissions, unanswered enquiries and trade
                applications appear here as they arrive.
              </IonNote>
            </div>
          );
        }
        return (
          <div className="att-groups">
            {groups.map((group) => (
              <section className="att-group" key={group.id}>
                <div className="att-group__head">
                  <IonIcon icon={DESTINATION_ICON[group.id]} aria-hidden="true" />
                  <h2>{group.label}</h2>
                </div>
                <RowList className="att-rows ds-surface-card" testId={`attention-${group.id}`}>
                  {group.rows.map((row) => (
                    <Row
                      key={row.key}
                      edge={null}
                      // A destination, so a real anchor — the row is
                      // middle-clickable and copyable like the queue's. The
                      // plain click stays the router's, so `href` is the
                      // browser's spelling and `onActivate` the router's.
                      href={browserHref(row.href)}
                      pressTestId={`attention-row-${row.key}`}
                      onActivate={() => history.push(row.href)}
                    >
                      {/* Two slots, one sentence. The space between them is a
                          real text node so the accessible name and the pressed
                          element's text stay "4 new submissions"; a flex
                          container does not render a whitespace-only child, so
                          the gap is still the token's. */}
                      <span className="att-row">
                        <span className="att-row__count">{row.count}</span>{" "}
                        <span className="att-row__noun">{row.noun}</span>
                      </span>
                      <IonIcon className="ops2-row__chev" icon={chevronForwardOutline} aria-hidden="true" />
                    </Row>
                  ))}
                </RowList>
              </section>
            ))}
          </div>
        );
      })()}
    </OpsPage>
  );
}
