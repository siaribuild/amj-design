import { useCallback, useEffect, useRef } from "react";
import { IonButton, IonIcon, IonNote, IonSkeletonText, useIonRouter } from "@ionic/react";
import { warningOutline } from "ionicons/icons";
import { useHistory, useLocation, useParams } from "react-router-dom";
import { destination } from "../nav/destinations";
import { OpsPage } from "../chrome/OpsPage";
import { DrawingViewer } from "../chrome/DrawingViewer";
import { LineReview } from "./LineReview";
import { WhyDetail } from "./WhyDetail";
import { WhyPanel } from "./WhyPanel";
import { drawingSubject, viewerUnitCount } from "./drawingSubject";
import {
  drawingSuffix, lineSuffixOf, parseLineRoute, viewerDoor, whyDoor,
  VIEWER_FROM_LINE, WHY_FROM_LINE, WHY_SUFFIX,
} from "./lineRoute";
import { useLineRationale } from "./useLineRationale";
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

  // D2 — AN ORDER RECORD HAS NO PANEL AND NEVER FETCHES ONE. The rationale is
  // a pre-issue reviewing surface; once a quote is issued the reasoning does
  // not travel with it, so the endpoint is not called rather than called and
  // hidden.
  const isOrder = !!record && record.orderNo != null;
  const { load: rationale, reload: reloadRationale } = useLineRationale(id, lineId, !!line && !isOrder);
  // WHICH ADDRESSES THIS LINE SERVES, both of them, answered in one place.
  // `/why` behind a line whose rationale has no detail is the same class of
  // address as a unit ordinal this line does not have — see `./lineRoute.ts`.
  const hasWhy = rationale.status === "ready" && rationale.dto.kind === "recommendation";

  const route = parseLineRoute(
    lineSuffixOf(location.pathname),
    line ? viewerUnitCount(line) : 0,
    hasWhy,
  );

  // NORMALISE ONLY ONCE THE RECORD HAS ANSWERED. The unit count is what an
  // ordinal is judged against, so correcting a `/drawing/u2` while the record
  // is still loading would throw away a link that turns out to be perfectly
  // good. Always by REPLACE: a correction that pushed would make back return to
  // the address just corrected.
  //
  // ── AND A CORRECTION CARRIES WHAT THE ENTRY CARRIED ─────────────────────────
  // `history.replace(path)` with no second argument assigns `undefined` state
  // (history v4), so correcting the address used to DELETE the door — and a
  // canvas-opened viewer whose ordinal had gone stale then read as a cold
  // arrival: the control named the line (VIEW-AC-15) and, after a reload, back
  // left the record behind (VIEW-AC-14). VIEW-AC-2c asks for a replace that
  // grows no history; discarding the entry's state was nobody's decision.
  //
  // The two replaces differ because the question differs — is this the same
  // viewer continuing, or a different entry beginning?
  //   • NORMALISE keeps the viewer open at a corrected address. Same viewer,
  //     same journey, so the entry keeps its door.
  //   • STRAY closes the viewer and lands on the line page's refusal. The door
  //     is spent; marking that entry would be inventing state rather than
  //     preserving it.
  // `scripts/tests/ops2-navigation.test.mjs` holds the rule, because this is the
  // third way the mark has gone missing and there is no structural fix — state
  // is the only thing a `replace` can carry.
  // AND IT WAITS FOR THE RATIONALE AS WELL AS THE RECORD, for exactly the
  // reason the unit count does: `/why` is judged against whether this line HAS
  // a detail, and correcting a cold link while that is still loading would
  // throw away an address that turns out to be perfectly good.
  // …AND ONLY WHERE THERE IS A RATIONALE TO WAIT FOR. A line this project does
  // not have never enables the fetch, so the hook stays at `loading` forever —
  // and gating on it left `/line/l99/why` uncorrected in the address bar behind
  // the not-found sentence. Found by the browser suite, which is the only place
  // it is visible.
  const ready = load.status === "ready"
    && (!line || isOrder || rationale.status !== "loading");
  const stray = ready && !line && route.view !== "line";
  useEffect(() => {
    if (!ready) return;
    if (stray) history.replace(linePath);
    else if (route.normalise) history.replace(linePath + route.canonical, history.location.state);
  }, [ready, stray, route.normalise, route.canonical, history, linePath]);

  // WHERE BACK GOES DECIDES WHAT IT SAYS (VIEW-AC-15). The reviewer who opened
  // this drawing from the record's desk canvas never visited this page, and one
  // pop returns them to the record — so the control names the record, not the
  // line. THE RECORD, NOT THE PROJECT: this sentence said "the project" until
  // the stop-gate caught it contradicting the paragraph below, which is the
  // veto's whole point — "the project" is what a reader hears as its title.
  //
  // Read off the history entry rather than the address, because the two doors
  // share one address by design; `openedFromRecord` is in `./lineRoute.ts`
  // beside the grammar it belongs to.
  //
  // AND IT NAMES IT THE WAY THIS PAGE ALREADY DOES: `record.ref`, the same
  // vocabulary as the `backTo` below, which has named this destination by its
  // reference since the record work shipped. The spec first assumed the
  // project's TITLE; the owner vetoed it (§13.17) rather than let one
  // destination carry two names in one console. The two must move together —
  // change one and change both.
  const fromRecord = viewerDoor(location.state) === "record";
  const subject = line && !route.normalise
    ? drawingSubject(line, route, fromRecord && record ? record.ref : null)
    : null;

  // WHERE THE FOCUS CAME FROM. The page never remounts, so the control that
  // opened the viewer is still on screen to receive it back (VIEW-AC-7).
  const opener = useRef<HTMLElement | null>(null);
  const openDrawing = useCallback((unitIndex: number | null) => {
    opener.current = document.activeElement as HTMLElement | null;
    // MARKED LIKE EVERY OTHER OPEN. The value says this door is the line's, and
    // the mark's PRESENCE says the viewer was opened from a page in this session
    // — which is what makes back a pop rather than a replace after a reload.
    history.push(linePath + drawingSuffix(unitIndex), VIEWER_FROM_LINE);
  }, [history, linePath]);

  // ONE DOOR, so the mark answers presence only (`./lineRoute.ts`). The panel
  // on this page is the only way in; a pasted link carries no mark and replaces
  // rather than popping out of the console.
  const openWhy = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    history.push(linePath + WHY_SUFFIX, WHY_FROM_LINE);
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
   *
   * ── BUT `canGoBack()` DOES NOT MEAN "THERE IS NOWHERE TO GO BACK TO" ────────
   * It means Ionic has no VIEW in its stack to pop, and that stack is in memory:
   * a reload, a restored session, a recovered crash all rebuild it empty while
   * the BROWSER's session history is untouched. On the canvas door those two
   * facts came apart and the surface gave three answers at once — the control
   * and Escape replaced to the line path, the platform's own gesture popped to
   * the record, and the label went on naming the record throughout, because the
   * label reads the entry's state and the state survives a reload.
   *
   * So the ENTRY is asked, not the stack. A viewer opened through either door
   * carries a mark (`./lineRoute.ts`), and that mark's presence says the page it
   * was opened from is the entry behind this one — the platform's own back
   * gesture landing there is the proof. So back is a real pop, and all three
   * exits become the one pop VIEW-AC-14 requires.
   *
   * Reloaded and pasted are NOT the same thing, which is what the first version
   * of this got wrong on the line door: it read "no mark" off a line drawing
   * that had simply never been marked, took the cold path, and replaced the
   * drawing entry onto the line page it had been opened from — two identical
   * entries, and a back that appeared to do nothing.
   *
   * Only a genuinely cold arrival replaces, and it must: pasted, emailed or a
   * new tab has nothing of ours behind it, and popping would take the reviewer
   * out of the console (VIEW-AC-2b).
   *
   * Read off `history.location` rather than the render's `location` for the same
   * reason the pathname guard above is: what this control does is decided at the
   * moment it is pressed.
   */
  const closeChild = useCallback(() => {
    if (lineSuffixOf(history.location.pathname) === "") return;
    if (router.canGoBack()) { router.goBack(); return; }
    // EITHER MARK MEANS A PAGE OF OURS IS BEHIND THIS ENTRY. The two are
    // separate keys because the two surfaces have different exits, but the
    // question asked here — warm or cold — is the same question, and asking it
    // once is what stops the second surface answering it differently.
    if (viewerDoor(history.location.state) || whyDoor(history.location.state)) history.goBack();
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

      {record && line && (
        <LineReview
          line={line}
          onOpenDrawing={openDrawing}
          why={isOrder ? null : (
            <WhyPanel load={rationale} onOpen={openWhy} reload={reloadRationale} />
          )}
        />
      )}

      <DrawingViewer subject={subject} onClose={closeChild} />
      <WhyDetail
        dto={rationale.status === "ready" ? rationale.dto : null}
        open={route.view === "why" && !route.normalise}
        backLabel={line?.code || "Line"}
        onClose={closeChild}
      />
    </OpsPage>
  );
}
