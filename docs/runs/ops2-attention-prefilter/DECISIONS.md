# Decisions — ops2 attention prefilter

## D1 — P2's "no worker change" premise is false: two row-DTO fields are missing

**Finding.** The spec's P2 predicates for three of the four rows read `statusCustomer` and
`orderStage` off `GET /api/ops/projects` rows. Neither field is in that endpoint's response:
the SQL selects both (`worker/routes/ops.ts:385–388`) but the DTO map (lines 421–447) drops
them, serving only the derived lifecycle (phase / stateLabel / waitingOn). The spec itself
anticipated this: "if the design finds one is [required], that is a finding to raise, not to
implement quietly."

**Q:** Approve a two-field **additive** change to the `GET /api/ops/projects` row DTO —
`statusCustomer: r.status_customer, orderStage: r.order_stage ?? null` — and amend criterion 17
to "no `worker/` change beyond these two fields"?

**Recommendation: yes.** It is two lines on a staff-gated endpoint, over columns the query
already selects, exposing workflow state the record endpoint (`GET /api/ops/projects/:id`)
already serves to the same staff. Test-first in `scripts/tests/api.test.mjs` (task t1).

**If no:** the only worker-free routes are proxies — `phase === "Intake"` for "submitted"
(rides `status_internal`, a different fact) or matching `stateLabel` display strings for the
invoiced stages. Both re-create the count-promises-what-the-gate-refuses defect this run exists
to remove, so I would return criteria 1/2/4 to you as unachievable as specified rather than
build a proxy.

A: YES — approved, and the finding is correct against a claim the ask got wrong.

The ask asserted "no worker change is required" and cited `worker/routes/ops.ts`
around line 409. That line is real and it does name `statusCustomer` and
`orderStage` — but it is the argument object handed to `lifecycleOf()` INSIDE the
map. The fields are consumed locally to derive phase/stateLabel/waitingOn and
never enter the returned DTO. I read a grep hit and did not check which
expression it belonged to; the ask's "verified before writing this" was not
verified. Raising it rather than routing around it is exactly what P2 asked for.

APPROVED: the two-field additive change to the `GET /api/ops/projects` row DTO —
`statusCustomer: r.status_customer` and `orderStage: r.order_stage ?? null` —
and criterion 17 amended to "no `worker/` change beyond these two fields".

Grounds, in the order that matters:
  - It is additive on an endpoint already gated by `resolveStaff()`. No new route,
    no widened authorization, no new query — both columns are already SELECTed by
    the statement above the map.
  - It exposes no new fact to anyone: `GET /api/ops/projects/:id` already serves
    `statusCustomer` and `orderStage` to the same staff for the same projects.
    This adds no data class to the response, only to the list shape.
  - `?? null` on `orderStage` is load-bearing and must survive review: a project
    with no order has no stage, and `undefined` would vanish from the JSON, so a
    consumer could not tell "no order" from "field missing". The awaiting-payment
    predicate is a membership test on that value.
  - Test-first in `scripts/tests/api.test.mjs` as proposed. The assertion must
    pin BOTH fields present AND `orderStage: null` for an order-less project —
    absence and null are the two states this feature reads.

The alternative you set out is refused for the reason you give: a `phase ===
"Intake"` proxy rides `status_internal`, which is a different fact from
`status_customer`, and stateLabel matching compares display strings. Either would
recreate "the count promises what the gate refuses" — the defect this whole run
exists to remove. Building a proxy to avoid two lines would be trading the
requirement for the convenience.

SCOPE HOLDS OTHERWISE: no other worker change, and the four predicates stay
exactly as the ask states them. `issuable` in particular is already served and is
the issue gate's own verdict — do not re-derive it.
