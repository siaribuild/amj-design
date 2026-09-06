# Fix round 3 — round-3 review findings routed to the developer (2026-09-06)

READ BUDGET — 120k autocompact window. Read ONLY: this file;
`docs/runs/catalogue-go-live-min/rate-cards.sql` (whole, 60 lines);
`scripts/catalogue/apply-go-live-min.mjs` (whole); and `scripts/tests/catalogue-go-live.test.mjs`
IN SLICES (Grep for "rate-cards.sql" and read that block, lines ~470–510). Do not open the plan
module unless item 3 needs one function (Grep, then a short Read). Do NOT open any
`07-review-*.md`, `01-spec.md`, `02-design.md`, `06-verify.md` or `08-accept.md`.

Test-first. Files allowed: `docs/runs/catalogue-go-live-min/rate-cards.sql`,
`scripts/catalogue/apply-go-live-min.mjs`, `scripts/catalogue/go-live-plan.mjs`,
`scripts/tests/catalogue-go-live.test.mjs`, `scripts/tests/fixtures/go-live-world.mjs`,
`docs/runs/catalogue-go-live-min/04-build.md`. The ~38 uncommitted files from the other effort
stay untouched and uncommitted. Commit the finished work (feature files only) as ONE commit
before the session ends — run `npm run test:go-live` and `npm run typecheck:gate`, then commit.
Append a short "Fix round 3" section to 04-build.md.

## 1. rate-cards.sql must not collide with cards production already has (Codex P1) + reset the glass flag (Codex P2)

Evidence: the production backup `backup-2026-08-27-0059.sql` lines 5909–5912 already hold
`amj72t-awning-window` (0/273 v4), `amj72t-fixed-window` (0/191 v5),
`amj80-series-fixed-window` (0/241 v2) and `amj100l-series-fixed-window` (0/195 v2) — cards
the local D1 lacks. The file's INSERT of those ids would violate the primary key and abort the
whole atomic batch: nothing applied. The same backup shows 27 of 34 cards with
`glass_excluded_from_area_rate = 1`; the sheet's price includes glass, so every go-live card
must be stamped `0`.

The conductor has ALREADY rewritten `rate-cards.sql` into 22 upserts
(`INSERT … VALUES (…, 'v1', 1, 0) ON CONFLICT(id) DO UPDATE SET … glass_excluded_from_area_rate
= 0, version = 'v' || (CAST(substr(version, 2) AS INTEGER) + 1), updated_at = datetime('now')`).
Keep that shape (or improve it), and make the scan tests express the NEW invariants instead of
the old UPDATE-block/INSERT-block split:

- every statement is an upsert on `pricing_rate_card` (starts `INSERT INTO pricing_rate_card`,
  contains `ON CONFLICT(id) DO UPDATE`), exactly 22 of them, ids = the 22 sheet slugs;
- every statement's VALUES row starts the card at `'v1'` and every DO UPDATE clause carries the
  version-bump expression and `updated_at = datetime('now')`;
- every statement sets `glass_excluded_from_area_rate = 0` in both the VALUES row and the
  DO UPDATE clause;
- still no DELETE / DROP / ALTER / CREATE TABLE; 354.64 present, 322.40 absent.

Then rehearse on local D1 in BOTH paths: seed the four backup cards first
(`INSERT INTO pricing_rate_card (id, perim_rate, area_rate, min_charge, version, active,
glass_excluded_from_area_rate) VALUES ('amj72t-awning-window',0,273,0,'v4',1,0), …` with the
backup's values) so the ON CONFLICT path is exercised, apply the file, and read back: 22 cards
at perim 0, area = column J, flag 0; the four seeded ones at v5/v6/v3/v3; `amj150st-awning-window`
at v1. Record the read-back in 04-build.md. Re-running the file must succeed (it re-applies the
same figures and bumps versions again) — say so in the file header, which the conductor already
did.

Note on the version bump inside `ON CONFLICT … DO UPDATE`: an unqualified `version` there is
the EXISTING row's value in SQLite, which is what the bump wants; `excluded.version` would be
the incoming `'v1'`.

## 2. Reference lookups must exclude drafts (Codex P1)

`loadWorld` filters drafts on the product and family queries only. A draft `frameSystem`,
`option`, `thermalProfile` or `category` would enter the id maps and a published product could
end up referencing `drafts.…`. Today the only draft is `drafts.family-casement-door` (already
filtered), so the live plan is unaffected — but fix it: add `&& !(_id in path("drafts.**"))`
to every lookup in `loadWorld` (categories, systems, profiles, fullProfiles, options). Test:
a fixture world whose systems list carries a `drafts.frameSystem-sys-80` entry alongside the
published one → the plan references the published id only (or names a problem if only the
draft exists).

## 3. Validate fetched products before indexing them (Codex P2)

`products.map((p) => [p.slug.current, p])` throws on a product with no `slug`, and collapses
products with no `current` under `undefined`. Fix: index by `_id` first, then build the slug map
only from products with a string `slug.current`; a published product without one becomes a
named problem in the plan (criterion 27: exit non-zero, name the document). Test: a fixture
product with `slug: null` → problem naming its `_id`, exit 1, no mutation.

## Not routed (DEBT.md / runbook)

- Architecture round 3 finding 1 (existing new-profile documents replaced whole, no `_rev`):
  DEBT medium; harmless for the first production write; runbook has the re-run caution.
- Architecture round 3 finding 2 (cross-store reconcile): runbook step 3 (ops → Pricing →
  Reconcile after both writes).
- Codex P2 "revision protection on profile replacements": same as the first bullet.
- Ponytail round 3: DEBT low.
