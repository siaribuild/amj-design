`scripts/pipeline/conduct.mjs:L659-663`: yagni: `autocompactArgs` exported pure helper + `CONTEXT_CAP` export exist only so pipeline.test.mjs can pin a branch that is dead (`CONTEXT_CAP` is a hard `null`). Inline `if (CONTEXT_CAP) a.push('--autocompact', String(spec.compact || CONTEXT_CAP))`; the three boot tests already assert the flag is absent.

`scripts/tests/pipeline.test.mjs:L774-784`: delete: `autocompactArgs pins lever 1 in both directions` — two of its three assertions exercise the set-cap path no caller can reach, and the third duplicates the pane/resume/answer boot assertions. Nothing replaces it.

`src/ops2/attention/useSummary.ts:L41-72`: shrink: the same `{status:"error", headline, detail}` literal written three times (non-2xx, degraded parse, network catch). One `const FAILED: SummaryLoad = {...}` above the effect, `setLoad(FAILED)` at all three sites.

`src/ops2/attention/attention.ts:L63-67`: delete: `WAIT_CHIPS.find(c => c.key === wait)?.key` then throw — `wait` is already typed `ChipKey`, so the lookup returns its own argument and the throw is unreachable. `` return `${destination("projects").path}?wait=${wait}` `` , one line. ops2-attention.test.mjs already checks every href's chip against `WAIT_CHIPS`.

`src/ops2/attention/useSummary.ts:L13-14`: shrink: `error` and `unauthorised` are the same shape and differ only in whether a retry renders. One variant `{status:"error", headline, detail, retryable: boolean}` collapses the union arm and both `load.status === ...` checks in AttentionPage.

`src/ops2/attention/AttentionPage.tsx:L58`: shrink: `{load.status === "ready" && (() => {...})()}` IIFE only exists to bind `groups`. Hoist `const groups = load.status === "ready" ? attentionGroups(load.counts) : []` above the return, branch on `groups.length`.

`src/ops2/attention/attention.ts:L59,L120`: delete: `AttentionGroup.label` re-carries `destination(id).label`, a fact the page can read itself — it already indexes `DESTINATION_ICON[group.id]` two lines away. `destination(group.id).label` at the render site.

`scripts/pipeline/conduct.mjs:L1169`: delete: stray blank line added at the top of `runBuild`. Nothing replaces it.

net: -45 lines possible.