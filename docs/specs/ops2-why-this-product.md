# ops2 "Why this product" — SPEC

**Date:** 2026-08-25 · **Stage:** pipeline stage 1 (product-manager) · **Revision 31**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a **ruling** contradicts the mock, the ruling wins. **Where the mock shows a state and no
ruling covers it, the mock wins** — §12 note 17.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

**Phase 2 ACCEPTED and DEPLOYED** (`9285d642`). **Phase 3a ACCEPTED** (D15), certified at
`72d6b28b`; **not deployed, by the owner's choice** (D17). **Phase 3b gate closed** (D18–D21);
**3b is built**; ui-designer, tester, conformance and reviews still to run.

**Revision 31 rules two wording calls the developer reported rather than coded around, and records
the owner's canvas ruling — against my recommendation.**

- **WHY-AC-42's refusal/failure boundary is now a property, not a list.** The developer routes a
  `403` to *"could not be read"*, and it is right: **a refusal the reviewer could not have reached is
  not a refusal, it is a failure.** The criterion enumerated two 404s; **enumerations in this feature
  have been wrong repeatedly**, so it now states the test instead — with **the asymmetry that
  decides the default**: a needless retry costs a click, **a false absence costs a reviewer who stops
  looking**.
- **WHY-AC-5 carried an example its neighbour bans.** It wrote *"within 5% of the closest"* while
  **WHY-AC-6 forbids hardcoding the band**, and left `misses`'s band unnamed when **R7 wants it
  named**. Both fixed, and the rule made explicit: **no percentage in that criterion is a literal to
  copy.** §12 note 13's sixth instance — **the criteria-in-tension shape at its smallest scale, where
  a prose example became a requirement.**
- **D21 — the panel appears on the line page only.** The owner's ruling, taken with my
  recommendation in front of him twice. **WHY-AC-43 makes the absence checkable** rather than
  incidental, and my dissent is preserved with it.

**Revision 30's walk against the approved mock found six disagreements**, five of them unfound, and
added **WHY-AC-42**. *(Since confirmed: the developer had built all five correctly from the mock —
**correct and unverified**, exactly as called. **WHY-AC-4's new composite clause then caught a live
defect**: a composite parent with a `NULL` figures column was printing an absence sentence for a
parent where nothing is missing.)*

**Revision 29** amended WHY-AC-29 to compare **the pick**. **Revision 28** closed the 3b gate and
repaired WHY-AC-27 and WHY-AC-4. **Revision 27** recorded D15–D17. **Revision 26** recorded the
phase's lesson (note 15). **Revision 25** folded in three tester observations. **Revision 24** scoped
SNAP-AC-16 (A6). **Revision 23** repaired SNAP-AC-1 vs SNAP-AC-9 (A4). **Revision 22** reconciled the
register against the design. **Revision 21** retracted a false urgency. **Revision 20** recorded the
assertion-that-cannot-fail rule; **19** corrected VIEW-AC-15; **18** resolved VIEW-AC-1's internal
contradiction; **17** carried the veto of §13.17; **16** carried D11 and D12.

Revision 15 gave every register entry a state; revision 14 corrected VIEW-AC-12's false premise;
revision 13 amended the CERT-AC-10 fence; revision 12 folded in the importers; revision 11 closed
VIEW-AC-2's mechanism; revision 10 folded in D8 and R31; revision 9 applied R29/R30; revision 8
applied R28; revision 7 corrected a false claim about an existing legend test; revision 6 applied the
closed UX mock gate; revision 5 repaired two architect findings; revisions 2–4 folded in the owner's
decision rounds.

**Decisions needed: none** (§14).

---

## 1. Problem statement

The platform recommends a product per opening. Nothing anywhere shows why.

`selection_run` and `candidate_result` have carried the full rationale since migration 0055 — the
requirement and where it came from, every candidate's tier, rank, thermal figures, fit and price —
and **no route in `worker/routes/` reads either table**. The reasoning is written to a database and
never spoken.

The consequence lands at the **human review gate**, the stage between submission and issue where a
recommendation is confirmed or overridden. The person standing there today either takes the machine's
word or re-does the thermal comparison by hand. Neither is a review. In the owner's words: *"I want to
be able to audit recommendations and accuracy of thermal modelling"* and *"the bigger vision is to
surface most likely alternatives hopefully making human's work easier."*

Underneath it sits a defect that makes the audit read wrong before it starts. A dead `certified` flag
— never asked for, wired to opposite default values in two places of the Sanity schema — downgrades
**13 of 32 products to "indicative estimate only" on every thermally-constrained line**. **And the
catalogue importers write the flag back on every run** (§6, CERT-AC-12).

And a third gap, **closed by Phase 3a**: a product's thermal performance was not recorded on the line
that uses it. Under R3/D3 nothing may look it up at display time to recover it.

## 2. Scope

### In scope

