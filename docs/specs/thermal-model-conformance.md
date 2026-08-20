# Thermal model — design-conformance review (stage 7)

**Reviewer:** architect (returning) · **Date:** 2026-08-20 · **Branch:** `feat/thermal-model`
**Reviewed:** `git diff main...HEAD` (15 commits, 26 files, +4086/−177, tree clean) against
`docs/specs/thermal-model-backend-design.md` (design revision 2). Structure only; behaviour
belongs to the tester.

## Verdict: **CONFORMS WITH DIVERGENCES** — every divergence disclosed by the developer, every one judged sound, none requiring a code change. Zero findings route back to the developer.

Two of the divergences were errors in the **design**, not the implementation; the design doc has
been amended accordingly (NE/NW ruling → §2.2 + AD-T17; cascade count 53→61 → §7).

---

## 1. The NE/NW adjudication — ruling: **the documented table stands**

The live `shgcForOrientation` tested `o.startsWith("N")` before the branch that explicitly
enumerated `NE`/`NW`, so that branch was dead: the code *behaved* as NE/NW ⇒ `0.5 / no cap` while
*stating* NE/NW ⇒ `0.4 / 0.5`. Spec §5.1 and design §2.2 both state the enumerated table. The
developer implemented the enumerated table. **Ruled correct**, for four reasons:

1. A dead branch that names NE and NW explicitly is direct evidence of authorial intent; a
   `startsWith` prefix that shadows it is a bug of exactly the class this feature's own TB-19-era
   guards exist for ("N/A" is not "N").
2. It is physically the graded intent: NE/NW take mixed low-angle sun — a looser cooling cap
   (0.5) than E/W's 0.43, rather than N's uncapped winter-sun allowance, which N's rationale
   ("useful winter sun, shadeable in summer") does not extend to.
3. Both governing documents state the table, twice, and no acceptance criterion pins the live
   prefix behaviour (TB-1 pins only W and N).
4. Zero production impact: 0 of 444 default rows ever carried an SHGC value; the path never
   executed on a real job.

**Said plainly: A14's "retained exactly" was unachievable as written.** The code disagreed with
itself, so any implementation had to choose one of two readings and "exactly" is false either
way. My design repeated the spec's table without noticing the shadowed branch — the developer
found the conflict and correctly refused to resolve it quietly. The **losing reading is
recorded** (design §2.2 note + AD-T17: live prefix behaviour, NE/NW ⇒ `0.5 / null`) so it is
never re-litigated. If a sourced solar mapping ever supersedes `orientation_shgc@v1`, that is a
version change per A14, not a reopening of this ruling.

## 2. Presence walk — the file-by-file plan and every named test artifact

### Created (design §11) — 8 of 8 present

| Named | Present | Verdict |
|---|---|---|
| `migrations/0057_thermal_default_band.sql` | yes | CREATE TABLE only; three-value method CHECK; cascade audit **performed and documented in-file** (grep result stated), not asserted |
| `worker/lib/estimator/thermal/contract.ts` | yes | imports nothing; `Sourced<T>`, `readSourced`, `SOURCED_FIELDS`, `COMPASS_POINTS`, `DOCUMENT_SOURCES` |
| `worker/lib/estimator/thermal/defaultBand.ts` | yes | seed 4.0 / `unsourced_legacy` / truth-telling source; never-throws resolution; malformed rows fall back |
| `worker/lib/estimator/thermal/calibration.ts` | yes | three axes, derived caps, deltaVsActive, no write verb, no `recommendedValue` |
| `worker/routes/ops-thermal.ts` | yes | 28 lines, exactly one GET, `resolveStaff` gate |
| `docs/adr/0008-thermal-band-composed-from-sourced-inputs.md` | yes | matches design §14 |
| `scripts/tests/thermal-default-band.test.mjs` | yes (340 lines) | wired into `test:pure` + `test:thermal-default` |
| `scripts/tests/thermal-calibration-api.test.mjs` | yes (246 lines) | wired into `test:heavy` + `test:thermal-api` |

