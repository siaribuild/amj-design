# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 24**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

**Phase 2 is ACCEPTED and DEPLOYED** — owner sign-off 2026-08-25, production version
`9285d642`. §13.18 confirmed as built.

**Revision 24 scopes a criterion that was too strong.** SNAP-AC-16 (revision 23) caught the
defect it was written for **and then over-caught**: the architect's re-walk found two writers
that breach it *as written* and are correct code (`proposal.ts:258` writes present-and-null
on a pick the predicate calls unmoved; `:441` refreshes when an estimator re-run re-picks the
same variant after a catalogue move). A criterion that condemns correct code is one an
implementer weakens at the inconvenient site rather than obeys.

**The architect's ruling, A6 (design §1.6): there are two kinds of writer and one honesty
invariant.** Best-effort writers *ask* the catalogue and can fail to get an answer;
**derivation writers ARE the derivation** and have **no failure channel that can write a
dishonest absence**. SNAP-AC-1's carry-forward half, SNAP-AC-9's application and SNAP-AC-16
are now scoped to best-effort writers, with derivation writers named **as a class with a
stated property** rather than as a list of sites — §7.0. SNAP-AC-16's first sentence is also
widened: present-and-null has **three** honest authors, not one. **The exemption is granted
here, by the spec, because the architect asked for it to be** — nothing is exempt because the
code assumed it.

**Revision 23 repaired a contradiction between two of this spec's own criteria.** SNAP-AC-1
said capture on every save that "sets or changes" the product; SNAP-AC-9 said stored figures
never change and nothing recomputes them. **An implementation satisfying the first as written
violated the second** — and one did, on the most common save in the product (A4, design
§1.4). §12 note 13 carries the shape; §12 note 14 now carries revision 24's, which is nearly
its inverse.

**Revision 22 reconciled the register against the design** after §13.8 and §13.9 were
reported as open while the architect had already ruled both. **A delegated answer lands in
another document and creates an obligation with no return address** — §13's preamble carries
the mechanism and its limit.

**Revision 21 retracted a false justification the owner corrected** — *"every save between
3a and 3b is a line that will have something to show"*. **There will be no saves between 3a
and 3b; the phasing is about manageability.** D5's accepted cost and SNAP-AC-10's no-backfill
ruling are untouched.

**Revision 20** recorded Phase 2's transferable rule (§12, opening): **an assertion that
cannot fail is worse than no assertion**. **Revision 19** corrected VIEW-AC-15, which
described a state its own subject cannot be in. **Revision 18** resolved VIEW-AC-1's internal
contradiction into one guarantee. **Revision 17** carried the owner's veto of §13.17;
**revision 16** carried D11 and D12.

Revision 15 gave every register entry a state; revision 14 corrected VIEW-AC-12's false
premise; revision 13 amended the CERT-AC-10 fence; revision 12 folded in the importers;
revision 11 closed VIEW-AC-2's mechanism; revision 10 folded in D8 and R31; revision 9
applied R29/R30 and added §2.1; revision 8 applied R28; revision 7 corrected a false claim
about an existing legend test; revision 6 applied the closed UX mock gate; revision 5
repaired two architect findings; revisions 2–4 folded in the owner's decision rounds.

**Decisions needed: none** (§14). One **named residual** is recorded for visibility at Phase
3a acceptance — an ops edit of an AI-priced line refreshes price, snapshots and figures to
the current catalogue even when nothing material changed. That is the branch's **pre-existing
contract**, not a defect this feature introduces.

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
   thermal bands written on every split since migration 0036 and read by nothing. A
   **thinner panel** for lines nobody's estimator ever evaluated (D6). **No action anywhere
   on it** (R28) — back is navigation, not an action (R29).
2. **The `certified` removal, depth (c)** — code, Studio schema, the values in the live
   documents, **the catalogue importers that would write them back**, and **the JSON
   snapshot builders whose source fields this removes** (R5, conclusions §5, design §2.6;
   CERT-AC-10's amendment). **Phase 1, and nothing else rides with it** (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7).** Every save that **moves
   a line's pick** — and every **validated re-derivation** by a derivation writer (§7.0) —
   records that product+variant's Uw and SHGC on the line, ops console and customer site
   alike. **A server write-path change, inside Phase 3.**
4. **A shared drawing viewer** for ops2 (R21, R25) — **a node in the navigation tree with
   its own route and a back control** (R31), replacing the line plate's side-panel
   enlargement, **and reachable from the project record's desk canvas** (D11, §8.1).
5. **Two changes to the shared `SidePanel`** (R26, R29): full-screen presentation on the
   phone, and a **back** control in place of "Done" — without moving the Projects filter
   panel, which was not part of this approval.
6. **The line-route URL grammar** — the `exact` drop and the drawing segments — **in Phase
   2, with the viewer**. Phase 3b adds only the `why` child. No new server endpoint anywhere
   except the rationale read.
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12) — added to scope at
   the Phase 2 tester gate, on evidence that it has no caller and no styles.

### Out of scope — and why

