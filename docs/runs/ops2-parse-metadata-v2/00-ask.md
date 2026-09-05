# ops2-parse-metadata

## The ask, verbatim (owner, 2026-09-02)

> AI parsing audit for ops.
>
> Currently, the latest iteration of AI parsing emits additional information and
> artefacts that are not surfaced anywhere, such as heading, elevation, crop
> image, maybe something else. Part of this information (Thermal targets)
> already exist in the "why this product" but it would be very useful to be able
> to see all that information in ops2 to check the accuracy of the parsing.
>
> The plan is:
>
> * introduce tabs within item/line detail view:
>   * Opening, containing the current information
>   * Metadata (or whatever other good name) that would contain information
>     attributable to parsing.
>
> full small feature, although UI should be reused and UX - described above.

## Actors and needs

**Ops staff reviewing a project before it is quoted.** They need to answer one
question about a line: did the parser read this opening correctly? Today they
cannot — the heading, the elevation, and the crop the parser worked from are
written to D1 and R2 and shown nowhere. The check they most want is the
cheapest one: look at the picture the parser cut out of the customer's PDF, and
see whether it is the opening the line claims to be.

This is a developer-focused diagnostic surface, in the owner's words. It is not
a place work gets done. Nothing on it is editable, ever.

## What the parser already emits, and who reads it today

Established by audit of `feat/plan-parse-conformance` (this run's base,
`9eb1ca1a`) before the run was started. The spec stage does not need to
re-derive any of this.

Persisted per opening in `drawing_reading` (migrations `0060`, `0061`), keyed
`project_id` + `external_ref`, one row set per `ai_run`:

| Column | What it holds |
|---|---|
| `orientation` + `orientation_state` | `N`…`NW` — the owner's "heading" |
| `elevation` + `elevation_state` | the elevation label the opening was read on |
| `split_json` + `split_state` | axis, unit roles/ratios/operations, derived widths |
| `room_label` + `room_state` | already surfaced on the line today |
| `crop_key` | R2 key, `projects/<id>/crops/<runId>/<tag>.png` |
| `page_no`, `sheet_ref`, `region_json` | the frame box, as page fractions |
| `confidence`, `flags_json` | `high`/`low`; `duplicateFrame`, `drawingInconsistency`, `northAssumed`, `notVisibleOnElevations`, `agentEvidenceWeak`, `scheduleDrawingMismatch`, `manufacturability` |
| `gap_code`, `gap_note` | why an opening was not read; and, on this parser, the agent's `basis` sentences, its `note`, and `storey` `|`-joined into `gap_note` (1000-char cap) |

Each of the four facts carries its own `value` / `not_stated` / `not_read`
state, by deliberate schema design: "the drawings do not say" and "we did not
read it" are different answers and must stay different on screen.

Also persisted, per run: `ai_runs.drawing_report_json` — per-file step counts
(inventory, strategy, pages selected and read, elevation regions, crops made,
reads attempted/returned/declined, placements from text vs model fallback,
unplaced, `northAssumed`, `failedPhase`), wall ms, model calls, container
calls, inspect timings, and a per-opening outcome list.

**Current readers: none.** No HTTP route reads `drawing_reading` or
`drawing_report_json`. Only `scripts/drawing-gate.mjs` reads them, going
straight to D1. `worker/lib/drawing/contract.ts` says so in its own header.
Orientation reaches staff only indirectly, as an input to the thermal band
behind "Why this product". Room label reaches the line.

## This reverses a recorded descope, deliberately

`docs/runs/plan-parse-method/02-design-v2.md` §6 cut the ops surface on an
owner ruling of 2026-08-29 ("there should be nothing new in ops... No display
of crops at this point"). §6.2 named the resulting gap — ops cannot see what a
reading said, which openings were read, or where readings disagreed — and §6.3
listed the acceptance criteria orphaned by the cut: AC-2, AC-3, AB-4, and spec
§2.1's "ops-visible output". The design also states the table was shaped so
that view is "a SELECT away". This run builds that view. AC-2/AC-3/AB-4 should
be treated as this feature's inherited criteria rather than written afresh.

## Constraints found in the code, for the design stage

1. **Crops are purged.** `purgeProjectCrops` fires on quote issue
   (`worker/lib/issue.ts:299`), source-file delete (`worker/routes/files.ts:536`)
   and re-parse (`worker/routes/parse.ts:261`). Reading rows survive; the pixels
   do not. On an issued quote or an order the tab must say the crop is gone and
   why — never render a broken image, and never imply the reading is missing
   because its picture is.
2. **`evidenceView` is never persisted.** `fullDocumentAgent` produces
   `elevation` | `detail` per proposal; `persistReadings` has no column for it.
   Surfacing it needs a migration. `storey` survives only as text inside
   `gap_note`.
3. **A line's rationale panel is withheld on orders** (`LinePage.tsx`,
   `isOrder`). Whether parse metadata follows the same rule is a decision, not
   an inherited one: the readings are evidence about a drawing, not pre-issue
   reasoning.
