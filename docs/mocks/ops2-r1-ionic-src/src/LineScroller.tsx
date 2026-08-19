// ═══════════════════════════════════════════════════════════════════════════════
// THE BOTTOM DECK — the line scroller and the action footer, as one composition
//
// CRITIQUE 2, second pass. "Scroller at the bottom — good direction."
//
// THE DISTINCTION THIS HAS TO EARN, held explicitly:
//   • DESTINATIONS must never scroll sideways. A fixed, small set where every
//     member has to be reachable — tabs, segments, filters, sections — cannot
//     hide members off-screen. That is the ruling, and the record surface's
//     Lines/Job segment, the verdict index and the five sections all obey it.
//   • CONTENT may scroll. Eighteen openings are not a set of destinations; they
//     are the material being worked through, and moving along them IS a scroll.
//     A filmstrip of the lines at the bottom edge is therefore the opposite of
//     the rejected pattern, not a rebrand of it.
//
// Design, against the four things it was told to answer:
//
//  1. POSITION LEGIBLE WITHOUT COUNTING. A fixed, non-scrolling `4 / 18` label
//     sits at the left of the band. It never moves, so the answer to "where am I"
//     never depends on counting pills or on where the run happens to be scrolled.
//     The filmstrip's own offset then gives the second, spatial reading — the same
//     cue a scrollbar gives, but made of the work itself.
//  2. THE RUN IS THE FILTERED SET (R-155). Turn on "unpriced" and the deck is
//     two pills long and the label says `2 unpriced`. The count is never a lie
//     about a set you are not in.
//  3. ONE-HANDED AT 320px. The band is 44px, the pills ≥52px wide with a 44px
//     hit height, scroll-snap so a flick lands on a line rather than between two,
//     and the active pill is scrolled into view whenever the line changes — so
//     after arriving by any route the strip is already showing where you are.
//  4. 18 vs 100 LINES. At 18 the whole run is roughly two flicks. At 100 it is
//     not, and swiping a filmstrip 100 items long is not a way to reach line 84 —
//     so the fixed label is itself the button that opens the full list as an Ionic
//     sheet modal. Sequential movement is the filmstrip; non-sequential movement
//     is one tap, at any length. Neither degrades as the record grows.
//
// R-158 — never the only route. Four routes to the same move: the filmstrip, the
// switcher sheet, the record's own list (still there, still the primary), and
// `[`/`]` on a keyboard. The horizontal swipe on the body is a fifth, and it is
// only ever an accelerator.
//
// THE FOOTER BUDGET, which §13.5 measured and which this spends. The deck is ONE
// composition: 44px scroller + 56px action row = 100px, and it is the only chrome
// at the bottom edge. Against the shipped alternative — a 36px lens chip strip
// plus a 56px footer = 92px — it costs 8px, and it buys the chip strip's removal
// from the top of the body as well. The action row is untouched: R-153's one
// primary taking the width, `⋯` for every secondary, and the blocked primary's
// reason beneath it inside the footer.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef } from "react";
import {
  IonModal, IonContent, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonList, IonItem, IonLabel, IonBadge,
} from "@ionic/react";
import { Elevation } from "./elevation";
import type { Line } from "./data";
import { Money, mm } from "./ui";