| Not built | Because |
|---|---|
| **"Change the product" — the control, and any placeholder for it** | **R28, and it is deferred rather than declined.** Owner: *"do not implement CTA change the product… ultimately, switching products is not part of the current run."* Supersedes D4. **Whoever picks this up is picking up an open design question — see §2.1.** |
| **Re-classifying the Projects filter panel** | Under R31's literal taxonomy the filter is arguably **not a modal either**. R26/R27's approval explicitly excluded moving it (WHY-AC-7b); the question becomes **its own future ticket**. A taxonomy discovered mid-feature does not get to reach a surface nobody approved changing. |
| ~~**Deleting the shared `ElevationLegend` export**~~ | **NO LONGER OUT OF SCOPE — reversed by the owner (D12)**, on evidence that arrived after: zero callers **and** no `.elev-legend` rule in any stylesheet. |
| **Renaming the dimension-rule `dataSource`** | `worker/lib/estimator/types.ts:77` uses the same token for a **different, live, correct** concept. CERT-AC-3's predicate is deliberately narrow. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4 (design §1.4).** It is a recompute of a captured snapshot (SNAP-AC-9), and during an outage it asserts "no figure exists" on a save that never successfully asked. SNAP-AC-1, SNAP-AC-6, SNAP-AC-16. **This does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling. Figures fetched at edit time for a product selected months earlier are a display-time catalogue read wearing a snapshot's clothes (SNAP-AC-10's reasoning), and they blur the three states. |
| **Conditioning the aiManaged branch on a new "material change" predicate** | A6's rejected alternative (design §8). The branch re-derives price, both snapshots and figures together at a validated save; splitting figures out of that would describe one variant at two different times in adjacent columns. The residual is named in §7.0 rather than designed around. |
| Any line editor in ops2, stub or real | Follows R28: with no control to reach it, a route to it is a route to nowhere. |
| Any deep-link into the legacy ops console | Was D4's rejected alternative; moot under R28. |
| Explanatory notation of any kind on a drawing surface | R25 — ops staff read elevations for a living. |
| Switching the line's product from the "Why" surface | R1: the surface is read-only. R28 strengthens this. |
| Recording a verdict on the recommendation | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3: *"snapshot at the time of recalculation/save. Not extracted in real time."* |
| Re-deriving, re-resolving or recomputing a thermal **requirement** anywhere | R23. |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | The R24 constraint. Provenance for display is **derived**, never re-stamped. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. |
| **Any change to the ops routes' authentication or refusal convention** | §10 — which is why §13.11 is RETIRED rather than open. |
| Any change to the learning corpus or the issue-time capture path | §7.6 — verified non-impact. |
| Live re-pricing, price deltas, or any money on the surface | R10, R3. |
| Excluded candidates, in any form | R9, verbatim owner ruling. |
| Backfilling anything — statuses, or figures onto lines saved before Phase 3 | R18 *"leave history"*. The owner accepted this cost explicitly (D5); **revision 21's retraction does not touch it.** |
| Carrying the rationale past issue | D2. Its own ticket if ever wanted. |
| The staff role vocabulary | Conclusions §8: same defect class, own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Conclusions §1: persona ≠ role. |
| Any customer-facing **display** change | Staff surface only. The customer-side change is a write. |

### 2.1 Deferred — how product switching might work

> ⚠️ **DIRECTION, NOT REQUIREMENT. NOTHING IN THIS SECTION IS TO BE BUILT.**
> A developer finding this section has found context, not work.

The owner's sketch, verbatim:

> *"this should be a new panel for switching indeed: X is gone from this view; cards for
> options are clickable; a click leads to a new confirmation screen; the screen shows
> something about the new choice with confirm/cancel as CTAs."*

1. **The two-panel split resolves the snapshot/live tension rather than working around it.**
   **Audit panel = what we decided then. Switch panel = what is true now.**
2. **The switching list is probably not the audit list.** A candidate excluded then may fit
   now; one that won then may since have been withdrawn. Expect its own query.
3. **Do not drop the dismiss from the switching panel.** Under R29/R31 that exit is back.
4. **The confirmation screen has four things to show, each a reason to abort:** whether the
   new choice still meets the requirement, the price, whether the line drops out of `ready`,
   and that the line stops being platform-chosen (R24).
5. **The learning path already handles it** — see §7.6.
6. **This is the decision surface the owner declined at grill Q1**, returning properly
   separated instead of bolted onto the audit view.

**Console convention it will inherit (R30).** *"modals have controls on top, btw, title
centered."* **No modal exists in this feature.**

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source, and
nothing below is inferred.*

**Two axes, never merged** — owner: *"let's not confuse actor as in persona that has it's
needs, and rbac enabled limitation what a persona can do on the platform!"* **Persona** is
who someone is and what they need; **RBAC** is what the platform permits (R20).

### Estimator (persona — new to the domain; the architect adds it to `CONTEXT.md`)

Owner: *"yes, estimator, as a persona, has the needs. But that does not need to translate
into a separate rbac role with limited feature set, not at this point of time."* Today the
persona is performed by one of the two owners — a staffing fact, not a model fact.

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

Read together: **confidence in the platform's reasoning, and speed through the review** —
not correction of the machine. R2 is the direct consequence and the copy must honour it.

**They read this surface; they do not act on it.** *"the panel does not require actions,
unless an action is chosen, which is a separate screen anyway."* **Going back is not an
action** (R29), and **back must return them where they were, saying where that is in the
words they already use** (D11, §8.1).

**And they already know how to read a drawing** (R25). **What they do need is to see the
whole of it at once** — VIEW-AC-1.

**And what they read must be what was established, not what a room-label edit last happened
to fetch.** A4 and A6 are that sentence applied to the capture: a figure on the panel is a
fact about a moment when something was actually selected, or it is not evidence at all.

### Customer (existing — newly relevant, via D6/D7)

Owner: *"human, as in client, manual picks do not have targets, but showing panel with
performance data is fine, I think. It simply means that this panel will be far less rich in
details."* And: *"a selection shall not be perceived as AI-made anymore"* — while *"that does
not change the target."*

The Customer is not a reader of this surface. What changes for them is invisible: what their
save *records*. The constraint is absolute — **their save must never start failing** (§7.2) —
and **an autosave that changes nothing about the pick must not touch their figures** (A4,
SNAP-AC-16): the customer save loop is the widest best-effort writer in the feature.

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame people.
AMJ is manufacturer.**"* Staff work for **OpenFrame**, not AMJ.

### Manufacturer partner (an RBAC exclusion, recorded to close it)

Not a persona this feature serves. `hasAssignedRole` already refuses them
(`worker/lib/staff.ts:150`). Recorded because **this surface exposes which competing products
were considered and how they compared**. §10 executes it as an abuse case rather than
trusting it.

### The stage: the human review gate

Between submission and issue, where the platform's recommendation is confirmed or overridden.
A stage in a quote's life, not a persona and not a role.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

Three independently deployable phases, in this order. Pipeline stages 1–8 run **per phase**.
Phases 2 and 3 share one UX mock gate, now **closed**.

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Delivers on its own:** thermally-constrained lines stop being downgraded to "indicative
estimate only" because of a flag nobody asked for. 13 of 32 products rejoin the ladder on the
same footing as the other 19, and legacy variants the catalogue loader silently *dropped*
(`catalogue.ts:187`) become candidates again.

**The importers are in this phase (design §2.6).** `import-wers.mjs:135` and
`derive-estimator-fields.mjs:112-113` write the fields back onto every row: **a Phase 1 that
ships with a known expiry is not Phase 1.** After CERT-AC-6 the Studio schema no longer
declares these fields, so a post-strip import would write data the Studio can neither display
nor validate.

**And two JSON snapshot builders are in it, which breaches the fence — CERT-AC-10's
amendment.**

**Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker code **plus
the four importer edits** → Studio deploy → verified dataset export → strip dry-run →
`--apply`. **The strip is last, and final.**

**Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — The shared drawing viewer, **and the line-route URL grammar** · **SHIPPED**

**Accepted and deployed 2026-08-25**, production version `9285d642`.

**Delivered on its own:** the element the owner rates highest in the product is readable at
full size from every ops2 surface that draws an opening as its subject; on a composite, a
unit can be examined alone, addressably.

This phase owned: the **`exact` drop** and the whole child-route grammar;
`/projects/:id/line/:lineId/drawing[/u<N>]`; replacing the plate's `SidePanel` enlargement
(VIEW-AC-6); **the record's desk canvas as an opener surface** (§8.1, D11); **the
`ElevationLegend` deletion** (VIEW-AC-12, D12).

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a — a server write-path change (§7).** `worker/**`, so **Probity applies**. It
  carries the feature's only regression risk, and §7.2 is where that risk is pinned.
- **Phase 3b — a read-only display surface (§9).**

**Presentation and navigation model are separate things, and this spec specifies both.**
Presentation — a right-hand slide-out at desk width, full screen on the phone (R19, R26).
Navigation — a **screen in the tree** with its own route (R29, D8), opened by a route change,
never by `setOpen(true)`.

**The cost the owner accepted (D5):** the capture does not ship until Phase 3, and there is
no backfill, so **every line saved before Phase 3 has no figures** (WHY-AC-9, WHY-AC-27).

**Sequencing inside the phase:** 3a lands first and alone — red test, then the write, then
its negative criteria green — before any read endpoint or UI work starts.

**Why, corrected 2026-08-25.** Because 3a is a **server write-path change touching every
writer of a line's product** — fifteen verified sites, both consoles, and the customer's own
save route — and a change with that blast radius can be verified on its own in a way it never
can folded into a display feature. **A4 and A6 are the evidence for that reasoning, arriving
after it was written:** both defects were *silent writes on unrelated saves*, invisible to any
test of the display surface and to any reviewer reading the panel.

> **~~The reason this paragraph used to give:~~** *"Shipping the capture even a few days ahead
> of the surface is worth more than tidiness: every save in between is a line that will have
> something to show, and a save that is missed cannot be recovered."*
>
> **That is false, and it is retracted here rather than deleted.** The owner, 2026-08-25:
> **there will be no saves between 3a and 3b. The phasing exists to make the change
> manageable, nothing more.** No production window depends on the gap, so **nobody may accept
> a schedule risk, a shortened review or a rushed deploy on the strength of it.**
>
> **Same defect class as the six in §12 note 10, in a new shape:** those were claims about the
> **codebase**, settleable with one command. This was a claim about the **world**.
>
> **What this does NOT change.** D5's accepted cost and SNAP-AC-10's no-backfill ruling stand
> exactly as written. **The owner has not reversed his own ruling.**

**Dependency check:** Phase 3 does not technically depend on Phase 1. **3b depends on Phase
2** for the route grammar, which has shipped. 3b depends on 3a for anything a human selected
to have figures at all.

### Wayfinder check

**Not needed.** 31 rulings, fourteen owner decisions, six architect rulings taken out loud in
design §1, a verified join path, and a closed mock gate.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label ·
R5 no certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen +
3–5 next best · R9 no excluded · R10 no price deltas · R11 human change shows both ·
R12 frame or glazing = changed · R13 no-run lines still show the panel · R14 panel on
machine-proposed composites · R15 split reason then per-lite bands · R16 per-lite bands are
real · R17 ops split = R13 · R18 leave history · R19 right-hand slide-out · R20 same gate as
the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** *"every save should record thermal properties of
selected at a time product."* One rule, every writer (§7.1). **A4 and A6 sharpen what "every
save" means without weakening the rule: every save at which a product is actually
selected — a moved pick, or a validated re-derivation.**

**R23 — a target is not a selection.** **R24 — an overridden selection must no longer read as
platform-made**; attribution is **derived by comparison**, never read from `origin`.

**From the closed UX mock gate:**

**R25 — no explanatory notation on an ops drawing surface.** *"i don't think lines like this
relevant for ops"*. **A class, not a block.** What goes: anything teaching the reader how to
read the drawing. What stays: statements about its **authority**.

**R26 — the phone detail opens full screen.** **~~R27 — an X~~ AMENDED BY R29**; what
survives is that **"Done" is wrong**. **R28 — "Change the product" is not implemented, and
neither is a placeholder** (supersedes D4). **R30 — modals carry controls on top, title
centred**; **no modal exists in this feature**.

**R29 — the detail is a screen in the navigation tree; its dismiss is a BACK control.**

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka
> Confirm/Cancel). Everything that is not modal - has back an action plus whatever gesture it
> lives with as standard."*

**R31 — the drawing viewer is a tree node with a back control, not a modal.** This vetoed
`ASSUMED:` §13.12. The cost was named and accepted: **two backs to leave a line after
enlarging** (VIEW-AC-2d).

> **A modal is only a decision dialog — something that asks a question and returns an
> answer.** Everything else a reader can be *in* is a node in the tree, with back.

**Three careful readers independently placed the viewer on the modal side** — each reasoning
from "it is an overlay" rather than from "does it ask a question?".

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures
snapshotted at save, never read live · ~~**D4**~~ *(superseded by R28)* · **D5** the capture
waits for Phase 3; the loss of figures for everything saved before it is accepted — ***about
lines saved BEFORE THE CAPTURE EXISTED, which is history; never about a gap between the 3a
and 3b deployments*** · **D6** a client/manual-picked line shows a thinner panel **with** its
product's figures · **D7** the capture extends to the customer save path · **D8** the detail
screen gets its own URL · **D9** the URL grammar, 1-based ordinals · **D10** the viewer's
title names the subject · **D11** back from the canvas returns to the record and the control
says so · **D12** `ElevationLegend` is deleted · **D13** the drawing claims all leftover
space and the caption never scrolls · **D14** the phasing is about manageability, not urgency.

### Architect rulings — delegated by this spec, taken in `docs/design/ops2-why-this-product.md` §1

**These are decisions, not opinions.** They are indexed here because the register was twice
found reporting a settled question as open, and an index the product-manager maintains is
what gets read at a gate.

- **A1 (§1.1) — storage: a new column, `quote_line.performance_figures_json`.** Overrides
  `ASSUMED:` §13.8. Migration `0058_quote_line_performance_figures.sql`.
- **A2 (§1.2) — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 (§1.3) — `CandidateOutcome.thermal.dataSource` removed from the contract**,
  `ladder-v1` → `ladder-v2`. Discharges conclusions §7.2; ADR 0011.
- **A4 (§1.4) — the capture fires when the pick moves, never on a save that leaves it
  untouched.** Raised by the developer as a judgement call and independently by the Codex
  review; **not a taste question but a breach of SNAP-AC-9**. Changed SNAP-AC-1, scoped
  SNAP-AC-6, added SNAP-AC-16.
- **A5 (§1.5) — a singleton answer set is not ambiguity.** Ambiguity, and its null, begin at
  **two** surviving variants. Governs the design's own ambiguity `ASSUMED:` and is **vetoable
  at acceptance as one pair with it**.
- **A6 (§1.6, 2026-08-25) — a validated re-derivation is a capture moment.** Two classes of
  writer, one honesty invariant (§7.0). **Best-effort writers** ask the catalogue and can
  fail; A4's predicate governs them. **Derivation writers** *are* the derivation and have **no
  failure channel that can write a dishonest absence**; for them the pick-moved predicate is
  the **wrong condition**, because dims/qty edits must reprice, and carrying figures alone
  while `line_total`, `pricing_snapshot_json` and `configuration_snapshot_json` re-derive **in
  the same statement** would describe one variant at two different times in adjacent columns.
  **Scopes SNAP-AC-1's carry-forward half, SNAP-AC-9's application and SNAP-AC-16** (§7).

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5, conclusions §5)** — *Given* a product whose thermal figures come only from
legacy `performanceVariants` with `certified` absent or false, *When* a project estimate runs
against an opening that has a thermal requirement, *Then* the resulting line's status is not
`commercial_only_estimate` on account of certification, and the variant is ranked on its
Uw/SHGC figures alone.

