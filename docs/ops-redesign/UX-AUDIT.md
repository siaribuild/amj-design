# UX-AUDIT — hostile completeness review of `UX-SPEC.md`

Scope: the spec's own hard constraint — *"No new functionality — everything that is available
now must be present."* Three lists: what the spec **dropped**, what it **degraded**, what it
**invented**. Every item cites the inventory line and the source file. Items verified against
source where the claim is load-bearing.

Verified in source during this audit:
- `src/ops/OpsApp.tsx:196–262` (shell, header, hamburger, omnibox mount), `:380–437` (Dashboard
  `needsUs`), `:438–470` (`SearchBox`)
- `src/ops/api.ts:79–99` (`OpsLine`), `:104–138` (`OpsWorkspace`), `:117` (`files[]`)

---

# 1. DROPPED

Ranked by severity. Every row is a capability, control, field, status, filter, empty state or
role rule that exists today and has **no address** in the spec.

### D1 — HIGH · The `newEnquiries` "Needs us" row has no home at all
**Today:** `src/ops/OpsApp.tsx:386–391` — the fifth `needsUs` row, key `enq`, count
`s.newEnquiries`, copy `{n} enquiry nobody has replied to` / `{n} enquiries nobody has replied
to`, and it navigates to the **Enquiries** tab, not Projects.
*(inv-ops-ui §6 "Needs us" table, row `enq`; inv-api A1 #6, `newEnquiries = enquiry.workflow_status='new'`.)*
**Spec:** B.4.2 #29 maps *"Five 'Needs us' rows with exact singular/plural copy"* onto *"The five
saved views at the head of Work"*. C.3 then lists **nine** Work views — `needs-us, submitted,
pricing, ready, payment, customer, production, open, all` — **none of which is enquiries**.
B.4.2 #28 compounds it: *"The other five are recomputed from the `/projects` rows"* — but
`newEnquiries` counts enquiry rows and cannot be produced from `/projects` at any price.
**Cost:** the only cross-domain signal on the console's landing screen disappears. New leads
become invisible until someone opens Leads.

### D2 — HIGH · The mobile drawer has no trigger
**Today:** `src/ops/OpsApp.tsx:242–246` — the `Menu` button, `md:hidden`, 40×40,
`aria-label="Open menu"`, `aria-expanded`, `aria-controls="ops-nav-drawer"`, lives **inside the
sticky header**. The in-file comment is explicit that it is *"always rendered on mobile,
including for a manufacturer with a single tab: the drawer is the only place a phone user can
see who they are signed in as and sign out."*
*(inv-ops-ui §5.3 "Left: hamburger `Menu` (`md:hidden`…)".)*
**Spec:** B.4.1 #18 — *"Sticky white header carrying only the capitalised tab name — **Deleted**"*.
C.2 says *"Below 768px the rail becomes the existing slide-out drawer, unchanged in every
mechanic"*, and #19 adds the omnibox trigger to the drawer — but **nothing in the spec says what
opens the drawer** once its host header is deleted.
**Cost:** below 768px there is no navigation and no sign-out. This is the exact bug the mobile
drawer was built to fix, reintroduced.

### D3 — MEDIUM · The omnibox is removed for the `manufacturer` role
**Today:** `src/ops/OpsApp.tsx:254` — `<div className="hidden md:block"><SearchBox …/></div>` is
rendered in `OpsShell`'s header **unconditionally, for every role**. `tabsFor` filters the nav
list only. A manufacturer partner on desktop has the omnibox today.
*(inv-ops-ui §4 role table + §5.5; the role filter touches `ALL_TABS`, not the header.)*
**Spec:** B.1 Role behaviour — *"the omnibox is not offered, because `GET /api/ops/search` has no
enquiry type to return."*
**Cost:** small in practice, but it is a control removal filed as a repair. Under a
no-regression contract it must be recorded as a removal with the owner's assent, not assumed.

### D4 — MEDIUM · `Settings ▸ Policy` is an unroutable screen fed by no endpoint
**Today:** `compositePolicy {toleranceMm, defaultJoinerMm, maxSegments}` is returned **only** by
`GET /api/ops/projects/:id`, and the server *throws* if the row is missing rather than
inventing defaults. *(inv-api A2 #10 `OpsWorkspace.compositePolicy`; inv-record §1.)*
**Spec:** B.4.7 #125 and B.4.13 #231 both file it under **"Settings ▸ Policy"**. C.11 folds it
into "Catalogue & policy". But B.1's full URL table lists only `#/settings/staff`,
`#/settings/commercial`, `#/settings/catalogue` — **there is no `#/settings/policy`**, and there
is no endpoint that returns a composite policy outside a project workspace.
**Cost:** an address that does not exist, backed by data that cannot be fetched there.

### D5 — MEDIUM · Five Dashboard counts are silently redefined under their old copy
**Today (inv-api A1 #6, server SQL `ops.ts:250–261`):** `submissions = status_customer='submitted'`;
`inReview = status_customer='under_review'`; `readyToIssue = status_internal ∈ {estimator_assigned,
technical_review_required}` **and** zero unresolved draft lines.
**Spec (C.3 view predicates):** `submitted = stateLabel === "Submitted"` (i.e. `status_internal`,
a different column); `pricing = phase === "Pricing"` (which also swallows
`customer_clarification_required`); `ready = phase === "Pricing" && unresolved === 0` (ditto).
B.4.2 #29 promises the Dashboard copy is *"preserved as each view's label"*.
**Cost:** the same sentences over different populations. "*N quotes being priced*" will not be
the number anyone has been reading. Nothing on screen says the definition moved.

### D6 — MEDIUM · The read-only issued-revision *mode*, and its copy
**Today:** `src/ops/ProjectRecord.tsx:293–298` — selecting a revision renders
`Viewing an issued revision — read-only. [Back to the live draft]`, sets `editable=false`, hides
the action bar and relabels the panel `Issued lines`. *(inv-record §6.)*
**Spec:** #72 deletes the switcher. #74 keeps only a *differently worded* read-only bar bound to
`statusInternal` (`This quote is issued — lines are read-only until it returns to pricing.`).
#75 keeps the panel header string `Issued lines` — which, with the switcher gone, nothing can
reach. The two verbatim strings above and the deliberate read-only inspection mode are gone.
**Cost:** small in function, but two exact strings and one reachable state vanish, and #75
leaves a dead label in the contract.

### D7 — LOW-MEDIUM · The catalogue tree's category level and per-family `optionCount`
**Today:** `GET /pricing/catalogue` → `categories[] → families[]`, category name as an `<h3>`,
each family row reading `{N} product(s) · {N} options · ✓ rate card | ✗ no rate card`.
*(inv-pricing §7b; inv-api A9 #60.)*
**Spec:** #229/#270 replace the tree wholesale with the Products list's per-product coverage
column, and #563 keeps only the source line in Settings ▸ Catalogue. **Category grouping and
`optionCount` are not re-homed anywhere.**
**Cost:** "how many options does this family offer" stops being answerable. (inv-pricing §7c
notes the two option counts on the two screens are computed differently — a real defect — but
the spec deletes one of them rather than reconciling it.)

### D8 — LOW-MEDIUM · Three date formats collapsed to one loses either the year or the time
**Today:** Audit uses the **full** `toLocaleString("en-AU")` — the only place a **year** appears
on an event; Enquiries' `when()` is `{day} {mon}, HH:MM` with **no year**; Customers' `fmtDate`
is `{day} {mon} {year}` with **no time**. *(inv-ops-ui §11, §9.1, §8.1.)*
**Spec:** #214 — *"One date format across the console — **REPAIR**"*, with no format named.
**Cost:** whichever single format is chosen, one surface loses information it has today. The
spec owes a format, not a promise.

### D9 — LOW · Pricing ▸ Policy preamble
**Today, verbatim:** *"Admin only. Applies to every quote and order, in every family."*
*(inv-pricing §6a.)*
**Spec:** #223 lists field, live consequence sentence, version and `Save deposit %` as
"verbatim"; the preamble is not among them, and C.11 Commercial does not carry it.

### D10 — LOW · The `rule` audit chip stops being a filter you can reach
**Today:** five chips, always rendered: `All`, `project`, `order`, `user`, `rule`.
*(inv-ops-ui §11.)*
**Spec:** #211 renders `rule` *"only if a rule event exists in the returned set"*. The set is the
**last 200 events** (`LIMIT 200`). A historical rule event older than 200 events becomes
permanently unfilterable — the chip is the only way to page back to it.

### D11 — LOW · `ItemForm`'s composite-parent gating (`hideProduct`, `hideOptions`)
**Today:** on a composite parent the record plane passes `hideProduct` and `hideOptions`, so the
parent's editor renders **neither** a product select nor the options disclosures — the units own
those. *(inv-record §8b props list.)*
**Spec:** B.4.6 #95–#111 enumerates the editor field by field and never states this gating;
C.4.5 lists a SPEC block for every opening. A build from the spec will render a product picker
on a composite parent, which the server refuses to price.

---

# 2. DEGRADED

Present, but harder, slower or less discoverable than today.

### G1 — Payments, History, Files, Thermal and Teach move from always-visible to summoned
Today all five are blocks in a **340px right rail that renders beside the line table on the same
screen** (inv-record §13, §10, §11, §12). The spec puts them behind the `[ RECORD ]` chip
(C.4.4) plus, for four of them, a tab (C.5): **1 selection + 1 tab click**, and selecting
`[ RECORD ]` **replaces panes B and C** — the line detail you were reading is gone while you
read them. Cost: the single glance at "has the deposit landed" while pricing lines becomes a
mode switch and a return trip.

### G2 — The line table is no longer the default view of a record
Today the six-column table (Code · Product · Size · Qty · Line total · State) **is** the record
(inv-record §6). The spec makes it "Sheet view", reachable only by pressing `T` (C.4.7).
Cost: cross-line comparison — the spec's own stated value ("how you notice that W01 and W03 are
the same window at different prices") — is behind an undiscoverable single-letter key with no
visible control anywhere in the wireframes.

### G3 — The derivation rail is the first thing hidden on a laptop
C.4.10: at 1120–1279px pane C becomes a 40px icon strip and needs a click or `]` to slide over
pane B; at 900–1119 pane A also collapses. A 1280×800 MacBook at default scaling sits at the
boundary. The evidence layer the spec calls the point of the redesign is the first casualty of
the most common real viewport.

### G4 — `[` `]` `\` `T` `i` `e` `u` `n` `r` are the only route to several capabilities
E.2 declares nine single-letter shortcuts. Split/merge (`s`), note-on-line (`n`) and units (`u`)
also have visible controls; **sheet view (`T`), the derivation toggle (`i`), reload (`r`) and the
three collapse keys have no drawn control at all** in C.4.2. `?` documents them, but a control
that exists only in a help sheet is worse discoverability than today's always-visible blocks.

### G5 — Deposit % leaves the surface it is reasoned about on
Today `Pricing → Policy` sits two clicks from the rate card whose preview it drives
(inv-pricing §6a). The spec moves it to `Settings ▸ Commercial` (#223) — same click count,
different destination, and the divergence sentence ("order creation takes 50%, a code constant")
is now a screen away from the worked example whose `depositAmount` line it explains.

### G6 — `Open →` is deleted from the Customers list
#162 makes the whole row the target and deletes the explicit link. On desktop today the row is
**not** clickable and the `Open →` button is (inv-ops-ui §8.1). Unless `of-row` renders a real
`<a>`, keyboard and screen-reader users lose a named target and gain a `<div>` with a click
handler.

### G7 — The spec falsifies its own P4
P4: *"Every number in the console is clickable through to the rows that produced it… Falsified
if… any number is not clickable to its rows."* #33 and C.3's footer keep `Active orders` and
`Customers` *"still inert, still muted, still not a link."* Two numbers on the landing screen
falsify the principle as written. Either P4 gains an exception clause or the two figures gain
destinations.

### G8 — The tone map does not cover the whole enquiry vocabulary
#183 maps `statusClass`'s five buckets 1:1 onto five tones. But today's **neutral** bucket holds
`assigned, in_progress, waiting_on_customer, not_contacted, attempted, not_applicable, unknown,
proposed` (inv-ops-ui §9.2), while D.5's `waiting` tone claims `waiting_on_customer` and `quiet`
claims `not_applicable`. The remaining six values are unassigned in D.5. Not a loss of
distinction yet — but the map is incomplete as written and a builder will guess.

### G9 — `Fix` on the reconcile banner now costs a route change
Today `Fix` is `setSub("options")` — an in-place sub-tab switch on the same screen
(inv-pricing §8b). In the spec, Products and Options are two routes (`#/products`,
`#/products/options`), so `Fix` becomes a navigation with back-button semantics. Minor, but
"fixable here in one number" was the copy's promise.

---

# 3. INVENTED

Things the spec renders that the data does not support. Ranked by how visible the lie is.

### I1 — Hop 5's version line is not reachable by any endpoint
**Spec:** F.2 hop 5 and the C.4.2 wireframe render
`catalogue rev {n} · rules v2-thermal-nonblocking · ranker v3-graded-thermal`, sourced as
*"`selection_run` versions carried on the line's snapshots"*.
**Reality:** `OpsLine` (`src/ops/api.ts:79–99`) carries `id, code, room, productSlug,
productName, width, height, options, qty, lineTotal, status, origin, selectedVariantId, review,
lineKind, compositeAxis, segments` — **no snapshot of any kind**. `selection_run` has no ops
reader (inv-estimator §6 "Persisted and read by nothing"; inv-api A10). E1/E2/E3 do not add it.
The one hop whose job is to say "we cannot show you the candidates" fabricates its own header.

### I2 — Hop 9 (Price) reads a snapshot the DTO does not carry
**Spec:** F.2 hop 9 — *"rate card id + version · pricing policy version · deposit % · discount % ·
applied modifiers"* from `quote_line.pricing_snapshot_json`.
**Reality:** `pricing_snapshot_json` is not in `OpsLine`, not in `OpsWorkspace`, not in E2's
three columns, and no ops endpoint returns it (inv-api A2 #10; inv-estimator §2 hop 12). Five
values, none obtainable.

### I3 — `Missing when chosen: orientation · room area` reads a table with no ops reader
**Spec:** F.3 line 2 — *"Line 2 is `missing_inputs_json`, humanised"*, presented as one of three
"all deterministic" lines available today.
**Reality:** `missing_inputs_json` is a column on **`ai_proposal_line`** (inv-estimator §1.9),
and no ops endpoint reads `ai_proposal_line` at all. E2 adds `recommendationBasis`,
`recommendationConfidence`, `editedFields` — all `quote_line` columns; `missing_inputs` is not
one of them and does not exist on `quote_line`. The spec's most-quoted honesty feature is
unbuildable as specified.

### I4 — `Medium — a second candidate scored within 0.05` invents the derivation it prints
**Spec:** F.3 defines line 1 as `confidence_band` *"rendered as a word with its derivation
printed after it"* — and then, in the same list, concedes the medium case is
*"(everything else)"*.
**Reality:** `confidence_band` is `high` iff `status==='ready' && dominant`, `low` iff
`unavailable`/no-product, `medium` **for every other reason** (inv-estimator §3 and §1.9).
`dominant` (top − second ≥ 0.05) is not stored in any reachable place. Printing a specific
numeric cause for a residual bucket is precisely the fabricated derivation P2 forbids, and it is
the single most-repeated string in the spec.

### I5 — The MACHINE PROPOSED column needs a fourth enabling read the spec never names
**Spec:** F.4 — *"Line has `configuration_snapshot_json` → Machine column from the snapshot"*,
and F.5 asserts *"Three enabling reads, in priority order, none of them a new capability."*
**Reality:** `configuration_snapshot_json` is not in `OpsLine` and is not in E2. The whole
three-column ledger — the spec's G11 graft and one of pane B's eleven blocks — has no data path.

### I6 — `▎edited · you · 6 Aug` — a per-field actor and date that is not recorded
**Spec:** F.4's ledger and F.2 hop 10 (*"who touched it, when, which fields"*).
**Reality:** `quote_line.edited_fields` is a list of **field names only**; inv-estimator §2 hop
13 states it plainly — *"coarse — a field name, not a before/after diff, because
`ai_review_deltas` is unwritten."* There is no per-field actor and no per-field timestamp
anywhere in the schema. Two of hop 10's three claims are invented.

### I7 — Hop 4's "immutable archetype snapshot" has no reader
**Spec:** F.2 hop 4 — *"the **immutable archetype snapshot** when a default envelope applied"*,
from `opening_requirements` and `ai_proposal_line.ranking_context_json.requirements`.
**Reality:** `opening_requirements` is listed under "Persisted and read by nothing"
(inv-estimator §6). `GET /projects/:id/building-model` returns `model_json`, `confidence_json`
and `evidence[]` and nothing from that table (inv-api A4 #26). `GET /projects/:id/thermal`
returns `target{maxUValue,minShgc,maxShgc,basis}` + `targetInherited` — the band and the basis
word, never the archetype object.

### I8 — Hop 1's `doc_type` and `auto`/person classification are not on the wire
**Spec:** F.2 hop 1 — *"filename · `kind` + `doc_type` with whether the classification was `auto`
or a person's correction"*.
**Reality:** `workspace.files[]` is `{id, kind, filename, size, virus_status}`
(`src/ops/api.ts:117`, verified). `GET /api/ops/files` returns `id, kind, filename, size,
virus_status, scan_engine, scanned_at, created_at, project_title, customer_name` (inv-api A7
#38). **Neither returns `doc_type` or `doc_type_source`.** `kind`, size, scan verdict and
`created_at` are real; the classification provenance is not.

### I9 — Archive ▸ Events' payload expansion is labelled **DRAW** and receives nothing
**Spec:** B.4.8 #152 — *"Each event's stored `after` payload is never surfaced → Row expands to
show it in Archive ▸ Events — **DRAW**"*, where the spec defines DRAW as *"renders data the
client already receives and currently discards."*
**Reality:** `GET /api/ops/audit` returns `{entity_type, entity_id, action, occurred_at, actor}`
(inv-api A7 #41). The `after` payload is written by `logEvent` and returned by **nothing**
(inv-record §13). C.10 then hedges with a fallback sentence — which is in fact the *only* state
the disclosure can ever occupy. A disclosure control whose every instance says "not available"
is the dead `Placeholder` component the spec deletes on the same page.

### I10 — The Flow list stamps three timestamps its own rule forbids
**Spec:** G.3 rule — *"Timestamps are shown only where the schema stamps one —
`drawings_signed_off_at`, `qa_confirmed_at`, `payment.invoiced_at`, `payment.paid_at`,
`order.created_at`, revision `issuedAt`/`acceptedAt`. Every other row prints `not recorded`
rather than inferring one from the audit log."*
**Then, in the wireframe directly above it:** `Submitted … 3 Mar 09:41`,
`Parsed … 3 Mar 09:43`, `Pricing started … 3 Mar 11:40` — three rows the schema does not stamp.
Worse: there is **no `submitted` audit event at any `logEvent` call site** (inv-record §13 lists
every one), so the first row's actor (`customer`) and time are both fabricated. §G.4's "what the
audit narrative reads like" block repeats the same invented line.

### I11 — `Last change` is presented as the identity of whoever beat you
**Spec:** E.6 — *"After the reload, `of-freshness` names the actor and time of the change that
beat you, read from `activity[0]` — real attribution from real data."*
**Reality:** a line PATCH writes an audit event **only when review keys are resolved**
(inv-api A3 #16: *"Audit only when review keys resolved"*). Most concurrent edits — the exact
ones that raise `line_changed_reload_required` — write no row at all. `activity[0]` is then
whatever last happened to be auditable (`schedule parsed…`, `started pricing`, a payment), and
the console names an innocent actor as the cause of your conflict. The freshness line itself is
honest; the E.6 attribution claim is not. (It also has no state for a record whose `activity[]`
is empty.)

### I12 — The Products list invents an Example price and a version for card-less products
**Spec:** C.6 wireframe row —
`AMJ150T Lift-Slide Door | amj150 | — | — | — | — | $4,020 | no card — prices at 'default' · 2 options need a price | v1`
**Reality:** `GET /pricing/rate-cards` returns **cards**, and `exampleTotal` / `version` are card
properties (inv-api A9 #48; inv-pricing §3a). A product with no rate card has no card row, no
`exampleTotal` and no version — its existence is known only from
`reconcile.productsWithoutRateCard[]` and `catalogue.families[].productsWithoutCard[]`, both of
which carry **slugs and nothing else** (inv-pricing §8a, §7c). Two fabricated numbers on the
exact row the coverage column exists to explain, and `$4,020` is a price nobody can charge.

### I13 — The Work wireframe draws a state the API cannot produce
**Spec:** C.3 wireframe, row 1: `OF-Q-10482 · Brighton Residence · $12,196 · **contract** ·
Stage **Pricing / Technical review** · Us · 6 · Unpriced 2`, with `OF-1183` as the order number
on the second Ref line.
**Reality:** `valueBasis === "contract"` is emitted only when an order exists (inv-api
`OpsProjectRow.valueBasis`), and once an order exists `stateLabel` **is the order stage label**
and `phase` comes from the stage (inv-api B2/B4; inv-record §3). A row cannot read `contract`
and `Pricing / Technical review` at the same time. The same fixture is drawn in C.4.2 as
`ORDER · —` with basis `estimate`. One fixture, two mutually exclusive states, both shipped in
the spec's two headline wireframes.

### I14 — `LINES READY {n} of {m}` is meaningless once an order exists
**Spec:** C.4.3 makes it a permanent header metric with no post-acceptance rule.
**Reality:** `unresolvedLineCount` counts **draft parent lines** with `status<>'ready' OR
line_total IS NULL` (`ops.ts:430`, inv-record §4), while after acceptance the rows on screen are
**contract lines flattened to `ready`** with the draft usually emptied (inv-record §6). The
metric would divide a stale draft count by a contract count. The spec's headline gate number is
undefined on roughly half the lifecycle it claims to cover.

### I15 — Hop 8 names the wrong source for a value that is real
**Spec:** F.2 hop 8 — per-unit frame system *"Built from `configuration_snapshot_json.frameSystem`
per segment"*.
**Reality:** the snapshot is not in the DTO. Today the record plane derives frame system live
from the client-side Sanity catalogue: `getProductBySlug(seg.productSlug)?.frameSystem`
(inv-record §7). The value is obtainable; the stated provenance is not — which breaks G17's own
rule that *"every component names the endpoint behind it"* and would send a builder hunting a
field that is not there.

### I16 — `Files 3 shared` invents a sharing state
**Spec:** C.5 "What the customer sees" panel — *"which files are shared"*.
**Reality:** nothing distinguishes shared from unshared. `file_asset.source ∈ {customer, staff,
system}` exists (inv-estimator §5.1) and is in **no** ops DTO. The panel relabels the project's
file count as a sharing decision that was never made.

### I17 — `of-error-inline`: *"renders `[ Reload this record ]` for every 409"*
**Spec:** D.5 `of-error-inline`, and #68's list of newly-worded codes.
**Reality:** of the codes enumerated, `invalid_amount`, `invalid_rule` and `empty` are **400**,
`unreadable_history` is **422** (inv-pricing §2; inv-api B6), and
`area_rate_still_includes_glass` is a 409 that **reloading cannot clear** — it requires trimming
every active rate card's area rate, which has no control anywhere (inv-pricing §5d, spec #261).
A reload button attached to it is a control that cannot do what it says.

### I18 — Minor: hop icons "carrying their counts"
C.4.10 (1120–1279px) gives pane C *"a 40px tab strip of hop icons carrying their counts"*.
Seven of the ten hops are single facts, not collections — hop 6 "Chosen" and hop 9 "Price" have
no count to carry. Cosmetic, but it is a number with no denominator.

---

# 4. FIXES

One line per DROPPED and INVENTED item.

## For list 1 (DROPPED)

| # | Fix |
|---|---|
| D1 | Add a tenth strip item on Work — `[New leads {n}]` — that routes to `#/leads/new` and takes its count from `GET /summary.newEnquiries`, with the Dashboard's exact singular/plural copy as its label and empty-state sentence; note in B.4.2 that this one count is a P4 exception because its rows live on another page. |
| D2 | State in C.2 and B.4.1 #18 that below 768px a 44px `Menu` button (`aria-label="Open menu"`, `aria-expanded`, `aria-controls="ops-nav-drawer"`) pins to the top-left of the content area, replacing the deleted header, and is rendered for every role including `manufacturer`. |
| D3 | Reword B.1 to *"the omnibox is removed for `manufacturer` (a deliberate removal, not a repair — it is rendered for all roles today) because `GET /api/ops/search` returns no enquiry type"*, and list it in B.4.17 "Deleted on purpose". |
| D4 | Add `#/settings/policy` to B.1's URL table and change #125/#231 to read: *"`compositePolicy` is only returned inside `GET /projects/:id`; Settings ▸ Policy renders it from the last-loaded record and states `read from the record you last opened`, or an `of-absence` reading `no record loaded` — a standalone endpoint is a §F.5-class gap."* |
| D5 | Add a row under C.3's view table: each view names the predicate it uses **and** the Dashboard count it replaces, with the sentence `this view counts {predicate}; the old dashboard counted {SQL}` in the view's tooltip-free footer, so the redefinition is visible rather than silent. |
| D6 | Restore the two verbatim strings by wiring #74's read-only bar to render `Viewing an issued revision — read-only.` when a revision row in the Revisions ledger is selected for inspection, and delete `Issued lines` from #75's retained header list since nothing can reach it. |
| D7 | Add an `Options offered` column to the Products list (count of chargeable slugs the catalogue offers for that product) and group the list by category with the family slug as a sub-line, so `GET /pricing/catalogue`'s two surviving facts keep an address. |
| D8 | Replace #214's promise with a stated format: `{d} {Mon} {yyyy}, HH:MM` everywhere, and note that this **adds** a year to Enquiries and a time to Customers rather than removing anything. |
| D9 | Add the Policy preamble to #223's verbatim list and to C.11 Commercial: `Applies to every quote and order, in every family.` (dropping "Admin only" only if the spec also states the flat-RBAC reason). |
| D10 | Change #211 to render the `rule` chip whenever the audit endpoint has ever returned a rule event **or** on explicit request, and add the honest line `no rule events in the last 200 — the approvals engine was retired in 0033` rather than hiding the control. |
| D11 | Add to B.4.6 #95: *"On a `composite_parent` the editor is passed `hideProduct` and `hideOptions` — the product and option controls are the units', and the parent renders neither"*, and mirror it in C.4.5's SPEC block. |

## For list 3 (INVENTED)

| # | Fix |
|---|---|
| I1 | Replace hop 5's version header with `of-absence`: `Rule, ranker and catalogue versions are recorded in selection_run and no endpoint reads them.` — and move the version line into §F.5 as part of the E3 endpoint's payload. |
| I2 | Replace hop 9's five values with `of-absence` — `The pricing snapshot for this line is stored and not returned by the workspace endpoint.` — plus the existing link to the product's worked example; add `pricingSnapshot` to E2 if the hop is wanted. |
| I3 | Delete `missing_inputs_json` from §F.3 line 2 and render `Missing inputs are recorded on the machine's proposal, which no ops endpoint reads.`; move it into §F.5's E3 row. |
| I4 | Change §F.3 line 1 to print the band **without** a fabricated cause: `High — one candidate clearly ahead and every hard rule passed` / `Medium — not a clear win; the reason is not recorded` / `Low — no priceable configuration was available` / `Not recorded — this line was created by hand`. |
| I5 | Add a fourth enabling read **E4 — `configurationSnapshot` on the workspace `lines[]` SELECT** to §F.5, and give `of-machine-now-edited` a fifth state, `machine column not available — the configuration snapshot is not returned`, until it lands. |
| I6 | Strip the actor and date from the EDITED column: it renders the literal word `edited` and nothing else, and hop 10 reads *"which fields were edited is recorded; who edited each one, and when, is not."* |
| I7 | Delete the archetype snapshot from hop 4 and print `The default-envelope archetype is recorded in opening_requirements, which no ops endpoint reads.`; keep only the band, basis and `inherited from opening`, all of which the thermal endpoint returns. |
| I8 | Cut `doc_type` and the auto/person distinction from hop 1; render only `filename · kind · size · scan verdict · uploaded {date} · [Download]`, and add `doc_type` to §F.5 as a one-column read on the files payload. |
| I9 | Re-label #152 from **DRAW** to **UNWIRED**, delete the row disclosure from C.10, and state once in the Events footer: `The payload stored with each event is not returned by the audit endpoint.` |
| I10 | Change the G.3 wireframe so `Submitted`, `Parsed` and `Pricing started` read `not recorded` in the `when` column unless a matching `activity[]` sentence exists, and state explicitly that the Flow list may quote an `activity[]` timestamp **only** when the row's audit sentence is one of the enumerated `logEvent` strings — `submitted` is not one of them. |
| I11 | Rewrite E.6's last paragraph: `of-freshness` shows the newest **audited** event and is labelled as such (`Last audited change · …`); the conflict message says `someone else changed this {line\|quote} — the edit that beat you may not have written an audit row`, and never names an actor as the cause. |
| I12 | Give card-less products `—` in Example and `no card` in Ver, and state on the row that `perim`, `area`, `min`, `example` and `version` do not exist for a product with no rate card. |
| I13 | Redraw the C.3 row to a single coherent state — either `estimate` basis with `Pricing / Technical review` and no order number, or `contract` basis with an order stage label — and make the fixture table in H.4 the single source both wireframes are drawn from. |
| I14 | Add a rule to C.4.3: once `order` exists the `LINES READY` metric is replaced by `CONTRACT LINES {n}`, because `unresolvedLineCount` is computed over draft lines that no longer drive anything. |
| I15 | Change hop 8's "Built from" cell to `client catalogue lookup by segment productSlug (getProductBySlug().frameSystem)` and note that the frame system is **not** in the workspace DTO. |
| I16 | Replace `Files {n} shared` with `Files {n} on this project` and add the line `No flag records which files the customer can see.` |
| I17 | Restrict `[ Reload this record ]` to the six concurrency codes (`line_changed_reload_required`, `quote_changed_retry`, `workflow_changed_retry`, `stage_conflict`, `version_conflict`, `not_found_or_final`); give `area_rate_still_includes_glass` its `detail` sentence with **no** control, and 400/422 codes an inline correction instead. |
| I18 | Drop "carrying their counts" from C.4.10; the hop strip shows the hop number and an `of-absence` dot only where a hop has nothing to show. |

---

# 5. VERDICT

**Not safe to build from as written.** The information architecture, the no-regression table, the
component vocabulary and the interaction model are genuinely strong and mostly traceable — but
§F, the evidence-and-selection layer the whole redesign is sold on, rests on six values that no
ops endpoint returns (`pricing_snapshot_json`, `configuration_snapshot_json`, `missing_inputs_json`,
`selection_run` versions, the archetype snapshot, `doc_type`), and the spec's headline honesty
string — `Medium — a second candidate scored within 0.05` — is itself an invented derivation of a
residual bucket. Two wireframes draw the same project in mutually exclusive states, the Flow
list breaks its own timestamp rule three rows below stating it, and below 768px there is no way
to open the navigation drawer. Fix D1–D2, I1–I6 and I10–I13 and the document becomes a build
contract; ship it unrevised and the prototype will render, in the owner's own words, exactly the
kind of number the codebase refuses to invent.
