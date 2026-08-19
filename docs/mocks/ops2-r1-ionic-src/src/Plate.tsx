// ═══════════════════════════════════════════════════════════════════════════════
// THE DRAWING PLATE — R-17 / R-18 / R-50 / R-154
//
// The element the owner rates highest in the product, restored as a first-class
// part of the line plane rather than an ornament hung off it. The rules it
// inherits, and where each one is honoured:
//
//   R-17   The plate is the canvas's drawing surface. Paper ground, its own
//          border, the drawing centred on it.
//   R-18   Scrolled past 24px it PINS as a 56px strip and NEVER disappears.
//          Tapping the strip, or returning to scroll-top, restores the hero.
//          (The recorded defect was a scoping failure that hid the strip too,
//          so the drawing vanished outright. One owner, one rule, no second
//          selector that can hide it.)
//   R-50   While unsaved edits exist the plate says WHOSE figures it is
//          drawing. It never redraws someone's typing silently.
//   R-154  md at rest, lg on expand, plus the phone hero at 320 × 248 — and on
//          the phone TAPPING THE HERO is the expand control, so no separate
//          action row is spent on it.
//   R-49   The generator is called at the size closest to the intended pixels.
//          Leaders are suppressed the moment a dimension is unknown.
// ═══════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { IonModal, IonHeader, IonToolbar, IonButtons, IonButton, IonContent, IonTitle } from "@ionic/react";
import { Elevation, ElevationLegend, type ElevationSize } from "./elevation";
import type { Line } from "./data";

/** The strip's own miniature — xs, square, so the 56px band stays a band. */
function StripDrawing({ line }: { line: Line }) {
  return (
    <Elevation op={line.op} widthMm={line.widthMm} heightMm={line.heightMm}
      parts={line.parts} axis={line.axis} size="xs" square className="elev" />
  );
}

export function Plate({
  line, size, pinned, onUnpin, dirtyFrom, heightMm, widthMm, captionless,
}: {
  line: Line;
  /** hero on a phone, md on a canvas column, lg inside the expansion. */
  size: ElevationSize;
  /** R-18 — the parent owns the 24px scroll threshold and tells the plate. */
  pinned?: boolean;
  onUnpin?: () => void;
  /** R-50 — non-null while the editor holds unsaved figures. The plate then
   *  draws THOSE and says so, rather than silently showing either one. */
  dirtyFrom?: string | null;
  heightMm?: number;
  widthMm?: number;
  /** R1f — the line plane moved the dimension caption into its own row, because
   *  that row is now the door to the dimensions-and-source review (scenario 1).
   *  Two captions saying the same millimetres would be the duplication this
   *  round exists to remove. */
  captionless?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const h = heightMm ?? line.heightMm;
  const w = widthMm ?? line.widthMm;
  const sized = h > 0 && w > 0;

  // R-18 — the pinned strip. It is the SAME component in a different state, not
  // a second element with its own display rule, so nothing can hide both.
  if (pinned) {
    return (
      <button type="button" className="plate-strip" onClick={onUnpin}
        aria-label={`Show the drawing of ${line.code} in full`}>
        <StripDrawing line={line} />
        <span className="sid mono">{line.code}</span>
        <span className="sdim">
          {sized ? `${h.toLocaleString()} × ${w.toLocaleString()} mm` : "size not read"}
        </span>
        {dirtyFrom && <span className="sdim dirty">{dirtyFrom}</span>}
        <span className="shint" aria-hidden="true">▾</span>
      </button>
    );
  }

  return (
    <>
      <figure className="plate" data-size={size}>
        {/* R-154 — tapping the hero IS the expand control. It is a real button
            with a real accessible name, not a click handler on a figure:
            gesture and pointer are never the only route (R-158). */}
        <button type="button" className="plate-face" onClick={() => setExpanded(true)}
          aria-label={`Enlarge the drawing of ${line.code}`}>
          <Elevation op={line.op} widthMm={w} heightMm={h}
            parts={line.parts} axis={line.axis} size={size} className="elev" />
        </button>
        {!captionless && <figcaption>
          {dirtyFrom ? (
            /* R-50 — whose figures. Stated, not implied. */
            <span className="dirty">{dirtyFrom}</span>
          ) : sized ? (
            <>
              {h.toLocaleString()} × {w.toLocaleString()} mm
              <span className="cap"> · height × width</span>
              {line.parts && <span className="cap"> · indicative arrangement</span>}
            </>
          ) : (
            /* R-49 — the honest absence. No leaders were drawn either. */
            <span className="absent">
              No size read for this opening — drawn as a square stand-in
            </span>
          )}
        </figcaption>}
        {captionless && dirtyFrom && (
          <figcaption><span className="dirty">{dirtyFrom}</span></figcaption>
        )}
      </figure>

      <IonModal isOpen={expanded} onDidDismiss={() => setExpanded(false)} >
        <IonHeader className="ion-no-border">
          <IonToolbar>
            <IonTitle>{line.code} · {line.room}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setExpanded(false)} aria-label="Close the drawing">Close</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div className="plate-big">
            <figure className="plate" data-size="lg">
              <div className="plate-face plate-face-static">
                <Elevation op={line.op} widthMm={w} heightMm={h}
                  parts={line.parts} axis={line.axis} size="lg" className="elev" />
              </div>
              <figcaption>
                {sized
                  ? `${h.toLocaleString()} × ${w.toLocaleString()} mm · height × width`
                  : "No size read for this opening — drawn as a square stand-in"}
              </figcaption>
            </figure>
            {line.parts && (
              <div className="plate-parts">
                <h2>Drawn from its {line.parts.reduce((n, p) => n + (p.qty ?? 1), 0)} units</h2>
                <ul>
                  {line.parts.map((p) => <li key={p.label}>{p.label}</li>)}
                </ul>
                <p className="basis">
                  Panel widths are in proportion to each unit's real size. Indicative
                  arrangement — the mullion positions are confirmed on technical review.
                </p>
              </div>
            )}
            <ElevationLegend />
          </div>
        </IonContent>
      </IonModal>
    </>
  );
}
