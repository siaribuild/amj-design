# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 27**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a ruling contradicts the mock, the ruling wins.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

**Phase 2 is ACCEPTED and DEPLOYED** — owner sign-off, production version `9285d642`.
**Phase 3a is ACCEPTED** — owner sign-off on the stage-8 verdict (**D15**), certified at
`72d6b28b` with `ce73f41a` landing after. **Not yet deployed, by the owner's choice** (**D17**).

**Revision 27 records the Phase 3a sign-off and its two rulings, and sets the Phase 3b gate.**

- **D16 — the glazing-only change is confirmed as built**, and it made **WHY-AC-4
  load-bearing**: the owner accepted a row whose `selected_variant_id` does not describe its
  figures **on the strength of the panel never captioning the figures with that id**. That
  dependency is now written into WHY-AC-4 itself. **If 3b weakens it, D16 re-opens.**
- **D17 — 3a and 3b deploy together.** Migration `0058` reaches production **with 3b**, not
  before. **This is the opposite of the retracted urgency, not its return** (§4).
- **§14 is now the Phase 3b decision gate** — the seven OPEN entries grouped into **three
  questions**, each with what a veto costs today and **which criteria move with it**.

**Revision 26** recorded the phase's own lesson (§12 note 15): **one rule in two places caused
every defect in Phase 3a**. **Revision 25** folded in three tester observations. **Revision 24**
scoped SNAP-AC-16 (A6). **Revision 23** repaired SNAP-AC-1 vs SNAP-AC-9 (A4). **Revision 22**
reconciled the register against the design. **Revision 21** retracted a false urgency.
**Revision 20** recorded the assertion-that-cannot-fail rule; **19** corrected VIEW-AC-15; **18**
resolved VIEW-AC-1's internal contradiction; **17** carried the veto of §13.17; **16** carried
D11 and D12.

Revision 15 gave every register entry a state; revision 14 corrected VIEW-AC-12's false premise;
revision 13 amended the CERT-AC-10 fence; revision 12 folded in the importers; revision 11 closed
VIEW-AC-2's mechanism; revision 10 folded in D8 and R31; revision 9 applied R29/R30 and added
§2.1; revision 8 applied R28; revision 7 corrected a false claim about an existing legend test;
revision 6 applied the closed UX mock gate; revision 5 repaired two architect findings; revisions
2–4 folded in the owner's decision rounds.

**Decisions needed: three grouped questions, at the Phase 3b gate** (§14). Nothing is blocked;
every one is cheap now and expensive after the panel ships.

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055 —
the requirement and where it came from, every candidate's tier, rank, thermal figures, fit and
price — and **no route in `worker/routes/` reads either table**. The reasoning is written to a
database and never spoken.

The consequence lands at the **human review gate**, the stage between submission and issue where
a recommendation is confirmed or overridden. The person standing there today either takes the
machine's word or re-does the thermal comparison by hand. Neither is a review. In the owner's
words: *"I want to be able to audit recommendations and accuracy of thermal modelling"* and
*"the bigger vision is to surface most likely alternatives hopefully making human's work
easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead `certified`
flag — never asked for, wired to opposite default values in two places of the Sanity schema —
downgrades **13 of 32 products to "indicative estimate only" on every thermally-constrained
line**. **And the catalogue importers write the flag back on every run** (§6, CERT-AC-12).

And a third gap, now closed by Phase 3a: **a product's thermal performance was not recorded on
the line that uses it.** The save paths stored the product, the options and the price; the Uw and
SHGC that make the choice reviewable were looked up at selection time and dropped. Under R3/D3
nothing may look them up at display time to recover them — so if a save does not record them,
they are gone.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel on the line detail view, and the
   detail **screen** it leads to — its own route (D8) — carrying the requirement and its origin,
   the chosen product against it, why it won, and the 3–5 next-best alternatives by ladder rank.
   Composites included (R14–R17). A **thinner panel** for lines nobody's estimator ever evaluated
   (D6). **No action anywhere on it** (R28).
2. **The `certified` removal, depth (c)** — code, Studio schema, the values in the live
   documents, **the catalogue importers that would write them back**, and **the JSON snapshot
   builders whose source fields this removes** (R5, conclusions §5; CERT-AC-10's amendment).
   **Phase 1, and nothing else rides with it** (D5).
3. **The universal performance-figure capture (R22, D3, D6, D7)** — **shipped in Phase 3a.**
   Every save that **moves a line's pick**, and every **validated re-derivation** by a derivation
   writer (§7.0), records the resolved configuration's Uw and SHGC on the line.
4. **A shared drawing viewer** for ops2 (R21, R25) — **a node in the navigation tree with its own
   route and a back control** (R31), **and reachable from the project record's desk canvas**
   (D11, §8.1).
5. **Two changes to the shared `SidePanel`** (R26, R29): full-screen on the phone, and a **back**
   control in place of "Done" — without moving the Projects filter panel.
6. **The line-route URL grammar** — **in Phase 2, with the viewer**. Phase 3b adds only the `why`
   child. No new server endpoint anywhere except the rationale read.
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12).

### Out of scope — and why

| Not built | Because |
|---|---|
| **"Change the product" — the control, and any placeholder for it** | **R28, deferred rather than declined.** Owner: *"do not implement CTA change the product… ultimately, switching products is not part of the current run."* Supersedes D4. See §2.1. |
| **Re-classifying the Projects filter panel** | R26/R27's approval explicitly excluded moving it (WHY-AC-7b); **its own future ticket**. |
| ~~**Deleting the shared `ElevationLegend` export**~~ | **NO LONGER OUT OF SCOPE — reversed by the owner (D12).** |
| **Renaming the dimension-rule `dataSource`** | `types.ts:77` uses the same token for a **different, live, correct** concept. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4.** A recompute of a captured snapshot (SNAP-AC-9); during an outage it asserts "no figure exists" on a save that never successfully asked. **Does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling. A lookup at edit time is a display-time catalogue read wearing a snapshot's clothes. |
| **Conditioning the aiManaged branch on a new "material change" predicate** | A6's rejected alternative. |
| **Re-resolving a `selected_variant_id` to match the figures on a glazing-only change** | **D16.** The stored id stays **stable** rather than churning on every glass swap; the figures describe the configuration, and **the id is not their caption** (WHY-AC-4). |
| Any line editor in ops2, stub or real | Follows R28. |
| Any deep-link into the legacy ops console | Was D4's rejected alternative; moot under R28. |
| Explanatory notation of any kind on a drawing surface | R25 — ops staff read elevations for a living. |
| Switching the line's product from the "Why" surface | R1: read-only. |
| Recording a verdict on the recommendation | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time**, for anything | R3 + D3. |
| Re-deriving a thermal **requirement** anywhere | R23. |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | R24. |
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

