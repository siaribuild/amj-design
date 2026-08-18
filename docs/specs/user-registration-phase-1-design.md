# User registration — Phase 1: design

Spec: `docs/specs/user-registration-phase-1.md` (revision 2, binding — 57 ACs).
Grill: `docs/specs/user-registration-grill-conclusions.md` (decisions D1–D10, A1–A4).
Author: architect. Date: 2026-08-18. Branch: `feat/user-registration`.

Status of "Decisions needed": **empty** (§14). Three spec deviations are proposed in §13 —
none is a business decision; each is a mechanical consequence of the spec's own deletions.

---

## 1. Shape of the change

Phase 1 adds **zero new endpoints**. It narrows one endpoint (submit now requires a session
that owns the project), widens one endpoint (profile gains address fields + real validation),
changes the internals of two account-creation functions (name NULL, `discount_percent` 0,
explicitly), adds five nullable columns to `user`, and rebuilds the client's review screen
around a three-stage in-place gate (sign-in → name → details). Everything else — OTP
mechanics, rate limits, anti-enumeration, claim-merge, referral attribution ordering,
pricing arithmetic — is deliberately byte-untouched.

The deep-module bet: **all contact-details truth lives in two pure modules in `src/data/`**
(`phone.ts`, `accountDetails.ts`), imported by both the Worker and the browser (established
precedent: `worker/lib/catalogue.ts`, `worker/index.ts` already import from `src/data/`).
The Worker is the authority (AC-22); the client reuses the identical functions for advisory
gating (AC-17/20/21). One validator, two callers, no drift.

```
                    src/data/phone.ts  ──────────────┐  (normalizePhone moves here;
                    src/data/accountDetails.ts ──────┤   enquiry.ts re-exports it)
                          ▲                          ▼
   browser: QuoteReviewSubmit gate         worker/lib/account.ts (single write path
            LoginPage / OtpSignIn                    for user contact fields)
            NameStep                                 ▲
                                           routes/auth.ts  POST /profile  (thin)
                                           routes/quote.ts POST /submit   (reads account,
                                                            never writes it)
```

---

## 2. Domain vocabulary (CONTEXT.md — updated with this design)

Two terms added by this design (architect owns CONTEXT.md; the Customer redefinition and the
trade-ness axis remain **Phase 3** scope and are not touched):

- **Submission gate** — the single point where anonymity ends. Browsing, configuring, live
  pricing, autosave and uploads are anonymous; *submitting a project for review* requires a
  signed-in account with complete account details (typed name, AU-valid phone, full address,
  OTP-verified email). Identity at submission comes from the session, never the request body.
- **Account address** — the account holder's own address, stored on `user` (one per
  account). The project's **delivery destination** is a different fact in a different place
  (`project.delivery_*`): it pre-fills from the account address when empty and never writes
  back.

ADR recorded at `docs/adr/0001-submission-gate-identity-from-session.md`.

---

## 3. Data model and migration plan

**`d1-migration-safety` loaded (mandatory).** Analysis per its authoring rules:

- New migration: **`migrations/0053_user_account_address.sql`** (highest existing is 0052;
  0049 is a historical gap, numbering continues from 0052).
- Content — additive only, five `ALTER TABLE user ADD COLUMN`, all nullable TEXT:
  `address_line1`, `address_line2`, `address_suburb`, `address_state`, `address_postcode`.
- **No table rebuild, no DROP, no default change.** `ALTER TABLE … ADD COLUMN` fires no
  cascades. Cascade inventory for `user`, for the record: `membership.user_id` is the one
  `ON DELETE CASCADE` child (migrations/0001:42); `project.owner_user_id`, `comment.author_id`
  and the referral tables reference `user` without cascade. None can fire because nothing is
  dropped or rebuilt. Header comment in the migration must state:
  `-- children affected: none expected (additive ADD COLUMN only; membership is the sole CASCADE child of user)`.
- **`discount_percent = 0` for new accounts is a CODE change, not DDL** (spec §7.3 forbids
  the rebuild that a default change would require — this database has already lost
  production rows to a rebuild cascade). Both INSERT statements name the column explicitly:
  `worker/lib/auth.ts:154-156` and `worker/lib/staff.ts:110-113`. The column's DEFAULT 5
  (migrations/0032:21) becomes harmless dead weight once every insert names the value.
  **No UPDATE of any existing row** (AC-10, AC-40 second half).
- Remote apply follows the skill's protocol verbatim: export first
  (`npx wrangler d1 export apertly-db --remote --output backup-<date>-0053.sql`), row-counts
  before/after on `user` and `membership`, apply gated by auto-mode as always.
- `scripts/db/seed.sql` is **not** modified. Seeded customer rows therefore keep
  `discount_percent = 5` (the 0032 default) — which is exactly the AC-10 probe: after the
  new code signs one of them in, the value must still read 5.

State values for `address_state`: `NSW VIC QLD SA WA TAS NT ACT` (stored uppercase).

---

## 4. Shared validation modules (new, `src/data/`)

### 4.1 `src/data/phone.ts` (new)

