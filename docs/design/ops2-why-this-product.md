# ops2 "Why this product" — DESIGN

**Date:** 2026-08-24 · **Stage:** pipeline stage 2 (architect) · **Revision 1**
**Spec:** `docs/specs/ops2-why-this-product.md` (rev 4, binding).
**Rulings:** `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R24, binding).
**Code facts:** `docs/specs/ops2-why-this-product-grill-input.md` (verified against the tree 2026-08-24).

Phasing is settled by the spec (D1/D5) and this design builds to it: **Phase 1**
`certified` removal → **Phase 2** shared full-screen drawing viewer → **Phase 3a**
universal figure capture → **Phase 3b** the panel, the slide-out, the placeholder.
Each phase deploys alone; pipeline stages run per phase.

---

## 1. Architect rulings delegated by the spec (decided here, out loud)

### 1.1 Storage: a new column, not `configuration_snapshot_json` (overrides ASSUMED §13.8)

The captured figures live in a **new nullable column `quote_line.performance_figures_json`**,
not inside `configuration_snapshot_json`.

Why the assumed home is wrong:

- `configuration_snapshot_json` means *"the exact configuration the estimator priced"*.
  It is deliberately **set to NULL** when a customer materially edits an AI-priced line
  (`worker/routes/projects.ts:513`) — correct, because the snapshot no longer describes
  the line — and deliberately **rewritten from the proposal** on restore
  (`projects.ts:637-641`). If figures lived inside it, the exact save that most needs to
  *record* figures (the customer override, SNAP-AC-14) is the save that *erases* the
  column, so the capture and the erasure would fight inside one field, and a partial
  `{performance: ...}` object on a manual line would corrupt the column's meaning for
  every existing reader.
- SNAP-AC-8 needs three distinguishable states. With the dedicated column they are
  structural: column `NULL` = saved before the capture shipped; column
  `{"uValue":null,"shgc":null}` = captured, no figure exists; column with numbers =
  captured. No JSON-key archaeology.
- SNAP-AC-2's structural scan becomes mechanical: every SQL statement whose column list
  names `product_slug` or `selected_variant_id` must also name
  `performance_figures_json`. One regex, no exceptions.

Column content is exactly `{"uValue": number|null, "shgc": number|null}` — nothing else,
ever. The variant identity already lives in `selected_variant_id`; duplicating it would
create a second home for a fact (house rule). The write moment is `updated_at`.

### 1.2 `ASSUMED:` §13.9 — the capture extends to the estimator's own writers: **yes**

Confirmed. Without it, "This one" (WHY-AC-4, SNAP-AC-3) would read the line's record for
human-saved lines and `candidate_result` for machine-saved ones — two code paths for one
panel line, drifting independently. With it, the panel reads one place, and the redundancy
with `candidate_result` is the cheap kind: same figures, written from data already in
memory at proposal time (no extra catalogue call — see §4.3).

### 1.3 `CandidateOutcome.thermal.dataSource`: **removed from the contract**, with a version bump

Ruling (conclusions §5 constraint 2, CERT-AC-9): the field is **deleted from the
TypeScript contract** in `src/data/recommendation.ts` (line 94), and `SELECTION_VERSION`
bumps `ladder-v1` → **`ladder-v2`** (`worker/lib/estimator/ladder.ts:21`).

- Deleting a field from a TS type breaks **no stored row**: JSON with an extra
  `dataSource` key parses identically (CERT-AC-9's test proves it on a pre-change
  fixture). What the stability rule actually protects — readers of old `outcome_json` —
  is untouched.
- Retaining it permanently null would keep dead vocabulary in a facts contract whose
  entire purpose is to be rendered by skins; a permanently-null enum invites a future
  surface to build "estimated vs certified" semantics that no longer exist anywhere.
- The version bump is what makes the removal honest under the additive-only rule:
  `ladder-v1` outcomes keep their field in storage; `ladder-v2` never had it. The
  contract header's stability note gains one line recording this sanctioned removal.
- Recorded as **ADR 0011** (`docs/adr/0011-remove-datasource-from-candidate-outcome.md`)
  because it knowingly breaks a declared stability rule and must not look accidental.

Nothing keys on the version string except storage (`selection_run.ranker_version` carries
it; `persist.ts:59` documents the column-name history). WHY-AC-10 keys on `outcome_json`
presence, never on version. Verified: no reader compares against the literal `"ladder-v1"`.

---

## 2. Spec corrections routed back (not designed around)

1. **X-AC-1 asks for a 401 that cannot exist beside X-AC-2.** On an ops route, a
   signed-in *customer* is indistinguishable from an anonymous caller: customer sessions
   (`session` table, `resolveCurrentProject`) never authenticate ops routes
   (`resolveInternalUser` reads the Access JWT or the staff OTP session — nothing else).
   So "anonymous → 401, customer → 403" is unimplementable as written, and the whole
   console's uniform refusal is 403 (`worker/routes/ops.ts:502` and every sibling).
   **Design follows the console convention:** no ops identity → `403 {"error":"forbidden"}`;
   ops identity failing `hasAssignedRole` → `403 {"error":"forbidden_role"}` (the
   `ops.ts:994` convention). X-AC-1 should be amended to "the console's standard refusal,
   with no candidate data in the raw body" — the load-bearing half of the criterion
   (no data in the body) is unchanged. **PM to amend X-AC-1/X-AC-2 wording.**
2. **The spec's writer index (§7.4) is incomplete.** SNAP-AC-2 anticipated this — the
   verified-complete index is §4.2 below and adds six sites the spec missed:
   `ai/proposal.ts:198` and `:299` (the estimator's two line INSERTs),
   `composite.ts:457` (segment edit) and `:524` (append unit), and the three schedule
   writers `worker/lib/parse.ts:349`, `:359`, `:372`. All are saves that set a product;
   R22 ("every save") covers them by its own words. **PM to fold the corrected index in.**
3. **WHY-AC-38's fact has exactly one stored home**: the sentence `flagForReview` writes
   into `quote_line.review_json.composite` (`worker/lib/estimator/estimate.ts:378`,
   `:426-431`). `SelectionOutcome` does not carry `splitNote` (the contract forbids
   sentences). The detail therefore states the fact from `review_json.composite`;
   if staff have since resolved that review flag, the trace is gone and nothing is
   stated. **Named residual** — acceptable under R18/D5 (no backfill, leave history);
   the AC's fixture must carry the unresolved flag.

---

## 3. Domain model (CONTEXT.md — applied by the architect with this design)

Owner-ruled corrections and additions, applied directly to `CONTEXT.md`:

1. **Staff**: works for **OpenFrame**, not AMJ. AMJ is the manufacturer. (Direct owner
   ruling.)
2. **Manufacturer partner** added as an actor: authenticated on the console, never
   staff; excluded from customer data and from every surface that compares products —
   `hasAssignedRole` is the one predicate. (Inference from the ruling; vetoable.)
3. **Estimator (persona)** added — distinct from **Estimator (subsystem)**, which the
   glossary already defines. The collision is real and is resolved by naming both senses
   explicitly and cross-referencing; the persona is *not* an RBAC role and nothing about
   authorization may derive from it (owner ruling).
4. **Human review gate** added as a stage term: between submission and issue, where the
   platform's recommendation is confirmed or overridden.
5. **Captured figures** added: a line's own record of its product's Uw and SHGC at the
   moment of save — a snapshot, never a lookup; distinct from the recommendation's
   record (the candidate outcome).
6. **Selection attribution** added: whether a line's current selection reads as
   platform-made or person-chosen — derived by comparing the recorded recommendation
   against the line's current product+variant, never stored, never read from `origin`.

---

## 4. Phase designs

### 4.1 Phase 1 — remove `certified` (no UI, no migration, no save path: CERT-AC-10)

**No `migrations/` change in this phase.** `certified`/`dataSource` never had D1
columns — they live in Sanity documents and in JSON snapshots.

Affected files (hand-off index):

| File | Change |
|---|---|
| `sanity/schemaTypes.ts:459` | delete the `dataSource` dropdown field |
| `sanity/schemaTypes.ts:460-461` | delete the `certified` boolean (performanceVariants) |
| `sanity/schemaTypes.ts:462-468` | `certificationRef` STAYS; delete only its `certified`-coupled custom validation rule |
| `sanity/schemaTypes.ts:1201` | delete the `certified` boolean (thermal profile row); `wersWindowId:1200`, `certificationRef:1202`, `published:1203` stay |
| `worker/lib/estimator/catalogue.ts:63-69` | GROQ: drop `certified` and `dataSource` selections from both projections; keep `certificationRef`, `wersWindowId`, `published` |
| `worker/lib/estimator/catalogue.ts:164-166` | profile mapping: drop `dataSource`/`certified` derivation; the `certificationRef ?? wersWindowId` fallback stays |
| `worker/lib/estimator/catalogue.ts:187` | **the drop-guard** (`certified === true` without ref/source removes the variant outright) — delete the guard line (CERT-AC-2) |
| `worker/lib/estimator/catalogue.ts:205-207` | legacy mapping: drop `dataSource`/`certified` keys |
| `worker/lib/estimator/types.ts` (`PerformanceVariant`) | remove `certified` / `dataSource` members (the type both mappings build; follow the compiler) |
| `worker/lib/estimator/select.ts:186-190` | delete the `commercial_only_estimate`-by-certification status branch and the `energyCertified` stamp on `exactOutcome`; every other downgrade cause stays (CERT-AC-5) |
| `worker/lib/estimator/select.ts:199-200` | delete `isCertified` |
| `worker/lib/estimator/select.ts:424-426` | delete the `thermal.dataSource` mapping |
| `worker/lib/estimator/rules.ts:327-329` | delete the `energyCertified` computation and the `RuleOutcome.energyCertified` member |
| `worker/lib/estimator/splitCandidates.ts:359` | drop the `source: variant?.dataSource` key from the unit configurationSnapshot |
| `worker/lib/estimator/outcome.ts:52` | delete `thermal.dataSource` from `CandidateFacts` |
| `worker/lib/estimator/outcome.ts:252` | delete the mapping line |
| `worker/lib/estimator/persist.ts` (catalogueSnapshot builder) | drop the `energyCertified` key from the draft_order_line catalogue snapshot |
| `worker/lib/estimator/ladder.ts:21` | `SELECTION_VERSION = "ladder-v2"` |
| `src/data/recommendation.ts:94` | delete `thermal.dataSource`; header stability note gains the ADR-0011 line |
| `sanity/scripts/strip-certified.mjs` | **new** — the depth-(c) value-stripping run (below) |
| `docs/adr/0011-remove-datasource-from-candidate-outcome.md` | **new** — §1.3 |

**The value-stripping run** (`sanity/scripts/strip-certified.mjs`, precedent:
`sanity/scripts/remove-legacy-dimension-fields.mjs`):

- Dry-run by default; writes only with `--apply`.
- **Export gate (CERT-AC-8, X-AC-12):** requires `--export <path>`; refuses and writes
  nothing unless the file exists, is non-empty, and its mtime is within 24 h. The check
  runs before any client is constructed, so the refusal is testable offline by invoking
  the script with no/stale args and asserting a non-zero exit and no network.
- Strips: `certified` and `dataSource` from every `performanceVariants[]` item;
  `certified` from every thermal-profile row. Touches nothing else; `certificationRef`
  and `wersWindowId` byte-identical (CERT-AC-7 verifies against the export).
- Deploy order: worker code first (reads no longer select the fields), then Studio
  deploy, then the dataset run. The code tolerates the fields still existing (GROQ
  simply no longer selects them), so the between-deploys window is safe.

**Behavioural consequence to pin (CERT-AC-1/2/5):** legacy variants previously dropped at
`catalogue.ts:187` re-enter the candidate set (subject to the surviving guards: variantId
present, not duplicate, figures in range, published); thermally-constrained lines are no
longer downgraded for certification; downgrades for tier, rules warnings and pricing
remain byte-identical.

### 4.2 Phase 3a — the universal capture: writer index (verified complete, 2026-08-24)

Every SQL statement in `worker/**` that sets `quote_line.product_slug` or
`quote_line.selected_variant_id`, enumerated by grep over `INSERT INTO quote_line` /
`UPDATE quote_line`. **This supersedes spec §7.4.** Non-writers checked and excluded:
`worker/lib/access.ts`, `worker/lib/lines.ts`, `worker/lib/estimator/estimate.ts:428`
(status/review only), `worker/routes/files.ts`, `worker/routes/parse.ts:288` (string
literal inside `edited_fields`, not a column write), `recomputeComposite` (derived
fields only).

| # | Site | Save | Figures source |
|---|---|---|---|
| W1 | `worker/routes/ops.ts:1143` (one statement; branches at `:1041` aiManaged, `:1100` composite parent, `:1113` manual) | ops PATCH /lines/:id | aiManaged: from the validated catalogue `variant` already in scope (`:1066-1068`). Manual: best-effort resolver. Composite parent: carry the existing column value unchanged (rule vacuous — units own the facts) |
| W2 | `worker/routes/projects.ts:507` | customer edit of AI-priced line | best-effort resolver for the customer's own choice; `configuration_snapshot_json=NULL` stays exactly as is (SNAP-AC-14) |
| W3 | `worker/routes/projects.ts:540` | customer ordinary edit | best-effort resolver (refresh to the product now saved) |
| W4 | `worker/routes/projects.ts:551` | customer insert | best-effort resolver (SNAP-AC-13) |
| W5 | `worker/routes/projects.ts:637` | customer restore-ai | figures of the restored variant, resolved through the same one-per-request catalogue read |
| W6 | `worker/lib/ai/proposal.ts:198` | estimator: no-product line INSERT (empty `product_slug`) | present-and-null — evaluated, nothing chosen |
| W7 | `worker/lib/ai/proposal.ts:258` | estimator: unresolved branch (sets `selected_variant_id=NULL`) | present-and-null |
| W8 | `worker/lib/ai/proposal.ts:299` | estimator: resolved line INSERT | from `variant` in scope (in-memory; no fetch) |
| W9 | `worker/lib/ai/proposal.ts:441` | estimator: resolved line UPDATE | from `variant` in scope |
| W10 | `worker/lib/composite.ts:295` | split apply: segment INSERTs | from each unit's `configurationSnapshot.uw/.shgc` (already in memory, `splitCandidates.ts:355-358`) when present; else best-effort; else present-and-null |
| W11 | `worker/lib/composite.ts:457` | segment edit (ops PATCH /segments/:id) | best-effort resolver |
| W12 | `worker/lib/composite.ts:524` | append unit | best-effort resolver |
| W13 | `worker/lib/parse.ts:350` | schedule re-upload, unlocked update | best-effort resolver, one catalogue read per parse request |
| W14 | `worker/lib/parse.ts:359` | schedule re-upload, locked COALESCE update | figures follow the product's own lock: kept when `product_slug` is kept, fresh when it moves (same `keep()` discipline) |
| W15 | `worker/lib/parse.ts:372` | schedule parse INSERT | best-effort resolver |

**Structural guard (SNAP-AC-2):** a source-level test walks `worker/**/*.ts`, extracts
every `INSERT INTO quote_line` / `UPDATE quote_line` SQL template, and fails if a
statement names `product_slug` or `selected_variant_id` without naming
`performance_figures_json`. The excluded non-writers stay excluded by the same
mechanical rule (they name neither column), not by a whitelist.

### 4.3 Phase 3a — the resolver module (the one new deep module on the write side)

**`worker/lib/figures.ts`** (new). Small interface, the mess inside: catalogue querying,
variant matching, ambiguity, timeout, failure-swallowing.

```ts
export interface LineFigures { uValue: number | null; shgc: number | null }
export const NULL_FIGURES: LineFigures;                      // {"uValue":null,"shgc":null}
export const figuresJson: (f: LineFigures | null) => string | null;