4. **Readings are per-run.** A project re-parsed twice has two row sets. Which
   run the tab shows — latest, or a chooser — is a decision.

## Reuse points, so nothing is invented twice

- `GET /api/ops/projects/:id/lines/:lineId/rationale` (`worker/routes/ops.ts:734`)
  is the precedent for a per-line staff-gated read: `resolveStaff` +
  `hasAssignedRole`, then a project-scoped SELECT so that "this line is in
  another project" and "this line does not exist" are one code path and one
  sentence.
- `src/ops2/projects/useLineRationale.ts` is the precedent for the client hook.
- `LineReview.tsx`'s `Panel` (budgeted, enforced in code) and
  `src/ops2/chrome/RowList.tsx` are the presentation primitives. No new panel
  style.
- `src/ops2/projects/lineRoute.ts` already gives `/drawing` and `/why` their own
  addresses under a line; a tab that is an address is the established grammar
  here, not a novelty.
- There is no tab component in `src/ops2/chrome` today. Ionic's `IonSegment` is
  already a dependency and is the cheapest thing that holds.
- `worker/routes/ops.ts:2275` (`/files/:id/download`) is the precedent for
  streaming an R2 object behind the staff gate.

## Explicitly asked for

Reused UI, not new UI. "Full small feature" — the whole pipeline, on a scope
that stays small.

## Grill conclusions

Twenty-two decisions, owner-answered 2026-09-02. These are binding. Where one
of them contradicts a recommendation made during the grill, the owner's answer
is what stands and the recommendation is void.

### The surface

1. **Read-only, permanently.** Not "read-only for now": the DTO is not to be
   shaped so an edit lands later either. Corrections to a parsed fact are a
   separate feature with their own decisions about precedence, if they are ever
   wanted. (Q1)
2. **Two tabs on the line detail page: `Opening` and `Metadata`.** The owner
   considered and kept "Metadata" over "Parsing". (Q7)
3. **`Opening` is today's page, unchanged to the pixel** — plate, size,
   specification, "Why this product" door, price, customer's words. The tabs sit
   above it, not inside it. (Q13)
4. **Tabs follow the Projects list, not a boxed segment control.** Unboxed word
   labels in the white band shared with the title, passed through `OpsPage`'s
   existing `controls` slot; `.pq-chips` / `.pq-chip` already exist. An earlier
   recommendation of `IonSegment` is void. (Q13)
5. **`/meta` is a real address** through `parseLineRoute`, alongside the line's
   existing `/drawing` and `/why`. (Q6)
6. **No count and no alert dot on the tab**, even when the reading is flagged or
   absent. Defaulted by the assistant, owner-confirmed. (assumption, confirmed)

### The three panels

7. **Panel 1 — Image.** The crop the parser cut from the customer's PDF. This is
   the artefact ops most wants; it is first for that reason. Note for anyone
   reading this later: it is NOT our synthetic elevation drawing, which is a
   different picture that already appears on the `Opening` tab. (Q2, Q5)
8. **The image panel is not a door and has no enlargement.** Inline in the tab
   at the panel's width. The owner considered an expansion when openable panels
   were introduced at Q17 and declined it. (Q5, Q19, Q20)
9. **Panel 2 — this line's reading.** Summary: heading, elevation, room,
   confidence, whether there are flags. Behind the door: all four facts with
   their states, the split units, the flags in full, the reader's own reasoning,
   source file, page, sheet, region. (Q2, Q19)
10. **Panel 3 — this run.** Summary: when the run happened and what became of
    THIS opening. Behind the door: the full step counts for the document this
    reading came from — that document only, never all files in the run. The
    owner accepted that this panel repeats identically on every line of a
    project, judging the repetition cheap. (Q2, Q8, Q19)
