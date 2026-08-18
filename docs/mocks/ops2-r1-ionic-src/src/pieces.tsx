// Shared regions of the record surface. Ionic components wherever Ionic has one,
// so rows, ripples, dividers, keyboard behaviour and both palettes come from the
// framework.
import { useState } from "react";
import {
  IonItem, IonLabel, IonList, IonNote, IonBadge, IonIcon, IonButton, IonToggle,
} from "@ionic/react";
import { chevronForward } from "ionicons/icons";
import { Elevation } from "./elevation";
import {
  DELIVERY, FILES, HISTORY, LINES, PAYMENTS, PROJECTS, PROJECT_BLOCKS,
  PROJECT_NOTES, RECORD, type Line,
} from "./data";
import { Money, mm } from "./ui";

/* ═══════════════════════════════════════════════════════════════════════════
   THE HEADER
   ═══════════════════════════════════════════════════════════════════════════ */

/** The identity, and — separately — the project total, which goes in the
 *  literal top-right CORNER: the end slot of the back bar, which is the slot the
 *  overflow used to hold.
 *
 *  That corner used to hold the overflow, which read wrong beside a hamburger:
 *  "you have action bar at the bottom already, Total amount might work better in
 *  this corner - something that I miss from this view." So the overflow joined
 *  the actions at the bottom, where the other actions already were, and the
 *  money took the corner. It is now on screen at every scroll position and on
 *  both tabs.
 *
 *  This is also where rule A3's GST basis now lives — stated once, under the
 *  figure it governs, instead of eighteen times down the list. */
export function RecordTotal() {
  return (
    <div className="rec-total">
      <Money cents={RECORD.totalCents} basis size="lg" />
    </div>
  );
}

export function RecordIdentity() {
  return (
    <div className="rec-head">
      <h1><span className="mono">{RECORD.ref}</span> · {RECORD.title}</h1>
      <span className="sub">{RECORD.customer}</span>
    </div>
  );
}

/** The lifecycle, ranked instead of run together.
 *
 *  It was "Now · Technical review · waiting on us · 3 days in this state" —
 *  four facts at one weight in one dotted run, and the complaint was exactly
 *  that: "need to read all this to understand what is it trying to say."
 *
 *  A dotted run gives no fact priority, so the reader has to parse all four to
 *  find the one they wanted. Ranked, there is one thing to read at a glance and
 *  the rest is there without being in the way:
 *
 *      WAITING ON US              who owes the next move — the operational fact
 *      Technical review · 3 days  which phase, and how stale
 *
 *  "Now ·" is gone: it carried no information, it was scaffolding for a run that
 *  no longer exists. The row is tappable and opens Progress, where the phase
 *  ribbon and the move control live. */
export function StateRow({ onOpenProgress }: { onOpenProgress: () => void }) {
  const ours = RECORD.waitingOn === "us";
  const owed = ours ? "Waiting on us"
    : RECORD.waitingOn === "manufacturer" ? "With the manufacturer"
    : "Waiting on the customer";
  return (
    <button type="button" className="staterow" onClick={onOpenProgress}
      aria-label={`${owed}. ${RECORD.stateLabel}, ${RECORD.daysInState} days in this phase. Open Progress.`}>
      <span className="sr-owed" data-ours={ours ? "" : undefined}>{owed}</span>
      <span className="sr-rest">{RECORD.stateLabel} · {RECORD.daysInState} days</span>
      <IonIcon icon={chevronForward} className="sr-chev" aria-hidden="true" />
    </button>
  );
}

/** The one filter on this surface, and a full-width row — never a chip in a
 *  strip that has to be scrolled to. It now sits BELOW the segment because it
 *  filters the Lines list and belongs to it; above the segment it read as a
 *  property of the whole record and showed on the Project tab too. */
