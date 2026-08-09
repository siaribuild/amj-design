# Triage — third-party code review audit, 10 August 2026

Response to `docs/CODE-REVIEW-AUDIT-2026-08-10.md`. Every finding was re-verified
against the source at `cc3d959e` by an independent reviewer and then adversarially
challenged by a second reviewer; the load-bearing claims were reproduced by hand.
Nothing here is taken from the audit's own characterisation.

**Headline:** eight of ten findings are real, one is rejected, one is a deferred
config decision. The triage also surfaced **twelve issues the audit missed**, one of
which — a demonstrated bypass of the upload scanner — is more serious than anything
in the original report.

## Verdict summary

| # | Finding | Filed | Verdict | Actual |
|---|---|---|---|---|
| 1 | Admin bootstrap trusts first eligible mailbox | P1 | **Confirmed, worse** | **P1** |
| 2 | Direct ops access conflicts with Access config | P1 | **Rejected as filed** | P3 (different defect underneath) |
| 3 | Internal access is effectively flat | P1 | Confirmed as behaviour; it is a deliberate owner decision. The *documented* control is false | P2 |
| 4 | Structural scanning is not malware scanning | P2 | True but already-decided; **the real defect is different and worse** | **P1** |
| 5 | OTP sends lack source-based abuse control | P2 | **Confirmed, worse** | P2 |
| 6 | No security-header policy | P2 | **Confirmed** | P2 |
| 7 | Reference generation is concurrency-prone | P2 | **Confirmed, worse** | P2 |
| 8 | Test gate permits 47 TypeScript errors | P2 | **Confirmed, worse** | P2 |
| 9 | Deployment/testing docs have drifted | P3 | **Confirmed, worse** | P3 |
| 10 | Sanity build needs manual env setup | P3 | Right facts, wrong remedy | P3 |

---

## 1 — Admin bootstrap trusts the first eligible mailbox · CONFIRMED, P1

**Accepted, and escalated.** The audit filed this as a race. The race is real
(`worker/lib/staff.ts:57-58` and `:87-91` are both check-then-act with no
transaction), but it is the least important part.

**What the audit missed:** the admin claim is reachable *without passing Cloudflare
Access*. `worker/index.ts:164` forwards every `/api/*` path to the same Hono app on
**every** hostname — `isOps` at `:146` only selects which SPA shell to serve.
`POST /api/ops/auth/verify` (`worker/routes/ops.ts:173-186`) checks only
`isStaffEmail` plus a six-digit OTP, then calls `findOrCreateInternalUser` at `:182`,
which contains the promotion. `accessConfigured` is computed in exactly two places in
the whole Worker (`staff.ts:122`, `ops.ts:200`) and neither guards these routes.

So `POST https://<customer-host>/api/ops/auth/verify` is a live, Access-free write
into the identity table. It creates the internal user, flips an existing customer row
to `type='internal'` (`staff.ts:70`), and fires the admin promotion. The comment at
`ops.ts:77` — "The perimeter is Cloudflare Access on the ops.* host" — is true for
reads and false for this write.

Four aggravators:

- **The bootstrap runs on every request, not every sign-in.** Under Access,
  `staff.ts:127` calls `findOrCreateInternalUser` on *every* authenticated ops
  request, falling through to `bootstrapAdmin` at `:85`. One console page load fires
  many. The re-arm window is milliseconds wide and needs nobody to sign in.
- **No last-admin guard.** `PATCH /api/ops/staff/:id` (`ops.ts:1779-1791`) will demote
  the only admin, including self. `anyAdminExists` goes false and the door re-arms on
  an established system.
- **The Access path never normalises the email.** `staff.ts:170` returns
  `payload.email` raw into a `WHERE email = ?` lookup, and
  `migrations/0001_customer_core.sql:21` declares `email TEXT NOT NULL UNIQUE` with no
  `COLLATE NOCASE`. `isStaffEmail` lowercases only the domain half. An IdP emitting
  `Ged@openframe.com.au` mints a *second* user row — and on a fresh DB that duplicate
  is what gets promoted. The runbook's own recovery procedure matches on
  `lower(email)`, so it would promote a row a later assertion never resolves to.
- **The bootstrap's stated rationale is stale.** `staff.ts:49-51` claims a fresh
  deployment is "locked out of every role-gated surface (customer PII, files,
  payments, role assignment)". True when it shipped (`599ba09a`); false a week later
  when roles were flattened (`d5e515e3`). Only role assignment is actually gated.

**Where the audit is wrong:** "after a production reseed" is half wrong.
`scripts/db/seed.sql:19-20` seeds two *named* admins, so a fixture reseed makes the
bootstrap a no-op. Only the documented do-not-seed-prod path leaves the window open.
That is also why the branch has zero test coverage — `api-edge.test.mjs:23` loads that
seed, so `anyAdminExists` is always true under test.

