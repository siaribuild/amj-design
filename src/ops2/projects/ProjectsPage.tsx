import { useEffect, useMemo, useRef, useState } from "react";
import {
  IonBadge, IonButton, IonIcon, IonNote, IonSearchbar, IonSkeletonText,
} from "@ionic/react";
import { briefcaseOutline, funnelOutline, searchOutline, warningOutline } from "ionicons/icons";
import { destination } from "../nav/destinations";
import { useRailWidth } from "../nav/useRailWidth";
import { OpsPage } from "../chrome/OpsPage";
import { FilterSheet } from "./FilterSheet";
import { ProjectCards, ProjectTable } from "./rows";
import { useProjectQueue } from "./useProjectQueue";
import {
  EMPTY_QUERY, REFINEMENTS, chipStates, emptyStateFor, headlineStats,
  refinementStates, selectProjects, type QueueQuery,
} from "./queue";

const PROJECTS = destination("projects");

const SEARCH_PLACEHOLDER = "Search project, customer or reference";

/** One frozen empty array, so a not-yet-loaded queue is referentially stable. */
const EMPTY_ROWS: never[] = [];

/**
 * The Projects list — the operations queue, and the first destination in ops2
 * that does real work.
 *
 * ── WHAT THE REVIEWER IS DOING IN THE FIRST TWO SECONDS ──────────────────────
 * Deciding whether anything here needs him. The governing constraint of this
 * console, in the owner's words, is that "we can't afford waiting the whole day
 * to open the request in the evening — that's the day lost". So arrival answers
 * one question — WHAT NEEDS A DECISION — and everything else is a step away
 * from that answer rather than a competitor for the same glance.
 *
 * That decides the whole layout:
 *  - The queue opens on `Needs us`, not on everything.
 *  - Who is waiting is a WORD on every row, never a colour alone.
 *  - The age sits beside it, quiet, because a two-day wait and a nine-day wait
 *    are different decisions and the number is the only thing that says so.
 *  - Money is present but late in the row: it settles which job matters when
 *    two are equally overdue, and it is never what you scan for first.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ────────────────────────────────────────────
 * `+ New project`, which the owner's desktop drawing puts at the top right. THE
 * ACTION DOES NOT EXIST: there is no `POST /api/ops/projects` and no ops-side
 * create flow anywhere in the Worker — every project in the system is created by
 * a customer submitting one. A primary drawn and wired to nothing is the exact
 * defect this effort has already recorded twice (`OPEN-DEFECTS.md` D2, the Files
 * controls with `href="#"`), so it is absent and reported rather than present
 * and inert. It arrives the day the endpoint does.
 *
 * ── TWO PRESENTATIONS, ONE MODEL ─────────────────────────────────────────────
 * The wide table and the phone cards are chosen by the SHELL'S OWN change point
 * (`useRailWidth`, 1024px), not by a second media query. One change point,
 * stated once, is the rule `../nav/destinations.ts` sets for the shell and this
 * is the same fact one level down. They are a real either/or — never
 * `{!wide && …}`, the habit that made both the status row and the totals panel
 * render nowhere at desktop width (`OPEN-DEFECTS.md` D5).
 */
