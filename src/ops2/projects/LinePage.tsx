import { useCallback, useEffect, useRef } from "react";
import { IonButton, IonIcon, IonNote, IonSkeletonText, useIonRouter } from "@ionic/react";
import { warningOutline } from "ionicons/icons";
import { useHistory, useLocation, useParams } from "react-router-dom";
import { destination } from "../nav/destinations";
import { OpsPage } from "../chrome/OpsPage";
import { DrawingViewer } from "../chrome/DrawingViewer";
import { LineReview } from "./LineReview";
import { drawingSubject, viewerUnitCount } from "./drawingSubject";
import { drawingSuffix, lineSuffixOf, openedFromRecord, parseLineRoute } from "./lineRoute";
import { useProjectRecord } from "./useProjectRecord";

const PROJECTS = destination("projects");

/**
 * One opening's own page.
 *
 * The owner, verbatim: "tapping on the line will lead to a new view details
 * screen with composite details. Edit, 'Why this product?' will then be
 * accessible from here." So this is the page those attach to; neither is built
 * yet, and neither is drawn as a control that does nothing.
 *
 * ── IT RESOLVES ITS LINE FROM THE RECORD, AND THERE IS NO LINE ENDPOINT ─────
 * The page fetches `GET /api/ops/projects/:id` — the same staff-gated read the
 * record uses — and finds the line inside it. Nothing ever fetches a bare line
 * id, and that is what makes the two refusals structural rather than checked:
 * a line belonging to another project is simply ABSENT from this project's
 * record, so "not on this project" and "does not exist" are the SAME CODE PATH
 * and say the same sentence. A probe cannot learn from the difference whether a
 * line exists.
 *
 * Authorization is inherited whole: this page can only ever show what the
 * record endpoint already decided to return for `:id`.
 *
 * ── BACK POPS, AND THE COLD LINK STILL WORKS ────────────────────────────────
 * `OpsPage`'s own control, one level down from where the same discipline
 * already lives: it pops when there is something to pop, so a trip into a line
 * and back does not grow the history; and it pushes the record's path when
 * there is not — which is the case a pasted link or an email arrives in.
 *
 * ── AND IT HOSTS THE DRAWING VIEWER, BECAUSE IT OWNS THE ADDRESS ────────────
 * The viewer is a node in the tree with its own URL (`./lineRoute.ts`), so
 * opening it is `history.push` and every way out of it is one pop. The
 * component itself is presentation-only and imports no router; this page turns
 * the address into a subject and closing into a pop. That seam is what lets a
 * future surface host the same viewer under its own grammar.
 *
 * The suffix matches THIS route — `Ops2App` registers the line without `exact`
 * — so the viewer opens over a page that does not remount and does not fetch
 * the record a second time. Authorization comes with that for free: a drawing
 * URL resolves its line through the record fetch this page already made, so
 * "not on this project" and "does not exist" stay the same code path saying the
 * same sentence.
 */
