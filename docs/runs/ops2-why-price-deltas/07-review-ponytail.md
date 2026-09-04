# Context

The pipeline's `review` stage asked for a ponytail (over-engineering) review of the
`feat/ops2-why-price-deltas` branch diff against `9cb41bfd`, written to
`docs/runs/ops2-why-price-deltas/07-review-ponytail.md`.

The review is **done** — findings are below. Plan mode blocks writing anywhere except
this plan file, so the one remaining action is to write the report to its real path.
The pipeline reads that file; without it the stage silently counts as skipped, which is
the exact failure recorded in the `pipeline-reviewers-never-wrote-reports` memory.

# Action

Write the block below verbatim to `docs/runs/ops2-why-price-deltas/07-review-ponytail.md`,
then reply with only that path.

---

```markdown
# ponytail-review — feat/ops2-why-price-deltas vs 9cb41bfd

Scope: over-engineering only. Correctness, security and performance are the other
reviewers' pass. `scripts/probe-why-abuse.mjs` is the tester's mandated abuse probe
(CLAUDE.md security layer 2) and is not reviewed as bloat.

## Findings

`src/ops2/styles/panel.css:30`: delete: `.lp-panel--rows > .wd__reason` matches nothing —
both `lp-panel--rows` callers (`why-ladder`, `why-bands`) render `lp-panel__more`, and no
`wd__reason` is a direct child of either. Nothing replaces it.

`src/ops2/projects/WhyDetail.tsx:277`: delete: `<RowList className="wd__lites">` passes a
class whose only rule this same diff removed from `line.css`. `<RowList>` — the container
already carries `ops2-rows`.

`src/ops2/projects/WhyDetail.tsx:111`: shrink: `deltaLabel(...) ?? undefined` — the span
only renders when `delta != null`, which only happens when `i !== 0`, and `deltaLabel`
returns null only on the chosen row. `aria-label={deltaLabel(c.deltaToSelected, false)}`.

`src/ops2/projects/whyCopy.ts:572-597`: shrink: `deltaText` and `deltaLabel` each repeat
`Math.round` + `$${Math.abs(r).toLocaleString("en-AU")}`. One module-local
`const money = (r: number) => "$" + Math.abs(r).toLocaleString("en-AU")` above both; the
node test still scans the module, so the reason the two live side by side is unaffected.

`src/ops2/chrome/SidePanel.tsx:183-184`: shrink: one template literal split across two and
joined with `+` for no gain. `` className={`pq-sheet${form === "side" ? " pq-sheet--side" : ""}${form === "screen" ? " pq-sheet--screen" : ""}`} ``.

`worker/lib/drawing/fullDocumentAgent.ts:1447-1450`: yagni: `remainingBatches` and the
`report.modelCalls + remainingBatches >= providerCallLimit` clause are a second guard on a
budget the first two already close — `providerCallLimit` is *defined* as
`mainProviderCallLimit + closeUpBatchCount + MAX_SHARED_CLOSE_UP_RETRIES`, and
`closeUpRetriesUsed >= MAX_SHARED_CLOSE_UP_RETRIES` caps the only term that can overrun it.
Keep the retry counter, drop the arithmetic.

`scripts/pipeline/conduct.mjs:965-971`: yagni: the criterion-contiguity scan is 6 lines of
regex arithmetic reporting a gap in a numbered list the operator is reading anyway, and it
has already needed two rounds of false-positive tuning (`c24b67a3`, `eefea67c`). The other
four `checkSpec` rules key on presence, which prose cannot fake; this one keys on
sequence, which the model's formatting choice can. Drop it.

## Not flagged, deliberately

- `OpenablePanel`'s new `className` — one appended modifier, two callers, mirrors
  `RowList`'s existing prop. It replaced `Block`, so the file is shorter than before.
- `deltaText` returning `"$---"` and the render branching on that string. Stringly-typed,
  but it is the shorter form and the comment names why one source of truth was wanted.
- `readTasks` and `fixSpec` in `conduct.mjs` — 5 and 3 lines, each with a caller and a
  recorded failure behind it.
- `line.css` is net smaller after the feature: `.wd__blk`, `.wd__blk-h`, `.wd__kv`,
  `.wd__ladder` all deleted in favour of console rules used by name. That is the diff
  getting shorter, which is the point.

net: -15 lines possible.
```
