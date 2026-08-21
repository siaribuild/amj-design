import { IonBadge, IonItem, IonLabel, IonList } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { browserHref } from "../shellBase";
import {
  ageLabel, nextActionOf, priceOf, waitingSentence, type ProjectQueueRow,
} from "./queue";

/** Where a row goes. Nested under `/projects` so the tab and the rail stay lit —
 *  Ionic computes the selected tab by segment-prefix, and a flat `/record/...`
 *  would leave the bar dark for most of the working day. */
export const recordPath = (row: ProjectQueueRow) => `/projects/${row.id}`;

function useOpenRow() {
  const history = useHistory();
  return (row: ProjectQueueRow) => history.push(recordPath(row));
}

/** Chips are the EXCEPTION, never the default: a row with nothing wrong carries
 *  none at all, so the eye learns that a chip means something. */
function Flags({ row }: { row: ProjectQueueRow }) {
  if (row.unresolved <= 0) return null;
  return (
    <span className="pq-flags">
      <IonBadge color="warning">Unpriced {row.unresolved}</IonBadge>
    </span>
  );
}

/**
 * The phone list — the owner's own card anatomy, in his order: reference
 * top-left, status top-right, title, customer, lines/stage, amount, chevron.
 *
 * The leading EDGE marks waiting on us — the row's headline status — and not
 * `flagged`. The mock's reasoning is carried forward: "the chips already say
 * what is wrong, and an edge that repeats a chip earns nothing." Leading edge,
 * never the bottom divider: a divider belongs to neither of the two rows it
 * separates, so it cannot say which one it means.
 *
 * The card's inner grammar is light DOM inside `IonLabel` — disqualifier 3 of
 * `docs/design/ops2-ionic-boundary.md` §1.1, "row/column typography under direct
 * token control across measured widths". `IonItem` still owns what it is good
 * at: the tap target, the platform ripple, the chevron and the safe areas.
 */
export function ProjectCards({ rows }: { rows: readonly ProjectQueueRow[] }) {
  const open = useOpenRow();
  return (
    <IonList lines="none" className="pq-cards">
      {rows.map((row) => {
        const price = priceOf(row);
        const age = ageLabel(row, { short: true });
        return (
          <IonItem
            key={row.id}
            button
            detail
            data-testid="queue-row"
            data-waiting={row.waitingOn}
            onClick={() => open(row)}
          >
            <IonLabel className="ion-text-wrap">
              <span className="pq-card">
                <span className="pq-card__top">
                  <span className="pq-ref">{row.ref}</span>
                  {/* The status is a WORD first and a colour second: it has to
                      read identically in greyscale, which is also what makes it
                      survive a phone held in sunlight. The age stays quiet — it
                      qualifies the status, it is not the status. */}
                  <span className="pq-wait" data-waiting={row.waitingOn}>
                    <b>{waitingSentence(row)}</b>
                    {age && <span className="pq-age"> · {age}</span>}
                  </span>
                </span>
                <strong className="pq-title">{row.title}</strong>
                <span className="pq-customer">{row.customerName ?? row.org ?? "No customer on file"}</span>
                <span className="pq-card__bottom">
                  <span>{row.lineCount} lines · {row.stateLabel}</span>
                  <span className="pq-money" data-priced={price.priced}>
                    {price.text}
                    {price.basis && <span className="pq-basis"> {price.basis}</span>}
                  </span>
                </span>
                <Flags row={row} />
              </span>
            </IonLabel>
          </IonItem>
        );
      })}
    </IonList>
  );
}

/**
 * The wide list — the owner's five columns: PROJECT · NEXT ACTION · STAGE ·
 * LINES · TOTAL, and the chevron.
 *
 * A real `<table>`, named against disqualifier 3: this is row/column typography
 * under direct token control, which the boundary document lists as a reason to
 * leave Ionic rather than a lapse from it. `IonGrid` would give a flex layout
 * with no column relationship and no header association.
 *
 * The PROJECT cell carries a REAL ANCHOR with a browser-facing href, because
 * two projects open side by side is a thing that actually happens at a desk.
 * The whole row is clickable as a convenience on top of it, never instead:
 * `browserHref()` for the anchor, the router for the click — the two halves of
 * the same boundary that `../nav/tabHrefs.ts` records.
 */
export function ProjectTable({ rows }: { rows: readonly ProjectQueueRow[] }) {
  const open = useOpenRow();
  return (
    <div className="pq-table-wrap">
      <table className="pq-table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Next action</th>
            <th scope="col">Stage</th>
            <th scope="col" className="pq-num">Lines</th>
            <th scope="col" className="pq-num">Total</th>
            <th scope="col"><span className="ops2-sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const price = priceOf(row);
            const age = ageLabel(row);
            return (
              <tr
                key={row.id}
                data-testid="queue-row"
                data-waiting={row.waitingOn}
                onClick={(event) => {
                  // The anchor handles its own activation; re-handling it here
                  // would push the same route twice.
                  if ((event.target as HTMLElement).closest("a")) return;
                  open(row);
                }}
              >
                <td>
                  <a
                    className="pq-open"
                    href={browserHref(recordPath(row))}
                    onClick={(event) => { event.preventDefault(); open(row); }}
                  >
                    <span className="pq-ref">{row.ref}</span>
                    <strong className="pq-title">{row.title}</strong>
                  </a>
                  <span className="pq-customer">{row.customerName ?? row.org ?? "No customer on file"}</span>
                </td>
                <td>
                  <span className="pq-next" data-waiting={row.waitingOn}>{nextActionOf(row)}</span>
                  {age && <span className="pq-age">{age}</span>}
                  <Flags row={row} />
                </td>
                <td className="pq-stage">{row.phase}</td>
                <td className="pq-num">{row.lineCount}</td>
                <td className="pq-num">
                  <span className="pq-money" data-priced={price.priced}>{price.text}</span>
                  {price.basis && <span className="pq-basis">{price.basis}</span>}
                </td>
                <td className="pq-chevron" aria-hidden="true">›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