> *"this should be a new panel for switching indeed: X is gone from this view; cards for options
> are clickable; a click leads to a new confirmation screen; the screen shows something about the
> new choice with confirm/cancel as CTAs."*

1. **The two-panel split resolves the snapshot/live tension.** **Audit panel = what we decided
   then. Switch panel = what is true now.**
2. **The switching list is probably not the audit list.** Expect its own query.
3. **Do not drop the dismiss from the switching panel.** Under R29/R31 that exit is back.
4. **The confirmation screen has four things to show, each a reason to abort:** whether the new
   choice still meets the requirement, the price, whether the line drops out of `ready`, and that
   the line stops being platform-chosen (R24).
5. **The learning path already handles it** — §7.6.
6. **This is the decision surface the owner declined at grill Q1**, returning properly separated.

**Console convention it will inherit (R30).** **No modal exists in this feature.**

## 3. Actors and needs

*Carried verbatim from the grill conclusions §1 — the owner is the only primary source, and
nothing below is inferred.*

**Two axes, never merged** — **Persona** is who someone is and what they need; **RBAC** is what
the platform permits (R20).

### Estimator (persona — new to the domain; the architect adds it to `CONTEXT.md`)

Owner: *"yes, estimator, as a persona, has the needs. But that does not need to translate into a
separate rbac role with limited feature set, not at this point of time."*

> *"I want to be able to audit recommendations and accuracy of thermal modelling."*
> *"the bigger vision is to surface most likely alternatives hopefully making human's work easier."*
> *"this is for human review gate."*

Read together: **confidence in the platform's reasoning, and speed through the review** — not
correction of the machine. R2 is the direct consequence and the copy must honour it.

**They read this surface; they do not act on it.** **Going back is not an action** (R29), and
**back must return them where they were, saying where that is in the words they already use**
(D11).

**And they already know how to read a drawing** (R25). **What they do need is to see the whole of
it at once** — VIEW-AC-1.

**And what they read must be what was established.** A4 and A6 are that sentence applied to the
capture; **WHY-AC-4 is it applied to the copy** — the panel states what the figures describe,
never what a stored identifier implies. **D16 rests on that.**

### Customer (existing — newly relevant, via D6/D7)

Owner: *"human, as in client, manual picks do not have targets, but showing panel with
performance data is fine, I think. It simply means that this panel will be far less rich in
details."* And: *"a selection shall not be perceived as AI-made anymore"* — while *"that does not
change the target."*

The Customer is not a reader of this surface. What changes for them is invisible: what their save
*records*. **Their save must never start failing** (§7.2), and **an autosave that changes nothing
about the pick must not touch their figures** (A4, SNAP-AC-16).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame people. AMJ
is manufacturer.**"*

### Manufacturer partner (an RBAC exclusion, recorded to close it)

`hasAssignedRole` already refuses them (`worker/lib/staff.ts:150`). Recorded because **this
surface exposes which competing products were considered and how they compared**. §10 executes it
as an abuse case rather than trusting it.

### The stage: the human review gate

Between submission and issue. A stage in a quote's life, not a persona and not a role.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Delivers on its own:** thermally-constrained lines stop being downgraded because of a flag
nobody asked for. **The importers are in this phase**: a Phase 1 that ships with a known expiry is
not Phase 1. **Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker code
**plus the four importer edits** → Studio deploy → verified export → dry-run → `--apply`. **The
strip is last, and final.**

**Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — The shared drawing viewer, **and the line-route URL grammar** · **SHIPPED**

**Accepted and deployed 2026-08-25**, production version `9285d642`.

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a — a server write-path change (§7)** · **ACCEPTED (D15)**, certified at `72d6b28b`,
  `ce73f41a` after. `worker/**`, so **Probity applies**. It carries the feature's only regression
  risk.
- **Phase 3b — a read-only display surface (§9)** · next.

**Deploy sequencing — D17: 3a and 3b deploy together.** Migration `0058` reaches production
**with 3b**, and remote apply has not happened.

> **This is the opposite of the retracted urgency, not its return.** The retraction (§4, revision
> 21) killed the claim that *saves would be lost between the two deployments* — the owner's
> ruling being that **there are no saves in between**. That same fact is what makes one deploy
> event safer than two: nothing is waiting to be captured, so shipping the write path early buys
> nothing and costs a second production change against a save path. **Nobody may cite D17 as
> evidence for urgency in either direction.**

**Presentation and navigation model are separate things, and this spec specifies both.**
Presentation — a right-hand slide-out at desk width, full screen on the phone (R19, R26).
Navigation — a **screen in the tree** with its own route (R29, D8), opened by a route change.

**The cost the owner accepted (D5):** no backfill, so **every line saved before Phase 3 has no
figures** (WHY-AC-9, WHY-AC-27).

**Sequencing inside the phase:** 3a landed first and alone — red test, then the write, then its
negative criteria green — before any read endpoint or UI work started. **The certified diff
contains no `src/` change at all**, which is what made that separation real rather than nominal.

> **~~The reason this paragraph used to give:~~** *"…every save in between is a line that will
> have something to show, and a save that is missed cannot be recovered."*
>
> **That is false, and it is retracted here rather than deleted.** **There will be no saves
> between 3a and 3b. The phasing exists to make the change manageable, nothing more.** **Nobody
> may accept a schedule risk, a shortened review or a rushed deploy on the strength of it.**

