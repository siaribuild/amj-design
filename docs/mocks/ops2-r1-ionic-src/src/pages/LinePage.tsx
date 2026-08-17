// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE PLANE (< 1024) — §13.6's identity band, minus the stepper
//
// CRITIQUE 2. The band carries what §13.6 says it carries and nothing more:
//
//   Back  │  W04 · Bed 1                                                   ⋯
//
// The two arrow targets and the `4/18` readout are gone from it; the bottom deck
// owns movement now (LineScroller.tsx). Two consequences worth naming, because
// they are the point rather than side effects:
//
//   • the identity gets the whole width back, so a long room name stops
//     truncating at 320px — the stepper's other cost, which nobody had priced;
//   • movement lives in the thumb arc, on the same edge as the one action, which
//     is where a phone's repeated actions belong.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonBackButton,
  IonContent, IonFooter, IonActionSheet,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { LINES, RECORD } from "../data";
import { setStore, useShortViewport, useStore, visibleLines } from "../store";
import { LineBody } from "../LineBody";
import { Plate } from "../Plate";
import { LineScroller, LineSwitcher, useMoveKeys, useSiblingSwipe } from "../LineScroller";

export function LinePage() {
  const history = useHistory();
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const { filterUnpriced } = useStore();
  const short = useShortViewport();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  /* R-18 — the page owns the 24px threshold and hands the plate its state. The
     plate is NEVER what starts hidden: arriving at a line, the drawing is the
     first thing on screen, and moving to a sibling resets it, because seeing the
     next drawing is the whole reason for moving. */
  const [pinned, setPinned] = useState(false);
  useEffect(() => { setPinned(false); }, [lineId]);
  /* R-17.2, in the form that survives: a short viewport shrinks the plate. It
     never pins it — every phone is under 900px tall, so a height rule that pinned
     would have meant the drawing was never seen at rest. */
  const heroSize = short ? "md" : "hero";

  const line = LINES.find((l) => l.id === lineId) ?? LINES[0];
  /* R-155 — the run is the FILTERED set. */
  const run = visibleLines(filterUnpriced);
  const at = Math.max(0, run.findIndex((l) => l.id === line.id));

  const goTo = (id: string) => {
    setStore({ selectedId: id });
    /* replace, not push: lateral movement inside a zone never deepens the stack,
       so Back still returns to the list from wherever you stopped. */
    history.replace(`/record/${ref}/line/${id}`);
  };
  const move = (d: -1 | 1) => { const n = run[at + d]; if (n) goTo(n.id); };
  useMoveKeys(move);
  const swipe = useSiblingSwipe(move);
  const subtitle = line.room || line.product || RECORD.title;

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}`} text="" aria-label="Back to the line list" />
          </IonButtons>
          <div className="ident">
            <h1><span className="mono">{line.code}</span> · {subtitle}</h1>
          </div>
          <IonButtons slot="end">
            <IonButton onClick={() => setSheetOpen(true)}
              aria-label="More about this line and job">···</IonButton>
          </IonButtons>
        </IonToolbar>
        {/* R-18 — once pinned, the plate lives in the header so it cannot scroll
            away. Same component, different state: there is no second element a
            stray display rule could hide as well, which is exactly how the
            drawing vanished last time. */}
        {pinned && <Plate line={line} size={heroSize} pinned onUnpin={() => setPinned(false)} />}
      </IonHeader>

      <IonContent scrollEvents {...swipe}
        onIonScroll={(e) => {
          const y = e.detail.scrollTop;
          if (y > 24 && !pinned) setPinned(true);
          if (y <= 2 && pinned) setPinned(false);
        }}>
        <LineBody line={line} plateSize={heroSize} showPlate={!pinned} />
      </IonContent>

      <IonFooter className="ion-no-border">
        {deleteArmed && (
          /* R-39 — expands from the footer, never a modal. Danger, because this
             one really does stop something (rule A2). */
          <div className="section" role="group" aria-label={`Delete ${line.code}?`}>
            <p><strong>Delete {line.code}?</strong></p>
            <p className="absent">
              {line.parts
                ? `Its ${line.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} units go with it. Notes stay.`
                : "Its notes stay on the job."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <IonButton color="danger" style={{ flex: 1 }}
                onClick={() => { setDeleteArmed(false); history.goBack(); }}>Delete</IonButton>
              <IonButton fill="outline" style={{ flex: 1 }}
                onClick={() => setDeleteArmed(false)}>Keep</IonButton>
            </div>
          </div>
        )}
        {/* CRITIQUE 2 — the deck: the scroller and the action row as ONE
            composition, 44 + 56, the only chrome on the bottom edge. */}
        <div className="deck">
          <LineScroller run={run} at={at} filtered={filterUnpriced} onPick={goTo}
            onOpenList={() => setSwitcherOpen(true)} />
          <div className="actions">
            <IonButton onClick={() => history.push(`/record/${ref}/line/${line.id}/edit`)}>
              Edit {line.code}
            </IonButton>
            <IonButton className="more" fill="outline" onClick={() => setSheetOpen(true)}
              aria-label="More actions for this line">···</IonButton>
          </div>
        </div>
      </IonFooter>

      <LineSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)}
        run={run} at={at} filtered={filterUnpriced} onPick={goTo} />

      <IonActionSheet
        isOpen={sheetOpen}
        onDidDismiss={() => setSheetOpen(false)}
        header={`${line.code} · ${subtitle}`}
        buttons={[
          { text: "Split into units" },
          ...(line.parts ? [{ text: "Merge back to one" }] : []),
          { text: `Add a note to ${line.code}` },
          { text: `Copy a link to ${line.code}` },
          { text: `Delete ${line.code}`, role: "destructive", handler: () => setDeleteArmed(true) },
          { text: "This job — Progress", handler: () => history.push(`/record/${ref}/job/progress`) },
          { text: "This job — Payments", handler: () => history.push(`/record/${ref}/job/payments`) },
          { text: "This job — Files", handler: () => history.push(`/record/${ref}/job/files`) },
          { text: "This job — History", handler: () => history.push(`/record/${ref}/job/history`) },
          { text: "Cancel", role: "cancel" },
        ]}
      />
    </IonPage>
  );
}