/** From a variant already in memory (W1-ai, W8, W9, W10). Pure. */
export function figuresFromVariant(
  v: { uValue: number | null; shgc: number | null } | null | undefined): LineFigures;

/** Pure core: deterministic match of a pick onto a fetched figure set. */
export function resolveFigures(
  cat: FigureCatalogue,
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
): LineFigures;

/** THE one catalogue consultation per save request (SNAP-AC-7). One GROQ query
 *  for the request's distinct slugs, minimal projection (slug, published
 *  variants: variantId, glazingOptionSlug, uValue, shgc). NEVER throws; any
 *  failure, timeout (own budget 1500 ms inside sanityExecutor's 4 s cap) or
 *  absent SANITY_PROJECT_ID yields an empty catalogue, which resolves
 *  everything to NULL_FIGURES (SNAP-AC-6). */
export async function fetchFigureCatalogue(env: Env, slugs: string[]): Promise<FigureCatalogue>;
```

**Matching rule (deterministic, no guessing):** `variantId` set and found — that
variant's figures. Otherwise filter the product's published variants by the glazing
option named in the pick's options (`glazingOptionSlug`); if **exactly one** variant
remains, its figures; otherwise `NULL_FIGURES`. `ASSUMED:` **an ambiguous resolution
stores null rather than a guess** — a fabricated figure a reviewer trusts is worse than
a stated absence; consistent with R6's "never rendered as a number" and the honest-gap
rulings. Vetoable at acceptance.

Properties the tests pin:

- Never a refusal: no caller can receive an exception (SNAP-AC-4/5/6).
- One fetch per request: W2-W5 share one `fetchFigureCatalogue` call built from the
  request's distinct slugs; W13-W15 likewise per parse request (SNAP-AC-7).
- Client-supplied thermal fields cannot reach it: its inputs are the server-resolved
  productSlug/variantId/options only (X-AC-9/10 are route-level tests, but the interface
  leaves no parameter a raw body could flow into).
- The capture adds no statement: figures bind into the existing guarded statements, so
  every ownership WHERE clause applies unchanged (X-AC-11) — the customer batch guard
  (`project_id` + `status_customer='draft'` + `quote_edit_version` +
  `quote_mutation_token`), the ops guard (`id` + `edit_version` + project
  `status_internal` list), the segment path's parent resolution.

### 4.4 Phase 3a — migration

**`migrations/0058_quote_line_performance_figures.sql`** (next after 0057):

```sql
-- Additive only: one nullable column. No table rebuild, no DROP, no data write.
-- Children of quote_line (all unaffected by ADD COLUMN):
--   quote_line.parent_line_id            -> quote_line ON DELETE CASCADE  (0028:28)
--   comment.line_id                      -> quote_line ON DELETE SET NULL (0003:17)
--   parse_line.quote_line_id             -> quote_line ON DELETE SET NULL (0012:55)
--   opening_instance.quote_line_id       -> quote_line ON DELETE SET NULL (0022:13)
--   ai_proposal_line.quote_line_id       -> quote_line ON DELETE SET NULL (0022:49)
--   recommendation_outcome.quote_line_id -> quote_line ON DELETE SET NULL (0047:108)
-- children affected: none expected.
-- NULL means "saved before the capture shipped" (SNAP-AC-8/10): no backfill, ever.
ALTER TABLE quote_line ADD COLUMN performance_figures_json TEXT;
```

d1-migration-safety: additive change, skill rule 1 — no rebuild, no
`PRAGMA defer_foreign_keys`. Remote apply still follows the skill's export-first
procedure.

### 4.5 Phase 3a — how each writer wires in (hand-off notes)

- **W1 (`ops.ts`)**: a `nextFigures: string | null` local beside `nextPricingSnapshot`
  (`:1037-1039`); aiManaged branch sets it from `figuresFromVariant(variant)` at
  `:1066-1068`; manual branch sets it from one `fetchFigureCatalogue` +
  `resolveFigures`; composite-parent branch carries `line.performance_figures_json`.
  Bound into the UPDATE at `:1143-1146`.
- **W2-W4 (`projects.ts` save loop, `:411` onward)**: before building `stmts`, collect
  the distinct product slugs of the resolved items; one `fetchFigureCatalogue`; each
  item's figures resolved with its own variantId (W2: the retained
  `stored.selected_variant_id` when the product is unchanged, else null) and bound into
  the three statements. The batch stays one batch; no per-line fetch (SNAP-AC-7).
- **W5 (restore-ai, `:637`)**: the restored `performance_variant_id` is known; resolve
  through the same helper (single-slug catalogue read) and bind. If the read fails:
  present-and-null, restore unaffected.
- **W6-W9 (`ai/proposal.ts`)**: figures from the already-selected `variant` object /
  present-and-null literals; the INSERT column lists at `:200-207` and `:299-301` and
  the UPDATE SET lists at `:258-261` and `:442-446` each gain the column. No fetch.
- **W10-W12 (`composite.ts`)**: split-apply INSERT (`:293-315`) takes
  `s.configurationSnapshot`'s `uw`/`shgc` when present; `updateSegment` (`:457`) and
  `appendSegment` (`:524`) resolve best-effort (their existing `priceItem` call is
  already async; the catalogue read joins it).
- **W13-W15 (`lib/parse.ts`)**: the import loop builds one slug set, one fetch; W14
  follows the `keep()` lock discipline.

### 4.6 Phase 2 — the shared full-screen drawing viewer (R21)

**New component `src/ops2/chrome/DrawingViewer.tsx`** — chrome, beside `SidePanel`,
because it is console furniture any surface may open (VIEW-AC-5: exactly one viewer).

Interface:

```ts
export interface ViewerSubject {
  code: string;                       // accessible name carries it (VIEW-AC-7)
  productSlug: string | null;
  width: string; height: string;      // empty = the stand-in square (VIEW-AC-8)
  parts?: ElevationParts | null;      // composite assembly (VIEW-AC-3)
  axis?: "vertical" | "horizontal" | null;
  caption?: string;                   // e.g. a unit's own size line (VIEW-AC-4)
}
export function DrawingViewer(props: {
  subject: ViewerSubject | null;      // null = closed
  onClose: () => void;
}): JSX.Element;
```

- Implementation: a full-screen `IonModal` (no breakpoints, no side animation — this is
  not `SidePanel`; a drawing wants the whole viewport). `Elevation` at the largest size
  the viewport allows, plus `ElevationLegend`. Escape and the close control both
  dismiss (IonModal gives Escape); no navigation, no history entry (VIEW-AC-2) — state
  only, never a route.
- Focus: opener buttons are real buttons already (`Plate.tsx:44-49`); on dismiss, focus
  returns to the opener (IonModal focus trap + explicit return via the trigger ref)
  (VIEW-AC-7).
- **`src/ops2/projects/Plate.tsx:60-106`**: the SidePanel enlargement block is deleted
  and replaced by `DrawingViewer` (VIEW-AC-6). The unit list + proportional-arrangement
  note that lived in the panel move into the viewer's composite rendering (the "drawn
  from its N units" block belongs with the enlarged drawing).
- **`src/ops2/projects/LineReview.tsx` (Units, `:80-140`)**: each unit's `xs` elevation
  is wrapped in a button opening the viewer with that unit alone as subject, labelled
  with the unit code and its own size (VIEW-AC-4).
- **`src/ops2/projects/lines.tsx`**: untouched — the row glyph stays inside the row's
  one navigation target (VIEW-AC-9, ASSUMED §13.1).
- Styles: `src/ops2/styles/line.css` gains the viewer block (tokens from
  `src/ops2/styles/tokens.css`; FrameFlow finish per ADR 0009).

### 4.7 Phase 3b — the read seam

**Shared contract: `src/data/rationale.ts`** (new; imports only types from
`src/data/recommendation.ts`; zero runtime imports — same discipline as the
recommendation contract: facts only, the skin writes every sentence).

```ts
import type { RequirementBasis, Tier } from "./recommendation";

