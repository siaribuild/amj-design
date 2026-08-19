// The three small pushed planes off the record: a Project block, the delivery
// figure, and the project list the record is pushed from.
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonBackButton,
  IonMenuButton, IonContent, IonFooter, IonInput, IonNote, IonTitle,
  IonList, IonItem, IonLabel, IonTextarea,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { CANDIDATES, DELIVERY, LINES, RECORD } from "../data";
import { Money } from "../ui";
import { ProjectBlockBody, ProjectList, blockName } from "../pieces";

/** A Project-tab block, pushed. Move 1 — the same body the canvas renders at
 *  ≥1024. One IA, one component, nothing behind a disclosure. */
export function ProjectBlockPage() {
  const { ref, block } = useParams<{ ref: string; block: string }>();
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}`} text="" aria-label="Back to the project" />
          </IonButtons>
          <div className="ident">
            <h1>{blockName(block)}</h1>
            <span className="sub">{RECORD.ref} · {RECORD.title}</span>
          </div>
        </IonToolbar>
      </IonHeader>
      <IonContent><ProjectBlockBody block={block} /></IonContent>
    </IonPage>
  );
}

/** DELIVERY.
 *
 *  "once SOME number is available - that's up to ops to verify and confirm,
 *  update (most likely) and submit as part of the final quote. Do not overthink
 *  'why and where the number is coming from.'"
 *
 *  So this screen is a figure and the ability to change it, and nothing else.
 *  There is no zone, no basis, no rate arithmetic and no "why does it say that"
 *  panel: the review PATTERN transfers from a line — propose, confirm, override,
 *  submit — but the DERIVATION surface does not. A line's reasoning is complex
 *  and has to be adjudicated; this is a lookup that is about to be replaced by a
 *  phone call.
 *
 *  Updating is the EXPECTED path, not an exception, so the field is open with the
 *  proposed figure already in it and the primary says Confirm rather than
 *  Override. Nothing here frames the change as overruling a machine — it is ops
 *  doing its job.
 *
 *  The read-back is the same device the line editor uses (R-159): the editor
 *  covers the totals, so it carries the totals' conclusion. */
export function DeliveryPage() {
  const history = useHistory();
  const { ref } = useParams<{ ref: string }>();
  const proposed = DELIVERY.proposedCents;
  const missing = proposed === null;
  const [amount, setAmount] = useState(
    proposed === null ? "" : (proposed / 100).toFixed(2)
  );
  const [note, setNote] = useState(DELIVERY.note);

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const valid = amount !== "" && cents >= 0;
  const total = RECORD.goodsCents + (valid ? cents : proposed ?? 0);

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}`} text="" aria-label="Back to the project" />
          </IonButtons>
          <IonTitle>Delivery</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent>
        <div className="section">
          {missing ? (
            /* An error, drawn as one. The screen is not built around it: the same
               field below is how it gets fixed. */
            <div className="note-danger" role="alert">
              <b className="lede">No delivery figure was produced for this project.</b>
              That should not happen. Enter the charge below to get the quote out,
              and tell someone the rates need looking at.
            </div>
          ) : (
            <p className="proposed">
              Proposed <Money cents={proposed} basis size="lg" />
            </p>
          )}

          <IonInput label="Delivery charge" labelPlacement="stacked" type="number"
            inputMode="decimal" value={amount} placeholder="0.00"
            helperText="What the courier quoted. This is what goes on the quote."
            onIonInput={(e) => setAmount(String(e.detail.value ?? ""))} />
          <IonInput label="Note (optional)" labelPlacement="stacked" value={note}
            placeholder="e.g. two deliveries, second to site"
            onIonInput={(e) => setNote(String(e.detail.value ?? ""))} />
        </div>
      </IonContent>

      <IonFooter className="ion-no-border">
        <div className="readback" aria-live="polite">
          <div className="r">
            <span>Project total</span>
            <span><Money cents={total} basis /></span>
          </div>
        </div>
        <div className="actions">
          <IonButton disabled={!valid} onClick={() => history.goBack()}>
            Confirm delivery
          </IonButton>
          <IonButton fill="outline" onClick={() => history.goBack()}>Cancel</IonButton>
        </div>
        <IonNote className="fact basis reason">
          Confirming records the figure against this project. It changes nothing
          for any other project.
        </IonNote>
      </IonFooter>
    </IonPage>
  );
}

/** THE ALTERNATIVES — "one tap away, ranked, with their reason."
 *
 *  R1c rendered these inline at the foot of the line plane, as a table of
 *  product IDs, hard against the action panel. That inverted the ruling twice
 *  over: it buried the common case under the rare one, and it rendered a
 *  conversation aid as a debug dump.
 *
 *  The motive is what shapes this screen. It is not "audit the estimator" — it is
 *  "home owners might want to save money and choose the next-worse solution that
 *  is cheaper despite marginally failing to meet requirements." Someone is on the
 *  phone asking whether there is a cheaper way. So each row leads with the
 *  PRODUCT as a person would say it, states plainly whether it passes or what it
 *  misses, and offers the one thing the conversation actually needs next.
 *
 *  R-53.1 — there is NO price column: `candidate_result` stores no price, and
 *  inventing one would be a fiction at exactly the moment money is being
 *  discussed. Pricing an alternative is a real, separate, METERED read (R-56),
 *  so it is an explicit per-row action and the meter is stated rather than
 *  hidden.
 *
 *  R-53.2 — the panel states its own source per section and never implies one
 *  read is the other. R-53.3 — the set is cascade-deleted on re-parse, and says
 *  so, because a reviewer who saw it yesterday should know why it may be gone. */
