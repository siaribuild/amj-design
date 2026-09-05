# Build notes

## t2 - Grow queue.ts an attention prefilter axis: row fields, ATTENTION_FILTERS, attentionQuery, attentionFromSearch, selector pass, empty state

Files: `src/ops2/projects/queue.ts`, `scripts/tests/ops2-projects.test.mjs`. Commit `55cdb95f`.

`ProjectQueueRow` gains `statusCustomer`/`orderStage` (parsed with under-claiming defaults `""`/`null`).
New: `AttentionKey`, `ATTENTION_FILTERS` (P2's four predicates verbatim), `attentionQuery(key)`,
`attentionFromSearch(search)` (closed-key-set, `chipFromSearch` pattern, untouched — t4 owns its removal).
`QueueQuery`/`EMPTY_QUERY` gain `attention`. `selectProjects` filters on it (falsy check, not `=== null`,
so callers that omit the field don't crash). `emptyStateFor` gains an attention branch — checked before
the no-rows-caused-by-search branch — with `clear` back to `EMPTY_QUERY`; the search branch's
`narrowed`/`elsewhere` now include the attention axis too.

Tests assert: parseProjectQueue defaults, all four predicates over design §5's PA-PF fixture incl.
`readyToIssue === rows.filter(issuable)`, the emptied-attention-set empty state, and
`attentionFromSearch` against bogus/SQL/script/10kB input — all null. Old `?wait=` grammar test removed
per design (t1's worker DTO change was already committed/merged before this task started).

Next task (t3, attention.ts + AttentionPage) can import `ATTENTION_FILTERS`/`attentionQuery` directly —
`selectProjects(rows, attentionQuery(key)).length` is the count contract.