1. **The read surface.** A three-line "Why this product" panel **on the line detail view** (D21), and
   the detail **screen** it leads to — its own route (D8) — carrying the requirement and its origin,
   the chosen product against it, why it won, and **four** next-best alternatives by ladder rank
   (D18). Composites included (R14–R17). A **thinner panel** for lines nobody's estimator ever
   evaluated (D6). **No action anywhere on it** (R28) — **except the failure state's retry**
   (WHY-AC-42), which acts on the read, never on the line.
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
| **The panel on the record's desk canvas** | **D21 — the owner's ruling.** The canvas keeps rendering `LineReview` **without** the panel, and **WHY-AC-43 makes that checkable** rather than incidental. My recommendation was the other way; the reasoning is preserved at D21 in case the question returns. |
| **"Change the product" — the control, and any placeholder for it** | **R28, deferred rather than declined.** Supersedes D4. See §2.1. |
| **Re-classifying the Projects filter panel** | R26/R27's approval explicitly excluded moving it (WHY-AC-7b); **its own future ticket**. |
| **Renaming the dimension-rule `dataSource`** | `types.ts:77` uses the same token for a **different, live, correct** concept. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4.** A recompute of a captured snapshot (SNAP-AC-9). **Does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling, and **D19 confirms it on the read side**. |
| **Filling a missing figure from today's catalogue at display time** | **D19**; it would have reversed **D3 and D5**. |
| **Showing withheld products, or any money, on the surface** | **D18.** Money would have re-opened **R10**. |
| **Re-resolving a `selected_variant_id` to match the figures on a glazing-only change** | **D16.** The id stays **stable** — and **nothing downstream reads it as the answer** (WHY-AC-4, WHY-AC-29, and the DTO's omission). |
| **Rendering a failed read as an absence** | **WHY-AC-42.** *A missing fact and an unreachable one are different things, and only one of them is worth retrying.* |
| Any line editor in ops2, stub or real | Follows R28. |
| Explanatory notation of any kind on a drawing surface | R25. |
| Switching the line's product from the "Why" surface | R1: read-only. |
| Recording a verdict on the recommendation | R2. The endpoint exists and stays unwired. |
| Reading the catalogue or the estimator **at display time** | R3 + D3 + **D19**. |
| Re-deriving a thermal **requirement** anywhere | R23. |
| Any change to `quote_line.origin`, `ai_proposal_line_id`, or `aiManaged` routing | R24. |
| Any new validation, eligibility check or refusal on any save path | D6's hard constraint — §7.2. |
| **Any change to the ops routes' authentication or refusal convention** | §10. **X-AC-3's correction describes what already fires; it changes nothing.** |
| Any change to the learning corpus or the issue-time capture path | §7.6. |
| Excluded candidates, in any form | R9. |
| Backfilling anything | R18; accepted explicitly (D5). |
| Carrying the rationale past issue | D2. |
| The staff role vocabulary | Conclusions §8: own ticket, touches authorization. **Must not ride along.** |
| A new RBAC role for the Estimator persona | Persona ≠ role. |
| Any customer-facing **display** change | Staff surface only. |

### 2.1 Deferred — how product switching might work

> ⚠️ **DIRECTION, NOT REQUIREMENT. NOTHING IN THIS SECTION IS TO BE BUILT.**

The owner's sketch, verbatim:

> *"this should be a new panel for switching indeed: X is gone from this view; cards for options are
> clickable; a click leads to a new confirmation screen; the screen shows something about the new
> choice with confirm/cancel as CTAs."*

1. **Audit panel = what we decided then. Switch panel = what is true now.**
2. **The switching list is probably not the audit list.** Expect its own query.
3. **Do not drop the dismiss from the switching panel.**
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

**They read this surface; they do not act on it.** **Going back is not an action** (R29), **and
retrying a failed read is an action on the read, not on the line** (WHY-AC-42).

**And they already know how to read a drawing** (R25).

**And what they read must be what was established.** A4 and A6 are that sentence applied to the
capture; **WHY-AC-4 and WHY-AC-29** apply it to the caption and the attribution, and **D16 rests on
both**; **D19** applies it to gaps; **WHY-AC-42** applies it to failure.

> **A reviewer told "not recorded" stops looking. A reviewer told "could not be read" tries again.**
> **The two errors are not symmetric**, and every ruling on this surface has resolved that way.

### Customer (existing — newly relevant, via D6/D7)

Owner: *"human, as in client, manual picks do not have targets, but showing panel with performance
data is fine, I think."* And: *"a selection shall not be perceived as AI-made anymore"* — while *"that
does not change the target."*

**Their save must never start failing** (§7.2), and **an autosave that changes nothing about the pick
must not touch their figures** (A4, SNAP-AC-16).

### Staff (existing — and `CONTEXT.md:14` is wrong)

Owner: *"staff is our own people, 2 owners at this point of time, only. **OpenFrame people. AMJ is
manufacturer.**"*

### Manufacturer partner (an RBAC exclusion, recorded to close it)

Refused before the route runs. **X-AC-3 records which gate actually fires.**

### The stage: the human review gate

Between submission and issue. A stage in a quote's life, not a persona and not a role.

## 4. Phasing — **owner-confirmed (D1, amended by D5)**

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5)

**Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker code **plus the four
importer edits** → Studio deploy → verified export → dry-run → `--apply`. **The strip is last, and
final.** **Risk owned here:** an irreversible write against the live Sanity dataset.

### Phase 2 — the shared drawing viewer and the URL grammar · **SHIPPED** (`9285d642`)

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a — a server write-path change (§7)** · **ACCEPTED (D15)**, certified at `72d6b28b`.
- **Phase 3b — a read-only display surface (§9)** · **built**; ui-designer, tester, conformance and
  reviews still to run.

**Deploy sequencing — D17: 3a and 3b deploy together.** Migration `0058` reaches production **with
3b**, and remote apply has not happened.

> **This is the opposite of the retracted urgency, not its return.** **There are no saves in between**
> — which is what makes one deploy event safer than two.

**The cost the owner accepted (D5):** no backfill, so **every line saved before Phase 3 has no
figures** (WHY-AC-9, WHY-AC-27).

> **~~The reason the sequencing paragraph used to give:~~** *"…every save in between is a line that
> will have something to show, and a save that is missed cannot be recovered."* **False, and retracted
> rather than deleted.**

### Wayfinder check

**Not needed.** 31 rulings, twenty-one owner decisions, six architect rulings taken out loud in design
§1.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label · R5 no
certification on screen · R6 three panel lines · R7 name the band · R8 chosen + 3–5 next best · R9 no
excluded · R10 no price deltas · R11 human change shows both · R12 frame or glazing = changed · R13
no-run lines still show the panel · R14 panel on machine-proposed composites · R15 split reason then
per-lite bands · R16 per-lite bands are real · R17 ops split = R13 · R18 leave history · R19
right-hand slide-out · R20 same gate as the record · R21 full-screen drawing viewer.

**R22 — the capture rule is universal.** **A4 and A6 sharpen what "every save" means.**

**R23 — a target is not a selection.** **R24 — an overridden selection must no longer read as
platform-made**; attribution is derived by comparison, **never from `origin`** and — after D16 —
**never from `selected_variant_id` alone** (WHY-AC-29).

**R25 — no explanatory notation on an ops drawing surface.** **R26 — the phone detail opens full
screen.** **~~R27~~ AMENDED BY R29.** **R28 — "Change the product" is not implemented.** **R30 —
modals carry controls on top**; **no modal exists in this feature**. **R31 — the drawing viewer is a
tree node with a back control.**

**R29 — the detail is a screen in the navigation tree; its dismiss is a BACK control.**

> *"dismiss == back button on the Why this product screen, it is part of the tree:
> projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka Confirm/Cancel)."*

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures snapshotted at
save, never read live · ~~**D4**~~ · **D5** the capture waits for Phase 3 · **D6** a
client/manual-picked line shows a thinner panel **with** its product's figures · **D7** the capture
extends to the customer save path · **D8** the detail screen gets its own URL · **D9** the URL
grammar · **D10** the viewer's title names the subject · **D11** back from the canvas returns to the
record · **D12** `ElevationLegend` is deleted · **D13** the drawing claims all leftover space ·
**D14** the phasing is about manageability, not urgency · **D15** Phase 3a accepted · **D17** 3a and
3b deploy together.

**D16 — the glazing-only change is confirmed as built, and it has three dependencies.**

> **If any one is weakened, D16 re-opens.**
> 1. **WHY-AC-4** — never **captions the figures** with that id.
> 2. **WHY-AC-29** — never **decides the attribution** on it. **Mutation-proved: reverting to
>    product+variant goes red on the D16 case alone.**
> 3. **The DTO omits `current.variantId` entirely** (§12 note 16).

