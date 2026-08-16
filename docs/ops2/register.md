# ops2 — carry-across register

Created by the architect at the R1 design gate (AC-35, AC-40a). Source of truth for
completeness (spec §8): one row per capability in `docs/ops-redesign/UX-SPEC.md` §B.4's
**left column** (rows 1–272), plus the dormant entries (§8.1), plus the appendix of
non-obligations (rows 273–291) recorded so they are not re-discovered as gaps.

**How to use this file**
- **Region** — which build region owns discharging the row (spec §7.1).
- **Env** — where the capability is exercisable: `PROD` or `NON-PROD` (spec §8).
- **State** — empty until discharged; one of `CARRIED / REPAIRED / RESTATED / DROPPED / DORMANT / DEAD`
  with the evidence that state requires (spec §8). A row moving to `DROPPED` or `DORMANT`
  requires an owner-visible entry (AC-37).
- **Gates** — switch-over: no row unaccounted for (AC-38). Deletion: no `CARRIED`/`REPAIRED`
  row unexercised in its recorded environment (AC-89).
- **R7 (referrals)** carries no §B.4 rows: its rows are added when R7 pins the referral
  requirement set to a named commit (AC-91).

**AC-40b sweep record (2026-08-17, architect):** the §8.1 sweep was repeated over the
then-current `worker/types.ts` and `wrangler.jsonc` (referral-program branch). No ops-console
capability beyond D-1/D-2/D-3 stands behind an unset variable: the remaining unset vars
(`SCAN_ENDPOINT`/`SCAN_AUTH` → D-3, `MANUFACTURER_EMAIL_DOMAINS` → D-1, `THERMAL_DEBUG_KEY`,
`PARSE_*`/`AI_*` engine selection) are covered by spec §6.3 exclusions or existing D-rows.
**Residual step for R1 implementation:** the production role-data half of the sweep —
`wrangler d1 execute apertly-db --remote --command "SELECT role, COUNT(*) FROM user WHERE type='internal' GROUP BY role"`
(read-only; still requires the deploy-protocol approval) — expected: 3 users, all admin.

## Dormant entries (spec §8.1)

| # | Capability | Region | Env | State | Evidence / owner decision |
|---|---|---|---|---|---|
| D-1 | The manufacturer-only Enquiries view (`tabsFor`, single-tab landing) | R2 (refusals), R8 (deletion) | NON-PROD | DORMANT | Never reachable in production: `MANUFACTURER_EMAIL_DOMAINS` unset, no manufacturer account has ever existed. Not carried; deferred with the phase-2 partner surface. Refusals carried in full from day one (AC-66, AC-66a). Owner sees this row (AC-37). |
| D-2 | The ops OTP sign-in screen (§B.4 rows 5–13) and its production 404 guard | R1 (screen), R2 (guard test) | NON-PROD | — | Carried in full; exercised in local/staging where it is load-bearing. The production 404 guard is itself carried and tested (AC-57a). |
| D-3 | External AV scanning of uploads (`SCAN_ENGINE` = remote/both) | R5 | PROD (structural) / NON-PROD (AV path) | — | Carried as-is; ops2 changes no scanning behaviour. Rendering criterion AC-85a: `unknown` / `scanner_misconfigured` never presented as safe. |

## Obligations (§B.4 rows 1–272)

