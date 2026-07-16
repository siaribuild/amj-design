# Customer Backend Scaffold — Implementation Plan

Derived from **CPQ Backend and Account Architecture Blueprint.docx**. Scope: the
**customer (user) side** of the journey — product → order making → order completion
(delivery) — for **both anonymous and registered** users. Payment is a **manual
process for MVP** (no gateway). Internal ops console, approvals engine, Sanity GROQ
swap, and real payments are explicitly out of scope (seams left in place).

## 0. What "scaffold" means
A **walking skeleton**: every layer present and wired end-to-end for the happy path
of one vertical slice — **draft → add line → submit → quote issued → accept → order →
delivered** — for anon + registered users, with manual payment. Breadth is stubbed
with clear extension points, not built. When done, the existing UI persists through
D1/R2 across sessions and devices.

## Current-state facts (verified in repo, 2026-07-16)
- Site is a Vite/React SPA deployed as **static assets only** — `wrangler.jsonc` has an
  `assets` block, **no `main` Worker**.
- The account journey already exists as **in-memory mocks**: `AuthUser`, `LoginPage`,
  `DashboardPage`, `ProfilePage`, `AccountSettingsPage`, guest `track-order`; routes for
  all in `src/app/routes.ts`. Login is fake; `user` = `useState<AuthUser|null>` (App.tsx),
  quote cart = `useState<QItem[]>` (App.tsx). Nothing persists.
- The scaffold puts a real **Worker + D1 + R2 + KV** tier under the UI that already exists.

## Locked decisions
- **Session/OTP store: KV for both.** OTP codes and opaque session tokens live in Workers
  KV with native TTL; D1 holds only durable identity. No `session`/`otp_challenge` tables.
  "Sign out all devices" = bump an O(1) `session_epoch` int on `user` (session cookies embed
  the epoch; mismatch = invalid).
