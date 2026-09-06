# ops2-attention

ops2 Dashboard, first step. The Attention destination is **the console's gate**:
it says what needs doing and what is critically wrong, grouped by the area that
owns it, and sends the reader there. D12 binds — an attention surface, not a
metrics dashboard — and G1 below binds harder: it is a gate, never a working
area.

**THIS IS NOT A PARITY PASS, and an earlier version of this ask said it was.**
That framing was wrong and it was withdrawn by the owner after the first mock:
the legacy Dashboard/Needs Us is *"a rough throw away implementation"*, and a
faithful copy of it is *"a terrible design for a to-be proper dashboard"*. The
legacy screen's SIX COUNTS are the starting content because they are what has
data today (G1b), and nothing else about that screen is carried across — not its
flat six-row list, not its structure, not its lack of one.

## Actors and needs

**The owner and the estimators**, opening the console between other tasks — on a
desk at 1440 and on a phone. They are not browsing. They open it to answer one
question: *is there anything that needs me right now.*

What they need, in their terms:

- The governing constraint is the owner's own: "we can't afford waiting the
  whole day to open the request in the evening — that's the day lost." A count
  that is one glance away is worth more than a screen that is complete.
- To be told what is waiting, not what has happened. "The dashboard, as a
  landing page, should surface actions needed to be performed by us, or
  information of critical importance […] Not fussed about anything non-critical
  such as the amount of money we made in total." (D12.)
- To be able to trust an empty screen. A screen that says nothing is waiting
  when in fact nothing could be counted is worse than one that failed loudly:
  the person closes the laptop.
- To get from a count to the work in one press, and land somewhere the work is
  actually visible.

## Grill conclusions

Scoped grill, held in the working session rather than in its own pane. The
standing conclusions in `docs/ops-redesign/GRILL-CONCLUSIONS.md` are binding and
are not reopened here — D12 above in particular. What follows is what this
feature adds to them.

### Settled — WHAT THIS SURFACE IS

- **G1 — ATTENTION IS A GATE, NOT A WORKING AREA.** The owner's words, and they
  govern every other decision on this screen: *"Dashboard should not become
  working area; it's a gate, highlighting what needs to be done, or critical
  issues, leading to areas where work could be done indeed."*

  Three consequences, and they are not negotiable at the UX stage:
    - **Its unit is a COUNT, not an item.** It does not list individual records.
      A ranked list of actual projects with names and ages was offered and
      REJECTED — that is the Projects queue's job, and a landing page that did it
      too would be a second working area competing with the destination that owns
      the work.
    - **It offers no action that changes data.** No approve, assign, dismiss,
      mark-read. A row leads; it never acts.
    - **Every count leads somewhere real.** A number with no door is a dead end
      on a screen whose only purpose is getting you to the work.

- **G1a — GROUPED BY THE AREA THAT OWNS THE WORK, and the group is the door.**
  The owner asked for grouping "by what you'd do", inside the gate constraint —
  so the grouping axis is the DESTINATION, because on a gate "what you'd do" and
  "where you'd go" are the same question. One group per ops2 destination, each
  carrying the counts of what is waiting behind it:

    | group | counts it carries today |
    |---|---|
    | Projects | new submissions · being priced · ready to issue · awaiting payment |
    | Enquiries | nobody has replied |
    | Customers | trade applications waiting on a decision |

  This is the structure, not a layout suggestion. It is what makes the screen a
  gate rather than a list: the reader's first read is WHICH AREA needs them, and
  the counts inside a group are the detail of that answer.

- **G1b — IT GROWS BY AREA, AND ONLY WHERE THE AREA EXISTS.** A group appears the
  day ops2 has the destination that owns it, and not before. The owner, on scope:
  *"ops2 does not have products yet, so no point of adding information related to
  that into the dashboard."* So no catalogue-missing-pricing, no product
  conditions, nothing about an area with no ops2 door — however easy the number
  would be to compute. **The design must make adding a group cheap and make an
  absent group invisible**, because that is how this screen is expected to reach
  its full shape.

