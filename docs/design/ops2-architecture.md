# ops2 — system architecture (design pass A)

Author: architect (pipeline stage 2)
Date: 2026-08-17
Branch: `design/ops2-planning`
Governs: everything that spans regions R1–R8. Region-detail designs (R2–R8) are later
passes and inherit this document unchanged unless a later pass amends it explicitly.
R1's detail design is `docs/design/ops2-r1-frame-and-record.md`, produced with this pass.

Inputs, in order of authority: `docs/specs/ops2.md` (rev 3), `docs/ops-redesign/GRILL-CONCLUSIONS.md`,
the owner's 2026-08-17 mid-flight correction (below). `UX-SPEC.md` §B.4 left column is factual
input to the register; everything else in `docs/ops-redesign/` was mined for capability only.

**Owner correction, 2026-08-17 (binding, received during this pass):** the "trivial
reversal / undo" requirement is dropped. *"We don't expect customer's changing their mind as
such: we consult them and make product decisions. No need to track change history for undo
purposes."* Consequences taken here: no undo stack, no per-edit journal, no session-start
value snapshot on the editing surface (spec AC-17 is void; the PM is correcting the spec).
What survives untouched: the divergence record (§6 below), the baseline resolution it needs,
and the existing audit trail. This simplification is real: the mutation model in §5 is
pessimistic request/response with no client-side history of any kind.

**Amended 2026-08-17 (design pass B, ADR 0004):** the component-framework decision was
reopened after the owner rejected the R1 mock's narrow-width behaviour; the criterion is
now ordered — drive established mobile IA and navigation practice first; grow desktop from
it. §4 gains the plane shell (§4.0), §3.3's navigation frame is restated against it, §10
gains the grammar assertions, §13 gains the framework rows. The mobile interaction model
is the settled exploratory mock's (`docs/ops-redesign/mocks/ops-ux-mock.html` §13); the
R1 interaction spec's narrow model returns to the ux-designer for rework on the plane
shell before implementation.

---

## 1. Shape of the system

One Worker, one API, one database, one hostname. ops2 is a **third Vite SPA entry**
(`ops2.html` → `src/ops2/`) beside the customer site (`index.html` → `src/`) and the legacy
console (`ops.html` → `src/ops/`). It calls the **same `/api/ops/*` surface the legacy
console calls today** — extended, never forked. There is no ops2-only API namespace, no
second deploy target, and no data migration at switch-over.

Why this is the deep-module answer and not just the cheap one: the API surface in
`worker/routes/ops.ts` (+ `ops-pricing.ts`, `ops-referrals.ts`) is already the interface
behind which quote state, pricing, lifecycle and issue live. Forking it would put two
interfaces in front of one implementation and give every future fact two places to drift.
AC-40 (every legacy-called endpoint is called by ops2 or recorded) is only cheap to satisfy
because the endpoint set is shared.

What ops2 adds server-side, region by region:

| Region | Server-side additions |
|---|---|
| R1 | ops2 shell serving in `worker/index.ts`; save-conflict cause codes + `quoteTotals` on every line-mutating response; **ops line create and delete** — `POST /projects/:id/lines`, `DELETE /lines/:id` (owner decision 2026-08-17; R1 detail §2.2). No migration. |
| R2 | `worker/lib/rbac.ts` (capabilities, route manifest, default-deny floor); role-vocabulary data migration; staff admin endpoint updates. |
| R3 | `worker/lib/original.ts` + `worker/lib/divergence.ts`; `line_baseline` + `quote_divergence` tables; `candidate_result` read endpoint; wiring `GET /projects/:id/building-model` to a caller. |
| R4 | `project.with_manufacturer_since` column; `lifecycleOf` gains the stored input (§7); queue sort gains the fourth rank. |
| R5–R7 | No schema change expected; endpoint reuse plus small additive response fields where a register row demands data the client discards today. |
| R8 | Switch-over shell flip; deletion commit (legacy console, `ops.html` entry, domain-based role path, D-1 branch). |

---

## 2. Coexistence, switch-over, deletion — the routing plan

### 2.1 The claim to confirm: no Zero Trust change

Confirmed, with evidence. Cloudflare Access applies its policy per **application**, which is
matched on hostname (+ optional path) at the edge; the Worker then verifies one fixed
audience: `worker/lib/staff.ts:174–213` checks `alg`, `aud === env.ACCESS_AUD`, `exp/iat/nbf`,
`iss === https://{ACCESS_TEAM_DOMAIN}.cloudflareaccess.com`, and the JWKS signature.
`worker/index.ts:193` selects the ops shell by `host.startsWith("ops.")`. A **path prefix on
the same host** is invisible to all of it: same Access application, same policy, same MFA,
same single `ACCESS_AUD`, same `isOps`. GRILL-CONCLUSIONS §9's derivation stands. A second
hostname would have required a list-valued `ACCESS_AUD` and a second Access app — security
churn for cosmetics — and stays rejected.

### 2.2 The three routing states

All three are changes to **one function** — the shell selection in `worker/index.ts` (today
line 215: `const shell = isOps ? "/ops.html" : "/index.html"`) — which becomes a small
`opsShellFor(pathname): "/ops2.html" | "/ops.html"` helper so each flip is a one-line,
`wrangler versions`-revertible deploy:

1. **Build (R1–R7).** On the ops host: paths under `/ops2` serve `ops2.html`; everything
   else serves `ops.html` (legacy at root, unchanged). Both SPAs, one bundle, one Access app.
