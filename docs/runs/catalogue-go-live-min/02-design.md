# Design — catalogue go-live minimum

Spec: `01-spec.md` (37 criteria). Inputs owned from here: `scripts/catalogue/apply-go-live-min.mjs`
(draft, 656 lines, dry-run validated live 2026-09-06), `docs/runs/catalogue-go-live-min/rate-cards.sql`
(already conforms to criteria 21–23 — **byte-identical in this feature's diff**), `PLAN.md`.

This feature ships tooling + tests, no production write. The diff touches only
`scripts/catalogue/**`, `scripts/tests/**`, `package.json`, `CONTEXT.md` — nothing under
`worker/**`, `src/data/**`, `migrations/**` (criterion 37).

## 1. Shape

The draft script's plan logic is correct (47 mutations, 0 problems against live) but untestable:
one 656-line `.mjs`, no exports, network I/O at top level. Split it in two:

| File | Role |
|---|---|
| `scripts/catalogue/go-live-plan.mjs` (new) | Deep module: all sheet data + pure plan logic. No I/O, no `node:fs`, no env. Everything criterion 29 must break lives here. |
| `scripts/catalogue/apply-go-live-min.mjs` (rewritten thin) | CLI adapter: token, Sanity HTTP over an injectable `fetchImpl`, `loadWorld`, `run()`, verify, `import.meta` main guard. |

Why the split (not just exports on one file): three of five build slices would otherwise all
carry the same 700-line file (task-cost bug), and the pure module imports nothing platform-bound,
so tests import it with zero network risk.

## 2. Affected files — hand-off index

| Path | Where the change lands |
|---|---|
| `scripts/catalogue/apply-go-live-min.mjs` | Whole file restructured. Content moving OUT to the plan module: lines 64–493 (vocabulary → `same`) and 511–613 (`plan`). Staying, reworked: header comment, `token()` L42 → `resolveToken`, `query`/`mutate` L43–60 → fetch-injectable, `loadWorld` L496–509 (+ full-profile fetch), `verify` L616–636 (reworked, §5), main L639–656 → `run()` + guard. `chunk` L61 deleted (§4 atomicity). |
| `scripts/catalogue/go-live-plan.mjs` | New. Receives L64–493 + L511–613 verbatim plus: `plan` returns `summary` (§4), NULL-options guard (§4), `assertSafe` (§4), `normProfile` + profile convergence (§5). |
| `scripts/tests/catalogue-go-live.test.mjs` | New. The suite criteria 26–33 name. |
| `scripts/tests/fixtures/go-live-world.mjs` | New. `makeWorld()` + `makeTransport()` (§6). |
| `package.json` | Add `scripts/tests/catalogue-go-live.test.mjs` to the `test:pure` list (L17) and add `"test:go-live": "node --test scripts/tests/catalogue-go-live.test.mjs"`. |
| `CONTEXT.md` | Append glossary term **Derived thermal row** (§8) near "Authored-as-none vs not-yet-authored". |
| `docs/runs/catalogue-go-live-min/rate-cards.sql` | **No change.** Read by the scan test only. |

Reference-only (do not modify): `worker/lib/pricing-admin.ts:33` (`nextVersion` semantics the SQL
mirrors), `scripts/catalogue/import-wers.mjs` (token-source precedent), `src/data/gst.ts`
(display arithmetic, criterion 24), `src/data/catalogue.ts:681` (`sellable`, disabled gate).

## 3. Interfaces

`scripts/catalogue/go-live-plan.mjs`:

```js
export { NEW_GLAZINGS, NEW_PROFILES, KEEP_PUBLISHED, P, DISABLE, DEFAULT_COLOUR, HW };
export { buildSpecs, buildKeySpecs, buildSeo, buildDimensionRule, alignHardware, rekey, same, normProfile };
export function plan(world)        // → { mutations, report, problems, summary: { amend, create } }
export function assertSafe(muts)   // → string[] violations; [] = safe
```

`scripts/catalogue/apply-go-live-min.mjs`:

```js
export function resolveToken(env = process.env)  // env.SANITY_WRITE_TOKEN ?? ~/.config/sanity/config.json authToken ?? null — never throws
export async function run({ write = false, verify = false, fetchImpl = globalThis.fetch, log = console.log, error = console.error } = {})  // → exit code 0|1
// CLI tail: if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await run({ write: --write, verify: --verify });
```

`world` shape: as today (`products` Map by slug, `families`, `categories`, `systems`,
`profiles`, `options`) plus `fullProfiles` — full authored-field rows for the six
`NEW_PROFILES` ids (§5).

## 4. Script changes, criterion by criterion

- **Summary line (criterion 1).** `plan` counts, in its product loop, sheet products that emit a
  patch (`amend`) and create targets (`create`); `run` prints
  `N amend target(s), M create target(s)`. Pre-write live state prints `21 … 1 …`.
- **Token pre-flight (31).** First statement of the write path in `run`: `resolveToken()`; on
  `null`, print `no Sanity write token: set SANITY_WRITE_TOKEN or log in with the Sanity CLI
  (~/.config/sanity/config.json)` and return 1 — **before any network request**.
- **Atomic write, no partial application (31).** Delete `chunk`; send all mutations in **one**
  `mutate(mutations)` call — one Sanity transaction, all-or-nothing (~47 mutations, well under
  API limits). The chunked 40-at-a-time write was itself the partial-application window.
- **`assertSafe(mutations)` (2, 32).** Pure allow-list; violations are strings naming the
  mutation. Rules: mutation keys ⊆ {`createIfNotExists`, `createOrReplace`, `patch`} (so any
  `delete` violates); `createOrReplace` never on `_type: "product"` (a replace can drop fields —
  an effective unpublish); `patch` keys ⊆ {`id`, `set`} (no `unset`); no `set` key equal to
  `slug` or starting `slug.`; no target `_id`/`id` starting `drafts.`. `run` calls it on every
  path: dry run prints violations and exits 1; `--write` aborts before sending anything.
- **NULL-options guard (8).** In the product loop: when `source?.options == null && !p.hardware`,
  omit `options` from `set` — not-yet-authored stays `NULL`, never becomes `[]`. When column H
  names hardware, the sheet has authored the list and writing it is correct.
- Everything else in `plan` moves verbatim: keyed row patches (9), problems → exit 1 naming the
  document (27), `disabled: true` as the only off-sheet field (3), colour defaults (17).

## 5. Convergent profiles and `--verify` (28)

Today step 2 pushes `createOrReplace` for the six `NEW_PROFILES` unconditionally, so a re-run is
never clean and a read-back cannot reuse the plan. Fix: `loadWorld` also fetches the six ids with
every authored field (`_id, name, "slug": slug.current, frameTechnology, rows[]{_key, _type,
glazing{_type,_ref}, uValue, shgc, published, tvw, heatingStars, coolingStars, wersWindowId,
certificationRef}`); `normProfile` builds the comparable object (authored fields only, `published`
defaulted `false`, absent keys dropped); step 2 emits the `createOrReplace` only when
`!same(normProfile(existing), normProfile(desired))`.

`--verify` then has one source of truth — the plan itself:

1. `loadWorld` + `plan` + `assertSafe`. Any remaining mutation is drift: print
   `DRIFT <documentId>: <changed field keys>` (patch → `Object.keys(set)`; create → `missing`).
   Names the document **and** field, as criterion 28 requires.
2. Keep the existing estimator-view GROQ table (apply-go-live-min.mjs L616–636 logic unchanged):
   selectable ⇔ on-sheet, published rows = 1, `pricingRef === slug`, 3 paragraphs.

Pass = zero drift ∧ zero bad rows. Rejected: an independent verify comparator — a second place
for every expectation, guaranteed to skew from the plan (one place per fact).

## 6. Test plan

New suite `scripts/tests/catalogue-go-live.test.mjs`, wired into `test:pure` and `test:go-live`.
Fixture `scripts/tests/fixtures/go-live-world.mjs`:

- `makeWorld()` — a `world` the plan accepts with 0 problems: all 21 existing sheet products
  (with options/dimensionRule/seo variety: one with a previously-standard hardware, one with
  `maxAreaM2`, one with `options: null` and no column-H hardware), the 11 disable slugs, systems
  `sys-72/80/100/150`, families/categories, all `KEEP_PUBLISHED` profiles with multi-row
  published state, colours incl. Night Sky, hardware ids from `HW`, and glazing option docs
  generated programmatically from `NEW_PROFILES` rows (so the fixture can never miss one).
- `makeTransport(world)` — fake `fetchImpl`: records every `{method, url, body}`; serves the
  script's GROQ queries by substring dispatch; POSTs are recorded, never sent anywhere. Also an
  `altered(world, docId, field, value)` helper for the criterion-28 failure case.

Checks → criteria (criterion 29's four named breakages each get a dedicated check that fails if
the plan logic is edited to break):

| Check | Criteria |
|---|---|
| plan on fixture: `summary` = 21 amend / 1 create; 0 problems | 1 |
| every mutation: no `delete`; `assertSafe(plan(...).mutations)` = []; injected `{delete:{id}}` / slug-set / product-`createOrReplace` each rejected | 2, 32 |
| off-sheet product mutation is exactly `{ set: { disabled: true } }` | 3, 29·nothing-deleted |
| `options: null` + no column-H hardware → no `options` key in the patch | 8 |
| keyed-row publish patches: exactly one row ends published per `KEEP_PUBLISHED` profile; a profile ending 0 or 2 published → named problem; kept row must carry Uw + SHGC | 9, 10, 27, 29·one-row-published |
| derived `NEW_PROFILES` rows: `certificationRef` starts `DERIVED`, no `wersWindowId`; the owning `P` entries carry `notes` repeating it; every `P` entry with `uw: null` has no `Uw` in `paragraphs` | 11, 12 |
| `P["amj80-series-awning-window"]`: profile `thermal-amj80t-thermally-broken-awning-window`, name `AMJ80ST Awning Window`; no mutation targets the `amj80-awning` profile | 13 |
| `P["amj80t-casement-door"]`: `tb: true`, glass 5+12A+5 | 14 |
| specs + keySpecs both carry a `Grade` row with the sheet value | 15 |
| `alignHardware`: column-H id becomes `standard`, previous standard becomes `optional`, list length never shrinks, non-hardware options untouched | 16, 29·hardware-alignment |
| colour mutations: Night Sky `isDefault: true`, every other colour `false`, none removed | 17 |
| AMJ72T pair + AMJ68 bi-fold patches reference `sys-80`; no mutation targets `sys-72` | 18 |
| `buildDimensionRule`: bounds replaced, foreign keys on the existing rule carried through, `maxAreaM2` recomputed; door minima 1900, AMJ80 slider max 2400 in `P` | 19, 29·dimension-rule-merge |
| no `set` contains a slug key anywhere in the plan; row 4 targets `amj80-series-awning-window` | 20 |
| `run({fetchImpl: fake})` dry run: **zero** POST requests recorded; mutations printed not sent | 26, 30 |
| `run({write:true})` with token resolved `null`: returns 1, zero requests recorded | 31 |
| `run({verify:true, fetchImpl})` on converged fixture → 0; on `altered(...)` fixture → 1 and output names the document and field | 28 |
| `rate-cards.sql` scan: no `\b(DELETE|DROP|ALTER|CREATE TABLE)\b` (case-insensitive, comments stripped); statements only `UPDATE pricing_rate_card` / `INSERT INTO pricing_rate_card`; UPDATEs carry the `nextVersion`-equivalent bump expression + `updated_at`; INSERTs start `'v1'`; `354.64` present, `322.40` absent (the ÷1.1 mistake) | 21, 23, 33 |
| `apply-go-live-min.mjs` + `go-live-plan.mjs` source scan: no `child_process`, no `wrangler` — no code path can reach remote D1 | 34 |

Existing suites carrying the regression criteria (no new code; tester runs them and the live
checks): `scripts/tests/catalogue.test.mjs` L175–200 (disabled resolves in ops, hidden from
public catalogue — 4, 5, 35), `scripts/tests/estimator-rules.test.mjs` L522–554 (estimator never
selects disabled, ops still reaches it — 4, 6), `scripts/tests/seo.test.mjs` L202+ (sitemap
excludes withdrawn — 5), `scripts/tests/unit.test.mjs` L837+ (GST inc/ex display arithmetic — 24).

**Local D1 rehearsal (22, 25 — executed in task T5, repeated by the tester):**

```bash
npm run db:migrate:local
npx wrangler d1 execute apertly-db --local --file docs/runs/catalogue-go-live-min/rate-cards.sql
npx wrangler d1 execute apertly-db --local --command "SELECT id, area_rate, version, active FROM pricing_rate_card WHERE id IN ('amj72t-awning-window','amj72t-fixed-window','amj80-series-fixed-window','amj100l-series-fixed-window','amj150st-awning-window','amj80st-fixed-window','amj100l-fixed-window','amj150-series-awning-window')"
```

Expect: the five new cards exist at `v1`; the three old differently-keyed cards still exist;
row count of `pricing_rate_card` never decreases. A second file run fails on the INSERT primary
key and, because D1 runs the file atomically, changes nothing — that is the designed guard.
Criterion 1's live dry run: `node scripts/catalogue/apply-go-live-min.mjs` (read-only, safe).

Criteria 36–37 are review checks (diff scope, untouched working tree), not tests.

## 7. Sequencing

1. **T1 — split + seams.** Create `go-live-plan.mjs` (move code verbatim), thin the CLI to
   `run()` + injectable fetch + main guard + token pre-flight + single-transaction write +
   summary line. Fixture + transport + first tests (1, 26, 30, 31). Wire package.json.
2. **T2 — safety guards.** `assertSafe` + NULL-options guard + their tests (2, 3, 8, 20, 32).
3. **T3 — plan-logic breakage checks.** The criterion-29 quartet and the field-level assertions
   (9–19, 27). Mostly tests; plan fixes only if a test exposes drift from spec.
4. **T4 — convergent profiles + verify rework** (28).
5. **T5 — SQL scan, no-remote scan, CONTEXT.md term, local D1 rehearsal, regression suites
   green** (21–25, 33, 34).

Each slice is red → green (Probity). After T5: full `npm test` + live dry run.

## 8. CONTEXT.md

Add (architect-owned):

> **Derived thermal row** — a thermal profile row whose Uw/SHGC are taken from the nearest
> WERS-rated sibling frame rather than a certificate. It states its basis in `certificationRef`
> (`DERIVED — <source>; not WERS-rated`), carries no `wersWindowId`, and the owning product's
> ops-only `notes` repeats the derivation. A Uw from a derived row is never quoted in
> customer-facing prose.

## 9. Security

- **Data classification.** Catalogue copy/specs: public. Rate-card figures: commercial —
  customer-facing GST-inclusive sale prices, public by design once live; stored exactly as typed
  (no arithmetic in this feature). The Sanity write token is a credential: read at runtime from
  env/CLI config, never logged, never committed, never embedded in fixtures. No personal or
  financial PII is touched.
- **Trust boundaries.** Developer machine ↔ Sanity API (HTTPS, bearer token; writes only under
  `--write`, behind `assertSafe`). Owner ↔ remote D1 via wrangler — outside every code path here
  (criterion 34, enforced by the source-scan test). Tests cross no boundary: fake transport only.
- **Authorization model per endpoint.** No app route is added or changed; no D1 query in app
  code changes; there is no account-scoping surface in this feature. Sanity mutation authority
  is the operator's own token against dataset `production`.
- **Abuse cases.** Destructive write (delete / slug change / product replace) → `assertSafe`
  aborts pre-send (32) + SQL scan (33). Partial application → token pre-flight (31) + one atomic
  transaction (§4) + atomic D1 file batch. Dry-run leakage → zero-POST transport test (26, 30).
  Withdrawn-product field leak to customer/manufacturer → existing `disabled` gate, regression
  suites named in §6 (5, 35). Price corruption via GST double-handling → literal-value SQL test
  (`354.64` not `322.40`) + existing GST display tests (21, 24). **Residual risk:** the Sanity
  CLI token on the developer machine is a standing credential this feature reads but does not
  create or widen.

## 10. Data model / migrations

No schema change anywhere. D1 change is data-only (17 UPDATE + 5 INSERT on `pricing_rate_card`)
via the owner-run SQL file — no `migrations/` file, no DDL, no table rebuild, so no cascade
surface (the scan test makes that structural). `d1-migration-safety` is not triggered: nothing
under `migrations/` changes (criterion 37).

## 11. Rejected alternatives

- **Independent `--verify` comparator** — duplicates every expectation the plan already encodes;
  replan-to-zero-mutations keeps one place per fact (§5).
- **Single file with exports + main guard** — kept the file count down but put a ~700-line file
  in three of five tasks and platform imports in the pure module; split wins on task cost and
  test isolation.
- **`@sanity/client` dependency** — plain `fetch` already works in the draft; no new dependency
  for two endpoints.
- **Keep chunked writes (40/batch)** — chunking is the partial-application window criterion 31
  forbids; one transaction is both safer and less code.
- **Automate the D1 rehearsal inside node:test** — spawning wrangler is slow, flaky, and mutates
  the shared local DB from a test; the rehearsal stays a commanded step (§6).
- **A migration for the rate cards** — forbidden (criterion 37) and wrong tool: data, not schema.

## 12. Decisions needed

None. The spec closes every open question (owner rulings 2026-09-06); `DECISIONS.md` is
intentionally absent.
