// ═══════════════════════════════════════════════════════════════════════════════
// THE EDITOR — one form, two containers
//
// CRITIQUE 4. The frontpage convention is OpeningDrawer.tsx:199 —
//   fixed inset-0 md:inset-y-0 md:left-auto md:right-0 md:w-[min(88vw,520px)]
// full-screen below 768, then a right-hand panel capped at min(88vw, 520px) over
// a scrim. Ops2 follows it exactly:
//
//   < 768   the editor is a PUSHED PLANE — the whole screen, Ionic's own stack
//           transition and back gesture. The behaviour that won the comparison,
//           unchanged.
//  768–1279 the editor is a RIGHT-DOCKED OVERLAY PANEL at min(88vw, 520px), full
//           height, over Ionic's scrim — the frontpage convention verbatim.
//   ≥ 1280  the same panel becomes a real PANE: the workspace gives up 520px and
//           the canvas REFLOWS beside it. No scrim, no overlay, nothing covered.
//
// The third band is not an embellishment, it is what makes R-87 true. R-50 already
// said the live-redraw loop "exists only at ≥1280, where the pane is a persistent
// column", and R-87 that the in-form drawing drops to `xs` there "because the
// plate in the middle is now the drawing". Both are false if a 520px overlay sits
// on top of the plate — measured at 1440, an overlay covers it from x=920 while
// the plate is centred at x≈1100. So at ≥1280 the editor takes a column instead,
// and below 1280 R-51's fallback applies: the in-form drawing at `md` carries the
// drawing, because there the panel really is covering the canvas.
//
// One route at every width, so a deep link to an open editor (D11) resolves the
// same way. In the overlay band Ionic's ion-modal supplies the scrim, focus trap,
// Esc, inert background and animation; in the pane band there is deliberately NO
// focus trap, because a pane is not modal and trapping focus in one is wrong.
//
// FORM CONTROLS ARE IONIC'S. ion-input / ion-select with `labelPlacement`, Ionic's
// own helper and error text, Ionic's number keyboard on mobile. Nothing
// hand-rolled: that is the whole point of adopting the framework, and it is what
// makes the fields behave identically on both founders' phones.
//
// NO DISCLOSURE ANYWHERE IN THIS FORM. There is no <details>, no accordion and no
// "Options" group to press open — every field is present, in one column, in the
// order the reviewer says them out loud on a call (C3). So there is no open
// question about form-level disclosure to put to the owner: the case does not
// arise here.
// ═══════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonContent, IonFooter,
  IonModal, IonList, IonInput, IonSelect, IonSelectOption, IonNote, IonItem,
  IonTitle,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { Elevation } from "./elevation";
import { GLAZING_OPTIONS, LINES, RECORD, type Line } from "./data";
import { setStore, useTabBar, useWidthClass } from "./store";
import { hasHeaderCta } from "./chrome";
import { Money, mm } from "./ui";

function useDraft(line: Line) {
  const [code, setCode] = useState(line.code);
  const [height, setHeight] = useState(line.heightMm);
  const [width, setWidth] = useState(line.widthMm);
  const [glazing, setGlazing] = useState(line.variantId);
  const dirty =
    code !== line.code || height !== line.heightMm || width !== line.widthMm || glazing !== line.variantId;

  const preview = useMemo(() => {
    const own = GLAZING_OPTIONS.find((o) => o.id === line.variantId)?.deltaCents ?? 0;
    const chosen = GLAZING_OPTIONS.find((o) => o.id === glazing)?.deltaCents ?? own;
    const delta = chosen - own;
    const base = line.priceCents ?? 0;
    return { lineCents: base + delta, totalCents: RECORD.totalCents + delta };
  }, [glazing, line.priceCents, line.variantId]);

  return { code, setCode, height, setHeight, width, setWidth, glazing, setGlazing, dirty, preview };
}
type D = ReturnType<typeof useDraft>;

/** R-50 / R-51 / R-87 — the in-form drawing, redrawn from the fields as they are
 *  typed, saying whose figures it is drawing whenever they are unsaved. */
function InFormDrawing({ line, d, size }: { line: Line; d: D; size: "xs" | "md" }) {
  const sized = d.height > 0 && d.width > 0;
  return (
    <div className="informdraw" data-size={size}>
      <Elevation op={line.op} widthMm={d.width} heightMm={d.height}
        parts={line.parts} axis={line.axis} size={size} square={size === "xs"} className="elev" />
      <p>
        {d.dirty
          ? <span className="dirty">drawing your figures — not yet saved</span>
          : sized ? `${mm(d.height)} × ${mm(d.width)} mm as saved`
          : <span className="absent">no size to draw yet</span>}
        {size === "xs" && <span className="basis"> · the full drawing is in the middle</span>}
      </p>
    </div>
  );
}