**D18 — panel scope.** Four alternatives, five rows; withheld hidden; **no money anywhere**.
**D19 — thin, old and plural records.** **The panel shows what was recorded and never reaches back.**
**D20 — the overridden line.** Three labels kept; the **"Chosen"** sentence carries the attribution.

**D21 — the panel appears on the line page only, not on the record's desk canvas.**

The owner's ruling, taken with the recommendation and its cost in front of him **twice**. The canvas
keeps rendering `LineReview` without the panel; **WHY-AC-43 makes that a checked absence rather than
an accident of `why={null}`.**

> **My recommendation was the other way, and it is recorded because the question will return.** The
> reviewer's job is identical on both surfaces; the canvas exists so a line can be read without
> leaving the record; **a panel that vanishes on the faster surface teaches a reviewer to distrust the
> faster surface.** Phase 2 settled the analogous question the other way — VIEW-AC-5's *"every
> enlargeable drawing"* forced the canvas to open the viewer.
>
> **What is on the owner's side of it, and why the ruling is defensible:** the detail's route is a
> **line** address, so opening it from the canvas would push the reviewer onto a line URL and
> re-open D11's *where does back go?*; and the canvas would fetch per selection on a surface built
> for glancing down a list. **Leaving it off keeps the record a list and the line page the place you
> audit.**
>
> **If it is ever revisited, it needs a criterion before it is built** — the canvas enlargement is
> this feature's own worked example of what happens otherwise (§8.1, §12 note 11).

### Architect rulings — delegated by this spec, taken in `docs/design/ops2-why-this-product.md` §1

- **A1 (§1.1) — a new column, `quote_line.performance_figures_json`.** Overrides §13.8. Migration
  `0058`.
- **A2 (§1.2) — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 (§1.3) — `CandidateOutcome.thermal.dataSource` removed from the contract.** ADR 0011.
- **A4 (§1.4) — the capture fires when the pick moves.**
- **A5 (§1.5) — a singleton answer set is not ambiguity.** **Still OPEN — vetoable as one pair with
  the design's ambiguity rule at Phase 3 acceptance.**
- **A6 (§1.6) — a validated re-derivation is a capture moment.**

---

## 6. Acceptance criteria — Phase 1: remove `certified`

**CERT-AC-1 (R5)** — a product whose thermal figures come only from legacy `performanceVariants` with
`certified` absent or false is **not** downgraded to `commercial_only_estimate` on account of
certification.

**CERT-AC-2 (the drop-guard)** — a legacy variant previously removed by the guard at
`catalogue.ts:187` is present in the candidate set, provided it still passes the non-certification
checks.

**CERT-AC-3 (the scan — all live source, and deliberately narrow in one place)** — a source-level scan
of `worker/**`, `src/**`, `scripts/**`, `sanity/**`, comments stripped, finds no `isCertified` or
`energyCertified`; no `certified` as a field name or written value; and no `dataSource` **where it is
valued** `"certified" | "estimated" | "manufacturer"` or written/projected on a performance variant or
thermal-profile row.

**The narrowness is deliberate.** `dataSource` has a **second, live, correct meaning** —
dimension-rule provenance at `types.ts:77`.

| Allowed | Why |
|---|---|
| `scripts/tests/**` | A test that asserts the field is gone has to be able to name it. |
| `sanity/scripts/strip-certified.mjs` | The script whose entire job is removing the field must name it. |

> **Two corrections here, revision 13.** The allowlisted path was wrong — **no
> `scripts/catalogue/strip-certified.mjs` exists**. CERT-AC-13's scanned directory is a **different
> tree** and remains correct. **And a third entry is gone** — `src/ops/api.ts:381`, exempted as *"a
> legacy read surface"*; **the tester executed that claim and it was false.**

**Non-vacuity:** the walk must be **shown to have reached** `catalogue.ts` and `import-wers.mjs`.

**And `certificationRef` / `wersWindowId` are still read and still carried.**

**CERT-AC-4 (R18)** — a stored `commercial_only_estimate` is unchanged; no migration and no script
rewrites a stored status.

**CERT-AC-5 (status coherence)** — a line outside the `meets` tier, or whose rules run raised a
warning, is still downgraded for **that** reason.

**CERT-AC-6 (Studio schema)** — no "Certified" boolean, no "Data source" dropdown, the validation rule
gone, the WERS reference field still editable.

**CERT-AC-7 (document values, depth (c))** — after the strip, no document carries `certified` or a
variant `dataSource`; every `certificationRef` / `wersWindowId` is byte-identical to the export.

**CERT-AC-8 (export gate — abuse case)** — no verified export, no strip.

**CERT-AC-9 (contract stability)** — *Given* **A3**, an `outcome_json` written before the change parses
without error, and no surface renders the field.

**CERT-AC-10 (the fence) — AMENDED 2026-08-24. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…and **no application save path**."* **No longer true, and
> the amendment is recorded rather than the criterion rewritten.**

The diff changes no file under `worker/lib/staff.ts`, no role CHECK constraint, no migration, and **no
application save path other than the JSON snapshot builders whose source fields this phase deletes**.

**CERT-AC-11 (blast radius)** — no customer-facing response body gains or loses a field.

**CERT-AC-12 (durability)** — running the importers as an operator would, **no row regains
`certified`**.

**CERT-AC-13 (the strip refuses a stale checkout)** — refuses and writes nothing, naming the offending
file.

**CERT-AC-14 (deploy order)** — worker code **and the four importer edits** → Studio deploy → verified
export → dry-run → `--apply`.

---

## 7. Acceptance criteria — Phase 3a: the universal capture · **ACCEPTED (D15)**

**Why this is its own phase.** **Not urgency.** It is a **server write-path change with the widest
blast radius in this feature**.

**Where the figures live: A1** — `quote_line.performance_figures_json`, migration `0058`
**(local-only; production with 3b, D17)**.

### 7.0 The definitions every criterion below depends on

#### The pick (A4)

**Exactly the resolver's inputs:** `product_slug`, `selected_variant_id`, `options.glazing`. **Colour,
hardware, the room label, dimensions cannot move the figures.** **The predicate lives once**, in
`worker/lib/figures.ts`.

> **The pick is also the unit of comparison for attribution (WHY-AC-29)** — not just for the capture.

#### The two classes of writer, and the one invariant (A6)

> **No writer may assert an absence it did not establish.**

- **Best-effort writers** **ask** the catalogue and **have a failure channel**. **A4's predicate
  governs them.**
- **Derivation writers** **are** the derivation and have **no failure channel that can write a
  dishonest absence**. **For them the pick-moved predicate is the wrong condition.**

**Membership is a property, not a list.** **Verified at 3a: attacked as a property, not sampled.**

> **The invariant has a read-side twin: WHY-AC-42.** A writer must not record an absence it did not
> establish; **a reader must not display one either.** **Two live defects have now come from the same
> root** — the capture's re-resolve on an unmoved pick (A4), and the panel printing an absence
> sentence for a composite parent where nothing is missing (WHY-AC-4).