export function ProjectsPage() {
  const wide = useRailWidth();
  const { load, reload } = useProjectQueue();
  const [query, setQuery] = useState<QueueQuery>(EMPTY_QUERY);
  const [searching, setSearching] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Derived INSIDE the memo, from `load` rather than from a `rows` computed
  // above it: `load.status === "ready" ? load.rows : []` produces a fresh array
  // literal on every render, so a memo keyed on it never hits and the whole
  // selection — four passes over the queue — runs on every keystroke.
  const view = useMemo(() => {
    const rows = load.status === "ready" ? load.rows : EMPTY_ROWS;
    return {
      rows,
      visible: selectProjects(rows, query),
      chips: chipStates(rows, query),
      refinements: refinementStates(rows, query),
      stats: headlineStats(rows, query),
    };
  }, [load, query]);

  const activeRefinements = query.refinements
    .map((key) => REFINEMENTS.find((r) => r.key === key)?.label)
    .filter((label): label is string => !!label);

  const closeSearch = () => { setSearching(false); setQuery((q) => ({ ...q, search: "" })); };

  // A RETAINED SEARCH REVEALS ITS OWN FIELD. `searching` is the phone's toggle,
  // but the desk's field is permanent and never sets it — so a term typed at
  // 1440 and carried under the change point (a Fold is opened and closed
  // mid-task) went on filtering the list from behind a search ICON: rows
  // missing, no field, no clear, and nothing on screen saying why. The text
  // itself is the second reason to be open, and it outranks the toggle.
  const searchOpen = searching || query.search.trim() !== "";

  // FOCUS FOLLOWS THE CONTROL THAT REPLACED THE ONE YOU PRESSED. Revealing the
  // field unmounts the focused button and mounts an input where it was; without
  // this a keyboard user is dropped at the top of the document and a phone gets
  // no keyboard after a deliberate tap on a search icon — which reads as the
  // control not working. Cancelling hands focus back to the toggle rather than
  // to the document, so the tab position survives the round trip.
  //
  // Narrow only: at the desk the field is always there, and grabbing focus on
  // arrival would take the caret away from whatever the person was doing.
  const searchbar = useRef<HTMLIonSearchbarElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wide) { wasOpen.current = searchOpen; return; }
    // `getInputElement()` rather than `setFocus()`, and the difference is
    // timing: the effect runs the moment the field mounts, and the custom
    // element has not necessarily upgraded yet — `setFocus()` then resolves
    // against nothing and returns quietly, which is exactly what it did
    // (measured: field visible, input present, focus still on the document).
    // The component's own promise waits for the input it is going to focus.
    if (searchOpen && !wasOpen.current) {
      void searchbar.current?.getInputElement().then((input) => input?.focus());
    }
    if (!searchOpen && wasOpen.current) searchToggle.current?.focus();
    wasOpen.current = searchOpen;
  }, [wide, searchOpen]);

  // THE SEARCH FIELD REPLACES THE TITLE ROW IN PLACE, at the same height —
  // "keep within one line, search entry field shall not add another line". The
  // no-growth guarantee is structural (see OpsPage), not a tuned number.
  // IONIC'S OWN CANCEL IS NOT USED, and that is a measured decision rather than
  // a preference. `IonSearchbar`'s cancel button honours `cancelButtonText`
  // only in the iOS idiom; on Material it renders `cancelButtonIcon` — a back
  // ARROW, in the leading position, replacing the magnifier. The first build
  // shipped that and it read as a navigation control on the one row where a
  // navigation control would be a trapdoor. Ionic picks the idiom at runtime
  // (ADR 0005 keeps that dual behaviour deliberately), so the word "Cancel" is
  // only reliably the word if we render it.
  const searchField = (
    <IonSearchbar
      ref={searchbar}
      className="pq-search"
      data-testid="queue-search"
      value={query.search}
      placeholder={SEARCH_PLACEHOLDER}
      showCancelButton="never"
      onIonInput={(e) => setQuery((q) => ({ ...q, search: e.detail.value ?? "" }))}
    />
  );

  return (
    <OpsPage
      destination={PROJECTS}
      width="full"
      // The eyebrow and the lede are the DESKTOP drawing's. The owner's later
      // phone drawing replaced that block with a bare `Projects` and a search
      // icon, and a queue read one-handed between other tasks cannot spend two
      // rows explaining itself before showing the work.
      eyebrow={wide ? { text: "Operations queue", icon: briefcaseOutline } : undefined}
      lede={wide
        ? "Find the work that needs a decision, then stay in project context through line review and editing."
        : undefined}
      // A PLAIN <button>, and the reason is disqualifier 2 of the Ionic boundary
      // — behaviour, not looks. This control needs two things `IonButton` takes
      // away: a name a screen reader can read (the host strips `aria-label` and
      // `aria-describedby`, per the handover's table) and a HOST THAT CAN HOLD
      // FOCUS, because cancelling search has to hand focus back to it and
      // `ion-button`'s focusable element is a native button inside its shadow
      // root. Measured: `.focus()` on the host did nothing at all. The bell in
      // OpsPage is a plain button beside it for its own stated reason, so this
      // is the established shape rather than a new one.
      headActions={!wide && !searchOpen ? (
        <button
          type="button"
          ref={searchToggle}
          className="pq-icon-btn"
          data-testid="queue-search-toggle"
          onClick={() => setSearching(true)}
        >
          <IonIcon icon={searchOutline} aria-hidden="true" />
          <span className="ops2-sr-only">Search projects</span>
        </button>
      ) : undefined}
      headOverlay={!wide && searchOpen ? (
        <>
          {searchField}
          <IonButton
            fill="clear"
            size="small"
            className="pq-search-cancel"
            data-testid="queue-search-cancel"
            onClick={closeSearch}
          >
            Cancel
          </IonButton>
        </>
      ) : undefined}
    >
      {load.status === "loading" && <QueueSkeleton wide={wide} />}

      {load.status === "error" && (
        <div className="pq-error ds-surface-card" data-testid="queue-error" role="alert">
          <IonIcon icon={warningOutline} aria-hidden="true" />
          <div>
            <strong>{load.headline}</strong>
            <IonNote className="ds-type-caption">{load.detail}</IonNote>
          </div>
          <IonButton size="small" fill="outline" onClick={reload}>Try again</IonButton>
        </div>
      )}

      {load.status === "ready" && (
        <>
          {/* The attention strip — THE DESK ONLY, and its absence on the phone
              is the owner's drawing rather than an omission.
              
              His phone drawing goes title → chips → cards with nothing between
              them, and the reason holds up once you look at the two widths side
              by side: at 1440 the strip costs a band of otherwise empty page
              beside the search card, while at 390 it is the first two hundred
              pixels of a screen whose entire value is how much of the LIST you
              can see before scrolling. Every number in it is reachable on the
              phone anyway — three through the chips, `Ready to issue` through
              the funnel — so what is lost is the glance, not the information.
              
              This is a real either/or (`wide ? … : …` never `!wide && …`): the
              habit of writing only the negative half is what made both the
              status row and the totals panel render nowhere at desktop width
              (`OPEN-DEFECTS.md` D5). The bold number is the queue's whole reason
              for existing; the three columns beside it are the other states a
              reviewer orients by. Every one of them is a control, and each
              carries the query it is counted with — so a stat cannot promise a
              number and then show a different list. */}
          {wide ? (
          <div className="pq-attention" data-testid="queue-attention">
            <button
              type="button"
              className="pq-attention__lead"
              data-testid="queue-stat"
              data-stat="needUs"
              aria-pressed={view.stats[0].active}
              onClick={() => setQuery(view.stats[0].query)}
            >
              <span className="pq-attention__glyph" aria-hidden="true">!</span>
              <span>
                <strong>{view.stats[0].count} need us</strong>
                <span className="pq-attention__why">Technical, pricing or missing-detail decisions</span>
              </span>
            </button>
            <div className="pq-attention__stats">
              {view.stats.slice(1).map((stat) => (
                <button
                  type="button"
                  key={stat.key}
                  className="pq-stat"
                  data-testid="queue-stat"
                  data-stat={stat.key}
                  aria-pressed={stat.active}
                  onClick={() => setQuery(stat.query)}
                >
                  <span className="pq-stat__label ds-type-label-md">{stat.label}</span>
                  <span className="pq-stat__value">{stat.count}</span>
                </button>
              ))}
            </div>
          </div>
          ) : null}

          <div className="pq-controls" data-wide={wide}>
            {/* At the desk the field is permanent — there is room, and a
                reviewer who has to reveal a search first pays a tap for every
                phone call. On the phone it lives in the title row and is
                revealed, because the row it would otherwise add is a row of
                the list. */}
            {wide && searchField}
            <div className="pq-filters">
              <div className="pq-chips" role="group" aria-label="Filter by who is waiting">
                {view.chips.map((chip) => (
                  <button
                    type="button"
                    key={chip.key}
                    className="pq-chip"
                    data-testid="queue-chip"
                    data-chip={chip.key}
                    aria-pressed={chip.active}
                    onClick={() => setQuery(chip.query)}
                  >
                    {chip.label}
                    <span className="pq-count">{chip.count}</span>
                  </button>
                ))}
              </div>
              {/* The funnel carries a count of what is on. Without it a filtered
                  empty list is indistinguishable from an empty queue — the
                  difference between "nothing to do" and "you cannot see the
                  work". */}
              <IonButton
                fill="outline"
                size="small"
                className="pq-funnel"
                data-testid="queue-funnel"
                onClick={() => setSheetOpen(true)}
              >
                <IonIcon icon={funnelOutline} aria-hidden="true" />
                <span className="ops2-sr-only">
                  {activeRefinements.length
                    ? `Filters, ${activeRefinements.length} active`
                    : "Filters"}
                </span>
                {activeRefinements.length > 0 && (
                  <IonBadge className="pq-funnel__count" data-testid="queue-funnel-count">
                    {activeRefinements.length}
                  </IonBadge>
                )}
              </IonButton>
            </div>
          </div>

          {/* WHICH refinements are on, not just how many. A count tells you the
              number of filters and still leaves you guessing which row went
              missing and why. */}
          {activeRefinements.length > 0 && (
            <div className="pq-active" data-testid="queue-active-filters">
              <span>{activeRefinements.join(" + ")}</span>
              <IonButton
                fill="clear"
                size="small"
                onClick={() => setQuery((q) => ({ ...q, refinements: [] }))}
              >
                Clear
              </IonButton>
            </div>
          )}

          {view.visible.length === 0
            ? <EmptyPanel rows={view.rows} query={query} onApply={setQuery} />
            : wide
              ? <ProjectTable rows={view.visible} />
              : <ProjectCards rows={view.visible} />}
        </>
      )}

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        controls={view.refinements}
        onApply={setQuery}
        onClear={() => setQuery((q) => ({ ...q, refinements: [] }))}
        activeCount={query.refinements.length}
      />
    </OpsPage>
  );
}