- `normalizePhone(raw: unknown): string` — **moved verbatim** from
  `worker/lib/enquiry.ts:18-23`. `worker/lib/enquiry.ts` re-exports it
  (`export { normalizePhone } from "../../src/data/phone"`) so `worker/routes/enquiries.ts:16`
  and `scripts/tests/unit.test.mjs:345-348` keep working unmodified. One normaliser (spec §7.2).
- `isValidAuPhone(raw: unknown): boolean` — the ONE implementation of "valid AU phone".
  Accepted after normalisation (DECIDED, Q2):
  - `/^0[23478]\d{8}$/` — landline + mobile, 10 digits (`0000000000` fails: second digit 0)
  - `/^1[38]00\d{6}$/` — 1300 / 1800 service numbers, 10 digits
  - `/^13\d{4}$/` — 13 xx xx, 6 digits

### 4.2 `src/data/accountDetails.ts` (new)

Pure module; no imports beyond `./phone`.

```ts
export const AU_STATES = ["NSW","VIC","QLD","SA","WA","TAS","NT","ACT"] as const;
export const DETAIL_LIMITS = {          // E12 / AB-13 stated maxima
  name: 120, phone: 40,
  addressLine1: 120, addressLine2: 120,
  addressSuburb: 80, addressState: 3, addressPostcode: 4,
} as const;

export interface AccountDetails {       // the client-facing key set, used everywhere
  name: string | null; phone: string | null;
  addressLine1: string | null; addressLine2: string | null;
  addressSuburb: string | null; addressState: string | null; addressPostcode: string | null;
}
export type DetailField = keyof AccountDetails;

/** Field-level problems in a PATCH (over-limit, invalid phone, bad state/postcode).
 *  Empty values are not problems here — clearing is legal at the profile layer. */
export function detailsPatchProblems(patch: Partial<Record<DetailField, string>>): DetailField[];

/** What blocks SUBMISSION: required fields that are absent OR stored-invalid.
 *  Required: name, phone (isValidAuPhone), addressLine1, addressSuburb,
 *  addressState (∈ AU_STATES), addressPostcode (\d{4}). addressLine2 optional. */
export function submitMissing(details: AccountDetails): DetailField[];
```

`submitMissing` treating a stored-but-invalid phone as missing is deliberate: a pre-phase
row with a junk phone must be corrected at the gate, not submitted around (AC-17/22 for
legacy rows).

---

## 5. Worker changes

### 5.1 `worker/lib/auth.ts`

- `UserRow` (line 26) gains `address_line1 … address_postcode: string | null` and
  `discount_percent: number` (read-only in this file; typed so tests and `submitMissing`
  mapping are honest).
- `userDto` (line 40) gains `addressLine1 … addressPostcode` (null-safe `?? null`).
  This DTO is served only on customer surfaces (`/api/auth/me`, `/verify`, `/profile`);
  ops DTOs are separate and untouched (AC-38).
- `findOrCreateUser` (lines 146-158): the create branch changes to

  ```sql
  INSERT INTO user (id, email, name, discount_percent, last_verified_at)
  VALUES (?, ?, NULL, 0, datetime('now'))
  ```

  — the `const name = email.split("@")[0]` line (153) is deleted (AC-5), 0 written
  explicitly (AC-9). **Nothing else in this function changes**: same signature, same
  `{ user, created }` reporting, same existing-row branch — the referral seam in
  `worker/routes/auth.ts:88-119` depends on this shape and that route file is not edited
  at those lines at all.

### 5.2 `worker/lib/staff.ts`

- `findOrCreateInternalUser` create path (lines 109-113): the INSERT gains
  `discount_percent` with an explicit `0` (AC-40 first half). The existing-row promote /
  re-verify branch (lines 82-100) is **not** touched — it must not write
  `discount_percent` (AC-40 second half; pinning existing staff rows is Phase 2).
- The staff INSERT's derived `name` (`email.split("@")[0]`) is **kept**: AC-5 scopes name
  honesty to the customer OTP path, and ops surfaces are out of scope (Q4). Recorded here
  so nobody "fixes" it into Phase 1.

### 5.3 `worker/lib/account.ts` (new — the single write path for account contact fields)

```ts
export function detailsOf(u: UserRow): AccountDetails;   // row → client-facing keys

export async function updateAccountDetails(env: Env, user: UserRow, body: unknown):
  Promise<{ ok: true; user: UserRow } | { ok: false; error: "invalid_fields"; fields: DetailField[] }>;
```

`updateAccountDetails` owns: the **allowlist** (`name, phone, company, abn, priceGstMode,
addressLine1, addressLine2, addressSuburb, addressState, addressPostcode` — every other
body key is ignored, which is what makes AB-10 structural rather than checked), trimming,
`detailsPatchProblems` validation (refuse — not clip — over-limit or invalid values, AB-13/E12),
empty→NULL, uppercase state, and ONE `UPDATE user … WHERE id = ?` bound to the session
user's id only (no subject id exists anywhere in the signature — AB-11 structural).
`company`/`abn`/`priceGstMode` keep today's semantics exactly (fields this phase does not
change keep their pre-existing unboundedness; noted as residual in §11.5).

### 5.4 `worker/routes/auth.ts`

