# Spec — Manufacturer price on a composite parent

Run: `ops2-composite-manufacturer-price`
Stage 0 grill: run by the owner 2026-09-04; conclusions in `00-ask.md` are binding and are not re-opened here.

## 1. Problem, and the actor it serves

**Actor: Staff (ops) pricing a project after AMJ has reviewed it.**

In their own terms: "AMJ builds the assembly, ships it and quotes it as one unit. I have their figure for that unit. I need to put it on the line it belongs to." Today they cannot. On a composite parent the Price panel is a static card with no door, and `PUT /lines/:id/price` answers `409 composite_parent`. The only way to record money against the assembly is through its segments — prices AMJ never gave, because AMJ never priced the parts separately.

The block is not a UI oversight; it follows from the current model, where a composite parent's total is permanently `Σ(segments)` and `recomputeComposite` would overwrite anything typed. `CONTEXT.md` already carries the concept the code lacks — a **Manufacturer price** is "the figure AMJ quotes for a whole line", and a composite parent is a whole line.

The two phases the owner named:

- **Preliminary quote** — nobody has asked AMJ yet. The parent's total is `Σ(segments)`, computed by the platform. Unchanged.
- **After manufacturer review** — AMJ has given one figure for the whole unit. That figure is the price. Segment prices keep being computed and stored (they are the machinery for the preliminary estimate and the fallback if the price is cleared) but they stop being the truth, stop summing into the parent, and stop being shown.

`price_calculated` is the existing test for "a human set this price" (migration 0046: NULL means no override). No new column, no flag, no label, no re-confirmation workflow.

**Sensitive surface.** The Price panel is the manufacturer-price surface: it takes AMJ's ex-GST figure and an uplift, and writes the result as `line_total`. AMJ's figure and the uplift are deliberately not stored (owner, 2026-08-31). The figure is commercially sensitive cost data — staff-only, never on a customer surface, never readable by a Manufacturer partner, never in log output. Abuse criteria below are executed for real by the tester.

## 2. Acceptance criteria

### Pricing a composite parent

1. **Given** a project in a pre-issue phase with a composite parent line, **When** Staff open that line's page in ops2, **Then** the Price panel is a door (chevron, focus ring, accessible name naming where it leads) exactly as it is on a non-composite line.
2. **Given** a composite parent whose price has never been set, **When** Staff open the Price panel, **Then** the calculator opens showing the line's current total (`Σ(segments)`) as its starting state, with no error and no refusal.
3. **Given** the calculator open on a composite parent, **When** Staff enter AMJ's ex-GST figure and an uplift and confirm, **Then** `PUT /lines/:id/price` returns 200, the line's `line_total` is the uplifted figure, and `price_calculated` is non-NULL.
4. **Given** a composite parent with quantity greater than 1, **When** a manufacturer price is saved, **Then** the stored `line_total` equals the uplifted figure with no multiplication by quantity (quantity never multiplies a manufacturer price).
5. **Given** a composite parent priced by manufacturer figure, **When** the line page reloads, **Then** the Price panel shows exactly one price number for the line, with no "quoted" marker, no basis switch, no second figure and no tax wording.
6. **Given** a composite parent that already carries a typed override, **When** Staff save a manufacturer price on it, **Then** the override is replaced (one price fact per line: writing either clears the other, last write wins), and the reverse also holds.

### `recomputeComposite` loses ownership of the total

7. **Given** a composite parent with `price_calculated` NULL, **When** any of `recomputeComposite`'s call sites runs (split, merge, segment edit, segment reprice), **Then** `line_total` is set to `Σ(segments)`, or NULL when any segment is unpriced — current behaviour, unchanged.
8. **Given** a composite parent with `price_calculated` non-NULL, **When** `recomputeComposite` runs from any call site, **Then** `line_total` and `price_calculated` are left exactly as they were.
9. **Given** a composite parent with `price_calculated` non-NULL, **When** `recomputeComposite` runs, **Then** it still updates that parent's dimensions, quantity, coverage and status from its segments (it loses ownership of the total only).
10. **Given** a priced composite parent, **When** a segment is added, removed, resized or repriced so `Σ(segments)` changes, **Then** the parent's `line_total` is unchanged and no flag, badge or re-confirmation prompt appears anywhere ("manufacturer's figure always wins, even if it is an old one").
11. **Given** a priced composite parent, **When** a segment is repriced, **Then** that segment's own stored price is still written (segment prices keep being computed and stored).

### Clearing

12. **Given** a composite parent carrying a manufacturer price, **When** Staff clear the price, **Then** `price_calculated` returns to NULL and `line_total` returns to the current `Σ(segments)` — NULL if any segment is unpriced.
13. **Given** a composite parent whose price has just been cleared, **When** a segment is subsequently repriced, **Then** `recomputeComposite` again owns `line_total` and the parent follows the sum.

