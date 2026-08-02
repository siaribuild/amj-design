# `/quote-project` implementation brief

## Purpose

Build a new customer quote-builder route at `/quote-project` for internal A/B
evaluation. It is an alternative presentation of the same draft project and
the same quote data used by `/quote`; it is **not** a second quoting workflow.

`/quote` must remain visually and behaviourally unchanged. Do not redirect,
rename, restyle, or alter its data flow. Do not expose `/quote-project` in
public navigation while the comparison is internal.

The route must help a tradesperson scan a substantial quote, inspect an
opening without losing their place, and make deliberate changes without being
buried in repeated detail or technical-review warnings.

## Non-negotiable contracts

- Reuse the current project, quote state, pricing API, draft persistence,
  upload flow, submission flow, and item/composite data model.
- Do not add a parallel project, quote, pricing calculation, or submission
  lifecycle.
- Preserve existing server-side validation and submit gates. This route only
  changes the customer presentation and interaction model.
- Keep the established data authority rules: architectural plans win for
  dimensions; the energy report wins for type/performance; resolved document
  differences do not create a customer quote-level warning.
- A normal OpenFrame technical review is a service promise, not a customer
  exception. It must not make a line look broken or prevent submission.
- Changes are explicit. Never auto-save an edit, duplicate values merely by
  opening an add form, or silently create a component.
- Use design tokens/classes already established by the application. The page
  background is bone; do not introduce hard-coded colours.

## Experience model

The route has three deliberate layers. Do not let two layers become editors.

| Layer | Job | User outcome |
| --- | --- | --- |
| Collapsed row | Scan and triage | Identify the opening, its size, quoted total and genuine customer action. |
| Inline expansion | Inspect | See secondary information while retaining context in the project list. |
| Drawer editor | Change | Make a validated, explicit, persistent change. |

The operating rule is: **open to inspect; edit to change**.

## Route and data wiring

1. Add `/quote-project` to the customer router as a separate page component.
2. Give it the same current-project loading, autosave/reload, document state,
   quote state, total, and submit actions as `/quote`.
3. It must directly render a previously parsed project, manually created
   openings, composites, review metadata, and the existing upload/document
   state. No test fixture-only data path is acceptable.
4. Do not add it to public header/footer/home links. Direct navigation is
   sufficient for internal testing.
5. Keep local UI identity stable across a state rehydrate. Use a persistent
   server item id (not a regenerated local array index) for the expanded row,
   selected row and drawer target. Saving a line must not collapse the item
   the user was inspecting.

## Project list

### Page framing

- Use a bone page canvas with a compact project heading and a calm list
  surface; do not recreate the existing tall card stack.
- Provide a visible `Add opening` action in the list header and empty state.
  It opens the new-opening drawer. It is not a row action and is not hidden in
  an overflow menu.
- The list is the primary workspace. It should remain easy to scan with 20+
  openings, not become a table-like form.
- Show the project total and item count in the list action bar. Price mode is
  `inc GST` by default, unless the account setting says otherwise. Render the
  effective price mode consistently on the project-level total and each row.

### Collapsed row information

Each top-level opening is represented once. The parent owns its schedule
reference, overall dimensions, quantity and total even when it is composite.

Always show, in priority order:

1. Product-family pictogram plus text product identity. The pictogram is a
   restrained monochrome technical marker, never the only product label.
2. Opening reference, for example `W4`.
3. Product name; show location as muted secondary text when space permits.
4. Width x height and quantity.
5. Indicative line total, expressed in the effective GST mode.
6. A customer-actionable state only, when one exists.
7. Dedicated expand control, visible `Edit` action, and `More` actions.

Recommended desktop shape:

```text
[awning icon] W4  AMJ100T Awning Window · Media  2,410 × 1,800 mm · ×1  $2,450 inc GST  Composite · 3 units  [chevron] [Edit] [More]
```

Do not put options, document provenance, technical-review prose, a full price
breakdown, or repeated `Ready` badges in the collapsed row.

### Customer-facing state rules