### Plan

1. **Close the un-Access'd write path.** In `worker/routes/ops.ts`, return 404 from
   `/auth/challenge` and `/auth/verify` when `env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD`.
   In production these already mint a session that `staff.ts:123-129` ignores, so
   nothing usable is lost and the OTP fallback stays for local/staging. Highest
   value-to-risk change in the whole triage.
2. **Normalise the Access email.** `normEmail(email)` at `staff.ts:127`. Two characters.
3. **Make the claim atomic.** Rewrite `bootstrapAdmin` as one conditional statement —
   `UPDATE user SET role='admin' WHERE id=? AND role IS NOT 'admin' AND NOT EXISTS
   (SELECT 1 FROM user WHERE type='internal' AND role='admin')` — and read
   `meta.changes`. SQLite executes one statement atomically; no `batch()` needed.
   **Do not** add `AND role IS NULL`: that silently removes the self-heal for an
   existing role-less staffer that `staff.ts:50-53` deliberately relies on.
4. **Same for the insert path** (`staff.ts:87-92`): compute the role inside the
   `INSERT ... SELECT` and re-select **by email**, so a concurrent same-email insert
   returns the winner's row instead of a UNIQUE violation and a bare 500.
5. **Add a last-admin guard** to `PATCH /staff/:id` — 409 when demoting the only admin.
6. **Correct the rationale comment** at `staff.ts:48-54` and the two runbooks that
   assert the opposite (`DEPLOY.md:86`, `PRODUCTION-DEPLOYMENT-VALIDATED.md:476`).

**Test note:** do *not* try to reproduce the race with `Promise.all` against
`wrangler dev --local` — that is one SQLite file behind one Miniflare worker; the test
would either never fail or fail intermittently. Assert the SQL and `meta.changes`
directly in `scripts/tests/unit.test.mjs`, which already bundles `staff.ts`. The
Access-gate regression (challenge/verify return 404, no new staff row) *does* belong
in `api-edge.test.mjs` with a Worker booted with the Access vars set.

**Owner decision required:** keep a bounded auto-bootstrap (atomic + Access-gated +
last-admin-guarded), or move to the named out-of-band admin the runbooks already
describe (`BOOTSTRAP_ADMIN_EMAIL`). Recommendation: the former — it is less ceremony
and, once step 1 lands, the exposure is bounded to identities Access already admits.
If the latter, it must ship *with* the doc fix or a fresh deploy has no admin at all.

Effort: **M**.

---

## 2 — Direct ops access conflicts with Access config · REJECTED as filed

