<!-- Relocated by the conductor session: plan mode refused the reviewer's write to this path (regression of the 2026-09-02 fix). Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-zesty-tulip.md -->
# Security review — catalogue-go-live-min

Scope: the branch diff `d8f994aa..HEAD` (`feat/catalogue-go-live-min`), 9 commits.
Code surface actually changed by this feature:

- `scripts/catalogue/go-live-plan.mjs` (new, 600 lines) — pure sheet data + `plan()` + `assertSafe()`
- `scripts/catalogue/apply-go-live-min.mjs` (new, 143 lines) — Sanity query/mutate I/O, token resolution, CLI
- `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs` (tests only)
- `docs/runs/catalogue-go-live-min/rate-cards.sql` (operator-applied D1 file)
- docs/CONTEXT prose

No change to `worker/**`, `src/**`, `migrations/**`, or any request-handling path. No new
endpoint, no new auth or authorization logic, no new user-supplied input reaching the server.

## Findings

**None at HIGH or MEDIUM confidence.**

## What was examined and cleared

- **SQL injection — `rate-cards.sql`.** 54 lines, fully static literals; no interpolation,
  no parameters, no host-side generation. The version bump is an expression over the row's own
  `version` column. Every statement is `UPDATE`/`INSERT` on `pricing_rate_card`; no
  `DELETE`/`DROP`/`ALTER`/`CREATE TABLE` token appears. Applied by the owner via
  `wrangler d1 execute --file`, not by any served code path.
- **Command injection.** Neither new script imports `node:child_process` or shells out;
  the T5 scan test (`scripts/tests/catalogue-go-live.test.mjs`) asserts this mechanically.
  CLI surface is two boolean flags (`--write`, `--verify`) read from `process.argv`.
- **Credential handling — `apply-go-live-min.mjs:29-36`.** `resolveToken()` reads
  `SANITY_WRITE_TOKEN` or the local Sanity CLI config, matching the existing
  `scripts/catalogue/import-wers.mjs` pattern. The token is only ever placed in an
  `Authorization` header against the hardcoded host `https://xjtrm1ex.api.sanity.io`
  (`PROJECT_ID`/`DATASET`/`API` are module constants — no user- or data-controlled host,
  protocol, or path segment, so no SSRF). The token is never logged; error paths log only
  the HTTP status and a 300-char body slice from Sanity itself.
- **Query parameterisation — `apply-go-live-min.mjs:39-47`.** GROQ params are passed as
  `$name` query-string values JSON-encoded, not string-concatenated into the GROQ source.
  The GROQ text itself is a constant literal in every call site.
- **Destructive-write guard — `go-live-plan.mjs:579-594`.** `assertSafe()` re-validates the
  computed mutation list against a fixed allow-list (`createIfNotExists`, `createOrReplace`,
  `patch`) before anything reaches the network, rejects `drafts.*` targets, rejects any
  `slug`/`slug.*` set key, and rejects `createOrReplace` of a `product`. `run()` refuses to
  write when `problems` or `violations` are non-empty (`apply-go-live-min.mjs:120-130`).
  This is a defence-in-depth addition, not a regression.
- **Patch path built from a document `_key`** (`go-live-plan.mjs:493`,
  `` set[`rows[_key=="${r._key}"].published`] ``). The `_key` originates from Sanity
  `thermalProfile` documents, i.e. from authenticated CMS editors, not from any customer or
  anonymous input, and the worst outcome is toggling `published` on another row of the same
  document — a document the same editor already controls. Not reported: no untrusted source,
  no privilege gain.
- **PII / financial data.** Nothing in this feature touches accounts, payout or bank details,
  ABNs, sessions, uploads, or customer files. Rate-card figures are catalogue list prices,
  already public on the site.

## Note (not a security finding)

`--write` mutates the live `production` Sanity dataset and `rate-cards.sql` mutates production
D1 pricing. Both are operator-run and both are deliberately gated: the script defaults to a dry
run, and the SQL is non-idempotent by design so a second run aborts on the primary key. That is
a change-control property, already covered by the deploy protocol, not a vulnerability.
