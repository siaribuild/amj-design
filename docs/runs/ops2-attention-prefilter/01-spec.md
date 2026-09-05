# Spec — ops2 attention prefilter

Source: `docs/runs/ops2-attention-prefilter/00-ask.md` (grill conclusions P1–P6 present and treated as decided).

## 1. Problem and actor

**Actor: Staff** — the owner and the estimators, opening the console between other tasks.

In their terms: *"we can't afford waiting the whole day to open the request in the evening — that's the day lost."* The Attention gate exists to say what needs a person and send them straight to it. Today a row reports a number and then opens a different set: pressing "1 ready to issue" lands on every project waiting on us. The reader must then re-find the one job by eye, which is the work the gate was supposed to remove. In the owner's words on seeing it live: *"if there, for example, '1 ready to be issued' then clicking it must prefilter exactly that."*

Four rows are affected — **new submissions**, **being priced**, **ready to issue**, **awaiting payment**. All four link to a broad `?wait=` axis instead of their own set.

Second, smaller problem, closed by the same change: the "ready to issue" count came from summary SQL that asks a weaker question than the issue gate itself, so the count could promise work that issuing would refuse.

Binding conclusions carried from the grill, restated so nothing is re-litigated:

- **P1** One selector produces both the number and the filtered list. Not two paths that agree.
- **P2** The four project counts derive from `GET /api/ops/projects` rows, not `/api/ops/summary`. Predicates: `statusCustomer === 'submitted'`; `statusCustomer === 'under_review'`; `issuable`; `orderStage` in `deposit_invoiced` / `balance_invoiced`. **No worker change is required** — if the design finds one is, that is a finding to raise, not to implement quietly.
- **P3** "ready to issue" reads `issuable` — the issue gate's own verdict.
- **P4** Enquiries and Trade rows are unchanged: summary counts, their own destinations.
- **P5** The queue's default is untouched; only an Attention row's link sets a filter.
- **P6** The URL names a control the queue has — a real control the reader can see is on and can turn off.

## 2. Acceptance criteria

Seed precondition for 1–6: the four predicates must yield **non-empty and non-identical** sets. If every predicate returns the same projects, a broken filter still passes.

### Count equals list

1. **Given** the Attention gate showing "new submissions" with count N, **When** Staff press that row, **Then** the Projects queue opens listing exactly N project rows, and every listed project has `statusCustomer === 'submitted'`.
2. **Given** the Attention gate showing "being priced" with count N, **When** Staff press that row, **Then** the queue lists exactly N project rows, and every listed project has `statusCustomer === 'under_review'`.
3. **Given** the Attention gate showing "ready to issue" with count N, **When** Staff press that row, **Then** the queue lists exactly N project rows, and every listed project is `issuable`.
4. **Given** the Attention gate showing "awaiting payment" with count N, **When** Staff press that row, **Then** the queue lists exactly N project rows, and every listed project has `orderStage` of `deposit_invoiced` or `balance_invoiced`.
5. **Given** any of rows 1–4 with count N, **When** Staff press it, **Then** at least one project that the *other three* predicates match is absent from the list (proves the filter narrowed, not merely rendered a default).
6. **Given** a project counted by "new submissions", **When** its `statusCustomer` moves to `under_review` and Staff reload the gate, **Then** the "new submissions" count drops by one and its list omits that project, and the "being priced" count rises by one and its list contains it — no reload of any other surface required.

### The gate's verdict, not a proxy for it

7. **Given** a project whose `statusInternal` would have satisfied the old summary SQL but whose issue gate refuses it (unresolved lines, missing parent line, or unsettled delivery), **When** Staff read the Attention gate, **Then** it is neither counted in "ready to issue" nor listed when that row is pressed.
8. **Given** a project the issue gate accepts (`issuable` true), **When** Staff press "ready to issue", **Then** it is both counted and listed.

### The control is visible and reversible (P6)

9. **Given** Staff arrived at the queue by pressing an Attention row, **When** the queue renders, **Then** a queue control corresponding to that row reads as active and is nameable on screen.
10. **Given** Staff arrived by pressing an Attention row, **When** they turn that control off, **Then** the queue returns to its default `Needs us` set and the address no longer carries the filter.
11. **Given** Staff open `/projects` by any other route (navigation, bookmark, back from a record), **When** the queue renders, **Then** it opens on `Needs us` with no Attention filter active (P5).
12. **Given** the address carries an unknown value for the filter parameter, **When** the queue loads, **Then** it renders its default set without error and claims no filter is active.

### Rows that are not queue filters (P4)