/** An empty list, saying WHY — and handing back the way out when the reader is
 *  the reason it is empty. The two causes are opposites and the screen never
 *  leaves them to be guessed at; see `emptyStateFor`. */
function EmptyPanel({
  rows, query, onApply,
}: {
  rows: Parameters<typeof emptyStateFor>[0];
  query: QueueQuery;
  onApply: (query: QueueQuery) => void;
}) {
  const state = emptyStateFor(rows, query);
  return (
    <div className="pq-empty" data-testid="queue-empty">
      <strong>{state.headline}</strong>
      <IonNote className="ds-type-caption">{state.detail}</IonNote>
      {state.clear && (
        <IonButton size="small" fill="outline" onClick={() => onApply(state.clear!.query)}>
          {state.clear.label}
        </IonButton>
      )}
    </div>
  );
}

/** A skeleton OF THE COMING SHAPE, never a spinner — R-161, and the boundary
 *  document's own ruling on `IonLoading`. The rows are the shape the list will
 *  land in, so nothing jumps when it does. */
function QueueSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="pq-skeleton" data-testid="queue-skeleton" aria-busy="true">
      {/* The strip's block, and ONLY where the strip lands. A skeleton is a
          promise about the coming layout, which is a way of being wrong that a
          spinner cannot be: reserving 92px for a band the phone no longer
          renders made the controls and the whole list jump upward the moment
          the data arrived — on the surface whose entire argument for a skeleton
          is that nothing moves when it resolves. */}
      {wide && <IonSkeletonText animated style={{ height: "76px" }} />}
      <IonSkeletonText animated style={{ height: "44px" }} />
      {[0, 1, 2, 3].map((i) => (
        <IonSkeletonText key={i} animated style={{ height: wide ? "52px" : "96px" }} />
      ))}
    </div>
  );
}
