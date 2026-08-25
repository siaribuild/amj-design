# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 26**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

**Phase 2 is ACCEPTED and DEPLOYED** — owner sign-off 2026-08-25, production version
`9285d642`. **Phase 3a is CERTIFIED PASS** at `72d6b28b` — every criterion SNAP-AC-1 …
SNAP-AC-16 walked one at a time against executed evidence; `npm test` exit 0 (pure 756/756,
heavy 271/271); X-AC-13 mutation-proven; the writer classification attacked as a property
rather than sampled.

**Revision 26 records the phase's own lesson** (§12 note 15): **one rule in two places caused
every defect in Phase 3a — four of them, each a distinction that existed in one spot and was
needed in two.** With the two rules worth carrying into 3b: **a distinction that has to be
re-stated at a second site should become a function, a criterion or a definition, never a
second copy of a sentence**; and **coercing a caller's input is normalisation, coercing a
stored value to stand in for an input the caller never sent is fabrication.**

**Revision 25 folded in three tester observations.** SNAP-AC-1's wording now describes **what
is actually captured** (the configuration the save established, not "that product+variant's")
— **§12 note 13's third instance**, and the copy consequence is pinned in **WHY-AC-4**.
**X-AC-13** replaced an inspection of the split path's body whitelist with an executed attempt.
**WHY-AC-9** records that present-and-null has **two** meanings.

**Revision 24 scoped a criterion that was too strong.** **A6: two classes of writer, one
honesty invariant** — *no writer may assert an absence it did not establish*. Derivation
writers are named **as a class with a stated property**, not a list of sites (§7.0).

**Revision 23 repaired a contradiction between two of this spec's own criteria** (A4).
**Revision 22 reconciled the register against the design.** **Revision 21 retracted a false
urgency** the owner corrected. **Revision 20** recorded the assertion-that-cannot-fail rule;
**revision 19** corrected VIEW-AC-15; **revision 18** resolved VIEW-AC-1's internal
contradiction; **revision 17** carried the owner's veto of §13.17; **revision 16** carried D11
and D12.

Revision 15 gave every register entry a state; revision 14 corrected VIEW-AC-12's false
premise; revision 13 amended the CERT-AC-10 fence; revision 12 folded in the importers;
revision 11 closed VIEW-AC-2's mechanism; revision 10 folded in D8 and R31; revision 9 applied
R29/R30 and added §2.1; revision 8 applied R28; revision 7 corrected a false claim about an
existing legend test; revision 6 applied the closed UX mock gate; revision 5 repaired two
architect findings; revisions 2–4 folded in the owner's decision rounds.

**Decisions needed: one** (§14) — confirm what the captured figures describe when a customer
changes only the glass. Nothing is blocked on it.

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055 —
the requirement and where it came from, every candidate's tier, rank, thermal figures, fit and
price — and **no route in `worker/routes/` reads either table**. The reasoning is written to a
database and never spoken.

The consequence lands at the **human review gate**, the stage between submission and issue
where a recommendation is confirmed or overridden. The person standing there today either
takes the machine's word or re-does the thermal comparison by hand. Neither is a review. In
the owner's words: *"I want to be able to audit recommendations and accuracy of thermal
modelling"* and *"the bigger vision is to surface most likely alternatives hopefully making
human's work easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead
`certified` flag — never asked for, wired to opposite default values in two places of the
Sanity schema — downgrades **13 of 32 products to "indicative estimate only" on every
thermally-constrained line**. **And the catalogue importers write the flag back on every run**,
so removing it from the documents without removing it from them buys days, not a fix (§6,
CERT-AC-12).

And a third gap, now the widest of the three: **a product's thermal performance is not recorded
on the line that uses it.** The save paths store the product, the options and the price; the Uw
and SHGC that make the choice reviewable are looked up at selection time and dropped. Under
R3/D3 nothing may look them up at display time to recover them — so if a save does not record
them, they are gone.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel on the line detail view, and the
   detail **screen** it leads to — its own route (D8) — carrying the requirement and its
   origin, the chosen product against it, why it won, and the 3–5 next-best alternatives by
   ladder rank. Composites included (R14–R17). A **thinner panel** for lines nobody's estimator
   ever evaluated (D6). **No action anywhere on it** (R28).
2. **The `certified` removal, depth (c)** — code, Studio schema, the values in the live
   documents, **the catalogue importers that would write them back**, and **the JSON snapshot
   builders whose source fields this removes** (R5, conclusions §5; CERT-AC-10's amendment).
   **Phase 1, and nothing else rides with it** (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7).** Every save that **moves a
   line's pick** — and every **validated re-derivation** by a derivation writer (§7.0) — records
   the resolved configuration's Uw and SHGC on the line, ops console and customer site alike.
   **A server write-path change, inside Phase 3.**
4. **A shared drawing viewer** for ops2 (R21, R25) — **a node in the navigation tree with its
   own route and a back control** (R31), **and reachable from the project record's desk canvas**
   (D11, §8.1).
5. **Two changes to the shared `SidePanel`** (R26, R29): full-screen on the phone, and a **back**
   control in place of "Done" — without moving the Projects filter panel.
6. **The line-route URL grammar** — **in Phase 2, with the viewer**. Phase 3b adds only the
   `why` child. No new server endpoint anywhere except the rationale read.
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12).

### Out of scope — and why

| Not built | Because |
|---|---|
| **"Change the product" — the control, and any placeholder for it** | **R28, and it is deferred rather than declined.** Owner: *"do not implement CTA change the product… ultimately, switching products is not part of the current run."* Supersedes D4. See §2.1. |
| **Re-classifying the Projects filter panel** | Under R31's literal taxonomy the filter is arguably **not a modal either**. R26/R27's approval explicitly excluded moving it (WHY-AC-7b); **its own future ticket**. |
| ~~**Deleting the shared `ElevationLegend` export**~~ | **NO LONGER OUT OF SCOPE — reversed by the owner (D12)**: zero callers **and** no `.elev-legend` rule in any stylesheet. |
| **Renaming the dimension-rule `dataSource`** | `worker/lib/estimator/types.ts:77` uses the same token for a **different, live, correct** concept. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4.** It is a recompute of a captured snapshot (SNAP-AC-9), and during an outage it asserts "no figure exists" on a save that never successfully asked. **This does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling. A lookup at edit time is a display-time catalogue read wearing a snapshot's clothes (SNAP-AC-10's reasoning). |
| **Conditioning the aiManaged branch on a new "material change" predicate** | A6's rejected alternative. The branch re-derives price, both snapshots and figures together; splitting figures out would describe one variant at two different times in adjacent columns. |
| **Re-resolving a `selected_variant_id` to match the figures on a glazing-only change** | Design §4.3 and `pickMoved`'s `!!pick.variantId &&` clause keep the stored id **stable** rather than churning it on every glass swap. The figures describe the configuration; the id is not their caption — SNAP-AC-1, WHY-AC-4. |
| Any line editor in ops2, stub or real | Follows R28. |
| Any deep-link into the legacy ops console | Was D4's rejected alternative; moot under R28. |
| Explanatory notation of any kind on a drawing surface | R25 — ops staff read elevations for a living. |
| Switching the line's product from the "Why" surface | R1: read-only. |
| Recording a verdict on the recommendation | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3. |
| Re-deriving a thermal **requirement** anywhere | R23. |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | R24. Provenance for display is **derived**, never re-stamped. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. |
| **Any change to the ops routes' authentication or refusal convention** | §10 — which is why §13.11 is RETIRED. |
| Any change to the learning corpus or the issue-time capture path | §7.6. |
| Live re-pricing, price deltas, or any money on the surface | R10, R3. |
| Excluded candidates, in any form | R9. |
| Backfilling anything | R18 *"leave history"*; accepted explicitly (D5). |
| Carrying the rationale past issue | D2. |
| The staff role vocabulary | Conclusions §8: own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Persona ≠ role. |
| Any customer-facing **display** change | Staff surface only. |