2. **Switch-over (R8, first event).** ops2 serves at root; legacy moves to the unadvertised
   `/legacy` prefix (fire escape — in the bundle, not routed by default, gated by AC-38).
3. **Deletion (R8, second event).** `ops.html`, `src/ops/`, the `/legacy` branch, the
   domain-based role path, and the D-1 manufacturer-tab branch leave the build in one commit.

The ops2 router detects its base at boot from `location.pathname` (`/ops2` prefix present →
base `/ops2`, else `/`), so the same client bundle serves states 1 and 2 and switch-over is a
Worker-only change.

**Asset fallback rule (the SPA-serving change R1 makes):** on the ops host, any GET whose
path has no file extension and is not `/api/*` serves the selected shell — this is what makes
path-routed deep links (§3) reloadable. The existing `isAsset` check (`worker/index.ts:200`)
already routes hashed assets to `env.ASSETS` and is untouched.

**Named collision, avoided by construction:** `worker/index.ts:168` intercepts
`GET /r/<XXX-XXX>` on **every** host for referral redirects, ahead of the SPA fallback.
ops2 therefore never uses a `/r/…` path. Record routes live under `/record/…` (§3.2).

### 2.3 Rollback

Per GRILL §7 / spec §12, unchanged: `wrangler versions upload` → verify on the preview URL →
`wrangler versions deploy`. The RBAC hazard is neutralised by §8's additive rule: the old
Worker reads `user.role` and only `user.role`, and nothing in any ops2 migration repurposes
or removes it — so a rolled-back Worker authorizes exactly as before (AC-34 drills the write,
not the sign-in).

---

## 3. App shell and client routing (R1 owns the build; every region inherits)

### 3.1 Path routing, not hash routing — a deliberate correction

Spec §7.1's R1 row says "hash routing"; its own AC-24 is why ops2 must not use it. AC-24:
a deep link **opened cold with no ops session** must survive Cloudflare Access sign-in.
Access records the requested URL server-side to redirect back after authentication — and a
URL fragment (`#/record/…`) is never sent to the server, so the interactive login flow
(rendered login page, IdP hops, form POST) drops it. `UX-SPEC.md` §B.4 row 3's claim that
"the router resolves the hash after auth" is true only when an Access session already exists.
With the target in the **path**, Access's stored redirect URL carries it by construction.

So: **ops2 routes are paths**, served by the §2.2 asset-fallback rule. React Router 7 is
already a dependency (`react-router@7.13.0`, used by the customer site) — no new dependency.
ADR-0002 records this decision; the PM folds the wording fix into the spec.

### 3.2 Route table (R1 ships the record routes; later regions add theirs)

| Path (under the detected base) | Destination | Region |
|---|---|---|
| `/` | Attention surface (R4). Until R4: interim record list (R1, explicitly interim) | R1→R4 |
| `/record/:ref` | The record (project+order plane), addressed by `public_ref` — the anchor identity, never renamed | R1 |
| `/record/:ref/line/:lineId` | Same record, line scrolled into view and highlighted (AC-25) | R1 |
| `/record/:ref/…` (derivation, thermal, teach) | R3 sub-destinations, same record plane | R3 |
| `/work` | Queue + saved views | R4 |
| `/customers`, `/customers/:id`, `/enquiries`, `/enquiries/:id`, `/archive/files`, `/archive/events` | R5 |
| `/products`, `/products/:slug`, `/products/options`, `/settings/*` | R6 |
| `/referrals`, `/referrals/payouts` | R7 |
| `/staff` | Staff & roles administration | R2 |
| `/signed-in-as` | The no-role / manufacturer coherent screen (AC-27, AC-87) | R2 |

Every destination is a URL (AC-26); browser back is the router's history. Unknown paths
render a not-found screen with a link home — never a blank.

### 3.3 Shell composition

`src/ops2/App.tsx` composes, in order: error boundary (module-level, catches render errors
into a reload screen — AC-26's back still works), boot gate (`/api/ops/me` → sign-in screen
in non-Access environments, per register rows 5–13), brand (reuse of the one-request pattern),
the navigation frame — presented by the plane shell per measured width class (§4.0): plane stack below 768 px, summoned overlays at 768–1023, simultaneous zones at 1024+ — and the route outlet.
The sign-in screen is carried from register rows 5–13 **verbatim** (D-2, NON-PROD).

---

## 4. The responsive layout system (R1 builds it; I3/I4/C1 bind every region)

### 4.0 The plane shell — the navigation pattern layer (ADR 0004; design pass B amendment)

**Added after the R1 mock rejection.** As first written, this section supplied layout
*mechanisms* (§4.1–4.3) with no navigation pattern layer above them — and the first
interaction design built on that vacuum produced narrow-width behaviour the owner rejected
outright (columns collapsing into one long scroll behind a drawer). The corrected
criterion is ordered: drive established mobile IA first; grow desktop from it. ADR 0004
carries the costing, including the owner-named Ionic option.

The shell (`src/ops2/shell/`) is one deep module owning **all presentation**, implementing
the mobile grammar the settled exploratory mock established
(`docs/ops-redesign/mocks/ops-ux-mock.html` §13; `docs/ops-redesign/LEARNINGS.md` joins it
as the written companion when its extraction lands):

- **Plane stack below 768 px** — full-screen planes, push 240 ms / pop 200 ms, slide
  replaced under reduced motion, every push a history entry, the active plane **derived
  from the route, never held as state**; segmented planebar switcher (gesture never the
  only route); per-plane identity bands; the phone action footer (one primary, overflow
  behind a single control, the blocked primary's reason inside the footer, ConfirmInline
  in place of modals); safe-area + keyboard insets; focus moves to the pushed plane's
  heading.