export function AlternativesPage() {
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const line = LINES.find((l) => l.id === lineId) ?? LINES[3];
  const [priced, setPriced] = useState<Record<number, string>>({});
  const beaten = CANDIDATES.filter((c) => c.verdict !== "chosen");

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}/line/${lineId}`} text=""
              aria-label={`Back to ${line.code}`} />
          </IonButtons>
          <IonTitle>Chosen over</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="section">
          <p className="alt-lede">
            <strong>{line.product}</strong> was chosen from {beaten.length + 1} products
            that fit this opening. These are the {beaten.length} it beat.
          </p>
        </div>
        <IonList lines="full">
          {beaten.map((c) => {
            const fails = c.verdict.startsWith("fails");
            return (
              <IonItem key={c.rank} lines="full" className="altrow">
                <IonLabel className="ion-text-wrap">
                  <span className="alt-name">{c.name}</span>
                  <p className={fails ? "alt-miss" : "alt-pass"}>
                    {fails ? c.verdict.replace("fails", "Misses") : "Meets the requirement"} · {c.reason}
                  </p>
                  {priced[c.rank] && <p className="alt-priced">{priced[c.rank]}</p>}
                </IonLabel>
                <IonButton slot="end" size="small" fill="outline"
                  disabled={!!priced[c.rank]}
                  onClick={() => setPriced((v) => ({ ...v, [c.rank]: "Priced just now · $1,655.00 ex GST · $185 less" }))}>
                  {priced[c.rank] ? "Priced" : "Price it"}
                </IonButton>
              </IonItem>
            );
          })}
        </IonList>
        <div className="section">
          <IonNote className="fact basis">
            No price is stored against an alternative — the ranking is thermal and
            dimensional only, so each price is fetched on request and counts
            against the pricing meter. The set is rebuilt whenever the schedule is
            re-parsed, so it can change without anyone editing this line.
          </IonNote>
        </div>
      </IonContent>
      <IonFooter className="ion-no-border">
        <div className="actions">
          <IonButton onClick={() => history.back()}>Back to {line.code}</IonButton>
        </div>
        <p className="reason">
          Choosing an alternative is an edit to the line, made in the editor, so
          nothing here changes the quote on its own.
        </p>
      </IonFooter>
    </IonPage>
  );
}

/** LINE NOTES — the other second step.
 *
 *  A different job from reviewing: capturing what was said while the reason is
 *  still in the room, which the grill calls load-bearing. Same inline composer as
 *  the record's Notes, because it is the same act at a different scope. */
export function LineNotesPage() {
  const { ref, lineId } = useParams<{ ref: string; lineId: string }>();
  const line = LINES.find((l) => l.id === lineId) ?? LINES[3];
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState(line.notes);
  const add = () => {
    const body = draft.trim();
    if (!body) return;
    setNotes([{ who: "Gedas · just now", body }, ...notes]);
    setDraft("");
  };
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/record/${ref}/line/${lineId}`} text=""
              aria-label={`Back to ${line.code}`} />
          </IonButtons>
          <IonTitle>Notes · {line.code}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="section">
          <h3 className="sub-h">New note</h3>
          <div className="composer">
            <IonTextarea aria-label={`New note on ${line.code}`}
              placeholder="What did the customer say?"
              autoGrow rows={2} value={draft}
              onIonInput={(e) => setDraft(String(e.detail.value ?? ""))} />
            <div className="composer-act">
              <IonNote className="fact basis">On {line.code}, not the project.</IonNote>
              <IonButton size="small" disabled={!draft.trim()} onClick={add}>Add</IonButton>
            </div>
          </div>
          <h3 className="sub-h">{notes.length} {notes.length === 1 ? "note" : "notes"}</h3>
          {notes.length === 0 && (
            <p className="absent">
              Nothing recorded on this line yet. A note added here stays on {line.code}.
            </p>
          )}
          {notes.map((n, i) => (
            <div key={i} className="note-item">
              <div className="who">{n.who}</div>
              <div className="body">{n.body}</div>
            </div>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
}

/** The project list — the record's parent, and the home of the drawer opener.
 *  See RecordPage's header comment for why the opener is here rather than on the
 *  record. This is the stack ROOT, so it is the one screen that legitimately has
 *  no back. */
export function ProjectListPage() {
  const history = useHistory();
  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton aria-label="Open the console menu" />
          </IonButtons>
          <IonTitle>Projects</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <ProjectList onOpen={(r) => history.push(`/record/${r}`)} />
      </IonContent>
    </IonPage>
  );
}