**Dependency check:** **3b depends on Phase 2** for the route grammar, which has shipped, and on
3a for anything a human selected to have figures at all.

### Wayfinder check

**Not needed.** 31 rulings, seventeen owner decisions, six architect rulings taken out loud in
design §1.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label · R5 no
certification on screen · R6 three panel lines · R7 name the 5% band · R8 chosen + 3–5 next best ·
R9 no excluded · R10 no price deltas · R11 human change shows both · R12 frame or glazing =
changed · R13 no-run lines still show the panel · R14 panel on machine-proposed composites · R15
split reason then per-lite bands · R16 per-lite bands are real · R17 ops split = R13 · R18 leave
history · R19 right-hand slide-out · R20 same gate as the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** **A4 and A6 sharpen what "every save" means without
weakening the rule: every save at which a product is actually selected.**

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

**Three careful readers independently placed the viewer on the modal side** — each reasoning from
"it is an overlay" rather than from "does it ask a question?".

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures snapshotted
at save, never read live · ~~**D4**~~ · **D5** the capture waits for Phase 3 — ***about lines
saved BEFORE THE CAPTURE EXISTED, which is history; never about a gap between the 3a and 3b
deployments*** · **D6** a client/manual-picked line shows a thinner panel **with** its product's
figures · **D7** the capture extends to the customer save path · **D8** the detail screen gets its
own URL · **D9** the URL grammar · **D10** the viewer's title names the subject · **D11** back
from the canvas returns to the record and the control says so · **D12** `ElevationLegend` is
deleted · **D13** the drawing claims all leftover space · **D14** the phasing is about
manageability, not urgency.

**Taken at Phase 3a acceptance, 2026-08-25:**

**D15 — Phase 3a is accepted**, certified at `72d6b28b`; `ce73f41a` (the fourth coercion site plus
two one-liners) landed after certification and is being verified as a delta.

**D16 — the glazing-only change is confirmed as built.** On a customer glazing-only change the
figures describe **the glass the customer chose**, and the row **keeps the estimator's
`selected_variant_id`** rather than churning it. The owner accepted the stated consequence — **an
ops reader looking at the raw row sees a variant id that is not what the figures describe** —
**on the strength of WHY-AC-4 forbidding the panel from captioning the figures with that id.**

> **WHY-AC-4 is therefore load-bearing for a decision, not merely a copy rule.** It is the reason
> the data shape was acceptable. **If Phase 3b ever weakens it — captions figures with the stored
> variant id, or attributes them to "the variant" in words — D16 has to be re-opened**, because
> the trade the owner accepted no longer holds.

**D17 — 3a and 3b deploy together.** Migration `0058` reaches production with 3b, not before.
**Not urgency in reverse** — see §4: with no saves in between, one deploy event carries less risk
than two.

### Architect rulings — delegated by this spec, taken in `docs/design/ops2-why-this-product.md` §1

**These are decisions, not opinions.** Indexed here because the register was twice found reporting
a settled question as open.

- **A1 (§1.1) — storage: a new column, `quote_line.performance_figures_json`.** Overrides §13.8.
  Migration `0058_quote_line_performance_figures.sql`.
- **A2 (§1.2) — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 (§1.3) — `CandidateOutcome.thermal.dataSource` removed from the contract.** ADR 0011.
- **A4 (§1.4) — the capture fires when the pick moves, never on a save that leaves it untouched.**
- **A5 (§1.5) — a singleton answer set is not ambiguity.** **Vetoable at acceptance as one pair
  with the design's ambiguity rule.**
- **A6 (§1.6) — a validated re-derivation is a capture moment.** Two classes of writer, one
  honesty invariant (§7.0).

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5)** — *Given* a product whose thermal figures come only from legacy
`performanceVariants` with `certified` absent or false, *When* a project estimate runs against an
opening that has a thermal requirement, *Then* the resulting line's status is not
`commercial_only_estimate` on account of certification.

**CERT-AC-2 (the drop-guard)** — a legacy variant previously removed by the guard at
`catalogue.ts:187` is present in the candidate set, provided it still passes the
non-certification checks.

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** — a source-level
scan of `worker/**`, `src/**`, `scripts/**`, `sanity/**`, comments stripped, finds no
`isCertified` or `energyCertified`; no `certified` as a field name or written value; and no
`dataSource` **where it is valued** `"certified" | "estimated" | "manufacturer"` or
written/projected on a performance variant or thermal-profile row.

**The narrowness is deliberate and must be preserved.** `dataSource` has a **second, live, correct
meaning** — dimension-rule provenance at `types.ts:77`.

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

**And `certificationRef` / `wersWindowId` are still read and still carried** — a WERS reference is
a real fact about a product; it simply is not a gate.

**CERT-AC-4 (R18)** — a stored `commercial_only_estimate` is unchanged, and the diff contains no
migration and no script that rewrites a stored status.

**CERT-AC-5 (status coherence)** — a line outside the `meets` tier, or whose rules run raised a
warning, is still downgraded for **that** reason.

**CERT-AC-6 (Studio schema)** — no "Certified" boolean, no "Data source" dropdown, the validation
rule gone, the WERS reference field still editable.

**CERT-AC-7 (document values, depth (c))** — after the strip, no document carries `certified` or a
variant `dataSource`, every `certificationRef` / `wersWindowId` is byte-identical to the export,
and no other field differs.

**CERT-AC-8 (export gate — abuse case)** — no verified export, no strip: it refuses and writes
nothing.

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

**What still holds, and it is most of the fence.** No migration, no role vocabulary, no schema
change, **no statement's column list or WHERE clause altered**.

**CERT-AC-11 (blast radius)** — no customer-facing response body gains or loses a field, and no
price changes for an already-priced line.

**CERT-AC-12 (durability)** — running the importers as an operator would, **no row regains
`certified` or a certification-valued `dataSource`**.

**CERT-AC-13 (the strip refuses a stale checkout)** — run from a checkout whose own
`scripts/catalogue/*.mjs` still writes those fields, the strip **refuses and writes nothing**.