### Modified (design §11) — all present, none missing

`computedBand.ts` (reshaped; rule table; attachment points declared as comment, no code;
`zoneCapValues()`), `archetypes.ts` (maxUValue removed, `defaultRequirement` deleted, registry
v2), `pipeline.ts` (dial resolved once per run; effective-requirement skip via `coerceCoherent`;
`thermalInputsFor`; snapshot; counters; `thermalContextFor` untouched), `energyMap.ts` (one-line
source stamp only), `schema.ts` (`wallOrientationSource`, `derivation`, type-only contract
import), `versions.ts` (PIPELINE 2026-08-20.1, schema 1.2, no promptVersion), `estimate.ts`
(`tallyTiers`/`tierCounts`), `ops.ts` (mount), `CONTEXT.md` (§13 text verbatim), `package.json`
(both lists, both scripts), and all five named test files carry their pins.

### Criterion → artifact map (§10) — every named pin located

TB-16/17u/19/22/23/24/25/26/27 + AB-3(static)/AB-6(shape) in `thermal-default-band.test.mjs`;
TB-14/17db/28 + AB-1/2/3/5/6 in `thermal-calibration-api.test.mjs`; TB-1..13 pipeline legs,
TB-15/20/21p/30/31/32, TB-9, AB-4 in `ai-pipeline.test.mjs`; TB-1 math/TB-3/TB-5 one-home/
TB-6/TB-8/TB-11+12 unit/TB-21u/TB-29 + A14 pin in `thermal-selection.test.mjs`; TB-34 in
`estimator-learning.test.mjs`; TB-36/37 in `estimator-recommendation.test.mjs`; TB-35 in
`recommendation-contract.test.mjs` (two tests — import scan **plus** a symbol-leak scan the
design did not ask for; stronger than specified, accepted). Minor placement shift: TB-12's unit
leg lives in `thermal-selection` rather than `ai-pipeline` — immaterial, both suites are pure.

**TB-33 and TB-18 (no runnable artifact — owners named in the design):** TB-33 executed here as
part of this review: `git diff main...HEAD` touches **zero** files under
`worker/lib/estimator/skills/`, no `promptVersion`, no extraction schema field. TB-18 inspected:
the pure suites run against a **fixture dial of 2.5 — deliberately not today's value** — so a
test passing by coincidence is visible; the single business literal is TB-16's seed check.
Compliant, and better than the design asked.

## 3. Structural questions

- **Is the contract genuinely the boundary?** Yes. `thermalInputsFor` assembles orientation
  through `readSourced` and refuses a value without a recorded producer; `computeThermalBand`
  re-reads every `Sourced` field through the same clamp (defence in depth); the one-home test
  pins that no second module computes a band, and the mapping/zone-table symbols exist in exactly
  one file. No path constructs a band input around the contract.
- **Composition, not a formula?** Yes. Two rule constants, each pushing its own `rulesApplied`
  entry with version + provenance; band fields assigned only from rule contributions.
  `shading_relief` and `glazing_ratio_tightening` are a named comment block beside the rule table
  with **no code** — one new table row each when their inputs arrive, and `inputsMissing` already
  counts their absent inputs uniformly via `SOURCED_FIELDS`.
- **Calibration incapable of writing?** Yes. No write verb in the module (pinned by test); the
  only occurrence of `recommendedValue` in `worker/` is the comment stating there is none;
  `observed_report_maximum`'s only occurrence is the comment stating why it is unrepresentable.
- **AB-3 a property of a small file?** Yes — 28 lines, one `.get(`, pinned statically and by
  HTTP probes with a ledger row-count check.
- **Migration 0057?** Correct number (0056 was highest), CREATE TABLE only, zero FK edges either
  direction, audit documented in the file. Independently re-verified here.