| # | Capability (verbatim, §B.4 left column) | Region | Env | State | Evidence / notes |
|---|---|---|---|---|---|
| 1 | `hydrateFromSanity()` blocks first paint with a blank page | R1 | PROD |  |  |
| 2 | Boot spinner on `bg-ops`, no text | R1 | PROD |  |  |
| 3 | `GET /api/ops/me` → sign-in or shell | R1 | PROD |  | Deep-link survival is path-routed in ops2 (ADR-0002); the hash claim in the discarded right column is wrong under cold Access sign-in. |
| 4 | `GET /api/ops/brand`; logo → business name → the literal word `OpenFrame`; an invented mark is banned | R1 | PROD |  |  |
| 5 | Sign-in card, `Internal console — staff sign-in` | R1 | NON-PROD |  | D-2 block starts here: rows 5–13 are exercisable in local/staging only; the production 404 guard is tested by AC-57a (R2). |
| 6 | `Work email` field; `Send code` / `Sending…` | R1 | NON-PROD |  |  |
| 7 | Email regex fails → the button silently does nothing | R1 | NON-PROD |  |  |
| 8 | 6-digit code field, `••••••`, digits only, Enter submits | R1 | NON-PROD |  |  |
| 9 | Dev-code banner `Dev mode — code is {code}` | R1 | NON-PROD |  |  |
| 10 | `Sign in` / `Verifying…`; `← Change email` | R1 | NON-PROD |  |  |
| 11 | `Something went wrong.` / `Invalid code, or this email isn't authorised for the ops console.` | R1 | NON-PROD |  |  |
| 12 | `Authorised staff only. Access is logged.` | R1 | NON-PROD |  |  |
| 13 | No resend, no expiry countdown (server expires at 10 min, never stated) | R1 | NON-PROD |  |  |
| 14 | `Sign out`, awaited, `accessLogout` full navigation | R1 | PROD |  |  |
| 15 | Role gating via `tabsFor` | R2 | PROD |  | Role gating moves to RBAC (§9.7); manufacturer shell handling lands with AC-87. |
| 16 | 8 nav tabs, lucide icons, sage active left border | R1 | PROD |  |  |
| 17 | Desktop rail `w-56` fixed, content offset `md:ml-56` | R1 | PROD |  |  |
| 18 | Sticky white header carrying only the capitalised tab name | R1 | PROD |  |  |
| 19 | Mobile drawer: 264px / 82vw, scrim, Esc, scroll lock, safe-area padding, 44px rows, overlay-never-a-route | R1 | PROD |  |  |
| 20 | Omnibox: 250 ms debounce, min 2 chars, 4 types, LIMIT 8 each, `label` + type + `hint` | R4 | PROD |  |  |
| 21 | Selecting a result switches tab and **throws the id away** | R4 | PROD |  |  |
| 22 | No keyboard, no "no results", errors swallowed | R4 | PROD |  |  |
| 23 | `Placeholder` component — unreachable dead code | R1 | PROD | DEAD | Unreachable component (§B.4.17). Tester confirms no call sites. |
| 24 | No routing, no back, no refresh-safe state | R1 | PROD |  |  |
| 25 | No global error boundary | R1 | PROD |  |  |
| 26 | No manual refresh control anywhere | R1 | PROD |  |  |
| 27 | No toasts, no undo, no optimistic UI | R1 | PROD |  |  |
| 28 | `GET /summary` → 7 counts | R4 | PROD |  |  |
| 29 | Five "Needs us" rows with exact singular/plural copy | R4 | PROD |  |  |
| 30 | Rows with count 0 are not rendered | R4 | PROD |  |  |
| 31 | `Open →` switches tab without applying a matching filter | R4 | PROD |  |  |
| 32 | Empty state: `Nothing is waiting on us.` / `New submissions and enquiries appear here.` | R4 | PROD |  |  |
| 33 | "The shop": `Active orders`, `Customers`, deliberately inert | R4 | PROD |  |  |
| 34 | Loading: bare spinner. Error: `Couldn't load the summary.` + raw error | R4 | PROD |  |  |
| 35 | `degraded: true` ignored; zeros rendered as fact | R4 | PROD |  |  |
| 36 | 5 filter chips (`needs-us`, `open`, `customer`, `production`, `all`) | R4 | PROD |  |  |
| 37 | Server sort `Us → Customer → Nobody`, then longest `daysInStage` | R4 | PROD |  |  |
| 38 | 9 desktop columns: Ref · Project · Customer · Lines · Value+basis · Stage · Waiting on · Days · Flags | R4 | PROD |  |  |
| 39 | Phone card list, 5 rows, full-bleed | R4 | PROD |  |  |
| 40 | `Unpriced {n}` chip | R4 | PROD |  |  |
| 41 | `Waiting on` as the literal word; weight, not hue, as emphasis | R4 | PROD |  |  |
| 42 | Whole `<tr>` clickable → record | R4 | PROD |  |  |
| 43 | Empty ×2: `Nothing is waiting on us.` / `No projects match this filter.` | R4 | PROD |  |  |
| 44 | `{n} project(s) is/are with the customer` escape hatch | R4 | PROD |  |  |
| 45 | Fetch error degrades to the empty state | R4 | PROD |  |  |
| 46 | `orderNo` fetched, never rendered | R4 | PROD |  |  |
| 47 | `updatedAt` fetched, never rendered | R4 | PROD |  |  |
| 48 | `phaseIndex` fetched, never rendered | R4 | PROD |  |  |
| 49 | No bulk selection, export, pagination, in-list text search, saved views beyond the chips | R4 | PROD |  |  |
| 50 | `← All projects` back control | R1 | PROD |  |  |
| 51 | `{publicRef} · {title}`; the ref is never renamed and never shown alone; the order number is deliberately not the anchor | R1 | PROD |  |  |
| 52 | Subtitle `org · customer · email`, falling back to submit-time contact for anonymous submitters | R1 | PROD |  |  |
| 53 | `contactPhone`, `deliverySuburb` fetched, never rendered | R1 | PROD |  |  |
| 54 | Money = sum of the displayed rows; caption `contract` / `issued` / `estimate` | R1 | PROD |  |  |
| 55 | `statusCustomer` fetched, never rendered | R1 | PROD |  |  |
| 56 | `unresolvedLineCount` | R1 | PROD |  |  |
| 57 | Phase ribbon — 6 equal cells, passed / current / future, never colour alone | R1 | PROD |  |  |
| 58 | Caption `Now · {stateLabel} · waiting on {x} · {n} days in this state` | R1 | PROD |  |  |
| 59 | 6 phases · 10 internal state labels · 12 order stage labels | R1 | PROD |  |  |
| 60 | Server-derived `actions[]`; exactly one primary; `tier` | R1 | PROD |  |  |
| 61 | `blockedReason` printed beside a disabled action | R1 | PROD |  |  |
| 62 | 15 actions across 21 states: `start-pricing`, `issue-revision`, `status:technical_review_required`, `status:estimator_assigned`, `request-clarification`, `note`, `advance:*` ×9, `pay:deposit`, `pay:balance` | R1 | PROD |  |  |
| 63 | `tier: "overflow"` declared, never produced | R1 | PROD |  |  |
| 64 | Confirm-in-place, never a modal; label + consequence sentence + optional free text | R1 | PROD |  |  |
| 65 | Note input is single-line; the server cap of 500 is neither shown nor enforced | R1 | PROD |  |  |
| 66 | Every failure — including a row-level one — lands in the header error strip | R1 | PROD |  |  |
| 67 | `ACTION_ERRORS` — 13 mapped codes with good copy | R1 | PROD |  |  |
| 68 | ~11 codes fall through to `That action could not be completed.` | R1 | PROD |  |  |
| 69 | `OpsApiError.missingOptions[]` received and discarded | R1 | PROD |  |  |
| 70 | Unresolved banner, full pluralisation | R1 | PROD |  |  |
| 71 | Four error messages instruct the user to reload; no reload control exists | R1 | PROD |  |  |
| 72 | Version tabs `Live draft / R3 / R2 / R1`; selecting one does **not** load that revision's lines | R1 | PROD |  |  |
| 73 | Hard-coded literal `editing elsewhere` | R1 | PROD |  |  |
| 74 | Read-only bar `Viewing an issued revision — read-only. [Back to the live draft]` | R1 | PROD |  |  |
| 75 | Line panel header `Draft lines / Contract lines / Issued lines` + `{n} lines` | R1 | PROD |  |  |
| 76 | Contract-line shim (flattens every row to `ready`, drops composite structure) | R1 | PROD |  |  |
| 77 | `EDITABLE` state set gates whether inputs render at all | R1 | PROD |  |  |
| 78 | 6-column line table: Code · Product · Size · Qty · Line total · State | R1 | PROD |  |  |
| 79 | Empty: `No lines on this project.` | R1 | PROD |  |  |
| 80 | Code cell in sage, data face | R1 | PROD |  |  |
| 81 | Room (`line.room`) under the product | R1 | PROD |  |  |
| 82 | `configuration · {selectedVariantId}` under the product | R1 | PROD |  |  |
| 83 | Review flags as a `<ul>` in warning ink, via `reviewReasons()` | R1 | PROD |  |  |
| 84 | `composite · {n} joined unit(s)` in sage | R1 | PROD |  |  |
| 85 | Mixed-product suffix (` · A + B`) when units differ | R1 | PROD |  |  |
| 86 | `frame system · {name}` / `mixed frame systems · A + B — confirm these couple` | R1 | PROD |  |  |
| 87 | Size rendered **height × width** (trade convention) | R1 | PROD |  | Height × width house convention — binding on every ops2 surface. |
| 88 | Qty displayed, never editable | R1 | PROD |  |  |
| 89 | State collapsed to `ready` / `needs review`, word carries it | R1 | PROD |  |  |
| 90 | `edit` ⇄ `close` and `split` / `units` links, editable states only | R1 | PROD |  |  |
| 91 | No margin, cost, markup, discount or override column anywhere | R1 | PROD |  |  |
| 92 | No add-line, delete-line, duplicate or reorder | R1 | PROD |  | Superseded in part by owner decision 2026-08-17: line add and hard delete ARE built at R1 (`POST /projects/:id/lines`, `DELETE /lines/:id`). Duplicate and reorder remain absent. The "no line may be added or deleted" sentence is not carried. |
| 93 | No per-line notes UI (`comment.line_id` exists, never written by the UI) | R1 | PROD |  |  |
| 94 | No per-line file link, audit link, or comment thread | R1 | PROD |  |  |
| 95 | `ItemForm` reused verbatim from the customer estimator | R1 | PROD |  |  |
| 96 | Item ID (`maxLength 10`, uppercased), duplicate → `Item ID already exist` | R1 | PROD |  |  |
| 97 | Product type / Product selects, `— withdrawn from sale`, `— different frame system` suffixes, `includeDisabled` | R1 | PROD |  |  |
| 98 | Dimensions disclosure, live elevation, height-first fields, range hint, undersize danger copy | R1 | PROD |  | Undersize copy carried as a warning only — the blocking guard is removed (owner ruling 2026-08-17: warn-never-block). |
| 99 | Note field (`maxLength 500`) → `quote_line.room_label` | R1 | PROD |  |  |
| 100 | Options disclosures, glazing picker, colour swatches, `· required` | R1 | PROD |  |  |
| 101 | Debounced (250 ms) server price preview with GST suffix and ` · {unit} ea` | R1 | PROD |  |  |
| 102 | `Confirmed on technical review before any deposit. Supply only.` | R1 | PROD |  |  |
| 103 | Issue line joining `itemIssues` messages | R1 | PROD |  |  |
| 104 | `Cancel` / `Save line` (`Saving…`), discard guard `Discard changes? Discard / Keep editing` | R1 | PROD |  |  |
| 105 | `canSave` guards (price preview, undersize, duplicate code, blocking issues) | R1 | PROD |  | `canSave` loses the undersize guard (owner ruling 2026-08-17: warn-never-block); the rest of the set is carried. |
| 106 | Exact frame + glazing configuration select for AI-managed lines | R1 | PROD |  |  |
| 107 | Its 4 states: `Loading eligible configurations...` / `Select a currently eligible configuration` / `Eligible configurations could not be loaded.` + `Try again` / `No eligible, exactly priceable thermal configuration is available for this opening.` | R1 | PROD |  |  |
| 108 | Option label composition (`{product} · {frameTech} · {glazing} · Uw · SHGC`) | R1 | PROD |  |  |
| 109 | Resolve checkbox `I checked and resolved: {reasons joined by "; "}`; unchecked keeps the flags | R1 | PROD |  |  |
| 110 | `resolveReview: true` clears all keys (the partial `string[]` form is never used) | R1 | PROD |  |  |
| 111 | Save payload and its four ordered guards | R1 | PROD |  |  |
| 112 | Unit rows nested under the parent: index · product + `SpecSummary` · size · `{n}× per opening` · total · actions | R1 | PROD |  |  |
| 113 | `SpecSummary`: `Spec: as the opening` / `Spec: {n} changed — {key} {value or "none"}` | R1 | PROD |  |  |
| 114 | `not priced` marker on a unit whose status ≠ ready | R1 | PROD |  |  |
| 115 | Unit `edit` / `close` / `remove`; inline confirm `Remove unit {i}? Remove / Keep` | R1 | PROD |  |  |
| 116 | Unit editor caption `Unit {i} of {code}. The opening is {n} mm {high\|wide} — every unit must match it.` | R1 | PROD |  |  |
| 117 | Unit editor is `ItemForm scope="unit"`: no Item ID, no quantity, different note placeholder | R1 | PROD |  |  |
| 118 | `compatibility={{siblingSlugs, enforce:false}}` — incompatible frames stay selectable and marked | R1 | PROD |  |  |
| 119 | `+ Add unit`, relabelled `Maximum {policy.maxSegments} units` at the cap | R1 | PROD |  |  |
| 120 | Coverage sentences ×3, right-aligned, never a veto: `The opening has no size.` / `Units span {n} mm — exactly the opening.` / `Units span {n} mm, {d} mm more than\|less than the opening. Allowed — recorded on the line.` | R1 | PROD |  |  |
| 121 | Split planner: axis radios (`Side by side` / `One above another`), unit count select, per-unit size inputs, even-split proposal, coverage line, `Split into units` / `Applying…` | R1 | PROD |  |  |
| 122 | Merge panel: the 3-sentence explanation, `Merge back to one` / `Merging…` | R1 | PROD |  |  |
| 123 | Merge re-stamps `fit` and forces `technical_review` | R1 | PROD |  |  |
| 124 | Split/merge error strings (`invalid_split`, `already_composite`, generic) | R1 | PROD |  |  |
| 125 | `compositePolicy` (tolerance 25 mm, joiner 0 mm, max 4) | R1 | PROD |  | The policy governs R1 split/merge behaviour; making it visible is an R6 row (231). |
| 126 | Composite validation strings from `composite.ts` (11 sentences) | R1 | PROD |  |  |
| 127 | `ThermalAudit` — 7 columns (Line · Size · Target · Basis · Proposed · Achieved · Result), units indented under parents | R3 | PROD |  |  |
| 128 | `bandText`: `Uw ≤ {n}` · `SHGC {a}–{b}` / `SHGC ≥ {a}` / `SHGC ≤ {b}`; `—` when unconstrained | R3 | PROD |  |  |
| 129 | Basis always shown; `Inherited from opening` beside it, never instead | R3 | PROD |  |  |
| 130 | Achieved `Uw {x} · SHGC {y}`, `estimated` beneath when `source === "estimated"` | R3 | PROD |  |  |
| 131 | Six verdicts: `—` · `No parse record` · `No target derived` · `Not comparable` · `Meets target` · `Misses target (+0.14)` with signed SHGC | R3 | PROD |  |  |
| 132 | Lines with no derived target are shown, not hidden | R3 | PROD |  |  |
| 133 | States: `Loading thermal targets...` / `Thermal targets could not be loaded.` + `Try again` / `No parsed lines on this project yet.` | R3 | PROD |  |  |
| 134 | `LearningReview` — visibility gate `quality_state==='pending' && decision==='adjusted'` | R3 | PROD |  |  |
| 135 | Intro paragraph (`Classify only the reason for the final human change…`) | R3 | PROD |  |  |
| 136 | Per-outcome line 1 (`ref · proposed → final`) and line 2 (`AI {money} · issued {money} · change {money}`) | R3 | PROD |  |  |
| 137 | Reason select, placeholder `Why did the human change it?`, 18 `OVERRIDE_REASONS` humanised | R3 | PROD |  |  |
| 138 | Thermal-target grid (`Maximum Uw`, `Minimum SHGC (optional)`, `Maximum SHGC (optional)`) when the reason teaches one | R3 | PROD |  |  |
| 139 | Four client validation messages mirroring the server | R3 | PROD |  |  |
| 140 | `Use as a lesson` / `Exclude from learning` + their two confirm sentences | R3 | PROD |  |  |
| 141 | `context_json`, `proposed_config_json`, `final_config_json` fetched every load, never drawn | R3 | PROD |  |  |
| 142 | `layer`, `learnsProductPreference` fetched, never displayed | R3 | PROD |  |  |
| 143 | `OTHER_WITH_COMMENT` has no comment field | R3 | PROD |  |  |
| 144 | No history of past adjudications | R3 | PROD |  |  |
| 145 | `GET /projects/:id/building-model` — implemented, typed client, **zero callers** | R3 | PROD |  |  |
| 146 | `evidence[].entity_path / file_id / extracted_text / origin / confidence / review_state` | R3 | PROD |  |  |
| 147 | `model_json` (openings, conflicts, assumptions, jurisdiction, energyAssessment) | R3 | PROD |  |  |
| 148 | `confidence_json.schedule_extraction_confidence` | R3 | PROD |  |  |
| 149 | Notes block: newest 6, `{kind} · {author} · {when}`, 2px sage left border, no empty state, 7th unreachable | R1 | PROD |  |  |
| 150 | Files block on the record: filename + size or raw status word; **no download, no kind, no dates, no rescan** | R1 | PROD |  |  |
| 151 | History block: first 8, `Show all {n} events →`, raw server sentences, spans `project`+`order` | R1 | PROD |  |  |
| 152 | Each event's stored `after` payload is never surfaced | R5 | PROD |  |  |
| 153 | Payments block: `{kind} · {percent}% · {reference}` / `{money}` over `{status}` | R1 | PROD |  |  |
| 154 | `invoicedAt` / `paidAt` in the payload, never rendered | R1 | PROD |  |  |
| 155 | Empty: `No payments recorded.`; footer `Order no. {n} · appears on invoices` | R1 | PROD |  |  |
| 156 | Deposit is the hard constant 50% at order creation; the editable policy default 40% drives only the pricing preview | R1 | PROD |  |  |
| 157 | `order.stage`, `stageLabel`, `paymentStatus`, `createdAt` fetched, never rendered on the record | R1 | PROD |  |  |
| 158 | 12 order stages, 11 transitions, 2 customer-side confirmations ops may also fire | R1 | PROD |  |  |
| 159 | `orderDto.files[]` (order files + the project schedule, deduped) — reachable only via 2 unsurfaced endpoints | R1 | PROD |  | Endpoint-level row — see appendix rows 273–274; disposition decided at R1 design review. |
| 160 | `GET /orders`, `GET /orders/:id` — implemented, zero callers | R1 | PROD |  | Endpoint-level row — see appendix row 274. |
| 161 | No order cancel endpoint despite the summary excluding a `cancelled` stage | R1 | PROD | DEAD | No cancel endpoint exists; spec §6.3 forbids designing one. Not a capability. |
| 162 | List, 6 columns (Customer · Business · Projects · Orders · Registered · `Open →`) | R5 | PROD |  |  |
| 163 | Phone cards with the `{n} project(s) · {n} order(s) · joined {date}` summary | R5 | PROD |  |  |
| 164 | States: spinner / `Couldn't load customers. {error}` / `No registered customers yet.` | R5 | PROD |  |  |
| 165 | Detail header: icon + name-or-email-prefix, `Edit details` | R5 | PROD |  |  |
| 166 | Read grid: Email · Phone · Business (`No business name`) · Registered | R5 | PROD |  |  |
| 167 | Edit form: `Full name`, `Phone`, `Business name`, `ABN` | R5 | PROD |  |  |
| 168 | Admin-only `Sign-in email — the customer's unique login ID` + helper sentence | R5 | PROD |  |  |
| 169 | Non-admin substitute with `Lock` icon | R5 | PROD |  |  |
| 170 | `Save changes` / `Saving…` / `Cancel` | R5 | PROD |  |  |
| 171 | Three error mappings (409 → in use, 400 → invalid, else → permission) | R5 | PROD |  |  |
| 172 | Silent server truncation (name 200, phone 60, company 200, abn 40) | R5 | PROD |  |  |
| 173 | Projects section: raw `status_customer` chip, **rows inert** | R5 | PROD |  |  |
| 174 | Orders section: raw `stage`, **rows inert** | R5 | PROD |  |  |
| 175 | `status_internal`, `updated_at` fetched, never rendered | R5 | PROD |  |  |
| 176 | Detail states: spinner / `Couldn't load this customer.` | R5 | PROD |  |  |
| 177 | No search, filter, sort, pagination, add, delete | R5 | PROD |  |  |
| 178 | `user.discount_percent` (default 5%) invisible everywhere in ops | R5 | PROD |  |  |
| 179 | 6 preset views (All / New / Question / Appointment / Contacted / Closed) with their exact query params | R5 | PROD |  |  |
| 180 | 9-column table (Reference · Type · Customer · Contact · Location · Source · Submitted · Owner · Status) | R5 | PROD |  |  |
| 181 | `IntentBadge` (`Appointment` / `Question` + icon) | R5 | PROD |  |  |
| 182 | Hardcoded `OpenFrame Website` source pill | R5 | PROD |  |  |
| 183 | `statusClass` — the raw amber/blue/sage/red/neutral Tailwind buckets | R5 | PROD |  |  |
| 184 | Four independent status dimensions with their closed vocabularies, `humanize()`d | R5 | PROD |  |  |
| 185 | Detail summary header (reference · intent · source · name · company · submitted · owner) | R5 | PROD |  |  |
| 186 | `Assign to me`, shown only when not already assigned | R5 | PROD |  |  |
| 187 | Customer panel (`Type`, `Email` mailto, `Phone` tel, `Account`) | R5 | PROD |  |  |
| 188 | Submission panel, two shapes (appointment / question), with `Message` as a `whitespace-pre-wrap` block | R5 | PROD |  |  |
| 189 | Manufacturer handoff panel: `Handed off`, `Acknowledged` + `Mark acknowledged`, two blur-saved ref fields, footnote | R5 | PROD |  | Live manufacturer handoff (MANUFACTURER_TO is set in prod). NOT part of D-1's deferral — §8.1. |
| 190 | Attribution panel (`Source owner (immutable)`, entry point, landing, referrer, UTM, form) | R5 | PROD |  |  |
| 191 | Activity panel, newest first, `No activity yet.` | R5 | PROD |  |  |
| 192 | Status rail: four `StatusSelect`s writing on change | R5 | PROD |  |  |
| 193 | `Log a contact attempt`: `Attempted` / `Contacted` / `No response` | R5 | PROD |  |  |
| 194 | The server accepts an optional `note` (≤500) on the contact log; **no field exists** | R5 | PROD |  |  |
| 195 | `patch()` / `logContact()` have no `catch` — failures are silent | R5 | PROD |  |  |
| 196 | Six server filters never exposed (`state`, `appointment`, `commercial`, `assigned`, `from`, `to`) | R5 | PROD |  |  |
| 197 | `LIMIT 300`, no pagination | R5 | PROD |  |  |
| 198 | `projectId`, `accountId` returned; nothing links | R5 | PROD |  |  |
| 199 | `marketingOptIn`, `privacyVersion`, `locationId`, `updatedAt` fetched, never rendered | R5 | PROD |  |  |
| 200 | No note/comment on an enquiry beyond the contact log | R5 | PROD |  |  |
| 201 | Files table (File+kind · Project+customer · Size · Scan · action) | R5 | PROD |  |  |
| 202 | `kb()` with no MB tier (a 40 MB PDF reads `40960 KB`) | R5 | PROD |  |  |
| 203 | Scan pill of the raw `virus_status` word | R5 | PROD |  |  |
| 204 | Three action shapes: `Download` / `Blocked` / `Scan to unlock` (+ row spinner) | R5 | PROD |  |  |
| 205 | `POST /files/:id/rescan`; failure swallowed | R5 | PROD |  |  |
| 206 | `GET /files/:id/download` gated to `clean` (403 `quarantined`, 409 `scan_pending`) | R5 | PROD |  |  |
| 207 | `scan_engine`, `scanned_at`, `created_at` fetched, never rendered | R5 | PROD |  |  |
| 208 | No search, filter, sort, pagination, preview, delete, bulk rescan, file→project link | R5 | PROD |  |  |
| 209 | Fetch error degrades to an empty list | R5 | PROD |  |  |
| 210 | Audit list: entity_type (14px column, truncating silently) · action · `{actor} · {when}` | R5 | PROD |  |  |
| 211 | Five filter chips — `All`, `project`, `order`, `user`, **`rule`** (dead vocabulary) | R5 | PROD |  |  |
| 212 | `entity_id` returned, never rendered — no way to reach the record an event describes | R5 | PROD |  |  |
| 213 | `LIMIT 200`, no pagination, no date/actor filter, no export | R5 | PROD |  |  |
| 214 | Two different `toLocaleString` shapes across Enquiries and Audit | R5 | PROD |  |  |
| 215 | Admin banner `Staff & roles. Only admins can change roles.` | R2 | PROD |  |  |
| 216 | Error line `Only admins can change roles.` | R2 | PROD |  |  |
| 217 | Staff list: `name` (may be null, rendered raw) over email | R2 | PROD |  |  |
| 218 | Role select with disabled placeholder `— role —` and 4 raw snake_case options | R2 | PROD |  | Role vocabulary changes at R2 (three roles, §9.7). Verbatim-copy obligations here may be let go under AC-37 — owner sees each. |
| 219 | `manufacturer` cannot be assigned (server rejects it) | R2 | PROD |  | Under RBAC the sentence becomes false (AC-32: per-user assignment). Let go under AC-37 with replacement copy. |
| 220 | Nothing warns an admin they are demoting themselves | R2 | PROD |  |  |
| 221 | `last_verified_at` fetched, never rendered | R2 | PROD |  |  |
| 222 | No invite, deactivate, sessions list, or role-history view | R2 | PROD |  |  |
| 223 | Deposit %: field, live consequence sentence, version, `Save deposit %` | R6 | PROD |  |  |
| 224 | `GET /policy` returns `history`; nothing renders it | R6 | PROD |  |  |
| 225 | `PUT /policy` accepts a note; no field exists | R6 | PROD |  |  |
| 226 | Policy failure is one generic sentence; a 409 is indistinguishable | R6 | PROD |  |  |
| 227 | The GST refutation paragraph, verbatim, `— not editable —` | R6 | PROD |  |  |
| 228 | Sanity seam sentence + Studio link, buried in one Pricing sub-tab | R6 | PROD |  |  |
| 229 | Catalogue source / `loadedAt` / product count / tree with `✓ rate card` / `✗ no rate card — prices at 'default'` | R6 | PROD |  |  |
| 230 | `productsWithoutCard[]` computed server-side, never rendered | R6 | PROD |  |  |
| 231 | `compositePolicy` never visible anywhere | R6 | PROD |  |  |
| 232 | `safeParse()` dead function; 3 unused icon imports | R6 | PROD | DEAD | Dead function + unused imports (§B.4.17). |
| 233 | Four sub-tabs (Rate cards · Options · Policy · Catalogue) | R6 | PROD |  |  |
| 234 | Rate-card index, 7 columns, whole-row click, `ORDER BY id` | R6 | PROD |  |  |
| 235 | Index preamble (`A unit is perimeter(m) × perim + area(m²) × area + options…`) | R6 | PROD |  |  |
| 236 | `← fallback for unmapped products` on the `default` row | R6 | PROD |  |  |
| 237 | `exampleTotal` from the fixed 1200×1200 sample | R6 | PROD |  |  |
| 238 | Footer `Open a row to edit it.` / `Read-only — a manager or admin can change these.` | R6 | PROD |  |  |
| 239 | No empty state, no error state (a failed fetch loads forever) | R6 | PROD |  |  |
| 240 | Rate-card detail: back link, `<h2>` = raw card id, `{version} · {ago} \| unchanged since seed` | R6 | PROD |  |  |
| 241 | Base rate fields ×3 with `$` prefix and unit suffixes | R6 | PROD |  |  |
| 242 | Unit-of-effect sentences ×2 (`+$1 on the perimeter rate moves the typical example by {money}.`) | R6 | PROD |  |  |
| 243 | Worked example — **every engine step including the ones that did nothing** (`no effect`, `did not fire`, `none on this account`) | R6 | PROD |  |  |
| 244 | Sample provenance ×2 copies (percentile / labelled standard fallback) | R6 | PROD |  |  |
| 245 | small / typical / large mini table | R6 | PROD |  |  |
| 246 | Rules editor: the one-sentence rule, `FIELD_UNIT`, `add %` / `add $`, label input, `Fires for:` self-test, both verdict warnings, compounding footer, delete with no confirm | R6 | PROD |  |  |
| 247 | No reorder control (`seq` derived from array index) | R6 | PROD |  |  |
| 248 | Save bar `Discard changes` / `Review change →`, rendered only when edited | R6 | PROD |  |  |
| 249 | Confirm dialog: deltas, `What this does to a real window` 4-column table, the immediate/never-retroactive/draft-exposure paragraph, ±20% tripwire with typed slug + required note | R6 | PROD |  |  |
| 250 | Two failure strings (`version_conflict` copy, generic) | R6 | PROD |  |  |
| 251 | Change history with `summarise()`, note in curly quotes, `Revert to {version}` | R6 | PROD |  |  |
| 252 | Revert: one unguarded click, no confirmation, no error path | R6 | PROD |  |  |
| 253 | The preview always shows `account discount 0%` while every registered account defaults to 5% | R6 | PROD |  |  |
| 254 | Options: `Needs a price ({n})` block with its paragraph, `$` field, `Save`, `Included — $0`, `offered by {n} product(s)` caption | R6 | PROD |  |  |
| 255 | Options: priced table, slug search, `hide $0`, inline edit, Enter saves / Esc reverts, sage border when dirty | R6 | PROD |  |  |
| 256 | Two row annotations (`◦ priced but no product offers it`, `◦ glass, per m² of glazed area`) | R6 | PROD |  |  |
| 257 | Header count is the unfiltered total and disagrees with the visible rows | R6 | PROD |  |  |
| 258 | Footer copy (`Enter saves a row, Esc reverts it…`) | R6 | PROD |  |  |
| 259 | `Options.commit` has no `catch`; every failure is silent, including the glass guard | R6 | PROD |  |  |
| 260 | `basis` (per_unit ↔ per_sqm) is accepted by the API and never sent | R6 | PROD |  |  |
| 261 | `glass_excluded_from_area_rate` has no control anywhere, making the guard unsatisfiable | R6 | PROD |  |  |
| 262 | No add-an-option, no delete, no option history / revert / note | R6 | PROD |  |  |
| 263 | No create / delete / deactivate a rate card | R6 | PROD |  |  |
| 264 | Reconcile health banner on **every** Pricing screen, 4 states incl. `Pricing has never been checked against the catalogue.` | R6 | PROD |  |  |
| 265 | A failed `GET /reconcile` is indistinguishable from "never checked" | R6 | PROD |  |  |
| 266 | Saving an option does not re-run reconciliation; the banner persists after the fix | R6 | PROD |  |  |
| 267 | `Fix` jumps to Options; there is no `Fix` for `productsWithoutRateCard` | R6 | PROD |  |  |
| 268 | `orphaned[]` never surfaced by the banner | R6 | PROD |  |  |
| 269 | Mobile: explicitly unhandled, twice promised | R6 | PROD |  | The 'wider screen' notice is VOID under I4/AC-11. The capability (rate-card editing) is carried at every width; the notice is not. |
| 270 | `GET /pricing/catalogue` tree | R6 | PROD |  |  |
| 271 | No cost/margin column anywhere | R6 | PROD |  |  |
| 272 | No CSV import/export, no draft/publish staging, no approval queue on a price change | R6 | PROD |  |  |