**Rejected.** The auditor described the intended, commented, fail-closed design and
graded it as a fault. `resolveInternalUser` requiring a valid assertion when both vars
are set is deliberate (`staff.ts:96-101`, restated `ops.ts:191-199`, documented
`docs/OPERATIONS.md:82-86`) and was introduced *as* a security fix. There is no
evidence in the repo that Access was removed at the edge — the audit itself excluded
live Cloudflare state. Their second remedy ("remove both variables, accept the OTP
fallback") would revert that fix.

**But the file underneath it does have a real availability defect**, which the audit
missed and which produces exactly the total lockout it describes — with zero operator
error:

- `getJwks` (`staff.ts:176-184`) caches the team's whole key set in KV under one fixed
  key for 3600 s. `staff.ts:164-165` does `jwks.find(k => k.kid === header.kid)` and
  returns null on a miss with **no refresh and no cache bust**. When Cloudflare rotates
  Access signing keys, every ops request 401s for up to an hour.
- `getJwks` never checks `res.ok` (`:180-181`). A non-2xx or HTML body throws inside
  `res.json()`, is swallowed by the catch at `:171-172`, and every request 401s.
- No negative caching or single-flight: a certs-endpoint blip means every concurrent
  request re-fetches.
- The entire Access branch has **zero test coverage** — all three harnesses blank the
  vars (`api-edge.test.mjs:28`, `api.test.mjs:40`, `web-server.mjs:29`). That is why
  the rotation bug has survived.

### Plan

Reject the finding as written; document the fail-closed contract as intended
behaviour. Separately fix the JWKS path: on a `kid` miss, bust `access:jwks` and
re-fetch **once** before returning null; add `if (!res.ok) return []`. ~6 lines,
removes a one-hour outage class. Add coverage for a well-formed assertion whose `kid`
is absent — note that a "garbage assertion → 401" test passes today without exercising
this, because it short-circuits on `alg`/`iss`/`aud` before `getJwks` is reached.

Sequencing conflict to respect: this finding's regression test needs
`/api/ops/auth/verify` working in Access mode, which finding 1 step 1 turns off. Land
finding 1 first and write this test against a Worker with the vars blank.

Effort: **S**.

---

## 3 — Internal access is effectively flat · CONFIRMED as behaviour, P2

**Accepted, but not as an authz finding.** The behaviour is exactly as described —
`ops.ts:92-97` aliases `hasAssignedRole`, `canRecordPayment`, `canIssueQuote`,
`canAdjudicateThermal` all to `isStaffUser`; `ops-pricing.ts:37-40` collapses
`view`/`edit`/`admin` to `!!s`; `resolveStaff` already excludes manufacturers, so every
downstream check is a tautology. Only two endpoints test for admin (`ops.ts:1145`
customer email change, `ops.ts:1783` role assignment).

But this is an **owner decision dated 2026-07-28**, commented across 23 lines at
`ops.ts:68-90`, explained in commit `d5e515e3`, consistent with
`docs/ops-console-plan.md:19`, and pinned by a named regression test with an explicit
tombstone for the RBAC test it replaced (`api-edge.test.mjs:490-502`, `:860-863`). The
auditor's recommendation asks for a decision that was made thirteen days before the
audit, in favour of their first option.

**What survives as a genuine defect is a truth problem.** Four documents and one UI
screen assert enforcement that does not exist:

- `docs/DEPLOY.md:85-93` — every clause false.
- `docs/PRODUCTION-DEPLOYMENT-VALIDATED.md:487` — "assign least-privilege roles".
- `worker/lib/staff.ts:48-54` — the stale bootstrap rationale (see finding 1).
- `worker/routes/ops-pricing.ts:7-12` — a header promising `write — manager | admin`
  sitting sixteen lines above the block that says the opposite.
- `src/ops/AdminTabs.tsx:126-134` — a four-way role dropdown under "Only admins can
  change roles". Assigning `estimator`/`technical_reviewer`/`manager` changes nothing.
  An operator applying least privilege gets none, and no feedback that none applied.

**And the compensating controls the design leans on are client-side only.**
`ops.ts:78-81` justifies dropping roles by substituting confirmations. Neither is
enforced server-side: the ±20% rate-card tripwire lives entirely in
`src/ops/Pricing.tsx:570`, and `POST /orders/:id/pay` accepts a missing reference
(`ops.ts:1088`, `orders.ts:255-261`).

**Also:** `MANUFACTURER_EMAIL_DOMAINS` is **not set in `wrangler.jsonc` at all**. With
it unset nobody is classified as a manufacturer, so `isStaffUser` degenerates to
`!!staff` and there is currently *no* in-app role boundary whatsoever beyond `isAdmin`.
The one boundary the design says is worth having is not configured.

Two further gaps found in triage: bulk PII reads and file downloads
(`ops.ts:1103`, `:1168`, `:1196`, `:1745`) call `logEvent` **nowhere**, so exfiltration
by a role-less internal user leaves no audit trail; and `GET /api/ops/staff`
(`ops.ts:1777`) lets any internal user enumerate every staff id, email, name and role —
which is precisely the reconnaissance input for finding 1.

### Plan

**Slice A — truth-up (S, no behaviour change).** Rewrite `DEPLOY.md:85-93` and
`PRODUCTION-DEPLOYMENT-VALIDATED.md:476/487` to state the real model, with the sentence
the runbook actually needs: *scope the Access policy to named users, not the domain,
because the app applies no further restriction.* Delete `ops-pricing.ts:7-12`. Fix the
`staff.ts:48-54` comment. Set `MANUFACTURER_EMAIL_DOMAINS` or document that no
manufacturer boundary is active.

**Slice B — stop advertising what does not exist (S).** `ops.ts:1775` should stop
returning the four-value role list; `src/ops/AdminTabs.tsx` should become an admin
toggle. Resolve `worker/routes/quote.ts:298-306` — the last surviving named-role list
in the Worker, which still omits `technical_reviewer` (the exact bug `d5e515e3` claimed
to fix) while `src/ops/api.ts:245` routes around it to the flat `/api/ops` door. Delete
it or flatten it; leaving two doors with two policies is the worst option.

*Not recommended:* mechanically renaming the 38 alias call sites. Zero behaviour
change, guaranteed conflicts with any concurrent branch, and the aliases are already
explained by the comment directly above them.

**Slice C — make the stated controls real server-side (M).** Add `logEvent` to the PII
and file-download reads. Move the ±20% tripwire into `ops-pricing.ts`. Require a
non-empty payment reference.

**Do not** make `expectedVersion` mandatory in `pricing-admin.ts:58` — two call sites
deliberately pass none: the revert endpoint (`ops-pricing.ts:293`) and the
first-ever option-surcharge insert (`:378`, explained at `:370-375`). Mandatory
checking breaks both.

**Owner decision:** whether a mandatory payment reference is wanted. A field people
type "n/a" into is a worse control than an optional one.

---

## 4 — Structural scanning is not malware scanning · the filed finding is deferred; **a demonstrated bypass is not** · P1

**The finding as filed is a config decision you already took** — the record at
`schedule-upload-live.md` defers external AV explicitly. The `remote`/`both` engine is
fully implemented (`worker/lib/scan/remote.ts`), correctly dispatched
(`scan/index.ts:16-26`), and enabling it is a `wrangler.jsonc` edit plus a secret. The
enforcement around it is genuinely strong and the audit gives it no credit: scanning
happens *before* persistence (`files.ts:208-233`), there is exactly one insert path and
one R2 write, both download routes serve `clean` only, and the parser refuses non-clean.

**But the scanner's own primary guarantee is false, and I reproduced it.**
`structural.ts:3-8` states: *"Type allowlist by SNIFFED bytes (never the client's
declared type) — executables, archives and macro containers never get stored."*