| Situation | Collapsed-row treatment | Action |
| --- | --- | --- |
| Complete/priced item | No badge | None. |
| Missing customer information | `Needs your input` plus a concise reason | `Fix details` opens the relevant drawer field. |
| Standard composite | Neutral `Composite · N units` attribute | Expand to inspect or Edit to change. |
| Generated composite that conflicts with an authoritative source, or another non-standard arrangement | `Confirm layout` | Inspect the composite, then confirm/change through the drawer. |
| Glazing/capability/technical verification | No line warning | Explain technical review once at submission. |
| Resolved document conflict | No customer warning | Keep provenance in data/Ops only. |

Do not display `Needs review`, `In review`, `Ready`, or a per-line technical
review explanation as generic customer states. A line should only be visually
exceptional when the customer can meaningfully act on it.

## Inline expansion

### Purpose and scope

Every line with meaningful secondary information should have a disclosure.
Use it for reading and comparison, never editing.

- Only one item may be expanded at a time at every breakpoint.
- The chevron is the disclosure control. It exposes `aria-expanded`, has a
  specific accessible label such as `Show details for W4`, and retains focus
  when toggled.
- A row without any meaningful secondary information may omit the chevron;
  avoid empty expansion panels.
- Expanding a row must not perform a network write or open the drawer.
- Do not jump the viewport when the panel fits; otherwise scroll only enough
  to bring the newly revealed information into view.
- After closing a drawer or saving an edit, restore the previous list scroll
  position and expanded item whenever that item still exists.

### Content boundary for this slice

The exact expanded-content inventory is a separate UX decision. Implement the
following approved minimum only:

- A concise selected-options summary when options exist.
- For a composite, an included-component list under the parent. Each child
  identifies its family/type and dimensions, uses an `Included` treatment, and
  does not display an independently quoted customer price.
- A concise, visible `Edit` action that opens the parent drawer. It does not
  convert the panel into an inline form.

Do **not** add detailed price calculation, source/provenance narrative,
technical-review rationales, editable fields, or an alternative child editor
inside the expansion unless separately specified later.

Example composite disclosure:

```text
W4  AMJ100T Awning Window · 2,410 × 1,800 mm · Composite · 3 units
    Selected: 5Clear / Warm Edge Spacer / American Chain Winder
    ├ Unit 1  Awning  805 × 1,800 mm  Included
    ├ Unit 2  Fixed   800 × 1,800 mm  Included
    └ Unit 3  Awning  805 × 1,800 mm  Included
    [Edit opening]
```

## Drawer editor

### Responsive shell

- At `>=1024px`, open a right-side drawer around 480–560 px wide. The list
  remains visible, dimmed behind the drawer, preserving project context.
- At `<1024px`, use a full-screen editor. A narrow side drawer is not usable
  for a real quote form at tablet width.
- At `<768px`, retain the full-screen editor with a fixed, safe-area-aware
  footer. While the software keyboard is shown, the footer must yield so it
  cannot obscure fields or controls.
- Treat the drawer as a real dialog: focus enters it on open, Escape closes it
  on desktop, focus returns to the originating control, and the background is
  not interactable.

### Drawer composition

Use the existing configuration semantics/components wherever possible rather
than reimplementing product/options/pricing rules.

1. Header: family pictogram, opening reference, location (if known), close.
2. Essential configuration: family/type, product, width x height, quantity.
3. Options: a concise summary with its edit controls.
4. Composite build: parent-level component list and component navigation when
   the item is composite.
5. Indicative estimate: concise total only, not an internal rate-card or
   pricing-engine breakdown.
6. Footer: explicit primary `Save changes` / `Add opening`; secondary
   `Discard` or `Cancel`.

### Editing contract

- Opening the editor creates a local draft; it does not persist a change.
- `Save changes` is the only action that persists an edit and recalculates.
- Closing a dirty draft asks whether to discard changes.
- A new opening starts genuinely blank. It must not copy an existing product,
  options, dimensions or components unless the user chose `Duplicate`.
- The deliberate `Duplicate` action creates an immediate copy of the source
  opening, shows an Undo toast, and keeps every copied field explicit and
  editable. A duplicate is an intentional mutation, unlike opening an add
  form.
