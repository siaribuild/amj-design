# `/quote-project` — implementation plan

**Role:** UX Architect. A senior UX designer was consulted; their critique is
folded into the risks, the interaction contracts and the state-mapping table
below.

**Status:** IMPLEMENTED (2026-08-03), pending owner UX approval before deploy.
Companion to [`quote-project-implementation-brief.md`](quote-project-implementation-brief.md).
See §16 for what shipped and where it deviates from this plan.

**Scope reminder:** `/quote-project` is an *alternative presentation* of the
same draft project and quote data shown at `/quote`, for internal A/B
evaluation. `/quote` stays byte-for-byte unchanged. No parallel project, quote,
pricing or submission lifecycle. No new taxonomy, migration, rate card or
workflow stage.

---

## 0. Decisions recorded

### Owner decisions (this planning round)

| # | Decision | Choice | Effect on plan |
| --- | --- | --- | --- |
| D1 | Row click | **Dedicated controls only** — row body inert; chevron expands, labelled `Edit` opens drawer | §5.2, §7. No whole-row hit target. |
| D2 | Pictograms | **Build a per-family SVG set, editable via Sanity.** Format (owner assumed square) delegated to UX | §9 becomes a real workstream: Sanity schema field + catalogue sync + render component across ~13 families. |
| D3 | Composite `More` action | **Edit composite only** — no "convert to composite" | §7. No new server op / lifecycle. |
| D4 | Document processing UI | **Match `/quote`'s full 6-step checklist** | §4 must extract the upload/AI engine *and* the checklist presentation as shared pieces both pages consume. |

### Resolved from code (no owner input needed)

- **Composite child identity is stable.** `QSegment.id` is a server-assigned
  string; `updateSegment`/`removeSegment` address segments by it and hydration
  round-trips it ([`configurator.ts:44`](../../src/data/configurator.ts),
  [`api.ts` `hydrateQuoteItems`](../../src/data/api.ts)). So in-drawer child
  navigation, "Back to W4 → reopen Unit 2", and unit-level restore key on
  `segment.id` — no descope to parent-only.
- **inc/ex GST is a pure display transform.** `gstAdjust` derives ex from the
  stored inc amount locally ([`gst.ts:13`](../../src/data/gst.ts)); the account
  preference is a React context. The toggle flips row price + bar total
  atomically with no server round-trip and no per-row override.
- **`Convert to composite` genuinely has no client operation** — composites are
  authored server-side; only `updateSegment`/`addSegment`/`removeSegment` exist.
  D3 is therefore the only correct call.

### Open sub-decisions (recommended defaults — do not block build)

- **O1 — `Confirm layout` trigger (§6).** The existing review taxonomy has no
  clean code meaning "generated composite conflicts with an authoritative
  source". **Default: build the `Confirm layout` state and treatment, but leave
  its trigger OFF** (no line resolves to it) until an existing reason code is
  designated for it. This keeps submit gates unchanged and avoids confounding
  the A/B. Confirm with eng whether such a code exists.
