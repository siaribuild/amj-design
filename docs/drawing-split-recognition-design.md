# DESIGNED WINDOW SPLITS FROM ARCHITECTURAL DRAWINGS — final design for approval

Nothing implemented. Every infrastructure claim below I verified directly in this session; where the dossier's map and its adversarial verification disagreed, I checked the code and sided with the verification. Those points are marked **[verified]**.

---

## 1. WHAT ALREADY EXISTS

**More than you'd expect, and it is all pointed at this problem.**

### Something already reads window tags off a floor plan — but only as words

`worker/lib/estimator/skills/plan.ts` defines `planContextExtractor`, a live AI skill whose output type `PlanContextV1` contains, verbatim:

```ts
openings: { ref: string; roomId: string | null; orientation: string | null;
            horizontalProjectionMm: number | null }[];
```

Its prompt (`plan.ts:74-79`) says *"Preserve opening references exactly. Map an opening to a room and compass orientation only when supported."* So the system already asks a model: *which W-number belongs to which room, facing which way.* That is step one of the owner's process, already specified and already running.

Its output is consumed by `applyPlanContext` (`worker/lib/ai/pipeline.ts:150-206`), which writes `roomId`, `wallOrientation` and `shading` onto the opening graph, appends an evidence row with `origin: "geometry_derived"`, and sets `inputMode = "plans_no_report"`.

**What it is fed:** flat text. For a PDF, `imageDataUrl` is always null — `ingest.ts:303` assigns it only inside the non-PDF branch **[verified]** — so `buildContent`'s multimodal path (`plan.ts:94-100`) is unreachable for every plan set a customer actually uploads. The skill receives `doc.roleText.plans ?? doc.markdown` (`pipeline.ts:449`), a concatenation of pdf.js text runs with all coordinates discarded. The code knows this and says so, at `ingest.ts:365-370`:

> *"The current Worker has neither a Browser Rendering binding nor a Worker-compatible canvas implementation. Do not pretend a text-layer pass saw geometry; surface the limitation until a renderer is provisioned."*

### What the pipeline does with a "plans" document today, end to end

1. `ingest.ts` reads the text layer, scores pages against 5 plan regexes (`floor plan`, `elevation`, `section`, `scale 1:`, `north point`), and tags a page `plans` at ≥2 hits (`:143`).
2. Selected pages' raw text is concatenated with `<!-- page N -->` markers and truncated to 32,000 chars.
3. One `google/gemini-3.6-flash` call, temperature 0.1, 90s deadline.
4. `applyPlanContext` merges `state/postcode/buildingClass/storeys/areas/northRotationDeg` and joins openings **by exact string equality** — `byRef.get(opening.externalRef)` (`pipeline.ts:174-176`) **[verified]**. A plan printing `W-04` against a schedule `W04` silently drops room and orientation.
5. The quality issue `pdf_visual_rendering_unavailable` is pushed — and lands only in `BuildingModelV1.assumptions`, not in stage warnings, so nobody reading a run summary sees it.

### The receiving machinery for splits is complete and battle-tested

- `SplitHint` / `SplitUnitHint` (`split.ts:34-52`) already carry ordered, per-unit `{operation, widthMm, heightMm, ref, requirement}`.
- `layoutFromHint` has **two** branches: a symmetric comment branch that *drops every `fixed` unit and re-arranges* (`:146-175`), and an **order-preserving branch gated on `hint.source === "energy_report"`** (`:131-143`) that calls `fitReportComponentsToOpening` — components own proportions, the architectural document owns the total. That second branch is exactly the shape an elevation produces.
- `proposeSplit` → `materialiseSplits` → `splitLine` builds the parent `composite_parent` plus priced segments, each independently product-selected.
- `src/components/quote-project/Elevation.tsx` is a **13-family opening-symbol generator** that draws a composite from its real parts, to true proportion, with the apex on the real hinge edge. Its header comment is the symbol legend, verbatim (`:18-23`). **The reader we need is this file inverted.**

### Slots that exist, are declared, and are populated by nothing

| Slot | Where | Status |
|---|---|---|
| `OpeningV1.configuration.panelCount` | `schema.ts:152` | hardcoded `null` at `pipeline.ts:96` **[verified]** |
| `.operablePanelCount` | `schema.ts:153` | hardcoded `null` |
| `.viewBasis` | `schema.ts:157` | hardcoded `null` |
| `.layoutCode` | `schema.ts:154` | populated from schedule text, **read by nothing** |
| `evidence_items.sheet_ref` / `region_json` | `0016:92-93` | `pipeline.ts` writes `null` at every call site **[verified]** |
| `ESCALATION_TRIGGERS`: `unresolved_tag_mapping`, `frame_decomposition_uncertain` | `schema.ts:80-93` | defined, never emitted |
| `OVERRIDE_REASONS`: `WRONG_TAG_MAPPING`, `WRONG_CONFIGURATION`, `SOURCE_OCR_ERROR` | `schema.ts:50-69` | governed taxonomy, role-gated, unused by this path |

### The vector capability is already in the bundle **[verified this session]**

