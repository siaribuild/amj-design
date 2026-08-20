# Thermal model — acceptance

**Stage 8 (product-manager, returning) · 2026-08-20 · branch `feat/thermal-model`**
**Spec:** `docs/specs/thermal-model-backend.md` (revision 3) — 37 criteria, 6 abuse cases.

# VERDICT: ACCEPTED

All 37 acceptance criteria and all 6 abuse cases are discharged. Nothing was silently descoped,
nothing out of scope crept in, and every assumption is registered where you can veto it.

One criterion (TB-23) is met **in substance rather than literally**, and the reason is a drafting
error in my own spec rather than a shortfall in the work — §6 explains. One thing behaves
differently from before, on two of eighty cases, with **no effect on any price today** — §3.

This verdict is a recommendation. You are the product owner; the sign-off is yours, and §4 is the
only part that needs your attention.

---

## 1. What you asked for, and what arrived

You drew the line yourself: *"I can make business decision to enable more products, or to adjust
default Uw value — I can't implement the whole modelling algorithm, which is what this task is
about."*

**Your dials — now real dials.** The default Uw value was a constant buried in code; changing it
meant a developer editing a file and shipping a release. It is now a **record you can change**, and
every requirement the platform produces stamps which version of it was in force. Its value is
**unchanged at 4.0**, deliberately, so shipping this moves no estimate you have already given
anyone. The record also states, in words, that no citable source stands behind that number — because
none does, and the platform should say so rather than imply otherwise.

**A view that shows the consequences before you turn the dial.** Three things that used to live in
three places, now in one staff-only view: what real energy reports have demanded (from your two
parsed projects), what the default currently asserts, and — the new one — **what your published
catalogue can actually deliver at each candidate value**, including how many *products* would stop
having anything that meets the default. That last number is the one that stopped the earlier
proposal: tightening to 3.04 would have taken deliverable published rows from 49 to 28, and you
said so before anyone built it.

**The modelling algorithm — engineering's half.** Before this, every opening without an energy
report received one identical requirement: 444 of 444, same value, no solar-gain figure, regardless
of which way the window faced or how big it was. The branch of code that would have made two
openings differ had never run on a real job. Now a requirement is **assembled from whatever facts
exist about that specific opening**, each contribution recorded with where it came from, and each
requirement carries its own working: which facts it had, which it lacked, and which rules fired.
An opening whose requirement rests on nothing now says so in a field, instead of looking identical
to one derived from real evidence.

**What it does not do yet, by your instruction.** It reads no drawings. Getting orientation off a
floor plan belongs to the drawing/scanning thread you told us not to pre-empt, and this feature was
built against an agreed interface so that when that thread lands, orientation flows in **with no
change to this code**. Until then, the number of requirements that count as evidence-derived will
stay low — that is expected, and the platform now counts it for you instead of leaving you to guess.

---

## 2. What this changes for the business

| | before | after |
|---|---|---|
| Changing the default Uw | edit code, ship a release | insert one record; the next run uses it. No release |
| Knowing what a change would cost you | nobody knew; measured by hand, twice, this week | a staff view states it per candidate value, in rows **and in products** |
| Where the number came from | nowhere recorded | recorded on the record, and stamped on every requirement produced from it |
| Two different openings | identical requirement, 444 times | different requirements where the facts differ; identical where they genuinely are, and the record says which |
| Can a past quote silently change? | not addressed | no — requirements are insert-only, verified structurally |

---

## 3. The one behaviour change in the whole feature

North-east and north-west facing openings now receive a solar-gain figure of 0.4 with a 0.5 cap,
where the old code gave them 0.5 with no cap. Everything else — all 78 other combinations of climate
zone and orientation — is bit-for-bit identical to what shipped before, and **no maximum U-value
changes anywhere**.

Why it changed: the old code tested "does the orientation start with N?" before it tested the full
list, so NE and NW were caught by the north branch and never reached their own entry. The same flaw
would have swallowed SE and SW, and the original author guarded *those* by putting the full list
first — so this is the identical guard, misordered. Both the architect and the tester ruled
independently that the documented table is the intent.

**Practical effect on your business today: none.** Not one production opening currently carries a
solar-gain figure on this path, because the path had never executed. The change matters going
forward, not backward.

---

## 4. What needs your confirmation or veto

Twenty-six assumptions were registered so you could overrule any of them without reading the
codebase. **Four are genuinely yours.** The rest are engineering-internal and listed in §4.2 only so
that "registered" means "all of them", not "the convenient ones".

### 4.1 The four that are yours

**① The default stays at 4.0, and the rule that would have derived a tighter one is gone.**
*(A1, withdrawn at your instruction.)* The withdrawal is enforced in the code, not just documented:
the derivation method cannot even be written into the database — the column refuses it. If you ever
want the platform to set its own default from parsed reports, that is a deliberate decision to
re-open, not something that can drift back in. **Recommend: confirm.**

**② You cannot yet change the dial yourself.** *(A2.)* There is deliberately no web endpoint for
setting it — a write surface with no screen behind it is a security surface bought for nobody. Until
the ops screen exists, changing the value is a privileged database action performed by a developer
at your instruction. **Recommend: confirm**, and treat "an ops screen for the thermal default" as a
small future item rather than a gap in this one.

