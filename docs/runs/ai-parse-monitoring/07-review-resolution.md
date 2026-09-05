# 07 — review findings and what happened to each

The four reviewer reports beside this file are snapshots taken at the moment
each reviewer ran. Nothing in them records whether a finding was later fixed, so
a reader — including the acceptance stage, which reads `07-review-*.md` and
never the source or the git log — sees open findings that were closed hours ago.
This file is that missing half.

Round 3 of the review ran against `591a912d..7f17722a`. Reviewer reports written
before a fix landed are marked below.

## Closed

| Finding | Where it was raised | Resolution |
|---|---|---|
| **P1 — the Cloudflare adapter reads fields the API does not return** (`totalUsd`, `rules[0].amount`, `result.limit`) | codex, architecture (round 2) | Fixed in `6b961425`. Correct paths are `history[].aggregated_value` summed, `rules[].limit`, `config.amount` (cents). Tests: "decodes the documented Cloudflare response shapes", "the account fallback converts cents to dollars". |
| **P1 — `value_grouping_window` missing**, so the usage call is a 400 in production | codex (round 2) | Fixed in `6b961425`; asserted by the same test. |
| **P1 — billed spend and the cap describe different scopes and periods** | codex, architecture (round 3) | Fixed in `7f17722a`. The usage query is bounded to the cap rule's own window, and the scope is checked: with more than one gateway on the account the budget reports `spend_not_attributable` instead of publishing a percentage that overstates. Tests: "usage is asked for over the cap's OWN window", "a second gateway makes the cap percentage unattributable". **The codex and architecture reports beside this file predate that commit and still show it open.** |
| **Medium — balance, spend and cap share one failure domain**, so a cap blip silences a low-credit alarm | codex, architecture (round 3) | Fixed in `7f17722a`. `MoneySnapshot` is `{ balance, budget }`, fetched and failing independently. Test: "a failed cap lookup never silences a real low-credit alarm". |
| **P2 — `takenAt: "invalid"` passes the parser**, then throws in `Intl.DateTimeFormat.format` and blanks the page | codex (round 3) | Fixed in `7f17722a`. Test: "a takenAt that is not a real instant is malformed". |
| **P2 — both money cards redden from one flag** | codex (round 2) | Fixed in `4079d489`: the server ships `redBalance` and `redCap`; the bell still counts the pair as one notification. |
| **P2 — an empty billing month reads as a broken snapshot** | codex (round 2) | Fixed in `8607c397`. |
| **P2 — a disabled spend limit is still read as a cap** | codex (round 2) | Fixed in `8607c397`. |
| **Medium — every hook instance runs its own poll interval** | architecture (round 2) | Fixed in `4079d489`: one module-owned, reference-counted loop. |
| **Medium — `Promise.all` lets one notification source reject the whole payload** | architecture (round 3) | Fixed in `7f17722a` — `allSettled`. |
| **Low — `JSON.parse` outside the KV seam** turns a corrupted value into a 500 | architecture (round 3) | Fixed in `6b961425`. |
| **Ponytail — the 401/403 split is never read** | ponytail (round 2) | Applied in `4079d489`: collapsed to 403 like every sibling route; `hasOpsCredential` deleted. |
| **Ponytail — `CF_TIMEOUT_MS` read but undeclared**; hand-rolled `Date.UTC` reconstruction | ponytail (round 2) | Applied in `4079d489`. |
| **HIGH — the monitoring route uses a cookie-only auth path production never takes** | tester (round 2) | Fixed in `5d07807a`. |

## Open, and why

| Finding | Status |
|---|---|
| **The unit of `balance` and `aggregated_value`** | Open, and not closable here — Cloudflare documents no unit for either. See `09-assumptions.md` §1. One real snapshot settles it. |
| **Tester criteria 8 and 11** | Disputed, not fixed. The reasoning is in `09-assumptions.md` §9 and in the amended criteria in `01-spec.md`. Needs the owner's word: it is a ruling about how parses are counted, not a code question. |
| **Ponytail — delete the one-source notification registry** | Declined on the owner's grill ruling (decision 8). Recorded in `DEBT.md`. |
| **Ponytail — floor/ceiling as vars** | Declined: the owner ruled "values in vars". |
| Everything else | Recorded in `DEBT.md` with a reason. |

## The pipeline gap this file exists to cover

`conduct.mjs` hands the acceptance stage `07-review-*.md` but not `04-build.md`,
so fixes applied after a review are invisible to the verdict unless something
writes them into this glob. Round 2's acceptance rejected partly for a P1 that
had already been fixed; round 3's did the same. Worth fixing in the conductor
rather than by hand next time.