export function LinePage() {
  const { id, lineId } = useParams<{ id: string; lineId: string }>();
  const location = useLocation();
  const history = useHistory();
  const router = useIonRouter();
  const { load, reload } = useProjectRecord(id);
  const record = load.status === "ready" ? load.record : null;
  const line = record ? record.lines.find((l) => l.id === lineId) ?? null : null;
  const recordPath = `/projects/${encodeURIComponent(id)}`;
  const linePath = `${recordPath}/line/${encodeURIComponent(lineId)}`;

  const route = parseLineRoute(
    lineSuffixOf(location.pathname),
    line ? viewerUnitCount(line) : 0,
  );

  // NORMALISE ONLY ONCE THE RECORD HAS ANSWERED. The unit count is what an
  // ordinal is judged against, so correcting a `/drawing/u2` while the record
  // is still loading would throw away a link that turns out to be perfectly
  // good. Always by REPLACE: a correction that pushed would make back return to
  // the address just corrected.
  const ready = load.status === "ready";
  const stray = ready && !line && route.view !== "line";
  useEffect(() => {
    if (!ready) return;
    if (stray) history.replace(linePath);
    else if (route.normalise) history.replace(linePath + route.canonical);
  }, [ready, stray, route.normalise, route.canonical, history, linePath]);

  // WHERE BACK GOES DECIDES WHAT IT SAYS (VIEW-AC-15). The reviewer who opened
  // this drawing from the record's desk canvas never visited this page, and one
  // pop returns them to the record — so the control names the project, not the
  // line. Read off the history entry rather than the address, because the two
  // doors share one address by design; `openedFromRecord` is in `./lineRoute.ts`
  // beside the grammar it belongs to.
  const fromRecord = openedFromRecord(location.state);
  const subject = line && !route.normalise
    ? drawingSubject(line, route, fromRecord && record ? record.title : null)
    : null;

  // WHERE THE FOCUS CAME FROM. The page never remounts, so the control that
  // opened the viewer is still on screen to receive it back (VIEW-AC-7).
  const opener = useRef<HTMLElement | null>(null);
  const openDrawing = useCallback((unitIndex: number | null) => {
    opener.current = document.activeElement as HTMLElement | null;
    history.push(linePath + drawingSuffix(unitIndex));
  }, [history, linePath]);

  useEffect(() => {
    if (route.view !== "line" || !opener.current) return;
    const el = opener.current;
    opener.current = null;
    // After the modal has released its focus trap.
    const frame = requestAnimationFrame(() => el.focus());
    return () => cancelAnimationFrame(frame);
  }, [route.view]);

  /**
   * THE ONE WAY OUT — back control, Escape, backdrop and the platform's back
   * gesture all arrive here, and all four are the same single pop.
   *
   * The guard is the dismiss/pop double fire: a hardware or browser back pops
   * the entry, which clears the subject, which closes the modal, which calls
   * this — with nothing left to pop and a second `goBack()` about to take the
   * reviewer off the line entirely. The live pathname is the check, because the
   * address is what this surface's open-state IS.
   *
   * `canGoBack()` is `OpsPage`'s own discipline one level down: pop when there
   * is something to pop, replace when there is not — which is the cold link,
   * arriving from a paste or an email with no line page behind it.
   */
  const closeViewer = useCallback(() => {
    if (lineSuffixOf(history.location.pathname) === "") return;
    if (router.canGoBack()) router.goBack();
    else history.replace(linePath);
  }, [history, router, linePath]);

  return (
    <OpsPage
      destination={PROJECTS}
      title={line?.code || "Line"}
      backTo={{ label: record ? record.ref : "Project", href: recordPath }}
      width="full"
    >
      {load.status === "loading" && (
        <div className="rec-skeleton" data-testid="line-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "260px" }} />
          <IonSkeletonText animated style={{ height: "180px" }} />
        </div>
      )}

      {load.status === "missing" && (
        <div className="pq-empty" data-testid="line-missing">
          <strong>This project is not here.</strong>
          <IonNote className="ds-type-caption">
            The reference may have changed, or the project may have been removed.
          </IonNote>
          <IonButton size="small" fill="outline" routerLink={PROJECTS.path}>
            Back to Projects
          </IonButton>
        </div>
      )}

      {load.status === "error" && (
        <div className="pq-error ds-surface-card" data-testid="line-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {/* ONE SENTENCE FOR BOTH REFUSALS, by construction rather than by
          agreement — the find above cannot tell them apart, so nothing here
          can drift into telling them apart either. */}
      {record && !line && (
        <div className="pq-empty" data-testid="line-not-found">
          <strong>This line is not on this project.</strong>
          <IonNote className="ds-type-caption">
            It may have been removed, or the link may point at another project.
          </IonNote>
          <IonButton size="small" fill="outline" routerLink={recordPath}>
            Back to the project
          </IonButton>
        </div>
      )}

      {record && line && <LineReview line={line} onOpenDrawing={openDrawing} />}

      <DrawingViewer subject={subject} onClose={closeViewer} />
    </OpsPage>
  );
}
