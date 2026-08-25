import { useEffect, useRef, useState } from "react";
import {
  IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonToolbar,
} from "@ionic/react";
import { chevronBack } from "ionicons/icons";
import { Elevation } from "../../components/quote-project/Elevation";

/**
 * THE DRAWING, AT THE SIZE IT DESERVES — one viewer, for every drawing in ops2.
 *
 * It lives in `chrome` beside `SidePanel` because any surface may open it: the
 * line's plate, a unit in the units list, and whatever draws an opening next.
 * Exactly one of these exists, which is the point (VIEW-AC-5) — a second
 * enlargement built beside it is how two surfaces end up disagreeing about what
 * a drawing is worth.
 *
 * ── IT IS NOT A `SidePanel`, AND NOT A MODAL EITHER ─────────────────────────
 * `SidePanel` is 520px of reading matter BESIDE the work; a drawing wants the
 * whole viewport. So: full screen, no breakpoints, no side animation.
 *
 * And it is not a modal, which is the ruling three careful readers got wrong the
 * same way before the owner settled it (R31). A modal is only a DECISION DIALOG
 * — something that asks a question and returns an answer. This asks nothing. It
 * is a node in the navigation tree with its own address, so it carries a BACK
 * control at the leading edge naming the line it returns to, never a trailing
 * Close. The accepted cost, named to the owner and taken: an enlargement is a
 * history entry, so leaving a line from an enlarged drawing takes two backs.
 * That is correct. It is not to be collapsed.
 *
 * ── PRESENTATION-ONLY, ON PURPOSE ───────────────────────────────────────────
 * `subject` in, `onClose` out, and NO router import anywhere in this file. The
 * host page owns the URL grammar (`../projects/lineRoute.ts`) and decides what
 * closing MEANS — the same seam `SidePanel` keeps, and the reason a future
 * surface can host this viewer under its own addresses without editing it.
 *
 * ── NO LEGEND, AND NO NOTATION EXPLAINED (R25, VIEW-AC-10) ──────────────────
 * `ElevationLegend` is not rendered here and is not imported here. Ops staff
 * read elevations for a living; the solid/dashed/apex/arrow key is
 * customer-facing explanation. The ruling is about the CLASS of copy, so the
 * sentence teaching that panel widths are proportional went with it.
 *
 * What stays is the drawing's AUTHORITY — that mullion positions are confirmed
 * at technical review, and that an unsized opening is a square stand-in. That is
 * what the drawing is worth, not how to read it, and it is a different thing.
 */

/** One unit of an assembly, as the viewer lists it. */
export interface ViewerUnit {
  code: string;
  productName: string;
  size: string;
}

/**
 * What the viewer is showing.
 *
 * Built by `../projects/drawingSubject.ts` from a record line, so every sentence
 * on this surface is decided in a function node can read.
 */
export interface ViewerSubject {
  /** The subject's identity, for the accessible name — a unit's code, or the
   *  opening's. Never empty: a control nobody can name aloud is not a control. */
  code: string;
  /** The bar's title. A unit is its own code; the line's own drawing is simply
   *  `Drawing`, because the back control beside it already names the line and
   *  repeating the code says it twice (VIEW-AC-1a). */
  title: string;
  /** The line the back control returns to, named on it. */
  backLabel: string;
  /** Typed as `Elevation` types it, so this passes straight through. An opening
   *  with no product is the empty slug the generator already answers with a
   *  fixed square, decided in `drawingSubject` where node can read it rather
   *  than coalesced at the render site. */
  productSlug: string;
  width: string;
  height: string;
  /** The units a composite is drawn from. Absent for a single frame — handing
   *  the generator one part draws a join that does not exist. */
  parts?: { productSlug: string; alongMm: string; qty: number }[];
  axis: "vertical" | "horizontal" | null;
  /** The size line under the drawing — or the stand-in sentence when no size
   *  could be read (VIEW-AC-8). */
  caption: string;
  /** The assembly's units, listed under the drawing. Empty for anything else. */
  units: ViewerUnit[];
  /** The arrangement caveat, on an assembly only. */
  basis: string | null;
}