`unpdf@1.6.2` is a **runtime** dependency (`package.json:97`). `node_modules/unpdf/dist/index.d.ts:181` exports `getDocumentProxy` (already imported by `ingest.ts:10`) and `extractTextItems`. Inside `pdfjs.mjs` I confirmed `OPS.constructPath = 91` and `OPS.paintFormXObjectBegin = 74`. So **vector geometry — line segments, curves, positioned text with full transforms — is extractable in this Worker today with no new binding, no canvas, no npm package.** Only rasterisation to pixels is genuinely blocked (`wrangler.jsonc` has no Browser Rendering binding; `limits.cpu_ms: 60000`).

---

## 2. THE GAP

The platform asks a model to name which room and which compass point each W-number serves, then hands it a flat string of text runs stripped of every coordinate — so the one question it asks about a drawing is the one question a drawing answers geometrically and prose does not, and the elevation sheet, which is the only document that states how a window is actually built, is never read at all: there is no `elevation` extraction role, no elevation skill, and no schema field for panel count, mullion position or opening symbol that any drawing could fill. Meanwhile everything downstream of that missing answer is already built and idle — ordered `SplitHint` units, an order-preserving layout branch, a per-part composite renderer, empty `sheetRef`/`region` evidence columns, a live `Confirm layout` chip, and a governed correction vocabulary containing `WRONG_TAG_MAPPING` — so the gap is not a missing pipeline, it is a missing **eye**.

---

## 3. HOW A HUMAN DOES IT

Watch an estimator do this and the process is six steps, in this order, each falsifiable before the next begins.

1. **Sort the set.** Flick through and label each sheet: floor plans, elevations, sections, details, schedule. Read the title block for the sheet number. *(≈10 seconds per sheet.)*
2. **Harvest the tags.** On each plan, find every circle. Discard the ones with a single letter outside the building outline — those are grid bubbles marking elevation directions. Keep the two-line ones: top line is the window id, bottom line is the sheet where it's drawn. Note which wall segment the leader touches and which room is on the inside of that wall. → *"W9, look on S09, north wall of BED 3."*
3. **Cross off against the schedule.** Every tag should appear in the schedule table; every schedule row should appear on a plan. Discrepancies get circled and queried — never guessed.
4. **Turn to the named sheet.** Find the elevation. Work out which storey band you're in (the vertical dimension chain gives floor-to-floor), and which direction this elevation faces (via the A/B/C/D bubble or the sheet title).
5. **Pick the group.** Several window groups on the sheet. Narrow by: is it labelled? Is it on the right floor? Is it in the right position along the wall relative to its neighbours? **Does its shape match the schedule's stated width × height?** That last check is the one an estimator does almost unconsciously and it is the strongest — a 2700mm window is visibly wider than a 1800mm one at the same scale.
6. **Read the make-up.** Count the vertical mullions → panel count. Measure the panels *relative to each other*, not absolutely — then apply the schedule's overall width to get real millimetres. Read each panel's symbol: no marks = fixed, triangle apex on the top rail = awning, apex on a stile = casement, arrow = slider. Where a symbol is ambiguous or the practice draws oddly, look for the legend block, or fall back to what the schedule's type column says.

**Three properties of that algorithm the design must mirror:**
- The human **never scales a dimension off the elevation.** The elevation supplies *proportion and order*; the schedule supplies *millimetres*.
- The human **cross-checks the join before trusting the make-up.** Wrong group → confidently wrong everything.
- The human **stops and asks** when two groups are plausible and differ. They do not flip a coin.

---

## 4. THE DESIGN

**Recommended: vector-first drawing recognition, with a correlation layer between the readers and the pipeline.**

The spine is the **vector-geometry** proposal — it is the only one whose enabling claim I could verify in the bundle rather than take on faith, and it costs approximately zero model spend. Grafted onto it:

| Graft | From | Why |
|---|---|---|
| Disjoint-authority framing + "agreement proposes, disagreement asks" | correlation-first | Ranking two architect-authored sources is a coin flip dressed as a decision |
| Observation/interpretation split (`SymbolObservation` vs `SymbolProfile`) | correlation-first | Lets a practice's convention be *data*, not a code change |
| Set-level convention detection and **withdrawal** | correlation-first | One bad convention must never become twelve bad splits |
| `ordered: true` flag rather than branching on the source string | correlation-first | Cleaner than widening a string comparison; no behaviour change for existing sources |
| Coarse v1 vocabulary — `fixed` / `sliding` / `operable` | vision-model | ~90% of the value, ~10% of the hallucination surface |
| Client-side rasterisation as the **scanned-set** fallback only | vision-model | Verified: `createIsomorphicCanvasFactory` returns `DOMCanvasFactory` in a browser; the vision path into the model already works |
| Per-sheet human confirmation gate producing labelled rows as a by-product | vision-model | The only mechanism that catches a systematic symbol inversion |
| Vectoriser runs **outside** the AI job | both feasibility judges | `cpu_ms: 60000` is shared with the 120s job and a CPU overrun kills the isolate, not the stage |
| Leave-one-out scale fit; gate on the residual **before** `fitReportComponentsToOpening` runs | reliability judges | That function rescales widths to sum exactly, destroying the only independent check |
| Wire corrections into `captureRecommendationOutcomes` with the existing `WRONG_TAG_MAPPING` codes | fit judge | Otherwise the system can never learn its own error rate |

