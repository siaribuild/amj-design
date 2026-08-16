# AMJ Trade Direct / OpenFrame — CPQ

Configure-price-quote platform selling made-to-order aluminium windows and doors to Australian trade customers. One context: the customer site, ops console, and Worker API all share this language. Maintained by the architect — update it when a term is added or sharpened, never let code and glossary drift apart silently.

## Language

### Actors

**Customer**:
A trade business (builder, installer) with an account on the customer site. Buys at trade terms; not a retail consumer.
_Avoid_: client, user (ambiguous), buyer

**Staff**:
An ops-console operator working for AMJ. Staff-ness is its own axis on an account — a staff account is excluded from customer-facing programs (e.g. referrals) regardless of any other property.
_Avoid_: admin, operator

**Payable account**:
An account with complete, ABN-valid payout details. Payability gates what an account can *receive* (e.g. a referral code); it is a different axis from staff-ness, which gates what an account can *participate in*.

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

**Estimator**:
The subsystem that derives line configurations and recommendations from parsed schedules, improving via learning from ops corrections.
_Avoid_: quote (an estimator output is not a quote)

### Referrals

**Referral code**:
A code issued to a payable, non-staff account once its payout details are stored. Issued once and never changes thereafter.

**Referral discount state**:
The life of a referred customer's discount: `none` → `available` → `used`, or terminally `expired` / `void`.

**Payout details**:
The bank-account and ABN information an account supplies to become payable. Financial PII — the most sensitive data class in the product: minimal storage, never logged, never exposed on a customer-facing surface beyond the owning account.

