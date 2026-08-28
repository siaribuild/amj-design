import type { MouseEvent as ReactMouseEvent } from "react";
import { IonIcon } from "@ionic/react";
import { alertCircleOutline, eyeOutline } from "ionicons/icons";
import { useHistory } from "react-router-dom";
import { Row, RowList } from "../chrome/RowList";
import { browserHref } from "../shellBase";
import {
  ageLabel, nextActionOf, priceOf, rowFlags, waitingSentence,
  type ProjectQueueRow, type RowFlag,
} from "./queue";

/** Where a row goes. Nested under `/projects` so the tab and the rail stay lit —
 *  Ionic computes the selected tab by segment-prefix, and a flat `/record/...`
 *  would leave the bar dark for most of the working day. */
export const recordPath = (row: ProjectQueueRow) => `/projects/${row.id}`;

function useOpenRow() {
  const history = useHistory();
  return (row: ProjectQueueRow) => history.push(recordPath(row));
}

/** Each chip's glyph. The icon is redundant with the word ON PURPOSE — it is
 *  what makes the chip row legible at a glance from arm's length, and the word
 *  is what makes it legible at all. Neither carries the meaning alone. */
const FLAG_ICON: Record<RowFlag["key"], string> = {
  unresolved: alertCircleOutline,
  review: eyeOutline,
};

/**
 * The card's chip row — the owner's drawn anatomy: an icon and a word, twice.
 *
 * A PLAIN SPAN, NOT `IonBadge`. The badge host paints a filled Ionic colour and
 * takes `--background`/`--color` only; the drawn chip is a tinted wash with its
 * own text colour, a leading glyph and a radius under the owner's 5px cap, and
 * every one of those is a token this stylesheet already owns.
 *
 * Chips are the EXCEPTION, never the default: a row with nothing on it carries
 * no chip row at all, so the eye learns that a chip means something. The
 * unresolved word comes from the model, which explains why it is not "Unpriced".
 */
function Flags({ row, compact = false }: { row: ProjectQueueRow; compact?: boolean }) {
  // The wide table asks for the unresolved chip only: its NEXT ACTION column
  // already reads `Us · Technical review` two lines above, and a `Needs review`
  // chip beside it would be the same sentence twice on one row. The card has no
  // such column, which is why the owner drew the chip there.
  const flags = compact
    ? rowFlags(row).filter((flag) => flag.key === "unresolved")
    : rowFlags(row);
  if (flags.length === 0) return null;
  return (
    <span className="pq-flags">
      {flags.map((flag) => (
        <span key={flag.key} className="pq-flag" data-tone={flag.tone}>
          <IonIcon icon={FLAG_ICON[flag.key]} aria-hidden="true" />
          {flag.label}
        </span>
      ))}
    </span>
  );
}

/**
 * Was this an ordinary left click, or an instruction to the browser?
 *
 * Ctrl/Cmd/Shift/Alt-click and middle-click mean "open it somewhere else", and
 * an anchor already knows how. Swallowing them takes away the very affordance
 * the anchor exists for — two projects open side by side at a desk — while
 * leaving it looking present.
 */
const isPlainClick = (event: ReactMouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * A click anywhere in a wide row.
 *
 * THE WHOLE ROW IS THE TARGET, so the whole row has to answer the same way. The
 * first cell holds a real anchor and the browser handles modified clicks on it
 * for free; the other five cells are table data with a pointer cursor, and a
 * Ctrl-click landing on `Stage` or `Total` used to do nothing at all — the
 * affordance the cursor advertised, failing everywhere except one cell.
 *
 * `window.open` rather than a stretched anchor: a table row cannot be a
 * positioning context that one cell's link could cover, and making every cell
 * its own anchor would put six links on one row for a screen reader to read.
 * Inside a user gesture this is not a popup.
 */
function openFromRow(
  event: ReactMouseEvent,
  row: ProjectQueueRow,
  open: (row: ProjectQueueRow) => void,
): void {
  // The anchor answers for itself; re-handling it here would push twice.
  if ((event.target as HTMLElement).closest("a")) return;
  if (isPlainClick(event)) { open(row); return; }
  window.open(browserHref(recordPath(row)), "_blank", "noopener,noreferrer");
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
    <RowList className="pq-cards ds-surface-card">
      {rows.map((row) => {
        const price = priceOf(row);
        const age = ageLabel(row, { short: true });
        return (
          <Row
            key={row.id}
            // WHAT THE EDGE MEANS IS THIS SURFACE'S TO SAY. The shared row draws
            // a mark; the queue decides it marks WHO OWES THE NEXT MOVE, which
            // is deliberately not `flagged` — the chips already say what is
            // wrong, and an edge that repeats a chip earns nothing.
            edge={row.waitingOn === "Us" ? "warning" : row.waitingOn === "Customer" ? "info" : null}
            onActivate={() => open(row)}
            data-testid="queue-row"
            data-waiting={row.waitingOn}
          >
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
                  <span className="pq-money" data-priced={price.priced}>{price.text}</span>
                </span>
                <Flags row={row} />
              </span>
              {/* A CARD IN THIS LIST NAVIGATES, and it is the only surface that
                  does — a record line opens a page on the phone and selects at
                  the desk, so a chevron there would promise one of those on the
                  surface doing the other. Passed as a child rather than as a
                  `chevron` prop on the row: one call site, always true, never
                  conditional, is a flag with a story attached. The class stays
                  in `rows.css` so the next navigating surface reuses the arrow
                  instead of redrawing it. */}
              <svg className="ops2-row__chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
          </Row>
        );
      })}
    </RowList>
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
                onClick={(event) => openFromRow(event, row, open)}
                // Middle click never reaches `onClick` — it is an aux click —
                // and the row advertises itself as openable with the same
                // cursor everywhere, so it has to answer there too.
                onAuxClick={(event) => {
                  if (event.button === 1) openFromRow(event, row, open);
                }}
              >
                <td>
                  <a
                    className="pq-open"
                    href={browserHref(recordPath(row))}
                    onClick={(event) => {
                      if (!isPlainClick(event)) return;
                      event.preventDefault();
                      open(row);
                    }}
                  >
                    <span className="pq-ref">{row.ref}</span>
                    <strong className="pq-title">{row.title}</strong>
                  </a>
                  <span className="pq-customer">{row.customerName ?? row.org ?? "No customer on file"}</span>
                </td>
                <td>
                  <span className="pq-next" data-waiting={row.waitingOn}>{nextActionOf(row)}</span>
                  {age && <span className="pq-age">{age}</span>}
                  <Flags row={row} compact />
                </td>
                <td className="pq-stage">{row.phase}</td>
                <td className="pq-num">{row.lineCount}</td>
                <td className="pq-num">
                  <span className="pq-money" data-priced={price.priced}>{price.text}</span>
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