### 4.1 The pipeline

**Stage A — Sheet Index. Runs at upload, in its own invocation, never inside the AI job.**

Triggered after virus-clean, before extraction is enqueued. Walks `page.getOperatorList()` maintaining a CTM stack (`save/restore/transform/paintFormXObjectBegin/End`), applying the current matrix to every path point; records line segments, closed circular subpaths, dash state, line width, and XObject group id. Separately calls `page.getTextContent()` directly — **not** `extractTextItems`, which discards the rotation components of the transform and would mis-box Sheet A's vertical dimension chain.

Output per page: `SheetIndexV1 { sheetId, sheetKind, sheetTitle, texts[], segs[], arcs[], extractor }`, written to `derived/{fileId}/sheetindex-v{N}.json` in R2, keyed on the file checksum, **and read back on subsequent runs.** (`derivedKeys` is write-only today — nothing ever reads a derivative back **[verified]** — so this cache is new code, not reuse, and it is mandatory.)

Hard budget: cumulative operator count and elapsed ms, checked at page boundaries. Over budget → that page is marked `geometry_unavailable` and the file is indexed without it. A raster page (path-op count ≈ 0, one `paintImageXObject`) is detected in O(1) and marked `drawing_is_raster`. **No OCR, no pretending.**

**Stage B — Tag Harvest** (plan pages, deterministic). Circle detection: a closed subpath of 4 cubic Béziers *or* an n-gon, accepted when sampled points have radius variance < 3% over ≥300° of arc. Then the discriminator that needs no semantics:

| | tag circle | grid bubble |
|---|---|---|
| text runs fully inside | **2** (`W7` + `S08`) | **1**, single character |
| position | inside the plan's linework bbox | outside it |
| leader | short, terminates on a wall segment | gridline crossing the plan |

Emits `PlanTagObservation { tag, sheetRefText, centre, leaderTo, wallSegId, wallAzimuthDeg, roomLabel, region }`.

**Stage C — Panel Harvest** (elevation pages, deterministic). Frame rects; candidate mullions = near-vertical segments spanning ≥0.9 of frame height, strictly inside; **doubles collapsed** (CAD draws a mullion as two lines for section thickness — merge parallels within 1.5% of frame width). Panels are the x-intervals; transoms are horizontals spanning ≥0.9 of frame width. Emits per panel a `SymbolObservation` (raw geometry, **no meaning attached**), plus `widthFrac`, `sillYFrac`, `headYFrac`.

**Stage D — Correlate.** Pure function, no I/O, no model. Consumes plan tags + elevation groups + merged schedule lines + energy map output. Emits `CorrelatedOpening[]` with per-field claims, sources, conflicts and residuals.

**Stage E — Project.** Writes `SplitHint{source:"drawing_set", ordered:true}` into the existing `splitHints` Map beside the WS5 block at `pipeline.ts:540-554`, plus `flagOpening()` copy, plus `evidence_items` rows with `sheet_ref` and `region_json` **populated for the first time in this codebase**.

**Model spend: zero on the happy path.** One optional `elevation_symbol_reader` call per *document* (not per page, not per group) when Stage C reports ≥2 ambiguous symbols. That call is fed the extracted geometry description plus text runs, and any tag it returns that is not in the supplied run list is dropped in `validate()` — the anti-hallucination whitelist from the vision proposal, applied to a geometry input.

### 4.2 The symbol vocabulary

**Two layers, deliberately separated.** The observation is convention-free geometry; the interpretation is versioned data.

```ts
interface SymbolObservation {
  marks: "none" | "diagonals" | "arrows" | "louvre_bars" | "mixed";
  apexEdge: "top" | "bottom" | "left" | "right" | null;
  apexCount: 1 | 2 | null;
  dashed: boolean | null;
  arrowAxis: "horizontal" | "vertical" | null;  arrowDir: string | null;
  midRail: boolean;  legendText: string | null;  clarity: number;
}
interface SymbolProfile {          // ops-owned data, not code
  apexMeans: "hinge" | "opening_edge";
  defaultViewBasis: "outside" | "inside";
  rules: { when: Partial<SymbolObservation>; operation: string }[];
}
```

Default profile = the legend already written in `Elevation.tsx:18-23`: *solid = opens toward you; dashed = opens away; apex of the V points at the HINGE edge; single-headed arrow = travel; unmarked = fixed.* Reader and writer share one constants module so they cannot drift.

**Detection rule:** within a panel box, find segments whose endpoints lie on the box boundary. Two meeting at the **midpoint of one edge** with far ends at the two corners of the opposite edge = a triangle; the shared vertex names `apexEdge`. An arrowhead is a short segment pair at ≤45° to a long axial segment. Louvre = ≥3 parallel horizontals at regular pitch spanning ≥60% of panel width.

**What v1 is allowed to claim — three classes only:**

| Class | Signature | Why safe |
|---|---|---|
| `fixed` | `marks: none` | absence of marks; convention-independent |
| `sliding` | horizontal arrow | a distinct glyph; convention-independent |
| `operable` | any diagonal/chevron | family comes from the schedule's type column, not from pixels |

