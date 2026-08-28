# AMJ Trade Direct / OpenFrame — CPQ

Configure-price-quote platform selling made-to-order aluminium windows and doors to Australian trade customers. One context: the customer site, ops console, and Worker API all share this language. Maintained by the architect — update it when a term is added or sharpened, never let code and glossary drift apart silently.

## Language

### Actors

**Customer**:
Anyone with an account on the customer site — private or business. Trade terms are not what makes someone a customer; they are what a *trade-verified* customer pays. The builder/tradie/private split is an attribute of the account, never a different kind of person in the model.
_Avoid_: client, user (ambiguous), buyer

**Staff**:
An ops-console operator working for OpenFrame — OpenFrame's own people (two owners today). Not AMJ: AMJ is the manufacturer. Staff-ness is its own axis on an account — a staff account is excluded from customer-facing programs (e.g. referrals) regardless of any other property.
_Avoid_: admin, operator

**Manufacturer partner**:
A manufacturer's person with a console sign-in. Authenticated but never Staff: excluded from customer data and from every surface that compares products (recommendation rationales, candidate lists) — a manufacturer reading how competing products fared would be a competitive leak. One predicate decides it, everywhere. AMJ is the manufacturer.
_Avoid_: manufacturer staff, partner staff

**Estimator (persona)**:
The person auditing the platform's recommendations and the accuracy of its thermal modelling at the human review gate — served by being shown the right things, never by fencing others out. A persona with needs, deliberately NOT an RBAC role: nothing about authorization may derive from it. Today performed by an owner — a staffing fact, not a model fact. Distinct from the Estimator subsystem below.

**Payable account**:
An account with complete, ABN-valid payout details. Payability gates what an account can *receive* (e.g. a referral code); it is a different axis from staff-ness, which gates what an account can *participate in*. It is never a purchase gate — nothing anywhere may condition a referrer's capabilities on the referrer's own order history.

**Visitor**:
A signed-out person on the customer site. Browsing, configuring, live pricing and the schedule match are Visitor territory; the submission gate is where a Visitor becomes a Customer. A Visitor is served by the deterministic matcher with an indicative price — never by the AI estimator, which serves signed-in Customers; neither engine re-runs or silently replaces the other's work.
_Avoid_: anonymous user, guest

### Registration and the submission gate

**Submission gate**:
The single point where anonymity ends. Browsing, configuring, live pricing, autosave and uploads are all anonymous; *submitting a project for review* requires a signed-in account with complete account details — a name the person typed, an AU-valid phone, a full address, and an OTP-verified email. Identity at submission comes from the session, never the request body.
_Avoid_: registration wall, login gate (browsing is never gated)

**Account address**:
The account holder's own address, stored on `user` (one per account). It is quote and paperwork data.

The project's **delivery destination** is a different fact in a different place (`project.delivery_*`), and **is never derived from the account address** — not on a first quote, not on a fifth, not as a placeholder. A tradie's delivery address is their customer's site, different nearly every time, and a prefill that is wrong nearly every time is worse than a blank field: it is wrong *and* it stops the field being read. Its precedence is the project's stored destination, then the postcode the visitor typed before the gate, then empty. Neither fact ever writes the other.

### Trade verification

**Trade-verified (trade-ness)**:
An axis on an account, parallel to staff-ness and payability: whether the account's business has been verified (ABR-checked or human-approved) and therefore *pays* trade prices. It gates what an account pays, never what it can see. The live facts (ABN, business name, discount) live on the account row; whether the account is verified is derived from its trade applications — never stored as a status column, never baked into a session.
_Avoid_: trade tier, premium account

**Trade application**:
One attempt to become trade-verified: the frozen submitted ABN and business name, the ABR snapshot at lookup time, the queue reasons, the outcome, the deciding actor and provenance (`auto` / `ops` / `grandfathered`). History, not a second home for the ABN — the same frozen-copy pattern a Payout uses. The application whose approval currently makes an account verified is its **standing grant**; a later approval supersedes it, a revocation ends it.
_Avoid_: trade request, upgrade

**Auto-pass**:
The machine path through trade verification: ABN valid **and** active on the live ABR register, submitted business name matches the ABR entity or trading names, email domain plausibly matches the business, and no other account currently verified on that ABN. All four or a human decides; nothing is ever auto-rejected — an ABR outage or a free-mail address costs a wait, never a refusal.

### Projects, quotes, and orders

