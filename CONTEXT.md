# AMJ Trade Direct / OpenFrame — CPQ

Configure-price-quote platform selling made-to-order aluminium windows and doors to Australian trade customers. One context: the customer site, ops console, and Worker API all share this language. Maintained by the architect — update it when a term is added or sharpened, never let code and glossary drift apart silently.

> Note (2026-08-17): this file was created on `design/ops2-planning` from the current
> dev-line glossary plus the ops2 terms (spec §14). If it conflicts with a dev-line copy at
> merge, the union is intended — no term here retracts an existing one.

## Language

### Actors

**Customer**:
A trade business (builder, installer) with an account on the customer site. Buys at trade terms; not a retail consumer.
_Avoid_: client, user (ambiguous), buyer

**Staff**:
An ops-console operator working for AMJ. Staff-ness is its own axis on an account — a staff account is excluded from customer-facing programs (e.g. referrals) regardless of any other property. Once RBAC ships, staff-ness no longer implies uniform capability: what a staff member may do is decided by their Role.
_Avoid_: admin, operator

**Manufacturer partner**:
A person admitted through the same Access policy who is not staff: refused every data endpoint, enforced per endpoint rather than by hiding a destination. Their working area is phase 2; their refusal is now.
_Avoid_: manufacturer user, supplier account

**Payable account**:
An account with complete, ABN-valid payout details. Payability gates what an account can *receive* (e.g. a referral code); it is a different axis from staff-ness, which gates what an account can *participate in*.

### Projects, quotes, and orders

**Project**:
The container for one customer job: its lines, delivery details, documents, and lifecycle. Everything a customer configures or uploads belongs to a project.
_Avoid_: job, enquiry (that's a separate pre-account concept)

**Record**:
The merged plane of a project and its order, addressed as one thing in ops. `Project` remains the container; `Record` is what ops opens. Orders are not a separate ops destination.
_Avoid_: workspace, project page

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

**With manufacturer**:
A state on the work meaning it is waiting on the manufacturer. Orthogonal to Phase — it is not a phase. It is the fourth value of `waitingOn`, and the only one set by a human rather than derived from lifecycle state.
_Avoid_: sent to manufacturer (implies a message; none is sent)

### Ops console

**Attention surface**:
The ops console's landing page: what needs doing or is critically wrong. Explicitly not a metrics dashboard.
_Avoid_: dashboard

**Role**:
A per-user grant deciding what a signed-in person may do — Admin, Reviewer, or Manufacturer partner. Distinct from Cloudflare Access, which decides who they are. Both are required; either revocation locks someone out.
_Avoid_: permission level, access level

**Dormant capability**:
Code that implements a capability which has never been reachable in production — a variable is unset, a guard excludes it, or no user of the required kind exists. Not dead code and not a regression: a decision about the future, made visible in the carry-across register rather than left to scope silence.
_Avoid_: dead code (different fact), unused feature

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
The subsystem that derives line configurations and recommendations from parsed schedules, improving via learning from ops corrections. Everything it produces is a proposal; a human overrides anything.
_Avoid_: quote (an estimator output is not a quote)

**Derivation**:
The chain from an uploaded schedule to a proposed line: origin, extracted text, the requirement derived, the candidates considered, the selection. Words and data, never drawings.
_Avoid_: explanation, trace (too generic)

**Candidate**:
One evaluated product × variant for an opening, carrying per-filter pass/fail, a human-readable reason, score components and a rank. A losing candidate is a first-class thing ops shows, not an internal artefact.

**Original information**:
The value a line field first carried, whatever its origin — extracted from a schedule, submitted by the customer, or proposed by the estimator. One resolved original value per field; the baseline the divergence record compares against. For a line the customer configured themselves, the original information is their submitted values.
_Avoid_: original proposal (narrower — misses extracted and submitted values)

**Divergence record**:
The single fact recorded on a quote at issue naming every line field whose issued value differs from its original information, with both values. One per issue, never per save or per line; an issue with no divergences still writes one, recording none. Internal only — never customer-facing.
_Avoid_: change log, audit (different mechanisms), override note

### Referrals

**Referral code**:
A code issued to a payable, non-staff account once its payout details are stored. Issued once and never changes thereafter.

**Referral discount state**:
The life of a referred customer's discount: `none` → `available` → `used`, or terminally `expired` / `void`.

**Payout details**:
The bank-account and ABN information an account supplies to become payable. Financial PII — the most sensitive data class in the product: minimal storage, never logged, never exposed on a customer-facing surface beyond the owning account.
