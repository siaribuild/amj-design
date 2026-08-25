# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 29**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

**Phase 2 ACCEPTED and DEPLOYED** (`9285d642`). **Phase 3a ACCEPTED** (D15), certified at
`72d6b28b`; **not yet deployed, by the owner's choice** (D17). **The Phase 3b gate is closed**
(D18, D19, D20).

**Revision 29 amends WHY-AC-29, which D16 had made wrong — on the exact lines a reviewer opens
the panel to audit.**

WHY-AC-29 decides whether the panel says *the platform chose this* or *a person chose this*. It
compared **product + variant**. **D16 keeps the estimator's `selected_variant_id` on the row after
a glazing-only customer override** — deliberately, to avoid churning a field other things read —
so on such a line **both terms match** and the panel would attribute the customer's own choice to
the platform. That is the precise failure R24 exists to prevent, on lines stamped
`customerConfigurationChanged`.

**The criterion now compares the pick** (§7.0): product, glazing, and the variant term **only
where both sides name one**. **The glazing term dominates exactly where D16 leaves the id stale,
so a stale id can never decide the comparison.**

**And it is D16's third dependency.** The owner accepted a row that disagrees with itself **on the
condition that nothing downstream reads that id as the answer**. Three criteria now carry that
condition — **WHY-AC-4** (never caption the figures with it), **WHY-AC-29** (never attribute on
it), and the DTO's omission of `current.variantId` altogether. **If any one is weakened, D16
re-opens.**

**Two additions to §12.** The opening rule is broadened: **a universal claim over an empty set is
true and proves nothing** — in a test it is a green light with nothing behind it, **in production
it is a branch nobody takes**, which is what a vacuous `every()` would have done to WHY-AC-9's
second sentence. And **note 16**: *prefer a shape that makes the error impossible over a rule that
forbids it* — **a rule needs a reader; a shape does not.**

**Revision 28** closed the 3b gate, discharged seven entries and repaired WHY-AC-27 and WHY-AC-4.
**Revision 27** recorded D15–D17. **Revision 26** recorded the phase's lesson (note 15).
**Revision 25** folded in three tester observations. **Revision 24** scoped SNAP-AC-16 (A6).
**Revision 23** repaired SNAP-AC-1 vs SNAP-AC-9 (A4). **Revision 22** reconciled the register
against the design. **Revision 21** retracted a false urgency. **Revision 20** recorded the
assertion-that-cannot-fail rule; **19** corrected VIEW-AC-15; **18** resolved VIEW-AC-1's internal
contradiction; **17** carried the veto of §13.17; **16** carried D11 and D12.

Revision 15 gave every register entry a state; revision 14 corrected VIEW-AC-12's false premise;
revision 13 amended the CERT-AC-10 fence; revision 12 folded in the importers; revision 11 closed
VIEW-AC-2's mechanism; revision 10 folded in D8 and R31; revision 9 applied R29/R30 and added
§2.1; revision 8 applied R28; revision 7 corrected a false claim about an existing legend test;
revision 6 applied the closed UX mock gate; revision 5 repaired two architect findings; revisions
2–4 folded in the owner's decision rounds.

**Decisions needed: none** (§14). Two entries remain open and neither blocks 3b.

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055 — the
requirement and where it came from, every candidate's tier, rank, thermal figures, fit and price —
and **no route in `worker/routes/` reads either table**. The reasoning is written to a database and
never spoken.

The consequence lands at the **human review gate**, the stage between submission and issue where a
recommendation is confirmed or overridden. The person standing there today either takes the
machine's word or re-does the thermal comparison by hand. Neither is a review. In the owner's
words: *"I want to be able to audit recommendations and accuracy of thermal modelling"* and *"the
bigger vision is to surface most likely alternatives hopefully making human's work easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead `certified`
flag — never asked for, wired to opposite default values in two places of the Sanity schema —
downgrades **13 of 32 products to "indicative estimate only" on every thermally-constrained
line**. **And the catalogue importers write the flag back on every run** (§6, CERT-AC-12).

And a third gap, **closed by Phase 3a**: a product's thermal performance was not recorded on the
line that uses it. Under R3/D3 nothing may look it up at display time to recover it — so if a save
does not record it, it is gone.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel on the line detail view, and the
   detail **screen** it leads to — its own route (D8) — carrying the requirement and its origin,
   the chosen product against it, why it won, and **four** next-best alternatives by ladder rank
   (D18). Composites included (R14–R17). A **thinner panel** for lines nobody's estimator ever
   evaluated (D6). **No action anywhere on it** (R28).
2. **The `certified` removal, depth (c)** (R5, conclusions §5; CERT-AC-10's amendment). **Phase 1,
   and nothing else rides with it** (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7)** — **shipped in Phase 3a.**
4. **A shared drawing viewer** for ops2 (R21, R25, R31) — **shipped in Phase 2.**
5. **Two changes to the shared `SidePanel`** (R26, R29) — shipped with Phase 2.
6. **The line-route URL grammar** — shipped in Phase 2. **Phase 3b adds only the `why` child.**
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12) — shipped.

### Out of scope — and why

