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
import { useMonitoring, formatAsAt, snapshotAge, formatDayLabel } from "./useMonitoring";
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

  /* ONE FRESHNESS LINE, IN THE BAND, governing every figure below it — not
     five repetitions of one timestamp. OpsPage renders `identity` at both
     widths (a third desk toolbar; the phone band's second line), which is the
     same slot the record's money uses. Stale flips it to warning ink and
     stamps every card; fresh states it once, quietly. */
  const age = monitoringLoad.status === "ready" ? snapshotAge(monitoringLoad.snapshot.takenAt) : null;
  const asAt = monitoringLoad.status === "ready" ? formatAsAt(monitoringLoad.snapshot.takenAt) : "";
  const identity = age ? (
    <p className="att-asat" data-stale={age.stale || undefined}>
      {age.stale && <IonIcon icon={warningOutline} aria-hidden="true" />}
      {age.stale
        ? `Not refreshed since ${asAt} — ${age.ago}. The 10-minute job may have stopped.`
        : `As at ${asAt} · refreshes every 10 minutes`}
    </p>
  ) : undefined;

  return (
    <OpsPage destination={destination("attention")} width="full" identity={identity}>
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

      {/* Monitoring — a second, independent request (useMonitoring), always
          below the attention groups regardless of the summary's own state
          (design §7). Its own loading/error/empty/ready states never touch
          load.counts, so the errorBlockMatch isolation above stays sound. */}
      {monitoringLoad.status === "loading" && (
        /* THE SKELETON IS THE LAYOUT, not a grey slab standing where it will
           be: the same two groups, four cards and seven columns, in the same
           boxes, so nothing moves when the figures land (UX §6.5). */
        <div className="att-monitoring" data-testid="monitoring-skeleton" aria-busy="true">
          <div className="att-grid">
            {["AI budget", "Parsing · last 7 days"].map((label) => (
              <section className="att-group" key={label}>
                <h2 className="att-group__label">{label}</h2>
                <div className="att-pair">
                  {[0, 1].map((i) => (
                    <article className="att-card att-card--loading" key={i}>
                      <span className="att-skeleton" style={{ width: "88px", height: "10px" }} />
                      <span className="att-skeleton" style={{ width: "112px", height: "28px" }} />
                      <span className="att-skeleton" style={{ width: "140px", height: "10px" }} />
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="att-card att-chart">
            <div className="att-chart__head">
              <span className="att-skeleton" style={{ width: "180px", height: "10px" }} />
            </div>
            <div className="att-plot att-plot--loading">
              {[40, 68, 24, 52, 80, 60, 44].map((height, i) => (
                <div className="att-col" key={i}>
                  <span className="att-skeleton" style={{ width: "38px", height: `${height}px` }} />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {(monitoringLoad.status === "error" || monitoringLoad.status === "unauthorised") && (
        <div className="pq-error ds-surface-card att-monitoring" data-testid="monitoring-error" role="alert">
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
        /* NOT an error: before the cron's first tick nothing has gone wrong
           yet, and the copy says what to conclude if it stays this way. */
        <div className="pq-empty att-monitoring" data-testid="monitoring-empty">
          <strong>No figures yet</strong>
          <IonNote className="ds-type-caption">
            The monitoring job writes them every 10 minutes. If nothing appears by the next
            tick, the cron is not running.
          </IonNote>
        </div>
      )}

      {monitoringLoad.status === "ready" && (() => {
        const { snapshot } = monitoringLoad;
        const { money } = snapshot;
        const maxDay = Math.max(1, ...snapshot.days.map((d) => Math.max(d.success, d.error)));
        const allZero = snapshot.success7d === 0 && snapshot.error7d === 0;
        /* Criterion 6, literally: when the figures are stale EVERY card states
           the age it was taken at — and only then, so a healthy page does not
           repeat one timestamp five times. */
        const stamp = age?.stale ? <p className="att-card__stamp">as at {asAt}</p> : null;
        /* An unavailable figure is an em dash and the REASON — never a zero
           (a lie) and never red (an alarm no one can act on).
           Balance and budget can be unavailable SEPARATELY: a cap we could not
           read must not blank a credit balance that arrived perfectly well. */
        const reasonText = (reason: string) =>
          reason === "token_missing"
            ? "Unavailable. No Cloudflare token configured"
            : reason === "account_id_missing"
              ? "Unavailable. No Cloudflare account configured"
              : `Unavailable. Cloudflare did not answer at ${asAt}`;
        const { balance, budget } = money;
        // Each card carries its OWN condition, both precomputed by the server
        // (UX §6.2 asks for red *flags*). One shared boolean reddened a healthy
        // balance because the cap was high, and a healthy cap because the
        // balance was low — pointing the reader at the wrong number. The bell
        // still counts the pair as ONE notification.
        const balanceLow = snapshot.redBalance;
        const capOver = snapshot.redCap;
        const capPct = budget.available && budget.capUsd > 0
          ? Math.round((budget.billedSpendUsd / budget.capUsd) * 100)
          : 0;
        // Each note decided here, in one place, rather than as a ternary chain
        // inside the markup: the card then renders a string it does not have to
        // reason about.
        const balanceNote = balance.available === false
          ? reasonText(balance.reason)
          : balanceLow
            ? `⚠ Below the $${snapshot.floorUsd.toFixed(2)} floor`
            : "USD, as Cloudflare reports it";
        const budgetNote = budget.available === false
          ? reasonText(budget.reason)
          : capOver
            ? `⚠ ${capPct}% of the $${budget.capUsd.toFixed(2)} ${budget.capSource} cap used`
            : `$${budget.billedSpendUsd.toFixed(2)} of the $${budget.capUsd.toFixed(2)} ${budget.capSource} cap used (${capPct}%)`;
        return (
          <div className="att-monitoring">
            <div className="att-grid">
              {/* FOUR TILES IN TWO NAMED PAIRS — the two questions this page
                  exists to answer, not four anonymous boxes in a row. */}
              <section className="att-group">
                <h2 className="att-group__label">AI budget</h2>
                <div className="att-pair">
                  <article
                    className="att-card"
                    data-state={balance.available === false ? "unavailable" : balanceLow ? "red" : undefined}
                    data-testid="monitoring-credit-balance"
                  >
                    <h3 className="att-card__label">Credit balance</h3>
                    <p className="att-card__figure">
                      {balance.available ? `$${balance.creditBalanceUsd.toFixed(2)}` : "—"}
                    </p>
                    <p className="att-card__note">
                      {balanceNote}
                    </p>
                    {stamp}
                  </article>
                  <article
                    className="att-card"
                    data-state={budget.available === false ? "unavailable" : capOver ? "red" : undefined}
                    data-testid="monitoring-cap-outstanding"
                  >
                    {/* REMAINING, because the figure is headroom; the note
                        carries the percentage, because the ceiling is one. */}
                    <h3 className="att-card__label">Cap remaining</h3>
                    <p className="att-card__figure">
                      {budget.available ? `$${capOutstanding(budget).toFixed(2)}` : "—"}
                    </p>
                    <p className="att-card__note">
                      {budgetNote}
                    </p>
                    {stamp}
                  </article>
                </div>
              </section>
              <section className="att-group">
                <h2 className="att-group__label">Parsing · last 7 days</h2>
                <div className="att-pair">
                  <article className="att-card" data-testid="monitoring-success-count">
                    {/* The key square ties a card to its bars: one fact in two
                        places, not two numbers that happen to agree. */}
                    <h3 className="att-card__label">
                      <span className="att-key" data-series="success" aria-hidden="true" />
                      Parses succeeded
                    </h3>
                    <p className="att-card__figure">{snapshot.success7d.toLocaleString("en-AU")}</p>
                    <p className="att-card__note">One parse = one job claim</p>
                    {stamp}
                  </article>
                  {/* NEVER PAINTED AS AN ALARM. v1 has one notification
                      condition and it is the budget; red here would claim an
                      alarm that does not exist. The red is the 8px key square —
                      a data hue, not a state. */}
                  <article className="att-card" data-testid="monitoring-error-count">
                    <h3 className="att-card__label">
                      <span className="att-key" data-series="error" aria-hidden="true" />
                      Parses errored
                    </h3>
                    <p className="att-card__figure">{snapshot.error7d.toLocaleString("en-AU")}</p>
                    <p className="att-card__note">Failed, or stuck over 30 minutes</p>
                    {stamp}
                  </article>
                </div>
              </section>
            </div>

            <section className="att-card att-chart" data-testid="monitoring-chart">
              <div className="att-chart__head">
                <h3 className="att-card__label">Successes and errors by day</h3>
                <p className="att-chart__legend">
                  <span><span className="att-key" data-series="success" aria-hidden="true" />Succeeded</span>
                  <span><span className="att-key" data-series="error" aria-hidden="true" />Errored</span>
                </p>
              </div>
              {/* A ZERO WEEK IS AN ANSWER, so the seven day labels stay under
                  the sentence and the window it speaks about is still on
                  screen (criterion 12). */}
              {allZero && (
                <div className="att-chart__empty">
                  <strong>Nothing parsed in the last 7 days</strong>
                  <span>Parsing runs when a customer uploads. No uploads, no parses.</span>
                </div>
              )}
              <div
                className={`att-plot${allZero ? " att-plot--labels-only" : ""}`}
                role="img"
                aria-label={`Successes and errors per day for the last 7 days; ${snapshot.success7d} succeeded, ${snapshot.error7d} errored`}
              >
                {snapshot.days.map((day, i) => {
                  const label = formatDayLabel(day.day);
                  const today = i === snapshot.days.length - 1;
                  return (
                    <div className="att-col" key={day.day}>
                      {!allZero && (
                        <div className="att-col__bars">
                          {/* A zero day draws a 2px stub, not nothing: a zero
                              bucket is a fact, a missing column is a gap. */}
                          <span
                            className="att-bar"
                            data-series="success"
                            data-zero={day.success === 0 || undefined}
                            style={day.success === 0 ? undefined : { height: `${(day.success / maxDay) * 100}%` }}
                          >
                            {day.success > 0 && <b>{day.success}</b>}
                          </span>
                          <span
                            className="att-bar"
                            data-series="error"
                            data-zero={day.error === 0 || undefined}
                            style={day.error === 0 ? undefined : { height: `${(day.error / maxDay) * 100}%` }}
                          >
                            {day.error > 0 && <b>{day.error}</b>}
                          </span>
                        </div>
                      )}
                      <span className="att-col__day" data-today={today || undefined}>
                        {today ? "Today" : (
                          <>
                            {label.weekday}
                            <i className="att-col__date"> {label.date}</i>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* The chart is a card like the four above it and gets the same
                  stamp when the snapshot is stale. Without it, a reader who has
                  scrolled the page-level freshness line out of view — which the
                  phone does readily — sees a chart that looks current. */}
              {stamp}
            </section>
          </div>
        );
      })()}
    </OpsPage>
  );
}
