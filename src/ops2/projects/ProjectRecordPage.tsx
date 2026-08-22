import { useState } from "react";
import {
  IonButton, IonIcon, IonNote, IonSkeletonText,
} from "@ionic/react";
import { ellipsisHorizontal, warningOutline } from "ionicons/icons";
import { useParams } from "react-router-dom";
import { destination } from "../nav/destinations";
import { useRailWidth } from "../nav/useRailWidth";
import { OpsPage } from "../chrome/OpsPage";
import { SidePanel } from "../chrome/SidePanel";
import { RecordLines } from "./lines";
import { useProjectRecord, requestFor } from "./useProjectRecord";
import {
  ageLabel, money, otherActions, pendingPrimary, primaryAction, totalsFor,
  waitingSentence, type ProjectRecord, type RecordAction,
} from "./record";

const PROJECTS = destination("projects");

type Tab = "lines" | "project";

/**
 * The project record — the second real destination in ops2, and the one the
 * whole console is being rebuilt to reach.
 *
 * The owner's framing, 2026-08-23: "the MVP is really to get the ops2 scaffold
 * in place and to be able to get to the point where 'Why this product?' becomes
 * visible and useful — that is an immediate need that simply does not exist in
 * legacy ops." So this surface is built to hold that: the line list is the
 * thing, and everything around it is the least chrome that lets a reviewer work
 * down it.
 *
 * ── WHAT IS HERE, AND WHY IN THIS ORDER ─────────────────────────────────────
 *   ‹ Projects                              back, and it NAMES its destination
 *   OF-Q-10482 · Wattle Grove       $48,802 identity, then the money
 *   Marchetti Constructions · Waiting on us the customer, then the state
 *   [ Issue reviewed quote ]  [ ⋯ ]         the one move, and the rest
 *   Lines · 18 | Project                    the same tabs the queue uses
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * The PROJECT TAB'S CONTENTS — progress, payments, files, activity. The owner
 * fenced them out of this step by name. The tab exists because the two tabs are
 * the structure he asked for and a tab that appears later moves everything
 * beside it; what is behind it says plainly that it is not built rather than
 * showing an empty frame that reads as broken data.
 *
 * And the actions this build cannot perform. `worker/lib/ops-actions.ts`
 * returns more than the panel shows — `Add a note` and `Request clarification`
 * both need something typed, and neither has a screen yet. They are omitted
 * rather than listed and inert: a control drawn and wired to nothing is the
 * defect this effort has recorded four times.
 */
