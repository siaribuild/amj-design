# Internal Admin (Ops Console) — Implementation Plan

The staff-facing counterpart to the customer scaffold (`docs/customer-backend-scaffold.md`).
Where employees triage submissions, review/price quotes, run approvals, drive orders
through the 12-stage journey, and manage clients/catalogue. Built on the SAME D1 domain
model + Workers API — mostly a new auth layer + frontend + a few new tables/endpoints.

## Locked decisions
- **Hosting: separate `ops.*` subdomain.** A distinct frontend bundle served on
  `ops.amjtradedirect.com`; the Worker routes by `Host`. Clean security boundary
  (separate cookies), and Cloudflare Access guards the whole subdomain. Local dev uses
  `ops.localhost:8787` (browsers resolve `*.localhost` → 127.0.0.1) vs `localhost:8787`
  for the customer site.
- **Staff dev auth: internal email-OTP, domain-allowlisted.** Reuse the OTP flow but
  restrict to an allowlist (e.g. `@amjtradedirect.com.au`) and only issue sessions for
  `type='internal'` users. In prod, verify the Cloudflare Access JWT
  (`Cf-Access-Jwt-Assertion`) → map email → internal user. Real identity + audit
  attribution locally without an Access tunnel.
- **RBAC: single `staff` role for now.** `type='internal'` IS the gate. The persona role
  split (estimator / technical_reviewer / manager / admin …) lands with the approvals
  engine (O4), which needs it.

## Already reusable (built in customer M1–M5)
Domain model (projects, quote_lines, revisions, orders, payments, file_asset,
notification, audit_event); pricing engine; order stage machine + two-fold payment; R2
files; email/notify seam. **Staff seams already exist** — `issue-revision`, order
`advance`, `pay` — currently gated by `isStaff()` = *open in non-prod*. The console gives
them a real UI and moves them behind verified staff identity.

## New for the internal side
1. Staff auth (Access JWT verify + dev internal-OTP) replacing `isStaff()=non-prod-open`.
2. Richer `status_internal` states (only `submitted`/`issued` used today).
3. Approvals engine (new tables + rule evaluation) — O4.
4. Comments/activity — clarification requests + technical-review notes (audit_event only
   covers state changes, not human messages).
5. Ops API (`/api/ops/*`) — queues, assignment, internal workspace, customer 360,
   catalogue/rules admin, search.
6. Ops frontend (the console).

## Data model additions
| Migration `0003_ops.sql` | Purpose |
|---|---|
| `project.internal_owner_id` | assigned estimator (queue ownership) |
| extend `project.status_internal` | triage_pending, estimator_assigned, customer_clarification_required, technical_review_required, approval_pending, approved_for_issue, converted_to_order, cancelled |
| `comment` | technical-review notes + clarification requests (threaded, on project/line) |
| `approval_rule` / `approval_instance` / `approval_step` | approvals engine (O4) |
| `user.role` | persona roles (O4, with approvals) |

## Ops API surface (`/api/ops/*`, staff-gated)
```
GET  /ops/me                                    staff identity (+ role later)
GET  /ops/queues/{submissions|approvals|orders} filtered / SLA-aged work lists
GET  /ops/projects/:id                          internal workspace (full detail)
POST /ops/projects/:id/assign                   claim / assign estimator
POST /ops/projects/:id/request-clarification    -> customer "Needs information"
PATCH /ops/lines/:id                            estimator line edit / reprice
POST /ops/lines/:id/note                         technical-review annotation
POST /ops/projects/:id/issue-revision           (existing seam, role-gated)
GET/POST /ops/approvals + approve|reject|delegate
POST /ops/orders/:id/advance | /pay             (existing seams, role-gated)
GET  /ops/customers | /ops/customers/:id        organisations + 360 view
GET/PATCH /ops/catalogue | /ops/rules           product & pricing-rule admin
GET  /ops/audit | /ops/search?q=
```

## The quote workspace (the key screen)
One page per project: summary rail (customer, org, revision, assignee, total, margin
flags) · line list (editable schedule codes, options, price, exception badges) ·
file/markup view (plans beside imported lines) · technical review panel · approval trace
· activity timeline · revision controls (issue / clone / supersede).

## Console IA (tabs)
Dashboard · Quotes · Approvals · Orders · Customers · Catalogue · Rules · Files · Audit · Admin.

## Build order (milestones)
1. **O1 – Staff rails:** `ops.*` hosting (second Vite entry + host routing), internal-OTP
   (allowlisted) + Access-JWT verify, `/api/ops/me`, ops app shell + Dashboard. Move
   existing seams behind the staff gate.
2. **O2 – Quotes queue + workspace:** submissions queue, assignment, the quote workspace
   (view/edit/reprice lines, technical notes), issue revision from the console.
3. **O3 – Workflow + clarifications:** internal state machine, request-clarification →
   customer "Needs information", activity timeline.
4. **O4 – Approvals engine + roles:** rules, instances/steps, approve/reject/delegate,
   approval trace + queue; introduce persona roles.
5. **O5 – Orders ops + Customers 360:** drive the 12-stage fulfilment (payments, drawings,
   QA, dispatch) from the console; customer/org management.
6. **O6 – Admin:** catalogue/rules admin, audit browser, search, staff/role management.

## Out of scope (for now)
Real IdP/SSO configuration in Cloudflare (config, not code), ERP/CRM webhooks, SLA
escalation automation, Sanity GROQ swap.
