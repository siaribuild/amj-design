# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 19**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`
(the line page, `Plate`, `SidePanel`, `Elevation` all exist and are reused, never rebuilt).

**Revision 19 corrects VIEW-AC-15**, which described a state its own subject cannot be in.
The criterion put the reference *"falling back to `Project` while the record has not
loaded"* — but the viewer's back control never renders in that state: its subject is only
built once the record has resolved a line. The developer implemented the fallback twice,
deleted the unreachable copy, and **said so rather than descoping it silently**. Executed
here before ruling: `src/ops2/projects/LinePage.tsx:124` builds the subject only with a
resolved `record`, and `LinePage.tsx:201` — the **page-level** control, where the pre-load
state is real — keeps `Project` untouched. **The criterion now says what is true**, and
names where the never-empty guarantee lives, because a fallback would have masked the pin
and made it look optional. Two stale citations of `LinePage.tsx:136` are corrected to
`:201` throughout; the file moved while the phase was being built.

**Revision 18 resolved a tension inside VIEW-AC-1 that the round-2 tester measured** — the
criterion was requiring two things that cannot both hold on a short wide screen, so no
implementation could satisfy it as written. Revision 16 required the drawing to grow with
**width**; revision 17 required the **caption** to be readable at every width. On a 2560×1080
ultrawide a landscape drawing grown to claim the width would stand taller than the screen,
putting the caption — and most of the drawing — below the fold. **The ruling: there is one
guarantee, not two — the whole drawing and its caption are visible together, and within that
the drawing is as large as the viewport permits.** Which dimension governs is whichever one
binds, and the `62vh` that governed it went the way the `720px` went in revision 16.
`ASSUMED:` §13.18; §13.16 is RETIRED as the wrong question.

**Revision 17** carried the owner's **veto of §13.17** — the canvas back control's label —
taken after the developer found a precedent nobody had checked: the line page's own back
control already names that same destination by its **reference**
(`src/ops2/projects/LinePage.tsx:201`, `label: record ? record.ref : "Project"`). The spec
had assumed the project's *title*, which would have given one destination two names in one
console. **VIEW-AC-15 requires the reference.**

**Revision 16** carried **two owner decisions taken at the Phase 2 tester gate**, plus the
tester's MINOR.

- **D11 — the desk-canvas enlargement journey now has criteria** (§8.1, VIEW-AC-13…17). It
  shipped in **no criterion and no interaction spec**: it was added at architect-conformance
  time (design §11.5) to satisfy VIEW-AC-5's "exactly one viewer", *after* §8 was written,
  and reached the tester unspecified and untested — the MAJOR. The owner's ruling: **back
  returns to the record**, the control **stops naming the line**, and the blank canvas on
  return is **fixed, not accepted**.
- **D12 — VIEW-AC-12 is reversed**: `ElevationLegend` is **deleted**, together with the
  assertion that pinned it. §13.13 becomes **VETOED**. The criterion is rewritten rather
  than quietly dropped, and all three of its states are kept — it has now flipped twice, and
  the record of *why* is worth more than a clean-looking criterion.
- **VIEW-AC-1 is made unambiguous** that "the largest size the viewport allows" is a
  **measurement**. The criterion was already correct in intent; the implementation capped the
  drawing at a flat 720px at every desk width, a number lifted from the mock's *simulated
  desk frame*. (Revision 18 finished the job: the replacement number is gone too.)

Revision 15 gave **every register entry a state** (§13) and discharged §13.14/§13.15;
revision 14 corrected VIEW-AC-12's false premise; revision 13 amended the CERT-AC-10 fence;
revision 12 folded in the importers; revision 11 closed VIEW-AC-2's mechanism; revision 10
folded in D8 and R31; revision 9 applied R29/R30 and added §2.1; revision 8 applied R28;
revision 7 corrected a false claim about an existing legend test; revision 6 applied the
closed UX mock gate; revision 5 repaired two architect findings; revisions 2–4 folded in the
owner's decision rounds.

**Decisions needed: one** (§14) — how much of the screen the drawing may claim, tagged
`ASSUMED:` §13.18 and going to the owner at acceptance with the rest of Phase 2. Nothing is
blocked on it.

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055
— the requirement and where it came from, every candidate's tier, rank, thermal figures,
fit and price — and **no route in `worker/routes/` reads either table**. The reasoning is
written to a database and never spoken.

The consequence lands at the **human review gate**, the stage between submission and
issue where a recommendation is confirmed or overridden. The person standing there
today either takes the machine's word or re-does the thermal comparison by hand. Neither
is a review. In the owner's words: *"I want to be able to audit recommendations and
accuracy of thermal modelling"* and *"the bigger vision is to surface most likely
alternatives hopefully making human's work easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead
`certified` flag — never asked for, wired to opposite default values in two places of the
Sanity schema — downgrades **13 of 32 products to "indicative estimate only" on every
thermally-constrained line**, while the other 19 pass untouched. A reviewer auditing
recommendations would spend their first week reporting that. **And the catalogue importers
write the flag back on every run**, so removing it from the documents without removing it
from them buys days, not a fix (§6, CERT-AC-12).

And a third gap, now the widest of the three: **a product's thermal performance is not
recorded on the line that uses it.** Not when a reviewer changes the frame or glazing, not
when a customer configures a line themselves, and not when a customer overrides what the
estimator proposed. The save paths store the product, the options and the price; the Uw
and SHGC that make the choice reviewable are looked up at selection time and dropped.
Under R3/D3 nothing may look them up at display time to recover them — so if a save does
not record them, they are gone.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel on the line detail view,
   and the detail **screen** it leads to — its own route (D8) — carrying the requirement
   and its origin, the chosen product against it, why it won, and the 3–5 next-best
   alternatives by ladder rank. Composites included (R14–R17), including the per-lite
   thermal bands that have been written on every split since migration 0036 and read by
   nothing. A **thinner panel** for lines nobody's estimator ever evaluated: no target, but
   the product's own figures (D6). **No action anywhere on it** (R28) — back is
   navigation, not an action (R29).
2. **The `certified` removal, depth (c)** — code, Studio schema, the values in the live
   documents, **the catalogue importers that would write them back**, and **the JSON
   snapshot builders whose source fields this removes** (R5, conclusions §5, design §2.6;
   CERT-AC-10's amendment). **Phase 1, and nothing else rides with it** (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7).** *Every* save that sets
   or changes a line's product or variant records that product's Uw and SHGC on the line —
   ops console and customer site alike. **A server write-path change, inside Phase 3.**
4. **A shared drawing viewer** for ops2 (R21, R25) — **a node in the navigation tree with
   its own route and a back control** (R31), replacing the line plate's current side-panel
   enlargement, **and reachable from the project record's desk canvas** (D11, §8.1).
5. **Two changes to the shared `SidePanel`** (R26, R29): full-screen presentation on the
   phone, and a **back** control in place of "Done" — without moving the Projects filter
   panel, which is the component's other caller and was not part of this approval.
6. **The line-route URL grammar** — the `exact` drop on the line route and the drawing
   segments — **in Phase 2, with the viewer**. Phase 3b adds only the `why` child. No new
   server endpoint anywhere except the rationale read.
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12) — added to scope at
   the Phase 2 tester gate, on evidence that it has no caller and no styles.

### Out of scope — and why

| Not built | Because |
|---|---|
| **"Change the product" — the control, and any placeholder for it** | **R28, and it is deferred rather than declined.** Owner: *"do not implement CTA change the product. Need to have more thoughts on how to implement this. Having a button implies that some product must be preselected, which we don't have conceptually. not having a button means another panel perhaps. ultimately, switching products is not part of the current run."* Supersedes D4. **Whoever picks this up is picking up an open design question, not an unbuilt ticket — see §2.1 for the direction it already has.** |
| **Re-classifying the Projects filter panel** | Under R31's literal taxonomy the filter is arguably **not a modal either** — it does not ask a question and return an answer. The architect raised this honestly rather than acting on it. R26/R27's approval explicitly excluded moving the filter, so it stays exactly as it is (WHY-AC-7b) and the question becomes **its own future ticket**. A taxonomy discovered mid-feature does not get to reach a surface nobody approved changing. |
| ~~**Deleting the shared `ElevationLegend` export**~~ | **NO LONGER OUT OF SCOPE — reversed by the owner, 2026-08-25 (D12).** The stated reason was that deleting the export was *"a separate decision nobody has taken"*. The owner has now taken it, on evidence that arrived after: zero callers **and** no `.elev-legend` rule in any stylesheet. See VIEW-AC-12 and §13.13. |
| **Renaming the dimension-rule `dataSource`** | `worker/lib/estimator/types.ts:77` uses the same token for a **different, live, correct** concept — where a dimension rule came from. It is not certification and it is not being removed; CERT-AC-3's predicate is deliberately narrow so a bare token match cannot force a rename of a concept that is fine. |
| Any line editor in ops2, stub or real | Follows R28: with no control to reach it, a route to it is a route to nowhere. |
| Any deep-link into the legacy ops console | Was D4's rejected alternative; moot under R28, and still not done. |
| Explanatory notation of any kind on a drawing surface | R25: *"i don't think lines like this relevant for ops"* — ops staff read elevations for a living. |
| Switching the line's product from the "Why" surface | R1: the surface is read-only. R28 strengthens this — there is now no route out of it except back. |
| Recording a verdict on the recommendation (`PATCH /api/ops/recommendation-outcomes/:id`) | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3: *"snapshot at the time of recalculation/save. Not extracted in real time."* |
| Re-deriving, re-resolving or recomputing a thermal **requirement** anywhere | R23: *"if AI calculates a target and selects a product, which is then overriden by a client -> that does not change the target."* |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | The R24 constraint: those are correct for routing and must stay. Provenance for display is **derived**, never re-stamped. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. A display feature may not make a save fail that succeeds today. |
| Any change to the ops routes' authentication or refusal convention | §10. This feature inherits the console's uniform refusal. |
| Any change to the learning corpus or the issue-time capture path | §7.6 — verified non-impact, deliberately untouched. |
| Live re-pricing, price deltas, or any money on the surface | R10, R3. |
| Excluded candidates, in any form — list, count, or reason | R9, verbatim owner ruling. |
| Backfilling anything — statuses, or figures onto lines saved before Phase 3 | R18 *"leave history"*; a backfill would be a display-time catalogue read wearing a snapshot's clothes. The owner accepted this cost explicitly (D5). |
| Carrying the rationale past issue (`order_line` gains no candidate reference) | D2. Its own ticket if ever wanted. |
| The staff role vocabulary (`estimator \| technical_reviewer \| manager \| admin`) | Conclusions §8: same defect class, own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Conclusions §1: persona ≠ role. R20 stands unchanged. |
| Any customer-facing **display** change | Staff surface only. The customer-side change is a write, never something a customer sees. |

### 2.1 Deferred — how product switching might work

> ⚠️ **DIRECTION, NOT REQUIREMENT. NOTHING IN THIS SECTION IS TO BE BUILT.**
> It has no acceptance criteria, no `ASSUMED:` tags and no phase. It exists so that
> whoever picks up switching inherits the thinking rather than restarting it. A
> developer finding this section has found context, not work.

The owner began sketching this after R28 and asked for feedback on it. His sketch,
verbatim:

> *"this should be a new panel for switching indeed: X is gone from this view; cards for
> options are clickable; a click leads to a new confirmation screen; the screen shows
> something about the new choice with confirm/cancel as CTAs."*

Six things came out of that conversation, worth keeping:

1. **The two-panel split resolves the snapshot/live tension rather than working around
   it.** Switching cannot be done off a snapshot: it would commit to a price from a past
   run, against a catalogue that may have moved, for an opening whose dimensions may have
   changed since. The confirmation screen is where live recalculation belongs — and the
   only place it belongs. **Audit panel = what we decided then. Switch panel = what is
   true now.** That boundary is *why* two panels is the right shape, and it is written
   down because a future reader may otherwise try to merge them for convenience.
2. **The switching list is probably not the audit list.** The audit list answers *"what
   did the ladder consider, and why did this win?"* — a historical set, correctly frozen
   (R3). A switching list answers *"what could this line be instead, today?"* Those sets
   genuinely differ: a candidate excluded then may fit now if the dimensions were
   corrected, and one that won then may since have been withdrawn. Reusing the frozen list
   would offer products that can no longer be supplied. Expect the switch panel to need
   its own query.
3. **Do not drop the dismiss from the switching panel.** Confirm/cancel on the
   *confirmation screen* is not a way out of the *panel* — cancel returns to the panel.
   The panel still needs its own exit, or it is a surface someone can enter and leave only
   by choosing something. (Under R29/R31 that exit is back, like every other node.)
4. **The confirmation screen has four things to show, and each is a reason to abort:**
   whether the new choice still meets the requirement, what the price becomes, whether the
   line drops out of `ready`, and that the line stops being platform-chosen (R24).
5. **The learning path already handles it.** An ops switch fails `sameCoreConfiguration`
   exactly as a customer override does, so the outcome lands `adjusted` / `pending` and
   never silently trains the ranker. Nothing new is needed — see §7.6, the verified
   non-impact.
6. **This is the decision surface the owner declined at grill Q1** (R1, R2: the audit view
   records nothing and decides nothing), returning properly separated instead of bolted
   onto the audit view. Not a reversal — a better answer than either option that was on
   the table then.

**Console convention it will inherit (R30).** Owner: *"modals have controls on top, btw,
title centered."* The confirm/cancel screen is a modal by the owner's own naming
(*"switch(modal aka Confirm/Cancel)"*) **and by the taxonomy R31 settled** (§5): it asks a
question and returns an answer. So its controls sit on top with the title centred. **No
modal exists in this feature** — the switch screen will be ops2's first.

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source
on these, and nothing below is inferred.*

