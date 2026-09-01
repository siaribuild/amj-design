# Design-conformance review — ops2-delivery-price

Reviewer: architect. Scope: final diff (`9913d735...HEAD`) against `02-design.md` (Rev 3),
`02-tasks.json`, with `00-ask.md` rulings D1–D18 as the overriding authority.
Structure only — bugs belong to the tester and Codex.

## Verdict

**CONFORMS**, with three implementer-recorded divergences accepted, three good-reason
deviations now recorded here (the design doc carries a matching addendum), and one
minor finding (estimate residue — two one-line comment/fixture cleanups).

## Path-level check

Everything the design named exists; nothing design-named is absent.

| Design item | Status |
|---|---|
| `migrations/0063_delivery_address.sql` | Exists. Exactly three `ALTER TABLE project ADD COLUMN` (line1/line2/state, TEXT, no constraints). Cascade-safety header present naming the 27 child tables; no rebuild, no DROP — matches §1 and the d1-migration-safety requirement verbatim. |
| `worker/routes/ops.ts` | PUT `/api/ops/projects/:id/delivery` widened as §2: amount group keyed on `"amount" in body` (line 799–818), address group present-fields-only (888–892), `line2 === "" ? null` is the sole clearable field (D14, line 889), note rides the amount group only (847–849, D5), `amount: null` un-settle path intact (D16). `delivery_settle_json`/`settled_at`/`settled_by` predate this feature (migration 0044) — no undesigned schema. `buildDeliveryDto` passthrough at 463–509 with `editable` derived server-side. |
| `src/ops2/projects/record.ts` | `RecordDelivery` widened (+line1/line2/state/editable), `estimate` field deleted, door-label consts at 670–671, `editable === true` fail-closed parse at 364. Matches §3. |
| `src/ops2/chrome/OpenablePanel.tsx` | D18 exactly: `title?: string`, one `?`, conditional `<h2>`, `aria-label={title}` left unedited (React omits when undefined — the design's "no edit needed" branch). No render-prop, no slot, no variant. File no longer than before. |
| `src/ops2/projects/DeliveryPricePanel.tsx` (new) | §5.2: single figure field, `{ amount: <number> }` body only, no estimate, no tax word (header comment documents both rulings D11/D12). |
| `src/ops2/projects/DeliveryAddressPanel.tsx` (new) | §5.3: five fields, never sends an `amount` key (comment at 62), replace-only semantics per D14. |
| `src/ops2/projects/ProjectRecordPage.tsx` | §5.1/§5.4: `RecordTotals` is a title-less `OpenablePanel` (`testId="record-totals"`, door only when `delivery.editable`), no `.rec-totals__row--door` anywhere (D17), `DeliveryFigure` has two branches with the estimate branch gone (D12/D13), `DeliveryAddressPanel` on the Project tab (line 526), footer reworded (528). |
| `src/ops2/styles/record.css` | `.rec-totals__missing` gone; UNPRICED-LINES warning retained per recorded divergence 1. |
| `CONTEXT.md` | §Openable panel rewritten per D18; new §Settled delivery and §Delivery destination entries. (The Manufacturer-price edits in the same diff predate this feature on the branch — not attributed here.) |

## Test artifacts — named vs. created

All three design-named test files appear in task `files` and exist with substantive
additions (the failure mode this check exists for did not recur):

- `scripts/tests/delivery.test.mjs` (t1) — anonymous PUT 403 kept (line 449, 959–960),
  `amount: null` un-settle kept (538), address-group cases added.
- `scripts/tests/ops2-record.test.mjs` (t2–t5) — fourth esbuild bundle
  (`ops2-delivery-bundle.mjs`, lines 60–70) covering OpenablePanel + both new panels;
  no-title OpenablePanel assertions (1188); bundle-wide no-tax grep over both panels
  (1219); address panel partial/empty/locked render tests (1253/1263/1277).
- `scripts/tests/web/ops2-record.spec.ts` (t6) — delivery journeys appended from
  line 743: door aria-label, settle round-trip without reload, empty-figure refusal,
  settled-zero-is-a-figure, D8 no-warning case.

No new test files were invented outside the design, and no `package.json` wiring was
needed — all three ride existing `test:*` scripts, as designed.

## Implementer-recorded divergences (accepted as recorded)

1. **Criterion 19 scope** — only the DELIVERY absence string was retired;
   the UNPRICED-LINES warning stays. Correct reading: criterion 19 governs the
   delivery case only, and the unpriced-lines warning is the $18k-for-a-$30k-job
   guard. The code comment at `ProjectRecordPage.tsx:787` records the distinction.
2. **Panel copy** aligned to `docs/mocks/ops2-delivery-price.html` over the design's
   wording — the mock is the approved artifact; correct precedence.
3. **Error states merged** to one per panel by ponytail-review after the fact.

## Good-reason deviations (design updated, not bounced)

1. **`src/ops2/chrome/SidePanel.tsx` was edited; design §11 and 03-ux.md said "no
   edit".** The design's premise was false: the `phoneForm` union had no `"side"`
   value before this feature, so §5.2/5.3's instruction to render
   `SidePanel phoneForm="side"` was unimplementable without this edit. The
   implementer widened the union and keyed enter/leave animation on form rather than
   width (`fromRight = !sheet`). This is the minimum edit that makes the design's own
   §5 true. Accepted; the design doc addendum corrects §11.
2. **`src/ops2/projects/PricePanel.tsx` was edited; design §11 and t3's done_when
   said "NOT edited / byte-identical".** Two changes: (a) `<dl>`→`<ul>` — an
   accessibility defect caught by the very spec assertions t3 required to stay green
   (a definition list handing AT "a number as the definition of nothing"); under the
   house rule that accessibility is never the shortest diff, fixing it beats
   conserving byte-identity, and criterion 40's *intent* (PricePanel behaviour
   unchanged) still holds; (b) `phoneForm="side"` added so the existing price sheet
   matches the presentation the design mandates for the two new panels. Accepted;
   t3's "byte-identical" clause is superseded.