**CERT-AC-2 (the drop-guard)** — *Given* a legacy variant that would previously have been
removed by the guard at `catalogue.ts:187`, *When* the catalogue is loaded, *Then* the variant
is present in the candidate set, provided it still passes the non-certification checks.

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** — *Given*
the repository after this phase, *When* a source-level scan walks **all live source** —
`worker/**`, `src/**`, `scripts/**`, `sanity/**`, comments stripped — *Then* it finds no
occurrence of `isCertified` or `energyCertified`; `certified` as a field name or written
value; or `dataSource` **only** where it is valued `"certified" | "estimated" |
"manufacturer"`, or written/projected on a performance variant or thermal-profile row.

**The narrowness is deliberate and must be preserved.** `dataSource` has a **second, live,
correct meaning** — dimension-rule provenance at `worker/lib/estimator/types.ts:77`. A scan
written the easy way passes today and costs a pointless refactor tomorrow.

**Allowlist — two entries, each with its reason:**

| Allowed | Why |
|---|---|
| `scripts/tests/**` | A test that asserts the field is gone has to be able to name it. |
| `sanity/scripts/strip-certified.mjs` | The script whose entire job is removing the field must name it. |

> **Two corrections here, revision 13, both from the tester⇄developer round.** The
> allowlisted path was wrong — **no `scripts/catalogue/strip-certified.mjs` exists**; the
> strip script is under `sanity/scripts/`. CERT-AC-13's scanned directory,
> `scripts/catalogue/*.mjs`, **was and remains correct**: the importers really do live there.
> The two paths look like the same mistake and are not. **And a third entry is gone
> entirely** — `src/ops/api.ts:381`, exempted as *"a legacy read surface this feature does not
> touch"*. **The tester executed that claim and it was false.** See §12 note 10.

**Non-vacuity:** the walk must be **shown to have reached** `catalogue.ts` and
`import-wers.mjs`.

**And `certificationRef` / `wersWindowId` are still read and still carried** — a WERS
reference is a real fact about a product; it simply is not a gate.

**CERT-AC-4 (R18)** — a stored `commercial_only_estimate` from a run before this change is
unchanged, and the diff contains no migration and no script that rewrites a stored status.

**CERT-AC-5 (status coherence)** — a line outside the `meets` tier, or whose rules run raised
a warning, is still downgraded for **that** reason; only certification-caused downgrades go.

**CERT-AC-6 (Studio schema)** — no "Certified" boolean, no "Data source" dropdown, the
validation rule that tied them gone, the WERS reference field still editable.

**CERT-AC-7 (document values, depth (c))** — *Given* a dated export taken and verified
restorable, *When* the strip completes, *Then* no document carries `certified` or a variant
`dataSource`, every `certificationRef` / `wersWindowId` is byte-identical to the export, and
no other field differs.

**CERT-AC-8 (export gate — abuse case)** — no verified export, no strip: it refuses and
writes nothing.

**CERT-AC-9 (contract stability)** — *Given* **A3**, *When* an `outcome_json` written before
this change is parsed, *Then* it parses without error, and no surface renders the field.

**CERT-AC-10 (the fence) — AMENDED 2026-08-24. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…and **no application save path**."* **No longer
> true, and the amendment is recorded rather than the criterion rewritten** — a fence that
> quietly widens to admit whatever arrived is not a fence.

*Given* the diff, *Then* it changes no file under `worker/lib/staff.ts`, no role CHECK
constraint, no migration, and **no application save path other than the JSON snapshot
builders whose source fields this phase deletes** — `worker/lib/ai/proposal.ts:375` (written
at `:415`) and `worker/lib/estimator/splitCandidates.ts:356`.

**Why the breach is necessary, not creep.** The only alternative is writing **literal** values
for fields whose source data no longer exists — a removal with a copy kept.

**What still holds, and it is most of the fence.** No migration, no role vocabulary, no schema
change, no column added or dropped, **no statement's column list or WHERE clause altered**.
The breach is confined to the **contents of a JSON blob**. A future amendment that cannot make
the same distinction should be refused.

**The catalogue importers remain inside the fence** — operator-run Sanity maintenance scripts
that serve no request.

**CERT-AC-11 (blast radius)** — no customer-facing response body gains or loses a field, and
no price changes for an already-priced line.

**CERT-AC-12 (durability — the strip does not expire)** — running the importers as an operator
would, **no row regains `certified` or a certification-valued `dataSource`**. Proved
behaviourally against the pure builder **and** by source scan.

**CERT-AC-13 (the strip refuses a stale checkout)** — run from a checkout whose own
`scripts/catalogue/*.mjs` still writes those fields, the strip **refuses and writes nothing**,
naming the offending file. The two paths are deliberately different trees.

**CERT-AC-14 (deploy order — the strip is last, and final)** — worker code **and the four
importer edits** → Studio deploy → verified export → dry-run → `--apply`. CERT-AC-8 and
CERT-AC-13 enforce the preconditions rather than trusting the operator to remember them.

---

## 7. Acceptance criteria — Phase 3a: the universal capture (R22, D3, D6, D7)

**Why this is its own phase.** **Not urgency** — see §4's retraction. It is separate because
it is a **server write-path change with the widest blast radius in this feature**, it falls
under Probity so its failing test comes first, and §7.2's negative criteria are worth proving
against a deployment in which nothing else moved.

**Where the figures live is settled: A1.** A **new nullable column**,
`quote_line.performance_figures_json`, migration `0058_quote_line_performance_figures.sql`.

**When they move is settled: A4 and A6.** §7.0 defines the two terms every criterion below
depends on — *the pick*, and *the two classes of writer*.

### 7.0 The two definitions every criterion below depends on

#### The pick (A4)

**The pick is exactly the resolver's inputs:** `product_slug`, `selected_variant_id`, and
`options.glazing` — the glass identity every pricing path already reads (`lib/lines.ts:164`).

- An option the resolver never consults — **colour, hardware, the room label, dimensions** —
  cannot move the figures, because it cannot change what the resolver would answer.
- A pick that names **no** variant does not move the variant term; only an explicit,
  **different** `variantId` does (the restore path).
- **The predicate lives once**, in `worker/lib/figures.ts`, and is never re-derived at a call
  site that already has the stored row in hand. Two copies of a "did it move?" test is two
  answers waiting to disagree.

#### The two classes of writer, and the one invariant (A6 — new, revision 24)

> **The honesty invariant, and it is what a new writer must be tested against:**
> **no writer may assert an absence it did not establish.**

Everything else follows from which writers *can* violate it:

- **Best-effort writers** — they **ask** the catalogue for a figure and must succeed even when
  it cannot answer. **They have a failure channel**, so a re-resolve on an unmoved pick can
  only degrade or lie: at best it recomputes a captured snapshot (SNAP-AC-9), at worst it
  writes "no figure exists" on a save that never successfully asked. **A4's predicate governs
  them**: carry when unmoved, resolve fresh when moved.
- **Derivation writers** — they **are** the derivation. The figures come from the same
  validated or estimator-selected in-memory variant that produces the product, the price and
  both snapshots **in the same statement**. **They have no failure channel that can write a
  dishonest absence**: the path refuses before writing anything when the catalogue will not
  answer, and any absence they do write is the deliberate record of an evaluation that
  actually happened. **For them the pick-moved predicate is the wrong condition** — a
  dimension or quantity edit does not move the pick but must reprice, and carrying figures
  forward while `line_total`, `pricing_snapshot_json` and `configuration_snapshot_json`
  re-derive beside them would describe **one variant at two different times in adjacent
  columns**, which is the disagreement one-place-per-fact exists to prevent. **A derivation
  writer's validated save is a capture moment by its own contract, whether or not the pick
  moved.**

**Membership is a property, not a list.** A writer is a derivation writer **only if it cannot
write an absence it did not establish** — it refuses rather than writes when the catalogue
will not answer, or its absence values are a deliberate record of an evaluation that occurred.
**The concrete membership is the design's** (§4.2, currently W1-aiManaged and W6–W9) **and it
has already grown once**: A6's re-walk found two sites nobody had questioned. A criterion
written against the list would have condemned them; one written against the property does not,
and it still catches a new writer that quietly acquires a failure channel.

**The residual, named rather than hidden (A6).** An ops edit of an AI-priced line refreshes
price, snapshots **and** figures to the current catalogue even when nothing material changed.
That is **the branch's pre-existing contract** — the price behaved this way before Phase 3a
existed — and whether non-material ops edits should re-validate at all is a **product question
about that branch**, not a figures defect. Not this phase's scope, not carried as a defect,
and visible at Phase 3a acceptance so the owner can rule if he wants to (§14).

### 7.1 One rule

Owner, verbatim: *"every save should record thermal properties of selected at a time
product."* This is **one rule with many sites**, not a set of per-route features.

**SNAP-AC-1 (R22 + A4 + A6 — the rule)** — *Given* a save whose **stored pick actually differs
after the save** from what the row held before it (§7.0), **or** a **validated re-derivation
by a derivation writer** (§7.0), *When* it completes, *Then* the line's
`performance_figures_json` carries that product+variant's `uValue` and `shgc` as they stood at
that moment — regardless of which route performed the save, and regardless of whether a person
or the platform chose the product.

*And the other half, scoped by A6:* **Given a save by a BEST-EFFORT writer that leaves the
pick untouched** — a room label, a colour, a dimension, an autosave that changed nothing —
*When* it completes, *Then* the line's `performance_figures_json` is **carried forward
verbatim** (figures stay figures, present-and-null stays present-and-null, a pre-capture
`NULL` stays `NULL`) and **no catalogue read is made for that line at all**.

