# 08 — Acceptance: price deltas on the "Why this product?" ladder

**Verdict: ACCEPTED**, subject to two pre-merge fixes that are not criterion
failures (one accessibility finding, one stale pipeline test), and to the owner's
sign-off on three `ASSUMED:` items.

This supersedes the earlier conditional acceptance in this file. The condition it
raised — two of the four mandatory reviewers had produced no report — is now
**closed**: all four review reports are present in the run directory and
`run.json` records every review stage at exit 0.

Judged from the tester's evidence and the four review reports only. No tests were
re-run and no source was read for this verdict.

---

## 1. Criterion-by-criterion

All 20 criteria of `01-spec.md`. Evidence as named in `06-verify.md`.

| # | Criterion (short) | Met | Evidence |
|---|---|---|---|
| 1 | Priced pick + runner-up → each row shows a delta | Yes | Playwright `WHY-AC-D1` (`scripts/tests/web/ops2-line-why.spec.ts:908`) reads a delta off each row; abuse probe 13 confirms the wire values arrive unmodified |
| 2 | Positive delta reads `+$100` | Yes | `WHY-AC-D1` asserts literal `+$65`; unit `deltaText(100,false) === "+$100"` (`scripts/tests/ops2-why.test.mjs`) |
| 3 | Negative delta reads `-$200` | Yes | `WHY-AC-D1` asserts literal `-$30`; unit `deltaText(-200,false) === "-$200"` |
| 4 | Chosen row carries no delta figure | Yes | `WHY-AC-D1` asserts the chosen row contains no `$`; mutation M1 (`if (chosen) return null` → `&& false`) turns the suite red, so the guard is defended |
| 5 | `null` delta shows `$---`, row still visible | Yes | `WHY-AC-D1` asserts literal `$---` on a visible row; mutation M2 (`"$---"` → `"$0"`) turns it red |
| 6 | Legacy record with no price object → all `$---`, panel otherwise intact | Yes | Abuse-harness probe: outcomes with no `price` key return `[null,null,null]` while `figures {uValue 3.72, shgc 0.41}` and the tolerance band still render; no error, no empty panel |
| 7 | No GST/tax/inc/ex wording, no basis switch, no second figure | Yes | Banned-vocabulary table with scanner self-tests (`scripts/tests/ops2-why.test.mjs:38–92`, ≥15 terms, proven to fire and not false-positive on `+$100`) plus `WHY-AC-D1` regex over the whole rendered detail |
| 8 | No date stamp or staleness hedge | Yes | `WHY-AC-D1` asserts no date and no staleness wording on the row |
| 9 | Ladder membership unchanged | Yes | The runner-up filter/sort/slice in `worker/lib/estimator/rationale.ts` is untouched (8-line diff, all inside `candidateOf`); `WHY-AC-12/13/14/15/16` still assert exactly five rows |
| 10 | Thermal figures, verdicts, rank, 5% band unchanged | Yes | `npm run test:why` 81/81 green; band named verbatim; legacy probe shows the figures surviving beside a null delta |
| 11 | `candidateOf` adds price fields explicitly, never spreads | Yes | Field-by-field mapping at `rationale.ts:61–77`; the suite feeds an outcome carrying `exclusions` and a `learned` payload and asserts neither key survives |
| 12 | Money-contract comment states the true basis | Yes | Comment now names the tax-inclusive rate-card figure; the tester independently confirmed `computePrice` performs no `gst_mode` arithmetic and `migrations/0015_estimator_pricing.sql:38,59` defaults the policy to `'inc'` |
| 13 | Rendered figure equals the stored delta, no gross-up | Yes | Stored `[0,100,-200,null]` arrives unchanged on the wire; `+$65`/`-$30` render from seeded `65`/`-30`; mutation M3 (`deltaToSelected: null`) turns `WHY-AC-14/15/16` and `X-AC-5` red |
| 14 | Manufacturer partner refused 403, no data in body | Yes — executed for real | `GET /api/ops/me` as `u_mfrp` returns 200 first (proving a genuine authenticated manufacturer session); the rationale endpoint then returns 403 with no candidate name, no `uValue`, no delta |
| 15 | Unauthenticated request refused, no data | Yes — executed | 403, body empty of candidate and price data |
| 16 | Foreign line id → 404, no data | Yes — executed | Eight tampered-id variants (foreign line, foreign project, swapped pairs, malformed, SQL-ish) all 404 `{"error":"not_found"}`; four write methods also 404; stored deltas unchanged afterwards |
| 17 | Nothing on any customer-facing surface | Yes — executed | `deltaToSelected` has no consumer outside `src/ops2/`; `scripts/tests/api.test.mjs:1443–1470` (AC-55) scans the projects, auth, project and quote payloads, green; live customer account gets 403 on her own project's rationale endpoint and on another org's |
| 18 | No manufacturer price/cost/uplift in logs | Yes, with a stated limit | 1,047,881-byte `wrangler.log` scanned on the rationale path: 0 matches; zero `console.*` calls on that path. Limit recorded by the tester: only 617 bytes of worker stdout in the probe window — strong evidence against deliberate logging, not proof about a production-volume log |
| 19 | Name, verdict and delta read at a glance, no truncation/overlap | Yes — coverage added at verify | Had **no breakpoint coverage before verification**. `WHY-AC-D2` (`ops2-line-why.spec.ts:1348`) at 375/768/1280: five rows, name and delta visible, `scrollWidth - clientWidth <= 1`, no ink overlap. 3 passed; full spec 39 passed. No implementation defect found |
| 20 | Back remains the only interactive element | Yes | The delta is a plain `<span>` — no handler, no `tabindex`, no `role` (`WhyDetail.tsx:112`); `WHY-AC-39/40` and `WHY-AC-20` green; the write-method probes confirm the surface accepts nothing |

