import { useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  IonBadge, IonButton, IonIcon, IonNote, IonSearchbar, IonSkeletonText,
} from "@ionic/react";
import { funnelOutline, searchOutline, warningOutline } from "ionicons/icons";
import { destination } from "../nav/destinations";
import { useRailWidth } from "../nav/useRailWidth";
import { OpsPage } from "../chrome/OpsPage";
import { FilterSheet } from "./FilterSheet";
import { ProjectCards, ProjectTable } from "./rows";
import { useProjectQueue } from "./useProjectQueue";
import {
  ATTENTION_FILTERS, EMPTY_QUERY, REFINEMENTS, attentionFromSearch, attentionQuery,
  chipStates, emptyStateFor, refinementStates, selectProjects, type QueueQuery,
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
  const location = useLocation();
  const history = useHistory();

  // `?attn=` from an Attention row's link is a one-shot instruction, not
  // initial state: `IonRouterOutlet` keeps this page mounted across
  // navigation, so a second visit with a stale/absent param must not re-apply
  // an old prefilter. Applied via effect, then the param is stripped so a
  // refresh doesn't repeat it.
  //
  // GUARDED ON `location.pathname` because that mounted-but-hidden state means
  // this effect keeps watching the GLOBAL location: without the guard, a
  // sibling route's own `?attn=` (e.g. `/products?attn=submissions`) applies
  // the Projects prefilter and `history.replace`s the reader off the page
  // they asked for.
  //
  // AN UNRECOGNISED VALUE (design §3.3 point 2) still strips the param but
  // resets to `EMPTY_QUERY` rather than leaving the current query alone — the
  // raw value reaches no DOM sink and is validated into `null` before it does
  // anything.
  // WHICH ARRIVAL OWNS THE PREFILTER ON SCREEN — an identity, not a flag.
  //
  // A boolean cleared by the next `ionViewWillEnter` was the first attempt (F2)
  // and it produced F4: on a fast hop the arrival's own enter event never fires
  // at all, so the flag was still set when the reader came back, the reset
  // consumed it as though THAT were the arrival, and the prefilter stayed on for
  // good — the queue opening narrowed on plain rail navigation, which is
  // exactly what P5/criterion 11 forbids.
  //
  // A one-shot whose clearing depends on an event that may never fire is not a
  // one-shot. So this records WHICH history entry applied the filter, and the
  // reset asks a question that needs no event to have fired: "am I on a
  // different entry from the one that set this?" React Router gives every entry
  // a distinct `key`, and `history.replace` mints a new one — so the value
  // stored here is the key of the entry the reader is standing on AFTER the
  // strip, which is the entry the filter belongs to.
  const attnEntryRef = useRef<string | null>(null);

  useEffect(() => {
    if (location.pathname !== PROJECTS.path) return;
    if (!new URLSearchParams(location.search).has("attn")) return;
    const key = attentionFromSearch(location.search);
    setQuery(key ? attentionQuery(key) : EMPTY_QUERY);
    history.replace(PROJECTS.path);
    // Read AFTER the replace: `history.location.key` is the entry the strip
    // just created, which is where the reader now stands.
    attnEntryRef.current = history.location.key ?? null;
  }, [location.pathname, location.search]);

  // THE RESET LIVES ON THE LOCATION, NOT ON IONIC'S LIFECYCLE.
  //
  // MEASURED, after two fixes that failed identically because the premise was
  // wrong rather than the logic: `ionViewWillEnter` DOES NOT FIRE on a rail
  // navigation back into this view. Probed in the running console — arrival
  // logs one `willEnter`, then rail-away and rail-back log nothing at all,
  // while the prefilter stays on screen. Any reset written inside that hook is
  // unreachable on the one path that needs it, which is why both a consumed
  // flag (F2) and an entry-key comparison read from a render-lagged ref (F4)
  // behaved the same: neither ever ran.
  //
  // A location change always happens, because it IS the navigation. So the
  // reset hangs off the router, and asks the question the lifecycle could not
  // answer: is the reader standing on a different history entry from the one
  // that applied this filter? React Router mints a fresh key per entry and
  // `history.replace` mints one for the strip, so same key means "still the
  // arrival that set it" and any other key means "they navigated away and
  // came back".
  // LEAVING THE ROUTE ENDS THE ARRIVAL, which the entry key alone cannot say.
  // Opening a record and coming back is a POP to the very entry that applied
  // the filter, so the keys match and an identity test on its own would keep a
  // prefilter the reader has visibly navigated away from. Clearing the ref the
  // moment the pathname is not ours makes "did they leave" a fact rather than
  // an inference, and the return trip then takes the reset branch below.
  useEffect(() => {
    if (location.pathname !== PROJECTS.path) { attnEntryRef.current = null; return; }
    if (new URLSearchParams(location.search).has("attn")) return;
    if (attnEntryRef.current && location.key === attnEntryRef.current) return;
    attnEntryRef.current = null;
    setQuery((q) => (q.attention ? EMPTY_QUERY : q));
  }, [location.pathname, location.search, location.key]);

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
    };
  }, [load, query]);

  const activeRefinements = query.refinements
    .map((key) => REFINEMENTS.find((r) => r.key === key)?.label)
    .filter((label): label is string => !!label);

  // The prefilter's label LEADS the strip (design §3.3 point 4) — the reader
  // arrived because an Attention row named it, and it stays named until Clear.
  const attentionLabel = query.attention
    ? ATTENTION_FILTERS.find((f) => f.key === query.attention)?.label
    : undefined;

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
      // A PLAIN <button>, and the reason is disqualifier 2 of the Ionic boundary
      // — behaviour, not looks. This control needs two things `IonButton` takes
      // away: a name a screen reader can read (the host strips `aria-label` and
      // `aria-describedby`, per the handover's table) and a HOST THAT CAN HOLD
      // FOCUS, because cancelling search has to hand focus back to it and
      // `ion-button`'s focusable element is a native button inside its shadow
      // root. Measured: `.focus()` on the host did nothing at all. The bell in
      // OpsPage is a plain button beside it for its own stated reason, so this
      // is the established shape rather than a new one.
      // READY ONLY, like every other control on this surface. They all narrow a
      // list, so when the list did not arrive none of them can do anything —
      // and the phone's magnifier outlived the tabs because it lives in the
      // title row rather than in the band. A control that cannot do anything is
      // the defect this effort has now recorded three times.
      headActions={load.status === "ready" && !wide && !searchOpen ? (
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
      // THE CONTROL ROW SHARES THE WHITE BAND WITH THE TITLE. It used to be a
      // card sitting on the page below the header; the owner's mock makes the
      // two one block, which is also what gives the tab indicator a rail to sit
      // on — a strip floating inside a card is a decorated pill, not a tab.
      // ── THREE STATES, AND ONLY ONE OF THEM IS A PLACEHOLDER ────────────────
      // LOADING holds the row's space: the row lives in the band, so rendering
      // it only once the queue arrived grew the band by a row at that moment
      // and shoved the whole list down — the exact jump the skeleton exists to
      // prevent, one level above the skeleton. The tabs cannot be drawn for
      // real there because their counts would have to be invented.
      //
      // FAILED gets NOTHING, and the distinction is the point. A skeleton is a
      // promise that something is on its way; beside a message saying it is not
      // coming it is the screen contradicting itself, and the shimmer is the
      // half that catches the eye. There is also nothing to filter — offering
      // three tabs over a list that failed to arrive is a control that cannot
      // do anything. `load.status !== "ready"` collapsed these two states into
      // one and shipped the first one's placeholder into the second.
      controls={load.status === "loading" ? (
        <div className="pq-controls" data-wide={wide}>
          <IonSkeletonText animated className="pq-controls__ghost" />
        </div>
      ) : load.status === "error" ? undefined : (
        <div className="pq-controls" data-wide={wide}>
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
          {/* THE RIGHT-HAND GROUP IS "NARROW WHAT IS IN THIS VIEW"; the tabs on
              the left choose WHICH view. Two jobs, two ends of the row, and the
              gap between them is what says they are different kinds of control.
              NO BOX ON THE FUNNEL. I argued for one — tabs are unboxed labels,
              so an unboxed icon beside them could read as a fourth tab — and
              the owner overruled it: "surely it does not need to stand out and
              drag all the attention to it". He is right about the weight. It is
              a way in to a rarely-used refinement, not a peer of the three
              things you actually switch between, and a bordered square beside
              three quiet labels was the loudest thing on the row. What keeps it
              out of the tab set is that it is a GLYPH among words, plus the gap
              and — at the desk — the search field between them. */}
          <div className="pq-tools">
            {/* At the desk the field is permanent — there is room, and a
                reviewer who has to reveal a search first pays a tap for every
                phone call. On the phone it lives in the title row and is
                revealed, because the row it would otherwise add is a row of
                the list. */}
            {wide && searchField}
            {/* The funnel carries a count of what is on. Without it a filtered
                empty list is indistinguishable from an empty queue — the
                difference between "nothing to do" and "you cannot see the
                work". */}
            {/* THE BUBBLE IS A SIBLING OF THE BUTTON, not a child of it, and
                that is geometry rather than tidiness. Slotted into
                `ion-button` it lands inside `.button-native` — so a negative
                offset resolves against Ionic's inner element, and the badge
                came to rest INSIDE the button's own footprint however far it
                was pushed (measured: `right: -0.5rem` put its right edge 2px
                short of the host's). Outside the button, in a wrapper that is
                the positioning context, it straddles the corner the way it is
                drawn — clear of the funnel it is counting. */}
            {/* THE WRAPPER TAKES THE CLICK TOO, and that is the price of a
                bubble that overhangs: the part sticking past the corner is
                not the button, and the wrapper is sized to the button — so a
                press on the overhang reached NOTHING, sitting exactly where a
                thumb aims for the corner of a control. The badge accepts the
                press and it bubbles to here, which makes the whole visible
                shape one target. The button underneath is still the real control and
                the only thing a keyboard or a screen reader ever sees, so
                this adds hit area and no second affordance; a press on the
                button bubbles here as well and opens a sheet that is already
                opening, which is the same state. */}
            <span
              className="pq-funnel-wrap"
              onClick={() => setSheetOpen(true)}
            >
              <IonButton
                fill="clear"
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
              </IonButton>
              {activeRefinements.length > 0 && (
                <IonBadge
                  className="pq-funnel__count"
                  data-testid="queue-funnel-count"
                  aria-hidden="true"
                >
                  {activeRefinements.length}
                </IonBadge>
              )}
            </span>
          </div>
        </div>
      )}
      headOverlay={load.status === "ready" && !wide && searchOpen ? (
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
          {/* NO STATUS PANEL, AT EITHER WIDTH. It was the desktop drawing's
              and the owner has now removed it from that drawing too. Every
              number it carried is still a control on this screen: three are the
              chips, and `Ready to issue` is in the funnel — so what it cost was
              a band of page above the work, and what it bought was a second
              path to the same four queries. `headlineStats` is deleted rather
              than left unrendered: a selector nothing calls is the kind of dead
              code that reads as live. */}
          {/* WHICH refinements are on, not just how many. A count tells you the
              number of filters and still leaves you guessing which row went
              missing and why. */}
          {(attentionLabel || activeRefinements.length > 0) && (
            <div className="pq-active" data-testid="queue-active-filters">
              <span className="pq-active__names">
                {/* THE PREFILTER IS A CHIP, THE REFINEMENTS ARE TEXT. They are
                    not the same kind of thing and the strip should not read as
                    though they are: the prefilter is the set the reader was
                    sent here for and the only thing on screen explaining a
                    short list under a lit `All`, while a refinement is
                    something they turned on themselves and can see in the
                    funnel. The sage wash is the console's "this is on" colour,
                    redundant to the name it carries. */}
                {attentionLabel && (
                  <span className="pq-flag" data-tone="brand">{attentionLabel}</span>
                )}
                {activeRefinements.length > 0 && (
                  <span>
                    {attentionLabel ? `+ ${activeRefinements.join(" + ")}` : activeRefinements.join(" + ")}
                  </span>
                )}
              </span>
              <IonButton
                fill="clear"
                size="small"
                // The prefilter's Clear is the one exit back to `Needs us`
                // (design §3.3 point 4, P6) — refinements and search included.
                // With no prefilter on, today's refinements-only clear stands.
                onClick={() => setQuery((q) => (q.attention ? EMPTY_QUERY : { ...q, refinements: [] }))}
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

/**
 * A skeleton OF THE COMING SHAPE, never a spinner — R-161, and the boundary
 * document's own ruling on `IonLoading`.
 *
 * ONE BLOCK, because the list is one surface at both widths — the phone's cards
 * are a single elevated block with hairlines between the rows, exactly as the
 * desk's table already was. The control row is NOT part of this promise any
 * more: it lives in the white band, and the band holds its own space while the
 * queue loads.
 *
 * THE HEIGHTS ARE MEASURED, not chosen. A skeleton is a promise about the
 * layout that is arriving, which is a way of being wrong a spinner cannot be:
 * every pixel of difference is a jump at the moment the data lands, on the
 * surface whose whole argument for a skeleton is that nothing moves. The
 * numbers below are read off the arrival view — `Needs us`, so pre-issue cards
 * on our own desk, which carry the `Needs review` chip and are the TALL
 * variant. A row with no chip is shorter, and the placeholder overstates it on
 * purpose: overstating settles the list upward into space it already held,
 * understating drops it downward past whatever the reader was about to touch.
 *
 * `scripts/tests/web/ops2-projects.spec.ts` checks every edge against four
 * served rows, so changing the card's anatomy fails there rather than shipping
 * a jump.
 */
function QueueSkeleton({ wide }: { wide: boolean }) {
  return (
    <div className="pq-skeleton" data-testid="queue-skeleton" aria-busy="true">
      <IonSkeletonText animated style={{ height: wide ? "305px" : "560px" }} />
    </div>
  );
}