export function FilterRow({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="filterrow" aria-pressed={on} onClick={onToggle}>
      <span className="fr-dot" aria-hidden="true" />
      <span className="fr-text">
        {on ? `Showing the ${RECORD.unpricedCount} lines with no rate` : `${RECORD.unpricedCount} lines have no rate`}
      </span>
      <span className="fr-act">{on ? "show all" : "show only these"}</span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE LINES TAB
   ═══════════════════════════════════════════════════════════════════════════ */

/** The xs square elevation leads every row, so the list is scannable by SHAPE
 *  before a word is read.
 *
 *  Two things this review took out of the row:
 *   • the flag SENTENCE ("!Glazing does not meet the requirement on this
 *     elevation") — "it pollutes the screen. Highlight is enough." The row keeps
 *     the warning rule down its leading edge and its `needs review` badge; the
 *     sentence lives on the line itself, where the fix is.
 *   • "ex GST" under every price — see ui.tsx. */
export function LineList({
  lines, selectedId, dense, onPick,
}: {
  lines: Line[];
  selectedId: string | null;
  dense?: boolean;
  onPick: (id: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <IonItem lines="none">
        <IonLabel className="ion-text-wrap">
          <p>No lines without a rate. Clear the filter to see all {LINES.length}.</p>
        </IonLabel>
      </IonItem>
    );
  }
  return (
    <IonList lines="full" className={dense ? "ion-no-padding" : undefined}>
      {lines.map((l) => (
        <IonItem key={l.id} button detail={false} onClick={() => onPick(l.id)}
          aria-current={selectedId === l.id ? "true" : undefined}
          color={selectedId === l.id ? "light" : undefined}
          className={l.state === "needs review" ? "needs-review" : undefined}>
          <span className="rowelev" slot="start">
            <Elevation op={l.op} widthMm={l.widthMm} heightMm={l.heightMm}
              parts={l.parts} axis={l.axis} size="xs" square className="elev" />
          </span>
          <IonLabel className="ion-text-wrap">
            <span className="linebody">
              <span className="l1">
                <span className="code mono">{l.code}</span>
                <span className="prod">{l.product}{l.withdrawn ? " — withdrawn from sale" : ""}</span>
              </span>
              <span className="meta">
                {l.widthMm > 0 ? `${mm(l.heightMm)} × ${mm(l.widthMm)} mm` : "size not read"}
                {" · "}×{l.qty} · {l.room}
                {l.parts ? ` · ${l.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} joined units` : ""}
              </span>
            </span>
          </IonLabel>
          <div slot="end" className="rowend">
            <Money cents={l.priceCents} absent="no rate" />
            {l.state === "needs review" && <IonBadge color="warning">needs review</IonBadge>}
          </div>
        </IonItem>
      ))}
    </IonList>
  );
}

/** The totals panel at the end of the list, which the owner called out as
 *  working. Two changes and no more.
 *
 *  "estimate" is gone — his instruction, and the glossary agrees: the word is on
 *  Quote's own _Avoid_ line because the estimator is a different concept, so it
 *  was ambiguous as well as unwanted.
 *
 *  DELIVERY IS A REVIEWABLE ROW HERE, and this is the argument for the placement.
 *  The instinct was the Project tab; the reasoning points here. Delivery is not a
 *  setting to configure, it is a figure ops confirms and most likely updates
 *  before the quote goes out — "functionally, it is no different from the line
 *  review process". Three places were possible:
 *
 *    • In the Lines list as a row. Refused: a Line is "one configured opening"
 *      in the glossary. A delivery row there would have no drawing, no size, no
 *      per-line actions, would break the `Lines · 18` count and would put a
 *      non-opening in the filmstrip of openings.
 *    • On the Project tab. Refused: that is where a project's standing facts
 *      live. Delivery is money on this quote, and filing it beside Files and
 *      History puts it away from every other figure it is added to.
 *    • HERE, in the totals panel. Taken: it is already where delivery appears,
 *      it is where money is read, and it is what you reach after working down
 *      the eighteen lines — so the review sequence is lines, then delivery, then
 *      the total, in the order the eye already travels. The row carries a state
 *      and opens the same kind of small editing surface a line does. */
export function Totals({ onReviewDelivery }: { onReviewDelivery: () => void }) {
  const confirmed = DELIVERY.finalCents !== null;
  const shown = confirmed ? DELIVERY.finalCents : DELIVERY.proposedCents;
  const missing = DELIVERY.proposedCents === null && !confirmed;
  return (
    <div className="totals">
      <dl>
        <dt>Goods</dt>
        <dd><Money cents={RECORD.goodsCents} /></dd>

        <dt>Delivery</dt>
        <dd>
          <button type="button" className="delivery-row" onClick={onReviewDelivery}
            aria-label={missing ? "Delivery has no figure. Set it."
              : `Delivery ${confirmed ? "confirmed" : "not confirmed yet"}. Change it.`}>
            {missing
              /* An error, drawn as one, and the interface is not built around it. */
              ? <span className="d-missing">no figure — set it</span>
              : <>
                  <Money cents={shown} />
                  {!confirmed && <span className="d-state">not confirmed</span>}
                </>}
            <IonIcon icon={chevronForward} aria-hidden="true" />
          </button>
        </dd>

        <dt className="tot">Project total</dt>
        <dd className="tot"><Money cents={RECORD.totalCents} /></dd>
      </dl>
      <p className="totals-basis">All figures {RECORD.gstMode} · this account's setting</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE PROJECT TAB   (was "Job")
   CONTEXT.md puts "job" on Project's explicit _Avoid_ line, so the rename was
   owed on vocabulary grounds regardless of taste.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Every row states a real fact rather than a category name. Push rows at every
 *  width — move 1 only, no disclosure. */
export function ProjectBlocks({ current, onOpen }: {
  current?: string;
  onOpen: (key: string) => void;
}) {
  const sub: Record<string, { text: string; absent?: boolean }> = {
    progress: { text: `${RECORD.stateLabel} · waiting on ${RECORD.waitingOn} · ${RECORD.daysInState} days` },
    payments: PAYMENTS.received.length === 0
      ? { text: "Nothing received · 2 expected", absent: true }
      : { text: `${PAYMENTS.received.length} received` },
    files: { text: `1 schedule · ${FILES.attachments.length} attachments` },
    history: { text: `${HISTORY.length} events · last Tue 09:24` },
    notes: { text: `${PROJECT_NOTES.length} notes on this project` },
  };
  return (
    <IonList lines="full">
      {PROJECT_BLOCKS.map((b) => (
        <IonItem key={b.key} button detail={false} onClick={() => onOpen(b.key)}
          aria-current={current === b.key ? "true" : undefined}
          color={current === b.key ? "light" : undefined}>
          <IonLabel className="ion-text-wrap">
            <span className="pb-name">{b.name}</span>
            <p className={sub[b.key].absent ? "absent" : undefined}>{sub[b.key].text}</p>
          </IonLabel>
          <IonIcon slot="end" icon={chevronForward} color="medium" aria-hidden="true" />
        </IonItem>
      ))}
    </IonList>
  );
}

const PHASES = ["Received", "Estimating", "Technical review", "Quoted", "Ordered", "Delivered"];

function Progress() {
  const [withMfr, setWithMfr] = useState(false);
  return (
    <div className="section">
      {/* The ribbon's placement was called good; it stays exactly here. Six
          phases at 320px would be ~560px in one row, so it WRAPS. */}
      <div className="ribbon" role="img" aria-label="Phase 3 of 6, Technical review">
        {PHASES.map((p, i) => (
          <span key={p} className={"cell" + (i < 2 ? " passed" : i === 2 ? " current" : "")}>{p}</span>
        ))}
      </div>
      <dl className="kv">
        <div><dt>Waiting on</dt><dd>{withMfr ? "The manufacturer" : "Us"}</dd></div>
        <div><dt>In this phase</dt><dd>{RECORD.daysInState} days · since Tue 09:05</dd></div>
        <div><dt>Moved here by</dt><dd>Gedas</dd></div>
      </dl>
      {/* D10 — "with manufacturer" is orthogonal to phase and is the only
          waitingOn value a human sets rather than one derived from lifecycle. A
          switch, therefore, not a phase step. See the report: waiting on a
          COURIER is the same shape, which is an argument for generalising this
          rather than adding a second flag. */}
      <IonItem lines="none" className="flush">
        <IonToggle checked={withMfr} onIonChange={(e) => setWithMfr(e.detail.checked)}>
          Waiting on the manufacturer
        </IonToggle>
      </IonItem>
      <IonNote className="fact basis">
        Shows in the queue and on the attention surface. It does not change the phase.
      </IonNote>
      <div className="block-act">
        <IonButton expand="block">Move to Quoted</IonButton>
        <IonNote className="fact basis">Nothing is locked — you can move it back.</IonNote>
      </div>
    </div>
  );
}

function Payments() {
  return (
    <div className="section">
      <dl className="kv">
        <div><dt>Order no.</dt><dd>{PAYMENTS.orderNo} · appears on invoices</dd></div>
      </dl>
      <h3 className="sub-h">Received</h3>
      {PAYMENTS.received.length === 0 && <p className="absent">Nothing received yet.</p>}
      <h3 className="sub-h">Expected</h3>
      <ul className="rows">
        {PAYMENTS.expected.map((p) => (
          <li key={p.what}>
            <span className="r-name">{p.what}</span>
            <span className="r-when">{p.when}</span>
            <Money cents={p.cents} />
          </li>
        ))}
      </ul>
      <div className="block-act">
        <IonButton expand="block">Record a payment</IonButton>
        <IonNote className="fact basis">
          Recording a payment here does not send anything to the customer.
        </IonNote>
      </div>
    </div>
  );
}

function Files() {
  return (
    <div className="section">
      <h3 className="sub-h">The schedule this project came from</h3>
      <ul className="rows">
        <li>
          <span className="r-name">{FILES.source.name}</span>
          <span className="r-when">{FILES.source.size} · {FILES.source.when} · {FILES.source.who}</span>
        </li>
      </ul>
      <h3 className="sub-h">Attached since</h3>
      <ul className="rows">
        {FILES.attachments.map((f) => (
          <li key={f.name}>
            <span className="r-name">{f.name}</span>
            <span className="r-when">{f.size} · {f.when} · {f.who}</span>
          </li>
        ))}
      </ul>
      <div className="block-act"><IonButton expand="block">Add a file</IonButton></div>
    </div>
  );
}

function History() {
  return (
    <div className="section">
      <ul className="rows trail">
        {HISTORY.map((h, i) => (
          <li key={i}>
            <span className="r-name">{h.what}</span>
            <span className="r-when">{h.who} · {h.when}</span>
          </li>
        ))}
      </ul>
      <IonNote className="fact basis">
        Entity, action, actor and time. It is a record, not an undo — nothing here
        can be reversed from this screen.
      </IonNote>
    </div>
  );
}

function Notes() {
  return (
    <div className="section">
      {PROJECT_NOTES.map((n, i) => (
        <div key={i} className="note-item">
          <div className="who">{n.who}</div>
          <div className="body">{n.body}</div>
        </div>
      ))}
      <div className="block-act">
        <IonButton expand="block">Add a note to this project</IonButton>
        <IonNote className="fact basis">
          A note on the project, not on a line. Line notes stay on the line.
        </IonNote>
      </div>
    </div>
  );
}

export function ProjectBlockBody({ block }: { block: string }) {
  if (block === "progress") return <Progress />;
  if (block === "payments") return <Payments />;
  if (block === "files") return <Files />;
  if (block === "history") return <History />;
  return <Notes />;
}

export const blockName = (key: string) =>
  PROJECT_BLOCKS.find((b) => b.key === key)?.name ?? key;

/** The project list — the record's parent.
 *
 *  It exists because the record is NEVER the root: "even if we don't have it
 *  yet, the navigation should not be missing." This screen is also where the
 *  drawer opener lives; see App.tsx for why it is here and not on the record. */
export function ProjectList({ onOpen }: { onOpen: (ref: string) => void }) {
  return (
    <IonList lines="full">
      {PROJECTS.map((p) => (
        <IonItem key={p.ref} button detail={false} onClick={() => onOpen(p.ref)}>
          <IonLabel className="ion-text-wrap">
            <span className="linebody">
              <span className="l1">
                <span className="code mono">{p.ref}</span>
                <span className="prod">{p.title}</span>
              </span>
              <span className="meta">{p.customer} · {p.phase} · waiting on {p.waitingOn}</span>
            </span>
          </IonLabel>
          <div slot="end" className="rowend">
            <Money cents={p.totalCents} absent="not priced" />
            {p.flagged && <IonBadge color="warning">needs review</IonBadge>}
          </div>
        </IonItem>
      ))}
    </IonList>
  );
}
