`scripts/tests/api.test.mjs:L1058-1097: delete:` the whole "unseeded parent still follows the sum" CONTROL test. The main journey already asserts it at L636 ("the opening total is STILL the sum of its units after one was adjusted") on an unpriced parent. Only new fact is `price_calculated == null` — one extra assert at L637, not a 40-line fixture.

`scripts/tests/api.test.mjs:L967-1000, L1103-1136: shrink:` two new tests re-type the same 28-line fixture (login → PUT lines → completeAccount → submit → split into two 600×900 units). One local helper `splitFixture(email, title, code, qty)` returning `{projectId, parentId, segIds}`, called twice. ~-30.

`scripts/tests/ops2-record.test.mjs:L223-250: delete:` node render test "unit rows render no money string" duplicates `ops2-record.spec.ts:L479` (`expect(units).not.toContainText("$")`) in a real DOM. Reverts the `LineReview` build-entry export at L40 too. Cost: the unpriced-parent variant moves to one extra `record()` route in the spec, or is dropped — the wire test (api F3) is what actually guards the margin.

`src/ops2/projects/ProjectRecordPage.tsx:L502 + src/ops2/projects/LinePage.tsx:L423: yagni:` `record.orderNo == null &&` / `!isOrder &&` are dead conjuncts. An order needs an issued quote, `FLOW` (worker/routes/ops.ts:L71-77) has no edge back out of `issued`, and `linesEditable = ISSUABLE_FROM.has(status_internal)` excludes `issued`. `editable={record.linesEditable}` both sites. (`isOrder` still used at L81/L104, keep the variable.)

`worker/lib/composite.ts:L225-226: shrink:` `owned` is used once and named the inverse of its value (`owned = price_calculated == null`). `const effectiveTotal = parent.price_calculated == null ? total : parent.line_total ?? null;`, 1 line. Drop the `?` on `price_calculated`/`line_total` in `ParentRow` (L173) — the SELECT always returns both — and the `?? null` goes too.

`worker/routes/ops.ts:L1473-1474: shrink:` `&& !clearing` is unreachable-false — when clearing, `calculated` is either non-null `price_calculated` or the L1475 early return fires with the same null. Fold to one const: `const calculated = line.price_calculated ?? line.line_total ?? (line.line_kind === "composite_parent" ? total : null);`

net: -105 lines possible.