- **G1c — TWO KINDS OF THING WILL LIVE HERE, AND ONLY ONE HAS DATA TODAY.** D12:
  "actions needed to be performed by us, **or** information of critical
  importance". Work waiting is the first kind and is all this pass can draw. The
  second — something critically WRONG rather than merely waiting — has no source
  behind it until the areas that own it exist (G1b). The design accounts for it
  as a distinct kind with its own weight, and draws nothing for it now. It is not
  invented, and it is not designed around later.

- **G2 — PRESENT WHEN WAITING, ABSENT WHEN NOT — and this now applies to GROUPS
  as well as counts.** A count of zero is not drawn; a group with nothing waiting
  behind it is not drawn at all, header included. A permanent "0 pending" trains
  people to stop reading the screen, and an empty section header does it twice.

- **G3 — A row LINKS, it never ACTS.** Restated by G1 and kept here because it is
  the rule the legacy console broke.

- **G4 — A count that did not arrive is not a count of zero.** `/api/ops/summary`
  answers a failed query with every count at zero AND `degraded: true`
  (`worker/routes/ops.ts`). The legacy dashboard ignores that flag and renders a
  total database failure as "Nothing is waiting on us." — the most reassuring
  possible lie about the one screen whose job is saying something is waiting.

### Settled by the owner — the specifics

These were put to the owner and answered. They are conclusions, not options.

- **G5 — "The shop" IS DELETED.** (Reinforced by G1: a gate leads to work, and
  `Active orders` / `Customers` lead nowhere and wait for nobody.) The legacy dashboard's second block
  (`Active orders`, `Customers`) does not exist on ops2 Attention. Neither is
  work, neither is waiting, neither changes what anybody does next, and a
  permanently-present number is what trains people to stop reading a screen whose
  whole job is being read in two seconds. Both remain reachable from the
  destinations that own them.

- **G6 — ENQUIRIES BECOMES A NINTH DESTINATION, EMPTY FOR NOW.** The row is an
  ordinary linking row like every other; `enquiries` is added to
  `nav/destinations.ts` so the count has a real door, and behind that door is the
  PLACEHOLDER ROOT — the same treatment `/customers`, `/pricing`, `/files` and
  `/audit` already have, saying what the destination is for and that nothing is
  built there yet. **No list surface is designed or built in this feature**; that
  is R5. Nothing on Attention has to explain itself as a control that does not
  work, and no waiting work disappears from the screen built to stop work
  disappearing.

  Consequences the design stage carries rather than discovers:
    - The tab bar is capped at three destinations plus `More`
      (`TAB_DESTINATION_IDS`), and `More` is a verb, not a place. A ninth entry
      changes the DRAWER's list and the rail's; **the bar must not grow.**
    - `DESTINATION_ICON` is `Record<DestinationId, string>` — a destination
      without a mark is a type error, so the entry needs one.
    - Where it sits in the owner's order, and in which section, is proposed and
      FLAGGED by the design stage rather than buried. `workspace`, beside
      Customers, is the obvious reading.
    - `scripts/tests/ops2-navigation.test.mjs` asserts the destination list and
      the tab set explicitly. Both are updated with the entry, not around it.