- **O2 — Sanity icon field shape (§9).** **Default: an inline sanitised SVG
  markup field** (renders monochrome via `currentColor`), not an image asset
  (which can't inherit theme colour). Confirm during build.

---

## 1. Approach & guiding principles

1. **Reuse contracts, re-present the surface.** Everything data/price/submit
   comes from the existing `QuoteState`, pricing API and submit action. The new
   code is presentation + interaction only.
2. **Three layers, two of them never edit.** Collapsed row = triage; inline
   expansion = **read-only** inspect; drawer = the *only* editor. This inverts
   today's `/quote`, where expanding a card reveals editable sections.
3. **Identity is `serverId`, never the local array id.** This is the brief's
   linchpin and the top build risk (§5).
4. **The A/B must not be confounded.** Same engine on both arms (§4); a
   deterministic, gate-preserving state map with no hand re-triage (§6); a
   complete, consistent pictogram set before comparison (§9).
5. **Bone canvas, existing tokens only.** No hard-coded colours; reuse the
   `quote-*` token classes ([`theme.css:409-563`](../../src/styles/theme.css)).

---

## 2. Architecture & route wiring

Routing is **state-based**, not react-router: App holds one `page` string and
syncs the URL via History API. Adding the route is three small, isolated edits —
`/quote` is not touched by any of them.

1. **`Page` union** — add `"quote-project"`
   ([`src/app/ui.tsx:14`](../../src/app/ui.tsx)).
2. **Path map** — add `"quote-project": "/quote-project"` to `PAGE_PATHS`
   ([`src/app/routes.ts:3`](../../src/app/routes.ts)). It auto-registers in
   `STATIC_ROUTES`, so `routeFromPathname` / `pathForPage` work with no further
   change. Direct navigation to `/quote-project` then hydrates the current
   project exactly like `/quote`.
3. **Render switch** — add `case "quote-project":` in `renderPage()`
   ([`src/app/App.tsx:2092`](../../src/app/App.tsx)) rendering the new
   `QuoteProjectPage` with the **same props** the `quote` case passes:
   `setPage={navigateTo} user={user} quote={quote} onSubmit={submitCurrentProject} onHeroChange={setViewHasHero}`.

**The draft is already shared.** `quote` is App-level state
([`App.tsx:1859-1962`](../../src/app/App.tsx)) and is *already* handed to two
routes today (`quote` and `product-detail`). The new route receives the same
object → identical items, files, title, `projectId`, autosave, reload — zero
extra wiring. There is one draft per session (anon claim cookie or signed-in
user) across every route.

**Do not** add `/quote-project` to header/footer/home nav or the `heroPage`
active-nav list. Direct navigation only, per the brief.

---

## 3. Component inventory (new)

New page lives under `src/pages/QuoteProjectPage.tsx` with a small local
component set (co-located or under `src/components/quote-project/`):

| Component | Job |
| --- | --- |
| `QuoteProjectPage` | Route shell: framing, list, action bar, drawer host, document engine wiring. |
| `OpeningRow` | One collapsed top-level opening (scan/triage). Owns chevron, `Edit`, `More`. |
| `OpeningExpansion` | Read-only disclosure panel (options summary + composite `Included` children + one `Edit opening` launcher). |
| `OpeningDrawer` | Responsive dialog editor (right drawer ≥1024px / full-screen <1024px). Hosts the reused `ItemForm`; two-level composite context. |
| `MoreMenu` | Anchored popover (desktop) / bottom action sheet (touch): Duplicate, Delete, Edit composite (when applicable). |
| `ProjectActionBar` | Context-aware sticky bar (replaces/adapts `StickyQuotePanel` semantics). |
| `FamilyPictogram` | Renders the Sanity-authored monochrome family SVG (square, `currentColor`) with a generic fallback mark. |

Reused as-is where possible: `ItemForm` (drawer body — already supports
`scope:"item"|"unit"`, `seed`, server pricing via `previewPrice`), the
`DimensionsFields`/`OptionsFields`/`QtyLocationFields` blocks, `productLabel`,
`fmt`, `mm`, `linePriceTotal`, `lineBlocksSubmission`, `reviewSeverity`,
`hasDuplicateCode`, `useGstMode`/`gstAdjust`/`gstSuffix`.

**Not reused:** `ItemSummaryCard` (its expansion *is* the inline editor we are
replacing) and `StickyQuotePanel`'s markup (semantics reused, presentation
re-derived).

---

## 4. Shared-primitive extraction (D4)

Because the new list must reproduce the full document-processing checklist, and
the brief forbids a parallel pipeline, the upload/AI engine and its checklist UI
must be shared, not copied.

**Extract two pieces out of `QuotePage`:**

1. **`useProjectDocuments(quote, user)` hook** — the whole document engine:
   `handleFiles`, `preparePhotoForAi`, `pollExtraction` (epoch/stall/deadline
   logic), `aiPhase` state machine, `stageLog`, `processing`/`processingDocs`,
   retry, per-file digests, collisions, `removeOffer`, `basisMap`, file remove.
   Returns state + handlers. (Today this is ~400 lines inline in
   [`QuotePage.tsx:136-686`](../../src/pages/QuotePage.tsx).)
2. **`<DocumentProgress>` presentational component** — the 6-step checklist with
   per-step timers, the "taking longer than usual" stall heads-up, and the
   single-line fallback (today the IIFE at
   [`QuotePage.tsx:1044-1149`](../../src/pages/QuotePage.tsx)). Pure props in.

**Refactor path & risk control.** Refactor `QuotePage` to consume both, then
render the *same* hook + component in `QuoteProjectPage`. This is a
**behaviour-preserving** refactor; the gate is the existing `customer.spec.ts`
passing unchanged (it asserts the extraction states, digests and durability).

> **Fallback if parity can't be proven in the same PR:** have
> `QuoteProjectPage` consume the extracted hook/component while `QuotePage`
> keeps its inline engine temporarily, and track convergence as a follow-up.
> Duplication is the lesser evil only if it protects the A/B control arm; prefer
> the shared path.

**Also extract (pure, low-risk):** `useQuoteSummary(quote)` returning `total`,
`attentionCount`, `pendingPriceCount`, `technicalCount`, `itemBlocked`,
`hasContent` (today inline at [`QuotePage.tsx:235-252`](../../src/pages/QuotePage.tsx)),
so both pages compute the sticky/action-bar figures from one source and can
never disagree.