> **Why this needed sharpening (revision 23), recorded rather than silently reworded.**
> *"Sets or changes"* admits the reading that a save writing the same value counts as setting
> it — **and that is the reading that shipped.** A room-label edit during a Sanity outage
> overwrote a good capture with present-and-null, asserting *"the catalogue has no figure for
> this product"* on a save that never successfully asked. The reported branch was the mild
> case: **W3 rewrote every ordinary line's figures on every customer project save, and W2
> re-resolved on dims-only edits** (design §1.4).
>
> **It was never a taste question. It breached SNAP-AC-9** — re-resolving an unmoved pick
> against today's catalogue is a recompute. See §12 note 13 for the shape.
>
> **And why the carry-forward half is scoped to best-effort writers (revision 24, A6).** A
> derivation writer re-derives figures with the price and both snapshots in one statement; the
> unscoped rule would have condemned that as a breach, and the pressure would have been to
> weaken the criterion at the inconvenient site. See §12 note 14.
>
> **No opportunistic backfill on touch.** A pre-capture line that is edited by a best-effort
> writer does not quietly acquire figures: a lookup at edit time for a product selected months
> earlier is a display-time catalogue read wearing a snapshot's clothes (SNAP-AC-10's
> reasoning), and it blurs the three states SNAP-AC-8 depends on.

**SNAP-AC-2 (R22 — structural, and the only mechanism that has actually worked)** — *Given*
the repository after this phase, *When* a source-level scan enumerates **every** statement
anywhere under `worker/**` that writes `quote_line.product_slug` or
`quote_line.selected_variant_id` — routes and libs alike, including statements built in
helpers and those inside batched arrays — *Then* every one of them also writes
`performance_figures_json`, and a writer added later that sets a product without figures fails
this test.

- **It encodes no count.** The number has been wrong three times (§7.4); the property has not.
- **It cannot pass vacuously.** The scan asserts its own match set is non-empty and at least
  as large as the design's index. **Its file reach is whatever its list says** — §12's closing
  note.

*Neither A4 nor A6 weakens this:* every scanned statement still names the column. What changed
is only how the **bound value** is derived.

**SNAP-AC-3 (R22 — one place per fact)** — the display surface reads the line's own record —
not `candidate_result`, not the catalogue.

### 7.2 The hard constraint — capture is never a gate

This comes first among the constraints because it is the one way this feature could damage the
product.

**SNAP-AC-4 (negative — no new refusal, ops)** — an ops line edit that succeeds today on a
line where **no** performance variant can be resolved still succeeds, with the same status,
stored values and price; **no** `configuration_not_eligible`, no 409 and no other refusal is
introduced. *(A path that already refused before Phase 3a — the aiManaged 409 — is not a new
refusal and is not weakened by this criterion.)*

**SNAP-AC-5 (negative — no new refusal, customer)** — a customer save that succeeds today
still succeeds, `line_total` and `status` identical, and no new validation, eligibility check
or error path exists on that route.

**SNAP-AC-6 (best-effort resolution — scoped by A4 and A6)** — *Given* **a best-effort
writer's save that moved the pick** (§7.0) to a product+options combination for which the
catalogue offers no matching published variant, or for which the catalogue is unreachable,
*When* the line is saved, *Then* the save completes, the figures are stored as
**present-and-null**, and the failure is not surfaced to the person saving.

*The scope is the whole point.* On a save that did **not** move the pick there is nothing to
resolve, nothing to store and nothing to fail. **Present-and-null is honest here**, where the
stored figures would otherwise describe a configuration the row no longer has: a stale figure a
reviewer trusts is precisely what this rule exists to prevent.

**SNAP-AC-7 (no latency regression on the customer path)** — the catalogue is consulted at
most once per save request, not once per line, and a timeout ends the same way as SNAP-AC-6.
**Lines whose pick did not move contribute nothing to that request**, so the common autosave
consults the catalogue not at all.

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — *Given* a save where a figure is genuinely
unknown, *Then* the key is present with a null value — present-and-null, so a later reader can
tell "no figure exists for this product" apart from "this line was saved before the capture
shipped".

*Under A1 the three states are structural rather than inferred:* column `NULL` = saved before
the capture existed; `{"uValue":null,"shgc":null}` = captured, no figure exists; numbers =
captured.

**SNAP-AC-16 (A4 + A6 — negative; every present-and-null was established, revision 23,
scoped 24)** — *Given* any line whose stored figures are present-and-null, *When* the write
that produced that value is traced, *Then* it is **one of the three honest authors**:

1. a **best-effort** save that **moved the pick** and could not resolve a figure (SNAP-AC-6);
2. a save that **successfully resolved** a published variant which genuinely carries no
   figures — the answer was established, and the answer is "none recorded";
3. a **derivation writer's** deliberate absence — the record of *"evaluated, nothing
   chosen"*, written from an evaluation that actually happened (§7.0).

*And the negative, scoped by A6:* **Given a BEST-EFFORT writer's save that did not move the
pick** — **including one attempted while the catalogue is unreachable** — *When* it completes,
*Then* the stored figures are byte-identical to what they were before it, and **no
present-and-null is written**.

**This is the criterion an implementation is tested against directly, and the behavioural test
is exact:** capture figures on a line, make the catalogue unreachable, edit the room label,
assert the figures are unchanged. It fails loudly against the code that shipped in 3a's first
cut and passes against A4's rule.

> **Read it against the invariant, not against a list of sites (§7.0).** What this criterion
> forbids is **asserting an absence you did not establish**. All three authors above
> established theirs; a best-effort re-resolve on an unmoved pick establishes nothing, which is
> why only that case is forbidden. **A tester executing this criterion must classify the writer
> first** — and if a writer's class is unclear, that is a design question, not a licence to
> weaken the criterion at the site where it is inconvenient.

**SNAP-AC-9 (it is a snapshot) — unchanged in substance; its application is scoped by A6** —
*Given* a line saved with figures captured, *When* the catalogue's figures for that product
later change, *Then* the figures stored on the line do not change, **and nothing recomputes
them outside a capture moment**.

**A capture moment is:** a save that moved the pick, or a derivation writer's validated save
(§7.0). **Everything else is forbidden** — every display-time read (R3, D3, WHY-AC-18), and
every best-effort re-resolve on an unmoved pick, which is the recompute A4 caught. *This is
what makes the manual branch a breach and the aiManaged branch not one: the first recomputed
without a capture moment, the second re-derives the whole line at one.*

**SNAP-AC-10 (no backfill — D5)** — no script and no migration writes figures onto lines saved
before this phase.

*Rests on R18 and on one-place-per-fact, never on a deployment window* (revision 21's
retraction does not touch it). **A4 extends its reasoning to the touch path:** a pre-capture
line edited by a best-effort writer does not acquire figures either.