- **Anon model: server draft via claim-token cookie.** Anonymous projects are real D1 rows
  keyed by an httpOnly `claim_token` cookie, **claimed into the account on OTP verify**
  (blueprint's "save & continue"). Unlocks anon-submit, guest tracking, cross-device continuity.

## 1. Runtime topology (same repo)
```
Browser (existing Vite SPA)
   │  fetch('/api/...')            static file req
   ▼                                  │
┌─────────────── Cloudflare Worker (worker/index.ts, Hono) ───────────────┐
│  /api/*  → route handlers        else → env.ASSETS.fetch() (SPA)        │
│     ├── auth (OTP)   ├── projects/lines   ├── files   ├── orders        │
└───────┬───────────────────┬────────────────────┬───────────────────────┘
        ▼                    ▼                    ▼
   D1 (transactional)   KV (OTP+sessions)    R2 (file bytes)
   Sanity (product truth — later; catalogue.ts for now)
```
- `wrangler.jsonc` gains `main`, `d1_databases`, `r2_buckets`, `kv_namespaces`, `vars`, and
  `assets.binding = "ASSETS"` so the Worker serves the SPA fallback. Existing `assets` block stays.
- Framework: **Hono** (only new runtime dep).
- Dev: Vite dev for UI; `wrangler dev` (Miniflare emulates D1/R2/KV) for the API; Vite
  `server.proxy` maps `/api` → wrangler port so both run together locally.

## 2. D1 schema (customer-scope subset; migrations/0001_customer_core.sql)
Text-CHECK enums. Snapshot separation preserved (draft lines vs revision lines vs order lines).

| Table | Key columns | Notes |
|---|---|---|
| `user` | id, email, name, phone, type, session_epoch, created_at, last_verified_at | type='customer' for now |
| `organisation` | id, name, trading_name, abn, account_status | created on demand |
| `membership` | user_id, organisation_id, role, branch_scope | role=owner/member |
| `project` | id, org_id?, owner_user_id?, **claim_token**, title, status_customer, status_internal, created_at | claim_token = anon ownership before login |
| `quote_line` | id, project_id, revision_id NULL, **external_ref**, room_label, product_slug, options_json, dims_json, qty, line_total, status | draft lines: revision_id NULL; external_ref=W01 (from QItem.code) |
| `quote_revision` | id, project_id, revision_no, snapshot_status, totals_json, issued_at, accepted_at, expiry_at | immutable on issue |
| `revision_line` | id, revision_id, external_ref, product_snapshot_json, dims_json, options_json, qty, line_total | **copied** from draft at issue |
| `order` | id, project_id, accepted_revision_id, order_no, status, payment_status, created_at | manual-payment MVP |
| `order_line` | id, order_id, external_ref, product_snapshot_json, qty, line_total | copied from accepted revision |
| `file_asset` | id, project_id?/order_id?, kind, r2_key, filename, checksum, size, virus_status, uploaded_by | R2 pointer |
| `notification` | id, recipient_subject, event_type, channel, template_key, sent_at, delivery_state | email history (stub sender) |
| `audit_event` | id, actor, entity_type, entity_id, action, before_json, after_json, occurred_at | immutable trail from day one |
| `guest_grant` | id, record_type, record_id, email, token, expires_at | scoped read-only token |

Approvals (`approval_rule/instance/step`) and `integration_job` are schema-stubbed but unused
by the customer slice — the internal-ops task owns them.

## 3. Identity & the anon ↔ registered bridge
- **Anonymous:** first `POST /api/projects` (or first line add) with no session mints a `project`
  with a random `claim_token`, set as httpOnly cookie `amj_claim`. Anon can build, upload plans,
  and **submit** without an account. Server-persisted, survives refresh.
- **Registered (passwordless email OTP):** `POST /api/auth/challenge {email}` → 6-digit code hashed
  into KV (TTL 10 min), neutral response always, email sent (stub sender in MVP) →
  `POST /api/auth/verify {email,code}` → session cookie. **On verify, if `amj_claim` present, claim
  that anonymous project into the user** (owner_user_id set, claim_token cleared).
- **Guest order checker:** `POST /api/guest/track/request {email,ref}` → always-neutral response,
  short-lived code emailed only on match; `POST /api/guest/track/verify` → scoped `guest_grant`
  token; `GET /api/guest/records/{token}` → read-only single-record view. Rate-limited, no
  enumeration (OWASP). Backs the existing `track-order` page.
- Internal staff auth (Cloudflare Access SSO) is **out of scope** here — lives on `ops.*`.

## 4. Customer journey & state machine
Customer-facing statuses drive the UI; internal/approval statuses exist in columns but aren't surfaced.
```
Draft ─submit─▶ Submitted ─▶ Under review ─┬─(need info)─▶ Needs information ─▶ (back to Under review)
                                           └─issue──▶ Quote issued ─accept─▶ Accepted ─▶ [ORDER CREATED]
                                                            └─(expire/supersede)─▶ Expired
ORDER:  Awaiting payment ─(staff marks paid)─▶ Paid ─▶ In production ─▶ Ready ─▶ Dispatched ─▶ Delivered ─▶ Closed
```
- **Issue** snapshots draft lines → `revision_line`. Customer sees immutable **Quote issued**.
- **Accept** (`POST /api/revisions/{id}/accept`) records acceptance against the revision and
  **creates the order** by snapshot-copying revision lines → `order_line`.
- **Manual payment (MVP):** order born `payment_status='awaiting_payment'`; Order-detail page shows
  **bank-transfer / invoice instructions + reference** (no gateway, no card entry). Staff flip to
  `paid` (internal task); customer only sees status. Delivery statuses (`in_production → dispatched
  → delivered`) are staff-advanced, customer-tracked — closes the "to completion (deliver)" requirement.

## 5. Customer API surface (Worker routes)
```
POST /api/auth/challenge   POST /api/auth/verify   POST /api/auth/logout   GET /api/auth/me
POST /api/guest/track/request   POST /api/guest/track/verify   GET /api/guest/records/{token}
GET/POST /api/projects   GET/PATCH /api/projects/{id}   POST /api/projects/{id}/submit
POST /api/projects/{id}/lines   PATCH/DELETE /api/lines/{id}   POST /api/lines/{id}/duplicate   PATCH /api/lines/{id}/external-ref
GET /api/projects/{id}/revisions   POST /api/revisions/{id}/accept   POST /api/revisions/{id}/request-change
GET /api/orders   GET /api/orders/{id}
POST /api/files/upload   GET /api/projects/{id}/files
GET /api/notifications   POST /api/notifications/{id}/ack
```
Naming mirrors the blueprint's API families so the internal side extends the same handlers.

## 6. Pricing authority moves server-side
Extract pure pricing math from `src/data/configurator.ts` (`priceConfigured`, `RATES`, `OPTION_ADD`,
`optionGroupsFor`) into a shared `src/data/pricing.ts` importable by SPA and Worker. Worker recomputes
`line_total` on every mutate and freezes it into `revision_line`/`order_line`, so issued quotes and
orders are authoritative and immutable even if catalogue/rates later change in Sanity. Pricing stays
"secret" (server-computed, no per-option breakdown returned).

## 7. Frontend wiring (replace mocks, keep the UI)
- `src/data/api.ts` — typed fetch client for the routes above.
- `AuthProvider`/`useAuth()` and `useProject()` replace `useState<AuthUser|null>` and
  `useState<QItem[]>` in App.tsx with API-backed hooks; keep optimistic local updates (honours the
  "form stays stable / live update" UX rules).
- Bootstrap: on load `GET /api/auth/me`; if none, lazily create/attach the anon project on first line add.
- Wire existing pages: `LoginPage` → challenge/verify; `DashboardPage` → projects+orders; `QuotePage`
  → project/lines/submit; `track-order` → guest flow; `Profile`/`AccountSettings` → user PATCH.
  **No visual redesign** — same components, real data.

## 8. Files (R2)
`POST /api/files/upload` streams through the Worker to R2 (`r2_key = project/{id}/{uuid}`), writes a
`file_asset` row (`virus_status='pending'` placeholder). Downloads via short-lived Worker-signed URL.
Anonymous uploads allowed (attach to claim-token project).

## 9. Out of scope (seams left in place)
Internal ops console & Cloudflare Access SSO · approvals rules engine · Sanity GROQ swap (keep
`catalogue.ts`) · real payment gateway (manual only) · webhooks/ERP integration · SMS · notification
*preferences*.

## 10. Build order (milestones → blueprint phases)
1. **M1 – Rails:** wrangler bindings, Hono skeleton, `0001` migration, `/api/auth/me` + health, dev proxy.
2. **M2 – Anon persistence:** projects + lines CRUD with claim-token cookie; server pricing; wire `QuotePage`.
3. **M3 – Registered + merge:** OTP challenge/verify, KV sessions, claim-on-login; wire `LoginPage`/`Dashboard`.
4. **M4 – Submit → issue → accept → order:** revision snapshots, accept, order creation, manual-payment view.
5. **M5 – Delivery + guest + files:** order status tracking, guest track flow, R2 uploads, audit + notification stubs.

Maps onto Foundation → Quote control → Workflow → Order conversion (customer slice).