### 2.1 Deferred — how product switching might work

> ⚠️ **DIRECTION, NOT REQUIREMENT. NOTHING IN THIS SECTION IS TO BE BUILT.**

The owner's sketch, verbatim:

> *"this should be a new panel for switching indeed: X is gone from this view; cards for
> options are clickable; a click leads to a new confirmation screen; the screen shows something
> about the new choice with confirm/cancel as CTAs."*

1. **The two-panel split resolves the snapshot/live tension.** **Audit panel = what we decided
   then. Switch panel = what is true now.**
2. **The switching list is probably not the audit list.** Expect its own query.
3. **Do not drop the dismiss from the switching panel.** Under R29/R31 that exit is back.
4. **The confirmation screen has four things to show, each a reason to abort:** whether the new
   choice still meets the requirement, the price, whether the line drops out of `ready`, and
   that the line stops being platform-chosen (R24).
5. **The learning path already handles it** — §7.6.
6. **This is the decision surface the owner declined at grill Q1**, returning properly
   separated.

**Console convention it will inherit (R30).** **No modal exists in this feature.**

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source, and
nothing below is inferred.*

**Two axes, never merged** — **Persona** is who someone is and what they need; **RBAC** is what
the platform permits (R20).

### Estimator (persona — new to the domain; the architect adds it to `CONTEXT.md`)

Owner: *"yes, estimator, as a persona, has the needs. But that does not need to translate into
a separate rbac role with limited feature set, not at this point of time."*

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

Read together: **confidence in the platform's reasoning, and speed through the review** — not
correction of the machine. R2 is the direct consequence and the copy must honour it.

**They read this surface; they do not act on it.** **Going back is not an action** (R29), and
**back must return them where they were, saying where that is in the words they already use**
(D11).

**And they already know how to read a drawing** (R25). **What they do need is to see the whole
of it at once** — VIEW-AC-1.

**And what they read must be what was established.** A4 and A6 are that sentence applied to the
capture; **WHY-AC-4 is it applied to the copy** — the panel states what the figures describe,
never what a stored identifier implies.

### Customer (existing — newly relevant, via D6/D7)

Owner: *"human, as in client, manual picks do not have targets, but showing panel with
performance data is fine, I think. It simply means that this panel will be far less rich in
details."* And: *"a selection shall not be perceived as AI-made anymore"* — while *"that does
not change the target."*

The Customer is not a reader of this surface. What changes for them is invisible: what their
save *records*. **Their save must never start failing** (§7.2), and **an autosave that changes
nothing about the pick must not touch their figures** (A4, SNAP-AC-16).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame people. AMJ
is manufacturer.**"*

### Manufacturer partner (an RBAC exclusion, recorded to close it)

`hasAssignedRole` already refuses them (`worker/lib/staff.ts:150`). Recorded because **this
surface exposes which competing products were considered and how they compared**. §10 executes
it as an abuse case rather than trusting it.

### The stage: the human review gate

Between submission and issue. A stage in a quote's life, not a persona and not a role.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Delivers on its own:** thermally-constrained lines stop being downgraded because of a flag
nobody asked for. **The importers are in this phase**: a Phase 1 that ships with a known expiry
is not Phase 1. **Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker
code **plus the four importer edits** → Studio deploy → verified export → dry-run → `--apply`.
**The strip is last, and final.**

**Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — The shared drawing viewer, **and the line-route URL grammar** · **SHIPPED**

**Accepted and deployed 2026-08-25**, production version `9285d642`. This phase owned the
**`exact` drop** and the child-route grammar; `/projects/:id/line/:lineId/drawing[/u<N>]`;
replacing the plate's `SidePanel` enlargement (VIEW-AC-6); **the record's desk canvas as an
opener surface** (§8.1, D11); **the `ElevationLegend` deletion** (D12).

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a — a server write-path change (§7)** · **CERTIFIED PASS at `72d6b28b`, awaiting
  owner sign-off.** `worker/**`, so **Probity applies**. It carries the feature's only
  regression risk.
- **Phase 3b — a read-only display surface (§9).**

**Presentation and navigation model are separate things, and this spec specifies both.**
Presentation — a right-hand slide-out at desk width, full screen on the phone (R19, R26).
Navigation — a **screen in the tree** with its own route (R29, D8), opened by a route change.

**The cost the owner accepted (D5):** no backfill, so **every line saved before Phase 3 has no
figures** (WHY-AC-9, WHY-AC-27).

**Sequencing inside the phase:** 3a lands first and alone — red test, then the write, then its
negative criteria green — before any read endpoint or UI work starts.

**Why, corrected 2026-08-25.** Because 3a is a **server write-path change touching every writer
of a line's product** — and a change with that blast radius can be verified on its own in a way
it never can folded into a display feature. **A4 and A6 are the evidence for that reasoning,
arriving after it was written:** both defects were *silent writes on unrelated saves*, invisible
to any test of the display surface. **The certified diff contains no `src/` change at all**,
which is what made that separation real rather than nominal.

> **~~The reason this paragraph used to give:~~** *"…every save in between is a line that will
> have something to show, and a save that is missed cannot be recovered."*
>
> **That is false, and it is retracted here rather than deleted.** The owner: **there will be no
> saves between 3a and 3b. The phasing exists to make the change manageable, nothing more.**
> **Nobody may accept a schedule risk, a shortened review or a rushed deploy on the strength of
> it.**
>
> **What this does NOT change.** D5's accepted cost and SNAP-AC-10's no-backfill ruling stand
> exactly as written. **The owner has not reversed his own ruling.**

**Dependency check:** **3b depends on Phase 2** for the route grammar, which has shipped, and on
3a for anything a human selected to have figures at all.

### Wayfinder check

**Not needed.** 31 rulings, fourteen owner decisions, six architect rulings taken out loud in
design §1.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label · R5 no
certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen + 3–5 next
best · R9 no excluded · R10 no price deltas · R11 human change shows both · R12 frame or
glazing = changed · R13 no-run lines still show the panel · R14 panel on machine-proposed
composites · R15 split reason then per-lite bands · R16 per-lite bands are real · R17 ops split
= R13 · R18 leave history · R19 right-hand slide-out · R20 same gate as the record · R21
full-screen drawing viewer.

**R22 — the capture rule is universal.** *"every save should record thermal properties of
selected at a time product."* **A4 and A6 sharpen what "every save" means without weakening the
rule: every save at which a product is actually selected.**

**R23 — a target is not a selection.** **R24 — an overridden selection must no longer read as
platform-made**; attribution is **derived by comparison**, never read from `origin`.

**R25 — no explanatory notation on an ops drawing surface.** **A class, not a block.**

**R26 — the phone detail opens full screen.** **~~R27~~ AMENDED BY R29**; what survives is that
**"Done" is wrong**. **R28 — "Change the product" is not implemented, and neither is a
placeholder** (supersedes D4). **R30 — modals carry controls on top, title centred**; **no modal
exists in this feature**.

**R29 — the detail is a screen in the navigation tree; its dismiss is a BACK control.**

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka Confirm/Cancel).
> Everything that is not modal - has back an action plus whatever gesture it lives with as
> standard."*

**R31 — the drawing viewer is a tree node with a back control, not a modal.** The cost was named
and accepted: **two backs to leave a line after enlarging** (VIEW-AC-2d).

> **A modal is only a decision dialog — something that asks a question and returns an answer.**
> Everything else a reader can be *in* is a node in the tree, with back.