| Not built | Because |
|---|---|
| **"Change the product" — the control, and any placeholder for it** | **R28, deferred rather than declined.** Supersedes D4. See §2.1. |
| **Re-classifying the Projects filter panel** | R26/R27's approval explicitly excluded moving it (WHY-AC-7b); **its own future ticket**. |
| **Renaming the dimension-rule `dataSource`** | `types.ts:77` uses the same token for a **different, live, correct** concept. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4.** A recompute of a captured snapshot (SNAP-AC-9). **Does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling, and **D19 confirms it on the read side**. |
| **Filling a missing figure from today's catalogue at display time** | **D19**, and it would have reversed **D3 and D5** — the owner was shown that and did not take it. |
| **Showing withheld products, or any money, on the surface** | **D18.** Money would have re-opened **R10**, not toggled a setting. |
| **Conditioning the aiManaged branch on a new "material change" predicate** | A6's rejected alternative. |
| **Re-resolving a `selected_variant_id` to match the figures on a glazing-only change** | **D16.** The id stays **stable** — and **nothing downstream reads it as the answer** (WHY-AC-4, WHY-AC-29, and the DTO's omission). |
| Any line editor in ops2, stub or real | Follows R28. |
| Explanatory notation of any kind on a drawing surface | R25 — ops staff read elevations for a living. |
| Switching the line's product from the "Why" surface | R1: read-only. |
| Recording a verdict on the recommendation | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3 + **D19**. |
| Re-deriving a thermal **requirement** anywhere | R23. |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | R24. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. |
| **Any change to the ops routes' authentication or refusal convention** | §10 — which is why §13.11 is RETIRED. |
| Any change to the learning corpus or the issue-time capture path | §7.6. |
| Excluded candidates, in any form | R9. |
| Backfilling anything | R18 *"leave history"*; accepted explicitly (D5). |
| Carrying the rationale past issue | D2. |
| The staff role vocabulary | Conclusions §8: own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Persona ≠ role. |
| Any customer-facing **display** change | Staff surface only. |

### 2.1 Deferred — how product switching might work

> ⚠️ **DIRECTION, NOT REQUIREMENT. NOTHING IN THIS SECTION IS TO BE BUILT.**

The owner's sketch, verbatim:

> *"this should be a new panel for switching indeed: X is gone from this view; cards for options
> are clickable; a click leads to a new confirmation screen; the screen shows something about the
> new choice with confirm/cancel as CTAs."*

1. **The two-panel split resolves the snapshot/live tension.** **Audit panel = what we decided
   then. Switch panel = what is true now.**
2. **The switching list is probably not the audit list.** Expect its own query.
3. **Do not drop the dismiss from the switching panel.** Under R29/R31 that exit is back.
4. **The confirmation screen has four things to show, each a reason to abort.**
5. **The learning path already handles it** — §7.6.
6. **This is the decision surface the owner declined at grill Q1**, returning properly separated.

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source.*

**Two axes, never merged** — **Persona** is who someone is and what they need; **RBAC** is what the
platform permits (R20).

### Estimator (persona)

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

**Confidence in the platform's reasoning, and speed through the review** — not correction of the
machine. R2 is the direct consequence and the copy must honour it.

**They read this surface; they do not act on it.** **Going back is not an action** (R29).

**And they already know how to read a drawing** (R25).

**And what they read must be what was established.** A4 and A6 are that sentence applied to the
capture; **WHY-AC-4 and WHY-AC-29 are it applied to the copy and to the attribution**, and **D16
rests on both**. **D19 is the same sentence again**: the panel says what was recorded and never
reaches back to fill a gap.

**The one thing this reader is actually auditing is the attribution.** *"Did the platform choose
this, or did a person?"* is the question the panel exists to answer; **WHY-AC-29 is that answer's
mechanism**, and a stale identifier must never be allowed to give it.

### Customer (existing — newly relevant, via D6/D7)

Owner: *"human, as in client, manual picks do not have targets, but showing panel with performance
data is fine, I think."* And: *"a selection shall not be perceived as AI-made anymore"* — while
*"that does not change the target."*

The Customer is not a reader of this surface. **Their save must never start failing** (§7.2), and
**an autosave that changes nothing about the pick must not touch their figures** (A4, SNAP-AC-16).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame people. AMJ is
manufacturer.**"*

### Manufacturer partner (an RBAC exclusion, recorded to close it)

`hasAssignedRole` already refuses them (`worker/lib/staff.ts:150`). **This surface exposes which
competing products were considered and how they compared**; §10 executes it as an abuse case.

### The stage: the human review gate

Between submission and issue. A stage in a quote's life, not a persona and not a role.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker code **plus the
four importer edits** → Studio deploy → verified export → dry-run → `--apply`. **The strip is last,
and final.** **Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — the shared drawing viewer and the URL grammar · **SHIPPED** (`9285d642`)

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a — a server write-path change (§7)** · **ACCEPTED (D15)**, certified at `72d6b28b`.
- **Phase 3b — a read-only display surface (§9)** · in build; **its gate is closed** (D18–D20).

**Deploy sequencing — D17: 3a and 3b deploy together.** Migration `0058` reaches production **with
3b**, and remote apply has not happened.

> **This is the opposite of the retracted urgency, not its return.** **There are no saves in
> between** — which is what makes one deploy event safer than two. **Nobody may cite D17 as
> evidence for urgency in either direction.**

**The cost the owner accepted (D5):** no backfill, so **every line saved before Phase 3 has no
figures** (WHY-AC-9, WHY-AC-27).

> **~~The reason the sequencing paragraph used to give:~~** *"…every save in between is a line that
> will have something to show, and a save that is missed cannot be recovered."* **False, and
> retracted rather than deleted.**

**Dependency check:** **3b depends on Phase 2** for the route grammar, and on 3a for anything a
human selected to have figures at all.

### Wayfinder check

**Not needed.** 31 rulings, twenty owner decisions, six architect rulings taken out loud in design
§1.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label · R5 no
certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen + 3–5 next best ·
R9 no excluded · R10 no price deltas · R11 human change shows both · R12 frame or glazing =
changed · R13 no-run lines still show the panel · R14 panel on machine-proposed composites · R15
split reason then per-lite bands · R16 per-lite bands are real · R17 ops split = R13 · R18 leave
history · R19 right-hand slide-out · R20 same gate as the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** **A4 and A6 sharpen what "every save" means: every save at
which a product is actually selected.**

**R23 — a target is not a selection.** **R24 — an overridden selection must no longer read as
platform-made**; **attribution is derived by comparison, never read from `origin`** — and, after
D16, **never from `selected_variant_id` alone** (WHY-AC-29).

**R25 — no explanatory notation on an ops drawing surface.** **A class, not a block.**

**R26 — the phone detail opens full screen.** **~~R27~~ AMENDED BY R29**; what survives is that
**"Done" is wrong**. **R28 — "Change the product" is not implemented, and neither is a
placeholder.** **R30 — modals carry controls on top, title centred**; **no modal exists in this
feature**.

**R29 — the detail is a screen in the navigation tree; its dismiss is a BACK control.**

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka Confirm/Cancel)."*

**R31 — the drawing viewer is a tree node with a back control, not a modal.** Cost named and
accepted: **two backs to leave a line after enlarging** (VIEW-AC-2d).

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures snapshotted
at save, never read live · ~~**D4**~~ · **D5** the capture waits for Phase 3 — ***about lines saved
BEFORE THE CAPTURE EXISTED, which is history*** · **D6** a client/manual-picked line shows a
thinner panel **with** its product's figures · **D7** the capture extends to the customer save
path · **D8** the detail screen gets its own URL · **D9** the URL grammar · **D10** the viewer's
title names the subject · **D11** back from the canvas returns to the record and the control says
so · **D12** `ElevationLegend` is deleted · **D13** the drawing claims all leftover space · **D14**
the phasing is about manageability, not urgency · **D15** Phase 3a accepted · **D17** 3a and 3b
deploy together.

**D16 — the glazing-only change is confirmed as built, and it has three dependencies.**

The figures describe **the glass the customer chose**; the row **keeps the estimator's
`selected_variant_id`** rather than churning it. The owner accepted the stated consequence — **an
ops reader looking at the raw row sees a variant id that is not what the figures describe** —
**on the condition that nothing downstream reads that id as the answer.**

> **Three criteria now carry that condition. If any one is weakened, D16 re-opens.**
>
> 1. **WHY-AC-4** — the panel never **captions the figures** with that id.
> 2. **WHY-AC-29** — the panel never **decides the attribution** on that id (amended revision 29;
>    it compares **the pick**, §7.0).
> 3. **The DTO omits `current.variantId` entirely** (design §4.7) — so the forbidden reads are
>    **impossible rather than merely forbidden**. See §12 note 16.
>
> **Dependency 2 was found after the fact**, by the architect's 3b design refresh: WHY-AC-29 was
> written long before D16 and compared product+variant, which **both match** on a glazing-only
> override. **The panel would have credited the platform with the customer's own choice, on
> exactly the lines stamped `customerConfigurationChanged`.**

