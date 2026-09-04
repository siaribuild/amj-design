# 08 — Acceptance: price deltas on the "Why this product?" ladder

**Verdict: ACCEPTED, conditional.** All 20 acceptance criteria in `01-spec.md`
are met with named evidence in `06-verify.md`. Nothing was silently descoped.
Two conditions below must close before this reaches production — one is a
pipeline gap (two of the four reviewers produced no report), one is an owner
sign-off on three `ASSUMED:` items.

Judged from the tester's evidence only. No tests were re-run and no source was
read for this verdict.

---

## 1. Criterion-by-criterion

| # | Criterion (short) | Met | Evidence named by the tester |
|---|---|---|---|
| 1 | Priced pick + runner-up → each row shows a delta | Yes | Playwright `WHY-AC-D1` (`scripts/tests/web/ops2-line-why.spec.ts:908`) reads a delta off each row; abuse probe 13 confirms wire values unmodified |
| 2 | Positive delta reads `+$100` | Yes | `WHY-AC-D1` asserts literal `+$65`; unit `deltaText(100,false) === "+$100"` |
| 3 | Negative delta reads `-$200` | Yes | `WHY-AC-D1` asserts literal `-$30`; unit `deltaText(-200,false) === "-$200"` |
| 4 | Chosen row carries no delta figure | Yes | `WHY-AC-D1` asserts chosen row contains no `$`; mutation M1 proves the guard is defended |
| 5 | `null` delta shows `$---`, row still visible | Yes | `WHY-AC-D1` asserts literal `$---` on a visible row; mutation M2 |
| 6 | Legacy record with no price object → all `$---`, panel otherwise intact | Yes | Abuse-harness probe: outcomes without `price` return three `null` deltas while thermal figures and the tolerance band still render; no error |
| 7 | No GST/tax/inc/ex wording, no basis switch, no second figure | Yes | Banned-vocabulary table with scanner self-tests (`scripts/tests/ops2-why.test.mjs:38–92`) plus end-to-end regex assertion over the whole detail text |
| 8 | No date stamp or staleness hedge | Yes | `WHY-AC-D1` asserts no date and no staleness wording on the row |
| 9 | Ladder membership unchanged | Yes | Runner-up filter/sort/slice untouched by the diff (8-line change, all inside `candidateOf`); `WHY-AC-12/13/14/15/16` still assert exactly five rows |
| 10 | Thermal figures, verdicts, rank, 5% band unchanged | Yes | `npm run test:why` 81/81; band named verbatim; legacy probe shows figures surviving alongside a null delta |
| 11 | `candidateOf` adds price fields explicitly, never spreads | Yes | Field-by-field mapping; suite feeds an outcome carrying `exclusions` and `learned` and asserts neither key survives |
| 12 | Money-contract comment states the true basis | Yes | Comment now names the tax-inclusive rate-card figure; tester independently confirmed `computePrice` performs no `gst_mode` arithmetic and migration `0015` defaults to `'inc'` |
| 13 | Rendered figure equals the stored delta, no gross-up | Yes | Stored `[0,100,-200,null]` arrives unchanged on the wire; `+$65`/`-$30` render from seeded `65`/`-30`; mutation M3 |
| 14 | Manufacturer partner refused 403, no data in body | Yes — executed for real | `GET /api/ops/me` as `u_mfrp` returns 200 (proving a genuine authenticated manufacturer session), rationale endpoint then 403 with no candidate name, no `uValue`, no delta |
| 15 | Unauthenticated request refused, no data | Yes — executed | 403, body empty of candidate and price data |
| 16 | Foreign line id → 404, no data | Yes — executed | Eight tampered-id variants all 404 `{"error":"not_found"}`; four write methods also 404; stored deltas unchanged afterwards |
| 17 | Nothing on any customer-facing surface | Yes — executed | `deltaToSelected` has no consumer outside `src/ops2/`; `api.test.mjs:1443–1470` (AC-55) scans projects/auth/project/quote payloads, green; live customer account gets 403 on her own project and another org's |
| 18 | No manufacturer price/cost/uplift in logs | Yes, with a stated limit | 1,047,881-byte `wrangler.log` scanned, 0 matches; zero `console.*` on the path. Limit: only 617 bytes of worker stdout in the probe window — strong evidence against deliberate logging, not proof about a production-volume log |
| 19 | Name, verdict and delta read at a glance, no truncation/overlap | Yes — coverage added at verify | Had **no breakpoint coverage before verification**. Tester added `WHY-AC-D2` at 375/768/1280: five rows, name and delta visible, no overflow, no ink overlap. 3 passed. No implementation defect found |
| 20 | Back remains the only interactive element | Yes | Delta is a plain `<span>`, no handler/tabindex/role; `WHY-AC-39/40` and `WHY-AC-20` green; write-method probes confirm the surface accepts nothing |