### 7.1 One rule

**SNAP-AC-1 (R22 + A4 + A6)** — a save whose **stored pick actually differs after the save**, or a
**validated re-derivation by a derivation writer**, records **the Uw and SHGC of the configuration that
save established**.

*And the other half, scoped by A6:* a **best-effort** writer's save that **leaves the pick untouched**
carries the figures **forward verbatim** and **reads no catalogue at all**.

**SNAP-AC-2 (R22 — structural)** — every statement under `worker/**` that writes
`quote_line.product_slug` or `quote_line.selected_variant_id` also writes `performance_figures_json`.
**No count encoded; cannot pass vacuously.**

**SNAP-AC-3 (R22 — one place per fact)** — the display surface reads the line's own record.

### 7.2 The hard constraint — capture is never a gate

**SNAP-AC-4 / SNAP-AC-5** — an ops edit and a customer save that succeed today still succeed; **no new
validation, 409 or error path**.

**SNAP-AC-6 (best-effort resolution)** — a best-effort save that moved the pick to a configuration the
catalogue cannot answer for completes, stores **present-and-null**, tells nobody.

**SNAP-AC-7** — the catalogue is consulted at most once per save request.

### 7.3 What is stored

**SNAP-AC-8 (absence is recorded as absence)** — *three states, structural under A1:* `NULL` = never
captured; `{"uValue":null,"shgc":null}` = captured, no figure exists; numbers = captured.

**SNAP-AC-16 (A4 + A6 — negative)** — a present-and-null was written by **one of three honest
authors**. **A best-effort save that did not move the pick leaves the figures byte-identical.**

**SNAP-AC-9 (it is a snapshot)** — **nothing recomputes stored figures outside a capture moment**.

**SNAP-AC-10 (no backfill — D5)** — no script and no migration writes figures onto older lines.

**SNAP-AC-11** — the capture writes only to the line's own configuration record.

**SNAP-AC-12** — no new endpoint, no new HTTP method; the column is A1's.

### 7.4 Where the rule lands

**The verified-complete writer index is the design's, at design §4.2.** A hand-maintained list has been
**incomplete on every attempt**: 1, then 4, then 8, verified at **15** — **and the list layer failed a
third time in a different direction** when A6's re-walk found two writers in a class nobody had
enumerated. **Write criteria against properties, and let the design carry the membership.**

### 7.5 The customer path, specifically

**SNAP-AC-13 / 14 / 15 (D7)** — a new customer line carries figures; a customer override records **what
the customer chose**; **nothing customer-visible changes**.

### 7.6 Verified non-impact — the learning corpus

An override fails `sameCoreConfiguration`, so the outcome is `"adjusted"` and parked `pending`.

---

## 8. Acceptance criteria — Phase 2: the shared drawing viewer · **ACCEPTED, DEPLOYED**

> **The criteria stay exactly as written: they are what the next reader must not break.**

**The URL grammar (D9).** `/projects/:id/line/:lineId/drawing`; `…/drawing/u1`, `/u2`, … — **1-based
ordinals**.

**VIEW-AC-1 (R21, R25)** — **the whole drawing and its caption visible together, the drawing as large
as the viewport permits**.

> **The criterion was requiring two things that cannot both hold.** As shipped it was governed by
> height alone:
>
> ```
> WIDTH-ONLY    1280 → 887×620    1920 → 887×620    2560 → 887×620
> HEIGHT-ONLY    900 → 799×558    1400 → 1242×868
> ```
>
> **Verified by three shapes, each moving one dimension.**

**VIEW-AC-1a (D10)** — a **unit** shows its code; the **line** is titled `Drawing`.

**VIEW-AC-2 / 2a / 2b / 2c / 2d (R31)** — **exactly one** history entry on entry; back, Escape and the
system gesture all do the **same single pop** with **no remount and no record re-fetch**; a cold deep
link **replaces** to the line path; a malformed suffix **normalises by replace**; leaving a line after
enlarging takes **two backs** — **agreed cost, not to be collapsed**.

**VIEW-AC-3 / 4 (composites)** — the whole assembly in proportion; a single unit alone at
`…/drawing/u<N>`.

**VIEW-AC-5 (R21)** — exactly one viewer component, and **every** enlargeable drawing opens it.

**VIEW-AC-6** — the previous `SidePanel` enlargement no longer appears anywhere.

**VIEW-AC-7 (keyboard)** — Enter/Space opens it; back returns focus to the drawing that opened it.

**VIEW-AC-8 (R25)** — the stand-in square keeps its sentence and draws no dimension leaders.

**VIEW-AC-9 (negative)** — the record row's glyph navigates to the line page and **no** viewer opens.
`ASSUMED:` §13.1.

**VIEW-AC-10 (R25 — the class, negative)** — no symbol key, no sentence describing what the line styles
mean.

**VIEW-AC-11** — `ops2-record-correction.md`'s **P1-AC-27** is **marked superseded**.

**VIEW-AC-12 (the shared export IS deleted) — REVERSED by the owner (D12).**

### 8.1 Opening a drawing from the project record's desk canvas (D11)

**VIEW-AC-13** — the canvas opens the **shared** viewer at the line's own drawing URL, **exactly one**
history entry.

**VIEW-AC-14** — back, Escape and the system gesture all pop once to the **record**.

**VIEW-AC-15** — from the canvas, label and accessible name are both the record's **reference**.

**VIEW-AC-16** — the record is **not remounted and not re-fetched**, the selected line is **still
selected**.

**VIEW-AC-17** — `scripts/tests/web/` carries **executed** Playwright coverage.

---

## 9. Acceptance criteria — Phase 3b: "Why this product"

> **Gate closed (D18–D21).** **Six criteria have been repaired since they were written** — WHY-AC-27
> and WHY-AC-4 (rev 28), WHY-AC-29 (rev 29), WHY-AC-4/5/10/28/37 in revision 30's walk against the
> approved mock, and **WHY-AC-5 and WHY-AC-42 again in revision 31**. §12 notes 13 and 17 carry the
> classes.

### 9.0 The three figure states, and the three sentences (A1, SNAP-AC-8)

| State | What it means | What the panel says |
|---|---|---|
| **Column `NULL`** | Saved **before the capture existed**. Nobody ever asked. | *"not recorded"* — WHY-AC-9 |
| **`{"uValue":null,"shgc":null}`** | **Captured**, and the answer was **"no figure exists"** — *or* a derivation writer's *"evaluated, nothing chosen"* | Two causes, **distinguished from the row** — WHY-AC-9 |
| **Numbers** | Captured, with figures | The figures — WHY-AC-4 |

**These are states of a fact that was read.** **A read that did not complete is not among them** —
WHY-AC-42. **And a subject that has no figures of its own is not among them either** — a composite
parent takes WHY-AC-4's make-up sentence, **not an absence**.

### 9.1 The panel on the line detail (R6, D21)