**CERT-AC-14 (deploy order)** — worker code **and the four importer edits** → Studio deploy →
verified export → dry-run → `--apply`.

---

## 7. Acceptance criteria — Phase 3a: the universal capture (R22, D3, D6, D7) · **ACCEPTED (D15)**

**Why this is its own phase.** **Not urgency** — see §4's retraction. It is a **server write-path
change with the widest blast radius in this feature**, it falls under Probity, and §7.2's negative
criteria are worth proving against a deployment in which nothing else moved.

**Where the figures live: A1.** A **new nullable column**,
`quote_line.performance_figures_json`, migration `0058_quote_line_performance_figures.sql` —
**local-only; it reaches production with 3b (D17).**

**When they move: A4 and A6.** §7.0 defines the terms every criterion below depends on.

### 7.0 The definitions every criterion below depends on

#### The pick (A4)

**The pick is exactly the resolver's inputs:** `product_slug`, `selected_variant_id`, and
`options.glazing` — the glass identity every pricing path already reads (`lib/lines.ts:164`).

- An option the resolver never consults — **colour, hardware, the room label, dimensions** —
  cannot move the figures.
- A pick that names **no** variant does not move the variant term; only an explicit, **different**
  `variantId` does (the restore path).
- **The predicate lives once**, in `worker/lib/figures.ts`. **§12 note 15 is what happens when a
  distinction lives in two places.**

#### The two classes of writer, and the one invariant (A6)

> **The honesty invariant, and it is what a new writer must be tested against:**
> **no writer may assert an absence it did not establish.**

- **Best-effort writers** — they **ask** the catalogue and must succeed even when it cannot
  answer. **They have a failure channel**, so a re-resolve on an unmoved pick can only degrade or
  lie. **A4's predicate governs them.**
- **Derivation writers** — they **are** the derivation. **They have no failure channel that can
  write a dishonest absence.** **For them the pick-moved predicate is the wrong condition**: a
  dimension or quantity edit does not move the pick but must reprice, and carrying figures forward
  while `line_total`, `pricing_snapshot_json` and `configuration_snapshot_json` re-derive beside
  them would describe **one variant at two different times in adjacent columns**.

**Membership is a property, not a list.** **Verified at 3a: the tester attacked this as a property
rather than sampling it, and could not construct a violating path.**

**The residual, named rather than hidden (A6).** An ops edit of an AI-priced line refreshes price,
snapshots **and** figures to the current catalogue even when nothing material changed. **The
branch's pre-existing contract**, and a **product question about that branch**, not a figures
defect.

### 7.1 One rule

Owner, verbatim: *"every save should record thermal properties of selected at a time product."*

**SNAP-AC-1 (R22 + A4 + A6 — the rule)** — *Given* a save whose **stored pick actually differs
after the save** (§7.0), **or** a **validated re-derivation by a derivation writer**, *Then* the
line's `performance_figures_json` carries **the Uw and SHGC of the configuration that save
established** — the variant the pick named, or, where the pick named none, the variant its product
and glazing resolved to.

*And the other half, scoped by A6:* **Given a save by a BEST-EFFORT writer that leaves the pick
untouched**, *Then* the figures are **carried forward verbatim** and **no catalogue read is made
for that line at all**.

> **Why "the configuration that save established" and not "that product+variant's".** On a
> **glazing-only** change the pick moves, the figures re-resolve with **no variant named**, and the
> row **deliberately retains its old `selected_variant_id`** (`projects.ts:579`). **The row
> therefore stores a variant that disagrees with its figures — ruled, not accidental** (design
> §4.3; **confirmed by the owner as D16**).
>
> **Verified at 3a:** the two limbs map one-to-one onto `resolveFigures`' two branches. Tester:
> *"the new wording is what the code does; the old wording was not."*
>
> **The consequence is a Phase 3b copy rule: WHY-AC-4 — and D16 rests on it.**

**SNAP-AC-2 (R22 — structural)** — every statement under `worker/**` that writes
`quote_line.product_slug` or `quote_line.selected_variant_id` also writes
`performance_figures_json`. **No count encoded; cannot pass vacuously; its file reach is whatever
its list says.**

**SNAP-AC-3 (R22 — one place per fact)** — the display surface reads the line's own record.

### 7.2 The hard constraint — capture is never a gate

**SNAP-AC-4 / SNAP-AC-5 (negative — no new refusal)** — an ops edit and a customer save that
succeed today still succeed, same status, stored values and price; **no new validation, 409 or
error path**. *(The pre-existing aiManaged 409 is not a new refusal.)*

**SNAP-AC-6 (best-effort resolution — scoped by A4 and A6)** — a **best-effort writer's save that
moved the pick** to a configuration the catalogue cannot answer for completes, stores
**present-and-null**, and tells nobody.

**SNAP-AC-7 (no latency regression)** — the catalogue is consulted at most once per save request.
**Lines whose pick did not move contribute nothing.**

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — present-and-null, so a later reader can tell "no
figure exists" apart from "saved before the capture shipped". *Under A1 the three states are
structural.*

**SNAP-AC-16 (A4 + A6 — negative; every present-and-null was established)** — a present-and-null
was written by **one of three honest authors**: a best-effort save that moved the pick and could
not resolve; a successful resolution of a variant that genuinely carries no figures; or a
derivation writer's deliberate *"evaluated, nothing chosen"*. **Given a best-effort writer's save
that did not move the pick — including during an outage — the stored figures are byte-identical
and no present-and-null is written.**

> **Read it against the invariant, not a list of sites.** **A tester must classify the writer
> first** — an unclear class is a design question, **not a licence to weaken the criterion**.

**SNAP-AC-9 (it is a snapshot)** — stored figures do not change when the catalogue changes, **and
nothing recomputes them outside a capture moment**: a save that moved the pick, or a derivation
writer's validated save. **Everything else is forbidden.**

**SNAP-AC-10 (no backfill — D5)** — no script and no migration writes figures onto lines saved
before this phase.

**SNAP-AC-11** — the capture writes only to the line's own configuration record.