**Review + submit view.** Extract `QuotePage`'s review/submit screen
([`QuotePage.tsx:751-792`](../../src/pages/QuotePage.tsx)) into a shared
`QuoteReviewSubmit` used by both. The new action bar's `Submit for technical
review` routes into it — reusing the existing submission semantics and contact
gating, inventing no new approval stage.

---

## 5. Identity & persistence contract (the linchpin)

### 5.1 Why

`QItem.id` is a **local ephemeral** id regenerated by `hydrateQuoteItems` on
reload; `serverId` is the only durable identity. Today `/quote` keys
`expandedId`/`focusReq`/`codeFocusReq` on the local `id`
([`QuotePage.tsx:260,1028`](../../src/pages/QuotePage.tsx)) — which detaches
after any `reload()` that regenerates ids (restore, save-recalc, refresh). The
brief makes "expansion survives an edit save/reload" a hard acceptance test.

### 5.2 Contract

- **Row identity key** = `item.serverId ?? \`local:${item.id}\``. Use it for the
  expanded row, the `MoreMenu` anchor and the drawer target.
- **Composite child key** = `segment.id` (server-stable string).
- **One row expanded at a time**, at every breakpoint: `expandedKey: string | null`.
- **Drawer target** = `{ itemServerId?: string; localId: number; childSegmentId?: string }`.
- **Save → reload → restore sequence (single canonical path):**
  1. Hold the drawer in a *saving* state; disable primary.
  2. `await` the persist (`quote.update` / segment op) and `quote.reload()`
     (App's reload passes `previous`, so saved lines keep their local id and all
     keep `serverId`).
  3. Resolve the item by `serverId` in the fresh `quote.items`.
  4. If present: close drawer, **restore the saved list scroll offset**,
     re-expand by key, and **return focus to that row's `Edit` control**
     (canonical target regardless of whether entry was row-`Edit`,
     expansion-`Edit` or `More→Edit` — determinism beats exact origin).
  5. If absent (deleted concurrently): focus the list action bar and announce.
- **Add opening:** the new line does not exist until Save; there is nothing to
  re-expand pre-save. After Save the created line has a `serverId` — expand it
  and focus its `Edit` control.
- **Never** capture a DOM node across the async save; always re-query by a
  `serverId`-keyed selector *after* reload settles (top a11y failure, §11).

---

## 6. Collapsed-row state → existing severity (anti-confound mapping)

The three customer-facing states must be a **pure, deterministic** function of
existing data. No hand re-triage of review reasons — that would compare "new
presentation + a bespoke re-triage" and invalidate the experiment. Submit gates
stay byte-for-byte: the blocking predicate is the *same* `lineBlocksSubmission`
the sticky counter and server use.

**Enumerated mapping** (from `REVIEW_SEVERITY`,
[`configurator.ts:118-134`](../../src/data/configurator.ts)):

| Line condition | Row state | Action | Derivation |
| --- | --- | --- | --- |
| `lineBlocksSubmission(item)` **or** duplicate code | **`Needs your input`** + concise reason | `Fix details` → drawer at the offending field | error-severity keys (`dims`/`qty`/`options`/`product`) or unpriced-not-warning, or `hasDuplicateCode` |
| Composite (`segments.length>0`), not blocking | Neutral **`Composite · N units`** | Expand to inspect / Edit to change | `segments` present |
| Composite + designated conflict code *(O1, default OFF)* | **`Confirm layout`** | Inspect composite → confirm/change in drawer | reserved; no code wired until eng designates one |
| Priced, non-composite, no error | **No badge** | None | not blocking, not composite |
| Any warning-only reason (`glazing`, `material`, `substitute`, `type`, `note`, `thermalRecommendation`, `fit`, `noLongerInDocuments`, `customerConfigurationChanged`, resolved doc conflict) | **Suppressed** (no row badge) | — | technical review, explained once at submission |

**Rules that fall out of this:**
- A line is visually exceptional **only** when the customer can act on it.
- Unknown/new reason codes default to **suppressed** on the row (they still
  reach the technician via submission), never promoted to a blocker.
- `Needs review` / `In review` / `Ready` / per-line technical rationale are
  **not** rendered as generic states (a deliberate divergence from today's
  `ItemSummaryCard`, which shows "Needs review"/"Ready" chips).
- Verify once in tests that the map neither promotes a current warning to a
  blocker nor demotes a current blocker (gate parity).

---

## 7. Interaction model per layer

### 7.1 Collapsed row (`OpeningRow`)

Priority order, once per top-level opening (parent owns ref/size/qty/total even
when composite):

`[family pictogram] W4  AMJ100T Awning Window · Media  2,410 × 1,800 mm · ×1  $2,450 inc GST  [state]  [chevron] [Edit] [More]`

- Pictogram is **always** beside the text label, never the sole identity (§9).
- Location is muted secondary text, dropped before readability at narrow widths.
- Price in the effective GST mode (context-driven, atomic with the bar total).
- State per §6; most rows carry no badge.
- **Row body is not a button (D1).** Chevron, `Edit`, `More` are the only
  interactive targets; text stays selectable; price stays selectable.