- The existing server validation continues to decide whether a configuration
  is valid and whether a quote can be submitted.

### Composite editing

- The composite parent is the commercial/schedule line. Keep it as the drawer
  title and the owner of the total.
- `Edit composite` opens the parent editor.
- Selecting a child changes the same drawer context to `W4 / Unit 2`, with a
  clear `Back to W4` action. Do not stack drawers.
- Child editing remains fully supported through the existing composite model.
- `Add component` opens a blank component draft. It does not create, save, or
  copy a component until the user has chosen a product/options and presses
  `Add unit`.

## Actions

### Direct actions

- `Edit` is always directly reachable for an item. Do not hide the most common
  action in `More`.
- `Fix details` is a direct action for a blocking customer issue and opens the
  drawer at the relevant field; it does not merely expand a row.
- `Expand`/`Collapse` is dedicated to inspection only.

### More actions

The `More` menu is for secondary actions only:

- Duplicate
- Delete
- Convert to composite / edit composite, when applicable

On desktop it is an anchored popover beside the row. On touch devices it is a
bottom action sheet titled with the opening reference. Do not use a centred
modal for the menu. Deletion requires confirmation; duplicate offers Undo.

### Important interaction decision awaiting owner confirmation

An earlier decision accepted clicking a row to open Edit. The follow-up UX
review recommends **not** making the full row a button: a row now contains an
expander, a direct Edit action, More menu, selectable text, and scroll/touch
targets. A whole-row click makes accidental editing and gesture conflicts more
likely.

Implement the recommended model only after this is confirmed: row body is not
clickable; chevron expands; labelled `Edit` opens the drawer. If the owner
instead confirms full-row click, define a non-conflicting click target and
verify it on touch devices before implementation.

## Context-aware action bar

There must be one primary persistent action at a time.

| Context | Bar content |
| --- | --- |
| List with no blocking customer input | Total, item count, `Submit for technical review` |
| List with customer blockers | `N details need your input`, `Fix N details` |
| Document preparation/processing | Honest processing state; do not show a stale ready-to-submit CTA |
| Empty list | Brief helper and `Add opening` / existing document-upload entry point |
| New/edit drawer | Drawer footer replaces the list action bar: `Cancel`/`Discard` and `Add opening`/`Save changes` |
| Composite component editor | `Back to W4` and `Save unit` |
| Submission in progress | Progress and a disabled submission action |

Retain the existing submission semantics and customer-facing technical-review
promise. The bar must not invent a new approval stage.

## Responsive list rules

| Width | List presentation | Editor |
| --- | --- | --- |
| `>=1280px` | Single compact row: icon, product/location, dimensions, qty, price, state, actions | Right drawer |
| `1024–1279px` | Compact row; location/qty can move to secondary detail before reducing readability | Right drawer |
| `768–1023px` | Two-band row: identity/product, then dimensions/price/state/actions | Full-screen editor |
| `<768px` | Purpose-built compact card: code/state header, icon/product, dimensions and price footer | Full-screen editor |

- Never use horizontal scrolling for this quote list.
- Do not force a literal desktop single line at phone width.
- Keep state and primary action discoverable at every size.
- Controls must meet a 44 px touch target minimum where touch is expected.
- Maintain mobile-first DOM order even when desktop uses grid positioning.
- Respect reduced motion. Saving, adding, expanding and duplicating need a
  textual/state confirmation even if motion is disabled.

## Visual language

- Keep the approved bone background and token-based shades across list,
  expanded, selected, drawer, menu, action-bar, disabled and focus states.
- The pictogram is a concise family marker: fixed, awning, sliding, casement,
  hinged door, bifold, etc. It must be adjacent to an explicit text label.
- A composite parent retains the main/scheduled family pictogram. Do not draw
  a precise-looking composite layout at row scale; that can imply an
  engineering-confirmed mullion arrangement.
- Reserve any proportional/technical component diagram for later expanded
  composite-detail work, if adopted.
- Status appearance must use text and icon as well as colour.

## Accessibility

- Semantic disclosure controls with accurate `aria-expanded` and specific
  item labels.
- Drawer/dialog traps focus, supports Escape, restores focus to the origin,
  and announces saving/adding/error outcomes.