**SNAP-AC-12** — no new endpoint, no new HTTP method; the column is A1's.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2.** A hand-maintained list has
been **incomplete on every attempt**: 1, then 4, then 8, verified at **15** — **and the list layer
failed a third time in a different direction** when A6's re-walk found two writers in a class
nobody had enumerated. **Write criteria against properties, and let the design carry the
membership.**

Five shapes carry rulings of their own: a composite parent (vacuous); a writer that clears a
snapshot; a writer that restores a prior configuration; **a best-effort writer that touches a line
without moving its pick** (the most common save in the product); and **a derivation writer at a
validated save**.

### 7.5 The customer path, specifically

**SNAP-AC-13 / 14 / 15 (D7)** — a new customer line carries figures; a customer override records
**what the customer chose**; and **nothing customer-visible changes** — on a save that moved no
pick, nothing is stored at all.

### 7.6 Verified non-impact — the learning corpus

An override fails `sameCoreConfiguration`, so the outcome is `"adjusted"` and parked `pending`.
**This feature must not alter that path, and nothing in it does.**

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer · **ACCEPTED, DEPLOYED**

> **Accepted at stage 8 and deployed** (`9285d642`). Verified against executed evidence including
> mutation checks. **The criteria stay exactly as written: they are what the next reader must not
> break.**

**The URL grammar (D9).** `/projects/:id/line/:lineId/drawing`; `…/drawing/u1`, `/u2`, … —
**1-based ordinals in the display order `unitLabel` renders**. **A state-only history push was
rejected by name.**

**VIEW-AC-1 (R21, R25)** — **the whole drawing and its caption visible together, the drawing as
large as the viewport permits** — and nothing that explains the drawing's notation.

> **The criterion was requiring two things that cannot both hold.** A landscape drawing grown to
> claim 2560px of width stands roughly **1790px** tall on a **1080px** screen. **A drawing you
> have to scroll to see is not "the largest size the viewport allows".**
>
> **Which dimension governs: whichever one binds.** As shipped it was height alone:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> **The magic number went with it.** **Verified by three shapes, each moving one dimension.**

**VIEW-AC-1a (D10)** — a **unit** shows its code; the **line** is titled `Drawing`.

**VIEW-AC-2 / 2a / 2b / 2c / 2d (R31)** — **exactly one** history entry on entry; back, Escape and
the system gesture all do the **same single pop** with **no remount and no record re-fetch**; a
cold deep link renders with the viewer open and **replaces** to the line path; a malformed suffix
**normalises by replace**; and leaving a line after enlarging takes **two backs** — **agreed cost,
not to be collapsed**.

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

> **Twice, the reason given for keeping it was an unexecuted claim.** An export with no caller and
> no styles is dead code with a door painted on it.

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
**The never-empty guarantee is pinned, not assumed.**

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

**WHY-AC-4 (R6, SNAP-AC-3 — what the figures are attributed to; LOAD-BEARING for D16)** — *Given*
the line's stored figures, *When* "This one" renders, *Then* it shows the Uw and SHGC **from the
line's own record**, attributed to **the product and the glass they describe** — never to the row's
`selected_variant_id`, and never phrased as *"this variant performs at X"*. A null figure is stated
as not recorded and never rendered as a number, a zero or a dash.

> **This criterion is the consideration the owner was given for D16.** He accepted a row whose
> `selected_variant_id` does not describe its figures **because the panel never captions the
> figures with that id**. **Weakening this criterion re-opens D16** — it is not a copy preference,
> it is the other half of a decision.
>
> After a customer glazing-only change the id is deliberately **left as the estimator's** while the
> figures describe what the glass resolved to. Copy that reads the id and captions the numbers with
> it would state something the row does not mean — on exactly the lines a reviewer is most likely
> to be auditing.

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

**WHY-AC-9 (D5, the honest gap — and present-and-null has two meanings)** — *Given* a line whose
stored figures are **absent** (`NULL`), *Then* the panel states that a person chose this product
and that its figures were not recorded, and **no** catalogue lookup fills the gap. `ASSUMED:`
§13.5.

> **`NULL` and present-and-null are different sentences, and present-and-null has two causes.**
> A derivation writer records *"evaluated, nothing chosen"* the same way, and one of them
> (`proposal.ts:262`) **nulls the variant while leaving `product_slug` standing**. **The 3b copy
> must distinguish them from the row, not from the figures alone**: a line with no selection is not
> a line whose product has no published figure.

**WHY-AC-10 (R3, pre-0055 rows)** — the panel states that this recommendation was made by an
earlier model whose reasoning was not recorded. `ASSUMED:` §13.2.

**WHY-AC-11 (D2, post-issue)** — **no panel at all**, and **the `why` route renders the same
refusal as a line that has none**.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

**WHY-AC-12 / 13 (R8)** — chosen first, then the next four by ascending ladder rank — five rows, no
more; fewer than five: the ones that exist, **no count of anything beyond the list**.

**WHY-AC-14 / 15 (R9 — negative)** — no excluded candidate, no count, no exclusion reason text;
nothing about withheld products.

**WHY-AC-16 (R10 — negative)** — no price, no delta, no currency symbol, no control that prices it.

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

**WHY-AC-25 / 26 (R23)** — the requirement shown is exactly the one recorded at selection time, and
**no code path re-resolves, recomputes or re-derives a requirement**.

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

**That absence is the design, not a gap.**

**WHY-AC-39** — the detail's only interactive element is the back control. **WHY-AC-40** — no
line-editor route exists; the child routes are exactly `drawing`, `drawing/u<N>` and `why`.
**WHY-AC-41** — the panel's only interactive element is the one that opens the detail.

---

## 10. Abuse-case criteria (negative)

The read surface is staff-gated and read-only, but it exposes **which competing products were
considered and how they compared**. These are executed by the tester as real attempts, with the
denial recorded.

**X-AC-1 / X-AC-2** — a non-staff caller is refused with the console's standard refusal, the raw
body carries no product slug, tier, thermal figure or candidate, and the anonymous and
signed-in-customer refusals are **identical in status and body**.

