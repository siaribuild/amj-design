I verified the dossier's load-bearing claims against the tree. Everything below is grounded in what I read.

---

# SHARED LINE EDITOR — review, design and scaffold

**Status: nothing implemented. Awaiting your confirmation.**

---

# 1. REVIEW — what is shared today

## 1.1 The census

`ItemForm` (`src/components/ItemComposer.tsx:481`) has **7 mount points**, not 6:

| # | File:line | What it edits |
|---|---|---|
| 1 | `src/pages/ProductDetailPage.tsx:337` | opening, product locked (PDP rail) |
| 2 | `src/pages/QuotePage.tsx:412` | new opening (**/quote — out of scope**) |
| 3 | `src/components/quote-project/OpeningDrawer.tsx:275` | opening (parent) |
| 4 | `src/components/quote-project/OpeningDrawer.tsx:313` | unit (child) |
| 5 | `src/components/ItemComposer.tsx:1237` | unit, inside `CompositePanel` (**reached only through `ItemSummaryCard`**) |
| 6 | `src/ops/ProjectRecord.tsx:972` | opening (ops line editor) |
| 7 | `src/ops/ProjectRecord.tsx:1038` | unit (ops unit editor) |

`ItemSummaryCard` has **2**: `src/pages/QuotePage.tsx:380` (13 of its 15 props) and `src/pages/ProductDetailPage.tsx:326` (3 props).

So the shared surface reaches five destinations: `/quote`, `/quote-project`, the product detail page, the ops line editor and the ops unit editor. `src/ops/ProjectRecord.tsx:39` imports `../components/ItemComposer` directly — there is no ops-side copy, and the file comment says why: "reusing it is what stops the console growing a second, drifting implementation of product picking, option defaults and range checks."

## 1.2 Which sharing was deliberate

**Deliberate, and commented as such.** The exports built *for* the estimator carry explicit comments: `optionSummaryPairs`/`optionFullPairs`/`optionSummaryOf` (`ItemComposer.tsx:440-447`, `:469-470` — "Exported so the /quote-project read-only expansion shows the SAME summary… rather than reimplementing the glazing-first rule"), consumed at `QuoteProjectPage.tsx:30` and `OpeningExpansion.tsx:25`. `OpeningDrawer.tsx:30` importing `ItemForm` is the same decision in the same direction: **/quote → /quote-project**. `quoteSummary.ts`, `useProjectDocuments.ts`, `QuoteReviewSubmit.tsx` and `ProjectNameField.tsx` all carry "both arms" comments too.

*Correction to the dossier:* `StickyQuotePanel` was listed as one of those deliberate cross-arm modules. It is not — its only importer is `QuotePage.tsx:14`, and its header says nothing about the A/B. The census of commented cross-arm sharing is 4 modules, not 5.

**Not deliberate — the leak you spotted.** `src/components/ItemComposer.tsx:23`:

```ts
import { Elevation } from "./quote-project/Elevation";
```

