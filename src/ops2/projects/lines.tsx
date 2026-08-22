import { useState } from "react";
import { IonIcon, IonNote } from "@ionic/react";
import { chevronForward, alertCircleOutline } from "ionicons/icons";
import {
  lineUnresolved, money, sizeLabel, type RecordLine, type RecordSegment,
} from "./record";

/**
 * The opening list — the same list the customer sees, rendered in this skin.
 *
 * ── WHAT "THE SAME LIST" MEANS HERE ─────────────────────────────────────────
 * The owner's ruling: share the FACTS, let each skin render. So the anatomy is
 * the customer's row, kept deliberately:
 *
 *   CODE  product name              size · qty        amount   ›
 *         room                      [ flags ]
 *
 * The code leads and is set in the display face, because it is what anchors a
 * line in every other artefact this business produces — the schedule, the
 * drawing, the factory ticket. The amount is last and right-aligned, because
 * money is what you compare down a column rather than read across a row. A
 * composite opening is ONE row with its units inside it, never loose beside it
 * — the endpoint's own query enforces that and the customer's list honours it.
 *
 * What is NOT carried over is the markup: `src/components/quote-project/*` is
 * built on the customer site's Tailwind and its hundred-odd theme classes, and
 * ops2's stylesheet entry documents its refusal to import that sheet. See
 * `./record.ts` for the full reasoning.
 */

/** A row's own flags — the exception shown, the default suppressed. */
function LineFlags({ line }: { line: RecordLine }) {
  const flags: string[] = [];
  // UNPRICED IS THE ONE THIS CONSOLE EXISTS TO FIND, so it is named as the
  // absence it is rather than folded into "unresolved".
  if (line.lineTotal == null) flags.push("No rate");
  if (line.status !== "ready") flags.push(line.status.replace(/_/g, " "));
  // The parser's own reasons — material substitution, out-of-range, glazing.
  // Its words, not a second vocabulary invented on this screen.
  for (const reason of Object.values(line.review ?? {})) flags.push(reason);
  if (flags.length === 0) return null;
  return (
    <span className="rl-flags">
      {flags.map((flag) => (
        <span key={flag} className="rl-flag">
          <IonIcon icon={alertCircleOutline} aria-hidden="true" />
          {flag}
        </span>
      ))}
    </span>
  );
}

/** A unit of a composite opening, inside its parent — with its own spec, because
 *  units of one opening differ and which ones is what a reviewer checks. */
function SegmentRow({ segment }: { segment: RecordSegment }) {
  const size = sizeLabel(segment);
  const options = Object.entries(segment.options).filter(([, v]) => v);
  return (
    <li className="rl-unit">
      <span className="rl-unit__name">
        {segment.productName}
        {segment.note && <span className="rl-unit__note"> · {segment.note}</span>}
      </span>
      <span className="rl-unit__meta">
        {size}
        {/* PER OPENING. The aggregate is shown beside it only when the two
            differ — a parent of one makes them the same number, and printing it
            twice would read as two facts. */}
        {segment.qty > 1 && <> · ×{segment.qty}</>}
        {segment.qtyTotal !== segment.qty && (
          <span className="rl-unit__total"> · {segment.qtyTotal} in all</span>
        )}
      </span>
      <span className="rl-money" data-priced={segment.lineTotal != null}>
        {segment.lineTotal == null ? "No rate" : money(segment.lineTotal)}
      </span>
      {options.length > 0 && (
        <span className="rl-unit__spec">
          {options.map(([label, value]) => (
            <span key={label} className="rl-unit__opt">
              <span className="rl-unit__opt-label">{label}</span> {value}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

/**
 * One opening.
 *
 * It expands only when it has something to expand INTO — the configured spec,
 * or the units of a composite. A twisty on a row that opens to nothing is a
 * control that cannot do anything, which is the defect this effort has now
 * recorded four times.
 */
function LineRow({ line }: { line: RecordLine }) {
  const [open, setOpen] = useState(false);
  const options = Object.entries(line.options).filter(([, v]) => v);
  const expandable = options.length > 0 || line.segments.length > 0;
  const size = sizeLabel(line);

  return (
    <li className="rl-row" data-unresolved={lineUnresolved(line)} data-testid="record-line">
      {/* The whole head is the toggle when there is something under it, and a
          plain block when there is not — rather than a row that looks pressable
          everywhere and answers in one place. */}
      {expandable ? (
        <button
          type="button"
          className="rl-head"
          aria-expanded={open}
          data-testid="record-line-toggle"
          onClick={() => setOpen((o) => !o)}
        >
          <LineHead line={line} size={size} />
          <IonIcon className="rl-twisty" icon={chevronForward} aria-hidden="true" />
        </button>
      ) : (
        <div className="rl-head rl-head--static">
          <LineHead line={line} size={size} />
        </div>
      )}

      {open && (
        <div className="rl-body" data-testid="record-line-body">
          {line.segments.length > 0 && (
            <ul className="rl-units">
              {line.segments.map((segment) => (
                <SegmentRow key={segment.id} segment={segment} />
              ))}
            </ul>
          )}
          {options.length > 0 && (
            <dl className="rl-spec">
              {options.map(([label, value]) => (
                <div key={label} className="rl-spec__pair">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </li>
  );
}

function LineHead({ line, size }: { line: RecordLine; size: string | null }) {
  return (
    <span className="rl-main">
      <span className="rl-top">
        {/* The code, in the display face and tabular, so a column of them reads
            as a column. A line with no code prints an em dash rather than a
            gap: the position in the schedule is a fact that is MISSING, not a
            field that happens to be empty. */}
        <span className="rl-code">{line.code || "—"}</span>
        <strong className="rl-name">{line.productName}</strong>
        <span className="rl-money" data-priced={line.lineTotal != null}>
          {line.lineTotal == null ? "No rate" : money(line.lineTotal)}
        </span>
      </span>
      <span className="rl-sub">
        {line.room && <span className="rl-room">{line.room}</span>}
        {size && <span className="rl-size">{size}</span>}
        {line.qty > 1 && <span className="rl-qty">×{line.qty}</span>}
        {line.segments.length > 0 && (
          <span className="rl-units-count">
            {line.segments.length} units
          </span>
        )}
      </span>
      <LineFlags line={line} />
    </span>
  );
}

export function RecordLines({ lines, orderNo }: {
  lines: readonly RecordLine[];
  /** Present ⇒ these are CONTRACT lines, and an empty list means something else. */
  orderNo?: string | null;
}) {
  if (lines.length === 0) {
    // TWO EMPTIES, TWO SENTENCES. A quote with no lines yet is waiting on the
    // customer or the estimator; an ORDER with no lines is a conversion that
    // has not finished, or has gone wrong — the same shape of screen meaning
    // opposite things, which is the distinction this console keeps making.
    return (
      <div className="rl-empty" data-testid="record-lines-empty">
        {orderNo ? (
          <>
            <strong>{orderNo} has no contract lines.</strong>
            <IonNote className="ds-type-caption">
              The order exists but nothing has been written against it. The quote it
              came from is in the legacy console.
            </IonNote>
          </>
        ) : (
          <>
            <strong>No lines on this project yet.</strong>
            <IonNote className="ds-type-caption">
              Lines arrive when the customer submits a schedule, or when the estimator runs.
            </IonNote>
          </>
        )}
      </div>
    );
  }
  return (
    <ul className="rl-list" data-testid="record-lines">
      {lines.map((line) => <LineRow key={line.id} line={line} />)}
    </ul>
  );
}
