`scripts/tests-verify/abuse.mjs:L1-124` + `live-rows.mjs:L1-43`: `delete:` 167 lines of one-shot tester probes committed permanently — no npm script runs them, only `06-verify.md` mentions them, and `abuse.mjs` hand-rolls a cookie jar + `sourceIp()` its own comment says `scripts/tests/helpers.mjs` already ships. The abuse cases they cover are already asserted in `ops2-projects.test.mjs:L471-478`. Nothing replaces them; keep the evidence in `06-verify.md`.

`src/ops2/attention/attention.ts:L129-153`: `shrink:` the refactor grew — `GROUP_SPECS` used to drive all three groups through one loop; now Enquiries and Customers are two near-identical 12-line hand-written blocks. Keep a 2-entry spec array (`{id, key, noun}`) and loop it, `projectRows()` pushed first. ~12 lines.

`src/ops2/projects/queue.ts:L650-651`: `shrink:` `ATTENTION_FILTERS.find()` runs once **per row** inside the `.filter` callback, and this file already has `REFINEMENT_BY_KEY` / `CHIP_BY_KEY` for exactly this. Add `ATTENTION_BY_KEY`, hoist `const attn = query.attention ? ATTENTION_BY_KEY.get(query.attention)! : null` above the chain — also kills the duplicate `.find()`+`!` at `queue.ts:L377` and `ProjectsPage.tsx:L168`.

`src/ops2/projects/ProjectsPage.tsx:L104-113` + `L133-139`: `shrink:` two effects over the same location, one ref between them. Merge into one — apply branch when `has("attn")` (it `history.replace`s the param away, so the next run falls through to the reset branch and the key matches). Same logic, ~8 lines.

`src/ops2/attention/attention.ts:L84-89`: `shrink:` `Record<AttentionKey, (count: number) => string>` where three of four thunks ignore their argument. `Record<AttentionKey, string>` + pluralise `submissions` at the one call site (`L105`). ~3 lines.

`src/ops2/attention/attention.ts:L25,L38-43`: `shrink:` a `SUMMARY_KEYS` array and a loop for two fields. `const {newEnquiries, tradeApplications} = record; if (![newEnquiries, tradeApplications].every(Number.isFinite)) return "degraded";` — `Number.isFinite` is false for any non-number, so the type check comes free. ~4 lines.

`src/ops2/attention/attention.ts:L61-62`: `shrink:` two returns of the same value. `if (summary.status === "unauthorised" || summary.status === "error") return summary;` 1 line.

Not in the diff, but sitting in the tree: untracked `playwright.verify.config.ts` — same one-shot-verify residue as `tests-verify/`. Decide once for both.

Not flagged: the F2/F4 post-mortem comments in `ProjectsPage.tsx:L96-130`. Long, and duplicated in `a6ffc24d`'s message, but house rule says rationale comments stay and that one bought two failed fixes.

`net: -195 lines possible.`