**Three careful readers independently placed the viewer on the modal side** — each reasoning
from "it is an overlay" rather than from "does it ask a question?".

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures
snapshotted at save, never read live · ~~**D4**~~ · **D5** the capture waits for Phase 3 —
***about lines saved BEFORE THE CAPTURE EXISTED, which is history; never about a gap between the
3a and 3b deployments*** · **D6** a client/manual-picked line shows a thinner panel **with** its
product's figures · **D7** the capture extends to the customer save path · **D8** the detail
screen gets its own URL · **D9** the URL grammar · **D10** the viewer's title names the subject ·
**D11** back from the canvas returns to the record and the control says so · **D12**
`ElevationLegend` is deleted · **D13** the drawing claims all leftover space · **D14** the
phasing is about manageability, not urgency.

### Architect rulings — delegated by this spec, taken in `docs/design/ops2-why-this-product.md` §1

**These are decisions, not opinions.** Indexed here because the register was twice found
reporting a settled question as open, and an index the product-manager maintains is what gets
read at a gate.

- **A1 (§1.1) — storage: a new column, `quote_line.performance_figures_json`.** Overrides §13.8.
  Migration `0058_quote_line_performance_figures.sql`.
- **A2 (§1.2) — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 (§1.3) — `CandidateOutcome.thermal.dataSource` removed from the contract**, `ladder-v1` →
  `ladder-v2`. Discharges conclusions §7.2; ADR 0011.
- **A4 (§1.4) — the capture fires when the pick moves, never on a save that leaves it
  untouched.** **Not a taste question but a breach of SNAP-AC-9.**
- **A5 (§1.5) — a singleton answer set is not ambiguity.** Ambiguity begins at **two** surviving
  variants. **Vetoable at acceptance as one pair with the design's ambiguity rule.**
- **A6 (§1.6) — a validated re-derivation is a capture moment.** Two classes of writer, one
  honesty invariant (§7.0).

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5)** — *Given* a product whose thermal figures come only from legacy
`performanceVariants` with `certified` absent or false, *When* a project estimate runs against
an opening that has a thermal requirement, *Then* the resulting line's status is not
`commercial_only_estimate` on account of certification, and the variant is ranked on its Uw/SHGC
figures alone.

**CERT-AC-2 (the drop-guard)** — a legacy variant previously removed by the guard at
`catalogue.ts:187` is present in the candidate set, provided it still passes the
non-certification checks.

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** — a
source-level scan of `worker/**`, `src/**`, `scripts/**`, `sanity/**`, comments stripped, finds
no `isCertified` or `energyCertified`; no `certified` as a field name or written value; and no
`dataSource` **where it is valued** `"certified" | "estimated" | "manufacturer"` or
written/projected on a performance variant or thermal-profile row.

**The narrowness is deliberate and must be preserved.** `dataSource` has a **second, live,
correct meaning** — dimension-rule provenance at `types.ts:77`.

| Allowed | Why |
|---|---|
| `scripts/tests/**` | A test that asserts the field is gone has to be able to name it. |
| `sanity/scripts/strip-certified.mjs` | The script whose entire job is removing the field must name it. |

> **Two corrections here, revision 13.** The allowlisted path was wrong — **no
> `scripts/catalogue/strip-certified.mjs` exists**. CERT-AC-13's scanned directory,
> `scripts/catalogue/*.mjs`, **was and remains correct**. **And a third entry is gone** —
> `src/ops/api.ts:381`, exempted as *"a legacy read surface"*. **The tester executed that claim
> and it was false.** See §12 note 10.

**Non-vacuity:** the walk must be **shown to have reached** `catalogue.ts` and `import-wers.mjs`.

**And `certificationRef` / `wersWindowId` are still read and still carried** — a WERS reference
is a real fact about a product; it simply is not a gate.

**CERT-AC-4 (R18)** — a stored `commercial_only_estimate` is unchanged, and the diff contains no
migration and no script that rewrites a stored status.

**CERT-AC-5 (status coherence)** — a line outside the `meets` tier, or whose rules run raised a
warning, is still downgraded for **that** reason.

**CERT-AC-6 (Studio schema)** — no "Certified" boolean, no "Data source" dropdown, the validation
rule gone, the WERS reference field still editable.

**CERT-AC-7 (document values, depth (c))** — after the strip, no document carries `certified` or
a variant `dataSource`, every `certificationRef` / `wersWindowId` is byte-identical to the
export, and no other field differs.

**CERT-AC-8 (export gate — abuse case)** — no verified export, no strip: it refuses and writes
nothing.

**CERT-AC-9 (contract stability)** — *Given* **A3**, an `outcome_json` written before the change
parses without error, and no surface renders the field.

**CERT-AC-10 (the fence) — AMENDED 2026-08-24. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…and **no application save path**."* **No longer
> true, and the amendment is recorded rather than the criterion rewritten.**

The diff changes no file under `worker/lib/staff.ts`, no role CHECK constraint, no migration, and
**no application save path other than the JSON snapshot builders whose source fields this phase
deletes** — `proposal.ts:375` (written at `:415`) and `splitCandidates.ts:356`.

**Why the breach is necessary, not creep.** The only alternative is writing **literal** values
for fields whose source data no longer exists — a removal with a copy kept.

**What still holds, and it is most of the fence.** No migration, no role vocabulary, no schema
change, **no statement's column list or WHERE clause altered**.

**CERT-AC-11 (blast radius)** — no customer-facing response body gains or loses a field, and no
price changes for an already-priced line.

**CERT-AC-12 (durability)** — running the importers as an operator would, **no row regains
`certified` or a certification-valued `dataSource`**.

**CERT-AC-13 (the strip refuses a stale checkout)** — run from a checkout whose own
`scripts/catalogue/*.mjs` still writes those fields, the strip **refuses and writes nothing**,
naming the offending file.

**CERT-AC-14 (deploy order)** — worker code **and the four importer edits** → Studio deploy →
verified export → dry-run → `--apply`.

---

## 7. Acceptance criteria — Phase 3a: the universal capture (R22, D3, D6, D7)

**Why this is its own phase.** **Not urgency** — see §4's retraction. It is a **server write-path
change with the widest blast radius in this feature**, it falls under Probity, and §7.2's
negative criteria are worth proving against a deployment in which nothing else moved.

**Where the figures live is settled: A1.** A **new nullable column**,
`quote_line.performance_figures_json`, migration `0058_quote_line_performance_figures.sql`.

**When they move is settled: A4 and A6.** §7.0 defines the terms every criterion below depends
on.

### 7.0 The definitions every criterion below depends on

#### The pick (A4)

**The pick is exactly the resolver's inputs:** `product_slug`, `selected_variant_id`, and
`options.glazing` — the glass identity every pricing path already reads (`lib/lines.ts:164`).

- An option the resolver never consults — **colour, hardware, the room label, dimensions** —
  cannot move the figures.
- A pick that names **no** variant does not move the variant term; only an explicit,
  **different** `variantId` does (the restore path).
- **The predicate lives once**, in `worker/lib/figures.ts`. Two copies of a "did it move?" test
  is two answers waiting to disagree — **and §12 note 15 is what happens when a distinction does
  live in two places.**

#### The two classes of writer, and the one invariant (A6)

> **The honesty invariant, and it is what a new writer must be tested against:**
> **no writer may assert an absence it did not establish.**

- **Best-effort writers** — they **ask** the catalogue and must succeed even when it cannot
  answer. **They have a failure channel**, so a re-resolve on an unmoved pick can only degrade or
  lie. **A4's predicate governs them**: carry when unmoved, resolve fresh when moved.
- **Derivation writers** — they **are** the derivation: the figures come from the same validated
  or estimator-selected in-memory variant that produces the product, the price and both snapshots
  **in the same statement**. **They have no failure channel that can write a dishonest absence**.
  **For them the pick-moved predicate is the wrong condition**: a dimension or quantity edit does
  not move the pick but must reprice, and carrying figures forward while `line_total`,
  `pricing_snapshot_json` and `configuration_snapshot_json` re-derive beside them would describe
  **one variant at two different times in adjacent columns**. **A derivation writer's validated
  save is a capture moment by its own contract, whether or not the pick moved.**