Awning-vs-hopper, casement hand, and inward-vs-outward are **observed and recorded, never priced**, until a practice profile is confirmed. Rationale in §7. Sheet B's ground floor exercises this cleanly: two slider panels with horizontal arrows → `sliding`; the ~3-panel window group with diagonals → `operable`; unmarked panels → `fixed`.

**Three defences against a practice drawing it differently, in order of strength:**
1. **Read the sheet's own legend.** A cluster of small rects each containing one symbol adjacent to a family name — deterministic to detect, and it *defines* the profile for that document, overriding the default.
2. **Set-level consistency.** If ≥3 openings in one set have both a drawing-derived read and an independent claim, and the majority disagree **in the same direction**, that is a convention mismatch, not N errors. **Withdraw every drawing-derived split in the set and ask once.** Do not auto-flip.
3. **Per-practice profile**, keyed on PDF `Producer`/`Creator` + title-block firm, confirmed by a human, stored in ops. Never learned silently.

### 4.3 The join — two hops, each separately falsifiable

**Hop 1: tag → sheet.** The tag circle carries its own routing key; this is the owner's tip cashed in. Build a sheet directory from Stage A title blocks (`/^S[- ]?\d{1,3}$/` in the bottom-right ~25%×20%). Normalise both sides through **one** primitive — `energyMap.normalizeOpeningRef` — so `S08`/`S-08`/`S 8` collapse. Zero hits or two hits → the tag is *unrouted*: it still contributes room, orientation and quantity, but contributes **no make-up**.

**Hop 2: tag → which group on that sheet.** Four filters in order:

- **(a) Direct label** — a `W\d+` run inside or adjacent to the group bbox. Decisive; stop.
- **(b) Storey band** — the plan is FIRST FLOOR; the elevation's right-edge chain (2590 / 620 / 2825) gives floor-to-floor. On Sheet B this eliminates the slider, the large ground window and the hinged door in one step.
- **(c) Ordinal position** — plan tags ordered along the wall vs elevation groups ordered by x. An outside view **mirrors** the plan order for two of four directions; rather than reason a priori, evaluate both senses and let (d) choose. This is why `configuration.viewBasis` gets populated — a mirrored order is a silent left/right inversion of every asymmetric composite.
- **(d) Width agreement — the discriminator.** Fit **one scale per elevation sheet** across all candidate groups against their schedule widths, **leave-one-out**: predict the window under test from a fit that excludes it. Solve the assignment optimally (Hungarian, n ≤ 12) with **monotonicity as a hard constraint** — windows on one wall cannot cross.

**Accept only when:** every predicted residual ≤ 3% **and** the second-best assignment costs ≥2× the best. Otherwise:
- Margin thin, candidates have **identical** make-up → assign anyway, note "positions interchangeable" (the ambiguity is inconsequential).
- Margin thin, candidates **differ** → **refuse the whole elevation's assignment.** Partial assignment from a contested matrix is precisely the confident-wrong outcome.

*Worked, on the supplied set:* upper floor has G1(2 panels), G2(3), G3(2); plan puts W7, W9, W11 on the wall facing bubble B; schedule widths 1800/2700/1800; bbox widths 0.14/0.21/0.14. Single scale 7.78e-5 fits all three, residual ≈ 0 → **W9 = G2, three panels.** Change the schedule to 1800/1800/1800 and the width signal carries no information: ordinal alone decides, and the result drops to the ask tier. Correct — we *think* W9 is the middle group, but nothing independent confirms it.

### 4.4 The output contract — four small changes, no migration

**(1) `split.ts:50`** — add the source and the flag:
```ts
source?: "schedule_comment" | "energy_report" | "drawing_set";
ordered?: boolean;   // units are in true left→right order; must not be re-arranged
```
**(2) `split.ts:131`** — branch on the flag, not the string: `if (hint.ordered ?? hint.source === "energy_report")`. **This is load-bearing.** The comment branch drops every `fixed` and re-arranges symmetrically (`:148`, `:159-168`) — a drawing showing `fixed | awning | awning` would silently emerge as `awning | fixed | awning`.
**(3) `split.ts:108` and `:267`** — add `"drawing_set"` to `SplitProposal.basis` **and fix the ternary at `:267`**, which currently hardcodes `hint.source === "energy_report" ? "energy_report" : "schedule_comment"`. Without that second edit a drawing split is recorded in `quote_line.segment_requirement_basis` as a schedule comment — the audit trail would lie about provenance in the one place a post-hoc error analysis looks. No CHECK constraint on that column, so no migration.
**(4) `estimate.ts:297`** — leave `resolveScheduleType` applying to drawing hints (unlike the energy branch), because `fixed` must resolve through the Sanity family alias to a real product.

**Precedence — declared as a function, replacing today's Map-write ordering:**

```
energy_report  >  drawing_set ⟷ schedule_comment (agreement/disagreement rule)  >  default_even
```

