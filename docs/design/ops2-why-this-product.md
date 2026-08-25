# ops2 "Why this product" — DESIGN

**Date:** 2026-08-24 · **Stage:** pipeline stage 2 (architect) · **Revision 2**
**Spec:** `docs/specs/ops2-why-this-product.md` (rev 8, binding).
**Rulings:** `docs/specs/ops2-why-this-product-grill-conclusions.md` (R1–R24, binding),
plus the mock-gate rulings R25–R27, the R28 scope cut, and **R29** (the Why detail is a
node in the navigation tree — owner ruling relayed 2026-08-24; the architecture it forces
is ruled in §4.8).
**Revision 6 (Phase 2 conformance record)** reconciles this design with the Phase 2
diff as verified: the viewer's units block and the `ViewerSubject` extensions (D10, the
approved mock) are absorbed into §4.6, `Elevation.tsx`'s opt-in `unitDims` (owner, UX
gate 5) and the two pure route/subject modules join the index, and §7's placement of the
one-viewer/legend-export assertions is corrected. See §11 for the full record.
**Revision 5 (conformance record)** reconciles this design with the Phase 1 diff as
verified: CERT-AC-10's fence is amended for two JSON snapshot builders (§10.1), the
orphaned `source` caption chain and the Panel markup repair are brought into the index
(§10.2-10.3), and §2.6's third allowlist entry is struck — the claim behind it was
executed and found false. See §10 for the full record.
**Revision 4** closes the Phase 1 gap the developer correctly refused to close
silently: the catalogue importers re-stamp `certified`/`dataSource` on every run, so the
strip had an expiry date. Ruling: **the importers come into Phase 1** (§4.1 addendum),
CERT-AC-3's scan widens to the whole live source with a refined predicate (§2.6), and
the strip run gains a pre-flight self-check so a stale checkout is refused at the point
of harm.
**Revision 3** applies the owner's two navigation verdicts: the detail's URL is
confirmed, and the drawing viewer is **overturned from modal to tree node** — under his
literal rule, *only a decision dialog that asks a question and returns an answer is a
modal*. The viewer's mechanism (a real route segment) is ruled in §4.8; VIEW-AC-2's
amendment is specified for the PM in §2.5.
**Revision 2** removes everything R28 cut (the "Change the product" control, the
`LineEditStub`, the `/edit` route and its abuse case), aligns with spec revisions 5–8
(merged refusal criteria, renumbered abuse cases, R25 no-notation, R26/R27 panel
changes), and adds the §4.8 navigation-model ruling with the one coherent `SidePanel`
change.
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

### 1.4 The capture fires when the pick moves — never on a save that leaves it untouched (ruled 2026-08-25)

Raised by the developer mid-Phase-3a and, independently, by the Codex review ("label-only
ops edits can erase a valid thermal snapshot during a catalogue outage"). §4.2's original
W1 note — "Manual: best-effort resolver", unconditionally — was wrong, and not merely
ugly: **re-resolving on a save that did not move the pick breaches SNAP-AC-9.** A
room-label edit that re-resolves against today's catalogue recomputes a captured
snapshot whenever the catalogue has moved since capture; the same edit during an outage
overwrites a good capture with present-and-null — asserting "the catalogue has no figure
for this product" on a save that never successfully asked. The blast radius was wider
than the reported ops branch: the customer save loop (W3) rewrites every ordinary line
on every project save, and the aiManaged material branch (W2) re-resolves on dims-only
edits — one autosave during an outage would have nulled a whole project's captures.

**The rule, one sentence: figures move when and only when the pick moves.**

- **The pick** is exactly the resolver's inputs: `product_slug`, `selected_variant_id`
  and `options.glazing` — the glass identity every pricing path already reads
  (`lib/lines.ts:164`). An option the resolver never consults (colour, hardware)
  cannot move the figures, and a pick that names no variant does not move the variant
  term — only an explicit, different `variantId` does (restore).
- **Pick unmoved** → the save carries `performance_figures_json` forward **verbatim**:
  figures stay figures, present-and-null stays present-and-null, and a pre-capture
  `NULL` stays `NULL`. No catalogue read for that line — and **no opportunistic
  backfill** of pre-capture lines on touch: figures fetched at edit time for a product
  selected months earlier are a display-time catalogue read wearing a snapshot's
  clothes (the same reasoning as SNAP-AC-10), and they would blur the three states.
- **Pick moved** → resolve fresh, best-effort. A failed resolution stores
  present-and-null — here, and only here, that is the honest fact: the stored figures
  describe a configuration the row no longer has, and a stale figure a reviewer trusts
  is exactly what the ambiguity rule exists to prevent. This is the half that
  "never overwrite a good value with null" gets wrong, and why that shape is rejected
  (§8).
- **The predicate lives once**, in `worker/lib/figures.ts` (`captureFigures`, §4.3),
  never re-derived at the call sites that have a stored row in hand.

What this sharpens rather than weakens: present-and-null now always means "at the
moment this pick landed, no figure could be established" — a cleaner fact than the
as-built "at the row's most recent touch, possibly of an unrelated field, the catalogue
happened to be unreachable". The three states stay distinguishable; the write stays
incapable of failing a save; every SNAP-AC-2-scanned statement still names the column —
only the derivation of the bound value changes.

Spec ripple (routed via §9 to the product-manager, not edited here): SNAP-AC-1's "sets
or changes" sharpened to "the stored pick actually differs after the save"; SNAP-AC-6's
"stored as null" scoped to saves that moved the pick; optionally one new negative
criterion — present-and-null is only ever written by a save that moved the pick.

### 1.5 A singleton answer set is not ambiguity (ruled 2026-08-25)

With no variant named and no glazing chosen, a product offering **exactly one**
published variant resolves to that variant — upheld as the developer built and pinned
it. §4.3's `ASSUMED:` (an ambiguous resolution stores null rather than a guess) governs
a *choice among alternatives*; a singleton set involves no choice: every completion of
the underspecified pick lands on the same variant, so the stored figure is a fact of
the catalogue, not a guess about the pick. It is the same logic as "glazing chosen,
exactly one match survives" with a coarser filter — what decides is the size of the
surviving set, never the specificity of the question. **Ambiguity, and its null, begin
at two surviving variants.** Ruling the other way would null figures on precisely the
products where the catalogue's answer is most certain (single-variant products are
common in both the thermal-profile and legacy shapes). If the product later gains a
second variant, earlier captures remain correct as of their moment — that is what a
snapshot is (SNAP-AC-9). Vetoable at acceptance together with the ambiguity rule, as
one pair (§9).

### 1.6 Derivation writers: a validated re-derivation is a capture moment (ruled 2026-08-25)

Raised by the developer as W1's residual: the aiManaged branch still re-derives
figures on an unmoved pick, and if the catalogue moved since capture, a room-label
edit on an AI line silently updates them — no outage required. The re-walk for this
ruling found the same letter-breach in two writers nobody had questioned: **W7**
writes present-and-null on a pick `pickMoved` calls unmoved (product and glazing
untouched, the variant NULLed in the same statement), and **W9** refreshes figures
whenever an estimator re-run re-picks the same variant after a catalogue change.
Ruling site-by-site would have left those two for the tester to find.

**The ruling: there are two kinds of writer, one honesty invariant.**

- **Best-effort writers** (W1-manual, W2–W5, W10–W15) must succeed even when the
  catalogue cannot answer. For them, re-resolving an unmoved pick can only degrade or
  lie, so §1.4's predicate governs: carry when unmoved, resolve fresh when moved.
- **Derivation writers** (W1-aiManaged, W6–W9) ARE the derivation: the figures come
  from the same validated or estimator-selected in-memory variant that produces the
  product, price and both snapshots in the same statement. They have **no failure
  channel that can write a dishonest absence** — W1-aiManaged refuses (409) before any
  write when the catalogue will not answer (pre-existing); W6/W7's present-and-null
  literals are the deliberate record of "evaluated, nothing chosen"; W8/W9 write
  exactly what the estimator just selected. For them the pick-moved predicate is the
  **wrong condition**: dims/qty edits do not move the pick but must reprice, and
  carrying figures alone while `configuration_snapshot_json`, `pricing_snapshot_json`
  and `line_total` re-derive in the same statement would split one capture moment
  across adjacent columns — the same variant described at two different times, which
  is the disagreement one-place-per-fact exists to prevent. A derivation writer's save
  is a capture moment by its own contract, whether or not the pick moved.

SNAP-AC-16's second sentence ("a save that did not move the pick … writes no
present-and-null, figures byte-identical") is exact for best-effort writers and admits
no exemption as written — so the exemption must be **granted by the spec, not assumed
by the code**. Routed to the product-manager (§9): scope SNAP-AC-16 (and SNAP-AC-9's
application) to best-effort writers, with derivation writers named as a class —
currently exactly W1-aiManaged and W6–W9 — whose figures may re-derive at a validated
save because every value they write comes from a successful selection, never from a
failed ask. Its first sentence's "failed to resolve" also under-counts the honest
authors of present-and-null: a moved pick can successfully resolve a published variant
that genuinely carries no figures, and the estimator's literals are deliberate.

**The residual, named rather than hidden:** an ops edit of an AI line refreshes price,
snapshots and figures to the current catalogue even when nothing material changed.
That is the branch's pre-existing contract — the price did this before Phase 3a
existed — and whether non-material ops edits should re-validate at all is a product
question about that branch, not a figures defect. Not this phase's scope; not carried
as a defect. Rejected alternative: conditioning the whole branch on a new
"material change" predicate (§8).

---

## 2. Spec corrections routed back (not designed around)

1. **RESOLVED in spec rev 5.** This design's revision 1 found that "anonymous → 401,
   customer → 403" was unimplementable (a signed-in customer is indistinguishable from an
   anonymous caller on an ops route — customer sessions never authenticate them). The
   spec's X-AC-1/X-AC-2 now assert the console's uniform refusal and the
   indistinguishability itself, which is what this design implements: no ops identity →
   `403 {"error":"forbidden"}`; ops identity failing `hasAssignedRole` →
   `403 {"error":"forbidden_role"}` (the `ops.ts:994` convention).
2. **RESOLVED in spec revs 5–8.** Revision 1 found six writer sites the spec's §7.4
   index missed; the spec has since replaced the counted index with the property-based
   SNAP-AC-2 scan (no count, cannot pass vacuously) and defers the concrete index to
   §4.2 below, which remains the developer's hand-off list of record.
3. **WHY-AC-38's fact has exactly one stored home**: the sentence `flagForReview` writes
   into `quote_line.review_json.composite` (`worker/lib/estimator/estimate.ts:378`,
   `:426-431`). `SelectionOutcome` does not carry `splitNote` (the contract forbids
   sentences). The detail therefore states the fact from `review_json.composite`;
   if staff have since resolved that review flag, the trace is gone and nothing is
   stated. **Named residual** — acceptable under R18/D5 (no backfill, leave history);
   the AC's fixture must carry the unresolved flag.