- Give every row action a unique accessible name, for example `Actions for
  W4`, `Edit W4`, and `Show details for W4`.
- Keyboard users can reach expansion, edit, menu and drawer actions in a
  predictable order at every breakpoint.
- Do not duplicate warning text between the action bar, row and expanded
  content.
- Ensure text selection and browser zoom continue to work in the compact row.

## Explicitly out of scope

- Any change to `/quote`.
- New pricing, rate cards, price-breakdown design, GST preference persistence,
  API schema, database migration, or workflow stage.
- Public traffic-splitting, feature flags, marketing links, or experiment
  analytics. The comparison is internal and one route will be chosen before
  public release.
- A new data taxonomy for technical/customer review reasons. Map existing
  review data to the presentation rules above without weakening current submit
  gates.
- Detailed source/provenance and full expanded-row information architecture.
  Do not invent it as part of this slice.
- Inline editing within expanded rows.

## Acceptance criteria

### Functional

- Direct navigation to `/quote-project` loads the same current project shown
  at `/quote`.
- `/quote` renders and behaves unchanged.
- A parsed/manual opening appears once as a compact parent row with accurate
  dimensions, product, quantity and current quote price.
- Expanding a normal row shows the approved secondary summary; expanding a
  composite also shows its components as included children.
- Only one row is expanded at a time; expansion remains open after an edit
  save/reload of that item.
- Editing, adding, duplicating, deleting, and composite-component operations
  use the existing data model and persist through refresh.
- Add opening and add component do not create server data until explicit save.
- A blank add-component request is rejected server-side as well as prevented
  in the UI.
- Technical-only review data does not produce a customer action badge or block
  submission. Genuine missing customer configuration does.
- The action bar changes appropriately between list and editor contexts, with
  no competing sticky actions.
- Account GST preference changes the displayed mode without producing a
  conflicting per-row mode.

### Responsive and accessibility

- Validate desktop at 1440 px, small desktop at 1024 px, tablet at 768 px,
  and mobile at 375 px.
- No horizontal page/list scroll at any tested width.
- Drawer width/full-screen breakpoint follows this brief.
- Mobile keyboard does not obscure the currently edited field or primary save
  action.
- Keyboard-only pass covers expand/collapse, Edit, More, drawer close,
  discard confirmation, Save and focus restoration.
- Reduced-motion mode still makes expanded/saved/duplicated state clear.

### Test coverage

Add focused tests alongside the existing customer browser/API suites:

1. Route isolation: `/quote-project` works from current-project hydration;
   `/quote` markup/behaviour remains unchanged.
2. Compact row: product identity, dimensions, total, GST mode and direct
   actions render from real hydrated data.
3. Expansion: only one row opens; normal option summary and composite child
   units display; no child price is double-counted.
4. Persistence: save an item or composite unit, rehydrate, and prove the
   original parent remains expanded with the user at the same item.
5. Draft safety: opening Add creates no item; Cancel creates no item; explicit
   Save does. The same applies to add-component.
6. Duplicate: copy is created intentionally and Undo restores the prior list.
7. State mapping: customer blockers show `Needs your input`; technical-only
   review states remain submittable and visually neutral.
8. Breakpoints: desktop drawer vs tablet/mobile full-screen editor and
   no-horizontal-scroll assertions.
9. Accessibility: unique action labels, disclosure state, dialog focus, Escape
   and focus restoration.

Run the focused tests first, then the full browser suite, API suite and
production build before handoff. Do not deploy until the owner approves the
resulting `/quote-project` UX.

## Implementation handoff checklist

1. Inspect the current `QuotePage`, `ItemComposer`, `StickyQuotePanel`, quote
   state hydration, composite API, and current browser tests before extracting
   shared primitives.
2. Add the isolated route/page and reuse data/action contracts rather than
   copying business logic.
3. Build list, inspection expansion and drawer in that order.
4. Implement the action bar state switch and responsive behaviour.
5. Add the focused tests listed above and verify that existing `/quote` tests
   still pass.
6. Present a local visual review at the four required widths before requesting
   deployment approval.