**D18 — panel scope (Phase 3b gate).** The chosen product **plus four alternatives, five rows**.
**Withheld products stay hidden.** **No money anywhere on the surface.** *(He was told showing
money would **re-open R10**, not toggle a setting.)* Discharges §7.3, §7.1, §13.3.

**D19 — thin, old and plural records.** The panel **shows what was recorded and says so plainly
when there is nothing; it never reaches back to fill a gap.** *(He was shown that filling missing
figures from today's catalogue would **reverse D3 and D5**, and did not take it.)* Discharges
§13.5, §13.2, §13.4.

**D20 — the overridden line.** **The same three lines everywhere**; only the **"Chosen" sentence**
changes. Discharges §13.10.

### Architect rulings — delegated by this spec, taken in `docs/design/ops2-why-this-product.md` §1

- **A1 (§1.1) — a new column, `quote_line.performance_figures_json`.** Overrides §13.8. Migration
  `0058`.
- **A2 (§1.2) — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 (§1.3) — `CandidateOutcome.thermal.dataSource` removed from the contract.** ADR 0011.
- **A4 (§1.4) — the capture fires when the pick moves, never on a save that leaves it untouched.**
- **A5 (§1.5) — a singleton answer set is not ambiguity.** **Still OPEN — vetoable as one pair with
  the design's ambiguity rule at Phase 3 acceptance.**
- **A6 (§1.6) — a validated re-derivation is a capture moment.** Two classes of writer, one honesty
  invariant (§7.0).

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5)** — a product whose thermal figures come only from legacy `performanceVariants`
with `certified` absent or false is **not** downgraded to `commercial_only_estimate` on account of
certification, and is ranked on its Uw/SHGC figures alone.

**CERT-AC-2 (the drop-guard)** — a legacy variant previously removed by the guard at
`catalogue.ts:187` is present in the candidate set, provided it still passes the non-certification
checks.

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** — a source-level
scan of `worker/**`, `src/**`, `scripts/**`, `sanity/**`, comments stripped, finds no `isCertified`
or `energyCertified`; no `certified` as a field name or written value; and no `dataSource` **where
it is valued** `"certified" | "estimated" | "manufacturer"` or written/projected on a performance
variant or thermal-profile row.

**The narrowness is deliberate.** `dataSource` has a **second, live, correct meaning** —
dimension-rule provenance at `types.ts:77`.

| Allowed | Why |
|---|---|
| `scripts/tests/**` | A test that asserts the field is gone has to be able to name it. |
| `sanity/scripts/strip-certified.mjs` | The script whose entire job is removing the field must name it. |

> **Two corrections here, revision 13.** The allowlisted path was wrong — **no
> `scripts/catalogue/strip-certified.mjs` exists**. CERT-AC-13's scanned directory,
> `scripts/catalogue/*.mjs`, **was and remains correct**. **And a third entry is gone** —
> `src/ops/api.ts:381`, exempted as *"a legacy read surface"*; **the tester executed that claim and
> it was false.** See §12 note 10.

**Non-vacuity:** the walk must be **shown to have reached** `catalogue.ts` and `import-wers.mjs`.

**And `certificationRef` / `wersWindowId` are still read and still carried** — a WERS reference is
a real fact about a product; it simply is not a gate.

**CERT-AC-4 (R18)** — a stored `commercial_only_estimate` is unchanged; no migration and no script
rewrites a stored status.

**CERT-AC-5 (status coherence)** — a line outside the `meets` tier, or whose rules run raised a
warning, is still downgraded for **that** reason.

**CERT-AC-6 (Studio schema)** — no "Certified" boolean, no "Data source" dropdown, the validation
rule gone, the WERS reference field still editable.

**CERT-AC-7 (document values, depth (c))** — after the strip, no document carries `certified` or a
variant `dataSource`; every `certificationRef` / `wersWindowId` is byte-identical to the export; no
other field differs.

**CERT-AC-8 (export gate — abuse case)** — no verified export, no strip.

**CERT-AC-9 (contract stability)** — *Given* **A3**, an `outcome_json` written before the change
parses without error, and no surface renders the field.

**CERT-AC-10 (the fence) — AMENDED 2026-08-24. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…and **no application save path**."* **No longer true,
> and the amendment is recorded rather than the criterion rewritten.**

The diff changes no file under `worker/lib/staff.ts`, no role CHECK constraint, no migration, and
**no application save path other than the JSON snapshot builders whose source fields this phase
deletes** — `proposal.ts:375` (written at `:415`) and `splitCandidates.ts:356`.

**Why the breach is necessary, not creep.** The only alternative is writing **literal** values for
fields whose source data no longer exists — a removal with a copy kept.

**CERT-AC-11 (blast radius)** — no customer-facing response body gains or loses a field, and no
price changes for an already-priced line.

**CERT-AC-12 (durability)** — running the importers as an operator would, **no row regains
`certified` or a certification-valued `dataSource`**.

**CERT-AC-13 (the strip refuses a stale checkout)** — refuses and writes nothing, naming the
offending file.

**CERT-AC-14 (deploy order)** — worker code **and the four importer edits** → Studio deploy →
verified export → dry-run → `--apply`.

---

## 7. Acceptance criteria — Phase 3a: the universal capture · **ACCEPTED (D15)**

**Why this is its own phase.** **Not urgency** — §4's retraction. It is a **server write-path change
with the widest blast radius in this feature**, it falls under Probity, and §7.2's negative criteria
are worth proving against a deployment in which nothing else moved.

**Where the figures live: A1** — `quote_line.performance_figures_json`, migration `0058`
**(local-only; production with 3b, D17)**.

### 7.0 The definitions every criterion below depends on

#### The pick (A4)

**Exactly the resolver's inputs:** `product_slug`, `selected_variant_id`, `options.glazing`
(`lib/lines.ts:164`). **Colour, hardware, the room label, dimensions cannot move the figures.** A
pick that names **no** variant does not move the variant term. **The predicate lives once**, in
`worker/lib/figures.ts` — **§12 note 15 is what happens when a distinction lives in two places.**

> **The pick is also the unit of comparison for attribution (WHY-AC-29, revision 29)** — not just
> for the capture. Comparing anything narrower re-introduces the stale-id problem D16 created
> deliberately.

#### The two classes of writer, and the one invariant (A6)

> **No writer may assert an absence it did not establish.**

- **Best-effort writers** **ask** the catalogue and **have a failure channel**, so a re-resolve on
  an unmoved pick can only degrade or lie. **A4's predicate governs them.**