**Two axes, and they are never to be merged** — owner ruling, 2026-08-24: *"let's not
confuse actor as in persona that has it's needs, and rbac enabled limitation what a
persona can do on the platform!"*

- **Persona** — who someone is and what they need.
- **RBAC** — what the platform permits them to do (R20; conclusions §8's role cleanup).
  Neither answers a persona question.

### Estimator (persona — new to the domain; the architect adds it to `CONTEXT.md`)

**`Estimator` is a persona and it has needs of its own** — owner: *"yes, estimator, as a
persona, has the needs. But that does not need to translate into a separate rbac role
with limited feature set, not at this point of time."* An Estimator's needs are served by
**showing them the right things**, not by fencing anyone else out. Today the persona is
performed by one of the two owners, because there is no separate estimator — a staffing
fact, not a model fact.

The need, in the owner's own terms:

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

Read together: **confidence in the platform's reasoning, and speed through the review** —
not correction of the machine. R2 is the direct consequence and the copy must honour it.

**They read this surface; they do not act on it.** Owner: *"the panel does not require
actions, unless an action is chosen, which is a separate screen anyway."* R28 is that
sentence carried to its end — see §9.5. **Going back is not an action** (R29): it is how
they leave a screen they navigated to. **And back must return them where they were, saying
where that is in the words they already use** — D11 and its label ruling are that same
sentence applied to the one journey nobody had specified (§8.1).

**And they already know how to read a drawing.** R25 is a fact about this persona, not a
styling preference: an elevation's notation is customer-facing explanation, and explaining
it to an estimator costs space and says the reader is a novice. **What they do need is to
see the whole of it at once** — which is what VIEW-AC-1's one guarantee protects.

### Customer (existing — newly relevant, via D6/D7)

A customer who configures a line themselves, or overrides what the estimator proposed,
picks a product with real thermal performance and no target to meet. The owner, on what
the reviewer should then see: *"human, as in client, manual picks do not have targets, but
showing panel with performance data is fine, I think. It simply means that this panel will
be far less rich in details."* And on what such an override means: *"a selection shall not
be perceived as AI-made anymore"* — while *"that does not change the target."*

The Customer is not a reader of this surface and gains nothing visible from it. What
changes for them is invisible: what their save *records*. The constraint that goes with
that is absolute — **their save must never start failing** (§7.2).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame
people. AMJ is manufacturer.**"* Staff work for **OpenFrame**, not AMJ. The glossary says
AMJ, and every later stage reads its vocabulary from that file.

### Manufacturer partner (an RBAC exclusion, recorded to close it)

Not a persona this feature serves. `hasAssignedRole` already refuses them
(`worker/lib/staff.ts:150`). Recorded because the consequence is sharper here than
anywhere else in the console: **this surface exposes which competing products were
considered and how they compared**, so a manufacturer partner reading it would be a
genuine competitive leak. The existing gate closes it. Nothing may loosen it — §10
executes it as an abuse case rather than trusting it.

### The stage: the human review gate

Between submission and issue, where the platform's recommendation is confirmed or
overridden. A stage in a quote's life, not a persona and not a role. Not named in
`CONTEXT.md` today; the architect should consider adding it.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

Three independently deployable phases, in this order. Pipeline stages 1–8 run **per
phase**, not once across all three. Phases 2 and 3 share one UX mock gate, now **closed**.

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Delivers on its own:** thermally-constrained lines stop being downgraded to "indicative
estimate only" because of a flag nobody asked for. 13 of 32 products rejoin the ladder on
the same footing as the other 19, and legacy variants that the catalogue loader silently
*dropped* (`catalogue.ts:187`) become candidates again.

**The importers are in this phase (design §2.6).** `import-wers.mjs:135` and
`derive-estimator-fields.mjs:112-113` write `certified`/`dataSource` back onto every row,
so stripping the documents without fixing them buys days: **a Phase 1 that ships with a
known expiry is not Phase 1.** After CERT-AC-6 the Studio schema no longer declares these
fields, so a post-strip import would write data the Studio can neither display nor
validate — an invisible, unvalidatable field re-appearing across the catalogue.

**And two JSON snapshot builders are in it, which breaches the fence — see CERT-AC-10's
amendment.** That is recorded there rather than smoothed over here, because a fence that
quietly widens to admit whatever arrived is not a fence.

**Deploy order, and it is enforced rather than trusted (CERT-AC-13, CERT-AC-14):**

1. worker code **plus the four importer edits**
2. Studio deploy (the schema stops declaring the fields — CERT-AC-6)
3. dataset export, verified restorable (CERT-AC-8)
4. strip dry-run
5. `sanity/scripts/strip-certified.mjs --apply`

**The strip is last, and final — not provisional on anything.** And it refuses to run from
a checkout whose own importers would undo it (CERT-AC-13), so a strip launched from a
stale branch fails at the point of harm rather than succeeding and expiring quietly.

**Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — The shared drawing viewer, **and the line-route URL grammar** (R21, R25, R31)

**Delivers on its own:** the element the owner rates highest in the product is readable at
full size from every ops2 surface that draws an opening as its subject; on a composite,
a unit can be examined alone, addressably.

**R31 changed what this phase is, and the architect's route ruling changed where its work
sits.** The viewer is not an overlay that opens and dismisses — it is a **node in the
navigation tree with a real route**. So this phase now owns:

- the **`exact` drop on the line route** and the whole child-route grammar under it;
- `/projects/:id/line/:lineId/drawing` and `/projects/:id/line/:lineId/drawing/u1`, `u2`, …;
- replacing the plate's `SidePanel` enlargement (VIEW-AC-6);
- **the project record's desk canvas as an opener surface, with its own back destination**
  (§8.1, D11 — added at the tester gate, revision 16);
- **the `ElevationLegend` deletion** (VIEW-AC-12, D12 — added at the same gate).

**Phase 3b then adds only the `why` child** to a grammar that already exists. That is the
sequencing change: the routing work is Phase 2's, not Phase 3's, and a phase description
or test plan that still places it in Phase 3 is stale.

**Why second:** still small, still client-only, still zero server surface — and now it also
lays the routing foundation Phase 3b builds on, which is a further reason not to reorder it
behind Phase 3.

### Phase 3 — the capture, the panel, the detail screen

**It is two kinds of change in one deployment, named separately here so neither is
discovered late:**

- **Phase 3a — a server write-path change (§7).** Every save that sets a line's product
  records what that product performs at, on both the ops console and the customer site.
  `worker/**`, so **Probity applies: the failing test comes first**. It carries the
  feature's only regression risk, and §7.2 is where that risk is pinned.
- **Phase 3b — a read-only display surface (§9).** The panel, and the detail screen at the
  `why` child route. R1: it changes nothing; WHY-AC-20 requires the whole interaction to be
  GETs; R28 removed the one control that would have led anywhere.

**Presentation and navigation model are separate things, and this spec specifies both.**

- **Presentation** — approved at the mock gate: a right-hand slide-out at desk width, full
  screen on the phone (R19, R26). Unchanged by anything since.
- **Navigation model** — settled by R29 and D8: the detail is a **screen in the tree** with
  its own route, `/projects/:id/line/:lineId/why`. It is **opened by a route change, not by
  `setOpen(true)`**, and left by back.

A developer must not infer the model from `SidePanel`'s current behaviour: that component
is driven by an `isOpen` prop today, and reusing its *presentation* does not mean reusing
its *control flow*. The ux-designer's interaction spec §4.1 draws the same line.

**The cost the owner accepted (D5):** the capture does not ship until Phase 3, and there
is no backfill, so **every line saved before Phase 3 has no figures** and shows the honest
absence (WHY-AC-9, WHY-AC-27). Lines saved after it do. Phase 1 stays clean in exchange.

**Sequencing inside the phase:** 3a lands first and alone — red test, then the write, then
its negative criteria green — before any read endpoint or UI work starts. Shipping the
capture even a few days ahead of the surface is worth more than tidiness: every save in
between is a line that will have something to show, and a save that is missed cannot be
recovered.

**Dependency check:** Phase 3 does not technically depend on Phase 1 — R5 keeps
certification off the screen either way. **3b now does depend on Phase 2** for the route
grammar; if the phases were ever reordered, that grammar travels with whichever ships
first. 3b depends on 3a for anything a human selected to have figures at all. **The
`SidePanel` changes (R26, R29) belong to whichever of Phase 2 or 3 ships first** — one
component edit, and shipping the detail against the old presentation would ship something
the gate did not approve.

### Wayfinder check

**Not needed.** The route is visible and the decisions are made — 31 rulings, twelve owner
decisions, a verified join path, a writer index the design owns, and a closed mock gate.
Three normally-sized features, not a foggy region.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label ·
R5 no certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen +
3–5 next best · R9 no excluded · R10 no price deltas · R11 human change shows both ·
R12 frame or glazing = changed · R13 no-run lines still show the panel · R14 panel on
machine-proposed composites · R15 split reason then per-lite bands · R16 per-lite bands
are real · R17 ops split = R13 · R18 leave history · R19 right-hand slide-out · R20 same
gate as the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** *"every save should record thermal properties of
selected at a time product."* One rule, every writer (§7.1).

**R23 — a target is not a selection.** *"if AI calculates a target and selects a product,
which is then overriden by a client -> that does not change the target."*

**R24 — an overridden selection must no longer read as platform-made.** *"a selection
shall not be perceived as AI-made anymore."* Attribution is **derived by comparison**,
never read from `origin`.

**From the closed UX mock gate:**

**R25 — no explanatory notation on an ops drawing surface.** Owner, on the symbol key
(solid-V / dashed-V / apex / arrow / unmarked): *"i don't think lines like this relevant
for ops"*. **This is a class, not a block.** What goes: anything that teaches the reader
how to read the drawing — the symbol legend, and the sentence explaining that panel widths
are proportional to each unit's real size. What stays: statements about the drawing's
**authority** rather than its notation — that mullion positions are confirmed at technical
review, and that an unsized opening is drawn as a stand-in.

**R26 — the phone detail opens full screen**, not as a partial bottom sheet.

**~~R27 — the dismiss control is an X, not "Done".~~ AMENDED BY R29.** Recorded rather
than overwritten, because the reasoning moved and that is worth reading later: R27 replaced
"Done" with an X on the understanding that the detail was an overlay to be dismissed. R29
says it is not an overlay at all. What survives R27 is that **"Done" is wrong** — it claims
a task was completed on a surface where nothing is done.

**R28 — "Change the product" is not implemented, and neither is a placeholder for it.**
*"do not implement CTA change the product. Need to have more thoughts on how to implement
this. Having a button implies that some product must be preselected, which we don't have
conceptually. not having a button means another panel perhaps. ultimately, switching
products is not part of the current run."* **Supersedes D4.** Direction for the deferred
work: §2.1.

**R29 — the detail is a screen in the navigation tree; its dismiss is a BACK control.**
Owner, verbatim:

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka
> Confirm/Cancel). Everything that is not modal - has back an action plus whatever gesture
> it lives with as standard."*

**Amends R27.** The control is back, with the platform's standard back gesture alongside
it. Two things this does **not** change: the slide-out presentation approved at the mock
gate (R19, R26) stands — presentation and navigation model are separate — and R28's
no-actions ruling stands, because **back is navigation, not an action on the line**.

**R30 — modals carry their controls on top, with the title centred.** *"modals have
controls on top, btw, title centered."* **No modal exists in this feature** (see R31); the
convention is recorded for the confirm/cancel screen the deferred switching work will have
(§2.1).

**R31 — the drawing viewer is a tree node with a back control, not a modal.**

This **vetoed this spec's `ASSUMED:` §13.12**, which had the viewer as an overlay with a
dismiss. The owner was given the overlay reading — that a modal is a decision dialog, from
his own gloss *"switch(modal aka Confirm/Cancel)"*, and that an enlargement is a lightbox
rather than a destination — and chose *"a tree node, with back."* The cost was named and
accepted: **a history entry per enlargement, so leaving a line after enlarging a drawing
takes two backs** (VIEW-AC-2d).

**The taxonomy is narrower than it looks, and this is worth recording.** Under R29 + R31:

> **A modal is only a decision dialog — something that asks a question and returns an
> answer.** Everything else a reader can be *in* is a node in the tree, with back.

**Three careful readers independently placed the viewer on the modal side** — this spec
(`ASSUMED:` §13.12), the ux-designer, and the architect — each reasoning from "it is an
overlay over the current screen" rather than from "does it ask a question?". A rule that
three readers got wrong the same way will be got wrong again, so it is written here in the
index rather than left implicit in a criterion. Its first live consequence is already
recorded: under the literal taxonomy the **Projects filter is arguably not a modal
either**, and that goes to a future ticket rather than into this feature (§2, out of
scope).

Owner decisions: **D1** three phases, confirmed order · **D2** panel absent post-issue ·
**D3** figures snapshotted at save, never read live · ~~**D4** placeholder~~ *(superseded
by R28)* · **D5** the capture waits for Phase 3; Phase 1 stays strictly the `certified`
removal, and the loss of figures for everything saved before Phase 3 is accepted ·
**D6** a client/manual-picked line shows a thinner panel **with** its product's figures ·
**D7** the capture extends to the customer save path · **D8** the detail screen gets its
own URL, `/projects/:id/line/:lineId/why` — taken on the reasoning that without a route,
back is component-local state that looks right and behaves wrong at the one moment someone
uses the system's own back gesture · **D9** the URL grammar as designed, 1-based ordinals
(§13.14) · **D10** the viewer's title names the subject (§13.15).