**WHY-AC-1 (R6, D19)** — *Given* a line whose opening resolves to a **most recent** selection run with
recorded candidate outcomes, and whose product is still the one the platform selected, *Then* a panel
appears between the specification (or units block) and the price, carrying exactly three lines: **Had
to meet**, **This one**, **Chosen**.

**WHY-AC-2 (R4)** — `default_envelope` states the caps as figures **and** an origin label naming them a
platform default; equivalently `explicit_energy_report`, `plan_derived`, `human_override`.

**WHY-AC-3 (R4, absent)** — "Had to meet" says this opening had no thermal requirement, and no cap
figure is shown.

**WHY-AC-4 (R6, SNAP-AC-3, §9.0 — what "This one" shows and what it is attributed to; D16's first
dependency)** — *Given* a line whose stored figures **are numbers**, *Then* "This one" shows the Uw and
SHGC **from the line's own record**, attributed to **the product and the glass they describe** — never
to the row's `selected_variant_id`, and never phrased as *"this variant performs at X"*.

*Given* a figure is **not a number**, *Then* it is **never rendered as a number, a zero or a dash**, and
which sentence it gets is **§9.0's, by state**.

*Given* a **composite parent**, which has no product and no figures of its own (§7.4), *Then* "This one"
**names the make-up** — *"made as 2 units — an awning beside a fixed pane"* — and **no absence sentence
is shown, whatever the figures column holds**, because nothing about the parent is missing. *(Mock B4.)*

> **The composite clause caught a live defect within hours of being written.** A composite parent whose
> figures column was `NULL` printed *"This line was saved before performance figures were kept on a
> line."* — **an absence asserted about a subject that has no figures to be absent.** Same false
> absence at display time as WHY-AC-42's collapse, reached by a different route.

**WHY-AC-5 (R6, R7; band naming corrected revision 31)** — *Given* the run's `competingTier`, *Then*
"Chosen" states the winning rule in one sentence per tier:

- `meets` → the cheapest of those that met the caps;
- `within_tolerance` → nothing met the caps, so the cheapest **within the run's tolerance band, named
  as a percentage**;
- `misses` → nothing came **within that same named band**, so the closest was taken;
- `thermal_unknown` → no figure existed on the constrained axis;
- `does_not_fit` → nothing fitted, so the best fit was taken.

*Given* the requirement was **absent**, *Then* the sentence is **about fit and price only** — *"the
cheapest that fitted the opening"* — and **claims no thermal victory**. *(Mock B11.)*

> **No percentage in this criterion is a literal to copy.** **Every band figure is read from the run**
> (WHY-AC-6, R7). Through revision 30 this criterion wrote *"within **5%** of the closest"* — **an
> example its own neighbour forbids** — and left `misses`'s band unnamed while R7 requires it named.
> **The developer reported it rather than coding around it, and shipped the superset**: both sentences
> name the band, both read the figure.
>
> **§12 note 13's sixth instance, and the smallest.** *An example inside a criterion is read as
> normative by whoever implements it.* A literal in illustrative prose is a requirement with no author.

**WHY-AC-6 (R7)** — a run stored with `tolerance` 0.08 says 8% — **read from the run, never
hardcoded**, and the band is **named** rather than paraphrased as "closest available".

**WHY-AC-7 / 7a / 7b / 7c / 7d (R19, R26, R29, D8)** — activating the panel's action **navigates to
`/projects/:id/line/:lineId/why`**, presented as a right-hand slide-out at desk width and full screen
on the phone; the way out is a **back** control, **no "Done" and no X**; a cold arrival renders the
rationale with the line page's not-found and refusal sentences and back **replaces** to the line page;
the Projects filter panel is unchanged.

**WHY-AC-8 (R13, D6, §9.0 — the thinner panel)** — *Given* a line with **no selection run** whose stored
figures **are numbers**, *Then* the panel shows **two** lines: that a person chose this product, and
that product's own Uw and SHGC. **No alternatives action.**

**WHY-AC-9 (D5, D19, §9.0 — the honest gap, and which absence it is)** — *Given* stored figures of
**`NULL`**, *Then* the panel states that a person chose this product and that **its figures were not
recorded**, and **no catalogue lookup fills the gap**.

*Given* **present-and-null**, *Then* the panel distinguishes the two causes **from the row**.

> **The mapping must not decide this with a universal quantifier over a possibly-empty set.** A run can
> be stored with **zero candidate rows** when everything was withheld, and a vacuous `every()` over
> that empty set is **true** — sending the line to the wrong sentence. **§12's opening rule.**

**WHY-AC-10 (R3, D19, pre-0055 rows)** — the "Chosen" line states that this recommendation was
**recorded by an earlier model whose reasoning was not kept**; **no reconstruction**, no alternatives
action. **"This one" still renders from the line's own record** *(Mock B8)* — **the age of the run has
nothing to do with the figures.**

**WHY-AC-11 (D2, post-issue)** — **no panel at all**, and **the `why` route renders the same refusal as
a line that has none**.

### 9.2 The detail screen (R8, R9, R10, R19, R29, D8)

**WHY-AC-12 (R8, D18)** — the chosen product first, then **the next four** by ascending ladder rank —
**five rows, no more**.

**WHY-AC-13 (R8)** — fewer than five: the ones that exist, **no count of anything beyond the list**.

**WHY-AC-14 (R9 — negative)** — no excluded candidate, no count, no exclusion reason text.

**WHY-AC-15 (R9, D18 — negative)** — **nothing about withheld products appears.**

**WHY-AC-16 (R10, D18 — negative, whole surface)** — **no price, no delta, no currency symbol and no
control that prices anything.**

**WHY-AC-17 (R6, R7)** — an alternative row states the product's name, its recorded Uw and SHGC, and its
verdict in words derived from its tier.

**WHY-AC-18 (R3, D3, D19)** — every figure shown is a stored one; **no request to recompute anything**.

**WHY-AC-19 (R3)** — a recorded candidate whose product no longer exists is still shown from the
recorded facts.