- **Derivation writers** **are** the derivation and have **no failure channel that can write a
  dishonest absence**. **For them the pick-moved predicate is the wrong condition**: a dimension or
  quantity edit does not move the pick but must reprice, and carrying figures forward while
  `line_total` and both snapshots re-derive beside them would describe **one variant at two
  different times in adjacent columns**.

**Membership is a property, not a list.** **Verified at 3a: attacked as a property, not sampled.**

**The residual, named rather than hidden (A6).** An ops edit of an AI-priced line refreshes price,
snapshots **and** figures even when nothing material changed — **the branch's pre-existing
contract**, and a **product question about that branch**.

### 7.1 One rule

**SNAP-AC-1 (R22 + A4 + A6)** — a save whose **stored pick actually differs after the save**, or a
**validated re-derivation by a derivation writer**, records **the Uw and SHGC of the configuration
that save established** — the variant the pick named, or, where the pick named none, the variant its
product and glazing resolved to.

*And the other half, scoped by A6:* a **best-effort** writer's save that **leaves the pick
untouched** carries the figures **forward verbatim** and **reads no catalogue at all**.

> **Why "the configuration that save established".** On a **glazing-only** change the pick moves,
> the figures re-resolve with **no variant named**, and the row **deliberately retains its old
> `selected_variant_id`** — **ruled, and confirmed by the owner as D16**. **Verified at 3a:** the
> two limbs map one-to-one onto `resolveFigures`' two branches.

**SNAP-AC-2 (R22 — structural)** — every statement under `worker/**` that writes
`quote_line.product_slug` or `quote_line.selected_variant_id` also writes
`performance_figures_json`. **No count encoded; cannot pass vacuously; its file reach is whatever
its list says.**

**SNAP-AC-3 (R22 — one place per fact)** — the display surface reads the line's own record.

### 7.2 The hard constraint — capture is never a gate

**SNAP-AC-4 / SNAP-AC-5** — an ops edit and a customer save that succeed today still succeed, same
status, stored values and price; **no new validation, 409 or error path**.

**SNAP-AC-6 (best-effort resolution)** — a **best-effort writer's save that moved the pick** to a
configuration the catalogue cannot answer for completes, stores **present-and-null**, tells nobody.

**SNAP-AC-7** — the catalogue is consulted at most once per save request. **Lines whose pick did not
move contribute nothing.**

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — present-and-null, so a later reader can tell "no
figure exists" apart from "saved before the capture shipped". *Under A1 the three states are
structural: `NULL` = never captured; `{"uValue":null,"shgc":null}` = captured, no figure exists;
numbers = captured.*

**SNAP-AC-16 (A4 + A6 — negative)** — a present-and-null was written by **one of three honest
authors**: a best-effort save that moved the pick and could not resolve; a successful resolution of
a variant that genuinely carries no figures; or a derivation writer's deliberate *"evaluated,
nothing chosen"*. **A best-effort save that did not move the pick — including during an outage —
leaves the figures byte-identical and writes no present-and-null.**

**SNAP-AC-9 (it is a snapshot)** — stored figures do not change when the catalogue changes, **and
nothing recomputes them outside a capture moment**.

**SNAP-AC-10 (no backfill — D5)** — no script and no migration writes figures onto lines saved
before this phase. **D19 confirms the same refusal on the read side.**

**SNAP-AC-11** — the capture writes only to the line's own configuration record.

**SNAP-AC-12** — no new endpoint, no new HTTP method; the column is A1's.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2.** A hand-maintained list has
been **incomplete on every attempt**: 1, then 4, then 8, verified at **15** — **and the list layer
failed a third time in a different direction** when A6's re-walk found two writers in a class nobody
had enumerated. **Write criteria against properties, and let the design carry the membership.**

### 7.5 The customer path, specifically

**SNAP-AC-13 / 14 / 15 (D7)** — a new customer line carries figures; a customer override records
**what the customer chose**; **nothing customer-visible changes**.

### 7.6 Verified non-impact — the learning corpus

An override fails `sameCoreConfiguration`, so the outcome is `"adjusted"` and parked `pending`.
**This feature must not alter that path, and nothing in it does.**

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer · **ACCEPTED, DEPLOYED**

> Verified against executed evidence including mutation checks. **The criteria stay exactly as
> written: they are what the next reader must not break.**

**The URL grammar (D9).** `/projects/:id/line/:lineId/drawing`; `…/drawing/u1`, `/u2`, … — **1-based
ordinals in the display order `unitLabel` renders**. **A state-only history push was rejected by
name.**

**VIEW-AC-1 (R21, R25)** — **the whole drawing and its caption visible together, the drawing as
large as the viewport permits**, and nothing that explains the drawing's notation.

> **The criterion was requiring two things that cannot both hold.** A landscape drawing grown to
> claim 2560px of width stands roughly **1790px** tall on a **1080px** screen. **Which dimension
> governs: whichever one binds.** As shipped it was height alone:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> **Verified by three shapes, each moving one dimension.**

**VIEW-AC-1a (D10)** — a **unit** shows its code; the **line** is titled `Drawing`.

**VIEW-AC-2 / 2a / 2b / 2c / 2d (R31)** — **exactly one** history entry on entry; back, Escape and
the system gesture all do the **same single pop** with **no remount and no record re-fetch**; a cold
deep link renders with the viewer open and **replaces** to the line path; a malformed suffix
**normalises by replace**; leaving a line after enlarging takes **two backs** — **agreed cost, not
to be collapsed**.

**VIEW-AC-3 / 4 (composites)** — the whole assembly in proportion; a single unit alone at
`…/drawing/u<N>`.

**VIEW-AC-5 (R21)** — exactly one viewer component, and **every** enlargeable drawing opens it.

**VIEW-AC-6** — the previous `SidePanel` enlargement no longer appears anywhere.

**VIEW-AC-7 (keyboard)** — Enter/Space opens it; back returns focus to the drawing that opened it.

**VIEW-AC-8 (R25)** — the stand-in square keeps its sentence and draws no dimension leaders.

**VIEW-AC-9 (negative)** — the record row's glyph navigates to the line page and **no** viewer
opens. `ASSUMED:` §13.1.

**VIEW-AC-10 (R25 — the class, negative)** — no symbol key, no sentence describing what the line
styles mean. **Must not rest on the `.elev-legend` selector.**

**VIEW-AC-11** — `ops2-record-correction.md`'s **P1-AC-27** is **marked superseded**.

**VIEW-AC-12 (the shared export IS deleted) — REVERSED by the owner (D12).**

### 8.1 Opening a drawing from the project record's desk canvas (D11)

**VIEW-AC-13** — the canvas opens the **shared** viewer at the line's own drawing URL, **same
grammar**, **exactly one** history entry.

**VIEW-AC-14** — back, Escape and the system gesture all pop once to the **record**.

**VIEW-AC-15** — from the canvas, visible label and accessible name are both the record's
**reference**; from the line page, both name the line.

