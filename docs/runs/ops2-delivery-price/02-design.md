# 02 — Design: delivery price and delivery address in ops2 (Revision 3)

Spec: `01-spec.md` (49 criteria). Grill rulings D1–D18 in `00-ask.md` are binding.
Revision 3 supersedes Revision 2 entirely; the deltas that forced the rewrite:

- **D17**: the totals card **is** an `OpenablePanel` — the row-as-door design
  (`.rec-totals__row--door`, `record-delivery-open` button) is dead and never built.
- **D18**: `OpenablePanel.title` becomes optional — one `?`, nothing else.
- **Auth**: the rev2 401/403 split (`resolveOpsUser` + `hasAssignedRole` +
  `resolveUser`) is dropped. Criterion 46 accepts "401/403" for no-session and
  43–45 need 403 — the existing `resolveStaff` (403 for anonymous, customer and
  manufacturer alike) satisfies all of section H unchanged. The existing
  anonymous-PUT assertion in `delivery.test.mjs` (~line 449) stays at 403.
- **Criterion 11**: amount validation tightens — `typeof amount === "number"`
  (string `"250"` → 400; today's `Number(body?.amount)` coercion goes), finite,
  `>= 0`, `< 1e12`. Only the *null un-settle capability* is frozen by D16, not
  the validation. Verified safe for the legacy console: `src/ops/api.ts:302`
  types `amount: number | null` and `src/ops/ProjectRecord.tsx:860-866` sends
  `Number(trimmed)` or `null`, never a string.
- **line2 is clearable** (`line2: ""` → NULL); line1/line2 limits are 1–120
  trimmed (rev2 said 1–80); suburb stays 1–80.
- **CONTEXT.md §Openable panel** *is* updated (architect's edit, done with this
  revision) — rev2 wrongly said no CONTEXT.md change was needed.

Shape of the change: one additive migration (three columns), one widened +
restructured endpoint, one widened DTO/model, one shared-chrome prop made
optional, two new panel components, one page wired up. No new dependency, no
new `src/data/` module (`AU_STATES` exists), no change to
`worker/lib/delivery.ts`, no new money formatter.

---

## 1. Data model & migration

`migrations/0063_delivery_address.sql` (highest existing is `0062_drawing_progress_phase.sql`):

```sql
-- Delivery destination widened to a full postal address (ops2-delivery-price).
-- ADDITIVE ONLY: three ADD COLUMNs on `project`, no table rebuild, no DROP.
-- children affected: none expected. 27 tables reference project(id) ON DELETE
-- CASCADE (order_line and payment among them, via their parents) — an ADD
-- COLUMN never fires them; this comment exists because a rebuild here once
-- cascade-deleted 20 order_line and 4 payment rows in production.
ALTER TABLE project ADD COLUMN delivery_line1 TEXT;
ALTER TABLE project ADD COLUMN delivery_line2 TEXT;
ALTER TABLE project ADD COLUMN delivery_state TEXT;
```

d1-migration-safety verdict: additive, rule 1 — no `PRAGMA defer_foreign_keys`,
no rebuild recipe, no cascade exposure. Remote apply still follows the standing
protocol (export first, before/after counts on `project`, `order_line`,
`payment`); criterion 2 tests exactly this on a local copy with seeded child rows.

No constraints in SQL: nullability is the point (criterion 3 — existing and
form-created rows read NULL), and validation is the endpoint's job, one place.

---

## 2. API — `PUT /api/ops/projects/:id/delivery`

File: `worker/routes/ops.ts`, handler at 752–837. The route stays thin; the
validation below is small enough to live in the handler as today (no new
`worker/lib/` module — the zone logic it calls already lives in
`worker/lib/delivery.ts`, unchanged).

**Handler order (unchanged skeleton):**
1. `resolveStaff` → 403 for anonymous / customer / manufacturer, body `{error}`
   only, nothing written (criteria 43–46).
2. `SELECT id, status_internal, delivery_postcode FROM project WHERE id = ?1`
   → 404 `not_found` (criterion 15, no existence detail beyond that).
3. Phase gate draft/`ISSUABLE_FROM` else 409, nothing written (criterion 14).
4. **Validate the whole body before writing anything** (criteria 7–11: 400 and
   no column changes). Unknown keys — `project_id`, `account_id`, `user_id`,
   `phase`, anything — are ignored, never an error (criterion 47). A body with
   no known key → 400 `invalid_body`.
5. Two-group present-fields-only UPDATE.
6. Re-read → `buildDeliveryDto` → audit event(s) → `{ok, delivery}`.

**Validation, per key (all-or-nothing — any failure returns 400, row untouched):**

| key | rule | notes |
|---|---|---|
| `amount` | key absent → amount group untouched. `null` → un-settle, byte-identical to today's null path (D16, legacy console). Else `typeof === "number" && Number.isFinite && >= 0 && < 1e12`, otherwise 400 | `"amount" in body` distinguishes absent from null. `1e12` is the spec-literal bound (criterion 11), not an invented business cap |
| `note` | processed only when the `amount` key is present, exactly today's rules (trim, ≤500, absent → NULL) | rides the amount group; the legacy console clears the note by omission and must keep doing so. Address-only bodies never touch it (D5) |
| `line1` | string, trimmed, 1–120; empty → 400 (replace-only, D14) | |
| `line2` | string, trimmed; `""` → NULL (**clearable** — spec ASSUMED); else 1–120 | the one field D14 does not bind |
| `suburb` | string, trimmed, 1–80; empty → 400 | `"  Richmond  "` stores `"Richmond"` (criterion 8) |
| `state` | one of the `AU_STATES` codes (`src/data/accountDetails.ts:10-11`), else 400 | never an input to `resolveZone` — nothing in `worker/lib/delivery.ts` changes (criterion 6) |
| `postcode` | existing branch unchanged: `normalisePostcode`, exactly 4 digits, replace-only | zone resolves from postcode alone, as today |

**Two-group UPDATE (present-fields-only):**

- **Amount group** (written only when `"amount" in body`): `delivery_amount`,
  `delivery_note`, the settle stamps and `delivery_settle_json` — semantics
  byte-identical to today's settle/un-settle paths, including the settle_json
  stamp `{estimate, areaM2, zoneId, zoneVersion}` from the live zone answer at
  that instant (criterion 4).
- **Address group** (each column written only when its key is present):
  `delivery_line1`, `delivery_line2`, `delivery_suburb`, `delivery_state`,
  `delivery_postcode`.

Build the `SET` list from present fields; an address-only save leaves
`delivery_amount`, stamps and `delivery_note` byte-untouched (criterion 5); an
amount-only save leaves the five destination columns byte-untouched.

**Audit.** The amount event is unchanged (both numbers + actor, criterion 4).
The address change emits one new event of the same kind recording **actor,
timestamp and the changed field *names* only** — never the values. The spec's
ASSUMED bullet requires "the changed fields"; names satisfy it with the
smallest log surface, and criterion 49 (no personal data in logs beyond
destination + actor) is met with margin. Worker `console` lines likewise never
print address values.

**DTO.** `buildDeliveryDto` (462–504) adds passthrough of `line1`, `line2`,
`state` (`string | null`). It already emits `editable`, `suburb`, `postcode`,
`amount`, `settled`, `estimate` — no other change. `GET /projects/:id` (506+)
and `resolveStaff` are untouched. The legacy console reads the widened DTO
without noticing (extra keys are invisible to it).

---

## 3. ops2 model — `src/ops2/projects/record.ts`

- `RecordDelivery` (121–134): **add** `line1`, `line2`, `state`
  (`string | null`) and `editable: boolean`; **delete** `estimate` — D12 leaves
  it with zero readers once `DeliveryFigure`'s estimate branch dies (§5.1), and
  a field no surface reads is exactly what ponytail exists to stop.
- Parse block (340–354): three `str()` lines; `editable: delivery.editable === true`
  (absent fails closed to `false` — a record that cannot prove editability
  renders no door); drop the `estimate` line.
- **Copy consts** (this surface's copy module is `record.ts` itself —
  `waitingSentence` etc. already live there; no new file):
  ```ts
  /** Door labels (criterion 18: sourced from the surface's copy module). */
  export const deliveryPriceDoor = "Set the delivery price";
  export const deliveryAddressDoor = "Change the delivery address";
  ```
- `money` (685–687), `totalsFor` (597–621), `cornerFigure` (636–643): untouched.

---

## 4. `OpenablePanel` — title optional (D18, criteria 40–42)

`src/ops2/chrome/OpenablePanel.tsx` (58 lines). Exactly three edits:

1. `title: string` → `title?: string` in the props type.
2. Section `aria-label={title}` — React omits the attribute when `title` is
   `undefined`, which is criterion 41; if the current expression would emit
   `aria-label=""`, guard it, otherwise this line needs no edit at all.
3. `<h2 className="lp-panel__title">{title}</h2>` → `{title && <h2 …>{title}</h2>}`.

No render-prop, no slot, no `variant`/`mode`/`header` object; the file ends no
longer than before (criterion 42). The door button keeps
`aria-label={open.label}`. Both existing callers (`PricePanel.tsx`,
`WhyPanel.tsx`) pass `title` and render byte-identical output; their existing
browser assertions pass untouched (criterion 40). `panel.css` needs **no
change**: `.lp-panel__chev { top: 50%; transform: translateY(-50%) }` already
centres the chevron against the full card — criterion 16 for free.

---

## 5. UI

### 5.1 Totals card as the door (`ProjectRecordPage.tsx`)

`RecordTotals` (736–770) becomes:

```tsx
<OpenablePanel testId="record-totals"
  open={editable ? { label: deliveryPriceDoor, onOpen } : undefined}>
  …the three existing rows, plain divs…
</OpenablePanel>
```

- No `title` → no `<h2>`, no section `aria-label`; the door button
  (`record-totals-open`) carries `deliveryPriceDoor` (criteria 17, 18).
- `editable` is `record.delivery.editable`. Locked → no `open` prop → figures
  only: no chevron, no tab stop, no reason line — criterion 38 free (D13),
  same mechanism as every other panel.
- Rows stay plain `div.rec-totals__row` — no per-row button, aria, hover wash
  or focus ring (criterion 16). `.rec-totals__row--door` is never created.
- Nothing renders below the Project-total row; no separate Delivery card
  anywhere (criterion 20). Delete the stale "DELIVERY IS TEXT HERE" doc
  comment above `RecordTotals`.
- The `rec-totals` container class moves onto (or inside) the panel's children
  as the developer finds cleanest; `record.css` near 438 may need a small
  padding reconciliation with `.lp-panel` so spacing doesn't double.

`DeliveryFigure` (776–789) shrinks to two branches:

- settled → `money(totals.delivery ?? 0)` — zero prints as a figure, never
  "Not set" (§Settled delivery: never a truthiness check);
- else → neutral text `Not set` in a plain muted span. `.rec-totals__missing`
  (`record.css:457-461`) is deleted — unpriced is the ordinary state (D8).
- The estimate branch is **deleted** (D12: one figure or none, never a second).

**Project total when delivery is NULL (criterion 19 — architect's call, recorded):**
the row renders `money(t.total ?? t.subtotal)` — the figure without a delivery
contribution, no explanation line, no styling change. The `rec-totals__absent`
strings ("N lines have no rate" / "Delivery has not been set") are deleted with
their mechanism; the Lines row's existing `· N with no rate` caveat and
`cornerFigure`'s caveat remain the named absences, unchanged. Rationale:
criterion 19 forbids an explanation line for the delivery case, and keeping a
second absent-text mechanism only for the unpriced-lines case would be two
renderings of one fact the Lines row already states.

Wiring: one `useState` opens `DeliveryPricePanel`; `onSaved` re-fetches the
record (same pattern as the `PricePanel` wiring at 490–492). The stale comment
at `record.css:455-456` is rewritten per D8 (unpriced is ordinary, not an error).

### 5.2 `DeliveryPricePanel.tsx` (new, `src/ops2/projects/`)

`PricePanel.tsx` is the mechanical template (state seeded on open, inline
`fetch` PUT with `credentials: "same-origin"`, failure flag rendered
`role="alert"` with the panel staying open and the typed value retained,
footer confirm) — minus its tax-basis segment, which must **not** be copied (D11).

- Props `{ projectId, amount, open, onClose, onSaved }`.
- `SidePanel phoneForm="side"` at every width, `testId="delivery-price-sheet"`
  (criterion 21).
- Exactly one field, label `Delivery price`, `inputMode="decimal"`, focused on
  open; prefill `amount.toFixed(2)` when non-null, empty string when null — no
  estimate, no placeholder figure, no second figure of any kind (criteria 23,
  24; D8/D12).
- Client refusal with a field-level message and **no request** for empty,
  non-numeric or negative input (criterion 27); the body is exactly
  `{ amount: Number(value) }` — no path produces `amount: null`, and no
  clear/un-settle control exists (criterion 25).
- No tax word in any state (criterion 22) — enforced by the bundle grep (§8).
- Dismiss discards; a failed save keeps the panel open, the typed value and an
  inline failure message (criteria 28, 29). Reuses PricePanel's sheet/form CSS
  classes; no new CSS.

### 5.3 `DeliveryAddressPanel.tsx` (new, `src/ops2/projects/`)

Owns both the card and its sheet. Props `{ projectId, delivery, onSaved }`.

- Card: `OpenablePanel title="Delivery address" testId="delivery-address"`,
  `open={delivery.editable ? { label: deliveryAddressDoor, onOpen } : undefined}`
  — locked renders plain text: no chevron, no tab stop, no reason line
  (criterion 39).
- Card body: the stored lines as a comma-free stacked block — `line1` /
  `line2` / `"Suburb STATE 3000"` — absent parts simply don't render, no
  marker, no badge (criterion 31). All five NULL → one neutral `Not set` line
  (reusing the spec's copy — "no other wording is introduced"), the card still
  pressable when editable.
- Sheet: `SidePanel phoneForm="side" testId="delivery-address-sheet"`, exactly
  five fields — `Address line 1` (`maxLength 120`), `Address line 2`
  (`maxLength 120`), `Suburb` (`maxLength 80`), `State` (native `<select>`
  over `AU_STATES` from `src/data/accountDetails.ts`, blank option only while
  no state is stored), `Postcode` (4-digit client check). Prefilled from
  `delivery` only — never the account address, not even as a placeholder
  (criterion 33).
- Replace-only client-side: emptying line1/suburb/state/postcode where a
  stored value exists → field-level refusal, no request (criterion 35).
  `line2` may be cleared — an emptied stored line2 sends `line2: ""`. A field
  with no stored value may stay empty and is omitted from the body. Save sends
  one PUT carrying only the present fields and **never** an `amount` key; save
  is disabled when the body would be empty.
- No price field, note, zone text, tax word or postcode-change prompt
  (criterion 36); dismiss/failure semantics as 5.2 (criterion 37).

### 5.4 Page wiring (`ProjectRecordPage.tsx`)

- Project-tab placeholder (519–525) replaced by `<DeliveryAddressPanel …/>` as
  the tab's first content, inside the `record-project-tab` wrapper (criterion 30).
- Footer note (536–540) reworded — delivery has arrived:
  "Notes and clarification requests arrive with their own screens."

---

## 6. Copy (all of it — spec ASSUMED: no other wording introduced)

| string | where |
|---|---|
| `Not set` | Delivery row when NULL; address card when all columns NULL |
| `Delivery price` | price field label + price sheet title |
| `Delivery address` | address card title + address sheet title |
| `Set the delivery price` / `Change the delivery address` | door labels, consts in `record.ts` |

No tax word anywhere in either panel, in any state (D11).

---

## 7. Security

**Data classification.** New/moved data: `delivery_line1/2/state` + existing
suburb/postcode — **personal PII** (a customer's delivery destination);
`delivery_amount` — **commercial** (money the customer will be charged). No
bank/payout data, no ABN anywhere near this feature. Smallest surface: three
nullable columns; values never logged (the address audit carries field names
only, the price audit the two amounts — exactly criterion 49's allowance);
never sent to any customer-facing surface (ops DTO only).

**Trust boundaries.** One crossing: ops browser ↔ Worker over the existing
Cloudflare Access session. `resolveStaff` validates the Access JWT; the body is
validated field-by-field at step 4 before any write. No third-party crossing;
`resolveZone` is in-process against D1.

**Authorization per endpoint.**
- `PUT /api/ops/projects/:id/delivery` — staff only, via `resolveStaff`
  (`worker/lib/staff.ts:155`; Access JWT is the only production identity path;
  the manufacturer role is refused). Query scoping: `WHERE id = ?1` with the
  URL id, and the UPDATE repeats the same `WHERE id = ?1`. There is
  deliberately **no account filter**: the ops console is cross-account by
  design and the staff gate *is* the scoping — the canonical
  auth-present-but-query-unfiltered bug cannot occur because non-staff never
  reach the query at all (criteria 43–46 prove that end to end).
- `GET /api/ops/projects/:id` — unchanged; already behind the same gate; the
  three new DTO fields ride the existing staff-only response.
- The audit actor comes from the session, never the body (criterion 47).

**Abuse cases → criteria.** Cross-account customer write → 43/44 (403, no
write; no 403-vs-404 existence disclosure — 404 is only ever reachable by
staff). Manufacturer read/write → 45. No/expired session → 46 (403 from
`resolveStaff`; criterion 46 accepts 401/403). Parameter tampering
(`project_id`/`account_id`/`user_id`/`phase` in the body) → 47 (ignored; URL +
session are authoritative). Stored XSS via address fields → 48 (stored
literally; React text nodes render inert — no `dangerouslySetInnerHTML` on any
of these surfaces). Log/audit leakage → 49 (field-names-only address audit; no
address values in worker logs). **Residual risk:** none new — the endpoint's
exposure class is unchanged from the existing amount-only PUT; the guest-OTP
finding (tracked separately) does not touch ops routes, which are Access-gated.

---

## 8. Test plan

Every file below already exists and is wired into `package.json` scripts — no
new suite.

**`scripts/tests/delivery.test.mjs`** (`test:delivery`, in `test:heavy`) — new cases:
migration: columns NULL on pre-existing rows, `project`/`order_line`/`payment`
counts unchanged across apply with seeded child rows (criteria 1–2); amount
save keeps stamp + audit (4); amount-key-absent body leaves the amount group
byte-untouched (5); postcode change re-resolves the zone, state never
consulted (6); 400 table — empty line1/suburb/postcode, 81-char suburb,
121-char line1, `"Victoria"`/`"XX"` state, `"abc"`/`"312"` postcode, amount
`-1`/`"250"`/`1e12` — each leaving the row unchanged (7–11); `"  Richmond  "`
→ `"Richmond"` (8); amount 0 settles (12); `amount: null` un-settles — the
existing ~538 test stays green unmodified (13); locked 409 for
amount-only/address-only/both, no column written (14); unknown id 404 opaque
(15); `line2: ""` → NULL; address subsets stored trimmed with omitted columns
byte-identical; section H: 403 for anonymous (existing ~449 assertion
unchanged), owning customer, other-account customer, manufacturer — nothing
written, no existence hint (43–46); body `project_id`/`account_id` ignored
(47); `<script>` line1 stored and returned literally (48); the address audit
event carries field names only and worker log lines carry no address value
(49); DTO passthrough of line1/line2/state.

**`scripts/tests/ops2-record.test.mjs`** (`test:ops2`, in `test:pure`) — new cases:
parse of line1/line2/state/editable incl. absent-field defaults (editable
fails closed); `estimate` absent from the parsed record; `DeliveryPricePanel`
and `DeliveryAddressPanel` added to the esbuild bundle entry so the existing
no-tax-token grep covers them (22, 36); `OpenablePanel` without `title`
renders no `<h2>` and no section `aria-label` while the door button keeps
`open.label` (41); both existing caller usages unchanged (40); price sheet
markup: exactly one input, no clear/un-settle control (21, 25); address card
hides absent lines, shows the neutral empty state, and contains no
account-derived value (31, 33).

**`scripts/tests/web/ops2-record.spec.ts`** (`test:web`) — delete the line-391
"not built yet" Project-tab assertion (invalidated by criterion 30); new
journeys: totals card is one pressable control, chevron card-centred, no
per-row button/aria (16); press (mouse; Enter and Space) → right-hand
slide-out at phone and desktop widths (17, 21); accessible name from the copy
module, no `<h2>` on the card (18); NULL-delivery project shows `Not set` and
a Project total without delivery contribution and without an explanation line
(19); nothing below the card, no separate Delivery card (20); 250 shown alone
on open (23); `unpriced_table` zone → plain empty input (24); type 450 → save
→ sheet closes, row and Project total update, no reload (26); dismiss discards
(28); intercepted 5xx → panel open, value kept, inline failure (29); 0 prints
a figure, never `Not set` (12/19 boundary); locked record and locked address
card: figures/text only, no tab stop, no reason line (38, 39); address card is
the Project tab's first content, a partial address renders without warning
(30, 31); five fields prefilled from the project only (32, 33); suburb +
postcode save → card updates, settled figure unchanged, no delta anywhere
(34); clearing stored suburb refused with no request, clearing stored line2
allowed and saves (35 + ASSUMED); `<script>` line1 renders as literal text (48).

---

## 9. Sequencing

`02-tasks.json`: t1 backend → t2 model → {t3 OpenablePanel ∥ t4 price sheet ∥
t5 address panel} → t6 wiring + browser journeys. t3 is independent of t1/t2
but must precede t6 (the totals card is its first title-less caller); t5 needs
t2 (types + door label) but not t3 (the address card passes a title). t4/t5
append to the same test file as t2/t3 — the conductor runs them sequentially
anyway.

---

## 10. Rejected alternatives

- **Auth split (rev2): 401 for anonymous via `resolveOpsUser`/`resolveUser`.**
  Dropped — criterion 46 accepts 403, and the split added an import and three
  branches to buy a status code nobody consumes. `resolveStaff` already
  refuses everyone correctly.
- **Delivery row as its own door (`.rec-totals__row--door`).** Overruled by
  the owner (D17): the card is the control, chevron at card level, rows plain.
- **A separate Delivery card on the record.** D9: the totals card is the one
  place the figure lives; a second card is a second place per fact.
- **Estimate beside the field ("machine says $310").** D12: one figure,
  always. The estimate stays inside `delivery_settle_json` for audit, invisible.
- **`worker/lib/deliveryAddress.ts` validation module.** Seven fields of
  trim-and-length checks used by one route; a module is structure for one
  caller. If a second writer appears (the customer form, a later phase), lift
  it then.
- **Address audit with values (before/after).** Field-names-only chosen: meets
  the ASSUMED bullet, smallest log surface under criterion 49, and the D1 row
  itself is the record of the current value.
- **Free-text state / gazetteer postcode-suburb cross-check.** Spec ASSUMED
  settles both: fixed 8-code picker; 4 digits, no gazetteer.
- **Un-settle path in ops2 / removing it from the API.** D4/D16: one-way in
  ops2, capability kept for the legacy console.
- **Keeping `rec-totals__absent` only for the unpriced-lines case.** See §5.1
  — one absence mechanism (the Lines caveat), not two.

---

## 11. Affected files — hand-off index (anchors verified 2026-09-01)

| path | where | change |
|---|---|---|
| `migrations/0063_delivery_address.sql` | new | §1 verbatim |
| `worker/routes/ops.ts` | `buildDeliveryDto` 462–504; PUT handler 752–837; import block (add `AU_STATES`) | §2. `GET /projects/:id` (506+) and `resolveStaff` untouched |
| `src/data/accountDetails.ts` | 10–11 `AU_STATES` | read-only import (worker validation + address panel), no edit |
| `worker/lib/delivery.ts` | — | no change (criterion 6 guard) |
| `worker/lib/staff.ts` | 155 `resolveStaff` | read-only, no edit |
| `src/ops2/projects/record.ts` | `RecordDelivery` 121–134; parse 340–354; door-label consts near `waitingSentence` (656) | §3 |
| `src/ops2/chrome/OpenablePanel.tsx` | 58-line file: `title` prop, section `aria-label`, `<h2>` | §4, three edits |
| `src/ops2/chrome/SidePanel.tsx` | — | read-only (`phoneForm="side"`), no edit |
| `src/ops2/styles/panel.css` | — | no change (chevron already card-centred) |
| `src/ops2/projects/DeliveryPricePanel.tsx` | new | §5.2, template `PricePanel.tsx` |
| `src/ops2/projects/DeliveryAddressPanel.tsx` | new | §5.3 |
| `src/ops2/projects/ProjectRecordPage.tsx` | `RecordTotals` 736–770; `DeliveryFigure` 776–789; totals usage 439; PricePanel-wiring pattern 490–492; Project tab 519–525; footer 536–540 | §5.1, §5.4 |
| `src/ops2/styles/record.css` | rows near 438; stale comment 455–456; `.rec-totals__missing` 457–461 | §5.1: reconcile padding, rewrite comment, delete class |
| `src/ops2/projects/PricePanel.tsx` / `WhyPanel.tsx` | — | untouched; existing assertions must stay green (criterion 40) |
| `src/ops/ProjectRecord.tsx` 844–908 / `src/ops/api.ts` 302 | — | untouched; verified numeric-amount + note-cleared-by-omission compatibility |
| `scripts/tests/delivery.test.mjs` | ~449 anon test stays 403; ~538 un-settle stays | §8 additions |
| `scripts/tests/ops2-record.test.mjs` | bundle entry list; append | §8 additions |
| `scripts/tests/web/ops2-record.spec.ts` | delete :391 assertion; append | §8 additions |
| `CONTEXT.md` | §Openable panel 236–238 | architect's edit, done alongside this design |

---

## Addendum — post-implementation corrections (conformance review, 2026-09-01)

Recorded per the conformance review (`07-review-conformance.md`); these supersede
the clauses they name.

1. **§11 "`src/ops2/chrome/SidePanel.tsx` — read-only, no edit" was wrong.** The
   `phoneForm` union had no `"side"` value before this feature; §5.2/5.3's
   `phoneForm="side"` required widening it. The implemented edit (union widened,
   enter/leave animation keyed on `fromRight = !sheet`) is the design-intended
   minimum and stands.
2. **§11 "PricePanel.tsx untouched" and t3's "byte-identical" clause are
   superseded.** PricePanel's `<dl>`→`<ul>` fixes an accessibility defect the
   required spec assertions surfaced, and it gained `phoneForm="side"` for
   presentation parity with the new panels. Criterion 40's intent (behaviour
   unchanged) holds.
3. **§8/§11 "delete the web spec :391 assertion" is withdrawn.** The Project-tab
   footer was reworded instead; the assertion still guards true behaviour beside
   the new address panel.