### Units stop showing prices

14. **Given** a composite parent with `price_calculated` non-NULL, **When** Staff view its line page, **Then** no unit row shows a price.
15. **Given** a composite parent with `price_calculated` NULL, **When** Staff view its line page, **Then** unit rows show their prices as they do today.

### Lifecycle and existing gates

16. **Given** a project whose quote has been issued (or a line that is an order line), **When** Staff open that composite parent's line page, **Then** the Price panel is not a door and `PUT /lines/:id/price` refuses — the same mutable window that already governs a typed override and a manufacturer price on a non-composite line.
17. **Given** a composite parent priced by summation before this change shipped, **When** it is loaded after the change, **Then** nothing about it has moved: `price_calculated` is still NULL, its total is still `Σ(segments)`, and it still follows its segments (no backfill).

### Abuse cases (executed, not assumed)

18. **Given** an unauthenticated request, **When** it calls `PUT /lines/:id/price` for a composite parent, **Then** the response is 401/403, and the line's `line_total` and `price_calculated` are unchanged.
19. **Given** a signed-in Customer session (non-staff), **When** it calls `PUT /lines/:id/price` for a composite parent — including a line on the customer's own project — **Then** the response is 403 and no write occurs.
20. **Given** a Manufacturer partner account with a console sign-in, **When** it calls `PUT /lines/:id/price` or reads the ops line payload for a composite parent, **Then** it is refused (403) and no manufacturer-price data is returned.
21. **Given** Staff of the ops console, **When** they request a composite parent line by bare line id belonging to a project they are not viewing, **Then** the line is resolved through its project's record as every other ops2 line page is — a bare-line-id fetch is not a route into pricing.
22. **Given** any customer-facing surface (quote view, PDF, customer API response) for a project containing a manufacturer-priced composite parent, **When** it is rendered, **Then** it shows the line total only — never AMJ's figure, never the uplift — and the total respects the account's GST mode.
23. **Given** a manufacturer price save on a composite parent, **When** Worker logs and audit entries for that request are inspected, **Then** neither AMJ's figure nor the uplift appears in either; the audit entry records the resulting line total only, without the uplift beside it.

### Edge cases

24. **Given** a composite parent with one or more unpriced segments (`line_total` NULL), **When** Staff save a manufacturer price on it, **Then** the save succeeds and `line_total` becomes the uplifted figure — an unpriced segment never blocks a manufacturer price.
25. **Given** a composite parent with unpriced segments and `price_calculated` non-NULL, **When** the price is cleared, **Then** `line_total` becomes NULL (the honest state of an unpriced sum), not 0 and not the last figure.
26. **Given** a manufacturer-priced composite parent, **When** the project's totals and issue gate are computed, **Then** the parent contributes its `line_total` once and its segments contribute nothing — no double count.
27. **Given** a composite parent whose segments are merged back into a single line, **When** the merge runs on a priced parent, **Then** the resulting line's price follows the existing merge rules for a priced line; no price is silently discarded without the merge's own defined behaviour.

## 3. Out of scope

- The parser and its crops (closed by the owner 2026-09-04).
- Storing AMJ's figure or the uplift — deliberately not stored; that ruling stands.
- Any backfill of composites already priced by summation.
- Any "quoted"/"manufacturer priced" label, badge, flag or validation on the total.
- Any re-confirmation workflow after a split change.
- Changes to segment price computation itself.
- Any new ops control beyond making the existing Price panel reachable on this line kind.
- Customer-facing changes: a composite already shows as one line with one total; nothing on the customer side changes.

## 4. Assumptions (vetoable)

- **ASSUMED:** "Units show no price once the parent is priced" applies to the ops2 line page's unit rows. Segment prices are not shown on the record line list or any customer surface today, so there is nothing else to hide.
- **ASSUMED:** clearing a price on a composite parent uses the Price panel's existing clear action, unchanged in wording and placement. Note for the architect: `CONTEXT.md` §Manufacturer price currently says entry is "one-way: no clear action and no revert to the computed price". Grill conclusion 9 supersedes that for a composite parent (and reads as the general rule the owner intends: "the same meaning clearing already has everywhere else"). `CONTEXT.md` needs sharpening by its owner — the architect — to match; this spec follows the grill.
- **ASSUMED:** the pre-issue mutable window and the order-line block stay exactly as they are (criterion 16). Only the `composite_parent` refusal is removed from `PUT /lines/:id/price`.
- **ASSUMED:** `price_calculated` on a parent stores `Σ(segments)` as it stood at the moment of pricing and is never recomputed afterwards — it is the "a human set this" test plus a historical note, not a live figure.

## Decisions needed

None. The grill settled every user-owned call in this feature; the four assumptions above are mechanical readings of those rulings and are flagged for veto rather than asked.