**VIEW-AC-16** — the record is **not remounted and not re-fetched**, the selected line is **still
selected**, and the canvas shows its drawing **from the first frame after the pop**.

**VIEW-AC-17** — `scripts/tests/web/` carries **executed** Playwright coverage.

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

> **Gate closed (D18, D19, D20); every `ASSUMED:` this section carried is discharged.** **Three
> criteria have been repaired since they were written** — WHY-AC-27 and WHY-AC-4 (revision 28,
> overtaken by SNAP-AC-8's three states) and **WHY-AC-29 (revision 29, overtaken by §7.0 and
> D16)**. §12 note 13 carries the class and the trigger.

### 9.0 The three states, and the three sentences (A1, SNAP-AC-8)

| State | What it means | What the panel says |
|---|---|---|
| **Column `NULL`** | Saved **before the capture existed**. Nobody ever asked. | *"not recorded"* — WHY-AC-9 |
| **`{"uValue":null,"shgc":null}`** | **Captured**, and the answer was **"no figure exists"** — *or* a derivation writer's *"evaluated, nothing chosen"* | Two causes, **distinguished from the row** — WHY-AC-9 |
| **Numbers** | Captured, with figures | The figures — WHY-AC-4 |

**Where present-and-null has two causes, the row settles which** (`line_total`, `status`,
`selected_variant_id`): a line with **no selection** is not a line whose **product has no published
figure**. **The figures alone cannot tell them apart.**

### 9.1 The panel on the line detail (R6)

**WHY-AC-1 (R6, D19)** — *Given* a line whose opening resolves to a **most recent** selection run
with recorded candidate outcomes, and whose product is still the one the platform selected, *Then* a
panel appears between the specification (or units block) and the price, carrying exactly three
lines: **Had to meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — `default_envelope` states the caps as figures **and** an origin label naming
them a platform default; equivalently `explicit_energy_report`, `plan_derived`, `human_override`.

**WHY-AC-3 (R4, absent)** — "Had to meet" says this opening had no thermal requirement.

