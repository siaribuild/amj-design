# ops2-attention-prefilter

A count on the Attention gate must open **exactly what it counted**.

Pressing "1 ready to issue" must land on a Projects queue showing that one
project. Today it lands on every project waiting on us. Same defect on "new
submissions", "being priced" and "awaiting payment": all four link to a broad
`?wait=` axis rather than to their own set.

## Actors and needs

**The owner and the estimators**, opening the console between other tasks. The
governing constraint is unchanged and is the owner's own: *"we can't afford
waiting the whole day to open the request in the evening — that's the day
lost."*

What the gate is for (`ops2-attention` run, G1, binding): it says what needs a
person and sends them to it. A row that reports a number and then opens a
different set fails at the only job it has. In the owner's words when he saw it
live: *"if there, for example, '1 ready to be issued' then clicking it must
prefilter exactly that."*

## How this defect happened, because the fix has to close the hole too

Not a missed case — a reported one, twice, and then argued away.

1. The `ops2-attention` spec's **criterion 9 originally said the right thing**:
   the row opens the queue "already filtered to the set that row counted".
2. The build's task told the developer to assert **"the Needs-us chip is lit"**.
   That is a chip, not a set — and `Needs us` is the queue's own default, so the
   test passed with the entire mechanism deleted. Codex found that; the fix
   changed it to assert the *Customer* chip. Still a chip.
3. The architecture review raised it: *"'4 new submissions' may open 100
   unrelated Needs-us jobs."* Codex raised it as **High — project rows open
   wrong set**.
4. **Criterion 9 was then rewritten to match the code**, with a paragraph
   explaining why the weaker promise was correct. The code never moved.

The edit landed in `docs/`, which Probity exempts and should — a document cannot
be red. Probity's scope has since been widened to `src/ops2/**` (`4a1acc69`),
which would have held the *implementation* to a failing test, but the deeper
lesson is the one this run must not repeat:

> **A criterion is only real once an assertion proves it.** "Covered" today means
> a task *declared* the criterion. It must mean a test *fails without* the
> behaviour.

## Settled — these are conclusions, not options

- **P1 — THE COUNT AND THE LIST ARE ONE COMPUTATION.** Not "two paths that
  agree" — one selector, used to produce the number and to filter the list. This
  is the rule `queue.ts` already states for its own chips, applied across the
  two surfaces.

- **P2 — THE COUNTS MOVE TO THE QUEUE'S OWN DATA.** The four project counts stop
  coming from `/api/ops/summary` (one SQL row) and are derived from
  `GET /api/ops/projects` — the same endpoint, rows and selectors the queue
  filters. That endpoint already carries every field needed; verified before
  writing this ask (`worker/routes/ops.ts`):

  | row | predicate, from fields the endpoint already returns |
  |---|---|
  | new submissions | `statusCustomer === 'submitted'` |
  | being priced | `statusCustomer === 'under_review'` |
  | ready to issue | `issuable` — the issue gate's **own** answer (`issuableNow`) |
  | awaiting payment | `orderStage` in `deposit_invoiced`, `balance_invoiced` |

  **No worker change is required.** If the design finds one is, that is a
  finding to raise, not to implement quietly.

- **P3 — THIS ALSO KILLS A HIGH THAT WAS PARKED.** The old "ready to issue"
  count came from summary SQL (`status_internal` in two values, no unresolved
  lines) while the real gate `issuableNow` additionally requires parent lines and
  settled delivery. So the count could promise work that issuing would refuse.
  Reading `issuable` makes the count the gate's own verdict and the discrepancy
  disappears rather than being documented.

- **P4 — ENQUIRIES AND TRADE ARE UNCHANGED.** They keep their `/api/ops/summary`
  counts and link to their destinations. They are not queue filters and must not
  be forced into one.

- **P5 — THE QUEUE'S DEFAULT IS UNTOUCHED.** Arriving at `/projects` any other
  way still opens on `Needs us`. Only an Attention row's link sets a filter.

- **P6 — THE URL NAMES A CONTROL THE QUEUE HAS** (carried from G7, still
  binding). Not a query language. Whatever the four filters are called, each is
  a real control a reader can see is on and can turn off — otherwise they land
  filtered with no way back except retyping the address.

## The acceptance criterion this run exists to satisfy

Restored to its original strength, and it must be proved by an assertion that
fails without the behaviour:

> **Given** an Attention row reporting a count of N, **When** Staff presses it,
> **Then** the Projects queue opens showing **exactly those N projects** — the
> number pressed and the number listed are equal, and the control that produced
> the filter reads as active.

A test asserting a chip is lit does **not** satisfy this. The assertion must
compare the count on the row to the number of rows in the list.

## Facts the pipeline should not rediscover

- `GET /api/ops/projects` returns `statusCustomer`, `statusInternal`,
  `orderStage` and `issuable` per row (`worker/routes/ops.ts` around lines 409
  and 436). All four predicates above are expressible client-side today.
- `queue.ts` already owns `selectProjects`, `WAIT_CHIPS`, `REFINEMENTS` and
  `chipFromSearch`, and already has a `ready` refinement reading `r.issuable`.
- `ProjectsPage` consumes `?wait=` once, guarded on its own pathname, then
  strips it (`de30af43`). Extend that grammar; do not invent a second one.
- Attention's model is `src/ops2/attention/attention.ts`; its counts arrive via
  `useSummary.ts`. Both are now inside Probity's scope.
- A browser suite that signs in needs its own staff mailbox row in
  `scripts/db/seed.sql` — `u_staff7` belongs to `ops2-attention.spec.ts`.
- The local seed is thin (1 submission, 0 ready to issue). A test proving
  count-equals-list needs seeded rows that make each predicate non-empty and,
  critically, **non-identical** — if every predicate returns the same set, a
  broken filter still passes.
