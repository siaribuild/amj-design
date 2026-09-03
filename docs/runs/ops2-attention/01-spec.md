# ops2 Attention — spec

Stage 1 (product). Grill output: `docs/runs/ops2-attention/00-ask.md` (scoped grill,
held in the working session; standing conclusions in
`docs/ops-redesign/GRILL-CONCLUSIONS.md` remain binding, D12 in particular).
Grill conclusions G1–G8 are decided and are not reopened here.

---

## 1. Problem, and the actor it serves

### Actor

**Staff** — the owner and the estimators (`CONTEXT.md` §Actors: Staff; Estimator
persona), opening the ops2 console between other tasks, on a desk at 1440 and on
a phone.

### The need, in their terms (carried from the grill's actors-and-needs, verbatim)

- The governing constraint is the owner's own: "we can't afford waiting the whole
  day to open the request in the evening — that's the day lost." A count that is
  one glance away is worth more than a screen that is complete.
- To be told what is waiting, not what has happened. "The dashboard, as a landing
  page, should surface actions needed to be performed by us, or information of
  critical importance […] Not fussed about anything non-critical such as the
  amount of money we made in total." (D12.)
- To be able to trust an empty screen. A screen that says nothing is waiting when
  in fact nothing could be counted is worse than one that failed loudly: the
  person closes the laptop.
- To get from a count to the work in one press, and land somewhere the work is
  actually visible.

### Problem

ops2 has no landing surface. The legacy `Dashboard` in `src/ops/OpsApp.tsx` is a
flat six-row list plus a "shop" block of permanently-present numbers, and it
renders a total database failure as "Nothing is waiting on us." — the most
reassuring possible lie on the one screen whose job is saying something is
waiting.

Attention is the console's **gate**: it says which area needs the reader, with
the counts of what is waiting behind it, and sends them there. It is not a
metrics dashboard and never a working area (G1). It carries no action that
changes data (G1); a row leads, it never acts (G3).

This is **not a parity pass**. The legacy screen's six counts are the starting
content because they are what has data today (G1b); nothing else about that
screen is carried across.

### Structure (G1a — this is the structure, not a layout suggestion)

One group per ops2 destination, the group is the door, and the counts inside it
are the detail of the answer "which area needs me":

| group | counts it carries today | source field on `/api/ops/summary` |
|---|---|---|
| Projects | new submissions · being priced · ready to issue · awaiting payment | the four project counts |
| Enquiries | nobody has replied | the unanswered-enquiries count |
| Customers | trade applications waiting on a decision | the trade-applications count |

---

## 2. Acceptance criteria

Every criterion is Given–When–Then and independently walkable.

### Counts and grouping

1. **Given** a signed-in Staff account and a summary response in which every one
   of the six counts is greater than zero, **When** Staff opens the Attention
   destination, **Then** three groups are drawn — Projects, Enquiries, Customers
   — Projects carrying its four counts and Enquiries and Customers one each, and
   each count's number equals the value the endpoint returned.

2. **Given** a summary response, **When** Attention renders, **Then** it renders
   each count using the shared row component (`src/ops2/chrome/RowList.tsx`) and
   the shared page frame (`src/ops2/chrome/OpsPage.tsx`) with an `<h1>` the
   console's focus manager can land on.

3. **Given** a summary response in which one count is zero, **When** Attention
   renders, **Then** no row is drawn for that count — not "0", not a dimmed row
   (G2).

4. **Given** a summary response in which every count belonging to one group is
   zero, **When** Attention renders, **Then** that group is not drawn at all,
   its header included, and the remaining groups render in their normal order
   (G2).

5. **Given** a summary response in which all six counts are zero, **When**
   Attention renders, **Then** no group is drawn and the console's shared empty
   panel (`.pq-empty`) is shown saying nothing is waiting.

6. **Given** the Attention surface, **When** a reviewer inspects the rendered
   rows, **Then** no row exposes any control that mutates data — no approve,
   assign, dismiss or mark-read (G1, G3).

7. **Given** the Attention surface, **When** a reviewer inspects the rendered
   rows, **Then** every drawn row is a link to a route that exists in
   `nav/destinations.ts`; no count is drawn without a door (G1).