- **G7 — ROWS CARRY THEIR FILTER INTO THE QUEUE, AND THE FILTER IS
  PRE-CONFIGURED, NEVER FREE-FORMAT.** Pressing a row opens `/projects` already
  filtered to the set the row counted; the queue's own `Needs us` default is
  untouched. The URL names a filter the queue ALREADY HAS AS A CONTROL — one of
  the three wait chips, or one of the funnel's existing refinements — and nothing
  else. It is not a query language. Three reasons, in the order they cost:

    1. A free-format URL is a SECOND FILTERING VOCABULARY. The moment it can
       express a state no control can show, it can express one no control can
       UNDO: a filtered list with no chip lit, no funnel bubble, and no way back
       to everything except retyping the address. `queue.ts` states the same rule
       one level down — every count on screen goes through `selectProjects`,
       because a number computed by a second path will eventually disagree with
       the list it predicts.
    2. Landing on a filtered queue must be indistinguishable from having tapped
       that filter yourself, which is only true if the URL set the thing the
       control sets.
    3. It keeps the surface closed: a set the navigation test can hold against
       `WAIT_CHIPS` and `REFINEMENTS`, so a filter that stops existing fails in
       node rather than as a dead link.

  **AND THE TRAP THAT COMES WITH IT, to be resolved by the design stage rather
  than discovered by the tester.** Attention's counts come from ONE SQL ROW
  (`/api/ops/summary`); the queue's chips and refinements are computed
  client-side over `GET /api/ops/projects` (`selectProjects`). Two paths — and
  for at least one pair they disagree BY CONSTRUCTION:

    - the summary's `ready_to_issue` is `status_internal IN
      ('estimator_assigned','technical_review_required')` with no unresolved
      lines;
    - the queue's `Ready to issue` refinement is the issue gate's own
      `issuableNow` (`worker/lib/issue.ts`), which ALSO requires delivery to be
      settled and lines to exist.

  So "1 quote is priced and ready to issue" can open the queue's Ready-to-issue
  filter and show none — the same defect as accepting the mismatch, arrived at by
  a more convincing route, and worse, because the screen now looks like it is
  filtering correctly. The design stage picks one and states which:

    (i) A row carries only a filter whose predicate is the SAME predicate its
        count came from. Where they differ it carries the wait axis alone
        (`?wait=…`), which the lifecycle answers for both paths. Cheapest, and
        enough for all four project rows. **Recommended.**
    (ii) Or Attention's counts stop coming from the summary and are derived from
        `GET /api/ops/projects` through `selectProjects`, making count and list
        agree by construction — but that endpoint cannot serve the enquiries or
        trade counts at all.

- **G8 — A DEGRADED SUMMARY SHOWS THE ERROR PANEL AND NO COUNTS.** When
  `/api/ops/summary` answers `degraded: true`, Attention shows the console's
  shared error panel with a retry, in place of the rows, and shows **no counts at
  all** — not even ones that might be right. Half a truth on this screen is the
  same lie in a smaller font. A failed request and a degraded response are
  indistinguishable to the reader, and neither is silence.

## Facts the pipeline should not have to rediscover

- `GET /api/ops/summary` (`worker/routes/ops.ts`) already returns all six counts
  plus `activeOrders`, `customers` and `degraded`. It is staff-gated (403) and
  degrades to zeros rather than 500-ing. **No new endpoint is needed for the
  counts this pass draws** — the six are already there, grouped by G1a rather
  than listed flat.

  It is worth knowing what was NOT chosen and why, so nobody re-proposes it:
  `/api/ops/projects`, `/api/ops/enquiries` and `/api/ops/trade/applications`
  already return the individual records with customer, age and state, so a ranked
  list of actual waiting items was buildable today with no new endpoint. It was
  offered to the owner and REJECTED under G1 — the gate does not do the
  destination's job. The endpoints are named here so that the option is
  understood to be closed by decision, not by data.
- The legacy surface being matched is `Dashboard` in `src/ops/OpsApp.tsx`.
- ops2 already has the pieces this needs: `chrome/OpsPage.tsx` (the page frame
  and the `<h1>` R-164's focus manager lands on), `chrome/RowList.tsx` (THE row
  and list component, per the owner's "the component is the same, the content
  within it differ"), and the `.pq-empty` / `.pq-error` panels that three
  surfaces already share.
- `projects/useProjectQueue.ts` holds the console's only fetch-with-lifecycle-
  refresh: one GET, a stale-response guard, and `ionViewWillEnter` as the
  refresh, because `IonRouterOutlet` keeps a page mounted so a mount effect runs
  once per document. Attention needs all three. Whether that is extracted or
  copied is the architect's call, but it must not be rediscovered.
- The seed keeps one staff mailbox per browser suite (`scripts/db/seed.sql`);
  a new suite that signs in needs a new row, or it fails at its OTP and reports
  it as broken auth.

## Note on this run

An earlier attempt in this session built this feature straight through with no
pipeline stages and no review gate. That work was reverted in full before this
run started; the branch was also fast-forwarded 1247 commits to `apertly/main`
(it carried no `src/ops2/` at all), and that stands.

One unattributed failure was seen during it and is worth the tester confirming
against a clean base: `scripts/tests/web/ops2-projects.spec.ts:337` ("the
skeleton is the shape that actually arrives, at both widths") failed at 390px
with the list 21.875px off a 4px tolerance. It may be pre-existing.
