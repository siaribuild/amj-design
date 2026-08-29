import { useEffect, useRef, useState } from "react";
import {
  IonButton, IonIcon, IonNote, IonSkeletonText,
} from "@ionic/react";
import { ellipsisHorizontal, warningOutline, alertCircle } from "ionicons/icons";
import { useHistory, useParams } from "react-router-dom";
import { actionErrorText } from "../../data/opsActionErrors";
import { destination } from "../nav/destinations";
import { useRailWidth } from "../nav/useRailWidth";
import { OpsPage } from "../chrome/OpsPage";
import { SidePanel } from "../chrome/SidePanel";
import { RecordLines } from "./lines";
import { LineReview } from "./LineReview";
import { WhyPanel } from "./WhyPanel";
import { useLineRationale, type RationaleLoad } from "./useLineRationale";
import { drawingSuffix, VIEWER_FROM_RECORD, WHY_SUFFIX, WHY_FROM_RECORD } from "./lineRoute";
import { useProjectRecord, requestFor } from "./useProjectRecord";
import {
  ageLabel, cornerFigure, money, needsAttention, otherActions, pendingPrimary,
  primaryAction, totalsFor, visibleLines, waitingSentence,
  type ProjectRecord, type RecordAction, type RecordTotals,
} from "./record";

const PROJECTS = destination("projects");

type Tab = "lines" | "project";

/**
 * The project record — the surface this console is being rebuilt to reach.
 *
 * The owner's framing: "the MVP is really to get the ops2 scaffold in place and
 * to be able to get to the point where 'Why this product?' becomes visible and
 * useful". So the line list is the thing, and everything around it is the least
 * chrome that lets a reviewer work down it and open the one that needs them.
 *
 * ── WHAT IS HERE, AND WHY IN THIS ORDER ─────────────────────────────────────
 *   ‹ Projects                                    back, and it NAMES where
 *   Wattle Grove — Lot 14                         the project's NAME, not its id
 *   OF-Q-10482 · Marchetti      $48,802 · 2 no rate   identity, whole, and the money
 *   [ Lines · 18 ][ Project ]                     the settled tabs
 *   ● 2 lines have no rate       show only these  the attention row
 *   ─────────────────────────────────────────────
 *   WAITING ON US                                 the lifecycle, ranked
 *   Technical review · 3 days
 *   … the openings …
 *
 * IDENTITY LIVES IN THE BAND, WHOLE. It was split — the reference in the
 * header, the name, the customer and the state in the page body — and the
 * complaint was exactly that. The reference cannot truncate because it is what
 * ops reads out on a call, so it sits at the leading edge of its own line where
 * it structurally cannot; the NAME truncates, in the heading, which is what
 * every platform does with a long name. The money takes the trailing corner
 * because that is the thing the owner said he missed from this view, and the
 * band is pinned so it is there at every scroll position.
 *
 * THE LIFECYCLE IS RANKED, NOT RUN TOGETHER. "Now · Technical review · waiting
 * on us · 3 days" was four facts at one weight in one dotted run: "need to read
 * all this to understand what is it trying to say." Who owes the next move
 * first, then which phase and how stale. It is NOT pressable — it would open
 * Progress, and Progress is fenced out of this step, and a control wired to
 * nothing is the defect this effort has recorded four times.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * The PROJECT TAB'S CONTENTS — progress, payments, files, activity: fenced out
 * by name. The actions this build cannot perform: `Add a note` and `Request
 * clarification` both need something typed and neither has a screen, so they
 * are omitted rather than listed and inert. Any editing at all: this is a
 * read-only review surface. And the desk's rail + canvas, which is phase 2 —
 * at every width this renders one column, and a row opens a page.
 */