`looksTextual` (`structural.ts:39-47`) inspects only the first `MAX_SNIFF = 8192`
bytes — `b.subarray(0, MAX_SNIFF)`. `sniffType` falls through to it when no magic
matches. Prepend 8 KB of printable ASCII to any binary and it returns `"text"`.
Executed against the real module:

```
bare ZIP (PK)              sniff=null   -> infected / type_not_allowed
ZIP + 8KB ASCII prefix     sniff=text   -> clean / type_text
bare PE (MZ)               sniff=null   -> infected / type_not_allowed
PE + 8KB ASCII prefix      sniff=text   -> clean / type_text
macro doc .docm + prefix   sniff=text   -> clean / type_text
plain .hta script text     sniff=text   -> clean / type_text
```

ZIP and every OOXML container are parsed from the End-of-Central-Directory record at
the **tail**, which is why self-extracting archives work — a prefixed archive still
opens normally in Explorer, 7-Zip and Office. The exact artefact the header says never
gets stored is stored, marked `clean`, and served to staff via `ops.ts:1745-1758`.
Flipping `SCAN_ENGINE=both` would not close this: a novel macro document has no
signature.

The test suite currently **certifies the false guarantee** — `scan.test.mjs:73` asserts
an EXE is refused, which is true only for an unprefixed one.

### Plan

1. **Fix the sniff scope (S, the actual fix).** When nothing in `SIGNATURES` matches,
   run the control-byte check over the **whole buffer** rather than the 8 KB window.
   One O(n) pass on a path that already SHA-256s the entire file (`files.ts:206`).
   Optionally also reject `PK\x05\x06` / `Rar!` / `7z\xBC` appearing anywhere.
   *An extension deny-list does not work here* — a prefixed polyglot can be named
   `plans.pdf`; the name is entirely attacker-controlled.
2. **Make rescan quarantine, not delete — do this first.** `POST /api/ops/files/:id/rescan`
   (`ops.ts:1214-1231`) runs `FILES.delete(fa.r2_key)` on an `infected` verdict, and
   `files.ts:227` is the only write, so the R2 object is the only copy. Tightening the
   scanner without this turns the hardening into an irreversible data-loss event on the
   existing corpus. Same hazard applies to any future AV false positive.
3. **Close the engine-selection footgun (S).** `scan/index.ts:19` — `SCAN_ENGINE=remote`
   skips the structural allowlist entirely, so acting on the audit's advice imprecisely
   makes the system *weaker* than today. Validate the value as a union, fail closed on
   anything unrecognised (`index.ts:22` currently degrades silently), and run the type
   allowlist under `remote` too.
4. **Cover the remote engine** in `scan.test.mjs` — currently untested. Stub
   `globalThis.fetch`; assert all four response shapes, timeout, non-2xx, and that AV
   `infected` wins under `both`.
5. **Then** the deferred ops action: procure an AV endpoint, set `SCAN_ENGINE=both`,
   validate with EICAR end to end.

**Also file separately:** `ops.ts:1758` interpolates `fa.filename` raw into
`Content-Disposition` where `files.ts:552` sanitises it, and omits the
`Cache-Control: private, no-store` that `files.ts:557` sets — so staff-downloaded
customer PII is shared-cacheable.

---

## 5 — OTP sends lack source-based abuse control · CONFIRMED, P2

**Accepted, and worse than filed.** `challengeAllowed` (`worker/lib/auth.ts:74-86`)
takes only `email`. Neither caller reads `CF-Connecting-IP` or a captcha
(`auth.ts:30`, `ops.ts:157`), and there is no `unsafe`/`ratelimit` binding.

Three things the audit understated:

- **Access does not shrink this to the customer path.** `/api/ops` is mounted on every
  host (`index.ts:79`) with no host guard, so
  `POST https://<customer-host>/api/ops/auth/challenge` reaches the ops OTP sender with
  no Access assertion.
