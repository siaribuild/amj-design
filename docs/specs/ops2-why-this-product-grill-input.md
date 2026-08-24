# "Why this product" — material for the grill

Input for `/mattpocock-skills:grill-me`. Not a spec, not a design, and not a
grill: it is the set of facts and contradictions the grill should chew on, so
the session is spent on decisions rather than on discovery.

Ask, verbatim: *"implement Why This Product panel in the line detail view.
Again, as per mock. Action item of this panel — is a new screen that has more
details on the recommendation, and alternative products aka ranking list.
Conceptually, again, as per mock. But grill this and (re)define the concept
based on the latest changes to recommendation model."*

---

## 1. The mock, and why it cannot be followed literally

`docs/mocks/ops2-r1-ionic-src/src/pages/LineJobs.tsx` (`WhyPage`) says so itself:

> Written against the owner's stated model — the cheapest product that matches
> the size and energy constraints. No weights, no ranking mechanics.

The model that shipped on 2026-08-20 (`ladder-v1`, `src/data/recommendation.ts`)
is a **filter-then-ladder**: hard filters eliminate, survivors are tiered by
requirement-relative thermal deviation, and the cheapest priceable candidate of
the best non-empty tier wins. The mock's two-valued world — *meets* / *fails* —
does not have the vocabulary for what the engine now emits.

The mock's shape survives. Its content model does not.

## 2. What the engine actually emits per candidate

`CandidateOutcome` (`src/data/recommendation.ts`), persisted to
`candidate_result.outcome_json` by `worker/lib/estimator/persist.ts`. Facts
only, never sentences — by design rule, the skin assembles all prose.

- **`tier`** — one of six, not two: `meets` · `within_tolerance` · `misses` ·
  `thermal_unknown` · `does_not_fit` · `excluded`.
- **`rank`** — null iff excluded. **`competing`** — was it in the set that
  competed on price.
- **`exclusions[]`** — `{constraint, detail}` where constraint is `operation` ·
  `dimensions` · `split_combinability` · `glazing_instruction` · `offerability`
  · `disabled` · `publication`. Structured facts, no prose.
- **`requirement`** — the caps **and `basis`**: `explicit_energy_report` ·
  `plan_derived` · `default_envelope` · `human_override`.
- **`thermal`** — figures, per-axis deviation, `worstAxis`,
  `normalisedDeviation` (null = unknown, *not* zero), `absoluteMiss`,
  `dataSource`.
- **`fit`** — `fits`, the dimensions, the limit envelope, and `breached[]`
  (`width` · `height` · `area` · `aspect`).
- **`price.deltaToSelected`** — candidate minus selected. Negative = cheaper
  than the pick. **Already computed and stored.**
- **`learned`** — dark. `applied: false` literal in this release.

Run-level (`SelectionOutcome`): `tolerance` (0.05, stamped per run),
`competingTier`, `status`, and **`withheldIncomplete[]`** — products that would
have been candidates but were withheld as incomplete, with their gap codes.

## 3. The contradictions the grill has to settle

**(a) Splits.** `LineBody.tsx` is emphatic: *"THE WHY PANEL DISAPPEARS ENTIRELY
— from the parent AND from every unit… the units' products were an ops decision
made in the split planner, not a machine recommendation."* That was true of the
old model. It is not true now: split make-ups **compete in the same ladder as
single units** (`SelectionResult.splits`, D7/AC-18), and `select.ts` exports
`parentRepresentative()` for precisely *"the honest runner-up to show beside a
split."* So a split now has a machine rationale — and the mock deletes the panel
that would show it.

**(b) The tolerance band is invisible in the mock.** When nothing meets, the
engine takes the cheapest within `best + 5%`. The mock renders that as *"closest
that fits — nothing met the cap"*, which describes a different rule. If the band
is not shown, a reviewer cannot tell a candidate that missed by a hair from one
taken because everything missed.

**(c) The mock has no excluded class at all.** Its list is chosen / meets /
fails. The engine's most explanatory output is *why a product was never in the
running* — wrong operation, breached dimension, withdrawn from sale. That is the
answer to "why not the one I expected", which is the question the screen exists
to answer.

**(d) "Price it" may be obsolete.** The mock fetches an alternative's price on
demand and warns it *"counts against the pricing meter"*. Every competing
candidate was already priced during selection, and `deltaToSelected` is stored.
Live re-pricing may now be a stale-price refresh rather than a first look.

**(e) `requirement.basis` is missing from the mock, and it may be the
highest-value fact on the screen.** The mock hardcodes *"the plan's window
schedule"*. The thermal assessment recorded on 2026-08-20 is that the **default
envelope band is biased the costly way** (4.0 against reports at 1.69–3.04). A
reviewer who cannot see that the cap was a default rather than a report cannot
catch the expensive case.

## 4. The constraint nobody has stated yet: most lines have no "why"

Traced 2026-08-24:

- `persistSelection` is called from exactly one place — `estimate.ts:302`,
  inside `runProjectEstimate`.
- `runProjectEstimate` is called from exactly one place — `ai/pipeline.ts:988`,
  inside the plan/schedule parsing run.

So a selection run exists **only for lines derived from a parsed plan or
schedule.** A line a customer configured by hand, or ops entered manually, has
no `selection_run`, no `candidate_result`, and no rationale of any kind.

The mock hides the panel for composites only. The real absence is wider, and the
grill needs a ruling: what does the line detail view show when there is nothing
to justify — the panel absent, or present and saying so?

Related: `outcome_json` arrived in migration 0055 (2026-08-20). Lines selected
before that have a `candidate_result` row but **no `outcome_json`** — the old
`score` / `score_components_json` columns instead, from a model that has since
been deleted. Same question, different cause.

## 5. Plumbing that does not exist yet

- **No read endpoint.** Nothing in `worker/routes/` reads `candidate_result`.
  The architecture doc lists *"`candidate_result` read endpoint"* as R3 work
  (`docs/design/ops2-architecture.md:55`) — unbuilt.
- **The join is indirect.** `quote_line` has no `opening_id` and no
  `selection_run_id`. The path is `quote_line` → `opening_instance` (via
  `opening_instance.quote_line_id`, or via `quote_line.ai_proposal_line_id` →
  `ai_proposal_line.opening_id`) → `selection_run.opening_id` →
  `candidate_result[]`. That exact disjunction is already in use at
  `worker/routes/ops.ts:1048-1050`.
- **`draft_order_line.selected_candidate_id` is written and never read** — by
  anything, anywhere.
- **Post-issue the link is weaker still.** `order_line` (0001) carries no
  reference to a candidate or a selection run, and the ops2 record switches to
  `order_line` once a project has an order (`worker/routes/ops.ts:554`).
- The corpus was reset by migrations 0055/0056 on 2026-08-20
  (`recommendation_outcome` 18 → 9). Whatever exists in production is small.

## 6. Questions the grill should answer

1. Who reads this screen, and what decision do they take away from it? The mock
   footer says *"Nothing on this screen changes the quote"* — is that still the
   ruling, given "Change the product" sits directly above it?
2. Splits — does the panel come back, per (a)?
3. What is shown when there is no selection run (§4) — and is that the common
   case or the rare one, in his experience?
4. Are excluded candidates shown, and how many? The full set can be large.
5. Is the tolerance band a user-facing concept, or an internal mechanic that
   gets translated into a sentence?
6. Does the alternatives list allow *acting* — switch the line to a runner-up —
   or is it strictly read-only in this step?
7. `requirement.basis`: is showing "this cap was a default, not your report" in
   scope here, or does it belong to the thermal work that is paused mid-frontier?