- **Drawing and comment agree** on panel count and operation sequence → propose, using the **comment's explicit millimetres** in the **elevation's order**, confidence raised. This is the best outcome in the system and it is what correlation is *for*.
- **They disagree** → **propose nothing.** Record both as a conflict; ask a specific question.
- **Energy components exist** → they win outright, unchanged. The drawing becomes corroboration or a recorded conflict, never an overwrite.
- **Any displacement is recorded.** Today the energy report silently overwrites a comment hint with no conflict row (`pipeline.ts:547` then `:575`) **[verified]** — a fourth claimant makes that untenable, so fixing it is a precondition, not a side effect.

**Evidence.** One row per derived fact, filling the empty columns:
```
entity_path  /openings/op_W7/segments/1/operation
file_id      <plan set>   page_no 8   sheet_ref "S08"
region_json  [0.412,0.208,0.463,0.331]
extracted_text "operable (diagonals, apex top) — S08 group 2, panel 2 of 3; join residual 1.2%"
origin       "geometry_derived"   confidence 0.86
```
**The pre-fit residual must be persisted here**, because `fitReportComponentsToOpening` rescales widths to sum exactly and destroys it.

**Review surface.** New key `drawingSplit` (confident) / `drawingSplitUnconfirmed` (ask), both warning-severity via the deliberate unknown→warning fallback (`configurator.ts:146-149`); register both explicitly rather than riding the fallback. Copy goes through `flagOpening()` → `technicalReviewReasons` → `documentReviewCopy`. **Required fix while doing so:** `proposal.ts:309-319` runs the label lookup only `if (!documentReviewCopy.length)`, so any colon-bearing reason silently suppresses all energy-conflict copy on the same opening. Append, don't replace.

**Customer surface.** Add **only** `drawingSplitUnconfirmed` to `CONFIRM_LAYOUT_REASON_KEYS` (`rowState.ts:49`). Note the header comment there calling the state "deliberately inert" is **stale** — line 107 shows it already fires on `coverageOutOfTolerance` **[verified]**. This adds a second trigger to a live state; it does not switch on a dormant one.

**Basis.** I recommend **not** adding a `drawing_derived` value to `recommendationBasis`. Every entry in `BASIS_COPY` (`ItemComposer.tsx:28-45`) answers *"how was the **thermal** allowance derived"* — a drawing-derived make-up says nothing about thermal. The drawing's provenance belongs in `segment_requirement_basis` (change 3) and in `evidence_items`, not in the thermal trust chip. This corrects a recommendation two of the three proposals made.

### 4.5 The confidence model

**Confidence is corroboration, not self-report.** No score in this design is a number a model emitted.

```
decision ∈ { propose | propose_and_ask | ask | silent }
```

**The gate, stated as a rule:**

> **A drawing-derived split is proposed as final only when the panel count is established by a source other than the drawing.**

Independent second sources are exactly three: the schedule comment, the energy component schedule, or an explicit label on the elevation. **The width check is not one of them** — panel widths are recorded as fractions of the group, so Σ scaled widths ≡ scale × group width, and it corroborates the *join*, not the count. Two of the three candidate designs claimed otherwise; the arithmetic says no.

| Decision | Condition | Effect |
|---|---|---|
| **propose** | join by label, or leave-one-out residual ≤3% with margin ≥2×; every symbol `clarity ≥ 0.8`; **panel count corroborated by a non-drawing source**; no conflict | `SplitHint` written; `review_json.drawingSplit`; normal neutral composite for the customer |
| **propose_and_ask** | as above but panel count is drawing-only, or exactly one symbol ambiguous | `SplitHint` written **and** `drawingSplitUnconfirmed` → the customer sees **Confirm layout**, with `<Elevation parts={…}>` drawing the proposed arrangement |
| **ask** | join unresolved; thin margin with differing make-ups; drawing vs comment disagreement; ≥2 ambiguous symbols; suspected convention mismatch | **no hint**; specific `flagOpening()` sentence; conflict row; escalation trigger `unresolved_tag_mapping` or `frame_decomposition_uncertain` |
| **silent** | tag unrouted, sheet raster, geometry over budget | evidence + document-level issue only |

**Detectability is the real answer, not the score.** `Elevation.tsx` already draws a composite from its real parts, to true proportion, with per-unit symbols. A reviewer comparing that rendering against the sheet falsifies `awning | fixed | awning` in about one second — far faster than parsing a sentence, and immune to a plausible-looking number. **That comparison view is the highest-value UI in this design and it costs almost nothing.**

**Learning.** Every drawing-derived composite is `recommendation_eligible = 0` by deliberate design (`outcomes.ts:110-126`), so corrections are audit-only *unless* we carve out one path: stamp `reason_code` from the **existing** governed taxonomy — `WRONG_TAG_MAPPING`, `WRONG_CONFIGURATION`, `WRONG_DIMENSION`, `SOURCE_OCR_ERROR` — when a reviewer alters a drawing-derived composite. Per-practice convention profiles should be *derived from that table*, because it is the only surface in this system that can see "the reviewer flipped all 14 awnings to hoppers on this producer's sheets."

---

## 5. WHAT IT REFUSES TO DO