8. **Given** the Attention surface, **When** a reviewer inspects it, **Then** no
   `Active orders` and no `Customers`-total figure from the legacy dashboard's
   second block appears anywhere on it (G5).

### Navigation out of a row

9. **Given** a drawn Projects count, **When** Staff presses its row, **Then**
   the app navigates to `/projects` with the queue already filtered to the set
   that row counted, and the queue's own `Needs us` default is untouched.

10. **Given** Staff has landed on `/projects` from an Attention row, **When**
    they look at the queue's controls, **Then** the control the URL named reads
    as active exactly as it would had they pressed it themselves — a lit wait
    chip or an existing funnel refinement — and clearing it returns them to the
    unfiltered queue (G7).

11. **Given** a URL filter value that no queue control can express, **When** the
    navigation test runs, **Then** it fails in node: the set of filter values
    Attention can emit is asserted against the queue's own `WAIT_CHIPS` /
    `REFINEMENTS`, so a filter that stops existing is a red test, not a dead
    link (G7.3).

12. **Given** a project count whose predicate differs from the predicate of the
    queue control that would otherwise be named (the summary's `ready_to_issue`
    versus the issue gate's `issuableNow`), **When** Staff presses that row,
    **Then** the row carries the wait axis alone (`?wait=…`), which both paths
    answer the same way — so the count and the list that opens cannot disagree
    by construction (G7, option (i)).

13. **Given** a non-zero count of unanswered enquiries, **When** Staff presses
    its row, **Then** the app navigates to `/enquiries`, which renders the
    console's placeholder root — the same treatment `/customers`, `/pricing`,
    `/files` and `/audit` already have, saying what the destination is for and
    that nothing is built there yet (G6).

14. **Given** a non-zero count of trade applications waiting on a decision,
    **When** Staff presses its row, **Then** the app navigates to the Customers
    destination.

### The Enquiries destination (G6)

15. **Given** the destination registry, **When** the app builds navigation,
    **Then** `enquiries` is present as a destination with an entry in
    `DESTINATION_ICON` (the type is `Record<DestinationId, string>`; a
    destination without a mark is a type error).

16. **Given** the phone tab bar, **When** nine destinations exist, **Then** the
    bar still shows exactly three destinations plus `More`
    (`TAB_DESTINATION_IDS` unchanged), and `enquiries` appears in the drawer's
    list and in the desk rail.

17. **Given** `scripts/tests/ops2-navigation.test.mjs`, **When** it runs, **Then**
    it asserts the destination list including `enquiries` and the unchanged tab
    set — updated with the entry, not around it.

### Failure, degradation, refresh

18. **Given** `/api/ops/summary` answers `degraded: true`, **When** Attention
    renders, **Then** the console's shared error panel (`.pq-error`) with a retry
    is shown in place of the rows and **no count is drawn at all**, not even ones
    that might be right (G8, G4).

19. **Given** the summary request fails outright (network error or non-2xx),
    **When** Attention renders, **Then** the same shared error panel with a retry
    is shown — a failed request and a degraded response are indistinguishable to
    the reader, and neither is silence (G8).

20. **Given** the error panel is shown, **When** Staff presses retry and the
    request then succeeds and is not degraded, **Then** the groups and counts
    render and the error panel disappears.

21. **Given** Attention is open and the request has not answered yet, **When**
    the surface renders, **Then** it shows the loading treatment already shared
    with the project queue, and the loading shape matches the shape that
    subsequently arrives.

22. **Given** Attention is mounted and Staff navigates away to another
    destination and back, **When** the page becomes visible again, **Then** the
    summary is re-fetched (`IonRouterOutlet` keeps the page mounted, so a mount
    effect runs once per document — the refresh is `ionViewWillEnter`), and a
    stale response from an earlier request never overwrites a newer one.

### Abuse cases — executed for real by the tester

The counts are staff-only operational data (project pipeline volumes, trade
application backlog). `/api/ops/summary` is an existing staff-gated endpoint;
these criteria pin that it stays gated and that Attention adds no unguarded path
to the same numbers.

23. **Given** a signed-in Customer account (not Staff), **When** it requests
    `GET /api/ops/summary`, **Then** the response is 403 and carries no counts.

24. **Given** a signed-out Visitor, **When** they request `GET /api/ops/summary`,
    **Then** the response is 401/403 and carries no counts.

25. **Given** a signed-in Manufacturer partner account, **When** it requests
    `GET /api/ops/summary`, **Then** the response is 403 and carries no counts —
    the counts include customer pipeline data a manufacturer must not read
    (`CONTEXT.md` §Manufacturer partner).

26. **Given** a non-Staff session, **When** it loads the ops2 Attention route
    directly by URL, **Then** no count is rendered and the surface does not fall
    back to zeros or cached values — it shows the console's existing unauthorised
    treatment.

27. **Given** any Attention response path, **When** the tester inspects worker
    logs for the request, **Then** no customer name, email or other record-level
    detail appears — Attention deals in counts only.

---

## 3. Out of scope

- **Any list of individual records on Attention.** A ranked list of actual
  projects with names and ages was offered to the owner and rejected under G1 —
  that is the Projects queue's job. `/api/ops/projects`,
  `/api/ops/enquiries` and `/api/ops/trade/applications` could serve it today;
  the option is closed by decision, not by data.
- **Any Enquiries list surface.** `/enquiries` is a placeholder root in this
  feature. Building the queue behind it is R5 (G6).
- **The "critically wrong" kind of item** (G1c). It is a distinct kind with its
  own weight in the design, and nothing is drawn for it now; no source exists
  until the areas that own it exist.
- **Any group for an area ops2 does not yet have a destination for** (G1b) — no
  catalogue-missing-pricing, no product conditions, however cheap the number
  would be to compute.
- **The legacy `Dashboard` in `src/ops/OpsApp.tsx`.** Not changed, not deleted,
  not kept in step.
- **Any new API endpoint.** The six counts already exist on
  `GET /api/ops/summary`.
- **Changing the project queue's own default filter or its controls.** Attention
  names existing controls; it does not add one.
- **Re-deriving Attention's counts through `selectProjects`** (G7 option (ii)) —
  not chosen; that endpoint cannot serve the enquiries or trade counts at all.
- **Any per-user personalisation, dismissal, snoozing, or read state.**

---

## 4. Assumptions (vetoable)

- **ASSUMED:** group order on the screen is Projects, Enquiries, Customers —
  most-work-first, and stable, so a group appearing or disappearing never moves
  the ones above it.
- **ASSUMED:** within Projects, the counts read in lifecycle order — new
  submissions, being priced, ready to issue, awaiting payment.
- **ASSUMED:** `enquiries` sits in the `workspace` section beside Customers in
  the destination order (the grill flags placement as design-proposed; this is
  the obvious reading).
- **ASSUMED:** the trade-applications row lands on the Customers destination
  root — which is itself a placeholder today — rather than waiting for a trade
  applications surface to exist. The count is real work waiting and G2 says draw
  it; the door leads to the area that owns it.
- **ASSUMED:** all four project rows use the wait axis alone (`?wait=…`) under
  G7 option (i), rather than only the mismatched ones, so one rule governs the
  group instead of a per-row exception the next reader must re-derive.
- **ASSUMED:** row copy is sentence-style and states the work, not the field —
  e.g. "4 new submissions", "1 nobody has replied to" — with the number leading
  so a phone read at a glance answers the question. Exact wording is the UX
  stage's, within this rule.
- **ASSUMED:** Attention is the console's landing destination — signing in lands
  here. (It is "the console's gate"; nothing in the grill states the default
  route explicitly.)

---

## 5. Notes carried for the later stages

- `projects/useProjectQueue.ts` holds the console's only
  fetch-with-lifecycle-refresh (one GET, a stale-response guard,
  `ionViewWillEnter`). Attention needs all three. Extract or copy is the
  architect's call; it must not be rediscovered.
- The seed keeps one staff mailbox per browser suite (`scripts/db/seed.sql`); a
  new Playwright suite that signs in needs a new row or it fails at its OTP and
  reports it as broken auth.
- `scripts/tests/web/ops2-projects.spec.ts:337` failed once at 390px (list
  21.875px off a 4px tolerance) during a reverted attempt. Unattributed — the
  tester confirms it against a clean base rather than treating it as this
  feature's.