**Project**:
The container for one customer job: its lines, delivery details, documents, and lifecycle. Everything a customer configures or uploads belongs to a project.
_Avoid_: job, enquiry (that's a separate pre-account concept)

**Phase**:
Where a project sits in its life: Intake → Pricing → Issued → Accepted → Production → Delivered. One linear path; no parallel states.
_Avoid_: status, stage (reserved for order progress within later phases)

**Quote**:
The priced offer for a project's lines. A quote is a quote — there are no revisions, versions, or drafts; at every phase the customer sees one list of lines and one totals panel. Reprice in place, never fork.
_Avoid_: revision, draft quote, estimate (the estimator is a different concept)

**Human review gate**:
The stage between submission and issue where the platform's recommendation is confirmed or overridden by a person. A stage in a quote's life — not a persona, not a role.

**Line**:
One configured opening (window/door) on a project: product, dimensions, options, quantity, price. A quote line becomes an order line after acceptance without changing identity.
_Avoid_: item, row, position

**Price override**:
An ops-set price on a line that replaces its computed price. The override is the fact; the computed price remains derivable.

### Catalogue

**Product**:
A sellable window/door type from the Sanity catalogue (e.g. sliding door, awning window), configured per-line with options.

**Offerable**:
A product complete enough to be shown and sold. Half-authored products are withheld by the offerability gate, which checks two separate completeness bars — configuration completeness and pricing completeness — that must never be merged into one flag.

**Authored-as-none vs not-yet-authored**:
An empty list (`[]`) means a curator decided "none apply"; `NULL` means "not yet authored". These are different facts and must never be collapsed — the offerability gate depends on the distinction. Glazing is optional: a product without glazing options can still be offerable.

**Option**:
A choice on a product (colour, glazing, hardware) drawn from the catalogue's option types.

**Performance variant (legacy)**:
The pre-M6 thermal/glazing data still load-bearing for a substantial share of products. Legacy but live — do not delete or bypass while any product depends on it.

**Compatibility**:
The rules for which products may be combined or split-paired into composite openings.

**Split pairing**:
Dividing one opening into a composite of paired products (e.g. fixed + sliding) that behave as one line.

### Pricing and GST

**GST mode**:
The account's display preference for prices: `inc` (GST-inclusive) or `ex` (GST-exclusive). Every price a customer sees must respect it — no surface is exempt. GST itself is always 10%; the mode changes display, never the tax.
_Avoid_: tax setting, price mode

**Single source of truth**:
Pricing, GST arithmetic, and quote state each have exactly one home module. Extending pricing means extending that home, never duplicating a formula elsewhere.

### Delivery

**Delivery zone**:
A postcode-mapped pricing region with min charge, rate per m², and max charge. A zone with NULL rates is *unpriced* — configured but not yet given numbers, which is a distinct state from missing.

**Zone basis**:
How a project's zone was resolved: `postcode_zone` (matched), `fallback_zone` (no match, default zone), or `unpriced_table` (resolved but the zone has no rates).

**Opening area**:
The m² measure summed across a project's lines that delivery pricing is computed from.

### Estimator and schedules

**Schedule**:
A customer-uploaded document (plans, window schedule) listing openings to be quoted.

**Schedule parse**:
Turning an uploaded schedule into proposed lines. Parsed lines carry their origin and stay reviewable — a parse proposes, a person confirms.

**Drawing reading**:
The per-opening answer read from a plan set's elevations by a vision model: how the opening *divides* — operations, their order, the division axis, and the ratio each unit takes. Three states, never collapsed (plan-parse output spec §4): a value, *not stated* (readable drawings that simply do not say), *not read* (we could not tell). A reading claims operable-or-not, never a family — the schedule names the family — and a stated width always beats a measured ratio. Every reading carries its crop as evidence. The customer sees successes only; ops sees gaps and disagreements, because only ops can act on them.
_Avoid_: drawing parse result (a reading is per opening, not per document), detection

**Crop evidence**:
The exact image the model was shown for a drawing reading, stored per stage run so a reviewer checks the reading against the pixels without reopening the PDF. A fragment of a customer's drawings — customer data: staff-only (manufacturer partners excluded), audit-logged on access, never on a customer-facing surface.

**Estimator (the subsystem)**:
Distinct from the Estimator persona above — one word, two senses, both live. The subsystem that derives line configurations and recommendations from parsed schedules. It proposes, never decides: staff review every quote before issue and may change anything. What it learns is captured at quote issue and is currently dark — recorded and shown to staff, moving no recommendation.
_Avoid_: quote (an estimator output is not a quote)

**Candidate**:
One way the estimator could answer an opening: a product-and-glass configuration, or a split of several units acting as one. Every candidate a run considered is kept with its verdict — winners, losers and the excluded — because staff review must be able to answer "why not the cheaper one?" long after the fact.
_Avoid_: option, suggestion

**Selection ladder**:
How the estimator chooses among candidates: hard constraints eliminate; tiers order what survives (meets → within tolerance → misses → thermal unknown → does not fit); the cheapest candidate in the best non-empty tier wins. There are no weights and no blended score. A lower tier is reached only when every tier above it is empty, so the competing set is never empty while any candidate survives.
_Avoid_: ranker, scoring, weights

**Tier**:
A candidate's verdict class on the ladder. An excluded candidate is recorded with the constraint it failed and is never machine-selected; every other tier stays selectable, priceable and saveable by a human.

**Requirement tolerance**:
The single tuned constant in selection: when no candidate meets a thermal requirement, candidates within 5% (of the requirement value) beyond the best achieved deviation still compete on price. Stamped on every run so a past selection is reproducible.

**Requirement basis**:
Where an opening's thermal requirement came from: an energy report, this project's documents (`plan_derived`), the default band alone (`default_envelope`), or a human override. **`plan_derived` means "derived from this project's documents"** — any of them: an energy report can supply orientation for an opening it states no band for, and the computed band that uses it is plan-derived. A plan-derived requirement always records the inputs that made it so; a default-envelope requirement records that nothing did. A computed requirement binds selection exactly as a reported one does; only the basis differs, and staff see the basis.

**Thermal input contract**:
The declared set of facts the thermal calculation may consult. Every document-derived input arrives as a value with its source or not at all — an unsourced value cannot be represented, so provenance cannot be forgotten. Document extraction produces these inputs; the calculation only consumes them.

**Rule contribution**:
One named, versioned piece of the computed band, firing only when its input exists — the band is composed from contributions, never from a formula that imputes what it was not given. A rule whose input the platform cannot yet supply is a declared attachment point, not code.

**Default band (the owner's dial)**:
The Uw cap asserted when no document evidence constrains an opening. A versioned record with provenance, never a bare constant; setting it is the owner's business decision, and every requirement it produces snapshots the record's version. Changing it affects future runs only — a past estimate is never re-based.

**Band provenance**:
What a thermal value rests on: the method, its citation, when, by whom, and whether anything citable stands behind it. `unsourced_legacy` says honestly that a value predates provenance and awaits a sourced supersession — it is a label, never a hidden default.

**Calibration**:
The staff-read-only measurement that puts three facts beside the dial: what parsed reports have demanded, what the default asserts, and what the published catalogue can deliver at each candidate cap — with the cost of any change stated before it is made. Calibration informs the human who turns the dial; it never turns it, and it never recommends a number.

**Evidence floor**:
The minimum breadth below which calibration's report-demand axis is labelled inadequate: five distinct projects. Below it the report says "thin evidence", never a number dressed as advice.

**Candidate outcome**:
The structured facts the estimator emits per candidate — tier, rank, per-axis deviation, price delta against the pick, exclusion constraints. Facts only, never sentences: each surface composes its own wording. This is the contract the ops derivation surface reads.

**Captured figures**:
A line's own record of its product's Uw and SHGC, written at the moment of every save that sets or changes the product or variant — a snapshot, never a lookup, on every save path alike (ops, customer, estimator). On best-effort save paths, figures move when and only when the pick — product, variant, glazing — moves: an untouched pick carries the record forward verbatim. A validated re-derivation (the estimator's own writers, the ops edit of an AI-managed line) is a capture moment in itself: figures re-derive with price and snapshots from one successful selection, never from a failed ask. Absence is recorded as absence: a captured unknown is a different fact from "saved before capture existed", and neither is ever filled by a display-time catalogue read. Distinct from the candidate outcome, which records what the recommendation was judged on.
_Avoid_: live figures, current performance (implies recomputation)

**Selection attribution**:
Whether a line's current selection reads as platform-made or person-chosen. Derived on every read by comparing the recorded recommendation's product+variant against the line's current product+variant — never stored, and never read from routing provenance (`origin`), which answers a different question. An override moves the selection side only; the requirement it was judged against never moves with it.
_Avoid_: AI-made flag, override flag

**Learned layer (dark)**:
The estimator's memory of what humans actually issued, consulted per candidate and applied to nothing: it records what it would have preferred and shows that to staff, and moves no recommendation until it is deliberately switched on.

**Retrieval key vs recorded context**:
An outcome records its full context; the learned layer retrieves by a deliberately coarse, versioned key (operation, orientation, width band, whether thermal was required) so evidence accumulates in buckets dense enough to mean something. Redefining the key is a recompute over the stored context, never lost history.

**Corpus provenance**:
Whether a learning outcome came from the platform's own review flow (`in_platform`) or was backfilled from pre-platform history (`backfilled`). A reviewer told "3 of 4 similar openings went this way" can see which of the four were real in-platform reviews.

### Ops console

**Elevation**:
The opening drawn to true proportion — panel arrangement, mullions, opening symbols — generated from a line's product family and dimensions by the one shared generator (`src/components/quote-project/Elevation.tsx`, ADR 0010). Every surface that shows an opening reuses it; a composite is drawn from its units along the composite axis. A category glyph or family pictogram is never a substitute, and an unsized opening draws a square stand-in with no dimension leaders.
_Avoid_: icon, thumbnail, pictogram

**Line page**:
The ops2 surface a record's line opens onto: the elevation as hero, the specification (or a composite's units — never both), the price with its state, and the customer's note read-only. Read-only today; **Edit** attaches here when built. **"Why this product?"** is live: every rationale kind carries a door to the detail at `…/why`, which states what was recorded and names what was not — the record's desk canvas carries the same panel. Its line is always resolved from its project's own record — never fetched by bare line id.

**Attention filter**:
The record's pill — drawn only when at least one line needs attention, never as a permanent status line (owner: "no pill when the filter is cleared"). One predicate, `needsAttention` (`src/ops2/projects/record.ts`): `needsReview` or no rate — the same test that paints a row's leading edge and prints its badge, so the pill's count, the filter's set and the list's marks cannot disagree. Pressing it toggles the line list down to exactly those rows. It is a scanning aid; whether the quote can issue remains the server's answer alone (`worker/lib/issue.ts`), whose refusal renders separately and never at the same time as the pill.
_Avoid_: warning banner, error list, blocker queue, attention band

**List row**:
The one pressable row and its list container (`src/ops2/chrome/RowList.tsx` — `ops2-row` / `ops2-rows`), shared by the queue's phone cards, the record's line list and the line page's unit rows. The component is the same; the content within differs per surface, and so does what the leading edge means — waiting-on for the queue, needs-review for the record, nothing for units. Structural rule (ADR 0014): the leading edge, the selection tint and the hover wash all paint on the row's single button, so no state can erase another. The queue's desk `<table>` is not one of these.
_Avoid_: card list, IonItem

### Referrals

**Referral**:
The *relationship*: one referred account, one referrer, recorded once and permanently (one live referral per referred account). It is created only by an act of the referred person — following a `/r/<CODE>` link in their own browser, or typing a code into their own signed-in account. No API accepts a referred party's name, email or phone from a referrer, ever.
_Avoid_: invite, lead, introduction record

**Earning**:
The *money* a referral owes: one row per referred first order. A separate record from the relationship, because voiding a relationship and voiding a payment are different acts with different reasons. `pending` → `confirmed` → `paid`, or terminally `void`.
_Avoid_: commission record, credit, balance (there is no stored balance — see *Referral discount state*)

**Payout**:
One *transfer* to one referrer, covering all their confirmed earnings at that moment. It carries a frozen copy of the ABN and bank account the money actually went to — the accountant's record of what was paid, which must never follow the referrer's later edits. A reversed (`failed`) payout stays in history and returns its earnings to the queue.
_Avoid_: payment (reserved for a customer paying AMJ)

**Promise snapshot**:
The program's terms (rate, cap, minimum order, discount percentage, window, expiry) copied onto the referral row when it is recorded. Every function that later computes money or a discount for that referral reads the snapshot and is never handed the live config: the config is the source of truth for *new* referrals; the snapshot is the source of truth for a promise already made to a real person.

**Referral discount state**:
The life of a referred customer's discount: `none` → `available` → `used`, or terminally `expired` / `void`. Derived on every read from three records that already exist (the referral row, its expiry, whether the account has an order) — never a stored status column, and never a decrementing credit or stored balance.

**Referral code**:
A code issued to a payable, non-staff account once its payout details are stored — withheld until then, never issued inactive. Issued once and never changes thereafter: it survives the program being switched off, and it comes back unchanged if its owner leaves and rejoins.

**Dormant code**:
An issued code whose owner is no longer payable (they cleared their payout details). It records nothing, and every customer-facing refusal treats it exactly like an unknown code — a third party must not learn another account's banking status from the shape of an error.

**Payout details**:
The bank-account and ABN information an account supplies to become payable. Financial PII — the most sensitive data class in the product: minimal storage, never logged, never exposed on a customer-facing surface beyond the owning account. Read unmasked by exactly one function, which records the read as it happens; every other reader sees a masked shape.

**Joining / leaving the program**:
Membership *is* having complete payout details — there is no separate membership record. Storing them joins; clearing them leaves (refused only while confirmed, unpaid money is waiting on those details). Leaving never destroys the code, and never withdraws a discount already promised to the referred side.

**Payability instant (`confirmed_at`)**:
The moment an earning becomes payable: the referred order paid in full, with a payable referrer. It is what the advertised payment timeframe is measured from, and what an unclaimed-money clock would run from — so money that is not yet payable is held as `pending` rather than recorded as confirmed-and-unpaid.

**Review flag**:
A fact two accounts in a referral share (ABN, phone, business name), shown to staff before they price a referred job. Flags are context for a human, never gates: nothing is refused on one.