4. **R29 is not yet in the spec.** The owner has ruled the Why detail into the
   navigation tree (*"dismiss == back button on the Why this product screen, it is part
   of the tree… Everything that is not modal - has back an action plus whatever gesture
   it lives with as standard."*). WHY-AC-7a and WHY-AC-39 still name an **X** as the
   dismiss (R27); for this surface R29 supersedes that with a **back control**, and adds
   facts the criteria should pin: the detail's own URL, browser/hardware back closing
   it, and a deep link landing correctly. **PM to fold R29 in**; §4.8 below is the
   architecture it gets.
5. **VIEW-AC-2 is now exactly backwards.** It asserts the viewer closes with
   `history.length` unchanged; the owner has since ruled the viewer a tree node with
   back (cost named and accepted: leaving a line after an enlargement takes two backs).
   The criterion must assert instead, per the §4.8 mechanism: **(a)** activating a
   drawing pushes exactly one history entry and the address becomes the drawing's own
   URL (`…/line/:lineId/drawing`, or `…/drawing/u2` for a unit); **(b)** the back
   control, Escape and the system back gesture perform the same single history pop —
   the line page's URL returns, the page is not remounted and no record re-fetch
   occurs; **(c)** a cold deep link to a drawing URL renders the line page with the
   viewer open, and its back control then *replaces* to the line path rather than
   popping out of the console; **(d)** a malformed or out-of-range drawing suffix
   normalises to the line path by replace, growing no history. VIEW-AC-9 (the record
   row opens no viewer) is unaffected.
6. **CERT-AC-3's scope excluded half the writers, and CERT-AC-7 had an expiry date.**
   Found post-implementation: `scripts/catalogue/import-wers.mjs:135` writes
   `certified: true` onto every thermal-profile row and
   `scripts/catalogue/derive-estimator-fields.mjs:112-113` writes
   `dataSource: "estimated", certified: false` onto every derived variant — so the
   depth-(c) strip holds only until the next import, which defeats the owner's stated
   intent (stop the field being re-populated by someone assuming it still matters) more
   thoroughly than a person would. **PM to amend Phase 1's criteria:**
   - **CERT-AC-3, scope**: the scan covers **all live source** — `worker/**`, `src/**`,
     `scripts/**` and `sanity/**` — not the three named paths. Forbidden, with comments
     stripped: `isCertified`, `energyCertified`, `certified` as a field name or written
     value, and `dataSource` **when valued `"certified"`, `"estimated"` or
     `"manufacturer"` or written/projected on a performance variant or thermal-profile
     row**. Bare `dataSource` in other senses survives deliberately — dimension-rule
     provenance (`worker/lib/estimator/types.ts:77`) is a different concept and must
     not be swept in. Named allowlist, each with its reason: `scripts/tests/**`
     (CERT-AC-9 fixtures and the scan's own patterns);
     `sanity/scripts/strip-certified.mjs` (must name the fields it deletes).
     **A third entry — `src/ops/api.ts` as an untouched historical reader — was struck
     during implementation**: the tester executed the claim and it was false. This
     phase deleted both producers of `OpsThermalProposed.source`, so the "historical"
     caption would have meant two different things depending on write date; the reader,
     the route field and the type member were deleted instead (§10.2). The lesson is
     recorded in the spec and in the suite: an allowlist entry is a claim, and a claim
     inside a security-adjacent scan deserves a test rather than a sentence.
   - **New CERT-AC-12 (durability)**: *Given* the strip has run, *When* any catalogue
     import or derive script runs, *Then* no document regains a `certified` or
     `dataSource` field — proven behaviourally where the script exposes a pure builder
     (`derive-estimator-fields`), by the widened source scan everywhere.
   - **CERT-AC-10, for the importers**: `scripts/catalogue/**` are operator-run
     Sanity maintenance scripts — the same artifact class as `strip-certified.mjs`,
     already in the phase; they are inside the fence, not an exception to it. The
     fence itself was later amended on other grounds (two JSON snapshot builders whose
     source fields this phase deletes — §10.1); the amendment is recorded in the spec
     rather than the criterion silently rewritten.

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
   moment of save — a snapshot, never a lookup; figures move when and only when the
   pick moves (§1.4); distinct from the recommendation's record (the candidate
   outcome).
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

**Addendum (revision 4, post-implementation) — the catalogue importers come into
Phase 1.** A Phase 1 that ships with a known expiry date is not Phase 1: the strip's
whole point (owner, depth (c)) is that the field cannot come back, and an importer that
re-stamps it automatically is worse than the human the owner was guarding against. The
phase's discipline survives for the importers — operator-run Sanity scripts, not save
paths — though CERT-AC-10 itself was later amended for two JSON snapshot builders this
addendum did not foresee (§10.1) — and after CERT-AC-6 the Studio schema no longer declares
the fields, so an importer writing them would be creating data the Studio cannot even
display. Four sites:

| File | Change |
|---|---|
| `scripts/catalogue/import-wers.mjs:135` | drop `certified: true` from the thermalProfileRow it builds; `wersWindowId` and `certificationRef` stay (they are the kept facts) |
| `scripts/catalogue/derive-estimator-fields.mjs:112-113` | drop `dataSource: "estimated", certified: false` from every derived variant |
| `scripts/catalogue/populate-estimator-fields.mjs:62-64` | `hasProtectedPerformance` loses its three `certified`/`dataSource` clauses (including `"manufacturer"` — same dead vocabulary); the surviving `_key !== "std"` clause alone still protects hand-authored variants (developer-verified) |
| `scripts/catalogue/readiness-report.mjs:32` | drop `dataSource, certified` from the GROQ projection; `certificationRef`, `published` stay |

**The value-stripping run** (`sanity/scripts/strip-certified.mjs`, precedent:
`sanity/scripts/remove-legacy-dimension-fields.mjs`):

- Dry-run by default; writes only with `--apply`.
- **Export gate (CERT-AC-8, X-AC-11):** requires `--export <path>`; refuses and writes
  nothing unless the file exists, is non-empty, and its mtime is within 24 h. The check
  runs before any client is constructed, so the refusal is testable offline by invoking
  the script with no/stale args and asserting a non-zero exit and no network.
- **Re-population gate (rev 4, same refusal discipline):** before writing, the script
  scans its own checkout's `scripts/catalogue/*.mjs` for a `certified` or `dataSource`
  field write and refuses if one exists — so a strip run from a stale branch that still
  re-populates is refused **at the point of harm**, not discovered later in a design
  doc. Offline, a few lines, testable the same way as the export gate.
- Strips: `certified` and `dataSource` from every `performanceVariants[]` item;
  `certified` from every thermal-profile row. Touches nothing else; `certificationRef`
  and `wersWindowId` byte-identical (CERT-AC-7 verifies against the export).
- Deploy order: worker code **and the four importer edits** first (reads no longer
  select the fields; nothing left in the repo can write them), then Studio deploy, then
  the dataset run — **last, and final**: with the importers in the phase the strip is
  not provisional on anything. The code tolerates the fields still existing (GROQ
  simply no longer selects them), so the between-deploys window is safe, and the
  re-population gate above enforces the ordering for whoever runs it.

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

The **Figures** column names a class, never a rule. **Best-effort (§1.4)** =
`pickMoved`/`captureFigures` over the effective post-save pick. **Derivation (§1.6)**
= figures from the same validated in-memory selection that writes the product, in the
same statement. Per-writer prose that restated the rule has been wrong three times —
W1-manual, W5, W14, each written before a ruling changed the rule's terms and each
faithfully implemented afterwards (§12) — so the cells now point at the ruling instead
of paraphrasing it; a pointer cannot rot when the ruling sharpens. Line numbers are
as of design time; the scan, not this table, owns completeness.

| # | Site | Save | Figures source |
|---|---|---|---|
| W1 | `worker/routes/ops.ts:1143` (one statement; branches at `:1041` aiManaged, `:1100` composite parent, `:1113` manual) | ops PATCH /lines/:id | aiManaged: derivation (§1.6). Manual: best-effort (§1.4). Composite parent: carries — vacuous, units own the facts |
| W2 | `worker/routes/projects.ts:507` | customer edit of AI-priced line | best-effort (§1.4); the snapshot-nulling stays exactly as is (SNAP-AC-14) |
| W3 | `worker/routes/projects.ts:540` | customer ordinary edit | best-effort (§1.4) |
| W4 | `worker/routes/projects.ts:551` | customer insert | best-effort (§1.4); new row |
| W5 | `worker/routes/projects.ts:637` | customer restore-ai | best-effort (§1.4) — the API never required an edited line, so an unmoved restore carries; found by A4's re-walk after this row's pre-A4 wording said resolve-unconditionally (§12) |
| W6 | `worker/lib/ai/proposal.ts:198` | estimator: no-product line INSERT (empty `product_slug`) | derivation (§1.6): present-and-null literal — evaluated, nothing chosen |
| W7 | `worker/lib/ai/proposal.ts:258` | estimator: unresolved branch (sets `selected_variant_id=NULL`) | derivation (§1.6): present-and-null literal, the variant NULLed in the same statement |
| W8 | `worker/lib/ai/proposal.ts:299` | estimator: resolved line INSERT | derivation (§1.6): from the variant in memory |
| W9 | `worker/lib/ai/proposal.ts:441` | estimator: resolved line UPDATE | derivation (§1.6): from the variant in memory |
| W10 | `worker/lib/composite.ts:295` | split apply: segment INSERTs | unit snapshot first (`splitCandidates.ts:355-358` wrote uw/shgc at choice time — no read); else best-effort (§1.4); new rows |
| W11 | `worker/lib/composite.ts:457` | segment edit (ops PATCH /segments/:id) | best-effort (§1.4) |
| W12 | `worker/lib/composite.ts:524` | append unit | best-effort (§1.4); new row |
| W13 | `worker/lib/parse.ts:350` | schedule re-upload, unlocked update | best-effort (§1.4) |
| W14 | `worker/lib/parse.ts:359` | schedule re-upload, locked COALESCE update | best-effort (§1.4) over the EFFECTIVE post-save pick — each locked field takes the stored value, each unlocked the parsed one; a lock is an input to what the pick becomes, never an exemption (§12 F1: the pre-A4 "follows the product's own lock" wording here caused the glazing desync) |
| W15 | `worker/lib/parse.ts:372` | schedule parse INSERT | best-effort (§1.4); new row |

**Structural guard (SNAP-AC-2):** a source-level test walks `worker/**/*.ts`, extracts
every `INSERT INTO quote_line` / `UPDATE quote_line` SQL template, and fails if a
statement names `product_slug` or `selected_variant_id` without naming
`performance_figures_json`. The excluded non-writers stay excluded by the same
mechanical rule — after the scan strips `'...'` string literals, they name neither
column (`routes/parse.ts:287` names `product_slug` only inside an `edited_fields` JSON
literal, which the stripping removes before the predicate runs) — not by a whitelist.

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
 *  for the request's distinct slugs, projecting the rows `toCandidate` needs
 *  (`_id`, `schemaVersion`, `thermalProfile` rows, legacy `performanceVariants`)
 *  and mapping through it — deliberately NOT a second minimal projection:
 *  thermalProfile-supersedes-legacy, glazing-class canonicalisation and range
 *  rejection live in `toCandidate` and must not exist twice (15 of 34 products
 *  are still legacy-shaped). Both shapes are pinned by a test. NEVER throws; any
 *  failure, timeout (own budget 1500 ms inside sanityExecutor's 4 s cap) or
 *  absent SANITY_PROJECT_ID yields an empty catalogue, which resolves
 *  everything to NULL_FIGURES (SNAP-AC-6). */
export async function fetchFigureCatalogue(env: Env, slugs: string[]): Promise<FigureCatalogue>;

/** What a save must have on the row for the stored figures to still describe it. */
export interface StoredPick {
  productSlug: string | null; variantId: string | null;
  glazing: string | null; figuresJson: string | null;
}

/** §1.4's predicate — ONE definition, two exported uses: `captureFigures`
 *  consults it to store-or-carry, callers consult it to build the fetch's slug
 *  set from moved picks only. A pick naming NO variant does not move the
 *  variant term; only an explicit, different id does (restore). Callers never
 *  re-derive this test. */
export function pickMoved(
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
  stored: StoredPick | null,
): boolean;

/** §1.4 — THE write-time rule, in one place. `stored` null = a new row (always
 *  resolve). Unmoved pick: `stored.figuresJson` verbatim — NULL stays NULL, no
 *  opportunistic backfill. Moved pick: fresh best-effort resolution; failure
 *  stores present-and-null. Pure; never throws. */
export function captureFigures(
  catalogue: FigureCatalogue,
  pick: { productSlug: string; variantId: string | null; options: Record<string, string> },
  stored: StoredPick | null,
): string | null;
```

**Matching rule (deterministic, no guessing):** `variantId` set and found — that
variant's figures. Otherwise filter the product's published variants by the glazing
option named in the pick's options (`glazingOptionSlug`); if **exactly one** variant
remains, its figures; otherwise `NULL_FIGURES`. **§1.5: with no glazing the filter is
the identity, so a product offering exactly one published variant resolves to it — a
singleton answer set is not ambiguity, because every completion of the pick lands on
the same variant. Ambiguity, and its null, begin at two surviving variants.**
`ASSUMED:` **an ambiguous resolution — two or more surviving variants — stores null
rather than a guess** — a fabricated figure a reviewer trusts is worse than a stated
absence; consistent with R6's "never rendered as a number" and the honest-gap rulings.
Vetoable at acceptance, together with §1.5's singleton reading, as one pair.

**Who passes a `variantId`:** only a caller holding one that describes the saved
configuration by construction — the W1 aiManaged branch (in-memory, no resolver) and
W5's restore. The customer path never does: under §1.4 an unmoved pick carries forward
without resolving, and a moved pick (product or glazing changed) makes the retained
`selected_variant_id` stale as a figures key — so fresh customer-path resolutions pass
`variantId: null` and let the glazing drive. SNAP-AC-14 records what the customer
*chose*, not the variant the estimator once named.

Properties the tests pin:

- Never a refusal: no caller can receive an exception (SNAP-AC-4/5/6).
- One fetch per request: W2-W5 share one `fetchFigureCatalogue` call built from the
  request's distinct slugs; W13-W15 likewise per parse request (SNAP-AC-7).
- Client-supplied thermal fields cannot reach it: its inputs are the server-resolved
  productSlug/variantId/options only (X-AC-8/9 are route-level tests, but the interface
  leaves no parameter a raw body could flow into).
- The capture adds no statement: figures bind into the existing guarded statements, so
  every ownership WHERE clause applies unchanged (X-AC-10) — the customer batch guard
  (`project_id` + `status_customer='draft'` + `quote_edit_version` +
  `quote_mutation_token`), the ops guard (`id` + `edit_version` + project
  `status_internal` list), the segment path's parent resolution.
- §1.4 direction: present-and-null is only ever written by a save that moved the pick;
  an unmoved-pick save during an outage leaves the column byte-identical (SNAP-AC-9
  holds across unrelated edits); a pre-capture NULL survives untouched saves.
- The fetch is skipped entirely when nothing moved: slug sets are built from moved
  picks only, and `fetchFigureCatalogue([])` returns the empty catalogue without a
  network call — which also removes the +1.5 s worst case from note/size-only segment
  and ops edits (§4.5).

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
  (`:1037-1039`), defaulted to `line.performance_figures_json` — which is already the
  §1.4 carry-forward, and what the composite-parent branch wants; aiManaged branch sets
  it from `figuresFromVariant(variant)` — a derivation writer (§1.6): price, both
  snapshots, variant and figures re-derive together from the one validated read, or
  the branch refuses (409) before any write, pre-existing;
  manual branch applies §1.4 — only a moved pick (product or `options.glazing` differs
  from `line`) fetches and resolves, via `captureFigures` with `stored` built from
  `line`. Bound into the UPDATE at `:1143-1146`.
- **W2-W4 (`projects.ts` save loop, `:411` onward)**: the `storedRows` SELECT (`:372`)
  gains `performance_figures_json`; the slug set is built from **moved picks only**
  (`fetchFigureCatalogue([])` already skips the network); each item goes through
  `captureFigures` — W2/W3 pass `stored` from the matched row, inserts (W4) pass
  `stored: null`. Fresh customer-path resolutions pass `variantId: null` (§4.3). The
  batch stays one batch; no per-line fetch (SNAP-AC-7).
- **W5 (restore-ai)**: §1.4 like every best-effort writer — **the API never required
  the line to have been edited; only the browser enforces that**, so a restore whose
  proposal describes the configuration the line already carries moves nothing and
  carries the column (this bullet's pre-A4 wording said resolve-and-bind
  unconditionally, and hid exactly that writer — §12). A moved restore resolves
  through the proposal's own `performance_variant_id` — the one customer-path caller
  that passes a variantId, because the restored variant describes the restored
  configuration by construction; failure stores present-and-null, restore unaffected.
- **W6-W9 (`ai/proposal.ts`)**: figures from the already-selected `variant` object /
  present-and-null literals; the INSERT column lists at `:200-207` and `:299-301` and
  the UPDATE SET lists at `:258-261` and `:442-446` each gain the column. No fetch.
- **W10-W12 (`composite.ts`)**: split-apply INSERT (`:293-315`) takes
  `s.configurationSnapshot`'s `uw`/`shgc` when present; `updateSegment` (`:457`) applies §1.4 —
  `loadSegment`'s SELECT and `SegmentRow` gain `performance_figures_json`, and a
  note/size-only edit carries the column with **no** catalogue read, so the sequential
  await lands only on saves that actually move the pick; `appendSegment` (`:524`) is a
  new row and always resolves best-effort.
- **W13-W15 (`lib/parse.ts`)**: the draft-rows SELECT (`:269`) carries `options_json,
  performance_figures_json`; W13 applies §1.4 against `match` (an identical re-uploaded
  row carries the column — the existing "no changes" discipline extended to figures);
  W15 inserts pass `stored: null`. **W14 (corrected after §12 F1): the pick that feeds
  `pickMoved`/`captureFigures` — and the slug set beside the one fetch — is the
  EFFECTIVE post-save pick**: each locked field takes the stored value, each unlocked
  field the parsed one, because a lock decides what the pick *becomes*, never whether
  the capture rule applies. `captureFigures`' return binds straight into the existing
  COALESCE: an unmoved pick returns the stored bytes (same bytes back), a moved pick
  always returns a string, and an unmoved pre-capture NULL falls through to the kept
  column — one expression, no special case (the developer's shape, absorbed; it beats
  this design's earlier bind-NULL suggestion).

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

(As shipped the subject carries more than this sketch — `title` and `backLabel` per the
owner's D10 ruling at Phase 1 sign-off, `units[]` and `basis` per the approved mock — and
is built by a pure module, `src/ops2/projects/drawingSubject.ts`. Rev 6, §11.1.)

- Implementation: a full-screen `IonModal` (no breakpoints, no side animation — this is
  not `SidePanel`; a drawing wants the whole viewport). `Elevation` at the largest size
  the viewport allows. **No `ElevationLegend`, no symbol key, no explanatory notation of
  any kind** (R25, VIEW-AC-10) — authority statements stay (the stand-in-square sentence,
  VIEW-AC-8; "mullion positions are confirmed on technical review").
- **The viewer is a tree node (owner ruling; R29 taxonomy in §4.8), so it is routed**:
  the parent drawing at `/projects/:id/line/:lineId/drawing`, a unit's at
  `/projects/:id/line/:lineId/drawing/u:N` (1-based display order). Opening pushes one
  history entry; the back control, Escape and the system back gesture all perform the
  same pop (`onClose` = the host's router-back closure). `DrawingViewer` itself stays
  **presentation-only** — `subject` + `onClose`, no history import — navigation belongs
  to the host page, exactly the `SidePanel` seam; a future surface that hosts
  enlargeable drawings brings its own URL grammar. Its dismiss control reads as a
  **back** control with an accessible name carrying the line's code, not an X
  (everything that is not a modal has back). VIEW-AC-2 as amended (§2.5) pins the
  mechanics; VIEW-AC-7's focus-return holds because the page never remounts.
- Focus: opener buttons are real buttons already (`Plate.tsx:44-49`); on dismiss, focus
  returns to the opener (IonModal focus trap + explicit return via the trigger ref)
  (VIEW-AC-7).
- **`src/ops2/projects/Plate.tsx:60-106`**: the SidePanel enlargement block is deleted
  and replaced by `DrawingViewer` (VIEW-AC-6). The panel's proportional-arrangement
  sentence and its `ElevationLegend` render die with it and are **not** recreated in the
  viewer (R25/VIEW-AC-10 ban the notation class). **The unit list IS recreated (rev 6)**
  — the mock gate put a units block (composite parent only) and the authority sentence on
  the approved surface (UX design §2.2 and gate 1): a list of what the assembly is made
  of is not notation, and rev 2's grouping of it under the ban was overbroad. This is
  ops2's only `ElevationLegend` render; the export itself survives untouched — **not**
  for the customer site, which never used it (that premise was executed and disproved,
  spec revision 14), but because this phase removes a render, not an API. It now has no
  caller at all; deleting it is a separate decision nobody has taken (VIEW-AC-12).
- **`docs/specs/ops2-record-correction.md:343-347`**: P1-AC-27 ("the drawing can be
  enlarged, with its legend") is **marked superseded in that document**, naming this
  feature and R25 (VIEW-AC-11) — two live specs must not assert opposite things about
  one screen.
- **`src/ops2/projects/LineReview.tsx` (Units, `:80-140`)**: each unit's `xs` elevation
  is wrapped in a button opening the viewer with that unit alone as subject, labelled
  with the unit code and its own size (VIEW-AC-4).
- **`src/ops2/projects/lines.tsx`**: untouched — the row glyph stays inside the row's
  one navigation target (VIEW-AC-9, ASSUMED §13.1).
- **`src/ops2/Ops2App.tsx:216`** (this phase, not 3b): the line Route drops `exact` —
  the §4.8 mechanics — and `src/ops2/projects/LinePage.tsx` gains the suffix grammar
  with its first child (`drawing`, `drawing/u:N`); Phase 3b adds `why` to the same
  grammar. `NESTS_BELOW` is untouched in both phases (§4.8).
- Styles: `src/ops2/styles/line.css` gains the viewer block (tokens from
  `src/ops2/styles/tokens.css`; FrameFlow finish per ADR 0009).

### 4.7 Phase 3b — the read seam

**Refreshed 2026-08-25 against A1–A6, D11–D20 and spec revision 27.** This section and
§4.8/§4.9 predate everything from A1 onward and sat through eleven spec revisions — the
exact shape that produced W1-manual, W5 and W14 (§12.6). The walk was executed against
the code, not re-derived from the spec: `persist.ts:143` (a run persists with
`winner=null` and every candidate `selected=0`), `src/data/recommendation.ts:145`
(withheld products live in the run's own `withheldIncomplete` list, never as candidate
rows), and `lineRoute.ts`/`Ops2App.tsx`/`SidePanel.tsx` for what Phase 2 actually
shipped. Divergences found and amended below: `current.variantId` deleted (D16), the
`unresolved` kind added (WHY-AC-9's second meaning had no kind to map to — a
nothing-selected run would have fallen through a vacuous all-NULL test into
`unrecorded`), attribution moved to the pick (step 7 predated §7.0). Line references
throughout §4.7–§4.9 are as of design time; the tests own exactness.

**Build findings (2026-08-25, developer, each mutation-proved):** nine further
corrections, absorbed below and in §4.8/§4.9/§6 — the inline contract copy had
drifted again (findings 1–4; the block below is now a pointer), a paraphrased
predicate (5 — now `pickMoved`), a hook-forcing prop (6 — now a rendered node), seed
fixtures no suite reads from seed (7), a wrong caller count (8 — now uncounted), and
a back control that could exist without naming its destination (9 — now
`{ back: string }`).

**Shared contract: `src/data/rationale.ts`** (new; imports only types from
`src/data/recommendation.ts`; zero runtime imports — same discipline as the
recommendation contract: facts only, the skin writes every sentence).

**The contract IS `src/data/rationale.ts`** — one home, its comments normative.
This design's inline copy of it drifted twice before 3b was even built (the
3b-refresh divergences, then build findings 1–4), which is §4.2's lesson again: a
copy rots, a pointer cannot. The design owns the union's kinds and what must be
absent; the file owns the fields. The load-bearing shapes, as built and
mutation-proved:

- **Kinds:** `human` (+ per-unit facts on a composite) · `unrecorded` — **with
  `current`** (finding 1): the approved mock (B8) keeps "This one" on this state,
  because the line's captured figures are a fact about the LINE and outlive the
  model that recorded the run · `unresolved` (WHY-AC-9's second meaning) ·
  `recommendation`.
- **`RationaleCurrent` carries no `variantId`** (D16/WHY-AC-4): the forbidden
  caption is impossible, not merely forbidden.
- **`selectionChanged: { product: boolean; glazing: boolean } | null`**
  (finding 2) — `null` = the pick has not moved; both-false = the variant alone
  moved, a person having chosen one. A boolean could not satisfy R12/WHY-AC-23
  (the panel names *frame or glazing*) and could not express both-false.
- **`RationaleCandidate.units`** (finding 4) names a make-up's composition —
  "Split: awning + fixed", "2 units" — neither derivable from the lead unit's
  slug, the only identity `candidate_result` anchors a make-up row to.
- **`RationaleUnit.basis` is `UnitBandBasis`** (finding 3, the dangerous shape):
  `segment_requirement_basis`'s own vocabulary (0036, mirroring
  `thermal/types.ts` BandBasis), deliberately not `RequirementBasis` — the wrong
  type is structurally compatible, so fed to the opening's labels it silently
  renders nothing: WHY-AC-34's origin label vanishes while the code looks
  correct. `unitBasisLabel` in `whyCopy.ts` owns the words. `RationaleUnit` also
  carries the unit's `code` for display.
- **Deliberate absences, enforced by the contract's shape** (D18, D19, R9, R5,
  X-AC-5/7): no price field, no exclusions, no `withheldIncomplete` (withheld
  products were never candidate rows — `recommendation.ts:145`), no schedule
  prose, no certification vocabulary. A skin cannot render a fact it was never
  given.

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
   LIMIT 1` (D19: the most recent by `created_at` — decided; was ASSUMED §13.4). No run
   → `kind:"human"`.
5. Candidates: `SELECT outcome_json FROM candidate_result WHERE selection_run_id=?`.
   All `outcome_json` NULL (pre-0055) → `kind:"unrecorded"` (WHY-AC-10, D19) — over a
   **non-empty** row set only: zero candidate rows is the everything-withheld shape of
   `unresolved`, not "an earlier model", and an empty set must not pass an `every()`
   vacuously. Row count is bounded by the catalogue (~35 products + make-ups);
   read-all-then-map is fine.
6. Map: **no candidate selected** (every row `selected=0`, or zero rows) →
   `kind:"unresolved"` with the line's own record. Otherwise: selected candidate;
   runners-up = non-excluded, `rank != null`, not selected,
   ascending rank, sliced to 4 (D18 — decided; was R8's range, ASSUMED §7.3); `beatenSingle` = best-ranked stored
   `form:"single"` outcome when the winner is a split (the stored-facts equivalent of
   `select.ts parentRepresentative()` — never a live call);
   `requirement`/`tolerance`/`competingTier` from `selection_run.selection_json`
   (falling back to the selected outcome's embedded requirement when selection_json
   predates 0055 but outcomes exist).
7. Attribution (R24, WHY-AC-28/29/30): `selectionChanged` compares the recorded
   recommendation's **pick** against the line's current **pick** with `pickMoved`
   (`worker/lib/figures.ts`) — the predicate lives once (§1.4, finding 5); this
   step's earlier paraphrase ("the variant term only where both sides name one")
   differed from it exactly where the line names a variant the recommendation did
   not, which is a person having chosen one. The result names WHICH terms moved —
   `{ product, glazing } | null`, null = unmoved, both-false = the variant alone
   (R12/WHY-AC-23: the panel says frame or glazing, which a boolean cannot). For a split recommendation,
   `outcome_json.units[]` vs the current segments' pick multiset. **Why the pick and
   not product+variant** (this step's pre-§7.0 wording): under D16 a glazing-only
   customer change keeps the estimator's `selected_variant_id`, so a product+variant
   comparison would read exactly those overridden lines — the ones the reviewer is
   auditing — as platform-made. The glazing term dominates precisely where D16 leaves
   the stored id stale, so the stale id can never decide the comparison. `ASSUMED:`
   pending the WHY-AC-29 wording fix routed in §9 (the criterion still says
   "product+variant"; it predates §7.0 and D16). **Never reads `origin`, never
   `ai_proposal_line_id`** (WHY-AC-26/31: the module imports nothing from
   `worker/lib/estimator/thermal/`, `rules.ts`, `select.ts`, or any requirement
   resolver — pinned by a source-scan test).

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

### 4.8 The navigation model (R29): tree nodes, back, and one URL grammar

Owner, verbatim: *"dismiss == back button on the Why this product screen, it is part of
the tree: projects->projectDetails/list->itemDetails->whyThisProduct->switch(modal aka
Confirm/Cancel). Everything that is not modal - has back an action plus whatever gesture
it lives with as standard."*

Presentation and navigation model are separable, and the ruling is: **a routed screen
whose presentation is the approved surface.** For the detail, R19/R26 keep their
approved look (right-hand slide-out at the desk, full screen on the phone); R29 gives
that same surface a URL, a back action and the standard gesture. A back-styled control
on an unrouted overlay was rejected outright — it promises the tree and does not
deliver it.

**The taxonomy, applied.** The owner's rule reads literally: **only a decision dialog
that asks a question and returns an answer is a modal** (*"switch(modal aka
Confirm/Cancel)"*). Nothing this feature builds qualifies:

| Surface | Kind | Consequence |
|---|---|---|
| Why detail | **tree node** (owner, direct) | own URL, back action, back gesture, deep-linkable |
| Drawing viewer | **tree node** (owner, direct — overturning this design's earlier modal call) | own URL, back action, back gesture, deep-linkable; the accepted cost: an enlargement is a history entry, so leaving a line after one takes two backs |
| Projects filter | unchanged | WHY-AC-7b pins it exactly as it is. Under the literal rule it is arguably not a modal either, but R26/R27's approval explicitly excluded moving it — reclassifying it is a future ticket, not a rider on this feature |

**The viewer's mechanism — a real route segment, not a state-only push (architect
ruling).** The same argument that earned the detail its URL applies unchanged: a back
that does not truly pop is a broken promise. A state-only `history.push` (same address,
viewer flagged in `location.state`) would make back pop honestly, but the address bar
would lie (two entries, one URL), a reload or shared link would silently lose the
viewer, the route table would show nothing for click-driven tests to find, and Ionic's
outlet handling of state-only entries is exactly the kind of edge this console avoids.
So: `/projects/:id/line/:lineId/drawing` for the opening's own drawing,
`/projects/:id/line/:lineId/drawing/u:N` for unit N (1-based, the display order
`unitLabel` already renders — the human's own numbering; `ASSUMED:` segment names and
the ordinal scheme). An out-of-range ordinal normalises to `…/drawing`; the two
children (`why`, `drawing…`) are siblings in a grammar that admits one suffix, so they
cannot stack by construction. **That promise has exactly one home — `parseLineRoute` —
and no consumer may re-derive it** (WHY-AC-44, §13 F1): `drawingSubject.ts` held a
second copy as a deny-list ("view `line` → nothing") and it silently opted `"why"` in
the day `LineView` grew, opening the viewer behind the rationale on both entry paths.
Every consumer of `LineView` derives by **allow-list on the views it serves**; §2.1's
deferred switch panel is the union's next member and is governed by this rule before
it exists.

**The URL: `/projects/:id/line/:lineId/why`.** `ASSUMED:` the segment is `why`. A deep
link to a rationale is real and useful (pasting a line's "why" into a chat is exactly the
audit persona's move).

**Routing mechanics** (`src/ops2/Ops2App.tsx:216`, introduced by **Phase 2** with the
viewer and extended by Phase 3b with `why`): the line Route drops `exact` —
`<Route path="/projects/:id/line/:lineId" render={() => <LinePage />} />` — so the line
path and **both** its children (`drawing…`, `why`) match **one route entry and one
mounted page**. IonRouterOutlet then re-uses the mounted `LinePage` for every child URL
(the exact stack behaviour the file's own NESTS_BELOW comment documents), which is
precisely what a surface-over-its-page needs: no page transition, no second record
fetch, the panel or viewer animates over a stable page. Re-checked with two children:
re-use is per-Route, not per-suffix, so a second child changes nothing — the grammar is
one function deriving one of `base | why | drawing | drawing/uN` from `useLocation()`:

- open = `history.push(linePath + "/why")` (or `+ "/drawing"`, `+ "/drawing/u2"`) —
  one history entry, so **browser back, hardware back and the back control are the same
  act**: a pop, which flips the derived state off and the surface animates away.
- the back control follows the discipline **Phase 2 actually shipped**, which is finer
  than the OpsPage rule this bullet carried before that code existed: warm-vs-cold is
  answered by a **per-entry history mark** (`lineRoute.ts` —
  `VIEWER_FROM_LINE`/`VIEWER_FROM_RECORD`, read by `viewerDoor()`; the file's comment
  records why `history.length`, `document.referrer` and Navigation Timing each answer
  the wrong question). Mark present → a real pop; absent → cold arrival →
  `history.replace(linePath)`. The mark's *value* names the door, because D11 gave the
  viewer a second one (the record's desk canvas) and VIEW-AC-15's back label depends on
  which. **The `why` child adopts the same mechanism with one door** — the panel's
  action on the line page (WHY-AC-7); only presence matters for it, so it carries a
  `why`-door mark beside the viewer's and asks no value question.
- any suffix outside the grammar, a `/why` URL on a line with no detail (**any kind
  but `recommendation`** — the kind enumeration this clause once carried was §13 F1's
  deny-list shape one rot away, and is deliberately gone — or an order record,
  WHY-AC-11), and an out-of-range `/drawing/u:N`, are
  normalised with `history.replace` — a mangled or stale link lands on the line page
  (or the parent drawing), never on a half state. `ASSUMED:` the normalisations.
- `NESTS_BELOW` is **unchanged in both phases**: it is a set of destinations, `projects`
  is already in it, and no destination gains or loses a nested child — the children hang
  off the line route, not off a destination. `scripts/tests/ops2-frame.test.mjs` passes
  untouched; `scripts/tests/ops2-navigation.test.mjs` (which holds the declared set
  against the routes that actually exist) is extended twice: Phase 2 (non-exact line
  route + `drawing` grammar) and Phase 3b (the `why` child).

**`SidePanel` — one coherent change, not three patches.** The
routed viewer does **not** become a caller: it never was one (it is its own
full-viewport surface, §4.6), and routing it changed its host's wiring, not its
component. (The pre-3b text here counted "still two callers" — there are three: the
Projects filter, the record's actions panel, and now the detail. A count, wrong, in
the document that turned §4.2's cells into pointers for exactly this reason — finding
8; the seam never depended on the number, only on the defaults preserving every
existing caller byte-for-byte.) The component owes R26 (phone form: full screen, not a 0.5-breakpoint
sheet), R27 (dismiss control: not the hard-coded "Done"), and now R29 (back semantics
for a routed caller) — while the Projects filter must not move at
all (WHY-AC-7b), and every other existing caller keeps the defaults untouched. The seam: **`SidePanel` stays a pure
presentation adapter; navigation lives in the caller.** It gains two props whose defaults
reproduce today's behaviour byte-for-byte, so `FilterSheet.tsx` is not edited.
Re-verified against the shipped component 2026-08-25 — Phase 2 deliberately left it
untouched, and the three seams the props parameterise are exactly where they were: one
`onClose` funnel via `onDidDismiss`, wide-conditional `[0, 0.5]` breakpoints, the
hard-coded Done control (`SidePanel.tsx:73-108`):

```ts
export function SidePanel(props: {
  open: boolean;
  /** The ONE dismiss path. Backdrop, Escape, the control and the platform's
   *  back gesture all funnel here; the caller decides what closing MEANS
   *  (the filter sets state; the Why detail pops history). */
  onClose: () => void;
  title: string;
  testId: string;
  footer?: ReactNode;
  /** Phone form. "sheet" = today's 0.5-breakpoint bottom sheet (default; the
   *  filter). "screen" = full screen, no breakpoints, no drag handle (R26). */
  phoneForm?: "sheet" | "screen";
  /** Dismiss control. "done" = today's Done button (default; the filter).
   *  `{ back: string }` = a back control whose accessible name carries its
   *  return destination — required AT THE TYPE, so a back control cannot exist
   *  without naming where it returns (Phase 2's own lesson; finding 9. R29,
   *  superseding R27's X for routed callers). */
  dismiss?: "done" | { back: string };
}): JSX.Element;
```

The Why detail passes `phoneForm="screen"` and `dismiss={{ back: … }}` naming the
line it returns to, with `onClose` wired to the router-back closure above. Implementation note for the developer: because `open` is
derived from the URL, an IonModal self-dismiss (backdrop/Escape/hardware back) must call
`onClose` and let the history pop drive `isOpen` — guard against the dismiss/pop double
fire with the open-state check, and keep the `key` remount-on-form-change discipline the
component already documents.

### 4.9 Phase 3b — the client

| File | Role |
|---|---|
| `src/ops2/projects/useLineRationale.ts` | **new** — fetch hook, the `useProjectRecord.ts` pattern (loading / ready / missing / error, stale-response guard, re-enter refresh). The missing/error boundary is **WHY-AC-42's property, not a status list**: refusal = a final answer the reviewer's own navigation produced (404 on a bare line, a post-issue line); **everything else — including any status the criterion does not name — is a failure, panel stays, retry offered**, because wrongly saying "could not be read" costs a click and wrongly saying "not recorded" costs a reviewer who stops looking. Never called when the record shows an order (D2/WHY-AC-11), and never from the record page at all — the canvas passes `why={null}` and WHY-AC-43 (D21) asserts the absence |
| `src/ops2/projects/whyCopy.ts` | **new, pure** — every sentence on the surface, derived from DTO facts: the per-tier "Chosen" sentences (WHY-AC-5), the tolerance sentence reading the run's stamped figure (WHY-AC-6: `8%` from `0.08`, never hardcoded), the basis labels (WHY-AC-2), requirement-absent phrasing (WHY-AC-3), the person-chose sentences (WHY-AC-8/28), not-recorded phrasings (WHY-AC-4/9/27 — including WHY-AC-9's **two present-and-null meanings**, told apart by DTO kind — `unresolved` vs the rest — never by inspecting the figures), verdict words per tier (WHY-AC-17); D20: an overridden line changes its sentence and never its structure. Node-testable; the R2 constraint (no "wrong/incorrect/mistake/error/correction") is asserted over this module's entire string table |
| `src/ops2/projects/WhyPanel.tsx` | **new** — the three-line panel (R6) and the two-line thinner form (WHY-AC-8), rendered from the DTO + `whyCopy`; the panel's action opens the detail only when `kind === "recommendation"` |
| `src/ops2/projects/WhyDetail.tsx` | **new** — `SidePanel` content (R19/WHY-AC-7, opened as the §4.8 tree node): chosen row marked, up to 4 runners-up (WHY-AC-12/13), human-selection comparison block (WHY-AC-22-27), composite split-reason + per-lite bands (WHY-AC-33-36), `unsuppliedSplitNote` (WHY-AC-38). **No action anywhere on it** (R28/WHY-AC-39): its only interactive element is the back control; the `footer` slot goes unused |
| `src/ops2/chrome/SidePanel.tsx` | the §4.8 coherent change: `phoneForm` + `dismiss` props, defaults preserving today's behaviour exactly |
| `src/ops2/projects/FilterSheet.tsx` | **zero edits** — WHY-AC-7b is proven by this file not appearing in the diff |
| `src/ops2/projects/LineReview.tsx` | mount `WhyPanel` between the specification/units block and the Price panel (`:198-214`); **delete the superseded header sentences** (`:38-45` "absent entirely on a composite" — void per R14/WHY-AC-32) and the read-only note's "no Why this product" clause (`:44-47`); accepts the panel as a **rendered node** — a `showWhy: boolean` would force this file to import the hook and the panel, breaking its "ROUTER-FREE ON PURPOSE" contract (finding 6); the caller renders, the review only places |
| `src/ops2/projects/LinePage.tsx` | renders `WhyPanel` and hands it down as the node only when `record.orderNo == null` (D2: order records never fetch or render it); extends the §4.8 URL grammar (already hosting `drawing…` since Phase 2) with the `why` child |
| `src/ops2/projects/lineRoute.ts` | **extended** (Phase 2 built it — pure, router-free): `parseLineRoute` gains the `why` suffix (`view: "why"`, canonical `/why`, same one-suffix sibling rule, §4.8's normalisation for kinds with no detail), and a `why`-door history mark lands beside `VIEWER_FROM_*` (presence answers warm-vs-cold; §4.8). `scripts/tests/ops2-navigation.test.mjs` extends accordingly |
| `src/ops2/Ops2App.tsx` | **no change in this phase** — the line Route went non-exact in Phase 2 (§4.6/§4.8); no route is added (R28 cut the `/edit` stub), so `NESTS_BELOW` and `scripts/tests/ops2-frame.test.mjs` stay untouched |
| `src/ops2/styles/line.css` | panel/detail styles (FrameFlow tokens) |

Panel data flow: the panel reads **only** the rationale response — including "This one"
(`current.figures`, the line's captured column) — so `opsLineDto` and the record
endpoint stay byte-identical (blast radius zero; the record's DTO key-set assertions in
`scripts/tests/api.test.mjs` keep holding without edits). The rationale endpoint is the
single reader of `performance_figures_json` (SNAP-AC-3: one place per fact).

GST/money: the DTO has no price field of any kind; nothing to display-format (R10,
§11). The existing Price panel is untouched.

**Deferred, not deleted — product switching (R28).** Revision 1 of this design carried a
"Change the product" control, a `LineEditStub.tsx` and a `/projects/:id/line/:lineId/edit`
route. R28 cut all three: *"Having a button implies that some product must be preselected,
which we don't have conceptually… ultimately, switching products is not part of the
current run."* The absence is the design (spec §9.5), and the deferral carries an **open
design question, not an unbuilt ticket** — the owner's sketch (*"not having a button
means another panel perhaps"*) points at a separate switching surface with its own
interaction model, live rather than snapshot, with its own query; it is recorded in the
spec's out-of-scope table and must be designed from scratch when he resumes it. Nothing
in this feature reserves a route, a footer slot or a component seat for it.

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
  `uValue`/`shgc`/thermal field in a body is dead weight: no parser reads it (X-AC-8/9
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
| `GET /api/ops/projects/:id/lines/:lineId/rationale` (**new**) | ops identity via `resolveStaff` (refuses manufacturer partners at `worker/lib/staff.ts:157`) — **the decisive control: a manufacturer partner never sees which products competed** (X-AC-3, R20). The explicit `hasAssignedRole` check that follows is a **backstop spelling the same predicate** (`staff.ts:150` — both encode `role !== "manufacturer"`), so `forbidden_role` is unreachable on this route today, and **X-AC-3's asserted `forbidden` body depends on `resolveStaff` firing first**. Named here because "an unreachable line stays unreachable" is a property nobody asserts directly (§13 F4; the recommended collapse — `resolveStaff` delegating to `hasAssignedRole`, one rule one spelling — is a post-freeze refactor for the developer, not this phase's) | Line resolution is the single entry point: `WHERE q.id = :lineId AND q.project_id = :projectId AND q.parent_line_id IS NULL`. Every subsequent read hangs off that row (opening via the `ops.ts:1046-1052` disjunction on `q`, run via `opening_id`, candidates via `selection_run_id`, segments via `parent_line_id = q.id AND project_id = :projectId`). A cross-project `lineId` and a nonexistent one both fall out of the same SELECT as the same `null` → `404 {"error":"not_found"}`, byte-identical (X-AC-4) |
| Existing save routes (W1-W15 hosts) | unchanged callers, unchanged gates | The capture binds into the existing statements; **no new statement addresses a row by client-supplied id**, so every existing ownership WHERE clause (customer draft/mutation-token guard, ops edit_version/status guard) applies to the figures write verbatim (X-AC-10) |
| Record read `GET /api/ops/projects/:id` | unchanged | not widened by this feature (the panel reads its own endpoint) |

### 5.4 Abuse cases

| Attempt | Control | Criterion |
|---|---|---|
| Anonymous / customer-session read of a rationale | one refusal for both, indistinguishable, empty of data | X-AC-1/2 |
| Manufacturer partner reads competitor comparison | `hasAssignedRole` refusal | X-AC-3 |
| Staff probes line existence across projects | one SELECT, one refusal shape | X-AC-4 |
| Server over-serves (excluded candidates, withheld products, exclusion detail, prices) | DTO built additively from an allow-list of fields; trimmed set asserted on the raw body | X-AC-5, X-AC-7 |
| Client writes a thermal figure onto a line | capture inputs are server-resolved only | X-AC-8/9 |
| Save names a foreign line id | existing ownership guards, no new statements | X-AC-10 |
| Method widening / verdict write-back | route table diff: zero new non-GET routes; outcomes PATCH stays unwired; no line-editor route exists (R28) | X-AC-6, WHY-AC-40, R1/R2 |
| Strip run without a verified export | offline gate, exits before any client exists | X-AC-11 / CERT-AC-8 |
| Customer-facing blast radius of Phase 1 | no customer route touched; DTO key-set assertions already pin response shapes | X-AC-12 / CERT-AC-11 |

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
4. **(rev 4)** Red: the widened CERT-AC-3 scan + CERT-AC-12 + the re-population-gate
   refusal, in the same suite; green: the four `scripts/catalogue/**` edits (§4.1
   addendum) and the strip script's second gate clause.
5. Deploy worker + importer edits → deploy Studio → export dataset → dry-run →
   `--apply` → CERT-AC-7 verification against the export. The strip runs last and is
   final.

**Phase 2** (client-only)
1. Red: `scripts/tests/web/ops2-drawing-viewer.spec.ts` (VIEW-AC-1..10 with 2 as
   amended per §2.5, and 12) and the first `scripts/tests/ops2-navigation.test.mjs`
   extension (non-exact line route, `drawing` grammar).
2. The §4.8 routing mechanics: `Ops2App.tsx:216` drops `exact`; `LinePage.tsx` gains
   the suffix grammar (`drawing`, `drawing/u:N`, normalisations).
3. `DrawingViewer.tsx` (presentation-only; back-reading dismiss control); rewire
   `Plate.tsx` (legend render removed with the panel); unit buttons in
   `LineReview.tsx`; styles.
4. Mark P1-AC-27 superseded in `docs/specs/ops2-record-correction.md:343-347`
   (VIEW-AC-11). After this phase `SidePanel`'s only caller is the filter, which must
   not move — so the R26/R27/R29 `SidePanel` change ships inside Phase 3b, with its only
   consumer.

**Phase 3a** (server write path; lands and deploys before any 3b work)
1. `migrations/0058_quote_line_performance_figures.sql`.
2. Red: `scripts/tests/figure-capture.test.mjs` (pure: resolver rules, SNAP-AC-2 source
   scan) and `scripts/tests/why-capture-api.test.mjs` (heavy: SNAP-AC-1/4/5/6/8/9/11/13/14/15,
   X-AC-8/9/10 — Worker+D1 harness per `scripts/tests/helpers.mjs`; the harness's
   absent `SANITY_PROJECT_ID` exercises the null path natively).
3. `worker/lib/figures.ts`; wire W1-W15 (§4.5).
4. Deploy. Every save from this day has figures; nothing yet reads them.

**Phase 3b** (read surface; after the shared UX mock gate for 2+3)
1. Red: `scripts/tests/why-rationale-api.test.mjs` (heavy: DTO states, attribution
   fixtures incl. the WHY-AC-29 fixture — `origin='ai'`, overridden; latest-run rule;
   the 4-cap; X-AC-1..7 raw-body assertions).
2. `src/data/rationale.ts`; `worker/lib/estimator/rationale.ts`; the route.
3. Red: `scripts/tests/ops2-why.test.mjs` (pure: whyCopy sentence table, R2 vocabulary
   ban, tolerance formatting), `scripts/tests/ops2-navigation.test.mjs` extension (the
   non-exact line route + its `why` child), and `scripts/tests/web/ops2-line-why.spec.ts`
   (panel states; the routed detail: open pushes `/why`, browser back closes, deep link
   lands, back control pops; WHY-AC-20 GET-only trace; WHY-AC-11 absence; WHY-AC-39/40/41
   negatives).
4. Client (§4.8-§4.9). The browser suite **mocks both endpoints** (the Phase 2
   viewer-spec pattern) — the server is `why-rationale-api.test.mjs`'s subject, and
   it builds its fixtures inline as the 3a heavy suites do. `scripts/db/seed.sql`
   gains only the `u_staff4` staff allocation (`u_staff5` shipped with Phase 2).
   Finding 7: this step's earlier list seeded fixtures no suite reads from seed.

---

## 7. Test plan (every artifact by path; wiring named)

| Artifact | New/extended | Wired into | Proves |
|---|---|---|---|
| `scripts/tests/certified-removal.test.mjs` | **new**; extended in rev 4 | `test:pure` list + new `test:certified` script in `package.json` | CERT-AC-1, 2, 3 (source scan — **widened per §2.6** to all live source with the refined `dataSource` predicate and the named allowlist; non-vacuity anchored by asserting the walk reached `worker/lib/estimator/catalogue.ts` and `scripts/catalogue/import-wers.mjs`), 5, 6 (schema source scan), 8 (export-gate refusal), 9 (old-JSON fixture parses; no renderer references the field), 12 (derive builder emits no `certified`/`dataSource`; re-population-gate refusal) |
| `scripts/tests/thermal-selection.test.mjs` | extended | existing `test:thermal` | CERT-AC-5 downgrade-cause coherence beside its existing status cases |
| `scripts/tests/figure-capture.test.mjs` | **new** | `test:pure` list + `test:why` script | resolver matching rules (variantId hit, glazing-unique hit, ambiguity→null), `figuresJson` shapes, **SNAP-AC-2 structural scan**, **§1.4 `captureFigures` direction** (unmoved pick returns the stored value verbatim, NULL included; moved pick + empty catalogue → present-and-null; moved pick resolvable → fresh figures), §1.5 singleton-variant resolution |
| `scripts/tests/why-capture-api.test.mjs` | **new** | `test:heavy` list + `test:why` | SNAP-AC-1, 4, 5, 6, 8, 9, 11, 13, 14, 15; X-AC-8, 9, 10 (real attempts, denial recorded); **§1.4 outage triad** (label-only save + empty catalogue leaves the column byte-identical; product-change save + empty catalogue writes present-and-null; a pre-capture NULL survives an untouched save) |
| `scripts/tests/why-rationale-api.test.mjs` | **new** | `test:heavy` list + `test:why` | DTO kinds incl. WHY-AC-10; WHY-AC-12/13 cap; WHY-AC-25 (requirement from run only); WHY-AC-29 fixture (§12.1: origin-reading implementations fail); WHY-AC-30; X-AC-1..7 raw-body |
| `scripts/tests/ops2-why.test.mjs` | **new** | `test:pure` + `test:ops2` | whyCopy: WHY-AC-2/3/5/6/17 sentence facts; WHY-AC-21 vocabulary ban over the string table |
| `scripts/tests/web/ops2-drawing-viewer.spec.ts` | **new** | Playwright dir glob (`test:web`) | VIEW-AC-1..10 (VIEW-AC-2 as amended, §2.5: push-on-open, one pop for control/Escape/system back, no remount, deep link, replace-normalisation); focus return; no-notation class assertion. (Rev 6: VIEW-AC-5/6/12 moved to a source-level test in `ops2-frame.test.mjs` — a browser proves a viewer opens, not that a second was never built; §11.4) |
| `scripts/tests/ops2-navigation.test.mjs` | extended (Phase 2, then 3b) | existing `test:ops2` / `test:pure` | the line route's non-exact shape and its two children (`drawing…` then `why`); `NESTS_BELOW` unchanged. (Rev 6: `ops2-frame.test.mjs`'s existing tests are indeed unedited, but the file gained the relocated VIEW-AC-5/6/12 source scan — §11.4) |
| `scripts/tests/web/ops2-line-why.spec.ts` | **new** | Playwright dir glob | WHY-AC-1/4/7/8/9/11 panel states; the routed detail (R29: open pushes `/why`, browser back closes, deep link lands, back control pops-or-replaces); WHY-AC-7 phone-full-screen + desk slide-out; WHY-AC-7b filter untouched; WHY-AC-20 network trace GET-only; WHY-AC-22/28 both-shown rendering; WHY-AC-39/40/41 negatives (no action controls anywhere; no `/edit` route in the enumerated route table) |
| `scripts/db/seed.sql` | extended | web harness | the `u_staff4` staff allocation only (`u_staff5` shipped with Phase 2); the browser suite mocks both endpoints, and the heavy suites build fixtures inline (finding 7) |
| `scripts/tests/api.test.mjs` | untouched | — | its existing DTO key-set assertions ARE the CERT-AC-11 / record-unchanged guard; if it stays green with zero edits, the blast radius claim holds |

No test artifact was named solely for the R28 stub, so none is removed — the stub's
coverage lived inside `ops2-line-why.spec.ts`, whose scope above now asserts the
absence instead (WHY-AC-40 route-table enumeration).

Spec §12's three traps, answered: (1) the WHY-AC-29 fixture is the overridden
`origin='ai'` line in seed + the heavy suite; (2) SNAP-AC-2 is the source-level scan in
`figure-capture.test.mjs`, not a behavioural test; (3) SNAP-AC-5/15 run on the
customer save route in `why-capture-api.test.mjs`, not through ops.

§12 F1's fix lands its two-direction lock tests beside the existing parse-path figure
tests: product locked + glazing moved → resolves for the *stored* product's new glass;
glazing locked + product unchanged → carries; an identical locked re-upload → carries.

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
| A back-styled control on the unrouted overlay | promises the tree and does not deliver it (R29): browser back would leave the page with the panel still open — worse than the X it replaced |
| The detail as its own routed page component (a second `Route` + page) | IonRouterOutlet would mount a second `LinePage`-shaped instance: a page transition under a slide-out animation, a second record fetch, and the panel no longer floats over its line |
| Forking a `WhyPanelSheet` beside `SidePanel` | the component's own header records where two almost-identical panels lead; two props with preserving defaults keep one panel and an unedited filter |
| A state-only history push for the viewer (no URL change) | back would pop honestly, but the address bar lies, reload/shared links silently lose the viewer, and the route table shows nothing for tests to find — the same broken promise in a different place |
| Keeping the viewer a dismiss-in-place modal | this design's own first call, overturned by the owner: only a Confirm/Cancel decision dialog is a modal; the two-backs cost was named to him and accepted |
| Backfilling figures for pre-Phase-3 lines | D5/R18 explicit; a backfill is a display-time catalogue read wearing a snapshot's clothes |
| Capture unconditionally on every save (this design's own first W1 note) | breaches SNAP-AC-9 — an unrelated edit recomputes a snapshot — and erases good captures during outages; the defect the developer and the Codex review independently named (§1.4) |
| "Never overwrite a good value with null" as the fix | only safe when the pick is unmoved; after a product change a failed resolution would pin the old product's figures on the new configuration — worse than an honest null (§1.4) |
| Conditioning the aiManaged branch (and W9) on a "material change" predicate | a behavioural change to a pricing path — it would remove existing refusals and skip repricing — invented mid-phase to serve a figures criterion; a derivation writer's save is a capture moment by contract (§1.6) |

---

## 9. Decisions needed

**None for the owner.** The three delegated rulings stand (§1: new column; capture
extends to estimator writers; `dataSource` removed with a version bump + ADR 0011), and
the R29 navigation model is ruled in §4.8 (a routed screen presented as the approved
panel — the owner's own words already place the surface in the tree, so the remaining
choices were architectural). Five items route to the **product-manager**: fold R29 into the spec (§2.4 — the
WHY-AC-7a/WHY-AC-39 "X" wording, plus criteria for the URL, back and deep link);
amend VIEW-AC-2 to the routed-viewer assertions specified in §2.5; apply the
Phase 1 criteria changes in §2.6 (CERT-AC-3 scope, new CERT-AC-12, CERT-AC-10
untouched); sharpen SNAP-AC-1 and SNAP-AC-6 per §1.4's spec ripple — **done in spec revision 23,
together with SNAP-AC-16**; and scope SNAP-AC-16 (with SNAP-AC-9's application) for
§1.6's derivation writers — its second sentence admits no exemption as written, yet
W1-aiManaged, W7 and W9 legitimately re-derive at a validated save, and its first
sentence's "failed to resolve" under-counts present-and-null's honest authors
(wording proposed in §1.6). Two more route with the 3b refresh (2026-08-25):
**index today's Q1–Q3 answers as D18–D20** — the design now cites them and the spec's
decision index stops at D17; and **amend WHY-AC-29's comparison term from
"product+variant" to the pick (§7.0)** — the criterion predates §7.0 and D16, and as
written it reads a glazing-only customer override as platform-made on exactly the
lines the reviewer audits (mechanism specified in §4.7 step 7; the design proceeds on
the pick, tagged `ASSUMED:` until the criterion is amended).
`ASSUMED:` tags registered by this design, vetoable at acceptance:

- §4.3/§1.5 — an ambiguous resolution (two or more surviving variants) stores null,
  never a guess; a singleton answer set is not ambiguity and resolves to its one
  variant. One pair, vetoable together.
- §4.3 — the capture's catalogue budget is 1500 ms inside the executor's 4 s cap.
- §2.3 — WHY-AC-38 renders from `review_json.composite` and is silent once that
  flag is resolved.
- §4.7 — the rationale endpoint serves parent lines only; a unit's facts arrive
  inside its parent's DTO. (Re-affirmed 2026-08-25: Phase 2 gave units drawing
  *addresses*, not pages — `drawing/u:N` renders inside the parent's one mounted
  `LinePage`, and `parseLineRoute`'s `unitCount` comes from the parent's own display —
  so no unit has anywhere of its own to fetch from.)
- §4.7 step 7 — attribution compares the pick (§7.0), pending the WHY-AC-29 wording
  amendment routed above.
- §4.8 — the detail's URL segment is `why`; the viewer's is `drawing`, with
  `drawing/u:N` naming a unit by 1-based display order; suffixes outside the grammar,
  `/why` on a line with no detail, and out-of-range unit ordinals are normalised away
  with `history.replace`.

---

## 10. Phase 1 conformance record (architect, 2026-08-24 — final diff vs this design)

Verdict: **CONFORMS, with four reconciled divergences and one MINOR finding.** Every
artifact §4.1 (with addendum) and §7 named for Phase 1 exists on the branch and is
wired: `scripts/tests/certified-removal.test.mjs` (in `test:pure` and the new
`test:certified` script), the extended `thermal-selection.test.mjs`,
`sanity/scripts/strip-certified.mjs` (dry-run default; export gate and re-population
gate both before any client import; `STRIP_TARGETS` asserted against
`sanity/schemaTypes.ts` with a loud refusal when a type matches nothing),
`docs/adr/0011`, the four importer edits exactly as the addendum table specifies
(`wersWindowId`/`certificationRef` surviving), `ladder-v2`, and an untouched
`scripts/tests/api.test.mjs` as the blast-radius evidence. No migration, no D1 change,
no role vocabulary, no statement's column list or WHERE clause altered.

Reconciled divergences — each had a good reason, so this document was corrected rather
than the implementation:

1. **CERT-AC-10 amended (spec rev 13), not "no save path" as §4.1 claimed.**
   `worker/lib/ai/proposal.ts:375` and `worker/lib/estimator/splitCandidates.ts:356`
   build JSON blobs (`performance_json`, the unit configurationSnapshot) from fields
   this phase deletes; leaving them meant writing literal values for a concept the
   owner removed — a removal with a copy kept. The breach is confined to JSON blob
   contents; the fence otherwise holds, and the spec records the amendment visibly.
2. **The orphaned caption chain** — deleting both producers stranded a live reader, so
   the reader went too: `src/ops/ProjectRecord.tsx:772-777` (the "estimated" caption),
   `src/ops/api.ts:381` (`OpsThermalProposed.source`), `worker/routes/ops.ts` (the
   route field), `worker/routes/debug.ts:133-138` (same vocabulary on the debug
   surface). Covered by a new suite this design did not name,
   `scripts/tests/ops-thermal-source-orphan.test.mjs` (wired into `test:pure` and
   `test:certified`), asserting the reader is gone at all four levels. §2.6's
   allowlist entry for `src/ops/api.ts` is struck accordingly.
3. **A review-mandated repair rode the branch** (found in this review, beyond the
   coordinator's list): `src/ops2/projects/LineReview.tsx` + `src/ops2/styles/line.css`
   — the `Panel` component emitted `<dd>` without `<dt>` for keyless rows (a
   definition of nothing, handed to assistive technology), found by Codex review on
   *shipped ops2-record code from the prior feature* and fixed in place, test-first
   (`scripts/tests/ops2-record.test.mjs` +46, `scripts/tests/web/ops2-record.spec.ts`
   +38). By D5's letter a ride-along; by this repo's review-loop rules a mandated
   defect fix on code the phase's suites exercise. Accepted as a declared repair
   rider: it touches no certified vocabulary, no save path, no schema. LineReview's
   superseded header comment (`:38-45`) is deliberately untouched — its deletion
   remains a Phase 3b task (WHY-AC-32).
4. **`worker/lib/estimator/thermal/types.ts:49`** (`GlassCell.certified`) — inside
   CERT-AC-3's scope and the "follow the compiler" class, but absent from §4.1's
   named-line index; recorded here for completeness.

**MINOR finding (routes to the developer, one line):**
`scripts/tests/certified-removal.test.mjs:326` — the section comment cross-references
the export gate as "X-AC-12"; spec rev 13 numbers it **X-AC-11** (spec :1214; X-AC-12
is the blast radius). Comment-only, but a later tester walking abuse cases by number
will be misled.

---

## 11. Phase 2 conformance record (architect, 2026-08-25 — reviewed at `de2bb7c1`)

**What this record was taken against, and what landed after it.** It reviewed
`b4419105`…`de2bb7c1`, 23 files. It first called that "the final diff"; it was not, and
the Codex stop-gate said so. Two commits landed afterwards — `a5b2b3bf` (this section
itself, plus the spec register's §7.4) and `9e16e2ae` (`src/ops2/styles/line.css`
only: the caption's measure, one `--viewer-column` in place of three copies of `720px`,
a byte-identical duplicate rule deleted, and the units list restored to the approved
mock's 420px block with its size right-aligned). **Nothing in either touches a
structure this record checked** — no component, no route, no interface, no test
artifact — so the conformance verdict below stands unamended. A record that names a
range is checkable; one that says "final" is a claim that goes stale the moment the
next commit lands, which is the same defect §12.10 of the spec is about.

**Correction to this record's own process item.** It reported two edits (`Plate.tsx`'s
header comment, `ops2-frame.test.mjs`'s VIEW-AC-12 note) as uncommitted work that must
be committed, and HEAD as still carrying the disproved "the customer site still uses
it" premise. Executed: both were already committed, and both already carry the "no
caller" ground — `Plate.tsx:24` and `ops2-frame.test.mjs:248`. There was no process
item. The claim was about the working tree and nobody ran `git status` before making it.

Verdict: **CONFORMS, with seven reconciled divergences — every one absorbed by this
design — and no implementation findings.** The diff is client-only exactly as
designed: no `migrations/`, no `worker/**`, no `src/data/**` change of any kind, and
no new endpoint — §5's security posture is untouched. The one security-relevant
surface Phase 2 adds, a cold deep link to a drawing URL, resolves its line through the
record fetch the page already makes, so a cross-project line and a nonexistent one
stay one code path saying one sentence — executed for real in the browser suite
("a drawing URL for a line this project does not have refuses exactly as a missing
one does").

**Every structure §4.6/§4.8 named exists at the path named.**
`src/ops2/chrome/DrawingViewer.tsx` sits in `chrome/` beside `SidePanel` and is
presentation-only — `subject` + `onClose`, no router import, the back control leading
and naming the line (`backLabel`), the modal's accessible name carrying the subject.
The line Route at `src/ops2/Ops2App.tsx` dropped `exact` and **no second Route exists
for `/drawing`** — both facts asserted against the route table by the Phase 2
extension of `scripts/tests/ops2-navigation.test.mjs`, exactly the artifact §7 named.
`LinePage.tsx` hosts the grammar: push to open, one guarded pop for the back control,
Escape, backdrop and hardware back alike (the double-fire guard reads the live
pathname), `replace` for cold links and every normalisation. `Plate.tsx`'s SidePanel
enlargement is deleted outright — `SidePanel` and `useState` banished from the file,
asserted at source level — and the legend render died with it while the export
survives at `src/components/quote-project/Elevation.tsx:583` (VIEW-AC-12, premise as
corrected in spec rev 14). `LineReview.tsx`'s unit rows are whole-row openers;
`lines.tsx` is untouched (VIEW-AC-9); P1-AC-27 is marked superseded in
`docs/specs/ops2-record-correction.md:343` naming this feature and R25 (VIEW-AC-11);
`line.css` carries the viewer block on FrameFlow tokens. **`FilterSheet.tsx` and
`SidePanel.tsx` appear nowhere in the diff** — the R26/R27/R29 `SidePanel` change is
correctly still Phase 3b's (§6, Phase 2 step 4), and WHY-AC-7b's proof-by-absence
already holds.

**§7's Phase 2 artifacts, checked on disk rather than in the diff:**
`scripts/tests/web/ops2-drawing-viewer.spec.ts` exists (507 lines; VIEW-AC-1, 1a, 2,
2a–2d, 3, 4, 7, 8, 9, 10 executed in a browser, plus the refusal-parity case above,
signing in as its own `u_staff5`), and the `ops2-navigation.test.mjs` extension holds
the grammar pure-side: legal addresses asserted **untouched** (`normalise: false`),
normalisations each with a named destination, the opener/parser round trip, and
`/why` refused until Phase 3b serves it. `NESTS_BELOW` is unchanged and the frame
suite's pre-existing tests are unedited. Nothing §7 named for Phase 2 is missing.

### 11.1–11.7 Reconciled divergences (each absorbed into this design)

1. **The viewer carries a units block, and `ViewerSubject` grew.** §4.6 (rev 2) said
   the panel's unit list is "not recreated in the viewer"; the approved mock put a
   units block (composite parent only) and the authority sentence on the surface (UX
   design §2.2, gate 1), and the owner's D10 ruling gave the subject `title` (a unit's
   code; the line's own drawing is `Drawing`) and the back control `backLabel`. The
   R25 ban is on the **notation class** — the proportionality sentence stayed dead; a
   list of what the assembly is made of is not notation. §4.6 amended (rev 6).
2. **`src/components/quote-project/Elevation.tsx` gained opt-in `unitDims`** — a file
   this design's Phase 2 index never named. Owner, at the mock gate (UX gate 5):
   *"for splits, showing dimensions of the units, as well as overall dimensions,
   would be nice."* A second leader row ticked at the real mullions, the overall
   moved outward; **opt-in and inert** off-composite and wherever leaders are not
   drawn, so every other caller — the customer site included — renders byte-identical
   drawings, held by `scripts/tests/ops2-record.test.mjs` ("unit leaders are opt-in,
   so the customer site's drawings are untouched").
3. **The grammar and the viewer's copy are pure modules, not `LinePage` internals:**
   `src/ops2/projects/lineRoute.ts` (parse/build/normalise — one suffix, siblings by
   construction) and `src/ops2/projects/drawingSubject.ts` (every sentence on the
   surface, including VIEW-AC-1a's titles and VIEW-AC-8's stand-in caption). The seam
   this design ruled — navigation in the host, viewer presentation-only — is exactly
   preserved; the extraction is a deepening that let node suites hold the grammar
   (`ops2-navigation.test.mjs`) and the captions (`ops2-record.test.mjs`) without a
   browser. Index updated.
4. **VIEW-AC-5/6/12 relocated from the browser spec to a source-level test** — a new
   test in `scripts/tests/ops2-frame.test.mjs` ("ops2 has exactly ONE drawing
   viewer…"): exactly one `DrawingViewer.tsx`, in `chrome/`; `Plate.tsx` owns neither
   panel nor open-state; no ops2 file imports `ElevationLegend` (comments stripped
   first); the export survives with **no consumer count asserted in either
   direction**, per rev 14. §7's placement (a DOM check in the Playwright spec, frame
   suite "needs no edit") was wrong about what the facts are: they are source facts —
   a browser proves a viewer opens, not that a second was never built. §7 rows
   amended (rev 6).
5. **A second `LineReview` host this index missed: the record page's desk canvas.**
   `src/ops2/projects/ProjectRecordPage.tsx` renders the same `LineReview` body at
   desk width, so its plate and unit rows are enlargeable there too — and VIEW-AC-5
   ("every enlargeable drawing in ops2 opens it") made wiring them mandatory. The
   wiring is the only one consistent with §4.8: the canvas **navigates** to the
   line's own drawing address (one push; back returns to the record) rather than
   mounting a second, unrouted viewer whose back control could not truly pop.
6. **VIEW-AC-2a's "no record re-fetch" needed a mechanism this design assumed was
   free.** §4.8 claimed the one-Route mechanics gave "no second record fetch" by
   construction; Ionic in fact fires `ionViewWillEnter` on a same-page URL change, so
   the non-exact route alone re-read the record on every enlargement.
   `src/ops2/projects/useProjectRecord.ts` now arms its re-enter refresh on an actual
   `ionViewDidLeave` — the reviewer-returns-from-the-legacy-console case the refresh
   exists for still refreshes; a page that never left has not re-entered. The
   property this design named was right; it cost one guard, not zero.
7. **Sequencing and riders.** The `u_staff5` seed allocation shipped with Phase 2
   (§6 listed it under Phase 3b step 4, but the suite that signs in as it is Phase
   2's; `u_staff4` stays reserved for `ops2-line-why.spec.ts`, recorded in the seed
   comment — and the new staff row is an estimator, not a third admin, so api-edge's
   last-admin guard keeps its two). Two style riders consistent with §4.6's tokens
   rule: `.ds-type-heading-md` finally defined in `src/ops2/styles/recipes/type.css`
   (both `OpsPage` and the viewer had been asking for a class defined nowhere), and
   the `--paper` leader-halo scope in `src/ops2/styles/record.css` for a drawing on
   the page ground rather than a card.

**Process note — WITHDRAWN, it was false.** This record reported two edits as
uncommitted and at risk of evaporating with the working tree: the
`src/ops2/projects/Plate.tsx` header comment and the `scripts/tests/ops2-frame.test.mjs`
note, both replacing the disproved "the customer site still uses it" premise with
rev 14's "no caller" ground. Both were already committed and already carry the corrected
ground (`Plate.tsx:24`, `ops2-frame.test.mjs:248`); `git status` showed nothing of the
kind. Kept visible rather than deleted, because of what it is: a claim about the state
of the repository, asserted without running the one command that settles it — inside the
very review whose job was to check claims against the repository. Same defect, one more
costume (spec §12.10).

**Register discharge performed with this record:** spec §13's §7.4 (the `CONTEXT.md`
corrections) is **DISCHARGED** — all four verified live in `CONTEXT.md` on 2026-08-25:
Staff works for OpenFrame, not AMJ (Actors → Staff); Manufacturer partner defined
(Actors); Estimator (persona) defined, distinct from the subsystem and not an RBAC
role (Actors); Human review gate defined as a stage (Language). §3's two further
glossary terms (Captured figures, Selection attribution) are also in place ahead of
Phase 3.

---

## 12. Phase 3a conformance record (architect, 2026-08-25 — reviewed at `27d1df53`)

Scope: the universal capture, diff `a77c4108..27d1df53`, against this design as
amended by §1.4/§1.5 (mid-phase) and §1.6 (with this record). Structure only; the
tester and Codex own bugs. **Verdict: CONFORMS**, with one finding (F1) whose fix was
routed to the developer before this record closed, and four divergences reconciled
into the design rather than forced back into line.

### 12.1 Existence — every §7 Phase 3a artifact, checked on disk

- `scripts/tests/figure-capture.test.mjs` — exists; wired into `test:pure` and
  `test:why` (package.json:17/:35). The SNAP-AC-2 scan is a real recursive walk of
  `worker/**` (readdir, not a literal file list), with the spec's two properties
  present: a predicate self-test (non-vacuity), named-file reach anchors, a >40-file
  floor, and `productWriters.length >= INDEXED_PRODUCT_WRITERS` — no count encoded.
- `scripts/tests/why-capture-api.test.mjs` — exists; wired into `test:heavy` (first
  in the list) and `test:why` (package.json:18/:35).
- `migrations/0058_quote_line_performance_figures.sql` — exists; matches §4.4
  verbatim (additive only, child-table comment, no backfill) plus the tri-state
  comment. No other migration appeared.
- `scripts/db/seed.sql` — untouched. Not a divergence: the §7 seed row serves the
  Phase 3b web harness (`u_staff4`/`u_staff5`); 3a's heavy tests build their
  fixtures inline, including A4's restore fixture. Falls due with 3b.
- `scripts/tests/api.test.mjs` — untouched, exactly as §7 requires: its key-set
  assertions are the record-unchanged guard, and it stayed green with zero edits.
- No new endpoint, no new HTTP method (SNAP-AC-12): the routes diff adds no route
  registration.

### 12.2 The predicate lives once — verified

`pickMoved` is defined once in `worker/lib/figures.ts`. Every caller uses it for
exactly one thing — building the fetch's slug set from moved picks (`ops.ts`,
`projects.ts` save loop and restore, `composite.ts:488`, `parse.ts:332`) — and the
storage decision is always `captureFigures`. No call site has grown a second
"did it move?" test: `ops.ts`'s `productSlug !== line.product_slug` comparisons feed
the `edited_fields` locks (pre-existing, different concern) and `parse.ts`'s
`recordChanges` feeds the change report (likewise). `lines.ts`'s new
`itemProductSlug`/`itemOptions` exports are the same discipline applied to pick
*construction*: one expression read both before the batch (to decide moved picks)
and inside `itemFields` (to store), so the pick and the bound row cannot disagree —
the anti-W14 mechanism on the customer path, unnamed by this design, kept.

### 12.3 The post-save-pick walk (the method that found every stale bullet)

Each writer verified by asking what the row's pick is *after* the save and whether
that is what feeds `pickMoved`/`captureFigures` — not by reading §4.2's prose:
W1-manual ✓ (effective body-or-stored values; stored from `line`); W2/W3/W4 ✓ (pick
and `itemFields` share one expression; stored from `storedRows`, which gained
`performance_figures_json`); W5 ✓ after A4's rework (proposal pick vs the line's
current state, `variantId` passed only there); W10 ✓ (snapshot first; new rows
resolve directly — `captureFigures` with `stored: null` degenerates to the same
call); W11 ✓ (patch-or-stored values; `loadSegment` gained the column); W13 ✓
(parsed pick vs `match`, whose SELECT gained `options_json` and the column);
**W14 ✗ = F1**; W15 ✓. W1-aiManaged, W6–W9 are §1.6 derivation writers — verified
that none can write during a failed ask (409 / literals / in-memory variant).

### 12.4 F1 — W14 desynchronized figures from the saved glazing (design-sourced)

Found by the Codex stop-gate; verified at `parse.ts` before routing. The locked
branch bound `options_json` on its own lock but `performance_figures_json` on
**`product_slug`'s** lock, so they came apart both ways: product locked + glazing
unlocked left figures describing the old glass; product unlocked + glazing locked
refreshed figures from the *parsed* options while the row kept its locked ones.
**The source was this design**: §4.2's pre-A4 W14 entry said "figures follow the
product's own lock" — correct when the pick *was* the product, wrong from the moment
§7.0 defined the pick as product+variant+glazing, and implemented faithfully, comment
and all. Corrected with this record (§4.2 W14, §4.5): the lock shapes the effective
post-save pick; it is never an exemption from the rule. Fix routed to the developer
with two-direction tests (§7); the F1 marker clears when that lands.

### 12.5 Reconciled divergences (absorbed into the design, not forced back)

1. **`pickMoved` exported** beside `captureFigures` — §4.3's block named only the
   latter, but the slug-set duty makes it one definition with two exported uses,
   which is §1.4's "lives once" honoured, not breached. §4.3 amended.
2. **W14's binding shape**: the developer binds `captureFigures`' return into the
   existing COALESCE rather than my bind-NULL suggestion — carried bytes write the
   same bytes, moved picks always yield a string, an unmoved pre-capture NULL falls
   through to the kept column. One expression, no special case; better than the
   hand-off. Absorbed (§4.5), and it survives the F1 rewrite unchanged.
3. **`FIGURE_QUERY`'s wider projection through `toCandidate`** — deliberate:
   thermalProfile-supersedes-legacy, glazing-class canonicalisation and range
   rejection live there and must not exist twice; 15 of 34 products are still
   legacy-shaped. §4.3 amended; both shapes pinned by a test.
4. **Latency**: §4.5's original "joins the priceItem call" was built as a sequential
   await — reported, then **removed rather than mitigated** by A4: unmoved saves
   build an empty slug set and `fetchFigureCatalogue([])` returns without a network
   call, so the +1.5 s tail now exists only on saves that actually move a pick.

Parked items closed: the §4.2 exclusion prose now states the literal-stripping
mechanism (`routes/parse.ts:287`); §4.4's child list stands (the seventh
`REFERENCES quote_line` at `0022:90` is the original `recommendation_outcome`,
superseded by the `0047:108` rebuild the comment already cites).

### 12.6 The pattern: per-writer prose is the weak layer

Three §4.2/§4.5 bullets — W1-manual, W5, W14 — were written before A4, survived it
unamended, and each misdirected a faithful implementer afterwards. None was found by
reading the design: not by the architect who wrote A4, not by the orchestrator who
briefed it. Each was found by comparing code against the *criterion* (the post-save
pick). **A ruling that changes a definition invalidates every prose bullet written
with the old one, and nothing marks them** — §7.0's redefinition of "the pick" is
exactly such a ruling. The mechanism adopted (§4.2): the Figures column now names a
class — best-effort (§1.4) or derivation (§1.6) — and site-unique facts only, never
a paraphrase of the rule; a pointer cannot rot when the ruling sharpens. The
evidence stands as the priority order: SNAP-AC-2's scan has never been wrong, the
criteria caught what the prose hid, and the hand-written index has now been wrong
on completeness four times and on behaviour three.

---

## 13. Phase 3b conformance record (architect, 2026-08-26 — reviewed at `e5f51866`, frozen)

Scope: `ce73f41a..e5f51866` against §4.7–§4.9 as amended by the 3b refresh and the
nine build findings, plus revision-32 criteria (WHY-AC-42/43/44, WHY-AC-37's
placement, §9.0). Code and docs read only; no suite run (tester owned the ports).
**Verdict: CONFORMS** — no divergence requiring a developer round; four design
amendments landed with this record (A1–A4 below), all of them the design catching up
to lessons the phase proved, none of them changing built behaviour.

### 13.1 Existence — every §7 Phase 3b artifact, checked on disk

`src/data/rationale.ts` · `worker/lib/estimator/rationale.ts` (327 lines; the route
is 8 lines at `ops.ts:734`) · `useLineRationale.ts` · `whyCopy.ts` · `WhyPanel.tsx` ·
`WhyDetail.tsx` · `SidePanel.tsx` (props as §4.8: `phoneForm`, `dismiss: "done" |
{ back: string }`) · `lineRoute.ts` extended (`why`, `WHY_FROM_LINE`/`whyDoor`) ·
`LineReview.tsx` (rendered-node seam) · `LinePage.tsx` · `line.css` ·
`ops2-why.test.mjs` (test:pure + test:ops2 + test:why — package.json verified) ·
`why-rationale-api.test.mjs` (test:heavy + test:why) · `ops2-line-why.spec.ts` (895
lines, Playwright) · `ops2-navigation.test.mjs` extended · seed carries `u_staff4`
only, with the api-edge admin-count reasoning beside it (finding 7 honoured).
**Proven by absence:** `FilterSheet.tsx`, `Ops2App.tsx` and `api.test.mjs` appear
nowhere in the diff — exactly the three files §4.8/§4.9 required to stay untouched
(WHY-AC-7b; "no change in this phase"; the record-DTO key-set guard).
`figures.ts` changed by one line: `glazingOf` exported for the pick comparison — the
attribution reads the predicate's own glass rule, one place per fact.

### 13.2 New criteria vs the design

WHY-AC-42: the design never enumerated status codes; §4.9's hook row now carries the
property (A3). WHY-AC-43/D21: the canvas passes `why={null}`
(`ProjectRecordPage.tsx:446`) and the absence is criterion-checked; §4.9 points at
it. WHY-AC-44: grammar held, consumer's copy rotted — traced in F1. WHY-AC-37's
placement: `more` is a field on the units line (`whyCopy.ts:260` records the defect);
the design described copy *duties*, never the `WhyPanelCopy` shape, so it did not
teach the sibling placement — and it deliberately still does not describe the shape,
because a described shape is a second copy (F2). §9.0's three states: the contract
file's `RationaleFigures` comment is the one home; §4.7 points at it.

### 13.3 Findings traced (per the frozen build's four defects)

- **F1 (WHY-AC-44, MAJOR, fixed in `35291855`/`7730cfae`):** `drawingSubject.ts`
  guarded `view === "line" → null` — a deny-list copy of a promise whose one true
  home (`parseLineRoute`) was correct throughout. `LineView` grew, the deny-list
  opted `"why"` in, the viewer opened behind the rationale. Now an allow-list, and
  A1/A2 put the one-home rule and the de-enumerated normalisation clause in §4.8.
- **F2 (WHY-AC-37 placement, fixed in `e5f51866`):** `WhyPanelCopy.more` sat beside
  `lines`, handing the component a decision the data owns. Now a field on the units
  line. The design neither taught nor prevented it; disposition per 13.2.
- **F3 (WHY-AC-42, spec rev 31/32):** the refusal/failure boundary generalised from
  an enumeration to a property, and the layout promise rewritten to what the code
  controls (minimum-never-maximum, never shrinks, unbounded growth deliberate).
  Design carries the property as a pointer only (A3).
- **F4 (recorded, not a defect):** `resolveStaff` and `hasAssignedRole` both encode
  `role !== "manufacturer"` (`staff.ts:150`/`:157`), so `ops.ts:737`'s
  `forbidden_role` is dead on this route and X-AC-3's asserted body depends on gate
  order. Pre-existing, repo-wide pattern; §5.3 now names the dependency (A4) and the
  one-spelling collapse is recommended as a post-freeze developer refactor.
  `staff.ts`'s own header already warns that two spellings of one rule is how they
  come to disagree — the warning described its own file.

### 13.4 What the phase's defects say about the design itself

Three of four findings trace to a **document**, not to code that misread one: a copy
contract (§4.7's inline DTO block — pointered before build, and findings 1–4 still
found the copy drifted in the sections built from it), a restated promise (F1's
deny-list was a consumer's copy of the grammar's guarantee), and an enumeration
(F3's status list; A2's kind list was the same shape one rot away, caught here).
Across 3a and 3b that is **five instances of one-rule-in-two-places**, and every one
was implemented faithfully — the copies did not fail, they *succeeded* at being
wrong. The rule this record leaves behind, stated once: **a rule has one normative
home; every other appearance is a pointer; and a consumer of a growing union
derives by allow-list, because a deny-list opts the next member in silently.**
§4.2's class cells, §4.7's contract pointer, §4.8's one-home sentence and A2 are the
four applications of it now standing in this document.

Rider noted: the pre-existing `.lp-panel__lines > div` grid defect (every second
specification/price row landing in the value column) was measured on both panels and
fixed inside this diff (`bf6055d5` test, fix in the CSS) — live before 3b, found by
3b's browser suite, resolved with it.