- `POST /profile` (lines 126-142): body of the handler replaced by a thin call to
  `updateAccountDetails`; 401 unchanged; 400 `{ error: "invalid_fields", fields }` added;
  the fresh-row re-read and `{ user: userDto(fresh) }` response kept.
- **Lines 70-121 (`/verify`) are not edited.** The attribution → clear `of_ref` →
  claim-merge → session ordering is preserved by not touching the file there (AC-29/30/31).
  No `created` flag is added to the response: the client keys the name step off
  `user.name === null`, which also covers a returning nameless account (E4) with one signal.
- `/challenge`, `/me`, `/logout`: untouched (AB-5/6/7 unchanged by construction).

### 5.5 `worker/routes/quote.ts` — the submit rewrite (lines 136-344)

The route keeps its state machine and loses its anonymous identity path:

1. **Auth** (replaces `ownedProject` for this route only — spec §7.1 forbids changing
   `ownedProject` itself; `delivery-estimate` at line 363 and every other caller keep it):

   ```ts
   const user = await resolveUser(c.env, c.req.raw);
   if (!user) return c.json({ error: "unauthorized" }, 401);        // AB-1, AB-4, AB-14
   const p = await c.env.DB
     .prepare("SELECT * FROM project WHERE id = ? AND owner_user_id = ?")
     .bind(c.req.param("id"), user.id).first<ProjectRow>();
   if (!p) return c.json({ error: "not_found" }, 404);              // AB-2: no data in body
   ```

2. **Account completeness** (after the existing `invalid_state` check, before body parsing):

   ```ts
   const missing = submitMissing(detailsOf(user));
   if (missing.length) return c.json({ error: "incomplete_profile", missing }, 400);
   ```

   This is the server-side floor under AC-17/21/22/23 — a crafted request cannot submit
   past an incomplete or invalid account, whatever the browser said.

3. **Body**: only the delivery destination —
   `{ delivery: { suburb?: string, postcode: string } }`. `contact.*` handling
   (lines 191-206) and the `missing_contact` error are **deleted**; any `contact` key in a
   body is simply unread (AB-3 "ignores the body identity entirely"). `missing_postcode` /
   `invalid_postcode` codes and `normalisePostcode` kept, now read from `delivery`.
   Suburb clipped at 80 (the one clip; it is optional free text, enquiry-route precedent).