**WHY-AC-20 (R1 — negative)** — no control changes the line, the quote or any stored value; a network
trace contains only GETs. *(WHY-AC-42's retry re-issues the same GET.)*

**WHY-AC-21 (R2 — negative)** — no wording describes a human's product change as wrong, incorrect, a
mistake, an error or a correction of the platform.

### 9.3 When a human changed the make-up (R11, R12, R23, R24)

**WHY-AC-22 / 23 (R11, R12)** — the platform's original recommendation shown **unchanged**, with a
comparison against the **same** requirement beside it; variant **or** glazing differing counts.

**WHY-AC-24 (R11 — negative)** — neither changed: no human-selection block at all.

**WHY-AC-25 / 26 (R23)** — the requirement shown is exactly the one recorded at selection time; **no
code path re-resolves or re-derives a requirement**.

**WHY-AC-27 (D3, D5, §9.0 — repaired revision 28)** — *Given* figures that **are numbers**, the
comparison uses them against the run's recorded caps. *Given* they are **not numbers**, the comparison
is **not attempted**, the panel says which absence it is **in §9.0's terms**, and it still shows the
requirement and the recommendation unchanged, with **no live lookup**.

**WHY-AC-28 (R24, D20 — attribution, the sentence)** — **R6's three labels are kept** and the
**"Chosen"** sentence carries the attribution. **And "This one" carries a qualifier naming *what*
changed** — *"glazing changed"*, *"frame and glazing changed"*. *(Mock B3, B12; R12 makes the
distinction meaningful.)*

**WHY-AC-29 (R24, §7.0, D16 — attribution, the MECHANISM; amended revision 29)** — the attribution is
derived by comparing **THE PICK** (§7.0) — **the product**, **the glazing**, and **the variant term
only where both sides name one**. Never from `origin`, never from `ai_proposal_line_id`, **never from
`selected_variant_id` alone**.

**Two fixtures, and the criterion is not met by one of them:** the product changed; and **only the
glass changed** — where **a product+variant comparison concludes *platform-made***.

> **Mutation-proved:** reverting to product+variant goes red **on the D16 case alone**.

**WHY-AC-30 / 31 (R24)** — a restore reads as platform-made once more by the same comparison.

### 9.4 Composites (R14–R17)

**WHY-AC-32 (R14)** — a composite parent whose `composite_origin` is `'ai'` **shows** the panel; its
"This one" names the make-up (WHY-AC-4).

**WHY-AC-33 (R15)** — the detail shows the split reason first, then each lite's own band.

**WHY-AC-34 / 35 / 36 (R16)** — each unit states its own caps and origin label; a unit with no recorded
band says so; a recorded `segment_thermal_review` flag is shown against that unit.

**WHY-AC-37 (R17, D6; shape corrected revision 30)** — *Given* `composite_origin = 'ops'`, *Then* the
panel shows **two lines and no alternatives action**: **"These ones"** — each unit's code with its own
Uw and SHGC — and **"Chosen": a person decided this split**. **Above three units the figures line cuts
and says so** — *"+2 more units"*. *(Mock B5.)*

**WHY-AC-38 (R14, `splitNote`)** — a recorded "no frame system could supply it" is stated.

### 9.5 No action, anywhere on this surface (R28, R1, R29)

**WHY-AC-39** — the detail's only interactive element is the back control. **WHY-AC-40** — no
line-editor route exists. **WHY-AC-41** — the panel's only interactive element is the one that opens
the detail **(and, in the failure state only, the retry — WHY-AC-42)**.

### 9.6 The read's own states (revision 30; boundary ruled revision 31)

**WHY-AC-42 (A6's invariant on the read side)** —

*Given* the rationale read is **in flight**, *Then* the panel is present and shows **skeleton lines in
the shape it is about to be**, so the page does not jump.

*Given* the read **completes with a final answer the reviewer's own navigation produced** — a line with
no rationale, or a post-issue line (D2, WHY-AC-11) — *Then* the panel takes **the refusal sentence**,
and **no retry is offered**: retrying would return the same answer forever.

*Given* **anything else** — a network error, a timeout, a 5xx, **a `403`**, or any status this criterion
does not name — *Then* the panel **remains**, says **the reasoning for this line could not be read just
now**, and offers a **retry**. It **never renders as "not recorded"**, never as an empty panel, and
**never disappears**. **The rest of the line page is unaffected.**

> **The boundary is a property, not a list, and the list is what was wrong.** Through revision 30 this
> criterion enumerated the refusals as two `404`s. **A `403` fits neither, and the developer routed it
> to failure — correctly.**
>
> > **A refusal the reviewer could not have reached is not a refusal; it is a failure.**
>
> On this surface a `403` can only mean **a role lost mid-session**: the record read would already have
> refused, and the panel would never have rendered. **The reviewer did not cause it and cannot
> interpret it**, so *"could not be read"* is the honest sentence and silence is not.
>
> **And the default is failure, because the two errors are not symmetric.** **Wrongly saying "could
> not be read" costs a click. Wrongly saying "not recorded" costs a reviewer who stops looking** — they
> conclude the platform never had a reason and move on, possibly confirming a recommendation they could
> have audited. **A false absence generated at display time is exactly what SNAP-AC-16 forbids the
> writers from producing**, and the reader is held to the same standard.
>
> **So a status code this criterion does not name takes the failure path.** No fourth amendment is
> needed for a fourth code — **enumerations in this feature have been wrong repeatedly** (§7.4's writer
> index, A6's writer class, this).

**WHY-AC-43 (D21 — negative; the canvas has no panel, and that is checked)** — *Given* the project
record at desk width with a line selected in the canvas, *When* the canvas renders `LineReview`, *Then*
**no "Why this product" panel appears there**, no rationale request is issued for the selected line,
and the line page's panel is unaffected.

> **The owner ruled the panel is line-page-only (D21), and a ruling with no criterion is an absence
> nobody verifies.** This feature has the worked example: the canvas *enlargement* arrived with no
> criterion and reached the tester untested (§8.1, §12 note 11). **If the ruling is ever reversed, this
> criterion is the thing that must be replaced — not quietly deleted.**

---

## 10. Abuse-case criteria (negative)

**X-AC-1 / X-AC-2** — a non-staff caller is refused with the console's standard refusal, the raw body
carries no product slug, tier, thermal figure or candidate, and the anonymous and signed-in-customer
refusals are **identical in status and body**.

**X-AC-3 (the control that matters most; gate corrected revision 30)** — a signed-in user whose staff
role is `manufacturer` is **refused**, and the raw body contains no competing product slug, tier,
figure or count. **The gate that fires is `resolveStaff`, and the body is `forbidden`.**

> **The behaviour is better than the criterion described.** A manufacturer never reaches the role check
> here, so **their refusal is byte-identical to an anonymous caller's** — **X-AC-2's
> indistinguishability extends to the role**. **Do not "harmonise" this to `forbidden_role`.**

**X-AC-4 (cross-project probe)** — the refusal for a line in another project is byte-identical to the
refusal for a line that does not exist, **both by navigating and by visiting the URL directly**.

**X-AC-5 (R9, D18, enforced server-side)** — the raw body contains **only** the chosen candidate and at
most four runners-up.

**X-AC-6** — this feature adds **no** POST, PATCH, PUT or DELETE endpoint.

**X-AC-7** — no schedule comment text, no data belonging to any other opening, project or account.

**X-AC-8 / X-AC-9 (the capture never trusts the client)** — thermal fields in the request body are
ignored entirely.

**X-AC-10** — the existing ownership guards refuse a line id from another project unchanged.

**X-AC-13 (the split path trusts no client field either)** — client-supplied fields outside the route's
accepted set are **ignored entirely**. **Mutation-proven at 3a.**

**X-AC-11 / X-AC-12 (Phase 1)** — the two gates on the irreversible write both refuse and write nothing.

---

## 11. Edge cases

| Case | Required behaviour | Ruling |
|---|---|---|
| **GST inc/ex** | **No money appears anywhere on this surface.** | **D18**, WHY-AC-16 |
| **Post-issue** | Panel absent; the `why` URL refuses. **Not a failure** — no retry. | D2, WHY-AC-42 |
| **The read fails — network, timeout, 5xx, or a `403`** | Panel **stays**, says **it could not be read**, offers **retry**. **Never "not recorded".** | **WHY-AC-42** |
| **A status code the criterion does not name** | **Failure path**, by default. A needless retry costs a click; a false absence costs a reviewer. | **WHY-AC-42** |
| **The read is in flight** | Skeleton lines in the shape the panel is about to be. | **WHY-AC-42** |
| **The record's desk canvas** | **No panel, and no rationale request.** Checked, not incidental. | **D21**, WHY-AC-43 |
| **A composite parent whose figures column is `NULL`** | **"This one" names the make-up.** **No absence sentence** — nothing about a parent is missing. | WHY-AC-4 |
| **An ops-created split** | **"These ones"** with per-unit figures; **"+N more units"** above three. | WHY-AC-37 |
| **An opening with no thermal requirement** | "Had to meet" says so; **"Chosen" claims no thermal victory**. | WHY-AC-3, WHY-AC-5 |
| **The band in any "Chosen" sentence** | **Named, and read from the run.** Never a literal copied from this spec. | WHY-AC-5, WHY-AC-6 |
| **A run from an earlier model** | **"This one" still shows the figures**; only the reasoning is unavailable. | WHY-AC-10 |
| **A line saved before the capture existed** | `NULL` → **"not recorded"**, and **nothing is looked up**. | **D19**, §9.0 |
| **A run stored with zero candidate rows** | **Not "reasoning not recorded".** A universal quantifier over the empty set is true. | WHY-AC-9, §12 |
| **A customer changes only the glass** | Figures from the glass; the row keeps its old id; **nothing downstream reads that id as the answer**. | **D16** |
| **The panel's verdict on that same line** | **"A person chose this product."** The **glazing term** decides it. | **WHY-AC-29** |
| **A manufacturer partner requests the rationale** | Refused by **`resolveStaff`**, body **`forbidden`** — byte-identical to an anonymous caller's. | **X-AC-3** |
| **Certification** | Never appears on this screen in any phase. | R5 |

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> **Five were found in a single day of Phase 2**, every one written while *adding* coverage, and **not
> one of them looked wrong**.
>
> **AND IT IS NOT ONLY TESTS — THE EMPTY CASE SATISFIES THE CHECK.** *A universal claim over an empty
> set is true and proves nothing.* **In a test** that is a green light with nothing behind it; **in
> production it is a branch nobody takes** — WHY-AC-9's second sentence would have been decided by a
> vacuous `every()` over a run with **zero candidate rows**.
>
> **TWO DETECTORS, AND THEY CATCH DIFFERENT THINGS:**
>
> > **A mutation proves the test CAN fail. A control proves the test is LOOKING AT the thing it
> > names.**
>
> **The eighth instance is why both are needed.** WHY-AC-4's composite test **passed vacuously on its
> first run** — the fixture helper's `current` was not overridable, so the `NULL` column never reached
> the code under test. **A mutation would not have caught it**: the test could fail, just never for the
> reason it claimed. What caught it was a **control** — a *simple* line carrying the same `NULL` column
> that **must still say "not recorded"**. When the control passed and the subject passed for different
> reasons, the fixture was the suspect.
>
> **So: mutate to prove it can go red; add a control to prove it is watching the right thing.** A
> control is a sibling case that **must behave differently**; if both cases pass with the same
> implementation, one of them is not being tested.

Not a test plan — seventeen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's fixtures — two, and one of them is the whole point.** A glazing-only override is
   caught **only** by comparing the pick. *(Proved by reverting: red on that case alone.)*
2. **SNAP-AC-2 is a source-level scan.** Property of every match, never a count.
3. **SNAP-AC-5 and SNAP-AC-15 need a customer-path test.**
4. **X-AC-1 must be executed for both callers separately.** **X-AC-13 must be an executed attempt.**
   **X-AC-3 must assert the body it actually gets** — `forbidden`, not `forbidden_role`.
5. **VIEW-AC-10, and the selector that became a trap.**
6. **WHY-AC-39/40/41 assert absences.** Enumerate and assert the *set* — **and it is not empty in the
   failure state** (WHY-AC-42's retry). **WHY-AC-43 is an absence too**, and it needs the same
   treatment: assert that no rationale request is issued, not merely that no panel is visible.
7. **WHY-AC-7a must assert where back GOES**; **VIEW-AC-15 adds the other half.**
8. **VIEW-AC-2's numbers are the assertions.**
9. **CERT-AC-3's predicate is narrow on purpose.**
10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — six times about the codebase, once about the
    world, once about this spec's own register, and once about which code path a measurement came
    from.**

    > **A claim about the codebase is settled by running something. A claim about the world is settled
    > by asking the person who owns it.** **A measurement is evidence for the thing measured** —
    > generalising it to a sibling path is an unexecuted claim wearing a result.

11. **A journey that no criterion names will be tested by nobody.**
12. **A two-variable measurement proves nothing about which variable did the work.**
13. **A CRITERION IS CHECKED AGAINST THE OTHER CRITERIA IT CONSTRAINS — six instances, none found by
    reading it alone.**

    VIEW-AC-1; SNAP-AC-1 vs SNAP-AC-9; SNAP-AC-1 vs SNAP-AC-14; WHY-AC-27/WHY-AC-4 vs SNAP-AC-8;
    WHY-AC-29 vs §7.0 and D16; **and WHY-AC-5 vs WHY-AC-6 — the smallest of them, and instructive
    because of it.**

    **The sixth was a prose example, not a rule.** WHY-AC-5 illustrated a sentence with *"within 5% of
    the closest"* while WHY-AC-6 forbade hardcoding the band. **An example inside a criterion is read
    as normative by whoever implements it** — it is a requirement with no author, and it sat next to
    the criterion that bans it for fifteen revisions.

    **The trigger: when a phase establishes a new distinction, walk the criteria written before it —
    and the walk must enumerate EVERY distinction, not only the one that prompted it.** *A partial walk
    reads exactly like a complete one afterwards.*

14. **A CRITERION GENERALISED FROM ONE INSTANCE MUST NAME THE PROPERTY THAT MADE THAT INSTANCE WRONG,
    NOT THE BEHAVIOUR IT EXHIBITED.** **And a criterion that enumerates cases will be wrong about the
    case nobody listed** — WHY-AC-42's `403` is the third enumeration in this feature to fail that way.
15. **ONE RULE IN TWO PLACES — the defect Phase 3a produced four times.** **The remedy is not
    vigilance; it is a single home.**

    > **Coercing a caller's input is normalisation; coercing a stored value to stand in for an input
    > the caller never sent is fabrication.**

16. **PREFER A SHAPE THAT MAKES THE ERROR IMPOSSIBLE OVER A RULE THAT FORBIDS IT — a rule needs a
    reader; a shape does not.** The DTO's omission of `current.variantId`; A1's dedicated column;
    D12's deletion of `ElevationLegend`.
17. **A CRITERION, A TYPE AND A MOCK CAN EACH BE INTERNALLY CONSISTENT AND STILL DISAGREE — AND ONLY
    ONE OF THE THREE HAS THE OWNER'S SIGNATURE.**

    §9's criteria, the design's DTO union, and the approved mock disagreed in **six** places, and
    nobody had compared them. **Rulings beat pictures; pictures beat unwritten criteria.**

    **The check nobody had run:** *walk every state the mock draws and find the criterion that governs
    it.* **Five of the six shipped correct and unverified** — the developer built the mock's behaviour
    and was right to; **the tester walks the criteria**, so a state with no criterion is a state nobody
    checks.

**THE ESCALATION IS THE MODEL.** **A criterion that cannot be satisfied honestly is a defect in the
criterion, and it goes back up the pipeline.** *(Revision 31 is two more instances: the developer
reported the `403` boundary and the band literal rather than coding around either.)*

---

## 13. `ASSUMED:` register — every entry carries a state

> **Every entry has a state — OPEN, DISCHARGED, RETIRED or VETOED.**

### The failure this register has had twice, and the mechanism that closes it

1. **A delegating entry names where the answer will land.**
2. **The rulings are indexed in this spec too**, at §5 (A1–A6).
3. **One command before any "live at this gate" list leaves the product-manager's hands:**
   `grep -n "§13\.\|ASSUMED" docs/design/ops2-why-this-product.md`.

**And the honest limit: none of that is automatic.**

**The design keeps its own `ASSUMED:` list** (design §12). **A5 is vetoable as one pair with the
design's ambiguity rule.** **Two registers, one per document** — **and a mock that is neither** (§12
note 17).

### Carried from the grill conclusions §7

| # | Entry | State |
|---|---|---|
| §7.1 | `withheldIncomplete[]` is **not** shown | **DISCHARGED — owner (D18)** |
| §7.2 | the `CandidateOutcome.dataSource` removal | **DISCHARGED — architect (A3)**; ADR 0011 |
| §7.3 | "3–5 next best" as **4** runners-up | **DISCHARGED — owner (D18)** |
| §7.4 | the `CONTEXT.md` corrections | **DISCHARGED — verified applied** |

### Registered by this spec

| # | Entry | State |
|---|---|---|
| 1 | **VIEW-AC-9** — the record row's glyph does not open the viewer | **OPEN — shipped and deployed.** A veto now costs rework. **The only open entry of this spec's own** |
| 2 | **WHY-AC-10** — a pre-0055 run says the reasoning was not recorded | **DISCHARGED — owner (D19)** |
| 3 | **§11, GST** — no money at all | **DISCHARGED — owner (D18)** |
| 4 | **§11, multiple runs** — the most recent only | **DISCHARGED — owner (D19)** |
| 5 | **WHY-AC-9** — the panel says so rather than looking up | **DISCHARGED — owner (D19)** |
| 6 | *(the capture's reach)* | **RETIRED** — D7 |
| 7 | *(where "Change the product" lives)* | **RETIRED** — R28 |
| 8 | **SNAP-AC-12** — figures in `configuration_snapshot_json` | **DISCHARGED — architect (A1): OVERRIDDEN** |
| 9 | **§7.4** — R22 reaches the estimator's own writers | **DISCHARGED — architect (A2)** |
| 10 | **WHY-AC-28** — three labels kept | **DISCHARGED — owner (D20)** |
| 11 | **§10** — the uniform refusal adopted as written | **RETIRED** |
| 12 | *"the drawing viewer is an overlay"* | **VETOED by R31** |
| 13 | **VIEW-AC-12** — the export is retained | **VETOED — owner (D12)** |
| 14 | **The URL grammar** | **DISCHARGED — owner (D9)** |
| 15 | **The viewer's title** | **DISCHARGED — owner (D10)** |
| 16 | **VIEW-AC-1** — no fixed ceiling | **RETIRED — the wrong question** |
| 17 | **VIEW-AC-15** — the project's **title** | **VETOED — owner** |
| 18 | **VIEW-AC-1** — all the leftover space | **DISCHARGED — owner (D13)** |
| 19 | *(the 3a-before-3b urgency)* | **VETOED — owner (D14)** |
| 20 | *(SNAP-AC-1's "sets or changes")* | **VETOED — architect (A4)** |
| 21 | *(SNAP-AC-16's "exactly one author")* | **VETOED — architect (A6).** **Too strong** |
| 22 | *(SNAP-AC-1's "that product+variant's figures")* | **DISCHARGED — owner (D16)** |
| 23 | *(WHY-AC-29's "product+variant" comparison after D16)* | **VETOED — architect's 3b design refresh.** **D16's second dependency** |
| 24 | *(that §9 described every state the approved mock draws)* | **VETOED — revision 30's walk.** **An unexamined belief that the criteria and the signed artifact agreed.** Six disagreements; **§9 had no criterion at all for the read's failure state** |
| 25 | *(that the panel would appear wherever `LineReview` renders)* | **VETOED — owner (D21): line page only.** Never a tagged assumption — **an inference from the shared component**, which is exactly how the canvas enlargement entered Phase 2 unspecified. **WHY-AC-43 makes the absence checked**; the recommendation against it is preserved at D21 |

---

## 14. Decisions needed

**None.**

**The Phase 3b gate is closed (D18–D21)** and every wording call reported this round is ruled:
WHY-AC-42's refusal/failure boundary is a **property** rather than a list, and WHY-AC-5 **names the
band and copies no literal**.

**Two things remain open, and neither blocks 3b:**

- **§13.1 (VIEW-AC-9)** — **OPEN and already shipped**; a veto now costs rework, not an edit.
- **A5** (a singleton answer set is not ambiguity) — the **architect's**, and **vetoable as one pair
  with the design's ambiguity rule** at Phase 3 acceptance.

**To restate at acceptance, because their cost has grown since they were taken:**

- **D16's condition is now three criteria wide** — WHY-AC-4, WHY-AC-29 and the DTO's omission.
  **Weakening any of them re-opens a decision he has already made.**
- **D21 is enforced by WHY-AC-43**, so reversing it later means replacing a criterion rather than
  flipping a prop.

**Still to happen, and it is the owner's:** the deploy. `0058` is **local-only**; it reaches production
**with 3b** (D17), under the deploy protocol — full gates green, security sweep green on the deployed
commit, preview smoke-test before promoting, because it touches a save path.