**X-AC-3** — a `manufacturer` staff role is refused by `hasAssignedRole`. **Executed against the
`why` URL as well as the endpoint.**

**X-AC-4 (cross-project probe)** — the refusal for a line in another project is byte-identical to
the refusal for a line that does not exist, **both by navigating and by visiting the URL
directly**, **including the drawing URLs the desk canvas pushes**.

**X-AC-5 (R9, enforced server-side)** — the raw body contains **only** the chosen candidate and at
most four runners-up.

**X-AC-6** — this feature adds **no** POST, PATCH, PUT or DELETE endpoint.

**X-AC-7** — no schedule comment text, no data belonging to any other opening, project or account.

**X-AC-8 / X-AC-9 (the capture never trusts the client)** — thermal fields in the request body are
ignored entirely, on both the ops and customer routes.

**X-AC-10** — the existing ownership guards refuse a line id from another project unchanged.

**X-AC-13 (the split path trusts no client field either)** — a split request carrying
`configurationSnapshot`, `selectedVariantId`, `performanceFigures` or any field outside the route's
accepted set has those values **ignored entirely**, and is neither refused nor altered by their
presence.

> **Safe today by construction** (an explicit whitelist) — **but that safety lives in a list**, and
> this repo's list layers have been wrong repeatedly. **Mutation-proven at 3a:** the tester widened
> the whitelist by exactly one field and watched the criterion go red.

**X-AC-11 / X-AC-12 (Phase 1)** — CERT-AC-8 and CERT-AC-13 both refuse and write nothing, executed
as real attempts; CERT-AC-11: no customer-facing response changes.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | No money appears anywhere on this surface. `ASSUMED:` §13.3 | R3, R10 |
| **Quote lifecycle — post-issue** | Panel absent entirely, and the `why` URL refuses. | D2, WHY-AC-11 |
| **A catalogue import run after the strip** | No row regains the fields. | CERT-AC-12 |
| **A strip launched from a stale branch** | Refused, naming the offending importer. | CERT-AC-13 |
| **The `ElevationLegend` export** | **Deleted**, with the assertion that pinned it. | VIEW-AC-12, D12 |
| **A room-label, colour or dimension edit on an ordinary line — including during an outage** | **Best-effort writer: figures carried forward verbatim, no catalogue read.** | A4, SNAP-AC-16 |
| **A customer autosave that changes nothing about the pick** | Nothing stored, nothing fetched. | A4, SNAP-AC-16 |
| **A dimension or quantity edit on an AI-priced line** | **Derivation writer: figures re-derive with the price and both snapshots.** Not a breach — that save is a capture moment. | A6, §7.0 |
| **An estimator re-run that re-picks the same variant after the catalogue moved** | Figures refresh with the rest of the derivation. **Correct code.** | A6 |
| **An ops edit of an AI-priced line where nothing material changed** | Price, snapshots **and** figures refresh. **Named residual, pre-existing contract.** | A6 |
| **A customer changes only the glass** | The figures re-resolve **from the glass**; the row **keeps its old `selected_variant_id`**. **The figures describe the configuration; the id is not their caption.** | **D16**, SNAP-AC-1, WHY-AC-4 |
| **A line whose variant was nulled but whose product still stands** | Present-and-null means **"no selection was made"**, not "this product has no figure". **3b's copy must read the row.** | WHY-AC-9, SNAP-AC-8 |
| **A save that genuinely moves the pick while the catalogue is unreachable** | Present-and-null, and **here it is the honest fact**. | SNAP-AC-6 |
| **A successful resolution of a published variant that carries no figures** | Present-and-null, **honestly**. | SNAP-AC-16 |
| **A pre-capture line that a best-effort writer edits** | Stays `NULL`. **No opportunistic backfill.** | A4, SNAP-AC-10 |
| **A product offering exactly one published variant, with no variant named** | Resolves to that variant — **a singleton answer set is not ambiguity**. | A5 |
| **A split request carrying a client-supplied snapshot or variant id** | Ignored entirely. Executed, not inspected. | X-AC-13 |
| **Enlarging a drawing from the record's desk canvas** | One push; back pops once to the **record**, selection and canvas intact. | D11, VIEW-AC-13…17 |
| **Leaving a line after enlarging a drawing** | **Two backs.** Agreed cost of R31. | VIEW-AC-2d |
| **A short wide viewport — 2560×1080** | **Height binds.** | VIEW-AC-1, D13 |
| **Everything saved before the capture exists** | No figures, no backfill: the honest absence. | D5, R18, SNAP-AC-10 |
| **A non-staff caller reaches an ops route or any new URL** | One refusal, no candidate data. | X-AC-1…4 |
| **Offerability gating** | Withheld and excluded candidates never reach the client — server-side. | R9, X-AC-5 |
| **More than one selection run for an opening** | The most recent by `created_at`. `ASSUMED:` §13.4 | R3 |
| **Null thermal figures** | Stated as not recorded. Never 0, never "—". | R6 |
| **Catalogue moved since the run or since the save** | Stored facts only; no live lookup at display time, ever. | R3, D3, SNAP-AC-9 |
| **Certification** | Never appears on this screen in any phase. | R5 |

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> **Five were found in a single day of Phase 2**, every one written while *adding* coverage, and
> **not one of them looked wrong**.
>
> > **Break the thing on purpose and watch the test go red. Make the pattern match nothing and
> > watch the scan complain.** If neither happens, the assertion was decoration.

Not a test plan — fifteen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixture** must be an AI-originated line the customer has since overridden.
2. **SNAP-AC-2 is a source-level scan.** Property of every match, never a count.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test** — where the widest defect nearly shipped.
4. **X-AC-1 must be executed for both callers separately.** **And X-AC-13 must be an executed
   attempt, not an inspection.**
5. **VIEW-AC-10, and the selector that became a trap.**
6. **WHY-AC-39/40/41 assert absences.** Enumerate and assert the *set*.
7. **WHY-AC-7a must assert where back GOES**; **VIEW-AC-15 adds the other half** — assert label and
   destination **together**. The never-empty guarantee is **only half pinned**.
