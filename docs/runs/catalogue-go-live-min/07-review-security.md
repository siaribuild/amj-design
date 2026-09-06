<!-- Round 3 (final commit fc97a962; the reviewer labelled it round 2). Relocated by the conductor session: plan mode refused the reviewer's write. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-nested-reef.md -->
# Security review (round 2) — catalogue-go-live-min

Scope: branch diff `d8f994aa..HEAD` (`feat/catalogue-go-live-min`), 11 commits. Round 1
covered commits 1–9 (`07r1-review-security.md`, no findings). This round re-reviews the
whole feature diff, with attention on the two new fix commits:

- `f87458af` — single-write convergence, verify fails on problems, slug-safe replace, drift
  field names, fixture verify query, family/category references
- `fc97a962` — `disabled: false` on sheet patches, withdrawn set as the complement of the
  sheet, `isDeepStrictEqual` compare, `ifRevisionID` preconditions, identity-collision guard

Code surface changed by the feature:

- `scripts/catalogue/go-live-plan.mjs` (new, 639 lines) — pure sheet data, `plan()`, `assertSafe()`
- `scripts/catalogue/apply-go-live-min.mjs` (new, 156 lines) — Sanity query/mutate I/O, token, CLI
- `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs` (tests only)
- `docs/runs/catalogue-go-live-min/rate-cards.sql` (operator-applied D1 file)
- `package.json` (one `test:go-live` script + the suite added to `test:pure`), `CONTEXT.md` prose

No change to `worker/**`, `src/**`, or `migrations/**`. No new endpoint, no new auth or
authorization logic, no new user-supplied input reaching a server.

## Findings

**None at HIGH or MEDIUM confidence.**

## What was examined and cleared

### New in this round

- **Revision preconditions — `go-live-plan.mjs:439-442`, used at 502, 565, 581, 595, 605.**
  `withRev()` refuses to emit a patch for a document fetched without `_rev`, and every patch
  now carries `ifRevisionID`. This is strictly a safety improvement (it closes a
  lost-update window between read and write); it introduces no new input path.
- **Identity-collision guard — `go-live-plan.mjs:557-562`.** A create target whose slug
  already exists under a different `_id` becomes a named problem instead of a patch aimed at
  the wrong document. Improvement; no new surface.
- **`isDeepStrictEqual` replacing string equality — `go-live-plan.mjs:434`.** Structural
  comparison of plain data read back from Sanity. `isDeepStrictEqual` does not invoke
  getters or proxies on plain JSON-parsed objects; no prototype-pollution or
  deserialisation path is introduced.
- **Withdrawn set as the complement — `go-live-plan.mjs:591-599`.** Iterates the fetched
  product map and patches `disabled: true` for anything off the sheet. Writes one boolean
  field; `assertSafe()` still gates the resulting mutations.
- **`disabled: false` on sheet patches — `go-live-plan.mjs:537`.** A catalogue visibility
  flag, not an access-control flag; the offerability gate it feeds is a merchandising rule.
  Nothing here bypasses an authorization check.

### Already cleared in round 1, re-checked against the current code

- **SQL injection — `rate-cards.sql`.** 54 lines of static literals; no interpolation, no
  host-side generation. Every statement is `UPDATE`/`INSERT` on `pricing_rate_card`; no
  `DELETE`/`DROP`/`ALTER` appears. Applied by the operator via `wrangler d1 execute --file`,
  never by served code.
- **Command injection.** Neither new script imports `node:child_process` or shells out; the
  T5 scan test asserts this mechanically. The CLI surface is two boolean `process.argv` flags.
- **Credential handling — `apply-go-live-min.mjs:29-36`.** `resolveToken()` reads
  `SANITY_WRITE_TOKEN` or the local Sanity CLI config, matching the existing
  `scripts/catalogue/import-wers.mjs` pattern. The token only ever goes into an
  `Authorization` header against the hardcoded host `https://xjtrm1ex.api.sanity.io`
  (`PROJECT_ID`/`DATASET`/`API` are module constants — no data-controlled host, protocol, or
  path, so no SSRF). Never logged; error paths log an HTTP status and a 300-char body slice
  returned by Sanity.
- **Query parameterisation — `apply-go-live-min.mjs:39-47`.** GROQ params are passed as
  JSON-encoded `$name` query-string values, not concatenated into the GROQ source. The GROQ
  text is a constant literal at every call site, including the two new `fullProfiles` and
  `options` projections.
- **Destructive-write guard — `go-live-plan.mjs:616-633`.** `assertSafe()` re-validates the
  computed mutation list against a fixed allow-list before anything reaches the network,
  rejects `drafts.*` targets, rejects any `slug`/`slug.*` set key, rejects `createOrReplace`
  of a `product`, and now also rejects patch keys other than `id`/`set`/`ifRevisionID`.
  `run()` refuses to write while `problems` or `violations` are non-empty
  (`apply-go-live-min.mjs:133-143`).
- **Patch path built from a document `_key` — `go-live-plan.mjs:506**,
  `` set[`rows[_key=="${r._key}"].published`] ``. The `_key` comes from `thermalProfile`
  documents authored by authenticated CMS editors, not from customer or anonymous input, and
  the worst outcome is toggling `published` on another row of the same document the editor
  already controls. No untrusted source, no privilege gain — not reported.
- **PII / financial data.** Nothing here touches accounts, payout or bank details, ABNs,
  sessions, uploads, or customer files. Rate-card figures are catalogue list prices, already
  public on the site.

## Note (not a security finding)

`--write` mutates the live `production` Sanity dataset and `rate-cards.sql` mutates production
D1 pricing. Both are operator-run and deliberately gated: the script defaults to a dry run and
refuses to write on any problem, and the SQL is non-idempotent by design so a second run aborts
on the primary key. That is change control, already covered by the deploy protocol, not a
vulnerability.