**Taken at the Phase 2 tester gate, 2026-08-25:**

**D11 — a drawing enlarged from the record's desk canvas goes back to the record, and the
control says so.** The journey is legitimate and stays; what it lacked was a specification.
Back — control, Escape or system gesture — returns the reviewer **to the record they were
on**, not to the line page they never visited, and the control's label and accessible name
name **what it returns to** rather than the line. The record's canvas going blank on return
is **fixed, not accepted**. Criteria: §8.1, VIEW-AC-13…17.

> **D11's label half, sharpened the same day and against this spec's recommendation.**
> Revision 16 assumed the project's **title** (§13.17). The developer then found the
> precedent: the line page's own back control names that same destination by its
> **reference** — `src/ops2/projects/LinePage.tsx:201`,
> `backTo={{ label: record ? record.ref : "Project", href: recordPath }}`. Two controls,
> one destination, two vocabularies. **The owner ruled for the reference**: one
> console-wide convention, matching the control a reviewer already uses daily. The cost he
> accepted, stated to him: a reference is an identifier rather than a name — it says which
> record, not which job. VIEW-AC-15 carries it; §13.17 is VETOED.

**D12 — `ElevationLegend` is deleted, with the assertion that pinned it.** VIEW-AC-12 said
in its own words that deleting the export was *"a separate decision that nobody has
taken"*. The owner has taken it, on evidence that arrived afterwards: the export has **zero
callers repo-wide** and **no `.elev-legend` rule exists in any stylesheet**, so it could not
render correctly even if something called it. §13.13 is VETOED.

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5, conclusions §5)** — *Given* a product whose thermal figures come only
from legacy `performanceVariants` with `certified` absent or false, *When* a project
estimate runs against an opening that has a thermal requirement, *Then* the resulting
line's status is not `commercial_only_estimate` on account of certification, and the
variant is ranked on its Uw/SHGC figures alone.

**CERT-AC-2 (the drop-guard)** — *Given* a legacy variant that would previously have been
removed from the catalogue outright by the guard at `catalogue.ts:187`, *When* the
catalogue is loaded, *Then* the variant is present in the candidate set, provided it still
passes the non-certification checks (variant id present, not a duplicate, figures in
range).

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** —
*Given* the repository after this phase, *When* a source-level scan walks **all live
source** — `worker/**`, `src/**`, `scripts/**`, `sanity/**`, with comments stripped —
*Then* it finds no occurrence of:

- `isCertified` or `energyCertified`;
- `certified` as a field name or as a written value;
- `dataSource` **only** where it is valued `"certified" | "estimated" | "manufacturer"`, or
  written/projected on a performance variant or thermal-profile row.

**The narrowness is deliberate and must be preserved.** `dataSource` has a **second, live,
correct meaning** — dimension-rule provenance at `worker/lib/estimator/types.ts:77`. A bare
token match would sweep it in and force the rename of a concept that is fine. A scan
written the easy way passes today and costs a pointless refactor tomorrow.

**Allowlist — two entries, each with its reason** (each must be justified in the test, not
merely listed):

| Allowed | Why |
|---|---|
| `scripts/tests/**` | A test that asserts the field is gone has to be able to name it. |
| `sanity/scripts/strip-certified.mjs` | The script whose entire job is removing the field must name it. |

> **Two corrections here, revision 13, both from the tester⇄developer round.**
>
> **The path was wrong.** Revisions 12 and earlier allowlisted
> `scripts/catalogue/strip-certified.mjs`. **No such file exists** — the strip script is at
> `sanity/scripts/strip-certified.mjs`. The spec was authorising a nonexistent file and
> never authorising the real one. Note that CERT-AC-13's scanned directory,
> `scripts/catalogue/*.mjs`, **was and remains correct**: the importers really do live
> there. The two paths look like the same mistake and are not — they point at different
> trees, and "fixing" CERT-AC-13 to match this correction would make its gate scan the
> wrong one.
>
> **A third entry is gone entirely.** `src/ops/api.ts:381` was exempted on the stated
> ground that it was *"a legacy read surface this feature does not touch"*. **The tester
> executed that claim and it was false:** this phase removed both producers feeding it,
> orphaning a live ops caption. The reader, the route field and the type member have since
> been deleted, so the exemption has nothing left to exempt.
>
> See §12 note 10 — this was the second of six, and the pattern is now a rule.

**Non-vacuity, anchored the way SNAP-AC-2 is:** the walk must be **shown to have reached**
`worker/lib/estimator/catalogue.ts` and `scripts/catalogue/import-wers.mjs`. A scan whose
glob silently matched nothing must fail loudly rather than report success over an empty
set.

**And `certificationRef` / `wersWindowId` are still read and still carried** through to the
candidate — a WERS reference is a real fact about a product; it simply is not a gate.

**CERT-AC-4 (R18)** — *Given* a line whose stored status is `commercial_only_estimate`
from a run before this change, *When* the change is deployed, *Then* that line's stored
status is unchanged, and the diff contains no migration and no script that rewrites a
stored status.

**CERT-AC-5 (status coherence)** — *Given* an opening with a thermal requirement whose
winning candidate is outside the `meets` tier, or whose rules run raised a warning, *When*
the estimate runs after this phase, *Then* the line is still downgraded for **that**
reason — only certification-caused downgrades are gone.

**CERT-AC-6 (Studio schema)** — *Given* the Sanity Studio after this phase, *When* an
author opens a product or a frame thermal profile, *Then* no "Certified" boolean and no
"Data source" dropdown is offered, the validation rule that tied them is gone, and the
WERS reference field is still editable.

**CERT-AC-7 (document values, depth (c))** — *Given* a dated export of the production
dataset has been taken and verified restorable, *When* the value-stripping run completes,
*Then* no document in the dataset carries a `certified` field or a variant `dataSource`
field, every `certificationRef` / `wersWindowId` value is byte-identical to the export,
and no other field differs from the export.

**CERT-AC-8 (export gate — abuse case)** — *Given* no verified export of the production
dataset exists, *When* the value-stripping run is attempted, *Then* it refuses and writes
nothing to the dataset.

**CERT-AC-9 (contract stability)** — *Given* the architect's explicit ruling on
`CandidateOutcome.thermal.dataSource` (remove the field, or retain it permanently null),
*When* an `outcome_json` written before this change is parsed, *Then* it parses without
error, and no surface renders the field either way.

**CERT-AC-10 (the fence) — AMENDED 2026-08-24. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…no migration, no role CHECK constraint, **and
> no application save path**."* **That is no longer true, and the amendment is recorded
> rather than the criterion rewritten** — a fence that quietly widens to admit whatever
> arrived is not a fence, and a later reader must be able to see that this one was moved,
> when, and why.

*Given* the diff for this phase, *When* it is reviewed, *Then* it changes no file under
`worker/lib/staff.ts`, no role CHECK constraint, no migration, and **no application save
path other than the JSON snapshot builders whose source fields this phase deletes** —
namely:

- `worker/lib/ai/proposal.ts:375` — the `performance` object `JSON.stringify`'d into
  `INSERT INTO ai_proposal_line … performance_json` at `:415`
- `worker/lib/estimator/splitCandidates.ts:356` — the same shape for split candidates

**Why the breach is necessary, not creep.** Those builders assemble `source`/`certified`
from fields this phase removes. The only alternative to editing them is writing **literal**
values for fields whose source data no longer exists — which would preserve the exact
vocabulary the owner deleted, inside a stored snapshot, forever. Deleting the flag
everywhere except the JSON blob that records what was decided is not a removal; it is a
removal with a copy kept.

**What still holds, and it is most of the fence.** No migration. No role vocabulary. No
schema change. No column added or dropped. **No statement's column list or WHERE clause
altered.** The breach is confined to the **contents of a JSON blob** whose fields no longer
have a source — not to the shape of any statement, any table, or any query. That
distinction is the entire reason this is amendable rather than a scope failure, and a
future amendment that cannot make the same distinction should be refused.

**The catalogue importers remain inside the fence, not an exception to it.**
`scripts/catalogue/*.mjs` are **operator-run Sanity maintenance scripts** — the same
artifact class as `sanity/scripts/strip-certified.mjs`, which this phase already owned.
They are not save paths, they serve no request, and no customer or staff action invokes
them.

**CERT-AC-11 (blast radius)** — *Given* a signed-out visitor and a signed-in customer,
*When* every customer-facing route is exercised after this phase, *Then* no response body
gains or loses a field, and no price changes for an already-priced line.

**CERT-AC-12 (durability — the strip does not expire)** — *Given* the dataset after the
strip, *When* the catalogue importers and derive scripts are run as an operator would run
them, *Then* **no row regains `certified` or a certification-valued `dataSource`**.

Proved two ways, because one is not available everywhere: **behaviourally** against the
pure builder in `derive-estimator-fields` — call it with representative input and assert
the absence of those keys in what it returns — and by **source scan** (CERT-AC-3's
predicate) everywhere the code is not callable in isolation.

This is the criterion that makes Phase 1 a fix rather than a delay. Without it,
`import-wers.mjs:135` and `derive-estimator-fields.mjs:112-113` write the fields back on
the next run and CERT-AC-7 silently becomes false — and after CERT-AC-6 they would be
writing a field the Studio can neither display nor validate.

**CERT-AC-13 (the strip refuses a stale checkout)** — *Given* `sanity/scripts/strip-certified.mjs`
is run from a checkout whose own **`scripts/catalogue/*.mjs`** still contains a `certified`
or certification-valued `dataSource` **field write**, *When* the strip is invoked — dry-run
or `--apply` — *Then* it **refuses and writes nothing**, naming the offending file.

The two paths in that sentence are deliberately different trees: the strip lives under
`sanity/scripts/`, the importers it checks live under `scripts/catalogue/`. Neither is a
typo for the other.

This is a second gate beside CERT-AC-8's export gate, and it exists because the failure it
prevents is invisible: a strip from a stale branch *succeeds*, reports success, and expires
at the next import. **It belongs in the criteria and not only in the deploy prose** — a
safeguard described in a runbook is the kind of thing that gets dropped as an
implementation detail.

**CERT-AC-14 (deploy order — the strip is last, and final)** — *Given* the Phase 1 rollout,
*When* it is performed, *Then* the order is: worker code **and the four importer edits** →
Studio deploy → verified dataset export → strip dry-run → `strip-certified.mjs --apply`.
The strip is **not provisional on anything that follows it**, and CERT-AC-8 and CERT-AC-13
are what enforce the two preconditions rather than trusting the operator to remember them.

---

## 7. Acceptance criteria — Phase 3a: the universal capture (R22, D3, D6, D7)

### 7.1 One rule

Owner, verbatim: *"every save should record thermal properties of selected at a time
product."* This is **one rule with many sites**, not a set of per-route features.

**SNAP-AC-1 (R22 — the rule)** — *Given* any save that sets or changes a line's product or
its variant, *When* it completes, *Then* the line's own stored record carries that
product+variant's `uValue` and `shgc` as they stood at that moment — regardless of which
route performed the save, and regardless of whether a person or the platform chose the
product.

**SNAP-AC-2 (R22 — structural, and the only mechanism that has actually worked)** —
*Given* the repository after this phase, *When* a source-level scan enumerates **every**
statement anywhere under `worker/**` that writes `quote_line.product_slug` or
`quote_line.selected_variant_id` — routes and libs alike, including statements built in
helpers and those inside batched arrays — *Then* every one of them also writes the figures
field, and a writer added later that sets a product without figures fails this test.

Two properties this criterion must have, because they are what makes it worth more than
the index it replaces:

- **It encodes no count.** The scan asserts a property of every match, never "there are N
  writers". The number has been wrong three times (§7.4); the property has not.
- **It cannot pass vacuously.** The scan asserts its own match set is non-empty and at
  least as large as the design's index — a pattern that silently stops matching (a
  reformatted statement, a new helper, a renamed column) must fail loudly rather than
  report success over nothing.

**SNAP-AC-3 (R22 — one place per fact)** — *Given* the figures are captured, *When* the
display surface states what the line's current product performs at, *Then* it reads the
line's own record — not `candidate_result`, not the catalogue. `candidate_result` remains
the source for the *recommendation* and the alternatives only.

### 7.2 The hard constraint — capture is never a gate

This comes first among the constraints because it is the one way this feature could damage
the product.

**SNAP-AC-4 (negative — no new refusal, ops)** — *Given* an ops line edit that succeeds
today on a line where **no** performance variant can be resolved, *When* the same edit is
made after the capture ships, *Then* it still succeeds with the same status, the same
stored values and the same price; the figures are stored as null and **no**
`configuration_not_eligible`, no 409 and no other refusal is introduced.

**SNAP-AC-5 (negative — no new refusal, customer)** — *Given* a customer save that
succeeds today, *When* the same save is made after the capture ships, *Then* it still
succeeds, the line's `line_total` and `status` are identical to what they are today, and
no new validation, eligibility check or error path exists on that route.

**SNAP-AC-6 (best-effort resolution)** — *Given* a product+options combination for which
the catalogue offers no matching published variant, or for which the catalogue is
unreachable, *When* the line is saved, *Then* the save completes, the figures are stored
as null, and the failure is not surfaced to the person saving.

**SNAP-AC-7 (no latency regression on the customer path)** — *Given* a customer saving a
project of many lines, *When* the capture resolves figures, *Then* the catalogue is
consulted at most once per save request — not once per line — and a catalogue timeout ends
the same way as SNAP-AC-6: stored null, save unaffected.

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — *Given* a save where a figure is
genuinely unknown, *When* it is stored, *Then* the key is present with a null value —
present-and-null, so a later reader can tell "no figure exists for this product" apart
from "this line was saved before the capture shipped".

