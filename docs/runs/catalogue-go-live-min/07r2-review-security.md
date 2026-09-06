<!-- Round 2 (after fix round 1, commit f87458af). Relocated by the conductor session: plan mode refused the reviewer's write to this path. Body verbatim from /c/Users/gedim_kwn20jy/.claude/plans/review-the-branch-diff-precious-wombat.md -->
# Context

The conductor asked for the round-2 `/security-review` of `feat/catalogue-go-live-min`
(branch diff `d8f994aa..HEAD`), with the report written to
`docs/runs/catalogue-go-live-min/07-review-security.md`.

Plan mode is active, so the write to that path is refused — the same regression the
round-1 reviewer hit (the existing `07-review-security.md` carries a header saying the
conductor relocated its body out of a plan file). The review itself is read-only and is
**complete**; only the write is blocked. The report body is below, verbatim, ready to be
copied to that path.

Round 1 covered 9 commits. Round 2 adds `508bfb76` (`--verify` replans against full
profiles, prints drift) and `f87458af` (fix round 1: single-write convergence,
slug-safe replace, family/category ref validation). Those deltas were re-reviewed in
full; the rest of the diff was re-confirmed against the round-1 conclusions.

# Plan

Write the body below to `docs/runs/catalogue-go-live-min/07-review-security.md`
(replacing the round-1 content), then reply with only that path.

---

# Security review — catalogue-go-live-min (round 2)

Scope: the branch diff `d8f994aa..HEAD` (`feat/catalogue-go-live-min`), 11 commits.
Round 2 re-reviews the whole feature diff, with the two new commits since round 1
(`508bfb76`, `f87458af`) examined line by line.

Code surface changed by this feature:

- `scripts/catalogue/go-live-plan.mjs` (new, 616 lines) — pure sheet data + `plan()`,
  `normProfile()`, `assertSafe()`
- `scripts/catalogue/apply-go-live-min.mjs` (new, 157 lines) — Sanity query/mutate I/O,
  token resolution, CLI
- `scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs`
  (tests only)
- `docs/runs/catalogue-go-live-min/rate-cards.sql` (operator-applied D1 file)
- `package.json` (adds the new suite to `test:pure`, adds `test:go-live`), `CONTEXT.md`
  (one vocabulary entry)

No change to `worker/**`, `src/**`, `migrations/**`, or any request-handling path. No new
endpoint, no new auth or authorization logic, no new user-supplied input reaching the
server.

## Findings

**None at HIGH or MEDIUM confidence.**

## Round-2 delta — what the two new commits changed, and why each clears

- **`loadWorld` gained a `fullProfiles` sub-query** (`apply-go-live-min.mjs:68-70`),
  parameterised `$profileIds` from `NEW_PROFILES.map(p => p._id)` — six module constants.
  GROQ params go through `qs.set(\`$${k}\`, JSON.stringify(v))`
  (`apply-go-live-min.mjs:41`), i.e. Sanity's parameter channel, not string concatenation
  into the GROQ source. The GROQ text remains a constant literal at every call site.
- **`--verify` now returns non-zero on planner problems and unsafe mutations before
  printing drift** (`apply-go-live-min.mjs:109-117`). Strictly a fail-closed addition.
- **`assertSafe()` gained three guards** (`go-live-plan.mjs:594-610`): reject any
  `slug`/`slug.*` set key, reject `drafts.*` create targets, reject `createOrReplace` of a
  `product`. Together with the existing allow-list (`createIfNotExists`, `createOrReplace`,
  `patch`) and the `drafts.` patch-target check, this is defence in depth on the write
  path, all of it additive.
- **Slug-rename refusal** (`go-live-plan.mjs:474-476`): a `createOrReplace` of a
  `thermalProfile` whose live slug differs from the planned one becomes a `problem`, and
  `problems.length` blocks the write (`apply-go-live-min.mjs:134-138`). Removes a
  clobber path rather than adding one.
- **Family/category reference validation** (`go-live-plan.mjs:517`): `p.family` and
  `p.category` joined the existence check. Additive.
- **Created-product options now derive from the copy source's *planned* state**
  (`go-live-plan.mjs:505-514`). Convergence behaviour; no new data crosses a trust
  boundary.

## What was examined and cleared

- **SQL injection — `rate-cards.sql`.** 54 lines, fully static literals; no interpolation,
  no parameters, no host-side generation. The version bump is an expression over the row's
  own `version` column. Every statement is `UPDATE`/`INSERT` on `pricing_rate_card`; no
  `DELETE`/`DROP`/`ALTER`/`CREATE TABLE` token appears. Applied by the owner via
  `wrangler d1 execute --file`, not by any served code path.
- **Command injection.** Neither new script imports `node:child_process` or shells out
  (re-verified by grep on the current tree); the T5 scan test asserts this mechanically.
  CLI surface is two boolean flags (`--write`, `--verify`) read from `process.argv`.
- **Credential handling — `apply-go-live-min.mjs:29-36`.** `resolveToken()` reads
  `SANITY_WRITE_TOKEN` or the local Sanity CLI config, matching the existing
  `scripts/catalogue/import-wers.mjs` pattern. The token is only ever placed in an
  `Authorization` header against the hardcoded host `https://xjtrm1ex.api.sanity.io`
  (`PROJECT_ID`/`DATASET`/`API` are module constants — no user- or data-controlled host,
  protocol, or path segment, so no SSRF). The token is never logged; error paths log only
  the HTTP status and a 300-char body slice from Sanity itself.
- **Patch path built from a document `_key`** (`go-live-plan.mjs:496`,
  `` set[`rows[_key=="${r._key}"].published`] ``). The `_key` originates from Sanity
  `thermalProfile` documents, i.e. from authenticated CMS editors, not from any customer
  or anonymous input, and the worst outcome is toggling `published` on another row of the
  same document — a document the same editor already controls. Not reported: no untrusted
  source, no privilege gain. (Unchanged from round 1; re-confirmed.)
- **PII / financial data.** Nothing in this feature touches accounts, payout or bank
  details, ABNs, sessions, uploads, or customer files. Rate-card figures are catalogue
  list prices, already public on the site.
- **Uncommitted working-tree changes.** The branch's working tree also carries the
  unrelated customer-site design-language port (37 files under `src/`, plus
  `src/styles/theme.css`). Not part of this feature's commits, but scanned anyway for
  `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, cookie/storage access
  and dynamic `href`/`location` writes: the only match is a `tel:` link whose number is
  stripped to `[^0-9+]` before interpolation (`src/pages/ContactPage.tsx`). Nothing to
  report.

## Note (not a security finding)

`--write` mutates the live `production` Sanity dataset and `rate-cards.sql` mutates
production D1 pricing. Both are operator-run and both are deliberately gated: the script
defaults to a dry run and refuses to write while any problem or violation stands, and the
SQL is non-idempotent by design so a second run aborts on the primary key. That is a
change-control property, already covered by the deploy protocol, not a vulnerability.