**③ The solar-gain figures are inherited heuristics, and are not settable.** *(A14.)* The eight
orientation-to-solar-gain values (north 0.5, east/west 0.35 with a 0.43 cap, and so on) were kept
**exactly as they were** and were not re-derived — inventing new physics numbers is precisely the
habit this platform has just finished breaking. They are now labelled honestly as unsourced legacy
values and versioned, so replacing them with sourced figures from an energy consultant is a recorded
change rather than an argument. Unlike the Uw default, they are not database-settable: eight values
behind no screen is a data-entry hazard. **Recommend: confirm**, and note that a consultant's figures
are the natural way to supersede them, alongside an ABCB Glazing Calculator run for the Uw value.

**④ Evidence-derived requirements will stay rare until the drawing work lands.** *(A16.)* A
requirement counts as evidence-derived when something from your customer's own documents informed
it. Today the only such fact available is an orientation stated on an energy report for an opening
that report gave no target to — real, but uncommon. The mechanism is complete and correct now; the
volume rises when the drawing thread ships, with no further work here. **Recommend: confirm**, and
expect the count in the run summary to be low at first. That is the honest number, not a fault.

### 4.2 Registered, engineering-internal, no decision needed

Listed for completeness; each is vetoable, none has a business consequence.

| # | In one line |
|---|---|
| A3 | The calibration calls its evidence "thin" below five distinct projects (you have two) |
| A4 | The calibration never changes the dial by itself — it reports, you decide |
| A5 | "Evidence-derived" means *this project's documents*, not floor plans specifically |
| A6 | Deciding between two documents that disagree about orientation belongs to the drawing thread |
| A7 | Where an energy report has already answered an opening, the calculation adds nothing to it |
| A8 | An old internal field (`riskBand`) was kept rather than deleted — removing it would have broken a decision you settled the day before |
| A9 | The seven unused climate-zone values are kept and labelled as unsourced |
| A10 | A room-identity defect found during this work was handed to the drawing thread, which owns that ground |
| A11 | The seed record admits in words that nothing citable stands behind 4.0 |
| A12 | The candidate values in the calibration view are derived from what the platform already asserts or has observed — no hand-picked numbers |
| A13 | The view counts published rows for "can deliver", and reports authored-but-unpublished separately, because holding rows back is your strategy and not a gap |
| A15 | Two future rules (shading, glazing ratio) are documented as attachment points but ship as no code, because their inputs do not exist yet |
| A17 | **Adjudicated** — the NE/NW correction in §3 |
| A18–A20, A22, A23, A25, A26 | Implementation choices: type shapes, testable seams, an honest failure when the CMS is down rather than a confident wrong number, and test fixtures deliberately set to a value that is *not* your default so a test cannot pass by coincidence |
| A21 | **Disclosed limitation.** A guard exists for "a reviewer overrode this requirement", but nothing in the platform currently marks a requirement that way, so the guard is untested by reality. Your reviewers' edits *are* protected — by a different, live mechanism that this work left intact and that is verified. Worth knowing; not a hole |
| A24 | See §5 |

---

## 5. On A24 — dropping staff identity from the customer's record (my own view)

When a requirement records which dial version produced it, the developer stored the value, the
method, the citation, the date and the interim flag — but **not** who set it, and not the internal
observation counts. That differs from an illustrative payload in the design document, so it was
registered.

**I endorse it, and would have asked for it had it not been done.** A per-opening row on a
customer's project has no business carrying a staff member's email address; the version number
remains as the link back to the full record, which sits behind the staff perimeter, so nothing is
lost that anyone can need. The observation counts are cross-account bookkeeping and belong even less
on a customer's row. My spec named four fields as required — value, method, source, date — and all
four are present. The design's example was illustrative; the spec is the binding document, and it is
satisfied.

---

## 6. Criteria walk

Verified against the tester's evidence, and re-verified by me directly in the working tree for every
load-bearing item — I read the implementation and the tests rather than accepting a pass.

