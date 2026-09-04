# Phase 1 — acceptance criteria (handover Tasks 1–2)

Written after the fact, which is the wrong order and the reason this phase grew
per-view scale binding before the owner cut it. Every later phase gets its
criteria approved **before** code. Each criterion names the test that proves it;
a criterion with no test is not done.

Owner rulings folded in: harvest stays byte-compatible (2026-09-04), scale is a
property of the page (2026-09-04), and the page's scale is the ratio printed in
the sheet footer (2026-09-04).

## In scope — must be true

### Task 1, shared harvest

**AC1.** Given the harvest built by the pre-move implementation at `91ba1701`
over fixed synthetic geometry, when `harvest.ts` builds it, then the JSON is
byte-for-byte identical.
→ *the model-facing harvest contract is byte-compatible with the agent it moved out of*

**AC2.** Given both modules, when `buildFullDocumentHarvest` is imported from
`harvest.ts` and from `fullDocumentAgent.ts`, then they are the same function
object — a copy fails.
→ *harvest.ts holds the one Stage A implementation both drawing engines share*

**AC3.** Given `agentic_full`, when this phase lands, then its prompt payload,
stage input hash, R2 harvest cache and prompt/pipeline versions are unchanged.
→ AC1 plus the unchanged `versions.ts`, `wrangler.jsonc`, `worker/types.ts`

### Task 2, page scale

**AC4.** Given a sheet printing `SCALE 1:100`, `Scale 1 : 100`, `1:100` or
`1 / 100` in its footer, when scales are read, then each form yields ratio 100.
→ *every printed form is read*

**AC5.** Given `1:0` or `1:abc`, when scales are read, then neither becomes a
candidate: one cannot scale a drawing, the other is not a ratio.
→ *a bare ratio is read and an unusable one is refused*

**AC6.** Given a ratio the PDF split across words, and a word from another
column sorting between its tokens, when scales are read, then the ratio is
still read as one.
→ *a split ratio is read from what sits beside it, not from token order*

**AC7.** Given rows about one text height apart, or a rotated label spanning
several rows, when rows are reconstructed, then no row absorbs another's words.
→ *tight line spacing does not fold two rows into one*; *rotated text beside a note does not detach the note from its ratio*

**AC8.** Given a ratio printed away from the sheet footer — a ramp, a fall, a
stair, a per-view label, any note — when the page's scale is decided, then that
ratio is not a candidate.
→ *only the footer says what the sheet is drawn at*

**AC9.** Given a page whose footer ratios agree, when the map is built, then the
page carries that ratio; given ratios that disagree, then the page maps to
`null`, so ops can tell a conflict from a page that printed nothing; given no
footer ratio, then the page is absent from the map.

*(Corrected 2026-09-04. As first written this criterion said a conflicting page
was absent, which made a conflict indistinguishable from silence and
contradicted §7.4's requirement that the conflict be recorded for ops. The
implementation follows the handover; the criterion was wrong.)*
→ *the document map says what each page is drawn at, and stays silent where it cannot*

**AC10.** Given a scheduled width and a scale, when `expectedWidthPt` converts
it, then 3000 mm at 1:100 is 85.04 pt and 900 mm at 1:100 is 25.51 pt.
→ *expectedWidthPt turns a scheduled width into the points that width occupies*

**AC11.** Given the reference set `lot312-536a.pdf`, when the map is built, then
pages 2, 3 and 14 read 1:200, pages 4–11 read 1:100, page 12 reads 1:20, and
pages 1 and 13 carry none.
→ No committed test can assert this: §3 invariant 12 forbids the customer PDF
in Git, and §14 assigns the ignored replay corpus to Task 12. Until then this
criterion is met by a recorded manual run, and the phase record names the
commit it was last run at. **Task 12 must convert it into a replay assertion.**

## Out of scope — must NOT exist

These are the criteria this phase lacked, and their absence is what let the
first version grow. A reviewer checks them by reading the diff, not by running
a test.

**AC12.** No code attributes a scale to a view, region, title or elevation.
Scale is per page.

**AC13.** No code branches on a list of note subjects — fall, grade, gradient,
pitch, ramp, driveway, stair or their kin. The footer decides, so no vocabulary
is needed and none may be reintroduced. Test fixtures may print such notes:
that is how they prove the footer rule ignores them.

**AC14.** No drawing-title detection, region tiling, or title-anchor geometry
in the scale path.

**AC15.** No new field on `FullDocumentHarvest`, and no change to any prompt,
stage id or version.

**AC16.** No page-role, storey or elevation logic in Task 2 — those belong to
Phases C and D.

**AC17.** Nothing in `faceMapped/` beyond what Tasks 1–2 name: `contract.ts`
holding `expectedWidthPt` only.

## Known ceilings, and judgement calls a reviewer should see

- **The footer is a band, not the title block itself.** `FOOTER_FRACTION` is
  15% of the page, bottom or right. A ratio a drawing prints inside that band
  is accepted, so a note low on a sheet could still be read as its scale. No
  set to hand does this; locating the real title-block rectangle would be more
  geometry than the evidence justifies.
- **The map reports every page, not only pages of interest.** The ruling says
  detail sheets are not asked for a scale; the engine asks about the pages it
  is working on, and `pageScales` answering for page 12 as well costs nothing.
  Filtering by page role inside the map would put Phase C's tiers into Task 2.
- **`MAX_OPEN_LINES`** bounds row reconstruction to the last three open rows —
  an invented ceiling that keeps the grouping linear on pages with thousands of
  words.
- `1:100 @ A3` keeps the ratio and drops the paper size; `1:1,000` is not read.

## Deferred, with the phase that owns each

- A face-mapped caller for `viewScaleCandidates` / `pageScales` — Task 10.
- Frame-width calibration, median effective scale, and the null
  `expectedWidthPt` path for conflicting scales — §7.4's later half, Task 6.
- The reference-set map as a replay assertion — Task 12 (see AC11).

## Gates

`npm run test:drawing-enrichment`, `npm run test:pure`, `npm run typecheck:gate`
all green; `/security-review` clean; architect conformance clean; a Codex
requirements-adherence review reporting no unmet clause and no unrequired code;
and the reference set re-parsed after the last change.
