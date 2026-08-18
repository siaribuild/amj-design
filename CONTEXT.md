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
An account with complete, ABN-valid payout details. Payability gates what an account can *receive* (e.g. a referral code); it is a different axis from staff-ness, which gates what an account can *participate in*. It is never a purchase gate — nothing anywhere may condition a referrer's capabilities on the referrer's own order history.

### Registration and the submission gate

**Submission gate**:
The single point where anonymity ends. Browsing, configuring, live pricing, autosave and uploads are all anonymous; *submitting a project for review* requires a signed-in account with complete account details — a name the person typed, an AU-valid phone, a full address, and an OTP-verified email. Identity at submission comes from the session, never the request body.
_Avoid_: registration wall, login gate (browsing is never gated)

**Account address**:
The account holder's own address, stored on `user` (one per account). It is quote and paperwork data.

The project's **delivery destination** is a different fact in a different place (`project.delivery_*`), and **is never derived from the account address** — not on a first quote, not on a fifth, not as a placeholder. A tradie's delivery address is their customer's site, different nearly every time, and a prefill that is wrong nearly every time is worse than a blank field: it is wrong *and* it stops the field being read. Its precedence is the project's stored destination, then the postcode the visitor typed before the gate, then empty. Neither fact ever writes the other.

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
