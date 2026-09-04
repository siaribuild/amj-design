# Design-conformance review — ops2-composite-manufacturer-price

**Verdict: CONFORMS**, with two good-reason deviations that need a doc addendum (below). No design clause violated; no absence; no untracked scope creep.

## Checks

**Every path 02-tasks.json named exists and changed.** All 13 design-named files present in diff: `worker/lib/composite.ts`, `worker/routes/ops.ts`, `src/ops2/projects/record.ts`, `src/ops2/projects/LinePage.tsx`, `src/ops/api.ts`, four test files, both Playwright specs, `CONTEXT.md`, and `docs/adr/0017-composite-parent-manufacturer-price.md` (created, not just named — the pipeline's classic absence failure did not repeat).

**Nothing design named was skipped.** No new test file was required by design (§4: extend in place), so `package.json` untouched is correct.

**Untouched-on-purpose list honoured.** `PricePanel.tsx`, `src/data/manufacturerPrice.ts`, `src/ops/ProjectRecord.tsx`, `LineReview.tsx`, `worker/lib/issue.ts`, `migrations/` — all absent from diff, as §1 demanded. No migration; d1-migration-safety correctly not engaged.

**Design seams landed where placed.** Ownership guard in `worker/lib/composite.ts` (lib, not route); `LinePage.tsx:423` is byte-for-byte the §2.4 expression `editable={!isOrder && record.linesEditable}`.

## Deviations — both good, both from verify findings, keep them

1. **F2 fix: `src/ops2/projects/ProjectRecordPage.tsx:498`** — design named only `LinePage.tsx` as door site; the record canvas renders the same `PricePanel` with the stale double gate. Design missed the second render site; verify caught it; fix uses the design's own seam (`record.linesEditable`). Correct extension, not a violation.

2. **F3 fix: `worker/routes/projects.ts`, `worker/lib/lines.ts`, `src/data/configurator.ts`, `UnitRow.tsx`** — design §5 asserted customer payloads carry no cost/uplift figure ("verified `worker/routes/projects.ts` line reads"); verify proved segment `lineTotal`s in the customer DTO now disclose the margin once a parent carries a manufacturer price. Fix replaces `lineTotal: number|null` with `priced: boolean` — smaller surface, exactly the design's own security principle. The design's verification claim was wrong; the fix is right.

## Required follow-up (doc, not code)

ADR 0017 records the ownership transfer but **not** the F3 segment-DTO change (customer payload no longer carries per-unit prices — that is a domain-visible interface change) nor the second door site. I am read-only this stage: route to the developer or conductor a one-paragraph addendum to ADR 0017 (or a note in 02-design.md §1/§5) recording both, and confirm the owner decision verify's round-2 checklist required for F3 was actually taken — the code assumes it was.

No other findings.