**WHY-AC-4 (R6, SNAP-AC-3, §9.0 — what the figures are attributed to; D16's first dependency)** —
*Given* a line whose stored figures **are numbers**, *Then* "This one" shows the Uw and SHGC **from
the line's own record**, attributed to **the product and the glass they describe** — never to the
row's `selected_variant_id`, and never phrased as *"this variant performs at X"*.

*Given* a figure is **not a number**, *Then* it is **never rendered as a number, a zero or a dash**,
and which sentence it gets is **§9.0's, by state**.

> **This criterion is part of the consideration the owner was given for D16** — one of **three**
> (WHY-AC-29 and the DTO's omission of `current.variantId` are the others). **Weakening any of the
> three re-opens D16.**
>
> **~~As written through revision 27:~~** *"a figure recorded as null is stated as not recorded"* —
> which collapsed two different facts into one sentence.

**WHY-AC-5 (R6, R7)** — "Chosen" states the winning rule in one sentence per tier: `meets`,
`within_tolerance`, `misses`, `thermal_unknown`, `does_not_fit`.

**WHY-AC-6 (R7)** — a run stored with `tolerance` 0.08 says 8% — read from the run, never
hardcoded.

**WHY-AC-7 / 7a / 7b / 7c / 7d (R19, R26, R29, D8)** — activating the panel's action **navigates to
`/projects/:id/line/:lineId/why`**, presented as a right-hand slide-out at desk width and full
screen on the phone; the way out is a **back** control with an accessible name and the standard
gesture, **no "Done" and no X**; a cold arrival renders the rationale with the line page's not-found
and refusal sentences and back **replaces** to the line page; and the Projects filter panel is
unchanged, tests included.

**WHY-AC-8 (R13, D6, §9.0 — the thinner panel)** — *Given* a line with **no selection run** whose
stored figures **are numbers**, *Then* the panel shows **two** lines: that a person chose this
product, and that product's own Uw and SHGC.

*The boundary with WHY-AC-9 is the state, not the presence of a run.*

**WHY-AC-9 (D5, D19, §9.0 — the honest gap, and which absence it is)** — *Given* a line whose stored
figures are **`NULL`**, *Then* the panel states that a person chose this product and that **its
figures were not recorded**, and **no catalogue lookup fills the gap**.

*Given* the figures are **present-and-null**, *Then* the panel distinguishes the two causes **from
the row**: where the row shows a selection, the product has **no published figure**; where the row
shows **no selection was made** (`line_total` null, `status` incomplete, variant null with
`product_slug` standing), it says that instead.

> **The mapping must not decide this with a universal quantifier over a possibly-empty set.** A run
> can be stored with **zero candidate rows** when everything was withheld (`persist.ts:143`), and a
> vacuous `every()` over that empty set is **true** — sending the line to *"reasoning not
> recorded"*, the wrong sentence, with nothing about the code looking wrong. **See §12's opening
> rule: the empty case satisfies the check.**

**WHY-AC-10 (R3, D19, pre-0055 rows)** — the panel states that this recommendation was made by an
earlier model whose reasoning was not recorded; **no reconstruction**, and no alternatives action.

**WHY-AC-11 (D2, post-issue)** — **no panel at all**, and **the `why` route renders the same refusal
as a line that has none**.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

**WHY-AC-12 (R8, D18)** — the chosen product first, marked as chosen, then **the next four** by
ascending ladder rank — **five rows, no more**.

**WHY-AC-13 (R8)** — fewer than five: the ones that exist, no placeholder rows and **no count of
anything beyond the list**.

**WHY-AC-14 (R9 — negative)** — no excluded candidate, no count of them, no exclusion reason text.

**WHY-AC-15 (R9, D18 — negative)** — **nothing about withheld products appears.**

**WHY-AC-16 (R10, D18 — negative, and it governs the whole surface)** — *Given* **any part of this
surface — the panel's three lines, the thinner panel, and every row of the detail** — *Then* it
carries **no price, no price delta, no currency symbol and no control that prices anything**.

> **Widened in revision 28 because D18's ruling is "no money anywhere" and this criterion covered
> only the alternative rows.** **A criterion narrower than its ruling stops protecting it the moment
> the DTO changes.**

**WHY-AC-17 (R6, R7)** — an alternative row states the product's name, its recorded Uw and SHGC, and
its verdict in words derived from its tier.

**WHY-AC-18 (R3, D3, D19)** — every figure shown is a stored one; the surface issues **no request to
the catalogue or the estimator to recompute anything**.

**WHY-AC-19 (R3)** — a recorded candidate whose product no longer exists is still shown from the
recorded facts, never blank or dropped.

**WHY-AC-20 (R1 — negative)** — no control changes the line, the quote or any stored value; a
network trace contains only GETs.

**WHY-AC-21 (R2 — negative)** — no wording describes a human's product change as wrong, incorrect, a
mistake, an error or a correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 / 23 (R11, R12)** — the platform's original recommendation shown **unchanged**, with a
comparison of the current product against the **same** requirement beside it; variant **or** glazing
differing counts as a change.

**WHY-AC-24 (R11 — negative)** — neither changed: no human-selection block at all.

**WHY-AC-25 / 26 (R23)** — the requirement shown is exactly the one recorded at selection time, and
**no code path re-resolves, recomputes or re-derives a requirement**.

**WHY-AC-27 (D3, D5, §9.0 — the mechanism and its gap; repaired revision 28)** — *Given* a line
whose make-up was changed and whose stored figures **are numbers**, *Then* the comparison uses those
**stored** figures against the run's recorded caps — meet, within the stored tolerance band, or miss
— in WHY-AC-17's vocabulary, with no wording that frames the change as an error (R2).

*Given* the figures are **not numbers**, *Then* the comparison is **not attempted**, the panel says
which absence it is **in §9.0's terms**, and it **still shows the requirement and the platform's
recommendation unchanged**, with **no live lookup** (D19).

> **~~As written through revision 27:~~** *"the figures are absent — changed before the capture
> shipped, or resolved to null"* — **one sentence for two different facts.**

**WHY-AC-28 (R24, D20 — attribution, the sentence)** — *Given* a line whose current selection
differs from the configuration the platform recommended, *Then* the current selection is attributed
to a person and never to the platform: **R6's three labels are kept and only the "Chosen" sentence
changes** — it says a person chose this product and names what the platform had recommended instead.

**WHY-AC-29 (R24, §7.0, D16 — attribution, the MECHANISM; amended revision 29)** — *Given* a line
the estimator created (`origin = 'ai'`, `ai_proposal_line_id` set, so `aiManaged` at `ops.ts:1039`
is still true) whose configuration a customer has since overridden, *When* the panel renders,
*Then* it says **a person chose this product**.

**The attribution is derived by comparing THE PICK** (§7.0) — **the product**, **the glazing**
(`options_json.glazing` against the recorded variant's `glazingOptionSlug`), and **the variant term
only where both sides name one**. Never from `origin`, never from `ai_proposal_line_id`, and
**never from `selected_variant_id` alone**.

**Two fixtures, and the criterion is not met by one of them:**

1. **the product changed** — the old comparison catches this too;
2. **only the glass changed** — the product matches, and the row still carries **the estimator's
   `selected_variant_id`** (D16). **An implementation comparing product+variant concludes
   *platform-made* here**, which is the failure this criterion exists to prevent.

> **~~As written through revision 28:~~** *"comparing the recorded recommendation's product+variant
> against the line's current product+variant"*. **Correct when written; wrong after D16**, which
> keeps the estimator's variant id on the row after a glazing-only override — deliberately, to
> avoid churning a field other things read. **Both terms then match, and the panel would credit the
> platform with the customer's own choice — on exactly the lines stamped
> `customerConfigurationChanged`, which are the lines a reviewer opens this panel to audit.**
>
> **The glazing term dominates precisely where D16 leaves the id stale, so a stale id can never
> decide the comparison.**
>
> **This is D16's second dependency** (§5). The owner accepted a row that disagrees with itself
> **on the condition that nothing downstream reads that id as the answer** — and this criterion is
> half of that condition. **The DTO omitting `current.variantId` is what makes it structural rather
> than merely required** (§12 note 16).
>
> **Same rot class as W1-manual, W5 and W14 in Phase 3a: a rule written before a definition changed
> underneath it, still reading as authoritative.** §12 note 13's fifth instance — **and it was
> caught by the trigger revision 28 wrote, run by the architect rather than by me.** My own rev-28
> walk checked §9 against SNAP-AC-8's distinction and missed §7.0's, established the same day. **The
> walk must enumerate the distinctions a phase established, not only the one that prompted it.**

**WHY-AC-30 / 31 (R24)** — a restore reads as platform-made once more by the same comparison; no
code path writes `origin` or `ai_proposal_line_id`.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — a composite parent whose `composite_origin` is `'ai'` **shows** the panel.

**WHY-AC-33 (R15)** — the split reason first, then each lite's own band.

**WHY-AC-34 / 35 / 36 (R16)** — each unit states its own caps and origin label; a unit with no
recorded band says so, and **no band is computed for it**; a recorded `segment_thermal_review` flag
is shown against that unit.

**WHY-AC-37 (R17, D6)** — `composite_origin = 'ops'` gets the WHY-AC-8 treatment.

**WHY-AC-38 (R14, `splitNote`)** — a recorded "no frame system could supply it" is stated. *(One
stored home: `quote_line.review_json.composite`; the fixture must carry the unresolved flag.)*

### 9.5 No action, anywhere on this surface (R28, R1, R29)

**WHY-AC-39** — the detail's only interactive element is the back control. **WHY-AC-40** — no
line-editor route exists; the child routes are exactly `drawing`, `drawing/u<N>` and `why`.
**WHY-AC-41** — the panel's only interactive element is the one that opens the detail.

---

## 10. Abuse-case criteria (negative)

**X-AC-1 / X-AC-2** — a non-staff caller is refused with the console's standard refusal, the raw
body carries no product slug, tier, thermal figure or candidate, and the anonymous and
signed-in-customer refusals are **identical in status and body**.

**X-AC-3** — a `manufacturer` staff role is refused by `hasAssignedRole`. **Executed against the
`why` URL as well as the endpoint.**

**X-AC-4 (cross-project probe)** — the refusal for a line in another project is byte-identical to
the refusal for a line that does not exist, **both by navigating and by visiting the URL directly**.

**X-AC-5 (R9, D18, enforced server-side)** — the raw body contains **only** the chosen candidate and
at most four runners-up: no excluded candidate, no `exclusions[]`, **no `withheldIncomplete`**, no
price.

**X-AC-6** — this feature adds **no** POST, PATCH, PUT or DELETE endpoint.

**X-AC-7** — no schedule comment text, no data belonging to any other opening, project or account.

**X-AC-8 / X-AC-9 (the capture never trusts the client)** — thermal fields in the request body are
ignored entirely, on both the ops and customer routes.

**X-AC-10** — the existing ownership guards refuse a line id from another project unchanged.

**X-AC-13 (the split path trusts no client field either)** — client-supplied `configurationSnapshot`,
`selectedVariantId`, `performanceFigures` or any field outside the route's accepted set are **ignored
entirely**. **Mutation-proven at 3a.**

**X-AC-11 / X-AC-12 (Phase 1)** — the two gates on the irreversible write both refuse and write
nothing; no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | **No money appears anywhere on this surface.** The line's existing Price panel is untouched. | **D18**, WHY-AC-16 |
| **Quote lifecycle — post-issue** | Panel absent entirely, and the `why` URL refuses. | D2, WHY-AC-11 |
| **A room-label, colour or dimension edit on an ordinary line — including during an outage** | **Best-effort writer: figures carried forward verbatim, no catalogue read.** | A4, SNAP-AC-16 |
| **A dimension or quantity edit on an AI-priced line** | **Derivation writer: figures re-derive with the price and both snapshots.** Not a breach. | A6, §7.0 |
| **A customer changes only the glass** | The figures re-resolve **from the glass**; the row **keeps its old `selected_variant_id`**. **Nothing downstream reads that id as the answer** — not the caption (WHY-AC-4), not the attribution (WHY-AC-29), and it is not in the DTO. | **D16** |
| **The panel's verdict on that same line** | **"A person chose this product."** The **glazing term** decides it, because product and variant both match. **A product+variant comparison would get this backwards.** | **WHY-AC-29** |
| **A line saved before the capture existed** | Column `NULL`. The panel says **"not recorded"** and **looks nothing up**. | **D19**, §9.0 |
| **A line whose variant was nulled but whose product still stands** | Present-and-null meaning **"no selection was made"**. **The row settles it; the figures cannot.** | §9.0, WHY-AC-9 |
| **A run stored with zero candidate rows** (everything withheld) | **Not "reasoning not recorded".** A universal quantifier over the empty set is true and would send it to the wrong sentence. | WHY-AC-9, §12 |
| **An opening estimated more than once** | **The most recent run only.** | **D19**, WHY-AC-1 |
| **A product held back because our catalogue record is unfinished** | **Not shown at all**, and never sent to the client. | **D18**, X-AC-5 |
| **A line a human changed** | **Same three lines**; only the **"Chosen"** sentence changes. | **D20**, WHY-AC-28 |
| **A product offering exactly one published variant, with no variant named** | Resolves to that variant — **a singleton answer set is not ambiguity**. | A5 (**still open**) |
| **Enlarging a drawing from the record's desk canvas** | One push; back pops once to the **record**, selection and canvas intact. | D11, VIEW-AC-13…17 |
| **Leaving a line after enlarging a drawing** | **Two backs.** Agreed cost of R31. | VIEW-AC-2d |
| **A non-staff caller reaches an ops route or any new URL** | One refusal, no candidate data. | X-AC-1…4 |
| **Catalogue moved since the run or since the save** | Stored facts only; **no live lookup at display time, ever**. | R3, D3, **D19** |
| **Certification** | Never appears on this screen in any phase. | R5 |

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> **Five were found in a single day of Phase 2**, every one written while *adding* coverage, and
> **not one of them looked wrong**.
>
> > **Break the thing on purpose and watch the test go red. Make the pattern match nothing and watch
> > the scan complain.** If neither happens, the assertion was decoration.
>
> **AND IT IS NOT ONLY TESTS — THE EMPTY CASE SATISFIES THE CHECK.** *A universal claim over an
> empty set is true and proves nothing.* **In a test** that is a green light with nothing behind it.
> **In production it is a branch nobody takes**: the 3b design refresh found that WHY-AC-9's second
> sentence would have been decided by a vacuous `every()` — a run stored with **zero candidate
> rows** when everything was withheld (`persist.ts:143`) satisfies *"every candidate has no recorded
> outcome"*, so the line would have been sent to *"reasoning not recorded"*, **the wrong sentence,
> with nothing about the code looking wrong.**
>
> **So the question is the same in both places: can this be true for a reason I did not intend?**
> Seven instances now — six dead assertions and one live predicate. **Guard the empty set
> explicitly, or decide the branch on something that cannot be vacuous.**

Not a test plan — sixteen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixtures — now two, and one of them is the whole point.** A product change is
   caught by any comparison. **A glazing-only override is caught only by comparing the pick**, and
   it is the fixture on which the criterion's amendment turns.
2. **SNAP-AC-2 is a source-level scan.** Property of every match, never a count.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test.**
4. **X-AC-1 must be executed for both callers separately.** **X-AC-13 must be an executed attempt.**
5. **VIEW-AC-10, and the selector that became a trap.**
6. **WHY-AC-39/40/41 assert absences.** Enumerate and assert the *set*.
7. **WHY-AC-7a must assert where back GOES**; **VIEW-AC-15 adds the other half.**
8. **VIEW-AC-2's numbers are the assertions.**
9. **CERT-AC-3's predicate is narrow on purpose.**
10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — six times about the codebase, once about
    the world, once about this spec's own register, and once about which code path a measurement
    came from.**

    > **A claim about the codebase is settled by running something. A claim about the world is
    > settled by asking the person who owns it.**

    **THE FOURTH SHAPE — A MEASUREMENT CARRIED FROM ONE PATH TO ANOTHER.** The Phase 3a acceptance
    said a coercion site *"produces a unit whose stored glass differs from the opening it was split
    from"*. **The probe was real and its result was true — at the ops paths.** The claim then
    described **a different site**, where `splitCandidates.ts:344-347` overwrites `glazing` with the
    unit's own chosen variant. There the divergence **could never happen** and **could never reach
    the figures**. The defect was real and the fix warranted — **a faithfulness defect, not a
    capture defect**: every *other* inherited option was corrupted, and `String(false ?? "")` is
    `"false"`, so a boolean `false` became a **truthy string**.

    > **A measurement is evidence for the thing measured. Generalising it to a sibling path is the
    > same defect as an unexecuted claim, wearing a result** — and *harder* to catch, because a
    > number looks like verification. **Re-measure on the path you are describing, or describe the
    > path you measured.**

11. **A journey that no criterion names will be tested by nobody.**
12. **A two-variable measurement proves nothing about which variable did the work.**
13. **A CRITERION IS CHECKED AGAINST THE OTHER CRITERIA IT CONSTRAINS — five instances now, and none
    was found by reading it alone.**

    VIEW-AC-1 (a measurement); SNAP-AC-1 vs SNAP-AC-9 (an implementation); SNAP-AC-1 vs SNAP-AC-14
    (a tester tracing a path); WHY-AC-27/WHY-AC-4 vs SNAP-AC-8 (a walk); **and WHY-AC-29 vs §7.0 and
    D16 — a criterion that would have credited the platform with a customer's own choice, on exactly
    the lines a reviewer opens the panel to audit.**

    **All five had a shared subject.** **The trigger, written in revision 28: when a phase
    establishes a new distinction, walk the criteria written before it.**

    **And revision 29's own lesson about that trigger — the walk must enumerate EVERY distinction
    the phase established, not only the one that prompted it.** Revision 28 walked §9 against
    SNAP-AC-8's three states and repaired two criteria. **It did not walk §9 against §7.0's *pick*,
    defined the same day**, so WHY-AC-29 stayed wrong for one more revision and was caught by the
    architect. **A partial walk reads exactly like a complete one afterwards.**

14. **A CRITERION GENERALISED FROM ONE INSTANCE MUST NAME THE PROPERTY THAT MADE THAT INSTANCE
    WRONG, NOT THE BEHAVIOUR IT EXHIBITED.**
15. **ONE RULE IN TWO PLACES — the defect Phase 3a produced four times.** **The remedy is not
    vigilance; it is a single home.**

    **And the triage lesson.** *"Four sites, two legitimate"* **is a triage result, and the triage
    stopped at three.** **When a tool is dropped for being noisy, its findings do not go with it.**

    > **Coercing a caller's input is normalisation; coercing a stored value to stand in for an input
    > the caller never sent is fabrication.**

16. **PREFER A SHAPE THAT MAKES THE ERROR IMPOSSIBLE OVER A RULE THAT FORBIDS IT — a rule needs a
    reader; a shape does not (new, revision 29).**

    The 3b design **deleted `current.variantId` from the DTO** rather than relying on WHY-AC-4 to
    forbid captioning figures with it. **The forbidden thing became unbuildable rather than
    disallowed** — and the same move covers WHY-AC-29, because a field that is not there cannot
    decide an attribution either.

    **Three instances already in this document, and they are the same move:**

    - **A1's dedicated column** made SNAP-AC-8's three states **structural** rather than
      key archaeology, and SNAP-AC-2's scan **one regex** — the rule stopped needing enforcement
      because the shape enforced it.
    - **D12's deletion of `ElevationLegend`** removed a door rather than posting a sign on it.
    - **The DTO omission**, above.

    **When a criterion forbids a use, ask whether the thing being misused needs to be reachable at
    all.** A criterion that survives only because everyone remembers it is one careless reader from
    being false; **a shape that cannot express the error survives readers who never heard of it.**
    *(This does not retire the criterion — WHY-AC-4 and WHY-AC-29 stay, because a later change could
    restore the field. It makes them a second line rather than the only one.)*

**THE ESCALATION IS THE MODEL.** **A criterion that cannot be satisfied honestly is a defect in the
criterion, and it goes back up the pipeline.**

---

## 13. `ASSUMED:` register — every entry carries a state

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED — and discharging one happens when
> the answer arrives, not when someone next reads the file.**

**States:** `OPEN` — still assumed, still vetoable · `DISCHARGED` — whoever this spec delegated it to
has answered it · `RETIRED` — the question dissolved · `VETOED` — answered against the assumption.

### The failure this register has had twice, and the only mechanism that closes it

> **A DELEGATED answer lands in another document, at a stage nobody re-reads the register.**

1. **A delegating entry names where the answer will land.**
2. **The rulings are indexed in this spec too**, at §5 (A1–A6).
3. **One command before any "live at this gate" list leaves the product-manager's hands:**
   `grep -n "§13\.\|ASSUMED" docs/design/ops2-why-this-product.md`. **Run for the Phase 3b gate:
   nothing discharged behind the register's back.**

**And the honest limit: none of that is automatic.**

**The design keeps its own `ASSUMED:` list** (design §12). **A5 governs the ambiguity one and is
vetoable with it as one pair.** **Two registers, one per document.**

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown | **DISCHARGED — owner (D18)** |
| §7.2 | the `CandidateOutcome.dataSource` removal is the architect's to rule | **DISCHARGED — architect (A3)**; ADR 0011 |
| §7.3 | "3–5 next best" implemented as **4** runners-up | **DISCHARGED — owner (D18)** |
| §7.4 | the `CONTEXT.md` corrections are the architect's to apply | **DISCHARGED — verified applied** |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record row's glyph does not open the viewer | **OPEN — shipped and deployed.** A veto now costs rework. **The only open entry of this spec's own** |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded | **DISCHARGED — owner (D19)** |
| 3 | **§11, GST** — no money at all on this surface | **DISCHARGED — owner (D18)** |
| 4 | **§11, multiple runs** — the most recent only | **DISCHARGED — owner (D19)** |
| 5 | **WHY-AC-9** — where figures were never captured, the panel says so | **DISCHARGED — owner (D19)** |
| 6 | *(the capture's reach)* | **RETIRED** — D7 |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 |
| 8 | **SNAP-AC-12** — figures live in `configuration_snapshot_json` | **DISCHARGED — architect (A1): OVERRIDDEN** |
| 9 | **§7.4** — R22 reaches the estimator's own writers | **DISCHARGED — architect (A2): yes** |
| 10 | **WHY-AC-28** — R6's three labels kept, only "Chosen" changes | **DISCHARGED — owner (D20)** |
| 11 | **§10** — the uniform refusal is adopted as written | **RETIRED** |
| 12 | *"the drawing viewer is an overlay"* | **VETOED by R31** |
| 13 | **VIEW-AC-12** — the export is retained | **VETOED — owner (D12)** |
| 14 | **The URL grammar** | **DISCHARGED — owner (D9)** |
| 15 | **The viewer's title** | **DISCHARGED — owner (D10)** |
| 16 | **VIEW-AC-1** — no fixed ceiling | **RETIRED — the wrong question** |
| 17 | **VIEW-AC-15** — the project's **title** | **VETOED — owner** |
| 18 | **VIEW-AC-1** — all the leftover space; the caption never scrolls | **DISCHARGED — owner (D13)** |
| 19 | *(the 3a-before-3b urgency)* | **VETOED — owner (D14)** |
| 20 | *(SNAP-AC-1's "sets or changes")* | **VETOED — architect (A4)** |
| 21 | *(SNAP-AC-16's "exactly one author")* | **VETOED — architect (A6).** **Too strong** |
| 22 | *(SNAP-AC-1's "that product+variant's figures")* | **DISCHARGED — owner (D16)** |
| 23 | *(WHY-AC-29's "product+variant" comparison, read as still valid after D16)* | **VETOED — architect's 3b design refresh, 2026-08-25.** Not a tagged assumption: **a criterion that was correct when written and made wrong by a later ruling**, still reading as authoritative. Amended to compare **the pick** (§7.0). Registered retrospectively, like §13.19 and §13.20, so the correction is visible where the states are read — **and because it is D16's second dependency** |

---

## 14. Decisions needed

**None.** The Phase 3b gate is closed (D18–D20), **§9 is ready to build against**, and WHY-AC-29's
amendment is recorded rather than left for the developer to discover.

**Two things remain open, and neither blocks 3b:**

- **§13.1 (VIEW-AC-9)** — **OPEN and already shipped**; a veto now costs rework, not an edit.
- **A5** (a singleton answer set is not ambiguity) — the **architect's**, and **vetoable as one pair
  with the design's ambiguity rule** at Phase 3 acceptance.

**One thing the owner should be reminded of at Phase 3 acceptance, because it is now three criteria
wide:** **D16's condition.** He accepted a row whose `selected_variant_id` does not describe its
figures **because nothing downstream reads that id as the answer** — the caption (WHY-AC-4), the
attribution (WHY-AC-29) and the DTO's omission of the field. **If any of the three is weakened,
D16 re-opens.**

**Still to happen, and it is the owner's:** the deploy. `0058` is **local-only**; it reaches
production **with 3b** (D17), under the deploy protocol — full gates green, security sweep green on
the deployed commit, preview smoke-test before promoting, because this touches a save path.
