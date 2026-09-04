# 06 — Independent verification: `ops2-why-price-deltas`

**Verdict: PASS**, with one medium finding, two low and one cosmetic. All 20
acceptance criteria in `01-spec.md` are met. Nothing in the findings blocks the
feature; the medium one is an accessibility gap the spec's literal wording does
not cover, and it is worth a developer session before this surface is put in
front of assistive-technology users.

Verified by re-running every gate and every abuse case myself. The developer's
claims in `04-build.md` were treated as unproven until reproduced; two of them
turned out to be wrong in detail (see F3).

---

## Scope actually verified

The base recorded in `run.json` is `9cb41bfd`, but merge `b00f66b5` on this
branch pulled in unrelated work from `main`. The feature-only diff is therefore:

```
git diff --stat b00f66b5..HEAD
```

→ **21 files, 1042 insertions(+), 459 deletions(-)**, covering `src/data/rationale.ts`,
`src/data/recommendation.ts`, `worker/lib/estimator/rationale.ts`,
`src/ops2/projects/WhyDetail.tsx`, `src/ops2/projects/whyCopy.ts`,
`src/ops2/chrome/{OpenablePanel,SidePanel}.tsx`, three ops2 stylesheets, three
test files, the docs and mocks, and `scripts/pipeline/conduct.mjs`.

**`worker/lib/ai/versions.ts` and `worker/lib/drawing/fullDocumentAgent.ts` are
not part of this feature.** They were named in the verification brief as
sensitive surfaces, but they entered the branch through the merge from `main`,
not through any of this run's three build tasks. They were read to confirm that,
and were not otherwise assessed here — they belong to whatever review covered
the work that merge carried.

---