8. **VIEW-AC-2's numbers are the assertions.**
9. **CERT-AC-3's predicate is narrow on purpose.**
10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — six times about the codebase, once about
    the world, once about this spec's own register.**

    > **A claim about the codebase is settled by running something. A claim about the world is
    > settled by asking the person who owns it.**

11. **A journey that no criterion names will be tested by nobody.**
12. **A two-variable measurement proves nothing about which variable did the work.**
13. **A CRITERION IS CHECKED AGAINST THE OTHER CRITERIA IT CONSTRAINS — three instances, none found
    by reading.** VIEW-AC-1 (a measurement); SNAP-AC-1 vs SNAP-AC-9 (an implementation); SNAP-AC-1
    vs SNAP-AC-14 (a tester tracing a path). **All three had a shared subject.**
14. **A CRITERION GENERALISED FROM ONE INSTANCE MUST NAME THE PROPERTY THAT MADE THAT INSTANCE
    WRONG, NOT THE BEHAVIOUR IT EXHIBITED.** **A criterion that is too strong gets found by an
    implementer who cannot satisfy it — and the pressure then is to quietly weaken it at the one
    inconvenient site.**
15. **ONE RULE IN TWO PLACES — the defect Phase 3a produced four times, and the phase's own
    lesson.** A4, A6, SNAP-AC-1's wording and the coercion sites were all **a distinction that
    existed in one spot and was needed in two**.

    **The remedy is not vigilance; it is a single home.** **When a distinction has to be re-stated
    at a second site, that is the moment it should become a function, a criterion or a definition —
    never a second copy of a sentence.**

    **And the triage lesson.** The fourth coercion site was found by a scan that returned four
    hits, two legitimate — and the scan was then dropped as noisy. **Abandoning the scan was
    correct; abandoning the finding along with the tool was not.** *"Four sites, two legitimate"*
    **is a triage result, and the triage stopped at three.**

    > **Coercing a caller's input is normalisation; coercing a stored value to stand in for an
    > input the caller never sent is fabrication.**

**THE ESCALATION IS THE MODEL, AND IT HAS NOW HAPPENED THREE TIMES.** **A criterion that cannot be
satisfied honestly is a defect in the criterion, and it goes back up the pipeline.**

---

## 13. `ASSUMED:` register — every entry carries a state

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED — and discharging one happens
> when the answer arrives, not when someone next reads the file.**

**States:** `OPEN` — still assumed, still vetoable · `DISCHARGED` — whoever this spec delegated it
to has answered it · `RETIRED` — the question dissolved · `VETOED` — answered against the
assumption.

### The failure this register has had twice, and the only mechanism that closes it

> **The states were built for OWNER answers, which arrive at a decision gate the product-manager
> attends. A DELEGATED answer lands in another document, at a stage nobody re-reads the register.**

1. **A delegating entry names where the answer will land.**
2. **The rulings are indexed in this spec too**, at §5 (A1–A6).
3. **One command before any "live at this gate" list leaves the product-manager's hands:**
   `grep -n "§13\.\|ASSUMED" docs/design/ops2-why-this-product.md`. **Run for §14's Phase 3b gate,
   2026-08-25: nothing discharged behind the register's back — the design *adopts* all seven, which
   is what their annotations already say. Adoption is not discharge.**

**And the honest limit: none of that is automatic.**