- **The ops variant aims the damage at your own sending domain.** `isStaffEmail` bounds
  recipients to `openframe.com.au`, but the local part is attacker-chosen. Rotating
  `a@`, `b@`, `c@` produces guaranteed hard bounces at the domain that sends quotes and
  orders — which is exactly what gets a Resend sending domain throttled.
- **The per-address cap is not a floor.** `challengeAllowed` is a non-atomic KV
  read-modify-write — `get` at `:81`, `put` at `:84`, no CAS, and KV is eventually
  consistent. N parallel POSTs for one address all read 0 and all send. The 60 s
  cooldown is worse still: it depends on reading a record written milliseconds earlier
  by `storeChallenge`. **A single victim is mail-bombable today**, by concurrency alone.

Every accepted challenge also INSERTs a `notification` row (`email.ts:87`) regardless
of send outcome, so this drives unbounded anonymous D1 growth too.

### Plan

Both layers reuse patterns already proven in this repo — no new infrastructure.

1. **Per-source throttle.** Add `sourceIp(req)` and `challengeSourceAllowed(env, ip)`
   to `worker/lib/auth.ts`, keyed `otpip:{ip}`, same shape as `enquiries.ts:69-73`.
   Keep it a *separate* function so `challengeAllowed`'s per-address semantics and
   tests stay byte-identical. Apply in both challenge routes, sharing one counter so
   rotating between endpoints does not double the budget. Return 429 — it is a
   statement about the source, so it leaks nothing and the anti-enumeration contract at
   `auth.ts:26` is preserved. Cap generously (corporate NAT shares one address).
2. **Turnstile.** Lift `verifyTurnstile` out of `enquiries.ts:22-32` into
   `worker/lib/captcha.ts`, call it from both challenge routes gated on
   `env.TURNSTILE_SECRET` — the same gate that already makes it inert in every test
   harness. Reuse the `useTurnstile` hook from `ContactPage.tsx:36-63`.
3. **Required, or the suite breaks:** give `login()` in `scripts/tests/helpers.mjs` a
   distinct `X-Forwarded-For` per call. ~31 logins currently share `ip = 'unknown'`.
4. Clip addresses to 254 chars in `normEmail` — KV keys are built from the raw address
   and reject over 512 bytes, so a long address currently 500s instead of returning the
   neutral 200.

Note the concurrency hole in the per-address cap is **not** fixed by any of this; it is
inherent to KV. Accept it (the IP cap becomes the real floor) or move the counter to
D1. Recommendation: accept, and say so in a comment.

Effort: **M**.

---

## 6 — No security-header policy · CONFIRMED, P2

**Accepted.** All seven exit points in `worker/index.ts` return without touching
security headers. A repo-wide grep finds exactly three hits, all on private file
downloads (`files.ts:557`, `:559`, `ops.ts:1757`). No `public/_headers`, no
`_headers` anywhere, `vercel.json` is vestigial. Git history confirms it was never
attempted, and no comment records a deliberate omission — so unlike the Access gate and
the scan gate, the "deliberate and commented" defence does not apply.

### Plan

Add `worker/lib/headers.ts` exporting `securityHeaders({isOps, isHtml, isProduction,
isHttps})` and `applySecurity(res, opts)` that sets each header **only if absent**, so
`files.ts`'s stronger `Referrer-Policy: no-referrer` and `Cache-Control: private,
no-store` survive. Route all seven exits through it — including rebuilding the two
`Response.redirect` calls as `new Response(null, {status:301, headers})`, and cloning
`Headers` at `:184` where the ASSETS response's immutable headers are reused.

Be honest about the achievable CSP: `script-src` can be genuinely strict (`'self'` plus
Turnstile — verified zero `eval`/`new Function` in all five dist bundles), but
`style-src` must keep `'unsafe-inline'` because of the shells' inline `<style>`,
`chart.tsx:82`, and emotion/MUI runtime injection. Enumerate the real origins — Sanity
CDN, Unsplash, Carto basemaps, Turnstile, Google Fonts — or the site breaks. **Do not
set COEP**: the Carto tiles and Unsplash/Sanity images carry no CORP header and would
all fail.

Ship CSP as `Report-Only` first behind a single exported boolean, then flip. The
no-breakage set (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`,
`frame-ancestors 'none'`, `Permissions-Policy`, `COOP`, and HSTS in production) can go
straight to enforcing. Test in `scripts/tests/api.test.mjs`.

Fold in the `ops.ts:1757` filename-sanitisation fix from finding 4 while in the area.

Effort: **M**.

---

## 7 — Reference generation is concurrency-prone · CONFIRMED, P2

**Accepted.** Four generators, not the three filed — the audit missed
`quote_revision.revision_no` (`worker/lib/revisions.ts:155-162`), which has the same
shape.