- **Summoned overlays at 768–1023** — the primary zone holds the ground; secondary zones
  arrive as overlay rail / sheet; the back control persists.
- **Simultaneous zones at 1024+** — compact's 48 px code-strip rail, then full rail ·
  pane · canvas; density rises through tokens, never through a different IA.

**The zone contract is the seam.** A region declares each destination as an ordered set of
zones with width appetites (the work/context allocator from the R1 interaction design,
generalised) plus per-zone header and action content — and never renders navigation
chrome; the plane primitives are not exported outside the shell. The route table's element
type accepts zone declarations only, so a long-scroll page is inexpressible, not merely
reviewable. Growth to desktop is **revelation, not rearrangement**: a plane and a pane are
the same zone at different measured widths, which is what holds D4's two failure modes
apart with one IA.

§4.1–4.3 below survive unchanged as the shell's internal mechanisms: container queries
and the folding component govern layout *within* a zone; the shell governs which zones
are present and how they are reached.

### 4.1 Principle: one component, measured width, no device branches

Layout responds to **measured container width, moment to moment** — never viewport class,
never user agent. Two mechanisms, used in this order of preference:

1. **CSS container queries** (Tailwind v4 `@container` — already in the stack, no new
   dependency) for everything expressible as style: column counts, visibility of secondary
   facts, pane stacking. The shell marks the content area and each pane as named containers;
   panes respond to *their own* width, which is what makes the Fold-with-an-app-beside-it
   case (C1) fall out for free.
2. **`useContainerWidth(ref)`** — one small hook on `ResizeObserver` — only where the DOM
   *structure* must change (a table folding into its card form). The folding component is
   **one component with one data contract folding its own columns** (the `RowList` idea from
   the exploratory docs, kept because it is right): never a `<DesktopTable>`/`<MobileCards>`
   pair, which is exactly the two-renderings drift I4 forbids.

State survival across a fold (AC-12): field state lives in the surface's view-model hook
(§5.2), never in the leaf that gets re-parented; editable leaves carry stable keys by field
identity. Focus restoration on structural swap is the folding component's contract and is
tested (R1 Playwright).

### 4.2 Tokens, and the narrowest target

`src/ops2/styles/tokens.css` — one file owning: the width change points (as container-query
custom properties, not scattered literals), spacing/type scale, and the ops chrome palette
(visual values are the ui-designer's to fill at the mock stage; the token *slots* are
architecture). The narrowest engineering target is **320 CSS px** — at or below every folded
cover screen in the target set; everything designed to work at 320 works on the Fold 7 cover
screen by construction. Playwright's width matrix starts there (§10).

### 4.3 Enforcement (AC-13's second half, machine-checked)

A static test greps `src/ops2/**` for `navigator.userAgent`, `userAgentData`,
`navigator.platform`, `maxTouchPoints`, `window.orientation`, `matchMedia`-on-device
patterns, and `pointer:`/`hover:` media queries in ops2 CSS. Zero hits or the suite fails.
(`matchMedia("(max-width…"` is also refused: widths come from containers, so a viewport
media query in ops2 layout code is a smell by definition.) Lives in
`scripts/tests/ops2-frame.test.mjs` from R1 onward.

---

## 5. Data access, state, and mutations (system-wide contracts)

### 5.1 Typed client

`src/ops2/api/client.ts` — one `request()` with: JSON envelope handling, an `OpsError`
carrying `{ status, code, detail?, missingOptions? }`, and `AbortController` pass-through.
Endpoint wrappers live beside it in `src/ops2/api/ops.ts`, typed against DTO types in
`src/data/opsDtos.ts` (shared types belong in `src/data/` by house rule; the legacy client's
`src/ops/api.ts` types are the starting point and are **moved, not copied**, when a region
takes ownership of a surface — legacy imports the shared file too, so the two consoles cannot
drift during the soak).

### 5.2 Reads: view-model hooks, no cache library

Per-surface hooks (`useRecord(ref)`, `useQueue(view)`, …) returning a uniform
`Loadable<T> = { state: "loading" } | { state: "error"; error: OpsError; retry() } |
{ state: "ready"; data: T; asOf: Date; refresh() }`. No global store, no query-cache
dependency: the console has two users and its data is cheap to refetch; a cache layer would
add staleness semantics I6 then has to apologise for. Every surface renders all three states;
"error" always renders **at the pane that failed** with its own retry (I6). This `Loadable`
shape is the *interface* every region programs against; if a future region genuinely needs
request dedup it extends the hook, not the callers.

### 5.3 Writes: pessimistic, loud, at-the-control

With undo gone (owner correction), the mutation model is deliberately plain:

- A write is a request; the control shows its in-flight state; **nothing is rendered as
  saved until the server confirmed it** (AC-20's "no surface presents the unsaved value as
  saved" falls out of never rendering optimistically).
- Failure renders at the control (`WriteState` per control: `idle | saving | failed(code,
  sentence)`), keeps the entered values, and offers retry (AC-20/21/22). The error-sentence
  map (`src/ops2/api/errors.ts`) carries the legacy `ACTION_ERRORS` copy verbatim (register
  row 67) plus sentences for the codes that fall through today (row 68).
- Conflict answers name the real cause: §5.4.

### 5.4 The totals contract and the conflict contract (R1 implements; system-wide rule)

Two small, additive extensions to `PATCH /api/ops/lines/:id` (legacy tolerates both — it
ignores unknown response fields, and its unknown-code fallback sentence covers the new code):

1. **Totals move together (AC-16/19):** the PATCH response gains
   `quoteTotals: { goods, delivery: number | null, total }`, computed in the same request
   from the same rows the write just changed. One round trip moves the line total and the
   quote total; the client never derives a total the server didn't state.
2. **Conflict causes (AC-23, AC-81):** today the editable-state gate is folded into the row
   lookup (`worker/routes/ops.ts:902–910`), so "line missing" and "quote no longer editable"
   are the same 404. The lookup splits: line missing → 404 `not_found`; line present but
   project outside the editable set → **409 `not_editable` with `statusInternal`**, from
   which the client renders the real sentence ("This quote is issued — lines are read-only
   until it returns to pricing.") and offers reload. The editable-state set itself stays
   exactly where it is — one place per fact; the route change is answer-shaping only — and it lands inside the existing asker:
   `editableParent` (`worker/routes/ops.ts:817`, over the `EDITABLE_STATES` const at `:814`)
   is extended to answer with cause (`ok | not_found | not_editable+statusInternal`) and
   remains the only place the editability question is asked.

The two R1 line-management endpoints (owner decision 2026-08-17 — `POST /projects/:id/lines`,
`DELETE /lines/:id`; R1 detail §2.2) follow both conventions rather than inventing a third:
the same 404/409 `not_editable` split, the same `quoteTotals` response shape, and the same
server-side `EDITABLE_STATES` containment — every state in that set is pre-issue, which is
what keeps both endpoints from ever reaching an order line, a payment, or an issued quote.
Record-level deletion is **not wanted** (owner, 2026-08-17): no record delete path, no
withdraw/archive, no cascade decision.

---

## 6. The divergence record and the baseline resolution (model fixed here; R3 builds it)

### 6.1 The model

**Original information** (CONTEXT.md, new term): the value a line field first carried,
whatever its origin — extracted from a schedule, submitted by the customer, or proposed by
the estimator. One resolved original value per line field. The **divergence record** is the
single fact written on a quote at issue: every line field whose issued value differs from its
original value, with both values; empty is still a record (AC-8).

### 6.2 Why the baseline must be captured, not resolved from live tables

The candidate sources are not immutable: `opening_instance` is updated in place by
re-extraction (`worker/lib/ai/pipeline.ts:774`) and re-estimation; `quote_line` for a
customer-configured line is edited in place with no prior-value journal (`edited_fields`
records *which* fields changed, never what they were). A baseline resolved at issue time from
those tables would report divergence against the *latest* machine state, not the original
information — and for customer-origin lines it could not be resolved at all. So the baseline
is its own fact, captured once:

- **`line_baseline`** (R3 migration, additive `CREATE TABLE`): one row per parent
  `quote_line`, written **once, at the moment the line first receives values from a
  non-staff source** — proposal application for estimator lines, submission for
  customer-configured lines (A-9), parse application for schedule lines. Columns:
  `line_id` (PK, FK → quote_line **ON DELETE CASCADE** — a deleted line has no divergence to
  report; this deliberately adds a 54th cascade and is recorded for the d1-safety mental
  model: any future `quote_line` rebuild must count `line_baseline` among its children),
  `project_id`, `fields_json` (map of field → `{ value, origin: "extracted" | "submitted" |
  "proposed" }`), `captured_at`. Write-once is enforced by `INSERT … WHERE NOT EXISTS`, the
  same discipline `staff.ts` uses for the admin bootstrap. Ops line deletion (an R1
  capability, owner decision 2026-08-17) fires this cascade once R3 ships — intended: a
  deleted line has no divergence to report. An ops-*created* line is staff-authored — no
  non-staff source, so no baseline row and, by AC-7b, no divergence; nobody backfills one.
- **`worker/lib/original.ts`** exposes exactly two functions — the deep-module seam:
  `captureBaseline(env, lineId)` (idempotent) and `resolveBaseline(env, projectId)`
  (read for issue-time comparison and for R3's derivation surface, which shows original
  beside current — AC-45a). Nothing else reads `line_baseline` directly.

This follows the codebase's own precedent for moment-frozen facts
(`configuration_snapshot_json`, `referral_percent_at_issue`, delivery `settle_json`): the
baseline is a *different fact* from the proposal ("what the line first carried" vs "what the
estimator currently proposes"), so storing it is not duplication under the one-place-per-fact
rule. ADR-0003 records the trade-off.

### 6.3 The comparison and the write

`worker/lib/divergence.ts`: `divergenceOf(baseline, issuedLines)` — pure, tested directly —
compares **every field present in the baseline** against the issued value (AC-7c's rule: the
set is "fields with an original value", never an enumerated list; a field with no baseline
entry is not a divergence — AC-7b). `issueQuote()` (`worker/lib/issue.ts`) is the single
issue enforcement point today and gains the one call that writes **`quote_divergence`**
(R3 migration, additive): `id`, `project_id`, `issued_at`, `fields_json` (possibly `[]` —
A-1), appended per issue and retained across re-issues (A-2). Inside the same `DB.batch` as
the issue flip, so a quote cannot be issued without its record nor a record written for a
failed issue. Never serialised into any customer-facing body (AC-10; verified by the R3
tester against the quote/PDF/email surfaces).

R3 integration note (design guidance, not license to refactor): `issueQuote` already invokes
`captureRecommendationOutcomes` — the AI-vs-human *learning* record. The divergence record is
a different fact with a different baseline (original information, not the recommendation) and
different visibility rules; R3 must not merge them, but should route both from the same
issued-lines read to avoid a second query pass.

---

## 7. `waitingOn` becomes a mixed derivation (seam fixed here; R4 builds it)

Today `waitingOn` is a three-value union derived purely from lifecycle state
(`worker/lib/lifecycle.ts:56, :72`). "With manufacturer" is the only value a **human sets**
(spec §9.10), so the derivation gains a stored input — and the seam is designed so the
single-derivation-point property survives:

- **Storage:** `project.with_manufacturer_since TEXT NULL` (R4 migration, additive
  `ALTER TABLE project ADD COLUMN` — no rebuild, no cascade exposure). A timestamp, not a
  boolean: set = the mark plus its age (which the deferred phase-2 attention item will want);
  NULL = cleared. Set/clear via a small `POST /projects/:id/with-manufacturer` endpoint
  (R4), human-only, no side effects (AC-52), audit-logged like every ops action.
- **Derivation:** `lifecycleOf(args)` gains `withManufacturerSince?: string | null` and the
  union gains the value; precedence: `after_sales → "Nobody"` (finished business stays
  finished), else mark set → `"Manufacturer"`, else `CUSTOMER_WAITS → "Customer"`, else
  `"Us"`. `lifecycleOf` **remains the only place** the word is decided; the queue rank
  (`worker/routes/ops.ts:398`) becomes `Us 0 · Manufacturer 1 · Customer 2 · Nobody 3`
  (AC-50a) and continues to read the derived value, never the column.
- **No auto-clear.** Lifecycle transitions do not clear the mark: it is a human-owned fact
  (I1), and a phase change while the job is genuinely with the manufacturer is common
  (deposit paid → manufacturing). R4's UX makes the mark visible on the record so a stale
  mark is a glance, not a hunt. (R4 may revisit with the ux-designer; the seam does not care.)

---

## 8. Permission model (system rules fixed here; R2 builds and sweeps)

### 8.1 Role membership lives in the application database — decided, with the costing C8 asked for

**Cloudflare Access groups (rejected):** role claims are minted into the Access JWT at
session issuance, so a role change applies at next *re-authentication*, not next request —
failing AC-29 outright. Role administration would live in the CF dashboard, outside the ops2
admin screen the owner asked for, unauditable by `logEvent`, unable to enforce the last-admin
invariant (AC-30), and unconstructible in tests (AC-66a's constructed manufacturer). Its one
genuine advantage — revocation enforced at the edge even if the Worker is buggy — is
preserved anyway, because Access membership itself is still the outer gate (I7: removing
someone from the Access policy locks them out regardless of any DB row).

**Application database (chosen):** `user.role` — which already exists, already gates
(`admin`), already has a guarded admin write path (`PATCH /api/ops/staff/:id`,
`worker/routes/ops.ts:2126` with the atomic last-admin guard) and an audit trail — remains
**the single role store**. No new table: the fact "what may this person do" already has a
home; ops2 sharpens its vocabulary and its enforcement rather than duplicating it. ADR-0001.

### 8.2 The role vocabulary and its migration

Shipping roles (spec §9.7): `admin`, `reviewer`, `manufacturer`. Migration
(R2, data-only, additive in the d1-safety sense — no DDL, no rebuild, no cascade path):

```sql
-- children affected: none (UPDATE on user.role only; no row deleted, no FK touched)
UPDATE user SET role = 'reviewer'
 WHERE type = 'internal' AND role IN ('estimator','technical_reviewer','manager');
```

AC-28a analysis: the three retired labels gate nothing today (`worker/routes/ops.ts:100–104`
— every capability helper is `isStaffUser`), so mapping them to `reviewer` grants no reach
that did not exist and removes only what §9.7 removes deliberately. Production holds three
users, all `admin` — the UPDATE touches zero production rows; the mapping exists for
non-prod databases and for correctness. AC-33's before/after row counts are trivially
satisfiable and still executed against a production copy, per the skill.

**Rollback safety (AC-34):** the previous Worker reads `user.role` and treats any
non-manufacturer value as full staff (`isStaffUser`), `admin` for the two admin gates. A
database where a hypothetical row now says `reviewer` authorizes on the old Worker exactly as
`manager` did. Nothing is renamed, dropped, or re-keyed. The domain-based *assignment* path
(`findOrCreateInternalUser`'s allowlist + manufacturer pinning) is untouched until deletion.

### 8.3 How every endpoint asks its authorization question

The seam is `worker/lib/rbac.ts` (R2), a deep module with a three-part interface:

1. **`Capability`** — a closed union naming what can be done, at the granularity §9.7's table
   draws: `records.read`, `records.write`, `quotes.issue`, `pricing.admin`,
   `catalogue.admin`, `customers.read`, `customers.write`, `enquiries.*`, `files.read`,
   `audit.read`, `staff.admin`, `referrals.admin`, `self.read`. (Exact list is R2's to
   finalise against the endpoint sweep; the rule is that a capability names a *business
   reach*, not an endpoint.)
2. **`capabilitiesOf(role: string | null): ReadonlySet<Capability>`** — the one place the
   role→reach fact lives. `null` → empty set (AC-27). `manufacturer` → `{self.read}` and
   nothing else in phase 1 (AC-66); phase 2 widens this **here and only here**.
3. **The route manifest + floor.** A `ROUTE_CAPABILITY: Record<"METHOD /path-pattern",
   Capability | "public">` covering every route mounted under `/api/ops` (public: `brand`,
   the OTP trio in non-Access mode). A Hono middleware mounted first on the ops app
   resolves the actor once, looks the matched route up in the manifest, and refuses:
   unauthenticated → 401/403; **route not in the manifest → 403 always** (AC-69: gated by
   default — an endpoint someone forgot to declare is closed, not open); actor's capability
   set lacking the declared capability → 403. Handlers keep resolving the actor for identity
   (`staff.id` in writes) but no handler is the *last* line of defence any more.

   A node test enumerates the Hono app's mounted routes and fails if any `/api/ops/*` route
   is missing from the manifest — the manifest cannot rot into documentation.

This replaces the ~50 inline `resolveStaff` boilerplate blocks *as the gate* while leaving
them in place as identity resolution during R2's sweep (they become redundant checks, which
is the safe direction). The per-handler `isAdmin` checks on pricing/staff/referral surfaces
are subsumed by capabilities and removed by R2 endpoint-by-endpoint, test-first.

### 8.4 Identity resolution changes (additive, in `worker/lib/staff.ts`)

- Access-mode resolution today refuses any verified email outside the domain allowlists
  (`staff.ts:158`). ops2's rule (D5): **a user row with a granted role is admitted
  regardless of email domain** — `isStaffEmail(env, email) || (existing row with non-null
  role)`. On-domain first-sign-in auto-creation (role-less until granted, AC-27) is
  unchanged; off-domain people get a row only when an admin creates the grant (a future-hire
  flow R2 specifies; nothing auto-creates off-domain rows).
- The admin bootstrap (`bootstrapAdmin`) and manufacturer re-pinning stay exactly as they
  are — AC-31 depends on the former; the latter is dormant (D-1) but harmless and refused
  everywhere by the floor regardless (AC-66a's "the same refusals hold without further
  change").
- `resolveOpsUser` / `resolveStaff` keep their contracts; `rbac.ts` consumes them.

### 8.5 AC-57a stays closed by construction

ops2 adds **no** authentication routes of any kind. The OTP trio and its
`otpDisabledInAccessMode` 404 guard (`worker/routes/ops.ts:190–235`) are untouched by every
region; R2's test battery executes AC-57a against the running Worker (customer hostname
included) with Access configured and asserts: 404, no user row created, no `type` flip, no
bootstrap fire.

---

## 9. Migration ledger (all currently-designed schema work)

Migrations are append-only, numbered after the highest file at implementation time (0051 —
`0051_referral_program.sql` — as of this writing; the referral thread may advance this).
Every one below is **additive**; none rebuilds a table; the d1-safety skill is loaded again
by the developer before each is authored, and remote applies follow the export-first /
count-before-after protocol.

| Region | Migration | Kind | Cascade analysis |
|---|---|---|---|
| R2 | role vocabulary UPDATE (§8.2) | data-only | No DDL. No FK touched; no delete anywhere. AC-33 counts verified on a production copy regardless. |
| R3 | `CREATE TABLE line_baseline` | additive DDL | Declares FK → `quote_line` ON DELETE CASCADE (deliberate, §6.2). Adds a cascade child to `quote_line`: recorded so any future `quote_line` rebuild counts it. |
| R3 | `CREATE TABLE quote_divergence` | additive DDL | FK → `project` ON DELETE CASCADE (a deleted project's divergence history goes with it, matching every other project child). Adds a cascade child to `project`: same recording. |
| R4 | `ALTER TABLE project ADD COLUMN with_manufacturer_since TEXT` | additive DDL | No rebuild (SQLite ADD COLUMN is in-place); no FK; no cascade exposure. |
| R1, R5–R8 | none | — | R1 explicitly ships with zero migrations. |

---

## 10. Testing strategy (system level; each region's design names its own additions)

- **New node suite per region**, wired into `package.json`: `test:ops2` runs
  `scripts/tests/ops2-frame.test.mjs` (R1), later joined by `ops2-rbac.test.mjs` (R2 — the
  §10 abuse battery as *attempts* against the running Worker, constructed manufacturer
  included), `ops2-divergence.test.mjs` (R3), `ops2-work.test.mjs` (R4), etc., all added to
  the root `test` chain. Worker-side tests follow the existing harness pattern in
  `scripts/tests/helpers.mjs` / `api.test.mjs`.
- **Playwright**: `scripts/tests/web/ops2-*.spec.ts`, with a shared width matrix fixture
  (320 / 375 / 768 / 1024 / 1440 px) and a mid-task resize helper — AC-11/12/15's harness.
  Device-lab passes on the two reference devices (AC-15) are a manual tester step recorded in
  the register, not automated.
- **Plane-shell grammar assertions** (ADR 0004) join the width-matrix fixture: at 320 and
  390 px, every registered destination renders exactly one plane; the scroll container is
  the plane body, never the document; the action footer carries the declared primary when
  one exists; planebar/back control are reachable; focus lands on the pushed plane's
  heading. The route table's zone-only element type is the compile-time half.
- **Register discharge** is a tester activity per region (AC-36): each row exercised in its
  recorded environment, evidence noted in `docs/ops2/register.md`.
- **The layout-purity static check** (§4.3) and the **route-manifest coverage check** (§8.3)
  are permanent tripwires, not one-offs.

---

## 11. Security (system level; each region's design carries its own section)

### 11.1 Data classification

| Data ops2 touches | Class | Handling rule |
|---|---|---|
| Referral payout details (BSB, account, ABN) | **Financial PII** | Admin-only capability (`referrals.admin`); payouts screen is the only reader (AC-70–75); never logged; access itself logged (`payout_details_access`, write-only). R7 restates the referral spec's controls against the capability model. |
| Customer identity/contact, enquiry PII, submit-time contact | Personal PII | Staff capabilities only; enquiry endpoints keep their role gates; refusals non-disclosing (§11.4). |
| Pricing: rate cards, option prices, per-line overrides, account discounts | Commercial | Read for staff roles; **writes are `pricing.admin`/`catalogue.admin` = Admin only** (§9.7). Reviewer keeps per-line overrides (`records.write`) by owner decision. |
| Quote/order/lifecycle data, candidate/evidence data | Commercial | Staff capabilities; new R3 read paths (candidate_result, building-model) are staff-gated like every record read — the derivation surface is ops-only and never serialised to customer responses. |
| New stored facts: `line_baseline`, `quote_divergence`, `with_manufacturer_since` | Commercial/internal | Ops-only; D19/AC-10 forbids any customer-facing serialisation of divergence data — enforced by the R3 tester against quote bodies, emails, PDFs. |
| Access assertion / identity | Credential material | Never stored beyond the existing `user` row; JWT verification path untouched (C8). |

### 11.2 Trust boundaries

1. **Internet ↔ Cloudflare Access (ops host):** unchanged, byte-for-byte (AC-62). MFA and
   policy live here. ops2 introduces no path around it: same host, no new hostname, no new
   audience, no new auth route (§8.5).
2. **Access ↔ Worker:** `Cf-Access-Jwt-Assertion` verified against JWKS + fixed `aud`
   (`staff.ts:174`). Fail-closed when Access is configured (AC-57). Unchanged.
3. **Worker ↔ D1:** role read per request from `user.role` (AC-29); all authorization
   decided in the Worker (`rbac.ts`), never in the client — hiding a destination is never
   the control (AC-67).
4. **Customer hostname ↔ Worker:** the shared `/api` app serves both hostnames; the ops OTP
   guard (AC-57a) and the manifest floor (§8.3) are what keep ops surface unreachable from
   the customer side with customer credentials (AC-60).
5. **Worker ↔ third parties:** Sanity (catalogue reads), Resend (email), Cloudflare certs
   endpoint (JWKS). ops2 adds no new third-party crossing.

### 11.3 Per-endpoint authorization and the scoping question

Ops is an **internal, business-wide** console: staff queries are deliberately unscoped by
account — the "account-scoping filter" for every staff-capability endpoint is *role
capability + the identifier the route names*, and that is stated here explicitly rather than
left to assumption. The canonical auth-present-but-query-unfiltered failure is guarded at a
different joint in this design:

- **Every `/api/ops/*` route** must appear in the route manifest with a capability, or the
  floor refuses it (§8.3). The manifest **is** the per-endpoint authorization table; R2's
  design pass publishes it in full (every route × capability) and the coverage test keeps it
  honest. R1's interim table (pre-RBAC) is in the R1 design's Security section.
- **Identifier discipline (AC-76):** record/list endpoints validate the identifier's type
  and answer `not_found` identically for "doesn't exist" and "exists but refused"
  (the `worker/routes/auth.ts:35` discipline, extended to ops refusals for non-staff
  actors — AC-68).
- **Customer-side scoping is untouched:** no ops2 change relaxes any `WHERE account_id = ?`
  on customer routes; ops2 serialises nothing new into any customer response (spec §6.3).
- **Manufacturer floor:** `capabilitiesOf('manufacturer') = {self.read}` — the refusal is
  a positive rule at one seam, not an absence of routes (AC-66/66a/67/87).

### 11.4 Abuse cases → where they are answered

| Abuse case | Answered by |
|---|---|
| Access-free write into the identity table via OTP verify on any hostname | §8.5; AC-57a executed as an attempt in R2 |
| Foreign-audience / forged / expired assertion | Existing `verifyAccessEmail` checks (unchanged); AC-58/59 attempts |
| Customer session replayed against ops endpoints | Access-mode resolution ignores session cookies (`staff.ts:145–159`); floor refuses; AC-60 attempt |
| Revoked-in-one-gate actor (Access removed XOR role revoked) | I7 two-gate composition (§8.4); AC-61 attempts both halves |
| Privilege escalation via request-body `role`/`permissions` fields | Only `PATCH /staff/:id` writes roles, admin-capability-gated with the atomic last-admin guard; every other handler's body parsing has no role path; AC-63/64 attempts |
| Reviewer reaching admin surfaces by direct URL / replayed admin request | Capability floor per route manifest; AC-65/77 attempts |
| Manufacturer role becoming a live hole when a variable is set or a grant is made | Floor rule keyed on role, not on email domain or navigation; AC-66a constructs the identity and attempts every endpoint |
| Enumeration via refusal bodies (record existence, staff existence) | Non-disclosure discipline §11.3; AC-68 attempt |
| Stored XSS via free-text (notes, reasons, references) | React text rendering by default; the R1 static check extends to refuse `dangerouslySetInnerHTML` in `src/ops2/**`; AC-78 attempts store-and-render |
| Payout PII leaking into logs/telemetry/other surfaces | AC-71–75 (R7); Worker logging discipline already never logs payout values — R7 re-verifies against ops2 requests |

**Residual risks, named:** (1) A compromised *admin* identity is out of scope by design —
RBAC bounds reach per role; it cannot bound the top role. Access+MFA is the control there.
(2) During the soak, the legacy console's flat authorization coexists with RBAC; its users
are the two founders (admins), so the window adds no reach, but it is a standing state the
register's deletion gate closes. (3) `self.read` responses to a manufacturer identity
disclose only their own row — reviewed at R2 to keep it that thin.

---

## 12. Sequencing (what is built first, and why the order holds)

R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8, per spec §7.1 — with the two system-level couplings
made explicit:

1. **R1 before everything:** the layout system, `Loadable`, `WriteState`, the route frame
   and the record are the interfaces every later region programs against. R1 ships against
   the **existing** role resolution (its endpoints are already staff-gated today); the R2
   floor tightens beneath it without changing R1's client.
2. **R2 before R3–R7:** every subsequent surface is built against the final gate, and the
   §10 abuse battery runs once against a stable permission surface.
3. **R3 owns baseline capture**, but the capture points fire on *line creation events* that
   exist independently of R3 — so R3's migration backfills nothing: lines created before R3
   ships have no baseline rows, and by AC-7b absence-of-baseline is absence-of-divergence.
   Stated so nobody writes a backfill that invents "originals" from current values.
4. **R8 is two deploys** (switch-over, deletion) with the register gates between (AC-38,
   AC-89) and the §2.3 rollback drill (AC-34) rehearsed before switch-over, not after.

---

## 13. Rejected alternatives (system level)

| Alternative | Rejected because |
|---|---|
| A parallel ops2 API namespace (`/api/ops2/*`) | Two interfaces over one implementation; every fact gains a second place to drift; AC-40 becomes expensive instead of free. |
| Hash routing (spec §7.1 wording) | Fails AC-24 under cold Access sign-in — fragments do not survive the interactive login redirect. ADR-0002. |
| Role membership in Cloudflare Access groups / JWT claims | Fails AC-29 (claims fixed at session issuance); no in-app administration, audit, last-admin guard, or test constructibility. ADR-0001. §8.1 costs it in full. |
| A new `role_grant` table beside `user.role` | Two places for the role fact through the soak and forever after; `user.role` already has the guarded write path and audit. The vocabulary, not the storage, is what D5 changes. |
| Resolving the divergence baseline from live tables at issue | Sources are mutated in place (re-extraction) or journal-free (customer lines); the "original" would drift. ADR-0003. |
| Snapshotting per-edit history to support undo | Removed by owner correction 2026-08-17; carrying the structure "in case" is exactly the hedging the owner's standing guidance forbids. |
| A query-cache/state library (react-query et al.) | Two users, cheap refetches, and I6's loudness is easier to guarantee when staleness doesn't exist. The `Loadable` seam leaves room to add dedup behind the hooks if ever needed. |
| Device-class breakpoints (`md:`/UA sniffing) for ops2 layout | Disqualified by C1; the Fold changes width mid-session. Container queries + one folding component. |
| A second hostname for ops2 | Security-path changes (`ACCESS_AUD` list, `isOps` widening, new Access app) for cosmetics. Spec §6.3 already forbids it; confirmed here with the code evidence. |
| Ionic React as navigation/component framework (owner-named) | Costed in ADR 0004: `@ionic/react-router` pins React Router v5 against the repo's 7.13; shadow-DOM theming against the Tailwind v4 token layer; `ion-split-pane`'s media-query desktop story fails D4/C1; and it would replace the settled mock's §13 grammar rather than implement it. The stack-navigation practice is adopted; the implementation is owned (§4.0). |
| Framework7 | Its own router cannot serve AC-24/26 path deep links; desktop theme removed in v8 — mobile-only idiom; DOM-first beside React. ADR 0004. |
| Konsta UI as the pattern layer | Presentational widgets only — no navigation stack, which is the load-bearing half; a second visual idiom against the approved treatment. ADR 0004. |
| A pattern-free headless substrate (§4 as first written) | Mechanisms without a pattern layer enforce no mobile IA — empirically failed at the R1 mock gate. Superseded by §4.0. ADR 0004. |

---

## 14. Deferred to later design passes

- **R2:** the full route×capability manifest; staff-admin screen interaction spec; the
  future-hire (off-domain grant) flow; the abuse-battery test harness detail.
- **R3:** the field vocabulary of `line_baseline.fields_json` (per-field extraction from
  `opening_instance` / `ai_proposal_line` / submitted config); the derivation surface;
  candidate_result endpoint shape; reconciliation with `captureRecommendationOutcomes`.
- **R4:** attention-surface composition; queue views; with-manufacturer UX and whether any
  transition prompts a mark review (ux-designer question, seam unaffected).
- **R5–R7:** their surfaces; no system-level unknowns identified.
- **R8:** PWA manifest details (manifest-only install, **no service worker** in phase 1 —
  AC-55/56 are trivially held when nothing caches and nothing subscribes; recorded now as
  the intended shape, finalised in R8's pass).

## 15. Registry of paired documents

- `docs/design/ops2-r1-frame-and-record.md` — R1 detail (this pass).
- `docs/ops2/register.md` — the carry-across register, created and region-assigned
  (AC-35, AC-40a, AC-40b discharged at this gate; the production role-data half of the
  AC-40b sweep is a named residual step in the register preamble).
- `docs/adr/0001-rbac-role-store-in-application-db.md`
- `docs/adr/0002-ops2-path-routing-not-hash.md`
- `docs/adr/0003-original-information-captured-at-line-birth.md`
- `docs/adr/0004-ops2-plane-shell-owned-not-adopted.md`
- `CONTEXT.md` — created on this branch (the planning branch predates it) carrying the
  current dev-line glossary plus spec §14's terms; merges forward with the branch.