## Gates

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck:gate` | `✓ no fatal type errors (57 non-fatal remain)`, exit 0 |
| Why suite | `npm run test:why` | **81/81 pass** (the build note claims 79; the count moved because the suite itself grew) |
| Ops2 suite | `npm run test:ops2` | **94/94 pass** |
| Playwright | `npx playwright test scripts/tests/web/ops2-line-why.spec.ts --reporter=list` | **39 passed (4.1m)**, exit 0 — 36 pre-existing plus the 3 cases I added |
| Abuse harness | `node scripts/probe-why-abuse.mjs` | **22/22 pass** |

Playwright coverage exists and is real: this is a UI-changing feature, and
`scripts/tests/web/ops2-line-why.spec.ts` exercises the rendered ladder against
a live Worker and local D1 rather than asserting on a component in isolation.

---

## Criterion-by-criterion

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Priced pick + runner-up → every row shows a delta from stored `deltaToSelected` | PASS | `WHY-AC-D1` (`scripts/tests/web/ops2-line-why.spec.ts:908`) renders the seeded ladder and reads a delta off each row. Abuse-harness probe 13 confirms the wire values arrive unmodified. |
| 2 | Positive delta reads `+$100` | PASS | `WHY-AC-D1` asserts the literal `+$65`. Unit level: `deltaText(100,false) === "+$100"` in `scripts/tests/ops2-why.test.mjs`. |
| 3 | Negative delta reads `-$200` | PASS | `WHY-AC-D1` asserts the literal `-$30`; unit case `deltaText(-200,false) === "-$200"`. |
| 4 | The chosen row carries no delta figure at all | PASS | `deltaText`/`deltaLabel` return `null` when `chosen` (`src/ops2/projects/whyCopy.ts:573,583`); `WhyDetail.tsx:59` builds the ladder as `[recommended, ...alternatives]`, so `i === 0` is structurally always the pick. `WHY-AC-D1` asserts the chosen row contains no `$`. Mutation-tested — see M1. |
| 5 | `null` delta shows `$---`, never `$0`, never blank, never a hidden row | PASS | `WHY-AC-D1` asserts the literal `$---` on the unpriced row; the row is present and visible. Mutation-tested — see M2. |
| 6 | Legacy record with no price object → every row `$---`, detail otherwise unchanged | PASS | Abuse-harness probe: a record whose outcomes carry no `price` key returns `deltaToSelected: [null, null, null]` while `figures {uValue: 3.72, shgc: 0.41}` and the tolerance band still render. No error, no empty panel. |
| 7 | No GST/tax/inc/ex wording, no basis switch, no second money figure | PASS | Two independent checks. `scripts/tests/ops2-why.test.mjs:38–92` holds a banned-vocabulary table (≥15 terms) with scanner self-tests proving the scanner actually fires (`banned("inc GST").length >= 1`) and does not false-positive on `+$100`. End-to-end, `WHY-AC-D1` asserts the whole detail text matches none of `/gst|tax|inclusive|exclusive/i`. |
| 8 | No date stamp, "as at selection" caption or staleness hedge | PASS | `WHY-AC-D1` asserts the row text carries no date and no staleness wording. |
| 9 | Ladder membership unchanged — no excluded or withheld candidate appears | PASS | The runner-up filter/sort/slice in `worker/lib/estimator/rationale.ts` is untouched by the diff (`git diff b00f66b5..HEAD -- worker/lib/estimator/rationale.ts` is 8 lines, all inside `candidateOf`). `WHY-AC-12/13/14/15/16` still asserts exactly five rows. |
| 10 | Thermal figures, tier verdicts, rank and the 5% band render as today | PASS | `npm run test:why` 81/81 and `WHY-AC-12/13/14/15/16` both green with the band named verbatim; the legacy-record probe shows the figures surviving alongside a null delta. |
| 11 | `candidateOf` adds price fields explicitly, never spreads | PASS | `worker/lib/estimator/rationale.ts:61–77` is field-by-field with a rationale comment; the single added line is `deltaToSelected: typeof o.price?.deltaToSelected === "number" ? … : null`. The suite feeds an outcome carrying `exclusions` and a `learned` payload and asserts neither key survives. |
| 12 | The money-contract comment states the true basis | PASS | `src/data/recommendation.ts` now reads "the same tax-inclusive rate-card figure `quote_line.line_total` carries. `computePrice` performs no GST arithmetic; ex/inc display is the skin's job". Checked independently rather than taken on trust: `loadPolicy` reads `gst_mode` but `computePrice` never uses it in arithmetic, and `migrations/0015_estimator_pricing.sql:38,59` default the policy to `'inc'`. The new comment is factually true. |
| 13 | Rendered figure equals the stored delta — no gross-up, no re-pricing | PASS | Abuse-harness probe: stored `[0, 100, -200, null]` arrives on the wire as `[0, 100, -200, null]`. `WHY-AC-D1` then renders `+$65`/`-$30` from the seeded `65`/`-30`. Mutation-tested — see M3. |
| 14 | Manufacturer partner is refused (403), body carries no candidate/thermal/price | PASS | Executed for real. `GET /api/ops/me` as `u_mfrp` returns **200** first, proving a genuine authenticated manufacturer session; the rationale endpoint then returns **403** with no candidate name, no `uValue`, no delta in the body. |
| 15 | Unauthenticated request refused, no data in body | PASS | Executed: **403**, empty of candidate and price data. |
| 16 | A line id not belonging to the addressed project returns 404, no data | PASS | Executed across **eight tampered-id variants** (foreign line, foreign project, swapped pairs, malformed ids, SQL-ish payloads) — all **404 `{"error":"not_found"}`**. Four write methods (POST/PUT/PATCH/DELETE) against the same path also return 404, and the stored deltas are unchanged afterwards. |
| 17 | No candidate ladder, price or delta on any customer-facing surface | PASS | Two checks. `deltaToSelected` has no consumer outside `src/ops2/` anywhere in the tree. `scripts/tests/api.test.mjs:1443–1470` (AC-55) already scans `/api/projects`, `/api/auth/me`, the project payload and the quote payload for the token and asserts its absence; green. Executed live as a customer account: **403** on her own project's rationale endpoint and on another org's. |
| 18 | No manufacturer price, cost or uplift value in log output | PASS, with a stated limitation | A 1,047,881-byte `wrangler.log` scanned for cost/uplift/price tokens on the rationale path: **0 matches**; zero `console.*` calls exist on that path. *Limitation:* only 617 bytes of worker stdout were produced during the probe window, so this is strong evidence against deliberate logging, not proof about a high-volume production log. |
| 19 | Name, thermal verdict and delta read at a glance — no truncation, no overlap | PASS (coverage added by me) | **This had no breakpoint coverage before this verification.** Every prior spec case runs at 1280×900 except one at 390×844. I added `WHY-AC-D2` (`scripts/tests/web/ops2-line-why.spec.ts:1348`), which at 375/768/1280 asserts five rows, name and delta both visible, `scrollWidth - clientWidth <= 1` on the delta, the name and the row, and non-overlap of the name's ink extent against the delta rect (both measured in one frame). **3 passed (50.1s)**; the full spec is 39 passed. No implementation defect was found — the row is a two-column grid with the delta at `justify-self: end`, and it holds at all three widths. |
| 20 | Back remains the only interactive element; a delta is never pressable | PASS | The delta renders as a `<span>` with no handler, no `tabindex`, no `role` (`WhyDetail.tsx:112`). `WHY-AC-39/40` ("the detail's only control is back, and no editor route exists") and `WHY-AC-20` ("the whole journey is GETs, and it writes nothing") both green. The write-method probes above confirm the surface accepts nothing. |

### Mutation tests

Three guards were mutated to confirm the suite actually holds them, then reverted
(tree confirmed clean afterwards):

- **M1** — `whyCopy.ts:573`, `if (chosen) return null` → `if (chosen && false)`: fails
  `criteria 2/3/4/5/13 deltaText` at `scripts/tests/ops2-why.test.mjs:531:10` with `'$0' !== null`.
- **M2** — `whyCopy.ts:575`, `return "$---"` → `return "$0"`: fails the same case.
- **M3** — `worker/lib/estimator/rationale.ts:68` → `deltaToSelected: null`: fails
  `WHY-AC-14/15/16` and `X-AC-5`.

Criteria 4, 5 and 13 are genuinely defended, not incidentally green.

---

## Findings

Findings go to the developer. Severities are assigned so the low and cosmetic
ones can be deferred to the run's debt file rather than costing a session.

### F1 — Medium (accessibility): the unpriced case and a genuine tie sound identical

`src/ops2/projects/whyCopy.ts:587`

```ts
if (delta == null) return "no price difference was recorded";
…
if (r === 0) return "the same price as the chosen product";
```

The `aria-label` for an unpriced row ("no price difference was recorded") and for
a genuine tie ("the same price as the chosen product") are near-synonymous when
read aloud. Sighted users get the distinction that criterion 5 exists to protect —
`$---` versus `$0` — and assistive-technology users do not. Criterion 5 as
literally written is about the rendered cell, so this does not fail it; it defeats
its purpose for one class of user.

Reproduce:

```bash
sed -n '572,592p' src/ops2/projects/whyCopy.ts
```

Suggested direction (developer's call): make the null case name the absence —
e.g. "no price was recorded for this product".

### F2 — Low: sub-dollar deltas render `$0`, and half-rounding is asymmetric across zero

`src/ops2/projects/whyCopy.ts:574–577`. `Math.round` is half-up, so:

| stored | rendered |
|---|---|
| `0.4` | `$0` + "the same price as the chosen product" |
| `-0.5` | `$0` |
| `0.5` | `+$1` |
| `100.5` | `+$101` |
| `-100.5` | `-$100` |

The whole-dollar Assumption in §4 authorises display rounding; it does not
authorise the asymmetry, and a genuinely-different price reading as "the same
price" is a small lie on a surface whose whole job is explaining a price
difference. Not a spec failure — no criterion covers sub-dollar deltas.

Reproduce (bundle the module, since it is TS):

```bash
npx esbuild src/ops2/projects/whyCopy.ts --bundle --format=cjs --outfile=/tmp/wc.cjs \
  && node -e "const{deltaText,deltaLabel}=require('/tmp/wc.cjs');for(const d of [0.4,-0.5,0.5,100.5,-100.5])console.log(d,deltaText(d,false),'|',deltaLabel(d,false))"