| Generator | Site | On collision |
|---|---|---|
| Project `OF-Q-NNNNN` | `access.ts:20-25` → insert at `:78`/`:82` | uncaught `D1_ERROR` → bare **500** |
| Order `OF-NNNNN` | `orders.ts:149-152` → batched insert | **clean** — batch rolls back, `catch` at `:234` → 409 |
| Enquiry `OF-ENQ-YYYY-NNNNNN` | `enquiries.ts:87-90` | uncaught → **500** |
| Revision no. | `revisions.ts:155-162` | uncaught → **500** |

There is no `api.onError` anywhere in `worker/`, so three of four surface as a bare 500.

**The enquiry generator has a second, worse defect the audit missed:** it uses
`count(*)`, not `MAX()`. Delete one enquiry row and every subsequent submission
computes an existing reference, fails, and the count never advances — **the public
contact form wedges permanently and never self-heals**. Its per-IP throttle is also
written *before* the insert (`:79-80`), so a server-side failure burns the customer's
allowance and an immediate retry gets 429.

Order collisions have a second failure mode too: two *different* customers accepting
*different* quotes simultaneously collide on `order_no`, and the loser is told their
quote "may have just changed" when nothing changed.

### Plan

Assign every reference **inside** the INSERT and read it back with `RETURNING`. One
statement is atomic under D1, so the window disappears — no migration, no counter
table, and the human-readable sequential format the business quotes on the phone is
preserved. `RETURNING` + `.first()` is already proven here (`revisions.ts:33`,
`ai/jobs.ts:456`, `ops.ts:1322`).

Switch the enquiry generator from `count(*)` to `MAX()` — that is the actual bug there;
the race is secondary. Move its throttle writes to after a successful insert. Wrap
`revisions.ts:208`'s batch in try/catch returning 409, matching `orders.ts:234` — worth
doing first on its own, since it removes the 500 even if the inline change is deferred.

Rejected alternatives: bounded retry (still races, does nothing about the `count(*)`
bug); a sequence table (needs a migration plus backfill, loses gap-tolerance); random
suffix (breaks the phone-quotable format).

One unknown: whether `RETURNING` populates `results` inside a D1 `batch()`. Verified for
single statements only. If not, fall back to a follow-up select by primary key for the
orders and revisions cases; `access.ts` and `enquiries.ts` are single statements and
unaffected.

Effort: **M**.

---

## 8 — Test gate permits 47 TypeScript errors · CONFIRMED, P2

**Accepted, and the count is exact.** Reproduced: 47 errors — TS2339 ×25, TS2322 ×14,
TS2882 ×3, TS2345 ×3, TS5097 ×1, TS2353 ×1. `npm run typecheck:gate` exits 0. The whole
check runs in **~1.2 s** on TypeScript 7's native compiler, so there is no performance
argument for a reduced gate. There is no `.github/workflows/`, so a developer's local
`npm test` is the only gate that exists.

**This is not hypothetical — the backlog is hiding live defects.**

- **`offsetOperableRatio` is dead end-to-end.** `estimate.ts:341` passes `offset:` into
  `proposeSplit`, whose options type (`split.ts:434-438`) does not declare it — and
  `proposeSplit` builds a *fresh* literal downstream (`:471-481`) that drops it. The
  word `offset` does not occur in `split.ts` at all. The field is authored in Sanity
  (`schemaTypes.ts:182`), projected by GROQ (`catalogueQuery.ts:43`), typed
  (`catalogue.ts:54`) and read (`pairing.ts:119`) — and unreachable. **No value an
  editor types in that field can ever affect a proposal.** Where a family authors no
  `operableRatio`, offset units get 0.5 instead of 0.3.
- **Three input fields lost their behaviour.** `src/app/ui.tsx:112-125` neither declares
  nor forwards `onKeyDown`/`autoFocus` and has no rest-spread, so Enter-to-submit and
  OTP autofocus are dead across ten call sites in `App.tsx`. `src/ops/OpsApp.tsx:159,172`
  implement the same thing on a raw `<input>` and work — direct evidence this was an
  accident, not a removal.

Correction to a claim made in triage: the split proposal's `reviewRequired` flag is
**never read by the estimator** — it becomes an advisory string in `reviewWarnings`
(`estimate.ts:528`). The issuance gate (`revisions.ts:137`, `:141`) blocks only on a
null `line_total` or a `technical_review`/`incomplete` line status, neither of which a
split proposal sets. So a mis-split composite can be priced, materialised and issued on
an advisory note alone.

### Plan

**Commit 1 — fix the live defects (S).** Add `offset?: boolean` to the pairing options
type and forward it in the downstream literal. Add `onKeyDown`/`autoFocus` (and
`className` on `WindowMark`) to the `ui.tsx` prop types and forward them. Low risk:
every handler already self-guards (`if (!validEmail || busy) return`), so restoring
Enter cannot submit an invalid or in-flight form. Note `proposeSplit` has a second
caller (`ai/pipeline.ts:562`) that passes no options — the widened type must not be
duplicated there.

