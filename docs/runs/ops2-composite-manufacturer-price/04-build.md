# Build log

## t1 - recomputeComposite loses ownership of a priced parent's total

Files: `worker/lib/composite.ts` (recomputeComposite only), `scripts/tests/api.test.mjs`
(two new tests after the composite journey, line ~927).

Parent SELECT now reads `price_calculated, line_total`. `owned = parent.price_calculated
== null`; `effectiveTotal = owned ? total : parent.line_total`. Final UPDATE binds
`effectiveTotal` everywhere it bound `total` (line_total slot, status derivation, review
CASE) — never writes `price_calculated`. Empty-segments (merge) branch untouched, so a
merged priced parent keeps its price for free.

Tests assert: seeded price_calculated survives reprice/resize/add/remove/merge on
segments while qty/coverage_delta_mm/status still re-derive; unseeded parent still
equals Sigma(segments) after a unit reprice. `npm run typecheck:gate` clean, full
api.test.mjs green (29/29).

Next task (PUT /lines/:id/price, ops.ts): the 409 on a composite parent, the `calculated`
fallback, and clearing-recomputes are untouched by t1 — that's t2's job per design §2.2.

## t2 - PUT /lines/:id/price accepts a composite parent; clearing recomputes; abuse cases executed

Files: `worker/routes/ops.ts` (PUT price route 1414-1495; GET /projects/:id payload).
`scripts/tests/api.test.mjs` (line-593 409 replaced; new t.test after t1's blocks;
wrangler dev gains `MANUFACTURER_EMAIL_DOMAINS:partner.example` for a real partner login).

409 dropped; `calculated` falls back to sent `total` when Σ(segments) was NULL (parent
only); clearing on a `composite_parent` re-runs `recomputeComposite` so the restored
figure is the CURRENT sum (NULL if a segment stays unpriced), not the frozen one; the
`fresh` SELECT (for both response and audit) moved after that recompute so the audit
`after` is the real outcome. `project.linesEditable = ISSUABLE_FROM.has(status_internal)`
added to GET /projects/:id.

Test asserts: 200 + unmultiplied total + price_calculated fallback on an unpriced sum;
second override keeps the FIRST captured `calculated`; clear → NULL sum + audit
`{lineTotal, calculated}` only; unauthenticated/customer/manufacturer-partner all 403
with no row change (partner via a real `/api/ops/auth` sign-in, domain now configured
in the wrangler --var). `npm run typecheck:gate` clean, api.test.mjs 79/79.

Next task (t3, ops2 model + door): payload field is `linesEditable` — build `LinePage`'s
`editable={!isOrder && record.linesEditable}` against that exact name.

## t3 - ops2 Price door follows the server's linesEditable; unit rows pinned price-free

Files: `src/ops2/projects/record.ts`, `src/ops2/projects/LinePage.tsx`,
`scripts/tests/ops2-record.test.mjs`, `scripts/tests/manufacturer-price.test.mjs`.

`ProjectRecord.linesEditable = p.linesEditable === true` (fail-closed: absent/string/false
all → false). `LinePage`'s Price door: `editable={!isOrder && record.linesEditable}`,
`lineKind !== "composite_parent"` clause deleted. `LineReview`/`Units` were already
price-free per unit (no code change needed there) — added to ops2-record.test.mjs's
bundle export and asserted no `$` in `line-units` for a composite parent both priced
and unpriced. Corrected manufacturer-price.test.mjs's stale "endpoint refuses a
composite parent" comment (t2 now accepts it) — no assertion changed.

`npm run typecheck:gate` clean; ops2-record.test.mjs 43/43, manufacturer-price.test.mjs
10/10. `ProjectRecordPage.tsx` still gates its own PricePanel on `lineKind` (not in this
task's file list) — untouched, flag if the next task expects it aligned too.

## t5 - Sharpen CONTEXT.md, record ADR 0017, fix the stale ops v1 comment

Files: `CONTEXT.md` (Manufacturer price entry), `docs/adr/0017-composite-parent-manufacturer-price.md`
(new), `src/ops/api.ts` (opsSetLinePrice doc comment, lines 196-198).

Docs-only, no gated dirs touched, no test added. CONTEXT.md: "for a whole line" now
names the composite-parent case explicitly; the "one-way: no clear action" sentence is
gone, replaced with clearing-restores-CURRENT-Σ(segments) + endpoint-only-per-owner-D1
wording. ADR 0017 records the ownership transfer (`price_calculated` non-NULL owns
`line_total`), the parent-PATCH re-arm kept as-is, and the fallback-to-sent-total on an
unpriced sum. `opsSetLinePrice`'s comment no longer claims a 409 refusal on composite
parents.

`npm run typecheck:gate` clean. Nothing left for this pipeline to touch — t5 was the
last task.
