// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE PLANE (< 1024)
//
// Rebuilt for R1e. The reasoning is in LineBody.tsx's header — what the reviewer
// is doing, what is primary, what earns a second step, what left the screen.
// This file owns the frame around it:
//
//   ‹ Back      W04 · Bed 1                              ⋯     48   identity
//   ‹ W03 Ensuite                          W05 WC ›            44   neighbours
//   ────────────────────────────────────────────────────────
//   [ the drawing ]                                            hero, primary
//   the verdict, then the winner's reasoning
//   product / glazing / price
//   Notes · 1                                            ›
//   ────────────────────────────────────────────────────────
//   [ Edit W04 ]                                        [ ⋯ ]  56   one action
//
// TWO CHANGES OF SHAPE, both his:
//
//  1. Line-to-line navigation moved to the TOP and names its neighbours. The
//     rejected `‹ 4/18 ›` counted; this identifies. See LineScroller.tsx's
//     LineNeighbours for why that distinction is the whole of the fix.
//  2. The bottom filmstrip is GONE from this screen, so the deck is the action
//     row alone. Two navigation mechanisms on one screen needed justifying and
//     could not be justified: his own words give the far case to the list, which
//     is one tap away and now approved. 44px out at the bottom pays for the 44px
//     in at the top, and one mechanism replaces two.
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
import { LineNeighbours, useMoveKeys, useSiblingSwipe } from "../LineScroller";

export function LinePage() {
  const history = useHistory();
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const { filterUnpriced } = useStore();
  const short = useShortViewport();
  const [sheetOpen, setSheetOpen] = useState(false);
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
        <LineNeighbours prev={run[at - 1]} next={run[at + 1]} onGo={goTo} />
        {pinned && <Plate line={line} size={heroSize} pinned onUnpin={() => setPinned(false)} />}
      </IonHeader>

      <IonContent scrollEvents {...swipe}
        onIonScroll={(e) => {
          const y = e.detail.scrollTop;
          if (y > 24 && !pinned) setPinned(true);
          if (y <= 2 && pinned) setPinned(false);
        }}>
        <LineBody line={line} plateSize={heroSize} showPlate={!pinned}
          onDimensions={() => history.push(`/record/${ref}/line/${line.id}/dimensions`)}
          onWhy={() => history.push(`/record/${ref}/line/${line.id}/why`)}
          onManufacturer={() => history.push(`/record/${ref}/line/${line.id}/price`)}
          onNotes={() => history.push(`/record/${ref}/line/${line.id}/notes`)}
          onEdit={() => history.push(`/record/${ref}/line/${line.id}/edit`)} />
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
        {/* R1e — the deck is the action row alone. The filmstrip moved to the
            top and became named neighbours; keeping both would be two mechanisms
            for one job. */}
        <div className="deck">
          <div className="actions">
            <IonButton onClick={() => history.push(`/record/${ref}/line/${line.id}/edit`)}>
              Edit {line.code}
            </IonButton>
            <IonButton className="more" fill="outline" onClick={() => setSheetOpen(true)}
              aria-label="More actions for this line">···</IonButton>
          </div>
        </div>
      </IonFooter>


      <IonActionSheet
        isOpen={sheetOpen}
        onDidDismiss={() => setSheetOpen(false)}
        header={`${line.code} · ${subtitle}`}
        buttons={[
          { text: "Split into units" },
          ...(line.parts ? [{ text: "Merge back to one" }] : []),
          { text: `Notes on ${line.code}`, handler: () => history.push(`/record/${ref}/line/${line.id}/notes`) },
          { text: "Why this product", handler: () => history.push(`/record/${ref}/line/${line.id}/why`) },
          { text: "Dimensions and their source", handler: () => history.push(`/record/${ref}/line/${line.id}/dimensions`) },
          { text: "Manufacturer's price", handler: () => history.push(`/record/${ref}/line/${line.id}/price`) },
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