| group | criteria | verdict | evidence |
|---|---|---|---|
| The calculation | TB-1..TB-6 | **MET** | Two openings in one project produce different requirements (west 0.35/0.43, north 0.5/none) with the consumed fact and its document class recorded; a composite's children band from their own facts, not the parent's; one module computes bands and both callers get identical answers; an unsourced value is refused at the boundary by the type system *and* at runtime |
| Legibility and measurement | TB-7..TB-9 | **MET** | Every requirement persists its working; a requirement resting on nothing is distinguishable **by field**, verified by an assertion that no document-derived fact is present; run summary counts by basis and counts how many bands carried a solar-gain figure, with double-counting explicitly prevented |
| Tiering and basis | TB-10..TB-14 | **MET** | A report still ends the matter; evidence-derived is assigned only when a document fact was consumed; the reviewer-edit protection is intact (§4.2 A21); migration 0057 verified at runtime — one new table, every other table present, `PRAGMA foreign_key_check` clean, still exactly four requirement bases, the cascade edge that makes rebuilds dangerous untouched, and the migration re-runs as a no-op |
| Your dial | TB-15..TB-21 | **MET** | Seed equals today's 4.0, labelled unsourced, interim, no observations; a record inserted straight into the database becomes active on the next read with **no deploy**, and a second record supersedes it while history stays intact; no test anywhere asserts what the value ought to be; no code path derives it from anything; requirements are insert-only, proven structurally across the whole Worker |
| Calibration | TB-22..TB-28 | **MET** (TB-23 in substance — §7) | All three axes served to staff over real HTTP; candidate values derived, not hand-picked; every non-active candidate carries its cost in rows and in products; "thin evidence" turns on the five-project floor; the module contains no write verb at all and nothing it exports can write; no "recommended value" field exists at any sample size |
| Invariants | TB-29..TB-33 | **MET** | The "never demand solar gain" rule is enforced by the **type**, not a check that could be edited away; no compliance claim; a NatHERS star rating still cannot become a per-window target; an energy report's answer is never topped up with a computed cap; no AI extraction skill touched (§8) |
| Non-regression | TB-34..TB-37 | **MET** | The twelve recorded learning fields and the legacy key are unchanged; the selection ladder's single tuned constant is still its only one; an evidence-derived requirement binds selection exactly as a reported one does; the run summary records how many openings met, nearly met or missed |
| Abuse cases | AB-1..AB-6 | **MET** | Customer and anonymous visitor both refused with no figures; every write verb on every plausible path, from both a staff and an anonymous session, refused with the record count unchanged before and after; injected instructions in a customer document move neither a requirement nor the dial; customer A refused customer B's project with no requirement data in the refusal, while B still reads their own; the cross-account view carries counts and statistics only, with document identity never even fetched |

Independent gates, re-run by the tester: type-check clean of fatal errors, 602/602 and 249/249 test
suites green.

---

## 7. Where the evidence is weaker than the verdict

Stated plainly rather than buried.

**TB-23 — "at a cap of 4.0 the published figure is 49 of 58".** I wrote a live-catalogue measurement
into a criterion that a test suite is supposed to check. The suite verifies the *mechanism* against
fixed data — counts of rows meeting a cap, products that can deliver at it, published versus
unpublished — and does not re-verify the "49 of 58" against your live Sanity. **That is the right
engineering call and I would have rejected the alternative**: pinning live catalogue numbers into a
test would make the suite fail every time you publish or unpublish a row, which is a thing you do
deliberately and often. The 49/58 was measured by hand on 2026-08-20 and will move the moment you
change what is published — which is the whole point of the view. Criterion met in substance; the
defect is in my drafting.

**TB-17 — "without a deploy".** Proven end-to-end: a record inserted directly into the database, a
fresh read returning the new value, a second record superseding the first with history intact. But
this was exercised against a **local** database. Migration 0057 has deliberately not been applied to
production, so the mechanism, while real and tested, has never been used against the live system.
See §9.

**TB-33 — "no AI extraction skill touched".** Verified by inspection rather than by a test, which is
appropriate for a criterion about the *absence* of a change. I confirmed it independently: the plan
extractor is still at prompt version v2 exactly as it was before this work began, and no thermal
identifier from this feature appears anywhere in the customer-facing application code.

---

## 8. Descoping and scope creep

**Nothing was silently descoped.** All 37 criteria have evidence; every criterion that could carry a
test has one; the two that cannot (an absence of change, and a live-catalogue figure) are addressed
in §7.

**Scope creep: effectively none.** You fenced this to the back end. The tester verified that the
customer-facing application code is untouched — not "only lightly touched", but **no file changed at
all**. I confirmed this independently by a different method.

**One thing rode along.** A documentation file for the database-migration safety procedure — the
guard-rail that exists because a migration once silently deleted production order and payment rows —
was corrected in the same commit as the design review. Its content was independently verified three
ways and it fixes a real inaccuracy in a procedure this repository points every migration at. It
belonged in its own commit. **Recorded, not undone.**

---

## 9. Before this goes live

Not conditions of acceptance — deployment facts you should know.

1. **Migration 0057 has been applied locally only.** No remote apply was attempted, deliberately.
   The new table must be created in production as part of deploying this, or the platform silently
   keeps using the built-in 4.0 seed — which is today's behaviour, so nothing breaks, but your dial
   would not exist yet.
2. **Nothing changes for any customer on the day this ships.** The default value is unchanged, no
   price moves, and the only behavioural difference (§3) affects a path that has never executed in
   production.
3. **Turning the dial is a separate, deliberate act** — and the calibration view exists so you can
   see what it would cost before you do it.

**Record correction for anyone re-checking this work:** the command noted during development for
verifying that no AI extraction skill was touched now matches an unrelated documentation file and
will *look* like a failure. The correct check is scoped to the extraction skills themselves —
`git diff --stat main..HEAD -- worker/lib/estimator/skills/` — which is empty, with no prompt
version changed in code.

---

## 10. Sign-off

**Recommended verdict: ACCEPTED.**

For your sign-off: confirm or veto the four items in §4.1. Everything else in this feature is
engineering's to own, and it has been done to the spec.