- **Never** in the collapsed row: options, provenance, technical-review prose,
  price breakdown, or repeated `Ready` badges.

### 7.2 Read-only inline expansion (`OpeningExpansion`)

The thesis' most fragile point: an expansion that *looks* editable (or an `Edit`
that reads as inline-edit) reproduces today's model and sinks the A/B. Guard it
in the visual language, not just behaviour.

- **Universal disclosure with a guaranteed non-empty payload.** Every row gets a
  chevron; the panel always carries at least the options summary (or
  `No options selected`) so there are no empty panels and no ragged control
  column. (Rejects the brief's "may omit the chevron" in favour of a predictable
  list — a UX-consult recommendation.)
- Contents, and nothing else:
  - concise **selected-options summary** (text, never input chrome);
  - for a composite, the **included children** — each child shows
    family/type + dimensions + a flat `Included` pill, **no price, no
    affordance**;
  - one **`Edit opening`** control styled as a launcher (a button that visibly
    opens an editor), not a pencil implying in-place edit.
- Expanding performs **no** network write and does **not** open the drawer.
- Only one row expanded at a time; do not jump the viewport if the panel fits;
  otherwise scroll just enough to reveal it.
- **Do not** put price breakdown, provenance, technical rationale, editable
  fields, or an alternative child editor here.

### 7.3 Drawer editor (`OpeningDrawer`)

**Shell (responsive):**
- ≥1024px: right drawer ~480–560px; list visible + dimmed behind; project
  context preserved.
- <1024px: full-screen editor; <768px keep full-screen with a fixed,
  safe-area-aware footer that **yields to the software keyboard** so it never
  covers the active field / primary Save.
- **True dialog semantics at every size** (including the mobile full-screen
  route form): `role="dialog"`, `aria-modal`, focus enters on open, focus
  **trapped**, background `inert`, Escape closes on desktop, focus returns to
  the originating `Edit` control (§5.2). Build on the available Radix Dialog
  primitive for focus-trap/portal, restyled to bone tokens — **not** the unused
  shadcn `sheet.tsx` default (black overlay / animation classes that ignore the
  token system and reduced-motion).

**Composition** (reusing existing config semantics):
1. Header: family pictogram, opening ref, location, close.
2. Essential config: family/type → product, W×H, quantity — this is exactly what
   `ItemForm` renders; host it in the drawer body.
3. Options: `ItemForm`'s options summary + controls.
4. Composite build: parent-level unit list + child navigation (below).
5. Indicative estimate: concise total only (server figure; no rate-card
   breakdown) — `ItemForm` already shows this.
6. Footer: explicit `Save changes` / `Add opening`; secondary `Discard`/`Cancel`.

**Editing contract:**
- Opening the editor creates a **local draft**; no persistence.
- `Save changes` is the only thing that persists and recalculates
  (`quote.update(id, built)` for edit; `quote.add(built)` for new).
- Closing a dirty draft asks to discard (reuse `ItemForm`'s existing inline
  confirm).
- A new opening starts **genuinely blank** — no copied product/options/dims
  unless `Duplicate` was used.
- Server validation remains the authority on validity and submittability.

**Composite child navigation — one drawer, two levels (no stacking):**
- `Edit composite` opens the parent editor.
- Selecting a child swaps the drawer context to `W4 / Unit 2` with a `Back to
  W4` control; reuse `ItemForm scope="unit"` (locked join axis), persisting via
  `quote.updateSegment` / `addSegment` / `removeSegment`.
- `Add component` opens a **blank** unit draft; it creates nothing until the
  user picks a product/options and presses `Add unit` (matches today's
  `CompositePanel` guard).
- **Escape precedence:** at `W4 / Unit 2`, Escape/`Back` reverses child→parent
  *first*, then a second Escape closes.
- **Dirty child draft:** `Back to W4` is not a "close" — it must still guard an
  unsaved unit draft (confirm before dropping it).
- **Footer/title reconfiguration** (`Save changes`↔`Save unit`, title↔breadcrumb)
  is a wayfinding hazard, worst on mobile where the dimmed-list cue is gone:
  keep the breadcrumb (`W4 / Unit 2`) persistent and announce context changes to
  AT.
- Read-only children (expansion) vs editable children (drawer) render the same
  data with **opposite** meaning — give drawer children a visible affordance
  (`Edit unit`/chevron); keep expansion children flat text + `Included` with
  none.

### 7.4 Actions & `More`

- **`Edit`** is always directly reachable on the row (never hidden in `More`).
- **`Fix details`** is the direct action for a blocking line; opens the drawer at
  the relevant field (not merely expand).
- **`Expand`/`Collapse`** is inspection only.
- **`More`** (secondary only): Duplicate, Delete, `Edit composite` (only when
  `segments.length>0` — D3, no "Convert to composite"). Desktop = anchored
  popover beside the row; touch = bottom **action sheet** titled with the
  opening ref. Never a centred modal for the menu.
