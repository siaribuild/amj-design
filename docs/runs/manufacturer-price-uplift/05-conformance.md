# Architect conformance — manufacturer's price and uplift

Checked at `0b80d401`, against `01-spec.md` (25 criteria) and `00-ask.md`
(D1–D8, D1 corrected).

**Headline: the spec is substantially superseded, and saying "25 of 25" would
be false.** The owner's ruling that nothing is stored but the price
(`00-ask.md` D1, corrected) removed the storage this spec was written around.
Eight criteria describe storing, re-reading or protecting a stored
manufacturer figure and are moot, not met. They are listed as moot rather than
quietly ticked.

## Met

| # | Criterion | Evidence |
|---|---|---|
| 1 | Door opens a SidePanel, not a navigation | MP-1 |
| 2 | Empty price, uplift 30, basis ex, confirm disabled | MP-2, node "closed…" |
| 3 | Arithmetic from the typed figure | MP-2 (1,240 → 372.00 → 1,612.00) |
| 4 | inc converts before the uplift | MP-3 (1,127.27 → 1,465.45), node ×2 |
| 5 | Recomputes per keystroke | MP-2, MP-6 |
| 6 | Read-back shows the new line price, struck old, **no project total** | MP-4 |
| 7 | No GST suffix on any figure; no display-basis control | ops2-record guard (greps `\bgst\b` over `src/ops2`) |
| 8 | *(price half)* total becomes the computed figure exactly, no $10 rounding | node "no $10 rounding" |
| 11 | Quote total recomputes through the existing SSOT; no client total persisted | body carries `{ total }` for one line only |
| 12 | Project phase untouched | existing endpoint writes no status field |
| 14 | No clear action — entry is one-way | node "cannot reprice" + absence of any clear control |
| 15 | Actor and time recorded | existing endpoint sets `price_override_by` / `price_override_at` |
| 16–18 | Invalid or empty inputs disable confirm; zero uplift legitimate | MP-2, MP-6 |
| 19 | Server-side validation, not only the panel | `ops.ts:1298` — `Number.isFinite`, `>= 0`, 400 |
| 23 | Customer sees only the final price | true by construction: nothing else exists |

## Moot — the criterion describes storage the owner deleted

| # | Why |
|---|---|
| 8 *(storage half)* | "the manufacturer's price is stored ex-GST, the uplift percentage is stored on that line" — neither is stored. |
| 9 | The summary cannot show "it came from a manufacturer's price with its uplift": that is the state wording the owner cut ("a price is a price"). |
| 10 | No prefill on reopen — there is nothing to prefill. MP-5 asserts the opposite, deliberately. |
| 13 | Nothing for a typed override to clear. |
| 20–22, 25 | Written against a dedicated manufacturer-price endpoint. No such endpoint exists; the existing override's own guards (`resolveStaff`, `hasAssignedRole`, editable-window `WHERE`) and its existing abuse tests apply unchanged, and this branch does not weaken them. |
| 24 | Required project-scoped line resolution, which was a property of the deleted endpoint. The existing override resolves by bare line id — pre-existing behaviour, not introduced here, and staff are not project-scoped in this console. **Recorded as a deliberate non-conformance, not an oversight.** |

## Grill decisions

D1 (corrected) nothing stored but the price · D2 no $10 rounding · D3 value not
state · D4 customer sees the final price only · D5 discount rework out of scope
· D6 entry basis, not a display toggle · D7 project state untouched · D8
SidePanel via `OpenablePanel`, unmodified — **all honoured.**

## Divergences from the design worth recording

1. **The design's own storage model is gone** (migration 0063, the endpoint,
   `record.ts` field carrying, criterion-13 clearing). `02-design.md` carries
   the superseding note.
2. **`priceState` untouched**, per the owner's ruling; the design's earlier
   `"manufacturer"` state was deleted before build.
3. **An `editable` prop the design did not specify**, added from a Codex P1: the
   endpoint refuses a composite parent and finds no line once issued, so a door
   there could only fail. Uses `OpenablePanel`'s presence-means-openable
   contract rather than a new mode.
4. **The entry switch says "tax", not the console's banned three letters.** The
   guard is untouched; see `PricePanel.tsx`'s header for the reasoning.

## Review layers

| Layer | Result |
|---|---|
| Codex over the feature diff | 5 findings (2×P1, 3×P2), all fixed at `ddc00129` |
| `/security-review` | clean — no HIGH or MEDIUM above the confidence bar |
| `ponytail-review` | run twice; both passes applied (`ea71efb5`, `0b80d401`) |
| Architect conformance | this document |

## Known gaps

- **`typecheck:gate` is fatal-only and does not gate TS2741.** A full `tsc`
  caught a missing required prop that the gate passed. The gate is narrower
  than "typecheck clean" and should not be read as such.
- The arithmetic rounds twice through binary-float `Math.round(n * 100) / 100`.
  Matches the spec's worked figures; flagged by the security review as a
  financial-accuracy characteristic, not a vulnerability.