export function LineScroller({
  run, at, filtered, onPick, onOpenList,
}: {
  run: Line[];
  at: number;
  filtered: boolean;
  onPick: (id: string) => void;
  onOpenList: () => void;
}) {
  const runEl = useRef<HTMLDivElement>(null);

  /* Whatever route brought you to this line — the list, a deep link, a swipe,
     the keyboard — the strip ends up showing it. Without this the filmstrip would
     silently disagree with the header. */
  useEffect(() => {
    const el = runEl.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [at, filtered]);

  return (
    <div className="scroller" role="group" aria-label="The lines under review">
      <button type="button" className="scroller-at" onClick={onOpenList}
        aria-label={`Line ${at + 1} of ${run.length}${filtered ? " unpriced" : ""} — open the full list`}>
        <span className="n">{at + 1} / {run.length}</span>
        <span className="of">{filtered ? "unpriced" : "lines"}</span>
      </button>
      {run.length === 0 ? (
        <p className="scroller-empty">No lines in this filter.</p>
      ) : (
        <div className="scroller-run" ref={runEl}>
          {run.map((l, i) => (
            <button key={l.id} type="button" className="pill"
              aria-current={i === at ? "true" : undefined}
              aria-label={`${l.code}, ${l.room}${l.state === "needs review" ? ", needs review" : ""}`}
              onClick={() => onPick(l.id)}>
              {l.code}
              {l.state === "needs review" && <span className="dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The non-sequential jump, over the line rather than back to it. An Ionic sheet
 *  modal: the drag handle, the breakpoints, drag-to-dismiss, the scrim, the focus
 *  trap and Esc are all the framework's. Rows carry the xs drawing, so the list
 *  is scannable by shape — the schematic's second payoff after the plate. */
export function LineSwitcher({
  open, onClose, run, at, filtered, onPick,
}: {
  open: boolean;
  onClose: () => void;
  run: Line[];
  at: number;
  filtered: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <IonModal isOpen={open} onDidDismiss={onClose}
      breakpoints={[0, 0.65, 1]} initialBreakpoint={0.65} handleBehavior="cycle">
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle>{filtered ? `${run.length} unpriced lines` : `All ${run.length} lines`}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList lines="full">
          {run.map((l, i) => (
            <IonItem key={l.id} button detail={false}
              aria-current={i === at ? "true" : undefined}
              color={i === at ? "light" : undefined}
              onClick={() => { onPick(l.id); onClose(); }}>
              <span className="rowelev" slot="start">
                <Elevation op={l.op} widthMm={l.widthMm} heightMm={l.heightMm}
                  parts={l.parts} axis={l.axis} size="xs" square className="elev" />
              </span>
              <IonLabel className="ion-text-wrap">
                <strong className="mono">{l.code}</strong>
                {/* The customer's 500-char note is out of these rows too — same
                    list grammar, same argument as the record's Lines list. */}
                <p>{l.widthMm > 0 ? `${mm(l.heightMm)} × ${mm(l.widthMm)} mm` : "size not read"} · ×{l.qty}</p>
              </IonLabel>
              <div slot="end" style={{ textAlign: "right" }}>
                <Money cents={l.priceCents} absent="no rate" />
                {l.state === "needs review" && (
                  <div style={{ marginTop: 4 }}><IonBadge color="warning">needs review</IonBadge></div>
                )}
              </div>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonModal>
  );
}

/** Keyboard route to the same move, for the desktop. */
export function useMoveKeys(onMove: (d: -1 | 1) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (t?.closest("ion-input, ion-select, ion-textarea")) return;
      if (e.key === "[") { e.preventDefault(); onMove(-1); }
      if (e.key === "]") { e.preventDefault(); onMove(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMove]);
}

/* §13.8, verbatim thresholds: ≥12px horizontal, <8px vertical, never from the
   left 20px — that gutter belongs to the OS/plane back gesture. Attaches to the
   scrolling body, never to the whole page, and it is only ever the accelerator:
   the filmstrip below is the visible route. */
export function useSiblingSwipe(onMove: (d: -1 | 1) => void) {
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      (e.currentTarget as HTMLElement).dataset.sw =
        t.clientX > 20 ? `${t.clientX},${t.clientY}` : "";
    },
    onTouchEnd: (e: React.TouchEvent) => {
      const el = e.currentTarget as HTMLElement;
      const raw = el.dataset.sw;
      if (!raw) return;
      el.dataset.sw = "";
      const [x0, y0] = raw.split(",").map(Number);
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      if (Math.abs(dx) < 12 || dy >= 8) return;
      onMove(dx < 0 ? 1 : -1);
    },
  };
}