function EditorForm({ line, d, drawingSize }: { line: Line; d: D; drawingSize: "xs" | "md" }) {
  const undersize = d.height > 0 && d.height < 450;
  return (
    <div className="form">
      <InFormDrawing line={line} d={d} size={drawingSize} />
      <IonList lines="full">
        <IonInput label="Item ID" labelPlacement="stacked" value={d.code} maxlength={10}
          onIonInput={(e) => d.setCode(String(e.detail.value ?? "").toUpperCase())} />
        <IonSelect label="Product" labelPlacement="stacked" value="amj67t-aw" interface="action-sheet">
          <IonSelectOption value="amj67t-aw">AMJ67T Series Awning Window</IonSelectOption>
          <IonSelectOption value="amj150t-ls">AMJ150T Series Lift-Sliding Door</IonSelectOption>
        </IonSelect>
        <IonInput label="Height mm" labelPlacement="stacked" type="number" inputMode="numeric"
          value={d.height || null}
          helperText="Height first. This product's range: 450–2,400 mm."
          onIonInput={(e) => d.setHeight(Number(e.detail.value) || 0)} />
        {/* C4 — warn, never veto. The reason sits at the cause and Save stays
            enabled. `warning`, not `danger`: it is ours to resolve and it stops
            nobody (rule A2). */}
        {undersize && (
          <IonItem lines="none">
            <div className="note-warning" role="note" style={{ marginBlock: 8 }}>
              Height {d.height} mm is below this product's range of 450–2,400 mm.
              Often a typo — save it anyway if it is right.
            </div>
          </IonItem>
        )}
        <IonInput label="Width mm" labelPlacement="stacked" type="number" inputMode="numeric"
          value={d.width || null}
          helperText="This product's range: 300–2,400 mm."
          onIonInput={(e) => d.setWidth(Number(e.detail.value) || 0)} />
        <IonSelect label="Glazing" labelPlacement="stacked" value={d.glazing}
          interface="action-sheet"
          onIonChange={(e) => d.setGlazing(String(e.detail.value))}>
          {GLAZING_OPTIONS.map((o) => (
            <IonSelectOption key={o.id} value={o.id}>{o.label}</IonSelectOption>
          ))}
        </IonSelect>
      </IonList>
      <IonNote className="fact basis" style={{ display: "block", padding: "10px 16px" }}>
        Confirmed on technical review before any deposit. Supply only.
      </IonNote>
    </div>
  );
}

/** R-159 — the read-back strip. Pinned above the deck, recomputed from the same
 *  preview the server would return, because the editor covers the totals and so
 *  has to carry the totals' conclusion. Every figure carries its basis (rule A3). */
function ReadBack({ line, d }: { line: Line; d: D }) {
  const changed = d.preview.lineCents !== (line.priceCents ?? 0);
  return (
    <div className="readback" aria-live="polite">
      <div className="r">
        <span>This line</span>
        <span>
          {changed && <span className="was">${((line.priceCents ?? 0) / 100).toFixed(2)}</span>}
          <Money cents={d.preview.lineCents} />
        </span>
      </div>
      <div className="r">
        <span>Quote total</span>
        <span>
          {changed && <span className="was">${(RECORD.totalCents / 100).toFixed(2)}</span>}
          <Money cents={d.preview.totalCents} />
        </span>
      </div>
    </div>
  );
}

/** R-39 — expands from the footer, never a modal. This guards DATA LOSS, which is
 *  not the same as gating a decision: C4 forbids the second, not the first. */
function DiscardGuard({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  return (
    <div className="section" role="group" aria-label="Discard changes?" style={{ paddingBottom: 12 }}>
      <p><strong>Discard changes?</strong></p>
      <div style={{ display: "flex", gap: 8 }}>
        <IonButton color="danger" onClick={onDiscard} style={{ flex: 1 }}>Discard</IonButton>
        <IonButton fill="outline" onClick={onKeep} style={{ flex: 1 }}>Keep editing</IonButton>
      </div>
    </div>
  );
}

function Actions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="actions">
      <IonButton onClick={onSave}>Save line</IonButton>
      <IonButton fill="outline" onClick={onCancel}>Cancel</IonButton>
    </div>
  );
}

/** E — THE NAV BAR BECOMES THE FORM ACTION BAR.
 *
 *  This is the half of the rule the mock was missing, and without it E was being
 *  judged on a rule that held on one screen and not the next: view mode put the
 *  primary in the header while the editor kept Save and Cancel in a footer.
 *
 *  Cancel leads, Save trails, and `···` IS ABSENT — deliberately. A bounded task
 *  has no secondary actions, and the absence is the signal: there is nothing to
 *  do here but finish or abandon. It is also the native modal-form idiom, so it
 *  costs nothing to learn.
 *
 *  Cancel still routes through the discard guard rather than leaving directly —
 *  R-39's guard protects data loss, which is not the same as gating a decision. */
function FormActionBar({ code, onSave, onCancel }: {
  code: string; onSave: () => void; onCancel: () => void;
}) {
  return (
    <IonToolbar>
      <IonButtons slot="start">
        <IonButton onClick={onCancel}>Cancel</IonButton>
      </IonButtons>
      <IonTitle>{code}</IonTitle>
      <IonButtons slot="end">
        <IonButton className="hdr-cta" strong onClick={onSave}>Save</IonButton>
      </IonButtons>
    </IonToolbar>
  );
}

