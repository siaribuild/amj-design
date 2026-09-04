# ponytail-review — ops2-attention (diff vs 284f89ff)

**Blocker:** plan mode refused the write to `docs/runs/ops2-attention/07-review-ponytail.md`.
The report body is below verbatim — copy it to that path.

Scope: over-engineering only. Correctness, security and performance are other
reviewers' passes.

## Findings

`src/ops2/attention/attention.ts:L52-56,L119`: delete: `AttentionRow.label` is never read — `AttentionPage.tsx` renders `row.count` and `row.noun` in their own slots, and nothing else imports it. The comment claims it keeps the accessible name from drifting, but no accessible name is built from it. Drop the field, its 4-line doc comment, and the `label:` assignment. (Its only consumer is the test below.)

`scripts/tests/ops2-attention.test.mjs:L192-202`: delete: "every row label is number-leading" tests only the dead field above. Goes with it.

`src/ops2/attention/attention.ts:L65-69`: yagni: `projectsHref` looks a literal up in `WAIT_CHIPS` and throws at module load if it is missing — a guard for a static array edited in the same repo, whose two call sites pass literals already narrowed by `ChipKey`. Replace with `` `${destination("projects").path}?wait=${wait}` `` (1 line).

`src/ops2/attention/useSummary.ts:L36-66`: shrink: the same `{status:"error", headline, detail}` object is written out three times (non-2xx, degraded, catch). Hoist one `const FAILED: SummaryLoad = {...}` above the effect and `setLoad(FAILED)` in all three. ~-14 lines, and the "the reader must not be able to tell them apart" invariant becomes structural instead of copy-pasted.

`scripts/tests/web/ops2-attention.spec.ts:L224-286`: delete: the last two tests differ by one assertion (`Try again` has count 0) and duplicate a 22-line customer sign-in to get it. Fold `await expect(error.getByRole("button", {name:"Try again"})).toHaveCount(0)` into the preceding unauthorised test and delete the second one. ~-26 lines.

`scripts/tests/web/ops2-attention.spec.ts:L19-39,L234-247`: shrink: staff sign-in and customer sign-in are the same 15-line `challenge`/`verify` evaluate block with a different path prefix. One `async function signIn(page, prefix, email)` used by both. ~-15 lines.

`scripts/tests/web/ops2-attention.spec.ts:L62,88,105,116`: shrink: `page.route(SUMMARY_URL, route => route.fulfill({json: SUMMARY_STUB}))` repeated in four tests. Register it once in `test.beforeEach`; the tests needing another reply already re-`route`, and a later registration wins. -4 lines.

`.claude/launch.json:L4-30`: delete: 23 lines of pure reformatting churn — every existing `runtimeArgs` array expanded from one line to four, unrelated to the feature. Keep the new `ops2-worker` entry, revert the rest.

`scripts/pipeline/conduct.mjs:L177,L625`: yagni: `const CONTEXT_CAP = null` makes `if (CONTEXT_CAP !== null) a.push('--autocompact', ...)` statically dead and leaves nine `compact:` values nothing reads. Cutting the branch and the fields is ~-12 lines; git restores them if the cap comes back. Noted against the stated intent of a one-line restore — the owner's call, but it is config nobody sets today.

## Not flagged

- `useSummary` duplicating `useProjectQueue`'s live-guard/`ionViewWillEnter` mechanics — two copies with a real divergence. Extract on the third.
- `readTasks` accepting `[...]` or `{tasks:[...]}` — five lines replacing a repeated hand-repair. Earns its keep.
- `SUMMARY_KEYS` beside `SummaryCounts` — a runtime list a type cannot provide.

net: -105 lines possible.
