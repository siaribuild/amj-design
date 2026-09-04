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
