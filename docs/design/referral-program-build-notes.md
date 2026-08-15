# Referral program — build notes

Facts found while building that aren't in the spec, the design, or any commit message.
Recorded because each one cost a debugging cycle to learn.

## Codebase behaviour

**Re-saving an identical line does not re-price it.** `PUT /api/projects/current/lines` with
unchanged content returns the stored `line_total` rather than recomputing. A test that seeds a
referral and then compares one account's price before and after will see no change and look like a
failure of the discount. Any pricing comparison needs either two separate accounts, or a changed
pricing-relevant field. This is also live corroboration for why `stripReferralFromDrafts` exists in
the design: stored totals do not notice that the world moved.

**Post-0047, seeding an `"order"` needs only three columns** — `id`, `project_id`, `order_no`.
`accepted_revision_id` is gone with the revisions removal. So putting a referral into the "used"
state is a single INSERT.

**Changing `user.type` after login does not invalidate the session.** `resolveUser` checks
`session_epoch`, not `type`. That is what lets the AC-5 test log in as a customer and then become
staff by SQL, without a separate staff login flow.

**`wrangler d1 execute --json` prefixes a banner before the JSON.** `JSON.parse` on the raw stdout
throws. Slice from the first `[`.

**`wrangler d1 migrations apply` accepts `-c <config>`, and `migrations_dir` resolves relative to
that config file's directory** — not the cwd. This is how the AC-49c check builds a database at
0050, fingerprints it, applies 0051 and fingerprints again without touching the repo's own
`migrations/`. Reusable for any future "prove this migration is additive" test.

## Test harness

**`referral-lifecycle.test.mjs` holds two different setups in one file, deliberately.** The migration
block uses `d1 execute` only and boots no server; the T3 block boots vite plus `wrangler dev`. Don't
merge them — the migration block is fast and would triple in cost.

**Budget ~3 minutes per red/green cycle.** `test:referral` is ~130s, and the T3 server harness adds
~45s on top.

**Test bundles use `export * from …`, not a named-import list.** A function that doesn't exist yet
then arrives as `undefined` and fails an assertion, which is a legitimate red. A named import of a
missing symbol instead breaks the esbuild bundle with a resolution error, which is noise rather than
a failing test.

## Known gap, carried deliberately

**`referrerGate.missing` is not implemented.** The design's §10.2 specifies
`missing: ('abn'|'bank_details')[]`; the route currently returns only `{ complete }`. It was dropped
during T3 because the red at the time didn't drive it. **T5's account screen needs it** — it is the
difference between "add your ABN" and "you are not eligible", and spec §8.3 is explicit that the
details-missing state must not read as a failure. Close it with its own red before T5's UI work.

## Ticket ordering within T3

Departs from the design's table in one place, for reasons found during the build:

1. **Payout-details endpoint before `/r/<CODE>`.** It is the only thing that makes the D18 gate
   exercisable end to end — every code test currently seeds `user` via SQL, which is the one place
   the tests diverge from how details actually arrive. It also carries the `payout_details_access`
   write, so the log gets exercised early rather than bolted on at the end.
2. **`findOrCreateUser` hook and AC-7 next.** Smallest piece, regression-critical, and structural:
   the create branch never sees the code for an existing user, so AC-7 holds by construction rather
   than by check. Worth landing while it is cheap.
3. **Build `recordReferral` once, through the manual claim path.** It is shared by both capture paths
   (design §6.3), and the claim route is far easier to drive in a test than a cookie round trip. The
   link path then calls the same function.
4. **`/r/<CODE>` last.** It is a worker-level route inside `route()` in `worker/index.ts`, not a Hono
   handler, so it has the highest blast radius in the ticket — a mistake there affects request
   routing for the whole site. Do it when everything it depends on is already proven.

## For the tester

**The pricing work wants the hardest re-check.** AC-49 holds on all four parts, but the golden corpus
only protects `computePrice` directly. It is `loadAccountDiscount` that now sits under every pricing
surface, and its second caller (`priceLine`) is exercised far less by the corpus than the first.