13. **Given** the Attention gate showing the Enquiries and Trade rows, **When** Staff press either, **Then** each opens its existing destination, unchanged by this work.

### Absence and failure

14. **Given** a predicate matches zero projects, **When** the gate renders, **Then** that row is not drawn at all (zero is absence, never a pressable "0").
15. **Given** `GET /api/ops/projects` fails or returns an error, **When** the gate renders, **Then** the four project counts are drawn as failure — never as zero, and never as a pressable row claiming a set.

### The assertion must be real (the reason this run exists)

16. **Given** the test suite for criteria 1–4, **When** the filter mechanism is disabled (the queue ignores the filter the row sets), **Then** those tests fail. A test asserting only that a chip is lit does not satisfy this.
17. **Given** the finished feature diff, **When** it is inspected, **Then** the
    only change under `worker/` is the two additive row-DTO fields approved in
    `DECISIONS.md` D1 — `statusCustomer: r.status_customer` and
    `orderStage: r.order_stage ?? null` in the `GET /api/ops/projects` map — and
    nothing else under `worker/` is touched.

    AMENDED, and the distinction from the last run matters. The ask claimed no
    worker change was needed; the architect checked and it was false (the fields
    are consumed locally by `lifecycleOf()` and never reach the DTO). P2's own
    instruction was to RAISE that rather than route around it, which is what
    happened. This widens the permitted scope by two lines after the finding was
    surfaced and approved — it does not weaken a behavioural promise to fit code
    already written. Criteria 1-4 are untouched and remain the point of the run.

    A worker change beyond those two fields is still a finding for the user, not
    a silent implementation.

### Abuse cases — executed for real by the tester

The ops console exposes customer identities, project values and commercially sensitive pricing. Staff-only, no exceptions.

18. **Given** a signed-out browser, **When** it opens the queue address carrying an Attention filter, **Then** it is sent to sign-in and no project data is rendered.
19. **Given** a signed-in **Customer** session, **When** it calls `GET /api/ops/projects` (with or without filter parameters), **Then** the response is 401/403 and carries no project rows.
20. **Given** a signed-in **Manufacturer partner** session, **When** it calls `GET /api/ops/projects`, **Then** the response is 401/403 and carries no project rows.
21. **Given** any non-Staff session, **When** it requests the Attention summary endpoint, **Then** the response is 401/403 and carries no counts.
22. **Given** Staff hand-edit the filter parameter to an injected value (SQL fragment, script payload, oversized string), **When** the queue loads, **Then** it renders its default set, executes nothing, and no error message echoes the payload back into the page.

## 3. Edge cases

- **Overlap between rows.** A project may satisfy two predicates at once (e.g. `under_review` and `issuable`). Each row counts and lists its own predicate independently; no de-duplication across rows.
- **Row count vs page size.** "Exactly N listed" is the count of projects in the filtered set. Tests must seed below any page limit so the comparison is a straight one.
- **A project that changes state between the gate render and the press.** The list is authoritative; a one-off mismatch caused by a real state change is not a defect, and no criterion may be written that requires the gate to be re-fetched on press.
- **GST / money display:** not touched. No price is added, removed, or reformatted by this feature.
- **Seed:** the local seed is thin (1 submission, 0 ready to issue). Rows must be added — including a staff mailbox row of its own for any browser suite that signs in (`u_staff7` belongs to `ops2-attention.spec.ts`).

## 4. Out of scope

- Any change under `worker/` — routes, SQL, endpoint shapes (P2).
- The Enquiries and Trade rows' data source or destinations (P4).
- The queue's default filter, its chip vocabulary beyond what these four rows need, and any new ops control panel or view.
- Adding, removing or reordering Attention rows.
- Changing what `issuableNow` decides — this feature reads the gate's verdict, it does not tune it.
- `/api/ops/summary` itself: it keeps serving Enquiries and Trade. Removing its now-unused project counts is a later lean-out pass, not this run.

## 5. Assumptions

- **ASSUMED:** Rows may overlap — one project can be counted by two rows — and that is correct, not a bug to hide.
- **ASSUMED:** The four filters are surfaced through the queue's **existing** chip/refinement controls, extended where a predicate has no control yet. No new ops control surface, no second URL grammar: extend the one `ProjectsPage` already consumes.
- **ASSUMED:** "Exactly N" is compared against the filtered set's total; tests seed under the page size rather than the feature adding pagination logic.
- **ASSUMED:** `/api/ops/summary` keeps returning its project counts (now unread by Attention). Deleting them is deferred, not done here.
