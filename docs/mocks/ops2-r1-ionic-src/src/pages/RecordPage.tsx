// ═══════════════════════════════════════════════════════════════════════════════
// THE RECORD SURFACE
//
// Below 1024 it is the plane stack: the list is the surface, a line is a push.
// At 1024 and above the same list becomes the persistent left rail and the
// selected line's body fills the canvas beside it — no push, no stack, and
// (critique 4) no panel covering it when the editor opens.
//
// GROWTH LAW, MOVE 1 ONLY: a zone that was a plane becomes a pane. That is the
// whole mechanism at every width, and it is applied twice — to the LINES (list →
// canvas) and to the five JOB BLOCKS (push rows → the same canvas). Move 2, "a
// push that was a plane becomes a disclosure in place", is withdrawn: the blocks
// stay destinations, the routes are the same at every width, nothing is behind a
// click, and there is one information architecture rather than two.
//
// CRITIQUE 1, the record half. The Lines / Job control is an ion-segment with TWO
// equal columns and `scrollable={false}` stated in the markup rather than left to
// the default, because a default is not a decision. The one filter on this
// surface is a full-width row, not a chip in a strip.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonMenuButton,
  IonContent, IonFooter, IonSegment, IonSegmentButton, IonLabel, IonActionSheet,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { LINES, RECORD } from "../data";
import { setStore, useEditorPane, useShortViewport, useStore, useWidthClass, visibleLines } from "../store";
import { LineBody } from "../LineBody";
import { Plate } from "../Plate";
import { LineScroller, LineSwitcher, useMoveKeys } from "../LineScroller";
import { EditorPane } from "../Editor";
import {
  AddLineRow, FilterRow, JobBlockBody, JobBlocks, LifecycleRow, LineList,
  RecordIdentity, Totals,
} from "../pieces";

