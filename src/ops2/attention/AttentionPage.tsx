import { IonButton, IonIcon, IonNote, IonSkeletonText } from "@ionic/react";
import { chevronForwardOutline, warningOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { OpsPage } from "../chrome/OpsPage";
import { RowList, Row } from "../chrome/RowList";
import { destination } from "../nav/destinations";
import { DESTINATION_ICON } from "../nav/icons";
import { attentionGroups } from "./attention";
import { useSummary } from "./useSummary";
import { useMonitoring, formatAsAt } from "./useMonitoring";
import { capOutstanding } from "../../data/monitoring";

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
  const { load: monitoringLoad, reload: monitoringReload } = useMonitoring();
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

      {/* Monitoring — a second, independent request (useMonitoring), always
          below the attention groups regardless of the summary's own state
          (design §7). Its own loading/error/empty/ready states never touch
          load.counts, so the errorBlockMatch isolation above stays sound. */}
      {monitoringLoad.status === "loading" && (
        <div className="pq-skeleton att-card--loading" data-testid="monitoring-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "1rem", width: "7rem", marginBottom: "0.25rem" }} />
          <IonSkeletonText animated style={{ height: "88px" }} />
        </div>
      )}

      {(monitoringLoad.status === "error" || monitoringLoad.status === "unauthorised") && (
        <div className="pq-error ds-surface-card" data-testid="monitoring-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{monitoringLoad.headline}</strong>
            <IonNote className="ds-type-caption">{monitoringLoad.detail}</IonNote>
          </div>
          {monitoringLoad.status === "error" && (
            <IonButton size="small" fill="outline" onClick={monitoringReload}>Try again</IonButton>
          )}
        </div>
      )}

      {monitoringLoad.status === "empty" && (
        <div className="pq-empty" data-testid="monitoring-empty">
          <strong>No snapshot yet.</strong>
          <IonNote className="ds-type-caption">
            The monitoring snapshot is written every 10 minutes. Check back shortly.
          </IonNote>
        </div>
      )}

      {monitoringLoad.status === "ready" && (() => {
        const { snapshot } = monitoringLoad;
        const { money } = snapshot;
        const maxDay = Math.max(1, ...snapshot.days.map((d) => Math.max(d.success, d.error)));
        const allZero = snapshot.success7d === 0 && snapshot.error7d === 0;
        return (
          <div className="att-monitoring">
            <p className="att-asat">As at {formatAsAt(snapshot.takenAt)}</p>
            <div className="att-grid">
              <div className="att-pair">
                <div
                  className="att-card"
                  data-state={money.available ? undefined : "unavailable"}
                  data-testid="monitoring-credit-balance"
                >
                  <span className="att-card__label">Credit balance</span>
                  <strong className="att-card__figure">
                    {money.available ? `$${money.creditBalanceUsd.toFixed(2)}` : "—"}
                  </strong>
                  {!money.available && <IonNote className="att-card__note">unavailable</IonNote>}
                </div>
                <div
                  className="att-card"
                  data-state={money.available ? undefined : "unavailable"}
                  data-testid="monitoring-cap-outstanding"
                >
                  <span className="att-card__label">Cap headroom</span>
                  <strong className="att-card__figure">
                    {money.available ? `$${capOutstanding(money).toFixed(2)}` : "—"}
                  </strong>
                  <IonNote className="att-card__note">
                    {money.available ? `of $${money.capUsd.toFixed(2)} cap (${money.capSource})` : "unavailable"}
                  </IonNote>
                </div>
              </div>
              <div className="att-pair">
                <div className="att-card" data-testid="monitoring-success-count">
                  <span className="att-card__label">Success · 7 days</span>
                  <strong className="att-card__figure">{snapshot.success7d}</strong>
                </div>
                <div className="att-card" data-testid="monitoring-error-count">
                  <span className="att-card__label">Errors · 7 days</span>
                  <strong className="att-card__figure">{snapshot.error7d}</strong>
                </div>
              </div>
              <div className="att-card att-chart" data-testid="monitoring-chart">
                <span className="att-card__label">Parsing · last 7 days</span>
                {allZero ? (
                  <p className="att-chart__empty">No parse activity this week.</p>
                ) : (
                  <div className="att-plot">
                    {snapshot.days.map((day, i) => (
                      <div className="att-col" key={day.day}>
                        <div className="att-col__bars">
                          <div
                            className="att-bar"
                            data-series="success"
                            data-zero={day.success === 0 || undefined}
                            style={{ height: day.success === 0 ? "2px" : `${(day.success / maxDay) * 100}%` }}
                          >
                            {day.success > 0 && <b>{day.success}</b>}
                          </div>
                          <div
                            className="att-bar"
                            data-series="error"
                            data-zero={day.error === 0 || undefined}
                            style={{ height: day.error === 0 ? "2px" : `${(day.error / maxDay) * 100}%` }}
                          >
                            {day.error > 0 && <b>{day.error}</b>}
                          </div>
                        </div>
                        <span className="att-col__day" data-today={i === snapshot.days.length - 1 || undefined}>
                          {day.day.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </OpsPage>
  );
}