**Membership is a property, not a list.** A writer is a derivation writer **only if it cannot
write an absence it did not establish**. The concrete membership is the design's (§4.2) **and it
has already grown once**. **Verified at 3a: the tester attacked this as a property rather than
sampling it, and could not construct a violating path.**

**The residual, named rather than hidden (A6).** An ops edit of an AI-priced line refreshes
price, snapshots **and** figures to the current catalogue even when nothing material changed.
**The branch's pre-existing contract**, and whether non-material ops edits should re-validate at
all is a **product question about that branch**, not a figures defect (§14).

### 7.1 One rule

Owner, verbatim: *"every save should record thermal properties of selected at a time product."*
**One rule with many sites**, not a set of per-route features.

**SNAP-AC-1 (R22 + A4 + A6 — the rule; wording corrected revision 25)** — *Given* a save whose
**stored pick actually differs after the save** (§7.0), **or** a **validated re-derivation by a
derivation writer**, *When* it completes, *Then* the line's `performance_figures_json` carries
**the Uw and SHGC of the configuration that save established** — the variant the pick named, or,
where the pick named none, the variant its product and glazing resolved to — as they stood at
that moment, regardless of which route performed the save and regardless of whether a person or
the platform chose the product.

*And the other half, scoped by A6:* **Given a save by a BEST-EFFORT writer that leaves the pick
untouched** — a room label, a colour, a dimension, an autosave that changed nothing — *Then* the
line's `performance_figures_json` is **carried forward verbatim** and **no catalogue read is made
for that line at all**.