export function RecordPage() {
  const history = useHistory();
  const { ref } = useParams<{ ref: string }>();
  const wc = useWidthClass();
  const wide = wc === "desktop" || wc === "wide";
  const short = useShortViewport();
  const canvasPlate = short ? "sm" : "md";
  const paneBand = useEditorPane();
  const { selectedId, filterUnpriced, draft, editing } = useStore();
  const [segment, setSegment] = useState<"lines" | "job">("lines");
  const [block, setBlock] = useState("progress");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const run = visibleLines(filterUnpriced);
  const selected = LINES.find((l) => l.id === selectedId) ?? (wide ? run[0] ?? LINES[0] : null);
  const at = selected ? Math.max(0, run.findIndex((l) => l.id === selected.id)) : 0;

  const pick = (id: string) => {
    setStore({ selectedId: id });
    /* Below 1024 choosing a line pushes its plane; at 1024 and above the canvas
       beside the rail is already showing it, so selection is the whole act. */
    if (!wide) history.push(`/record/${ref}/line/${id}`);
  };
  const move = (d: -1 | 1) => { const n = run[at + d]; if (n) setStore({ selectedId: n.id }); };
  useMoveKeys(wide ? move : () => {});
  const openEditor = (id: string) => {
    if (wc === "phone") history.push(`/record/${ref}/line/${id}/edit`);
    else setStore({ editing: id });
  };
  const openBlock = (k: string) => {
    if (wide) setBlock(k);
    else history.push(`/record/${ref}/job/${k}`);
  };

  const listColumn = segment === "lines" ? (
    <>
      <LineList lines={run} selectedId={selected?.id ?? null} dense={wide} onPick={pick} />
      <AddLineRow onClick={() => openEditor(LINES[3].id)} />
      {!wide && <Totals />}
    </>
  ) : (
    <>
      <JobBlocks current={wide ? block : undefined} onOpen={openBlock} />
      {!wide && <Totals />}
    </>
  );

  const header = (
    <IonHeader className="ion-no-border">
      <IonToolbar>
        <IonButtons slot="start">
          {/* The shell owns the navigation opener and it is never removable — that
              regression is on the record twice. Below 1024 this button is the only
              route to the destinations; at 1024 and above ion-split-pane keeps the
              whole destination list permanently on screen, which is the same
              guarantee met a different way. */}
          <IonMenuButton aria-label="Open the console menu" />
        </IonButtons>
        <RecordIdentity />
        <IonButtons slot="end">
          <IonButton onClick={() => setSheetOpen(true)}
            aria-label="More actions for this record">···</IonButton>
        </IonButtons>
      </IonToolbar>
      <LifecycleRow />
      <FilterRow on={filterUnpriced} onToggle={() => setStore({ filterUnpriced: !filterUnpriced })} />
      <IonToolbar>
        <IonSegment value={segment} scrollable={false}
          onIonChange={(e) => setSegment((e.detail.value as "lines" | "job") ?? "lines")}>
          <IonSegmentButton value="lines"><IonLabel>Lines · {LINES.length}</IonLabel></IonSegmentButton>
          <IonSegmentButton value="job"><IonLabel>Job</IonLabel></IonSegmentButton>
        </IonSegment>
      </IonToolbar>
    </IonHeader>
  );

  /* R-153 — one primary, ⋯ for the rest, and the blocked primary's reason beneath
     it inside the footer. RULE A1b — the blocked primary is INERT, not faded: the
     one thing that has to stay readable is why you cannot proceed. */
  const footer = (
    <IonFooter className="ion-no-border">
      <div className="actions">
        <IonButton className="inert" disabled>Issue quote</IonButton>
        <IonButton className="more" fill="outline" onClick={() => setSheetOpen(true)}
          aria-label="More actions for this record">···</IonButton>
      </div>
      <p className="reason">
        {RECORD.unpricedCount} lines have no rate yet. Nothing else is blocking.
      </p>
    </IonFooter>
  );

  const sheet = (
    <IonActionSheet
      isOpen={sheetOpen}
      onDidDismiss={() => setSheetOpen(false)}
      header="This record"
      buttons={[
        { text: "Add a line", handler: () => openEditor(LINES[3].id) },
        { text: "Request clarification" },
        { text: "Add a note" },
        { text: "Copy a link to this record" },
        { text: `Refresh · updated ${RECORD.updatedAt}` },
        { text: "Cancel", role: "cancel" },
      ]}
    />
  );

  /* ── < 1024 ──────────────────────────────────────────────────────────────── */
  if (!wide) {
    return (
      <IonPage>
        {header}
        <IonContent>{listColumn}</IonContent>
        {footer}
        {sheet}
      </IonPage>
    );
  }

  /* ── ≥ 1024 : rail + canvas ──────────────────────────────────────────────── */
  return (
    <IonPage>
      {header}
      <IonContent className="ws">
        {/* At ≥1280 the editor is a THIRD COLUMN, not an overlay: the canvas
            reflows beside it so the plate is never covered, which is what makes
            R-87 and R-50's live redraw true rather than nominal. */}
        <div className="zones" data-editing={paneBand && editing ? "" : undefined}>
          <div className="zone rail">{listColumn}</div>
          <div className="zone canvas">
            {segment === "job" ? (
              <div className="canvas-scroll"><JobBlockBody block={block} /></div>
            ) : selected ? (
              <>
                <div className="canvas-ident">
                  <h2><span className="mono">{selected.code}</span> · {selected.room}</h2>
                  <span className="sub">{selected.product}</span>
                </div>
                {pinned && (
                  <Plate line={selected} size={canvasPlate} pinned
                    onUnpin={() => setPinned(false)} dirtyFrom={draft?.from ?? null} />
                )}
                <div className="canvas-scroll"
                  onScroll={(e) => {
                    const y = (e.target as HTMLElement).scrollTop;
                    if (y > 24 && !pinned) setPinned(true);
                    if (y <= 2 && pinned) setPinned(false);
                  }}>
                  <LineBody line={selected} plateSize={canvasPlate} showPlate={!pinned}
                    dirtyFrom={draft?.from ?? null}
                    heightMm={draft?.heightMm} widthMm={draft?.widthMm} />
                </div>
                {/* The same deck, at every width — one composition, not a
                    desktop variant of it. */}
                <div className="deck">
                  <LineScroller run={run} at={at} filtered={filterUnpriced}
                    onPick={(id) => setStore({ selectedId: id })}
                    onOpenList={() => setSwitcherOpen(true)} />
                  <div className="actions">
                    <IonButton onClick={() => openEditor(selected.id)}>Edit {selected.code}</IonButton>
                  </div>
                </div>
              </>
            ) : (
              <p className="canvas-empty">Choose a line on the left to review it.</p>
            )}
          </div>
          {paneBand && editing && (
            <EditorPane lineId={editing} onClose={() => setStore({ editing: null })} />
          )}
        </div>
      </IonContent>
      {footer}
      {sheet}
      <LineSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)}
        run={run} at={at} filtered={filterUnpriced}
        onPick={(id) => setStore({ selectedId: id })} />
    </IonPage>
  );
}