4. **The guarded UPDATE** (lines 244-291): the WHERE clause, ai/virus/version guards and
   line-readiness checks are unchanged (AC-15). The binds change:
   `contact_name = user.name, contact_email = user.email, contact_phone = user.phone`
   (AC-16 — the account's values, phone never NULL here because completeness passed).
   The second batch statement — the user backfill at lines 287-290 — is **deleted**:
   identity flows account → project now, never body → account.
5. **Notifications** (lines 318-341): `contactName`/`contactEmail` become `user.name` /
   `user.email`. Unchanged otherwise.
6. `aiFallbackToHuman` and the `p.owner_user_id` conditionals: untouched (owner is now
   always set, the guards degrade to always-true harmlessly).

`ownedProject` (`worker/lib/access.ts:174-186`), `claimAnonProjectForUser` (108-138) and
`resolveOrCreateCurrentProject` (79-84): **not modified** (AC-25/26/28, spec §7.1).

---

## 6. API contracts (exact shapes)

### `POST /api/auth/profile` (changed)

| | |
|---|---|
| Auth | session (`resolveUser`); 401 `{ error: "unauthorized" }` |
| Request | `{ name?, phone?, company?, abn?, priceGstMode?, addressLine1?, addressLine2?, addressSuburb?, addressState?, addressPostcode? }` — all optional strings; unknown keys ignored |
| 200 | `{ user: AuthUserDto }` (fresh re-read) |
| 400 | `{ error: "invalid_fields", fields: DetailField[] }` |

### `POST /api/projects/:id/submit` (changed)

| | |
|---|---|
| Auth | session AND `project.owner_user_id = user.id` (single query) |
| Request | `{ delivery: { suburb?: string, postcode: string } }` |
| 200 | `{ id, status: "submitted" }` (unchanged) |
| 401 | `{ error: "unauthorized" }` — no session |
| 404 | `{ error: "not_found" }` — not the owner / no such project (no project data) |
| 400 | `{ error: "incomplete_profile", missing: DetailField[] }` · `missing_postcode` · `invalid_postcode` · `empty_quote` · `incomplete_lines` · `duplicate_codes` |
| 409 | `invalid_state` · `ai_processing` · `ai_failed` (unchanged) |

### `AuthUserDto` (`src/data/api.ts:119`) — gains

`addressLine1 | addressLine2 | addressSuburb | addressState | addressPostcode: string | null`

### Client data layer (`src/data/api.ts`)

- `SubmitContact` (line 333) → replaced by `SubmitDelivery { suburb?: string; postcode: string }`;
  `submitProject(projectId, delivery)` posts `{ delivery }`. `SubmitResult` unchanged.
- `updateProfile` patch type (line 363) gains the five address fields.

---

## 7. Client design

### 7.1 New shared components

- **`src/components/OtpSignIn.tsx`** — the email→code flow extracted from `LoginPage`
  (App.tsx:1258-1368): email field, Turnstile (`useTurnstile`, rendered when
  `TURNSTILE_SITE_KEY` is configured, action disabled until a token exists — AC-12), send,
  code field, verify, dev-code display, **Resend code** (new — E1; on 429 shows the plain
  E2 copy; wrong-code copy stays existence-neutral — E3), "use a different email".
  Props: `{ onAuthed(user: AuthUserDto): void; heading?: string; subcopy?: string }`.
  Honest framing is the default copy: entering an email **signs in or creates an account**
  (AC-4). Final words are the ux/ui stage's; the semantic requirement is pinned here.
- **`src/components/NameStep.tsx`** — mandatory single-field "What's your name?"; saves via
  `updateProfile({ name })`; `onSaved(user)` callback. Used at the gate, after `/login`
  verification, and as the account-shell interstitial (AC-6).

### 7.2 `LoginPage` (App.tsx:1258-1368)

Renders `OtpSignIn`; on `onAuthed`: `setUser(toAuthUser(u))`, then if `u.name === null`
render `NameStep` (dashboard unreachable until saved — AC-6), else `go("dashboard")`.
The `your@email.com` placeholder and `Verify & continue` label are **load-bearing** —
`customer.spec.ts:383-409` (frozen) drives them; keep both strings.
Line 1363's "guest quotes don't require an account" is deleted and replaced with honest
save-and-continue copy (AC-4).

### 7.3 App shell (`src/app/App.tsx`)

- `AuthUser` (line 44): `name` becomes the **raw** stored value (`""` when NULL); new
  `displayName` field carries the display-only fallback (`u.name || u.email.split("@")[0]`,
  AC-7); five address fields added. `toAuthUser` (line 54) updated accordingly.
  **Display call sites switch to `displayName`**: nav chip (258-260), `AccountShell`
  (115-118), `AccountDashboard` greeting (line 62), `ContactPage` prefill (line 70).
  **`ProfilePage` (1375-1383) must bind the RAW `name`** — this is the AC-7 trap this
  split exists to close: today `toAuthUser` bakes the derived local-part into `user.name`,
  and the profile page would silently write it to the database on the next save.
- `inShell` (line 2186): when `user && !user.name`, render `NameStep` instead of the
  section content (AC-6's "cannot reach the dashboard"; covers E4's returning nameless
  account on every account page).
- New state `projectResolving: boolean` — true while the identity-keyed hydration effect
  (lines 1997-2043) has a fetch in flight. Passed to `QuoteProjectPage` →
  `QuoteReviewSubmit`. This is what makes AC-26/27 airtight: after a gate sign-in the
  details step (and its delivery-estimate effect) is withheld until the re-resolve lands,
  so no request is ever issued against a merge-deleted project id.
- `submitCurrentProject` (2094-2130): signature becomes `(delivery: SubmitDelivery)`;
  logic unchanged.
- Copy sweep (AC-4 second clause): 1363 fixed (above); line 1238 ("Free, no account…") and
  `src/pages/PostPage.tsx:247` reworded to scope the claim to *pricing* ("price it with no
  account" semantics). Lines 690, 816, 1624 and `ContactPage:240` are **kept** — they claim
  estimates/tracking/contact need no account, which remains true. Judgment recorded in §13.

### 7.4 `QuoteReviewSubmit` (`src/components/QuoteReviewSubmit.tsx`) — the gate

Same screen, same quote panel and totals (GST via the existing `useGstMode` context, which
flips automatically when `setUser` lands because `GstContext.Provider` reads
`user.priceGstMode` at App.tsx:2324 — AC-35 needs no new code, only the Playwright proof).
The contact panel is replaced by a stage derived from props (never stored — no stale stage
after auth elsewhere):

| Condition | Panel |
|---|---|
| `user == null` | **Sign in / create** — `OtpSignIn` inline (AC-11/12/13); on `onAuthed` → `setUser` upstream; **no auto-submit** (A-P1-4) |
| `user && !user.name` | **NameStep** (AC-6) |
| `projectResolving` | "Updating your project…" placeholder; Submit absent (AC-26/27) |
| else | **Your details** (below) |

**Your details** (AC-14/17/18/19/42): full name, email (rendered read-only, not an input),
phone, address line 1 / line 2 (optional) / suburb / state (8-value select) / postcode —
pre-filled from the account; delivery suburb + postcode for this project, pre-filled from
the account address **when empty** and freely editable (AC-42). Field-level errors from
`detailsPatchProblems` / `submitMissing` name each missing field individually (AC-17).
Submit button disabled while any required field is missing/invalid, while `submitting`,
`aiReading`, or `projectResolving`.

Submit handler sequence (AC-18/19, house rule: one write path per fact):
1. client-validate; 2. diff details against `user` → if changed, `updateProfile(patch)`
(on `invalid_fields` show and stop); propagate the fresh user via `onAuthed`;
3. `onSubmit({ suburb, postcode })`; 4. `onSubmitted(user.email)` only on server-confirmed
ok (existing rule). Server-refusal mapping gains `incomplete_profile` (names the fields)
alongside the existing postcode/rejected messages.

The delivery-estimate effect (lines 81-88) is unchanged except it only runs in the details
stage (post-auth, `projectId` current — E6).

**No referral-code input exists on any of these panels, and no trade-pricing copy** —
asserted, not assumed (AC-32/41, Playwright §12.3).

### 7.5 `QuoteProjectPage` (`src/pages/QuoteProjectPage.tsx`)

Prop plumbing only: passes `onAuthed` and `projectResolving` through to
`QuoteReviewSubmit` (lines 66-75, 204-213); `QuoteUser` type widens to the richer
`AuthUser | null`.

---

## 8. Security (mandatory)

### 8.1 Data classification

| Data | Class | Handling |
|---|---|---|
| `user.name`, `user.phone`, `user.address_*` (new) | **Personal PII** | Stored on the owning row only; served only via session-scoped `userDto` to the account owner; surfaced on **no ops screen** in this phase (Q4, AC-38); values never logged (no `console.log` may include them — the existing submit/notify logs carry name/email already as business records; no NEW logging of the new fields) |
| `project.contact_*` (existing) | Personal PII | Now written from the verified account instead of an unauthenticated body — strictly narrower than today |
| `user.discount_percent` | Commercial | Written only at row creation (explicit 0); never readable from any endpoint this phase touches; no surface shows a discount or a subtraction pair (AC-36) |
| `user.email` | Personal PII | Unchanged; every write path normalises via `normEmail` first — the only new write path (`updateAccountDetails`) does not accept email at all, which is the strongest form of that rule |

### 8.2 Trust boundaries

- **Customer browser ↔ Worker**: all client validation is advisory; the Worker re-validates
  with the same `src/data` functions (AC-22). Session cookie (HttpOnly, SameSite=Lax,
  Secure in prod) is the only identity carrier; the submit body carries none.
- **Anonymous ↔ account**: crossed only inside `POST /api/auth/verify` (unchanged), whose
  attribution→claim-merge→session ordering is preserved by not editing it.
- **Worker ↔ third parties**: Turnstile siteverify (existing, unchanged) and the email
  provider (existing). No new third party.

### 8.3 Authorization per changed endpoint (exact scoping filter)

| Endpoint | Who | Scoping filter (the WHERE clause, named) |
|---|---|---|
| `POST /api/auth/profile` | session holder, self only | `UPDATE user SET … WHERE id = ?` bound to `resolveUser(...).id`; **no subject id accepted anywhere in path or body** |
| `POST /api/projects/:id/submit` | session holder who owns the project | `SELECT * FROM project WHERE id = ?1 AND owner_user_id = ?2` with `?2 = resolveUser(...).id`; miss → 404 with no project data |
| `POST /api/projects/:id/delivery-estimate` | unchanged (`ownedProject`) | unchanged — a draft-scoped read the anonymous review screen legitimately uses pre-gate |
| `POST /api/auth/challenge` / `verify` | unchanged | unchanged (neutral responses, IP + address caps intact) |

No endpoint added in this phase (there are none) or changed in this phase accepts a subject
id; scoping is by session only (spec §7.4).

### 8.4 Abuse cases → structural answer

| AB | Structural answer (and where it's proven) |
|---|---|
| AB-1 | Submit resolves the session before touching the project; claim cookie is never consulted → 401, row still `draft` (`registration.test.mjs`) |
| AB-2 | Ownership is in the SQL (`AND owner_user_id = ?`), not a post-check → 404, empty body, B's row untouched |
| AB-3 | The handler never reads `body.contact`; `contact_*` binds come from the `user` row → stored email is the session's (`registration.test.mjs` asserts D1 state) |
| AB-4 | Guest grants live in `ownedProject`, which submit no longer calls → 401 |
| AB-5 | `/challenge` untouched; existing-vs-absent responses byte-compared in `registration.test.mjs` |
| AB-6 / AB-7 | `challengeSourceAllowed` / `consumeChallenge` untouched; caps re-probed (429; burn → `invalid_code`) |
| AB-8 | Attribution still lives exclusively on the `created` branch of the unedited `/verify`; gate probe: `/r/<code>` → cookie → challenge/verify (the gate's exact calls) → exactly one referral row; sign-out/in + second submit → still one |
| AB-9 | `updateAccountDetails` allowlist has no referral key; submit body reads only `delivery` → posted codes fall on the floor (probe asserts no referral row) |
| AB-10 | Allowlist again: `discountPercent`, `type`, `role`, `referral_code`, `id` are unread; probe asserts row byte-unchanged |
| AB-11 | No signature in the new write path carries a subject id; `/api/auth/profile/:id` does not route (404 probed) |
| AB-12 | Old-shape request without session → 401; `registration.test.mjs` also greps `worker/` sources asserting the only writers of `status_customer='submitted'` are this route (session-gated) — absence proven, not assumed |
| AB-13 | `detailsPatchProblems` refuses over-limit values (stated maxima in `DETAIL_LIMITS`); 100 KB name → 400, nothing stored |
| AB-14 | Zero new endpoints; both changed ones answer 401 with no data when unauthenticated |

Residual risks, named: (a) `company`/`abn` on the profile endpoint keep their pre-existing
lack of length limits — out of Phase 1's changed-field set, flagged for Phase 2 (which owns
ABN handling anyway); (b) the theoretical signed-in-user-holding-an-unclaimed-anon-draft
corner resolves to a safe 404 at submit (ownership check fails closed).

---

## 9. Sequencing (build order for the developer)

Each step lands red tests first (Probity), then the code, then commits — incremental, killable.

1. **Migration 0053** + `npm run db:migrate:local`; re-read `d1-migration-safety` before
   authoring the file.
2. **`src/data/phone.ts`** (move `normalizePhone`, add `isValidAuPhone`) + re-export from
   `worker/lib/enquiry.ts`; unit table in `scripts/tests/unit.test.mjs` (AC-20/21 shapes).
3. **`src/data/accountDetails.ts`** + unit cases (limits, states, `submitMissing`).
4. **Creation values**: `worker/lib/auth.ts` (UserRow/userDto fields; INSERT → name NULL,
   0) and `worker/lib/staff.ts` (INSERT → 0). New suite `scripts/tests/registration.test.mjs`
   starts here: AC-5, AC-9, AC-10, AC-40.
5. **`worker/lib/account.ts`** + `routes/auth.ts` profile handler swap; registration suite
   grows AB-10/11/13 + profile validation cases.
6. **Submit rewrite** in `routes/quote.ts`; registration suite grows AB-1..4, AB-12, AB-14,
   AC-16, `incomplete_profile`; **update every old-shape submit call site** in the node
   suites (§10.4 inventory) — `api.test.mjs:129-150` stays byte-identical (AC-28).
7. **Client data layer**: `src/data/api.ts` types + `submitProject` + `updateProfile`.
8. **Client components**: `OtpSignIn` extraction, `LoginPage` rework, `NameStep`,
   `inShell` guard, display-name split (`toAuthUser`/call sites), copy fixes.
9. **The gate**: `QuoteReviewSubmit` stages + `App` wiring (`projectResolving`, `onAuthed`,
   `SubmitDelivery`).
10. **Playwright**: new `scripts/tests/web/registration.spec.ts`; rework the broken specs
    (§10.4); frozen ranges untouched.
11. **Sweep**: AC-4 copy sites; AC-41/AC-32 absence assertions; `npm test` + `npm run test:web`.

---

## 10. Test plan (named artifacts — each is a commitment)

### 10.1 New node suite — `scripts/tests/registration.test.mjs`

Wired into `package.json` as
`"test:registration": "node --test --test-concurrency=1 scripts/tests/registration.test.mjs"`
and appended to the `test` chain. Full-harness pattern (vite build + migrations + seed +
`wrangler dev`), same as `api.test.mjs`. Cases:

- **Creation**: AC-5 (name NULL, never local-part), AC-9 (customer 0), AC-40 (internal
  create 0 via the ops OTP path; existing internal promote leaves the value), AC-10
  (seeded row still 5 after sign-in).
- **Gate enforcement**: AB-1, AB-2, AB-3 + AC-16 (D1-asserted), AB-4, AB-12 (old shape +
  source grep), AB-14.
- **Profile**: AB-10, AB-11, AB-13, invalid-phone 400 (AC-22), invalid address 400 (AC-23
  server floor), `incomplete_profile` submit refusal with named fields.
- **Anti-enumeration & caps unchanged**: AB-5 (byte-equal bodies), AB-6 (429), AB-7 (burn).
- **Referral seam**: AB-8 (exactly-once at gate-equivalent signup; sign-out/in → still one),
  AC-30 (existing account + cookie → no row), AC-31 outcome (attribution failure does not
  cost the sign-in — assert sign-in success with a code for a voided/unknown referrer).
- Helper added to `scripts/tests/helpers.mjs`: `completeAccount(session, overrides?)` —
  one `POST /api/auth/profile` with valid name/phone/address; reused by every suite in §10.4.

### 10.2 Unit — `scripts/tests/unit.test.mjs` (existing, `test:unit`)

- `isValidAuPhone` table: the five AC-20 accepted forms, the four AC-21 rejections, plus
  `13 12 34`, `1800` and normalisation round-trips.
- `detailsPatchProblems` / `submitMissing` tables (limits, state set, postcode shape).
- Existing `normalizePhone` assertions (345-348) pass unmodified via the re-export.

### 10.3 New Playwright — `scripts/tests/web/registration.spec.ts`

Spec §11's eight journeys, plus the brief's additions:

1. Anonymous build → Submit → inline OTP → name step → details → confirmation; project
   `draft` until the final act (AC-11, AC-13, AC-6, AC-15).
2. Returning complete customer: no sign-in step, pre-filled, one-action submit (AC-14, AC-18).
3. Missing details: Submit disabled, each missing field named (AC-17).
4. Phone: invalid rejected in-browser; `1300 123 456` accepted (AC-20/21).
5. GST flip to `ex` after inline sign-in, no reload (AC-35 — network log asserts no navigation).
6. Absence assertions: no referral-code input on any gate panel; no trade-pricing /
  discount copy; no link to the trade mock (AC-32, AC-41).
7. Merge case: seeded-account draft + anonymous draft → merged list and totals redisplayed
  before Submit enables; submission hits only the surviving id (AC-26, AC-27 — network
  log asserts no request to the deleted id).
8. Delivery pre-fill from account address; override persists to the project, account row
  unchanged (AC-42, D1-asserted via API).
9. **AC-12 block (`test.describe`, self-contained)**: boots its own `wrangler dev` on a
  free port serving an SPA built with `VITE_TURNSTILE_SITE_KEY` set to Cloudflare's
  always-pass test key (`1x00000000000000000000AA`); asserts the widget container renders
  in the gate's email step and Send-code stays disabled until the token callback fires.
  Isolated here so the main harness (and the frozen specs) gain no network dependency.

### 10.4 Existing-test fallout (updates are in-scope work, not collateral)

Frozen and untouched: `scripts/tests/api.test.mjs:129-150`,
`scripts/tests/web/customer.spec.ts:383-409` (AC-28).

| File | Change |
|---|---|
| `scripts/tests/api.test.mjs:368-372, 449-452` | old-shape submits → `completeAccount` + `{ delivery }` |
| `scripts/tests/api-edge.test.mjs:150-152, 627-690, 785, 812, 847, 867` | submit contract tests rewritten to the new contract (627-690 becomes: unauth 401 / incomplete_profile / delivery shape / contact-ignored) |
| `scripts/tests/delivery.test.mjs:179-305` | submits gain `completeAccount` + new shape (postcode error codes unchanged) |
| `scripts/tests/referral-pricing.test.mjs` (submit call sites) | same mechanical update |
| `scripts/tests/web/customer.spec.ts:417-471` (T-C5) | account created + completed via API before submit; UI re-entry uses the already-authed context (no UI signup of a fresh account mid-test) |
| `scripts/tests/web/quote-project.spec.ts:307-371, 374-406, 918-1040` | review-screen tests gain a mocked/real signed-in complete user (`/api/auth/me` route-mock pattern already used there); T-C2/3/4 postcode assertions move behind the details stage |
| `scripts/tests/web/ops.spec.ts`, `tracking.spec.ts` | submit fixtures → API-created complete accounts + new shape |
| `scripts/tests/web/referral.spec.ts:126-141, 269-287, 289-310` | **deviation D-1 (§13)** — fixture helpers only: `newAccount`/`newReferredAccount` gain a details PUT; `orderFor` uses `{ delivery }`. Every assertion stays untouched |

---

## 11. Out-of-scope guards (restated as build constraints)

1. `organisation` / `membership`: no read, no write, no reference (T4).
2. No ops-surface change of any kind; ops DTOs and `src/ops/**` untouched (Q4, AC-38 —
   seam §6.6 recorded for Phase 2: `src/ops/ProjectRecord.tsx:228`, `worker/routes/ops.ts:532`).
3. No trade-pricing mention, no link to `TradePage` (App.tsx:1675-1734), no "coming soon"
   (Q5, AC-41, spec §2.4 — do not "fix" the 0% window).
4. No referral rule/surface change; no referral-code input anywhere (AC-32; the
   `worker/routes/referrals.ts:38-49` prohibition extends to every form this phase adds).
5. `loadAccountDiscount` / pricing step (`worker/lib/estimator/pricing.ts:356-369, 227-237`):
   read-only, unedited (AC-39).
6. Guest tracking flow untouched (A1/D10, AC-37); guest grants keep read capability only.
7. Existing rows' `discount_percent`: no write path added anywhere (AC-10).

---

## 12. Rejected alternatives

- **Details posted to the submit endpoint** (one request instead of profile-then-submit):
  rejected — it creates a second write path for account facts. The profile endpoint is the
  single writer; submit only reads and refuses. AB-3/AB-10 become structural instead of
  filtered.
- **A new `/api/account/details` or `/api/auth/register` endpoint**: rejected — zero-new-
  endpoints keeps the AB-14 surface empty and reuses an endpoint that already has the right
  authorization shape.
- **Changing the `discount_percent` column default**: forbidden by spec §7.3 — SQLite
  default changes require a table rebuild, and a rebuild in this schema has already
  cascade-deleted production rows.
- **A `created` flag / name-step trigger in the `/verify` response**: rejected —
  `user.name === null` is one signal that also covers returning nameless accounts (E4),
  and it keeps the `/verify` handler byte-untouched (the referral seam lives there).
- **Auth middleware**: rejected — the repo's rule is per-route self-check; introducing
  middleware for two routes would create a second authorization idiom mid-flight.
- **Clipping over-long profile values** (enquiry-route precedent): rejected in favour of
  refusal — a silently truncated address corrupts a delivery-adjacent fact; refusal names
  the field (AB-13 allows either; refusal is the honest one).
- **Baking the Turnstile test key into the shared Playwright harness**: rejected — it would
  make every UI login (including the two frozen specs) depend on `challenges.cloudflare.com`
  being reachable. The keyed server is scoped to the one AC-12 block.
- **Storing a display name / writing the derived local-part on read**: forbidden by AC-7;
  the raw/display split in `AuthUser` exists precisely to close the ProfilePage write-back
  hole (§7.3).

## 13. Deviations from the spec (proposed, with why)

- **D-1 — `referral.spec.ts` cannot pass byte-unmodified** (spec §11 freeze). Its fixture
  helpers call the very contract this phase deletes: `orderFor` submits
  `{ contact: { name, email, postcode } }` (line ~305) and `newAccount` /
  `newReferredAccount` fabricate detail-less accounts that the completeness gate must now
  refuse. Proposal: update the three helpers only (details PUT after verify; `{ delivery }`
  shape); every referral assertion stays untouched, so the *properties* the freeze protects
  keep holding. The alternative — weakening the server gate to admit detail-less accounts —
  would defeat AC-17/22/23.
- **D-2 — AC-12 browser mechanics**: the spec's §11 list omits AC-12; the pipeline brief
  requires browser coverage. Design adds the isolated Turnstile-keyed server block
  (§10.3.9) rather than keying the whole harness. Network dependency confined to one block;
  named residual.
- **D-3 — AC-4 sweep judgment**: "no account" copy that is still true (estimates: App.tsx
  690/816; tracking: 1624; contact: ContactPage 240) is kept; copy adjacent to the quote
  CTA that reads as covering the whole journey (App.tsx 1238, PostPage 247) is re-scoped to
  pricing. If the PM reads AC-4 stricter, the fix is copy-only.

## 14. Decisions needed (owner)

**None.** All choices above are technical or already ruled by the spec (Q1–Q5, D1–D10).

---

## 15. Affected-files index (hand-off — line refs verified 2026-08-18)

**New files**
- `migrations/0053_user_account_address.sql` — five nullable address columns (§3)
- `src/data/phone.ts` — `normalizePhone` (moved) + `isValidAuPhone` (§4.1)
- `src/data/accountDetails.ts` — limits, states, `detailsPatchProblems`, `submitMissing` (§4.2)
- `worker/lib/account.ts` — `detailsOf`, `updateAccountDetails` (§5.3)
- `src/components/OtpSignIn.tsx` — shared OTP flow (§7.1)
- `src/components/NameStep.tsx` — mandatory name step (§7.1)
- `scripts/tests/registration.test.mjs` — new suite (§10.1)
- `scripts/tests/web/registration.spec.ts` — new spec (§10.3)
- `docs/adr/0001-submission-gate-identity-from-session.md` — ADR (§2)

**Changed files**
- `worker/lib/auth.ts` — `UserRow` (26), `userDto` (40), `findOrCreateUser` INSERT (152-156: name NULL, discount 0)
- `worker/lib/staff.ts` — `findOrCreateInternalUser` INSERT (109-113: discount 0); promote branch (82-100) untouched
- `worker/lib/enquiry.ts` — 18-23 replaced by re-export from `src/data/phone`
- `worker/routes/auth.ts` — profile handler body (126-142) → `updateAccountDetails`; **lines 70-121 not edited**
- `worker/routes/quote.ts` — submit (136-344): auth swap (141-143), completeness check, body contact deletion (190-206), UPDATE binds (283-286), backfill statement deletion (287-290), notify vars (318-341)
- `src/data/api.ts` — `AuthUserDto` (119), `SubmitContact`→`SubmitDelivery` + `submitProject` (333-343), `updateProfile` (363)
- `src/app/App.tsx` — `AuthUser`/`toAuthUser` (44-66), nav chip (258-260), FAQ/CTA copy (1238), `LoginPage` (1258-1368, incl. 1363), `ProfilePage` raw-name bind (1375-1383), `inShell` name guard (2186), hydration `projectResolving` (1997-2043), `submitCurrentProject` (2094-2130), `QuoteProjectPage` call site (2162)
- `src/components/QuoteReviewSubmit.tsx` — full gate rework (§7.4)
- `src/pages/QuoteProjectPage.tsx` — prop plumbing (66-75, 204-213)
- `src/pages/AccountShell.tsx` — displayName (115-118)
- `src/pages/AccountDashboard.tsx` — greeting (62)
- `src/pages/ContactPage.tsx` — prefill (70)
- `src/pages/PostPage.tsx` — copy (247)
- `scripts/tests/helpers.mjs` — add `completeAccount`
- `package.json` — `test:registration` script + `test` chain
- `CONTEXT.md` — Submission gate + Account address (§2)
- Test fallout per §10.4: `scripts/tests/api.test.mjs`, `api-edge.test.mjs`, `delivery.test.mjs`, `referral-pricing.test.mjs`, `scripts/tests/web/customer.spec.ts` (T-C5 only), `quote-project.spec.ts`, `ops.spec.ts`, `tracking.spec.ts`, `referral.spec.ts` (helpers only — D-1)

**Deliberately untouched (guard rails)**: `worker/lib/access.ts`, `worker/routes/referrals.ts`,
`worker/lib/estimator/pricing.ts`, `worker/lib/referrals.ts`, all of `src/ops/**`,
`worker/routes/ops*.ts`, `scripts/db/seed.sql`, `api.test.mjs:129-150`,
`customer.spec.ts:383-409`, `App.tsx:1675-1734` (TradePage).