1. **Never scales a millimetre off a drawing.** Proportions and order only; the schedule owns dimensions. The 2590/620/2825 chain on Sheet B is a scale sanity check and a storey band, never a sill height.
2. **Never invents a window.** A tag with no schedule row → a project-level discrepancy note, never a priced line. `external_ref` is the only cross-document join key; a drawing-minted tag would create a phantom opening.
3. **Never proposes a final split on drawing evidence alone** — drawing-only lands in `propose_and_ask` and reaches the customer as **Confirm layout**.
4. **Never claims handing, swing direction or slide direction.** Observed, recorded in evidence, never priced — no downstream field, and view-basis inverts the answer.
5. **Never distinguishes awning from hopper in v1** unless the sheet carries a legend.
6. **Never reads double-hung from a mid-rail alone** — geometrically identical to a fixed panel with a transom. Always asks.
7. **Never rasterises server-side, and never degrades into reading a text layer and calling it geometry.** A scanned set with no client-supplied page images simply does not get drawing recognition. `ingest.ts:366-368` is right and this honours it.
8. **Never lets one bad convention become N bad splits** — systematic disagreement withdraws the whole set and asks once.
9. **Never overwrites the energy report's component schedule**, and never silently displaces a schedule comment either.
10. **Never touches the deterministic `/quote` path.** `scheduleMatch.ts` is faithful-reproduce-and-flag.
11. **Never overrides a human edit** — behind the existing `edited_fields` locks and `edit_version` CAS. Note the currently *unguarded* `composite` update at `estimate.ts:370-376` and `splitLine`'s wholesale `DELETE FROM quote_line WHERE parent_line_id=?` need those guards added as part of this work.
12. **Never blocks submission.** Warning severity by construction. The only error-severity "we couldn't" path is `product`, whose copy blames selection, not legibility.

**Stays a human decision, permanently:** whether a proposed arrangement is the arrangement to build; whether a practice's symbol convention should be trusted for future jobs; what to do when the elevation and the schedule genuinely contradict each other; whether a window visible on a drawing but absent from the schedule should be quoted.

---

## 6. STAGED DELIVERY

**Stage 0 — the labelled set (prerequisite, ~1 day of your time).** 20–30 real sheets from 3–5 different practices, with a human-written answer key: for each W-number, the sheet it's on, the panel count, and the operation sequence. Without this, every threshold in §4.5 is invented and no accuracy claim in this document is checkable. This is not a follow-up.

**Stage 1 — the sheet index and the plan tag reader. Ships alone and earns its keep alone.**

No elevations, no symbols, no splits. Just: vectorise sheets, index them by sheet number, harvest tag circles, and produce a deterministic *"which W-number, which room, which wall, which storey"* table.

What that alone buys you:
- **Room and orientation stop being a guess from prose.** Today they come from a model reading flattened text; after Stage 1 they come from a circle's position against a wall. Orientation is the highest-consequence plan-derived field in the system — it reaches the thermal input contract (`worker/lib/estimator/thermal/contract.ts`) → `computeThermalBand` → `requirements_json`, where it fires the `orientation_shgc` rule and makes the requirement `plan_derived`.
- **Roster reconciliation.** "Your schedule has 14 windows; your first-floor plan shows 16 tags; W15 and W16 aren't in the schedule." Today untagged openings are silently dropped at `pipeline.ts:722` before they can ever become a line **[verified]** — the customer is never told.
- **One join primitive.** `normalizeOpeningRef` becomes the single normaliser across `applyPlanContext`, the `splitHints` Map and the new code — fixing the existing silent failure where a plan printing `W-04` against a schedule `W04` drops room and orientation.
- **A scan warning at upload.** "This looks like a scan — we can't read your window arrangement from it; a vector PDF from your designer would let us." O(1) detection, 30-second fix by the customer.
- Zero model spend, zero migration, no elevation risk of any kind.

**~~Guard-rail to ship with Stage 1: route computed orientation into `advisoryRequirements` rather than the hard filter.~~ WITHDRAWN — the premise is stale, and building it would now be a regression** (corrected 2026-08-20 by the thermal-model thread, `docs/specs/thermal-model-backend-design.md` §5/AD-T16). It predated the shipped selection ladder. Under `RULE_VERSION = "v3-energy-objective"` (`rules.ts:19`) **energy never rejects a candidate**: thermal nearness is tiered by the ladder, a `misses` candidate stays selectable, and the shipped criterion TB-36/AC-10 *requires* a computed band to bind exactly as a reported one does. There is no hard filter left to route around, and routing computed orientation into `advisoryRequirements` would make a plan-derived band bind differently from a reported one — which is the thing that criterion forbids. **Nothing was built for this here, and nothing should be.**

What replaces it as the real Stage-1 concern is unchanged in spirit: an orientation this thread cannot attribute must not reach a band. The contract already enforces that — a producer sets `wallOrientation` *and* `wallOrientationSource` together, or the calculation records the input missing and the requirement stays `default_envelope`.

**Stage 2 — panel geometry, no symbols. The safest possible beachhead.**