- **Shipped recommendation model untouched?** Yes — empty diff on `ladder.ts`, `select.ts`,
  `compositeSelect.ts`, `rules.ts`, `learning.ts`, `thermal/precedence.ts`, `debug.ts`,
  `migrations/0016`; `riskBand` retained and pinned (TB-34); TB-35's two scans pin the fence
  going forward; TB-36 pins bind-equivalence.

## 4. The developer's disclosed divergences — judged

| Divergence | Verdict |
|---|---|
| NE/NW documented table over live prefix behaviour | **Adjudicated for the implementation** (§1); design amended (AD-T17) |
| `climateZone: number \| null` (design said `number`) | Sound — honest typing against `resolveDefaultEnvelope`'s nullable return; an unknown zone resolves to the dial, which is the design's own fallback semantics |
| `SOURCED_FIELDS` added to the contract | Sound — makes AD-T5's uniform `inputsMissing` rule one list instead of a hand-maintained switch; deepens the module |
| Three pure seams: `requirementSnapshot`, `modelReachCounters`, `tallyTiers` | Sound — internal seams for testability; each has one production caller; the persisted shape and counters match the design exactly |
| Snapshot keyed on `derivation` presence, not basis name | Sound, and more robust than the design's wording: "computed" is definitionally "carries a derivation", and the predicate survives the coerces-to-nothing edge without a basis-name list |
| Profile GROQ does not project `_id` (design's sketch did) | Sound and strictly better: identity never fetched cannot leak into the cross-account aggregate (AB-6). The design's sketch was the weaker choice |
| Sanity failure ⇒ 500, not an empty catalogue | Sound — a zero-deliverability reading served to someone about to turn the dial understates axis 3 in the costly direction; unconfigured local (`SANITY_PROJECT_ID` empty) still yields the honest empty shape, which is what the harness exercises |
| `tallyTiers` also reads `selectedSplit` | Sound — a split winner is the winner; counting only `selected` would under-report TB-37 |
| `UCAP_BY_ZONE` renamed `ZONE_U_CAP` (seven entries; zone 6 removed to the dial) | Cosmetic; the seven-entry restructure is exactly design §11's instruction |

None of these is an undocumented shortcut; all were disclosed, and none mortgages the
architecture.

## 5. What the design itself got wrong — stated plainly

1. **A14's "retained exactly"** — unachievable; the code disagreed with itself (§1). Design
   amended.
2. **The cascade count.** The design (following the `d1-migration-safety` skill text) said 53;
   measured today it is **61** `ON DELETE CASCADE` clauses across `migrations/` (excluding
   0057's own comment). Immaterial to this feature — the new table has zero FK edges — but the
   design is corrected, and **the skill file `.claude/skills/d1-migration-safety/` still carries
   the stale 53**; it is not this review's to edit — flagged for the owner/orchestrator to
   update through the normal path.
3. **The design's GROQ sketch projected `_id`** for no consumer; the implementation's omission is
   the better security posture and should have been the design.

## 6. Boundary hand-back verified

`docs/drawing-split-recognition-design.md`: **both** stale locations corrected — the Stage-1
bullet ("currently hard-filters" → the contract/`computeThermalBand` path) *and* the guard-rail
paragraph (struck through, marked WITHDRAWN with the v3-energy-objective reasoning and the
replacement Stage-1 concern). Nothing else in that document was touched, and nothing owned by
that thread (extraction, room identity, `normalizeOpeningRef`, skills) was built here.

## 7. Notes for the remaining stages

- The developer's nine `ASSUMED:` calls reached this review via the orchestrator's relay rather
  than a register file; the acceptance stage (PM) should walk them against §4's verdicts as part
  of the normal unvetoed-assumption check.
- The tester owns behaviour against TB-1..TB-37/AB-1..AB-6; nothing in this review substitutes
  for that. TB-33 and TB-18 are confirmed here structurally, as the design assigned.