export function DrawingViewer({ subject, onClose }: {
  subject: ViewerSubject | null;
  /** THE ONE WAY OUT. The back control, Escape, the backdrop and the platform's
   *  back gesture all funnel here, and the host turns it into a single history
   *  pop — never a second kind of exit. */
  onClose: () => void;
}) {
  // WHAT IS DRAWN WHILE IT LEAVES. `subject` goes null the instant the address
  // does, and a modal cannot animate out around content that has already been
  // torn down. So the last real subject is held for the duration of the exit;
  // `isOpen` is the address's answer, and this is only what fills the frame.
  const [shown, setShown] = useState<ViewerSubject | null>(subject);
  useEffect(() => { if (subject) setShown(subject); }, [subject]);

  // WHERE FOCUS LANDS, SAID RATHER THAN INHERITED. Ionic's focus trap keeps
  // focus inside the surface but does not promise WHICH element it starts on,
  // and for a screen whose only control is back the answer has to be back —
  // otherwise a keyboard reviewer arrives somewhere with nothing to press and
  // no announcement of where they are.
  const back = useRef<HTMLButtonElement | null>(null);

  return (
    <IonModal
      isOpen={subject !== null}
      onDidPresent={() => back.current?.focus()}
      onDidDismiss={onClose}
      className="ops2-viewer"
      data-testid="drawing-viewer"
      // The name carries the subject's identity, so a screen reader arriving
      // here is told WHICH drawing it landed on (VIEW-AC-7).
      aria-label={shown ? `Drawing of ${shown.code}` : undefined}
    >
      {shown && (
        <>
          <IonHeader className="ion-no-border">
            <IonToolbar className="ops2-viewer__bar">
              {/* LEADING EDGE, and it names where it goes. A back-shaped control
                  parked where an X was still reads as a dismiss; the leading
                  position is what makes the promise legible. */}
              <IonButtons slot="start">
                <button
                  ref={back}
                  type="button"
                  className="ops2-viewer__back ds-type-caption"
                  data-testid="drawing-viewer-back"
                  onClick={onClose}
                >
                  <IonIcon icon={chevronBack} aria-hidden="true" />
                  {/* THE LABEL TRUNCATES, THE ACCESSIBLE NAME DOES NOT. A
                      project's title is as long as someone typed it, and this
                      control sits beside the bar's own heading; ellipsis is how
                      `OpsPage` already handles the same fact. It is a span
                      because a bare text node in a flex container is an
                      anonymous item that no rule can reach. */}
                  <span className="ops2-viewer__back-label">{shown.backLabel}</span>
                </button>
              </IonButtons>
              <h2 className="ops2-viewer__title ds-type-heading-md">{shown.title}</h2>
            </IonToolbar>
          </IonHeader>
          <IonContent className="ops2-viewer__content">
            <div className="ops2-viewer__body">
              <figure className="ops2-viewer__figure">
                <Elevation
                  productSlug={shown.productSlug}
                  widthMm={shown.width}
                  heightMm={shown.height}
                  parts={shown.parts}
                  axis={shown.axis}
                  // `lg` is the generator's largest row, and it is asked for by
                  // name rather than scaled up from a smaller one: the leader
                  // text is designed at 9–13px in the viewBox's own units, and
                  // scaling takes it out of that range in one direction or the
                  // other. The stylesheet fits the drawing to the viewport.
                  size="lg"
                  unitDims
                  // NO SIZE OF ITS OWN — the stylesheet fits it to whatever the
                  // bar and the caption leave, and an intrinsic size would be a
                  // ceiling on that.
                  fluid
                  className="ops2-viewer__svg"
                />
                <figcaption className="ops2-viewer__cap" data-testid="drawing-viewer-caption">
                  {shown.caption}
                </figcaption>
              </figure>
              {shown.units.length > 0 && (
                <div className="ops2-viewer__units" data-testid="drawing-viewer-units">
                  <h3 className="ops2-viewer__units-title">Its units</h3>
                  <ul>
                    {shown.units.map((u, i) => (
                      <li key={`${u.code}-${i}`}>
                        <span className="lp-unit__code">{u.code}</span>
                        <span className="ops2-viewer__unit-name">{u.productName}</span>
                        <span className="lp-unit__meta">{u.size}</span>
                      </li>
                    ))}
                  </ul>
                  {/* AUTHORITY, NOT NOTATION — see the head of this file. */}
                  {shown.basis && <p className="lp-basis">{shown.basis}</p>}
                </div>
              )}
            </div>
          </IonContent>
        </>
      )}
    </IonModal>
  );
}