11. **Panels 2 and 3 are `OpenablePanel` doors; their expansions are
    `SidePanel` with `phoneForm="screen"`**, at nested addresses `/meta/reading`
    and `/meta/run`, so backing out of an expansion lands on the Metadata tab.
    This is the "Why this product" mechanism reused whole — no new component.
    (Q17, Q19, Q21)
12. **A door is present even when its expansion is empty**, and the expansion
    names what is missing. This follows the owner's earlier "Why this product"
    ruling — a chevron that appears and disappears per line is the "what-if"
    that ruling was against — and overrides `OpenablePanel`'s own doctrine of no
    door on a panel that opens nothing. (Q22)

### What is shown, and how plainly

13. **The stored state words go on screen as they are** — `not_stated`,
    `not_read`. No crafted per-fact sentences. Owner: *"it is genuinely
    developer focused information. The most ops would look for is the image.
    Make it as simple and as cheap as possible."* This is cheaper than crafted
    copy AND still keeps `not_stated` and `not_read` distinct, which the schema
    exists to preserve. (Q11)
14. **The reader's own reasoning is shown**, split on the `|` separator into its
    parts rather than rendered as one 1000-character string. It is the only
    place the parser explains why it read what it read. (Q12)
15. **No truncation and no line budget on these three panels.** Flags are
    bounded at seven possible values and the reasoning text is capped by the
    writer, so both lists are bounded at the source. This is a DELIBERATE
    departure from `LineReview`'s `Panel` budget doctrine — a diagnostic panel
    that hides the eighth fact is the one thing this tab must not do. A reviewer
    should read it as a decision, not an oversight. (Q17)
16. **When there is no image, name the actual reason from `gap_code`** — never
    a broken image, never a generic "no image". "Not visible on elevations" and
    "render failed" send a staffer to two different places, and the reason is
    itself the audit finding. (Q9)

### Scope of the data

17. **Latest run only.** Re-parses match lines by tag and update them; readings
    are not history and get no history UI. Owner: *"Extra runs generate extra
    lines, not history. Should not generate history."* Older row sets stay in
    D1 untouched. (Q3)
18. **The tab appears on any line that came from a parse, including — and
    especially — a line the parser produced no reading for.** "The parser
    produced nothing for W07" is the most valuable thing this tab can say, and
    it is exactly the fact that vanishes if an empty tab hides itself. Panel 3
    still shows real content in that case. (Q10, Q18)
19. **The tab is absent on manual lines.** There is no parser claim to audit.
    (Q10)
20. **The tab dies with the crops.** Same three triggers as crop retention:
    quote issued, quote deleted, draft cleared. Owner: *"that's for audit
    purposes to validate information. Irrelevant once the quote is out."* One
    rule, matching the data's own lifetime, rather than two that can drift.
    (Q4, Q14)

### What is not being built

21. **No migration.** `evidenceView` (elevation vs detail) stays unpersisted and
    is recorded as a known gap; `storey` arrives free inside the reasoning text.
    A schema change plus a backfill question, to add one word to a
    developer-focused panel, is not the cheap version. Additive column later if
    it proves to explain a class of bad reads. (Q15)
22. **No UX stage and no design polish stage.** Owner: *"no stages. it's just
    tabs and a few panels - everything pre-exist design/component-wise."* The
    run has `ui off` set. This is an owner ruling, not a skipped stage.
    Composition only: `OpsPage.controls`, `.pq-chip`, `OpenablePanel`,
    `SidePanel`, `lp-panel`. (Q16)

### Facts established during the grill, so nobody re-derives them

- Units of a composite (`W01A`, `W01B`) have no `external_ref` of their own, so
  a reading always belongs to the parent line. There is no unit-level tab.
- Re-parse resolves manual-vs-schedule tag collisions explicitly rather than
  duplicating rows, which is why decision 17 is safe.
- `OpsPage` already accepts a `controls` node and renders it in both the phone
  and desk layouts.
- `SidePanel` with `phoneForm="screen"` is full screen on the phone and a 520px
  right-hand slide-out at the desk. The desk width was named to the owner as a
  limitation before decision 8 was taken.

### Known risk carried into the build

`E:\Projects\amj-parse-conformance` holds uncommitted work on `enrich.ts`,
`fullDocumentAgent.ts`, `pipeline.ts` and `selectPages.ts` at this run's base.
Nothing in that diff changes what is persisted, so this design stands; if that
work later changes the reading schema or the report shape, this run's design
needs re-checking before it is accepted.