/* ── < 768: the pushed plane ───────────────────────────────────────────────── */
export function EditorPlane() {
  const { variant } = useTabBar();
  const history = useHistory();
  const { lineId } = useParams<{ ref: string; lineId: string }>();
  const line = LINES.find((l) => l.id === lineId) ?? LINES[3];
  const d = useDraft(line);
  const [guard, setGuard] = useState(false);
  const leave = () => history.goBack();
  const tryLeave = () => (d.dirty ? setGuard(true) : leave());

  return (
    <IonPage>
      <IonHeader className="ion-no-border">
        {hasHeaderCta(variant) ? (
          <FormActionBar code={`${line.code} · Edit`} onSave={leave} onCancel={tryLeave} />
        ) : (
          <IonToolbar>
            <IonButtons slot="start">
              {/* not IonBackButton: the discard guard owns every route out */}
              <IonButton onClick={tryLeave} aria-label="Close the editor">Close</IonButton>
            </IonButtons>
            <div className="ident">
              <h1><span className="mono">{line.code}</span> · Edit</h1>
              <span className="sub">{line.room} · {RECORD.ref}</span>
            </div>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent><EditorForm line={line} d={d} drawingSize="md" /></IonContent>
      <IonFooter className="ion-no-border">
        {/* The read-back stays: it is INFORMATION (R-159 — the editor covers the
            totals, so it carries their conclusion), and the rule moves actions,
            not facts. */}
        <ReadBack line={line} d={d} />
        {guard && <DiscardGuard onDiscard={leave} onKeep={() => setGuard(false)} />}
        {!hasHeaderCta(variant) && <Actions onSave={leave} onCancel={tryLeave} />}
      </IonFooter>
    </IonPage>
  );
}

/* ── ≥ 768: the right-docked panel, min(88vw, 520px) ───────────────────────── */
/* The modal is mounted for the whole session and driven by `isOpen`, because
   ion-modal mounted with isOpen already true stays `overlay-hidden` and never
   presents — it needs the false → true transition. The CONTENTS are keyed on the
   line so the draft is fresh each time without remounting the modal itself. */
export function EditorDock({ lineId, onClose }: { lineId: string | null; onClose: () => void }) {
  return (
    <IonModal isOpen={!!lineId} className="editordock" backdropDismiss={false}
      onDidDismiss={onClose}>
      {lineId && <EditorBody key={lineId} lineId={lineId} onClose={onClose} />}
    </IonModal>
  );
}

/** ≥1280 — the same body as a workspace column. Esc closes it; focus is placed
 *  inside on open and returned to the originating control on close (R-164), but
 *  it is NOT trapped: a pane is not modal. */
export function EditorPane({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="zone editorpane" aria-label="Edit line">
      <EditorBody key={lineId} lineId={lineId} onClose={onClose} />
    </aside>
  );
}

function EditorBody({ lineId, onClose }: { lineId: string; onClose: () => void }) {
  const wc = useWidthClass();
  const { variant } = useTabBar();
  const line = LINES.find((l) => l.id === lineId) ?? LINES[3];
  const d = useDraft(line);
  const [guard, setGuard] = useState(false);
  const tryLeave = () => (d.dirty ? setGuard(true) : onClose());

  /* R-50 at ≥1280: the canvas plate is told whose figures it is drawing, and
     draws them. Below 1280 the in-form drawing carries it instead (R-51). */
  const feedCanvas = wc === "wide";
  const h = d.height, w = d.width, isDirty = d.dirty;
  useEffect(() => {
    setStore({
      draft: feedCanvas && isDirty
        ? { heightMm: h, widthMm: w, from: "drawing your figures — not yet saved" }
        : null,
    });
  }, [feedCanvas, isDirty, h, w]);
  useEffect(() => () => setStore({ draft: null }), []);

  return (
    <>
      <IonHeader className="ion-no-border">
        {hasHeaderCta(variant) ? (
          <FormActionBar code={`${line.code} · Edit`} onSave={onClose} onCancel={tryLeave} />
        ) : (
          <IonToolbar>
            <div className="ident">
              <h1><span className="mono">{line.code}</span> · Edit</h1>
              <span className="sub">{line.room} · {RECORD.ref}</span>
            </div>
            <IonButtons slot="end">
              <IonButton onClick={tryLeave} aria-label="Close editor">Close</IonButton>
            </IonButtons>
          </IonToolbar>
        )}
      </IonHeader>
      <IonContent><EditorForm line={line} d={d} drawingSize={feedCanvas ? "xs" : "md"} /></IonContent>
      <IonFooter className="ion-no-border">
        <ReadBack line={line} d={d} />
        {guard && <DiscardGuard onDiscard={onClose} onKeep={() => setGuard(false)} />}
        {!hasHeaderCta(variant) && <Actions onSave={onClose} onCancel={tryLeave} />}
      </IonFooter>
    </>
  );
}
