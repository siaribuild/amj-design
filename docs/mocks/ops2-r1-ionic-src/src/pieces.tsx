// Shared regions. Ionic components wherever Ionic has one — ion-list/ion-item
// for every list, ion-button for every action, ion-note for every caption — so
// the rows, the ripple, the dividers, the keyboard behaviour and the dark
// palette all come from the framework.
import {
  IonItem, IonLabel, IonList, IonListHeader, IonNote, IonBadge, IonIcon,
} from "@ionic/react";
import { chevronForward } from "ionicons/icons";
import { Elevation } from "./elevation";
import { JOB_BLOCKS, LINES, RECORD, type Line } from "./data";
import { Money, mm } from "./ui";

export function RecordIdentity() {
  return (
    <div className="ident">
      <h1><span className="mono">{RECORD.ref}</span> · {RECORD.title}</h1>
      <span className="sub">{RECORD.customer}</span>
    </div>
  );
}

export function LifecycleRow() {
  return (
    <IonItem lines="full">
      <IonLabel className="ion-text-wrap">
        <p style={{ margin: 0 }}>
          Now · <strong>{RECORD.stateLabel}</strong> · waiting on {RECORD.waitingOn} ·{" "}
          {RECORD.daysInState} days in this state
        </p>
      </IonLabel>
    </IonItem>
  );
}

/** The one filter on this surface, and it is a full-width row — never a chip in
 *  a strip that has to be scrolled to. `warning` because it is ours to resolve
 *  and it stops nobody (rule A2). */
export function FilterRow({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <IonItem button detail={false} lines="full" onClick={onToggle}
      aria-pressed={on} color={on ? "warning" : undefined}>
      <IonLabel className="ion-text-wrap">
        {on
          ? `Showing only the ${RECORD.unpricedCount} unpriced lines`
          : `${RECORD.unpricedCount} lines are unpriced`}
      </IonLabel>
      <IonNote slot="end">{on ? "clear" : "show"}</IonNote>
    </IonItem>
  );
}

export function Totals() {
  return (
    <div className="totals">
      <dl>
        <dt>Goods</dt>
        <dd><Money cents={RECORD.goodsCents} /></dd>
        <dt>Delivery</dt>
        <dd><Money cents={null} absent="no rate for Zone 4 — Outer metro" /></dd>
        <dt><strong>Quote total</strong></dt>
        <dd><Money cents={RECORD.totalCents} /></dd>
      </dl>
      <IonNote className="fact basis" style={{ display: "block", marginTop: 6, fontSize: ".75rem" }}>
        estimate · this account's setting
      </IonNote>
    </div>
  );
}

/** The line list, an ion-list at every width. CRITIQUE 3 — the xs square
 *  elevation leads every row, so the list is scannable by SHAPE before a word is
 *  read: an awning among sliders is visible at a glance. `square` keeps the
 *  column's left edge straight; the panel count, mullions and opening symbols
 *  still derive from the real millimetres. */
export function LineList({
  lines, selectedId, dense, onPick,
}: {
  lines: Line[];
  selectedId: string | null;
  /** The desktop rail. Denser, not less capable — nothing is removed. */
  dense?: boolean;
  onPick: (id: string) => void;
}) {
  if (lines.length === 0) {
    return (
      <IonItem lines="none">
        <IonLabel className="ion-text-wrap">
          <p>No unpriced lines. Clear the filter to see all {LINES.length}.</p>
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
              {l.flags.map((f) => <span key={f} className="flag">{f}</span>)}
            </span>
          </IonLabel>
          <div slot="end" style={{ textAlign: "right" }}>
            <Money cents={l.priceCents} absent="no rate" />
            {l.state === "needs review" && (
              <div style={{ marginTop: 4 }}>
                <IonBadge color="warning">needs review</IonBadge>
              </div>
            )}
          </div>
        </IonItem>
      ))}
    </IonList>
  );
}

export function AddLineRow({ onClick }: { onClick: () => void }) {
  return (
    <IonItem button detail={false} lines="full" onClick={onClick}>
      <IonLabel color="primary" className="ion-text-wrap">
        <strong>+ Add a line</strong>
        <p>Opens the editor with an empty configuration.</p>
      </IonLabel>
    </IonItem>
  );
}

/** MOVE 1, not move 2. The five job blocks stay DESTINATIONS at every width: a
 *  push-row list that pushes a plane below 1024 and selects into the canvas
 *  beside it at 1024 and above. Same routes, same components, nothing hidden
 *  behind a click, one information architecture. */
export function JobBlocks({ current, onOpen }: {
  current?: string;
  onOpen: (key: string) => void;
}) {
  return (
    <IonList lines="full">
      <IonListHeader>
        <IonLabel>This job</IonLabel>
      </IonListHeader>
      {JOB_BLOCKS.map((b) => (
        <IonItem key={b.key} button detail={false} onClick={() => onOpen(b.key)}
          aria-current={current === b.key ? "true" : undefined}
          color={current === b.key ? "light" : undefined}>
          <IonLabel className="ion-text-wrap">
            <strong>{b.name}</strong>
            <p className={"absent" in b && b.absent ? "absent" : undefined}>{b.sub}</p>
          </IonLabel>
          <IonIcon slot="end" icon={chevronForward} color="medium" aria-hidden="true" />
        </IonItem>
      ))}
    </IonList>
  );
}

const PHASES = ["Received", "Estimating", "Technical review", "Quoted", "Ordered", "Delivered"];

export function JobBlockBody({ block }: { block: string }) {
  if (block === "progress") {
    return (
      <div className="section">
        <h2>Progress</h2>
        <div className="ribbon" role="img" aria-label="Phase 3 of 6, Technical review">
          {PHASES.map((p, i) => (
            <span key={p} className={"cell" + (i < 2 ? " passed" : i === 2 ? " current" : "")}>{p}</span>
          ))}
        </div>
        <p>
          Now · <strong>{RECORD.stateLabel}</strong> · waiting on {RECORD.waitingOn} ·{" "}
          {RECORD.daysInState} days in this state
        </p>
        <IonNote className="fact">Updated {RECORD.updatedAt}. Refreshed when you ask, never polled.</IonNote>
      </div>
    );
  }
  if (block === "payments") {
    return (
      <div className="section">
        <h2>Payments</h2>
        <p className="absent">No payments recorded.</p>
        <p className="absent">Order no. 10482 · appears on invoices</p>
      </div>
    );
  }
  const n: Record<string, string> = {
    files: "4 attached", history: "23 events", notes: "2 notes on this job",
  };
  return (
    <div className="section">
      <h2>{block}</h2>
      <p>{n[block] ?? ""} — omitted from the mock.</p>
    </div>
  );
}