```

### F3 — Low (documentation): `04-build.md` misdescribes the shipped code

The t3 section describes CSS that does not exist in the tree: `.wd__row-bottom`
and `margin-left: auto` appear nowhere, and the claim that the old `.wd__row-top`
wrapper was dropped does not match the shipped markup. The row is a two-column
CSS grid (`.wd__row { display: grid; grid-template-columns: minmax(0,1fr) auto; }`,
`src/ops2/styles/line.css:656`). The note also omits the polish stage entirely,
which replaced the local `Block` component with the shared `OpenablePanel` +
`RowList` chrome across the whole detail — a larger change than anything t3
describes. The code is correct; the record of it is not, and the next person
reading `04-build.md` to understand this surface will be misled.

Reproduce:

```bash
grep -rn "wd__row-bottom\|margin-left: *auto\|wd__row-top" src/ops2/   # no matches
sed -n '656,672p' src/ops2/styles/line.css
```

### F4 — Cosmetic: the type guard admits `NaN` and `Infinity`

`worker/lib/estimator/rationale.ts:68` uses `typeof o.price?.deltaToSelected === "number"`,
which is true for `NaN` and `Infinity`; those render as `+$NaN` and `+$∞`. Both
are unreachable in practice — outcomes are only ever `JSON.parse`d from D1
(`worker/lib/estimator/rationale.ts:199`), and JSON has no literal for either.
`Number.isFinite` would close it in one word. Deferrable.

### Not a defect (recorded so it is not re-raised)

A runner-up whose delta is genuinely `0` renders `$0`. The spec forbids `$0` only
on the chosen row (criterion 4) and for the uncalculable case (criterion 5).
`$---` keeps the two distinguishable on screen, so this is correct as specified.

---

## Coverage I added

`scripts/tests/web/ops2-line-why.spec.ts` gained `WHY-AC-D2` — three cases
(375/768/1280) closing the criterion-19 gap described above. This is the only
change I made to the tree. No implementation code was touched. Two unrelated
working-tree entries remain: `docs/runs/ops2-why-price-deltas/run.json`
(pipeline-owned) and the untracked abuse harness `scripts/probe-why-abuse.mjs`,
kept so criteria 14–18 can be re-executed rather than re-argued.