**The design keeps its own `ASSUMED:` list** (design §12). **A5 governs the ambiguity one and is
vetoable with it as one pair.** **Two registers, one per document.**

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown, following R9 | **OPEN — at the Phase 3b gate (§14, Q1).** Built as assumed: excluded at **DTO construction**; X-AC-5 asserts it on the raw body. **The grill flagged it as not separately ruled** |
| §7.2 | the `CandidateOutcome.dataSource` removal is the architect's to rule | **DISCHARGED — architect (A3)**; ADR 0011 |
| §7.3 | "3–5 next best" implemented as **4** runners-up | **OPEN — at the Phase 3b gate (§14, Q1).** Within R8's "3–5" |
| §7.4 | the `CONTEXT.md` corrections are the architect's to apply | **DISCHARGED — verified applied** |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record row's glyph does not open the viewer | **OPEN — shipped and deployed.** A veto now costs rework |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded | **OPEN — at the Phase 3b gate (§14, Q2)** |
| 3 | **§11, GST** — no money at all on this surface | **OPEN — at the Phase 3b gate (§14, Q1)** |
| 4 | **§11, multiple runs** — the most recent only | **OPEN — at the Phase 3b gate (§14, Q2)** |
| 5 | **WHY-AC-9** — where figures were never captured, the panel says so | **OPEN — at the Phase 3b gate (§14, Q2)** |
| 6 | *(the capture's reach)* | **RETIRED** — D7 |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 |
| 8 | **SNAP-AC-12** — figures live in `configuration_snapshot_json` | **DISCHARGED — architect (A1): OVERRIDDEN.** A **new nullable column**; that column is deliberately nulled when a customer materially edits an AI-priced line, so the save that most needs to *record* figures is the save that *erases* it |
| 9 | **§7.4** — R22 reaches the estimator's own writers | **DISCHARGED — architect (A2): yes** |
| 10 | **WHY-AC-28** — R6's three labels kept, only "Chosen" changes | **OPEN — at the Phase 3b gate (§14, Q3)** |
| 11 | **§10** — the uniform refusal is adopted as written | **RETIRED** — §2 puts changing it out of scope |
| 12 | *"the drawing viewer is an overlay"* | **VETOED by R31** |
| 13 | **VIEW-AC-12** — the export is retained | **VETOED — owner (D12)** |
| 14 | **The URL grammar** | **DISCHARGED — owner (D9)** |
| 15 | **The viewer's title** | **DISCHARGED — owner (D10)** |
| 16 | **VIEW-AC-1** — no fixed ceiling | **RETIRED — the wrong question** |
| 17 | **VIEW-AC-15** — the project's **title** | **VETOED — owner** |
| 18 | **VIEW-AC-1** — all the leftover space; the caption never scrolls | **DISCHARGED — owner (D13)** |
| 19 | *(the 3a-before-3b urgency)* | **VETOED — owner (D14)** |
| 20 | *(SNAP-AC-1's "sets or changes", read as including a rewrite of the same pick)* | **VETOED — architect (A4)** |
| 21 | *(SNAP-AC-16's "exactly one author", read as governing every writer)* | **VETOED — architect (A6).** The opposite failure to §13.20: **too strong** |
| 22 | *(SNAP-AC-1's "that product+variant's figures", read as a promise that the row's `selected_variant_id` describes them)* | **DISCHARGED — owner, Phase 3a acceptance (D16).** Confirmed as built: the figures describe the glass, the row keeps the estimator's id. **He accepted the raw-row consequence on the strength of WHY-AC-4**, which is now load-bearing for this decision |

---

## 14. Decisions needed — **the Phase 3b gate**

**Seven OPEN entries, grouped into three questions.** Every one is **cheap to veto now and
expensive after the panel ships**, which is why the gate is before the build, not after it.

*Check run first (§13's mechanism): the design **adopts** all seven and rules on none. Nothing was
answered behind the register's back.*

---

### Q1 — How much does the panel show? *(§7.3, §7.1, §13.3)*

**As built and recommended:** the chosen product **plus four alternatives, five rows total**;
**products held back because their catalogue record is unfinished are not shown at all**; and
**no money appears anywhere on the surface** — no price, no delta, no currency symbol.

**Reasoning.** R8 said "3–5 next best" and four is the middle of it; R19 said *"the list does not
need to be long — i don't want a full catalogue sorted by match level"*. Withheld products follow
R9's *"i'm not interested in, nor ever asked for, excluded"* — **though the grill flagged that
withheld is arguably a different thing** (the fix is ours, not the opening's), which is why it is
being asked rather than assumed. Money follows R10 and R3 together: a stored price from a past run
is stale by the time anyone reads it.

**Alternatives:** three or five alternatives instead of four; showing withheld products as a
"could not be offered" group; showing the recorded price beside each row.

**Veto cost today** — one number, one DTO field, one criterion each:
- **Alternatives count:** a number in one place. **Moves WHY-AC-12, WHY-AC-13, X-AC-5.**
- **Show withheld:** the more expensive of the three — it crosses the server boundary. **Inverts
  WHY-AC-15, changes X-AC-5 (an abuse criterion), and adds a DTO field.**
- **Show money:** **contradicts R10, an existing ruling of his own**, so it is not a toggle — it
  re-opens a decision. **Moves WHY-AC-16 and X-AC-5.**

---

### Q2 — What does it say when the record is thin, old, or plural? *(§13.5, §13.2, §13.4)*

**As built and recommended, one principle in three places: the panel shows what was recorded at
the time and says so plainly when there is nothing. It never reaches back to fill a gap.**

- **Figures never captured** (a line saved before Phase 3): *"figures were not recorded"* — **and
  no catalogue lookup to fill it in.**
- **A recommendation older than the recording** (pre-migration-0055): *"made by an earlier model
  whose reasoning was not recorded"* — no reconstruction, no alternatives offered.
- **An opening estimated more than once:** the **most recent** run only. Earlier runs are not
  listed or merged.

**Reasoning.** R3 and D3 are the owner's own: *"snapshot at the time of recalculation/save. Not
extracted in real time."* An honest gap is auditable; a filled-in gap is a number a reviewer would
trust that nobody established — which is the same rule Phase 3a spent four rounds enforcing on the
write side.

**Alternatives:** look up today's catalogue to fill missing figures; reconstruct old
recommendations from the deleted scoring model's columns; list every run with dates.

**Veto cost today — this is the group with a genuinely expensive member:**
- **Fill missing figures from the catalogue:** **not cheap and not local.** It contradicts **R3/D3
  head-on**, undoes **SNAP-AC-10** (no backfill) and the **honest-absence design** the whole of
  Phase 3a was built to protect, and inverts **WHY-AC-9 and WHY-AC-27**. **If he wants this, it is
  a re-opening of D3 and D5, not a tweak.**
- **Reconstruct pre-0055 reasoning:** **the alternative may not exist** — the old model's columns
  were deleted. Inverts **WHY-AC-10** and would need an investigation before it could be costed.
- **List earlier runs:** a **new surface**, not a tweak — a history section, a DTO list, and
  WHY-AC-1's "a selection run" becomes plural. Moderate today, larger later.

---

### Q3 — What does the panel say on a line a human changed? *(§13.10)*

**As built and recommended:** the panel keeps its **same three lines** — *Had to meet*, *This one*,
*Chosen* — and **only the "Chosen" sentence changes**: it says a person chose this product and
names what the platform had recommended instead.

**Reasoning.** R6 fixed the three lines; R11 requires both the platform's recommendation and the
human's choice to be visible; R24 requires the current selection never to read as platform-made.
Changing the **sentence** rather than the **structure** means a reviewer sees the same shape on
every line and reads the difference, rather than learning a second layout.

**Alternatives:** a fourth line for the override; a visually distinct block; a different label set
on overridden lines.

**Veto cost today:** copy plus one layout branch. **Moves WHY-AC-28, and interacts with WHY-AC-22
and WHY-AC-23** (the both-shown treatment). Cheap now; after the panel ships it is a redesign of the
surface a reviewer has learned.

---

### One dependency he should know about, whatever he decides here

**WHY-AC-4 is load-bearing for D16.** He accepted a row whose `selected_variant_id` does not
describe its figures **because the panel never captions the figures with that id**. **Any 3b change
that weakens WHY-AC-4 re-opens D16** — it is the other half of a decision, not a copy preference.

### Also outstanding, not part of this gate

- **§13.1 (VIEW-AC-9)** — OPEN and already shipped; a veto now costs rework.
- **A5** (a singleton answer set is not ambiguity) — the architect's, **vetoable as one pair with
  the design's ambiguity rule** at Phase 3 acceptance.
- **The deploy** — `0058` is local-only and reaches production with 3b (D17).
