# Product recommendation model — acceptance

**Stage:** pipeline stage 8 (product-manager, returning) · **Date:** 2026-08-20
**Branch:** `feat/recommendation-model` · **Spec under acceptance:** `docs/specs/recommendation-model.md` (58 criteria)
**Written for the owner.** This is what you read when you get back. It is in business terms;
the file-and-line evidence is named so anyone can check my work, but you should not have to.

---

## Verdict: **ACCEPTED WITH CONDITIONS**

The thing you asked for was built, and the defects that started this are dead — I verified that
against the tests themselves, not against anyone's summary. Two conditions remain, and neither
is a defect:

**Condition 1 — one criterion is not fully proven yet, and cannot be until you deploy.**
AC-36 (clearing the stale learning corpus) is a third proven, two thirds pending. The migrations
are applied locally only; the orchestrator deliberately held the production apply for you,
because it deletes real rows. That was the right call and I am not overriding it. What must
happen at deploy time is written out in §7 below.

**Condition 2 — the assumption registers need your yes or no.**
53 judgement calls were made in your absence (my 18, the architect and developer's 35). They are
listed in §6. Two deserve a real decision rather than a nod; they are in §5.

Nothing was silently descoped. Nothing out of scope crept in. No UI was built, which is correct.

---

## 1. What you asked for, and what arrived

You said the recommendation model had never been designed, and that its weights were doing
visible damage: a dearer product beating a cheaper one, a product that misses the energy target
beating one that meets it, and the winner changing when an irrelevant third option was added.

All three of those are now impossible, and impossible in the strongest sense — not "a test says
they do not happen" but "the code cannot express them":

- **A dearer product can no longer beat a cheaper one that meets the same requirement.** The
  comparator's entire ordering is: does it meet the requirement, then what does it cost. There
  is no third thing.
- **A product that misses the energy target can no longer win on price.** Missing the target
  puts it in a lower tier, and a lower tier never beats a higher one however cheap it is.
  Verified with a fixture where the missing product is $500 cheaper and still loses.
- **An irrelevant third option can no longer flip the winner.** The old model normalised price
  across the whole candidate set, which is what made this happen. The new comparator takes
  exactly two candidates and no set at all (`worker/lib/estimator/ladder.ts:215`). It is a
  property of the function's shape, not of a test.
- **A product's "certified" versus "estimated" data status can no longer change what gets
  recommended** — the field the old model docked 0.085 for is not visible to the comparator.
  Whether the data is certified still changes how the line is *labelled*, which is right.

Ten unsourced constants were deleted, not retuned. One tuned number replaces them: the 5%
tolerance, stamped onto every selection run so a past decision stays reproducible.

---

## 2. The criteria walk, grouped

All 58 walked. I judged the evidence rather than accepting the tester's PASS.

| Group | Criteria | Evidence | My judgement |
|---|---|---|---|
| **The selection rule** | AC-1 – AC-6 | `recommendation-ladder.test.mjs` (24 tests); tolerance stamped on the run verified in `recommendation-contract.test.mjs:230` | **Discharged.** AC-4 is proven twice over — a source scan for the ten dead symbols *and* a scan proving no fractional constant exists anywhere in the selection path. Stronger than I specified |
| **Hard vs soft constraints** | AC-7 – AC-12 | `estimator-rules.test.mjs`; AC-8 at `composite-select.test.mjs:543` and `estimator-split.test.mjs:982` | **Discharged.** AC-8 was tested somewhere other than where my spec's plan named it; the architect verified the relocation is sound and the criterion is genuinely covered in both places |
| **Energy normalisation** | AC-13 – AC-16 | `recommendation-ladder.test.mjs`, `thermal-selection.test.mjs` | **Discharged.** The two figures that were being compared on different scales (Uw and SHGC) now produce equal numbers for equal misses |
| **Splits** | AC-17 – AC-20 | `estimator-split.test.mjs`, `composite-select.test.mjs` | **Discharged**, and this is where the one customer-visible behaviour change lives — see §5 |
| **The output contract** | AC-21 – AC-26 | `recommendation-contract.test.mjs`; runtime half in `api.test.mjs:1109` | **Discharged, and better than asked.** AC-21 is tested with a hostile fixture: a fake client name and street address are pushed through the estimator and every string in the output is checked for them. The migration's safety is proven at runtime — the foreign key is re-read after the change and a real row round-trips with `PRAGMA foreign_key_check` clean |
| **The learned layer** | AC-27 – AC-35 | `estimator-learning.test.mjs` | **Discharged.** AC-32 (the layer must not move the pick) is tested by running the same decision with and without the model and comparing — the honest way |
| | AC-36 | Partial — see §7 | **Not discharged. Disclosed, and conditional** |
| **The anonymous estimate** | AC-37 – AC-42 | `schedule.test.mjs:300` onward | **Discharged.** Including the case I was most worried about: a product whose rate card computes $0 sitting beside four that price properly. It does not win |
| **The defect-killers** | AC-43 – AC-52 | `recommendation-ladder.test.mjs`; several hold by construction | **Discharged.** The strongest results in the release |
| **Security / abuse** | AC-53 – AC-58 | `api.test.mjs:1217` — executed against a running server | **Discharged.** Real forbidden requests, real 403s recorded |

### Where I judge the evidence weaker than a flat PASS suggests

Three places. None changes the verdict; you should know about them anyway.

1. **AC-36 — two thirds unexecuted.** Detailed in §7. This is the honest one and it was
   disclosed to me rather than buried.
2. **AC-24's "pre-existing rows still point where they did".** The test creates a row and proves
   the link survives, rather than proving it across rows that existed before the change — on a
   fresh test database there are none to check. This is as strong as it can be made before the
   production apply, and the production apply is Condition 1 anyway.
3. **AC-41 (the anonymous path must not fan out into hundreds of price lookups).** The test
   harness counts the calls (`schedule.test.mjs:286`), so the mechanism to prove it exists. This
   is a performance guard, not a correctness one; if it were wrong the symptom would be a slow
   parse, not a wrong quote.

---

## 3. Silent descoping — none found

I specifically hunted for work that was quietly dropped. Four things looked like candidates and
none of them is:

- **Two test files were deliberately left untouched** (`estimator-derive.test.mjs`,
  `composite.test.mjs`). The developer said so at the time rather than at the end, and the
  architect checked the claim by searching both files for every deleted symbol — zero hits. They
  genuinely did not need changing.
- **Some criteria moved between test files.** Disclosed and verified; no named criterion ended
  up with no test.
- **`selectForComposite` has no production caller** and was kept. Deliberate, now documented in
  the file as test-harness-only. You already know about this one.
- **There is no end-to-end estimator run against a real database.** This predates the work (the
  local Worker cannot boot the catalogue) and has been surfaced to you separately. It is not a
  gap this feature created and not one it was asked to close.

## 4. Scope creep — none material

No UI was built, which is what I specified and what the ops2 effort depends on. No accuracy
harness, no promotion/suppression flags, no orientation rule, no frame-system preference — all
four correctly stayed out.

One small widening: a product with no published glass is now reported as an incomplete catalogue
record even when the job has no energy requirement (previously it was only checked when one
existed). Glass is mandatory on every window we sell, so a product without it is unsellable
regardless. The architect adjudicated it sound. I agree — it sends someone to fix the catalogue
record, which is what you want.

---

## 5. The two entries that need a real decision from you

### AD23 — an oversize opening that no single frame system can cover is no longer auto-built

**What changed.** When an opening is too wide for one unit, we split it. If no single frame
platform can supply every piece, the old system built the composite anyway out of two different
platforms and attached a warning that they might not couple at the joint. It now refuses to
build that composite at all: the opening stays one line, priced indicatively, flagged for a
human to resolve.

**Why it changed.** You decided (D3) that every unit of one composite must come from one frame
system, and that a candidate failing a hard constraint "is not a candidate". A mixed-platform
fallback would let in through the back door exactly what the front door refuses. The architect
adjudicated this as compelled by your own decision, not chosen by the developer.

**What you are being asked to confirm:** that refusing to auto-build a two-platform composite is
what you want, given it means a customer sees one indicative line and a review flag where they
used to see a priced composite. My recommendation is **confirm it**. Quoting a composite whose
frames may not physically couple is a promise the factory has to keep, and a warning attached to
an auto-built line is weaker protection than not building it. But this is a commercial judgement
about what a customer sees, so it is yours.

### AD35 — two enumeration caps kept in the selection path

**What it is.** Two numbers survive in the code that decides which split make-ups get considered:
at most 12 frame systems tried, at most 3 glass options trialled per unit. My Definition of Done
said the 5% tolerance would be "the only tuned constant in the selection path", and strictly
these sit in it.

**The argument for keeping them.** A weight says *this candidate is better than that one* — that
is the judgement this whole redesign moved into one comparator. A cap says *this much searching
is enough*, and then the comparator judges everything found, equally. The orchestrator ruled they
stay; the architect concurred. A test now enforces the distinction mechanically: every constant
in the selection path must be a whole number, because a preference weight is always a fraction
(0.35, 0.20) and a work bound is always a count. A re-tuned `0.15` cannot creep back under a new
name.

**One thing that makes this less academic than it sounds.** The systems cap was originally 4, and
at 4 it was silently excluding AMJ80 — the largest platform in the catalogue — from ever being
considered for an all-fixed composite, because of an alphabetical tiebreak. That was found and
fixed during this work (the cap is now 12, above the six systems we have). So these caps *have*
been capable of changing which product could win. They are not now, but the incident is why the
test insists the cap stays above the catalogue's system count.

**What you are being asked to choose between:**
- **(a) Keep them as work bounds** — the ruling as it stands. Recommended.
- **(b) Amend the spec** with one line exempting bounds-on-work from the "only tuned constant"
  rule, which makes the documentation honest instead of relying on a distinction a reader has to
  infer.

My recommendation is **both**: keep them, and take the one-line amendment, because §11 of the
spec currently says something slightly untrue and that is how unsourced constants got into this
system in the first place.

---

## 6. Everything you are being asked to confirm or veto

Two registers. Neither has been signed off, and signing them off is what the pipeline was
running towards while you were away.

**My register — spec §9, A1–A17.** The calls I made when writing the spec. The ones with real
consequences: energy misses measured by the worst axis rather than the sum (A1); a product with
no thermal figures is treated as unknown rather than assumed to pass (A2); a stated "double
glazed" instruction is a hard requirement (A3); a too-large opening still gets an indicative
price rather than "we sell nothing that shape" (A4); a $0 price is treated as broken data rather
than a bargain (A6); the machine-learning choices you asked to be guided on (A8–A10); and the
sign convention for price differences (A17).

**A18 — new, added by this acceptance.** The two enumeration caps of §5 above. The developer
tagged them in the code (`worker/lib/estimator/compositeSelect.ts:124`) but they never reached
the spec's register, which meant a reader checking only §9 would have missed them. That gap is
closed here.

> **A18** — `MAX_SYSTEMS = 12` and `MAX_GLASS_TRIALS = 3` are retained in the selection path as
> bounds on enumeration work rather than deleted as tuned constants. They bound which make-ups
> are *considered*; they never express that one candidate beats another. Enforced structurally by
> a whole-number test on every selection-path constant. Alternative: a one-line spec amendment
> exempting work bounds from the §11 "only tuned constant" wording.

**The architect and developer's register — design §16 and §16.1, AD1–AD35.** AD17–AD35 were
added after implementation to capture calls the developer made while building, which had been
disclosed in phase reports but never collected in one place. That collection happening at all is
the pipeline working: it is the difference between a disclosed decision and a buried one. Seven
of them carry a second opinion from the architect's review; the rest carry only the developer's
reasoning, which is worth knowing when you read them.

**Outstanding mechanical follow-up:** A18's row needs adding to `docs/specs/recommendation-model.md`
§9, and §11's "only tuned constant in the selection path" wording amending if you choose option
(b). Both are one-line edits to a document — no pipeline run needed. I have recorded A18 in full
here so nothing depends on that edit happening before you read this.

---

## 7. Condition 1 in full — what must happen when you deploy

Migrations 0055 and 0056 are applied locally only. 0056 deletes the nine stale learning rows
(your D18 decision: they were worthless, every one alone in its own bucket, and the model never
returned anything but a neutral answer because of it).

**Why it is not proven yet.** The local database had no rows matching the deletion's filter, so
the statement ran against nothing. Its correctness currently rests on two static checks rather
than an observed run:

- the deletion targets `recommendation_outcome` and only that table, with the exact filter
  `recommendation_eligible = 1 AND quality_state = 'approved'` — asserted by a test that parses
  the migration file, so a future broadening would fail the build;
- nothing anywhere in the schema references that table, so the deletion cannot cascade into
  another one — the search was re-run independently by the architect and by me, and is also a
  test.

The third part of AC-36 *is* proven: after migrating, no row exists without a provenance value.

**What discharges it at deploy time**, following the migration-safety protocol:

1. Export `recommendation_outcome` before applying anything.
2. Count the rows the filter will hit **before** applying — expect exactly **9**. If it is not 9,
   stop and ask, because the filter is not selecting what we think it is.
3. Apply, then confirm the count is 0 and that no other table changed.

The residual risk if something is wrong is nine rows of a corpus you have already decided is
worthless, exported beforehand. This is why it is a condition and not a rejection.

---

### DISCHARGED — applied to production 2026-08-20

Condition 1 is satisfied. AC-36 is now proven on real data rather than by static check, and
all three of its Thens hold.

| Step | Result |
|---|---|
| Export before applying | `backup-2026-08-20-pre-0055-0056.sql`, 19.8 MB, full database |
| Before-count of the filter | **9** — exactly the predicted number, so the gate passed and the filter selects what we thought |
| `wrangler d1 migrations apply --remote` | 0055 ✅, 0056 ✅ |
| After-count of the filter | **0** |
| `recommendation_outcome` total | 18 → **9** (exactly −9) |
| Surviving rows | the 9 `pending`/`rejected` audit records, untouched, all `provenance='in_platform'` |
| `provenance IS NULL` | **0** — AC-36's third Then, now on production data |
| Every other table | zero delta: project 22, quote_line 287, ai_proposal_line 96, order_line 20, payment 4, candidate_result 4049, selection_run 96, draft_order_line 567 — all identical before and after |
| `PRAGMA foreign_key_check` | empty |
| New columns present | `retrieval_key`, `retrieval_key_version`, `provenance` on `recommendation_outcome`; `outcome_json` on `candidate_result`; `selection_json` on `selection_run` |

**No worker deploy accompanied this**, and none is needed: the columns are additive with
defaults, and the deployed worker's `buildHistoricalModel` reads a corpus that now returns zero
rows — which produces the neutral 0.5 it was already returning, because 9 rows across 11
distinct keys never cleared the density floor. Production behaviour is unchanged.

---

## 8. What this unblocks

The ops2 "Derivation" surface (region R3) can now be built. It needed "losing candidates ranked
with reasons", which the old scoring model could not produce — *"score 0.719, compliance 0.80"*
is not a reason. Every candidate now carries what it was judged against, whether it met it, by
how much it missed, what it costs relative to the pick, and why it was excluded if it was. That
contract is agreed, tested, and stored, so R3 can be built against something stable instead of
against numbers that were being deleted underneath it.

---

## 9. Recommendation

**Accept**, subject to the two conditions. Specifically:

1. Confirm or veto **AD23** (no auto-built mixed-platform composites) — the one change a customer
   would notice.
2. Choose on **AD35 / A18** (keep the enumeration caps; optionally take the one-line spec
   amendment). My recommendation: keep them and take the amendment.
3. Read through the two assumption registers and veto anything you disagree with. Everything in
   them is reversible now and expensive to reverse later.
4. When you deploy, follow §7's three steps for the learning-corpus reset.

The engineering is sound and unusually well evidenced — the negative criteria hold by
construction rather than by test, which is the difference between a defect that is fixed and a
defect that cannot recur.

---

## 10. The owner's decisions — walked one by one, 2026-08-20

The owner returned and walked all 52 register entries individually rather than accepting them
as a block. This section is the authoritative record of that walk; where an entry below differs
from its register row, **this section wins** and the register rows have been struck through and
marked reversed.

### Confirmed as built — 43 entries

A1–A4, A6, A7, A9–A17, AD1–AD9, AD11–AD17, AD19–AD22, AD25–AD29, AD31–AD34.

Including every entry with a genuine alternative: unknown-thermal ranking below a measurable
miss (A2), the schedule glazing instruction staying a hard constraint (A3), certified-vs-estimated
excluded from ordering entirely (A7), backfilled slugs shape-checked rather than looked up
(AD28), and backfilled rows counting equally with in-platform ones (AD32).

### Changed by the owner — 6 entries

| Entry | Decision |
|---|---|
| **A5** | **Reworded, not reversed.** The register implied the machine partially expresses the 105% asymmetry ("honoured as no downward buffer"). The owner: *"it's a business target for the platform, not pricing method."* 105% is a platform accuracy KPI measured over time; nothing in selection should express it. No code change. |
| **A8** | **Retrieval key changed:** `requirementBasis` → `orientation`. Key version `rk-v1` → `rk-v2`. Owner's reasoning: orientation decides whether Uw or SHGC dominates, and that competition is the specific preference the layer exists to learn; requirement basis is provenance, not physics. Near density-neutral, because orientation arrives from the energy report or the architectural schedule and so correlates with basis anyway. **Free at this moment only** — migration 0056 had emptied the corpus hours earlier, so no recompute and no mixed-version corpus. |
| **A18 / AD35** | **Split.** `MAX_SYSTEMS = 12` stays (six systems in the catalogue, test-guarded above that count, cannot bind). `MAX_GLASS_TRIALS = 3` **removed** — it bound on composites of four-plus units with four-plus distinct glazing options, and when it bound it dropped a candidate *unified* make-up that could have been cheaper. That is a preference effect, not a work bound. §11 amended to distinguish the two categories. |
| **AD18** | **Reversed.** Within a tier, thermal deviation is now compared **before** priceability, restoring design §4.2's numbered order over the prose the developer had followed. So an unpriceable candidate that is the closest thermal match appears at the *top* of the reviewer's list — "this is the best answer but we cannot price it at this size" is more useful first than last. Selection is unaffected: it is guarded by the `competing` flag, not by sort position. |
| **AD24** | **Reversed.** A split whose geometry does not cover the opening is now **excluded**, not shown in the bottom tier. Owner: *"ops can build their own splits, so suggesting ones that do not physically make it — don't see it helpful."* Deliberately NOT unified with AD20, which is a different code path where make-ups are the only candidates. |
| **AD30** | **Changed.** A tie in the learned layer now prefers the **cheaper** of the equally-chosen products, then a **stable deterministic tiebreak**. The owner's first instinct was a coin flip; the objection raised and accepted was that a random tiebreak lets the layer name different products for identical evidence on two reads, so a quote issued today could not be explained the same way tomorrow. |

### Confirmed after investigation — AD23

The owner initially challenged the framing, and was right to. "Cross-system make-up" was the
orchestrator's phrasing and it was wrong: the `frameSystem` compatibility matrix **is** used and
working. A make-up may span platforms whenever either names the other in `compatibleWith`, and
untagged products are treated permissively. The refusal fires only when `coveringSystems` comes
back empty — no system, even reaching through its declared partners, covers every unit. Per the
owner's own D13 in `docs/product-compatibility-design.md`, that is mainly AMJ125T, which was
deliberately given no matrix edge.

So the question was narrower than first put: *when the matrix is silent, build the joint anyway
and warn, or decline and hand it to a person?* Owner: **decline and flag.** An unauthored pair
means the manufacturer has not said those depths can be joined. If a pair should couple, that is
a `compatibleWith` edge to author in Sanity — content, not code — and composites for it resume
building automatically with no change to this branch.

### Two safety clearances the orchestrator got wrong

Recorded because the pattern matters more than either bug. Both owner-requested changes were
cleared as safe by the orchestrator and both were unsafe; the developer caught each before it
landed:

1. **AD18** — selection was verified to be guarded by the `competing` flag, which was true. But
   sort position had a *second* reader: `proposalSeed` took rank 1 and returned null if it was
   not priceable. After the reorder rank 1 can be unpriceable, so a split-winning opening whose
   closest thermal match had no price would have silently lost its proposal line.
2. **AD24** — the last-resort single was said to survive and keep a line from emptying. It would
   not have: the promotion was retired by splits *existing*, not by splits *fitting*. An opening
   too **tall** for every product is the reachable case, since splitting partitions width — every
   unit keeps the full height, so every make-up misses. Fixed by retiring the promotion on a
   split that fits.

### Follow-ups raised during the walk, out of scope for this branch

- **Glass identity falls back to the frame-specific `variantId`** when a variant has no
  `glazingOptionSlug` (`compositeRank.ts:121`, `select.ts:173`), so two unlinked products in one
  composite can never be found to share a glass. The M6 legacy-variant gap reaching a path nobody
  was watching.
- **The `certified` field.** Owner: *"rogue-ly introduced by AI, it has no value — the Uw value is
  authoritative."* Removed from all ordering by this work, but it still drives a validation that
  can drop a product from sale (`catalogue.ts:187`) and the `commercial_only_estimate` downgrade
  (`rules.ts:329`). Needs scoping against the live data before removal — a WERS import exists and
  may be where the field originated.
- **The plan parser should return split ratios**, superseding the family defaults. The seam already
  exists: `proposeSplit` checks a document hint before the family rule, and `pairing.ts:116`
  anticipates it in a comment.
- **The owner will validate the computed thermal model** once this feature work completes. Noted
  because the AC-29 fix is a precondition: before it, a platform-computed band read as "no thermal
  requirement", so every computed-band opening would have been mislabelled during that exercise.