3. **`scripts/tests/web/ops2-record.spec.ts:391` kept; design §8/§11 said delete
   it.** The design assumed criterion 30 (address panel on the Project tab)
   invalidated the "not built yet" assertion. The implementer instead reworded the
   footer ("Progress, payments and files are not built yet"), so the assertion still
   guards true behaviour alongside the new panel. Keeping a passing test that
   documents the tab's remaining gap is better than deleting it. Accepted.

## Outside design scope (not this feature's diff to judge)

- `scripts/pipeline/conduct.mjs` — ux-stage `compact` 100000→200000: conductor tuning.
- `.gitignore` — agent-config ignore entries: local tooling.

## Minor finding — estimate residue (design §3: `estimate` deleted)

Design §3 deleted `estimate` from `RecordDelivery`; the interface is clean, but two
residues keep the dead term alive:

- `src/ops2/projects/record.ts:604–606` — the `totalsFor` doc-comment still says
  "The live estimate is shown beside it as an estimate" — behaviour D12 removed.
  In a repo whose rationale comments are load-bearing, a comment describing deleted
  behaviour is worth two sentences of cleanup.
- `scripts/tests/web/ops2-record.spec.ts:75, 228` — fixtures still send
  `estimate: 400` / `estimate: 640`; the parser ignores unknown keys so the tests
  are honest, but the fixtures teach the next reader a field that no longer exists.

Both are one-line fixes; route via `conduct fix` at the developer's convenience —
neither blocks acceptance.

## Sequencing

t1 (backend) → t2 (model) → t3/t4/t5 (panels, parallel) → t6 (wiring) is visible in
the diff's dependency structure (record.ts consumes ops.ts's DTO shape; panels
consume record.ts; ProjectRecordPage consumes panels). No evidence of the wiring
preceding its parts. Respected.