Read frames and mullions on elevations; fill `configuration.panelCount`, `layoutCode`, `viewBasis`; and — critically — **improve splits that already happen.** `materialiseSplits` fires today on `hint || oversize` (`estimate.ts:269`), and an oversize opening with no hint currently gets `default_even`: N equal units, all inheriting the parent's operation type **[verified]**. For those openings the alternative to a drawing-derived layout is not "no split", it is *an evenly-divided guess*. Replacing a guess with the real mullion positions is strictly better than the status quo, at the lowest possible risk. Everything else at Stage 2 lands in `propose_and_ask`.

**Stage 3 — coarse symbols (`fixed`/`sliding`/`operable`), behind a per-practice profile confirmed by a human on the first job from each new producer.** Ship as `propose` only where panel count has a non-drawing witness.

**Stage 4 — full family vocabulary, per-practice profiles derived from the outcomes table, and the reviewer confirmation loop feeding `WRONG_TAG_MAPPING` / `WRONG_CONFIGURATION`.**

You can stop after Stage 1 and still be ahead.

---

## 7. RISKS

### Risk 1 — a confidently wrong split (the one that matters)

Two mechanisms, both of which produce output that looks *more* correct than a correct-but-uncertain answer.

**7a — mis-joined group.** W9 assigned to its neighbour. The drawing yields a 3-panel make-up for a 2-panel window. That claim goes in with proportional widths, and `fitReportComponentsToOpening` (`split.ts:197-238`) **rescales them to sum exactly to the schedule width**, absorbing the discrepancy into the fixed lite. Result: a composite whose widths add up perfectly, whose parent dimensions are right, whose `coverageDeltaMm` is 0 so `coverageOutOfTolerance` never fires — reaching the customer as a neutral, unbadged composite. *The function that makes the output look correct is the one that destroys the evidence it is wrong.*

**7b — inverted apex convention.** A practice drawing apex-at-latch. Awning ↔ hopper swap across every window on every sheet, each individually maximally confident because the geometry genuinely is unambiguous — only the interpretation is inverted. Per-window confidence scoring is structurally incapable of catching this.