> **Why "the configuration that save established" and not "that product+variant's" (revision
> 25).** On the customer path a **glazing-only** change moves the pick, so the figures re-resolve
> with **no variant named** and the glass drives — while the row **deliberately retains its old
> `selected_variant_id`** (`projects.ts:579`). **The row therefore stores a variant that disagrees
> with its figures, and that is ruled, not accidental** — design §4.3, and SNAP-AC-14's whole
> intent is to record what the customer *chose*. W11 has the same shape.
>
> **Verified at 3a:** the two limbs map one-to-one onto `resolveFigures`' two branches — the named
> variant, and the glazing filter's singleton. The tester's judgement: *"the new wording is what
> the code does; the old wording was not."*
>
> **The consequence is a Phase 3b copy rule, not a data change: WHY-AC-4.** The stored
> `selected_variant_id` is **not the caption for the figures**.
>
> **No opportunistic backfill on touch** (SNAP-AC-10's reasoning).

**SNAP-AC-2 (R22 — structural, and the only mechanism that has actually worked)** — a
source-level scan enumerating **every** statement under `worker/**` that writes
`quote_line.product_slug` or `quote_line.selected_variant_id` finds that every one also writes
`performance_figures_json`, and a writer added later that sets a product without figures fails
this test.

- **It encodes no count.** The number has been wrong three times (§7.4); the property has not.
- **It cannot pass vacuously.** Non-empty match set, at least as large as the design's index.
  **Its file reach is whatever its list says** — §12's closing note.

**SNAP-AC-3 (R22 — one place per fact)** — the display surface reads the line's own record — not
`candidate_result`, not the catalogue.

### 7.2 The hard constraint — capture is never a gate

**SNAP-AC-4 (negative — no new refusal, ops)** — an ops line edit that succeeds today on a line
where **no** performance variant can be resolved still succeeds, same status, stored values and
price; **no** `configuration_not_eligible`, no 409 and no other refusal is introduced. *(A path
that already refused before Phase 3a — the aiManaged 409 — is not a new refusal.)*

**SNAP-AC-5 (negative — no new refusal, customer)** — a customer save that succeeds today still
succeeds, `line_total` and `status` identical, no new validation or error path on that route.

**SNAP-AC-6 (best-effort resolution — scoped by A4 and A6)** — *Given* **a best-effort writer's
save that moved the pick** to a configuration the catalogue cannot answer for, *Then* the save
completes, the figures are stored as **present-and-null**, and the failure is not surfaced to the
person saving.

*The scope is the whole point.* On a save that did **not** move the pick there is nothing to
resolve, nothing to store and nothing to fail.

**SNAP-AC-7 (no latency regression)** — the catalogue is consulted at most once per save request,
not once per line. **Lines whose pick did not move contribute nothing to that request.**

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — a genuinely unknown figure is stored as
present-and-null, so a later reader can tell "no figure exists" apart from "saved before the
capture shipped".

*Under A1 the three states are structural:* column `NULL` = saved before the capture existed;
`{"uValue":null,"shgc":null}` = captured, no figure exists; numbers = captured.

**SNAP-AC-16 (A4 + A6 — negative; every present-and-null was established)** — *Given* any line
whose stored figures are present-and-null, *When* the write that produced that value is traced,
*Then* it is **one of the three honest authors**:

1. a **best-effort** save that **moved the pick** and could not resolve a figure (SNAP-AC-6);
2. a save that **successfully resolved** a published variant which genuinely carries no figures;
3. a **derivation writer's** deliberate absence — the record of *"evaluated, nothing chosen"*.

*And the negative, scoped by A6:* **Given a BEST-EFFORT writer's save that did not move the
pick** — **including one attempted while the catalogue is unreachable** — *Then* the stored
figures are byte-identical to what they were before it, and **no present-and-null is written**.

**The behavioural test is exact:** capture figures, make the catalogue unreachable, edit the room
label, assert the figures are unchanged.

> **Read it against the invariant, not against a list of sites (§7.0).** **A tester must classify
> the writer first** — and if a writer's class is unclear, that is a design question, **not a
> licence to weaken the criterion at the site where it is inconvenient**.

**SNAP-AC-9 (it is a snapshot) — unchanged in substance; its application scoped by A6** — *Given*
a line saved with figures captured, *When* the catalogue's figures later change, *Then* the
stored figures do not change, **and nothing recomputes them outside a capture moment**.

**A capture moment is:** a save that moved the pick, or a derivation writer's validated save.
**Everything else is forbidden** — every display-time read (R3, D3, WHY-AC-18), and every
best-effort re-resolve on an unmoved pick.

**SNAP-AC-10 (no backfill — D5)** — no script and no migration writes figures onto lines saved
before this phase. *Rests on R18 and on one-place-per-fact, never on a deployment window.*

**SNAP-AC-11 (the platform's record is never overwritten)** — the capture writes only to the
line's own configuration record.

**SNAP-AC-12 (surface area)** — the diff adds no endpoint and no HTTP method. **The column
question is settled: A1**, and its migration follows the `d1-migration-safety` procedure.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2.**

A hand-maintained list has been **incomplete on every attempt**: named 1, then 4, then 8, verified
at **15** — **and the list layer failed a third time in a different direction** when A6's re-walk
found two writers in a class nobody had enumerated. **Write criteria against properties, and let
the design carry the membership.**

Five shapes carry rulings of their own:

- **A parent with no product of its own** — the rule is vacuous: each unit carries its own.
- **A writer that clears a snapshot** — what replaces it is the new selection's figures, never
  nothing (SNAP-AC-14). **A1 is what keeps those two from fighting.**
- **A writer that restores a prior configuration** — it carries that configuration's figures. A
  restore moves the pick **only when it names a different variant**.
- **A best-effort writer that touches a line without moving its pick** — **carries the figures
  forward and reads no catalogue**. The most common save in the product.
- **A derivation writer at a validated save** — it re-derives figures with the price and both
  snapshots, pick moved or not, because that save **is** the capture moment.

### 7.5 The customer path, specifically

**SNAP-AC-13 (D7)** — a customer configuring a new line: the inserted `quote_line` carries the
product's figures.

**SNAP-AC-14 (D7, the erasure)** — a customer changing the configuration of a line the estimator
priced records the figures of **what the customer chose**. **This is the intent SNAP-AC-1's
revision-25 wording now matches:** on a glazing-only change what the customer chose is a glass,
not a variant.

**SNAP-AC-15 (D7, nothing customer-visible)** — every screen, price and response is identical to
before. **And on a save that moved no pick, the only difference is that nothing was stored at
all.**

### 7.6 Verified non-impact — the learning corpus

`captureRecommendationOutcomes` runs at issue (`issue.ts:46`); an override fails
`sameCoreConfiguration` (`ai/outcomes.ts:97-102`), so the outcome is `"adjusted"`,
`recommendationEligible` is false, and it is parked `pending`. **This feature must not alter that
path, and nothing in it does.**

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer (R21, R25, R31) · **ACCEPTED**

> **Accepted at stage 8 on 2026-08-25 and deployed** (`9285d642`). Every criterion was verified
> against executed evidence, including mutation checks that reverted the fix to watch the
> criterion go red. **The criteria stay exactly as written: they are what the next reader must not
> break.**

**The URL grammar — owner-confirmed (D9).** `/projects/:id/line/:lineId/drawing`; `…/drawing/u1`,
`/u2`, … — **1-based ordinals in the display order `unitLabel` renders**. **A state-only history
push was rejected by name.**

**VIEW-AC-1 (R21, R25)** — the viewer opens carrying **the whole drawing and its caption visible
together, the drawing as large as the viewport permits** — and nothing that explains the drawing's
notation.

> ### The size rule — resolved revision 18; confirmed by the owner (D13)
>
> **The criterion was requiring two things that cannot both hold.** A landscape drawing grown to
> claim 2560px of width stands roughly **1790px** tall on a **1080px** screen.
>
> **A drawing you have to scroll to see is not "the largest size the viewport allows". It is
> larger than the viewport allows.**
>
> **Which dimension governs: whichever one binds.** As shipped it was height alone, measured with
> each dimension moved separately:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> **The magic number went with it** — `62vh` was the sibling of the `720px` that caused round 1's
> MINOR. **Verified by three shapes, each moving one dimension.**

**VIEW-AC-1a (D10)** — a **unit** shows its code; the **line** is titled `Drawing`.

**VIEW-AC-2 / 2a / 2b / 2c / 2d (R31)** — **exactly one** history entry on entry; back control,
Escape and the system gesture all do the **same single pop** with **no remount and no record
re-fetch**; a cold deep link renders with the viewer open and **replaces** to the line path; a
malformed suffix **normalises by replace** and **grows no history**; and leaving a line after
enlarging takes **two backs** — **agreed cost, not a defect, not to be collapsed**.

**VIEW-AC-3 / VIEW-AC-4 (composites)** — the whole assembly in proportion, no explaining
sentence; a single unit alone at `…/drawing/u<N>`.

**VIEW-AC-5 (R21)** — exactly one viewer component, and **every** enlargeable drawing opens it.

**VIEW-AC-6** — the previous `SidePanel` enlargement no longer appears anywhere.

**VIEW-AC-7 (keyboard)** — Enter/Space opens it, focus moves in, and back returns focus to the
drawing that opened it.

**VIEW-AC-8 (R25)** — the stand-in square keeps its sentence and draws no dimension leaders.

**VIEW-AC-9 (negative)** — the record row's glyph navigates to the line page and **no** viewer
opens. `ASSUMED:` §13.1.

**VIEW-AC-10 (R25 — the class, negative)** — no symbol key, no sentence describing what the line
styles mean. **Must not rest on the `.elev-legend` selector** — §12 note 5.

**VIEW-AC-11** — `ops2-record-correction.md`'s **P1-AC-27** is **marked superseded**.

**VIEW-AC-12 (the shared export IS deleted) — REVERSED by the owner (D12).**

> **Twice, the reason given for keeping it was an unexecuted claim** — *"the customer site still
> uses it"* (false), then *"it removes a render, not an API"* (**there was no `.elev-legend` rule
> anywhere**). An export with no caller and no styles is dead code with a door painted on it.

### 8.1 Opening a drawing from the project record's desk canvas (D11)

**This journey shipped in no criterion and no interaction spec** — §12 note 11.

**VIEW-AC-13** — the canvas opens the **shared** viewer at the line's own drawing URL, **same
grammar**, **exactly one** history entry.

**VIEW-AC-14** — back, Escape and the system gesture all pop once to the **record**.

**VIEW-AC-15** — from the canvas, visible label and accessible name are both the record's
**reference**; from the line page, both name the line. **In no state does the label name one
destination while the control goes to another.**

**There is no `Project` fallback on the viewer's control, and that is not a descope.** **The
page-level control keeps `Project`**; **if one of these two labels ever changes, both change.**
**The never-empty guarantee is pinned, not assumed** — *the pinned case is the absent field;
empty and whitespace rest on `str()`'s trim (§12 note 7)*.

**VIEW-AC-16** — the record is **not remounted and not re-fetched**, the selected line is **still
selected**, and the canvas shows its drawing **from the first frame after the pop**.

**VIEW-AC-17** — `scripts/tests/web/` carries **executed** Playwright coverage. **A node:test
suite cannot satisfy this criterion.**

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

### 9.1 The panel on the line detail (R6)

**WHY-AC-1 (R6)** — the panel appears between the specification (or units block) and the price,
carrying exactly three lines: **Had to meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — `default_envelope` states the caps as figures **and** an origin label naming
them a platform default; equivalently `explicit_energy_report`, `plan_derived`, `human_override`.

**WHY-AC-3 (R4, absent)** — "Had to meet" says this opening had no thermal requirement.

**WHY-AC-4 (R6, SNAP-AC-3 — and what the figures are attributed to, revision 25)** — *Given* the
line's stored figures, *When* "This one" renders, *Then* it shows the Uw and SHGC **from the
line's own record**, attributed to **the product and the glass they describe** — never to the
row's `selected_variant_id`, and never phrased as *"this variant performs at X"*. A null figure is
stated as not recorded and never rendered as a number, a zero or a dash.

> **Why the attribution rule exists.** After a customer glazing-only change the row's
> `selected_variant_id` is deliberately **left as the estimator's** while the figures describe what
> the glass resolved to. **The id is not the caption for the figures.** Copy that reads the id and
> captions the numbers with it would state something the row does not mean — on exactly the lines
> a reviewer is most likely to be auditing.

**WHY-AC-5 (R6, R7)** — "Chosen" states the winning rule in one sentence per tier.

**WHY-AC-6 (R7)** — a run stored with `tolerance` 0.08 says 8% — read from the run, never
hardcoded.

**WHY-AC-7 / 7a / 7b / 7c / 7d (R19, R26, R29, D8)** — activating the panel's action **navigates
to `/projects/:id/line/:lineId/why`**, presented as a right-hand slide-out at desk width and full
screen on the phone; the way out is a **back** control with an accessible name and the standard
gesture, **no "Done" and no X**; a cold arrival renders the rationale with the line page's
not-found and refusal sentences and back **replaces** to the line page; and the Projects filter
panel is unchanged, tests included.

**WHY-AC-8 (R13, D6 — the thinner panel)** — a line with no selection run whose stored figures
exist shows **two** lines: that a person chose this product, and that product's own Uw and SHGC.

**WHY-AC-9 (D5, the honest gap — and present-and-null has two meanings, revision 25)** — *Given* a
line whose stored figures are **absent** (`NULL` — saved before the capture existed), *Then* the
panel states that a person chose this product and that its figures were not recorded, and **no**
catalogue lookup fills the gap. `ASSUMED:` §13.5.

> **`NULL` and present-and-null are different sentences, and present-and-null has two causes.**
> SNAP-AC-8 glosses present-and-null as *"no figure exists for this product"* — **which is not the
> only thing it can mean.** A derivation writer records *"evaluated, nothing chosen"* the same way,
> and one of them (`proposal.ts:262`) **nulls the variant while leaving `product_slug` standing**.
> Inside the statement it is coherent (`line_total=NULL`, `status='incomplete'`) — **but the panel
> will render it.**
>
> **The 3b copy must distinguish them from the row, not from the figures alone**: a line with no
> selection is not a line whose product has no published figure.

**WHY-AC-10 (R3, pre-0055 rows)** — the panel states that this recommendation was made by an
earlier model whose reasoning was not recorded. `ASSUMED:` §13.2.

**WHY-AC-11 (D2, post-issue)** — **no panel at all**, and **the `why` route renders the same
refusal as a line that has none**.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

**WHY-AC-12 / 13 (R8)** — chosen first, then the next four by ascending ladder rank — five rows,
no more; fewer than five: the ones that exist, **no count of anything beyond the list**.

**WHY-AC-14 / 15 (R9 — negative)** — no excluded candidate, no count, no exclusion reason text;
nothing about withheld products.

**WHY-AC-16 (R10 — negative)** — no price, no delta, no currency symbol, no control that prices
it.

**WHY-AC-17 (R6, R7)** — name, recorded Uw and SHGC, and a verdict in words derived from its tier.

**WHY-AC-18 (R3, D3)** — every figure shown is a stored one; no request to recompute anything.

**WHY-AC-19 (R3)** — a recorded candidate whose product no longer exists is still shown from the
recorded facts.

**WHY-AC-20 (R1 — negative)** — no control changes anything; a network trace contains only GETs.

**WHY-AC-21 (R2 — negative)** — no wording describes a human's change as wrong, a mistake or a
correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 / 23** — the platform's original recommendation shown **unchanged**, with a comparison
of the current product against the **same** requirement beside it; variant/glazing differing counts
as a change.

**WHY-AC-24 (negative)** — nothing changed: no human-selection block at all.

**WHY-AC-25 / 26 (R23)** — the requirement shown is exactly the one recorded at selection time,
and **no code path re-resolves, recomputes or re-derives a requirement**.

**WHY-AC-27 (D3, D5)** — the comparison uses the **stored** figures against the run's recorded
caps. Figures absent: it says so and makes no live lookup.

**WHY-AC-28 (R24)** — the current selection is attributed to a person and never to the platform.
`ASSUMED:` §13.10.

**WHY-AC-29 (R24 — the trap, and the test that catches it)** — a line the estimator created
(`origin = 'ai'`) whose configuration a customer has since overridden says a person chose this
product. Derived by **comparing the recorded recommendation against the line's current
product+variant** — never from `origin`.

**WHY-AC-30 / 31 (R24)** — a restore reads as platform-made once more by the same comparison; no
code path writes `origin` or `ai_proposal_line_id`.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — a composite parent whose `composite_origin` is `'ai'` **shows** the panel.

**WHY-AC-33 (R15)** — the split reason first, then each lite's own band.

**WHY-AC-34 / 35 / 36 (R16)** — each unit states its own caps and origin label; a unit with no
recorded band says so; a recorded `segment_thermal_review` flag is shown against that unit.

**WHY-AC-37 (R17, D6)** — `composite_origin = 'ops'` gets the WHY-AC-8 treatment.

**WHY-AC-38 (R14, `splitNote`)** — a recorded "no frame system could supply it" is stated. *(One
stored home: `quote_line.review_json.composite`; the fixture must carry the unresolved flag.)*

### 9.5 No action, anywhere on this surface (R28, R1, R29)

**That absence is the design, not a gap.** Owner: *"Having a button implies that some product must
be preselected, which we don't have conceptually."*

**WHY-AC-39** — the detail's only interactive element is the back control. **WHY-AC-40** — no
line-editor route exists; the child routes are exactly `drawing`, `drawing/u<N>` and `why`.
**WHY-AC-41** — the panel's only interactive element is the one that opens the detail.

---

## 10. Abuse-case criteria (negative)

The read surface is staff-gated and read-only, but it exposes **which competing products were
considered and how they compared**. The capture adds a write on paths that include the customer's
own save route. These are executed by the tester as real attempts, with the denial recorded.

**A note on status codes, corrected in revision 5.** "Anonymous → 401, customer → 403" was
unimplementable. The criteria assert **one refusal for every non-staff caller** and put the weight
on **no candidate data in the raw response body**.

**X-AC-1 / X-AC-2** — a non-staff caller is refused with the console's standard refusal, the raw
body carries no product slug, tier, thermal figure or candidate, and the anonymous and
signed-in-customer refusals are **identical in status and body**.

**X-AC-3** — a `manufacturer` staff role is refused by `hasAssignedRole`. **Executed against the
`why` URL as well as the endpoint.**

**X-AC-4 (cross-project probe — the interaction AND the URLs)** — the refusal for a line in
another project is byte-identical to the refusal for a line that does not exist, **both by
navigating and by visiting the URL directly**, **including the drawing URLs the desk canvas
pushes**.

**X-AC-5 (R9, enforced server-side)** — the raw body contains **only** the chosen candidate and at
most four runners-up.

**X-AC-6** — this feature adds **no** POST, PATCH, PUT or DELETE endpoint.

**X-AC-7** — no schedule comment text, no data belonging to any other opening, project or account.

**X-AC-8 (the capture never trusts the client — ops)** — thermal fields in the request body are
ignored entirely; stored figures are the ones the server resolved or derived.

**X-AC-9 (the capture never trusts the client — customer)** — same, on the customer route. **A
customer can never write a thermal figure onto a line**, which is the whole point of the panel.

**X-AC-10 (the capture never crosses a project)** — the existing ownership guards refuse a line id
from another project unchanged.

**X-AC-13 (the split path trusts no client field either — new, revision 25)** — *Given* a split
request whose body carries `configurationSnapshot`, `selectedVariantId`, `performanceFigures` or
any other field outside the route's accepted set, *When* it is processed, *Then* those values are
**ignored entirely** — the stored row's variant, snapshot and figures are the server's own
derivation — and the request is neither refused nor altered by their presence.

> **Why this is a criterion and not a note.** It is **safe today by construction**
> (`ops.ts:953-966` maps an explicit whitelist) — **but that safety lives in a list**, and this
> repo's list layers have been wrong repeatedly (§7.4). **A refactor that widens the mapping should
> fail a test, not depend on the next reader noticing.** **Mutation-proven at 3a:** the tester
> widened the whitelist by exactly one field and watched the criterion go red, naming the
> attacker's snapshot.

**X-AC-11 / X-AC-12 (Phase 1)** — CERT-AC-8 and CERT-AC-13 both refuse and write nothing, both
executed as real attempts; CERT-AC-11: no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | No money appears anywhere on this surface. `ASSUMED:` §13.3 | R3, R10 |
| **Quote lifecycle — post-issue** | Panel absent entirely, and the `why` URL refuses. | D2, WHY-AC-11 |
| **A catalogue import run after the strip** | No row regains the fields. | CERT-AC-12 |
| **A strip launched from a stale branch** | Refused, naming the offending importer. | CERT-AC-13 |
| **`dataSource` on a dimension rule** | Untouched. Same token, different live concept. | §2 |
| **The `ElevationLegend` export** | **Deleted**, with the assertion that pinned it. | VIEW-AC-12, D12 |
| **A room-label, colour or dimension edit on an ordinary line — including during an outage** | **Best-effort writer: figures carried forward verbatim, no catalogue read.** | A4, SNAP-AC-16 |
| **A customer autosave that changes nothing about the pick** | Nothing stored, nothing fetched. | A4, SNAP-AC-16 |
| **A dimension or quantity edit on an AI-priced line** | **Derivation writer: figures re-derive with the price and both snapshots, in one statement.** Not a breach — that save is a capture moment. | A6, §7.0 |
| **An estimator re-run that re-picks the same variant after the catalogue moved** | Figures refresh with the rest of the derivation. **Correct code, which SNAP-AC-16 as written in revision 23 wrongly condemned.** | A6 |
| **An ops edit of an AI-priced line where nothing material changed** | Price, snapshots **and** figures refresh. **Named residual, pre-existing contract.** | A6, §14 |
| **A customer changes only the glass** | The pick moves and the figures re-resolve **from the glass**, while the row **keeps its old `selected_variant_id`** — deliberately, rather than churning it. **The figures describe the configuration; the id is not their caption.** | SNAP-AC-1, SNAP-AC-14, WHY-AC-4 |
| **A line whose variant was nulled but whose product still stands** | Present-and-null means **"no selection was made"**, not "this product has no figure". **3b's copy must read the row, not the figures alone.** | WHY-AC-9, SNAP-AC-8 |
| **A save that genuinely moves the pick while the catalogue is unreachable** | Present-and-null, and **here it is the honest fact**. | SNAP-AC-6 |
| **A successful resolution of a published variant that carries no figures** | Present-and-null, **honestly** — the answer was established. | SNAP-AC-16 |
| **A pre-capture line that a best-effort writer edits** | Stays `NULL`. **No opportunistic backfill.** | A4, SNAP-AC-10 |
| **A product offering exactly one published variant, with no variant named** | Resolves to that variant — **a singleton answer set is not ambiguity**. | A5 |
| **A customer overrides an AI-priced line after the capture ships** | `configuration_snapshot_json` is still nulled **and the customer's own figures land in `performance_figures_json`** — two columns, no fight. | A1, SNAP-AC-14 |
| **A split request carrying a client-supplied snapshot or variant id** | Ignored entirely; the server's own derivation stands. Executed, not inspected. | X-AC-13 |
| **Enlarging a drawing from the record's desk canvas** | One push; back pops once to the **record**, selection and canvas intact. | D11, VIEW-AC-13…17 |
| **A project served without a `public_ref`** | The back control shows the 36-character id, **capped as a display problem**. | VIEW-AC-15 |
| **Leaving a line after enlarging a drawing** | **Two backs.** Agreed cost of R31. | VIEW-AC-2d |
| **A short wide viewport — 2560×1080** | **Height binds.** | VIEW-AC-1, D13 |
| **A tall narrow viewport, and the phone** | **Width binds.** The caption stays visible with it. | VIEW-AC-1, D13 |
| **Everything saved before the capture exists** | No figures, no backfill: the honest absence. A `NULL` column, structurally distinct from captured-but-unknown. | D5, R18, SNAP-AC-10 |
| **The catalogue is unreachable at save time** | Save completes, nobody is told. **On an unmoved pick nothing is written.** | D6, SNAP-AC-16 |
| **A non-staff caller reaches an ops route or any new URL** | One refusal, no candidate data. | X-AC-1…4 |
| **Offerability gating** | Withheld and excluded candidates never reach the client — server-side. | R9, X-AC-5 |
| **Delivery zones** | Not applicable; this surface reads no delivery fact. | — |
| **More than one selection run for an opening** | The most recent by `created_at`. `ASSUMED:` §13.4 | R3 |
| **Null thermal figures** | Stated as not recorded. Never 0, never "—". | R6 |
| **Catalogue moved since the run or since the save** | Stored facts only; no live lookup at display time, ever. | R3, D3, SNAP-AC-9 |
| **Certification** | Never appears on this screen in any phase. | R5 |

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> **Five were found in a single day of Phase 2**, every one written while *adding* coverage, and
> **not one of them looked wrong**: a self-comparing ternary; a container measured instead of its
> contents; a two-variable sweep that passed on either governor; a `.elev-legend` count-of-zero
> that became true by construction; a tautology beneath the assertion that subsumed it.
>
> > **Break the thing on purpose and watch the test go red. Make the pattern match nothing and
> > watch the scan complain.** If neither happens, the assertion was decoration.

Not a test plan — fifteen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixture** must be an AI-originated line the customer has since overridden.
2. **SNAP-AC-2 is a source-level scan.** Property of every match, never a count.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test** — where the widest defect nearly shipped.
4. **X-AC-1 must be executed for both callers separately.** **And X-AC-13 must be an executed
   attempt, not an inspection** — it exists precisely because inspection is what covered it before.
5. **VIEW-AC-10, and the selector that became a trap.**
6. **WHY-AC-39/40/41 assert absences.** Enumerate and assert the *set*.
7. **WHY-AC-7a must assert where back GOES, not what it looks like**; **VIEW-AC-15 adds the other
   half** — assert label and destination **together**. And the never-empty guarantee is **only
   half pinned**.
8. **VIEW-AC-2's numbers are the assertions.**
9. **CERT-AC-3's predicate is narrow on purpose, and the paths are not interchangeable.**
10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — six times about the codebase, once
    about the world, once about this spec's own register.** The writer index (1→4→8→**15**); the
    `api.ts:381` exemption; VIEW-AC-12's premise; "exactly one reference repo-wide"; *"removes a
    render, not an API"*; and **"there is no precedent"**, the one nobody thinks to grep.

    > **A claim about the codebase is settled by running something. A claim about the world is
    > settled by asking the person who owns it.**

11. **A journey that no criterion names will be tested by nobody.**
12. **A two-variable measurement proves nothing about which variable did the work.**
13. **A CRITERION IS CHECKED AGAINST THE OTHER CRITERIA IT CONSTRAINS — three instances now, and
    none was found by reading.** VIEW-AC-1 (a measurement); SNAP-AC-1 vs SNAP-AC-9 (an
    implementation); SNAP-AC-1 vs SNAP-AC-14 (a tester tracing a path). **All three had a shared
    subject.** **Two criteria over one subject is where to look**, and no test catches a
    contradiction, because the failing implementation is *conformant to one of them*.
14. **A CRITERION GENERALISED FROM ONE INSTANCE MUST NAME THE PROPERTY THAT MADE THAT INSTANCE
    WRONG, NOT THE BEHAVIOUR IT EXHIBITED.** *"Present-and-null has exactly one author"* is a
    behaviour; **"no writer may assert an absence it did not establish"** is the property. **A
    criterion that is too strong gets found by an implementer who cannot satisfy it — and the
    pressure at that moment is to quietly weaken it at the one inconvenient site.**
15. **ONE RULE IN TWO PLACES — the defect Phase 3a produced four times, and the phase's own
    lesson.**

    Every defect in 3a was the same shape: **a distinction that existed in one spot and was needed
    in two.**

    - **A4** — "did the pick move?" lived in one branch's head and nowhere else, so the ops branch
      re-resolved on every PATCH and W2/W3 rewrote figures on unrelated saves.
    - **A6** — the best-effort/derivation distinction lived in the architect's reading and in no
      criterion, so SNAP-AC-16 condemned two correct writers.
    - **SNAP-AC-1's wording** — "what the figures describe" lived in design §4.3 and not in the
      criterion, so the criterion described the wrong thing.
    - **The coercion sites** — "this input is a caller's, this one is a stored value" was applied
      at three sites and missed at a fourth.

    **The remedy is not vigilance; it is a single home.** §7.0's predicate *"lives once, in
    `worker/lib/figures.ts`"* for exactly this reason. **When a distinction has to be re-stated at
    a second site, that is the moment it should become a function, a criterion or a definition —
    never a second copy of a sentence.**

    **And the triage lesson, which is the sharpest of the four.** The fourth coercion site was
    found by a scan that returned four sites, two of them legitimate — and the scan was then
    discarded as noisy. **Abandoning the scan was correct; abandoning the finding along with the
    tool was not.** *"Four sites, two legitimate"* **is a triage result, and the triage stopped at
    three.** **When a tool is dropped for being noisy, its findings do not go with it** — they
    become a list somebody still owes an answer for.

    **The rule to carry into 3b and beyond, in the developer's words:**

    > **Coercing a caller's input is normalisation; coercing a stored value to stand in for an
    > input the caller never sent is fabrication.**

**THE ESCALATION IS THE MODEL, AND IT HAS NOW HAPPENED THREE TIMES.** A4 and A6 exist because the
developer **built what the design said and refused to deviate silently** — reporting a judgement
call with its downside stated instead of quietly "fixing" or quietly shipping. A quiet fix puts
**the ruling in the wrong hands**; a quiet implementation ships the defect. **A criterion that
cannot be satisfied honestly is a defect in the criterion, and it goes back up the pipeline.**

**A scan's reach is whatever its file list says, and no more.** **SNAP-AC-2's scan inherits this**,
and **X-AC-13 exists because a whitelist is the same layer.**

---

## 13. `ASSUMED:` register — every entry carries a state

**Why the states exist (added revision 15).** Two entries were **answered by the owner at Phase 1
sign-off, and Phase 2 was built against those answers**, while this register still described them
as open.

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED — and discharging one happens
> when the answer arrives, not when someone next reads the file.**

**States:** `OPEN` — still assumed, still vetoable · `DISCHARGED` — whoever this spec delegated it
to has answered it · `RETIRED` — the question dissolved · `VETOED` — answered against the
assumption.

### The failure this register has had twice, and the only mechanism that closes it

**Revision 22: §13.8 and §13.9 were reported as open questions for the owner while the architect
had already ruled both.**

> **The states were built for OWNER answers, which arrive at a decision gate the product-manager
> attends. A DELEGATED answer lands in another document, at a stage nobody re-reads the
> register.** An entry that says *"the architect may rule otherwise"* creates an obligation with no
> return address.

1. **A delegating entry names where the answer will land.**
2. **The rulings are indexed in this spec too**, at §5 (A1–A6).
3. **One command before any "live at this gate" list leaves the product-manager's hands:**
   `grep -n "§13\.\|ASSUMED" docs/design/ops2-why-this-product.md`.

**And the honest limit: none of that is automatic** — which is why the check is assigned to the
person who publishes the list and is wrong when it is stale.

**The design keeps its own `ASSUMED:` list** (design §12). **A5 governs the ambiguity one and is
vetoable with it as one pair.** **Two registers, one per document.**

**Adoption is not discharge.** Entries *built* exactly as assumed stay OPEN, annotated with where
they are built, so a veto shows its cost.

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown, following R9 | **OPEN** — Phase 3b. Built as assumed: excluded at **DTO construction**; X-AC-5 asserts it on the raw body |
| §7.2 | the `CandidateOutcome.dataSource` removal is the architect's to rule | **DISCHARGED — architect (A3)**; ADR 0011 |
| §7.3 | "3–5 next best" implemented as **4** runners-up | **OPEN** — Phase 3b. Within R8's "3–5"; a veto is a number change in one place |
| §7.4 | the `CONTEXT.md` corrections are the architect's to apply | **DISCHARGED — verified applied 2026-08-25** |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record row's glyph does not open the viewer | **OPEN — shipped and deployed.** A veto now costs rework |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded | **OPEN** — Phase 3b |
| 3 | **§11, GST** — no money at all on this surface | **OPEN** — Phase 3b |
| 4 | **§11, multiple runs** — the most recent only | **OPEN** — Phase 3b |
| 5 | **WHY-AC-9** — where figures were never captured, the panel says so | **OPEN** — Phase 3b. **Revision 25 added the second meaning of present-and-null here** — a veto now has more copy behind it |
| 6 | *(the capture's reach)* | **RETIRED** — D7 |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 |
| 8 | **SNAP-AC-12** — figures live in `configuration_snapshot_json` | **DISCHARGED — architect (A1): OVERRIDDEN.** A **new nullable column**. That column is deliberately **set to NULL** when a customer materially edits an AI-priced line — so the save that most needs to *record* figures is the save that *erases* it. **Content is exactly `{"uValue", "shgc"}`** — duplicating the variant identity would create **a second home for a fact** |
| 9 | **§7.4** — R22 reaches the estimator's own writers | **DISCHARGED — architect (A2): yes.** Without it, one panel line would read two places |
| 10 | **WHY-AC-28** — R6's three labels kept, only "Chosen" changes | **OPEN** — Phase 3b. Copy, and the owner is its audience |
| 11 | **§10** — the uniform refusal is adopted as written | **RETIRED** — §2 puts changing it out of scope |
| 12 | *"the drawing viewer is an overlay"* | **VETOED by R31** |
| 13 | **VIEW-AC-12** — the export is retained | **VETOED — owner (D12)** |
| 14 | **The URL grammar** | **DISCHARGED — owner (D9)** |
| 15 | **The viewer's title** | **DISCHARGED — owner (D10)** |
| 16 | **VIEW-AC-1** — no fixed ceiling | **RETIRED — the wrong question.** Superseded by §13.18 |
| 17 | **VIEW-AC-15** — the project's **title** | **VETOED — owner.** **Rework: the label expression only** |
| 18 | **VIEW-AC-1** — all the leftover space; the caption never scrolls | **DISCHARGED — owner (D13)** |
| 19 | *(the 3a-before-3b urgency)* | **VETOED — owner (D14).** Asserted as fact in prose; registered retrospectively |
| 20 | *(SNAP-AC-1's "sets or changes", read as including a rewrite of the same pick)* | **VETOED — architect (A4).** A **latent reading of a criterion**, which shipped as a breach of SNAP-AC-9 |
| 21 | *(SNAP-AC-16's "exactly one author", read as governing every writer)* | **VETOED — architect (A6).** The opposite failure to §13.20: **too strong**, condemning correct writers |
| 22 | *(SNAP-AC-1's "that product+variant's figures", read as a promise that the row's `selected_variant_id` describes them)* | **VETOED — tester's trace, revision 25.** On a customer glazing-only change the figures come from the glass and the row keeps its old variant id **by design**. Wording corrected; **the substance goes to the owner at acceptance** (§14); the copy consequence is pinned in **WHY-AC-4** |

---

## 14. Decisions needed

**One, and nothing is blocked on it.**

**When a customer changes only the glass, what should the stored figures describe — and what
should the panel say?**

**What is built, and what I recommend confirming:** the figures describe **the glass the customer
chose** (resolved with no variant named), and the row **keeps the `selected_variant_id` the
estimator set**, rather than churning it on every glass swap. So the row can hold a variant id that
does not match its figures. **That is deliberate** — design §4.3, and it is exactly SNAP-AC-14's
intent: record what the customer *chose*.

**Why you are being asked at all:** Phase 3b renders this. **WHY-AC-4 now forbids the panel from
captioning the figures with that variant id** — it attributes them to the product and the glass —
because *"this variant performs at X"* beside an id meaning something else would mis-state the row
on exactly the lines a reviewer is most likely auditing.

**The alternatives, both worse:** null the variant id on every glazing change (churn on a field
other things read), or re-resolve a variant id to match the figures (a guess written into a column
that means "what was selected").

**Recommendation: confirm as built.** One consequence to accept with it: an ops reader looking at
the raw row sees a variant id that is not what the figures describe — which is why the panel, not
the row, is where the sentence is made.

**Live for Phase 3b, at that gate:** §7.1, §7.3, §13.2, §13.3, §13.4, §13.5, §13.10 — all OPEN,
all cheap to veto before the surface is built. I ran the design grep before writing that list.