## Appendix — not carry-across obligations (§B.4.15–B.4.16, spec §8)

Endpoints that reach no pixel and persisted data with no reader. Losing these is not a
regression; two are deliberately promoted into scope by §6.4. Recorded here so no region
re-discovers them as gaps.

| # | Item | Disposition under ops2 |
|---|---|---|
| 273 | `GET /queues/submissions` | Stays unsurfaced (superseded by the merged queue). Recorded at R4. |
| 274 | `GET /orders`, `GET /orders/:id` (incl. `orderDto.files[]`, per-order `actions[]`, order-line snapshots) | Stay unsurfaced — the record plane is the merged truth (R1). Recorded. |
| 275 | `GET /projects/:id/building-model` | **Promoted into scope** (§6.4, D8): called by R3's derivation surface. |
| 276 | `POST /projects/:id/ai-runs` (re-queue extraction) | Not surfaced. Recorded. |
| 277 | `POST /projects/:id/estimate` (re-run selection + pricing) | Not surfaced. Recorded. |
| 278 | `POST /learning-outbox/drain` | Not surfaced. Recorded. |
| 279 | `GET /audit?entity=` | Wired at R5 (Events facets). |
| 280 | `POST /projects/:id/note` with `lineId` | **Sent by R1** — per-line notes (AC-18). |
| 281 | `POST /enquiries/:id/contact-log` with `note` | Sent by R5 (contact-log note field). |
| 282 | `PUT /pricing/options/:slug` with `basis` | Still not sent — out of scope, stated (spec §6.3). |
| 283 | `candidate_result` — every product × variant evaluated, per-filter pass/fail, reasons, six score components, rank, selected | **Promoted into scope** (§6.4, D9): R3 adds the candidate_result read path. |
| 284 | `selection_run`, `draft_order_line` | R3 decides what the derivation surface reads; nothing invented (AC-44). |
| 285 | `ai_stage_runs` (model, prompt version, tokens, escalation reasons), `ai_runs.summary_json.stageWarnings` | Not exposed. The run block states the absence (R3). |
| 286 | `revision_line` snapshots (per-revision line detail) | Revisions are removed from the product; R1's record states what is not retrievable. |
| 287 | `evidence_items.review_state` (`confirmed`/`edited`/`rejected`) | No writer exists; no control shown (R3). |
| 288 | `ai_review_deltas` (structured AI→human field diffs) | Stated on the derivation surface (R3). |
| 289 | `upload_reservation.reason` / `detail` (why a file was rejected) | Not surfaced — no ops endpoint reads it. Recorded. |
| 290 | `user.discount_percent` | The customer record's one honest line (R5). |
| 291 | `ai_job_claim.progress_stage` (the only live progress field; read only by the customer endpoint) | Not surfaced to ops. Recorded. |

## Deleted on purpose (§B.4.17)

Carried verbatim from the source: `Placeholder` (unreachable) · `safeParse()` (no call
sites) · the three ghost icon imports · the hard-coded `editing elsewhere` literal · the
`MONO = {}` empty spread · `Pricing.tsx`'s local `INK` shadow · the `.dark {}` block and
`oklch()` sidebar tokens · `src/styles/globals.css` (0 bytes) · the `rule` audit chip as a
hard-coded option (survives data-driven). All `DEAD` on discharge, with unreachability
confirmed by the tester at the owning region.