export interface RationaleFigures { uValue: number | null; shgc: number | null }

export interface RationaleCandidate {
  productSlug: string;
  productName: string;                 // display convention of the record endpoint:
                                       // static getProductBySlug name, slug fallback
                                       // (WHY-AC-19: a vanished product still renders)
  variantId: string | null;
  form: "single" | "split";
  tier: Tier;
  rank: number | null;
  figures: RationaleFigures;           // the RECORDED thermal facts, from outcome_json
  fits: boolean;
}

export interface RationaleUnit {
  productSlug: string;
  productName: string;
  figures: RationaleFigures | null;    // null = never captured (pre-Phase-3 rows)
  band: { maxUValue: number | null; minShgc: number | null; maxShgc: number | null } | null;
  basis: RequirementBasis | null;
  reviewFlag: boolean;                 // segment_thermal_review
}

export type LineRationaleDto =
  /** No selection run resolvable, or an ops-decided split (R13, R17, D6). */
  | { kind: "human";
      current: { productSlug: string; productName: string;
                 figures: RationaleFigures | null };      // null = never captured
      units: RationaleUnit[] | null }                      // composite only (WHY-AC-37)
  /** A run exists but predates outcome_json (migration 0055). WHY-AC-10. */
  | { kind: "unrecorded" }
  | { kind: "recommendation";
      requirement: { maxUValue: number | null; minShgc: number | null;
                     maxShgc: number | null; basis: RequirementBasis | null;
                     absent: boolean };                    // from the stored run ONLY
      tolerance: number;                                   // stamped per run (WHY-AC-6)
      competingTier: Tier | null;
      recommended: RationaleCandidate;                     // the selected candidate
      alternatives: RationaleCandidate[];                  // <= 4, ascending rank (R8)
      /** R24: derived by comparison, never from origin. */
      selectionChanged: boolean;
      current: { productSlug: string; productName: string; variantId: string | null;
                 figures: RationaleFigures | null };
      composite: null | {
        origin: "ai" | "ops";
        beatenSingle: RationaleCandidate | null;           // best-ranked stored single (WHY-AC-33)
        units: RationaleUnit[];
      };
      unsuppliedSplitNote: string | null;                  // review_json.composite (§2.3)
    };