- **Duplicate + Undo without toast infra:** `quote.copy(id)` creates the copy;
  render an **inline `Duplicated from W4 · Undo` strip on the new row**
  (bone/token, `role="status"`, persistent until dismissed or next action). Undo
  = `quote.remove(newServerId)` + restore prior list/scroll. This needs no
  auto-dismiss timing and is trivially reduced-motion safe (it is state text).
  Defer real Sonner adoption to a separate decision.
- **Delete** requires confirmation. On touch, launch the small centred confirm
  dialog **after** the action sheet closes (don't stack it on the sheet).

### 7.5 Context-aware action bar (`ProjectActionBar`)

One primary persistent action at a time; reuse `StickyQuotePanel`'s state logic
via `useQuoteSummary`. Bar/row/expansion must not duplicate the same warning
text.

| Context | Bar |
| --- | --- |
| List, no blockers | Total + item count + `Submit for technical review` |
| List, `N` blockers | `N details need your input` + `Fix N details` |
| Docs processing | Honest processing state (§4 checklist); **no** stale ready-to-submit CTA |
| Empty list | Brief helper + `Add opening` and the existing upload entry point |
| New/edit drawer | Drawer footer replaces the bar: `Cancel`/`Discard` + `Add opening`/`Save changes` |
| Composite unit editor | `Back to W4` + `Save unit` |
| Submitting | Progress + disabled submit |

- Add opening is a **visible header/empty-state action**, not a row action, not
  in `More`.
- **Empty state mirrors `/quote`** (upload primary, manual Add secondary) so the
  A/B compares presentation, not a changed funnel.

---

## 8. Responsive rules

| Width | List | Editor |
| --- | --- | --- |
| ≥1280px | Single compact row: icon, product/location, dims, qty, price, state, actions | Right drawer |
| 1024–1279px | Compact row; location/qty may move to secondary detail | Right drawer |
| 768–1023px | Two-band row: identity/product, then dims/price/state/actions | Full-screen editor |
| <768px | Compact card: code/state header, icon/product, dims+price footer | Full-screen editor |

- **No horizontal page/list scroll at any width.**
- Mobile-first DOM order preserved even where desktop uses grid positioning.
- 44px minimum touch targets for chevron / `Edit` / `More` (they sit adjacent —
  size and space them to prevent mis-taps).
- Respect reduced motion; every expand/save/add/duplicate has a textual/state
  confirmation regardless of motion.
- Validate at 1440 / 1024 / 768 / 375.

---

## 9. Family pictogram workstream (D2)

A real, Sanity-authored, per-family SVG marker. Because a *half-finished* or
inconsistent set would bias the A/B against the new arm, the set must be
**complete and consistent across all ~13 families before comparison**
(sliding-window, awning-window, casement-window, glass-louvre,
tilt-and-turn-window, sashless-double-hung, single-hung-window, sliding-door,
casement-door, bi-fold-door, pivot-door, slim-frame-sliding-door,
lift-slide-door).

**Format (UX decision, owner delegated — square, as assumed):**
- Square, monochrome, single-weight technical line marker; fixed `24×24`
  viewBox rendered ~18–20px; colour via `currentColor` so it inherits the token
  ink/quiet shade and adapts by state. Optically balanced across families.
- A restrained operation schematic (e.g. awning = top-hinged sash; sliding =
  horizontal split + travel arrow; fixed = plain light). **Never** a
  precise-looking composite mullion layout at row scale (implies an
  engineering-confirmed arrangement — brief §Visual language).

**Pipeline:**
1. **Sanity `family` type** ([`sanity/schemaTypes.ts:35`](../../sanity/schemaTypes.ts)):
   add an `icon` field. **Default (O2): inline SVG markup string** so it can
   render monochrome via `currentColor`. Sanitise server-side on sync (strip
   `<script>`, event handlers, `foreignObject`, external refs) — consistent with
   the app's existing upload-sanitisation posture.
2. **Catalogue sync → client `Family`:** surface `icon?: string` on the client
   `Family` interface ([`catalogue.ts:18`](../../src/data/catalogue.ts)) through
   the existing load-once-serve-sync path that already replaces
   `categories`/`families`/`products` at runtime.
3. **`FamilyPictogram` component:** inlines the sanitised SVG in a square box
   with `currentColor`; falls back to the generic `WindowMark` **only** as a
   last-resort render guard (per the "no mock fallbacks" directive, seed every
   family's icon in Sanity so the fallback is never the content path).

> This is the largest net-new surface in the plan and the one dependency on
> content authoring. If the icon set can't be authored in time, the A/B should
> run with the generic mark across *all* families (consistent) rather than a
> mixed set — never a partial bespoke set.

---

## 10. Visual language & tokens

- Bone page canvas (`.quote-page` / `ground-bone`); calm list surface, not the
  tall card stack.
- Reuse `quote-panel`, `quote-item-head`, `quote-chip--{ready,review,attention,neutral}`,
  `quote-notice--*`, `quote-dialog` (drawer shadow), `quote-sticky[data-state]`,
  `field-control`, `quote-option`, focus-ring utilities. No hard-coded colours.
- Row/expansion/selected/drawer/menu/action-bar/disabled/focus all token-based.
- Status uses **text + icon + colour**, never colour alone.
- Composite parent keeps the scheduled-family pictogram; no precise composite
  layout drawn at row scale.

---

## 11. Accessibility checklist

- **Disclosure:** chevron is a real `<button>` with `aria-expanded` +
  `aria-controls`→panel id, unique label `Show details for W4`, focus retained
  on toggle. If ever omitted, render nothing (no dead disabled tab stop) — but
  §7.2 keeps it universal.
- **Drawer/dialog:** `role="dialog"` + `aria-modal`, focus-in on open, focus
  trap, background `inert`, Escape (desktop) with child→parent precedence
  (§7.3), focus restored to origin `Edit` control. Same semantics for the mobile
  full-screen editor even though it's a route form.
- **Unique per-row action names:** `Edit W4`, `Actions for W4`, `Show details for
  W4`, `Fix details for W4` — 20 identical "Edit"/"More" names pass a shallow
  scan but are unusable by screen readers.
- **Reduced motion = textual confirmation** via a single polite live region for
  expand/save/add/duplicate; do not double-announce (bar/row/expansion must not
  duplicate the same message).
- **44px touch targets**; text selection + browser zoom keep working in the
  compact row.
- **Top 3 failure modes to pre-empt:** (1) focus falling to `<body>` after
  async save+reload — restore by `serverId` selector post-settle; (2)
  non-unique action names; (3) mobile full-screen editor losing dialog
  semantics + a motion-only Undo invisible to AT.

---

## 12. Testing plan

Framework: **Playwright**, serial, real local Worker on `:8788`
([`playwright.config.ts`](../../playwright.config.ts)). Seed with the
**route-mock `**/api/projects/current` GET** pattern (let PUT saves pass) already
used for the composite regression in
[`customer.spec.ts:77-146`](../../scripts/tests/web/customer.spec.ts); assert on
the stable token classes and role/text queries. Copy `seedEmail`/`otpLogin`
helpers locally (no shared module exists).

Focused tests (new `quote-project.spec.ts`), then the full suite:

1. **Route isolation** — `/quote-project` loads the same hydrated current
   project; `/quote` markup/behaviour unchanged (existing `customer.spec.ts`
   green = the §4 refactor parity gate).
2. **Compact row** — product identity, dims, total, GST mode, `Edit`/`More`/
   chevron render from real hydrated data (mock a signed-in user for ex-GST).
3. **Expansion** — only one row open; options summary + composite `Included`
   children show; **no child price double-counted**; no empty panels.
4. **Persistence/identity** — save an item and a composite unit, rehydrate, and
   prove the **original parent stays expanded** and focus/scroll restore (keys on
   `serverId`).
5. **Draft safety** — opening Add creates no item; Cancel creates none; explicit
   Save does. Same for Add-component. Blank add-component rejected server-side
   *and* UI-prevented.
6. **Duplicate/Undo** — copy is intentional; inline Undo restores the prior list.
7. **State mapping** — a customer blocker shows `Needs your input`;
   technical-only review lines stay submittable and visually neutral; gate
   parity (no promote/demote).
8. **Breakpoints** — desktop right-drawer vs tablet/mobile full-screen; no
   horizontal scroll at 1440/1024/768/375.
9. **Accessibility** — unique action labels, disclosure state, dialog focus
   trap, Escape (incl. child→parent), focus restoration.

Run order: focused tests → full browser suite → API suite → production build.
**Do not deploy until the owner approves the `/quote-project` UX.**

---

## 13. Build sequence

Follows the brief's handoff checklist; each phase ends green before the next.

1. **Extract shared primitives** (§4): `useProjectDocuments`, `<DocumentProgress>`,
   `useQuoteSummary`, `QuoteReviewSubmit`. Refactor `QuotePage` onto them; prove
   `customer.spec.ts` unchanged. *(Highest-risk phase — the A/B control arm.)*
2. **Route + page shell** (§2, §3): register the route; render the list from the
   shared `quote` with the identity contract (§5) in place from day one.
3. **List + collapsed row + read-only expansion** (§7.1–7.2, §6 mapping,
   §9 pictogram render with fallback).
4. **Drawer editor** (§7.3): reuse `ItemForm`; add/edit/duplicate/delete;
   composite two-level navigation on `segment.id`.
5. **Action bar + responsive + a11y** (§7.5, §8, §11).
6. **Pictogram content pipeline** (§9): Sanity field + sync + author all
   families. Can run parallel to 3–5 behind the fallback mark.
7. **Tests** (§12) + local visual review at 1440/1024/768/375 → request owner
   approval.

---

## 14. Risks & mitigations (from the UX consult)

| Risk | Mitigation |
| --- | --- |
| Identity detaches on reload (intermittent, passes naive click-through) | §5 contract; test #4 keys on `serverId`; never reuse captured DOM nodes. |
| Warning→state **hand re-triage confounds the A/B** | §6 deterministic map, unknown→suppress, gate parity asserted (test #7). |
| Read-only expansion *feels* editable → reproduces today's model, biases A/B | §7.2 visual discipline: text not fields, `Included` flat pills, `Edit` as launcher; universal non-empty disclosure. |
| Single-drawer composite nav edges (Escape, dirty child, footer/title churn) | §7.3 explicit precedence + dirty-guard on `Back` + persistent breadcrumb. |
| Duplicate/Undo pulls in toast infra | §7.4 inline row-level Undo strip; defer Sonner. |
| Extraction destabilises `/quote` (control arm) | §4 behaviour-preserving refactor gated by `customer.spec.ts`; documented duplication fallback. |
| Partial/inconsistent pictogram set biases A/B | §9 complete+consistent-before-compare; all-generic fallback beats mixed. |
| §4 refactor regresses the AI/upload timing | Keep epoch/deadline/stall logic byte-identical in the hook; assert extraction states in tests. |

---

## 15. Explicitly out of scope (echoing the brief)

Any change to `/quote` behaviour; new pricing / rate cards / price-breakdown
design / GST-preference persistence / API schema / DB migration / workflow
stage; public traffic-splitting, feature flags, marketing links, experiment
analytics; a new review-reason taxonomy; detailed source/provenance and full
expanded-row IA; inline editing within expanded rows; **convert-to-composite**
(D3). The pictogram *field + sync + render* is in scope; a bespoke per-family
**art** set beyond the consistent square markers is a fast-follow if the
presentation wins.

---

## 16. As-built record (2026-08-03)

Implemented across the seven-step sequence in §13, with an Opus code review after
each phase. Two review passes found real defects; the notable ones are recorded
here because they are the traps a future change could reintroduce.

### Files

**New** — `src/pages/QuoteProjectPage.tsx`;
`src/components/quote-project/{OpeningRow,OpeningExpansion,OpeningDrawer,MoreMenu,ProjectActionBar,FamilyPictogram}.tsx`,
`.../{identity,rowState}.ts`; `src/data/{useProjectDocuments,quoteSummary}.ts`;
`src/components/{DocumentProgress,QuoteReviewSubmit}.tsx`;
`scripts/tests/web/quote-project.spec.ts`.

**Modified** — `src/app/{ui.tsx,routes.ts,App.tsx}` (3 route edits);
`src/pages/QuotePage.tsx` (consumes the extracted primitives; ~500 lines removed);
`src/components/ItemComposer.tsx` (new optional props, see below);
`src/styles/theme.css` (`.quote-drawer`, `.quote-drawer-scrim`);
`sanity/schemaTypes.ts` + `src/data/catalogueQuery.ts` + `src/data/catalogue.ts`
(family `icon`).

### Deviations from the plan

- **§4 extraction went further than planned.** The review/submit view was also
  extracted (`QuoteReviewSubmit`), so both arms share one submission lifecycle
  rather than only one `onSubmit` contract.
- **`useQuoteSummary` was renamed `quoteSummary`.** A `use*` alias for a
  non-hook is treated as a hook by `eslint-plugin-react-hooks` and would flag
  the first legitimate conditional call.
- **§7.2 universal disclosure was kept** (every row has a chevron), rejecting the
  brief's "may omit the chevron" — a ragged control column makes expansion
  unpredictable and leaks item type.
- **§9 pictograms are content, with no built-in fallback set.** An unauthored
  family renders a neutral empty slot, not a plausible generic glyph:
  substituting art for missing CMS content is the placeholder pattern the owner
  ruled out. Icons must be authored for all ~13 families before the A/B runs.
- **`Remove unit` was added to the drawer.** It was not in the plan, but the
  control arm has it, and an A/B arm that can do *less* confounds the comparison.

### `ItemComposer` additions (all optional, inert for existing callers)

`onDirtyChange`, `initialSection`, `excludeId`, `heading`. The first two exist so
the drawer can guard an unsaved draft and land `Fix details` on the offending
field; the last two fix defects found in review.

### Defects found in review, and why they mattered

1. **`ItemForm`'s duplicate-code check had no self-exclusion.** Seeded with an
   existing line, the form collided with itself, so `Save changes` was disabled
   for *every* opening — the drawer, the route's only editor, could not save.
   Fixed with `excludeId`. **`src/ops/ProjectRecord.tsx` passes siblings
   including self and may carry the same latent bug — unverified, worth a look.**
2. **The parent-edit dirty flag was never true.** `ItemForm`'s "has the user
   typed anything" heuristic reads as dirty from the first render of an existing
   line; the drawer's level-reset effect then clobbered it on mount, leaving the
   discard guard permanently off. Seeded forms now diff against their seed.
3. **Saving from the drawer erased review provenance.** The composer rebuilds
   `review` from scratch (`{fit}` or `null`) because it was written for new
   items; writing that through dropped glazing/substitute/material/thermal
   reasons and could clear an unaddressed error-severity reason. The drawer now
   clears only the keys an edit actually resolved, as the inline editor does.
4. **The discard confirm was `absolute` inside a scrolling dialog**, so on a
   scrolled form it rendered off-screen while taking focus — a frozen drawer.
5. **A flex spacer with no `order`** defaults to `order:0` and sorted ahead of
   every ordered sibling, so the 768–1023px two-band split never happened.
6. **`Fix details` was a 17px touch target** — the primary action on a blocked
   line. Now 44px where touch is expected.

Findings that were *rejected* after checking: two "behavioural drift" reports
against the §4 extraction compared to `git HEAD`, but the pre-refactor working
tree already contained those behaviours (uncommitted third-party work). Changing
them would have introduced the drift the report was warning about.

### Round 3 — security review of the pictogram pipeline

A third review pass over Step 6 and the round-2 fixes found one **critical** and
one **high** defect:

1. **Stored XSS in the pictogram sanitiser** (verified with a working PoC). The
   allow-list walked `el.children`, which skips comments, CDATA and processing
   instructions. A surviving processing instruction round-trips through
   `outerHTML` verbatim, and re-parsing that string with the HTML parser turns
   it into a bogus comment ending at the first `>` — everything after it is then
   parsed as HTML inside SVG foreign content, where an `img` with an `onerror`
   handler executes. The catalogue is fetched by every browser, and the payload
   lands on a page holding a signed-in customer's session. Fixed by walking
   `childNodes` and dropping every non-element, non-text node, plus rejecting
   non-SVG-namespace elements and namespaced attributes outright.
   `scripts/tests/web/quote-project.spec.ts` now carries an end-to-end
   regression test built on that PoC. It was confirmed to FAIL against the
   vulnerable code before being kept — the first version of the test passed
   against both, because the stubbed Sanity response was CORS-rejected and the
   payload never reached the component.

2. **`src/ops/ProjectRecord.tsx` had the same self-collision bug** as round-2
   finding #1 — pre-existing, unrelated to this route, and it meant **"Save
   line" was permanently disabled for any ops line carrying a code**, with
   "Item ID already exist" shown against a code nobody had touched. Fixed with
   the `excludeId` prop, excluding by identity so two genuinely duplicated codes
   are still reported. **This was outside the `/quote-project` scope; fixed and
   flagged rather than left silent.**

Also fixed in this round: double-submit on composite unit writes (`busy` now
reaches the composer's primary action and re-entry is guarded, so a second click
cannot add two units); a dirty-state false positive for a seeded line with a
blank code, which reintroduced the spurious discard prompt round 2 removed;
focus falling to `<body>` after cancelling the first Add from the empty state;
and a Sanity `validation` rule so unsafe markup is refused at authoring time
rather than only at render.

Known gaps accepted for now: adding an opening closes without re-expanding it
(a new line has no `serverId` until autosave); the action bar's live region and
the page's can both speak on a save; and several tests assert only the negative
half of their claim (notably "Add creates nothing" never performs a save). None
of these block the A/B.

### Verification

`npm run typecheck:gate` green (53 pre-existing non-fatal errors, unchanged
before and after — the two `ParseResult` errors moved with the extracted code).
Full Playwright suite **33/33**, including the 13 new `/quote-project` tests and
the unchanged `/quote` regression tests. `npm test` **48/48**. `npm run build`
succeeds. Visual review at 1440 / 1024 / 768 / 375 confirmed: zero horizontal
overflow at every width, single row ≥1024, two-band at 768, compact card at 375,
520px right drawer on desktop with the list still visible, full-screen editor
below 1024, and no sub-44px touch target in the list.

### Not done / open

- **O1 `Confirm layout` remains inert** (`CONFIRM_LAYOUT_REASON_KEYS` is empty)
  until eng designates a reason code. The state and treatment are built.
- **Pictogram artwork is unauthored.** The pipeline is live; the content is not.
- **Undo after Duplicate keys on the local id**, unlike everything else in the
  route. A duplicate has no `serverId` until autosave, so the strip can detach
  if a rehydrate lands first. Accepted as low-risk and inherent to pre-save
  lines; revisit if it bites.
- **The desktop action bar stays live behind the drawer.** §7.5 says the drawer
  footer replaces it. The drawer's own footer is the only primary action inside
  the dialog, and the background is inert, so this is cosmetic — but it is a
  deviation.