**SNAP-AC-11 (the platform's record is never overwritten)** — the capture writes only to the
line's own configuration record; no `selection_run` row, no `candidate_result` row and no
`outcome_json` is modified.

**SNAP-AC-12 (surface area)** — the diff adds no endpoint and no HTTP method. **The column
question is settled: A1** (§13.8 discharged), and its migration follows the
`d1-migration-safety` procedure.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2. This spec does not
restate it.**

That deferral is itself a finding. A hand-maintained list of the sites that write a line's
product has been **incomplete on every attempt, by three different readers**: named 1, then 4,
then 8, verified at **15**. **And the list layer has now failed a third time in a different
direction** — A6's re-walk found two writers in a class nobody had enumerated. A list that has
been wrong four times is not a control; **write criteria against properties, and let the design
carry the membership.**

**SNAP-AC-2 is therefore not belt-and-braces — it is the mechanism.**

Five shapes carry rulings of their own:

- **A parent with no product of its own** (a composite parent) — the rule is vacuous: no
  figures on the parent, each unit carries its own.
- **A writer that clears a snapshot** — the recommendation's snapshot is still cleared when it
  stops describing the line, but what replaces it is the new selection's figures, never nothing
  (SNAP-AC-14). **A1 is what keeps those two from fighting.**
- **A writer that restores a prior configuration** — it carries that configuration's figures,
  and the line reads as platform-made again by comparison (WHY-AC-30). Under §7.0 a restore
  moves the pick **only when it names a different variant**.
- **A best-effort writer that touches a line without moving its pick** — the room label, the
  colour, the dimensions, the customer autosave. **It carries the figures forward and reads no
  catalogue** (SNAP-AC-1, SNAP-AC-16). This shape was missing until A4, and it is the most
  common save in the product.
- **A derivation writer at a validated save** — it re-derives figures with the price and both
  snapshots, pick moved or not, because that save **is** the capture moment (§7.0, A6). This
  shape was missing until A6, and two of its members had already been written.

### 7.5 The customer path, specifically

**SNAP-AC-13 (D7)** — a customer configuring a new line: the inserted `quote_line` carries the
product's figures.

**SNAP-AC-14 (D7, the erasure)** — a customer changing the configuration of a line the
estimator priced — the path that today sets `configuration_snapshot_json = NULL` — records the
figures of **what the customer chose**, so the reviewer's comparison (WHY-AC-27) is available
on precisely the lines stamped `customerConfigurationChanged`.

**SNAP-AC-15 (D7, nothing customer-visible)** — every screen, price and response is identical
to before; the only difference is what the row stores. **And on a save that moved no pick, the
only difference is that nothing was stored at all.**

### 7.6 Verified non-impact — the learning corpus

Confirmed 2026-08-24 at the owner's request: `captureRecommendationOutcomes` runs at issue
(`issue.ts:46`); an override fails `sameCoreConfiguration` (`ai/outcomes.ts:97-102`), so the
outcome is `"adjusted"`, `recommendationEligible` is false, and it is parked `pending` for
human adjudication rather than trained on. **This feature must not alter that path, and
nothing in it does.** Out of scope by intent, not by omission.

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer (R21, R25, R31) · **ACCEPTED**

> **Phase 2 was accepted at stage 8 on 2026-08-25 and deployed** (version `9285d642`). Every
> criterion below was verified against executed evidence, including mutation checks that
> reverted the fix to watch the criterion go red. The criteria stay exactly as written: they
> are what the next reader must not break.

**The URL grammar — owner-confirmed (D9, §13.14).** `/projects/:id/line/:lineId/drawing` for
the opening; `…/drawing/u1`, `/u2`, … for a unit — **1-based ordinals in the same display
order `unitLabel` renders**. Chosen over the unit's own code: the ordinal matches what the
labels already imply and does not couple the URL to a label that changes if units are
reordered.

**A state-only history push was rejected by name.** Back would have popped honestly, but the
address bar would lie, reload and shared links would silently lose the viewer, and the route
table would show nothing for a test to find.

**VIEW-AC-1 (R21, R25 — what the viewer carries)** — *Given* the line page for a simple
opening, *When* the reviewer activates the drawing, *Then* the viewer opens carrying **the
whole drawing and its caption visible together, the drawing as large as the viewport
permits** — and nothing that explains the drawing's notation.

> ### The size rule — resolved at the round-2 tester gate, revision 18; confirmed by the owner (D13)
>
> **The criterion was requiring two things that cannot both hold.** Revision 16 required the
> drawing "strictly larger at 1920 than at 1280"; revision 17 required the **caption** to be
> readable at every width. On a short wide viewport those are incompatible: the drawing is
> landscape, about **1.4 : 1**, so a copy grown to claim 2560px of width stands roughly
> **1790px** tall on a **1080px** screen.
>
> **A drawing you have to scroll to see is not "the largest size the viewport allows". It is
> larger than the viewport allows.**
>
> > **The whole drawing and its caption are visible together, and within that the drawing is
> > as large as the viewport permits.**
>
> **Which dimension governs: whichever one binds.** `.ops2-viewer__svg` was governed by height
> alone (`height: 62vh; width: auto`), measured with each dimension moved separately:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> So an ultrawide **2560×1080** got precisely the drawing a 1280×1080 window got. **The magic
> number went with it** — `62vh` was the sibling of the `720px` that caused round 1's MINOR.
> Under this rule the budget is not chosen: **it is what is left**. Confirmed by the owner
> (D13, §13.18).
>
> **How it is verified — three shapes, each moving one dimension:** width binds (1100×1440 vs
> 1500×1440, strictly **wider**); height binds (2560×1080 vs 2560×1440, strictly **taller**);
> and **the fence at every shape** — drawing box **and whole caption** inside the viewport, no
> scrolling to read the size. The round-1 test grew both together and passed whichever
> dimension was doing the work (§12 note 12).

**VIEW-AC-1a (title names the subject — D10)** — a **unit** shows its code (`W07A`); the
**line** is titled `Drawing`. The size sits in the caption, not the title.

**VIEW-AC-2 (R31)** — activating a drawing pushes **exactly one** history entry and the
address becomes that drawing's own URL.

**VIEW-AC-2a (R31 — three ways out, one pop)** — back control, Escape and the system gesture
all do the **same single pop**: the line URL returns, the line page is **not remounted**, and
**no record re-fetch occurs**. *(From the desk canvas the destination is the **record** —
VIEW-AC-14.)*

**VIEW-AC-2b (cold deep link)** — a drawing URL in a fresh tab renders the line page **with
the viewer open**, and back **replaces** to the line path rather than popping.

**VIEW-AC-2c (malformed or out-of-range suffix)** — **normalises by replace** and **grows no
history**.

**VIEW-AC-2d (R31 — the accepted two-backs consequence)** — the first back closes the viewer,
the second leaves the line page. **Agreed cost of R31, not a defect.** Nobody may "fix" it by
collapsing the two steps. *(From the canvas only one entry is ever pushed.)*

**VIEW-AC-3 (composite parent)** — the whole assembly, units in proportion to their real
sizes; no sentence explaining it.

**VIEW-AC-4 (composite unit)** — that unit alone at `…/drawing/u<N>`, titled with its code,
captioned with its own size.

**VIEW-AC-5 (R21, "one shared viewer")** — exactly one viewer component exists and every
enlargeable drawing in ops2 opens it — **the record's desk canvas included** (VIEW-AC-13).

**VIEW-AC-6 (R21 supersedes)** — the previous `SidePanel` enlargement (`Plate.tsx:60-106`) no
longer appears anywhere.

**VIEW-AC-7 (keyboard)** — Enter or Space opens it, focus moves in, its accessible name
carries the subject's identity, and on going back focus returns to the drawing that opened it.

**VIEW-AC-8 (R25 — authority, not notation)** — the stand-in square is shown with the existing
sentence and no dimension leaders. This sentence **stays**.

**VIEW-AC-9 (negative — the row stays one target)** — the record list's row glyph navigates to
the line page and **no** viewer opens. `ASSUMED:` §13.1.

**VIEW-AC-10 (R25 — the class, negative)** — no symbol key or legend, no sentence describing
what solid, dashed, apex, arrow or unmarked lines mean, no sentence teaching that panel widths
are proportional. Statements about the drawing's **authority** must remain. **And it must not
rest on the `.elev-legend` selector**, which can no longer match anything — §12 note 5.

**VIEW-AC-11 (the older spec stops contradicting this one)** — `ops2-record-correction.md`'s
**P1-AC-27** is **marked superseded in that document**, naming this feature and R25.

**VIEW-AC-12 (the shared export IS deleted) — REVERSED by the owner (D12), revision 16.** The
export and its body are removed; the assertion that pinned it goes with it; no file under
`src/**` or `scripts/**` references the identifier outside a comment; ADR 0010 is annotated;
typecheck and build green.

> **The three states of this criterion, kept rather than tidied.** Twice, the reason given for
> keeping the export was an unexecuted claim about the repository — first *"the customer site
> still uses it"* (false), then *"it removes a render, not an API"* (which assumed a working
> API to preserve; **there was no `.elev-legend` rule anywhere**). An export with no caller and
> no styles is not an API being preserved; it is dead code with a door painted on it.

**What the test asserts:** the **absence**. It must **not** reintroduce a consumer count in
either direction — the claim class §12 note 10 exists to stop.

### 8.1 Opening a drawing from the project record's desk canvas (D11)

**This journey shipped in no criterion and no interaction spec.** Added at
**architect-conformance time** (design §11.5) to satisfy VIEW-AC-5, *after* §8 was written —
§12 note 11.

**Owner ruling (D11):** back returns to the **record**; the reviewer lands exactly where they
were; the control is **relabelled so it stops naming the line**; the blank canvas on return is
**fixed, not accepted**.

**VIEW-AC-13 (the canvas is an opener surface)** — activating the canvas's plate or a unit row
opens the **shared** viewer, the address becomes that line's own drawing URL in **the same
grammar the line page uses**, and **exactly one** history entry is pushed.

**VIEW-AC-14 (back lands on the record)** — back, Escape and the system gesture all do the
**same single pop**, and the reviewer is on the **record** — never on the line page they never
visited. *Cold arrival is unchanged (VIEW-AC-2b): the destination follows how the viewer was
entered.*

**VIEW-AC-15 (the control names what it returns to)** — from the canvas, the visible label and
accessible name are both the record's **reference** (`OF-Q-10482`), and **neither names the
line**; from the line page, both name the line. In no state does the label name one destination
while the control goes to another.

**Why the reference — owner ruling (§13.17 VETOED).** `src/ops2/projects/LinePage.tsx:201`
already names this destination by reference. One destination must not have two vocabularies in
one console.

**There is no `Project` fallback on the viewer's control, and that is not a descope (revision
19).** `LinePage.tsx:124` passes the reference only when `record` exists. The developer
implemented the fallback in both places, deleted the unreachable copy and said so rather than
dropping it quietly.

- **The page-level control keeps `Project`** — a different control, where the state is real.
  **If one of these two labels ever changes, both change.**