**20 of 20 met.**

## 2. Descoping check

Nothing descoped. One weakness worth recording rather than punishing:
criterion 19 (the readability half of D5) shipped from build and polish with
**no test at all** — it was covered only because the tester wrote `WHY-AC-D2`
during verification. That is the repeat failure mode this pipeline has already
been warned about (a design-named behaviour with no test artifact). It is
covered now; the process note stands.

## 3. Scope creep

Two items entered the branch that this spec did not ask for:

1. **`scripts/pipeline/conduct.mjs` is in the feature diff.** Pipeline tooling,
   not this feature. The Codex review then found a defect in it (P2: the spec
   validator's heading regex rejects numbered headings such as `## 3. Out of
   scope`, emitting a false "missing section" warning). Harmless to the
   product, but it is unrelated work riding a product branch.
2. **The polish stage replaced the detail's local `Block` component with the
   shared `OpenablePanel` + `RowList` chrome**, touching `src/ops2/chrome/` and
   three stylesheets — a shared surface with eight other callers. Defensible as
   the D5 readability redesign, and the tests are green, but it is materially
   bigger than "put a number on the ladder row" and the architecture reviewer's
   P3 (SidePanel behaviour split between the chrome module and
   `projects.css`) is a direct consequence. Recorded, not rejected.

No out-of-scope *business* behaviour appeared: no live re-pricing, no GST mode,
no second figure, no excluded/withheld candidates, no customer-facing exposure.

## 4. `ASSUMED:` tags — none vetoed, all still open

The spec carries three, and no `DECISIONS.md` answer or grill ruling closed any
of them. All three shipped as assumed:

| Assumption | How it shipped |
|---|---|
| Chosen row shows no delta figure rather than `$0` | Shipped that way (criterion 4, mutation-tested) |
| Deltas render as whole dollars, not cents | Shipped that way — and this is where verification finding F2 lives |
| Delta on the ladder only; `WhyPanel` summary card untouched | Shipped that way (`03-ux.md` §10 keeps the card at three lines) |

These are vetoable by the owner and are the first two Decisions below.

## 5. Findings carried out of this run (none block acceptance)

- **F1 / Codex P2 — Medium, accessibility.** An unpriced row is spoken as "no
  price difference was recorded", a genuine tie as "the same price as the chosen
  product". Sighted users get the `$---` versus `$0` distinction that criterion 5
  exists to protect; screen-reader users do not. It does not fail criterion 5 as
  written — the criterion is about the rendered cell — but it defeats its
  purpose for one class of user. **Recommend fixing before this surface ships.**
  Two independent reviewers raised it.
- **F2 — Low.** Sub-dollar deltas render `$0` and half-rounding is asymmetric
  across zero (`0.5 → +$1`, `-0.5 → $0`). A genuinely different price reading
  as "the same price" is a small lie on a surface whose only job is explaining a
  price difference. Owner call (Decision 2).
- **F3 — Low, documentation.** `04-build.md` describes CSS that is not in the
  tree and omits the polish stage entirely. The code is right, the record is
  wrong.
- **F4 — Cosmetic.** The type guard admits `NaN`/`Infinity`; unreachable via
  JSON. `Number.isFinite` closes it.

## 6. Condition on this acceptance — the review stage is incomplete

`run.json` records **`review-ponytail` exit 1** and **`review-security` exit 1**,
and neither wrote a report; the conformance reviewer's own report file is also
absent. What exists on disk is the two Codex outputs
(`07-review-architecture.md`, `07-review-codex.md`). Codex additionally noted it
**could not execute the runtime tests** — sandbox blocked temp-directory
creation — so its pass is a static read, not an exercised one.

So: of the four mandatory reviewers, two produced findings, two failed. This is
a feature with abuse-case criteria over an ops-only surface. The tester executed
criteria 14–18 for real and they held, which is the strongest evidence available
— but tester execution is not the `/security-review` layer, and house rule is
that a stage which cannot run is a blocker to raise, never a silent skip.

**Condition:** re-run `review-security` and `review-ponytail` to completion and
attach their reports before merge/deploy. If either reports nothing above its
bar, that is a clean result and this acceptance stands unchanged.

One housekeeping item in the same area: the abuse harness
`scripts/probe-why-abuse.mjs` is **untracked**. The evidence for criteria 14–18
is only reproducible while that file survives on this machine. Commit it.

## 7. Verdict

**ACCEPTED** on business outcome — the estimator can now see, on the ladder,
why a runner-up lost on price, as one number, with no tax wording, no staleness
caption and no way to click it. Subject to:

- (a) the two failed reviewers being re-run and reporting;
- (b) the owner's answers to the Decisions below, F1 in particular.

Neither is a criterion failure, so this does not return to the developer loop
for the spec — F1 goes back as a `conduct fix`, and the reviewers go back to the
conductor.