```

Deliberate absences, enforced at DTO construction (server-side, X-AC-5/7, R9, R10):
no excluded candidate, no `exclusions[]`, no `withheldIncomplete`, no price, no
`deltaToSelected`, no `learned`, no schedule prose, no certification vocabulary (R5).

**Worker module: `worker/lib/estimator/rationale.ts`** (new — the read-side deep
module; the route stays four lines).

```ts
/** null = the line is not a parent line of this project (one refusal for
 *  "wrong project" and "does not exist" — X-AC-4 by construction). */
export async function lineRationale(
  env: Env, args: { projectId: string; lineId: string },
): Promise<LineRationaleDto | null>;
```

Reads, in order (every query scoped through the project):

1. `SELECT ... FROM quote_line q WHERE q.id=? AND q.project_id=? AND q.parent_line_id IS NULL`
   — the single entry point; absent = `null` = 404.
2. Ops-decided split? (`line_kind='composite_parent' AND composite_origin='ops'`) →
   `kind:"human"` with the segments' figures (R17/WHY-AC-37); segments read
   `WHERE parent_line_id=q.id AND project_id=?`.
3. Opening: the `ops.ts:1046-1052` disjunction verbatim —
   `opening_instance.quote_line_id=q.id OR opening_instance.id=(SELECT opening_id FROM
   ai_proposal_line WHERE id=q.ai_proposal_line_id)`, `ORDER BY created_at DESC LIMIT 1`.
   No opening → `kind:"human"` (R13; WHY-AC-8/9 need only the line's own record).
4. Run: `SELECT ... FROM selection_run WHERE opening_id=? ORDER BY created_at DESC
   LIMIT 1` (ASSUMED §13.4: latest only). No run → `kind:"human"`.
5. Candidates: `SELECT outcome_json FROM candidate_result WHERE selection_run_id=?`.
   All `outcome_json` NULL (pre-0055) → `kind:"unrecorded"` (WHY-AC-10). Row count is
   bounded by the catalogue (~35 products + make-ups); read-all-then-map is fine.
6. Map: selected candidate; runners-up = non-excluded, `rank != null`, not selected,
   ascending rank, sliced to 4 (R8, ASSUMED §7.3); `beatenSingle` = best-ranked stored
   `form:"single"` outcome when the winner is a split (the stored-facts equivalent of
   `select.ts parentRepresentative()` — never a live call);
   `requirement`/`tolerance`/`competingTier` from `selection_run.selection_json`
   (falling back to the selected outcome's embedded requirement when selection_json
   predates 0055 but outcomes exist).
7. Attribution (R24, WHY-AC-28/29/30): `selectionChanged` = recorded recommendation's
   product+variant vs the line's current `product_slug`+`selected_variant_id` — for a
   split recommendation, `outcome_json.units[]` vs the current segments' product+variant
   multiset. **Never reads `origin`, never `ai_proposal_line_id`** (WHY-AC-26/31: the
   module imports nothing from `worker/lib/estimator/thermal/`, `rules.ts`,
   `select.ts`, or any requirement resolver — pinned by a source-scan test).

**Route: `GET /api/ops/projects/:id/lines/:lineId/rationale`** in
`worker/routes/ops.ts` (beside the record read at `:501`):

```ts
ops.get("/projects/:id/lines/:lineId/rationale", async (c) => {
  const staff = await resolveStaff(c.env, c.req.raw);
  if (!staff) return c.json({ error: "forbidden" }, 403);
  if (!hasAssignedRole(staff)) return c.json({ error: "forbidden_role" }, 403);
  const dto = await lineRationale(c.env, { projectId: ..., lineId: ... });
  return dto ? c.json(dto) : c.json({ error: "not_found" }, 404);
});
```

No POST/PATCH/PUT/DELETE added anywhere in the feature (X-AC-6);
`PATCH /api/ops/recommendation-outcomes/:id` stays exactly as it is — declared in
`src/ops/api.ts:346-355`, wired to no UI, and this feature adds no reference to it.

### 4.8 Phase 3b — the client

| File | Role |
|---|---|
| `src/ops2/projects/useLineRationale.ts` | **new** — fetch hook, the `useProjectRecord.ts` pattern (loading / ready / missing / error, stale-response guard, re-enter refresh). Never called when the record shows an order (D2/WHY-AC-11) |
| `src/ops2/projects/whyCopy.ts` | **new, pure** — every sentence on the surface, derived from DTO facts: the per-tier "Chosen" sentences (WHY-AC-5), the tolerance sentence reading the run's stamped figure (WHY-AC-6: `8%` from `0.08`, never hardcoded), the basis labels (WHY-AC-2), requirement-absent phrasing (WHY-AC-3), the person-chose sentences (WHY-AC-8/28), not-recorded phrasings (WHY-AC-4/9/27), verdict words per tier (WHY-AC-17). Node-testable; the R2 constraint (no "wrong/incorrect/mistake/error/correction") is asserted over this module's entire string table |
| `src/ops2/projects/WhyPanel.tsx` | **new** — the three-line panel (R6) and the two-line thinner form (WHY-AC-8), rendered from the DTO + `whyCopy`; the panel's action opens the detail only when `kind === "recommendation"` |
| `src/ops2/projects/WhyDetail.tsx` | **new** — `SidePanel` content (R19/WHY-AC-7): chosen row marked, up to 4 runners-up (WHY-AC-12/13), human-selection comparison block (WHY-AC-22-27), composite split-reason + per-lite bands (WHY-AC-33-36), `unsuppliedSplitNote` (WHY-AC-38); footer = the one enabled "Change the product" control (WHY-AC-39, `SidePanel`'s `footer` slot) |
| `src/ops2/projects/LineReview.tsx` | mount `WhyPanel` between the specification/units block and the Price panel (`:198-214`); **delete the superseded header sentences** (`:38-45` "absent entirely on a composite" — void per R14/WHY-AC-32) and the read-only note's "no Why this product" clause (`:44-47`); accepts a new `showWhy: boolean` prop |
| `src/ops2/projects/LinePage.tsx` | passes `showWhy={record.orderNo == null}` (D2: order records never fetch or render the panel); renders `LineEditStub` route target's back-link source |
| `src/ops2/projects/LineEditStub.tsx` | **new** — WHY-AC-40/41: one sentence ("the ops2 line editor is not built yet"), one control back to the line, no form elements, no fetch |
| `src/ops2/Ops2App.tsx:216` | add `<Route exact path="/projects/:id/line/:lineId/edit" ...>` (shape confirmed: matches the existing line route; `projects` is already in `NESTS_BELOW`) |
| `src/ops2/styles/line.css` | panel/detail styles (FrameFlow tokens) |

Panel data flow: the panel reads **only** the rationale response — including "This one"
(`current.figures`, the line's captured column) — so `opsLineDto` and the record
endpoint stay byte-identical (blast radius zero; the record's DTO key-set assertions in
`scripts/tests/api.test.mjs` keep holding without edits). The rationale endpoint is the
single reader of `performance_figures_json` (SNAP-AC-3: one place per fact).

GST/money: the DTO has no price field of any kind; nothing to display-format (R10,
§11). The existing Price panel is untouched.

---

## 5. Security

### 5.1 Data classification

| Data | Class | Movement |
|---|---|---|
| Candidate comparisons (which products competed, tiers, thermal figures, ranks) | **Commercial — the sharpest competitive material in the console** (conclusions §1) | D1 → staff browser only, via the new rationale GET. Never to a customer surface, never to a manufacturer partner |
| Captured figures (`performance_figures_json`) | Commercial (catalogue-derived; low sensitivity in isolation) | Written server-side on existing save paths; read only by the rationale endpoint. Never accepted from any client (X-AC-9/10) |
| Requirement + basis (energy-report-derived caps) | Commercial / project data | Stored since 0055; newly *displayed* to staff only |
| Certification values stripped in Phase 1 | Public catalogue metadata | Deleted from Sanity after a verified export |
| No financial PII, no personal PII, no payment data is touched by any phase | — | The record endpoint's existing customer-PII payload is not widened |

No new logging: the capture logs no figure values; the rationale route logs nothing
(consistent with the record read). Response caching follows the record endpoint's
posture (no cache-control loosening).

### 5.2 Trust boundaries

- **Customer ↔ Worker (write)** — Phase 3a only. The save request bodies are parsed by
  the *existing* validation; the capture consumes only server-resolved values
  (productSlug/variantId/options after the route's own checks). Any client-supplied
  `uValue`/`shgc`/thermal field in a body is dead weight: no parser reads it (X-AC-9/10
  executed as real attempts).
- **Ops ↔ Worker (read)** — the rationale GET. Validated by ops identity + role at the
  route, then by project-scoped line resolution in the module.
- **Worker ↔ Sanity (read)** — `fetchFigureCatalogue` and the Phase-1 GROQ changes. The
  executor is the existing `sanityExecutor` (public published-dataset CDN; no secret
  widening). Failure mode is stored-null, never a refusal, never an error surfaced to a
  customer.
- **Operator ↔ Sanity (write)** — the Phase-1 strip script: export-gated, dry-run
  default, named fields only.

### 5.3 Authorization per endpoint (exact scoping)

| Endpoint | Who | Scoping |
|---|---|---|
| `GET /api/ops/projects/:id/lines/:lineId/rationale` (**new**) | ops identity via `resolveStaff` (refuses manufacturer partners at `worker/lib/staff.ts:157`), plus explicit `hasAssignedRole` per the `ops.ts:994` convention — **the decisive control: a manufacturer partner never sees which products competed** (X-AC-3, R20) | Line resolution is the single entry point: `WHERE q.id = :lineId AND q.project_id = :projectId AND q.parent_line_id IS NULL`. Every subsequent read hangs off that row (opening via the `ops.ts:1046-1052` disjunction on `q`, run via `opening_id`, candidates via `selection_run_id`, segments via `parent_line_id = q.id AND project_id = :projectId`). A cross-project `lineId` and a nonexistent one both fall out of the same SELECT as the same `null` → `404 {"error":"not_found"}`, byte-identical (X-AC-4) |
| Existing save routes (W1-W15 hosts) | unchanged callers, unchanged gates | The capture binds into the existing statements; **no new statement addresses a row by client-supplied id**, so every existing ownership WHERE clause (customer draft/mutation-token guard, ops edit_version/status guard) applies to the figures write verbatim (X-AC-11) |
| `/projects/:id/line/:lineId/edit` (client route) | same ops2 shell; **no API surface** | The stub fetches nothing and renders no record data (X-AC-8); any data on adjacent pages still arrives only through the staff-gated record read |
| Record read `GET /api/ops/projects/:id` | unchanged | not widened by this feature (the panel reads its own endpoint) |

### 5.4 Abuse cases

| Attempt | Control | Criterion |
|---|---|---|
| Anonymous / customer-session read of a rationale | no ops identity → 403, empty of data (see §2.1 spec correction) | X-AC-1/2 |
| Manufacturer partner reads competitor comparison | `hasAssignedRole` refusal | X-AC-3 |
| Staff probes line existence across projects | one SELECT, one refusal shape | X-AC-4 |
| Server over-serves (excluded candidates, withheld products, exclusion detail, prices) | DTO built additively from an allow-list of fields; trimmed set asserted on the raw body | X-AC-5, X-AC-7 |
| Client writes a thermal figure onto a line | capture inputs are server-resolved only | X-AC-9/10 |
| Save names a foreign line id | existing ownership guards, no new statements | X-AC-11 |
| Method widening / verdict write-back | route table diff: zero new non-GET routes; outcomes PATCH stays unwired | X-AC-6, R1/R2 |
| Strip run without a verified export | offline gate, exits before any client exists | X-AC-12 / CERT-AC-8 |
| Customer-facing blast radius of Phase 1 | no customer route touched; DTO key-set assertions already pin response shapes | X-AC-13 / CERT-AC-11 |

**Residual risks (named):** (a) the WHY-AC-38 trace lives in `review_json.composite` and
is erasable by a legitimate review-resolve action — accepted (R18); (b) preview versions
share production bindings — Phase-1 smoke checks on a preview must stay read-only
(deploy protocol step 3); (c) the rationale endpoint reveals to *staff* the requirement
basis of a customer's project — in scope and intended (R4).

---

## 6. Sequencing (what the developer builds, in order)

**Phase 1** (no UI, no migration)
1. Red: `scripts/tests/certified-removal.test.mjs` (new) — CERT-AC-1/2/3/5/6/9 + the
   strip script's export-gate refusal (CERT-AC-8); plus a CERT-AC-5 case added to
   `scripts/tests/thermal-selection.test.mjs` where the status branch lives today.
2. Green: estimator + contract removals (§4.1 table), `ladder-v2`, ADR 0011.
3. Studio schema edits; `sanity/scripts/strip-certified.mjs`.
4. Deploy worker → deploy Studio → export dataset → dry-run → `--apply` → CERT-AC-7
   verification against the export.

**Phase 2** (client-only)
1. Red: `scripts/tests/web/ops2-drawing-viewer.spec.ts` (VIEW-AC-1..9).
2. `DrawingViewer.tsx`; rewire `Plate.tsx`; unit buttons in `LineReview.tsx`; styles.

**Phase 3a** (server write path; lands and deploys before any 3b work)
1. `migrations/0058_quote_line_performance_figures.sql`.
2. Red: `scripts/tests/figure-capture.test.mjs` (pure: resolver rules, SNAP-AC-2 source
   scan) and `scripts/tests/why-capture-api.test.mjs` (heavy: SNAP-AC-1/4/5/6/8/9/11/13/14/15,
   X-AC-9/10/11 — Worker+D1 harness per `scripts/tests/helpers.mjs`; the harness's
   absent `SANITY_PROJECT_ID` exercises the null path natively).
3. `worker/lib/figures.ts`; wire W1-W15 (§4.5).
4. Deploy. Every save from this day has figures; nothing yet reads them.

**Phase 3b** (read surface; after the shared UX mock gate for 2+3)
1. Red: `scripts/tests/why-rationale-api.test.mjs` (heavy: DTO states, attribution
   fixtures incl. the WHY-AC-29 fixture — `origin='ai'`, overridden; latest-run rule;
   the 4-cap; X-AC-1..7 raw-body assertions).
2. `src/data/rationale.ts`; `worker/lib/estimator/rationale.ts`; the route.
3. Red: `scripts/tests/ops2-why.test.mjs` (pure: whyCopy sentence table, R2 vocabulary
   ban, tolerance formatting) and `scripts/tests/web/ops2-line-why.spec.ts` (panel
   states, slide-out, stub route, WHY-AC-20 GET-only trace, WHY-AC-11 absence).
4. Client (§4.8); seed fixtures in `scripts/db/seed.sql` (selection_run +
   candidate_result with outcome_json on the `p_rec` project; a pre-0055-style row; an
   overridden AI line; staff identity `u_staff4` for the new spec file, `u_staff5` for
   the viewer spec, allocations recorded beside the rows per the suite convention).

---

## 7. Test plan (every artifact by path; wiring named)

| Artifact | New/extended | Wired into | Proves |
|---|---|---|---|
| `scripts/tests/certified-removal.test.mjs` | **new** | `test:pure` list + new `test:certified` script in `package.json` | CERT-AC-1, 2, 3 (source scan), 5, 6 (schema source scan), 8 (script refusal), 9 (old-JSON fixture parses; no renderer references the field) |
| `scripts/tests/thermal-selection.test.mjs` | extended | existing `test:thermal` | CERT-AC-5 downgrade-cause coherence beside its existing status cases |
| `scripts/tests/figure-capture.test.mjs` | **new** | `test:pure` list + `test:why` script | resolver matching rules (variantId hit, glazing-unique hit, ambiguity→null), `figuresJson` shapes, **SNAP-AC-2 structural scan** |
| `scripts/tests/why-capture-api.test.mjs` | **new** | `test:heavy` list + `test:why` | SNAP-AC-1, 4, 5, 6, 8, 9, 11, 13, 14, 15; X-AC-9, 10, 11 (real attempts, denial recorded) |
| `scripts/tests/why-rationale-api.test.mjs` | **new** | `test:heavy` list + `test:why` | DTO kinds incl. WHY-AC-10; WHY-AC-12/13 cap; WHY-AC-25 (requirement from run only); WHY-AC-29 fixture (§12.1: origin-reading implementations fail); WHY-AC-30; X-AC-1..7 raw-body |
| `scripts/tests/ops2-why.test.mjs` | **new** | `test:pure` + `test:ops2` | whyCopy: WHY-AC-2/3/5/6/17 sentence facts; WHY-AC-21 vocabulary ban over the string table |
| `scripts/tests/web/ops2-drawing-viewer.spec.ts` | **new** | Playwright dir glob (`test:web`) | VIEW-AC-1..9 (incl. history.length, focus return, one-viewer check via DOM) |
| `scripts/tests/web/ops2-line-why.spec.ts` | **new** | Playwright dir glob | WHY-AC-1/4/7/8/9/11 panel states; slide-out on `SidePanel`; WHY-AC-20 network trace GET-only; WHY-AC-22/28 both-shown rendering; WHY-AC-39-44 stub journey; X-AC-8 |
| `scripts/db/seed.sql` | extended | web + heavy harnesses | the fixtures above; staff allocations `u_staff4`/`u_staff5` |
| `scripts/tests/api.test.mjs` | untouched | — | its existing DTO key-set assertions ARE the CERT-AC-11 / record-unchanged guard; if it stays green with zero edits, the blast radius claim holds |

Spec §12's three traps, answered: (1) the WHY-AC-29 fixture is the overridden
`origin='ai'` line in seed + the heavy suite; (2) SNAP-AC-2 is the source-level scan in
`figure-capture.test.mjs`, not a behavioural test; (3) SNAP-AC-5/15 run on the
customer save route in `why-capture-api.test.mjs`, not through ops.

---

## 8. Rejected alternatives

| Alternative | Rejected because |
|---|---|
| Figures inside `configuration_snapshot_json` (spec's ASSUMED §13.8) | the customer-override save nulls that column by design; capture and erasure would fight in one field (§1.1) |
| Figures as two REAL columns (`captured_u_value`, `captured_shgc`) | loses the tri-state (never-captured vs captured-null) without a third sentinel; two columns to keep atomically consistent; the JSON pair is one fact |
| Panel data folded into `GET /api/ops/projects/:id` | bloats every record read with per-line candidate queries the queue never needs; widens a stable, key-set-asserted DTO; the panel is per-line-page, so a per-line GET matches use exactly |
| A bare-line endpoint `GET /api/ops/lines/:id/rationale` | breaks the record's structural refusal property (LinePage's "nothing fetches a bare line id"); X-AC-4 would become a checked rule instead of a shape of the query |
| `dataSource` retained permanently null | dead vocabulary in a skin-facing contract; invites re-derivation of removed semantics (§1.3) |
| Client-side attribution (compare in the browser) | R24's comparison would live in every skin that renders the panel; server derivation keeps one implementation and lets the raw-body tests pin it |
| Rationale served from `draft_order_line.selected_candidate_id` | written and read by nothing today, describes only the machine pick (not the current line), and dies at the draft stage; the run+outcome path serves every state incl. splits |
| A second enlargement panel for Phase 3 drawings | VIEW-AC-5 exists to prevent exactly this; one `DrawingViewer` in chrome |
| Backfilling figures for pre-Phase-3 lines | D5/R18 explicit; a backfill is a display-time catalogue read wearing a snapshot's clothes |

---

## 9. Decisions needed

**None for the owner.** The three delegated rulings are made in §1 (new column;
capture extends to estimator writers; `dataSource` removed with a version bump +
ADR 0011). Two items route to the **product-manager**, not the owner: the
X-AC-1/X-AC-2 status-code amendment and the corrected writer index (§2). New
`ASSUMED:` tags registered by this design, vetoable at acceptance:

- §4.3 — an ambiguous variant resolution stores null, never a guess.
- §4.3 — the capture's catalogue budget is 1500 ms inside the executor's 4 s cap.
- §2.3 — WHY-AC-38 renders from `review_json.composite` and is silent once that
  flag is resolved.
- §4.7 — the rationale endpoint serves parent lines only; a unit's facts arrive
  inside its parent's DTO.