- **The never-empty guarantee is pinned, not assumed:** `record.ts:314` sets
  `ref: str(publicRef) ?? id`, and `parseProjectRecord` returns `null` without a non-empty
  trimmed id. **A fallback would have masked that pin.** *(The pinned case is the absent field;
  empty and whitespace rest on `str()`'s trim — §12 note 7.)*

**It can be long, and that is not a reason to change the vocabulary.** A record served without
a `public_ref` labels this control with a 36-character id; the console caps it as a **display**
problem (`line.css:122-129`), never by falling back to the project's title.

**VIEW-AC-16 (the return does not blank the canvas)** — the record page is **not remounted and
not re-fetched**, the selected line is **still selected**, and the canvas shows that line's
drawing **from the first frame after the pop**. *(The defect's evidence was `selected row index
-1; canvas text starts ""`; the fix is proved by the same two observations read immediately
after the pop.)*

**VIEW-AC-17 (executed where only a browser can see it)** — `scripts/tests/web/` carries
**executed** Playwright coverage: both opener surfaces, all three exits, the back label, and
the preserved selection. **A node:test suite cannot satisfy this criterion.**

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

### 9.1 The panel on the line detail (R6)

**WHY-AC-1 (R6)** — a line whose opening resolves to a selection run with recorded candidate
outcomes, still on the platform's product, shows a panel between the specification (or units
block) and the price, carrying exactly three lines: **Had to meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — `default_envelope` states the caps as figures **and** an origin label
naming them a platform default; equivalently `explicit_energy_report`, `plan_derived`,
`human_override`.

**WHY-AC-3 (R4, absent)** — `requirement.absent`: "Had to meet" says this opening had no
thermal requirement, and no cap figure is shown.

**WHY-AC-4 (R6, SNAP-AC-3)** — "This one" shows the current product's Uw and SHGC **from the
line's own record**; a null figure is stated as not recorded and never rendered as a number, a
zero or a dash.

**WHY-AC-5 (R6, R7)** — "Chosen" states the winning rule in one sentence per tier: `meets`,
`within_tolerance`, `misses`, `thermal_unknown`, `does_not_fit`.

**WHY-AC-6 (R7)** — a run stored with `tolerance` 0.08 says 8% — read from the run, never
hardcoded, and the band is named rather than paraphrased.

**WHY-AC-7 (R19, R26, D8)** — activating the panel's action **navigates to
`/projects/:id/line/:lineId/why`**, presented as a right-hand slide-out at desk width and full
screen on the phone. The presentation is `SidePanel`'s; **the control flow is not.**

**WHY-AC-7a (R29, D8)** — a **back** control with an accessible name, plus the platform's
standard back gesture; **no "Done" and no X.**

**WHY-AC-7c (D8 — cold arrival)** — the detail renders its line's rationale, resolved the same
way the line page does; the not-found and refusal sentences are the line page's.

**WHY-AC-7d (D8 — back on a cold arrival)** — lands on the line page: replace rather than pop.
Never a dead control, never out of the console.

**WHY-AC-7b (negative — the other caller does not move)** — the Projects filter panel's
presentation, dismiss control and existing tests are unchanged.

**WHY-AC-8 (R13, D6 — the thinner panel)** — a line with no selection run whose stored figures
exist shows **two** lines: that a person chose this product, and that product's own Uw and
SHGC. No "Had to meet", no "Chosen", no alternatives action.

**WHY-AC-9 (D5, the honest gap)** — stored figures absent: it states that a person chose this
product and that its figures were not recorded, and **no** catalogue lookup fills the gap.
`ASSUMED:` §13.5.

**WHY-AC-10 (R3, pre-0055 rows)** — the panel states that this recommendation was made by an
earlier model whose reasoning was not recorded. `ASSUMED:` §13.2.

**WHY-AC-11 (D2, post-issue)** — **no panel at all**, and **the `why` route renders the same
refusal as a line that has none**, so the URL is not a way around D2.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

**WHY-AC-12 (R8)** — the chosen product first, marked as chosen, then the next four by
ascending ladder rank — five rows, no more.

**WHY-AC-13 (R8)** — fewer than five: the ones that exist, no placeholder rows, **no count of
anything beyond the list**.

**WHY-AC-14 (R9 — negative)** — no excluded candidate, no count of them, no exclusion reason
text anywhere.

**WHY-AC-15 (R9 + conclusions §7.1 — negative)** — nothing about withheld products appears.

**WHY-AC-16 (R10 — negative)** — no price, no delta, no currency symbol, no control that
prices it.

**WHY-AC-17 (R6, R7)** — name, recorded Uw and SHGC, and a verdict in words derived from its
tier.

**WHY-AC-18 (R3, D3)** — every figure shown is a stored one; no request to the catalogue or the
estimator to recompute anything.

**WHY-AC-19 (R3)** — a recorded candidate whose product no longer exists is still shown from
the recorded facts, never blank or dropped.

**WHY-AC-20 (R1 — negative)** — no control changes the line, the quote or any stored value, and
a network trace contains only GET requests.

**WHY-AC-21 (R2 — negative)** — no wording describes a human's product change as wrong,
incorrect, a mistake, an error or a correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 (R11, R12)** — the platform's original recommendation is shown **unchanged**, with
a comparison of the current product against the **same** requirement beside it.

**WHY-AC-23 (R12)** — variant/glazing differing counts as a change; same both-shown treatment.

**WHY-AC-24 (R11 — negative)** — neither frame nor glazing changed: no human-selection block at
all.

**WHY-AC-25 (R23 — the target does not move)** — the requirement shown is exactly the one
recorded at selection time, and **no code path re-resolves, recomputes or re-derives a
requirement.**

**WHY-AC-26 (R23 — negative, structural)** — no call to any requirement-resolving function and
no recomputation of caps.

**WHY-AC-27 (D3, D5)** — the comparison uses the **stored** figures against the run's recorded
caps, in WHY-AC-17's vocabulary, with no wording framing the change as an error. Figures
absent: it says so, still shows the requirement and the platform's recommendation, and makes no
live lookup.

**WHY-AC-28 (R24 — attribution)** — the current selection is attributed to a person and never
to the platform. `ASSUMED:` §13.10.

**WHY-AC-29 (R24 — the trap, and the test that catches it)** — *Given* a line the estimator
created (`origin = 'ai'`, `ai_proposal_line_id` set) whose configuration a customer has since
overridden, *Then* it says a person chose this product. Derived by **comparing the recorded
recommendation's product+variant against the line's current product+variant** — never from
`origin`.

**WHY-AC-30 (R24 — restoring the proposal)** — the line reads as platform-made once more, by
the same comparison run again, with no state to unwind.

**WHY-AC-31 (R24 — negative)** — no code path writes `quote_line.origin` or
`ai_proposal_line_id`, and `aiManaged`'s behaviour at `ops.ts:1039` is unchanged.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — a composite parent whose `composite_origin` is `'ai'` **shows** the
panel. (The mock's *"THE WHY PANEL DISAPPEARS ENTIRELY"* is void.)

**WHY-AC-33 (R15)** — the split reason first — the make-up that won and the single unit it beat
— then each lite's own band.

**WHY-AC-34 (R16)** — each unit states its own caps and origin label.

**WHY-AC-35 (R16)** — a unit with no recorded band says so; no band is computed for it.

**WHY-AC-36 (R16)** — a recorded `segment_thermal_review` flag is shown against that unit.

**WHY-AC-37 (R17, D6)** — `composite_origin = 'ops'` gets the WHY-AC-8 treatment; no machine
rationale, split reason or alternatives list.

**WHY-AC-38 (R14, `splitNote`)** — a recorded "no frame system could supply it" is stated.
*(The fact has exactly one stored home: `quote_line.review_json.composite`. If staff have since
resolved that review flag the trace is gone and nothing is stated — a named residual, and the
fixture must carry the unresolved flag.)*

### 9.5 No action, anywhere on this surface (R28, R1, R29)

R28 removed the one control this surface was going to have. **That absence is the design, not a
gap.** Owner: *"Having a button implies that some product must be preselected, which we don't
have conceptually."*

**WHY-AC-39 (R28, R29)** — the detail's only interactive element is the back control.

**WHY-AC-40 (R28 — negative)** — no line-editor route exists. The child routes this feature
adds are exactly `drawing`, `drawing/u<N>` and `why`. Nothing else.

**WHY-AC-41 (R28 — negative)** — the panel's only interactive element is the one that opens the
detail, and on a line with no detail it has none at all.

---

## 10. Abuse-case criteria (negative)

The read surface is staff-gated and read-only, but it exposes **which competing products were
considered and how they compared**. The capture adds a write on paths that include the
customer's own save route, and the addressable URLs are new places to probe. These are executed
by the tester as real attempts, with the denial recorded.

**A note on status codes, corrected in revision 5.** "Anonymous → 401, customer → 403" was
unimplementable: a customer session does not authenticate an ops route. The criteria assert
**one refusal for every non-staff caller** and put the weight on **no candidate data in the raw
response body**. *(Design §2: no ops identity → `403 {"error":"forbidden"}`; an identity failing
`hasAssignedRole` → `403 {"error":"forbidden_role"}`.)*

**X-AC-1 (one refusal, no data)** — a non-staff caller is refused with the console's standard
refusal, and the raw body contains no product slug, no tier, no thermal figure and no candidate
of any kind.

**X-AC-2 (the refusal reveals nothing)** — anonymous and signed-in-customer refusals are
identical in status and body.

**X-AC-3 (the control that matters most)** — a `manufacturer` staff role is refused by
`hasAssignedRole`, and the raw body carries no competing product slug, tier, figure or count.
**Executed against the `why` URL as well as the endpoint.**

**X-AC-4 (cross-project probe — the interaction AND the URLs)** — the refusal for a line in
another project is byte-identical to the refusal for a line that does not exist, **both by
navigating and by visiting the URL directly**. **The same holds for the drawing URLs** —
**including the ones the desk canvas pushes**.

**X-AC-5 (R9, enforced server-side)** — the raw body contains **only** the chosen candidate and
at most four runners-up. Enforced by what is sent, not by what is rendered.

**X-AC-6 (R1, R2, R3, R28)** — this feature adds **no** POST, PATCH, PUT or DELETE endpoint,
and `PATCH /api/ops/recommendation-outcomes/:id` is referenced by no client code.

**X-AC-7 (no free prose escapes)** — no schedule comment text, no data belonging to any other
opening, project or account.

**X-AC-8 (the capture never trusts the client — ops)** — thermal fields in the request body are
ignored entirely; stored figures are the ones the server resolved or derived.

**X-AC-9 (the capture never trusts the client — customer)** — same, on the customer route. A
customer can never write a thermal figure onto a line, which is the whole point of the panel.

**X-AC-10 (the capture never crosses a project)** — the existing ownership guards refuse a line
id from another project unchanged, and no figure is written outside the caller's own project.

**X-AC-11 (Phase 1, the two gates on an irreversible write)** — CERT-AC-8 and CERT-AC-13; both
refuse and write nothing; both executed as real attempts.

**X-AC-12 (Phase 1, blast radius)** — CERT-AC-11: no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | No money appears anywhere on this surface. The line's existing Price panel keeps the account-preference rule unchanged. `ASSUMED:` §13.3 | R3, R10 |
| **Quote lifecycle — post-issue** | Panel absent entirely, and the `why` URL refuses rather than serving one. | D2, WHY-AC-11 |
| **A catalogue import run after the strip** | No row regains the fields — the importers were fixed in the same phase. | CERT-AC-12 |
| **A strip launched from a stale branch** | Refused, naming the offending importer, before anything is written. | CERT-AC-13 |
| **`dataSource` on a dimension rule** | Untouched. Same token, different live concept. | §2, out of scope |
| **The `ElevationLegend` export** | **Deleted**, together with the assertion that pinned it. | VIEW-AC-12, D12 |
| **A room-label, colour or dimension edit on an ordinary line — including during a Sanity outage** | **A best-effort writer: figures carried forward verbatim, no catalogue read.** Never present-and-null, never a recompute. This is the defect A4 caught. | A4, SNAP-AC-1, SNAP-AC-16 |
| **A customer autosave that changes nothing about the pick** | Same: nothing stored, nothing fetched. W3 rewrote every ordinary line's figures on every project save before A4. | A4, SNAP-AC-16 |
| **A dimension or quantity edit on an AI-priced line** | **A derivation writer: figures re-derive with the price and both snapshots, in one statement.** Carrying figures alone would describe one variant at two different times in adjacent columns. **Not a breach** — that save is a capture moment. | A6, §7.0 |
| **An estimator re-run that re-picks the same variant after the catalogue moved** | Figures refresh with the rest of the derivation. The pick did not move; the capture moment did occur. **Correct code, and SNAP-AC-16 as written in revision 23 wrongly condemned it.** | A6, SNAP-AC-16 |
| **An ops edit of an AI-priced line where nothing material changed** | Price, snapshots **and** figures refresh to the current catalogue. **Named residual, pre-existing contract** — the price behaved this way before Phase 3a. A product question about that branch, not a figures defect; visible at 3a acceptance. | A6, §7.0 |
| **A save that genuinely moves the pick while the catalogue is unreachable** | Present-and-null, and **here it is the honest fact**: the stored figures describe a configuration the row no longer has. Save still completes; nobody is told. | SNAP-AC-6 |
| **A successful resolution of a published variant that carries no figures** | Present-and-null, **honestly** — the answer was established and the answer is "none recorded". One of SNAP-AC-16's three authors. | SNAP-AC-16 |
| **A pre-capture line that a best-effort writer edits** | Stays `NULL`. **No opportunistic backfill** — a lookup at edit time is not a snapshot of the moment the pick landed. | A4, SNAP-AC-10 |
| **A product offering exactly one published variant, with no variant named** | Resolves to that variant — **a singleton answer set is not ambiguity** (A5). Ambiguity, and its null, begin at two surviving variants. | A5 |
| **A customer overrides an AI-priced line after the capture ships** | `configuration_snapshot_json` is still nulled **and the customer's own figures land in `performance_figures_json`** — two columns, no fight. This is why A1 overrode §13.8. | A1, SNAP-AC-14 |
| **Enlarging a drawing from the record's desk canvas** | One push; back pops once to the **record**, selection and canvas intact; the control carries the record's **reference**. | D11, VIEW-AC-13…17 |
| **A project served without a `public_ref`** | The back control shows the 36-character id, **capped as a display problem**. Never a fallback to the project's title. | VIEW-AC-15, §13.17 |
| **Leaving a line after enlarging a drawing** | **Two backs.** Agreed cost of R31. **Not a bug; not to be collapsed.** | R31, VIEW-AC-2d |
| **A pasted drawing or `why` link, cold** | Renders with the surface open; back **replaces** to the line path. | VIEW-AC-2b, WHY-AC-7c/7d |
| **A short wide viewport — 2560×1080** | **Height binds.** It does not grow to claim the width. | VIEW-AC-1, D13 |
| **A tall narrow viewport, and the phone** | **Width binds.** The caption stays visible with it. | VIEW-AC-1, D13 |
| **Everything saved before the capture exists** | No figures, no backfill: the honest absence. About **history**, not about any gap between deployments. Under A1 a `NULL` column, structurally distinct from captured-but-unknown. | D5, R18, SNAP-AC-10 |
| **The catalogue is unreachable at save time** | Save completes, nobody is told. Never a refusal. **On an unmoved pick at a best-effort writer, nothing is written at all; at a derivation writer the path refuses before writing anything.** | D6, SNAP-AC-16, §7.0 |
| **A non-staff caller reaches an ops route or any new URL** | One refusal, no candidate data, nothing inferable from the difference. | X-AC-1…4 |
| **A drawing whose accuracy is provisional** | Still said — authority is not notation. | R25, VIEW-AC-8 |
| **Offerability gating** | Withheld and excluded candidates never reach the client — enforced server-side. | R9, X-AC-5 |
| **Delivery zones** | Not applicable; this surface reads no delivery fact. | — |
| **More than one selection run for an opening** | The most recent by `created_at`; older runs not listed or merged. `ASSUMED:` §13.4 | R3 |
| **Null thermal figures** | Stated as not recorded. Never 0, never "—", never omitted silently. | R6 |
| **`requirement.absent`** | "Had to meet" says there was no requirement; the "Chosen" sentence must not claim a thermal victory. | R4 |
| **Catalogue moved since the run or since the save** | Stored facts only; no live lookup at display time, ever. | R3, D3, SNAP-AC-9 |
| **Certification** | Never appears on this screen in any phase. | R5 |

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> No assertion is an obvious hole. An assertion that cannot fail is a **hole with a green light
> over it**, and every later reader takes it as coverage.
>
> **Five were found in a single day of Phase 2**, every one written while *adding* coverage,
> every one by a competent author, and **not one of them looked wrong**: a self-comparing
> ternary; a container measured instead of its contents; a two-variable sweep that passed on
> either governor; a `.elev-legend` count-of-zero that became true by construction; a tautology
> beneath the assertion that subsumed it.
>
> **The tell is never in the wording — it is in whether the assertion can be made to fail.**
>
> > **Break the thing on purpose and watch the test go red. Make the pattern match nothing and
> > watch the scan complain.** If neither happens, the assertion was decoration.

Not a test plan — fourteen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixture** must be an AI-originated line the customer has since overridden,
   with `origin` still `'ai'`. A fixture built from a manual line proves nothing about R24.
2. **SNAP-AC-2 is a source-level scan**, not a behavioural test. It must assert a property of
   every match and never a count, and fail when its own match set is empty. **A1's dedicated
   column is what makes it one regex.**
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test**, not an ops one. The customer save is
   where a regression would be worst — and, after A4, where the widest one nearly shipped.
4. **X-AC-1 must be executed for both callers separately** even though they receive the same
   refusal — X-AC-2 is precisely the assertion that they are indistinguishable.
5. **VIEW-AC-10, and the selector that became a trap.** No suite anywhere asserted the drawing
   legend, so there was nothing to update; the assertion had to be written against the *class*
   of copy. **Once `ElevationLegend` was deleted, a `.elev-legend` `toHaveCount(0)` became true
   by construction.** *(Executed: the developer removed it and replaced the pinning assertion
   with an inverted one that fails if the identifier returns.)*
6. **WHY-AC-39/40/41 assert absences.** Enumerate the interactive elements and assert the *set*.
   WHY-AC-40 is a route-table assertion, not a page test.
7. **WHY-AC-7a must assert where back GOES, not what it looks like.** **VIEW-AC-15 adds the
   other half:** a control that goes to the right place while *naming* the wrong one passes
   every navigation assertion. Assert label and destination **together**. **Before inventing a
   label, check whether the destination already has one** (§13.17). **Two controls, two
   states**; and **the guarantee under that absence is only half pinned** —
   `ops2-record.test.mjs:99-100` covers the *absent* `publicRef`; empty and whitespace rest on
   `str()`'s trim, which no assertion exercises.
8. **VIEW-AC-2's numbers are the assertions, and this criterion inverted between drafts.**
   **"Exactly one" entry pushed** and **"one pop" from all three exits** carry the weight.
9. **CERT-AC-3: the predicate is narrow on purpose, and the paths are not interchangeable.**
10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — six times about the codebase, once
    about the world, once about this spec's own register.**

    **Claims about the codebase — one command settles each.** The writer index (1→4→8→**15**);
    the `src/ops/api.ts:381` exemption; VIEW-AC-12's premise; "exactly one reference repo-wide"
    (**a count is a claim too**); *"removes a render, not an API"* (nobody had checked the
    stylesheets); and **§13.17's inverted form — "there is no precedent" is a claim too**,
    the one nobody thinks to grep, because an absence does not announce itself.

    **A SHAPE THAT NO GREP CAN SETTLE — a claim about the WORLD (revision 21).** *"Every save
    between 3a and 3b…"* **The owner: there will be no saves between 3a and 3b.**

    > **A claim about the codebase is settled by running something. A claim about the world is
    > settled by asking the person who owns it** — in the same breath as the decision it is
    > being used to justify.

    Note what it was buying: an **urgency**. A false urgency is the most expensive kind, because
    it is spent on schedule risk.

    **A THIRD SHAPE — a claim about this spec's own documents (revision 22).** *"§13.8 and
    §13.9 are live at the Phase 3a gate"* was a claim about the **design**, which had ruled both
    out loud. **A register's own contents are a claim about every document downstream of it**,
    and the check is one command.

    **The tell, whichever shape:** "another consumer", "a legacy surface", "the customer site",
    "everywhere else", "somebody might use it", "there is nothing like this yet", "while it is
    still loading", "every save in between", "still open", "nobody has ruled on this".

11. **A journey that no criterion names will be tested by nobody — and it is a later stage that
    adds them.** The desk-canvas enlargement arrived at **architect-conformance time**, the one
    place with no route back to the spec. **When a review stage adds behaviour, the criterion is
    part of the fix** — and if it adds UI, so is the `scripts/tests/web/` coverage.
12. **A two-variable measurement proves nothing about which variable did the work.** **Move one
    dimension per sweep, and assert the dimension that should have moved.**
13. **A CRITERION IS CHECKED AGAINST THE OTHER CRITERIA IT CONSTRAINS, NOT ONLY AGAINST THE
    CODE — two of them, each correct alone, can be jointly unsatisfiable.**

    This spec has produced **two** internal contradictions, and **neither was found by
    reading**: **VIEW-AC-1** (found by a measurement) — "grow with the width" and "the caption
    stays visible" cannot both hold on a short wide screen; **SNAP-AC-1 vs SNAP-AC-9** (found by
    an implementation) — an implementation satisfying the first as written **violates the
    second**, and one did, silently, on the most common save in the product.

    **Both criteria read fine alone. That is the whole difficulty**: review reads criteria one
    at a time, and rereading finds wording problems, not joint ones. **The tell is a shared
    subject** — two criteria over one subject is where to look — and there is no substitute for
    looking: no test catches a contradiction, because the failing implementation is *conformant
    to one of them*.

    *(Both repairs preserved the criterion that was right. When two criteria collide, one is
    usually load-bearing and the other loosely worded — find out which before rewriting either.)*
14. **A CRITERION GENERALISED FROM ONE INSTANCE MUST NAME THE PROPERTY THAT MADE THAT INSTANCE
    WRONG, NOT THE BEHAVIOUR IT EXHIBITED (new, revision 24).**

    SNAP-AC-16 was written from a single defect — the room-label erasure — and it worked: it is
    the criterion the architect's re-walk tested every writer against, and it **found two more
    sites**. Then it **over-caught**: both of those sites are correct code, and a third reading
    would have condemned the whole aiManaged branch.

    **The wording generalised further than the reasoning behind it.** *"Present-and-null has
    exactly one author"* describes **a behaviour** — and behaviours have honest instances the
    author never saw. The property was: **no writer may assert an absence it did not
    establish.** Derivation writers pass that; they failed the behaviour.

    **Why this is more dangerous than a stale bullet, and nearly its inverse:** a criterion that
    is too weak gets found by a defect. **A criterion that is too strong gets found by an
    implementer who cannot satisfy it** — and the pressure at that moment is to *quietly weaken
    it at the one inconvenient site*, which leaves the criterion looking intact and the rule
    silently gone. **The exemption must be granted by the spec, not assumed by the code** (A6's
    own words), and it must be granted **as a property with a class**, because the site list has
    now been wrong four times counting up and once counting a class nobody had drawn (§7.4).

    **The check when writing one:** ask *"what made the instance I saw wrong?"* and write that.
    If the answer is a sentence about **what the code did**, it is a behaviour and it will
    over-catch; if it is a sentence about **what the code could not know**, it is a property.

**THE ESCALATION IS THE MODEL, AND IT HAS NOW HAPPENED THREE TIMES.** A4 and A6 both exist
because the developer, mid-implementation, **built what the design said and refused to deviate
silently** — reporting a judgement call with its downside stated instead of quietly "fixing" or
quietly shipping. Both silent options were worse and both were available: a quiet fix puts **the
ruling in the wrong hands**, out of sight of the criterion it turns on; a quiet implementation
ships the defect. Instead it routed to someone who could see that A4 was **not a taste question
but a breach of SNAP-AC-9**, and that A6's residual was **a criterion that had over-caught**.
Same behaviour as revision 19's correction, at three different scales. **A criterion that cannot
be satisfied honestly is a defect in the criterion, and it goes back up the pipeline.**

**A scan's reach is whatever its file list says, and no more.** The navigation scan iterates a
**literal two-file array** (`scripts/tests/ops2-navigation.test.mjs:329`). True today — but it
does not extend itself. **SNAP-AC-2's scan inherits this exactly.**

---

## 13. `ASSUMED:` register — every entry carries a state

**Why the states exist (added revision 15).** Two entries were **answered by the owner at Phase
1 sign-off, and Phase 2 was built against those answers**, while this register still described
them as open. Nobody noticed until the phase that depended on them was complete.

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED — and discharging one happens
> when the answer arrives, not when someone next reads the file.**

**States:** `OPEN` — still assumed, still vetoable · `DISCHARGED` — whoever this spec delegated
it to has answered it · `RETIRED` — the question dissolved · `VETOED` — answered against the
assumption.

### The failure this register has had twice, and the only mechanism that closes it

**Revision 22: §13.8 and §13.9 were reported as open questions for the owner while the architect
had already ruled both**, in design §1 — a section which names the entry numbers it overrides.
The architect did his half correctly. Nothing carried it back.

> **The states were built for OWNER answers, which arrive at a decision gate the product-manager
> attends. A DELEGATED answer lands in another document, written by another agent, at a stage
> nobody re-reads the register.** An entry that says *"the architect may rule otherwise"* creates
> an obligation with no return address.

**What is now done about it, deliberately small:**

1. **A delegating entry names where the answer will land** — *"discharged at design §1"*.
2. **The rulings are indexed in this spec too**, at §5 (A1–A6).
3. **One command, run by the product-manager before any "live at this gate" list leaves his
   hands:** `grep -n "§13\.\|ASSUMED" docs/design/ops2-why-this-product.md`.

**And the honest limit: none of that is automatic.** The register depends on whoever rules
coming back to it, or on the product-manager running the check — **which is why the check is
assigned to the person who publishes the list and is wrong when it is stale.**

**The design keeps its own `ASSUMED:` list** (design §12): an ambiguous variant resolution
stores null rather than a guess; the URL segment names; the normalisations. **A5 governs the
first of those and is vetoable with it as one pair.** Those are the architect's to carry: **two
registers, one per document**, because duplicating them here would create a second home for a
fact.

**Adoption is not discharge.** Several entries below are *built* exactly as assumed. That is the
assumption being acted on, not answered. They stay OPEN, annotated with where they are built, so
a veto shows its cost.

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown, following R9 | **OPEN** — Phase 3b. Built as assumed: design §7 excludes it at **DTO construction**; X-AC-5 asserts it on the raw body. A veto costs a DTO field and its criterion |
| §7.2 | the `CandidateOutcome.dataSource` removal is the architect's to rule | **DISCHARGED — architect, design §1.3 (A3)**; ADR 0011; old `outcome_json` still parses (CERT-AC-9) |
| §7.3 | "3–5 next best" implemented as **4** runners-up, five rows total | **OPEN** — Phase 3b. Built as assumed: design §6 step 6. Within R8's "3–5", so a veto is a number change in one place |
| §7.4 | the `CONTEXT.md` corrections are the architect's to apply | **DISCHARGED — architect, verified applied 2026-08-25** |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record list's row glyph does not open the viewer | **OPEN — shipped and deployed in Phase 2.** A veto now costs rework |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded | **OPEN** — Phase 3b. Built as assumed: design §6 step 5 |
| 3 | **§11, GST** — no money at all on this surface | **OPEN** — Phase 3b |
| 4 | **§11, multiple runs** — the most recent run only | **OPEN** — Phase 3b. Built as assumed: `ORDER BY created_at DESC LIMIT 1` |
| 5 | **WHY-AC-9** — where figures were never captured, the panel says so rather than reading the catalogue at display time | **OPEN** — Phase 3b. Under A1 a `NULL` column; **A4 extends the same refusal to the touch path** |
| 6 | *(the capture's reach)* | **RETIRED** — D7 answered it |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 answered it |
| 8 | **SNAP-AC-12** — figures live in the existing `configuration_snapshot_json` | **DISCHARGED — architect, design §1.1 (A1): OVERRIDDEN.** A **new nullable column**, migration `0058`. **Why the assumed home was wrong:** `configuration_snapshot_json` is deliberately **set to NULL** when a customer materially edits an AI-priced line (`projects.ts:513`) — so the save that most needs to *record* figures (SNAP-AC-14) is the save that *erases* the column. It also makes SNAP-AC-8's three states structural and SNAP-AC-2's scan one regex. **Content is exactly `{"uValue", "shgc"}` and nothing else, ever** — duplicating the variant identity would create **a second home for a fact** |
| 9 | **§7.4** — R22 applies to the estimator's own line-creating writers too | **DISCHARGED — architect, design §1.2 (A2): yes.** Without it the panel would read the line's record for human-saved lines and `candidate_result` for machine-saved ones — **two code paths for one panel line, drifting independently** |
| 10 | **WHY-AC-28** — R6's three labels are kept and only "Chosen" changes its sentence | **OPEN** — Phase 3b. It is copy, and the owner is its audience |
| 11 | **§10** — the ops routes' uniform refusal is adopted as written | **RETIRED — the question dissolved.** §2 puts changing the convention out of scope |
| 12 | *"the drawing viewer is an overlay… it keeps a dismiss control"* | **VETOED by R31** |
| 13 | **VIEW-AC-12** — the `ElevationLegend` export is retained | **VETOED — owner (D12)** |
| 14 | **The URL grammar** | **DISCHARGED — owner, Phase 1 sign-off (D9)** |
| 15 | **The viewer's title** | **DISCHARGED — owner, Phase 1 sign-off (D10)** |
| 16 | **VIEW-AC-1** — no fixed ceiling on the drawing's growth | **RETIRED — the wrong question.** Superseded by §13.18 |
| 17 | **VIEW-AC-15** — labelled with the project's **title** | **VETOED — owner.** `LinePage.tsx:201` already names it by **reference**. **Rework: the label expression only** |
| 18 | **VIEW-AC-1** — the drawing claims **all** the leftover space; the caption never scrolls | **DISCHARGED — owner, Phase 2 acceptance (D13)** |
| 19 | *(the 3a-before-3b urgency)* | **VETOED — owner (D14).** Never a tagged assumption: asserted as fact in prose. Registered retrospectively so the correction is visible where the states are read |
| 20 | *(SNAP-AC-1's "sets or changes", read as including a save that rewrites the same pick)* | **VETOED — architect, design §1.4 (A4).** A **latent reading of a criterion**, which shipped as an implementation that breached SNAP-AC-9 |
| 21 | *(SNAP-AC-16's "present-and-null has exactly one author", read as governing every writer)* | **VETOED — architect, design §1.6 (A6), 2026-08-25.** The opposite failure to §13.20: a criterion **too strong**, condemning two correct writers and, on a third reading, the whole aiManaged branch. **Scoped to best-effort writers, with derivation writers named as a class with a property** (§7.0). Registered because the pressure a too-strong criterion creates is to weaken it quietly at the inconvenient site — see §12 note 14 |

---

## 14. Decisions needed

**None.** Nothing in the register is waiting on the owner today.

**What moved in revision 24.** SNAP-AC-16 is **scoped**, not weakened: its negative half now
governs **best-effort writers**, its first half names **three honest authors** of
present-and-null instead of one, and **derivation writers are defined as a class with a stated
property** (§7.0) rather than a list of sites — *no writer may assert an absence it did not
establish*. SNAP-AC-9's application is scoped the same way, by defining a **capture moment**: a
moved pick, or a derivation writer's validated save; everything else — every display-time read,
every best-effort re-resolve on an unmoved pick — remains forbidden. SNAP-AC-1's carry-forward
half is scoped to match, because leaving it unscoped would have recreated the very contradiction
§12 note 13 exists to catch.

**Why a property and not a list.** The site list has now been wrong **four times counting up**
(1→4→8→15) **and once by omitting a class nobody had drawn** — A6's re-walk found two writers
in it. A criterion written against the list would have condemned correct code; one written
against the property does not, and still catches a future writer that quietly acquires a failure
channel.

**Recorded rather than just edited:** §12 note 14 — **a criterion generalised from one instance
must name the property that made that instance wrong, not the behaviour it exhibited**, with why
a too-strong criterion is the more dangerous kind (the pressure it creates is to weaken it
quietly at the one inconvenient site). §13.21 registers the vetoed reading. The escalation block
now records **three** instances.

**One named residual, for visibility rather than decision.** An ops edit of an AI-priced line
refreshes price, snapshots **and** figures to the current catalogue even when nothing material
changed. **That is the branch's pre-existing contract — the price behaved this way before this
feature existed** — and A6 explicitly declined to condition the branch on a new "material
change" predicate. Whether non-material ops edits should re-validate at all is a **product
question about that branch**, worth raising at Phase 3a acceptance and worth its own ticket if
the owner wants it changed. **It is not a defect this feature introduces, and nothing here is
blocked on it.**

**Live for Phase 3a:** nothing awaiting the owner. Storage (A1), trigger (A4), writer classes
(A6) and the singleton question (A5, vetoable at acceptance as one pair with the design's
ambiguity rule) are all ruled. **Live for Phase 3b, at that gate:** §7.1, §7.3, §13.2, §13.3,
§13.4, §13.5, §13.10 — all OPEN, all cheap to veto before the surface is built. I ran the design
grep before writing that list.