**SNAP-AC-9 (it is a snapshot)** — *Given* a line saved with figures captured, *When* the
catalogue's figures for that product later change, *Then* the figures stored on the line
do not change, and nothing recomputes them.

**SNAP-AC-10 (no backfill — D5)** — *Given* lines saved before this phase, *When* it is
deployed, *Then* no script and no migration writes figures onto them.

**SNAP-AC-11 (the platform's record is never overwritten)** — *Given* any capture on any
path, *When* it writes, *Then* it writes only to the line's own configuration record; no
`selection_run` row, no `candidate_result` row and no `outcome_json` is modified, so what
the platform decided is never edited by what a human later chose (R3, R11, R23).

**SNAP-AC-12 (surface area)** — *Given* the diff for the capture, *When* it is reviewed,
*Then* it adds no endpoint and no HTTP method. Whether it adds a column is the architect's
call — `configuration_snapshot_json` already exists on `quote_line` and is the natural
home (`ASSUMED:` §13.8) — and any migration follows the `d1-migration-safety` procedure.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2. This spec does not
restate it.**

That deferral is itself a finding. A hand-maintained list of the sites that write a line's
product has now been **incomplete on every attempt, by three different readers**: the
grill input named one, revision 3 found three more, revision 4's index claimed eight, and
the architect's verification found fifteen — six of them missed by everyone before. A list
that has been wrong four times in a row is not a control, and the spec should stop
pretending otherwise.

**SNAP-AC-2 is therefore not belt-and-braces — it is the mechanism.** It is the only one
of the two that has ever produced a correct answer, and the only one that keeps producing
one after this feature ships. The criteria below name the writer *shapes* whose behaviour
the owner's rulings actually decide; which files realise those shapes is the design's to
enumerate and the scan's to enforce.

Three shapes carry rulings of their own:

- **A parent with no product of its own** (a composite parent) — the rule is vacuous:
  no figures on the parent, each unit carries its own.
- **A writer that clears a snapshot** — the recommendation's snapshot is still cleared
  when it stops describing the line, but what replaces it is the new selection's figures,
  never nothing (SNAP-AC-14).
- **A writer that restores a prior configuration** — it carries that configuration's
  figures, and the line then reads as platform-made again by comparison (WHY-AC-30).

### 7.5 The customer path, specifically

**SNAP-AC-13 (D7)** — *Given* a customer configuring a new line, *When* the project is
saved, *Then* the inserted `quote_line` carries the product's figures. A client-configured
line has never carried them before.

**SNAP-AC-14 (D7, the erasure)** — *Given* a customer changing the configuration of a line
the estimator priced — the path that today sets `configuration_snapshot_json = NULL` —
*When* it is saved, *Then* the line records the figures of **what the customer chose**, so
the reviewer's comparison (WHY-AC-27) is available on precisely the lines stamped
`customerConfigurationChanged` for a human to confirm.

**SNAP-AC-15 (D7, nothing customer-visible)** — *Given* the customer site after this
change, *When* a customer configures, saves, re-opens and submits a project, *Then* every
screen, every price and every response they see is identical to before; the only
difference is what the row stores.

### 7.6 Verified non-impact — the learning corpus

Confirmed 2026-08-24 at the owner's request, and recorded here so a later reviewer does
not re-open it: `captureRecommendationOutcomes` runs at issue (`issue.ts:46`); an override
fails `sameCoreConfiguration` (`ai/outcomes.ts:97-102`), so the outcome's `decision` is
`"adjusted"`, `recommendationEligible` is false, and it is parked `pending` for human
adjudication rather than trained on. **This feature must not alter that path, and nothing
in it does** — the capture writes to the line's own configuration record only
(SNAP-AC-11), and the display surface is GET-only (WHY-AC-20). No criteria are written
against the learning path; it is out of scope by intent, not by omission. *(The deferred
switching work inherits this unchanged — §2.1, point 5.)*

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer (R21, R25, R31)

**The URL grammar — owner-confirmed (D9, §13.14).** `/projects/:id/line/:lineId/drawing`
for the opening; `/projects/:id/line/:lineId/drawing/u1`, `/u2`, … for a unit — **1-based
ordinals in the same display order `unitLabel` renders**. The owner chose this over putting
the unit's own code in the address: the ordinal matches what the labels already imply, and
it does not couple the URL to a label that changes if units are reordered.

**A state-only history push was rejected by name.** Back would have popped honestly, but
the address bar would lie, reload and shared links would silently lose the viewer, and the
route table would show nothing for a test to find — the same broken promise relocated one
layer down.

**VIEW-AC-1 (R21, R25 — what the viewer carries)** — *Given* the line page for a simple
opening, *When* the reviewer activates the drawing, *Then* the viewer opens carrying **the
whole drawing and its caption visible together, the drawing as large as the viewport
permits** — and nothing that explains the drawing's notation.

> ### The size rule — resolved at the round-2 tester gate, revision 18
>
> **The criterion was requiring two things that cannot both hold, so no implementation
> could satisfy it.** Revision 16 required the drawing "strictly larger at 1920 than at
> 1280, and larger again at 2560". Revision 17 required the **caption** — the drawing's
> size in words — to be readable at every width, as the fence that made the scaling of the
> drawing's own dimension leaders a design matter rather than a criterion. On a short wide
> viewport those two are incompatible, and the numbers say so: the drawing is landscape,
> about **1.4 : 1** in the shape the tester measured, so a copy grown to claim 2560px of
> width stands roughly **1790px** tall on a **1080px** screen. The caption would sit below
> the fold — and so would a third of the drawing.
>
> **A drawing you have to scroll to see is not "the largest size the viewport allows". It
> is larger than the viewport allows.** That is the resolution, and it collapses two
> requirements into one.
>
> #### The guarantee
>
> > **The whole drawing and its caption are visible together, and within that the drawing
> > is as large as the viewport permits.**
>
> **Which dimension governs: whichever one binds.** On a tall narrow viewport the available
> width binds; on a short wide one the available height binds. Neither is *the* governor,
> and a rule naming one is wrong on the other shape — which is exactly what shipped.
> `.ops2-viewer__svg` was governed by height alone (`height: 62vh; width: auto`), measured
> by the tester with each dimension moved separately:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> So an ultrawide **2560×1080** — a common ops shape — got precisely the drawing a
> 1280×1080 window got. Width contributed nothing.
>
> **The magic number goes with it.** `62vh` was the sibling of the `720px` that caused
> round 1's MINOR: a figure nobody had defended, silently deciding how much of the screen
> the drawing may claim. Under this rule the budget is not chosen — **it is what is left**:
> the viewer's own space after its chrome and its caption. Fitting a fixed-aspect drawing
> into a box is something the platform already does for an SVG that carries its own aspect
> ratio; no arithmetic about viewport percentages belongs in this component.
>
> **`ASSUMED:` §13.18** — the drawing may claim **all** of that remaining space rather than
> a share of it, and the caption never scrolls out of view. That is the reading of R21 this
> spec has worked to throughout, but *how much of an ultrawide the drawing should claim* is
> the owner's call, and §13.18 is the assumption he would be vetoing.
>
> #### How it is verified — and the shipped test is why this needs saying
>
> The round-1 test measured (1280,900), (1920,1080), (2560,1440) — **both dimensions growing
> together** — and asserted the drawing got bigger. It passes whichever dimension is doing
> the work, so it proved nothing about which one was, and a height-governed implementation
> sailed through it. **That is SNAP-AC-2's non-vacuity lesson in a browser** (§12 note 12).
>
> The check is **three shapes, each with exactly one thing to say, and each moving one
> dimension**:
>
> 1. **Width binds — tall and narrow** (e.g. 1100×1440 against 1500×1440, viewport height
>    held constant): the drawing is **strictly wider** on the wider viewport.
> 2. **Height binds — short and wide** (e.g. 2560×1080 against 2560×1440, viewport width
>    held constant): the drawing is **strictly taller** on the taller viewport.
> 3. **The fence, at every shape tested — 2560×1080 and 375×667 among them:** the drawing's
>    box **and the whole caption** are inside the viewport, with no scrolling needed to read
>    the size.
>
> A sweep that moves both dimensions cannot fail on the wrong governor. This criterion has
> already been passed once by exactly that test, and the ultrawide is what it cost.

**VIEW-AC-1a (title names the subject — owner-confirmed, D10, §13.15)** — *Given* the
viewer is showing a **unit**, *When* its title is read, *Then* it is that unit's code
(`W07A`). *Given* the viewer is showing the **line** the reviewer arrived from, *Then* the
title is simply `Drawing` — the back control already names the line, and repeating it says
the code twice. The size sits in the caption beneath the drawing, not in the title.

**This rule is untouched by D11.** §8.1 changes the **back control's** label, and only on
the canvas-opened path. The title still names the subject, at every entry point.

**VIEW-AC-2 (R31 — entering pushes exactly one entry)** — *Given* the reviewer is on a
line page, *When* they activate a drawing, *Then* **exactly one** history entry is pushed
and the address becomes that drawing's own URL — the opening's, or the unit's `u1`/`u2`/….

**VIEW-AC-2a (R31 — three ways out, one pop)** — *Given* the viewer is open, *When* the
reviewer uses the back control, presses Escape, **or** performs the system back gesture,
*Then* all three do the **same single pop**: the line URL returns, the line page is **not
remounted**, and **no record re-fetch occurs**.

*(Entered from the record's desk canvas, the same "one pop from all three exits" rule
applies and the destination is the **record** — VIEW-AC-14, VIEW-AC-16. Where the pop
lands follows how the viewer was entered; that it is one pop, with no remount and no
re-fetch, never varies.)*

**VIEW-AC-2b (cold deep link)** — *Given* a staff user opens a drawing URL directly in a
fresh tab, *When* it loads, *Then* the line page renders **with the viewer open**, and that
viewer's back control **replaces** to the line path rather than popping — so the reviewer
lands on the line page instead of being thrown out of the console.

**VIEW-AC-2c (malformed or out-of-range suffix)** — *Given* a drawing URL whose unit
suffix is malformed or names a unit that does not exist on this line, *When* it is opened,
*Then* it **normalises by replace** — to the opening's drawing or the line page as the
design specifies — and **grows no history**, so back still does what the reviewer expects.

**VIEW-AC-2d (R31 — the accepted two-backs consequence)** — *Given* a reviewer who
enlarged a drawing and wants to leave the line entirely, *When* they go back twice, *Then*
the first back closes the viewer and the second leaves the line page. **This is the agreed
cost of R31, not a defect** — it was named in the question the owner answered and
accepted. Nobody may "fix" it by collapsing the two steps.

*(From the desk canvas only **one** entry is ever pushed, so leaving is one back, to the
record — VIEW-AC-14. That is not a collapse of this criterion: the second entry never
existed, because selecting a line in the canvas is not a navigation.)*

**VIEW-AC-3 (R21, composite parent)** — *Given* a composite line page, *When* the reviewer
activates the parent drawing, *Then* the viewer shows the whole assembly with its units
drawn in proportion to their real sizes. (The proportion is a property of the **drawing**;
no sentence explaining it appears — R25, VIEW-AC-10.)

**VIEW-AC-4 (R21, composite unit)** — *Given* a composite line page, *When* the reviewer
activates a single unit's drawing in the units list, *Then* the viewer shows that unit
alone at `…/drawing/u<N>` for that unit's 1-based position, titled with the unit's code and
captioned with its own size.

**VIEW-AC-5 (R21, "one shared viewer")** — *Given* the ops2 source after this phase,
*When* it is searched for drawing-enlargement surfaces, *Then* exactly one viewer
component exists and every enlargeable drawing in ops2 opens it — **the record's desk
canvas included** (VIEW-AC-13), which is the criterion that put that journey there.

**VIEW-AC-6 (R21 supersedes)** — *Given* the line page after this phase, *When* the plate
is activated, *Then* the previous `SidePanel` enlargement (`Plate.tsx:60-106`) no longer
appears anywhere — neither its presentation nor its dismiss-driven control flow.

**VIEW-AC-7 (keyboard)** — *Given* a keyboard-only reviewer, *When* they focus a drawing
and press Enter or Space, *Then* the viewer opens, focus moves into it, its accessible
name carries the subject's identity, and on going back focus returns to the drawing that
opened it.

**VIEW-AC-8 (R25 — authority, not notation)** — *Given* a line for which no size could be
read, *When* its drawing is opened, *Then* the stand-in square is shown with the existing
sentence and no dimension leaders are drawn. This sentence **stays**: it states what the
drawing is worth, not how to read it.

**VIEW-AC-9 (negative — the row stays one target)** — *Given* the project record's line
list, *When* a row's `xs` glyph is activated, *Then* the row navigates to the line page as
it does today and **no** viewer opens. `ASSUMED:` §13.1.

**VIEW-AC-10 (R25 — the class, negative, and the element's first test)** — *Given* any
ops2 drawing surface after this phase, *When* its text is read, *Then* it contains **no
explanatory notation**: no symbol key or legend, no sentence describing what solid,
dashed, apex, arrow or unmarked lines mean, and no sentence teaching that panel widths are
proportional to unit sizes. Statements about the drawing's **authority** are unaffected and
must remain — that mullion positions are confirmed at technical review, and that an
unsized opening is a stand-in.

*This assertion is new, and it is the first test this element has ever had.* The legend has
been rendered by `Plate.tsx:104` since the record work shipped and is asserted by no suite
anywhere — so nothing would have caught its removal, and nothing would catch its
reinstatement either. A test that only searched for the word "legend" would pass a viewer
that still explained panel proportions in a sentence; the assertion is against the class.

**And after D12 it must not rest on the `.elev-legend` selector**, which can no longer
match anything once the component is deleted — see §12 note 5. A criterion whose only
check is a selector that cannot exist is a criterion nobody is testing.

**VIEW-AC-11 (R25 — the older spec stops contradicting this one)** — *Given*
`docs/specs/ops2-record-correction.md:343-347`, whose **P1-AC-27** requires *"the drawing
can be enlarged, with its legend"* and spells out the whole key, *When* this phase lands,
*Then* that criterion is **marked superseded in that document**, naming this feature and
the owner's R25 ruling. Two live specs asserting opposite things about the same screen is
how the next reader builds the wrong one; P1-AC-27 was never given a test, so the document
is the only place the contradiction can be resolved.

**VIEW-AC-12 (the shared export IS deleted) — RULING REVERSED by the owner, 2026-08-25
(D12), revision 16.**

*Given* `ElevationLegend` at `src/components/quote-project/Elevation.tsx:571-593`, *When*
Phase 2 lands, *Then*:

- the export **and its body are removed** from `Elevation.tsx`;
- the assertion that pinned its existence, `scripts/tests/ops2-frame.test.mjs:272`, is
  **removed with it** — a test that requires a deleted symbol is a red suite, and leaving it
  behind would make the deletion look like a regression;
- no file under `src/**` or `scripts/**` references the identifier outside a comment (the
  existing ops2 assertion at `ops2-frame.test.mjs:241`, that no ops2 source reaches for it,
  **stays**);
- `docs/adr/0010-ops2-shares-the-elevation-generator.md:21,28`, which states that ops2
  imports `Elevation` *and* `ElevationLegend`, is **annotated** to record that the export is
  gone and why — the same discipline VIEW-AC-11 applies to the older spec;
- the typecheck and the build are green, and no other export in that module changes.

> **The three states of this criterion, kept rather than tidied.** It has now flipped
> twice, and the record of *why* it kept flipping is worth more than a clean-looking
> criterion — twice, the reason given for keeping the export turned out to be an
> unexecuted claim about the repository.
>
> **~~Through revision 13:~~** *"…the export itself is not deleted… and the customer site's
> use of it is unaffected… the other consumer's right to it is not this feature's to
> remove."* **The premise was false.**
>
> **~~Revision 14:~~** the premise was corrected and the ruling kept — *"this phase removes
> a render, not an API; the export currently has no consumer, and removing it is a separate
> decision that nobody has taken."* Executed 2026-08-25: `ElevationLegend` is **defined once
> and called from nowhere**; its only non-comment occurrence in `src/**` is its own
> definition, every other source hit is a comment recording its absence
> (`DrawingViewer.tsx:37`, `Plate.tsx:20,24`), and `docs/specs/ops2-record-design.md:42,157,191`
> records that the export was added **by the ops2 record work**, for the very plate this
> phase has just stopped rendering it from. ops2 was never one of two consumers. It was the
> only one.
>
> *(Stated as "no caller" on purpose. Revision 14 first wrote "exactly one reference
> repo-wide", which the Codex stop-gate caught as another false repo-wide count — the
> identifier appears in an ADR, four documents, a test and three source files. **A count is
> a claim too.**)*
>
> **Revision 16 — the decision nobody had taken has been taken, by the owner (D12), on
> evidence that did not exist when revision 14 was written.** From an independent
> ponytail-review that executed its greps, re-run for this revision: the export has **zero
> callers repo-wide**, **and no `.elev-legend` rule exists in any stylesheet.** The only
> occurrences of that class name are the component's own markup, one comment, and a
> Playwright assertion that it renders zero times. Its markup has therefore been **unstyled
> since the plate stopped rendering it — it would not render correctly even if something
> called it.**
>
> That is what changes the answer. "Removing a render, not an API" was the right
> distinction while there was an API somebody could use. An export with no caller and no
> styles is not an API being preserved for a future consumer; it is dead code with a door
> painted on it, and the next reader who finds it will spend the same hour three readers
> have already spent. Deletion is the smaller diff and the smaller future.

**What the test asserts, and what it must still not assert.** It asserts the **absence**:
no `export function ElevationLegend` in `Elevation.tsx`, and no live-source reference to
the identifier. It must **not** reintroduce a consumer count in either direction — that is
exactly the claim class §12 note 10 exists to stop, and this criterion has now been wrong
twice for that reason.

### 8.1 Opening a drawing from the project record's desk canvas (D11 — new, revision 16)

**This journey shipped in no criterion and no interaction spec.** At desk width the project
record shows the selected line in a canvas beside the rail, and that canvas renders the
same `LineReview` body the line page does — so its plate and its unit rows are enlargeable
there too (`src/ops2/projects/ProjectRecordPage.tsx:190-203`). The journey was added at
**architect-conformance time** (design §11.5) to satisfy VIEW-AC-5's "exactly one viewer",
*after* §8 was written, and so it reached the tester with nothing to test it against. That
is the tester's MAJOR, and the class of defect is recorded at §12 note 11.

**The journey itself is right and stays.** Opening a second, unrouted viewer over the
record would have given it a back control that does not truly go back — the exact promise
the route ruling exists to keep. What was missing is that nobody had said **where its back
goes** or **what it says**.

**Owner ruling (D11), 2026-08-25:** back returns to the **record**; the reviewer lands
exactly where they were; the control is **relabelled so it stops naming the line**; and the
record's canvas going blank on return is **fixed, not accepted**.

**VIEW-AC-13 (the canvas is an opener surface, and it opens the one viewer)** — *Given* the
project record at desk width with a line selected in the canvas, *When* the reviewer
activates the canvas's plate, or a unit row on a composite, *Then* the **shared** viewer
opens — VIEW-AC-5's single viewer, never a second copy over the record — the address
becomes that line's own `/projects/:id/line/:lineId/drawing`, or `…/drawing/u<N>` for that
unit's 1-based position, **the same grammar the line page uses** (D9), and **exactly one**
history entry is pushed.

**VIEW-AC-14 (back from a canvas-opened viewer lands on the record)** — *Given* the viewer
was opened from the record's desk canvas, *When* the reviewer uses the back control,
presses Escape, **or** performs the system back gesture, *Then* all three do the **same
single pop**, the address returns to the **project record**, and the reviewer is on the
record — never on the line page they never visited.

*Cold arrival is unchanged.* A drawing URL opened in a fresh tab has no record behind it
and still **replaces** to the line path (VIEW-AC-2b). The destination follows **how the
viewer was entered**, and there are exactly two ways in: from a line page, or from the
record's canvas.

**VIEW-AC-15 (the control names what it returns to — and names it the way this console
already does)** — *Given* the viewer was opened from the record's desk canvas, *When* its
**visible label** and its **accessible name** are read, *Then* both are the record's
**reference** (`OF-Q-10482`), and **neither names the line**. *Given* the viewer was opened
from the line page, *Then* both name the line, exactly as they do today. In no state does
the label name one destination while the control goes to another.

**Why the reference and not the project's name — owner ruling, 2026-08-25 (§13.17 VETOED).**
The line page's back control already names this same destination, and it names it by
reference: `src/ops2/projects/LinePage.tsx:201`,
`backTo={{ label: record ? record.ref : "Project", href: recordPath }}`. One destination
must not have two vocabularies in one console, and the reviewer already reads that control
daily.

**There is no `Project` fallback on the viewer's control, and that is not a descope —
corrected revision 19.** Revisions 17 and 18 wrote the reference *"falling back to `Project`
while the record has not loaded"*. **The viewer's control cannot be in that state:** its
subject is built only once the record has resolved a line
(`src/ops2/projects/LinePage.tsx:124` passes the reference only when `record` exists), so
there is no moment at which the viewer is on screen with nothing behind it. The developer
implemented the fallback in both places, deleted the unreachable copy and said so rather
than dropping it quietly; the criterion is corrected to match reality rather than the code
kept unreachable to match a sentence.

**What that clause was protecting still stands, in the two places it is real:**

- **The page-level control keeps `Project`.** `LinePage.tsx:201` is the *page's* back
  control, not the viewer's — a different control, on a surface where the pre-load state
  genuinely exists. It is untouched, and it is not VIEW-AC-15's subject. **If one of these
  two labels ever changes, both change**; that is the one-vocabulary rule, and it is what
  §13.17 settled.
- **The never-empty guarantee is pinned, not assumed.** The reference cannot be blank:
  `src/ops2/projects/record.ts:314` sets `ref: str(publicRef) ?? id`, and
  `parseProjectRecord` returns `null` without a non-empty trimmed id — asserted in
  `scripts/tests/ops2-record.test.mjs`. **A fallback here would have masked that pin and
  made it look optional**, which is why its absence is the safer shape: if the guarantee
  ever breaks, a test fails loudly instead of a label quietly reading `Project`.

**It can be long, and that is not a reason to change the vocabulary.** `public_ref` is
nullable (`migrations/0011_project_ref.sql`) and the id is a UUID, so a record served
without a reference labels this control with 36 characters rather than ten. The console
handles that as a **display** problem (the cap in `src/ops2/styles/line.css:122-129`), never
by falling back to the project's title — that would reintroduce the vocabulary the owner
vetoed, on exactly the records where the two controls would then disagree.

The cost the owner accepted, stated to him: a reference is an identifier rather than a name
— it says *which record*, not *which job*. **The general rule still governs and outranks the
wording:** the control names **what it returns to**, and never the line when it did not come
from one. The defect this replaces was exactly that mismatch — the control rendered `‹ W07`,
naming the line, and landed on the record. A back control that misnames its destination is
worse than an unlabelled one, because the reviewer only learns it was wrong by arriving
somewhere else.

**VIEW-AC-16 (the return does not blank the canvas)** — *Given* a reviewer who opened a
drawing from the desk canvas, *When* they go back to the record, *Then* the record page is
**not remounted and the record is not re-fetched** — the same discipline VIEW-AC-2a already
requires of the line page — the line that was selected is **still selected**, and the canvas
shows that line's drawing **from the first frame after the pop**: no intermediate state in
which it is empty, shows no selection, or shows a placeholder.

**Measured, not eyeballed.** The tester's evidence for the defect was `selected row index
-1; canvas text starts ""`. The fix is proved by the same two observations, read immediately
after the pop **with no waiting**: the selected row's identity is the line that was
selected, and the canvas already carries that line's own content.

**VIEW-AC-17 (executed where only a browser can see it)** — *Given* Phase 2 is complete,
*When* its test artifacts are enumerated, *Then* `scripts/tests/web/` carries **executed**
Playwright coverage of this journey: opening from the plate **and** from a unit row
(VIEW-AC-13), all three exits landing on the record (VIEW-AC-14), the back control carrying
the record's reference (VIEW-AC-15), and the preserved selection with no blank frame
(VIEW-AC-16).

A node:test suite cannot satisfy this criterion. The whole journey is a client decision —
which surface pushed, what the label says, what the canvas shows on return — and the
server-rendered bytes are identical whether it works or not. That is the same blindness
that let two MAJOR referral findings past 104 green node tests, and it is why the pipeline's
rule is absolute: **a UI change cannot pass without Playwright coverage.**

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

### 9.1 The panel on the line detail (R6)

**WHY-AC-1 (R6)** — *Given* a line whose opening resolves to a selection run with recorded
candidate outcomes, and whose product is still the one the platform selected, *When* the
reviewer opens the line page, *Then* a "Why this product" panel appears between the
specification (or the units block) and the price, carrying exactly three lines: **Had to
meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — *Given* a run whose `requirement.basis` is `default_envelope`, *When*
the panel renders "Had to meet", *Then* the caps are stated as figures **and** an origin
label names them as a platform default; and equivalently `explicit_energy_report` → an
energy report, `plan_derived` → the platform's modelling from the plan, `human_override` →
a human override.

**WHY-AC-3 (R4, absent)** — *Given* a run whose `requirement.absent` is true, *When* the
panel renders, *Then* "Had to meet" states that this opening had no thermal requirement,
and no cap figure is shown.

**WHY-AC-4 (R6, SNAP-AC-3)** — *Given* the line's stored figures, *When* "This one"
renders, *Then* it shows the line's current product's Uw and SHGC from the line's own
record; a figure recorded as null is stated as not recorded and is never rendered as a
number, a zero or a dash.

**WHY-AC-5 (R6, R7)** — *Given* the run's `competingTier`, *When* "Chosen" renders on a
line the platform's product still occupies, *Then* it states the winning rule in one
sentence per tier: `meets` → the cheapest of those that met the caps; `within_tolerance` →
nothing met the caps, so the cheapest within 5% of the closest; `misses` → nothing came
within the band, so the closest was taken; `thermal_unknown` → no figure existed on the
constrained axis; `does_not_fit` → nothing fitted, so the best fit was taken.

**WHY-AC-6 (R7)** — *Given* a run stored with `tolerance` 0.08, *When* the tolerance
sentence renders, *Then* it says 8% — the figure is read from the run, never hardcoded,
and the band is named rather than paraphrased as "closest available".

**WHY-AC-7 (R19, R26, D8 — presentation, and how it opens)** — *Given* the panel is shown
and the line has recorded candidates, *When* the reviewer activates the panel's action,
*Then* ops2 **navigates to `/projects/:id/line/:lineId/why`** — a child of the route
grammar Phase 2 established — and that screen is **presented** as a right-hand slide-out at
desk width and full screen on the phone: not a partial bottom sheet, no drag handle, no
intermediate breakpoint.

The presentation is `SidePanel`'s; **the control flow is not.** The screen is opened by a
route change, never by `setOpen(true)` — reusing a component's appearance does not mean
reusing its `isOpen` model (§4, and the ux-designer's interaction spec §4.1).

**WHY-AC-7a (R29, D8 — the way out is back)** — *Given* the detail screen is open at
either width, *When* the reviewer looks for the way out, *Then* the control is a **back**
control with an accessible name, accompanied by the platform's standard back gesture; **no
"Done" button and no X appears anywhere on it.** Activating either pops history and lands
the reviewer on the line page.

**WHY-AC-7c (D8 — the URL resolves on cold arrival)** — *Given* a staff user who pastes
`/projects/:id/line/:lineId/why` into a fresh tab, *When* it loads, *Then* the detail
renders its line's rationale, having resolved the line the same way the line page does
(record fetch + find, per the record design's D3) — and the not-found and refusal
sentences are the line page's, unchanged.

**WHY-AC-7d (D8 — back on a cold arrival still goes somewhere sensible)** — *Given* the
reviewer arrived at that URL directly, so there is nothing to pop, *When* they activate
back, *Then* they land on the line page — the same replace-rather-than-pop behaviour
VIEW-AC-2b requires of the viewer, and the same pop-or-push discipline `OpsPage` already
applies one level up (record design §4). Never a dead control, never out of the console.

**WHY-AC-7b (R26, R29 — negative, the other caller does not move)** — *Given* the Projects
filter panel, which is the shared component's other caller and was **not** part of this
approval, *When* it is opened after these changes, *Then* its presentation and its dismiss
control are exactly what they are today, and its existing tests pass unchanged. *(That the
filter may not be a modal under R31's taxonomy is a future ticket, not this feature's
business — §2, out of scope.)*

**WHY-AC-8 (R13, D6 — the thinner panel)** — *Given* a line with no selection run (a
customer-configured or manually entered line) whose stored figures exist, *When* the line
page opens, *Then* the panel is present and shows **two** lines: that a person chose this
product, and that product's own Uw and SHGC. There is **no** "Had to meet" line, **no**
"Chosen" line, and no alternatives action — the owner's *"far less rich in details"*, said
by having fewer lines rather than by filling them with absences.

**WHY-AC-9 (D5, the honest gap)** — *Given* such a line whose stored figures are absent —
saved before Phase 3, or resolved to null (SNAP-AC-6) — *When* the panel renders, *Then*
it states that a person chose this product and that its figures were not recorded, and
**no** catalogue lookup is made to fill the gap. `ASSUMED:` §13.5.

**WHY-AC-10 (R3, pre-0055 rows)** — *Given* a line whose selection run predates
`outcome_json` (migration 0055), *When* the line page opens, *Then* the panel states that
this recommendation was made by an earlier model whose reasoning was not recorded, no
figures from the deleted scoring model are shown, and no alternatives action is offered.
`ASSUMED:` §13.2.

**WHY-AC-11 (D2, post-issue)** — *Given* a project that has been issued and accepted, so
the record shows order lines, *When* a line page is opened, *Then* **no "Why this product"
panel appears at all** — not the panel, not an explanatory sentence in its place — and
nothing on the page references a recommendation. **The `why` route for such a line renders
the same refusal as a line that has none** (WHY-AC-7c's sentences), so the URL is not a way
around D2.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

Presented as a slide-out (WHY-AC-7); **a screen in the tree with its own URL**, not an
overlay (R29, D8).

**WHY-AC-12 (R8)** — *Given* a run with at least five non-excluded candidates, *When* the
detail opens, *Then* it lists the chosen product first, marked as chosen, followed by the
next four candidates by ascending ladder rank — five rows, no more.

**WHY-AC-13 (R8)** — *Given* a run with fewer than five non-excluded candidates, *When*
the detail opens, *Then* it lists the ones that exist, with no placeholder rows and **no
count of anything beyond the list**.

**WHY-AC-14 (R9 — negative)** — *Given* a run whose candidate set contains excluded
candidates, *When* the detail opens, *Then* no excluded candidate appears, no count of
excluded candidates appears, and no exclusion reason text appears anywhere on the surface.

**WHY-AC-15 (R9 + conclusions §7 — negative)** — *Given* a run whose `withheldIncomplete[]`
is non-empty, *When* the detail opens, *Then* nothing about withheld products appears.
`ASSUMED:` carried from conclusions §7.

**WHY-AC-16 (R10 — negative)** — *Given* any alternative row, *When* it renders, *Then* it
carries no price, no price delta, no currency symbol, and no control that prices it.

**WHY-AC-17 (R6, R7)** — *Given* an alternative row, *When* it renders, *Then* it states
the product's name, its recorded Uw and SHGC, and its verdict in words derived from its
tier (met the caps / within the 5% band / missed the cap / no figure on the constrained
axis / would not fit).

**WHY-AC-18 (R3, D3)** — *Given* the catalogue has changed since the run was recorded,
*When* the panel and the detail render, *Then* every figure shown is a stored one, and the
surface issues no request to the catalogue or to the estimator to recompute anything.

**WHY-AC-19 (R3)** — *Given* a recorded candidate whose product no longer exists in the
catalogue, *When* the detail renders, *Then* the row is still shown from the recorded
facts and is never blank or dropped.

**WHY-AC-20 (R1 — negative)** — *Given* the panel and the detail, *When* every control on
them is enumerated, *Then* none changes the line, the quote or any stored value, and a
network trace of opening the panel and the detail contains only GET requests.

**WHY-AC-21 (R2 — negative)** — *Given* any state of this surface, *When* its text is
read, *Then* no wording describes a human's product change as wrong, incorrect, a
mistake, an error or a correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 (R11, R12)** — *Given* a line whose current product differs from the one the
platform recommended, *When* the panel and the detail render, *Then* the platform's
original recommendation is shown **unchanged**, and a comparison of the line's current
product against the **same** requirement is shown beside it.

**WHY-AC-23 (R12)** — *Given* a line whose product is unchanged but whose variant/glazing
differs from the recommended one, *When* the surface renders, *Then* the same both-shown
treatment applies — frame *or* glazing counts as a change.

**WHY-AC-24 (R11 — negative)** — *Given* a line where neither frame nor glazing has
changed, *When* the surface renders, *Then* no human-selection block appears at all.

**WHY-AC-25 (R23 — the target does not move)** — *Given* a line whose product a human
changed, *When* the panel and the detail render, *Then* the requirement shown is exactly
the one the platform recorded at selection time — same caps, same basis label — and **no
code path re-resolves, recomputes or re-derives a requirement from the line's current
product.** Only the selection side of the comparison moves.

**WHY-AC-26 (R23 — negative, structural)** — *Given* the read surface's code, *When* it is
reviewed, *Then* it contains no call to any requirement-resolving function and no
recomputation of caps; the requirement is read from the stored run and nowhere else.

**WHY-AC-27 (D3, D5 — the mechanism and its gap)** — *Given* a line whose make-up was
changed after the capture shipped, *When* the comparison renders, *Then* it compares the
**stored** figures against the run's recorded caps, stating whether they meet, sit within
the stored tolerance band, or miss — in the vocabulary of WHY-AC-17, with no wording that
frames the change as an error (R2). *Given* the figures are absent — changed before the
capture shipped, or resolved to null — *Then* it states that they were not recorded, still
shows the requirement and the platform's recommendation unchanged, and makes no live
lookup.

**WHY-AC-28 (R24 — attribution)** — *Given* a line whose current product+variant differ
from the configuration the platform recommended, *When* the panel renders, *Then* the
current selection is attributed to a person and never to the platform: the "Chosen" line
says a person chose this product and names what the platform had recommended instead, and
no wording anywhere presents the line's current product as the platform's pick.
`ASSUMED:` §13.10 — R6's three labels are kept and only the third line's sentence changes.

**WHY-AC-29 (R24 — the trap, and the test that catches it)** — *Given* a line the
estimator created (`origin = 'ai'`, `ai_proposal_line_id` set, so `aiManaged` at
`ops.ts:1039` is still true) whose configuration a customer has since overridden, *When*
the panel renders, *Then* it says a person chose this product. The attribution is derived
by **comparing the recorded recommendation's product+variant against the line's current
product+variant** — never from `origin`, never from `ai_proposal_line_id`. The test
fixture is exactly this line: an implementation reading `origin` passes a fixture that
lacks it and fails this one.

**WHY-AC-30 (R24 — restoring the proposal)** — *Given* a customer restores the AI proposal
so the line's product+variant match the recommendation again, *When* the panel renders,
*Then* it reads as platform-made once more and no human-selection block appears — the same
comparison, run again, with no state to unwind.

**WHY-AC-31 (R24 — negative, the data is not re-stamped)** — *Given* the diff for this
feature, *When* it is reviewed, *Then* no code path writes `quote_line.origin` or
`ai_proposal_line_id`, and `aiManaged`'s behaviour at `ops.ts:1039` is unchanged —
provenance for display is derived, and routing provenance is left exactly as it is.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — *Given* a composite parent line whose `composite_origin` is `'ai'`
and whose opening resolves to a selection run, *When* the line page opens, *Then* the "Why
this product" panel **appears**. (The mock's rule — *"THE WHY PANEL DISAPPEARS ENTIRELY"*
— is void, and `LineReview.tsx:38-45` states the superseded rule in its header comment.)

**WHY-AC-33 (R15)** — *Given* such a composite, *When* the detail opens, *Then* it shows,
in this order: the split reason — the make-up that won and the single unit it beat
(`parentRepresentative()`) — and then each lite's own band.

**WHY-AC-34 (R16)** — *Given* a split whose `segment_requirements_json` and
`segment_requirement_basis` are populated, *When* the per-lite section renders, *Then*
each unit states its own caps and its own origin label — an awning lite at 0.37–0.41
beside a fixed lite at 0.50–0.56 reads as two different bands, not one.

**WHY-AC-35 (R16)** — *Given* a unit with no recorded band, *When* the per-lite section
renders, *Then* that unit says its band was not recorded, and no band is computed for it.

**WHY-AC-36 (R16)** — *Given* a split whose `segment_thermal_review` records a review flag
on a unit, *When* the per-lite section renders, *Then* that flag is shown against that
unit.

**WHY-AC-37 (R17, D6)** — *Given* a composite whose `composite_origin` is `'ops'`, *When*
the line page opens, *Then* the WHY-AC-8 treatment applies — a person decided this split,
with each unit's own figures where they are recorded — and no machine rationale, split
reason or alternatives list is shown.

**WHY-AC-38 (R14, `splitNote`)** — *Given* a run that recorded a make-up was attempted and
no frame system could supply it, *When* the detail opens, *Then* that fact is stated.

### 9.5 No action, anywhere on this surface (R28, R1, R29)

R28 removed the one control this surface was going to have. **That absence is the design,
not a gap** — say it here so a later reader does not helpfully restore it.

Owner, on the shape: *"the panel does not require actions, unless an action is chosen,
which is a separate screen anyway."* And on the control itself: *"Having a button implies
that some product must be preselected, which we don't have conceptually."* The alternatives
are list items and not choices (R10, WHY-AC-16); a "Change the product" button beside them
would have implied a selection the surface deliberately does not offer.

**R29 and D8 do not weaken this.** Back is how a reader leaves a screen they navigated to,
and a URL is how they arrive at one — navigation, not an action on the line.

**WHY-AC-39 (R28, R29 — the detail's only control is back)** — *Given* the detail screen
in any state, *When* every interactive element in it is enumerated, *Then* the only one is
the back control (WHY-AC-7a): no "Change the product", no button, no link, no menu, no X,
and nothing that navigates anywhere except back to the line page.

**WHY-AC-40 (R28 — negative, no route to a thing that does not exist)** — *Given* the ops2
route table after both phases, *When* it is enumerated, *Then* no line-editor route exists
— no `/edit` path, no stub, no placeholder page — and no code in ops2 references one. The
child routes this feature adds are exactly `drawing`, `drawing/u<N>` (Phase 2) and `why`
(Phase 3b). Nothing else.

**WHY-AC-41 (R28 — negative, and it applies to the panel too)** — *Given* the "Why this
product" panel on the line page, *When* its elements are enumerated, *Then* its only
interactive element is the one that opens the detail (WHY-AC-7), and on a line with no
detail (WHY-AC-8, WHY-AC-9, WHY-AC-10, WHY-AC-37, WHY-AC-11) it has none at all.

---

## 10. Abuse-case criteria (negative)

The read surface is staff-gated and read-only, but it exposes **which competing products
were considered and how they compared** — the sharpest competitive leak in the console.
The capture adds a write on paths that include the customer's own save route, and D8 plus
the drawing grammar add addressable URLs, which are new places to probe. These are executed
by the tester as real attempts, with the denial recorded; none is satisfied by reading the
gate's source.

**A note on status codes, corrected in revision 5.** Revision 4 asked for 401 for an
anonymous caller and 403 for a signed-in customer. **Those are the same case at this
boundary** — a customer session does not authenticate an ops route, so `resolveStaff` sees
no staff session either way and no state exists to tell them apart. The criteria below
therefore assert **one refusal for every non-staff caller**, following the console's
existing convention, and put the weight on the half that does not depend on a status code
and is what actually protects the business: **no candidate data in the raw response body.**

**X-AC-1 (one refusal, no data)** — *Given* a caller who is not staff — anonymous, a
signed-in customer including the one who owns the project, or a session that has expired —
*When* they request the rationale for a known line id, *Then* the request is refused with
the console's standard non-staff refusal, and the raw response body contains no product
slug, no tier, no thermal figure and no candidate of any kind.

**X-AC-2 (the refusal reveals nothing about the caller or the line)** — *Given* the
refusals returned to an anonymous caller and to a signed-in non-staff customer, *When*
they are compared, *Then* they are identical in status and body, so neither the existence
of a session nor the existence of the line can be inferred from the difference.

**X-AC-3 (the control that matters most — conclusions §1, R20)** — *Given* a signed-in
user whose staff role is `manufacturer` — the one identity that *does* hold a console
session and is still refused — *When* they request the rationale, *Then* `hasAssignedRole`
refuses them, and the raw body contains no competing product slug, tier, figure or count.
**Executed against the `why` URL as well as the endpoint** — a partner who guesses a URL
must still be refused.

**X-AC-4 (cross-project probe — the interaction AND the URLs, D8)** — *Given* a staff user,
*When* they request the rationale for a line belonging to a different project than the one
in the URL — **both by navigating within the console and by visiting
`/projects/:id/line/:lineId/why` directly** — *Then* the refusal is byte-identical to the
refusal for a line id that does not exist, and no candidate data is returned. A probe
cannot learn from the difference whether the line exists, and the new addressable surfaces
do not become the cheap way to ask. **The same holds for the drawing URLs**, which resolve
their line through the same record fetch — **including the ones the desk canvas pushes**
(VIEW-AC-13), which are the same addresses reached a different way and get no separate
path through the guard.

**X-AC-5 (R9, enforced server-side)** — *Given* any rationale response, *When* its raw
body is inspected, *Then* it contains **only** the candidates the surface may show (the
chosen one and at most four runners-up): no excluded candidate, no `exclusions[]` detail,
no `withheldIncomplete` entry. The ruling is enforced by what is sent, not by what is
rendered.

**X-AC-6 (R1, R2, R3, R28)** — *Given* the route table after both phases, *When* it is
enumerated, *Then* this feature has added **no** POST, PATCH, PUT or DELETE endpoint, and
`PATCH /api/ops/recommendation-outcomes/:id` is referenced by no client code. The **client**
routes it adds are `drawing`, `drawing/u<N>` and `why` — client routes are not endpoints,
and none carries a write.

**X-AC-7 (no free prose escapes)** — *Given* a rationale response for an opening whose
schedule row carried a free-text comment, *When* the raw body is inspected, *Then* it
contains no schedule comment text and no data belonging to any other opening, project or
account.

**X-AC-8 (the capture never trusts the client — ops)** — *Given* an ops line-edit request
whose body contains `uValue`, `shgc`, or any thermal field, *When* it is saved, *Then*
those body values are ignored entirely and the stored figures are the ones the server
resolved from the catalogue for the saved product+options.

**X-AC-9 (the capture never trusts the client — customer)** — *Given* a customer save
request whose body contains `uValue`, `shgc` or any thermal field, *When* it is saved,
*Then* those body values are ignored entirely. A customer can never write a thermal figure
onto a line, so a staff reviewer reading the panel is never reading a number the customer
supplied — which is the whole point of the panel.

**X-AC-10 (the capture never crosses a project)** — *Given* a save request naming a line
id that belongs to another project or another account, *When* it is processed, *Then* the
existing ownership guards refuse it unchanged, and no figure is written to any line
outside the caller's own project.

**X-AC-11 (Phase 1, the two gates on an irreversible write)** — CERT-AC-8: no verified
export, no strip. CERT-AC-13: a checkout whose own importers would undo the strip, no
strip. Both refuse and write nothing; both are executed as real attempts.

**X-AC-12 (Phase 1, blast radius)** — CERT-AC-11: no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | No money appears anywhere on this surface — R10 removes deltas and R3 makes stored prices stale. The line's existing Price panel keeps the account-preference rule unchanged. `ASSUMED:` §13.3 | R3, R10 |
| **Quote lifecycle — post-issue** | Panel absent entirely on order-line records, and the `why` URL refuses for such a line rather than serving one. | D2, WHY-AC-11 |
| **A catalogue import run after the strip** | No row regains the fields — the importers were fixed in the same phase. | CERT-AC-12 |
| **A strip launched from a stale branch** | Refused, naming the offending importer, before anything is written. | CERT-AC-13 |
| **A snapshot written after the removal** | `performance_json` simply no longer carries the fields — no literal placeholder, no preserved vocabulary. | CERT-AC-10 amendment |
| **`dataSource` on a dimension rule** | Untouched. Same token, different live concept — CERT-AC-3's predicate is narrow on purpose. | §2, out of scope |
| **The `ElevationLegend` export** | **Deleted**, together with the assertion that pinned it. Zero callers and no `.elev-legend` rule in any stylesheet — it could not render correctly if something called it. | VIEW-AC-12, D12 |
| **Enlarging a drawing from the record's desk canvas** | One push, to that line's own drawing address; back — control, Escape or gesture — pops once to the **record**, with the selected row and the canvas intact; the control carries the record's **reference**, never the line. | D11, VIEW-AC-13…17 |
| **A project served without a `public_ref`** | The back control shows the id — 36 characters — and is **capped as a display problem** (`src/ops2/styles/line.css:122-129`). Never a fallback to the project's title: that would reintroduce the vetoed vocabulary on exactly the records where the two back controls would then disagree. | VIEW-AC-15, §13.17 |
| **A reviewer who wants to change the product** | They leave this surface and use the console they use today. Nothing here offers to do it, by ruling. Direction for the future surface: §2.1. | R28 |
| **Leaving the detail** | Back, with the standard gesture, popping to the line page. Never "Done", never an X. | R29, D8 |
| **Leaving a line after enlarging a drawing** | **Two backs** — one closes the viewer, one leaves the line. Agreed cost of R31, named and accepted. **Not a bug; not to be collapsed.** *(From the canvas it is one back, to the record: only one entry was ever pushed.)* | R31, VIEW-AC-2d, VIEW-AC-14 |
| **A pasted drawing or `why` link, cold** | Renders with the surface open, resolved through the record fetch; back **replaces** to the line path rather than leaving the console. | VIEW-AC-2b, WHY-AC-7c/7d |
| **A malformed or out-of-range unit suffix** | Normalises by replace, growing no history. | VIEW-AC-2c |
| **A short wide viewport — 2560×1080, a common ops shape** | **Height binds.** The drawing is as tall as the space left after the chrome and the caption, and no taller; it does not grow to claim the width, because a landscape drawing that did would stand ~1790px tall on a 1080px screen and push its own caption off the screen. | VIEW-AC-1 |
| **A tall narrow viewport, and the phone** | **Width binds.** The drawing is as wide as the space allows and shrinks to fit; the caption stays visible with it. No fixed px or vh cap decides either case. `ASSUMED:` §13.18 | VIEW-AC-1 |
| **The drawing's own dimension leaders at the extremes** | They scale with the drawing — large on a big screen, a few px on a phone. **Indifferent to the criterion, because the caption states the size at every shape.** Their treatment is the design stage's. | VIEW-AC-1 |
| **Everything saved before Phase 3** | No figures, and no backfill: the honest absence (WHY-AC-9, WHY-AC-27). Accepted cost. | D5 |
| **A customer-configured line saved after Phase 3** | Thinner panel: who chose it, and its figures. | D6, D7 |
| **A customer overrides an AI-priced line** | The recommendation's snapshot is still cleared (it no longer describes the line); the customer's own figures replace it; the requirement does not move; the panel says a person chose it though `origin` still reads `'ai'`. | SNAP-AC-14, R23, R24 |
| **A customer restores the AI proposal** | The line reads as platform-made again, by comparison rather than by a flag. | WHY-AC-30 |
| **The catalogue is unreachable at save time** | Save completes, figures null, nobody is told. Never a refusal. | D6 hard constraint |
| **A product+options combination with no published variant** | Same: save completes, figures null. | SNAP-AC-6 |
| **A non-staff caller reaches an ops route or any new URL** | One refusal, no candidate data, and nothing inferable from the difference between an anonymous and a signed-in caller. | X-AC-1…4 |
| **A drawing whose notation a reader might not know** | Nothing is explained. The console's readers are estimators. | R25 |
| **A drawing whose accuracy is provisional** | Still said — mullion positions confirmed at technical review; an unsized opening drawn as a stand-in. Authority is not notation. | R25, VIEW-AC-8, VIEW-AC-10 |
| **The shared panel's other caller (Projects filter)** | Unmoved: same presentation, same dismiss control, existing tests green. Whether it is a modal at all is a future ticket. | WHY-AC-7b |
| **Offerability gating** | Products withheld as incomplete and candidates excluded for `offerability` never reach the client at all — enforced server-side (X-AC-5), not by client filtering. | R9 |
| **Delivery zones** | Not applicable; this surface reads no delivery fact. | — |
| **More than one selection run for an opening** | The most recent run by `created_at` is shown; older runs are not listed or merged. `ASSUMED:` §13.4 | R3 |
| **Null thermal figures** | Stated as not recorded. Never 0, never "—", never omitted silently — and distinguishable from "never captured" (SNAP-AC-8). | R6 |
| **`requirement.absent`** | "Had to meet" says there was no requirement; every candidate is then in `meets` by definition, and the "Chosen" sentence must not claim a thermal victory. | R4 |
| **A line whose opening cannot be resolved at all** | Same path as WHY-AC-8 — a person chose this product — never an error state. | R13 |
| **Catalogue moved since the run or since the save** | Stored facts only; no live lookup anywhere, at any time. | R3, D3 |
| **Certification** | Never appears on this screen in any phase, including before Phase 1 ships. | R5 |

---

## 12. Test-surface notes for the architect and tester

Not a test plan — twelve places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixture** must be an AI-originated line the customer has since
   overridden, with `origin` still `'ai'`. A fixture built from a manual line proves
   nothing about R24, because reading `origin` would pass it.
2. **SNAP-AC-2 is a source-level scan**, not a behavioural test — its whole value is
   catching the writer nobody remembered. It must assert a property of every match and
   never a count, and it must fail rather than pass when its own match set is empty or
   smaller than the design's index.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test**, not an ops one. The customer
   save is where a regression would be worst and where this feature has no other business.
4. **X-AC-1 must be executed for both callers separately** even though they receive the
   same refusal — X-AC-2 is precisely the assertion that they are indistinguishable, and
   it cannot be demonstrated by testing one of them.
5. **VIEW-AC-10 is a new assertion over untested ground; VIEW-AC-11 is a document edit —
   and after D12 the selector is a trap.** Searched 2026-08-24: **no suite anywhere asserts
   the drawing legend** — the only hits for its text are two prose comments in
   `scripts/tests/drawing.test.mjs` and an unrelated `legendText` fixture field. So the
   tester must not go looking for an existing assertion to update; there is none.
   VIEW-AC-10's scan is the element's **first** test, and it must be written against the
   *class* of copy — a check for the word "legend" alone would pass a viewer that still
   explained panel proportions in a sentence. **And once `ElevationLegend` is deleted
   (VIEW-AC-12), the `.elev-legend` locator can never match anything**, so a
   `toHaveCount(0)` on it becomes true by construction: harmless to keep, worthless as
   coverage, and fatal if it is the *only* thing standing behind VIEW-AC-10. The
   class-of-copy assertion is the coverage. *(Executed: the developer removed that
   count-zero assertion rather than leave a test that can never fail again, and replaced the
   pinning assertion with an inverted one that fails if the identifier returns to
   `Elevation.tsx` outside a comment — which is the right shape, because it fails on the
   thing that could actually go wrong.)* VIEW-AC-11 is satisfied by an edit to
   `ops2-record-correction.md`, not by a test run.
6. **WHY-AC-39/40/41 assert absences, which is the easiest thing to test badly.** Enumerate
   the surface's interactive elements and assert the *set*, rather than searching for the
   string "Change the product" — a differently-worded button would pass a string search.
   WHY-AC-40 is a route-table assertion, not a page test: a route nobody links to is
   invisible to a click-driven test but is still a route that exists.
7. **WHY-AC-7a must assert where back GOES, not what it looks like.** An icon test passes
   a control that renders a chevron and calls `dismiss()`. **A back control that does not
   truly go back is worse than an X**, because it promises the tree and does not deliver:
   assert that activating it — and the platform's standard back gesture — lands the
   reviewer on the line page, and that the URL changed on the way in (D8).
   **VIEW-AC-15 adds the other half of the same trap:** a back control that goes to the
   right place while *naming* the wrong one passes every navigation assertion. Assert the
   label and the destination **together**, in one test, or neither is pinned. **And before
   inventing a label, check whether the destination already has one somewhere in this
   console** — §13.17 was vetoed precisely because it did (`LinePage.tsx:201` names the
   record by its reference), and neither the spec nor the gate that approved it had looked.
   A label is a convention, and a convention that already exists is not a decision to
   re-take. **Two controls, two states:** the *page's* back control has a real pre-load
   state and keeps `Project`; the *viewer's* has none, so it has no fallback (VIEW-AC-15,
   revision 19). Do not test one against the other's expectations.
8. **VIEW-AC-2's numbers are the assertions, and this criterion inverted between drafts.**
   Revision 9 asserted `history.length` is *unchanged*, because this spec then had the
   viewer as an overlay; R31 makes the opposite true, so anyone reusing an earlier draft's
   test will assert the wrong thing confidently. Two numbers carry the weight: **"exactly
   one" entry pushed** (VIEW-AC-2) catches a viewer that pushes twice, and **"one pop" from
   all three exits** (VIEW-AC-2a) catches an orphan entry that only some exits clear. Test
   all three exits — control, Escape, system gesture — because a viewer whose Escape
   handler closes state without popping history leaves the address bar lying, which is the
   exact failure the route ruling rejected the state-only push to avoid.
9. **CERT-AC-3: the predicate is narrow on purpose, and the paths are not interchangeable.**
   A bare `dataSource` token match is the easy scan and the wrong one — it sweeps in the
   dimension-rule provenance at `types.ts:77`, a live and correct concept. And **the strip
   script and the importers live in different trees**: `sanity/scripts/strip-certified.mjs`
   versus `scripts/catalogue/*.mjs`. Revisions up to 12 conflated them; "correcting"
   CERT-AC-13's directory to match the allowlist would point its gate at the wrong tree and
   make it vacuous. Anchor non-vacuity on `catalogue.ts` **and** `import-wers.mjs`;
   CERT-AC-12's behavioural half runs against the pure `derive-estimator-fields` builder.
10. **THE RULE THIS FEATURE LEARNED SIX TIMES — a justification naming another consumer,
    another surface or another convention is a claim about the codebase, and it must be
    EXECUTED, not asserted.** Every instance took one grep to settle, and every one had
    already been believed by two or more careful readers:
    - **The writer index (§7.4).** A hand-maintained list of the sites writing a line's
      product: named 1, then 4, then 8, then verified at **15**.
    - **The `src/ops/api.ts:381` allowlist entry (§6).** Exempted as *"a legacy read
      surface this feature does not touch"*. Executed: both its producers had been removed,
      orphaning a live ops caption. The exemption is gone.
    - **VIEW-AC-12's premise (§8).** *"The customer site still uses it."* Executed:
      `ElevationLegend` is defined once and **called from nowhere**; the export was added
      **by ops2's own record work**. ops2 was the only consumer, and this phase removed it.
    - **The correction's own first draft**, which said "exactly one reference repo-wide".
      The Codex stop-gate caught it: the identifier appears in an ADR, four documents, a
      test and three source files. **A count is a claim too.** "No caller" is checkable
      and stays true; "one hit" was neither.
    - **The corrected criterion's own survival argument (revision 16).** Revision 14 kept
      the export because *"this phase removes a render, not an API"* — a distinction that
      silently assumed there was a working API to preserve. Nobody had checked the
      stylesheets. **There is no `.elev-legend` rule anywhere**, so the retained export
      could not have rendered correctly for any future consumer either.
    - **And the absence that is the same defect inverted (revision 17): §13.17's label.**
      The spec proposed a *new* convention for naming the project record without checking
      whether the console already had one. It did — `LinePage.tsx:201` — and the owner
      vetoed the invention. **"There is no precedent" is a claim too**, and it is the one
      nobody thinks to grep, because an absence does not announce itself.

    **A seventh instance closed itself the right way (revision 19), and it is the model.**
    VIEW-AC-15's *"falling back to `Project` while the record has not loaded"* was a claim
    about a **state**, and the state does not exist on that control. The developer executed
    it, deleted the unreachable branch, **and reported it as a spec defect instead of
    quietly not building it.** That is the loop working: a criterion that cannot be
    satisfied honestly is a defect in the criterion, and it comes back up the pipeline.

    **The tell is a sentence that sounds like verification and contains none:** "another
    consumer", "a legacy surface", "the customer site", "everywhere else", "somebody might
    use it", "there is nothing like this yet", "while it is still loading". Each is a
    testable statement about the repository dressed as a reason. When one appears in a
    criterion, an allowlist, an exemption or a piece of new copy, **run the grep before
    believing it** — and prefer a criterion that does not need the claim at all.
11. **A journey that no criterion names will be tested by nobody — and it is a later stage
    that adds them.** The desk-canvas enlargement (§8.1) was introduced at
    **architect-conformance time**, to satisfy VIEW-AC-5, after §8 was written. It was a
    correct decision that arrived in the one place with no route back to the spec: the
    reviewer stage. Nothing downstream noticed, because the tester walks *the criteria*, and
    there were none to walk. **When a review stage adds behaviour, the criterion is part of
    the fix** — and if it adds UI, so is the `scripts/tests/web/` coverage (VIEW-AC-17).
12. **A two-variable measurement proves nothing about which variable did the work.**
    VIEW-AC-1's round-1 test grew viewport width and height together — (1280,900),
    (1920,1080), (2560,1440) — and asserted the drawing got bigger. It passed a drawing
    governed **entirely by height**, which is why an ultrawide 2560×1080 got exactly what a
    1280×1080 window got. **Move one dimension per sweep, and assert the dimension that
    should have moved.** This is SNAP-AC-2's non-vacuity rule in a browser: a check that
    cannot fail for the reason the criterion exists is not coverage, it is a green light
    with nothing behind it. The same trap is waiting in any "it gets bigger / smaller /
    responsive" assertion, which is most of what a viewport test contains.

---

## 13. `ASSUMED:` register — every entry carries a state

**Why the states exist (added revision 15).** Two entries — §13.14 and §13.15 — were
**answered by the owner at Phase 1 sign-off, and Phase 2 was built against those answers**,
while this register still described them as open. Nobody noticed until the phase that
depended on them was complete.

That is worse than an unanswered assumption: a later reader would have thought a shipped
decision was still in play, and might have "resolved" it a second time, differently. So:

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED — and discharging one
> happens when the answer arrives, not when someone next reads the file.**

An `OPEN` entry that has already shipped says so, because vetoing it then costs rework
rather than an edit, and the owner deserves to know which kind of veto he is being offered.
**§13.13 and §13.17 are the worked examples**, and they cost differently: §13.13's veto
deletes code that had shipped, §13.17's changes one label in a control that had shipped an
hour earlier. Both were worth taking; neither would have been visible without the state.

**States:** `OPEN` — still assumed, still vetoable · `DISCHARGED` — the owner or the
architect answered it · `RETIRED` — the question dissolved · `VETOED` — answered against
the assumption.

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown, following R9 | **OPEN** — Phase 3b, not yet built |
| §7.2 | the `CandidateOutcome.dataSource` removal is the architect's to rule | **DISCHARGED** — ruled *remove*; ADR 0011; paid for with a `SELECTION_VERSION` bump; old `outcome_json` still parses (CERT-AC-9) |
| §7.3 | "3–5 next best" implemented as **4** runners-up, five rows total | **OPEN** — Phase 3b, not yet built |
| §7.4 | the `CONTEXT.md` corrections are the architect's to apply — Staff works for OpenFrame (a direct owner ruling), define "Manufacturer" (an inference, vetoable), plus the **Estimator** persona and the **human review gate** | **DISCHARGED — architect, verified applied 2026-08-25 (Phase 2 conformance review, design §11).** All four are live in `CONTEXT.md`: Staff works for OpenFrame, not AMJ (Actors → Staff); **Manufacturer partner** defined as an actor, `hasAssignedRole` the one predicate (Actors); **Estimator (persona)** defined, distinct from the subsystem and explicitly not an RBAC role (Actors); **Human review gate** defined as a stage between submission and issue (Language). The design §3 glossary additions (Captured figures, Selection attribution) are also in place ahead of Phase 3 |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record list's row glyph does not open the viewer; the row is already one navigation target (record spec P1-AC-24/35) | **OPEN — shipped in Phase 2.** A veto now costs rework |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded, rather than reconstructing from the deleted model's columns | **OPEN** — Phase 3b |
| 3 | **§11, GST** — no money at all on this surface | **OPEN** — Phase 3b |
| 4 | **§11, multiple runs** — the most recent run only; earlier runs are not listed | **OPEN** — Phase 3b |
| 5 | **WHY-AC-9** — where figures were never captured, the panel says so rather than reading the catalogue at display time | **OPEN** — Phase 3b |
| 6 | *(the capture's reach)* | **RETIRED** — D7 answered it: the capture extends to the customer save path |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 answered it: there is no such control |
| 8 | **SNAP-AC-12** — figures live in the existing `configuration_snapshot_json` rather than new columns; the architect may rule otherwise | **OPEN** — Phase 3a |
| 9 | **§7.4** — R22 applies to the estimator's own line-creating writers too; which files is the design's index | **OPEN** — Phase 3a |
| 10 | **WHY-AC-28** — on an overridden line, R6's three labels are kept and only "Chosen" changes its sentence | **OPEN** — Phase 3b |
| 11 | **§10** — the ops routes' existing uniform refusal is adopted as written rather than changed | **OPEN** — Phase 3b |
| 12 | *"the drawing viewer is an overlay… it keeps a dismiss control"* | **VETOED by R31.** Kept visible because the way it was wrong is the useful part: it reasoned from *"is it an overlay?"* when the question is *"does it ask a question and return an answer?"* |
| 13 | **VIEW-AC-12** — the `ElevationLegend` export is retained though it currently has **no consumer** | **VETOED — owner, 2026-08-25 (D12).** The criterion's own reason was that deleting the export was *"a separate decision that nobody has taken"*; the owner has taken it. Decided by evidence that arrived after revision 14: **zero callers repo-wide, and no `.elev-legend` rule in any stylesheet**, so the export could not render correctly even if called. VIEW-AC-12 now **requires** the deletion, together with the assertion that pinned it |
| 14 | **The URL grammar** — `/…/drawing`, `/…/drawing/u1`, `/u2`, … 1-based ordinals; `/…/why` for the detail | **DISCHARGED — owner, at Phase 1 sign-off (D9).** Chosen over putting the unit's own code in the address: the ordinal matches what the labels already imply, and does not couple the URL to a label that changes if units are reordered |
| 15 | **The viewer's title** — a unit shows its code (`W07A`); the line's own drawing is titled `Drawing`; the size sits in the caption | **DISCHARGED — owner, at Phase 1 sign-off (D10).** The title names the subject; the back control already names the line, and repeating it says the code twice |
| 16 | **VIEW-AC-1** — no fixed ceiling on the drawing's growth | **RETIRED — the wrong question, revision 18.** "Is there a ceiling?" dissolved once the round-2 measurement arrived: there is no *fixed* ceiling (the `720px` went in revision 16 and the `62vh` went now), but there is a real one — **the viewport itself, once the caption must stay visible.** Superseded by §13.18, which asks the question that actually has an owner in it. What was measured under this assumption: `height: 62vh; width: auto`, ~1278×893 at 2560×1440, **and the same drawing at 2560×1080 as at 1280×1080** |
| 17 | **VIEW-AC-15** — the canvas-opened back control is labelled with the **project's title**, truncated as `OpsPage` truncates, falling back to `Project` | **VETOED — owner, 2026-08-25.** Built as assumed, then vetoed within the same phase. **The precedent nobody had checked:** the line page's back control already names this destination by its **reference** — `src/ops2/projects/LinePage.tsx:201`, `label: record ? record.ref : "Project"`. The owner ruled for the reference: **one console-wide convention**, matching the control a reviewer already uses daily. Cost he accepted: a reference says which record, not which job. **Rework: the label expression only** — destination, exits, focus and the canvas fix were untouched. *(Revision 19: the `Project` half of this entry was never the viewer's to carry — that control has no pre-load state. It stays on the page-level control where the state is real. VIEW-AC-15 says so now.)* |
| 18 | **VIEW-AC-1** — the drawing claims **all** the space left after the viewer's chrome and its caption, at every viewport shape, and **the caption never scrolls out of view** | **OPEN — goes to the owner at acceptance.** The two things he might prefer instead: hold the drawing to a *share* of the screen (the deleted `62vh` was one such share), or let the caption scroll off an ultrawide so the drawing can claim more. **Recommendation: as written.** R21 makes the drawing the element that matters most, and a size you have to scroll to read is not a size statement — the same reasoning that produced revision 17's fence, applied to the drawing itself |

---

## 14. Decisions needed

**One, and it is tagged rather than blocking.**

**§13.18 — how much of the screen may the drawing claim?** The ruling in VIEW-AC-1 is that
the whole drawing and its caption are visible together and the drawing takes everything
left over, at every viewport shape. **Recommendation: as written** — R21 makes the drawing
the element that matters most in the product, and a size the reviewer must scroll to read
is not a size statement. The alternatives, if the owner wants one: hold the drawing to a
share of the screen (the deleted `62vh` was one, chosen by nobody), or let the caption
scroll off a very wide screen so the drawing can claim more. **Nothing is blocked** — the
assumption is what was built, it is one stylesheet rule either way, and he sees it at
acceptance with the rest of Phase 2.

**What closed in revision 19.** VIEW-AC-15's fallback clause described a state the viewer's
control cannot be in, and it is corrected rather than left for the code to satisfy with an
unreachable branch. The console's `Project` fallback stays where the state is real — the
page-level control — and the never-empty guarantee behind it is named in the criterion
(`record.ts:314`, `parseProjectRecord`, pinned in `scripts/tests/ops2-record.test.mjs`),
because **a fallback would have masked that pin and made it look optional**.

**What closed in revision 18.** §13.16 ("no ceiling on the growth") is **RETIRED** — the
measurement showed it was the wrong question. VIEW-AC-1's internal contradiction is resolved
into one guarantee rather than two requirements, and its verification is three
single-dimension sweeps (§12 note 12) rather than the two-variable test that let a
height-only implementation through.

**One thing stays with the design stage**, fenced rather than left loose: the drawing's
dimension leaders scale with it — large on a big screen, a few pixels on a phone. That is
indifferent to VIEW-AC-1 **because the caption states the size at every shape**. If the
ui-designer's answer ever needs the caption to move, change or disappear at some width, that
comes back here as a VIEW-AC-1 change, not a styling decision.

**Still OPEN and already shipped:** §13.1 (VIEW-AC-9, the record row's glyph) and §13.18.
The remaining OPEN entries belong to Phase 3 and will be live at that phase's gate.
