# ops2 "Why this product" — SPEC

**Date:** 2026-08-26 · **Stage:** pipeline stage 1 (product-manager) · **Revision 34**
**Grill:** COMPLETE — `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R21 **binding**).
Where a **ruling** contradicts the mock, the ruling wins. **Where the mock shows a state and no
ruling covers it, the mock wins** — §12 note 17.
**Grill input / code facts:** `docs/specs/ops2-why-this-product-grill-input.md`
**Prior art this extends:** `docs/specs/ops2-record-correction.md` + `docs/specs/ops2-record-design.md`

## Status — the feature is complete, pending sign-off and two irreversible operations

| Phase | State |
|---|---|
| **Phase 1** — remove `certified` | **CODE SHIPPED.** `f96cf6ee`, `639a2e73`, `391bf0c7`, `9dbfa316`; `certified-removal.test.mjs` exercises CERT-AC-1…9 by name (60/60, in `test:pure`). **The dataset strip (CERT-AC-14) is not confirmed run** — §14 |
| **Phase 2** — the shared drawing viewer | **ACCEPTED and DEPLOYED**, `9285d642` |
| **Phase 3a** — the universal capture | **ACCEPTED (D15)**, certified `72d6b28b` |
| **Phase 3b** — the panel and the detail | **CERTIFIED PASS**, `a0f334c3` — **stage-8 acceptance recommended** |

**Two irreversible operations remain, both the owner's, and CERT-AC-14 orders one of them:** the
**dataset strip** against live Sanity, and the **3a+3b deploy** carrying migration `0058` (D17).

> **Revision 34 corrects a false claim this spec carried at revision 33** — *"Phase 1 is specified
> but not built"*. **Phase 1's code shipped first, exactly as §4 sequences it.** What D5 deferred was
> **the capture**, into Phase 3 — not Phase 1. **The tenth instance of §12 note 10, made in the
> document that names the other nine**, and recorded there rather than quietly fixed.

**Revision 33** recorded the 3b certification and the feature's closing lesson. **Revision 32** ruled
WHY-AC-42's skeleton and WHY-AC-37's placement, and added **WHY-AC-44**. **Revision 31** ruled the
refusal/failure boundary, fixed WHY-AC-5's band literal, recorded **D21** with **WHY-AC-43**.
**Revision 30's walk** against the approved mock found six disagreements and added WHY-AC-42.
**Revision 29** amended WHY-AC-29 to compare **the pick**. **Revision 28** closed the 3b gate.
**Revision 27** recorded D15–D17. **Revision 26** recorded Phase 3a's lesson. **Revision 25** folded
in three tester observations. **Revision 24** scoped SNAP-AC-16 (A6). **Revision 23** repaired
SNAP-AC-1 vs SNAP-AC-9 (A4). **Revision 22** reconciled the register against the design. **Revision
21** retracted a false urgency. **Revision 20** recorded the assertion-that-cannot-fail rule; **19**
corrected VIEW-AC-15; **18** resolved VIEW-AC-1's internal contradiction; **17** carried the veto of
§13.17; **16** carried D11 and D12; **15** gave every register entry a state; **14** corrected
VIEW-AC-12's false premise; **13** amended the CERT-AC-10 fence; **12** folded in the importers;
**11** closed VIEW-AC-2's mechanism; **10** folded in D8 and R31; **9** applied R29/R30; **8** applied
R28; **7** corrected a false claim about an existing legend test; **6** applied the closed UX mock
gate; **5** repaired two architect findings; **2–4** folded in the owner's decision rounds.

**Decisions needed: three, all at sign-off** (§14) — **A5**, the two rulings whose cost has grown,
and **whether the dataset strip has been run**.

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

Underneath it sat a defect that made the audit read wrong before it started. A dead `certified` flag
— never asked for, wired to opposite default values in two places of the Sanity schema — downgraded
**13 of 32 products to "indicative estimate only" on every thermally-constrained line**. **The code
removing it has shipped** (Phase 1); **the dataset values are stripped by an operator run that
CERT-AC-14 orders last** — see §14.

And a third gap, **closed by Phase 3a**: a product's thermal performance was not recorded on the line
that uses it. Under R3/D3 nothing may look it up at display time to recover it.

## 2. Scope

### In scope

1. **The read surface.** A three-line panel **on the line detail view** (D21) and the detail
   **screen** it leads to (D8), carrying the requirement and its origin, the chosen product against
   it, why it won, and **four** next-best alternatives (D18). Composites included (R14–R17). A
   **thinner panel** for lines nobody's estimator ever evaluated (D6). **No action anywhere on it**
   (R28) — **except the failure state's retry** (WHY-AC-42), which acts on the read, never on the
   line.
2. **The `certified` removal, depth (c)** (R5; CERT-AC-10's amendment) — **shipped in Phase 1**,
   dataset strip pending confirmation.
3. **The universal performance-figure capture (R22, D3, D6, D7)** — **shipped in Phase 3a.**
4. **A shared drawing viewer** for ops2 (R21, R25, R31) — **shipped in Phase 2.**
5. **Two changes to the shared `SidePanel`** (R26, R29) — shipped with Phase 2.
6. **The line-route URL grammar** — shipped in Phase 2; **Phase 3b adds only the `why` child**, and
   **WHY-AC-44 requires it to be alone there.**
7. **Deleting the shared `ElevationLegend` export** (D12, VIEW-AC-12) — shipped.

### Out of scope — and why

| Not built | Because |
|---|---|
| **The panel on the record's desk canvas** | **D21 — the owner's ruling**, enforced by **WHY-AC-43**. My recommendation was the other way; preserved at D21. |
| **"Change the product" — the control, and any placeholder** | **R28, deferred rather than declined.** Supersedes D4. §2.1. |
| **Re-classifying the Projects filter panel** | R26/R27 excluded moving it (WHY-AC-7b); **its own future ticket**. |
| **Renaming the dimension-rule `dataSource`** | `types.ts:77` uses the same token for a **different, live, correct** concept. |
| **Re-resolving figures on an unmoved pick — by a BEST-EFFORT writer** | **A4.** A recompute of a captured snapshot (SNAP-AC-9). **Does not govern derivation writers — §7.0, A6.** |
| **Opportunistic backfill of pre-capture lines on touch** | Same ruling; **D19 confirms it on the read side**. |
| **Filling a missing figure from today's catalogue at display time** | **D19**; it would have reversed **D3 and D5**. |
| **Showing withheld products, or any money** | **D18.** Money would have re-opened **R10**. |
| **Re-resolving a `selected_variant_id` on a glazing-only change** | **D16.** **Nothing downstream reads that id as the answer.** |
| **Rendering a failed read as an absence** | **WHY-AC-42.** *A missing fact and an unreachable one are different things.* |
| **Reserving the panel's worst-case height while it loads** | **WHY-AC-42.** It would make the common case **shrink** on load. |
| Any line editor in ops2 · a deep-link into the legacy console · explanatory notation on a drawing · switching from this surface · recording a verdict · display-time catalogue reads · re-deriving a requirement · touching `origin`/`aiManaged` · any new save-path refusal · any auth change · the learning corpus · excluded candidates · backfills · post-issue rationale · the staff role vocabulary · a new RBAC role · any customer-facing display change | R28 · R28 · R25 · R1 · R2 · R3/D3/D19 · R23 · R24 · D6/§7.2 · §10 · §7.6 · R9 · R18/D5 · D2 · conclusions §8 · persona ≠ role · staff surface only |

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

**And it will be a third routed surface under the line address** — **WHY-AC-44 governs it before it
is written.**

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

**They read this surface; they do not act on it.** **Going back is not an action** (R29); **retrying a
failed read is an action on the read, not on the line** (WHY-AC-42).

**And what they read must be what was established.** A4 and A6 apply that to the capture; **WHY-AC-4
and WHY-AC-29** to the caption and the attribution (**D16 rests on both**); **D19** to gaps;
**WHY-AC-42** to failure.

> **A reviewer told "not recorded" stops looking. A reviewer told "could not be read" tries again.**
> **The two errors are not symmetric**, and every ruling on this surface has resolved that way.

**And a reviewer reads a panel as one object.** A count that cannot be tied to its list (WHY-AC-37),
or a surface with another behind it (WHY-AC-44), breaks that reading before any sentence is parsed.

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

### Phase 1 — Remove `certified` (no UI) · **strictly this, nothing else** (D5) · **CODE SHIPPED**

**Delivered:** thermally-constrained lines stop being downgraded because of a flag nobody asked for,
and legacy variants the catalogue loader silently *dropped* become candidates again. **The importers
were fixed in the same phase** (`639a2e73`) so the strip cannot expire.

**Deploy order, enforced rather than trusted (CERT-AC-13, CERT-AC-14):** worker code **plus the four
importer edits** → Studio deploy → verified export → dry-run → `--apply`. **The strip is last, and
final.**

> **What D5 deferred was the CAPTURE, into Phase 3 — not this phase.** Phase 1 shipped first, exactly
> as this section sequences it. Revision 33 of this spec said otherwise and was wrong; see §12 note
> 10's tenth instance.

**Risk owned here:** an irreversible write against the live Sanity dataset — **and it is the one step
whose completion this repository cannot evidence** (§14).

### Phase 2 — the drawing viewer and the URL grammar · **SHIPPED** (`9285d642`)

### Phase 3 — the capture, the panel, the detail screen

- **Phase 3a** — **ACCEPTED (D15)**, certified `72d6b28b`.
- **Phase 3b** — **CERTIFIED PASS** `a0f334c3`; stage-8 acceptance recommended.

**Deploy sequencing — D17: 3a and 3b deploy together.** `0058` reaches production **with 3b**.

**The cost the owner accepted (D5):** no backfill, so **every line saved before Phase 3 has no
figures** (WHY-AC-9, WHY-AC-27).

> **~~The reason the sequencing paragraph used to give:~~** *"…every save in between is a line that
> will have something to show."* **False, and retracted rather than deleted. There are no saves in
> between.**

### Wayfinder check

**Not needed.** 31 rulings, twenty-one owner decisions, six architect rulings taken out loud in design
§1.

## 5. Ruling and decision index (traceability)

R1 read-only · R2 not a verdict surface · R3 snapshot · R4 requirement + origin label · R5 no
certification on screen · R6 three panel lines · R7 name the band · R8 chosen + 3–5 next best · R9 no
excluded · R10 no price deltas · R11 human change shows both · R12 frame or glazing = changed · R13
no-run lines still show the panel · R14 panel on machine-proposed composites · R15 split reason then
per-lite bands · R16 per-lite bands are real · R17 ops split = R13 · R18 leave history · R19
right-hand slide-out · R20 same gate as the record · R21 full-screen drawing viewer · R22 the capture
rule is universal · R23 a target is not a selection · R24 an overridden selection must no longer read
as platform-made · R25 no explanatory notation · R26 phone detail full screen · ~~R27~~ amended by
R29 · R28 no "Change the product" · R29 the detail is a tree node with back · R30 modals carry
controls on top · R31 the viewer is a tree node, not a modal.

Owner decisions: **D1** three phases · **D2** panel absent post-issue · **D3** figures snapshotted at
save · ~~**D4**~~ · **D5** the capture waits for Phase 3 · **D6** the thinner panel · **D7** the
capture extends to the customer save path · **D8** the detail gets its own URL · **D9** the URL
grammar · **D10** the title names the subject · **D11** back from the canvas returns to the record ·
**D12** `ElevationLegend` deleted · **D13** the drawing claims all leftover space · **D14** phasing is
manageability, not urgency · **D15** Phase 3a accepted · **D17** 3a and 3b deploy together · **D18**
four alternatives, withheld hidden, no money · **D19** the panel never reaches back · **D20** three
labels kept.

**D16 — the glazing-only change, with three dependencies.** **If any one is weakened, D16 re-opens:**
**WHY-AC-4** (never captions figures with the stale id), **WHY-AC-29** (never decides attribution on
it — **mutation-proved**), and **the DTO's omission of `current.variantId`** (§12 note 16).

**D21 — the panel appears on the line page only.** Enforced by **WHY-AC-43**. My recommendation was
the other way and is preserved: *a panel that vanishes on the faster surface teaches a reviewer to
distrust the faster surface.* **If revisited, WHY-AC-43 is replaced, not quietly deleted.**

### Architect rulings — taken in `docs/design/ops2-why-this-product.md` §1

- **A1 — a new column, `quote_line.performance_figures_json`.** Overrides §13.8. Migration `0058`.
- **A2 — the capture extends to the estimator's own writers: yes.** Confirms §13.9.
- **A3 — `CandidateOutcome.thermal.dataSource` removed from the contract.** ADR 0011.
- **A4 — the capture fires when the pick moves.**
- **A5 — a singleton answer set is not ambiguity.** **STILL OPEN — vetoable as one pair with the
  design's ambiguity rule, at sign-off.**
- **A6 — a validated re-derivation is a capture moment.**

---

## 6. Acceptance criteria — Phase 1: remove `certified` · **CODE SHIPPED**

> **Verified by execution, 2026-08-26:** `sanity/scripts/strip-certified.mjs` exists;
> `scripts/tests/certified-removal.test.mjs` exists and names `CERT-AC-` in 37 places, exercising
> **CERT-AC-1 … CERT-AC-9** and passing 60/60 in `test:pure` / `test:certified`; the only surviving
> `certified` occurrences in live estimator source are **three comments recording the removal**
> (`rules.ts:142`, `ladder.ts:228`, and an unrelated NCC sentence at `computedBand.ts:22`).
> **CERT-AC-14's dataset strip is the step this repository cannot evidence** — §14.

**CERT-AC-1 (R5)** — a product whose figures come only from legacy `performanceVariants` with
`certified` absent or false is **not** downgraded on account of certification.

**CERT-AC-2** — a legacy variant previously removed by the guard at `catalogue.ts:187` is present in
the candidate set.

**CERT-AC-3 (the scan)** — a source-level scan of all live source finds no `isCertified`,
`energyCertified`, `certified` as a field or value, or `dataSource` **valued** `"certified" |
"estimated" | "manufacturer"`. **The narrowness is deliberate**: `dataSource` has a **second, live,
correct meaning** at `types.ts:77`. Allowlist: `scripts/tests/**` and
`sanity/scripts/strip-certified.mjs`, each justified in the test.

> **Two corrections, revision 13.** The allowlisted path was wrong — **no
> `scripts/catalogue/strip-certified.mjs` exists**; CERT-AC-13's directory is a **different tree** and
> remains correct. **A third entry is gone** — `src/ops/api.ts:381`, exempted as *"a legacy read
> surface"*; **the tester executed that claim and it was false.**

**Non-vacuity:** the walk must be **shown to have reached** `catalogue.ts` and `import-wers.mjs`.

**CERT-AC-4 … CERT-AC-13** — stored statuses unchanged and no rewriting migration; non-certification
downgrades still fire; the Studio schema drops both fields; the strip is **export-gated** and refuses
a **stale checkout**; `outcome_json` written before A3 still parses; no customer-facing response
changes; the importers cannot re-introduce the fields.

**CERT-AC-10 (the fence) — AMENDED. Cause: `performance_json`.**

> **~~As written through revision 12:~~** *"…and **no application save path**."* **No longer true, and
> the amendment is recorded rather than the criterion rewritten.**

**CERT-AC-14 (deploy order — the strip is last, and final)** — worker code **and the four importer
edits** → Studio deploy → verified export → dry-run → `--apply`. **The strip is not provisional on
anything that follows it**, and CERT-AC-8 and CERT-AC-13 enforce its two preconditions rather than
trusting the operator to remember them.

> **This is the criterion whose completion the repository cannot show.** A script's existence is not
> evidence it was run against a live dataset — **that is a claim about the world, and only the owner
> can settle it** (§12 note 10's second shape). §14 asks.

---

## 7. Acceptance criteria — Phase 3a: the universal capture · **ACCEPTED (D15)**

**Where the figures live: A1** — `quote_line.performance_figures_json`, migration `0058`.

### 7.0 The definitions every criterion depends on

**The pick (A4):** `product_slug`, `selected_variant_id`, `options.glazing`. **Colour, hardware, the
room label, dimensions cannot move the figures.** **The predicate lives once**, in
`worker/lib/figures.ts`. **It is also the unit of comparison for attribution** (WHY-AC-29).

**The two classes of writer, and the one invariant (A6):**

> **No writer may assert an absence it did not establish.**

**Best-effort writers** ask the catalogue and **have a failure channel**; A4's predicate governs them.
**Derivation writers** *are* the derivation and have **no failure channel that can write a dishonest
absence**; for them the pick-moved predicate is the **wrong condition**. **Membership is a property,
not a list** — verified at 3a by attacking the property, not sampling it.

> **The invariant has a read-side twin: WHY-AC-42.** **Two live defects came from the same root** —
> the capture's re-resolve on an unmoved pick (A4), and the panel printing an absence for a composite
> parent where nothing is missing (WHY-AC-4).

### 7.1–7.6

**SNAP-AC-1** — a save that **moves the pick**, or a **validated re-derivation**, records the figures
**of the configuration that save established**; a best-effort save that leaves the pick untouched
**carries them forward verbatim and reads no catalogue**. **SNAP-AC-2** — every statement writing the
product also writes the column; **no count encoded, cannot pass vacuously**. **SNAP-AC-3** — one place
per fact. **SNAP-AC-4/5** — **no new refusal** on either console. **SNAP-AC-6** — a failed resolution
on a moved pick stores **present-and-null** and tells nobody. **SNAP-AC-7** — one catalogue call per
request. **SNAP-AC-8** — **three structural states**: `NULL`, present-and-null, numbers.
**SNAP-AC-16** — present-and-null has **three honest authors**, and a best-effort save that did not
move the pick leaves the figures **byte-identical**. **SNAP-AC-9** — nothing recomputes outside a
**capture moment**. **SNAP-AC-10** — **no backfill**. **SNAP-AC-11** — the platform's own record is
never overwritten. **SNAP-AC-12** — no endpoint, no method. **SNAP-AC-13/14/15** — the customer path
carries figures, records **what the customer chose**, and changes nothing they can see. **§7.6** — the
learning corpus is verifiably untouched.

**§7.4:** the writer index is the design's. A hand-maintained list has been **wrong on every attempt**
— 1, then 4, then 8, verified at **15** — **and wrong a third time in a different direction** when
A6's re-walk found a whole class nobody had enumerated. **Write criteria against properties.**

---

## 8. Acceptance criteria — Phase 2: the drawing viewer · **ACCEPTED, DEPLOYED**

**VIEW-AC-1** — **the whole drawing and its caption visible together, as large as the viewport
permits**; **whichever dimension binds governs**. Verified by **three shapes, each moving one
dimension**.

**VIEW-AC-1a** title names the subject · **VIEW-AC-2/2a–2d** exactly one entry, one pop from three
exits, cold links **replace**, malformed suffixes **normalise**, **two backs** to leave a line (agreed
cost) · **VIEW-AC-3/4** composites · **VIEW-AC-5** exactly one viewer, and every enlargeable drawing
opens it · **VIEW-AC-6** the old enlargement is gone · **VIEW-AC-7** keyboard and focus return ·
**VIEW-AC-8** the stand-in sentence stays · **VIEW-AC-9** the row glyph opens no viewer ·
**VIEW-AC-10** no explanatory notation · **VIEW-AC-11** the older spec is marked superseded ·
**VIEW-AC-12** the export is deleted.

> **VIEW-AC-5 says there is one viewer. It never said the viewer is alone on its address** — see
> **WHY-AC-44** and §12 note 18.

**§8.1 (D11)** — **VIEW-AC-13** the canvas opens the shared viewer at the line's own address, one
entry · **VIEW-AC-14** back pops once to the **record** · **VIEW-AC-15** the control carries the
record's **reference** · **VIEW-AC-16** no remount, no re-fetch, selection intact · **VIEW-AC-17**
executed Playwright coverage.

---

## 9. Acceptance criteria — Phase 3b: "Why this product" · **CERTIFIED PASS**

> **Criteria repaired after they were written:** WHY-AC-27 and WHY-AC-4 (rev 28), WHY-AC-29 (rev 29),
> five in revision 30's mock walk, WHY-AC-5 and WHY-AC-42 (rev 31), WHY-AC-42 and WHY-AC-37 (rev 32).
> **Three criteria — WHY-AC-42, 43, 44 — did not exist until something was found.**

### 9.0 The three figure states, and the three sentences (A1, SNAP-AC-8)

| State | What it means | What the panel says |
|---|---|---|
| **Column `NULL`** | Saved **before the capture existed**. | *"not recorded"* — WHY-AC-9 |
| **`{"uValue":null,"shgc":null}`** | **Captured**: "no figure exists" — *or* a derivation writer's *"evaluated, nothing chosen"* | Two causes, **distinguished from the row** |
| **Numbers** | Captured, with figures | The figures — WHY-AC-4 |

**A read that did not complete is not among them** (WHY-AC-42), **and a subject with no figures of its
own is not among them either** — a composite parent takes WHY-AC-4's make-up sentence.

### 9.1 The panel (R6, D21)

**WHY-AC-1** three lines, from the **most recent** run · **WHY-AC-2** caps **and** an origin label ·
**WHY-AC-3** no requirement → says so.

**WHY-AC-4 (D16's first dependency)** — numbers are shown **from the line's own record**, attributed
to **the product and the glass** — **never to `selected_variant_id`**. A non-number is **never a
number, a zero or a dash**. **A composite parent names the make-up and shows no absence sentence,
whatever the column holds.**

> **This clause caught a live defect within hours** — a parent with a `NULL` column printing *"saved
> before performance figures were kept"*, **an absence asserted about a subject that has no figures to
> be absent.**

**WHY-AC-5** one sentence per tier, the band **named and read from the run**; requirement absent → fit
and price only, **no thermal victory claimed**. **No percentage in that criterion is a literal to
copy** — through rev 30 it wrote *"within 5% of the closest"*, **an example its own neighbour
forbids**. **WHY-AC-6** the band is the run's.

**WHY-AC-7/7a–7d** the detail is a routed screen, back **replaces** on a cold arrival, the filter
panel is untouched · **WHY-AC-8** the thinner panel · **WHY-AC-9** the honest gap, **and which absence
it is** · **WHY-AC-10** an earlier model's run still shows **"This one"** · **WHY-AC-11** no panel
post-issue.

> **The mapping must not decide WHY-AC-9 with a universal quantifier over a possibly-empty set.** A run
> can be stored with **zero candidate rows**, and a vacuous `every()` over it is **true**.

### 9.2 The detail (R8, R9, R10)

**WHY-AC-12** five rows, no more · **WHY-AC-13** no count beyond the list · **WHY-AC-14/15** no
excluded, **nothing withheld** · **WHY-AC-16** **no money, whole surface** · **WHY-AC-17** name,
figures, verdict · **WHY-AC-18** stored figures only · **WHY-AC-19** a vanished product still shows ·
**WHY-AC-20** GETs only · **WHY-AC-21** no fault language.

### 9.3 When a human changed the make-up

**WHY-AC-22/23** both shown · **WHY-AC-24** no block when nothing changed · **WHY-AC-25/26** the target
does not move · **WHY-AC-27** numbers are compared, non-numbers are **not** · **WHY-AC-28** three
labels, the **"Chosen"** sentence carries the attribution **and "This one" names what changed**.

**WHY-AC-29 (the MECHANISM)** — attribution compares **THE PICK**: product, glazing, and the variant
term **only where both sides name one**. **Two fixtures, and the criterion is not met by one** — the
product changed, and **only the glass changed**, where a product+variant comparison concludes
*platform-made*. **Mutation-proved: red on the glazing-only fixture alone.**

**WHY-AC-30/31** a restore reads as platform-made by the same comparison.

### 9.4 Composites

**WHY-AC-32** the panel appears · **WHY-AC-33** split reason then bands · **WHY-AC-34/35/36** per-unit
caps, unrecorded bands say so, review flags shown.

**WHY-AC-37** — an ops split shows **"These ones"** and **"Chosen: a person decided this split"**;
above three units the list cuts, **and the count is the last entry INSIDE the "These ones" value**.

> **A cutoff a reader cannot associate with its list is worse than no cutoff.** An overflow string
> held as a **sibling of the lines** is what put the component in the position of deciding where it
> goes, and it decided wrongly. **A comment defending a shape that produced a defect is not evidence
> the shape is right.**

**WHY-AC-38** the `splitNote` fact is stated.

### 9.5 No action (R28, R1, R29)

**WHY-AC-39/40/41** — one control on the detail, no line-editor route, one control on the panel
(**and, in the failure state only, the retry**).

### 9.6 The read's own states

**WHY-AC-42** — a **final answer the reviewer's navigation produced** takes the refusal sentence, **no
retry**. **Anything else — network, timeout, 5xx, a `403`, or any status this criterion does not
name** — keeps the panel, says **it could not be read**, offers **retry**, and **never renders as "not
recorded"**.

> **A refusal the reviewer could not have reached is not a refusal; it is a failure.** **The default
> is failure, because the errors are not symmetric.**

*In flight:* the same chrome and three bars, and: **the skeleton is the panel's minimum, never its
maximum**; **the panel never shrinks on load**; **the growth is deliberately unbounded**.

> Measured **+16 / +33 / +66 / +30px**; reserving the worst case would **shrink the common case by
> ~50px**. **A tolerance chosen by whoever writes the test is a criterion set by the test.**

**WHY-AC-43 (D21 — negative)** — the canvas shows **no panel and issues no rationale request**.

**WHY-AC-44 (one routed surface per address)** — the bare line address shows **neither**; `/why` shows
**the detail and no viewer**; `/drawing[/u<N>]` shows **the viewer and no detail** — on every entry
path.

> **Its absence let a MAJOR through.** The grammar was never wrong: `lineRoute.ts` promises the
> suffixes cannot stack. **The consumer kept a second copy of that promise and got it wrong** — a
> **deny-list** that stopped being exhaustive when the union grew. **§12 notes 15 and 18.**

---

## 10. Abuse-case criteria (negative)

**X-AC-1/2** one refusal for every non-staff caller, **identical in status and body** · **X-AC-3** a
`manufacturer` is refused by **`resolveStaff`** with body **`forbidden`** — **byte-identical to an
anonymous caller's**; **do not "harmonise" it to `forbidden_role`** · **X-AC-4** cross-project probes
are byte-identical to non-existent lines, by navigation **and** by URL · **X-AC-5** only the chosen
candidate and four runners-up leave the server · **X-AC-6** no write endpoint added · **X-AC-7** no
prose escapes · **X-AC-8/9** the capture never trusts the client · **X-AC-10** no cross-project write ·
**X-AC-13** the split path ignores client-supplied fields (**mutation-proven**) · **X-AC-11/12** the
Phase 1 gates refuse and write nothing.

---

## 11. Edge cases

*(Unchanged from revision 32 — GST, post-issue, read failure and its default, the skeleton's
direction, the orphaned count, `/why`'s exclusivity, the desk canvas, composite parents, absent
requirements, the band, earlier models, pre-capture lines, zero-candidate runs, glazing-only changes
and their verdict, manufacturer refusals, certification.)*

---

## 12. Test-surface notes for the architect and tester

> ### THE RULE THIS FEATURE PAID FOR — an assertion that cannot fail is worse than no assertion
>
> **Fifteen were found across the feature.** Every one written while *adding* coverage, by someone
> competent, and **not one of them looked wrong**. **The last four were found by a reviewer hunting
> them deliberately** — which is the only way the fifteenth gets found — and **one was created and
> closed by the same developer in a single commit.**
>
> **AND IT IS NOT ONLY TESTS — THE EMPTY CASE SATISFIES THE CHECK.** *A universal claim over an empty
> set is true and proves nothing.* **In production it is a branch nobody takes.**
>
> **TWO DETECTORS, AND THEY CATCH DIFFERENT THINGS:**
>
> > **A mutation proves the test CAN fail. A control proves the test is LOOKING AT the thing it
> > names.**
>
> **And a number in a report is not automatically the shipped number:** say which build a measurement
> came from.

Not a test plan — eighteen places where the obvious test would pass a wrong implementation:

1. **WHY-AC-29's two fixtures**, one of which is the whole point. 2. **SNAP-AC-2 asserts a property,
never a count.** 3. **The customer path needs its own test.** 4. **X-AC-1 for both callers; X-AC-13
executed; X-AC-3 asserts `forbidden`.** 5. **VIEW-AC-10's selector trap.** 6. **Absence criteria
(39/40/41/43/44) assert the SET** — WHY-AC-43 needs *no request issued*; **WHY-AC-44 needs the viewer
asserted ABSENT on `/why`**, since a test that only checks the detail is present **passes with the
viewer behind it, which is exactly how this shipped**. 7. **Back must be asserted by destination.**
8. **VIEW-AC-2's numbers.** 9. **CERT-AC-3's narrow predicate.**

10. **A JUSTIFICATION IS A CLAIM, AND IT MUST BE CHECKED — ten instances, and the tenth is in the
    document that names the other nine.**

    > **A claim about the codebase is settled by running something. A claim about the world is settled
    > by asking the person who owns it.** **A measurement is evidence for the thing measured** —
    > generalising it to a sibling path, or quoting it from a build that no longer exists, is an
    > unexecuted claim wearing a result.

    **THE TENTH (revision 34).** The Phase 3b acceptance report stated *"Phase 1 is specified but not
    built"*. **False.** The strip script exists; `certified-removal.test.mjs` exercises CERT-AC-1…9 by
    name and passes 60/60 in `test:pure`; the only surviving `certified` occurrences in live estimator
    source are **three comments recording the removal**; four commits carry the work and its
    conformance record. **The cost of checking was four commands.**

    **How it was made:** **D5 deferred the *capture* into Phase 3, and the report read that as
    deferring *Phase 1*.** A ruling was paraphrased from memory and then **used as evidence about the
    repository** — the same defect as an unexecuted claim, with a decision standing in for the grep.

    **And the correction is sharper than the claim it replaces**, which is the part worth carrying:
    what is actually outstanding is **the dataset strip**, not the phase. *"The code shipped and the
    dataset strip is outstanding"* is true and useful. *"Phase 1 is not built"* is neither — **it sent
    attention to a phase that is done and away from the one irreversible operation that may still be
    pending.** **A wrong claim is not made safe by sounding conservative.**

    **It happened in the closing document, written by the author of the other nine.** That is the
    argument for the rule, not against it: **the tell is not incompetence, it is confidence** — and
    four commands is cheap enough that confidence is never the reason to skip them.

11. **A journey no criterion names will be tested by nobody.**
12. **A two-variable measurement proves nothing about which variable did the work.**
13. **A CRITERION IS CHECKED AGAINST THE OTHERS IT CONSTRAINS — six instances, none found by reading
    alone.** **And a criterion can be unsatisfiable on its own**, when it names an outcome the code
    does not control. **When an outcome depends on an input nobody controls, specify the invariant the
    code can hold.**
14. **NAME THE PROPERTY, NOT THE BEHAVIOUR** — and **an enumeration will be wrong about the case
    nobody listed** (three times here).
15. **ONE RULE IN TWO PLACES — the defect that caused nearly every defect in this feature.**

    **Five instances across 3a and 3b**: the pick-moved predicate; the writer classes; what the figures
    describe; the coercion sites; and `lineRoute.ts`'s promise restated in `drawingSubject.ts`.

    **And the sharpest finding of the whole feature, from the architect's 3b conformance pass: three of
    3b's four defects trace to a document, not to code that misread one.** A copy contract, a restated
    promise, an enumeration. **Every copy was implemented faithfully. They succeeded at being wrong.**

    > **A second copy of a rule does not fail by being ignored. It fails by being obeyed.**

    **The remedy is not vigilance; it is a single home.** When a distinction must be re-stated at a
    second site, **that is the moment it becomes a function, a criterion or a definition** — never a
    second sentence. **And when a tool is dropped for being noisy, its findings do not go with it.**

    > **Coercing a caller's input is normalisation; coercing a stored value to stand in for an input
    > the caller never sent is fabrication.**

16. **PREFER A SHAPE THAT MAKES THE ERROR IMPOSSIBLE OVER A RULE THAT FORBIDS IT — a rule needs a
    reader; a shape does not.**
17. **A CRITERION, A TYPE AND A MOCK CAN EACH BE INTERNALLY CONSISTENT AND STILL DISAGREE — AND ONLY
    ONE HAS THE OWNER'S SIGNATURE.** **Rulings beat pictures; pictures beat unwritten criteria.**
    **Walk every state the mock draws and find the criterion that governs it.**
18. **A DENY-LIST OVER A GROWING UNION IS A DEFECT WAITING FOR THE NEXT MEMBER.** **When a type gains
    a member, a deny-list opts it in and an allow-list opts it out. The safe default is out.**

**THE ESCALATION IS THE MODEL.** **A criterion that cannot be satisfied honestly is a defect in the
criterion, and it goes back up the pipeline.** It happened at every stage: the developer on A4, A6, the
`403` and the band literal; the tester on the glazing-only trace; the ui-designer on the skeleton and
the orphaned count; the architect on WHY-AC-29 and the writer classes; **and the coordinator on this
document's own tenth instance.**

---

## 13. `ASSUMED:` register — every entry carries a state

**States:** `OPEN` · `DISCHARGED` · `RETIRED` · `VETOED`. **Discharging happens when the answer
arrives, not when someone next reads the file.**

**The mechanism, after this register was twice found reporting a settled question as open:** a
delegating entry **names where the answer will land**; the rulings are **indexed at §5**; and **one
command runs before any gate list leaves the product-manager's hands**. **None of it is automatic.**

**Two registers, one per document** — the design keeps its own — **and a mock that is neither** (§12
note 17).

| # | Entry | State |
|---|---|---|
| §7.1 · §7.3 | withheld hidden · four runners-up | **DISCHARGED — owner (D18)** |
| §7.2 · §7.4 | the `dataSource` removal · `CONTEXT.md` | **DISCHARGED — architect (A3) · verified applied** |
| **1** | **VIEW-AC-9** — the row glyph opens no viewer | **OPEN — shipped and deployed.** A veto now costs rework. **The only open entry of this spec's own** |
| 2–5, 10 | WHY-AC-10 · GST · multiple runs · WHY-AC-9 · WHY-AC-28 | **DISCHARGED — owner (D18/D19/D20)** |
| 6, 7, 11, 16 | the capture's reach · the CTA · the refusal convention · the ceiling | **RETIRED** |
| 8, 9 | storage · the estimator's writers | **DISCHARGED — architect (A1 overridden, A2 yes)** |
| 12, 13, 17, 19, 20, 21 | the overlay · the retained export · the title label · the urgency · "sets or changes" · "exactly one author" | **VETOED** |
| 14, 15, 18, 22 | the URL grammar · the viewer's title · the leftover space · what the figures describe | **DISCHARGED — owner (D9/D10/D13/D16)** |
| 23 | WHY-AC-29's product+variant comparison after D16 | **VETOED — architect.** **D16's second dependency** |
| 24 | that §9 described every state the mock draws | **VETOED — revision 30's walk.** Six disagreements |
| 25 | that the panel appears wherever `LineReview` renders | **VETOED — owner (D21)**; **WHY-AC-43 checks the absence** |
| 26 | that "the page does not jump" was achievable | **VETOED — the ui-designer's measurement** |
| 27 | that "exactly one viewer" meant "alone on its address" | **VETOED — the ui-designer's MAJOR.** **WHY-AC-44** |
| 28 | *(that Phase 1 was unbuilt, because D5 deferred something)* | **VETOED — executed 2026-08-26.** Never a tagged assumption: **a ruling paraphrased from memory and used as evidence about the repository.** **Phase 1's code shipped first.** §12 note 10's tenth instance |

---

## 14. Decisions needed — **at sign-off**

**Three.**

1. **A5 — a singleton answer set is not ambiguity.** Where a product offers **exactly one** published
   variant and no variant was named, the figures resolve to that variant; **ambiguity, and its null,
   begin at two.** **Vetoable as one pair with the design's ambiguity rule, and this is the last gate
   before the feature closes.** **Recommendation: confirm** — ruling otherwise would blank figures on
   precisely the products whose catalogue answer is most certain.

2. **Has the dataset strip been run?** **CERT-AC-14's `--apply` against the live Sanity dataset is the
   one step this repository cannot evidence** — a script's existence is not proof it was executed.
   **If it has not run, it is outstanding beside the deploy**, and CERT-AC-14 orders it: worker code
   and importer edits → Studio deploy → **verified export** → dry-run → `--apply`, with the strip
   **last and final**, refusing without an export (CERT-AC-8) and refusing from a stale checkout
   (CERT-AC-13).

3. **Two rulings whose cost has grown since he took them** — not re-openings, but he should know
   before signing:
   - **D16 is now three criteria wide** (WHY-AC-4, WHY-AC-29, the DTO's omission). **Weakening any one
     re-opens it.**
   - **D21 is enforced by WHY-AC-43.** Reversing it means **replacing a criterion**, not flipping a
     prop.

**Still open and already shipped:** **§13.1 (VIEW-AC-9)** — a veto now costs rework, not an edit.

**The two irreversible operations, both his:** the **dataset strip** (above) and the **deploy** —
`0058` is local-only, **3a and 3b go out together** (D17), under the deploy protocol: full gates
green, security sweep green on the deployed commit, **preview smoke-test before promoting**, because
it touches a save path.