**Mitigations:**
- **Compute and persist the join residual *before* the fit runs**, leave-one-out, and gate on it. The fit must never precede the gate.
- **Assignment margin is a hard refusal**, not a soft score. Where candidates differ and the margin is thin, refuse the whole elevation. Accept a lower proposal rate: the cost of a miss is a question, the cost of a hit is a wrong window built.
- **Do not ship symbol-derived operations until a practice profile is confirmed** (Stage 3, not Stage 2). Coarse vocabulary removes hand and awning/hopper — the two largest instances of 7b — leaving only `fixed` (absence of marks) and `sliding` (a distinct glyph), neither of which depends on the apex convention at all.
- **Set-level withdrawal** on systematic disagreement, and a portfolio sanity check (a sheet reading ≥80% hopper is near-impossible in Australian residential work — flag the *sheet's convention*, not 14 windows).
- **The per-sheet human confirmation gate**, which is the only mechanism that catches 7b at all. One glance per sheet, not per line, and it produces Stage 0's labelled rows as a by-product.

### Risk 2 — CPU exhaustion killing the customer's whole extraction run

`getOperatorList()` parses the entire content stream, unlike `getTextContent()`. A dense A1 sheet is 50k–500k path ops. `wrangler.jsonc:8` sets `limits.cpu_ms: 60000` and the isolate cap is 128 MB; **an overrun terminates the invocation rather than throwing**, so no graceful `drawing_is_raster`-style issue is ever written, and with `MAX_AUTOMATIC_ATTEMPTS 1` the retry dies identically. `getOperatorList` gives no way to know a page's size before parsing it.

**Mitigation:** Stage A runs as its own per-file invocation at upload time — *not* inside `runAiExtraction`, whose only guard is a `setTimeout` that cannot fire while synchronous JS holds the isolate. Hard cumulative op-count and elapsed-ms budget, checked at page boundaries, degrading a page to `geometry_unavailable`. One page in memory at a time, reduced to primitives, `page.cleanup()` after each, R2 read-back cache so it is paid once per file rather than per run. A kill then costs a drawing index, not a customer's quote. And Stage 0 should produce real CPU-ms and peak-memory numbers from your two supplied sheets before Stages B–E are scoped further.

### Risk 3 — this becomes another extract-store-never-consume field

The precedent is discouraging and it is in this exact subsystem: `northRotationDeg`, `conditionedFloorAreaM2` and `shading.verticalFeature` are all extracted, clamped, persisted and read by nothing. `layoutCode` is populated from schedule text today and read by nothing. `evidence_items.sheet_ref` and `region_json` have existed since migration 0016 and are written `null` at every call site.

**Mitigation:** every stage must name its consumer before it ships, and the acceptance test is a *human-visible* change, not a populated column. Stage 1's consumer is orientation/room + the roster reconciliation message. Stage 2's is the oversize split that currently defaults to even. And the evidence rows are only worth writing if the ops record actually renders the page crop — `opsLineDto` does not select them today, so **widening that DTO and rendering the crop is in scope, not a follow-up.**

---

## 8. QUESTIONS FOR THE OWNER

**Q1 — May a drawing-derived split ever auto-apply, or must every one be confirmed?**
 (a) Never auto-applies; every drawing-derived composite badges **Confirm layout**. (b) Auto-applies when the panel count is corroborated by a second, non-drawing source; drawing-only lands in Confirm layout. (c) Always auto-applies; technical review catches errors at submission.
 → **Recommend (b).** (c) is unsafe for the reason in §7a — a mis-join produces a perfectly-reconciling composite that no existing check flags. (a) is safe but badges every drawing read, which `rowState.ts` explicitly warns against and which trains customers to click through. (b) draws the line exactly where the evidence does.

**Q2 — When the elevation and the schedule table disagree on make-up, what happens?**
 (a) Drawing wins — it is a picture of the thing. (b) Schedule wins — it is the contractual document. (c) **Agreement proposes; disagreement proposes nothing and asks a specific question.**
 → **Recommend (c).** Ranking two architect-authored sources is a coin flip dressed as a decision. Agreement is the product; disagreement is a question worth a reviewer's 20 seconds. Adopting (c) also forces precedence to be written down as a function, which fixes the existing defect where the energy report silently displaces a comment hint with no record.

**Q3 — Vector extraction or vision-model reading?**
 (a) Vector only (`getOperatorList` in the Worker). (b) Vision only — rasterise in the browser at upload, reuse the proven image path. (c) **Vector primary, client-side rasterisation as the scanned-set fallback.** (d) Provision Browser Rendering.
 → **Recommend (c), vector first.** Your supplied sheets are vector CAD, and for vector a mullion *is* a line segment and a tag circle *is* an arc path — geometry is strictly more precise than pixels, costs no model call, and needs no binding. (b) alone can't distinguish a mullion from a downpipe as reliably and pays a model call per sheet forever. (d) costs money and buys nothing (a) doesn't. Add (b) only when you start receiving scanned sets — and only for those.

**Q4 — Drafting conventions that vary between practices: how are they handled?**
 (a) Hard-code the `Elevation.tsx` convention and accept the error rate. (b) Detect a systematic mismatch, auto-flip the profile, re-derive, propose with a note. (c) **Detect, withdraw every drawing-derived split for that set, ask once; store a human-confirmed per-practice profile for next time.**
 → **Recommend (c).** (b) is a systematic error wearing a confident face — the exact failure of §7b, applied deliberately. (c) costs one question per new practice and is permanently safe. The long-run target is per-practice profiles *derived from the corrections corpus*, but that needs corrections first.

**Q5 — Do you supply the labelled set (20–30 sheets, 3–5 practices) before the build starts?**
 (a) Yes, before. (b) Yes, alongside. (c) No — ship and learn from reviewer corrections.
 → **Recommend (a), strongly.** Under (c) the only feedback is a manual, lagging diff at revision issue that is structurally excluded from learning, and every threshold in §4.5 stays an invented number. This is the single cheapest input you can give and it gates everything.

**Q6 — Does the reviewer get the page crop beside the rendered arrangement?**
 (a) Yes — widen `opsLineDto`, render the stored region beside `<Elevation parts={…}>`. (b) No — the review sentence is enough.
 → **Recommend (a).** It is the only mechanism that catches a systematic misread, it is ~two seconds of a human's attention per sheet, and both halves already exist. Without it, `evidence_items.sheet_ref` and `region_json` become the fourth field in this subsystem that is written and never read.

**Q7 — Where does drawing recognition run relative to the AI job?**
 (a) Its own per-file invocation at upload, R2-cached. (b) A fourth concurrent skill group inside the 120s job. (c) A separate queued job after extraction.
 → **Recommend (a).** §7's risk 2 is the reason: a CPU overrun inside the AI job kills the customer's whole extraction with no diagnosable failure. (a) also makes the cache structural rather than optional and lets the page budget be tuned on evidence.

**Q8 — Stop-after-Stage-1?**
 (a) Approve Stages 0–1 now; decide on 2–4 after seeing the tag reader against your real sets. (b) Approve the whole programme. (c) Approve Stage 0 only.
 → **Recommend (a).** Stage 1 has no elevation risk, no symbol risk, no model spend and a real payoff (deterministic orientation, roster reconciliation, one join primitive, an upload-time scan warning). It also produces the CPU numbers that decide whether Stages 2–4 are affordable — which nobody currently has.

---

**Files this design would touch (none edited).** New: `worker/lib/drawing/{sheetIndex,tags,frames,symbols,join,confidence}.ts`, `worker/lib/ai/correlate.ts`, `worker/lib/estimator/skills/elevationSymbols.ts` (fallback only). Modified: `worker/lib/estimator/split.ts` (source, `ordered`, basis, and the `:267` ternary), `worker/lib/ai/pipeline.ts` (projection block beside `:540-554`, evidence writes, `configuration` fields), `worker/lib/ai/ingest.ts` (sheet index, raster detection at upload), `worker/lib/ai/proposal.ts` (review-copy concatenation fix at `:309-319`), `worker/routes/ops.ts` + `src/ops/ProjectRecord.tsx` (evidence crop), `src/components/quote-project/rowState.ts` (one array entry), `worker/lib/estimator/estimate.ts` + `worker/lib/composite.ts` (add the missing edit guards). **No migration required.**