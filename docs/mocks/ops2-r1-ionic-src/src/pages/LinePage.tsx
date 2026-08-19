// ═══════════════════════════════════════════════════════════════════════════════
// THE LINE PLANE — view mode
//
// The screen itself is LineBody.tsx; this is the frame around it. Two decisions
// live here.
//
// ── BACK NAMES ITS DESTINATION, AND FROM A LINE THAT IS THE RECORD ────────────
// Three candidates were offered: `< Project`, `< Lines`, `< Wattle Grove - Lot 14`.
// Taking `< Lines`:
//
//   • It names the ACTUAL return target. The row was tapped in the record's Lines
//     tab and that is what comes back — `Lines` is a destination that exists on
//     screen, in the record's own segment control.
//   • `< Project` would be wrong twice: Project is the name of the SIBLING TAB in
//     that same segment, so it promises the wrong half of the record.
//   • `< Wattle Grove - Lot 14` names the project, not a destination, and at
//     ~150px it crowds out the title and the neighbours and then truncates —
//     spending the most width on the least navigational word.
//   • It is ~52px, which is what leaves room for the other two things this
//     toolbar has to carry.
//
// ── PREV / NEXT: SETTLED CONCEPT, NEW EXECUTION ──────────────────────────────
// Top of the plane with neighbours visible is settled and not reopened. What
// failed was the execution: two labelled full-width buttons taking a whole band
// of chrome. Mail, photo and reader apps all solve this and none of them spends a
// row on it — the pair sits in the toolbar's end slot.
//
// So: a chevron pair in `slot="end"`, each carrying its neighbour's CODE. That
// keeps the settled property — you can see which line is next before you move,
// which is what the rejected `< 4/18 >` stepper could not do — while costing
// ~96px of an existing bar instead of 44px of new chrome. The room name is what
// made the buttons wide, and it is what goes: the code is the identity ops reads
// out, and the room is one line down on the screen you arrive at.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonBackButton,
  IonContent, IonFooter, IonActionSheet, IonTitle,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { LINES, RECORD } from "../data";
import { setStore, useShortViewport, useStore, visibleLines } from "../store";
import { LineBody } from "../LineBody";
import { Plate } from "../Plate";
import { useMoveKeys, useSiblingSwipe } from "../LineScroller";

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
    history.replace(`/projects/record/${ref}/line/${id}`);
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
            <IonBackButton defaultHref={`/projects/record/${ref}`} text="Lines"
              aria-label="Back to the lines" />
          </IonButtons>
          <IonTitle>{line.code} · {subtitle}</IonTitle>
          <IonButtons slot="end" className="nbpair">
            <IonButton disabled={!run[at - 1]} onClick={() => run[at - 1] && goTo(run[at - 1].id)}
              aria-label={run[at - 1] ? `Previous line: ${run[at - 1].code}, ${run[at - 1].room}` : "This is the first line"}>
              <span className="nbp" aria-hidden="true">‹{run[at - 1]?.code ?? ""}</span>
            </IonButton>
            <IonButton disabled={!run[at + 1]} onClick={() => run[at + 1] && goTo(run[at + 1].id)}
              aria-label={run[at + 1] ? `Next line: ${run[at + 1].code}, ${run[at + 1].room}` : "This is the last line"}>
              <span className="nbp" aria-hidden="true">{run[at + 1]?.code ?? ""}›</span>
            </IonButton>
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
        <LineBody line={line} plateSize={heroSize} showPlate={!pinned}
          onSpec={() => history.push(`/projects/record/${ref}/line/${line.id}/spec`)}
          onWhy={() => history.push(`/projects/record/${ref}/line/${line.id}/why`)}
          onManufacturer={() => history.push(`/projects/record/${ref}/line/${line.id}/price`)}
          onUnit={(i) => history.push(`/projects/record/${ref}/line/${line.id}/unit/${i}`)} />
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
          {/* Edit, and nothing else. There is nothing to Save on a read-only
              screen — Save and Cancel live in edit mode where there is something
              to commit. */}
          <div className="actions">
            <IonButton onClick={() => history.push(`/projects/record/${ref}/line/${line.id}/edit`)}>
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
          { text: "Specification", handler: () => history.push(`/projects/record/${ref}/line/${line.id}/spec`) },
          { text: "Why this product", handler: () => history.push(`/projects/record/${ref}/line/${line.id}/why`) },
          { text: "Re-price", handler: () => history.push(`/projects/record/${ref}/line/${line.id}/price`) },
          { text: `Copy a link to ${line.code}` },
          { text: `Delete ${line.code}`, role: "destructive", handler: () => setDeleteArmed(true) },
          { text: "This job — Progress", handler: () => history.push(`/projects/record/${ref}/job/progress`) },
          { text: "This job — Payments", handler: () => history.push(`/projects/record/${ref}/job/payments`) },
          { text: "This job — Files", handler: () => history.push(`/projects/record/${ref}/job/files`) },
          { text: "This job — History", handler: () => history.push(`/projects/record/${ref}/job/history`) },
          { text: "Cancel", role: "cancel" },
        ]}
      />
    </IonPage>
  );
}