**Commit 2 — promote codes, do not build a ratchet.** `scripts/typecheck.mjs:15`
already documents the mechanism: *"To promote a code: fix its occurrences, move it into
FATAL, keep it green."* TS2353 has exactly one occurrence — fixed by commit 1, so
promote it in the same commit. Ten of the fourteen TS2322 are the `App.tsx` cluster;
the residue is four sites. Promoting both codes is **strictly stronger** than a
baseline ratchet — it fails on the first new occurrence rather than on an aggregate —
and it is the mechanism already chosen and used once (`85df431a`). A baseline JSON file
with a "count below baseline is stale" rule would make every unrelated refactor break
the only gate that exists, which trains people to skip it.

Cheap win in the same commit: print the existing per-code table from the `--fatal-only`
branch too. Four lines of code, and the backlog becomes visible on every `npm test`.

**Commit 3 — drain the residue (M).** Config errors first (`declare module "*.css"`,
drop the `.tsx` extension at `main.tsx:2`), then the typed API responses, then flip
`strictNullChecks` as its own commit — verified net effect 47 → 41, removing twelve
union-narrowing false positives and adding eight, four of which are genuine dead-code
reports in `parse.ts`.

**Regression test home:** `scripts/tests/estimator-split.test.mjs:397` already declares
a fixture with "every other knob absent on purpose" — exactly the shape in which the
offset defect bites. Add an offset case there asserting `offsetOperableRatio` reaches
the proposal.

---

## 9 — Documentation drift · CONFIRMED, P3 · with one P2 carve-out

**Accepted, and worse than filed.** All four operational docs were last touched
2026-07-19/20; HEAD is 360 commits and three weeks later. Nothing binds them to reality.

`PRODUCTION-DEPLOYMENT-VALIDATED.md:16-33` still opens "Current release status:
blocked" and lists eight blockers. All eight are closed or deliberately rejected —
verified individually. Further drift found: `DEPLOY.md:44-46` and `:98-100` are false
(`wrangler.jsonc:107` already sets `APP_ENV: production`); §1 never provisions the
queues, dead-letter queue or cron that `wrangler.jsonc:53-68` declares; `OPERATIONS.md:38`
names `demo@openframe.com.au`, absent from the seed; `:47` states the devCode condition
backwards; `:103` names branch `apertly-main` while HEAD is `main`.

**Carve-out — this one is a code defect wearing a docs costume, and it is P2.**
`scripts/reset-db.mjs` takes `--remote` straight from `argv`, hardcodes the deployed
database name, and runs `clear.sql` (a straight DELETE across every transactional table)
then `seed.sql` with **no confirmation, no TTY gate, no `APP_ENV` check, no `--yes`**.
`docs/OPERATIONS.md:32` lists the remote reset with no warning at all. A one-line
interactive confirmation removes the hazard at source for less work than the doc edit,
and does not depend on the operator having read the doc. Prose is not a control.

### Plan

1. **Guard `reset-db.mjs` first** — require an explicit confirmation token for
   `--remote`. Ship this independently of the doc work.
2. **One runbook.** Merge the still-correct sections of
   `PRODUCTION-DEPLOYMENT-VALIDATED.md` into `DEPLOY.md` (Resend verification, Sanity
   dataset/CORS steps, the secrets-file first-deploy technique, the smoke-test
   checklist, rollback + D1 Time Travel) and delete the former. `OPERATIONS.md` already
   cross-references `DEPLOY.md`, so it is the right survivor. Do the merge and the
   delete as **separate commits** so the diff is reviewable.
3. Rewrite the RBAC section per finding 3, the bootstrap section per finding 1. Add the
   missing queue/cron provisioning and the secrets beyond `RESEND_API_KEY`.
4. **A very small doc test** — only two assertions worth having: every `npm run <script>`
   token in the docs resolves to a real `package.json` script, and every email named in
   `OPERATIONS.md` appears in `seed.sql`. Both would have caught real drift found here.
   *Reject* the broader proposals: asserting the doc lists every `test:*` script or every
   `wrangler.jsonc` var turns a documentation omission into a red `npm test` for every
   developer, on the only gate that exists — which trains people to skip it.
5. **Do not "clean up"** `clear.sql:4-6`'s approval-table DELETEs. They look like drift
   and are not: `migrations/0033` states it drops no tables, for attribution reasons.

---

## 10 — Sanity build needs manual env setup · PARTIALLY CONFIRMED, P3

**Facts accepted, remedy rejected.** The requirement is real and broader than filed —
`sanity.cli.ts:3-7` throws at module scope, and every CLI command loads it, so `dev`,
`build` *and* `deploy` all fail without the variable, not just `build`.