export function ProjectRecordPage() {
  const { id } = useParams<{ id: string }>();
  const history = useHistory();
  const wide = useRailWidth();
  const { load, reload } = useProjectRecord(id);
  const [tab, setTab] = useState<Tab>("lines");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [linePanelOpen, setLinePanelOpen] = useState(false);
  // PAGE-LOCAL, and it survives leaving and coming back because Ionic keeps the
  // page mounted in its view stack — so opening a line and returning does not
  // silently drop the filter the reviewer was working under.
  const [filterOn, setFilterOn] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirming, setConfirming] = useState<RecordAction | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const record = load.status === "ready" ? load.record : null;
  // BOTH HALVES OF "WHAT HAPPENS NEXT". `primaryAction` is the move this build
  // can make; `pendingPrimary` is the one it cannot — the order stage machine's
  // `advance:*` and `pay:*` have real endpoints and no screen here. The second
  // is stated rather than dropped, because the next move is the most useful
  // thing on this screen, and rendered as a SENTENCE rather than as a button
  // that does nothing when pressed.
  const primary = record ? primaryAction(record) : null;
  const pending = record ? pendingPrimary(record) : null;
  const others = record ? otherActions(record) : [];
  // HOW MANY ROWS CARRY A MARK — the pill's whole content, and the filter's.
  // One number rather than a ranked queue of blockers: the owner deleted the
  // band that queue existed to fit into ("drop the yellow bar altogether — it
  // duplicates what the pill says").
  const attention = record ? record.lines.filter(needsAttention).length : 0;
  const shown = record ? visibleLines(record, filterOn) : [];
  // THE SELECTION FOLLOWS THE LIST IT CAME FROM. Switching the filter on can
  // take the reviewed line out of the rail; leaving the canvas on it would show
  // a line the list beside it says is not there. It falls back to the first of
  // what IS shown, and to nothing when the filter leaves nothing — the canvas
  // then says so rather than holding a stale drawing (P2-AC-5).
  const selected = shown.find((l) => l.id === selectedLineId) ?? shown[0] ?? null;
  // THE CANVAS ASKS THE SAME QUESTION THE LINE PAGE ASKS, through the same hook
  // and the same staff-gated endpoint — for a line id this page's own record
  // fetch already returned. Only at the desk, and only when a line is under
  // review: on the phone the canvas does not exist, and a request for a panel
  // nobody can see is a request nobody asked for.
  // ONE READ PER LINE, ACROSS THE WHOLE VISIT — not one per selection.
  //
  // A rail is walked up and down. One hook instance is reused as the selection
  // moves and it keeps only the current result, so A -> B -> A read A twice:
  // the browser test asserted "no line asked twice" and passed anyway, because
  // it never went back. That is the waste ruling D21 avoided by not asking at
  // all, and it is the half of the invariant that actually costs anything.
  //
  // Answered by not fetching rather than by fetching and discarding: a line
  // already read disables the hook, and the panel renders what was kept. Only
  // a resolved read is kept — an error stays live so its retry still works.
  const seen = useRef(new Map<string, RationaleLoad>());
  const cached = selected ? seen.current.get(selected.id) : undefined;
  const { load: fetched, reload: reloadCanvasWhy } = useLineRationale(
    id, selected?.id ?? "", wide && !!selected && !record?.orderNo && !cached,
  );
  useEffect(() => {
    if (selected && fetched.status === "ready") seen.current.set(selected.id, fetched);
  }, [selected, fetched]);
  const canvasWhy = cached ?? fetched;

  const run = async (action: RecordAction) => {
    if (!record) return;
    const request = requestFor(record.id, action.id);
    if (!request) return;
    setRunning(action.id);
    setFailure(null);
    try {
      const res = await fetch(request.url, {
        method: "POST",
        credentials: "same-origin",
        headers: request.body ? { "content-type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      if (!res.ok) {
        // THE SERVER SAYS WHICH RULE REFUSED; THE CONSOLE SAYS IT IN WORDS. The
        // endpoints answer with codes — `delivery_unset`, `not_ready`,
        // `workflow_changed_retry` — and this printed them straight onto the
        // banner, handing a reviewer an identifier at the one moment they need
        // to know what to do next. The mapping is the shared one both consoles
        // read (`src/data/opsActionErrors.ts`), so the two cannot describe the
        // same refusal differently.
        const body = await res.json().catch(() => null) as { error?: string } | null;
        setFailure(body?.error
          ? actionErrorText(body.error)
          : `The server answered ${res.status}.`);
        // A CONFLICT MEANS THIS RECORD IS OUT OF DATE, so re-read it. Someone
        // else moved the job between this page loading and the press, and the
        // actions on screen are the ones that WERE available — leaving them
        // there lets the same invalid request be retried for as long as the tab
        // stays open. The failure message survives the reload; the stale
        // controls do not.
        if (res.status === 409) reload();
        // AND THE READER HAS TO BE ABLE TO SEE IT. The banner renders on the
        // page; a confirm panel is over that page and holds the focus, so a
        // refused `issue-quote` explained itself to a screen nobody could look
        // at and left the reader retrying blind. Both panels close, which puts
        // the sentence in front of them.
        setConfirming(null);
        setPanelOpen(false);
        return;
      }
      setPanelOpen(false);
      setConfirming(null);
      reload();
    } catch {
      setFailure("The console could not reach the server.");
      // SAME REASON AS THE REFUSAL BRANCH. A dropped connection left the confirm
      // panel open over the banner explaining it, which is the state that
      // produces a blind retry — and it is the branch most likely to happen
      // twice in a row.
      setConfirming(null);
      setPanelOpen(false);
    } finally {
      setRunning(null);
    }
  };

  /** Pressing an action: confirm first when the server says to. */
  const press = (action: RecordAction) => {
    if (action.blockedReason) return;
    // `confirm` is present exactly when the action MOVES MONEY OR EMAILS THE
    // CUSTOMER (`worker/lib/ops-actions.ts`), so the step is the server's call
    // rather than this screen's taste.
    if (action.confirm) { setConfirming(action); setPanelOpen(false); return; }
    void run(action);
  };

  // A LINE OPENS ITS OWN PAGE, at every width. The owner, verbatim: "tapping on
  // the line will lead to a new view details screen with composite details.
  // Edit, 'Why this product?' will then be accessible from here." Phase 2 makes
  // this a selection at desk width and nothing else about it changes.
  const linePath = (lineId: string) =>
    `/projects/${encodeURIComponent(id)}/line/${encodeURIComponent(lineId)}`;

  const openLine = (lineId: string) => {
    // PHASE 2: AT THE DESK, CHOOSING A LINE IS NOT NAVIGATION. The canvas beside
    // the rail is already showing one, so pushing a page would replace the very
    // pairing the layout exists for — and would put a history entry behind every
    // glance down a list of eighteen. On the phone there is nowhere to put the
    // review but its own page, so it pushes. The mock draws the same branch
    // (`RecordPage.tsx:73-76`).
    if (wide) { setSelectedLineId(lineId); return; }
    history.push(linePath(lineId));
  };

  /**
   * ENLARGING A DRAWING FROM THE DESK CANVAS IS A NAVIGATION, and it lands on
   * the line's own page with the viewer already open.
   *
   * The canvas renders the same `LineReview` body the line page does, so its
   * plate and its unit rows are enlargeable here too — and there is exactly one
   * viewer in ops2, reached at exactly one address (`./lineRoute.ts`). Opening a
   * second, unrouted copy over the record would give it a back control that
   * does not truly go back, which is the promise the route ruling exists to
   * keep. So the canvas hands the reviewer to the address instead: one push,
   * and back returns them to this record.
   *
   * AND THE PUSH SAYS WHICH DOOR IT CAME THROUGH (VIEW-AC-15). There are exactly
   * two ways into the viewer and they return to different places, so the label
   * on its back control cannot be read off the address — the address is the same
   * either way. `history.push`'s own per-entry state carries it, which means a
   * cold arrival simply has none and falls back to the line, which is the right
   * answer for a link with no record behind it (VIEW-AC-2b).
   */
  const openDrawing = (lineId: string, unitIndex: number | null) => {
    history.push(linePath(lineId) + drawingSuffix(unitIndex), VIEWER_FROM_RECORD);
  };

  return (
    <OpsPage
      destination={PROJECTS}
      // THE PROJECT'S NAME, not its reference. It is the project's name; the
      // reference is its identifier, and it has its own place below where it
      // cannot truncate.
      title={record ? record.title : "Project"}
      backTo={{ label: "Projects", href: PROJECTS.path }}
      width="full"
      bandPinned={!!record}
      identity={record ? <RecordIdentity record={record} /> : undefined}
      headActions={record ? (
        <div className="rec-cta">
          {primary && (
            <IonButton
              size="small"
              className="rec-cta__primary"
              data-testid="record-primary"
              // SHOWN, REFUSED, AND SAID OUT LOUD. The owner's correction:
              // "a human can and must be blocked in certain scenarios. What
              // that rule is meant to imply was that a human has decision
              // authority to override any configuration, project guardrails,
              // any recommendation produced earlier. It does not mean that
              // issuing with a missing product, dimensions or price is
              // allowed." The server already models exactly this distinction.
              disabled={!!primary.blockedReason || running === primary.id}
              // THE REASON TRAVELS IN THE ACCESSIBLE NAME. Ionic's React
              // wrapper drops `aria-describedby` — the component manages the
              // host's aria attributes — so a screen reader would otherwise
              // hear the verb and never the refusal. `aria-label` survives, and
              // the row beside it carries the same sentence visually.
              aria-label={primary.blockedReason
                ? `${primary.label}. Blocked: ${primary.blockedReason}`
                : undefined}
              onClick={() => press(primary)}
            >
              {primary.label}
            </IonButton>
          )}
          {others.length > 0 && (
            <IonButton
              size="small"
              fill="clear"
              className="rec-cta__more"
              data-testid="record-more"
              onClick={() => setPanelOpen(true)}
            >
              <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
              <span className="ops2-sr-only">More actions for this project</span>
            </IonButton>
          )}
        </div>
      ) : undefined}
      controls={record ? (
        <div className="rec-controls">
          {/* WHO OWES THE NEXT MOVE IS HEADER, not content — the owner's
              ruling. It is the first thing read on arrival and it belongs with
              the identity it qualifies, above the tabs that choose what to look
              at. Below them it scrolled with the list, which made the record's
              most important sentence the one most easily lost. */}
          <StateRow record={record} />
          <div className="pq-controls" data-wide={wide}>
            <div className="pq-chips" role="group" aria-label="What to show">
              <button
                type="button"
                className="pq-chip"
                data-testid="record-tab"
                data-tab="lines"
                aria-pressed={tab === "lines"}
                onClick={() => setTab("lines")}
              >
                Lines<span className="pq-count">{record.lines.length}</span>
              </button>
              <button
                type="button"
                className="pq-chip"
                data-testid="record-tab"
                data-tab="project"
                aria-pressed={tab === "project"}
                onClick={() => setTab("project")}
              >
                Project
              </button>
            </div>
          </div>
        </div>
      ) : undefined}
    >
      {load.status === "loading" && (
        <div className="rec-skeleton" data-testid="record-skeleton" aria-busy="true">
          <IonSkeletonText animated style={{ height: "72px" }} />
          <IonSkeletonText animated style={{ height: wide ? "300px" : "420px" }} />
        </div>
      )}

      {load.status === "missing" && (
        // A DIFFERENT SENTENCE AND A DIFFERENT WAY OUT. "Try again" would send
        // someone retrying a URL that will never resolve.
        <div className="pq-empty" data-testid="record-missing">
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
        <div className="pq-error ds-surface-card" data-testid="record-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {record && (
        <>
          {/* THE PILL, and it is drawn only when there is something to draw it
              for. It is the reason the header's CTA is disabled, so it may not
              disappear while the CTA is still refused for a LINE reason — and
              it never does, because both read the same predicate. */}
          {attention > 0 && (
            <AttentionPill
              count={attention}
              filterOn={filterOn}
              onToggle={() => setFilterOn((on) => !on)}
            />
          )}
          {/* ONLY WHAT THE PILL CANNOT SAY. The pill counts the lines that need
              a person; the gate also refuses on things that are not lines at
              all — an unsettled delivery, a project in a state a quote cannot
              be issued from. Those still get said, because nothing else on the
              page would say them, and the sentence is the SERVER'S own: the
              console never re-derives the gate.

              The two are mutually exclusive on purpose. Rendered together they
              said the same thing twice, once counted and once in prose, which
              is the duplication the owner deleted the yellow bar for. */}
          {primary?.blockedReason && attention === 0 && (
            <p className="rec-refusal" data-testid="record-blocked">
              <IonIcon icon={alertCircle} aria-hidden="true" />
              {primary.blockedReason}
            </p>
          )}
          {pending && (
            <p className="rec-pending" data-testid="record-pending">
              <b>Next: {pending.label}</b>
              <span>
                {" "}— not in ops2 yet. This job's next move lives in the legacy console.
              </span>
            </p>
          )}
          {failure && (
            <p className="rec-refusal" data-testid="record-failure" role="alert">
              <IonIcon icon={alertCircle} aria-hidden="true" />
              {failure}
            </p>
          )}


          {tab === "lines" ? (
            /* THE DESK IS A RAIL AND A CANVAS — the list on the left, the line
               under review on the right, which is where line review actually
               happens at a desk and the reason the mock builds the record this
               way.

               THE RAIL IS THE PHONE COLUMN, UNCHANGED: the same list and the
               same totals in the same order, not a desktop variant of them. The
               canvas mounts `LineReview`, which is the same body the line page
               shows, so a line reads identically whichever surface reached it.

               NO FILMSTRIP and NO FULL-WIDTH ACTION BAR. Both are in the mock
               and both are excluded by name: the deck of thumbnails mirrors the
               rail beside it, and a bar across the foot of the canvas is not how
               a line actions should be reached. They arrive through the side
               panel this console already has. */
            <div className="rec-zones" data-wide={wide}>
              <div className="rec-zones__rail">
                <RecordLines
                  lines={shown}
                  total={record.lines.length}
                  filterOn={filterOn}
                  orderNo={record.orderNo}
                  selectedId={wide ? selected?.id ?? null : null}
                  onOpen={openLine}
                  onClearFilter={() => setFilterOn(false)}
                />
                <RecordTotals record={record} />
              </div>
              {wide && (
                <div className="rec-zones__canvas" data-testid="record-canvas">
                  {selected ? (
                    <>
                      <div className="rec-canvas__head">
                        <h2>
                          <span className="rec-canvas__code">{selected.code || "\u2014"}</span>
                          {selected.productName}
                        </h2>
                        {/* This line actions, through the panel the console
                            already has — never a bar across the canvas foot. */}
                        <IonButton
                          size="small"
                          fill="outline"
                          className="rec-canvas__actions"
                          data-testid="line-actions"
                          onClick={() => setLinePanelOpen(true)}
                        >
                          Line actions
                        </IonButton>
                      </div>
                      {/* NO "WHY THIS PRODUCT" ON THE CANVAS, and the null is
                          deliberate rather than forgotten. Every state the
                          owner approved shows the panel on the LINE PAGE
                          (mock B1-B12), and its door navigates to that line's
                          own `/why` address — which from here would be a
                          different page with a different back. Wiring it is a
                          real decision about this surface, not a rider on the
                          line page's, so it is raised rather than assumed.
                          The drawing viewer is wired here because VIEW-AC-5
                          says every enlargeable drawing opens it; no criterion
                          says the same about the panel. */}
                      {/* THE PANEL IS HERE NOW, and the null it replaces was
                          raised rather than assumed: "NO 'WHY THIS PRODUCT' ON
                          THE CANVAS, and the null is deliberate rather than
                          forgotten … Wiring it is a real decision about this
                          surface". The owner took it — "not tested yet. but
                          yes." — which also supersedes WHY-AC-43/D21, the
                          ruling that this canvas shows no panel and issues no
                          rationale request.

                          ITS DOOR GOES TO THE LINE'S OWN `/why` ADDRESS, which
                          is the same one door the line page opens (the route
                          grammar allows exactly one). So the detail is the
                          line's, reached from wherever the reader was, and
                          back returns here. */}
                      <LineReview
                        line={selected}
                        onOpenDrawing={(unitIndex) => openDrawing(selected.id, unitIndex)}
                        why={(
                          <WhyPanel
                            load={canvasWhy}
                            // THE MARK SAYS WHICH DOOR, so back names the
                            // record rather than the line: the reader came from
                            // here and has not seen the line page at all.
                            onOpen={() => history.push(
                              linePath(selected.id) + WHY_SUFFIX, WHY_FROM_RECORD,
                            )}
                            reload={reloadCanvasWhy}
                          />
                        )}
                      />
                    </>
                  ) : (
                    <p className="rec-canvas__empty" data-testid="record-canvas-empty">
                      {filterOn
                        ? "Nothing is left once the filter is on. Clear it to review a line."
                        : "Choose a line on the left to review it."}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="pq-empty" data-testid="record-project-tab">
              <strong>Progress, payments and files are not built yet.</strong>
              <IonNote className="ds-type-caption">
                They are migrating from the legacy console one at a time. Until then
                this project's history lives there.
              </IonNote>
            </div>
          )}
        </>
      )}

      {record && (
        <SidePanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          title="Project actions"
          testId="record-actions-panel"
          footer={
            <IonNote className="ds-type-caption">
              Notes, clarification requests and delivery arrive with their own screens.
            </IonNote>
          }
        >
          <div className="rec-actions">
            {others.map((action) => (
              <IonButton
                key={action.id}
                expand="block"
                fill="clear"
                className="rec-actions__item"
                data-testid="record-action"
                data-action={action.id}
                disabled={!!action.blockedReason || running === action.id}
                onClick={() => press(action)}
              >
                {action.label}
              </IonButton>
            ))}
          </div>
        </SidePanel>
      )}

      {/* THE LINE UNDER REVIEW, AND WHAT CAN BE DONE TO IT — through the panel
          this console already has, which is the owner ruling on the mock full
          width bar at the foot of the canvas.

          IT LISTS WHAT DOES NOT EXIST YET, and says so, rather than offering
          controls wired to nothing. Editing a line and asking why a product was
          chosen are both real destinations with their own data and their own
          decisions; naming them here is a map, not a button. The alternative
          tried in this repo four times is a control that looks live and is not.  */}
      {record && selected && (
        <SidePanel
          open={linePanelOpen}
          onClose={() => setLinePanelOpen(false)}
          title={`${selected.code || "This line"} · ${selected.productName}`}
          testId="line-actions-panel"
        >
          <div className="rec-actions">
            <p className="rec-pending" data-testid="line-actions-pending">
              <b>Edit</b>
              <span> — lines are edited in the legacy console for now.</span>
            </p>
            <p className="rec-pending">
              <b>Why this product?</b>
              <span> — the estimator reasoning arrives on this page next.</span>
            </p>
          </div>
        </SidePanel>
      )}

      {/* The confirm step, in place rather than as a browser dialog: the
          sentence is the server's and it names the consequence. */}
      {confirming && (
        <SidePanel
          open
          onClose={() => setConfirming(null)}
          title={confirming.label}
          testId="record-confirm"
          footer={
            <IonButton
              expand="block"
              data-testid="record-confirm-go"
              disabled={running === confirming.id}
              onClick={() => void run(confirming)}
            >
              {confirming.label}
            </IonButton>
          }
        >
          <p className="rec-confirm">{confirming.confirm}</p>
        </SidePanel>
      )}
    </OpsPage>
  );
}

/**
 * The band's identity line: the reference, the customer, and the money.
 *
 * THE REFERENCE NEVER TRUNCATES, because here it structurally cannot — ten
 * fixed-width characters at the leading edge of their own line. It is what ops
 * reads out on a call, so it is the piece that must always be complete; the
 * project's name is the piece allowed to ellipsize, and it does, in the
 * heading above.
 *
 * The customer sits beside it and NOWHERE IN THE PAGE BODY. One place per fact:
 * a name in the band and the same name again under it is how a reader learns
 * the two might be different things.
 */
function RecordIdentity({ record }: { record: ProjectRecord }) {
  const corner = cornerFigure(totalsFor(record));
  const customer = record.org ?? record.customerName;
  return (
    <div className="rec-ident" data-testid="record-identity">
      <span className="rec-ident__ids">
        <span className="rec-ident__ref">{record.ref}</span>
        {/* Once a quote is accepted the CONTRACT number is the identity ops
            quotes on a call, so it joins the reference rather than replacing
            it — both are printed on documents someone already has. */}
        {record.orderNo && <span className="rec-ident__ref">{record.orderNo}</span>}
        {customer && <span className="rec-ident__cust">{customer}</span>}
      </span>
      {/* THE FIGURE, AND NOTHING BESIDE IT. It carried the count of unrated
          lines — `$12,000 · 1 no rate` — and the attention row two lines below
          says exactly that, with the control that acts on it. The owner's
          ruling: the same information twice is not emphasis. What is missing is
          still named, once, where it can be acted on. */}
      <span className="rec-ident__money">
        <strong data-priced={corner.caveat == null}>{money(corner.amount)}</strong>
      </span>
    </div>
  );
}

/**
 * The lifecycle, ranked instead of run together — and not a control.
 *
 * It read "Waiting on us · Technical review · 3 days" as one dotted run, which
 * gives no fact priority: the reader has to parse all of it to find the one
 * they wanted. Ranked, there is one thing to read at a glance and the rest is
 * there without being in the way.
 *
 * In the mock this row opens Progress. Progress is fenced out of this step, and
 * a row that opens nothing is the defect recorded four times — so it is a
 * statement here, and becomes pressable the day Progress exists.
 */
function StateRow({ record }: { record: ProjectRecord }) {
  const age = ageLabel(record);
  return (
    <div className="rec-state" data-waiting={record.waitingOn} data-testid="record-state">
      <span className="rec-state__owed">{waitingSentence(record)}</span>
      <span className="rec-state__rest">
        {record.stateLabel}
        {age && <> · {age}</>}
      </span>
    </div>
  );
}

/**
 * THE PILL — what still needs a person, and the control that shows only those.
 *
 * The owner, having seen the band it replaces: "the large pill-like area that
 * says '2 lines have no rate' is the solution — use that design and incorporate
 * quick filter in it. Drop the yellow bar altogether — it duplicates what the
 * pill says. no pill when the filter is cleared."
 *
 * So there is ONE object, not two. The tinted row inside the band is gone with
 * its ranked queue of blockers, its clear state and its no-lines state: a
 * surface that says "nothing is blocking this quote" is spending a permanent
 * line on the absence of news, and the eye stops reading a thing that is always
 * there. Nothing needing attention means nothing drawn.
 *
 * IT COUNTS THE ROWS THAT CARRY A MARK — `needsAttention`, the same predicate
 * that paints the leading edge and prints the badge — so the pill, the filter
 * and the list can never disagree about what "attention" means. On today's
 * writers that is also exactly the set that blocks issuing (`record.ts`), which
 * is why one sentence can carry both without the console re-deriving the gate.
 */
function AttentionPill({ count, filterOn, onToggle }: {
  count: number;
  filterOn: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="rec-pill"
      data-testid="record-attention"
      aria-pressed={filterOn}
      onClick={onToggle}
    >
      <IonIcon icon={alertCircle} aria-hidden="true" />
      <span className="rec-pill__text">
        {filterOn
          ? `Showing ${count} line${count === 1 ? "" : "s"} that need${count === 1 ? "s" : ""} attention`
          : `${count} line${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`}
      </span>
      <span className="rec-pill__act">{filterOn ? "Show all" : "Show only these"}</span>
    </button>
  );
}

/**
 * The foot of the list: the lines, the delivery, and what they come to.
 *
 * A PARTIAL SUM IS NEVER CALLED A TOTAL. The priced lines add up under their
 * own label with the count of what is missing beside it, and the project total
 * row states the ABSENCE rather than printing a figure captioned as
 * provisional. "so far" was invented for this panel and is gone; "estimate" is
 * on Quote's own _Avoid_ line, so an unconfirmed delivery says "not confirmed".
 *
 * DELIVERY IS TEXT HERE. It is a figure and a state, with nothing to press:
 * there is no delivery screen in this build, and the owner limited this change
 * to the review surface.
 */
function RecordTotals({ record }: { record: ProjectRecord }) {
  const t = totalsFor(record);
  return (
    <div className="rec-totals" data-testid="record-totals">
      <div className="rec-totals__row">
        <span>
          Lines
          {t.unpriced > 0 && (
            <span className="rec-totals__caveat"> · {t.unpriced} with no rate</span>
          )}
        </span>
        <span className="rec-totals__figure">{money(t.lines)}</span>
      </div>
      <div className="rec-totals__row" data-settled={t.deliverySettled}>
        <span>Delivery</span>
        <DeliveryFigure record={record} totals={t} />
      </div>
      <div className="rec-totals__row rec-totals__row--sum">
        <span>Project total</span>
        {t.total != null ? (
          <span className="rec-totals__figure">{money(t.total)}</span>
        ) : (
          // THE ABSENCE, NAMED. Not a number under a caption saying it is not
          // really the number — a reviewer reads the figure and skims the
          // caption, which is how $18,000 gets quoted for a $30,000 job.
          <span className="rec-totals__absent">
            {t.unpriced > 0
              ? `${t.unpriced} line${t.unpriced === 1 ? " has" : "s have"} no rate`
              : "Delivery has not been set"}
          </span>
        )}
      </div>
    </div>
  );
}

/** Settled ⇒ the figure, and `0` is a figure — a trade arranging its own
 *  freight. Unsettled with a live rate ⇒ that rate, said to be unconfirmed.
 *  Nothing at all ⇒ the absence, drawn as the fault it is, with no imperative:
 *  there is nothing on this screen to press. */
function DeliveryFigure({ record, totals }: { record: ProjectRecord; totals: RecordTotals }) {
  if (totals.deliverySettled) {
    return <span className="rec-totals__figure">{money(totals.delivery ?? 0)}</span>;
  }
  if (record.delivery.estimate != null) {
    return (
      <span className="rec-totals__figure">
        {money(record.delivery.estimate)}
        <span className="rec-totals__caveat"> not confirmed</span>
      </span>
    );
  }
  return <span className="rec-totals__missing">no figure</span>;
}
