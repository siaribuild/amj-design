// ═══════════════════════════════════════════════════════════════════════════════
// THE RECORD SURFACE
//
// Reworked against the owner's package. Reading down the header:
//
//   ‹ Projects                                        back, and it NAMES where
//   OF-Q-10482 · Wattle Grove — Lot 14   $48,802.40   identity + the money
//   Marchetti Constructions · Ana Bianchi     ex GST
//   WAITING ON US   Technical review · 3 days      ›  ranked, taps to Progress
//   [ Lines · 18 ][ Project ]                         the segment he liked
//   • 2 lines have no rate            show only these the filter, now scoped
//
// THE LEADING SLOT is the one real design problem in the package.
// "even if we don't have it yet, the navigation should not be missing" — so back
// must exist, and in production the record is pushed from a list and is never the
// root. But the drawer opener wants that slot too, and a drawer with no trigger
// is a regression recorded twice in this repo (UX-AUDIT.md D2, HIGH).
//
// Both cannot have it. Two 44px targets, `‹` and `☰`, would take 88px of a 375px
// bar before the title starts — and the owner's own instinct was that `☰` on the
// left beside `⋯` on the right "feels weird".
//
// Resolved: BACK TAKES THE SLOT AND NAMES ITS DESTINATION — `‹ Projects`, not a
// bare chevron — and the drawer opener lives on Projects, which is a destination
// root and where switching destination belongs. Global navigation is two taps,
// both visible and both labelled, and there is no screen from which the
// destinations are unreachable, which is what the recorded regression actually
// was. Inside a record — where a founder spends the day — the trade buys the
// top-right corner for the money he said he misses.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonButton, IonBackButton,
  IonContent, IonFooter, IonSegment, IonSegmentButton, IonLabel, IonActionSheet,
} from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import { DELIVERY, LINES, RECORD } from "../data";
import {
  setStore, useEditorPane, useShortViewport, useStore, useWidthClass, visibleLines,
} from "../store";
import { LineBody } from "../LineBody";
import { Plate } from "../Plate";
import { LineScroller, LineSwitcher, useMoveKeys } from "../LineScroller";
import { EditorPane } from "../Editor";
import {
  FilterRow, LineList, ProjectBlockBody, ProjectBlocks,
  RecordHeader, StateRow, Totals,
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
  const [segment, setSegment] = useState<"lines" | "project">("lines");
  const [block, setBlock] = useState("progress");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const run = visibleLines(filterUnpriced);
  const selected = LINES.find((l) => l.id === selectedId) ?? (wide ? run[0] ?? LINES[0] : null);
  const at = selected ? Math.max(0, run.findIndex((l) => l.id === selected.id)) : 0;

  const pick = (id: string) => {
    setStore({ selectedId: id });
    if (!wide) history.push(`/record/${ref}/line/${id}`);
  };
  const move = (d: -1 | 1) => { const n = run[at + d]; if (n) setStore({ selectedId: n.id }); };
  useMoveKeys(wide ? move : () => {});
  const openEditor = (id: string) => {
    if (wc === "phone") history.push(`/record/${ref}/line/${id}/edit`);
    else setStore({ editing: id });
  };
  const openBlock = (k: string) => {
    if (wide) { setSegment("project"); setBlock(k); }
    else history.push(`/record/${ref}/project/${k}`);
  };
  const openDelivery = () => history.push(`/record/${ref}/delivery`);

  const listColumn = segment === "lines" ? (
    <>
      <LineList lines={run} selectedId={selected?.id ?? null} dense={wide} onPick={pick} />
      {!wide && <Totals onReviewDelivery={openDelivery} />}
    </>
  ) : (
    <>
      <ProjectBlocks current={wide ? block : undefined} onOpen={openBlock} />
      {!wide && <Totals onReviewDelivery={openDelivery} />}
    </>
  );

  const header = (
    <IonHeader className="ion-no-border">
      {/* Back, the ref and the total on one line; the title and the customer
          beneath at full width. See pieces.tsx RecordHeader. */}
      <RecordHeader />
      <StateRow onOpenProgress={() => openBlock("progress")} />
      <IonToolbar>
        <IonSegment value={segment} scrollable={false}
          onIonChange={(e) => setSegment((e.detail.value as "lines" | "project") ?? "lines")}>
          <IonSegmentButton value="lines"><IonLabel>Lines · {LINES.length}</IonLabel></IonSegmentButton>
          <IonSegmentButton value="project"><IonLabel>Project</IonLabel></IonSegmentButton>
        </IonSegment>
      </IonToolbar>
      {segment === "lines" && (
        <FilterRow on={filterUnpriced}
          onToggle={() => setStore({ filterUnpriced: !filterUnpriced })} />
      )}
    </IonHeader>
  );

  /* The bottom action panel, called out as working — one primary, the overflow
     beside it, and the status explanation BELOW the buttons. It now also carries
     `⋯`, which came down from the top-right, and "Add a line", which came out of
     the list: add and delete keep their acceptance criteria (AC-95, AC-96), they
     just stop taking a permanent row for something "I don't anticipate that
     being a frequent action". */
  const blocked = DELIVERY.finalCents === null
    ? `${RECORD.unpricedCount} lines have no rate, and delivery is not confirmed`
    : `${RECORD.unpricedCount} lines have no rate`;
  const footer = (
    <IonFooter className="ion-no-border">
      <div className="actions">
        <IonButton className="inert" disabled>Issue quote</IonButton>
        <IonButton className="more" fill="outline" onClick={() => setSheetOpen(true)}
          aria-label="More actions for this project">···</IonButton>
      </div>
      <p className="reason">{blocked}</p>
    </IonFooter>
  );

  const sheet = (
    <IonActionSheet
      isOpen={sheetOpen}
      onDidDismiss={() => setSheetOpen(false)}
      header={`${RECORD.ref} · ${RECORD.title}`}
      buttons={[
        { text: "Add a line", handler: () => openEditor(LINES[3].id) },
        { text: "Confirm the delivery charge", handler: openDelivery },
        { text: "Request clarification" },
        { text: "Add a note to this project" },
        { text: "Copy a link to this project" },
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

  /* ── ≥ 1024 : rail + canvas. Out of scope this pass; kept working. ───────── */
  return (
    <IonPage>
      {header}
      <IonContent className="ws">
        <div className="zones" data-editing={paneBand && editing ? "" : undefined}>
          <div className="zone rail">{listColumn}</div>
          <div className="zone canvas">
            {segment === "project" ? (
              <div className="canvas-scroll"><ProjectBlockBody block={block} /></div>
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