This is the **only** module imported *inward* from `src/components/quote-project/` (verified by grep: the folder's other importers are `QuoteProjectPage.tsx` and siblings). It carries no comment. The render site's comment (`:107-114`) talks only about replacing `FrameDiagram` — it never mentions which routes will show it.

The commit is `aa40b00c` (2026-08-04), subject `fix(quote): re-resolve the current project when the identity changes`; its body says "THE EDIT FORM DREW THE OPENING TWICE… The Elevation now sits in its place." *Precision on the dossier's claim:* the body names **no arm at all**. The defensible statement is narrower and still damning — neither `aa40b00c` nor its predecessor `c398ea52` records that `DimensionsFields` is *also* `/quote`'s and the PDP's block. The propagation was a side effect of editing a shared file, not a decision.

## 1.3 What a /quote user actually sees differently

**The drawing.** `DimensionsFields` renders `<Elevation size="sm">` (`ItemComposer.tsx:115-117`). `size: "sm"` sets `dims: true` (`Elevation.tsx:60`), and the gate is `showDims = (dims ?? S.dims) && S.font > 0 && sized` (`:361-362`). A repo-wide grep for `dims={` returns **zero hits** — no caller opts out. So /quote gets the full draughting drawing: true-proportion frame and glass sections, mullions, panel count derived from width (`Elevation.tsx:347`), opening symbols (awning apex, casement V, slide arrows, louvre blades), dimension leaders with 45° witness ticks, the typed millimetre numbers haloed over the leaders in the tabular slashed-zero data face, a break-line on wide openings below 768px, and 55% opacity when a dimension is blank. It replaced a sage rectangle labelled "W" and "H".

Where it appears on /quote: the **add-item form with Dimensions open by default** (`:569-572`, so it is the first thing after picking a product), and the MyProject card after expanding it. On /quote-project the same drawing lives in a read-only expansion and in the drawer — a *less* prominent placement than the arm it was not built for.

*One correction:* the two calls are not "character-for-character identical". `OpeningExpansion.tsx:107-109` passes `parts` and `axis`; `ItemComposer.tsx:116` passes `opening`. Only `size="sm" className="w-[180px] h-[180px] max-w-full text-body"` matches — and on desktop /quote the wrapper is `md:w-44` (176px) against the expansion's 180px, so it is not even pixel-identical.

**Two more inheritances rode the same shared files, neither mentioned in any commit subject.**

*Quantity.* Commit `a13c2313` removed the Quantity section from `ItemForm` entirely (`ItemComposer.tsx:560-562`, "Read, never written… there is no control that can change it"; the tombstone is at `:366-375`). Its own body names /quote as "the legacy arm… explicitly not held to parity and was out of scope" — and then changed the form /quote renders. **/quote is now internally inconsistent: you cannot set a quantity when adding a line, but you can after it is saved** (`QtyLocationFields` survives for `ItemSummaryCard` at `:1131`). This is a capability regression on /quote, not just an inconsistency: five identical windows can no longer be added as one line in the add form.

*Colour.* Commit `f4ee2f33` — an estimator commit — introduced `--attention: #C0392B` / `--attention-ink: #96271B` in `src/styles/theme.css:98-99` and repointed five selectors /quote renders: `.quote-item-card[data-state="attention"]` (card stripe + border), `.quote-section-trigger[data-attention]`, `.quote-code-field[data-attention]`, `.quote-chip--attention`, `.quote-sticky[data-state="attention"]`. **/quote's blocked-line treatment went from amber to red.** The same commit changed /quote-only JSX: `ItemComposer.tsx:995` ("Choose a product" from `text-warning-ink` to `text-attention-ink`), `:723`, `:744`, `:819`. It left two artefacts: `Section`'s boxed variant is still `border-warning/40` (`:406`) around a `text-attention-ink` label (`:409`) — an amber border on a red-labelled section — and the comment at `:991-993` still describes "the italic amber 'Choose a product' customer action" three lines above the code that renders it red. `.disclose` and `svg[data-elevation]` are likewise shared blocks.

**Dead on arrival.** `src/components/quote-project/FamilyPictogram.tsx` has zero importers (two hits repo-wide: its own definition and a prose mention at `src/data/catalogue.ts:33`).

---

# 2. THE PROBLEM, precisely

## 2.1 The root cause, in one sentence

`ItemForm`'s type does not know **what** it is editing or **who** is editing it, so every host answers both questions again with its own combination of eight independent booleans — and the commit payload carries server-owned state, so every host has to un-write it. The prop surface is the mechanism; the payload is the damage.

Concretely: `hideProduct` and `hideOptions` are two booleans set from *one* expression at exactly one call site (`OpeningDrawer.tsx:284/288`, both `segments.length > 0`) and passed nowhere else. That is not configuration — it is one fact ("this opening is a composite") smeared across two flags that any other host can, and does, answer differently.

## 2.2 Real defects — user-visible or data-affecting

**D1 — Ops cannot fix a unit's across dimension, and the UI says the opposite.** `ItemComposer.tsx:793` hardcodes `lockedDimension={undefined}`, so the field is editable. `ProjectRecord.tsx:816-820` sends only `alongMm`. `worker/routes/ops.ts:924-935` has **no `acrossMm` parameter at any layer** (verified: the patch object is `{productSlug, options, alongMm, qtyPerParent}`). And `ProjectRecord.tsx:1035-1036` tells the reviewer the dimension "is set by the opening… and cannot be changed here". A reviewer types a correction, sees it accepted, saves, and gets no error and no change. An across mismatch is a **hard submission blocker** for the customer (`configurator.ts:237`), so this is the estimator's only repair field, and it is inert.
*Trust the verification here:* `ProjectRecord.tsx:812-815` claims the server derives the across dimension. It does not. `worker/lib/composite.ts:357-362` falls back to **what the unit already stores** — the comment says so explicitly, and it was written to kill exactly the "snap to the opening" behaviour the ops comment describes. Both comments are stale.

**D2 — The commit payload manufactures two server-owned fields.** `ItemComposer.tsx:625-631` always sets `status` and always rebuilds `review` from scratch, because it was written for new items. Exactly one of five hosts handles that correctly (`OpeningDrawer.tsx:128-142`, fifteen lines of defence); ops discards both with `built as never` (`ProjectRecord.tsx:984`, `:1045`). On the customer path `review_json` is written **wholesale** from the client (`projects.ts:469/475`), so an erased reason is erased in D1, and a priced line with no reasons resolves to `ready` (`worker/lib/lines.ts:223`) — it silently becomes submittable.

**D3 — `excludeId` is unguarded against `-1`.** `ProjectRecord.tsx:750` is `siblings.findIndex(s => s.id === line.id)`. If the line is not in the sibling set, `-1` excludes nothing, `ItemComposer.tsx:605` reports a collision, and Save is dead against a code nobody touched — the exact failure the comment at `:745-748` says the prop prevents. The whole mechanism requires a synthetic store: `const quoteLike = { items: siblings.map((s, i) => ({ id: i, code: s.code })) } as never;`.

**D4 — The ops unit editor has no `key`.** `ProjectRecord.tsx:1038` is the only mount of seven with no reseed key. `ItemForm` has no seed→state sync effect, so its 11 `useState` initialisers run exactly once; the only reseed mechanism is a remount. Segment data changing underneath that editor leaves a stale draft.

**D5 — Double-submit is live at three of four async savers.** `busy` feeds `canSave` (`:622-624`) and is passed by exactly one host (`OpeningDrawer.tsx:325`). Four hosts hand-roll `saving ? "Saving…" : X` into `submitLabel` while leaving the button enabled. `ProjectRecord.saveLine` (`:778`) and `saveUnit` (`:809`) have no re-entrancy guard, so ops is where a double-click actually fires two writes.

**D6 — A composite parent is a product to ops and not to the customer.** The drawer hides the picker and Options; ops passes neither flag, and `worker/routes/ops.ts:825` genuinely writes `product_slug`, `options_json` and `qty` on a line whose price is Σ(units) and is never computed from them. This is a live capability divergence, not a styling difference. *Trust the verification:* the "a composite parent is not a product" rule exists **only** in the drawer — on legacy /quote the card renders Product, Dimensions, Options and Quantity on a composite parent unconditionally (`:1113-1131`), and the customer PUT silently drops all but dims (`projects.ts:364-380`).

**D7 — Every manually configured line shows no price.** `ItemComposer.tsx:917` reads `pr.ok` off `{ total: number }`. Compiler-confirmed: `error TS2339: Property 'ok' does not exist`. `priceReady` is `undefined` for every non-AI line, so `priceLabel` is `"$-,--"` (`:979`) and the figure renders in `text-body`. Regression from `8ee563c2`. It affects **/quote and the PDP card**, and `src/app/App.tsx:2059` hydrates a real `lineTotal` — so it suppresses a figure that exists.

**D8 — The 10-character item-code cap is not enforced where codes are created.** `maxLength={10}` at `:722` and `:743` is passed to the shared `Input` (`src/app/ui.tsx:109-113`), which has no such prop and does not forward it. Two confirmed TS2322s. `CodeField` uses a raw input and does enforce it — so the cap holds on the legacy card and not in the composer.

**D9 — A price-fetch failure is indistinguishable from "not typed yet".** `:592` collapses any error to `{ok:false}`; `:834` renders an em-dash; Save stays disabled with no message and no retry. The only silent-failure path in the component.

**D10 — No footer at all when the product does not resolve.** Both the body (`:782`) and the whole footer (`:815`) are gated on `(p || hideProduct)`. On the PDP arm — which passes no `onCancel`, so there is no header and no Cancel either — an unresolvable `lockedSlug` renders an entirely empty `quote-panel` with no exit.

**Adjacent, real, and out of scope for this component (flagging so you know they exist):**
- `src/app/App.tsx:1874` — `quote.copy` spreads `...src`, carrying `segments` and `compositeAxis` **including the source's server segment ids**. The duplicate renders as a composite whose "Edit unit" controls PATCH the *original* opening's units. Cross-line corruption from an action that offers Undo.
- All three composite pricing calls omit `ownerUserId` (`composite.ts:241-246`, `:372-374`, `:438-440`), so `loadAccountDiscount` returns 0 — **every composite is priced at 0% account discount** while plain lines get the owner's.
- `worker/routes/projects.ts:382` compares the `edited_fields` *string*, so a second edit to an already-locked field group on an AI-managed line is silently discarded.

## 2.3 Untidy, but not defects

Two product pickers with divergent selection semantics (`:331` vs `:752-775`); three copies of "Enter the opening size"; two note fields; two code editors; two issue pipelines; the dead `Section` variant ternary at `:415` (both arms identical); "Item ID already exist" (`:723`, `:744`, `:975`); `unitAxis` passed by three callers and read by nobody; `unitMode` passed by nobody; `ItemSummaryCard.initialFocus` passed by nobody; `initialSection` advertising a `"qty"` section that does not exist; six different `key` recipes.

These cost future time. They are not what is breaking now, and I have not let them drive the design.

## 2.4 Why the safety net does not catch any of this

`scripts/typecheck.mjs` is **code-scoped, not file-scoped** — no file is excluded. `FATAL` is 8 codes (TS2304, TS2552, TS2305, TS2307, TS2554, TS2555, TS2551, TS2448, TS2454). I ran the full check: **53 errors, of which 20 are TS2322 and 26 are TS2339** — neither gated. So D7 and D8 ship through a green `npm test`, and so would a half-migrated prop rename.

`npm test` bundles exactly one module from `src/components/` (`rowState.ts`, via the esbuild shim at `scripts/tests/unit.test.mjs:29`). There is no jsdom, no RTL, no component test. `npm run test:web` is **not part of `npm test`** — it is only in `test:all`. `quote-project.spec.ts` is 24 tests and does cover the drawer well. `ops.spec.ts` is **4 tests and none of them opens a line editor**.

---

# 3. THE DESIGN

## 3.1 Which design won, and what I grafted

**Winner: the capability model** (22/30 across the three lenses; minimal-refactor 20, composition 19). It is the only one of the three that makes the *cause* of divergence unrepresentable rather than merely fixed once: one derivation from `(what record, who is looking, what the save path can write)` instead of eight booleans each host answers independently.

I have grafted five things into it, four of them from the judges' explicit "one thing" verdicts:

1. **From minimal-refactor (correctness):** *uncomposed fields pass the seed value through, never blank.* The capability design's `LineEdit` would have let a composite parent commit `productSlug: ""` into the ops route, which writes it. **Capabilities govern rendering, tracking and validation — never what is committed.**
2. **From composition:** *a `useLineDraft` hook plus genuinely composable field blocks*, so ops's configuration select is a sibling component rather than an untyped `ReactNode` slot; and the named `PriceState` union with a distinct `failed` state and `retry`, which fixes D9.
3. **From the capability model's own correctness judgement:** *the review channel is a discriminated union keyed on the write contract.* Under `review: "explicit"` (ops) the payload carries **no resolved-key list at all**, so the violation of `worker/routes/ops.ts:712-715` ("an estimator changing qty must not silently mark a substitution line ready") becomes a compile error rather than a migration-step mistake.
4. **From the capability model's drift judgement:** *an `adapters/` directory* — one named adapter per persistence path, owning both its `WriteContract` and its `LineEdit → payload` builder, so `accepts` cannot silently disagree with what the route physically takes.
5. **Mine:** *`onCommit` may return a promise, and the editor owns in-flight state.* This makes D5 structurally impossible for async hosts instead of relying on every host remembering `busy`.

I rejected composition's `fields: LineField[]` array outright — it relocates the mode switch into a hand-maintained list per host with nothing checking it against the JSX, which is D6's mechanism reinvented.

## 3.2 The boundary

**Inside:** draft state for every field; catalogue reads; the field blocks; the disclosure shell; the dirty diff; the debounced price preview through an injected probe; issue derivation and save gating; the along/across projection; the built value.

**Outside, permanently:**

- **Persistence.** Four disciplines, one of which is not a network call at all (`OpeningDrawer.saveParent` writes to React state and lets a 600ms debounce snapshot the whole project, swallowing errors at `App.tsx:2067`). The customer request is the entire line array plus `removedIds` (`projects.ts:300-336`) — "save my line" is not a coherent request on that path.
- **Concurrency.** Customer: project-scoped `quote_edit_version` + mutation token, 409 `project_changed_reload_required`. Ops: line-scoped `edit_version` **and** project version, 409 `line_changed_reload_required`. Segment PATCH: **no precondition on either path**. Neither client sends a version token, so there is nothing version-shaped for the editor to hold.
- **Focus, scroll, announcements, dialog semantics.** `OpeningDrawer.tsx:186` deliberately disables Radix's focus restore because `QuoteProjectPage.tsx:141-163` re-resolves the row by `serverId` after the rehydrate.
- **The discard guard.** The shell never renders a header, never renders a dismiss, never raises a confirm — it reports `dirty`. Today `hideHeader` transfers the guard silently with no compile error (`ItemComposer.tsx:686`).
- **Split / merge / add unit / remove unit.** Ops-only by your decision (`ops.ts:615-618`); the customer routes were deleted at six layers.
- **The ops variant lifecycle** and **editability** (`ProjectRecord.tsx:161` folds in revision-viewing and contract-superseding, which have no customer analogue).
- **Quantity authoring.** No control exists; qty is seed-in, draft-out.

## 3.3 Public API

```ts
// ═══════════════════════════════════════════════════════════════════════════
// src/components/line-editor/types.ts
// ═══════════════════════════════════════════════════════════════════════════

/** WHAT is on screen. A fact about the record, never about the screen.
 *
 *  Replaces `scope` + `hideProduct` + `hideOptions` + `lockedSlug`. Those four
 *  were never independent: OpeningDrawer.tsx:284/288 sets two of them from ONE
 *  expression and passes them at no other call site, which is precisely why ops
 *  shows staff a product picker on a composite parent (worker/routes/ops.ts:825
 *  then writes product_slug on a line whose price is Σ(units)).
 *
 *   • opening              a plain schedule line; the user picks the product.
 *   • fixedProductOpening  the product is pre-determined by the host (the PDP).
 *   • compositeParent      an opening BUILT FROM joined units. Not a frame: its
 *                          glazing and hardware live one level down and its
 *                          price is Σ(units), computed server-side
 *                          (worker/lib/composite.ts:19-21).
 *   • unit                 one frame inside a composite opening. */
export type EditorSubject =
  | { kind: "opening" }
  | { kind: "fixedProductOpening"; productSlug: string }
  | { kind: "compositeParent"; unitCount: number; axis: CompositeAxis }
  | { kind: "unit"; axis: CompositeAxis; index: number };

export type CompositeAxis = "vertical" | "horizontal";

/** WHO is editing. Not a styling variant — it changes the trust model (a
 *  customer unit edit degrades the parent to technical_review,
 *  worker/routes/projects.ts:167-190; an ops edit is the thing that CLEARS
 *  flags, worker/routes/ops.ts:716-722) and it changes where the live price is
 *  computed (a staff member has no "current project"; the customer preview 403s
 *  for them, and that 403 currently ENABLES Save with no figure). */
export type Actor = "customer" | "ops";

/** Create-or-edit as a TYPE, not "is `seed` truthy" (ItemComposer.tsx:680, 704).
 *
 *  Two subjects are absent from `create` permanently: a composite is MADE by a
 *  split and only ops can split; and the unit COUNT is the split decision, so
 *  the customer's add/remove routes were deleted (projects.ts:200-205). This is
 *  what makes ItemForm's `unitMode: "add"` — passed by nobody, reachable by
 *  nothing — unrepresentable rather than merely unused. */
export type EditorTarget =
  | { mode: "create";
      subject: { kind: "opening" } | { kind: "fixedProductOpening"; productSlug: string };
      /** "Add another like this" (ProductDetailPage.tsx:329) carries options + note. */
      prefill?: Partial<LineDraftValue>; }
  | { mode: "edit";
      subject: EditorSubject;
      /** Mandatory. An edit with no baseline is what makes the dirty diff a
       *  guess (today's blank-form heuristic, ItemComposer.tsx:682). */
      record: LineDraftValue; };

/** Every value the editor may hold. Deliberately NOT `QItem`: no serverId, no
 *  origin, no aiPriced, no lineTotal, no segments, no compositeAxis, no
 *  coverage — and, critically, no `status` and no `review`.
 *
 *  ItemForm's `built` (ItemComposer.tsx:625-631) manufactures status and review
 *  on every commit. Spreading it into an existing line erases every review
 *  reason the form never saw — glazing, substitute, material, thermal,
 *  customerCompositeChanged — including error-severity reasons the customer
 *  never addressed. An editor that cannot express them cannot corrupt them. */
export interface LineDraftValue {
  /** "" for a unit — one opening, one architect tag
   *  (worker/lib/composite.ts:9-21; segments insert external_ref NULL). */
  code: string;
  productSlug: string;
  width: string;   // mm, string while editing
  height: string;
  options: Record<string, string>;
  /** Free text. "Note is a note — it may serve for location, it may serve for
   *  anything else that is notable" (owner). Hosts map it to their own storage
   *  name: QItem.location / quote_line.room_label / OpsLine.room. Present on
   *  openings AND units. See §7 Q1 — the segment write path does not exist yet. */
  note: string;
  /** Pass-through. There is no quantity control (ItemComposer.tsx:366-375,
   *  owner: "one opening per reference"). */
  qty: number;
}

export type DraftField = keyof LineDraftValue;

/** Three states, and read-only MUST say why. A greyed field with no stated
 *  reason is how ProjectRecord.tsx:1035-1036 came to describe a lock that
 *  ItemComposer.tsx:793 removed. */
export type FieldAccess =
  | { state: "absent" }
  | { state: "readOnly"; reason: string }
  | { state: "editable" };

/** Every state the live figure can be in, named. Today `failed` and `idle` are
 *  the same em-dash (ItemComposer.tsx:592, :834): a network error is
 *  indistinguishable from "nothing entered yet", Save stays dead, no retry. */
export type PriceState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "priced"; total: number; unit: number }
  /** No project exists yet (403 → needsProject, src/data/api.ts:141). The save
   *  itself mints the claim cookie, so this SATISFIES the price gate. */
  | { status: "deferred" }
  | { status: "failed" }
  /** A composite parent. Σ(units), server-side — never previewable from the
   *  parent's own slug (worker/routes/ops.ts:787-797 records the regression: a
   *  $5,400 opening rewritten to $1,840 by a qty edit). */
  | { status: "notApplicable" };

export type PriceProbe = (spec: Readonly<Pick<LineDraftValue,
  "productSlug" | "width" | "height" | "options" | "qty">>)
  => Promise<{ ok: boolean; total: number | null; needsProject?: boolean }>;

/** A sibling, for the duplicate-code check and the code suggestion. A string
 *  key, not a numeric index: ProjectRecord.tsx:749-750 currently synthesises
 *  `{items: siblings.map((s,i) => ({id:i, code:s.code}))} as never` and passes
 *  `findIndex(...)`, which returns -1 when the line is absent from its own
 *  sibling set — and -1 excludes nothing, so the form disables its own Save
 *  against an untouched code. */
export interface SiblingLine { readonly key: string; readonly code: string }

export interface LineIssue {
  readonly field: "dims" | "options" | "code";
  readonly message: string;
}

/** Instruction for a host that MERGES the review map. Not a key list: it also
 *  encodes the unconditional clear-then-reset of `fit` that
 *  OpeningDrawer.tsx:139-142 performs by hand. */
export interface ReviewPatch {
  readonly clear: readonly string[];
  readonly set: Readonly<Record<string, string>>;
}

/** How review resolution leaves the editor. A DISCRIMINATED UNION, keyed on the
 *  host's write contract, because the two paths have opposite trust models:
 *
 *   • "merge"    the client sends the merged map and omitting a key RESOLVES it
 *                (worker/routes/projects.ts:469/475).
 *   • "explicit" the body's review is IGNORED entirely; reasons clear only
 *                through an audited resolveReview signal, and clearing them as
 *                a side effect of an edit is exactly what ops.ts:712-715
 *                forbids. So this variant carries NO key list — an ops host
 *                cannot derive a resolution from which fields moved, because
 *                the type gives it nothing to derive from.
 *   • "none"     a create; there is no prior review to preserve. */
export type ReviewOutcome =
  | { channel: "merge"; patch: ReviewPatch }
  | { channel: "explicit"; fit: string | null }
  | { channel: "none"; fit: string | null };

/** What onCommit hands back. */
export interface LineEdit {
  readonly target: EditorTarget;
  /** The COMPLETE value. Fields the capabilities marked `absent` carry the
   *  seed's value verbatim — they are never blanked. This is the rule that
   *  stops a composite parent committing productSlug:"" into
   *  worker/routes/ops.ts:825, which writes it. */
  readonly value: LineDraftValue;
  /** Only fields that are `editable` AND in `writes.accepts` AND actually
   *  moved. A field the editor never showed can never appear here. */
  readonly changed: Readonly<Partial<LineDraftValue>>;
  readonly review: ReviewOutcome;
  readonly derived: {
    /** Above the product's minimum but outside its range: real, buildable,
     *  priced best-fit, submittable, flagged. Undersize is not here — it
     *  BLOCKS, through the save gates. */
    readonly oversize: boolean;
    readonly previewTotal: number | null;
  };
}
```

```ts
// ═══════════════════════════════════════════════════════════════════════════
// src/components/line-editor/capabilities.ts
// ═══════════════════════════════════════════════════════════════════════════

/** What the HOST's save path can physically persist. It can only ever NARROW
 *  the policy answer, never widen it.
 *
 *  This exists because of D1: ops renders the unit's across-axis field
 *  editable, tells the reviewer it "cannot be changed here", and then does not
 *  send it — the route has no such parameter. Under this contract that
 *  combination cannot be built: a field the adapter cannot write renders
 *  read-only WITH ITS REASON, or it does not render.
 *
 *  NEVER hand-authored at a call site. Every value is exported by an adapter in
 *  ./adapters, colocated with the payload builder that must agree with it. */
export interface WriteContract {
  /** For dev warnings and for the read-only reason string.
   *  e.g. "PATCH /api/ops/segments/:id". */
  readonly label: string;
  readonly accepts: ReadonlySet<DraftField>;
  readonly review: ReviewOutcome["channel"];
}

export interface EditorCapabilities {
  readonly subject: EditorSubject;
  readonly actor: Actor;
  readonly mode: "create" | "edit";

  readonly identity: {
    readonly access: FieldAccess;
    /** False for a unit: it carries no external_ref at all. */
    readonly uniqueAmongSiblings: boolean;
    /** ENFORCED on the input. Today maxLength={10} is passed to a shared Input
     *  that has no such prop and drops it (TS2322 at ItemComposer.tsx:722 and
     *  :743), so the cap holds on the legacy card and not on the surface that
     *  creates codes. */
    readonly maxLength: 10;
    readonly suggest: boolean;
  };

  readonly product: {
    readonly access: FieldAccess;
    readonly presentation: "picker" | "identityCard";
    readonly fixedSlug: string | null;
  };

  readonly dimensions: {
    readonly width: FieldAccess;
    readonly height: FieldAccess;
    /** Range and undersize checks come FROM a product. A composite parent has
     *  none, so it has no range to be outside of — today `hideProduct` drops
     *  !tooSmall from canSave (:622-624) while DimensionsFields still renders
     *  the undersize notice from the seeded slug (:140-145). */
    readonly enforceRange: boolean;
    /** Which of width/height runs ALONG the join; null for anything but a unit.
     *  This is what `unitAxis` was supposed to be — today it is destructured
     *  (:483), typed (:524), passed by three call sites and read by nothing. */
    readonly alongAxis: "width" | "height" | null;
    /** Draw a plain opening rather than a product elevation. */
    readonly drawAsOpening: boolean;
  };

  readonly options: {
    readonly access: FieldAccess;
    /** Must follow `access`: a hidden group that still gates Save is an
     *  invisibly disabled button (the reason ItemComposer.tsx:646-649 exists). */
    readonly enforceRequired: boolean;
  };

  readonly note: { readonly access: FieldAccess };
  readonly quantity: { readonly access: FieldAccess };
  readonly price: { readonly source: "preview" | "derivedFromUnits" };

  readonly commit: {
    /** Exactly `editable ∩ writes.accepts`. */
    readonly writable: ReadonlySet<DraftField>;
    readonly review: ReviewOutcome["channel"];
    readonly gates: readonly SaveGate[];
  };

  /** Every place THIS instance's answer differs by ACTOR rather than by
   *  SUBJECT. Rendered in dev tools and asserted in tests. */
  readonly divergences: readonly ActorDivergenceId[];
}

export type SaveGate =
  | "dimensionsEntered"
  | "priceResolved"      // priced, or deferred (no project yet)
  | "notUndersize"
  | "codeUnique"
  | "hostReady";         // the host's own predicate — see saveGuard

/** The ONLY sanctioned reasons the derivation may branch on `actor`. Adding a
 *  member is a reviewable act: a unit test asserts this array's exact contents,
 *  so growing it requires editing a test and shows up in review. Starts at two,
 *  both forced by the server. If it reaches five, the model has failed and the
 *  honest response is explicit per-host overrides, not a longer switch. */
export type ActorDivergenceId = "priceContext" | "reviewResolution";
export const ACTOR_DIVERGENCES: readonly ActorDivergenceId[] =
  ["priceContext", "reviewResolution"] as const;

/** Pure, total, memoisable. No React, no catalogue, no network — so it unit
 *  tests through the existing esbuild shim (scripts/tests/unit.test.mjs:29
 *  already reaches into src/components/quote-project/rowState.ts this way). */
export function capabilitiesFor(
  target: EditorTarget, actor: Actor, writes: WriteContract,
): EditorCapabilities;

/** The along/across projection, in ONE place. Today it is hand-written at three
 *  savers (OpeningDrawer.tsx:161-165, ItemComposer.tsx:1174-1178,
 *  ProjectRecord.tsx:819) and two of them omit acrossMm. */
export function unitDimensions(
  subject: Extract<EditorSubject, { kind: "unit" }>, value: LineDraftValue,
): { alongMm: number; acrossMm: number };
```

```ts
// ═══════════════════════════════════════════════════════════════════════════
// src/components/line-editor/useLineDraft.ts  — the state core, renders nothing
// ═══════════════════════════════════════════════════════════════════════════

export interface LineDraftConfig {
  target: EditorTarget;
  actor: Actor;
  writes: WriteContract;
  /** Every line the code must not collide with, INCLUDING this one. */
  siblings?: readonly SiblingLine[];
  /** This record's key in `siblings`, excluded from its own check by IDENTITY. */
  selfKey?: string;
  /** REQUIRED, no default. The customer preview is not a safe fallback for ops:
   *  it 403s for staff, and the 403 becomes `needsProject`, which SATISFIES the
   *  price gate — so a wrong default yields an enabled Save with no figure. */
  price: PriceProbe;
  /** Changing this discards the draft and re-reads the target. Replaces the ad
   *  hoc `key` discipline: six recipes across seven mounts, one of which
   *  (ProjectRecord.tsx:1038) has none at all. */
  resetKey: string;
  /** Which group starts open. Unlike today's initialiser-only prop, changing it
   *  re-targets a mounted draft, so "Fix details" no longer needs a remount.
   *  The old `"qty"` member is gone — there is no qty section, and passing it
   *  silently opened dims. */
  openSection?: "dimensions" | "options";
  /** A host predicate over the LIVE draft. Ops needs it: its third pre-save
   *  guard is `chosen.productSlug !== value.productSlug`
   *  (ProjectRecord.tsx:791), which cannot be expressed as a static string.
   *  A non-null return fails the `hostReady` gate and renders above Save.
   *  Today all three ops guards fire AFTER the click, into a record banner. */
  saveGuard?: (value: LineDraftValue) => string | null;
}

export interface FieldControl<T> { readonly value: T; readonly set: (next: T) => void }

export interface LineDraft {
  readonly capabilities: EditorCapabilities;
  /** Resolved catalogue product, or null — a legitimate steady state for a
   *  composite parent and for a blank add form. */
  readonly product: Product | null;

  readonly code: FieldControl<string> & { readonly edited: boolean; readonly duplicate: boolean };
  readonly family: FieldControl<string>;
  readonly productSlug: FieldControl<string>;
  readonly width: FieldControl<string>;
  readonly height: FieldControl<string>;
  readonly note: FieldControl<string>;
  readonly options: {
    readonly value: Record<string, string>;
    readonly set: (typeSlug: string, choice: string) => void;
  };
  readonly qty: number;

  readonly sections: {
    readonly isOpen: (id: "dimensions" | "options") => boolean;
    readonly toggle: (id: "dimensions" | "options") => void;
  };

  /** Only for fields the capabilities made visible. */
  readonly issues: readonly LineIssue[];
  readonly hasIssue: (field: LineIssue["field"]) => boolean;

  readonly price: PriceState;
  /** The only way out of PriceState "failed". */
  readonly retryPrice: () => void;

  /** Differs from the target's record. Baseline derives from the same resolved
   *  initial object the controls were seeded with — one object, not two
   *  mirrored expressions (ItemComposer.tsx:670-676 vs :551-563, the single
   *  most fragile coupling in the current file). */
  readonly dirty: boolean;

  /** Every reason commit is refused, most severe first. Empty ⇒ committable.
   *  Exposed as DATA — today the button is simply dead with no explanation. */
  readonly blockers: readonly string[];
  readonly canCommit: boolean;
  /** True while an async onCommit's promise is pending. */
  readonly committing: boolean;

  /** Pure. Safe to call in a click handler. */
  readonly build: () => LineEdit;
}

export function useLineDraft(config: LineDraftConfig): LineDraft;
```

```ts
// ═══════════════════════════════════════════════════════════════════════════
// src/components/line-editor/shell + fields + presets
// ═══════════════════════════════════════════════════════════════════════════

/** Available width, nothing else. It must NOT re-acquire the footer-stickiness
 *  meaning that ItemComposer.tsx:813-814 deliberately decoupled. */
export type LineEditorDensity = "narrow" | "wide";

/** Field-block wrapper. Provides draft + density by context, so each field
 *  component takes no props. Renders NO header and NO dismiss: the host owns
 *  its chrome and its discard guard, always and unconditionally. */
export function LineEditorBody(p: {
  draft: LineDraft; density?: LineEditorDensity; children: React.ReactNode;
}): JSX.Element;

/** The collapsible section shell — today's private `Section`, made public, with
 *  the dead variant ternary (:415, both arms identical) dropped. `attention`
 *  derives from draft.hasIssue. */
export function LineEditorSection(p: {
  id: "dimensions" | "options"; label: string; summary?: string; children: React.ReactNode;
}): JSX.Element;

/** Price + blockers + actions. ALWAYS renders — today the footer is gated on
 *  `(p || hideProduct)` (:815), so an unresolvable product on the PDP arm (no
 *  onCancel, so no header either) produces an empty panel with no way out.
 *
 *  `onCommit` MAY return a promise; while it is pending the primary is disabled
 *  and shows `busyLabel`. That makes double-submit structurally impossible
 *  rather than dependent on each host remembering `busy` — today three of four
 *  async savers render a busy label on a live button, and ops has no
 *  re-entrancy guard at ProjectRecord.tsx:778 or :809. */
export function LineEditorFooter(p: {
  draft: LineDraft;
  submitLabel: string;
  busyLabel?: string;                       // default "Saving…"
  /** Host-level busy (ops disables every line control during a workflow
   *  action). ORed with the draft's own in-flight state. */
  busy?: boolean;
  /** Sticky at every width, for a host that is its own scroll container.
   *  Default false = sticky below md, static from md up — the footer is sticky
   *  on mobile either way. */
  sticky?: boolean;
  onCommit: (edit: LineEdit) => void | Promise<void>;
  /** Omit for a surface with no dismiss (the PDP has none by design). */
  onCancel?: () => void;
  /** Between the price and the actions — ops's "I checked and resolved". */
  aside?: React.ReactNode;
}): JSX.Element;

/** Field blocks. Each takes NO props: everything comes from context, and each
 *  renders `absent` / `readOnly` / `editable` from its own capability slot. */
export function LineCodeField(): JSX.Element;
export function LineProductField(): JSX.Element;
export function LineDimensionFields(): JSX.Element;   // + range/swap/undersize notices
export function LineElevation(): JSX.Element;         // the live drawing
export function LineNoteField(): JSX.Element;         // openings AND units
export function LineOptionFields(): JSX.Element;

/** Presets. STANDING RULE: a preset may never grow a boolean prop. The moment
 *  one does, it is ItemForm again. Hosts that need anything else compose the
 *  field blocks directly — that is what ops does. */
export function OpeningEditor(p: PresetProps): JSX.Element;
export function UnitEditor(p: PresetProps): JSX.Element;
```

```ts
// ═══════════════════════════════════════════════════════════════════════════
// src/components/line-editor/adapters/*  — one per persistence path
//
// Each adapter owns BOTH its WriteContract and its LineEdit → payload builder,
// so `accepts` cannot silently disagree with what the route physically takes.
// Today that disagreement is exactly D1: the field is offered, the value is
// discarded, and the caption explains a lock that does not exist.
// ═══════════════════════════════════════════════════════════════════════════

/** quote.update / quote.add — local store + debounced snapshot PUT. review:"merge". */
export const customerStoreWrites: WriteContract;
export function toStorePatch(edit: LineEdit): Partial<QItem>;
/** The ADD path. Owns the status/review derivation the editor deliberately
 *  dropped, so the three add hosts do not each re-derive it. QItem.status is
 *  non-optional (src/data/configurator.ts:26). */
export function toNewQItem(edit: LineEdit): Omit<QItem, "id">;

/** PATCH /api/projects/current/segments/:id. Accepts acrossMm. review:"merge". */
export const customerSegmentWrites: WriteContract;
export function toCustomerSegmentPatch(edit: LineEdit): SegmentPatch;

/** PATCH /api/ops/lines/:id. review:"explicit". */
export const opsLineWrites: WriteContract;
export function toOpsLinePatch(edit: LineEdit): OpsLinePatch;

/** PATCH /api/ops/segments/:id. Does NOT accept acrossMm today (§7 Q4).
 *  review:"explicit". */
export const opsSegmentWrites: WriteContract;
export function toOpsSegmentPatch(edit: LineEdit): OpsSegmentPatch;
```

## 3.4 The legal state space

4 subjects × 2 modes = 8, minus `compositeParent+create` and `unit+create` (unrepresentable) = 6; × 2 actors = 12, minus `fixedProductOpening × ops` (2, unused) = **10 legal states**, from 2⁸ nominal combinations today. Combinations that become impossible, several of which are live:

| Live today | Under the model |
|---|---|
| `heading` + `hideHeader` (drawer discards the heading) | no header exists at all |
| `hideProduct` + a seeded `productSlug` → undersize notice the footer ignores | `enforceRange: false`; a parent has no product |
| async saver without `busy` → double write in ops | promise-aware footer |
| no `key` + changing seed (ops unit) | `resetKey` required |
| ops derives a review resolution from which fields moved | `"explicit"` carries no key list |
| composite parent commits `productSlug: ""` | uncomposed fields emit the seed value |
| a field offered but not writable (ops across-axis) | `readOnly` with a mandatory reason |
| `initialSection="qty"` → silently opens dims | member dropped |

---

# 4. THE SCAFFOLD

**Nothing is implemented. This is the file list only.**

## New — `src/components/line-editor/`

| File | Purpose |
|---|---|
| `index.ts` | Public barrel — the only import path hosts use |
| `types.ts` | `EditorSubject`, `Actor`, `EditorTarget`, `LineDraftValue`, `LineEdit`, `ReviewOutcome`, `PriceState`, `SiblingLine`, `LineIssue` |
| `capabilities.ts` | `WriteContract`, `FieldAccess`, `EditorCapabilities`, `capabilitiesFor`, `ACTOR_DIVERGENCES`, `unitDimensions` — pure |
| `useLineDraft.ts` | Draft state, resetKey reseed, dirty diff, blockers, in-flight commit, `build()` |
| `usePricePreview.ts` | Debounced probe, stale-response guard, the `PriceState` machine, retry |
| `validation.ts` | Issues over the *visible* field set; the single "Enter the opening size" string (three copies today) |
| `identity.ts` | `normCode` / `suggestCodeFrom(codes: string[])` / duplicate detection over `SiblingLine[]` |
| `review.ts` | `ReviewPatch` construction + `applyReviewPatch(prev, patch)` — the merge-channel helper |
| `LineEditorBody.tsx` | Field wrapper + draft/density context. No header, no dismiss, ever |
| `LineEditorSection.tsx` | The disclosure shell (today's private `Section`) |
| `LineEditorFooter.tsx` | Price + blockers + actions; promise-aware primary |
| `fields/LineCodeField.tsx` | Item ID with the 10-char cap actually enforced and `htmlFor` pairing |
| `fields/LineProductField.tsx` | Type→Product pair, or the read-only identity card |
| `fields/LineDimensionFields.tsx` | Width/height, range copy, Swap notice, undersize notice |
| `fields/LineElevation.tsx` | The live drawing, sized for the current density |
| `fields/LineNoteField.tsx` | The note — openings **and** units |
| `fields/LineOptionFields.tsx` | Capability wrapper + **the lifted `OptionGroups`** (see below) |
| `presets/OpeningEditor.tsx` | Parent composition |
| `presets/UnitEditor.tsx` | Child composition |
| `adapters/customerStore.ts` | `WriteContract` + `toStorePatch` + `toNewQItem` |
| `adapters/customerSegment.ts` | `WriteContract` + `toCustomerSegmentPatch` |
| `adapters/opsLine.ts` | `WriteContract` + `toOpsLinePatch` |
| `adapters/opsSegment.ts` | `WriteContract` + `toOpsSegmentPatch` |

## New — tests and gate

| File | Purpose |
|---|---|
| `scripts/tests/line-editor.test.mjs` | node:test over `capabilities.ts` / `validation.ts` / `identity.ts` / `review.ts` via the existing esbuild shim |
| `scripts/typecheck-scoped.mjs` | **File-scoped ratchet** — asserts *zero* tsc errors under a named path list, so TS2322/TS2741 are blocking for the new module and every migrated call site without touching the 53-error global backlog |

## Modified

| File | Change |
|---|---|
| `scripts/tests/web/ops.spec.ts` | **Add line-editor + unit-editor coverage before ops migrates** (it has 4 tests today, none of which opens either) |
| `package.json` | `test` gains `typecheck:scoped` and `test:line-editor` |
| `src/components/ItemComposer.tsx` | **One import line**: `OptionGroups` from the new module, replacing the local `OptionsFields`/`GlazingChoices`/`ColourChoices`/`OptionButton`/`StarRating`. I verified these five take only catalogue-shaped props (`{p, options, setOpt}` / `{choices, value, onPick}`) — no host flags — so the lift is mechanical. **Nothing else in this file changes.** |
| `src/components/quote-project/OpeningDrawer.tsx` | Both mounts → `useLineDraft` + presets; `saveParent`'s 15-line review dance → `applyReviewPatch` |
| `src/ops/ProjectRecord.tsx` | Both mounts; delete `quoteLike ... as never` and `selfIndex`; both `built as never` casts; `saveGuard`; the missing `resetKey`; correct the false caption at `:1035-1036` |
| `src/pages/ProductDetailPage.tsx` | The rail form only; `handleAdded` uses `toNewQItem` |
| `src/data/configurator.ts` | Add `suggestCodeFrom(codes: readonly string[], slug)`; `suggestCode` delegates (no caller changes) |

## Modified — worker, **only if you approve §7 Q1 option (a)**

| File | Change |
|---|---|
| `worker/lib/composite.ts` | `updateSegment` patch gains `note`; its UPDATE writes `room_label`. Verified: the column already exists — both segment INSERTs (`:253`, `:446`) bind it as a literal `NULL`. **No migration.** |
| `worker/routes/projects.ts` | Segment PATCH accepts `note`; the segment SELECT (`:77`) and `ApiSegment` return it |
| `worker/routes/ops.ts` | Segment PATCH accepts `note` |
| `src/data/api.ts`, `src/ops/api.ts` | Segment patch types gain `note` |
| `scripts/tests/composite.test.mjs` | Round-trip a unit note through both routes |

## Explicitly NOT touched

`src/pages/QuotePage.tsx` — **zero changes**. `ItemForm` keeps its full prop surface, so /quote compiles and behaves identically. · `ItemSummaryCard` and `CompositePanel` — no changes beyond the one lifted import. · `src/components/quote-project/Elevation.tsx` — imported, not moved (§7 Q7). · `src/styles/theme.css` — no changes (§7 Q8 decides whether any are wanted). · `StickyQuotePanel`, `QuoteReviewSubmit`, `quoteSummary.ts`, `useProjectDocuments.ts` · every other worker route · the AI pipeline, the thermal module, the schedule parser.

**The cost I am accepting deliberately, stated plainly:** `DimensionsFields`, `Section`, `ProductPicker` and `CodeField` stay in `ItemComposer.tsx` for /quote *and* are reimplemented in the new module. That is a fork of ~200 lines for as long as `/quote` and the PDP card live. I am not lifting them because they carry the legacy calling convention (`variant="row"`, `lockedDimension`, `setLocation`, `rail`, `opening`) — lifting them would import the legacy shape into the new module, which is the tail wagging the dog, and there are no component tests to prove "zero visual diff". The option layer *is* lifted because it is where the active work is (`feat/glazing-thermal`) and because it is genuinely clean. Q9 bounds how long the fork lives.

---

# 5. MIGRATION

Every step is independently shippable and independently revertible. The gate after each is stated.

**Step 0 — the ratchet, before anything else.** Land `scripts/typecheck-scoped.mjs` and wire it into `npm test`, with the path list starting empty. Fix `pr.ok` (D7) and `Input.maxLength` (D8) so `src/components/ItemComposer.tsx` can be added to the list. *Why first:* without this the entire strategy is unverified — the gate is 8 codes and the two errors these fixes remove are TS2339 and TS2322, exactly the codes a migration produces.
**Verify:** `npm test` · `npm run typecheck` shows 50 errors, not 53 · every non-AI line on /quote and the PDP card shows its real price again.

**Step 1 — the module, wired to nothing.** All of `src/components/line-editor/**` plus `scripts/tests/line-editor.test.mjs`. Add the module's path to the ratchet. The one `ItemComposer.tsx` import swap for `OptionGroups`.
**Verify:** `npm test` (now includes `test:line-editor` and the scoped ratchet) · `npm run build` · `npx playwright test scripts/tests/web/quote-project.spec.ts scripts/tests/web/customer.spec.ts` — the option layer is shared from this point, so the glazing picker must be identical on /quote, the PDP and the drawer. Tests assert: all 10 legal states; `writes` can only narrow; a unit's capabilities never make identity editable; `ACTOR_DIVERGENCES.length === 2`; a seeded draft is not dirty on open (including the "seeded line with a blank code takes a suggested one" case); `build()` emits seed values for `absent` fields.

**Step 2 — ops coverage, before ops changes.** Extend `scripts/tests/web/ops.spec.ts`: open a line editor, edit dims, save, assert the row; open a unit editor, edit, save, assert the parent total re-derives; assert a double-click on Save fires one request.
**Verify:** `npx playwright test scripts/tests/web/ops.spec.ts` — green against the **current** code. This is the only step whose value is entirely in what it catches later.

**Step 3 — ops unit editor** (`ProjectRecord.tsx:1038`). Smallest surface, internal, and the one whose derivation immediately repairs D1 and D4. `subject: {kind:"unit", axis, index}`, `actor:"ops"`, `writes: opsSegmentWrites`, `resetKey: sg.id`. `saveUnit` calls `toOpsSegmentPatch`. Delete the false caption at `:1033-1036` — the field now states its own reason. Drop the dead `unitAxis` pass-in.
**Verify:** `npm test` · `npx playwright test scripts/tests/web/ops.spec.ts` · the payload is byte-identical to today's unless Q4 says otherwise · the reviewer can no longer type an across value that vanishes.

**Step 4 — ops line editor** (`ProjectRecord.tsx:972`). `subject` is `opening` or `compositeParent` by `line.lineKind` — which is where Q3 lands in code. The configuration select and resolve checkbox stay as composed siblings; the three pre-save guards become `saveGuard`, gating the button instead of firing after the click. `quoteLike ... as never`, `selfIndex` and both `built as never` casts are deleted. `busy` is finally honoured.
**Verify:** `npm test` (ratchet now covers `ProjectRecord.tsx`, so the deleted casts cannot be re-introduced silently) · `npx playwright test scripts/tests/web/ops.spec.ts` · manual: a plain line; an AI-managed line with a configuration selected; a composite parent; a stale save still shows the 409 banner.

**Step 5 — drawer unit** (`OpeningDrawer.tsx:313`). The best-behaved host: it already passes `busy`, `onDirtyChange`, `hideHeader` and `stickyActions` and already owns its guard, announcement and level machine. `writes: customerSegmentWrites` — which accepts `acrossMm`, so `unitDimensions()` replaces the hand projection at `:161-165` unchanged. **The note field appears here only if Q1 landed.**
**Verify:** `npx playwright test scripts/tests/web/quote-project.spec.ts` — specifically "the customer may change what a unit IS, but not how many there are" (`:232`), "the drawer behaves as a dialog: Escape steps back, then closes, and focus returns" (`:377`), "a shortfall accuses the opening; a wrong-across unit accuses itself" (`:756`).

**Step 6 — drawer parent** (`OpeningDrawer.tsx:275`). `hideOptions`/`hideProduct`/`heading`/`initialSection` collapse into `subject` + `openSection`. `saveParent`'s review loop becomes `applyReviewPatch(item.review, edit.review.patch)`; its whitelist becomes `edit.changed`, now enforced by the type rather than by a comment.
**Verify:** `npx playwright test scripts/tests/web/quote-project.spec.ts` — "saving from the drawer keeps the same opening expanded and restores focus" (`:172`), "Add opening creates nothing until an explicit save" (`:216`), "a composite parent hides Options" (`:242`), "a composite is named and drawn from its units" (`:695`) · manual: edit an opening carrying a glazing review flag and confirm the flag survives.

**Step 7 — PDP rail form** (`ProductDetailPage.tsx:337`). `mode:"create"`, `subject:{kind:"fixedProductOpening"}`, `density:"narrow"`, no `onCancel`. `composerKey` becomes `resetKey`. `handleAdded` calls `toNewQItem`. Deliberate behaviour change: the footer now renders before the slug resolves, so D10's empty-panel dead end goes away.
**Verify:** `npx playwright test scripts/tests/web/customer.spec.ts` · manual: configure, "Add to MyProject", "Add another like this" reseeds options and note.

**Step 8 — prune the dead surface** (separate commit). `ItemForm` now has exactly two live callers: `QuotePage.tsx:412` and `ItemComposer.tsx:1237`. Delete the props neither passes: `lockedSlug`, `rail`, `priceFn`, `unitMode`, `unitAxis`, `onDirtyChange`, `initialSection`, `excludeId`, `heading`, `busy`, `hideOptions`, `hideProduct`, `stickyActions`, `hideHeader`. **`scope` and `submitLabel` must survive — `CompositePanel` passes both.**
**Verify:** `npm test` · `grep -rn "<ItemForm" src/` returns exactly two hits · `npx playwright test` (full).

---

# 6. RISKS

**R1 — `capabilitiesFor` becomes the old flag pile in a nicer coat, one `if (actor === "ops")` at a time, and because it is one file nobody notices.** The model's value is that the answer is derived; that also removes every host's ability to express a one-off. The first real one-off is Q3, today. Four or five actor branches and the function is 200 lines of boolean logic with the same combinatorial surface, except now invisible at the call site — *worse* than `hideProduct={segments.length > 0}`, which is at least legible where it is passed.
**Mitigation, deliberately blunt:** `ACTOR_DIVERGENCES` is a closed, named array; the derivation may branch on `subject` freely and on `actor` **only** through a member of it; every returned capabilities object carries the divergences it used; a unit test asserts the array's exact contents, so growing it requires editing a test and shows in review. It starts at two, both forced by the server. Five means the model failed and the honest response is explicit per-host overrides.

**R2 — Steps 3 and 4 land on the arm with no automated coverage, and the compiler is not a gate for the errors this work produces.** `ops.spec.ts` is 4 tests, none touching a line editor; `npm test` bundles one React-adjacent module; the type gate lets through 20 TS2322 and 26 TS2339 today. So "green tests between steps" is close to vacuous exactly where the diff is largest.
**Mitigation:** Steps 0 and 2 exist for nothing else. The file-scoped ratchet makes TS2322/TS2741 blocking for the new module and each migrated call site without touching the global backlog, and the ops e2e lands *before* ops changes so it is a regression test rather than a description of the new behaviour. Neither step delivers a feature; both are non-negotiable.

**R3 — The dirty baseline is rewritten and nothing in the repo can catch a mistake.** Today's baseline works only because `ItemComposer.tsx:670-676` reproduces the initialisers' *expressions* character-for-character, including `seed?.code || suggestCode(...)`. If `useLineDraft`'s initial object and its baseline drift by one expression, every seeded editor reports dirty on open — and the visible symptom is a discard prompt on a form the user never touched, in the drawer, mid-save. It is compile-clean and it fails at the worst possible moment.
**Mitigation:** one object feeds both the controls and the baseline, so the coupling cannot exist by construction; and `useLineDraft`'s derivations are pure enough to test through the shim. The `line-editor.test.mjs` case "a seeded draft is not dirty on open" across the awkward seeds (blank code + product, options absent, unit seed, composite-parent seed) lands in **step 1**, before any host migrates.

---

# 7. QUESTIONS FOR THE OWNER

## Q1 — The note on child records: where does it persist?

You have confirmed the field. Nothing can store it today. I verified: `worker/lib/composite.ts:253` and `:446` insert every segment with `external_ref, room_label` as literal `NULL, NULL` — **the column exists**. But `updateSegment`'s patch shape (`:337-341`) is `{productSlug, options, alongMm, acrossMm, qtyPerParent}` with no note path, its UPDATE writes only `product_slug, options_json, dims_json, qty_per_parent, line_total, status`, neither segment route accepts one, neither DTO returns one, and `QSegment` has no such field.

- **(a) Reuse the existing `room_label` column on the segment row.** No migration. Five edits: `updateSegment`'s patch + UPDATE, both segment routes, both DTOs, plus `QSegment` and the two client patch types.
- **(b)** Add a distinct `note` column so `room_label` stays semantically "the opening's room". One migration plus the same five edits.
- **(c)** Ship the field UI-only now, persist later.

**Recommend (a).** The column is there and unused on segments; the invariant that segments carry no `external_ref` is about the *architect tag*, not about free text. (c) ships a field that loses its content on refresh — and under the `WriteContract` design it is not even expressible: the field would render read-only with "this save path cannot store a note yet", which is honest but useless.

**This is a prerequisite for step 5.** If you pick (a) or (b), that server change is its own commit, verified by `npm test` with a new round-trip case in `scripts/tests/composite.test.mjs`, and it lands before the drawer unit editor migrates.

## Q2 — Is the child note the same *kind* of thing as the parent note?

The parent's placeholder is "e.g. Bedroom 1, north elevation" (`ItemComposer.tsx:155`) — an opening-level location. A unit sits inside one opening, so a location placeholder invites re-answering a question already answered.

- **(a)** Same label and placeholder on both.
- **(b)** Same label ("Note (optional)"), different placeholder on a unit — e.g. "e.g. left leaf, obscure glass here".
- **(c)** A different label on a unit ("Unit note").

**Recommend (b).** One label so it reads as the same field; one placeholder change so it does not ask for the wrong content.

## Q3 — Ops and customer field sets: identical, or does ops keep extra controls?

This is D6 and it is a genuine capability question, not a refactor. On a composite parent the drawer hides the product picker and the Options group (`OpeningDrawer.tsx:284/288`); ops passes neither flag, so staff get both, and `worker/routes/ops.ts:825` genuinely writes `product_slug`, `options_json` and `qty` on a line whose price is Σ(units) and is never computed from them.

- **(a) Parity — a composite parent is not a product, for both actors.** One rule, one derivation. Removes a control staff have today.
- **(b) Ops keeps both.** A third `ACTOR_DIVERGENCE`, and the divergence stays.
- **(c)** Ops keeps the product picker, loses Options.

**Recommend (a).** A parent's glazing and hardware live on its units and ops can already edit any unit; the fields it removes cannot affect the parent's price, and leaving them lets a reviewer set a product and options that are silently inert. But **(a) removes an existing staff capability**, which is why it is your call.

Note the broader answer this sets: for every *other* subject, ops and customer see the **same** field set. The only sanctioned per-actor differences are where the price is computed and how review flags resolve — both forced by the server, both already in `ACTOR_DIVERGENCES`. Ops's extra *controls* (the configuration select, the resolve checkbox, split/merge/add/remove) stay outside the editor as host chrome, which is where they are today.

## Q4 — A unit's across dimension in ops (D1)

The customer route accepts `acrossMm` (`projects.ts:223`); the ops route has no such parameter at any layer. `composite.ts:357-362` falls back to the unit's own stored value, so accepting it is safe. An across mismatch is a hard submission blocker for the customer, and the estimator's only repair field is currently inert while the UI claims it is locked.

- **(a) Add `acrossMm` to the ops segment route and client**, so both actors can repair a mismatch.
- **(b) Leave it read-only in ops with the true reason** ("kept as-is — change it from the customer estimator, or re-split").
- **(c) Correct only the two false comments** (`ProjectRecord.tsx:812-815` and `:1035-1036`) and decide later.

**Recommend (a).** (b) leaves the estimator a dead end on a customer-blocking fault. Whichever you pick, both false comments go — that part is not optional.

## Q5 — What happens to the accidental /quote sharing: the drawing

The `Elevation` import at `ItemComposer.tsx:23` put the estimator's dimensioned draughting drawing into /quote's add form (open by default), /quote's card, the PDP rail form, the PDP card, and both ops editors. No comment, no commit line, no decision.

- **(a) Ratify it.** The drawing is better than the sage rectangle it replaced; leave every surface as-is. Zero work.
- **(b) Ratify the drawing, drop the dimension leaders on /quote and the PDP.** `Elevation` already supports `dims={false}` — nothing passes it today — so this is a one-line prop at the two consumer field blocks. The drawing stays; the schedule-idiom leaders and tabular millimetre callouts go, since /quote's user is typing those numbers two inches away.
- **(c) Revert /quote to a plain drawing** and keep the full elevation for /quote-project, the PDP and ops.

**Recommend (a).** I can see the argument for (b) — the leaders are draughting notation aimed at a schedule reader, and on /quote they duplicate the input fields — but it is a presentation judgement and the drawing is a clear improvement either way. Say the word and (b) is one line per surface.

## Q6 — What happens to the accidental /quote sharing: the red tokens

Commit `f4ee2f33` (an estimator commit) introduced `--attention: #C0392B` and repointed five selectors /quote renders, so /quote's blocked-line treatment went from amber to red — card stripe, border, chip, duplicate-code field, section trigger and sticky panel edge. It also left `Section`'s boxed variant at `border-warning/40` (`:406`) around a `text-attention-ink` label (`:409`) — an amber border on a red-labelled section — and a comment at `:991-993` describing an "italic amber" control three lines above the code that renders it red.

- **(a) Ratify the red across both arms**, and fix the amber/red mismatch at `:406` and the stale comment.
- **(b) Insulate /quote** with its own token, restoring amber there.
- **(c) Leave it entirely.**

**Recommend (a).** Two colours for "this line is blocked" across two arms of the same product is worse than either colour. The fix is two lines and it is the only part of this question that is unambiguously a bug rather than a preference.

## Q7 — Does `Elevation` move out of `src/components/quote-project/`?

It is arm-agnostic (four sizes, composite parts, an `opening` mode), it is the only module imported inward from that folder, and four non-estimator surfaces now render it. The folder is the only thing marking it as arm-specific.

- **(a)** Move to `src/components/elevation/` as part of this work.
- **(b)** Leave it; import across the boundary.
- **(c)** Move it in a separate commit after the migration.

**Recommend (c).** It touches four import sites in files this work otherwise leaves alone, and doing it inside the migration makes those diffs unreviewable. Related and separate: `src/components/quote-project/FamilyPictogram.tsx` has **zero importers** — it is dead and should be deleted in the same tidy-up.

## Q8 — Should the PDP confirmation card stop being an editor?

`ProductDetailPage.tsx:326` renders `ItemSummaryCard` — a full write-through-per-keystroke editor (Product, Dimensions, Options, Quantity & note) with no Save, no dirty tracking and no discard — on a **current, non-legacy consumer surface**. After this migration the PDP would have `LineEditor` above the fold and a second, differently-shaped editor of the same line below it. Every field added to the shared editor afterwards has to be added twice or the two drift.

- **(a) Make the PDP card read-only** — a `readOnly` flag suppressing the four editing sections (`:1113-1131`), leaving summary, price and the CTAs. Write-through editing then exists only on legacy /quote.
- **(b) Leave it.** Two live editors on a non-legacy page, indefinitely.
- **(c) Replace the PDP card with a `LineEditor` in edit mode.** Larger; changes the "you just added this" moment into an editing surface.

**Recommend (a).** It is the single change that bounds the fork described at the end of §4 to /quote alone. It does remove the PDP's only quantity control (the card's stepper) — which is the one place a PDP user can currently set a quantity, since the add form's was removed by `a13c2313`. That trade is yours.

## Q9 — What is the endgame for `ItemForm`?

After step 8, `ItemForm` survives for `QuotePage.tsx:412` and `CompositePanel`'s unit editor. That is two implementations of line editing shipping indefinitely, and it is why `DimensionsFields`/`Section`/`ProductPicker`/`CodeField` stay forked.

- **(a)** Leave `ItemForm` as-is; accept the fork until /quote retires.
- **(b)** After step 8, reduce `ItemForm` to a thin adapter over `LineEditor` — no behaviour change, but it touches /quote's file.
- **(c)** Put a date on retiring /quote, and accept the fork until then.

**Recommend (c), then (b) if the date slips past one more field change.** You have already said /quote-project is primary and parity is no longer required; a date makes the fork a known cost with an end rather than a permanent tax. (b) is a real option and I would do it on your say-so, but it touches an out-of-scope file.

## Q10 — Should a price-preview failure be surfaced?

Today a failed probe renders an em-dash and Save stays dead with no message and no retry (`:592`, `:834`) — indistinguishable from "you haven't typed a size yet". My `PriceState` names `failed` and exposes `retryPrice`.

- **(a)** Render "Price unavailable — try again" with a retry link.
- **(b)** Keep it silent.
- **(c)** Treat a failure as `deferred` so the save proceeds.

**Recommend (a).** (c) is tempting and wrong — it would let a line be saved that the server may refuse to price.

## Q11 — Delete the dead configuration?

`unitMode` (`:483, 526, 549, 704, 709`) is passed by **no** caller, so "Add composite unit" and its discard copy are unreachable. `unitAxis` is passed by three callers and read by none — it advertises an across-axis lock that `:793` removed. `initialSection`'s `"qty"` member names a section that does not exist. `ItemSummaryCard.initialFocus` is passed by neither of its two callers.

**Recommend: delete all four.** `unitMode`, `"qty"` and `initialFocus` immediately (zero callers, so deletion is unobservable); `unitAxis` as each site migrates — it comes back to life as `subject.axis` and stops advertising a lock that is gone. Confirm you do not intend to restore that lock.

## Q12 — Two adjacent server defects, outside this work. Do you want them raised as separate tasks?

Neither is touched by this design and neither should be bundled into it.

1. **Every composite is priced at 0% account discount.** All three composite pricing calls omit `ownerUserId` (`composite.ts:241-246`, `:372-374`, `:438-440`), and `loadAccountDiscount` returns 0 for a falsy user. Plain lines get the owner's discount. A discounted account also sees one figure in the unit editor's live preview (which *does* carry the discount) and a different one after save.
2. **`quote.copy` duplicates a composite into cross-line corruption.** `src/app/App.tsx:1874` spreads `...src`, carrying `segments` and `compositeAxis` **including the source's server segment ids** — so the duplicate's "Edit unit" controls PATCH the *original* opening's units. `copy()` already nulls `serverId`/`aiPriced`/`lineTotal` for exactly this class of reason; these two were missed.

**Recommend: separate tasks, (1) first.** (1) is money and is silently wrong today; (2) is data corruption behind an action that offers Undo.

---

**Nothing above is implemented. Answer Q1, Q3 and Q4 and I can start at step 0; the rest can follow as the steps reach them.**