**20 of 20 met.**

## 2. Review stage — now complete

| Reviewer | Report | Result |
|---|---|---|
| Codex architecture/conformance | `07-review-architecture.md` | Core flow sound. Two P2 (contract seam carries `deltaToSelected` on rows that never render it; delta presentation state derived three times, `"$---"` re-parsed in the component) and one P3 (stylesheet ownership crosses the chrome/feature seam). No higher severity |
| `/security-review` | `07-review-security.md` | **No security findings above the ~80% confidence bar.** Endpoint still gated by `resolveStaff` + `hasAssignedRole`; project-scoped read; DTO consumed only by `worker/routes/ops.ts` and `src/ops2/**`; no XSS sink; allow-list not widened |
| `ponytail-review` | `07-review-ponytail.md` | Over-engineering only: 7 small cuts, net −15 lines. Dead CSS selector, a class with no rule, two duplicated formatters, a redundant guard in `fullDocumentAgent.ts` (not this feature's code), and the `conduct.mjs` criterion-contiguity scan |
| Codex over the feature diff | `07-review-codex.md` | One **P1**, and it is not product code — see §5 |

Two housekeeping notes on the reports themselves: the security and ponytail
reports carry a preamble saying plan mode blocked the write; the content is now
at the correct paths, so the stage is complete. There is no report file
distinctly attributable to the conformance reviewer separate from
`07-review-architecture.md`; `run.json` records `review-conformance` exit 0.

## 3. Descoping check

Nothing descoped. One weakness recorded rather than punished: criterion 19 (the
readability half of D5) shipped out of build and polish with **no test at all** —
it is covered only because the tester wrote `WHY-AC-D2` during verification. That
is the repeat failure this pipeline has been warned about (a design-named
behaviour with no test artifact). Covered now; the process note stands.

## 4. Scope creep

1. **`scripts/pipeline/conduct.mjs` is in the feature diff.** Pipeline tooling,
   not this feature — and it is where the Codex P1 lives (§5). Unrelated work
   riding a product branch.
2. **The polish stage replaced the detail's local `Block` component with the
   shared `OpenablePanel` + `RowList` chrome**, touching `src/ops2/chrome/` and
   three stylesheets — a shared surface with other callers. Defensible as the D5
   readability redesign (grill: "a small redesign of that panel for better
   readability" is in scope), tests green, but materially bigger than "put a
   number on the ladder row"; the architecture reviewer's P3 is a direct
   consequence. Recorded, not rejected.
3. `worker/lib/ai/versions.ts` and `worker/lib/drawing/fullDocumentAgent.ts` are
   **not** this feature — the tester confirmed they entered the branch via the
   merge from `main` (`b00f66b5`), not via any of the three build tasks.

No out-of-scope *business* behaviour appeared: no live re-pricing, no GST mode,
no second figure, no excluded or withheld candidates, no customer-facing
exposure.

## 5. Carried out of this run

**C1 — Codex P1: a stale pipeline test (not product code, but a red suite).**
`conduct.mjs:168` now supplies a 600000 stage cap while
`scripts/tests/pipeline.test.mjs:1786` still asserts literal `120000`, which
Codex reports as a deterministic break of `test:pipeline` and `test:pure`. The
tester did not run those suites (they are outside the feature's areas), and Codex
could not execute anything — its sandbox was denied temp-directory creation
(`EPERM mkdtemp`), so this is a static read, unconfirmed by a run. It does not
touch the estimator's screen, but the repo's own suite must not merge red.
Route as `conduct fix`, or revert the `conduct.mjs` change off this branch.

**C2 — F1, medium, accessibility.** An unpriced row is spoken as "no price
difference was recorded", a genuine tie as "the same price as the chosen
product". Sighted users get the `$---` vs `$0` distinction criterion 5 exists to
protect; screen-reader users do not. It does not fail criterion 5 as written (the
criterion is about the rendered cell) but it defeats its purpose for one class of
user. Two reviewers raised it. **Recommend fixing before this surface ships.**

**C3 — F2, low.** Sub-dollar deltas render `$0` and half-rounding is asymmetric
across zero (`0.5 → +$1`, `-0.5 → $0`). A genuinely different price reading as
"the same price" is a small lie on a surface whose only job is explaining a price
difference. Owner call (Decision 2).

**C4 — F3, low, documentation.** `04-build.md` describes CSS that is not in the
tree and omits the polish stage entirely. The code is right, the record is wrong.

**C5 — F4 cosmetic** (`typeof … === "number"` admits `NaN`/`Infinity`,
unreachable via JSON) and the ponytail cuts (net −15 lines) — debt file.

**C6 — housekeeping.** The abuse harness `scripts/probe-why-abuse.mjs` is
**untracked**. The evidence for criteria 14–18 is only reproducible while that
file survives on this machine. Commit it.

## 6. `ASSUMED:` tags — none vetoed, all shipped as assumed

| Assumption | How it shipped |
|---|---|
| Chosen row shows no delta figure rather than `$0` | Shipped that way (criterion 4, mutation-tested) |
| Deltas render as whole dollars, not cents | Shipped that way — F2/C3 lives here |
| Delta on the ladder only; `WhyPanel` summary card untouched | Shipped that way (`03-ux.md` §10 keeps the card at three lines) |

No grill ruling or `DECISIONS.md` answer closed any of the three. All remain
vetoable by the owner.

## 7. Verdict

**ACCEPTED** on business outcome. The estimator can now read, on the ladder, why
a runner-up lost: one number beside each product, signed, no tax wording, no
staleness caption, nothing to click. Ladder membership, thermal wording and the
5% band are unchanged, the money is never shown to a customer or a manufacturer,
and the forbidden requests were attempted for real and refused.

Not returning to the developer loop on any spec criterion. C1 and C2 go back as
`conduct fix` before merge; C3–C6 are owner calls or debt. Final sign-off is the
owner's.
