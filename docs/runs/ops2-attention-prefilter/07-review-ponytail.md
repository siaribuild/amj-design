Reviewed. Report:

## ponytail-review — `4a1acc69..HEAD` (ops2-attention-prefilter)

**`src/ops2/attention/attention.ts`:L110-152: shrink: `attentionGroups` replaced a data table with two hand-written blocks that are structurally identical.** The refactor was right to split projects (derived) from summary (pass-through), but the enquiries and customers blocks are the same shape twice — group id, `destination(id).label`, one row, one count, one noun, one href. 25 lines. Restore the spec list for the summary half only:

```ts
const SUMMARY_GROUPS: readonly { id: DestinationId; key: keyof SummaryCounts; noun: (n: number) => string }[] = [
  { id: "enquiries", key: "newEnquiries", noun: () => "waiting for a reply" },
  { id: "customers", key: "tradeApplications", noun: (n) => `trade application${n === 1 ? "" : "s"} waiting on a decision` },
];
for (const g of SUMMARY_GROUPS) {
  const count = counts[g.key];
  if (count === 0) continue;
  groups.push({ id: g.id, label: destination(g.id).label, rows: [{ key: g.key, count, noun: g.noun(count), href: destination(g.id).path }] });
}
```

**`attention.ts`:L84-89 + `queue.ts`:L163-172: yagni: two tables keyed by the same closed `AttentionKey` set, in two files, holding the same fact.** `ATTENTION_FILTERS[].label` is `"New submissions" | "Being priced" | "Ready to issue" | "Awaiting payment"`; `PROJECT_NOUNS` is those same four strings lowercased, three of them character-for-character apart from case. Adding a fifth attention key means editing two files or the page renders a label with no noun. Put `noun` on `ATTENTION_FILTERS` beside `label` and delete `PROJECT_NOUNS` — the filters table already lives in `queue.ts` as the Attention gate's own registry, so it is the one place. −7.

**`queue.ts`:L650-651: shrink: `.find()` runs per row inside the filter, and the same `ATTENTION_FILTERS.find(...)!` appears three times across two files** (`selectProjects`, `emptyStateFor`:L377, `ProjectsPage`:L128). The file already has this exact pattern solved two ways above — `CHIP_BY_KEY`, `REFINEMENT_BY_KEY`, plus the hoist-before-the-pipeline done for `refinements` on L642. Add `const ATTENTION_BY_KEY = new Map(ATTENTION_FILTERS.map((f) => [f.key, f]))` beside its two siblings; the filter becomes one line and the three non-null assertions become `.get()`. −2.

**`ProjectsPage.tsx`:L392-396: shrink: ternary picks between two joins of the same array.** One line: `<span>{(attentionLabel ? "+ " : "") + activeRefinements.join(" + ")}</span>`. −2.

**`ProjectsPage.tsx`:L379-381 + `projects.css`:L312-322: yagni: a wrapper element and a new class for what the parent flex row already does.** `.pq-active` is already `display:flex; align-items:center; gap`. Adding `flex-wrap: wrap` to it and `margin-left:auto` to the Clear button (dropping `justify-content: space-between`) removes `.pq-active__names` entirely. Lower confidence than the others — the wrapper does buy "Clear never wraps to its own line," which `margin-left:auto` on a wrapping parent does not guarantee. If that 375px behaviour was verified deliberately, keep it and skip this. −9 if it goes.

Not flagged, deliberately: `combineLoads` (5 lines, one caller, but it is precedence logic tested without React — earns the seam); `attentionQuery` (two callers); the `useIonViewWillEnter` + `locationRef` reset (design §3.3 point 3, explicitly requested); the four-payload injection loop in `ops2-projects.spec.ts` (trust-boundary validation — never the shortest diff); `attentionFromSearch` (a like-for-like replacement of the deleted `chipFromSearch`, already net-neutral).

`net: -31 lines possible.` (−22 excluding the CSS wrapper item.)