The auditor recommends supplying the variable in CI. **There is no CI** — `.github`
does not exist and nothing in the repo builds the Studio. The correct fix is the
opposite of what they propose: **delete** the `|| "xjtrm1ex"` fallback in
`sanity.config.ts:41`. Git history settles it — commit `e2f6d8ba` added it "so the
Studio runs without SANITY_STUDIO_PROJECT_ID set", a goal it can never achieve because
`sanity.cli.ts` (committed earlier the same day, already containing the throw) always
loads first. It is unreachable dead code encoding a false belief, and exactly what the
no-hardcoded-fallbacks directive targets.

**The dangerous half both the audit and the first review missed:**
`sanity.cli.ts:12` and `sanity.config.ts:42` also carry
`dataset: process.env.SANITY_STUDIO_DATASET || "production"`. With `projectId` mandatory
and `SANITY_STUDIO_DATASET` unset, `sanity dataset import --replace` **silently targets
production**. Same file, same defect class, and it is the half that can actually hurt.
Fix both or the change is cosmetic.

### Plan

Three source edits, no test, no npm wiring — `tsconfig.json:35` excludes `sanity/` and
no test script touches it; crossing that boundary is not worth it for a P3.

1. Remove both fallbacks in `sanity.config.ts` (project *and* dataset); mirror the CLI's
   fail-closed guard. Do not use `!` — `sanity/tsconfig.json` sets `strict: true`, so a
   bare `process.env.X` fails typecheck, which is the point.
2. Same for the dataset in `sanity.cli.ts:12`. Add the two-line comment this codebase's
   convention calls for: dataset-mutating commands must never target an implicit project
   *or* dataset.
3. Add `sanity/.env.example` (tracked — `.gitignore` negates it) and fix
   `sanity/README.md:43`, which currently tells readers to edit `sanity.config.ts`.
4. Bump `sanity/package.json:17` `styled-components` to `^6.1.15` to match installed
   sanity 6.5.0's peer range. The lockfile already resolves 6.4.4, which satisfies both,
   so this is a manifest-only edit.

**Unrelated, worth a look:** `sanity/sanity-production-before-import.tar.gz` — a
production dataset export — is tracked in git.

---

## Issues found in triage that the audit did not report

| # | Issue | Where | Severity |
|---|---|---|---|
| N1 | Structural scanner bypassed by an 8 KB ASCII prefix; reproduced | `scan/structural.ts:40` | **P1** |
| N2 | Ops OTP routes reachable without Access on the customer host; write the admin bit | `ops.ts:173`, `index.ts:164` | **P1** |
| N3 | JWKS `kid`-miss and missing `res.ok` → up to 1 h ops outage | `staff.ts:164`, `:180` | P2 |
| N4 | `db:reset -- --remote` wipes deployed D1 with no confirmation | `scripts/reset-db.mjs:15` | P2 |
| N5 | `MANUFACTURER_EMAIL_DOMAINS` unset — the one real role boundary is inert | `wrangler.jsonc` | P2 |
| N6 | Access path never normalises email → duplicate identity, wrong admin | `staff.ts:127`, `:170` | P2 |
| N7 | Rescan deletes the only copy on `infected`; no quarantine | `ops.ts:1229` | P2 |
| N8 | Ops file download: raw filename in `Content-Disposition`, no private cache headers | `ops.ts:1757` | P2 |
| N9 | Per-address OTP cap bypassable — non-atomic KV read-modify-write | `auth.ts:81-84` | P2 |
| N10 | `offsetOperableRatio` dead end-to-end; a shipped Sanity field does nothing | `split.ts:471` | P2 |
| N11 | Sanity `dataset` defaults to `production`; `import --replace` targets it implicitly | `sanity.cli.ts:12` | P2 |
| N12 | PII reads and file downloads write no audit event; `GET /ops/staff` enumerates all staff | `ops.ts:1103`, `:1745`, `:1777` | P3 |

## Recommended order

1. **N1 scanner scope + N7 quarantine-before-delete** — the demonstrated bypass, and the
   guard that must precede any scanner tightening.
2. **Finding 1 steps 1–2 + N2** — 404 the ops OTP routes under Access; normalise the email.
3. **N4** — one-line confirmation on the remote DB reset.
4. **Finding 5** — OTP source throttle and Turnstile.
5. **Finding 8 commit 1** — the two live defects the type backlog is hiding.
6. **Finding 7** — reference generation, enquiry `count(*)` first.
7. **Finding 6** — header policy, Report-Only first.
8. **Finding 1 steps 3–5, finding 3 slices A/B, finding 2's JWKS fix.**
9. **Findings 9, 10, finding 3 slice C, finding 8 commits 2–3.**

## Release position

The audit's own recommendation stands, with one substitution: the blocking item is not
the flat-RBAC decision (which is deliberate and documented) but **N1** — the upload
scanner does not enforce the type allowlist it claims, and files that defeat it are
stored `clean` and served to staff.