export function ProjectRecordPage() {
  const { id } = useParams<{ id: string }>();
  const wide = useRailWidth();
  const { load, reload } = useProjectRecord(id);
  const [tab, setTab] = useState<Tab>("lines");
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirming, setConfirming] = useState<RecordAction | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const record = load.status === "ready" ? load.record : null;
  // BOTH HALVES OF "WHAT HAPPENS NEXT". `primaryAction` is the move this build
  // can make; `pendingPrimary` is the one it cannot — the order stage machine's
  // `advance:*` and `pay:*` have real endpoints and no screen here. The second
  // is stated rather than dropped, because the next move is the most useful
  // thing on this screen, and rendered as a SENTENCE rather than as a button
  // that does nothing when pressed.
  const primary = record ? primaryAction(record) : null;
  const pending = record ? pendingPrimary(record) : null;
  const others = record ? otherActions(record) : [];

  const run = async (action: RecordAction) => {
    if (!record) return;
    const request = requestFor(record.id, action.id);
    if (!request) return;
    setRunning(action.id);
    setFailure(null);
    try {
      const res = await fetch(request.url, {
        method: "POST",
        credentials: "same-origin",
        headers: request.body ? { "content-type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      if (!res.ok) {
        // THE SERVER'S OWN REFUSAL, not a sentence composed here. It is the
        // authority on why an action will not run, and paraphrasing it is how a
        // console ends up explaining a rule it no longer implements.
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setFailure(body?.error ?? `The server answered ${res.status}.`);
        return;
      }
      setPanelOpen(false);
      setConfirming(null);
      reload();
    } catch {
      setFailure("The console could not reach the server.");
    } finally {
      setRunning(null);
    }
  };

  /** Pressing an action: confirm first when the server says to. */
  const press = (action: RecordAction) => {
    if (action.blockedReason) return;
    // `confirm` is present exactly when the action MOVES MONEY OR EMAILS THE
    // CUSTOMER (`worker/lib/ops-actions.ts`), so the step is the server's call
    // rather than this screen's taste.
    if (action.confirm) { setConfirming(action); setPanelOpen(false); return; }
    void run(action);
  };

  return (
    <OpsPage
      destination={PROJECTS}
      title={record ? record.ref : "Project"}
      backTo={{ label: "Projects", href: PROJECTS.path }}
      width="full"
      headActions={record ? (
        <div className="rec-cta">
          {primary && (
            <IonButton
              size="small"
              className="rec-cta__primary"
              data-testid="record-primary"
              // SHOWN, REFUSED, AND SAID OUT LOUD. The owner's correction:
              // "a human can and must be blocked in certain scenarios. What
              // that rule is meant to imply was that a human has decision
              // authority to override any configuration, project guardrails,
              // any recommendation produced earlier. It does not mean that
              // issuing with a missing product, dimensions or price is
              // allowed." The server already models exactly this distinction.
              disabled={!!primary.blockedReason || running === primary.id}
              onClick={() => press(primary)}
            >
              {primary.label}
            </IonButton>
          )}
          {others.length > 0 && (
            <IonButton
              size="small"
              fill="clear"
              className="rec-cta__more"
              data-testid="record-more"
              onClick={() => setPanelOpen(true)}
            >
              <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
              <span className="ops2-sr-only">More actions for this project</span>
            </IonButton>
          )}
        </div>
      ) : undefined}
      controls={record ? (
        <div className="pq-controls" data-wide={wide}>
          <div className="pq-chips" role="group" aria-label="What to show">
            <button
              type="button"
              className="pq-chip"
              data-testid="record-tab"
              data-tab="lines"
              aria-pressed={tab === "lines"}
              onClick={() => setTab("lines")}
            >
              Lines<span className="pq-count">{record.lines.length}</span>
            </button>
            <button
              type="button"
              className="pq-chip"
              data-testid="record-tab"
              data-tab="project"
              aria-pressed={tab === "project"}
              onClick={() => setTab("project")}
            >
              Project
            </button>
          </div>
        </div>
      ) : undefined}
    >
      {load.status === "loading" && (
        <div className="rec-skeleton" data-testid="record-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "72px" }} />
          <IonSkeletonText animated style={{ height: wide ? "300px" : "420px" }} />
        </div>
      )}

      {load.status === "missing" && (
        // A DIFFERENT SENTENCE AND A DIFFERENT WAY OUT. "Try again" would send
        // someone retrying a URL that will never resolve.
        <div className="pq-empty" data-testid="record-missing">
          <strong>This project is not here.</strong>
          <IonNote className="ds-type-caption">
            The reference may have changed, or the project may have been removed.
          </IonNote>
          <IonButton size="small" fill="outline" routerLink={PROJECTS.path}>
            Back to Projects
          </IonButton>
        </div>
      )}

      {load.status === "error" && (
        <div className="pq-error ds-surface-card" data-testid="record-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {record && (
        <>
          <RecordIdentity record={record} />

          {/* The refusal sits with the control it refuses — R-153's adjacency.
              A blocked primary in the header and its reason at the foot of the
              page are two facts a reader has to join up themselves. */}
          {primary?.blockedReason && (
            <p className="rec-blocked" data-testid="record-blocked">
              <IonIcon icon={warningOutline} aria-hidden="true" />
              {primary.blockedReason}
            </p>
          )}
          {pending && (
            <p className="rec-pending" data-testid="record-pending">
              <b>Next: {pending.label}</b>
              <span>
                {" "}— not in ops2 yet. This job's next move lives in the legacy console.
              </span>
            </p>
          )}
          {failure && (
            <p className="rec-blocked" data-testid="record-failure" role="alert">
              <IonIcon icon={warningOutline} aria-hidden="true" />
              {failure}
            </p>
          )}

          {tab === "lines" ? (
            <>
              <RecordLines lines={record.lines} />
              <RecordTotals record={record} />
            </>
          ) : (
            <div className="pq-empty" data-testid="record-project-tab">
              <strong>Progress, payments and files are not built yet.</strong>
              <IonNote className="ds-type-caption">
                They are migrating from the legacy console one at a time. Until then
                this project's history lives there.
              </IonNote>
            </div>
          )}
        </>
      )}

      {record && (
        <SidePanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          title="Project actions"
          testId="record-actions-panel"
          footer={
            <IonNote className="ds-type-caption">
              Notes, clarification requests and delivery arrive with their own screens.
            </IonNote>
          }
        >
          <div className="rec-actions">
            {others.map((action) => (
              <IonButton
                key={action.id}
                expand="block"
                fill="clear"
                className="rec-actions__item"
                data-testid="record-action"
                data-action={action.id}
                disabled={!!action.blockedReason || running === action.id}
                onClick={() => press(action)}
              >
                {action.label}
              </IonButton>
            ))}
          </div>
        </SidePanel>
      )}

      {/* The confirm step, in place rather than as a browser dialog: the
          sentence is the server's and it names the consequence. */}
      {confirming && (
        <SidePanel
          open
          onClose={() => setConfirming(null)}
          title={confirming.label}
          testId="record-confirm"
          footer={
            <IonButton
              expand="block"
              data-testid="record-confirm-go"
              disabled={running === confirming.id}
              onClick={() => void run(confirming)}
            >
              {confirming.label}
            </IonButton>
          }
        >
          <p className="rec-confirm">{confirming.confirm}</p>
        </SidePanel>
      )}
    </OpsPage>
  );
}

/** Identity and money — who this job is for, and what it comes to. */
function RecordIdentity({ record }: { record: ProjectRecord }) {
  const totals = totalsFor(record);
  const age = ageLabel(record);
  return (
    <div className="rec-ident" data-testid="record-identity">
      <div className="rec-ident__who">
        <h2 className="rec-ident__title">{record.title}</h2>
        <p className="rec-ident__sub">
          {record.org ?? record.customerName ?? "No customer on file"}
          {record.orderNo && <span className="rec-ident__order"> · {record.orderNo}</span>}
        </p>
        <p className="rec-ident__state" data-waiting={record.waitingOn}>
          <b>{waitingSentence(record)}</b>
          <span> · {record.stateLabel}</span>
          {age && <span className="rec-ident__age"> · {age}</span>}
        </p>
      </div>
      <div className="rec-ident__money">
        {/* A SUM OVER UNPRICED LINES IS A FLOOR, NOT A TOTAL, so it is not
            printed as one. The figure is still shown — a reviewer wants to know
            roughly where the job sits — with the word that makes it honest. */}
        <strong data-priced={totals.total != null}>
          {totals.total != null ? money(totals.total) : money(totals.lines)}
        </strong>
        <span>{totals.total != null ? "ex GST" : "so far · ex GST"}</span>
      </div>
    </div>
  );
}

/**
 * The foot of the list: lines, delivery, and what they come to.
 *
 * DELIVERY IS A ROW HERE EVEN WHEN IT IS UNSET, because unset is the state that
 * blocks the quote and the one a reviewer has to notice. Its live estimate is
 * shown beside it as an estimate and never folded into the total — it moves
 * with the rate table, and a total that changes because someone edited a zone
 * is not a total.
 */
function RecordTotals({ record }: { record: ProjectRecord }) {
  const t = totalsFor(record);
  return (
    <div className="rec-totals" data-testid="record-totals">
      <div className="rec-totals__row">
        <span>
          Lines
          {t.partial && (
            <span className="rec-totals__caveat"> · {t.unpriced} with no rate</span>
          )}
        </span>
        <span className="rec-totals__figure">{money(t.lines)}</span>
      </div>
      <div className="rec-totals__row" data-settled={t.deliverySettled}>
        <span>Delivery</span>
        <span className="rec-totals__figure">
          {t.deliverySettled
            ? money(t.delivery ?? 0)
            : record.delivery.estimate != null
              ? <>Not set <span className="rec-totals__caveat">· about {money(record.delivery.estimate)}</span></>
              : "Not set"}
        </span>
      </div>
      <div className="rec-totals__row rec-totals__row--sum">
        <span>{t.total != null ? "Total ex GST" : "So far, ex GST"}</span>
        <span className="rec-totals__figure">
          {t.total != null ? money(t.total) : money(t.lines)}
        </span>
      </div>
      {t.total == null && (
        <IonNote className="ds-type-caption rec-totals__note">
          {t.partial
            ? "Not a total: some lines have no rate yet."
            : "Not a total: delivery has not been set."}
        </IonNote>
      )}
    </div>
  );
}
